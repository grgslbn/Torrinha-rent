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
    .select("id, tenant_id, month, amount_eur, status, torrinha_tenants(id, name, email, rent_eur, notes, torrinha_spots!torrinha_spots_tenant_id_fkey(number, label), torrinha_tenant_contacts(name))")
    .in("status", ["pending", "overdue"]);

  if (payError)
    return NextResponse.json({ error: payError.message }, { status: 500 });

  if (!payments || payments.length === 0) {
    return NextResponse.json({
      matches: [],
      message: "No pending or overdue payments to match against",
    });
  }

  const tenantIds = payments.map((p) => p.tenant_id).filter(Boolean) as string[];

  // Fetch insights and context in parallel
  const [insightsResult, contextResult] = await Promise.all([
    supabase
      .from("torrinha_tenant_insights")
      .select("tenant_id, key, value")
      .in("key", ["known_name", "iban"])
      .in("tenant_id", tenantIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("torrinha_tenant_context")
      .select("tenant_id, type, content")
      .in("tenant_id", tenantIds),
  ]);

  const insights = insightsResult.data ?? [];
  const contextEntries = contextResult.data ?? [];

  const paymentList = payments.map((p) => {
    const tenantRaw = p.torrinha_tenants;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = (Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw) as any;
    const tid = p.tenant_id;
    const knownNames = insights
      .filter((i: { tenant_id: string; key: string }) => i.tenant_id === tid && i.key === "known_name")
      .map((i: { value: string }) => i.value);
    const knownIbans = insights
      .filter((i: { tenant_id: string; key: string }) => i.tenant_id === tid && i.key === "iban")
      .map((i: { value: string }) => i.value);
    const tenantContext = contextEntries
      .filter((c: { tenant_id: string }) => c.tenant_id === tid)
      .map((c: { type: string; content: string }) => `[${c.type}] ${c.content}`);
    const contactNames = (tenant?.torrinha_tenant_contacts ?? [])
      .map((c: { name: string }) => c.name)
      .filter(Boolean);
    return {
      payment_id: p.id,
      month: p.month,
      expected_amount: p.amount_eur ?? tenant?.rent_eur,
      status: p.status,
      tenant_name: tenant?.name,
      spots: tenant?.torrinha_spots?.map((s: { number: number; label: string | null }) => s.label || s.number) ?? [],
      contact_names: contactNames,
      known_names: knownNames,
      known_ibans: knownIbans,
      notes: tenant?.notes ?? null,
      context: tenantContext,
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
- Amount match (within €5 tolerance)
- Counterparty name similarity to tenant name, contact_names, or known_names
- known_ibans: if the transaction IBAN matches a known IBAN, that's a strong signal
- notes and context: operational notes may explain who pays for whom (e.g. a parent pays for a child, a company name pays for an employee)
- Description/remittance info containing a tenant name or spot number
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
