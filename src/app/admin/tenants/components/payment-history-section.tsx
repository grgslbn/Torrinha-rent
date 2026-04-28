"use client";

import { useEffect, useState } from "react";

type Payment = {
  id: string;
  month: string;
  status: "pending" | "paid" | "overdue";
  amount_eur: number;
  paid_date: string | null;
};

export default function PaymentHistorySection({ tenantId }: { tenantId: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/payments?tenant_id=${tenantId}`)
      .then((r) => r.json())
      .then((data: Payment[]) => {
        const sorted = [...(data ?? [])].sort((a, b) => b.month.localeCompare(a.month));
        setPayments(sorted.slice(0, 6));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <p className="text-sm text-t-text-muted">Loading…</p>;
  if (payments.length === 0) return <p className="text-sm text-t-text-muted">No payment records.</p>;

  const statusStyle: Record<string, string> = {
    paid: "text-green-700 bg-green-50",
    pending: "text-yellow-700 bg-yellow-50",
    overdue: "text-red-700 bg-red-50",
  };

  return (
    <div>
      <div className="space-y-0.5">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-1.5 text-sm border-b border-t-border last:border-0">
            <span className="w-20 text-t-text-muted shrink-0 tabular-nums">{p.month}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium w-16 text-center shrink-0 ${statusStyle[p.status] ?? "text-t-text-muted bg-t-bg"}`}
            >
              {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
            </span>
            <span className="text-t-text w-14 tabular-nums shrink-0">€{p.amount_eur}</span>
            <span className="text-t-text-muted tabular-nums">{p.paid_date ?? "—"}</span>
          </div>
        ))}
      </div>
      <a
        href={`/admin/payments?tenant_id=${tenantId}`}
        className="mt-2 block text-xs text-t-accent hover:underline"
      >
        View all payments →
      </a>
    </div>
  );
}
