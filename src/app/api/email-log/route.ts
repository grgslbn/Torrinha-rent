import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const tenant_id = p.get("tenant_id");
  const direction = p.get("direction");
  const template = p.get("template");
  const status = p.get("status");
  const from = p.get("from");
  const to = p.get("to");
  const limit = Math.min(parseInt(p.get("limit") ?? "50", 10), 200);
  const offset = parseInt(p.get("offset") ?? "0", 10);

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("torrinha_email_log")
    .select(
      "id, tenant_id, direction, template, to_email, from_email, subject, body, sent_at, status, approval_token, metadata, torrinha_tenants(name)",
      { count: "exact" }
    )
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tenant_id) query = query.eq("tenant_id", tenant_id);
  if (direction) query = query.eq("direction", direction);
  if (template) query = query.eq("template", template);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("sent_at", from);
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("sent_at", toDate.toISOString().split("T")[0]);
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
