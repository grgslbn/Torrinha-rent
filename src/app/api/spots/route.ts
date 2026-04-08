import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all non-owner spots
  const { data: spots } = await supabase
    .from("torrinha_spots")
    .select("id, number, owner_use")
    .eq("owner_use", false)
    .order("number");

  // Get spots currently occupied by active tenants
  const { data: occupiedTenants } = await supabase
    .from("torrinha_tenants")
    .select("spot_id")
    .eq("active", true)
    .not("spot_id", "is", null);

  const occupiedSpotIds = new Set(
    occupiedTenants?.map((t) => t.spot_id) ?? []
  );

  const vacantSpots =
    spots?.filter((s) => !occupiedSpotIds.has(s.id)) ?? [];

  return NextResponse.json(vacantSpots);
}
