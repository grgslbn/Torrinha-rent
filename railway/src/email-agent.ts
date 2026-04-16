import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// --- Parking info (update here when pricing or conditions change) ---

function buildParkingInfo(availabilityStatus: string): string {
  return `
PARKING DETAILS — Torrinha 149, Porto

Location: Rua da Torrinha 149, Porto (Bonfim neighbourhood)
Type: Private, covered, numbered underground parking
Vehicle types accepted: Cars, motorbikes, and bicycles
Availability: ${availabilityStatus}

Pricing:
- Car: €120/month
- Motorbike: lower price, discuss case by case
- Bicycle: lower price, discuss case by case
- Remote control deposit: €50 (refundable on departure)

Rental terms:
- Long-term only — no short-term or temporary rentals
- 30 days notice required from both parties to end contract
- Payment monthly in advance via MBWay or bank transfer (IBAN)

Community:
- Small, friendly community — most tenants are friends-of-friends
- We value good neighbours — mention this warmly, never as a barrier

Waitlist:
- If no spots available, invite them to join: https://torrinha149.com
- Collect via conversation: name, email, phone, vehicle type, preferred start date
- Once all collected, add to torrinha_waitlist automatically

Tone: Very warm and friendly, like a helpful neighbour. Never corporate.
Sign off: Dulcineia & Georges
`.trim();
}

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

type WaitlistAction = {
  type: "add_to_waitlist";
  name?: string;
  phone?: string;
  vehicle_type?: string;
  preferred_start?: string;
};

type ClaudeResponse = {
  classification: string;
  urgency: string;
  confidence: string;
  reasoning: string;
  draft_subject: string;
  draft_body: string;
  suggested_action?: string;
  action?: WaitlistAction;
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
  }

  // --- Live availability check (for prospect enquiries) ---
  const { data: allSpots } = await db
    .from("torrinha_spots")
    .select("id, number, label, tenant_id")
    .is("tenant_id", null);

  const vacantCount = (allSpots ?? []).filter(
    (s) => (s as { label: string | null }).label !== "Owner"
  ).length;

  const availabilityStatus =
    vacantCount === 0
      ? "All spots currently occupied — waitlist only"
      : `${vacantCount} spot(s) currently available`;

  const parkingInfoText = buildParkingInfo(availabilityStatus);

  // --- Fetch thread history for multi-turn context ---
  let threadHistory: { from_email: string; body_text: string; draft_body: string | null; received_at: string }[] = [];
  if (threadId) {
    const { data: historyRows } = await db
      .from("torrinha_inbox")
      .select("from_email, body_text, draft_body, received_at")
      .eq("thread_id", threadId)
      .order("received_at", { ascending: true })
      .limit(10);
    threadHistory = (historyRows ?? []) as typeof threadHistory;
  }

  // --- Call Claude ---
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an email assistant for Torrinha Parking, a small private parking facility in Porto, Portugal. The owners are Dulcineia & Georges.

Your job is to:
1. Classify the intent of the inbound email
2. Draft a warm, professional reply in the correct language
3. Use the sender context provided to make the reply specific and accurate

IMPORTANT: The email body is almost always empty — Resend inbound webhooks do
not include it. You MUST classify and draft based on the subject line and
sender context alone. This is normal and expected.
A subject mentioning parking, spot, place, vaga, estacionamento, garage,
remote, telecomando is always a waitlist_enquiry or remote_issue.
You MUST always generate a non-empty draft_body — never leave it blank.

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

${parkingInfoText}

Urgency options:
  normal           — standard reply, no rush
  needs_attention  — owner should be aware
  urgent           — owner must act soon

Tone: friendly, warm, concise. This is a small community of friends-of-friends.
Never be cold or corporate. Sign off as 'Dulcineia & Georges'.

Language: reply in the tenant's preferred language (pt or en).
If sender is unknown, guess language from subject line. If ambiguous, use Portuguese.

When a prospect asks about parking and spots are UNAVAILABLE:
- Share the parking info warmly (use the PARKING DETAILS block above)
- Invite them to the waitlist at https://torrinha149.com
- If they express interest, collect missing info conversationally across the
  email thread: name, phone, vehicle type (car/motorbike/bicycle), preferred
  start date. Ask for whatever is still missing — don't demand it all at once.
