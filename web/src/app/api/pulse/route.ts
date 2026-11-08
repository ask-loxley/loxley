import { connection } from "next/server";
import { getStats } from "@/lib/blockscout";

// Live chain numbers for the landing page. Cached in memory for 5 minutes so page views
// barely touch the Blockscout and DefiLlama budgets.

type Pulse = {
  totalTransactions: number | null;
  transactionsToday: number | null;
  totalAddresses: number | null;
  blockTimeMs: number | null;
  ethPriceUsd: number | null;
  tvlUsd: number | null;
  updatedAt: string;
};

let cache: { at: number; data: Pulse } | null = null;
const TTL = 5 * 60_000;

async function chainTvl(): Promise<number | null> {
  const res = await fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const list = res?.ok ? ((await res.json().catch(() => null)) as { chainId?: number; tvl?: number }[] | null) : null;
  return list?.find((c) => c.chainId === 4663)?.tvl ?? null;
}

export async function GET() {
  await connection();
  if (!cache || Date.now() - cache.at > TTL) {
    const [stats, tvl] = await Promise.all([getStats().catch(() => null), chainTvl()]);
    const n = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v));
    cache = {
      at: Date.now(),
      data: {
        totalTransactions: n(stats?.total_transactions),
        transactionsToday: n(stats?.transactions_today),
        totalAddresses: n(stats?.total_addresses),
        blockTimeMs: stats?.average_block_time ?? null,
        ethPriceUsd: n(stats?.coin_price),
        tvlUsd: tvl,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  return Response.json(cache.data, { headers: { "Cache-Control": "public, max-age=60" } });
}
