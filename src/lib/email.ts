import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// --- Types ---

export type EmailTemplate =
  | "thank-you"
  | "reminder"
  | "owner-unpaid"
  | "owner-overdue"
  | "waitlist-confirmation";

// --- Helpers ---

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

// --- Owner CC settings (fetched per-request, no cache needed server-side) ---

async function getOwnerCcSettings() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("torrinha_settings")
      .select("key, value")
      .in("key", ["owner_cc_enabled", "owner_cc_email", "owner_cc_mode"]);

    const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    return {
      enabled: map.owner_cc_enabled === true,
      email: typeof map.owner_cc_email === "string" ? map.owner_cc_email : "",
      mode: map.owner_cc_mode === "cc" ? ("cc" as const) : ("bcc" as const),
    };
  } catch {
    return { enabled: false, email: "", mode: "bcc" as const };
  }
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// --- Log email (best-effort, never throws) ---

async function logEmail(opts: {
  tenant_id: string | null;
  direction: "outbound" | "inbound";
  template: string | null;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("torrinha_email_log").insert({
      tenant_id: opts.tenant_id,
      direction: opts.direction,
      template: opts.template,
      to_email: opts.to_email,
      from_email: opts.from_email,
      subject: opts.subject,
      body: opts.body,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    console.error("[email-log] Failed to log email:", err);
  }
}

// --- Generate email content (used for preview + sending) ---

export function generateEmail(
  template: EmailTemplate,
  language: string,
  data?: {
    tenant_name?: string;
    amount?: number;
    month?: string;
    spot?: string;
    unpaid_tenants?: { name: string; spots: string; rent_eur: number }[];
    waitlist_name?: string;
  }
): { subject: string; body: string } {
  const lang = language === "pt" ? "pt" : "en";
  const isPt = lang === "pt";
  const month = data?.month || currentMonthStr();
  const monthStr = formatMonth(month, lang);
  const name = data?.tenant_name || "Tenant";
  const amount = data?.amount ?? 0;

  switch (template) {
    case "thank-you": {
      const subject = isPt
        ? `Torrinha — Pagamento recebido (${monthStr})`
        : `Torrinha — Payment received (${monthStr})`;
      const body = isPt
        ? `Olá ${name},\n\nConfirmamos a receção do seu pagamento de €${amount} referente a ${monthStr}.\n\nObrigado!\nTorrinha Parking`
        : `Hi ${name},\n\nWe confirm receipt of your payment of €${amount} for ${monthStr}.\n\nThank you!\nTorrinha Parking`;
      return { subject, body };
    }

    case "reminder": {
      const subject = isPt
        ? `Torrinha — Lembrete de pagamento (${monthStr})`
        : `Torrinha — Payment reminder (${monthStr})`;
      const body = isPt
        ? `Olá ${name},\n\nEste é um lembrete amigável de que a sua renda de €${amount} referente a ${monthStr} ainda não foi recebida.\n\nPor favor proceda ao pagamento assim que possível.\n\nObrigado!\nTorrinha Parking`
        : `Hi ${name},\n\nThis is a friendly reminder that your rent of €${amount} for ${monthStr} has not yet been received.\n\nPlease arrange payment at your earliest convenience.\n\nThank you!\nTorrinha Parking`;
      return { subject, body };
    }

    case "owner-unpaid": {
      const tenants = data?.unpaid_tenants ?? [];
      const lines = tenants.map(
        (t) => `  - ${t.name} (${t.spots}) — €${t.rent_eur}`
      );
      const subject = `Torrinha — ${tenants.length} unpaid for ${monthStr}`;
      const body = `Hi,\n\nThe following tenants have not yet paid for ${monthStr}:\n\n${lines.join("\n")}\n\nTorrinha Parking`;
      return { subject, body };
    }

    case "owner-overdue": {
      const tenants = data?.unpaid_tenants ?? [];
      const lines = tenants.map(
        (t) => `  - ${t.name} (${t.spots}) — €${t.rent_eur}`
      );
      const subject = `Torrinha — ${tenants.length} OVERDUE for ${monthStr}`;
      const body = `Hi,\n\nThe following tenants are now overdue for ${monthStr}:\n\n${lines.join("\n")}\n\nThese payments have been marked as overdue in the system.\n\nTorrinha Parking`;
      return { subject, body };
    }

    case "waitlist-confirmation": {
      const wName = data?.waitlist_name || data?.tenant_name || name;
      const subject = isPt
        ? `Torrinha — Inscrição na lista de espera confirmada`
        : `Torrinha — Waitlist registration confirmed`;
      const body = isPt
        ? `Olá ${wName},\n\nA sua inscrição na lista de espera do Torrinha Parking foi registada com sucesso.\n\nEntraremos em contacto assim que houver um lugar disponível.\n\nObrigado!\nTorrinha Parking`
        : `Hi ${wName},\n\nYour registration on the Torrinha Parking waitlist has been confirmed.\n\nWe will contact you as soon as a spot becomes available.\n\nThank you!\nTorrinha Parking`;
      return { subject, body };
    }

    default:
      return { subject: "Unknown template", body: "" };
  }
}

// --- Send email ---

type SendOptions = {
  extraCc?: string[];
  tenant_id?: string;
  template?: string;
  metadata?: Record<string, unknown>;
};

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  options?: SendOptions
): Promise<{ success: boolean; error?: string }> {
  const from = process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com";
  const ownerEmail = process.env.OWNER_EMAIL;

  const ccSettings = await getOwnerCcSettings();
  const isOwnerEmail = ownerEmail && to === ownerEmail;
  const ccAddresses = [
    ...(!isOwnerEmail && ccSettings.enabled && ccSettings.email ? [ccSettings.email] : []),
    ...(options?.extraCc ?? []),
  ].filter(Boolean);

  const ccPayload =
    ccAddresses.length > 0
      ? ccSettings.mode === "cc"
        ? { cc: ccAddresses }
        : { bcc: ccAddresses }
      : {};

  try {
    const { error } = await getResend().emails.send({ from, to, ...ccPayload, subject, text });
    if (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }

    await logEmail({
      tenant_id: options?.tenant_id ?? null,
      direction: "outbound",
      template: options?.template ?? null,
      to_email: to,
      from_email: from,
      subject,
      body: text,
      metadata: options?.metadata ?? null,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email send exception:", message);
    return { success: false, error: message };
  }
}

// --- Public API ---

export async function sendThankYouEmail(
  tenant: { id?: string; name: string; email: string; language: string },
  payment: { id: string; month: string; amount_eur: number },
  extraCc?: string[]
): Promise<{ success: boolean; error?: string }> {
  const { subject, body } = generateEmail("thank-you", tenant.language, {
    tenant_name: tenant.name,
    amount: payment.amount_eur,
    month: payment.month,
  });
  return sendEmail(tenant.email, subject, body, {
    extraCc,
    tenant_id: tenant.id,
    template: "thank-you",
    metadata: { month: payment.month, amount: payment.amount_eur, payment_id: payment.id },
  });
}

export async function sendGeneratedEmail(
  to: string,
  template: EmailTemplate,
  language: string,
  data?: Parameters<typeof generateEmail>[2],
  extraCc?: string[]
): Promise<{ success: boolean; error?: string }> {
  const { subject, body } = generateEmail(template, language, data);
  return sendEmail(to, subject, body, { extraCc, template });
}
