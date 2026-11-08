import { loadState } from "@/lib/alertStore";
import { escapeHtml, sendMessage } from "@/lib/telegram";

// Sends a draft post through the Loxley bot: to TELEGRAM_CHANNEL_ID if set (bot must be a channel admin),
// otherwise to the owner's private chat. Local-only: requests from other hosts are refused.
export async function POST(request: Request) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    return Response.json({ error: "Only available on localhost." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Missing text." }, { status: 400 });

  const channel = process.env.TELEGRAM_CHANNEL_ID;
  const { ownerChatId } = await loadState();
  const target = channel ? channel : ownerChatId;
  if (target == null) {
    return Response.json({ error: "Connect Telegram first: open the bot and send /start." }, { status: 409 });
  }
  try {
    await sendMessage(target as number, escapeHtml(text.slice(0, 4000)));
    return Response.json({ ok: true, sentTo: channel ? "channel" : "your chat" });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Send failed." }, { status: 502 });
  }
}
