import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { count: tenantCount },
    { count: waitlistCount },
    { data: spots },
  ] = await Promise.all([
    supabase
      .from("torrinha_tenants")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("torrinha_waitlist")
      .select("*", { count: "exact", head: true })
      .eq("status", "waiting"),
    supabase
      .from("torrinha_spots")
      .select("number, owner_use")
      .order("number"),
  ]);

  const occupiedSpots = tenantCount ?? 0;
  const availableSpots = 14 - occupiedSpots; // 14 tenant spots total
  const waitlistLength = waitlistCount ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Active Tenants</p>
          <p className="text-3xl font-bold text-gray-900">{occupiedSpots}</p>
          <p className="text-xs text-gray-400 mt-1">of 14 spots</p>
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
          {spots?.map((spot) => (
            <div
              key={spot.number}
              className={`p-3 rounded text-center text-sm font-medium ${
                spot.owner_use
                  ? "bg-gray-200 text-gray-500"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}
            >
              {spot.number}
              {spot.owner_use && (
                <span className="block text-xs text-gray-400">Owner</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
