import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tenants, error } = await supabase
    .from("torrinha_tenants")
    .select(
      "*, torrinha_spots(number), torrinha_remotes(id, count, deposit_paid, returned_date)"
    )
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(tenants);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { spot_id, name, email, phone, language, rent_eur, payment_due_day, start_date, notes } =
    body;

  if (!spot_id || !name || !email || !rent_eur || !start_date) {
    return NextResponse.json(
      { error: "spot_id, name, email, rent_eur, and start_date are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("torrinha_tenants")
    .insert({
      spot_id,
      name,
      email,
      phone: phone || null,
      language: language || "pt",
      rent_eur: Number(rent_eur),
      payment_due_day: Number(payment_due_day) || 1,
      start_date,
      notes: notes || null,
    })
    .select("*, torrinha_spots(number)")
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

  // Convert numeric fields
  if (updates.rent_eur !== undefined) updates.rent_eur = Number(updates.rent_eur);
  if (updates.payment_due_day !== undefined)
    updates.payment_due_day = Number(updates.payment_due_day);

  const { data, error } = await supabase
    .from("torrinha_tenants")
    .update(updates)
    .eq("id", id)
    .select("*, torrinha_spots(number)")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
