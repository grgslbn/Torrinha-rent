import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Use service role so the public (unauthenticated) page can read
// tenant data when presented with a valid token.
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type TenantRow = {
  id: string;
  name: string;
  language: string;
  rent_eur: number;
  start_date: string;
  torrinha_spots: { number: number; label: string | null }[];
};

type PaymentRow = {
  id: string;
  month: string;
  status: string;
  amount_eur: number | null;
  paid_date: string | null;
};

function formatMonth(month: string, lang: string): string {
  const [y, m] = month.split("-");
  const ptMonths = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const enMonths = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const months = lang === "pt" ? ptMonths : enMonths;
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
};

const STATUS_LABEL_PT: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  overdue: "Em atraso",
};

const STATUS_LABEL_EN: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
};

export default async function TenantPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Basic shape check — never log the token
  if (!token || token.length < 16 || !/^[a-f0-9-]+$/i.test(token)) {
    notFound();
  }

  const db = serviceClient();

  const { data: tenantRow } = await db
    .from("torrinha_tenants")
    .select("id, name, language, rent_eur, start_date, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label)")
    .eq("access_token", token)
    .eq("status", "active")
    .maybeSingle();

  if (!tenantRow) {
    notFound();
  }

  const tenant = tenantRow as unknown as TenantRow;
  const isPt = tenant.language === "pt";

  const { data: paymentsData } = await db
    .from("torrinha_payments")
    .select("id, month, status, amount_eur, paid_date")
    .eq("tenant_id", tenant.id)
    .order("month", { ascending: false });

  const payments = (paymentsData ?? []) as PaymentRow[];
  const paidPayments = payments.filter((p) => p.status === "paid");
  const monthsPaid = paidPayments.length;
  const totalPaid = paidPayments.reduce(
    (s, p) => s + Number(p.amount_eur ?? 0),
    0
  );

  const spotsDisplay = tenant.torrinha_spots
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => s.label || String(s.number))
    .join(", ");

  const t = {
    title: isPt ? "A sua conta" : "Your account",
    tenant: isPt ? "Inquilino" : "Tenant",
    spots: isPt
      ? tenant.torrinha_spots.length > 1 ? "Lugares" : "Lugar"
      : tenant.torrinha_spots.length > 1 ? "Spots" : "Spot",
    rent: isPt ? "Renda mensal" : "Monthly rent",
    since: isPt ? "Inquilino desde" : "Tenant since",
    history: isPt ? "Histórico de pagamentos" : "Payment history",
    summary: isPt ? "Resumo" : "Summary",
    monthsPaidLabel: isPt ? "Meses pagos" : "Months paid",
    totalPaidLabel: isPt ? "Total pago" : "Total paid",
    contact: isPt ? "Questões? Contacte" : "Questions? Contact",
    cMonth: isPt ? "Mês" : "Month",
    cStatus: isPt ? "Estado" : "Status",
    cAmount: isPt ? "Montante" : "Amount",
    cPaid: isPt ? "Pago em" : "Paid on",
    noHistory: isPt ? "Sem registos de pagamento." : "No payment records.",
  };

  const statusLabels = isPt ? STATUS_LABEL_PT : STATUS_LABEL_EN;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Torrinha Parking
          </h1>
          <p className="text-sm text-gray-500">Rua da Torrinha 149, Porto</p>
        </div>

        {/* Account card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t.title}
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {t.tenant}
              </p>
              <p className="text-gray-900 font-medium">{tenant.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {t.spots}
              </p>
              <p className="text-gray-900 font-medium">{spotsDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {t.rent}
              </p>
              <p className="text-gray-900 font-medium">
                €{Number(tenant.rent_eur).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {t.since}
              </p>
              <p className="text-gray-900 font-medium">{tenant.start_date}</p>
            </div>
          </div>
        </div>

        {/* Summary card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t.summary}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {t.monthsPaidLabel}
              </p>
              <p className="text-2xl font-bold text-green-700">{monthsPaid}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {t.totalPaidLabel}
              </p>
              <p className="text-2xl font-bold text-green-700">
                €{totalPaid.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Payment history */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <h2 className="text-lg font-semibold text-gray-900 px-6 pt-6 pb-3">
            {t.history}
          </h2>
          {payments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-400">{t.noHistory}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t.cMonth}
                    </th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t.cStatus}
                    </th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t.cAmount}
                    </th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t.cPaid}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-6 py-3 text-gray-900">
                        {formatMonth(p.month, tenant.language)}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {statusLabels[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        €{Number(p.amount_eur ?? tenant.rent_eur).toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {p.paid_date ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Contact */}
        <p className="text-center text-xs text-gray-400">
          {t.contact}{" "}
          <a
            href="mailto:parking@mail.torrinha149.com"
            className="text-blue-600 hover:underline"
          >
            parking@mail.torrinha149.com
          </a>
        </p>
      </div>
    </div>
  );
}
