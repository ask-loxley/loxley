import { getDb, onCloudflare } from "./cf";

// Usage limits for the public deployment, so strangers can't drain the OpenRouter and Blockscout budgets.
// Counters live in D1 (fixed windows). Locally there are no limits.

const LIMITS = {
  chat: { perIp: 15, ipWindowSec: 3600, global: 300, globalWindowSec: 86_400 },
  data: { perIp: 30, ipWindowSec: 3600, global: 1500, globalWindowSec: 86_400 },
} as const;

async function hit(bucket: string, windowSec: number): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  const expires = now + windowSec * 1000;
  const row = await (await getDb())
    .prepare(
      `INSERT INTO ratelimit (bucket, n, expires_at) VALUES (?1, 1, ?2)
       ON CONFLICT(bucket) DO UPDATE SET
         n = CASE WHEN expires_at < ?3 THEN 1 ELSE n + 1 END,
         expires_at = CASE WHEN expires_at < ?3 THEN ?2 ELSE expires_at END
       RETURNING n, expires_at`,
    )
    .bind(bucket, expires, now)
    .first<{ n: number; expires_at: number }>();
  return { count: row?.n ?? 1, resetAt: row?.expires_at ?? expires };
}

/** Returns a 429 response when the caller is over a limit, or null to continue. */
export async function limitRequest(request: Request, kind: keyof typeof LIMITS): Promise<Response | null> {
  if (!onCloudflare()) return null;
  const l = LIMITS[kind];
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  try {
    const [mine, everyone] = await Promise.all([
      hit(`${kind}:ip:${ip}`, l.ipWindowSec),
      hit(`${kind}:global`, l.globalWindowSec),
    ]);
    const over = mine.count > l.perIp ? mine : everyone.count > l.global ? everyone : null;
    if (!over) return null;
    const retryAfter = Math.max(1, Math.ceil((over.resetAt - Date.now()) / 1000));
    const message =
      over === mine
        ? `You've hit the limit of ${l.perIp} requests per hour. Try again in ${Math.ceil(retryAfter / 60)} minutes.`
        : "Loxley has reached today's usage limit. Please come back tomorrow.";
    return Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  } catch {
    return null; // never block users because the limiter itself failed
  }
}

/** Housekeeping: drop expired counters. Called from the cron tick. */
export async function pruneRateLimits() {
  if (!onCloudflare()) return;
  await (await getDb()).prepare("DELETE FROM ratelimit WHERE expires_at < ?").bind(Date.now()).run();
}
