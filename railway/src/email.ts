import { randomBytes } from "crypto";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { assembleTenantContext, generatePersonalisedEmail } from "./email-personalise";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

function supabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// --- Owner CC settings (5-min TTL cache) ---

type CcConfig = { enabled: boolean; email: string; mode: "cc" | "bcc" };
type CcSettings = { cc1: CcConfig; cc2: CcConfig };
let _ccSettings: CcSettings | null = null;
let _ccSettingsFetchedAt = 0;
const CC_TTL = 5 * 60 * 1000;

const CC_FALLBACK: CcSettings = {
  cc1: { enabled: false, email: "", mode: "bcc" },
  cc2: { enabled: false, email: "", mode: "bcc" },
};

async function getOwnerCcSettings(): Promise<CcSettings> {
  const now = Date.now();
  if (_ccSettings && now - _ccSettingsFetchedAt < CC_TTL) return _ccSettings;

  try {
    const { data } = await supabase()
      .from("torrinha_settings")
      .select("key, value")
      .in("key", ["owner_cc_enabled", "owner_cc_email", "owner_cc_mode", "owner_cc2_enabled", "owner_cc2_email", "owner_cc2_mode"]);

    const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    _ccSettings = {
      cc1: {
        enabled: map.owner_cc_enabled === true,
        email: typeof map.owner_cc_email === "string" ? map.owner_cc_email : "",
        mode: map.owner_cc_mode === "cc" ? "cc" : "bcc",
      },
      cc2: {
        enabled: map.owner_cc2_enabled === true,
        email: typeof map.owner_cc2_email === "string" ? map.owner_cc2_email : "",
        mode: map.owner_cc2_mode === "cc" ? "cc" : "bcc",
      },
    };
  } catch {
    if (!_ccSettings) _ccSettings = CC_FALLBACK;
  }

  _ccSettingsFetchedAt = now;
  return _ccSettings!;
}

