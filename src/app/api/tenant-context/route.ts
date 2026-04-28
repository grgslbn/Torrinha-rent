import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const tenant_id = req.nextUrl.searchParams.get("tenant_id");
  if (!tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("torrinha_tenant_context")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tenant_id, type, title, content } = body;

  if (!tenant_id || !type || !title || !content) {
    return NextResponse.json({ error: "tenant_id, type, title, content required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("torrinha_tenant_context")
    .insert({ tenant_id, type, title, content, added_by: "owner" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, type, title, content } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (type !== undefined) updates.type = type;
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("torrinha_tenant_context")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("torrinha_tenant_context")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
