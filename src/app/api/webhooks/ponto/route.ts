import { createClient } from "@supabase/supabase-js";
import { verifyWebhookSignature, fetchTransactions } from "@/lib/ponto";
import { sendThankYouEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

// Use service role for webhook — no user session available
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-ponto-signature") ||
    request.headers.get("x-webhook-signature");
  const secret = process.env.PONTO_WEBHOOK_SECRET!;

  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle relevant event types
  const eventType = payload?.data?.type || payload?.type || "";
  const relevantEvents = [
    "pontoConnect.account.transactionsCreated",
    "pontoConnect.account.transactionsUpdated",
    "pontoConnect.synchronization.succeededWithoutChange",
    "transactions",
    "synchronization",
  ];

  if (!relevantEvents.some((e) => eventType.includes(e) || eventType === e)) {
    // Acknowledge but skip non-transaction events
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    // Fetch latest transactions from Ponto
    const { transactions } = await fetchTransactions();

    // Filter to incoming credits (positive amounts)
    const credits = transactions.filter(
      (txn) => txn.attributes.amount > 0
    );

    if (credits.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const supabase = getServiceClient();
    const month = currentMonthStr();

    // Get all pending/overdue payments for current month with tenant details
    const { data: pendingPayments } = await supabase
      .from("torrinha_payments")
      .select("*, torrinha_tenants(id, name, email, language, rent_eur)")
      .eq("month", month)
      .in("status", ["pending", "overdue"]);

    const today = new Date().toISOString().split("T")[0];
    let matched = 0;
    let unmatched = 0;

    for (const txn of credits) {
      const amount = txn.attributes.amount;

      // Try to match against a pending payment
      // Match if amount == tenant.rent_eur (exact) or within €1 tolerance
      const match = (pendingPayments ?? []).find((p) => {
        const tenant = p.torrinha_tenants as {
          id: string;
          name: string;
          email: string;
          language: string;
          rent_eur: number;
        } | null;
        if (!tenant) return false;
        return Math.abs(amount - tenant.rent_eur) <= 1;
      });

      if (match) {
        const tenant = match.torrinha_tenants as {
          id: string;
          name: string;
          email: string;
          language: string;
          rent_eur: number;
        };

        // Update payment as paid
        await supabase
          .from("torrinha_payments")
          .update({
            status: "paid",
            matched_by: "ponto_auto",
            paid_date: today,
            amount_eur: amount,
          })
          .eq("id", match.id);

        // Remove from pending list to avoid double-matching
        const idx = pendingPayments!.indexOf(match);
        if (idx >= 0) pendingPayments!.splice(idx, 1);

        // Send thank-you email
        await sendThankYouEmail(
          { name: tenant.name, email: tenant.email, language: tenant.language },
          { id: match.id, month, amount_eur: amount }
        );

        // Update thankyou_sent_at
        await supabase
          .from("torrinha_payments")
          .update({ thankyou_sent_at: new Date().toISOString() })
          .eq("id", match.id);

        matched++;
      } else {
        // Store as unmatched for review
        await supabase.from("torrinha_unmatched_transactions").insert({
          raw_data: txn,
          amount_eur: amount,
          counterparty: txn.attributes.counterpartName || null,
          description:
            txn.attributes.remittanceInformation ||
            txn.attributes.description ||
            null,
          transaction_date:
            txn.attributes.valueDate?.split("T")[0] || today,
        });

        unmatched++;
      }
    }

    return NextResponse.json({ ok: true, matched, unmatched });
  } catch (err) {
    console.error("Ponto webhook processing error:", err);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
