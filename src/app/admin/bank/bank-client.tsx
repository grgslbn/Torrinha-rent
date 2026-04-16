"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LogRow = {
  id: string;
  received_at: string;
  source: string;
  transaction_id: string | null;
  execution_date: string | null;
  amount_eur: number | null;
  counterpart: string | null;
  communication: string | null;
  match_status: string;
  matched_tenant_id: string | null;
  matched_month: string | null;
  notes: string | null;
  torrinha_tenants?: { id: string; name: string } | null;
};

type Filter = "all" | "auto_matched" | "ai_matched" | "manual" | "unmatched" | "ignored";

const STATUS_COLORS: Record<string, string> = {
  auto_matched: "bg-green-100 text-green-700 border-green-300",
  ai_matched: "bg-blue-100 text-blue-700 border-blue-300",
  manual: "bg-gray-100 text-gray-600 border-gray-300",
  unmatched: "bg-amber-100 text-amber-700 border-amber-300",
  ignored: "bg-red-50 text-red-600 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  auto_matched: "Auto-matched",
  ai_matched: "AI matched",
  manual: "Manual",
  unmatched: "Unmatched",
  ignored: "Ignored",
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function startOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function BankClient() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayStr());
  const [error, setError] = useState("");

  const fetchLog = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to + "T23:59:59");
    if (filter !== "all") params.set("status", filter);

    const res = await fetch(`/api/admin/bank-log?${params.toString()}`);
    if (res.ok) {
      setRows(await res.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to load transaction log");
    }
    setLoading(false);
  }, [filter, from, to]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  // --- Summaries ---
  const today = todayStr();
  const monthStart = startOfMonthStr();

  const summary = useMemo(() => {
    const todayRows = rows.filter((r) => r.received_at.startsWith(today));
    const monthRows = rows.filter((r) => r.received_at.slice(0, 10) >= monthStart);

    const count = (arr: LogRow[], s: string) =>
      arr.filter((r) => r.match_status === s).length;

    return {
      today: {
        total: todayRows.length,
        matched: count(todayRows, "auto_matched") + count(todayRows, "ai_matched"),
        unmatched: count(todayRows, "unmatched"),
      },
      month: {
        total: monthRows.length,
        matched: count(monthRows, "auto_matched") + count(monthRows, "ai_matched"),
        unmatched: count(monthRows, "unmatched"),
      },
      lastSync: rows[0]?.received_at ?? null,
    };
  }, [rows, today, monthStart]);

  // --- Daily calendar — last 30 days ---
  const calendarDays = useMemo(() => {
    const byDay = new Map<string, LogRow[]>();
    for (const r of rows) {
      const day = r.received_at.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(r);
      byDay.set(day, list);
    }
    const days: { date: string; count: number; unmatched: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i);
      const dayRows = byDay.get(d) ?? [];
      const unmatched = dayRows.filter((r) => r.match_status === "unmatched").length;
      days.push({ date: d, count: dayRows.length, unmatched });
    }
    return days;
  }, [rows]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bank Transactions</h1>
        <a
          href="/admin/connect-bank"
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Connection status &rarr;
        </a>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
          {error.includes("torrinha_transaction_log") && (
            <p className="mt-1 text-xs">
              The torrinha_transaction_log table needs to be created first. Run the SQL migration in Supabase.
            </p>
          )}
        </div>
      )}

      {/* Section 1: Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className={`rounded-lg shadow p-5 ${summary.today.total === 0 ? "bg-amber-50 border border-amber-200" : "bg-white"}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Today</p>
          {summary.today.total === 0 ? (
            <p className="text-sm text-amber-700 mt-1">No transactions received today</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">{summary.today.total}</p>
              <p className="text-xs text-gray-500 mt-1">
                {summary.today.matched} matched · {summary.today.unmatched} unmatched
              </p>
            </>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">This month</p>
          <p className="text-2xl font-bold text-gray-900">{summary.month.total}</p>
          <p className="text-xs text-gray-500 mt-1">
            {summary.month.matched} matched · {summary.month.unmatched} unmatched
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Last sync</p>
          <p className="text-sm font-medium text-gray-900 mt-2">
            {summary.lastSync ? formatDate(summary.lastSync) : "—"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          >
            <option value="all">All statuses</option>
            <option value="auto_matched">Auto-matched</option>
            <option value="ai_matched">AI matched</option>
            <option value="manual">Manual</option>
            <option value="unmatched">Unmatched</option>
            <option value="ignored">Ignored</option>
          </select>
        </div>
        <button
          onClick={fetchLog}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      {/* Section 2: Transaction table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No transactions in this range.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Execution</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Counterpart</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matched tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(r.received_at)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {r.execution_date ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 font-medium">
                    {r.amount_eur != null ? `€${Number(r.amount_eur).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 max-w-[200px] truncate" title={r.counterpart ?? ""}>
                    {r.counterpart ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[r.match_status] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      {STATUS_LABELS[r.match_status] ?? r.match_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {r.torrinha_tenants?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {r.matched_month ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 3: Daily calendar */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Last 30 days</h2>
        <div className="grid grid-cols-10 sm:grid-cols-15 gap-1.5" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
          {calendarDays.map((d) => {
            const colour =
              d.unmatched > 0
                ? "bg-amber-400"
                : d.count > 0
                  ? "bg-green-400"
                  : "bg-gray-200";
            return (
              <div
                key={d.date}
                className={`aspect-square rounded ${colour} relative group cursor-default`}
                title={`${d.date}: ${d.count} transactions${d.unmatched > 0 ? ` (${d.unmatched} unmatched)` : ""}`}
              >
                <span className="sr-only">
                  {d.date}: {d.count} transactions
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-400 inline-block" /> Transactions received
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Unmatched on this day
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Nothing
          </span>
        </div>
      </div>
    </div>
  );
}
