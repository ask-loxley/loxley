// Minimal Telegram Bot API client. Docs: https://core.telegram.org/bots/api

export type TgUpdate = {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { username?: string; first_name?: string }; text?: string };
};

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is missing. Add it to web/.env.local.");
  return t;
}

async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => null)) as { ok: boolean; result: T; description?: string } | null;
  if (!data?.ok) throw new Error(`Telegram ${method} failed: ${data?.description ?? res.status}`);
  return data.result;
}

/** Long-polls for new messages. Returns after `waitSec` seconds if nothing arrives. */
export const getUpdates = (offset: number, waitSec = 25) =>
  call<TgUpdate[]>("getUpdates", { offset, timeout: waitSec, allowed_updates: ["message"] }, (waitSec + 10) * 1000);

export const sendMessage = (chatId: number, html: string) =>
  call("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });

export const sendTyping = (chatId: number) => call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => null);

let botCache: { username: string } | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  if (botCache) return botCache.username;
  try {
    const me = await call<{ username: string }>("getMe", {});
    botCache = { username: me.username };
    return me.username;
  } catch {
    return null;
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Converts the agent's light markdown (**bold**, [text](url), "- " bullets) into Telegram HTML. */
export function markdownToTelegram(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      let out = escapeHtml(line.replace(/^#+\s*/, ""));
      out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t: string, u: string) => `<a href="${u}">${t}</a>`);
      out = out.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      out = out.replace(/^[-*]\s+/, "• ");
      return out;
    })
    .join("\n");
}
