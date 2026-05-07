import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { logEmail } from "./email";

// --- Parking context (factual details editable via /admin/settings) ---

const DEFAULT_PARKING_CONTEXT = `Location: Rua da Torrinha 149, Porto (Bonfim neighbourhood)
Type: Private, covered, numbered underground parking
Vehicle types accepted: Cars, motorbikes, and bicycles

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
- Once all collected, add to torrinha_waitlist automatically`;

let _parkingContext: string | null = null;
let _parkingContextAt = 0;
const PARKING_CONTEXT_TTL = 5 * 60 * 1000;

async function getParkingContext(): Promise<string> {
  const now = Date.now();
  if (_parkingContext !== null && now - _parkingContextAt < PARKING_CONTEXT_TTL) {
    return _parkingContext;
  }
  try {
    const db = supabase();
    const { data } = await db
      .from("torrinha_settings")
      .select("value")
      .eq("key", "parking_context")
      .single();
    const val = data?.value;
    _parkingContext = typeof val === "string" && val ? val : DEFAULT_PARKING_CONTEXT;
  } catch {
    _parkingContext = _parkingContext ?? DEFAULT_PARKING_CONTEXT;
  }
  _parkingContextAt = Date.now();
  return _parkingContext!;
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

type WaitlistFields = {
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
  // Action may be a string ("add_to_waitlist") with sibling fields,
  // or a nested object { type, name, phone, ... } — handle both
  action?: string;
  waitlistFields?: WaitlistFields;
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

  // If not matched by their own email, check if they're a known tenant contact
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantFromContact: any = null;
  if (!tenant) {
    const { data: contactMatchRows } = await db
      .from("torrinha_tenant_contacts")
      .select("tenant_id, torrinha_tenants!inner(id, name, email, language, rent_eur, start_date, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label))")
      .ilike("email", fromEmail)
      .limit(1);
    if (contactMatchRows?.[0]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ct = (contactMatchRows[0] as any).torrinha_tenants;
      tenantFromContact = ct ? (Array.isArray(ct) ? ct[0] : ct) : null;
    }
  }

  // effectiveTenant is used for forwarding — either a direct match or via contacts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectiveTenant: any = tenant ?? tenantFromContact;

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

  const parkingContext = await getParkingContext();
  const parkingInfoText = `PARKING DETAILS — Torrinha 149, Porto\n\nAvailability: ${availabilityStatus}\n\n${parkingContext}`;

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

TENANT EMAILS:
- You have full context about the tenant — use it
- Reference their specific spot, rent amount, payment status
- For departure notices: confirm process, mention remote return and deposit refund
- For payment queries: check their actual status and respond accurately
- Always reply in their language preference

PROSPECT EMAILS:
- Share parking info warmly, like a friendly neighbour
- Reply in whatever language they wrote in
- If spots available: invite them to contact directly to arrange a visit
- If waitlist only: collect name, phone, vehicle type, preferred start date conversationally (one or two at a time across the thread — don't demand it all at once)
- Once all four fields are collected, include the add_to_waitlist JSON action
- Mention it's a small friendly community

TONE: Very warm, like a helpful neighbour. Never corporate. Sign off: Dulcineia & Georges

Return ONLY valid JSON with these top-level keys — no nesting, no "reply" wrapper:
{
  "classification": "waitlist_enquiry",
  "urgency": "normal",
  "confidence": "high",
  "reasoning": "Short explanation of your draft",
  "draft_subject": "Re: Parking",
  "draft_body": "The full email reply text here, signed off",
  "action": "add_to_waitlist",
  "name": "...",
  "phone": "...",
  "vehicle_type": "car|motorbike|bicycle",
  "preferred_start": "..."
}

The "action" field and its siblings (name, phone, vehicle_type, preferred_start)
are OPTIONAL — include them ONLY when you have ALL four prospect details
collected across the thread. Omit them otherwise.

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

    // Extract action (supports both flat string form and nested object form)
    let actionStr: string | undefined;
    let waitlistFields: WaitlistFields | undefined;
    if (typeof parsed.action === "string") {
      actionStr = parsed.action;
      waitlistFields = {
        name: parsed.name,
        phone: parsed.phone,
        vehicle_type: parsed.vehicle_type,
        preferred_start: parsed.preferred_start,
      };
    } else if (parsed.action && typeof parsed.action === "object") {
      actionStr = parsed.action.type;
      waitlistFields = {
        name: parsed.action.name,
        phone: parsed.action.phone,
        vehicle_type: parsed.action.vehicle_type,
        preferred_start: parsed.action.preferred_start,
      };
    }

    claudeResult = {
      classification: parsed.classification || parsed.type || "other",
      urgency: parsed.urgency || reply.urgency || "normal",
      confidence: parsed.confidence || reply.confidence || "medium",
      reasoning: parsed.reasoning || reply.reasoning || parsed.explanation || "",
      draft_subject: parsed.draft_subject || reply.subject || `Re: ${subject}`,
      draft_body: parsed.draft_body || reply.body || parsed.body || parsed.message || "",
      suggested_action: parsed.suggested_action || reply.suggested_action,
      action: actionStr,
      waitlistFields,
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

  // Log inbound email
  await logEmail({
    tenant_id: tenant?.id ?? null,
    direction: "inbound",
    template: null,
    to_email: payload.to || "",
    from_email: fromEmail,
    subject,
    body: bodyText,
    metadata: { inbox_id: inboxRow?.id ?? null, classification: claudeResult.classification },
  });

  // --- Handle Claude-suggested waitlist action ---
  if (
    claudeResult.action === "add_to_waitlist" &&
    !tenant &&
    !waitlistStatus
  ) {
    const fields = claudeResult.waitlistFields || {};
    const hasAllFields = !!(fields.name && fields.phone && fields.vehicle_type && fields.preferred_start);

    if (hasAllFields) {
      const notes = `Vehicle: ${fields.vehicle_type || "unknown"}. Preferred start: ${fields.preferred_start || "flexible"}. Added by email agent.`;

      const insertPayload: Record<string, unknown> = {
        name: fields.name || fromName,
        email: fromEmail,
        phone: fields.phone || null,
        language: draftLanguage === "pt" ? "pt" : "en",
        status: "waiting",
        tc_accepted_at: new Date().toISOString(),
        notes,
      };

      let { error: waitlistErr } = await db
        .from("torrinha_waitlist")
        .insert(insertPayload);

      // If `notes` column doesn't exist, retry without it
      if (waitlistErr && waitlistErr.message?.toLowerCase().includes("notes")) {
        console.warn("[email-agent] notes column missing — retrying without it");
        delete insertPayload.notes;
        ({ error: waitlistErr } = await db
          .from("torrinha_waitlist")
          .insert(insertPayload));
      }

      if (waitlistErr) {
        console.error("[email-agent] Waitlist insert failed:", waitlistErr.message);
      } else {
        console.log(`[email-agent] Added to waitlist: ${fromEmail}`);
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
          text: `Claude automatically replied to ${fromEmail}

Classification: ${claudeResult.classification}

Reply sent:
${claudeResult.draft_body}`,
        }).catch((e) => console.error("[email-agent] Owner auto-send copy failed:", e));
      }
    } catch (sendErr) {
      console.error("[email-agent] Auto-send failed:", sendErr);
      // Leave as pending for manual review
    }
  }

  // --- Inbox alert: notify owner about EVERY new email (skipped if auto-sent) ---
  if (ownerEmail && !shouldAutoSend) {
    const urgencyEmoji =
      claudeResult.urgency === "urgent"
        ? "🚨"
        : claudeResult.urgency === "needs_attention"
          ? "⚠️"
          : "📬";
    await resend.emails.send({
      from: fromAddr,
      to: ownerEmail,
      subject: `[Torrinha Inbox] ${urgencyEmoji} ${subject}`,
      text: `New email from ${fromName || fromEmail}
Classification: ${claudeResult.classification} | Confidence: ${claudeResult.confidence} | Urgency: ${claudeResult.urgency}

Review and reply: https://torrinha149.com/admin/inbox`,
    }).catch((e) => console.error("[email-agent] Owner inbox alert failed:", e));
  }

  // --- Forward tenant emails to owner ---
  // Runs for all known tenants/contacts regardless of classification or auto-send.
  if (effectiveTenant) {
    const { data: fwdSettingsRows } = await db
      .from("torrinha_settings")
      .select("key, value")
      .in("key", ["owner_cc_email", "owner_cc2_email", "owner_cc2_enabled"]);
    const fwdCfg = Object.fromEntries((fwdSettingsRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

    const fwdTargets: string[] = [];
    if (typeof fwdCfg.owner_cc_email === "string" && fwdCfg.owner_cc_email) {
      fwdTargets.push(fwdCfg.owner_cc_email);
    }
    if (fwdCfg.owner_cc2_enabled === true && typeof fwdCfg.owner_cc2_email === "string" && fwdCfg.owner_cc2_email) {
      fwdTargets.push(fwdCfg.owner_cc2_email);
    }

    if (fwdTargets.length > 0) {
      const spots = effectiveTenant.torrinha_spots as { number: number; label: string | null }[] | undefined;
      const spotLabel = spots?.map((s) => s.label || String(s.number)).join(", ") || "—";
      const receivedDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

      const fwdSubject = `[FWD] ${subject}`;
      const fwdBody = [
        "--- Forwarded tenant email ---",
        `From: ${fromName} <${fromEmail}>`,
        `Date: ${receivedDate}`,
        `Tenant: ${effectiveTenant.name} (Spot ${spotLabel})`,
        "---",
        "",
        bodyText || "(no body — Resend inbound webhooks do not include body text)",
      ].join("\n");

      for (const target of fwdTargets) {
        try {
          await resend.emails.send({ from: fromAddr, to: target, subject: fwdSubject, text: fwdBody });
          await logEmail({
            tenant_id: effectiveTenant.id,
            direction: "outbound",
            template: "tenant_forward",
            to_email: target,
            from_email: fromAddr,
            subject: fwdSubject,
            body: fwdBody,
            metadata: { original_from: fromEmail, original_subject: subject },
          });
          console.log(`[email-agent] Forwarded tenant email from ${fromEmail} to ${target}`);
        } catch (fwdErr) {
          console.error(`[email-agent] Forward to ${target} failed:`, fwdErr);
        }
      }
    }
  }

  console.log(`[email-agent] Processed: ${fromEmail} → ${claudeResult.classification} (${claudeResult.urgency})${shouldAutoSend ? " [auto-sent]" : ""}`);
  return inboxRow;
}
