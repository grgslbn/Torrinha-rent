import { createClient } from "@/lib/supabase/server";

export default async function WaitlistPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("torrinha_waitlist")
    .select("*")
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    waiting: "bg-t-accent-light text-t-accent-text",
    contacted: "bg-amber-50 text-amber-700",
    offered: "bg-green-50 text-green-700",
    declined: "bg-t-bg text-t-text-muted",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-t-text">Waiting List</h1>
        <span className="text-sm text-t-text-muted">{entries?.length ?? 0} entries</span>
      </div>

      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-hidden">
        <table className="min-w-full divide-y divide-t-border">
          <thead className="bg-t-bg">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Lang</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Signed Up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-t-border">
            {entries && entries.length > 0 ? (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-sm text-t-text">{e.name}</td>
                  <td className="px-4 py-3 text-sm text-t-text-muted">{e.email}</td>
                  <td className="px-4 py-3 text-sm text-t-text-muted">{e.phone || "—"}</td>
                  <td className="px-4 py-3 text-sm text-t-text-muted uppercase">{e.language}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        statusColors[e.status] ?? "bg-t-bg text-t-text-muted"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-t-text-muted">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-t-text-muted">
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
