import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function htmlPage(title: string, heading: string, body: string, isError = false): NextResponse {
  const accentColor = isError ? "#dc2626" : "#d97706";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Torrinha Parking</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, sans-serif; background: #faf9f7; color: #1c1917; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 2rem; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 2.5rem 3rem; max-width: 480px; width: 100%; text-align: center; }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; font-weight: 700; color: ${accentColor}; margin-bottom: 0.75rem; }
    p { font-size: 0.9rem; color: #57534e; line-height: 1.6; }
    .brand { margin-top: 2rem; font-size: 0.75rem; color: #a8a29e; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isError ? "⚠️" : "✅"}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <p class="brand">Torrinha Parking</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: isError ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return htmlPage("Invalid link", "Invalid link", "No approval token was provided.", true);
  }

  const supabase = getServiceClient();

  const { data: emailLog, error } = await supabase
    .from("torrinha_email_log")
    .select("id, to_email, from_email, subject, body, status, metadata")
    .eq("approval_token", token)
    .maybeSingle();

  if (error || !emailLog) {
    return new NextResponse(
      htmlPage("Not found", "Link not found", "This approval link is invalid or has expired.", true).body,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (emailLog.status === "approved") {
    return htmlPage("Already sent", "Email already sent", `The email to <strong>${emailLog.to_email}</strong> was already approved and sent.`);
  }

  if (emailLog.status !== "dry_run") {
    return htmlPage("Cannot approve", "Cannot approve this email", "This email is not in a pending dry-run state.", true);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.PARKING_EMAIL || process.env.EMAIL_FROM || "parking@mail.torrinha149.com";

  const metadata = (emailLog.metadata ?? {}) as Record<string, unknown>;
  const ccAddresses = Array.isArray(metadata.cc_addresses) ? (metadata.cc_addresses as string[]) : [];

  const ccPayload = ccAddresses.length > 0 ? { cc: ccAddresses } : {};

  const { error: sendError } = await resend.emails.send({
    from,
    to: emailLog.to_email,
    ...ccPayload,
    subject: emailLog.subject,
    text: emailLog.body,
  });

  if (sendError) {
    return htmlPage(
      "Send failed",
      "Failed to send email",
      `There was an error sending the email: ${sendError.message}`,
      true
    );
  }

  await supabase
    .from("torrinha_email_log")
    .update({ status: "approved" })
    .eq("id", emailLog.id);

  return htmlPage(
    "Email sent",
    "Email sent successfully",
    `The email to <strong>${emailLog.to_email}</strong> has been sent.${ccAddresses.length > 0 ? ` CC'd: ${ccAddresses.join(", ")}.` : ""}`
  );
}
