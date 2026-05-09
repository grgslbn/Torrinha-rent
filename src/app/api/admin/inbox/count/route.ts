import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { count } = await supabase
    .from("torrinha_inbox")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({ count: count ?? 0 });
}
