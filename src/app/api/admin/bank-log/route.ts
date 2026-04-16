import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");

  let query = supabase
    .from("torrinha_transaction_log")
    .select("*, torrinha_tenants:matched_tenant_id(id, name)")
    .order("received_at", { ascending: false });

  if (from) query = query.gte("received_at", from);
  if (to) query = query.lte("received_at", to);
  if (status && status !== "all") query = query.eq("match_status", status);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
