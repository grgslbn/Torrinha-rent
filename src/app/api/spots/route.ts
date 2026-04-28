import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vacantOnly = searchParams.get("vacant") === "true";

  const today = new Date().toISOString().split("T")[0];

  const { data: allSpots } = await supabase
    .from("torrinha_spots")
    .select("id, number, label, tenant_id, torrinha_tenants(id, name)")
    .order("number");

  // Get upcoming (future) assignments to show "incoming tenant" info
  const { data: futureAssignments } = await supabase
    .from("torrinha_spot_assignments")
    .select("spot_id, tenant_id, start_date, torrinha_tenants(id, name)")
    .gt("start_date", today)
    .order("start_date", { ascending: true });

  const futureBySpot = new Map<string, { tenant_id: string; tenant_name: string; start_date: string }>();
  for (const a of futureAssignments ?? []) {
    if (!futureBySpot.has(a.spot_id)) {
      const rawT = a.torrinha_tenants;
      const t = (Array.isArray(rawT) ? rawT[0] : rawT) as { id: string; name: string } | null;
      futureBySpot.set(a.spot_id, {
        tenant_id: a.tenant_id,
        tenant_name: t?.name ?? "Unknown",
        start_date: a.start_date,
      });
    }
  }

  const spots = (allSpots ?? [])
    .filter((s) => s.label !== "Owner")
    .map((s) => {
      const occupied = s.tenant_id !== null;
      const incoming = futureBySpot.get(s.id) ?? null;
      const rawTenant = s.torrinha_tenants;
      const tenantObj = (Array.isArray(rawTenant) ? rawTenant[0] : rawTenant) as { id: string; name: string } | null;
      return {
        id: s.id,
        number: s.number,
        label: s.label,
        occupied,
        tenant_id: s.tenant_id,
        tenant_name: tenantObj?.name ?? null,
        incoming_tenant: incoming,
      };
    });

  const result = vacantOnly ? spots.filter((s) => !s.occupied) : spots;

  return NextResponse.json(result);
}
