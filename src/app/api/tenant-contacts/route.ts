import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/tenant-contacts?tenant_id=...
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant_id = new URL(request.url).searchParams.get("tenant_id");
  if (!tenant_id) return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("torrinha_tenant_contacts")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/tenant-contacts
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tenant_id, label, name, email, phone, receives_emails, notes } = body;

  if (!tenant_id || !name) {
    return NextResponse.json({ error: "tenant_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("torrinha_tenant_contacts")
    .insert({
      tenant_id,
      label: label || null,
      name,
      email: email || null,
      phone: phone || null,
      receives_emails: receives_emails === true,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/tenant-contacts
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const allowed = ["label", "name", "email", "phone", "receives_emails", "notes"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in updates) patch[k] = updates[k] ?? null;
  }

  const { data, error } = await supabase
    .from("torrinha_tenant_contacts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/tenant-contacts?id=...
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("torrinha_tenant_contacts")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