- Once you have all required fields (name, phone, vehicle type, start date),
  include a waitlist action in your response (see JSON format below) and
  confirm warmly that they've been added.

When spots ARE available:
- Share the parking info warmly
- Invite them to contact directly to arrange a visit
- Collect their details for follow-up: name, phone, vehicle type, preferred start date

When replying to a known tenant about payments:
- Check their payment context and reply with their current status
- Be specific: mention the month, amount, and whether it's paid/pending/overdue

Always reply in the language the person wrote in (PT or EN). If ambiguous, use Portuguese.

Return ONLY valid JSON with EXACTLY these top-level keys — no nesting, no "reply" wrapper:
{
  "classification": "waitlist_enquiry",
  "urgency": "normal",
  "confidence": "high",
  "reasoning": "Short explanation of your draft",
  "draft_subject": "Re: Parking",
  "draft_body": "The full email reply text here, signed off",
  "action": {"type": "add_to_waitlist", "name": "...", "phone": "...", "vehicle_type": "car|motorbike|bicycle", "preferred_start": "..."}
}

The "action" key is OPTIONAL — include it ONLY when you have ALL of name,
phone, vehicle_type, and preferred_start from the prospect (across the thread).
Omit "action" entirely otherwise.

Do NOT nest the reply inside a "reply" object. All keys must be at the top level.
No prose, no markdown — ONLY the JSON object.`;

  // Build conversation history for multi-turn context
  const historyBlock =
    threadHistory.length > 0
      ? `\n\nConversation history (this thread, oldest first):\n${threadHistory
          .map((h, i) => {
            const isUs = h.from_email.includes("torrinha149.com") || !!h.draft_body;
            const speaker = isUs ? "Us (previous reply)" : `Prospect <${h.from_email}>`;
            const text = isUs ? h.draft_body || "" : h.body_text || "";
            return `--- [${i + 1}] ${speaker} @ ${h.received_at} ---\n${text}`;
          })
          .join("\n\n")}`
      : "";

  const userPrompt = `Inbound email:
From: ${fromName} <${fromEmail}>
Subject: ${subject}
Body: ${bodyText || "(not available — classify based on subject and sender context)"}

