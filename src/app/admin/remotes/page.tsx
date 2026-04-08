import { createClient } from "@/lib/supabase/server";

export default async function RemotesPage() {
  const supabase = await createClient();

  const { data: remotes } = await supabase
    .from("torrinha_remotes")
    .select("*, torrinha_tenants(name, torrinha_spots(number))")
    .is("returned_date", null)
    .order("issued_date", { ascending: false });

  const totalRemotes = remotes?.reduce((sum, r) => sum + (r.count ?? 0), 0) ?? 0;
  const totalDeposits = remotes
    ?.filter((r) => r.deposit_paid)
    .reduce((sum, r) => sum + Number(r.deposit_eur ?? 0), 0) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Remote Controls</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Remotes Out</p>
          <p className="text-2xl font-bold text-gray-900">{totalRemotes}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Deposits Held</p>
          <p className="text-2xl font-bold text-gray-900">€{totalDeposits.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spot</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deposit</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issued</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {remotes && remotes.length > 0 ? (
              remotes.map((r) => {
                const tenant = r.torrinha_tenants as {
                  name: string;
                  torrinha_spots: { number: number } | null;
                } | null;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {tenant?.torrinha_spots?.number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{tenant?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.count}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {r.deposit_paid ? `€${r.deposit_eur}` : "No"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.issued_date ?? "—"}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  No remote controls issued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
