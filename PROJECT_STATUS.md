# Torrinha Parking — Project Status

<!-- STATUS:START -->
## Live status (auto-updated on every push)
**Last updated:** 2026-05-05 14:05 UTC

| Metric | Value |
|---|---|
| Active tenants | 15 |
| Upcoming tenants | 0 |
| Inactive tenants | 0 |
| Total spots | 17 |
| 2026-05 paid | 1 |
| 2026-05 pending | 12 |
| 2026-05 overdue | 0 |
| Waitlist (waiting) | 1 |
| Unmatched transactions | 0 |
| Inbox pending | 5 |
| Email log entries | 2 |
| Tenant context entries | 0 |
| Last payment received | 2026-05-05 |
<!-- STATUS:END -->

---

## Infrastructure

| Component | URL / Service |
|---|---|
| Frontend | [torrinha149.com](https://torrinha149.com) (Vercel) |
| Backend | [Railway](https://torrinha-rent-production.up.railway.app) |
| Database | Supabase (project `bretjrquztvkylilxnbg`) |
| Email (outbound) | Resend — parking@mail.torrinha149.com |
| Email (inbound) | Postmark → Railway webhook |
| Domain | torrinha149.com (Vercel DNS), mail.torrinha149.com (Postmark) |
| AI | Claude API (`claude-sonnet-4-20250514`) — payment matching, email agent, email personalisation |

---

## Database Tables

| Table | Purpose | Rows |
|---|---|---|
| torrinha_tenants | Tenant records (active, upcoming, inactive) | 15 |
| torrinha_spots | Parking spots (17 total) | 17 |
| torrinha_spot_assignments | Spot ↔ tenant assignments with date ranges | 17 |
| torrinha_payments | Monthly payment tracking | 268 |
| torrinha_remotes | Remote controls + deposits | 0 |
| torrinha_waitlist | Public waitlist signups | 1 |
| torrinha_unmatched_transactions | Bank transactions pending review | 0 |
| torrinha_inbox | Inbound emails + Claude draft replies | 9 |
| torrinha_email_templates | Editable email templates (PT/EN) | 8 |
| torrinha_email_log | All email communications (inbound + outbound) | 2 |
| torrinha_tenant_contacts | Additional contacts per tenant | 0 |
| torrinha_tenant_context | Rich context per tenant (relationship notes, pasted emails, agreements) | 0 |
| torrinha_settings | System settings (key-value store) | 3 |
| torrinha_gc_tokens | GoCardless API token storage | 0 |
| torrinha_transaction_log | Full bank transaction log for audit | 5 |

---

## Features

### Core
- Tenant management — CRUD, detail panel (slide-over), multi-spot, contacts, context store
- Spot management — 17 spots, labels, owner spots, spot assignments with date ranges
- Payment tracking — monthly, date range, CSV export, Claude AI matching
- Remote control tracking — issue, return, deposit management
- Public waitlist with T&Cs (PT/EN)

### Spot Assignments
- Time-aware spot ↔ tenant assignments (start_date, end_date)
- Upcoming tenant support — assign future tenants to occupied spots
- Running (indefinite) vs fixed end-date contracts
- Daily auto-transition cron — upcoming → active, active → inactive
- Overlap prevention (Supabase exclusion constraint)

### Payments
- Monthly payment generation (auto on 1st via cron)
- Manual mark-as-paid
- CSV bank statement import with Claude AI matching
- Zapier/Ponto webhook for bank transactions
- Auto-match incoming credits (±€1 tolerance)
- Unmatched transaction review panel

### Email System
- Bilingual email templates (PT/EN) — editable in admin
- LLM-personalised payment emails (Claude drafts, static fallback)
- Payment thank-you + reminder emails
- Owner unpaid alerts (5th) + overdue escalation (15th)
- Owner CC/BCC on all outbound emails (configurable in Settings)
- Tenant contacts CC — additional recipients per tenant
- Email log — all inbound + outbound stored in torrinha_email_log
- Email preview and test send page
- Dry-run mode (EMAIL_DRY_RUN)

### Smart Email Agent
- Inbound email processing (parking@mail.torrinha149.com via Postmark)
- Claude-powered classification and reply drafting
- Admin inbox with send/edit/dismiss/delete
- Auto-send for high-confidence waitlist enquiries
- Urgent email forwarding to owner

### Tenant Management
- Slide-over detail panel — all tenant fields editable
- Spot assignment section — running/set-date toggle, assignment history
- Contacts section — multiple contacts per tenant with CC toggle
- Context store — rich notes (relationship, communication, agreement)
- Communications timeline — full email history per tenant
- Payment history — last 6 months in detail panel
- Status badges — Active, Upcoming, Inactive

### Dashboard
- Revenue summary — expected vs received vs delta
- 17-spot payment status grid with click-to-detail
- 6-month payment history table
- Quick count badges — remotes, deposits, waitlist, unmatched
- Spot transition indicators for upcoming assignments

### Cron Jobs (Railway)
- 1st — Generate pending payment rows
- 5th — Owner unpaid alert
- 8th — Tenant payment reminders (LLM-personalised)
- 15th — Mark overdue + owner escalation
- Daily 06:00 — Spot assignment transitions

### Design System
- Intercom-inspired warm palette — off-white (#faf9f6), orange accent (#ff5600), oat borders
- CSS custom properties (design tokens) for colors, radii, typography
- Inter font with negative tracking on headings
- Shared UI components — Button, Badge, Card, SectionLabel
- All pages on token system — zero stray Tailwind blue/gray primitives

---

*Auto-generated by `scripts/generate-status.mjs` on every push to main.*
*See `.github/workflows/update-status.yml` for the automation.*
