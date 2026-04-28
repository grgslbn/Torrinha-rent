import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Helper: sync torrinha_spots.tenant_id cache for a given spot
async function syncSpotCache(supabase: Awaited<ReturnType<typeof createClient>>, spot_id: string) {
  const today = new Date().toISOString().split("T")[0];

  const { data: active } = await supabase
    .from("torrinha_spot_assignments")
    .select("tenant_id")
    .eq("spot_id", spot_id)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("torrinha_spots")
    .update({ tenant_id: active?.tenant_id ?? null })
    .eq("id", spot_id);
}

// GET /api/spot-assignments?spot_id=...&tenant_id=...
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const spot_id = searchParams.get("spot_id");
  const tenant_id = searchParams.get("tenant_id");

  let query = supabase
    .from("torrinha_spot_assignments")
    .select(`
      id, tenant_id, spot_id, start_date, end_date, notes, created_at,
      torrinha_tenants(id, name, email),
      torrinha_spots(id, number, label)
    `)
    .order("start_date", { ascending: false });

  if (spot_id) query = query.eq("spot_id", spot_id);
  if (tenant_id) query = query.eq("tenant_id", tenant_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// POST /api/spot-assignments — create a new assignment
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tenant_id, spot_id, start_date, end_date, notes } = body;

  if (!tenant_id || !spot_id || !start_date) {
    return NextResponse.json(
      { error: "tenant_id, spot_id, and start_date are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("torrinha_spot_assignments")
    .insert({ tenant_id, spot_id, start_date, end_date: end_date || null, notes: notes || null })
    .select()
    .single();

  if (error) {
    // Overlap constraint violation
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "This spot already has an assignment that overlaps with the selected dates. Set an end date on the current assignment first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update tenant status if start_date is today or past
  const today = new Date().toISOString().split("T")[0];
  if (start_date <= today) {
    await supabase
      .from("torrinha_tenants")
      .update({ status: "active" })
      .eq("id", tenant_id)
      .eq("status", "future");

    await syncSpotCache(supabase, spot_id);
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/spot-assignments — update (mainly to set end_date)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, end_date, notes } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (end_date !== undefined) updates.end_date = end_date || null;
  if (notes !== undefined) updates.notes = notes;

  const { data: assignment, error } = await supabase
    .from("torrinha_spot_assignments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "Date change would create an overlap with another assignment on this spot." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncSpotCache(supabase, assignment.spot_id);

  return NextResponse.json(assignment);
}

// DELETE /api/spot-assignments — remove a future assignment that hasn't started
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];

  const { data: assignment, error: fetchError } = await supabase
    .from("torrinha_spot_assignments")
    .select("spot_id, start_date")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 });

  if (assignment.start_date <= today) {
    return NextResponse.json(
      { error: "Cannot delete an assignment that has already started." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("torrinha_spot_assignments")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
