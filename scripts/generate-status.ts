import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthShort(m: string): string {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
}

async function main() {
  const month = currentMonthStr();

  // Fetch live data
  const [
    { count: activeCount },
    { data: payments },
    { count: waitlistCount },
    { count: unmatchedCount },
    { count: pendingInbox },
    { data: tenants },
  ] = await Promise.all([
    supabase.from("torrinha_tenants").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("torrinha_payments").select("status, amount_eur").eq("month", month),
    supabase.from("torrinha_waitlist").select("*", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("torrinha_unmatched_transactions").select("*", { count: "exact", head: true }).eq("reviewed", false),
    supabase.from("torrinha_inbox").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("torrinha_tenants").select("rent_eur").eq("active", true),
  ]);

  const allPayments = payments ?? [];
  const paidCount = allPayments.filter(p => p.status === "paid").length;
  const pendingCount = allPayments.filter(p => p.status === "pending").length;
  const overdueCount = allPayments.filter(p => p.status === "overdue").length;
  const totalExpected = (tenants ?? []).reduce((s, t) => s + Number(t.rent_eur), 0);
  const totalReceived = allPayments
    .filter(p => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_eur ?? 0), 0);

  const now = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

  const md = `# Torrinha Parking — Project Status

> Auto-generated from live Supabase data on every push to main.
> Last updated: **${now}**

---

## Live Status — ${formatMonthShort(month)}

| Metric | Value |
|--------|-------|
| Active tenants | ${activeCount ?? 0} |
| Paid this month | ${paidCount} |
| Pending | ${pendingCount} |
| Overdue | ${overdueCount} |
| Expected revenue | €${totalExpected.toFixed(2)} |
| Received revenue | €${totalReceived.toFixed(2)} |
| Waitlist | ${waitlistCount ?? 0} |
| Unmatched transactions | ${unmatchedCount ?? 0} |
| Inbox pending | ${pendingInbox ?? 0} |

---

## Infrastructure

| Component | URL / Service |
|-----------|---------------|
| Frontend | [torrinha149.com](https://torrinha149.com) (Vercel) |
| Backend | [Railway](https://torrinha-rent-production.up.railway.app) |
| Database | Supabase (RandomPlayground) |
| Email | Resend — parking@mail.torrinha149.com |
| Domain | torrinha149.com (Vercel DNS) |

---

## Features

### Core
- [x] Tenant management (CRUD, multi-spot, inline editing)
- [x] Spot management (17 spots, labels, owner spots)
- [x] Payment tracking (monthly, date range, CSV export)
- [x] Remote control tracking (issue, return, deposits)
- [x] Public waitlist with T&Cs (PT/EN)

### Payments
- [x] Monthly payment generation (auto on 1st via cron)
- [x] Manual mark-as-paid
- [x] CSV bank statement import with Claude AI matching
- [x] Zapier webhook for Ponto bank transactions
- [x] Auto-match incoming credits (±€1 tolerance)
- [x] Unmatched transaction review panel

### Email System
- [x] Bilingual email templates (PT/EN) — editable in admin
- [x] Payment thank-you emails
- [x] Payment reminders (8th of month)
- [x] Owner unpaid alerts (5th of month)
- [x] Owner overdue escalation (15th of month)
- [x] Email preview and test send page
- [x] Dry-run mode (EMAIL_DRY_RUN)

### Smart Email Agent
- [x] Inbound email processing (parking@mail.torrinha149.com)
- [x] Claude-powered classification and reply drafting
- [x] Admin inbox with send/edit/dismiss
- [x] Auto-send for high-confidence waitlist enquiries
- [x] Urgent email forwarding to owner

### Dashboard
- [x] Revenue summary (expected vs received vs delta)
- [x] 17-spot payment status grid with click-to-detail
- [x] 6-month payment history table
- [x] Quick count badges (remotes, deposits, waitlist, unmatched)

### Cron Jobs (Railway)
- [x] 1st — Generate pending payment rows
- [x] 5th — Owner unpaid alert
- [x] 8th — Tenant payment reminders
- [x] 15th — Mark overdue + owner escalation

---

## Database Tables

| Table | Purpose |
|-------|---------|
| torrinha_tenants | Tenant records |
| torrinha_spots | Parking spots (17 total) |
| torrinha_payments | Monthly payment tracking |
| torrinha_remotes | Remote control inventory |
| torrinha_waitlist | Prospect waiting list |
| torrinha_unmatched_transactions | Bank transactions pending review |
| torrinha_inbox | Inbound email agent inbox |
| torrinha_email_templates | Editable email templates |

---

## Environment Variables

### Vercel (Next.js)
\`\`\`
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
ANTHROPIC_API_KEY
PARKING_EMAIL
CRON_SECRET
RAILWAY_URL
OWNER_EMAIL
\`\`\`

### Railway (Express)
\`\`\`
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
ANTHROPIC_API_KEY
PARKING_EMAIL
CRON_SECRET
OWNER_EMAIL
EMAIL_FROM
EMAIL_DRY_RUN
ZAPIER_WEBHOOK_SECRET
RESEND_INBOUND_SECRET
AUTO_SEND_WAITLIST
\`\`\`
`;

  writeFileSync("PROJECT_STATUS.md", md);
  console.log("PROJECT_STATUS.md updated at", now);
}

main().catch((err) => {
  console.error("Failed to generate status:", err);
  process.exit(1);
});
