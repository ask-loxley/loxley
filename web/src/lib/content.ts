import { auditContract } from "./audit";
import { getStats, getTopTokens, isAddress } from "./blockscout";
import { whaleActivity } from "./whales";
import { findYields } from "./yields";

// Data bundles for social posts, plus validation of the drafts the agent writes.

export type BriefKind = "market_pulse" | "yield_roundup" | "whale_watch" | "token_spotlight";

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

export async function contentBrief(kind: BriefKind, token?: string) {
  const asOf = new Date().toISOString();
  if ((kind === "whale_watch" || kind === "token_spotlight") && (!token || !isAddress(token))) {
    return { error: `${kind} needs a token address.` };
  }

  switch (kind) {
    case "market_pulse": {
      const [stats, tokens, yields] = await Promise.all([
        getStats(),
        getTopTokens().catch(() => null),
        findYields({ maxRisk: "medium", limit: 3 }).catch(() => null),
      ]);
      // Blockscout often has no 24h volume for this chain; fall back to ranking by holder count.
      const listed = (tokens?.items ?? []).filter((t) => !(t as { is_scam?: boolean }).is_scam);
      const hasVolume = listed.some((t) => (num(t.volume_24h) ?? 0) > 0);
      const movers = [...listed]
        .sort((a, b) =>
          hasVolume
            ? (num(b.volume_24h) ?? 0) - (num(a.volume_24h) ?? 0)
            : (num(b.holders_count) ?? 0) - (num(a.holders_count) ?? 0),
        )
        .slice(0, 5)
        .map((t) => ({
          symbol: t.symbol,
          priceUsd: num(t.exchange_rate),
          volume24hUsd: hasVolume ? Math.round(num(t.volume_24h) ?? 0) : null,
          holders: num(t.holders_count),
        }));
      return {
        kind,
        asOf,
        chain: {
          totalTransactions: num(stats?.total_transactions),
          transactionsToday: num(stats?.transactions_today),
          totalAddresses: num(stats?.total_addresses),
          avgBlockTimeMs: stats?.average_block_time ?? null,
          ethPriceUsd: num(stats?.coin_price),
          gasGwei: stats?.gas_prices?.average ?? null,
        },
        topTokens: { rankedBy: hasVolume ? "24h volume" : "holders", tokens: movers },
        topYields: yields?.pools.map((p) => ({ pool: `${p.project} ${p.symbol}`, apy: p.apy, tvlUsd: p.tvlUsd, risk: p.risk })) ?? [],
      };
    }
    case "yield_roundup": {
      const [low, medium] = await Promise.all([findYields({ maxRisk: "low", limit: 5 }), findYields({ maxRisk: "medium", limit: 8 })]);
      const mediumOnly = medium.pools.filter((p) => p.risk === "medium").slice(0, 3);
      return {
        kind,
        asOf,
        lowRisk: low.pools.map((p) => ({ pool: `${p.project} ${p.symbol}`, apy: p.apy, tvlUsd: p.tvlUsd, apy30dAvg: p.apy30dAvg })),
        mediumRisk: mediumOnly.map((p) => ({ pool: `${p.project} ${p.symbol}`, apy: p.apy, tvlUsd: p.tvlUsd, why: p.riskReasons[0] })),
        source: "DefiLlama",
      };
    }
    case "whale_watch": {
      const w = await whaleActivity(token!, 24);
      return {
        kind,
        asOf,
        token: w.symbol,
        window: w.windowCovered,
        trades: w.trades,
        buyVolumeUsd: w.buyVolumeUsd,
        sellVolumeUsd: w.sellVolumeUsd,
        biggestBuyer: w.topBuyers[0] ? { wallet: w.topBuyers[0].address, netUsd: w.topBuyers[0].netUsd } : null,
        biggestSeller: w.topSellers[0] ? { wallet: w.topSellers[0].address, netUsd: w.topSellers[0].netUsd } : null,
        explorerUrl: w.explorerUrl,
      };
    }
    case "token_spotlight": {
      const [audit, w] = await Promise.all([auditContract(token!), whaleActivity(token!, 24).catch(() => null)]);
      return {
        kind,
        asOf,
        token: audit.token,
        safetyScore: audit.score,
        verdict: audit.verdict,
        keyFindings: audit.findings.filter((f) => f.severity !== "info").slice(0, 4).map((f) => `${f.severity}: ${f.title}`),
        last24h: w ? { trades: w.trades, buyVolumeUsd: w.buyVolumeUsd, sellVolumeUsd: w.sellVolumeUsd } : null,
        explorerUrl: audit.explorerUrl,
      };
    }
  }
}

export type Draft = { platform: "x" | "telegram"; text: string; chars: number; overLimit: boolean };

const X_LIMIT = 280;

// X counts every link as 23 characters regardless of length.
const xLength = (text: string) => text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;

export function publishDrafts(input: { posts?: unknown; title?: unknown }) {
  const posts = Array.isArray(input.posts) ? input.posts : [];
  const drafts: Draft[] = posts
    .filter((p): p is { platform?: unknown; text: string } => Boolean(p && typeof (p as { text?: unknown }).text === "string"))
    .slice(0, 12)
    .map((p) => {
      const platform = p.platform === "telegram" ? "telegram" : "x";
      const text = p.text.trim().slice(0, 4000);
      const chars = platform === "x" ? xLength(text) : text.length;
      return { platform, text, chars, overLimit: platform === "x" && chars > X_LIMIT };
    });
  if (!drafts.length) return { error: "Pass posts: [{ platform: 'x' | 'telegram', text }]." };
  const over = drafts.filter((d) => d.overLimit).length;
  return {
    title: typeof input.title === "string" ? input.title.slice(0, 80) : null,
    drafts,
    warnings: over ? [`${over} X post(s) exceed 280 characters. Shorten them before posting.`] : [],
  };
}
