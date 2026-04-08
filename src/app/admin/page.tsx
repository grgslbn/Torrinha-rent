import { createClient } from "@/lib/supabase/server";

type SpotRow = {
  number: number;
  owner_use: boolean;
  tenant_id: string | null;
  // Supabase returns the FK-owning side as an object (spot belongs to one tenant)
  torrinha_tenants: { id: string; name: string } | null;
};

type PaymentRow = {
  tenant_id: string;
  status: string;
};

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const SPOT_STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800 border-green-300",
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
};

export default async function AdminDashboard() {
  const supabase = await createClient();
  const month = currentMonthStr();

  const [
    { count: waitlistCount },
    { data: spotsRaw },
    { data: paymentsRaw },
  ] = await Promise.all([
    supabase
      .from("torrinha_waitlist")
      .select("*", { count: "exact", head: true })
      .eq("status", "waiting"),
    supabase
      .from("torrinha_spots")
      .select("number, owner_use, tenant_id, torrinha_tenants(id, name)")
      .order("number"),
    supabase
      .from("torrinha_payments")
      .select("tenant_id, status")
      .eq("month", month),
  ]);

  const allSpots = (spotsRaw ?? []) as unknown as SpotRow[];
  const allPayments = (paymentsRaw ?? []) as PaymentRow[];
  const waitlistLength = waitlistCount ?? 0;

  // Build tenant payment status map
  const tenantPaymentStatus = new Map<string, string>();
  for (const p of allPayments) {
    tenantPaymentStatus.set(p.tenant_id, p.status);
  }

  // Count occupied vs available (non-owner spots)
  const tenantSpots = allSpots.filter((s) => !s.owner_use);
  const occupiedSpots = tenantSpots.filter((s) => s.tenant_id).length;
  const availableSpots = tenantSpots.filter((s) => !s.tenant_id).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Occupied Spots</p>
          <p className="text-3xl font-bold text-gray-900">{occupiedSpots}</p>
          <p className="text-xs text-gray-400 mt-1">of {tenantSpots.length} tenant spots</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Available Spots</p>
          <p className="text-3xl font-bold text-gray-900">{availableSpots}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Waitlist</p>
          <p className="text-3xl font-bold text-gray-900">{waitlistLength}</p>
          <p className="text-xs text-gray-400 mt-1">people waiting</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Spot Map</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {allSpots.map((spot) => {
            if (spot.owner_use) {
              return (
                <div
                  key={spot.number}
                  className="p-3 rounded text-center text-sm font-medium bg-gray-200 text-gray-500"
                >
                  {spot.number}
                  <span className="block text-xs text-gray-400">Owner</span>
                </div>
              );
            }

            const tenant = spot.torrinha_tenants;
            const paymentStatus = tenant
              ? tenantPaymentStatus.get(tenant.id) ?? null
              : null;

            // Colour based on payment status (or green/available if no tenant)
            const colorClass = tenant
              ? SPOT_STATUS_COLORS[paymentStatus ?? ""] ??
                "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-green-50 text-green-700 border-green-200";

            return (
              <div
                key={spot.number}
                className={`p-3 rounded text-center text-sm font-medium border ${colorClass} relative group`}
                title={tenant ? tenant.name : "Available"}
              >
                {spot.number}
                {tenant && (
                  <span className="block text-xs truncate opacity-70">
                    {tenant.name}
                  </span>
                )}
                {/* Hover tooltip */}
                {tenant && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {tenant.name}
                    {paymentStatus && (
                      <span className="ml-1 capitalize">({paymentStatus})</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" /> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" style={{ background: "#dcfce7" }} /> Paid
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" /> Pending
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> Overdue
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200 inline-block" /> No payment row
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Owner
          </span>
        </div>
      </div>
    </div>
  );
}
