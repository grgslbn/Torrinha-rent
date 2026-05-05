import cron from "node-cron";

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

async function callCron(path: string) {
  const label = path.replace("/cron/", "");
  console.log(`[cron] Triggering ${label}...`);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": process.env.CRON_SECRET || "",
      },
    });

    const data = await res.json();
    console.log(`[cron] ${label} response:`, data);
  } catch (err) {
    console.error(`[cron] ${label} error:`, err);
  }
}

export function startCrons() {
  // 1st of month 07:00 UTC — create pending payment rows
  cron.schedule("0 7 1 * *", () => callCron("/cron/reset-month"), {
    timezone: "UTC",
  });

  // 5th 08:00 UTC — email owner unpaid list
  cron.schedule("0 8 5 * *", () => callCron("/cron/alert-owner-5"), {
    timezone: "UTC",
  });

  // 8th 08:00 UTC — email unpaid tenants
  cron.schedule("0 8 8 * *", () => callCron("/cron/remind-tenants"), {
    timezone: "UTC",
  });

  // 15th 08:00 UTC — mark overdue + email owner
  cron.schedule("0 8 15 * *", () => callCron("/cron/escalate-owner"), {
    timezone: "UTC",
  });

  // Daily 06:00 UTC — auto-transition future→active and active→inactive
  cron.schedule("0 6 * * *", () => callCron("/cron/transition-spots"), {
    timezone: "UTC",
  });

  // [shadow disabled — Zapier field mapping fixed, no longer needed]
  // cron.schedule("0 */6 * * *", () => callCron("/cron/ponto-shadow"), { timezone: "UTC" });

  console.log("[cron] Scheduled: reset-month(1st), alert-owner(5th), remind-tenants(8th), escalate(15th), transition-spots(daily 06:00)");
}
