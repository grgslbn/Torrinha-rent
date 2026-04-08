"use client";

import { useCallback, useEffect, useState } from "react";

type PaymentTenant = {
  id: string;
  name: string;
  rent_eur: number;
  active: boolean;
  torrinha_spots: { number: number; label: string | null }[];
};

type Payment = {
  id: string;
  tenant_id: string;
  month: string;
  status: string;
  paid_date: string | null;
  amount_eur: number | null;
  matched_by: string | null;
  reminder_sent_at: string | null;
  torrinha_tenants: PaymentTenant | null;
};

type SortKey = "spot" | "name" | "amount" | "status" | "month" | "paid_date";
type SortDir = "asc" | "desc";
type ViewMode = "month" | "range";

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-50 text-green-700",
  pending: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
};

const STATUS_ORDER: Record<string, number> = {
  overdue: 0,
  pending: 1,
  paid: 2,
};

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function spotLabels(
  spots: { number: number; label?: string | null }[] | null | undefined
): string {
  if (!spots || spots.length === 0) return "—";
  return spots
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => s.label || String(s.number))
    .join(", ");
}

function firstSpotNum(
  spots: { number: number }[] | null | undefined
): number {
  if (!spots || spots.length === 0) return 99;
  return Math.min(...spots.map((s) => s.number));
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
}

