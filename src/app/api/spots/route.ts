import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all spots available for tenant assignment:
  // no tenant assigned, and not an "Owner" spot
  const { data: allVacant } = await supabase
    .from("torrinha_spots")
    .select("id, number, label")
    .is("tenant_id", null)
    .order("number");

  const vacantSpots = (allVacant ?? []).filter((s) => s.label !== "Owner");

  return NextResponse.json(vacantSpots);
}
