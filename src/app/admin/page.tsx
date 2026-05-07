import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";

type PaymentRow = {
  tenant_id: string;
  month: string;
  status: string;
  amount_eur: number | null;
  reminder_sent_at: string | null;
  paid_date: string | null;
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
  const months6 = prevMonths(6);

  const today = new Date().toISOString().split("T")[0];

  const [
    { data: activeTenantsRaw },
    { data: spotsRaw },
    { data: allPaymentsRaw },
    { count: waitlistCount },
    { data: remotesRaw },
    { count: unmatchedCount },
    { data: futureAssignmentsRaw },
    { data: lastSyncRow },
  ] = await Promise.all([
    supabase
      .from("torrinha_tenants")
      .select("id, name, rent_eur, start_date, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label)")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("torrinha_spots")
      .select("id, number, label, tenant_id, torrinha_tenants(id, name, rent_eur)")
      .order("number"),
    supabase
      .from("torrinha_payments")
      .select("tenant_id, month, status, amount_eur, reminder_sent_at, paid_date")
      .in("month", months6),
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
    supabase
      .from("torrinha_spot_assignments")
      .select("spot_id, start_date, torrinha_tenants(name)")
      .gt("start_date", today)
      .order("start_date", { ascending: true }),
    supabase
      .from("torrinha_transaction_log")
      .select("received_at")
      .eq("source", "zapier")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeTenants = (activeTenantsRaw ?? []) as unknown as {
    id: string;
    name: string;
    rent_eur: number;
    start_date: string;
    torrinha_spots: { number: number; label: string | null }[];
  }[];

  const allPayments = (allPaymentsRaw ?? []) as PaymentRow[];

  // --- Section 1: Revenue summary ---
  const totalExpected = activeTenants.reduce(
    (s, t) => s + Number(t.rent_eur), 0
  );
  const currentPayments = allPayments.filter((p) => p.month === month);
  const totalReceived = currentPayments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_eur ?? 0), 0);
  const delta = totalReceived - totalExpected;

  // --- Section 2: Spot data ---
  const spotPaymentMap = new Map<string, PaymentRow>();
  for (const p of currentPayments) {
    spotPaymentMap.set(p.tenant_id, p);
  }

  // Build per-tenant payment history for popovers
  const tenantPaymentHistory = new Map<string, PaymentRow[]>();
  for (const p of allPayments) {
    const list = tenantPaymentHistory.get(p.tenant_id) ?? [];
    list.push(p);
    tenantPaymentHistory.set(p.tenant_id, list);
  }

  type SpotData = {
    number: number;
    label: string | null;
    tenant_id: string | null;
    tenant_name: string | null;
    tenant_rent: number | null;
    tenant_start_date: string | null;
    payment_status: string | null;
    reminder_sent: boolean;
    payment_history: { month: string; status: string; amount_eur: number | null; paid_date: string | null }[];
    incoming_tenant: { name: string; start_date: string } | null;
  };

  const tenantStartDates = new Map<string, string>();
  for (const t of activeTenants) {
    tenantStartDates.set(t.id, t.start_date);
  }

  // Build map: spot_id → first upcoming assignment
  const incomingBySpot = new Map<string, { name: string; start_date: string }>();
  for (const a of (futureAssignmentsRaw ?? []) as unknown as { spot_id: string; start_date: string; torrinha_tenants: { name: string } | null }[]) {
    if (!incomingBySpot.has(a.spot_id)) {
      incomingBySpot.set(a.spot_id, {
        name: a.torrinha_tenants?.name ?? "Unknown",
        start_date: a.start_date,
      });
    }
  }

  const spots: SpotData[] = ((spotsRaw ?? []) as unknown as {
    id: string;
    number: number;
    label: string | null;
    tenant_id: string | null;
    torrinha_tenants: { id: string; name: string; rent_eur: number } | null;
  }[]).map((s) => {
    const tenant = s.torrinha_tenants;
    const payment = tenant ? spotPaymentMap.get(tenant.id) : undefined;
    const history = tenant
      ? (tenantPaymentHistory.get(tenant.id) ?? [])
          .sort((a, b) => b.month.localeCompare(a.month))
          .map((p) => ({
            month: p.month,
            status: p.status,
            amount_eur: p.amount_eur,
            paid_date: p.paid_date,
          }))
      : [];
    return {
      number: s.number,
      label: s.label,
      tenant_id: s.tenant_id,
      tenant_name: tenant?.name ?? null,
      tenant_rent: tenant ? Number(tenant.rent_eur) : null,
      tenant_start_date: tenant ? tenantStartDates.get(tenant.id) ?? null : null,
      payment_status: payment?.status ?? null,
      reminder_sent: !!payment?.reminder_sent_at,
      payment_history: history,
      incoming_tenant: incomingBySpot.get(s.id) ?? null,
    };
  });

  // --- Section 3: 6-month history table ---
  type TenantHistoryRow = {
    tenant_id: string;
    tenant_name: string;
    rent_eur: number;
    spots_label: string;
    months: Record<string, string>; // month -> status
  };

  const tenantHistoryRows: TenantHistoryRow[] = activeTenants.map((t) => {
    const payments = tenantPaymentHistory.get(t.id) ?? [];
    const monthStatuses: Record<string, string> = {};
    for (const p of payments) {
      monthStatuses[p.month] = p.status;
    }
    return {
      tenant_id: t.id,
      tenant_name: t.name,
      rent_eur: Number(t.rent_eur),
      spots_label: t.torrinha_spots
        ?.slice()
        .sort((a, b) => a.number - b.number)
        .map((s) => s.label || String(s.number))
        .join(", ") ?? "—",
      months: monthStatuses,
    };
  });

  // Monthly totals for the history table
  const monthlyTotals = months6.map((m) => {
    const mPayments = allPayments.filter((p) => p.month === m);
    const expected = activeTenants.reduce((s, t) => s + Number(t.rent_eur), 0);
    const received = mPayments
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + Number(p.amount_eur ?? 0), 0);
    return { month: m, label: formatMonthShort(m), expected, received };
  });

  // --- Section 4: Quick counts ---
  const remotesOut = (remotesRaw ?? []).reduce(
    (s, r) => s + Number(r.count ?? 0), 0
  );
  const depositsHeld = (remotesRaw ?? [])
    .filter((r) => r.deposit_paid)
    .reduce((s, r) => s + Number(r.deposit_eur ?? 0), 0);

  const lastSyncAt = (lastSyncRow as { received_at: string } | null)?.received_at ?? null;

  return (
    <DashboardClient
      totalExpected={totalExpected}
      totalReceived={totalReceived}
      delta={delta}
      spots={spots}
      months6={months6}
      months6Labels={months6.map(formatMonthShort)}
      tenantHistoryRows={tenantHistoryRows}
      monthlyTotals={monthlyTotals}
      remotesOut={remotesOut}
      depositsHeld={depositsHeld}
      waitlistCount={waitlistCount ?? 0}
      unmatchedCount={unmatchedCount ?? 0}
      lastSyncAt={lastSyncAt}
    />
  );
}
