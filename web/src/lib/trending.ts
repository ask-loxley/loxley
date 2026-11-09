// Trending DEX pools on Robinhood Chain.
// Loxley buys this from CoinGecko per request with x402; if it can't pay, it uses GeckoTerminal's free API (same data).

import { paidFetch } from "./x402";

const PATH = "/onchain/networks/robinhood/trending_pools?include=base_token&page=1&duration=24h";
const PAID_URL = `https://pro-api.coingecko.com/api/v3/x402${PATH}`;
const FREE_URL = `https://api.geckoterminal.com/api/v2${PATH.replace("/onchain", "")}`;

type GtPool = {
  attributes: {
    name: string;
    address: string;
    base_token_price_usd?: string | null;
    price_change_percentage?: { h24?: string | null };
    volume_usd?: { h24?: string | null };
    reserve_in_usd?: string | null;
    pool_created_at?: string | null;
  };
  relationships?: { base_token?: { data?: { id?: string } }; dex?: { data?: { id?: string } } };
};
type GtToken = { id: string; attributes?: { symbol?: string; name?: string; address?: string } };

export type TrendingPool = {
  name: string;
  dex: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number;
  liquidityUsd: number;
  ageDays: number | null;
  url: string;
};

export type TrendingReport = {
  kind: "trending";
  pools: TrendingPool[];
  source: string;
  paidUsd: number | null;
  notes: string[];
};

const num = (s: string | null | undefined) => (s != null && Number.isFinite(Number(s)) ? Number(s) : null);
const DEX_NAMES: Record<string, string> = {
  "uniswap-v4-robinhood": "Uniswap v4",
  "uniswap-v3-robinhood": "Uniswap v3",
  "pons-dot-family": "Pons",
};

export async function trendingPools(limit = 10): Promise<TrendingReport> {
  let body: { data?: GtPool[]; included?: GtToken[] } | null = null;
  let source = "CoinGecko, paid by Loxley with x402";
  let paidUsd: number | null = 0.005;
  const notes: string[] = [];
  try {
    const res = await paidFetch(PAID_URL, { headers: { Accept: "application/json" } }, "Trending pools on Robinhood Chain");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    notes.push(`Paid source skipped (${err instanceof Error ? err.message : "error"}); used the free source instead.`);
    source = "GeckoTerminal (free)";
    paidUsd = null;
    const res = await fetch(FREE_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Trending pools unavailable (HTTP ${res.status}).`);
    body = await res.json();
  }

  const tokens = new Map((body?.included ?? []).map((t) => [t.id, t.attributes ?? {}]));
  const now = Date.now();
  const pools = (body?.data ?? []).slice(0, Math.min(20, Math.max(3, limit))).map((p) => {
    const a = p.attributes;
    const tokenId = p.relationships?.base_token?.data?.id ?? "";
    const tok = tokens.get(tokenId);
    const dexId = p.relationships?.dex?.data?.id ?? "";
    const created = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
    return {
      name: a.name,
      dex: DEX_NAMES[dexId] ?? dexId.replace(/-robinhood$/, ""),
      tokenSymbol: tok?.symbol ?? null,
      tokenAddress: tok?.address ?? (tokenId.split("_")[1] || null),
      priceUsd: num(a.base_token_price_usd),
      change24hPct: num(a.price_change_percentage?.h24),
      volume24hUsd: num(a.volume_usd?.h24) ?? 0,
      liquidityUsd: num(a.reserve_in_usd) ?? 0,
      ageDays: Number.isFinite(created) ? Math.floor((now - created) / 86_400_000) : null,
      url: `https://www.geckoterminal.com/robinhood/pools/${a.address}`,
    } satisfies TrendingPool;
  });
  notes.push("Trending means attention, not safety. Audit a token before buying, especially pools younger than a week.");
  return { kind: "trending", pools, source, paidUsd, notes };
}
