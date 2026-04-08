import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenant_id, mark_remotes_returned } = await request.json();
  if (!tenant_id)
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });

  // Mark outstanding remotes as returned if requested
  if (mark_remotes_returned) {
    const today = new Date().toISOString().split("T")[0];
    await supabase
      .from("torrinha_remotes")
      .update({ returned_date: today })
      .eq("tenant_id", tenant_id)
      .is("returned_date", null);
  }

  // Deactivate tenant and free the spot
  const { error: tenantError } = await supabase
    .from("torrinha_tenants")
    .update({ active: false, spot_id: null })
    .eq("id", tenant_id);

  if (tenantError)
    return NextResponse.json({ error: tenantError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
