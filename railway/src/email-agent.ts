import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

function supabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonths(count: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

type InboundPayload = {
  from: string;
  from_name?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  message_id?: string;
  in_reply_to?: string;
  references?: string;
};

type ClaudeResponse = {
  classification: string;
  urgency: string;
  confidence: string;
  reasoning: string;
  draft_subject: string;
  draft_body: string;
  suggested_action?: string;
};

export async function processInboundEmail(payload: InboundPayload) {
  const db = supabase();
  const fromEmail = payload.from.toLowerCase().trim();
  const fromName = payload.from_name || fromEmail.split("@")[0];
  const subject = payload.subject || "(no subject)";
  const bodyText = payload.text || "";
  const threadId = payload.in_reply_to || payload.message_id || null;

  // --- Look up sender ---
  // Check tenants first
  const { data: tenantRows } = await db
    .from("torrinha_tenants")
    .select("id, name, email, language, rent_eur, start_date, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label)")
    .ilike("email", fromEmail)
    .limit(1);

  const tenant = tenantRows?.[0] ?? null;

  // If not a tenant, check waitlist
  let waitlistStatus: string | null = null;
  if (!tenant) {
    const { data: waitlistRows } = await db
      .from("torrinha_waitlist")
      .select("status")
      .ilike("email", fromEmail)
      .limit(1);
    waitlistStatus = waitlistRows?.[0]?.status ?? null;
  }

  // --- Fetch context ---
  let senderContext: Record<string, unknown>;

  if (tenant) {
    const month = currentMonthStr();
    const months3 = prevMonths(3);

    const { data: currentPayment } = await db
      .from("torrinha_payments")
      .select("status, amount_eur, paid_date")
      .eq("tenant_id", tenant.id)
      .eq("month", month)
      .limit(1);

    const { data: historyPayments } = await db
      .from("torrinha_payments")
      .select("month, status, amount_eur")
      .eq("tenant_id", tenant.id)
      .in("month", months3)
      .order("month", { ascending: false });

    const spots = (tenant as Record<string, unknown>).torrinha_spots as
      | { number: number; label: string | null }[]
      | undefined;

    senderContext = {
      type: "tenant",
      tenant_name: tenant.name,
      spot_numbers: spots?.map((s) => s.label || s.number) ?? [],
      rent_eur: tenant.rent_eur,
      language: tenant.language,
      current_month_status: currentPayment?.[0]?.status ?? null,
      paid_date: currentPayment?.[0]?.paid_date ?? null,
      last_3_months: historyPayments ?? [],
    };
  } else {
    // Count available spots
    const { data: vacantSpots } = await db
      .from("torrinha_spots")
      .select("id")
      .is("tenant_id", null);
    const available = (vacantSpots ?? []).filter(
      (s) => !(s as Record<string, unknown>).label || (s as Record<string, unknown>).label !== "Owner"
    ).length;

    senderContext = {
      type: waitlistStatus ? "waitlist" : "unknown",
      tenant_name: null,
      spot_numbers: null,
      rent_eur: null,
      language: null,
      current_month_status: null,
      paid_date: null,
      last_3_months: null,
      waitlist_status: waitlistStatus,
    };

    // Add parking info for prospects
    (senderContext as Record<string, unknown>).parking_info = {
      location: "Rua da Torrinha 149, Porto",
      available_spots: available,
      price_range: "€40 - €260/month depending on spot",
      waitlist_url: "https://torrinha149.com",
    };
  }

  // --- Call Claude ---
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an email assistant for Torrinha Parking, a small private parking facility at Rua da Torrinha 149, Porto, Portugal. The owner is Georges.

Your job is to:
1. Classify the intent of the inbound email
2. Draft a warm, professional reply in the correct language
3. Use the tenant context provided to make the reply specific and accurate

Classification options:
  payment_query    — asking about their payment status
  payment_promise  — promising to pay soon
  complaint        — unhappy about something
  remote_issue     — problem with remote control
  waitlist_enquiry — prospective tenant asking about availability
  other            — anything else

Urgency options:
  normal           — standard reply, no rush
  needs_attention  — owner should be aware
  urgent           — owner must act soon

Tone: friendly, warm, concise. This is a small community of friends-of-friends.
Never be cold or corporate. Sign off as 'Torrinha Parking'.

Language: reply in the tenant's preferred language (pt or en).
If sender is unknown, reply in the language they wrote in.

Return ONLY valid JSON — no prose, no markdown.`;

  const userPrompt = `Inbound email:
From: ${fromName} <${fromEmail}>
Subject: ${subject}
Body: ${bodyText}

Sender context:
${JSON.stringify(senderContext, null, 2)}`;

  let claudeResult: ClaudeResponse;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    claudeResult = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[email-agent] Claude API or parse error:", err);
    // Store with fallback values
    claudeResult = {
      classification: "other",
      urgency: "needs_attention",
      confidence: "low",
      reasoning: `Claude processing failed: ${err instanceof Error ? err.message : "unknown error"}. Raw email stored for manual review.`,
      draft_subject: `Re: ${subject}`,
      draft_body: "",
    };
  }

  // Detect language for draft
  const draftLanguage = tenant?.language ?? (bodyText.match(/[àáâãçéêíóôõú]/i) ? "pt" : "en");

  // --- Store in torrinha_inbox ---
  const { data: inboxRow, error: insertError } = await db
    .from("torrinha_inbox")
    .insert({
      received_at: new Date().toISOString(),
      from_email: fromEmail,
      from_name: fromName,
      subject,
      body_text: bodyText,
      thread_id: threadId,
      tenant_id: tenant?.id ?? null,
      classification: claudeResult.classification,
      urgency: claudeResult.urgency,
      draft_subject: claudeResult.draft_subject,
      draft_body: claudeResult.draft_body,
      draft_language: draftLanguage,
      confidence: claudeResult.confidence,
      claude_reasoning: claudeResult.reasoning,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[email-agent] Insert error:", insertError);
    throw insertError;
  }

  // --- If urgent, email owner immediately ---
  if (claudeResult.urgency === "urgent") {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      await resend.emails.send({
        from: process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com",
        to: ownerEmail,
        cc: "georges.lieben@gmail.com",
        subject: `[URGENT] Torrinha inbox: ${subject}`,
        text: `Urgent email from ${fromName} <${fromEmail}>:\n\n${bodyText}\n\n---\nClassification: ${claudeResult.classification}\nReasoning: ${claudeResult.reasoning}`,
      });
    }
  }

  console.log(`[email-agent] Processed: ${fromEmail} → ${claudeResult.classification} (${claudeResult.urgency})`);
  return inboxRow;
}
