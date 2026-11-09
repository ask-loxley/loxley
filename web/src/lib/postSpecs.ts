// Turns tool results into post image specs (see postImage.ts). Pure functions, safe to import anywhere.

import type { AuditReport, Severity } from "./audit";
import { stamp, type PostImageSpec, type Tone } from "./postImage";
import type { StockQuote, StockTokenReport } from "./stocks";
import type { DevReport } from "./devwatch";
import type { TrendingReport } from "./trending";
import type { WhaleActivity } from "./whales";
import type { WhatIfReport } from "./whatif";
import type { YieldPool } from "./yields";

const usd = (n: number | null | undefined) =>
  n == null ? "–" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactUsd = (n: number) => "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = () => new Date().toISOString().slice(0, 10);

const gapTone = (pct: number | null): Tone => (pct == null ? "plain" : Math.abs(pct) < 0.5 ? "ok" : Math.abs(pct) < 2 ? "md" : "hi");
const gapText = (pct: number | null) => (pct == null ? "n/a" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`);

const SESSION = {
  regular: "US market open",
  "pre-market": "Pre-market",
  "after-hours": "After hours",
  overnight: "Overnight session",
  closed: "US market closed",
} as const;

const stockRow = (q: StockQuote) => ({
  label: q.symbol,
  sub: q.name,
  c1: usd(q.officialPrice),
  c2: q.dex ? usd(q.dex.price) : "–",
  pill: { text: gapText(q.premiumPct), tone: gapTone(q.premiumPct) },
});

export function stockSpec(r: Exclude<StockTokenReport, { kind: "stock_check" }>): PostImageSpec {
  const footnote = `${stamp()} · Robinhood, DexScreener · Not financial advice`;
  const head: [string, string, string, string] = ["Token", "Official", "DEX", "Gap"];
  if (r.kind === "stock_overview") {
    return {
      eyebrow: `Stock tokens · ${SESSION[r.session]}`,
      title: "DEX vs official price",
      subtitle: `The most traded of ${r.officialCount} official Robinhood Stock Tokens.`,
      art: "pink",
      footnote,
      filename: `loxley-stock-tokens-${day()}.png`,
      body: { type: "table", head, rows: r.rows.map(stockRow) },
    };
  }
  const pct = r.premiumPct;
  const title = `${r.symbol} vs its official price`;
  return {
    eyebrow: `${r.name} · ${SESSION[r.session]}`,
    title,
    subtitle: r.dex ? `${compactUsd(r.dex.volume24hUsd)} traded on Robinhood Chain DEXs in 24h` : undefined,
    art: "pink",
    footnote,
    filename: `loxley-${r.symbol.toLowerCase()}-${day()}.png`,
    body: {
      type: "stat",
      value: gapText(pct),
      verdict: pct == null ? "no DEX price" : Math.abs(pct) < 0.5 ? "in line" : pct > 0 ? "premium" : "discount",
      tone: gapTone(pct),
      points: [
        { text: `Official price ${usd(r.officialPrice)}, DEX price ${r.dex ? usd(r.dex.price) : "n/a"}`, tone: "plain" },
        ...(r.dex ? [{ text: `${compactUsd(r.dex.liquidityUsd)} liquidity across ${r.dex.pools} pool${r.dex.pools === 1 ? "" : "s"}`, tone: "plain" as Tone }] : []),
        { text: r.session === "regular" ? "US market is open: the official price is live." : "US market is not in regular hours, so gaps can widen.", tone: r.session === "regular" ? "ok" : "md" },
      ],
    },
  };
}

const SEVERITY_TONE: Record<Severity, Tone> = { high: "hi", medium: "md", low: "plain", info: "ok" };
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function auditSpec(r: AuditReport): PostImageSpec {
  const name = r.token?.symbol || r.token?.name || r.name || short(r.address);
  const points = [...r.findings]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .filter((f) => f.severity !== "info" || f.id === "stock-official")
    .slice(0, 4)
    .map((f) => ({ text: f.title, tone: SEVERITY_TONE[f.severity] }));
  return {
    eyebrow: "Contract audit · Robinhood Chain",
    title: `Is ${name} safe?`,
    subtitle: `${r.token?.name && r.token.name !== name ? `${r.token.name} · ` : ""}${short(r.address)}`,
    art: "blue",
    footnote: `${stamp()} · Blockscout · Signals, not proof`,
    filename: `loxley-audit-${r.address.slice(0, 8)}.png`,
    body: {
      type: "stat",
      value: String(Math.round(r.score)),
      unit: "/100",
      verdict: r.verdict,
      tone: r.verdict === "low risk" ? "ok" : r.verdict === "caution" ? "md" : "hi",
      points: points.length ? points : [{ text: "No red flags found in the checks Loxley runs.", tone: "ok" }],
    },
  };
}

export function yieldSpec(pools: YieldPool[]): PostImageSpec {
  return {
    eyebrow: "DeFi yields · Robinhood Chain",
    title: "Where your stablecoins earn the most",
    subtitle: "Ranked by APY, with the risk rating Loxley gives each pool.",
    art: "pink",
    footnote: `${stamp()} · DefiLlama · APYs change daily`,
    filename: `loxley-yields-${day()}.png`,
    body: {
      type: "table",
      head: ["Pool", "APY", "TVL", "Risk"],
      rows: pools.map((p) => ({
        label: p.symbol,
        sub: p.project + (p.meta ? ` · ${p.meta}` : ""),
        c1: `${p.apy.toFixed(2)}%`,
        c2: compactUsd(p.tvlUsd),
        pill: { text: p.risk, tone: p.risk === "low" ? "ok" : p.risk === "medium" ? "md" : "hi" },
      })),
    },
  };
}

export function whaleSpec(d: WhaleActivity): PostImageSpec {
  const total = d.buyVolumeUsd + d.sellVolumeUsd;
  const buyPct = total > 0 ? Math.round((d.buyVolumeUsd / total) * 100) : 50;
  const row = (r: { address: string; label?: string | null; netUsd: number }) => ({ label: r.label ?? short(r.address), value: compactUsd(r.netUsd) });
  const sym = d.symbol ?? short(d.token);
  return {
    eyebrow: `Smart money · ${d.windowCovered}`,
    title: `Who's buying ${sym}?`,
    subtitle: `${d.trades} trades from wallets on Robinhood Chain.`,
    art: "orange",
    footnote: `${stamp()} · Blockscout · Not financial advice`,
    filename: `loxley-whales-${sym.toLowerCase().replace(/[^a-z0-9]/g, "")}-${day()}.png`,
    body: {
      type: "split",
      buyPct,
      buyLabel: `Buys ${buyPct}% · ${compactUsd(d.buyVolumeUsd)}`,
      sellLabel: `Sells ${100 - buyPct}% · ${compactUsd(d.sellVolumeUsd)}`,
      left: { title: "Top net buyers", rows: d.topBuyers.map(row) },
      right: { title: "Top net sellers", rows: d.topSellers.map(row) },
    },
  };
}

