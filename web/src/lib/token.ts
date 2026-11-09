// The official $LOXLEY token. Stored in the kv table (key "loxley-token"), not in code, so the contract address
// can go live the moment it exists without a redeploy:
//   wrangler d1 execute loxley --remote --command "INSERT INTO kv (k, v, updated_at) VALUES ('loxley-token', '{\"ca\":\"0x...\",\"pons\":\"https://...\"}', 0) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
// Locally the same JSON lives in web/data/kv-loxley-token.json.

import { EXPLORER_URL, isAddress } from "./blockscout";
import { kvGet } from "./kv";

export type LoxleyToken = {
  ca: string;
  pons: string | null;
  explorerUrl: string;
  dexscreenerUrl: string;
};

let cache: { at: number; value: LoxleyToken | null } | null = null;

/** The official $LOXLEY contract, or null before launch. Cached for a minute per worker. */
export async function loxleyToken(): Promise<LoxleyToken | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const raw = await kvGet<{ ca?: string; pons?: string }>("loxley-token");
  const ca = raw?.ca?.trim();
  const value =
    ca && isAddress(ca)
      ? {
          ca,
          pons: raw?.pons?.startsWith("https://") ? raw.pons : null,
          explorerUrl: `${EXPLORER_URL}/token/${ca}`,
          dexscreenerUrl: `https://dexscreener.com/robinhood/${ca}`,
        }
      : null;
  cache = { at: Date.now(), value };
  return value;
}

/** A line for the agent's system prompt, so it always gives the right CA and calls out copies. */
export async function tokenPromptNote(): Promise<string> {
  const t = await loxleyToken();
  if (!t) {
    return "- $LOXLEY has not launched yet. If asked for its contract address, say it will be posted only by @askloxleycom on X and on askloxley.com, and that any token called Loxley today is not official.";
  }
  return `- The official $LOXLEY contract address is ${t.ca} (Robinhood Chain). Give exactly this address when asked, and say it is also shown on askloxley.com. Any other token named Loxley or $LOXLEY is not official. You are Loxley's agent, so mention that you are affiliated when talking about $LOXLEY, never predict its price and never tell anyone to buy it.`;
}
