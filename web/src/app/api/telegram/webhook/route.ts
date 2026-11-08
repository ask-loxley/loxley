import { processWebhookUpdate } from "@/lib/alerts";
import type { TgUpdate } from "@/lib/telegram";

// Telegram pushes bot messages here in production. The secret header proves the call comes from Telegram
// (it is set when registering the webhook with setWebhook's secret_token).
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (update?.update_id != null) {
    try {
      await processWebhookUpdate(update);
    } catch (err) {
      console.error("[telegram] update failed:", err instanceof Error ? err.message : err);
    }
  }
  // Always 200 so Telegram doesn't keep retrying an update that failed on our side.
  return Response.json({ ok: true });
}
