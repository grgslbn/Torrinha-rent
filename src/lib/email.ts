import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

type TenantInfo = {
  name: string;
  email: string;
  language: string;
};

type PaymentInfo = {
  id: string;
  month: string;
  amount_eur: number;
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

export async function sendThankYouEmail(
  tenant: TenantInfo,
  payment: PaymentInfo
): Promise<{ success: boolean; error?: string }> {
  const from = process.env.EMAIL_FROM || "noreply@torrinha.com";
  const monthStr = formatMonth(payment.month, tenant.language);

  const isPt = tenant.language === "pt";

  const subject = isPt
    ? `Torrinha — Pagamento recebido (${monthStr})`
    : `Torrinha — Payment received (${monthStr})`;

  const body = isPt
    ? `Olá ${tenant.name},\n\nConfirmamos a receção do seu pagamento de €${payment.amount_eur} referente a ${monthStr}.\n\nObrigado!\nTorrinha Parking`
    : `Hi ${tenant.name},\n\nWe confirm receipt of your payment of €${payment.amount_eur} for ${monthStr}.\n\nThank you!\nTorrinha Parking`;

  try {
    const { error } = await getResend().emails.send({
      from,
      to: tenant.email,
      subject,
      text: body,
    });

    if (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email send exception:", message);
    return { success: false, error: message };
  }
}