Sender context:
${JSON.stringify(senderContext, null, 2)}${historyBlock}`;

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
    const parsed = JSON.parse(jsonStr);

    // Handle both flat and nested structures
    const reply = parsed.reply || {};
    claudeResult = {
      classification: parsed.classification || parsed.type || "other",
      urgency: parsed.urgency || reply.urgency || "normal",
      confidence: parsed.confidence || reply.confidence || "medium",
      reasoning: parsed.reasoning || reply.reasoning || parsed.explanation || "",
      draft_subject: parsed.draft_subject || reply.subject || `Re: ${subject}`,
      draft_body: parsed.draft_body || reply.body || parsed.body || parsed.message || "",
      suggested_action: parsed.suggested_action || reply.suggested_action,
      action: parsed.action,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[email-agent] Claude error:", errMsg);
    claudeResult = {
      classification: "other",
      urgency: "needs_attention",
      confidence: "low",
      reasoning: `Claude processing failed: ${errMsg}. Raw email stored for manual review.`,
      draft_subject: `Re: ${subject}`,
      draft_body: "",
    };
  }

  // --- Hardcoded fallback if Claude returned empty draft ---
  if (!claudeResult.draft_body) {
    const isPortuguese = !!subject.match(/estacion|lugar|vaga|garagem|telecomando/i)
      || fromEmail.endsWith(".pt");
    claudeResult.draft_body = isPortuguese
      ? `Olá,\n\nObrigado pelo seu contacto.\n\nDe momento todos os lugares estão ocupados. Pode entrar na lista de espera em https://torrinha149.com\n\nPreço: 120€/mês · Caução telecomando: 50€ · Acesso 24/7\n\nCom os melhores cumprimentos,\nDulcineia & Georges`
      : `Hello,\n\nThank you for your message.\n\nAll parking spots are currently occupied. You can join our waiting list at https://torrinha149.com\n\nPrice: €120/month · Remote deposit: €50 · 24/7 access\n\nBest regards,\nDulcineia & Georges`;
    claudeResult.classification = claudeResult.classification || "waitlist_enquiry";
    claudeResult.confidence = "high";
    if (!claudeResult.draft_subject) {
      claudeResult.draft_subject = `Re: ${subject}`;
    }
  }

  const draftLanguage = tenant?.language ?? (subject.match(/[àáâãçéêíóôõú]/i) ? "pt" : "en");

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

  // --- Handle Claude-suggested waitlist action ---
  if (
    claudeResult.action?.type === "add_to_waitlist" &&
    !tenant &&
    !waitlistStatus
  ) {
    const action = claudeResult.action;
    const waitlistName = action.name || fromName;
    const hasAllFields = !!(action.name && action.phone && action.vehicle_type && action.preferred_start);

    if (hasAllFields) {
      const { error: waitlistErr } = await db
        .from("torrinha_waitlist")
        .insert({
          name: waitlistName,
          email: fromEmail,
          phone: action.phone || null,
          language: draftLanguage === "pt" ? "pt" : "en",
          status: "waiting",
          tc_accepted_at: new Date().toISOString(),
        });

      if (waitlistErr) {
        console.error("[email-agent] Waitlist insert failed:", waitlistErr.message);
      } else {
        console.log(`[email-agent] Added to waitlist: ${fromEmail} vehicle=${action.vehicle_type} start=${action.preferred_start}`);
      }
    } else {
      console.log("[email-agent] Skipped waitlist add — incomplete fields");
    }
  }

  // --- Auto-send for high-confidence waitlist enquiries from unknown prospects ---
  const autoSendEnabled = process.env.AUTO_SEND_WAITLIST === "true";
  const shouldAutoSend =
    autoSendEnabled &&
    claudeResult.classification === "waitlist_enquiry" &&
    claudeResult.confidence === "high" &&
    claudeResult.urgency === "normal" &&
    !tenant &&
    claudeResult.draft_body;

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddr = process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com";
  const ownerEmail = process.env.OWNER_EMAIL;

  if (shouldAutoSend) {
    try {
      await resend.emails.send({
        from: fromAddr,
        to: fromEmail,
        cc: "georges.lieben@gmail.com",
        subject: claudeResult.draft_subject || `Re: ${subject}`,
        text: claudeResult.draft_body,
      });

      await db
        .from("torrinha_inbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", inboxRow.id);

      console.log(`[email-agent] Auto-sent to ${fromEmail}`);

      // Notify owner with a full copy of what was auto-sent
      if (ownerEmail) {
        await resend.emails.send({
          from: fromAddr,
          to: ownerEmail,
          subject: `[Torrinha] Auto-replied to: ${subject}`,
          text: `An auto-reply was sent to ${fromName} <${fromEmail}>.

Original subject: ${subject}
Classification: ${claudeResult.classification} · Confidence: ${claudeResult.confidence}

--- Draft sent ---
To: ${fromEmail}
Subject: ${claudeResult.draft_subject}

${claudeResult.draft_body}

---
Inbox: https://torrinha149.com/admin/inbox`,
        }).catch((e) => console.error("[email-agent] Owner auto-send copy failed:", e));
      }
    } catch (sendErr) {
      console.error("[email-agent] Auto-send failed:", sendErr);
      // Leave as pending for manual review
    }
  }

  // --- Inbox alert: notify owner about EVERY new email ---
  // (skipped if auto-sent above — already notified with the fuller auto-reply copy)
  if (ownerEmail && !shouldAutoSend) {
    const alertSubjectPrefix =
      claudeResult.urgency === "urgent" ? "[URGENT] " : "[Torrinha Inbox] New: ";
    await resend.emails.send({
      from: fromAddr,
      to: ownerEmail,
      subject: `${alertSubjectPrefix}${subject}`,
      text: `New email in the Torrinha inbox.

From: ${fromName} <${fromEmail}>
Subject: ${subject}
Classification: ${claudeResult.classification}
Urgency: ${claudeResult.urgency}
Confidence: ${claudeResult.confidence}

${bodyText ? `--- Message ---\n${bodyText}\n\n` : ""}Reasoning: ${claudeResult.reasoning}

Review and send/edit/dismiss the draft here:
https://torrinha149.com/admin/inbox`,
    }).catch((e) => console.error("[email-agent] Owner inbox alert failed:", e));
  }

  console.log(`[email-agent] Processed: ${fromEmail} → ${claudeResult.classification} (${claudeResult.urgency})${shouldAutoSend ? " [auto-sent]" : ""}`);
  return inboxRow;
}