export function trendingSpec(r: TrendingReport): PostImageSpec {
  return {
    eyebrow: "Trending · Robinhood Chain · 24h",
    title: "Trending right now",
    subtitle: "Trending means attention, not safety. Audit before you buy.",
    art: "orange",
    footnote: `${stamp()} · ${r.paidUsd ? "CoinGecko via x402" : "GeckoTerminal"} · Not financial advice`,
    filename: `loxley-trending-${day()}.png`,
    body: {
      type: "table",
      head: ["Pool", "Volume", "Liquidity", "24h"],
      rows: r.pools.map((p) => ({
        label: p.tokenSymbol ?? p.name.split(" / ")[0],
        sub: `${p.dex}${p.ageDays != null ? ` · ${p.ageDays}d old` : ""}`,
        c1: compactUsd(p.volume24hUsd),
        c2: compactUsd(p.liquidityUsd),
        pill: {
          text: p.change24hPct == null ? "n/a" : `${p.change24hPct >= 0 ? "+" : ""}${p.change24hPct.toFixed(1)}%`,
          tone: p.change24hPct == null ? "plain" : p.change24hPct >= 0 ? "ok" : p.change24hPct > -15 ? "md" : "hi",
        },
      })),
    },
  };
}

export function whatIfSpec(r: WhatIfReport): PostImageSpec {
  const up = r.changePct >= 0;
  return {
    eyebrow: `What if · ${r.daysAgo} days ago`,
    title: `$${r.amountUsd.toLocaleString("en-US")} of ${r.symbol}, then and now`,
    subtitle: `Bought on ${r.boughtOn}, valued at today's DEX price on Robinhood Chain.`,
    art: up ? "blue" : "orange",
    footnote: `${stamp()} · GeckoTerminal · Past returns are not a forecast`,
    filename: `loxley-whatif-${r.symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}-${day()}.png`,
    body: {
      type: "stat",
      value: "$" + r.valueNow.toLocaleString("en-US", { maximumFractionDigits: r.valueNow < 10 ? 2 : 0 }),
      verdict: `${up ? "+" : ""}${r.changePct.toFixed(2)}%`,
      tone: up ? "ok" : "hi",
      points: [
        { text: `Price then ${usd(r.priceThen)}, now ${usd(r.priceNow)}`, tone: "plain" },
        { text: `Deepest pool: ${r.pool}`, tone: "plain" },
        { text: "Ignores fees, slippage and gas.", tone: "md" },
      ],
    },
  };
}

export function devSpec(r: DevReport): PostImageSpec {
  const label = { quiet: "quiet", burned: "burned", moving: "moved supply", selling: "selling", unknown: "unknown" }[r.verdict];
  const tone: Tone = r.verdict === "selling" ? "hi" : r.verdict === "moving" || r.verdict === "unknown" ? "md" : "ok";
  const moved = Math.max(0, r.sentPct - r.soldPct - r.burnedPct);
  return {
    eyebrow: `Dev watch · ${r.symbol ?? short(r.token)}`,
    title: `What did the ${r.symbol ?? "token"} dev do?`,
    subtitle: r.dev ? `Deployer ${short(r.dev)}${r.viaFactory ? ` · launched via ${r.viaFactory}` : ""}` : undefined,
    art: "pink",
    footnote: `${stamp()} · Blockscout · Signals, not proof`,
    filename: `loxley-dev-${r.token.slice(0, 8)}.png`,
    body: {
      type: "stat",
      value: `${r.soldPct.toFixed(1)}%`,
      unit: " sold",
      verdict: label,
      tone,
      points: [
        { text: `Holds ${r.holdsPct == null ? "unknown" : r.holdsPct.toFixed(2) + "%"} of supply now`, tone: "plain" },
        { text: `Burned ${r.burnedPct.toFixed(2)}% of supply`, tone: r.burnedPct > 0 ? "ok" : "plain" },
        { text: `Moved ${moved.toFixed(2)}% to other wallets`, tone: moved >= 1 ? "md" : "plain" },
      ],
    },
  };
}
