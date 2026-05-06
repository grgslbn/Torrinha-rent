import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// --- Types ---

export type TenantEmailContext = {
  tenant_name: string;
  language: string;
  spot_numbers: string;
  current_month: string;
  amount_owed: number;
  months_since_start: number;
  payment_history: {
    month: string;
    status: string;
    paid_date: string | null;
    days_late: number | null;
  }[];
  on_time_rate: string;
  consecutive_late: number;
  recent_emails: {
    date: string;
    direction: string;
    template: string | null;
    subject: string;
    body_preview: string;
  }[];
  context_entries: {
    type: string;
    title: string;
    content: string;
  }[];
  tenant_notes: string | null;
  licence_plates: string[];
  portal_url: string;
};

// --- System prompt ---

const SYSTEM_PROMPT = `You are the email assistant for Torrinha Parking, a small parking garage in Porto managed by Georges. You write payment-related emails to tenants on behalf of the system.

RULES:
- Write in the tenant's preferred language (as specified in the context).
- Keep emails short — 3–6 sentences max. These are parking rent emails, not novels.
- Be warm and human. Many tenants are friends or friends-of-friends. This is not a corporate parking garage.
- Never be threatening or legalistic. The strongest tone is "firm but friendly."
- Always include the portal link so they can check their own status.
- Sign off as "Torrinha Parking" (not Georges, not "the management").

TONE CALIBRATION:
- If the tenant has a strong payment track record (>80% on time) and this is a first late payment: very light, almost casual. "Just a heads-up" energy.
- If they've been late 2–3 months in a row: still friendly but clearer. Mention the amount and ask them to get in touch if there's an issue.
- If they've been late 4+ months: concerned, not angry. Ask if everything is okay. Suggest they reach out.
- If the owner's context says "close friend" or "family": extra warmth, first-name basis.
- If there's a verbal agreement (e.g., quarterly payments): reference it naturally.

WHAT NOT TO DO:
- Don't repeat the exact same phrasing as the previous email (you'll see recent emails in the context).
- Don't mention other tenants' payment behaviour.
- Don't make up facts — only reference information from the context provided.
- Don't include legal threats or mention contract termination.

EMAIL TYPES:
- thank-you: Confirm receipt of payment. Brief and warm. Mention the amount and month.
- reminder: Gentle nudge that payment hasn't been received yet. Include the portal link.

Return ONLY the email body. No subject line. Plain text, no markdown.`;

// --- Context assembly ---

