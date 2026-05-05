import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
  sendThankYouEmail,
  sendReminderEmail,
  sendOwnerUnpaidAlert,
  sendOwnerOverdueAlert,
  logEmail,
} from "./email";
import { startCrons } from "./crons";
import { processInboundEmail } from "./email-agent";
import { fetchTransactions } from "./ponto";
import Anthropic from "@anthropic-ai/sdk";
import { createHmac, timingSafeEqual } from "crypto";

const app = express();

// Raw body needed for webhook signature verification
app.use("/webhooks/email-inbound", express.raw({ type: "*/*" }));
app.use(express.json());

// --- Supabase service client ---

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

function today() {
  return new Date().toISOString().split("T")[0];
}

// --- Middleware: cron secret check ---

function requireCronSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Invalid cron secret" });
    return;
  }
  next();
}

// --- Health check ---

app.get("/", (_req, res) => {
  res.json({ service: "torrinha-railway", status: "ok" });
});

// ============================================================
// Matching helpers
// ============================================================

type EnrichedPayment = {
  id: string;
  tenant_id: string;
  month: string;
  amount_eur: number;
  tenant_name: string;
  tenant_email: string;
  tenant_language: string;
  contact_names: string[];
  known_names: string[];
  spots: (string | number)[];
};

type MatchOutcome =
  | { matched: true; payment: EnrichedPayment; method: string }
  | { matched: false; aiSuggestion?: { tenantName: string; paymentId: string; reason: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

async function aiMatch(
  amount: number,
  counterpart: string | null,
  communication: string | null,
  counterpartReference: string | null,
  enriched: EnrichedPayment[]
): Promise<{ payment: EnrichedPayment; confidence: string; reason: string } | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const paymentListForAI = enriched.map((p) => ({
      payment_id: p.id,
      month: p.month,
      expected_amount: p.amount_eur,
      tenant_name: p.tenant_name,
      contact_names: p.contact_names,
      known_name_variants: p.known_names,
      spots: p.spots,
    }));

    const prompt = `You are matching a single bank transaction to a parking rental payment for Torrinha Parking.

TRANSACTION:
- Amount: €${amount}
- Counterpart name: ${counterpart || "unknown"}
- Remittance information: ${communication || "none"}
- Counterpart IBAN: ${counterpartReference || "unknown"}

PENDING PAYMENTS:
${JSON.stringify(paymentListForAI, null, 2)}

Match the transaction to one of the pending payments. Amount must be within €2. Consider counterpart name similarity to tenant name, contact names, and known name variants. Remittance info may contain a spot number or name reference.

Respond ONLY with a JSON object (no markdown, no explanation):
{"payment_id":"...","confidence":"high"|"medium"|"low","reason":"..."}

Or respond with: null

If no payment is a plausible match, respond with null.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    if (!text || text === "null") return null;

    const parsed = JSON.parse(
      text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    ) as { payment_id: string; confidence: string; reason: string };

    const payment = enriched.find((p) => p.id === parsed.payment_id);
    if (!payment) return null;

    // Sanity-check: Claude could hallucinate a payment_id with the wrong amount
    if (Math.abs(payment.amount_eur - amount) > 5) return null;

    return { payment, confidence: parsed.confidence, reason: parsed.reason };
  } catch {
    return null; // never block a transaction on AI failure
  }
}

async function findMatch(
  amount: number,
  counterpart: string | null,
  counterpartReference: string | null,
  communication: string | null,
  enriched: EnrichedPayment[],
  db: DbClient
): Promise<MatchOutcome> {
  // Tier 1: IBAN match — highest confidence
  if (counterpartReference) {
    const { data: insight } = await db
      .from("torrinha_tenant_insights")
      .select("tenant_id")
      .eq("key", "iban")
      .eq("value", counterpartReference)
      .maybeSingle();

    if (insight) {
      const payment = enriched.find(
        (p) => p.tenant_id === insight.tenant_id && Math.abs(p.amount_eur - amount) <= 2
      );
      if (payment) return { matched: true, payment, method: "iban_match" };
    }
  }

  // Tier 2: Name match — fuzzy, with contact + known names
  if (counterpart) {
    const normalised = counterpart.toLowerCase().trim();

    for (const payment of enriched) {
      if (Math.abs(payment.amount_eur - amount) > 2) continue;

      const namesToCheck = [
        payment.tenant_name,
        ...payment.contact_names,
        ...payment.known_names,
      ].filter(Boolean).map((n) => n.toLowerCase().trim());

      const isNameMatch = namesToCheck.some((name) => {
        if (normalised.includes(name) || name.includes(normalised)) return true;
        const aWords = normalised.split(/\s+/).filter((w) => w.length >= 3);
        const bWords = name.split(/\s+/).filter((w) => w.length >= 3);
        return aWords.filter((w) => bWords.includes(w)).length >= 2;
      });

      if (isNameMatch) return { matched: true, payment, method: "name_match" };
    }
  }

  // Tier 2.5: Claude AI match
  const aiResult = await aiMatch(amount, counterpart, communication, counterpartReference, enriched);
  if (aiResult) {
    if (aiResult.confidence === "high") {
      return { matched: true, payment: aiResult.payment, method: "ai_match" };
    }
    if (aiResult.confidence === "medium") {
      return {
        matched: false,
        aiSuggestion: {
          tenantName: aiResult.payment.tenant_name,
          paymentId: aiResult.payment.id,
          reason: aiResult.reason,
        },
      };
    }
    // low confidence → fall through to Tier 3
  }

  // Tier 3: Amount-only — only if unambiguous
  const amountMatches = enriched.filter((p) => Math.abs(p.amount_eur - amount) <= 1);
  if (amountMatches.length === 1) return { matched: true, payment: amountMatches[0], method: "amount_only" };

  return { matched: false };
}

async function learnFromMatch(
  tenantId: string,
  counterpart: string | null,
  counterpartReference: string | null,
  method: string,
  db: DbClient
) {
  if (counterpartReference) {
    try {
      await db.from("torrinha_tenant_insights").upsert(
        { tenant_id: tenantId, key: "iban", value: counterpartReference, source: method },
        { onConflict: "key,value", ignoreDuplicates: true }
      );
    } catch { /* insights table may not exist yet */ }
  }

  if (counterpart) {
    try {
      const upperName = counterpart.toUpperCase();
      const { data: existing } = await db
        .from("torrinha_tenant_insights")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("key", "known_name")
        .eq("value", upperName)
        .maybeSingle();

      if (!existing) {
        await db.from("torrinha_tenant_insights").insert({
          tenant_id: tenantId,
          key: "known_name",
          value: upperName,
          source: method,
        });
      }
    } catch { /* insights table may not exist yet */ }
  }
}

// ============================================================
// POST /webhooks/zapier — Zapier forwards Ponto transactions
// ============================================================

app.post("/webhooks/zapier", async (req, res) => {
  // Validate Zapier secret
  const secret = req.headers["x-zapier-secret"];
  if (!secret || secret !== process.env.ZAPIER_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const payload = req.body;
  if (!payload) {
    res.status(400).json({ error: "Empty payload" });
    return;
  }

  try {
    // Zapier may send a single transaction or an array
    const transactions = Array.isArray(payload) ? payload : [payload];
    const db = supabase();
    const month = currentMonthStr();

    // Fetch pending payments with contact names and spots for matching
    const { data: rawPayments } = await db
      .from("torrinha_payments")
      .select(`
        id, tenant_id, month, amount_eur, status,
        torrinha_tenants ( id, name, email, language, rent_eur,
          torrinha_tenant_contacts ( name ),
          torrinha_spots!torrinha_spots_tenant_id_fkey ( number, label )
        )
      `)
      .eq("month", month)
      .in("status", ["pending", "overdue"]);

    // Fetch known name variants for all tenants
    const { data: knownNameInsights } = await db
      .from("torrinha_tenant_insights")
      .select("tenant_id, value")
      .eq("key", "known_name");

    // Build enriched payment list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: EnrichedPayment[] = (rawPayments ?? []).map((p: any) => {
      const tenant = p.torrinha_tenants;
      const tenantId: string = p.tenant_id ?? tenant?.id ?? "";
      return {
        id: p.id,
        tenant_id: tenantId,
        month: p.month,
        amount_eur: p.amount_eur ?? tenant?.rent_eur ?? 0,
        tenant_name: tenant?.name ?? "",
        tenant_email: tenant?.email ?? "",
        tenant_language: tenant?.language ?? "pt",
        contact_names: (tenant?.torrinha_tenant_contacts ?? [])
          .map((c: { name: string }) => c.name)
          .filter(Boolean),
        known_names: (knownNameInsights ?? [])
          .filter((i: { tenant_id: string }) => i.tenant_id === tenantId)
          .map((i: { value: string }) => i.value),
        spots: (tenant?.torrinha_spots ?? [])
          .map((s: { number: number; label: string | null }) => s.label || s.number),
      };
    });

    let matched = 0;
    let unmatched = 0;

    for (const txn of transactions) {
      // Extract fields — Title Case (Zapier), snake_case, camelCase, nested attributes
      const amount = Math.abs(Number(
        txn["Amount"] ??
        txn.amount ??
        txn.amount_eur ??
        txn.attributes?.amount ??
        0
      ));

      const counterpart = (
        txn["Counterpart Name"] ??
        txn.counterpart_name ??
        txn.counterpartName ??
        txn.counterparty ??
        txn.attributes?.counterpartName ??
        null
      )?.toString().trim() || null;

      const communication = (
        txn["Remittance Information"] ??
        txn["Description"] ??
        txn.communication ??
        txn.remittanceInformation ??
        txn.description ??
        txn.attributes?.remittanceInformation ??
        txn.attributes?.description ??
        null
      )?.toString().trim() || null;

      const valueDateRaw =
        txn["Value Date"] ??
        txn["Execution Date"] ??
        txn.execution_date ??
        txn.valueDate ??
        txn.transaction_date ??
        txn.attributes?.valueDate ??
        "";
      const executionDate = valueDateRaw
        ? new Date(valueDateRaw).toISOString().split("T")[0]
        : today();

      const transactionId = (
        txn["ID"] ??
        txn.transaction_id ??
        txn.id ??
        txn.attributes?.id ??
        null
      )?.toString().trim() || null;

      const counterpartReference = (
        txn["Counterpart Reference"] ??
        txn.counterpart_reference ??
        txn.counterpartReference ??
        txn.attributes?.counterpartReference ??
        null
      )?.toString().trim() || null;

      // Tier 0: Dedup — skip if already logged
      if (transactionId) {
        const { count } = await db
          .from("torrinha_transaction_log")
          .select("*", { count: "exact", head: true })
          .eq("transaction_id", transactionId);
        if ((count ?? 0) > 0) continue;
      }

      if (amount <= 0) {
        try {
          await db.from("torrinha_transaction_log").insert({
            source: "zapier",
            transaction_id: transactionId,
            execution_date: executionDate,
            amount_eur: amount,
            counterpart,
            communication,
            match_status: "ignored",
            notes: JSON.stringify({ raw_payload: txn, match_method: null, counterpart_reference: counterpartReference }),
          });
        } catch { /* table may not exist yet */ }
        continue;
      }

      // Four-tier match: IBAN → Name → AI → Amount-only
      const outcome = await findMatch(amount, counterpart, counterpartReference, communication, enriched, db);

      if (outcome.matched) {
        const { payment, method } = outcome;

        // Remove from list to prevent double-matching in this batch
        const idx = enriched.indexOf(payment);
        if (idx >= 0) enriched.splice(idx, 1);

        // Update payment — use value date, not match timestamp
        await db.from("torrinha_payments").update({
          status: "paid",
          matched_by: "ponto_auto",
          paid_date: executionDate,
          amount_eur: amount,
        }).eq("id", payment.id);

        // Fetch contacts for CC
        const { data: contactRows } = await db
          .from("torrinha_tenant_contacts")
          .select("email")
          .eq("tenant_id", payment.tenant_id)
          .eq("receives_emails", true);
        const extraCc = (contactRows ?? []).map((c: { email: string }) => c.email).filter(Boolean) as string[];

        await sendThankYouEmail(
          { id: payment.tenant_id, name: payment.tenant_name, email: payment.tenant_email, language: payment.tenant_language },
          { month, amount_eur: amount },
          extraCc
        );

        await db.from("torrinha_payments")
          .update({ thankyou_sent_at: new Date().toISOString() })
          .eq("id", payment.id);

        // Store IBAN + name variant for future matches
        await learnFromMatch(payment.tenant_id, counterpart, counterpartReference, method, db);

        try {
          await db.from("torrinha_transaction_log").insert({
            source: "zapier",
            transaction_id: transactionId,
            execution_date: executionDate,
            amount_eur: amount,
            counterpart,
            communication,
            match_status: "auto_matched",
            matched_tenant_id: payment.tenant_id,
            matched_month: payment.month,
            notes: JSON.stringify({ raw_payload: txn, match_method: method, counterpart_reference: counterpartReference }),
          });
        } catch (e) {
          console.error("[log] insert failed:", e);
        }

        matched++;
      } else {
        await db.from("torrinha_unmatched_transactions").insert({
          raw_data: txn,
          amount_eur: amount,
          counterparty: counterpart,
          description: communication,
          transaction_date: executionDate,
        });

        try {
          await db.from("torrinha_transaction_log").insert({
            source: "zapier",
            transaction_id: transactionId,
            execution_date: executionDate,
            amount_eur: amount,
            counterpart,
            communication,
            match_status: "unmatched",
            notes: JSON.stringify({
              raw_payload: txn,
              match_method: null,
              counterpart_reference: counterpartReference,
              ai_suggestion: outcome.aiSuggestion ?? null,
            }),
          });
        } catch (e) {
          console.error("[log] insert failed:", e);
        }

        unmatched++;
      }
    }

    res.json({ ok: true, matched, unmatched });
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});

// ============================================================
// POST /cron/reset-month — create pending payment rows
// ============================================================

app.post("/cron/reset-month", requireCronSecret, async (_req, res) => {
  try {
    const db = supabase();
    const month = currentMonthStr();

    // Compute first and last day of month
    const [year, mo] = month.split("-").map(Number);
    const firstDay = `${month}-01`;
    const lastDay = new Date(year, mo, 0).toISOString().split("T")[0]; // last day of month

    // Get all tenants who have an assignment that overlaps with this month.
    // end_date is exclusive, so assignment is active during month if:
    //   start_date <= lastDay AND (end_date IS NULL OR end_date > firstDay)
    const { data: assignments } = await db
      .from("torrinha_spot_assignments")
      .select("tenant_id, torrinha_tenants(id, rent_eur, status)")
      .lte("start_date", lastDay)
      .or(`end_date.is.null,end_date.gt.${firstDay}`);

    if (!assignments || assignments.length === 0) {
      res.json({ message: "No assignments for this month", created: 0 });
      return;
    }

    // Deduplicate by tenant_id (a tenant can have multiple spots)
    const tenantMap = new Map<string, number>();
    for (const a of assignments) {
      const t = Array.isArray(a.torrinha_tenants) ? a.torrinha_tenants[0] : a.torrinha_tenants;
      const tenant = t as { id: string; rent_eur: number; status: string } | null;
      if (tenant && tenant.status === "active" && !tenantMap.has(tenant.id)) {
        tenantMap.set(tenant.id, Number(tenant.rent_eur));
      }
    }

    // Check which tenants already have a row for this month
    const { data: existing } = await db
      .from("torrinha_payments")
      .select("tenant_id")
      .eq("month", month);

    const existingSet = new Set(existing?.map((e) => e.tenant_id) ?? []);

    const toInsert = [...tenantMap.entries()]
      .filter(([id]) => !existingSet.has(id))
      .map(([id, rent_eur]) => ({
        tenant_id: id,
        month,
        status: "pending",
        amount_eur: rent_eur,
      }));

    if (toInsert.length === 0) {
      res.json({ message: "All tenants already have records", created: 0 });
      return;
    }

    const { error } = await db.from("torrinha_payments").insert(toInsert);
    if (error) throw error;

    console.log(`[reset-month] Created ${toInsert.length} payment rows for ${month}`);
    res.json({ created: toInsert.length, month });
  } catch (err) {
    console.error("[reset-month] Error:", err);
    res.status(500).json({ error: "Failed to reset month" });
  }
});

// ============================================================
// POST /cron/alert-owner-5 — email owner unpaid list (5th)
// ============================================================

app.post("/cron/alert-owner-5", requireCronSecret, async (_req, res) => {
  try {
    const db = supabase();
    const month = currentMonthStr();

    const { data: unpaid } = await db
      .from("torrinha_payments")
      .select(
        "tenant_id, amount_eur, torrinha_tenants(name, rent_eur, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label))"
      )
      .eq("month", month)
      .in("status", ["pending", "overdue"]);

    if (!unpaid || unpaid.length === 0) {
      res.json({ message: "All paid", emailed: false });
      return;
    }

    const tenantList = unpaid.map((p) => {
      const t = (Array.isArray(p.torrinha_tenants)
        ? p.torrinha_tenants[0]
        : p.torrinha_tenants) as {
        name: string;
        rent_eur: number;
        torrinha_spots: { number: number; label: string | null }[];
      } | null;
      return {
        name: t?.name ?? "Unknown",
        rent_eur: Number(p.amount_eur ?? t?.rent_eur ?? 0),
        spots:
          t?.torrinha_spots
            ?.map((s) => s.label || String(s.number))
            .join(", ") ?? "—",
      };
    });

    await sendOwnerUnpaidAlert(tenantList, month);
    console.log(`[alert-owner-5] Sent unpaid alert: ${tenantList.length} tenants`);
    res.json({ emailed: true, unpaid_count: tenantList.length });
  } catch (err) {
    console.error("[alert-owner-5] Error:", err);
    res.status(500).json({ error: "Failed to send owner alert" });
  }
});

// ============================================================
// POST /cron/remind-tenants — email unpaid tenants (8th)
// ============================================================

app.post("/cron/remind-tenants", requireCronSecret, async (_req, res) => {
  try {
    const db = supabase();
    const month = currentMonthStr();

    const { data: unpaid } = await db
      .from("torrinha_payments")
      .select(
        "id, amount_eur, reminder_sent_at, torrinha_tenants(id, name, email, language, rent_eur)"
      )
      .eq("month", month)
      .in("status", ["pending", "overdue"])
      .is("reminder_sent_at", null);

    if (!unpaid || unpaid.length === 0) {
      res.json({ message: "No tenants to remind", reminded: 0 });
      return;
    }

    let reminded = 0;

    for (const p of unpaid) {
      const tenant = (Array.isArray(p.torrinha_tenants)
        ? p.torrinha_tenants[0]
        : p.torrinha_tenants) as {
        id: string;
        name: string;
        email: string;
        language: string;
        rent_eur: number;
      } | null;

      if (!tenant) continue;

      // Fetch contacts who should receive a copy
      const { data: contactRows } = await db
        .from("torrinha_tenant_contacts")
        .select("email")
        .eq("tenant_id", tenant.id)
        .eq("receives_emails", true);
      const extraCc = (contactRows ?? []).map((c) => c.email).filter(Boolean) as string[];

      const result = await sendReminderEmail(
        { id: tenant.id, name: tenant.name, email: tenant.email, language: tenant.language },
        { month, amount_eur: Number(p.amount_eur ?? tenant.rent_eur) },
        extraCc
      );

      if (result.success) {
        await db
          .from("torrinha_payments")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", p.id);
        reminded++;
      }
    }

    console.log(`[remind-tenants] Sent ${reminded} reminders for ${month}`);
    res.json({ reminded, month });
  } catch (err) {
    console.error("[remind-tenants] Error:", err);
    res.status(500).json({ error: "Failed to send reminders" });
  }
});

// ============================================================
// POST /cron/escalate-owner — mark overdue + email owner (15th)
// ============================================================

app.post("/cron/escalate-owner", requireCronSecret, async (_req, res) => {
  try {
    const db = supabase();
    const month = currentMonthStr();

    // Get all still-pending payments
    const { data: unpaid } = await db
      .from("torrinha_payments")
      .select(
        "id, amount_eur, torrinha_tenants(name, rent_eur, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label))"
      )
      .eq("month", month)
      .eq("status", "pending");

    if (!unpaid || unpaid.length === 0) {
      res.json({ message: "No pending to escalate", escalated: 0 });
      return;
    }

    // Mark all as overdue
    const ids = unpaid.map((p) => p.id);
    await db
      .from("torrinha_payments")
      .update({ status: "overdue" })
      .in("id", ids);

    // Build tenant list for owner email
    const tenantList = unpaid.map((p) => {
      const t = (Array.isArray(p.torrinha_tenants)
        ? p.torrinha_tenants[0]
        : p.torrinha_tenants) as {
        name: string;
        rent_eur: number;
        torrinha_spots: { number: number; label: string | null }[];
      } | null;
      return {
        name: t?.name ?? "Unknown",
        rent_eur: Number(p.amount_eur ?? t?.rent_eur ?? 0),
        spots:
          t?.torrinha_spots
            ?.map((s) => s.label || String(s.number))
            .join(", ") ?? "—",
      };
    });

    await sendOwnerOverdueAlert(tenantList, month);
    console.log(`[escalate-owner] Escalated ${ids.length} to overdue for ${month}`);
    res.json({ escalated: ids.length, month });
  } catch (err) {
    console.error("[escalate-owner] Error:", err);
    res.status(500).json({ error: "Failed to escalate" });
  }
});

// ============================================================
// POST /webhooks/email-inbound — Resend inbound email webhook
// ============================================================

app.post("/webhooks/email-inbound", async (req, res) => {
  const rawBody = typeof req.body === "string" ? req.body : req.body?.toString("utf-8") ?? "{}";

  // Verify Resend webhook signature
  const secret = process.env.RESEND_INBOUND_SECRET;
  if (secret) {
    const signature = req.headers["resend-signature"] as string | undefined;
    if (signature) {
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      try {
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
          // Signature mismatch — proceed anyway for now
        }
      } catch {
        // Signature check error — proceed anyway
      }
    }
  }

  try {
    const webhook = JSON.parse(rawBody);

    // Only process emails addressed to our parking domain
    // Handle both string[] and object[] formats from Resend
    const toAddresses = webhook.data?.to || [];
    const isForTorrinha = toAddresses.some((addr: unknown) => {
      const email = typeof addr === "string" ? addr : (addr as Record<string, string>)?.email || (addr as Record<string, string>)?.address || String(addr);
      return email.includes("torrinha149.com");
    });

    if (!isForTorrinha) {
      console.log("[email-inbound] Ignored:", JSON.stringify(toAddresses));
      res.status(200).json({ ignored: true });
      return;
    }

    console.log("[email-inbound] Accepted for torrinha149.com:", JSON.stringify(toAddresses));

    // Resend email.received webhook format:
    // { type: "email.received", data: { id, from, to, subject, text, html, ... } }
    const eventType = webhook.type || "";
    const data = webhook.data || webhook;

    if (eventType && eventType !== "email.received") {
      console.log("[email-inbound] Skipping non-inbound event:", eventType);
      res.json({ ok: true, skipped: true });
      return;
    }

    // Read fields from data object
    const fromRaw: string = data.from || "";
    const subject: string = data.subject || "";
    const bodyText: string = data.text || data.html || "";
    const threadId: string = data.threadId || data.thread_id || "";
    const inReplyTo: string = data.inReplyTo || data.in_reply_to || "";
    const messageId: string = data.message_id || data.id || "";

    // Parse "Name <email>" format
    const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : fromRaw;
    const fromEmail = fromMatch ? fromMatch[2].trim() : fromRaw;

    console.log("[email-inbound] Received:", {
      from: fromEmail,
      subject,
      body_length: bodyText.length,
      thread_id: threadId,
    });

    const payload = {
      from: fromEmail,
      from_name: fromName,
      to: Array.isArray(data.to) ? data.to[0] : data.to || "",
      subject,
      text: bodyText,
      html: data.html || "",
      message_id: messageId,
      email_id: data.email_id || data.id || "",
      in_reply_to: inReplyTo || threadId,
      references: "",
      data, // pass raw data object so email-agent can access all fields
    };

    const result = await processInboundEmail(payload);
    res.json({ ok: true, id: result?.id });
  } catch (err) {
    console.error("[email-inbound] Error:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});

// ============================================================
// POST /webhooks/email-inbound-postmark — Postmark inbound webhook
// ============================================================

app.post("/webhooks/email-inbound-postmark", async (req, res) => {
  const payload = req.body;

  // Validate Postmark inbound token if configured
  const secret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET;
  if (secret) {
    // Postmark doesn't sign payloads — validation is via the unique
    // inbound webhook URL token. We check a custom header if set,
    // or rely on the secret being part of the URL path on Postmark's side.
    // For extra safety, check x-postmark-token if provided.
    const token = req.headers["x-postmark-token"] as string | undefined;
    if (token && token !== secret) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  }

  // Recipient filter — only process emails for torrinha149.com
  const toRaw: string = payload.To || payload.to || "";
  const toList = toRaw.split(",").map((s: string) => s.trim());
  const isForTorrinha = toList.some((addr: string) =>
    addr.includes("torrinha149.com")
  );

  if (!isForTorrinha) {
    console.log("[postmark-inbound] Ignored:", toRaw);
    res.status(200).json({ ignored: true });
    return;
  }

  try {
    // Postmark provides full email body in TextBody / HtmlBody
    const fromFull = payload.FromFull || {};
    const fromEmail: string = fromFull.Email || payload.From || "";
    const fromName: string = fromFull.Name || fromEmail.split("@")[0];
    const subject: string = payload.Subject || "";
    const bodyText: string = payload.TextBody || payload.HtmlBody || "";
    const messageId: string = payload.MessageID || "";

    // Extract In-Reply-To from headers array
    const headers: { Name: string; Value: string }[] = payload.Headers || [];
    const inReplyToHeader = headers.find(
      (h) => h.Name.toLowerCase() === "in-reply-to"
    );
    const inReplyTo: string = inReplyToHeader?.Value || payload.ReplyTo || "";

    console.log("[postmark-inbound] Received:", {
      from: fromEmail,
      subject,
      body_length: bodyText.length,
    });

    const agentPayload = {
      from: fromEmail,
      from_name: fromName,
      to: toRaw,
      subject,
      text: bodyText,
      html: payload.HtmlBody || "",
      message_id: messageId,
      in_reply_to: inReplyTo,
      references: "",
    };

    const result = await processInboundEmail(agentPayload);
    res.json({ ok: true, id: result?.id });
  } catch (err) {
    console.error("[postmark-inbound] Error:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});

// ============================================================
// POST /email/send-reply — send a drafted reply from the inbox
// ============================================================

app.post("/email/send-reply", requireCronSecret, async (req, res) => {
  try {
    const { inbox_id, subject, body: replyBody } = req.body;
    if (!inbox_id || !replyBody) {
      res.status(400).json({ error: "inbox_id and body are required" });
      return;
    }

    const db = supabase();

    // Get the original inbox item
    const { data: inboxItem, error: fetchError } = await db
      .from("torrinha_inbox")
      .select("from_email, from_name, tenant_id")
      .eq("id", inbox_id)
      .single();

    if (fetchError || !inboxItem) {
      res.status(404).json({ error: "Inbox item not found" });
      return;
    }

    // Fetch owner CC settings
    const { data: settingsRows } = await db
      .from("torrinha_settings")
      .select("key, value")
      .in("key", ["owner_cc_enabled", "owner_cc_email", "owner_cc_mode"]);
    const settingsMap = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]));
    const ccEnabled = settingsMap.owner_cc_enabled === true;
    const ccEmail = typeof settingsMap.owner_cc_email === "string" ? settingsMap.owner_cc_email : "";
    const ccMode = settingsMap.owner_cc_mode === "cc" ? "cc" : "bcc";
    const replyCcPayload =
      ccEnabled && ccEmail
        ? ccMode === "cc"
          ? { cc: ccEmail }
          : { bcc: ccEmail }
        : {};

    // Send via Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error: sendError } = await resend.emails.send({
      from: process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com",
      to: inboxItem.from_email,
      ...replyCcPayload,
      subject: subject || "Re: (no subject)",
      text: replyBody,
    });

    if (sendError) {
      console.error("[send-reply] Resend error:", sendError);
      res.status(500).json({ error: sendError.message });
      return;
    }

    // Update inbox status
    await db
      .from("torrinha_inbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        draft_subject: subject,
        draft_body: replyBody,
      })
      .eq("id", inbox_id);

    // Log outbound reply
    await logEmail({
      tenant_id: inboxItem.tenant_id ?? null,
      direction: "outbound",
      template: null,
      to_email: inboxItem.from_email,
      from_email: process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com",
      subject: subject || "Re: (no subject)",
      body: replyBody,
      metadata: { inbox_id, trigger: "manual_reply" },
    });

    console.log(`[send-reply] Sent reply for inbox ${inbox_id} to ${inboxItem.from_email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[send-reply] Error:", err);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// ============================================================
// GET /inbox/pending-count — count of pending inbox items
// ============================================================

app.get("/inbox/pending-count", requireCronSecret, async (_req, res) => {
  try {
    const db = supabase();
    const { count, error } = await db
      .from("torrinha_inbox")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) throw error;
    res.json({ pending: count ?? 0 });
  } catch (err) {
    console.error("[pending-count] Error:", err);
    res.status(500).json({ error: "Failed to get count" });
  }
});

// ============================================================
// POST /cron/transition-spots — daily: flip future→active, active→inactive
// ============================================================

app.post("/cron/transition-spots", requireCronSecret, async (_req, res) => {
  try {
    const db = supabase();
    const todayStr = today();

    let activated = 0;
    let deactivated = 0;

    // 1. Find future tenants whose assignment start_date <= today → activate
    // end_date is exclusive: active if end_date IS NULL or end_date > today
    const { data: toActivate } = await db
      .from("torrinha_spot_assignments")
      .select("tenant_id, spot_id, torrinha_tenants(id, status)")
      .lte("start_date", todayStr)
      .or(`end_date.is.null,end_date.gt.${todayStr}`);

    const futureToActivate = (toActivate ?? []).filter((a) => {
      const t = Array.isArray(a.torrinha_tenants) ? a.torrinha_tenants[0] : a.torrinha_tenants;
      return (t as { id: string; status: string } | null)?.status === "upcoming";
    });

    for (const a of futureToActivate) {
      const t = Array.isArray(a.torrinha_tenants) ? a.torrinha_tenants[0] : a.torrinha_tenants;
      const tenant = t as { id: string; status: string } | null;
      if (!tenant) continue;

      await db
        .from("torrinha_tenants")
        .update({ status: "active", active: true })
        .eq("id", tenant.id);

      // Update spot cache
      await db
        .from("torrinha_spots")
        .update({ tenant_id: a.tenant_id })
        .eq("id", a.spot_id);

      activated++;
    }

    // 2. Find active tenants whose assignments have all ended → deactivate
    // end_date is exclusive: an assignment ending on today (end_date <= today) is no longer active
    const { data: endedAssignments } = await db
      .from("torrinha_spot_assignments")
      .select("tenant_id, spot_id")
      .lte("end_date", todayStr);

    const endedTodayTenants = new Set(
      (endedAssignments ?? []).map((a) => a.tenant_id)
    );

    for (const tenantId of endedTodayTenants) {
      // Check if tenant has any assignment still active (NULL end or end_date > today)
      const { data: openAssignments } = await db
        .from("torrinha_spot_assignments")
        .select("id")
        .eq("tenant_id", tenantId)
        .or(`end_date.is.null,end_date.gt.${todayStr}`)
        .limit(1);

      if (openAssignments && openAssignments.length > 0) continue; // still has active spot

      // Check tenant status
      const { data: tenant } = await db
        .from("torrinha_tenants")
        .select("status")
        .eq("id", tenantId)
        .single();

      if (tenant?.status !== "active") continue;

      // Check for unpaid/overdue payments — don't auto-deactivate if debt outstanding
      const { data: unpaid } = await db
        .from("torrinha_payments")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "overdue"])
        .limit(1);

      if (unpaid && unpaid.length > 0) {
        console.log(`[transition-spots] Skipping deactivation of ${tenantId} — has unpaid payments`);
        continue;
      }

      await db
        .from("torrinha_tenants")
        .update({ status: "inactive", active: false })
        .eq("id", tenantId);

      // Clear spot cache for spots this tenant occupied
      await db
        .from("torrinha_spots")
        .update({ tenant_id: null })
        .eq("tenant_id", tenantId);

      deactivated++;
    }

    console.log(`[transition-spots] Activated: ${activated}, Deactivated: ${deactivated}`);
    res.json({ activated, deactivated, date: todayStr });
  } catch (err) {
    console.error("[transition-spots] Error:", err);
    res.status(500).json({ error: "Failed to run transitions" });
  }
});

