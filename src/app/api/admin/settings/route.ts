import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/settings — returns all settings as flat object
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("torrinha_settings")
    .select("key, value");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flat = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return NextResponse.json(flat);
}

// PATCH /api/admin/settings — upsert one or more settings
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a key-value object" }, { status: 400 });
  }

  const rows = Object.entries(body).map(([key, value]) => ({ key, value }));
  if (rows.length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabase
    .from("torrinha_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
