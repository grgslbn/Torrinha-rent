"use client";

import { useState } from "react";
import Link from "next/link";

// --- Types ---

type SpotData = {
  number: number;
  label: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_rent: number | null;
  tenant_start_date: string | null;
  payment_status: string | null;
  reminder_sent: boolean;
  payment_history: {
    month: string;
    status: string;
    amount_eur: number | null;
    paid_date: string | null;
  }[];
};

type TenantHistoryRow = {
  tenant_id: string;
  tenant_name: string;
  rent_eur: number;
  spots_label: string;
  months: Record<string, string>;
};

type MonthlyTotal = {
  month: string;
  label: string;
  expected: number;
  received: number;
};

type Props = {
  totalExpected: number;
  totalReceived: number;
  delta: number;
  spots: SpotData[];
  months6: string[];
  months6Labels: string[];
  tenantHistoryRows: TenantHistoryRow[];
  monthlyTotals: MonthlyTotal[];
  remotesOut: number;
  depositsHeld: number;
  waitlistCount: number;
  unmatchedCount: number;
};

// --- Helpers ---

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
};

function spotColor(spot: SpotData): string {
  if (spot.label === "Owner") return "bg-gray-200 text-gray-500";
  if (!spot.tenant_id) return "bg-gray-100 text-gray-400 border-gray-200";
  const s = spot.payment_status;
  if (s === "paid") return "bg-green-100 text-green-800 border-green-300";
  if (s === "overdue") return "bg-red-100 text-red-800 border-red-300";
  if (s === "pending" && spot.reminder_sent) return "bg-amber-100 text-amber-800 border-amber-300";
  if (s === "pending") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function spotStatusLabel(spot: SpotData): string {
  if (spot.label === "Owner") return "Owner";
  if (!spot.tenant_id) return "Vacant";
  const s = spot.payment_status;
  if (s === "paid") return "Paid";
  if (s === "overdue") return "Overdue";
  if (s === "pending" && spot.reminder_sent) return "Reminder sent";
  if (s === "pending") return "Pending";
  return "No payment row";
}

function formatMonth(m: string): string {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
}

// --- Component ---

export default function DashboardClient({
  totalExpected,
  totalReceived,
  delta,
  spots,
  months6,
  months6Labels,
  tenantHistoryRows,
  monthlyTotals,
  remotesOut,
  depositsHeld,
  waitlistCount,
  unmatchedCount,
}: Props) {
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);

  const isOwner = (s: SpotData) => s.label === "Owner";
  const tenantSpots = spots.filter((s) => !isOwner(s));
  const occupiedCount = tenantSpots.filter((s) => s.tenant_id).length;
  const activeSpot = selectedSpot !== null ? spots.find((s) => s.number === selectedSpot) ?? null : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* ============ Section 1: Revenue Summary ============ */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Expected this month</p>
            <p className="text-2xl font-bold text-gray-900">&euro;{totalExpected.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Received this month</p>
            <p className="text-2xl font-bold text-green-700">&euro;{totalReceived.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Delta</p>
            <p className={`text-2xl font-bold ${delta >= 0 ? "text-green-700" : "text-red-600"}`}>
              {delta >= 0 ? "+" : ""}&euro;{delta.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* ============ Section 2: Payment Status Grid + Detail Panel ============ */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Payment Status</h2>
          <span className="text-sm text-gray-400">{occupiedCount}/{tenantSpots.length} occupied</span>
        </div>

        <div className="flex gap-4">
          {/* Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-4 sm:grid-cols-9 gap-2">
              {spots.map((spot) => {
                const displayName = spot.label || String(spot.number);
                const isLabelled = !!spot.label && !isOwner(spot);
                const color = spotColor(spot);
                const borderStyle = isLabelled ? "border-dashed border-2" : isOwner(spot) ? "" : "border";
                const isSelected = selectedSpot === spot.number;

                return (
                  <button
                    key={spot.number}
                    onClick={() => setSelectedSpot(isSelected ? null : spot.number)}
                    className={`p-3 rounded text-center text-sm font-medium ${borderStyle} ${color} transition-all ${
                      isSelected ? "ring-2 ring-blue-500" : "hover:ring-2 hover:ring-blue-300"
                    }`}
                  >
                    {displayName}
                    {spot.tenant_name && !isOwner(spot) && (
                      <span className="block text-xs truncate opacity-70">{spot.tenant_name}</span>
                    )}
                    {isOwner(spot) && <span className="block text-xs text-gray-400">Owner</span>}
                    {!spot.tenant_id && !isOwner(spot) && <span className="block text-xs opacity-50">Vacant</span>}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-100 border border-green-300 inline-block" /> Paid</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200 inline-block" /> Pending</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 inline-block" /> Reminder sent</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-300 inline-block" /> Overdue</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-100 border border-gray-200 inline-block" /> Vacant</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-200 inline-block" /> Owner</span>
            </div>
          </div>

          {/* Detail panel */}
          {activeSpot && activeSpot.tenant_id && (
            <div className="w-72 shrink-0 border-l border-gray-200 pl-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">{activeSpot.tenant_name}</h3>
                <button onClick={() => setSelectedSpot(null)} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
              </div>
              <div className="space-y-2 text-xs text-gray-600 mb-4">
                <p><span className="font-medium text-gray-700">Spot:</span> {activeSpot.label || activeSpot.number}</p>
                <p><span className="font-medium text-gray-700">Rent:</span> &euro;{activeSpot.tenant_rent}</p>
                <p><span className="font-medium text-gray-700">Since:</span> {activeSpot.tenant_start_date ?? "—"}</p>
                <p>
                  <span className="font-medium text-gray-700">Status:</span>{" "}
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                    STATUS_BADGE[activeSpot.payment_status ?? ""] ?? "bg-gray-100 text-gray-500"
                  }`}>{spotStatusLabel(activeSpot)}</span>
                </p>
              </div>

              {/* Payment history */}
              <p className="text-xs font-medium text-gray-700 mb-1">Payment History</p>
              {activeSpot.payment_history.length > 0 ? (
                <div className="max-h-44 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 text-gray-500">Month</th>
                        <th className="text-left py-1 text-gray-500">Status</th>
                        <th className="text-right py-1 text-gray-500">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSpot.payment_history.map((h) => (
                        <tr key={h.month} className="border-b border-gray-50">
                          <td className="py-1 text-gray-700">{formatMonth(h.month)}</td>
                          <td className="py-1">
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[h.status] ?? "bg-gray-100 text-gray-500"}`}>{h.status}</span>
                          </td>
                          <td className="py-1 text-right text-gray-500">{h.paid_date ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No records yet.</p>
              )}

              <Link
                href={`/admin/payments?tenant=${activeSpot.tenant_id}`}
                className="mt-3 block text-center text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                Full history in Payments &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ============ Section 3: 6-Month Payment History Table ============ */}
      <div className="bg-white rounded-lg shadow p-5 mb-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">6-Month History</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 uppercase sticky left-0 bg-white">Tenant</th>
              <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 uppercase">Spots</th>
              {months6Labels.map((label, i) => (
                <th key={months6[i]} className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenantHistoryRows.map((row) => (
              <tr key={row.tenant_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-3 text-gray-900 font-medium whitespace-nowrap sticky left-0 bg-white">{row.tenant_name}</td>
                <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">{row.spots_label}</td>
                {months6.map((m) => {
                  const status = row.months[m];
                  return (
                    <td key={m} className="py-2 px-2 text-center">
                      {status ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-500"}`}>
                          {status}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 font-medium">
              <td className="py-2 pr-3 text-gray-700 sticky left-0 bg-white" colSpan={2}>Totals</td>
              {monthlyTotals.map((mt) => (
                <td key={mt.month} className="py-2 px-2 text-center text-xs">
                  <div className="text-gray-900">&euro;{mt.received.toFixed(0)}</div>
                  <div className="text-gray-400">/ &euro;{mt.expected.toFixed(0)}</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ============ Section 4: Quick Count Badges ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Remotes Out</p>
          <p className="text-2xl font-bold text-gray-900">{remotesOut}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Deposits Held</p>
          <p className="text-2xl font-bold text-gray-900">&euro;{depositsHeld.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Waitlist</p>
          <p className="text-2xl font-bold text-gray-900">{waitlistCount}</p>
        </div>
        <div className={`rounded-lg shadow p-4 ${unmatchedCount > 0 ? "bg-amber-50 border border-amber-200" : "bg-white"}`}>
          <p className="text-xs text-gray-500">Unmatched Txns</p>
          <p className={`text-2xl font-bold ${unmatchedCount > 0 ? "text-amber-700" : "text-gray-900"}`}>{unmatchedCount}</p>
          {unmatchedCount > 0 && (
            <Link href="/admin/payments" className="text-xs text-amber-600 hover:underline">Review &rarr;</Link>
          )}
        </div>
      </div>
    </div>
  );
}
