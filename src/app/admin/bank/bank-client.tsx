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

type Filter = "all" | "auto_matched" | "ai_matched" | "manual" | "unmatched" | "ignored" | "ponto_shadow";

const STATUS_COLORS: Record<string, string> = {
  auto_matched: "bg-green-100 text-green-700 border-green-300",
  ai_matched: "bg-t-accent-light text-t-accent-text border-t-border",
  manual: "bg-t-bg text-t-text-muted border-t-border",
  unmatched: "bg-amber-100 text-amber-700 border-amber-300",
  ignored: "bg-red-50 text-red-600 border-red-200",
  ponto_shadow: "bg-purple-100 text-purple-700 border-purple-300",
};

const STATUS_LABELS: Record<string, string> = {
  auto_matched: "Auto-matched",
  ai_matched: "AI matched",
  manual: "Manual",
  unmatched: "Unmatched",
  ignored: "Ignored",
  ponto_shadow: "Ponto (shadow)",
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

// Returns the badge key for a row — shadow entries get their own badge
function badgeKey(row: LogRow): string {
  if (row.source === "ponto_shadow") return "ponto_shadow";
  return row.match_status;
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

    // ponto_shadow filters by source, everything else by match_status
    if (filter === "ponto_shadow") {
      params.set("source", "ponto_shadow");
    } else if (filter !== "all") {
      params.set("status", filter);
    }

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
        <h1 className="text-2xl font-bold text-t-text">Bank Transactions</h1>
        <a
          href="/admin/connect-bank"
          className="text-xs text-t-text-muted hover:text-t-text"
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
        <div className={`rounded-[var(--t-radius-lg)] p-5 ${summary.today.total === 0 ? "bg-amber-50 border border-amber-200" : "bg-t-surface border border-t-border"}`}>
          <p className="text-xs text-t-text-muted uppercase tracking-wide">Today</p>
          {summary.today.total === 0 ? (
            <p className="text-sm text-amber-700 mt-1">No transactions received today</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-t-text">{summary.today.total}</p>
              <p className="text-xs text-t-text-muted mt-1">
                {summary.today.matched} matched · {summary.today.unmatched} unmatched
              </p>
            </>
          )}
        </div>
        <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-5">
          <p className="text-xs text-t-text-muted uppercase tracking-wide">This month</p>
          <p className="text-2xl font-bold text-t-text">{summary.month.total}</p>
          <p className="text-xs text-t-text-muted mt-1">
            {summary.month.matched} matched · {summary.month.unmatched} unmatched
          </p>
        </div>
        <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-5">
          <p className="text-xs text-t-text-muted uppercase tracking-wide">Last sync</p>
          <p className="text-sm font-medium text-t-text mt-2">
            {summary.lastSync ? formatDate(summary.lastSync) : "—"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">Status</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="all">All statuses</option>
            <option value="auto_matched">Auto-matched</option>
            <option value="ai_matched">AI matched</option>
            <option value="manual">Manual</option>
            <option value="unmatched">Unmatched</option>
            <option value="ignored">Ignored</option>
            <option value="ponto_shadow">Ponto (shadow)</option>
          </select>
        </div>
        <button
          onClick={fetchLog}
          className="ml-auto px-3 py-1.5 text-xs bg-t-text text-white rounded-[var(--t-radius-sm)] hover:opacity-80"
        >
          Refresh
        </button>
      </div>

      {/* Section 2: Transaction table */}
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-x-auto mb-6">
        {loading ? (
          <div className="text-center py-12 text-t-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-t-text-muted text-sm">
            No transactions in this range.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-t-border">
            <thead className="bg-t-bg">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Received</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Execution</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Counterpart</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Matched tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-border">
              {rows.map((r) => {
                const badge = badgeKey(r);
                return (
                  <tr key={r.id} className="hover:bg-t-bg">
                    <td className="px-4 py-2 text-sm text-t-text-muted whitespace-nowrap">
                      {formatDate(r.received_at)}
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-secondary">
                      {r.execution_date ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text font-medium">
                      {r.amount_eur != null ? `€${Number(r.amount_eur).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-secondary max-w-[200px] truncate" title={r.counterpart ?? ""}>
                      {r.counterpart ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[badge] ?? "bg-t-bg text-t-text-muted border-t-border"}`}>
                        {STATUS_LABELS[badge] ?? r.match_status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-secondary">
                      {r.torrinha_tenants?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-muted">
                      {r.matched_month ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 3: Daily calendar */}
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-5">
        <h2 className="text-sm font-semibold text-t-text mb-3">Last 30 days</h2>
        <div className="grid grid-cols-10 sm:grid-cols-15 gap-1.5" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
          {calendarDays.map((d) => {
            const colour =
              d.unmatched > 0
                ? "bg-amber-400"
                : d.count > 0
                  ? "bg-green-400"
                  : "bg-t-border";
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
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-t-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-400 inline-block" /> Transactions received
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Unmatched on this day
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-t-border inline-block" /> Nothing
          </span>
        </div>
      </div>
    </div>
  );
}
