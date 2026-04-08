import { createClient } from "@/lib/supabase/server";

export default async function WaitlistPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("torrinha_waitlist")
    .select("*")
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    waiting: "bg-blue-50 text-blue-700",
    contacted: "bg-amber-50 text-amber-700",
    offered: "bg-green-50 text-green-700",
    declined: "bg-gray-100 text-gray-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Waiting List</h1>
        <span className="text-sm text-gray-500">{entries?.length ?? 0} entries</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lang</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signed Up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {entries && entries.length > 0 ? (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.phone || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 uppercase">{e.language}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        statusColors[e.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No waitlist entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
