import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

async function main() {
  const month = currentMonthStr();

  const [
    { count: activeTenants },
    { data: payments },
    { count: waitlistCount },
    { count: unmatchedCount },
    { count: inboxPending },
    { data: lastPaymentRows },
  ] = await Promise.all([
    supabase.from("torrinha_tenants").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("torrinha_payments").select("status").eq("month", month),
    supabase.from("torrinha_waitlist").select("*", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("torrinha_unmatched_transactions").select("*", { count: "exact", head: true }).eq("reviewed", false),
    supabase.from("torrinha_inbox").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("torrinha_payments").select("paid_date").eq("status", "paid").not("paid_date", "is", null).order("paid_date", { ascending: false }).limit(1),
  ]);

  const rows = payments ?? [];
  const paidCount = rows.filter((p) => p.status === "paid").length;
  const pendingCount = rows.filter((p) => p.status === "pending").length;
  const overdueCount = rows.filter((p) => p.status === "overdue").length;
  const lastPaymentDate = lastPaymentRows?.[0]?.paid_date ?? "—";

  const dynamicContent = `## Live status (auto-updated on every push)
**Last updated:** ${formatTimestamp()}

| Metric | Value |
|---|---|
| Active tenants | ${activeTenants ?? 0} |
| Current month paid | ${paidCount} |
| Current month pending | ${pendingCount} |
| Current month overdue | ${overdueCount} |
| Waitlist (waiting) | ${waitlistCount ?? 0} |
| Unmatched transactions | ${unmatchedCount ?? 0} |
| Inbox pending | ${inboxPending ?? 0} |
| Last payment received | ${lastPaymentDate} |`;

  const START_MARKER = "<!-- STATUS:START -->";
  const END_MARKER = "<!-- STATUS:END -->";

  let current;
  try {
    current = readFileSync("PROJECT_STATUS.md", "utf-8");
  } catch {
    current = "";
  }

  const startIdx = current.indexOf(START_MARKER);
  const endIdx = current.indexOf(END_MARKER);

  let updated;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace content between markers
    updated =
      current.substring(0, startIdx + START_MARKER.length) +
      "\n" +
      dynamicContent +
      "\n" +
      current.substring(endIdx);
  } else {
    // Markers missing — regenerate full file with defaults
    console.warn("Markers not found in PROJECT_STATUS.md — regenerating.");
    updated = `# Torrinha Parking — Project Status

${START_MARKER}
${dynamicContent}
${END_MARKER}

---

See \`.github/workflows/update-status.yml\` for the automation.
`;
  }

  writeFileSync("PROJECT_STATUS.md", updated);
  console.log("PROJECT_STATUS.md updated at", formatTimestamp());
}

main().catch((err) => {
  console.error("Failed to generate status:", err);
  process.exit(1);
});
