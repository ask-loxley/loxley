import { connection } from "next/server";
import { loadState } from "@/lib/alertStore";
import { getBotUsername } from "@/lib/telegram";

// Tells the app which keys are configured. Returns booleans only, never the keys.
export async function GET() {
  await connection();
  const [bot, alerts] = await Promise.all([getBotUsername(), loadState()]);
  return Response.json({
    llm: Boolean(process.env.OPENROUTER_API_KEY),
    chain: Boolean(process.env.BLOCKSCOUT_API_KEY),
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5.5",
    telegram: {
      bot,
      connected: alerts.ownerChatId != null,
      watches: alerts.watches.length,
    },
  });
}
