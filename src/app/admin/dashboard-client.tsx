"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

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
  incoming_tenant: { name: string; start_date: string } | null;
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
      <h1 className="text-2xl font-bold tracking-tight text-t-text mb-6">Dashboard</h1>

      {/* ============ Section 1: Revenue Summary ============ */}
      <Card className="p-5 mb-6">
        <h2 className="text-base font-semibold text-t-text mb-4">Revenue Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Expected this month</p>
            <p className="text-2xl font-bold text-t-text mt-1">&euro;{totalExpected.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Received this month</p>
            <p className="text-2xl font-bold text-green-700 mt-1">&euro;{totalReceived.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Delta</p>
            <p className={`text-2xl font-bold mt-1 ${delta >= 0 ? "text-green-700" : "text-red-600"}`}>
              {delta >= 0 ? "+" : ""}&euro;{delta.toFixed(2)}
            </p>
          </div>
        </div>
      </Card>

      {/* ============ Section 2: Payment Status Grid + Detail Panel ============ */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-t-text">Payment Status</h2>
          <span className="text-sm text-t-text-muted">{occupiedCount}/{tenantSpots.length} occupied</span>
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

                const hasIncoming = !!spot.incoming_tenant;
                const tooltipParts: string[] = [];
                if (spot.tenant_name) tooltipParts.push(`Now: ${spot.tenant_name}`);
                if (hasIncoming) tooltipParts.push(`→ ${spot.incoming_tenant!.name} from ${spot.incoming_tenant!.start_date}`);

                return (
                  <button
                    key={spot.number}
                    onClick={() => setSelectedSpot(isSelected ? null : spot.number)}
                    title={tooltipParts.join("\n") || undefined}
                    className={`p-3 rounded-[var(--t-radius-md)] text-center text-sm font-medium ${borderStyle} ${color} transition-all relative ${
                      isSelected ? "ring-2 ring-t-accent" : "hover:ring-2 hover:ring-t-border-strong"
                    }`}
                  >
                    {hasIncoming && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-t-accent" title={`Incoming: ${spot.incoming_tenant!.name} from ${spot.incoming_tenant!.start_date}`} />
                    )}
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
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-t-text-muted">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-100 border border-green-300 inline-block" /> Paid</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200 inline-block" /> Pending</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 inline-block" /> Reminder sent</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-300 inline-block" /> Overdue</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-100 border border-gray-200 inline-block" /> Vacant</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-200 inline-block" /> Owner</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-t-accent inline-block" /> Incoming tenant</span>
            </div>
          </div>

          {/* Detail panel */}
          {activeSpot && activeSpot.tenant_id && (
            <div className="w-72 shrink-0 border-l border-t-border pl-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-t-text">{activeSpot.tenant_name}</h3>
                <button onClick={() => setSelectedSpot(null)} className="text-t-text-muted hover:text-t-text text-sm">&times;</button>
              </div>
              <div className="space-y-2 text-xs text-t-text-muted mb-4">
                <p><span className="font-medium text-t-text">Spot:</span> {activeSpot.label || activeSpot.number}</p>
                <p><span className="font-medium text-t-text">Rent:</span> &euro;{activeSpot.tenant_rent}</p>
                <p><span className="font-medium text-t-text">Since:</span> {activeSpot.tenant_start_date ?? "—"}</p>
                <p>
                  <span className="font-medium text-t-text">Status:</span>{" "}
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                    STATUS_BADGE[activeSpot.payment_status ?? ""] ?? "bg-gray-100 text-gray-500"
                  }`}>{spotStatusLabel(activeSpot)}</span>
                </p>
                {activeSpot.incoming_tenant && (
                  <p className="mt-1 pt-1 border-t border-t-border text-blue-700">
                    <span className="font-medium">Incoming:</span> {activeSpot.incoming_tenant.name}{" "}
                    <span className="text-blue-500">from {activeSpot.incoming_tenant.start_date}</span>
                  </p>
                )}
              </div>

              {/* Payment history */}
              <p className="text-xs font-semibold text-t-text mb-1">Payment History</p>
              {activeSpot.payment_history.length > 0 ? (
                <div className="max-h-44 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-t-border">
                        <th className="text-left py-1 text-t-text-muted">Month</th>
                        <th className="text-left py-1 text-t-text-muted">Status</th>
                        <th className="text-right py-1 text-t-text-muted">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSpot.payment_history.map((h) => (
                        <tr key={h.month} className="border-b border-t-border">
                          <td className="py-1 text-t-text">{formatMonth(h.month)}</td>
                          <td className="py-1">
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[h.status] ?? "bg-gray-100 text-gray-500"}`}>{h.status}</span>
                          </td>
                          <td className="py-1 text-right text-t-text-muted">{h.paid_date ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-t-text-muted">No records yet.</p>
              )}

              <Link
                href={`/admin/payments?tenant=${activeSpot.tenant_id}`}
                className="mt-3 block text-center text-xs text-t-accent hover:text-t-accent-hover hover:underline"
              >
                Full history in Payments &rarr;
              </Link>
            </div>
          )}
        </div>
      </Card>

      {/* ============ Section 3: 6-Month Payment History Table ============ */}
      <Card className="p-5 mb-6 overflow-x-auto">
        <h2 className="text-base font-semibold text-t-text mb-4">6-Month History</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-t-border">
              <th className="text-left py-2 pr-3 text-[10px] font-semibold text-t-text-muted uppercase tracking-widest sticky left-0 bg-t-surface">Tenant</th>
              <th className="text-left py-2 pr-3 text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Spots</th>
              {months6Labels.map((label, i) => (
                <th key={months6[i]} className="text-center py-2 px-2 text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenantHistoryRows.map((row) => (
              <tr key={row.tenant_id} className="border-b border-t-border hover:bg-t-bg">
                <td className="py-2 pr-3 text-t-text font-medium whitespace-nowrap sticky left-0 bg-t-surface">{row.tenant_name}</td>
                <td className="py-2 pr-3 text-t-text-muted text-xs whitespace-nowrap">{row.spots_label}</td>
                {months6.map((m) => {
                  const status = row.months[m];
                  return (
                    <td key={m} className="py-2 px-2 text-center">
                      {status ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-500"}`}>
                          {status}
                        </span>
                      ) : (
                        <span className="text-t-border-strong">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-border-strong font-medium">
              <td className="py-2 pr-3 text-t-text sticky left-0 bg-t-surface" colSpan={2}>Totals</td>
              {monthlyTotals.map((mt) => (
                <td key={mt.month} className="py-2 px-2 text-center text-xs">
                  <div className="text-t-text">&euro;{mt.received.toFixed(0)}</div>
                  <div className="text-t-text-muted">/ &euro;{mt.expected.toFixed(0)}</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* ============ Section 4: Quick Count Badges ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Remotes Out</p>
          <p className="text-2xl font-bold text-t-text mt-1">{remotesOut}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Deposits Held</p>
          <p className="text-2xl font-bold text-t-text mt-1">&euro;{depositsHeld.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Waitlist</p>
          <p className="text-2xl font-bold text-t-text mt-1">{waitlistCount}</p>
        </Card>
        <Card className={`p-4 ${unmatchedCount > 0 ? "border-amber-300 bg-amber-50" : ""}`}>
          <p className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Unmatched Txns</p>
          <p className={`text-2xl font-bold mt-1 ${unmatchedCount > 0 ? "text-amber-700" : "text-t-text"}`}>{unmatchedCount}</p>
          {unmatchedCount > 0 && (
            <Link href="/admin/payments" className="text-xs text-t-accent hover:text-t-accent-hover hover:underline">Review &rarr;</Link>
          )}
        </Card>
      </div>
    </div>
  );
}
