# Torrinha Parking — Project Status

<!-- STATUS:START -->
## Live status (auto-updated on every push)
**Last updated:** 2026-04-28 18:18 UTC

| Metric | Value |
|---|---|
| Active tenants | 13 |
| Current month paid | 10 |
| Current month pending | 0 |
| Current month overdue | 3 |
| Waitlist (waiting) | 1 |
| Unmatched transactions | 0 |
| Inbox pending | 5 |
| Last payment received | 2026-04-16 |
<!-- STATUS:END -->

---

## Infrastructure

| Component | URL / Service |
|-----------|---------------|
| Frontend | [torrinha149.com](https://torrinha149.com) (Vercel) |
| Backend | [Railway](https://torrinha-rent-production.up.railway.app) |
| Database | Supabase (RandomPlayground) |
| Email (outbound) | Resend — parking@mail.torrinha149.com |
| Email (inbound) | Postmark / Resend |
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
- [x] Admin inbox with send/edit/dismiss/delete
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
