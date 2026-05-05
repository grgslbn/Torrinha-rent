import { createClient } from "@supabase/supabase-js";
import { verifyWebhookSignature, fetchTransactions } from "@/lib/ponto";
import { NextRequest, NextResponse } from "next/server";

// Use service role for webhook — no user session available
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const { transactions, synchronizedAt } = await fetchTransactions();

    // Filter to incoming credits (positive amounts)
    const credits = transactions.filter((txn) => txn.attributes.amount > 0);

    const supabase = getServiceClient();
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
        const { count } = await supabase
          .from("torrinha_transaction_log")
          .select("*", { count: "exact", head: true })
          .eq("transaction_id", transactionId);

        if ((count ?? 0) > 0) continue;
      }

      // Shadow mode — log only, no matching, no emails, no side effects
      await supabase.from("torrinha_transaction_log").insert({
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

    return NextResponse.json({ ok: true, shadow: true, logged });
  } catch (err) {
    console.error("Ponto shadow webhook error:", err);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
