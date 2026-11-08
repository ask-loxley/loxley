// USD prices from DefiLlama's free coins API (no key). Robinhood Chain's key there is "robinhood".
// Docs: https://defillama.com/docs/api (coins.llama.fi)

const LLAMA = "https://coins.llama.fi";
export const ETH_COIN = "coingecko:ethereum";

export const coinId = (tokenAddress: string) => `robinhood:${tokenAddress.toLowerCase()}`;

/** Current prices keyed by coin id. Missing coins are simply absent. */
export async function currentPrices(coins: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < coins.length; i += 80) {
    const chunk = coins.slice(i, i + 80);
    const res = await fetch(`${LLAMA}/prices/current/${chunk.join(",")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    for (const [id, v] of Object.entries((body?.coins ?? {}) as Record<string, { price?: number }>)) {
      if (typeof v.price === "number") out[id.toLowerCase()] = v.price;
    }
  }
  return out;
}

/**
 * Historical prices for many (coin, unix-second) points.
 * Returns a lookup keyed by `${coin}@${timestamp}`; points DefiLlama can't price are absent.
 */
export async function historicalPrices(points: { coin: string; ts: number }[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const CHUNK = 60;
  const chunks: { coin: string; ts: number }[][] = [];
  for (let i = 0; i < points.length; i += CHUNK) chunks.push(points.slice(i, i + CHUNK));

  await Promise.all(
    chunks.map(async (chunk) => {
      const byCoin: Record<string, number[]> = {};
      for (const p of chunk) (byCoin[p.coin] ??= []).push(p.ts);
      const url = `${LLAMA}/batchHistorical?coins=${encodeURIComponent(JSON.stringify(byCoin))}&searchWidth=6h`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) : null;
      const coins = (body?.coins ?? {}) as Record<string, { prices?: { timestamp: number; price: number }[] }>;
      for (const [coin, tsList] of Object.entries(byCoin)) {
        const prices = coins[coin]?.prices ?? coins[coin.toLowerCase()]?.prices ?? [];
        if (!prices.length) continue;
        // Match each requested timestamp to the closest returned price.
        for (const ts of tsList) {
          let best = prices[0];
          for (const p of prices) if (Math.abs(p.timestamp - ts) < Math.abs(best.timestamp - ts)) best = p;
          if (Math.abs(best.timestamp - ts) <= 6 * 3600) result.set(`${coin}@${ts}`, best.price);
        }
      }
    }),
  );
  return result;
}
