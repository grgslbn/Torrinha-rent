import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = request.nextUrl.searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("torrinha_email_log")
    .select("tenant_id")
    .eq("template", "reminder")
    .in("status", ["sent", "approved"])
    .filter("metadata->>'month'", "eq", month);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.tenant_id) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
  }

  return NextResponse.json(counts);
}
