import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// --- Parking info (update here when pricing or conditions change) ---

const PARKING_INFO = {
  location: "Rua da Torrinha 149, Porto",
  description: "Private, covered, numbered parking spots",
  price: "€120/month per car",
  remote_deposit: "€50 deposit for remote control access to garage",
  access: "Available 24/7, exclusive access for tenants only",
  official: "Official and insured spots",
  terms: "Long-term rental only — 30 days notice required from both parties",
  payment_methods: "MBWay or monthly bank transfer (IBAN)",
  current_availability: "All spots are currently occupied — prospects should join the waiting list",
  waitlist_url: "https://torrinha149.com",
};

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

type ClaudeResponse = {
  classification: string;
  urgency: string;
  confidence: string;
  reasoning: string;
  draft_subject: string;
  draft_body: string;
  suggested_action?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processInboundEmail(payload: any) {
  // Extract fields — handle both { data: { ... } } wrapper and flat shapes
  const data = payload.data || payload;
  const fromRaw: string = data.from || payload.from || "";
  const subject: string = data.subject || payload.subject || "(no subject)";
  const threadId: string = data.threadId || data.thread_id || data.in_reply_to || payload.in_reply_to || payload.message_id || "";
  const emailId: string = data.email_id || data.id || payload.email_id || payload.id || "";

  // Parse "Name <email>" format
  const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
  const fromName = fromMatch ? fromMatch[1].trim() : (payload.from_name || fromRaw.split("@")[0]);
  const fromEmail = (fromMatch ? fromMatch[2].trim() : fromRaw).toLowerCase().trim();

  // Resend inbound webhooks do NOT include the email body.
  // Fetch the full email content from the Resend API.
  let bodyText = "";
  if (emailId) {
    try {
      const emailRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (emailRes.ok) {
        const fullEmail = await emailRes.json() as Record<string, unknown>;
        bodyText = (fullEmail.text as string) || (fullEmail.html as string) || "";
      } else {
        console.error("[email-agent] Failed to fetch email from Resend API:", emailRes.status);
      }
    } catch (err) {
      console.error("[email-agent] Error fetching email from Resend API:", err);
    }
  }

  // Fallback: try reading body from webhook payload directly (in case Resend changes behaviour)
  if (!bodyText) {
    bodyText = data.text || data.html || payload.text || payload.html || "";
  }

  console.log("[email-agent] Processing:", { fromEmail, subject, bodyLength: bodyText.length });

  const db = supabase();

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
    (senderContext as Record<string, unknown>).parking_info = PARKING_INFO;
  }

  // --- Call Claude ---
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an email assistant for Torrinha Parking, a small private parking facility in Porto, Portugal. The owners are Dulcineia & Georges.

Your job is to:
1. Classify the intent of the inbound email
2. Draft a warm, professional reply in the correct language
3. Use the tenant context provided to make the reply specific and accurate

PARKING INFO (use when replying to availability, pricing, or conditions questions):
- Private, covered, numbered parking spots at Rua da Torrinha 149, Porto
- Price: €120/month per car
- Remote control access to garage (€50 deposit)
- Available 24/7, exclusive access for tenants only
- Official and insured spots
- Long-term rental only — 30 days notice required from both parties
- Payment via MBWay or monthly bank transfer (IBAN)
- Currently all spots are occupied — prospects should join the waiting list
- Waiting list URL: https://torrinha149.com

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
Never be cold or corporate. Sign off as 'Dulcineia & Georges'.

Language: reply in the tenant's preferred language (pt or en).
If sender is unknown, reply in the language they wrote in.

When replying to a waitlist enquiry or pricing question:
- Share the relevant parking info warmly and concisely
- Mention that all spots are currently occupied
- Invite them to join the waiting list at https://torrinha149.com
- If they are already on the waiting list, acknowledge it and thank them for their patience

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
