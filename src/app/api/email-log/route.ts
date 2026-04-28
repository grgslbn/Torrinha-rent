import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const tenant_id = req.nextUrl.searchParams.get("tenant_id");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  if (!tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("torrinha_email_log")
    .select("id, direction, template, to_email, from_email, subject, body, sent_at, metadata")
    .eq("tenant_id", tenant_id)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
