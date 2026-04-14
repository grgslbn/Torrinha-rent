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

  // Parse "Name <email>" format
  const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
  const fromName = fromMatch ? fromMatch[1].trim() : (payload.from_name || fromRaw.split("@")[0]);
  const fromEmail = (fromMatch ? fromMatch[2].trim() : fromRaw).toLowerCase().trim();

  // Resend inbound webhooks do NOT include the email body (text/html fields
  // are not present). The /emails/{id} API only works for outbound emails.
  // We classify and draft replies based on subject + sender context only.
  const bodyText: string = data.text || data.html || payload.text || payload.html || "";

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
3. Use the sender context provided to make the reply specific and accurate

IMPORTANT: The email body may be empty — Resend inbound webhooks often only
provide the subject line. You MUST classify and draft a reply based on the
subject line and sender context alone. This is normal and expected.

Classification logic:
- Subject mentions "parking", "space", "spot", "available", "estacionamento",
  "lugar", "vaga", "price", "preço", OR sender is unknown/waitlist
  → classify as waitlist_enquiry
- Sender is a known tenant and subject mentions "payment", "paid", "transfer",
  "pagamento", "pago", "transferência"
  → classify as payment_query
- Sender is a known tenant and subject mentions "will pay", "friday", "soon",
  "vou pagar", "sexta"
  → classify as payment_promise
- Subject mentions "remote", "control", "comando", "broken", "avariado"
  → classify as remote_issue
- Subject mentions "problem", "issue", "complaint", "problema", "reclamação"
  → classify as complaint
- Otherwise → classify as other

PARKING INFO (use when replying to waitlist_enquiry):
- Private, covered, numbered parking spots at Rua da Torrinha 149, Porto
- Price: €120/month per car
- Remote control access to garage (€50 deposit)
- Available 24/7, exclusive access for tenants only
- Official and insured spots
- Long-term rental only — 30 days notice required from both parties
- Payment via MBWay or monthly bank transfer (IBAN)
- Currently all spots are currently occupied
- Waiting list: https://torrinha149.com

Urgency options:
  normal           — standard reply, no rush
  needs_attention  — owner should be aware
  urgent           — owner must act soon

Tone: friendly, warm, concise. This is a small community of friends-of-friends.
Never be cold or corporate. Sign off as 'Dulcineia & Georges'.

Language: reply in the tenant's preferred language (pt or en).
If sender is unknown, guess language from subject line. If ambiguous, use Portuguese.

When replying to a waitlist enquiry or pricing question:
- Share the parking info warmly and concisely
- Mention that all spots are currently occupied
- Invite them to join the waiting list at https://torrinha149.com
- If they are already on the waiting list, acknowledge it and thank them

When replying to a known tenant about payments:
- Check their payment context and reply with their current status
- Be specific: mention the month, amount, and whether it's paid/pending/overdue

Return ONLY valid JSON — no prose, no markdown.`;

  const userPrompt = `Inbound email:
From: ${fromName} <${fromEmail}>
Subject: ${subject}
Body: ${bodyText || "(not available — classify based on subject and sender context)"}

Sender context:
${JSON.stringify(senderContext, null, 2)}`;

  let claudeResult: ClaudeResponse;

  console.log("[claude] Calling Claude API...");
  console.log("[claude] ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);
  console.log("[claude] ANTHROPIC_API_KEY length:", process.env.ANTHROPIC_API_KEY?.length ?? 0);
  console.log("[claude] User prompt preview:", userPrompt.substring(0, 300));

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    console.log("[claude] Response received:", response.content[0]?.type);
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    console.log("[claude] Raw text:", text.substring(0, 300));

    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    claudeResult = JSON.parse(jsonStr);
    console.log("[claude] Parsed OK:", { classification: claudeResult.classification, confidence: claudeResult.confidence, draft_length: claudeResult.draft_body?.length ?? 0 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStatus = (err as { status?: number }).status;
    console.error("[claude] FAILED:", errMsg, "status:", errStatus);
    console.error("[claude] Full error:", err);
    // Store with fallback values
    claudeResult = {
      classification: "other",
      urgency: "needs_attention",
      confidence: "low",
      reasoning: `Claude processing failed: ${errMsg}. Raw email stored for manual review.`,
      draft_subject: `Re: ${subject}`,
      draft_body: "",
    };
  }

  // Detect language for draft
  const draftLanguage = tenant?.language ?? (subject.match(/[àáâãçéêíóôõú]/i) ? "pt" : "en");

  // Log what we're about to save
  console.log("[claude] Saving to inbox:", {
    classification: claudeResult.classification,
    urgency: claudeResult.urgency,
    confidence: claudeResult.confidence,
    draft_subject: claudeResult.draft_subject?.substring(0, 80),
    draft_body: claudeResult.draft_body?.substring(0, 100),
  });

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
