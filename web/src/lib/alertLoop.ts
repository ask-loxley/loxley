import { checkWatches, pollCommands } from "./alerts";

// Local mode only: two background loops inside the Next.js dev server.
// 1. Telegram long-polling for commands.
// 2. Watch checks every ALERT_INTERVAL_SEC (each check spends Blockscout credits).
// On Cloudflare the same work runs through the Telegram webhook and a cron trigger instead.

const g = globalThis as unknown as { __loxleyAlertsStarted?: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startAlertLoops() {
  if (g.__loxleyAlertsStarted || !process.env.TELEGRAM_BOT_TOKEN) return;
  g.__loxleyAlertsStarted = true;

  void (async () => {
    for (;;) {
      try {
        await pollCommands();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Once the deployed app owns the bot through a webhook, local polling must stop.
        if (/webhook/i.test(message)) {
          console.log("[alerts] Telegram webhook is active (deployed app handles the bot). Local polling stopped.");
          return;
        }
        console.error("[alerts] command poll failed:", message);
        await sleep(5000);
      }
    }
  })();

  const intervalSec = Math.max(60, Number(process.env.ALERT_INTERVAL_SEC) || 120);
  void (async () => {
    for (;;) {
      await sleep(intervalSec * 1000);
      try {
        await checkWatches();
      } catch (err) {
        console.error("[alerts] watch check failed:", err instanceof Error ? err.message : err);
      }
    }
  })();

  console.log(`[alerts] Telegram alerts running locally (checks every ${intervalSec}s)`);
}
