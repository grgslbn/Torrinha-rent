import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// Static constants — update when infrastructure/features change
// ============================================================

const INFRASTRUCTURE = [
  ["Frontend", "[torrinha149.com](https://torrinha149.com) (Vercel)"],
  ["Backend", "[Railway](https://torrinha-rent-production.up.railway.app)"],
  ["Database", "Supabase (project `bretjrquztvkylilxnbg`)"],
  ["Email (outbound)", "Resend — parking@mail.torrinha149.com"],
  ["Email (inbound)", "Postmark → Railway webhook"],
  ["Domain", "torrinha149.com (Vercel DNS), mail.torrinha149.com (Postmark)"],
  ["AI", "Claude API (`claude-sonnet-4-20250514`) — payment matching, email agent, email personalisation"],
];

const TABLES = [
  { name: "torrinha_tenants", purpose: "Tenant records (active, upcoming, inactive)" },
  { name: "torrinha_spots", purpose: "Parking spots (17 total)" },
  { name: "torrinha_spot_assignments", purpose: "Spot ↔ tenant assignments with date ranges" },
  { name: "torrinha_payments", purpose: "Monthly payment tracking" },
  { name: "torrinha_remotes", purpose: "Remote controls + deposits" },
  { name: "torrinha_waitlist", purpose: "Public waitlist signups" },
  { name: "torrinha_unmatched_transactions", purpose: "Bank transactions pending review" },
  { name: "torrinha_inbox", purpose: "Inbound emails + Claude draft replies" },
  { name: "torrinha_email_templates", purpose: "Editable email templates (PT/EN)" },
  { name: "torrinha_email_log", purpose: "All email communications (inbound + outbound)" },
  { name: "torrinha_tenant_contacts", purpose: "Additional contacts per tenant" },
  { name: "torrinha_tenant_context", purpose: "Rich context per tenant (relationship notes, pasted emails, agreements)" },
  { name: "torrinha_settings", purpose: "System settings (key-value store)" },
  { name: "torrinha_gc_tokens", purpose: "GoCardless API token storage" },
  { name: "torrinha_transaction_log", purpose: "Full bank transaction log for audit" },
];

const FEATURES = [
  {
    category: "Core",
    items: [
      "Tenant management — CRUD, detail panel (slide-over), multi-spot, contacts, context store",
      "Spot management — 17 spots, labels, owner spots, spot assignments with date ranges",
      "Payment tracking — monthly, date range, CSV export, Claude AI matching",
      "Remote control tracking — issue, return, deposit management",
      "Public waitlist with T&Cs (PT/EN)",
    ],
  },
  {
    category: "Spot Assignments",
    items: [
      "Time-aware spot ↔ tenant assignments (start_date, end_date)",
      "Upcoming tenant support — assign future tenants to occupied spots",
      "Running (indefinite) vs fixed end-date contracts",
      "Daily auto-transition cron — upcoming → active, active → inactive",
      "Overlap prevention (Supabase exclusion constraint)",
    ],
  },
  {
    category: "Payments",
    items: [
      "Monthly payment generation (auto on 1st via cron)",
      "Manual mark-as-paid",
      "CSV bank statement import with Claude AI matching",
      "Zapier/Ponto webhook for bank transactions",
      "Auto-match incoming credits (±€1 tolerance)",
      "Unmatched transaction review panel",
    ],
  },
  {
    category: "Email System",
    items: [
      "Bilingual email templates (PT/EN) — editable in admin",
      "LLM-personalised payment emails (Claude drafts, static fallback)",
      "Payment thank-you + reminder emails",
      "Owner unpaid alerts (5th) + overdue escalation (15th)",
      "Owner CC/BCC on all outbound emails (configurable in Settings)",
      "Tenant contacts CC — additional recipients per tenant",
      "Email log — all inbound + outbound stored in torrinha_email_log",
      "Email preview and test send page",
      "Dry-run mode (EMAIL_DRY_RUN)",
    ],
  },
  {
    category: "Smart Email Agent",
    items: [
      "Inbound email processing (parking@mail.torrinha149.com via Postmark)",
      "Claude-powered classification and reply drafting",
      "Admin inbox with send/edit/dismiss/delete",
      "Auto-send for high-confidence waitlist enquiries",
      "Urgent email forwarding to owner",
    ],
  },
  {
    category: "Tenant Management",
    items: [
      "Slide-over detail panel — all tenant fields editable",
      "Spot assignment section — running/set-date toggle, assignment history",
      "Contacts section — multiple contacts per tenant with CC toggle",
      "Context store — rich notes (relationship, communication, agreement)",
      "Communications timeline — full email history per tenant",
      "Payment history — last 6 months in detail panel",
      "Status badges — Active, Upcoming, Inactive",
    ],
  },
  {
    category: "Dashboard",
    items: [
      "Revenue summary — expected vs received vs delta",
      "17-spot payment status grid with click-to-detail",
      "6-month payment history table",
      "Quick count badges — remotes, deposits, waitlist, unmatched",
      "Spot transition indicators for upcoming assignments",
    ],
  },
  {
    category: "Cron Jobs (Railway)",
    items: [
      "1st — Generate pending payment rows",
      "5th — Owner unpaid alert",
      "8th — Tenant payment reminders (LLM-personalised)",
      "15th — Mark overdue + owner escalation",
      "Daily 06:00 — Spot assignment transitions",
    ],
  },
  {
    category: "Design System",
    items: [
      "Intercom-inspired warm palette — off-white (#faf9f6), orange accent (#ff5600), oat borders",
      "CSS custom properties (design tokens) for colors, radii, typography",
      "Inter font with negative tracking on headings",
      "Shared UI components — Button, Badge, Card, SectionLabel",
      "All pages on token system — zero stray Tailwind blue/gray primitives",
    ],
  },
];

