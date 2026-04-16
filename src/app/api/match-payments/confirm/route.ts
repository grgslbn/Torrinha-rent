import { createClient } from "@/lib/supabase/server";
import { sendThankYouEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { matches } = await request.json();

  if (!matches || !Array.isArray(matches) || matches.length === 0) {
    return NextResponse.json(
      { error: "matches array is required" },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const results = [];

  for (const match of matches) {
    const { transaction_id, payment_id } = match;
    if (!payment_id) continue;

    const isCsvImport = !transaction_id || transaction_id.startsWith("csv-");
    const matchedBy = isCsvImport ? "csv_import" : "claude_ai";

    // Get transaction details (amount, counterpart, date) from DB or the match payload
    let txnAmount: number | null = null;
    let txnCounterpart: string | null = match.counterpart ?? null;
    let txnDescription: string | null = match.description ?? null;
    let txnDate: string | null = match.date ?? null;
    if (!isCsvImport && transaction_id) {
      const { data: txn } = await supabase
        .from("torrinha_unmatched_transactions")
        .select("amount_eur, counterparty, description, transaction_date")
        .eq("id", transaction_id)
        .single();
      txnAmount = txn?.amount_eur ?? null;
      txnCounterpart = txnCounterpart ?? txn?.counterparty ?? null;
      txnDescription = txnDescription ?? txn?.description ?? null;
      txnDate = txnDate ?? txn?.transaction_date ?? null;
    } else if (isCsvImport && match.amount !== undefined) {
      txnAmount = Number(match.amount);
    }

    // Update payment as paid
    const updateData: Record<string, unknown> = {
      status: "paid",
      matched_by: matchedBy,
      paid_date: today,
    };
    if (txnAmount !== null) {
      updateData.amount_eur = txnAmount;
    }

    const { error: payError } = await supabase
      .from("torrinha_payments")
      .update(updateData)
      .eq("id", payment_id);

    if (payError) {
      results.push({ payment_id, error: payError.message });
      continue;
    }

    // Mark unmatched transaction as reviewed (only for DB-sourced)
    if (!isCsvImport && transaction_id) {
      await supabase
        .from("torrinha_unmatched_transactions")
        .update({ reviewed: true })
        .eq("id", transaction_id);
    }

    // Send thank-you email
    const { data: payment } = await supabase
      .from("torrinha_payments")
      .select("id, month, amount_eur, torrinha_tenants(name, email, language)")
      .eq("id", payment_id)
      .single();

    if (payment) {
      const tenantRaw = payment.torrinha_tenants;
      const tenant = (Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw) as {
        name: string;
        email: string;
        language: string;
      } | null;

      if (tenant) {
        await sendThankYouEmail(tenant, {
          id: payment.id,
          month: payment.month,
          amount_eur: payment.amount_eur,
        });

        await supabase
          .from("torrinha_payments")
          .update({ thankyou_sent_at: new Date().toISOString() })
          .eq("id", payment_id);
      }
    }

    // Log transaction match to the bank log
    if (payment) {
      const p = payment as { id: string; month: string; amount_eur: number | null; torrinha_tenants: unknown };
      const tenantRaw = p.torrinha_tenants;
      const tenantForLog = (Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw) as { id?: string } | null;

      try {
        await supabase.from("torrinha_transaction_log").insert({
          source: isCsvImport ? "csv_import" : "manual",
          transaction_id: transaction_id ?? null,
          execution_date: txnDate,
          amount_eur: txnAmount,
          counterpart: txnCounterpart,
          communication: txnDescription,
          match_status: "ai_matched",
          matched_tenant_id: tenantForLog?.id ?? null,
          matched_month: p.month,
        });
      } catch {
        // Log table may not exist yet — fail quietly
      }
    }

    results.push({ payment_id, transaction_id, ok: true });
  }

  return NextResponse.json({ results });
}
