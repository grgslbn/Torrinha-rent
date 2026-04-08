"use client";

import { useState } from "react";
import Link from "next/link";

type SpotData = {
  number: number;
  label: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_rent: number | null;
  payment_status: string | null;
  reminder_sent: boolean;
};

type MonthRow = {
  month: string;
  label: string;
  expected: number;
  received: number;
  delta: number;
};

type Props = {
  totalExpected: number;
  totalReceived: number;
  delta: number;
  monthlyBreakdown: MonthRow[];
  spots: SpotData[];
  remotesOut: number;
  depositsHeld: number;
  waitlistCount: number;
  unmatchedCount: number;
};

// Spot colour logic:
// green = paid, amber = reminder sent (pending + reminder), red = overdue,
// blue = pending (not yet due), grey = vacant, grey-dark = owner
function spotColor(spot: SpotData): string {
  if (spot.label === "Owner") return "bg-gray-200 text-gray-500";
  if (!spot.tenant_id) return "bg-gray-100 text-gray-400 border-gray-200";

  const status = spot.payment_status;
  if (status === "paid") return "bg-green-100 text-green-800 border-green-300";
  if (status === "overdue") return "bg-red-100 text-red-800 border-red-300";
  if (status === "pending" && spot.reminder_sent)
    return "bg-amber-100 text-amber-800 border-amber-300";
  if (status === "pending") return "bg-blue-50 text-blue-700 border-blue-200";
  // No payment row yet
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function spotStatusLabel(spot: SpotData): string {
  if (spot.label === "Owner") return "Owner";
  if (!spot.tenant_id) return "Vacant";
  const status = spot.payment_status;
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  if (status === "pending" && spot.reminder_sent) return "Reminder sent";
  if (status === "pending") return "Pending";
  return "No payment row";
}

export default function DashboardClient({
  totalExpected,
  totalReceived,
  delta,
  monthlyBreakdown,
  spots,
  remotesOut,
  depositsHeld,
  waitlistCount,
  unmatchedCount,
}: Props) {
  const [popoverSpot, setPopoverSpot] = useState<number | null>(null);

  const isOwner = (s: SpotData) => s.label === "Owner";
  const tenantSpots = spots.filter((s) => !isOwner(s));
  const occupiedCount = tenantSpots.filter((s) => s.tenant_id).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* ============ Section 1: Revenue Summary ============ */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Revenue Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Expected this month
            </p>
            <p className="text-2xl font-bold text-gray-900">
              &euro;{totalExpected.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Received this month
            </p>
            <p className="text-2xl font-bold text-green-700">
              &euro;{totalReceived.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Delta
            </p>
            <p
              className={`text-2xl font-bold ${
                delta >= 0 ? "text-green-700" : "text-red-600"
              }`}
            >
              {delta >= 0 ? "+" : ""}
              &euro;{delta.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Month-over-month table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">
                  Month
                </th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">
                  Expected
                </th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">
                  Received
                </th>
                <th className="text-right py-2 pl-4 text-xs font-medium text-gray-500 uppercase">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyBreakdown.map((row) => (
                <tr
                  key={row.month}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="py-2 pr-4 text-gray-700">{row.label}</td>
                  <td className="py-2 px-4 text-right text-gray-900">
                    &euro;{row.expected.toFixed(2)}
                  </td>
                  <td className="py-2 px-4 text-right text-green-700">
                    &euro;{row.received.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 pl-4 text-right font-medium ${
                      row.delta >= 0 ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {row.delta >= 0 ? "+" : ""}
                    &euro;{row.delta.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ Section 2: Payment Status Grid ============ */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Payment Status
          </h2>
          <span className="text-sm text-gray-400">
            {occupiedCount}/{tenantSpots.length} occupied
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-9 gap-2 relative">
          {spots.map((spot) => {
            const displayName = spot.label || String(spot.number);
            const isLabelledSpot = !!spot.label && !isOwner(spot);
            const color = spotColor(spot);
            const borderStyle = isLabelledSpot
              ? "border-dashed border-2"
              : isOwner(spot)
                ? ""
                : "border";

            return (
              <div key={spot.number} className="relative">
                <button
                  onClick={() =>
                    setPopoverSpot(
                      popoverSpot === spot.number ? null : spot.number
                    )
                  }
                  className={`w-full p-3 rounded text-center text-sm font-medium ${borderStyle} ${color} transition-all hover:ring-2 hover:ring-blue-300`}
                >
                  {displayName}
                  {spot.tenant_name && !isOwner(spot) && (
                    <span className="block text-xs truncate opacity-70">
                      {spot.tenant_name}
                    </span>
                  )}
                  {isOwner(spot) && (
                    <span className="block text-xs text-gray-400">Owner</span>
                  )}
                  {!spot.tenant_id && !isOwner(spot) && (
                    <span className="block text-xs opacity-50">Vacant</span>
                  )}
                </button>

                {/* Popover */}
                {popoverSpot === spot.number && spot.tenant_id && (
                  <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {spot.tenant_name}
                      </p>
                      <button
                        onClick={() => setPopoverSpot(null)}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <p>
                        <span className="font-medium text-gray-700">
                          Spot:
                        </span>{" "}
                        {displayName}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">
                          Rent:
                        </span>{" "}
                        &euro;{spot.tenant_rent ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">
                          Status:
                        </span>{" "}
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                            spot.payment_status === "paid"
                              ? "bg-green-50 text-green-700"
                              : spot.payment_status === "overdue"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {spotStatusLabel(spot)}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={`/admin/payments?tenant=${spot.tenant_id}`}
                      className="mt-3 block text-center text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View payment history &rarr;
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" />{" "}
            Paid
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200 inline-block" />{" "}
            Pending
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" />{" "}
            Reminder sent
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" />{" "}
            Overdue
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" />{" "}
            Vacant
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-200 inline-block" />{" "}
            Owner
          </span>
        </div>
      </div>

      {/* ============ Section 3: Quick Count Badges ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Remotes Out</p>
          <p className="text-2xl font-bold text-gray-900">{remotesOut}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Deposits Held</p>
          <p className="text-2xl font-bold text-gray-900">
            &euro;{depositsHeld.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Waitlist</p>
          <p className="text-2xl font-bold text-gray-900">{waitlistCount}</p>
        </div>
        <div
          className={`rounded-lg shadow p-4 ${
            unmatchedCount > 0
              ? "bg-amber-50 border border-amber-200"
              : "bg-white"
          }`}
        >
          <p className="text-xs text-gray-500">Unmatched Txns</p>
          <p
            className={`text-2xl font-bold ${
              unmatchedCount > 0 ? "text-amber-700" : "text-gray-900"
            }`}
          >
            {unmatchedCount}
          </p>
          {unmatchedCount > 0 && (
            <Link
              href="/admin/payments"
              className="text-xs text-amber-600 hover:underline"
            >
              Review &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
