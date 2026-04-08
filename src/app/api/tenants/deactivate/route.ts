import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenant_id } = await request.json();
  if (!tenant_id)
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });

  // Deactivate tenant and free the spot
  const { error: tenantError } = await supabase
    .from("torrinha_tenants")
    .update({ active: false, spot_id: null })
    .eq("id", tenant_id);

  if (tenantError)
    return NextResponse.json({ error: tenantError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
