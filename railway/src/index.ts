import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
  sendThankYouEmail,
  sendReminderEmail,
  sendOwnerUnpaidAlert,
  sendOwnerOverdueAlert,
} from "./email";
import { startCrons } from "./crons";

const app = express();
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

    // Get all pending/overdue payments for current month with tenant details
    const { data: pendingPayments } = await db
      .from("torrinha_payments")
      .select("*, torrinha_tenants(id, name, email, language, rent_eur)")
      .eq("month", month)
      .in("status", ["pending", "overdue"]);

    let matched = 0;
    let unmatched = 0;
    const pending = [...(pendingPayments ?? [])];

    for (const txn of transactions) {
      // Extract amount — support various Zapier payload shapes
      const amount = Math.abs(
        Number(txn.amount ?? txn.amount_eur ?? txn.attributes?.amount ?? 0)
      );

      if (amount <= 0) continue;

      // Try to match: amount == tenant.rent_eur (exact) or within €1
      const matchIdx = pending.findIndex((p) => {
        const tenant = p.torrinha_tenants as {
          rent_eur: number;
        } | null;
        if (!tenant) return false;
        return Math.abs(amount - tenant.rent_eur) <= 1;
      });

      if (matchIdx >= 0) {
        const match = pending[matchIdx];
        const tenant = match.torrinha_tenants as {
          id: string;
          name: string;
          email: string;
          language: string;
          rent_eur: number;
        };

        // Update payment as paid
        await db
          .from("torrinha_payments")
          .update({
            status: "paid",
            matched_by: "ponto_auto",
            paid_date: today(),
            amount_eur: amount,
          })
          .eq("id", match.id);

        // Remove from list to avoid double-matching
        pending.splice(matchIdx, 1);

        // Send thank-you email
        await sendThankYouEmail(
          { name: tenant.name, email: tenant.email, language: tenant.language },
          { month, amount_eur: amount }
        );

        // Update thankyou_sent_at
        await db
          .from("torrinha_payments")
          .update({ thankyou_sent_at: new Date().toISOString() })
          .eq("id", match.id);

        matched++;
      } else {
        // Store as unmatched for review
        await db.from("torrinha_unmatched_transactions").insert({
          raw_data: txn,
          amount_eur: amount,
          counterparty:
            txn.counterpartName ??
            txn.counterparty ??
            txn.attributes?.counterpartName ??
            null,
          description:
            txn.remittanceInformation ??
            txn.description ??
            txn.attributes?.remittanceInformation ??
            txn.attributes?.description ??
            null,
          transaction_date:
            (txn.valueDate ?? txn.transaction_date ?? txn.attributes?.valueDate ?? "")
              .split("T")[0] || today(),
        });

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

    // Get all active tenants
    const { data: tenants } = await db
      .from("torrinha_tenants")
      .select("id, rent_eur")
      .eq("active", true);

    if (!tenants || tenants.length === 0) {
      res.json({ message: "No active tenants", created: 0 });
      return;
    }

    // Check which tenants already have a row for this month
    const { data: existing } = await db
      .from("torrinha_payments")
      .select("tenant_id")
      .eq("month", month);

    const existingSet = new Set(existing?.map((e) => e.tenant_id) ?? []);

    const toInsert = tenants
      .filter((t) => !existingSet.has(t.id))
      .map((t) => ({
        tenant_id: t.id,
        month,
        status: "pending",
        amount_eur: t.rent_eur,
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
        "id, amount_eur, reminder_sent_at, torrinha_tenants(name, email, language, rent_eur)"
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
        name: string;
        email: string;
        language: string;
        rent_eur: number;
      } | null;

      if (!tenant) continue;

      const result = await sendReminderEmail(tenant, {
        month,
        amount_eur: Number(p.amount_eur ?? tenant.rent_eur),
      });

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
// Start server
// ============================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Torrinha Railway server listening on port ${PORT}`);
  startCrons();
});
