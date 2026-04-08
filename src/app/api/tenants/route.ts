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
      "*, torrinha_spots!torrinha_spots_tenant_id_fkey(id, number), torrinha_remotes(id, count, deposit_paid, returned_date)"
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
  const { spot_ids, name, email, phone, language, rent_eur, payment_due_day, start_date, notes } =
    body;

  if (!spot_ids || !Array.isArray(spot_ids) || spot_ids.length === 0 || !name || !email || !rent_eur || !start_date) {
    return NextResponse.json(
      { error: "spot_ids (array), name, email, rent_eur, and start_date are required" },
      { status: 400 }
    );
  }

  // Insert tenant (no spot_id column anymore)
  const { data: tenant, error: tenantError } = await supabase
    .from("torrinha_tenants")
    .insert({
      name,
      email,
      phone: phone || null,
      language: language || "pt",
      rent_eur: Number(rent_eur),
      payment_due_day: Number(payment_due_day) || 1,
      start_date,
      notes: notes || null,
    })
    .select()
    .single();

  if (tenantError)
    return NextResponse.json({ error: tenantError.message }, { status: 500 });

  // Assign spots to this tenant
  const { error: spotError } = await supabase
    .from("torrinha_spots")
    .update({ tenant_id: tenant.id })
    .in("id", spot_ids);

  if (spotError)
    return NextResponse.json({ error: spotError.message }, { status: 500 });

  // Re-fetch with spots included
  const { data: full } = await supabase
    .from("torrinha_tenants")
    .select("*, torrinha_spots!torrinha_spots_tenant_id_fkey(id, number)")
    .eq("id", tenant.id)
    .single();

  return NextResponse.json(full, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, spot_ids, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Convert numeric fields
  if (updates.rent_eur !== undefined) updates.rent_eur = Number(updates.rent_eur);
  if (updates.payment_due_day !== undefined)
    updates.payment_due_day = Number(updates.payment_due_day);

  // Update tenant fields (if any non-spot updates)
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("torrinha_tenants")
      .update(updates)
      .eq("id", id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If spot_ids provided, reassign spots
  if (spot_ids && Array.isArray(spot_ids)) {
    // Clear old spots
    await supabase
      .from("torrinha_spots")
      .update({ tenant_id: null })
      .eq("tenant_id", id);

    // Assign new spots
    if (spot_ids.length > 0) {
      const { error: spotError } = await supabase
        .from("torrinha_spots")
        .update({ tenant_id: id })
        .in("id", spot_ids);

      if (spotError)
        return NextResponse.json({ error: spotError.message }, { status: 500 });
    }
  }

  const { data, error: fetchError } = await supabase
    .from("torrinha_tenants")
    .select("*, torrinha_spots!torrinha_spots_tenant_id_fkey(id, number)")
    .eq("id", id)
    .single();

  if (fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json(data);
}