// ============================================================
// POST /cron/ponto-shadow — Poll Ponto every 6h, log as shadow
// ============================================================

app.post("/cron/ponto-shadow", requireCronSecret, async (_req, res) => {
  try {
    const { transactions, synchronizedAt } = await fetchTransactions();
    const credits = transactions.filter((txn) => txn.attributes.amount > 0);
    const db = supabase();

    let logged = 0;

    for (const txn of credits) {
      const amount = txn.attributes.amount;
      const counterpart = txn.attributes.counterpartName || null;
      const communication =
        txn.attributes.remittanceInformation ||
        txn.attributes.description ||
        null;
      const executionDate =
        txn.attributes.valueDate?.split("T")[0] ||
        txn.attributes.executionDate?.split("T")[0] ||
        new Date().toISOString().split("T")[0];
      const transactionId = txn.id || null;

      // Skip if already logged (dedup by transaction_id)
      if (transactionId) {
        const { count } = await db
          .from("torrinha_transaction_log")
          .select("*", { count: "exact", head: true })
          .eq("transaction_id", transactionId);

        if ((count ?? 0) > 0) continue;
      }

      await db.from("torrinha_transaction_log").insert({
        source: "ponto_shadow",
        transaction_id: transactionId,
        execution_date: executionDate,
        amount_eur: amount,
        counterpart,
        communication,
        match_status: "unmatched",
        notes: `Shadow mode — data quality test. Synced at: ${synchronizedAt || "unknown"}`,
      });

      logged++;
    }

    console.log(`[ponto-shadow] Logged ${logged} new transactions`);
    res.json({ ok: true, logged });
  } catch (err) {
    console.error("[ponto-shadow] Error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ============================================================
// Start server
// ============================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Torrinha Railway server listening on port ${PORT}`);
  startCrons();
});
