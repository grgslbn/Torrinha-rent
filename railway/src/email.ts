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

function isDryRun(): boolean {
  return process.env.EMAIL_DRY_RUN === "true";
}

async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const from = process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com";

  let actualTo = to;
  let actualSubject = subject;
  let actualText = text;

  if (isDryRun()) {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) return { success: false, error: "EMAIL_DRY_RUN is true but OWNER_EMAIL not set" };
    actualTo = ownerEmail;
    actualSubject = `[DRY RUN] ${subject}`;
    actualText = `[This email would have been sent to: ${to}]\n\n${text}`;
    console.log(`[dry-run] Redirecting email from ${to} → ${ownerEmail}`);
  }

  try {
    const { error } = await getResend().emails.send({
      from,
      to: actualTo,
      cc: "georges.lieben@gmail.com",
      subject: actualSubject,
      text: actualText,
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

// --- Thank-you email (sent after payment confirmed) ---

export async function sendThankYouEmail(
  tenant: TenantInfo,
  payment: { month: string; amount_eur: number }
): Promise<{ success: boolean; error?: string }> {
  const monthStr = formatMonth(payment.month, tenant.language);
  const isPt = tenant.language === "pt";

  const subject = isPt
    ? `Torrinha — Pagamento recebido (${monthStr})`
    : `Torrinha — Payment received (${monthStr})`;

  const body = isPt
    ? `Olá ${tenant.name},\n\nConfirmamos a receção do seu pagamento de €${payment.amount_eur} referente a ${monthStr}.\n\nObrigado!\nTorrinha Parking`
    : `Hi ${tenant.name},\n\nWe confirm receipt of your payment of €${payment.amount_eur} for ${monthStr}.\n\nThank you!\nTorrinha Parking`;

  return sendEmail(tenant.email, subject, body);
}

// --- Payment reminder (sent to tenant on 8th) ---

export async function sendReminderEmail(
  tenant: TenantInfo,
  payment: { month: string; amount_eur: number }
): Promise<{ success: boolean; error?: string }> {
  const monthStr = formatMonth(payment.month, tenant.language);
  const isPt = tenant.language === "pt";

  const subject = isPt
    ? `Torrinha — Lembrete de pagamento (${monthStr})`
    : `Torrinha — Payment reminder (${monthStr})`;

  const body = isPt
    ? `Olá ${tenant.name},\n\nEste é um lembrete amigável de que a sua renda de €${payment.amount_eur} referente a ${monthStr} ainda não foi recebida.\n\nPor favor proceda ao pagamento assim que possível.\n\nObrigado!\nTorrinha Parking`
    : `Hi ${tenant.name},\n\nThis is a friendly reminder that your rent of €${payment.amount_eur} for ${monthStr} has not yet been received.\n\nPlease arrange payment at your earliest convenience.\n\nThank you!\nTorrinha Parking`;

  return sendEmail(tenant.email, subject, body);
}

// --- Owner alert: unpaid summary on 5th ---

export async function sendOwnerUnpaidAlert(
  unpaidTenants: { name: string; rent_eur: number; spots: string }[],
  month: string
): Promise<{ success: boolean; error?: string }> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return { success: false, error: "OWNER_EMAIL not set" };

  const monthStr = formatMonth(month, "en");
  const lines = unpaidTenants.map(
    (t) => `  - ${t.name} (${t.spots}) — €${t.rent_eur}`
  );

  const subject = `Torrinha — ${unpaidTenants.length} unpaid for ${monthStr}`;
  const body = `Hi,\n\nThe following tenants have not yet paid for ${monthStr}:\n\n${lines.join("\n")}\n\nTorrinha Parking`;

  return sendEmail(ownerEmail, subject, body);
}

// --- Owner escalation: overdue list on 15th ---

export async function sendOwnerOverdueAlert(
  overdueTenants: { name: string; rent_eur: number; spots: string }[],
  month: string
): Promise<{ success: boolean; error?: string }> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return { success: false, error: "OWNER_EMAIL not set" };

  const monthStr = formatMonth(month, "en");
  const lines = overdueTenants.map(
    (t) => `  - ${t.name} (${t.spots}) — €${t.rent_eur}`
  );

  const subject = `Torrinha — ${overdueTenants.length} OVERDUE for ${monthStr}`;
  const body = `Hi,\n\nThe following tenants are now overdue for ${monthStr}:\n\n${lines.join("\n")}\n\nThese payments have been marked as overdue in the system.\n\nTorrinha Parking`;

  return sendEmail(ownerEmail, subject, body);
}
