import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/payments?month=2026-04
// GET /api/payments?tenant_id=xxx (all months for one tenant)
// GET /api/payments?tenant_id=xxx&status=pending
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const tenantId = searchParams.get("tenant_id");
  const status = searchParams.get("status");

  let query = supabase
    .from("torrinha_payments")
    .select("*, torrinha_tenants(id, name, rent_eur, active, torrinha_spots!torrinha_spots_tenant_id_fkey(number))");

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  } else if (month) {
    query = query.eq("month", month);
  }

  if (status) {
    query = query.eq("status", status);
  }

  query = query.order("month", { ascending: false });

  const { data, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// POST /api/payments/  — generate pending rows for a month
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { month } = await request.json();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Valid month (YYYY-MM) is required" }, { status: 400 });
  }

  // Get all active tenants
  const { data: tenants } = await supabase
    .from("torrinha_tenants")
    .select("id, rent_eur")
    .eq("active", true);

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ error: "No active tenants" }, { status: 400 });
  }

  // Check which tenants already have a row for this month
  const { data: existing } = await supabase
    .from("torrinha_payments")
    .select("tenant_id")
    .eq("month", month);

  const existingSet = new Set(existing?.map((e) => e.tenant_id) ?? []);

  const toInsert = tenants
    .filter((t) => !existingSet.has(t.id))
    .map((t) => ({
      tenant_id: t.id,
      month,
      status: "pending",
      amount_eur: t.rent_eur,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ message: "All tenants already have records for this month", created: 0 });
  }

  const { error } = await supabase.from("torrinha_payments").insert(toInsert);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ created: toInsert.length }, { status: 201 });
}
