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

    // Get transaction amount from DB (only for DB-sourced transactions)
    let txnAmount: number | null = null;
    if (!isCsvImport && transaction_id) {
      const { data: txn } = await supabase
        .from("torrinha_unmatched_transactions")
        .select("amount_eur")
        .eq("id", transaction_id)
        .single();
      txnAmount = txn?.amount_eur ?? null;
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

    results.push({ payment_id, transaction_id, ok: true });
  }

  return NextResponse.json({ results });
}
