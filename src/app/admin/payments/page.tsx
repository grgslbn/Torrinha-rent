import { createClient } from "@/lib/supabase/server";

export default async function PaymentsPage() {
  const supabase = await createClient();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: payments } = await supabase
    .from("torrinha_payments")
    .select("*, torrinha_tenants(name, rent_eur, torrinha_spots(number))")
    .eq("month", currentMonth)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    paid: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    overdue: "bg-red-50 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <span className="text-sm text-gray-500">{currentMonth}</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spot</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matched By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payments && payments.length > 0 ? (
              payments.map((p) => {
                const tenant = p.torrinha_tenants as {
                  name: string;
                  rent_eur: number;
                  torrinha_spots: { number: number } | null;
                } | null;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {tenant?.torrinha_spots?.number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {tenant?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      €{p.amount_eur ?? tenant?.rent_eur ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          statusColors[p.status] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {p.paid_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {p.matched_by ?? "—"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No payment records for {currentMonth}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
