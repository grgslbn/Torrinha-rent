import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { payment_id } = await request.json();
  if (!payment_id)
    return NextResponse.json({ error: "payment_id is required" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];

  // Get payment to find the tenant's rent amount
  const { data: payment } = await supabase
    .from("torrinha_payments")
    .select("*, torrinha_tenants(rent_eur)")
    .eq("id", payment_id)
    .single();

  if (!payment)
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const amount =
    payment.amount_eur ??
    (payment.torrinha_tenants as { rent_eur: number } | null)?.rent_eur;

  const { data, error } = await supabase
    .from("torrinha_payments")
    .update({
      status: "paid",
      paid_date: today,
      amount_eur: amount,
      matched_by: "manual",
    })
    .eq("id", payment_id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
