// Runs once when the Next.js server starts. Starts the local Telegram alert loops on Node.js only.
// On Cloudflare (LOXLEY_RUNTIME=cloudflare) alerts run through the webhook and cron trigger instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.LOXLEY_RUNTIME !== "cloudflare") {
    const { startAlertLoops } = await import("./lib/alertLoop");
    startAlertLoops();
  }
}
