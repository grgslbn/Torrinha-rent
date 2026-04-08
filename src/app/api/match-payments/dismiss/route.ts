import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transaction_ids } = await request.json();

  if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return NextResponse.json(
      { error: "transaction_ids array is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("torrinha_unmatched_transactions")
    .update({ reviewed: true })
    .in("id", transaction_ids);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, dismissed: transaction_ids.length });
}