export type TenantInfo = {
  id: string;
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

// --- Fetch template from DB with hardcoded fallback ---

async function getTemplate(
  key: string
): Promise<{ subject: string; body: string } | null> {
  try {
    const { data } = await supabase()
      .from("torrinha_email_templates")
      .select("subject, body")
      .eq("key", key)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

function applyPlaceholders(
  text: string,
  vars: Record<string, string>
): string {
  let result = text;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return result;
}

// --- Log email to DB (best-effort, never throws) ---

async function logEmail(opts: {
  tenant_id: string | null;
  direction: "outbound" | "inbound";
  template: string | null;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  status?: string;
  approval_token?: string | null;
}): Promise<void> {
  try {
    await supabase().from("torrinha_email_log").insert({
      tenant_id: opts.tenant_id,
      direction: opts.direction,
      template: opts.template,
      to_email: opts.to_email,
      from_email: opts.from_email,
      subject: opts.subject,
      body: opts.body,
      metadata: opts.metadata ?? null,
      ...(opts.status !== undefined ? { status: opts.status } : {}),
      ...(opts.approval_token !== undefined ? { approval_token: opts.approval_token } : {}),
    });
  } catch (err) {
    console.error("[email-log] Failed to log email:", err);
  }
}

export { logEmail };

// --- Send email (shared) ---

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

  let actualTo = to;
  let actualSubject = subject;
  let actualText = text;
  let approvalToken: string | null = null;

  const dryRun = isDryRun();
  if (dryRun) {
    if (!ownerEmail) return { success: false, error: "EMAIL_DRY_RUN is true but OWNER_EMAIL not set" };
    approvalToken = randomBytes(24).toString("hex");
    const approvalUrl = `https://torrinha149.com/api/email-approve?token=${approvalToken}`;
    actualTo = ownerEmail;
    actualSubject = `[DRY RUN] ${subject}`;
    actualText = `[This email would have been sent to: ${to}]\n[✅ Click to approve and send → ${approvalUrl}]\n\n${text}`;
    console.log(`[dry-run] Redirecting email from ${to} → ${ownerEmail}`);
  }

  const ccSettings = await getOwnerCcSettings();
  const isOwnerEmail = ownerEmail && actualTo === ownerEmail;

  // Skip extraCc during dry run — contacts shouldn't receive the test copy
  const cc1Addrs = dryRun
    ? (!isOwnerEmail && ccSettings.cc1.enabled && ccSettings.cc1.email ? [ccSettings.cc1.email] : [])
    : [
        ...(!isOwnerEmail && ccSettings.cc1.enabled && ccSettings.cc1.email ? [ccSettings.cc1.email] : []),
        ...(options?.extraCc ?? []),
      ].filter(Boolean);
  const cc2Addrs = !isOwnerEmail && ccSettings.cc2.enabled && ccSettings.cc2.email
    ? [ccSettings.cc2.email]
    : [];

  const ccArr: string[] = [];
  const bccArr: string[] = [];
  if (cc1Addrs.length > 0) {
    if (ccSettings.cc1.mode === "cc") ccArr.push(...cc1Addrs);
    else bccArr.push(...cc1Addrs);
  }
  if (cc2Addrs.length > 0) {
    if (ccSettings.cc2.mode === "cc") ccArr.push(...cc2Addrs);
    else bccArr.push(...cc2Addrs);
  }

  const ccPayload = {
    ...(ccArr.length > 0 ? { cc: ccArr } : {}),
    ...(bccArr.length > 0 ? { bcc: bccArr } : {}),
  };

  try {
    const { error } = await getResend().emails.send({
      from,
      to: actualTo,
      ...ccPayload,
      subject: actualSubject,
      text: actualText,
    });
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
      metadata: {
        ...(options?.metadata ?? {}),
        ...(dryRun ? { dry_run: true, redirected_to: actualTo, cc_addresses: options?.extraCc ?? [] } : {}),
      },
      ...(dryRun ? { status: "dry_run", approval_token: approvalToken } : { status: "sent" }),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email send exception:", message);
    return { success: false, error: message };
  }
}

// --- Personalised email helpers ---

function staticThankYouBody(tenant: TenantInfo, amount: number, monthStr: string): string {
  return tenant.language === "pt"
    ? `Olá ${tenant.name},\n\nConfirmamos a receção do seu pagamento de €${amount} referente a ${monthStr}.\n\nObrigado!\nTorrinha Parking`
    : `Hi ${tenant.name},\n\nWe confirm receipt of your payment of €${amount} for ${monthStr}.\n\nThank you!\nTorrinha Parking`;
}

function staticReminderBody(tenant: TenantInfo, amount: number, monthStr: string): string {
  return tenant.language === "pt"
    ? `Olá ${tenant.name},\n\nEste é um lembrete amigável de que a sua renda de €${amount} referente a ${monthStr} ainda não foi recebida.\n\nPor favor proceda ao pagamento assim que possível.\n\nObrigado!\nTorrinha Parking`
    : `Hi ${tenant.name},\n\nThis is a friendly reminder that your rent of €${amount} for ${monthStr} has not yet been received.\n\nPlease arrange payment at your earliest convenience.\n\nThank you!\nTorrinha Parking`;
}

// --- Thank-you email ---

export async function sendThankYouEmail(
  tenant: TenantInfo,
  payment: { month: string; amount_eur: number },
  extraCc?: string[]
): Promise<{ success: boolean; error?: string }> {
  const isPt = tenant.language === "pt";
  const monthStr = formatMonth(payment.month, tenant.language);

  const subject = isPt
    ? `Torrinha — Pagamento recebido (${monthStr})`
    : `Torrinha — Payment received (${monthStr})`;

  let body: string;
  let personalised = false;

  try {
    const context = await assembleTenantContext(tenant.id, payment.month);
    body = await generatePersonalisedEmail("thank-you", context);
    personalised = true;
  } catch (err) {
    console.error("[email] LLM personalisation failed, falling back to static template:", err);
    const tpl = await getTemplate(isPt ? "payment_thankyou_pt" : "payment_thankyou_en");
    const vars = { tenant_name: tenant.name, amount: String(payment.amount_eur), month: monthStr };
    body = tpl
      ? applyPlaceholders(tpl.body, vars)
      : staticThankYouBody(tenant, payment.amount_eur, monthStr);
  }

  return sendEmail(tenant.email, subject, body, {
    extraCc,
    tenant_id: tenant.id,
    template: "thank-you",
    metadata: { month: payment.month, amount: payment.amount_eur, personalised },
  });
}

// --- Payment reminder ---

export async function sendReminderEmail(
  tenant: TenantInfo,
  payment: { month: string; amount_eur: number },
  extraCc?: string[]
): Promise<{ success: boolean; error?: string }> {
  const isPt = tenant.language === "pt";
  const monthStr = formatMonth(payment.month, tenant.language);

  const subject = isPt
    ? `Torrinha — Lembrete de pagamento (${monthStr})`
    : `Torrinha — Payment reminder (${monthStr})`;

  let body: string;
  let personalised = false;

  try {
    const context = await assembleTenantContext(tenant.id, payment.month);
    body = await generatePersonalisedEmail("reminder", context);
    personalised = true;
  } catch (err) {
    console.error("[email] LLM personalisation failed, falling back to static template:", err);
    const tpl = await getTemplate(isPt ? "payment_reminder_pt" : "payment_reminder_en");
    const vars = { tenant_name: tenant.name, amount: String(payment.amount_eur), month: monthStr };
    body = tpl
      ? applyPlaceholders(tpl.body, vars)
      : staticReminderBody(tenant, payment.amount_eur, monthStr);
  }

  return sendEmail(tenant.email, subject, body, {
    extraCc,
    tenant_id: tenant.id,
    template: "reminder",
    metadata: { month: payment.month, amount: payment.amount_eur, personalised },
  });
}

// --- Owner alert: unpaid ---

export async function sendOwnerUnpaidAlert(
  unpaidTenants: { name: string; rent_eur: number; spots: string }[],
  month: string
): Promise<{ success: boolean; error?: string }> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return { success: false, error: "OWNER_EMAIL not set" };

  const monthStr = formatMonth(month, "en");
  const tenantList = unpaidTenants.map((t) => `  - ${t.name} (${t.spots}) — €${t.rent_eur}`).join("\n");
  const vars = { month: monthStr, count: String(unpaidTenants.length), tenant_list: tenantList };

  const tpl = await getTemplate("owner_alert_unpaid");

  const subject = tpl
    ? applyPlaceholders(tpl.subject, vars)
    : `Torrinha — ${unpaidTenants.length} unpaid for ${monthStr}`;

  const body = tpl
    ? applyPlaceholders(tpl.body, vars)
    : `Hi,\n\nThe following tenants have not yet paid for ${monthStr}:\n\n${tenantList}\n\nTorrinha Parking`;

  return sendEmail(ownerEmail, subject, body, {
    template: "owner-unpaid",
    metadata: { month, count: unpaidTenants.length },
  });
}

// --- Owner alert: overdue ---

export async function sendOwnerOverdueAlert(
  overdueTenants: { name: string; rent_eur: number; spots: string }[],
  month: string
): Promise<{ success: boolean; error?: string }> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return { success: false, error: "OWNER_EMAIL not set" };

  const monthStr = formatMonth(month, "en");
  const tenantList = overdueTenants.map((t) => `  - ${t.name} (${t.spots}) — €${t.rent_eur}`).join("\n");
  const vars = { month: monthStr, count: String(overdueTenants.length), tenant_list: tenantList };

  const tpl = await getTemplate("owner_alert_overdue");

  const subject = tpl
    ? applyPlaceholders(tpl.subject, vars)
    : `Torrinha — ${overdueTenants.length} OVERDUE for ${monthStr}`;

  const body = tpl
    ? applyPlaceholders(tpl.body, vars)
    : `Hi,\n\nThe following tenants are now overdue for ${monthStr}:\n\n${tenantList}\n\nThese payments have been marked as overdue in the system.\n\nTorrinha Parking`;

  return sendEmail(ownerEmail, subject, body, {
    template: "owner-overdue",
    metadata: { month, count: overdueTenants.length },
  });
}
