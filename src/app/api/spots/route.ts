import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all non-owner spots that have no tenant assigned
  const { data: vacantSpots } = await supabase
    .from("torrinha_spots")
    .select("id, number, owner_use")
    .eq("owner_use", false)
    .is("tenant_id", null)
    .order("number");

  return NextResponse.json(vacantSpots ?? []);
}
