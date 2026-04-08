import { createClient } from "@/lib/supabase/server";
import { sendGeneratedEmail, type EmailTemplate } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

const VALID_TEMPLATES: EmailTemplate[] = [
  "thank-you",
  "reminder",
  "owner-unpaid",
  "owner-overdue",
  "waitlist-confirmation",
];

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template, language, recipient } = await request.json();

  if (!template || !VALID_TEMPLATES.includes(template)) {
    return NextResponse.json(
      { error: `Invalid template. Use one of: ${VALID_TEMPLATES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!recipient) {
    return NextResponse.json({ error: "recipient is required" }, { status: 400 });
  }

  const lang = language === "pt" ? "pt" : "en";
  const month = currentMonthStr();

  // Dummy data for test emails
  const data = {
    tenant_name: "João Silva",
    amount: 150,
    month,
    spot: "Spot 7",
    waitlist_name: "João Silva",
    unpaid_tenants: [
      { name: "João Silva", spots: "Spot 7", rent_eur: 150 },
      { name: "Maria Santos", spots: "Spot 3", rent_eur: 200 },
    ],
  };

  const result = await sendGeneratedEmail(recipient, template, lang, data);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to send" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
