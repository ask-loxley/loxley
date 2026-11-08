// DeFi yields on Robinhood Chain from DefiLlama's free yields API (no key).
// The full pool list is ~10 MB, so it is fetched at most every 15 minutes and filtered in memory.

type LlamaPool = {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  poolMeta?: string | null;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyPct7D?: number | null;
  apyMean30d?: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  outlier?: boolean;
  underlyingTokens?: string[] | null;
};

export type YieldRisk = "low" | "medium" | "high";

export type YieldPool = {
  id: string;
  project: string;
  symbol: string;
  meta: string | null;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  apy30dAvg: number | null;
  stablecoin: boolean;
  risk: YieldRisk;
  riskReasons: string[];
  url: string;
};

const CHAIN = "Robinhood Chain";
const TTL_MS = 15 * 60_000;
let cached: { at: number; pools: LlamaPool[] } | null = null;

async function robinhoodPools(): Promise<LlamaPool[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.pools;
  const res = await fetch("https://yields.llama.fi/pools", { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`DefiLlama yields returned ${res.status}`);
  const body = (await res.json()) as { data: LlamaPool[] };
  const pools = body.data.filter((p) => p.chain === CHAIN);
  cached = { at: Date.now(), pools };
  return pools;
}

function rate(p: LlamaPool): { risk: YieldRisk; reasons: string[] } {
  const high: string[] = [];
  const medium: string[] = [];
  const apy = p.apy ?? 0;
  const reward = p.apyReward ?? 0;

  if (p.tvlUsd < 100_000) high.push("Small pool (under $100k TVL)");
  else if (p.tvlUsd < 1_000_000) medium.push("Mid-size pool (under $1M TVL)");
  if (apy > 50) high.push("APY is unusually high, often temporary or risky");
  else if (apy > 20) medium.push("APY above 20%");
  if (p.outlier) high.push("DefiLlama flags this APY as an outlier");
  if (p.ilRisk === "yes") medium.push("Impermanent loss risk (two volatile assets)");
  if (apy > 0 && reward / apy > 0.7) medium.push("Most of the yield is paid in reward tokens that can drop in price");
  if (!p.stablecoin && p.exposure === "single") medium.push("Price exposure to a volatile asset");

  const risk: YieldRisk = high.length ? "high" : medium.length ? "medium" : "low";
  const reasons = [...high, ...medium];
  if (!reasons.length) reasons.push("Large, stablecoin pool with yield mostly from real activity");
  return { risk, reasons };
}

export type YieldQuery = {
  asset?: string; // e.g. "USDG", "ETH"; matched against the pool symbol
  stablecoinOnly?: boolean;
  maxRisk?: YieldRisk;
  minTvlUsd?: number;
  sortBy?: "apy" | "tvl";
  limit?: number;
};

const RISK_ORDER: YieldRisk[] = ["low", "medium", "high"];

export async function findYields(q: YieldQuery = {}): Promise<{ pools: YieldPool[]; totalPools: number; note: string }> {
  const all = await robinhoodPools();
  const asset = q.asset?.trim().toUpperCase().replace(/^W(?=ETH|BTC)/, "");
  const maxRisk = RISK_ORDER.indexOf(q.maxRisk ?? "high");

  const pools = all
    .filter((p) => (p.apy ?? 0) > 0.01)
    .filter((p) => !asset || p.symbol.toUpperCase().includes(asset))
    .filter((p) => !q.stablecoinOnly || p.stablecoin)
    .filter((p) => p.tvlUsd >= (q.minTvlUsd ?? 10_000))
    .map((p) => {
      const { risk, reasons } = rate(p);
      return {
        id: p.pool,
        project: p.project,
        symbol: p.symbol,
        meta: p.poolMeta ?? null,
        tvlUsd: Math.round(p.tvlUsd),
        apy: Math.round((p.apy ?? 0) * 100) / 100,
        apyBase: Math.round((p.apyBase ?? 0) * 100) / 100,
        apyReward: Math.round((p.apyReward ?? 0) * 100) / 100,
        apy30dAvg: p.apyMean30d != null ? Math.round(p.apyMean30d * 100) / 100 : null,
        stablecoin: p.stablecoin,
        risk,
        riskReasons: reasons,
        url: `https://defillama.com/yields/pool/${p.pool}`,
      } satisfies YieldPool;
    })
    .filter((p) => RISK_ORDER.indexOf(p.risk) <= maxRisk)
    // Default: safest first, then highest APY, so tiny high-APY pools don't crowd out solid ones.
    .sort((a, b) =>
      q.sortBy === "tvl"
        ? b.tvlUsd - a.tvlUsd
        : RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk) || b.apy - a.apy,
    )
    .slice(0, Math.min(q.limit ?? 10, 25));

  return {
    pools,
    totalPools: all.length,
    note: "Yields change constantly. Risk ratings are heuristics from pool size, APY level, reward share and impermanent-loss exposure, not audits.",
  };
}
