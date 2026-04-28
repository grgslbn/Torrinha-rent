import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenant_id, mark_remotes_returned } = await request.json();
  if (!tenant_id) return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];

  if (mark_remotes_returned) {
    await supabase
      .from("torrinha_remotes")
      .update({ returned_date: today })
      .eq("tenant_id", tenant_id)
      .is("returned_date", null);
  }

  // Close all open assignments for this tenant
  const { data: openAssignments } = await supabase
    .from("torrinha_spot_assignments")
    .select("id, spot_id")
    .eq("tenant_id", tenant_id)
    .is("end_date", null);

  if (openAssignments && openAssignments.length > 0) {
    await supabase
      .from("torrinha_spot_assignments")
      .update({ end_date: today })
      .eq("tenant_id", tenant_id)
      .is("end_date", null);

    // Free spots in the cache (only if no other active assignment on that spot)
    for (const a of openAssignments) {
      const { data: otherActive } = await supabase
        .from("torrinha_spot_assignments")
        .select("id, tenant_id")
        .eq("spot_id", a.spot_id)
        .neq("tenant_id", tenant_id)
        .lte("start_date", today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .limit(1)
        .maybeSingle();

      await supabase
        .from("torrinha_spots")
        .update({ tenant_id: otherActive?.tenant_id ?? null })
        .eq("id", a.spot_id);
    }
  } else {
    // Fallback: clear spots directly (handles legacy data with no assignment rows)
    await supabase
      .from("torrinha_spots")
      .update({ tenant_id: null })
      .eq("tenant_id", tenant_id);
  }

  // Mark tenant inactive
  const { error: tenantError } = await supabase
    .from("torrinha_tenants")
    .update({ active: false, status: "inactive" })
    .eq("id", tenant_id);

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
