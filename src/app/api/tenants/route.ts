import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().split("T")[0];

  const { data: tenants, error } = await supabase
    .from("torrinha_tenants")
    .select(
      "*, torrinha_spots!torrinha_spots_tenant_id_fkey(id, number, label), torrinha_remotes(id, count, deposit_paid, returned_date)"
    )
    .order("status", { ascending: true }) // active → future → inactive
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach upcoming (future) assignments for each tenant
  const { data: futureAssignments } = await supabase
    .from("torrinha_spot_assignments")
    .select("tenant_id, spot_id, start_date, end_date, torrinha_spots(id, number, label)")
    .gt("start_date", today);

  const futureByTenant = new Map<string, typeof futureAssignments>();
  for (const a of futureAssignments ?? []) {
    const list = futureByTenant.get(a.tenant_id) ?? [];
    list.push(a);
    futureByTenant.set(a.tenant_id, list);
  }

  const enriched = (tenants ?? []).map((t) => ({
    ...t,
    future_assignments: futureByTenant.get(t.id) ?? [],
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { spot_ids, name, email, phone, language, rent_eur, payment_due_day, start_date, notes } = body;

  if (!name || !email || !rent_eur || !start_date) {
    return NextResponse.json(
      { error: "name, email, rent_eur, and start_date are required" },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const status = start_date > today ? "future" : "active";

  // Insert tenant
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
      status,
      active: status === "active",
    })
    .select()
    .single();

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });

  // If spots provided, create assignments + update cache for immediate ones
  if (spot_ids && Array.isArray(spot_ids) && spot_ids.length > 0) {
    const assignments = spot_ids.map((sid: string) => ({
      tenant_id: tenant.id,
      spot_id: sid,
      start_date,
    }));

    const { error: assignError } = await supabase
      .from("torrinha_spot_assignments")
      .insert(assignments);

    if (assignError) {
      if (assignError.code === "23P01") {
        // Roll back tenant creation on overlap
        await supabase.from("torrinha_tenants").delete().eq("id", tenant.id);
        return NextResponse.json(
          { error: "One or more spots have overlapping assignments on the selected start date." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    // For active tenants starting today or earlier, update spots cache
    if (status === "active") {
      await supabase
        .from("torrinha_spots")
        .update({ tenant_id: tenant.id })
        .in("id", spot_ids);
    }
  }

  const { data: full } = await supabase
    .from("torrinha_tenants")
    .select("*, torrinha_spots!torrinha_spots_tenant_id_fkey(id, number, label)")
    .eq("id", tenant.id)
    .single();

  return NextResponse.json(full, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, spot_ids, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (updates.rent_eur !== undefined) updates.rent_eur = Number(updates.rent_eur);
  if (updates.payment_due_day !== undefined) updates.payment_due_day = Number(updates.payment_due_day);

  // Keep active boolean in sync with status if status is being changed
  if (updates.status !== undefined) {
    updates.active = updates.status === "active";
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("torrinha_tenants").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (spot_ids && Array.isArray(spot_ids)) {
    await supabase.from("torrinha_spots").update({ tenant_id: null }).eq("tenant_id", id);
    if (spot_ids.length > 0) {
      const { error: spotError } = await supabase
        .from("torrinha_spots")
        .update({ tenant_id: id })
        .in("id", spot_ids);
      if (spotError) return NextResponse.json({ error: spotError.message }, { status: 500 });
    }
  }

  const { data, error: fetchError } = await supabase
    .from("torrinha_tenants")
    .select("*, torrinha_spots!torrinha_spots_tenant_id_fkey(id, number, label)")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json(data);
}
