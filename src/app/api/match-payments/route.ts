import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

type DirectTransaction = {
  id: string;
  amount: number;
  counterparty: string | null;
  description: string | null;
  date: string | null;
  iban: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { transaction_ids, transactions: directTransactions } = body;

  // Build transaction list from either source
  let txnList: { id: string; amount: number; counterparty: string | null; description: string | null; date: string | null; iban?: string | null }[];

  if (directTransactions && Array.isArray(directTransactions) && directTransactions.length > 0) {
    // Direct transactions from CSV import
    txnList = (directTransactions as DirectTransaction[]).map((t) => ({
      id: t.id,
      amount: t.amount,
      counterparty: t.counterparty,
      description: t.description,
      date: t.date,
      iban: t.iban,
    }));
  } else if (transaction_ids && Array.isArray(transaction_ids) && transaction_ids.length > 0) {
    // Fetch from unmatched transactions table
    const { data: transactions, error: txnError } = await supabase
      .from("torrinha_unmatched_transactions")
      .select("*")
      .in("id", transaction_ids)
      .eq("reviewed", false);

    if (txnError)
      return NextResponse.json({ error: txnError.message }, { status: 500 });

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    txnList = transactions.map((t) => ({
      id: t.id,
      amount: t.amount_eur,
      counterparty: t.counterparty,
      description: t.description,
      date: t.transaction_date,
    }));
  } else {
    return NextResponse.json(
      { error: "Provide either transaction_ids or transactions array" },
      { status: 400 }
    );
  }

  // Fetch all pending/overdue payments with tenant details
  const { data: payments, error: payError } = await supabase
    .from("torrinha_payments")
    .select("id, tenant_id, month, amount_eur, status, torrinha_tenants(id, name, email, rent_eur, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label))")
    .in("status", ["pending", "overdue"]);

  if (payError)
    return NextResponse.json({ error: payError.message }, { status: 500 });

  if (!payments || payments.length === 0) {
    return NextResponse.json({
      matches: [],
      message: "No pending or overdue payments to match against",
    });
  }

  const paymentList = payments.map((p) => {
    const tenantRaw = p.torrinha_tenants;
    const tenant = (Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw) as {
      id: string;
      name: string;
      email: string;
      rent_eur: number;
      torrinha_spots: { number: number; label: string | null }[];
    } | null;
    return {
      payment_id: p.id,
      month: p.month,
      expected_amount: p.amount_eur ?? tenant?.rent_eur,
      status: p.status,
      tenant_name: tenant?.name,
      tenant_email: tenant?.email,
      spots: tenant?.torrinha_spots?.map((s) => s.label || s.number) ?? [],
    };
  });

  // Call Claude API
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are matching bank transactions to parking rental payments for Torrinha Parking.

BANK TRANSACTIONS:
${JSON.stringify(txnList, null, 2)}

PENDING/OVERDUE PAYMENTS:
${JSON.stringify(paymentList, null, 2)}

Match each transaction to a payment if possible. Consider:
- Amount match (exact or within €1-2 tolerance)
- Counterparty name similarity to tenant name
- Description/remittance info containing tenant name or spot number
- IBAN if available
- Transaction date relative to payment month

Respond ONLY with a JSON array of matches. Each match should have:
- transaction_id: string (from the transaction)
- payment_id: string (from the payment)
- confidence: "high" | "medium" | "low"
- reason: string (brief explanation)

If a transaction cannot be matched, omit it. Example:
[{"transaction_id":"abc","payment_id":"def","confidence":"high","reason":"Exact amount match, counterparty name matches tenant"}]

Respond with ONLY the JSON array, no markdown or explanation.`,
      },
    ],
  });

  // Parse Claude's response
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  let matches;
  try {
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    matches = JSON.parse(jsonStr);
  } catch {
    console.error("Failed to parse Claude response:", text);
    return NextResponse.json(
      { error: "Failed to parse AI response", raw: text },
      { status: 500 }
    );
  }

  return NextResponse.json({ matches });
}