export async function assembleTenantContext(
  tenantId: string,
  month: string
): Promise<TenantEmailContext> {
  const db = supabase();

  // Fetch tenant base info
  const { data: tenant } = await db
    .from("torrinha_tenants")
    .select("name, language, start_date, notes, licence_plates, access_token, torrinha_spots(number, label)")
    .eq("id", tenantId)
    .single();

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  // Spot labels
  const spots = (tenant.torrinha_spots as { number: number; label: string | null }[] | null) ?? [];
  const spotNumbers = spots.map((s) => s.label || String(s.number)).join(", ") || "—";

  // Months since start
  const start = new Date(tenant.start_date);
  const now = new Date();
  const monthsSinceStart =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  // Payment history (last 6 months)
  const sixMonths: string[] = [];
  const [yr, mo] = month.split("-").map(Number);
  for (let i = 0; i < 6; i++) {
    const d = new Date(yr, mo - 1 - i, 1);
    sixMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const { data: payments } = await db
    .from("torrinha_payments")
    .select("month, status, paid_date, amount_eur, torrinha_tenants(payment_due_day)")
    .eq("tenant_id", tenantId)
    .in("month", sixMonths)
    .order("month", { ascending: false });

  const paymentHistory = (payments ?? []).map((p) => {
    let daysLate: number | null = null;
    if (p.paid_date && p.status === "paid") {
      const tenantRow = Array.isArray(p.torrinha_tenants) ? p.torrinha_tenants[0] : p.torrinha_tenants;
      const dueDay = (tenantRow as { payment_due_day: number } | null)?.payment_due_day ?? 1;
      const [py, pm] = p.month.split("-").map(Number);
      const dueDate = new Date(py, pm - 1, dueDay);
      const paidDate = new Date(p.paid_date);
      daysLate = Math.max(0, Math.floor((paidDate.getTime() - dueDate.getTime()) / 86400000));
    }
    return {
      month: p.month,
      status: p.status,
      paid_date: p.paid_date ?? null,
      days_late: daysLate,
    };
  });

  // On-time rate
  const paidOnTime = paymentHistory.filter(
    (p) => p.status === "paid" && (p.days_late === null || p.days_late <= 3)
  ).length;
  const totalPaid = paymentHistory.filter((p) => p.status === "paid").length;
  const onTimeRate = paymentHistory.length > 0
    ? `${paidOnTime}/${paymentHistory.length} months`
    : "no history";

  // Consecutive late (count unpaid months going backwards from current)
  let consecutiveLate = 0;
  for (const p of paymentHistory) {
    if (p.status !== "paid") consecutiveLate++;
    else break;
  }

  // Recent emails (last 5 for this tenant)
  const { data: emailLog } = await db
    .from("torrinha_email_log")
    .select("direction, template, subject, body, sent_at")
    .eq("tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(5);

  const recentEmails = (emailLog ?? []).map((e) => ({
    date: e.sent_at.split("T")[0],
    direction: e.direction,
    template: e.template ?? null,
    subject: e.subject,
    body_preview: e.body.slice(0, 200),
  }));

  // Owner-provided context entries
  const { data: contextRows } = await db
    .from("torrinha_tenant_context")
    .select("type, title, content")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const contextEntries = (contextRows ?? []).map((c) => ({
    type: c.type,
    title: c.title,
    content: c.content,
  }));

  // Portal URL
  const portalUrl = tenant.access_token
    ? `${process.env.NEXT_PUBLIC_BASE_URL || "https://torrinha149.com"}/tenant/${tenant.access_token}`
    : "";

  // Current month payment amount
  const currentPayment = payments?.find((p) => p.month === month);
  const amountOwed = currentPayment ? Number(currentPayment.amount_eur) : 0;

  return {
    tenant_name: tenant.name,
    language: tenant.language,
    spot_numbers: spotNumbers,
    current_month: month,
    amount_owed: amountOwed,
    months_since_start: monthsSinceStart,
    payment_history: paymentHistory,
    on_time_rate: onTimeRate,
    consecutive_late: consecutiveLate,
    recent_emails: recentEmails,
    context_entries: contextEntries,
    tenant_notes: tenant.notes ?? null,
    licence_plates: (tenant.licence_plates as string[] | null) ?? [],
    portal_url: portalUrl,
  };
}

// --- Generate personalised email body ---

export async function generatePersonalisedEmail(
  templateType: "thank-you" | "reminder",
  context: TenantEmailContext
): Promise<string> {
  const anthropic = new Anthropic();

  const historyLines = context.payment_history
    .map((p) => `  ${p.month}: ${p.status}${p.paid_date ? ` (paid ${p.paid_date}${p.days_late ? `, ${p.days_late}d late` : ""})` : ""}`)
    .join("\n");

  const recentEmailLines = context.recent_emails
    .map((e) => `  ${e.date} [${e.direction}] ${e.template ? `(${e.template}) ` : ""}${e.subject}\n  ${e.body_preview}`)
    .join("\n\n");

  const contextLines = context.context_entries
    .map((c) => `  [${c.type}] ${c.title}:\n  ${c.content}`)
    .join("\n\n");

  const userPrompt = `Template type: ${templateType}
Tenant: ${context.tenant_name}
Language: ${context.language}
Spot(s): ${context.spot_numbers}
Amount: €${context.amount_owed}
Month: ${context.current_month}
Months as tenant: ${context.months_since_start}
Portal: ${context.portal_url}

Payment history (last 6 months):
${historyLines || "  No history"}

On-time rate: ${context.on_time_rate}
Consecutive months unpaid: ${context.consecutive_late}

Recent emails:
${recentEmailLines || "  None"}

Owner context:
${contextLines || "  None"}

Operational notes: ${context.tenant_notes || "none"}
Licence plates: ${context.licence_plates.length ? context.licence_plates.join(", ") : "none"}

Write the email body now.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text.trim() : "";
}
