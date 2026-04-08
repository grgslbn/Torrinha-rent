import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("torrinha_remotes")
    .select("*, torrinha_tenants(id, name, active, torrinha_spots(number))")
    .order("returned_date", { ascending: true, nullsFirst: true })
    .order("issued_date", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tenant_id, count, deposit_paid, deposit_eur, issued_date } = body;

  if (!tenant_id) {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("torrinha_remotes")
    .insert({
      tenant_id,
      count: Number(count) || 1,
      deposit_paid: !!deposit_paid,
      deposit_eur: deposit_eur ? Number(deposit_eur) : null,
      issued_date: issued_date || new Date().toISOString().split("T")[0],
    })
    .select("*, torrinha_tenants(id, name, active, torrinha_spots(number))")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (updates.count !== undefined) updates.count = Number(updates.count);
  if (updates.deposit_eur !== undefined)
    updates.deposit_eur = updates.deposit_eur ? Number(updates.deposit_eur) : null;
  if (updates.deposit_paid !== undefined)
    updates.deposit_paid = updates.deposit_paid === true || updates.deposit_paid === "true";

  const { data, error } = await supabase
    .from("torrinha_remotes")
    .update(updates)
    .eq("id", id)
    .select("*, torrinha_tenants(id, name, active, torrinha_spots(number))")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