// ============================================================
// Helpers
// ============================================================

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function mdTable(headers, rows) {
  const cols = headers.length;
  const header = `| ${headers.join(" | ")} |`;
  const sep = `|${headers.map(() => "---|").join("")}`;
  const body = rows.map((r) => `| ${r.slice(0, cols).join(" | ")} |`).join("\n");
  return [header, sep, body].join("\n");
}

// ============================================================
// Data fetching
// ============================================================

async function fetchMetrics() {
  const month = currentMonthStr();

  const [
    { count: activeTenants },
    { count: upcomingTenants },
    { count: inactiveTenants },
    { count: totalSpots },
    { data: payments },
    { count: waitlistCount },
    { count: unmatchedCount },
    { count: inboxPending },
    { count: emailLogCount },
    { count: contextCount },
    { data: lastPaymentRows },
  ] = await Promise.all([
    supabase.from("torrinha_tenants").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("torrinha_tenants").select("*", { count: "exact", head: true }).eq("status", "upcoming"),
    supabase.from("torrinha_tenants").select("*", { count: "exact", head: true }).eq("status", "inactive"),
    supabase.from("torrinha_spots").select("*", { count: "exact", head: true }),
    supabase.from("torrinha_payments").select("status").eq("month", month),
    supabase.from("torrinha_waitlist").select("*", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("torrinha_unmatched_transactions").select("*", { count: "exact", head: true }).eq("reviewed", false),
    supabase.from("torrinha_inbox").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("torrinha_email_log").select("*", { count: "exact", head: true }),
    supabase.from("torrinha_tenant_context").select("*", { count: "exact", head: true }),
    supabase.from("torrinha_payments").select("paid_date").eq("status", "paid").not("paid_date", "is", null).order("paid_date", { ascending: false }).limit(1),
  ]);

  const rows = payments ?? [];
  return {
    activeTenants: activeTenants ?? 0,
    upcomingTenants: upcomingTenants ?? 0,
    inactiveTenants: inactiveTenants ?? 0,
    totalSpots: totalSpots ?? 0,
    paidCount: rows.filter((p) => p.status === "paid").length,
    pendingCount: rows.filter((p) => p.status === "pending").length,
    overdueCount: rows.filter((p) => p.status === "overdue").length,
    waitlistCount: waitlistCount ?? 0,
    unmatchedCount: unmatchedCount ?? 0,
    inboxPending: inboxPending ?? 0,
    emailLogCount: emailLogCount ?? 0,
    contextCount: contextCount ?? 0,
    lastPaymentDate: lastPaymentRows?.[0]?.paid_date ?? "—",
    month,
  };
}

async function fetchTableCounts() {
  const results = await Promise.all(
    TABLES.map(async (t) => {
      const { count, error } = await supabase
        .from(t.name)
        .select("*", { count: "exact", head: true });
      return { ...t, count: error ? "—" : (count ?? 0) };
    })
  );
  return results;
}

// ============================================================
// Renderers
// ============================================================

function renderMetrics(m) {
  return `## Live status (auto-updated on every push)
**Last updated:** ${formatTimestamp()}

${mdTable(
    ["Metric", "Value"],
    [
      ["Active tenants", m.activeTenants],
      ["Upcoming tenants", m.upcomingTenants],
      ["Inactive tenants", m.inactiveTenants],
      ["Total spots", m.totalSpots],
      [`${m.month} paid`, m.paidCount],
      [`${m.month} pending`, m.pendingCount],
      [`${m.month} overdue`, m.overdueCount],
      ["Waitlist (waiting)", m.waitlistCount],
      ["Unmatched transactions", m.unmatchedCount],
      ["Inbox pending", m.inboxPending],
      ["Email log entries", m.emailLogCount],
      ["Tenant context entries", m.contextCount],
      ["Last payment received", m.lastPaymentDate],
    ]
  )}`;
}

function renderInfrastructure() {
  return mdTable(["Component", "URL / Service"], INFRASTRUCTURE);
}

function renderTables(tableCounts) {
  return mdTable(
    ["Table", "Purpose", "Rows"],
    tableCounts.map((t) => [t.name, t.purpose, t.count])
  );
}

function renderFeatures() {
  return FEATURES.map(
    ({ category, items }) =>
      `### ${category}\n${items.map((item) => `- ${item}`).join("\n")}`
  ).join("\n\n");
}

// ============================================================
// Main
// ============================================================

async function main() {
  const [metrics, tableCounts] = await Promise.all([
    fetchMetrics(),
    fetchTableCounts(),
  ]);

  const content = `# Torrinha Parking — Project Status

<!-- STATUS:START -->
${renderMetrics(metrics)}
<!-- STATUS:END -->

---

## Infrastructure

${renderInfrastructure()}

---

## Database Tables

${renderTables(tableCounts)}

---

## Features

${renderFeatures()}

---

*Auto-generated by \`scripts/generate-status.mjs\` on every push to main.*
*See \`.github/workflows/update-status.yml\` for the automation.*
`;

  writeFileSync("PROJECT_STATUS.md", content);
  console.log("PROJECT_STATUS.md fully regenerated at", formatTimestamp());
}

main().catch((err) => {
  console.error("Failed to generate status:", err);
  process.exit(1);
});
