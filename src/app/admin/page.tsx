import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";

type PaymentRow = {
  tenant_id: string;
  status: string;
  amount_eur: number | null;
  reminder_sent_at: string | null;
};

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonths(count: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return result;
}

function formatMonthShort(m: string): string {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const month = currentMonthStr();
  const months3 = prevMonths(3);

  const [
    { data: activeTenants },
    { data: spotsRaw },
    { data: currentPaymentsRaw },
    { data: historyPaymentsRaw },
    { count: waitlistCount },
    { data: remotesRaw },
    { count: unmatchedCount },
  ] = await Promise.all([
    supabase
      .from("torrinha_tenants")
      .select("id, name, rent_eur")
      .eq("active", true),
    supabase
      .from("torrinha_spots")
      .select("number, label, tenant_id, torrinha_tenants(id, name, rent_eur)")
      .order("number"),
    supabase
      .from("torrinha_payments")
      .select("tenant_id, status, amount_eur, reminder_sent_at")
      .eq("month", month),
    supabase
      .from("torrinha_payments")
      .select("tenant_id, month, status, amount_eur")
      .in("month", months3),
    supabase
      .from("torrinha_waitlist")
      .select("*", { count: "exact", head: true })
      .eq("status", "waiting"),
    supabase
      .from("torrinha_remotes")
      .select("count, deposit_paid, deposit_eur")
      .is("returned_date", null),
    supabase
      .from("torrinha_unmatched_transactions")
      .select("*", { count: "exact", head: true })
      .eq("reviewed", false),
  ]);

  // --- Section 1: Revenue summary ---
  const totalExpected = (activeTenants ?? []).reduce(
    (s, t) => s + Number(t.rent_eur),
    0
  );
  const currentPayments = (currentPaymentsRaw ?? []) as PaymentRow[];
  const totalReceived = currentPayments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_eur ?? 0), 0);
  const delta = totalReceived - totalExpected;

  // Month-over-month: last 3 months
  const allTenants = activeTenants ?? [];
  const historyPayments = (historyPaymentsRaw ?? []) as {
    tenant_id: string;
    month: string;
    status: string;
    amount_eur: number | null;
  }[];

  const monthlyBreakdown = months3.map((m) => {
    const mPayments = historyPayments.filter((p) => p.month === m);
    const expected = m === month
      ? totalExpected
      : allTenants.reduce((s, t) => s + Number(t.rent_eur), 0);
    const received = mPayments
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + Number(p.amount_eur ?? 0), 0);
    return {
      month: m,
      label: formatMonthShort(m),
      expected,
      received,
      delta: received - expected,
    };
  });

  // --- Section 2: Spot data ---
  type SpotData = {
    number: number;
    label: string | null;
    tenant_id: string | null;
    tenant_name: string | null;
    tenant_rent: number | null;
    payment_status: string | null;
    reminder_sent: boolean;
  };

  const spotPaymentMap = new Map<string, PaymentRow>();
  for (const p of currentPayments) {
    spotPaymentMap.set(p.tenant_id, p);
  }

  const spots: SpotData[] = ((spotsRaw ?? []) as unknown as {
    number: number;
    label: string | null;
    tenant_id: string | null;
    torrinha_tenants: { id: string; name: string; rent_eur: number } | null;
  }[]).map((s) => {
    const tenant = s.torrinha_tenants;
    const payment = tenant ? spotPaymentMap.get(tenant.id) : undefined;
    return {
      number: s.number,
      label: s.label,
      tenant_id: s.tenant_id,
      tenant_name: tenant?.name ?? null,
      tenant_rent: tenant ? Number(tenant.rent_eur) : null,
      payment_status: payment?.status ?? null,
      reminder_sent: !!payment?.reminder_sent_at,
    };
  });

  // --- Section 3: Quick counts ---
  const remotesOut = (remotesRaw ?? []).reduce(
    (s, r) => s + Number(r.count ?? 0),
    0
  );
  const depositsHeld = (remotesRaw ?? [])
    .filter((r) => r.deposit_paid)
    .reduce((s, r) => s + Number(r.deposit_eur ?? 0), 0);

  return (
    <DashboardClient
      totalExpected={totalExpected}
      totalReceived={totalReceived}
      delta={delta}
      monthlyBreakdown={monthlyBreakdown}
      spots={spots}
      remotesOut={remotesOut}
      depositsHeld={depositsHeld}
      waitlistCount={waitlistCount ?? 0}
      unmatchedCount={unmatchedCount ?? 0}
    />
  );
}