function downloadCsv(payments: Payment[]) {
  const headers = [
    "Tenant", "Spots", "Month", "Amount (EUR)", "Status", "Paid Date", "Matched By",
  ];
  const rows = payments.map((p) => {
    const t = p.torrinha_tenants;
    return [
      t?.name ?? "",
      spotLabels(t?.torrinha_spots),
      formatMonth(p.month),
      String(p.amount_eur ?? t?.rent_eur ?? ""),
      p.status,
      p.paid_date ?? "",
      p.matched_by ?? "",
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `torrinha-payments-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Unmatched transaction types
// ============================================================

type UnmatchedTxn = {
  id: string;
  amount_eur: number;
  counterparty: string | null;
  description: string | null;
  transaction_date: string | null;
  reviewed: boolean;
};

type AiMatch = {
  transaction_id: string;
  payment_id: string;
  confidence: string;
  reason: string;
};

// ============================================================
// Main component
// ============================================================

export default function PaymentsClient() {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  // Month mode
  const [month, setMonth] = useState(currentMonthStr());

  // Range mode
  const [rangeFrom, setRangeFrom] = useState("2026-01");
  const [rangeTo, setRangeTo] = useState(currentMonthStr());

  // Shared state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("spot");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  // Drill-down
  const [selectedTenant, setSelectedTenant] = useState<PaymentTenant | null>(
    null
  );
  const [tenantHistory, setTenantHistory] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  // Unmatched transactions
  const [unmatchedTxns, setUnmatchedTxns] = useState<UnmatchedTxn[]>([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [aiMatches, setAiMatches] = useState<AiMatch[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  // --- Fetch ---
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const url =
      viewMode === "month"
        ? `/api/payments?month=${month}`
        : `/api/payments?from=${rangeFrom}&to=${rangeTo}`;
    const res = await fetch(url);
    if (res.ok) setPayments(await res.json());
    setLoading(false);
  }, [viewMode, month, rangeFrom, rangeTo]);

  const fetchUnmatched = useCallback(async () => {
    setUnmatchedLoading(true);
    const res = await fetch("/api/unmatched-transactions");
    if (res.ok) setUnmatchedTxns(await res.json());
    setUnmatchedLoading(false);
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchUnmatched();
  }, [fetchPayments, fetchUnmatched]);

  // --- Generate ---
  async function generateMonth() {
    setGenerating(true);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    if (res.ok) {
      await fetchPayments();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to generate");
    }
    setGenerating(false);
  }

  // --- Mark paid ---
  async function markPaid(paymentId: string) {
    setSaving(paymentId);
    const res = await fetch("/api/payments/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: paymentId }),
    });
    if (res.ok) {
      await fetchPayments();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to mark paid");
    }
    setSaving(null);
  }

  // --- Sorting ---
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  }

  const sorted = [...payments].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const at = a.torrinha_tenants;
    const bt = b.torrinha_tenants;

    switch (sortKey) {
      case "spot":
        return (
          (firstSpotNum(at?.torrinha_spots) -
            firstSpotNum(bt?.torrinha_spots)) *
          dir
        );
      case "name":
        return (at?.name ?? "").localeCompare(bt?.name ?? "") * dir;
      case "month":
        return a.month.localeCompare(b.month) * dir;
      case "amount":
        return (
          ((a.amount_eur ?? at?.rent_eur ?? 0) -
            (b.amount_eur ?? bt?.rent_eur ?? 0)) *
          dir
        );
      case "status":
        return (
          ((STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)) *
          dir
        );
      case "paid_date":
        return (a.paid_date ?? "").localeCompare(b.paid_date ?? "") * dir;
      default:
        return 0;
    }
  });

  // --- Tenant drill-down ---
  async function openTenantHistory(tenant: PaymentTenant) {
    setSelectedTenant(tenant);
    setHistoryFilter("all");
    setHistoryLoading(true);
    const res = await fetch(`/api/payments?tenant_id=${tenant.id}`);
    if (res.ok) setTenantHistory(await res.json());
    setHistoryLoading(false);
  }

  const filteredHistory =
    historyFilter === "all"
      ? tenantHistory
      : tenantHistory.filter((p) => p.status === historyFilter);

  // --- Month navigation ---
  function changeMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // --- Summary ---
  const totalExpected = payments.reduce(
    (s, p) => s + Number(p.amount_eur ?? p.torrinha_tenants?.rent_eur ?? 0),
    0
  );
  const totalReceived = payments
    .filter((p) => p.status === "paid")
    .reduce(
      (s, p) => s + Number(p.amount_eur ?? p.torrinha_tenants?.rent_eur ?? 0),
      0
    );
  const totalOutstanding = totalExpected - totalReceived;
  const paidCount = payments.filter((p) => p.status === "paid").length;
  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const overdueCount = payments.filter((p) => p.status === "overdue").length;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div>
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <div className="flex items-center gap-4">
          {/* View mode toggle */}
          <div className="flex rounded overflow-hidden border border-gray-300 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 font-medium ${
                viewMode === "month"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              By month
            </button>
            <button
              type="button"
              onClick={() => setViewMode("range")}
              className={`px-3 py-1.5 font-medium border-l border-gray-300 ${
                viewMode === "range"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Date range
            </button>
          </div>

          {/* Month picker or date range */}
          {viewMode === "month" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                &larr;
              </button>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
              />
              <button
                onClick={() => changeMonth(1)}
                className="px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                &rarr;
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="month"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
              />
              <span className="text-gray-400">to</span>
              <input
                type="month"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm flex justify-between">
          {error}
          <button
            onClick={() => setError("")}
            className="text-red-500 hover:text-red-700"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Expected</p>
          <p className="text-lg font-bold text-gray-900">
            &euro;{totalExpected.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Received</p>
          <p className="text-lg font-bold text-green-700">
            &euro;{totalReceived.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Paid</p>
          <p className="text-lg font-bold text-green-700">{paidCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Pending</p>
          <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Overdue</p>
          <p className="text-lg font-bold text-red-600">{overdueCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : payments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">
            {viewMode === "month"
              ? `No payment records for ${formatMonth(month)}.`
              : "No payment records in this date range."}
          </p>
          {viewMode === "month" && (
            <button
              onClick={generateMonth}
              disabled={generating}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {generating
                ? "Generating..."
                : "Generate payment rows for this month"}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Export CSV button */}
          {viewMode === "range" && sorted.length > 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => downloadCsv(sorted)}
                className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800"
              >
                Export to CSV
              </button>
            </div>
          )}

          {/* Main payments table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("name")}
                  >
                    Tenant{sortIndicator("name")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("spot")}
                  >
                    Spots{sortIndicator("spot")}
                  </th>
                  {viewMode === "range" && (
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                      onClick={() => toggleSort("month")}
                    >
                      Month{sortIndicator("month")}
                    </th>
                  )}
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount{sortIndicator("amount")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("status")}
                  >
                    Status{sortIndicator("status")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort("paid_date")}
                  >
                    Paid Date{sortIndicator("paid_date")}
                  </th>
                  {viewMode === "month" && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Matched By
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sorted.map((p) => {
                  const t = p.torrinha_tenants;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {t ? (
                          <button
                            onClick={() => openTenantHistory(t)}
                            className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                          >
                            {t.name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {spotLabels(t?.torrinha_spots)}
                      </td>
                      {viewMode === "range" && (
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {formatMonth(p.month)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-900">
                        &euro;{p.amount_eur ?? t?.rent_eur ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            STATUS_COLORS[p.status] ??
                            "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {p.paid_date ?? "—"}
                      </td>
                      {viewMode === "month" && (
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {p.matched_by ?? "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm">
                        {p.status !== "paid" && (
                          <button
                            onClick={() => markPaid(p.id)}
                            disabled={saving === p.id}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {saving === p.id ? "..." : "Mark Paid"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Summary row */}
              {sorted.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-medium">
                    <td
                      className="px-4 py-3 text-sm text-gray-700"
                      colSpan={viewMode === "range" ? 3 : 2}
                    >
                      Total ({sorted.length} records)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      &euro;{totalExpected.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-green-700">
                      &euro;{totalReceived.toFixed(2)} received
                    </td>
                    <td
                      className={`px-4 py-3 text-sm font-medium ${
                        totalOutstanding > 0 ? "text-red-600" : "text-green-700"
                      }`}
                    >
                      &euro;{totalOutstanding.toFixed(2)} outstanding
                    </td>
                    <td
                      colSpan={viewMode === "month" ? 2 : 1}
                    />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Needs Review — Unmatched bank transactions (month mode only) */}
          {viewMode === "month" && (
            <NeedsReviewSection
              payments={payments}
              unmatchedTxns={unmatchedTxns}
              unmatchedLoading={unmatchedLoading}
              aiMatches={aiMatches}
              aiLoading={aiLoading}
              confirming={confirming}
              error={error}
              setError={setError}
              setAiMatches={setAiMatches}
              setAiLoading={setAiLoading}
              setConfirming={setConfirming}
              fetchPayments={fetchPayments}
              fetchUnmatched={fetchUnmatched}
            />
          )}
        </>
      )}

      {/* Tenant history drill-down modal */}
      {selectedTenant && (
        <TenantHistoryModal
          tenant={selectedTenant}
          history={filteredHistory}
          loading={historyLoading}
          filter={historyFilter}
          onFilterChange={setHistoryFilter}
          onClose={() => setSelectedTenant(null)}
          onMarkPaid={async (paymentId) => {
            await markPaid(paymentId);
            const res = await fetch(
              `/api/payments?tenant_id=${selectedTenant.id}`
            );
            if (res.ok) setTenantHistory(await res.json());
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

// ============================================================
// Needs Review Section (extracted for clarity)
// ============================================================

function NeedsReviewSection({
  payments,
  unmatchedTxns,
  unmatchedLoading,
  aiMatches,
  aiLoading,
  confirming,
  setError,
  setAiMatches,
  setAiLoading,
  setConfirming,
  fetchPayments,
  fetchUnmatched,
}: {
  payments: Payment[];
  unmatchedTxns: UnmatchedTxn[];
  unmatchedLoading: boolean;
  aiMatches: AiMatch[];
  aiLoading: boolean;
  confirming: string | null;
  error: string;
  setError: (e: string) => void;
  setAiMatches: React.Dispatch<React.SetStateAction<AiMatch[]>>;
  setAiLoading: (l: boolean) => void;
  setConfirming: (id: string | null) => void;
  fetchPayments: () => Promise<void>;
  fetchUnmatched: () => Promise<void>;
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Needs Review
          {unmatchedTxns.length > 0 && (
            <span className="ml-2 text-sm font-normal text-amber-600">
              {unmatchedTxns.length} unmatched
            </span>
          )}
        </h2>
        {unmatchedTxns.length > 0 && (
          <button
            onClick={async () => {
              setAiLoading(true);
              setAiMatches([]);
              const res = await fetch("/api/match-payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  transaction_ids: unmatchedTxns.map((t) => t.id),
                }),
              });
              if (res.ok) {
                const data = await res.json();
                setAiMatches(data.matches ?? []);
              } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "AI matching failed");
              }
              setAiLoading(false);
            }}
            disabled={aiLoading}
            className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {aiLoading ? "Matching..." : "Match with AI"}
          </button>
        )}
      </div>

      {unmatchedLoading ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      ) : unmatchedTxns.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-sm text-gray-400">
            No unmatched bank transactions.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Counterparty
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  AI Match
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {unmatchedTxns.map((txn) => {
                const aiMatch = aiMatches.find(
                  (m) => m.transaction_id === txn.id
                );
                const matchedPayment = aiMatch
                  ? payments.find((p) => p.id === aiMatch.payment_id) ?? null
                  : null;

                return (
                  <tr key={txn.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {txn.transaction_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      &euro;{txn.amount_eur}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {txn.counterparty ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                      {txn.description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {aiMatch ? (
                        <div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              aiMatch.confidence === "high"
                                ? "bg-green-50 text-green-700"
                                : aiMatch.confidence === "medium"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {aiMatch.confidence}
                          </span>
                          <span className="ml-1 text-xs text-gray-500">
                            {matchedPayment?.torrinha_tenants?.name ?? "—"}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">
                            {aiMatch.reason}
                          </p>
                        </div>
                      ) : aiLoading ? (
                        <span className="text-xs text-gray-400">...</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm flex gap-1">
                      {aiMatch && (
                        <button
                          onClick={async () => {
                            setConfirming(txn.id);
                            const res = await fetch(
                              "/api/match-payments/confirm",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  matches: [
                                    {
                                      transaction_id: txn.id,
                                      payment_id: aiMatch.payment_id,
                                    },
                                  ],
                                }),
                              }
                            );
                            if (res.ok) {
                              await fetchPayments();
                              await fetchUnmatched();
                              setAiMatches((prev) =>
                                prev.filter(
                                  (m) => m.transaction_id !== txn.id
                                )
                              );
                            } else {
                              const data = await res
                                .json()
                                .catch(() => ({}));
                              setError(
                                data.error || "Failed to confirm match"
                              );
                            }
                            setConfirming(null);
                          }}
                          disabled={confirming === txn.id}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {confirming === txn.id ? "..." : "Confirm"}
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const res = await fetch(
                            "/api/match-payments/dismiss",
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                transaction_ids: [txn.id],
                              }),
                            }
                          );
                          if (res.ok) {
                            await fetchUnmatched();
                          }
                        }}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tenant History Modal
// ============================================================

function TenantHistoryModal({
  tenant,
  history,
  loading,
  filter,
  onFilterChange,
  onClose,
  onMarkPaid,
  saving,
}: {
  tenant: PaymentTenant;
  history: Payment[];
  loading: boolean;
  filter: string;
  onFilterChange: (f: string) => void;
  onClose: () => void;
  onMarkPaid: (paymentId: string) => Promise<void>;
  saving: string | null;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{tenant.name}</h2>
            <p className="text-sm text-gray-500">
              Spot{tenant.torrinha_spots.length > 1 ? "s" : ""}{" "}
              {spotLabels(tenant.torrinha_spots)} &middot; &euro;
              {tenant.rent_eur}/month
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-2">
          {["all", "pending", "paid", "overdue"].map((s) => (
            <button
              key={s}
              onClick={() => onFilterChange(s)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                filter === s
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-gray-500 text-center py-8">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              No payment records found.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Month
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Paid
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Matched
                  </th>
                  <th className="px-3 py-2 text-xs w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      {formatMonth(p.month)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      &euro;{p.amount_eur ?? tenant.rent_eur}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_COLORS[p.status] ??
                          "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {p.paid_date ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {p.matched_by ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {p.status !== "paid" && (
                        <button
                          onClick={() => onMarkPaid(p.id)}
                          disabled={saving === p.id}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {saving === p.id ? "..." : "Mark Paid"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
