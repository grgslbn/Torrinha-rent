import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const RAILWAY_URL = process.env.RAILWAY_URL || "https://torrinha-rent-production.up.railway.app";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inbox_id, subject, body } = await request.json();
  if (!inbox_id || !body) {
    return NextResponse.json({ error: "inbox_id and body required" }, { status: 400 });
  }

  // Proxy to Railway send-reply endpoint
  const res = await fetch(`${RAILWAY_URL}/email/send-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Secret": process.env.CRON_SECRET || "",
    },
    body: JSON.stringify({ inbox_id, subject, body }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error || "Failed to send reply" },
      { status: res.status }
    );
  }

  return NextResponse.json({ ok: true });
}
