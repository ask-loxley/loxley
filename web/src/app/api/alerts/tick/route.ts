import { checkWatches } from "@/lib/alerts";
import { pruneRateLimits } from "@/lib/rateLimit";

// Called by the Cloudflare cron trigger (see worker.mjs) to run all Telegram watches once.
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-loxley-tick") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  await Promise.allSettled([checkWatches(), pruneRateLimits()]);
  return Response.json({ ok: true, at: new Date().toISOString() });
}
