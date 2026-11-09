// Robinhood Stock Tokens on Robinhood Chain.
// Official list and reference price: Robinhood's public RHJ API (https://docs.robinhood.com/chain/stock-token-apis).
// Market price: DEX pools on Robinhood Chain via DexScreener.
// The gap between the two is the token's premium or discount, which opens up when the stock market is closed.

import { EXPLORER_URL, getToken, isAddress } from "./blockscout";

const RH_API = "https://api.robinhood.com/rhj";
const CHAIN_ID = 4663;
const MIN_POOL_LIQUIDITY = 5_000;

type RhAsset = {
  tokenSymbol: string;
  tokenName: string;
  deployments: { contractAddress: string; chainId: number }[];
  currentMultiplier: string;
  pendingMultiplier?: string;
  status?: string;
  logoUrl?: string;
  tradingCapabilities?: { allDayTradability?: string | null } | null;
};

type RhQuote = {
  tokenSymbol: string;
  bid: string;
  ask: string;
  tokenBid?: string;
  tokenAsk?: string;
  isTradingHalt?: boolean;
  generatedAt?: string;
  dailyHigh?: string;
  dailyLow?: string;
};

export type OfficialStockToken = { symbol: string; name: string; address: string; multiplier: number; logoUrl: string | null };

export type DexMarket = { price: number; liquidityUsd: number; volume24hUsd: number; pools: number; url: string | null };

export type MarketSession = "regular" | "pre-market" | "after-hours" | "overnight" | "closed";

export type StockQuote = {
  symbol: string;
  name: string;
  address: string;
  explorerUrl: string;
  logoUrl: string | null;
  officialPrice: number | null;
  officialBid: number | null;
  officialAsk: number | null;
  officialUpdatedAt: string | null;
  tradingHalt: boolean;
  allDayTradable: boolean;
  dex: DexMarket | null;
  premiumPct: number | null;
};

export type StockTokenReport =
  | ({ kind: "stock"; official: true; session: MarketSession; notes: string[] } & StockQuote)
  | {
      kind: "stock_check";
      official: false;
      address: string;
      symbol: string | null;
      name: string | null;
      explorerUrl: string;
      impersonates: { symbol: string; name: string; address: string } | null;
      notes: string[];
    }
  | { kind: "stock_overview"; session: MarketSession; officialCount: number; rows: StockQuote[]; notes: string[] };

// ---------- Robinhood API ----------

// Some networks (and ISPs) block api.robinhood.com; Jina Reader relays the same JSON as a fallback.
async function rhGet<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${RH_API}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (direct) {
    const res = await fetch(`https://r.jina.ai/${RH_API}${path}`, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (!res.ok || start < 0 || end < start) {
      throw new Error(`Robinhood API unavailable (${direct instanceof Error ? direct.message : "network error"}).`);
    }
    return JSON.parse(text.slice(start, end + 1)) as T;
  }
}

let assetCache: { at: number; list: OfficialStockToken[] } | null = null;

/** Every active Robinhood Stock Token deployed on Robinhood Chain. Cached for 30 minutes. */
export async function officialStockTokens(): Promise<OfficialStockToken[]> {
  if (assetCache && Date.now() - assetCache.at < 30 * 60_000) return assetCache.list;
  const body = await rhGet<{ assets?: RhAsset[] }>("/assets");
  const list: OfficialStockToken[] = [];
  for (const a of body.assets ?? []) {
    if (a.status && a.status !== "ASSET_STATUS_ACTIVE") continue;
    const dep = a.deployments?.find((d) => d.chainId === CHAIN_ID);
    if (!dep) continue;
    list.push({
      symbol: a.tokenSymbol,
      name: a.tokenName,
      address: dep.contractAddress,
      multiplier: Number(a.currentMultiplier) || 1,
      logoUrl: a.logoUrl ?? null,
    });
  }
  if (!list.length) throw new Error("Robinhood returned no stock tokens.");
  assetCache = { at: Date.now(), list };
  allDay = new Map((body.assets ?? []).map((a) => [a.tokenSymbol, a.tradingCapabilities?.allDayTradability === "tradable"]));
  return list;
}
let allDay = new Map<string, boolean>();

async function officialQuote(symbol: string): Promise<RhQuote | null> {
  const body = await rhGet<{ quotes?: RhQuote[] }>(`/prices/${encodeURIComponent(symbol)}`).catch(() => null);
  return body?.quotes?.[0] ?? null;
}

// ---------- DEX prices ----------

type DexPair = {
  url?: string;
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
};

/** Liquidity-weighted DEX price for each token address (pools where the token is the base asset). */
export async function dexMarkets(addresses: string[]): Promise<Map<string, DexMarket>> {
  const out = new Map<string, DexMarket>();
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    // One retry: DexScreener occasionally drops a request, and an empty answer would read as "no DEX price".
    let pairs: DexPair[] = [];
    for (let attempt = 0; attempt < 2 && !pairs.length; attempt++) {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${batch.join(",")}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      pairs = res?.ok ? ((await res.json().catch(() => [])) as DexPair[]) : [];
      if (!pairs.length && attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
    for (const addr of batch) {
      const mine = pairs.filter(
        (p) => p.baseToken?.address?.toLowerCase() === addr.toLowerCase() && Number(p.priceUsd) > 0 && (p.liquidity?.usd ?? 0) >= MIN_POOL_LIQUIDITY,
      );
      if (!mine.length) continue;
      const liq = mine.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
      const price = mine.reduce((s, p) => s + Number(p.priceUsd) * (p.liquidity?.usd ?? 0), 0) / liq;
      const deepest = mine.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
      out.set(addr.toLowerCase(), {
        price,
        liquidityUsd: liq,
        volume24hUsd: mine.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0),
        pools: mine.length,
        url: deepest.url ?? null,
      });
    }
  }
  return out;
}

// ---------- market hours ----------

/** US equity session in New York time. Exchange holidays are not modeled. */
export function usMarketSession(now = new Date()): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday"), mins = Number(get("hour")) * 60 + Number(get("minute"));
  if (day === "Sat") return "closed";
  if (day === "Sun") return mins >= 20 * 60 ? "overnight" : "closed";
  if (mins < 4 * 60) return "overnight";
  if (mins < 9 * 60 + 30) return "pre-market";
  if (mins < 16 * 60) return "regular";
  if (mins < 20 * 60) return "after-hours";
  return day === "Fri" ? "closed" : "overnight";
}

// ---------- reports ----------

const num = (s: string | undefined) => (s != null && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

function buildQuote(t: OfficialStockToken, q: RhQuote | null, dex: DexMarket | undefined): StockQuote {
  // tokenBid/tokenAsk already include the corporate-action multiplier; raw bid/ask do not.
  const bid = num(q?.tokenBid) ?? (num(q?.bid) != null ? num(q?.bid)! * t.multiplier : null);
  const ask = num(q?.tokenAsk) ?? (num(q?.ask) != null ? num(q?.ask)! * t.multiplier : null);
  const official = bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask;
  return {
    symbol: t.symbol,
    name: t.name.replace(/\s*•\s*Robinhood Token$/, ""),
    address: t.address,
    explorerUrl: `${EXPLORER_URL}/token/${t.address}`,
    logoUrl: t.logoUrl,
    officialPrice: official,
    officialBid: bid,
    officialAsk: ask,
    officialUpdatedAt: q?.generatedAt ?? null,
    tradingHalt: Boolean(q?.isTradingHalt),
    allDayTradable: allDay.get(t.symbol) ?? false,
    dex: dex ?? null,
    premiumPct: dex && official ? ((dex.price - official) / official) * 100 : null,
  };
}

const SESSION_NOTE: Record<MarketSession, string> = {
  regular: "US market is open, so the official price is live.",
  "pre-market": "US pre-market session: the official price follows extended-hours quotes.",
  "after-hours": "US after-hours session: the official price follows extended-hours quotes.",
  overnight: "US overnight session: official quotes are thin, so gaps can be wider than usual.",
  closed: "US market is closed: the official price is the last quote, while DEX pools keep trading. A premium or discount now often reflects weekend or overnight sentiment.",
};

/** One stock token: verify it, and compare its DEX price with Robinhood's official price. */
export async function stockToken({ symbol, address }: { symbol?: string; address?: string }): Promise<StockTokenReport> {
  const list = await officialStockTokens();
  const session = usMarketSession();

  if (address) {
    if (!isAddress(address)) throw new Error(`"${address}" is not a valid 0x address.`);
    const match = list.find((t) => t.address.toLowerCase() === address.toLowerCase());
    if (!match) {
      const info = await getToken(address.toLowerCase()).catch(() => null);
      const sym = info?.symbol ?? null;
      const clean = (sym ?? "").replace(/^\$/, "").toUpperCase();
      const lookalike = list.find((t) => t.symbol.toUpperCase() === clean || (info?.name ?? "").toLowerCase().includes(t.name.split(" •")[0].toLowerCase()));
      return {
        kind: "stock_check",
        official: false,
        address,
        symbol: sym,
        name: info?.name ?? null,
        explorerUrl: `${EXPLORER_URL}/token/${address}`,
        impersonates: lookalike ? { symbol: lookalike.symbol, name: lookalike.name, address: lookalike.address } : null,
        notes: [
          "This address is not on Robinhood's official Stock Token list.",
          lookalike
            ? `It uses the name or ticker of ${lookalike.symbol}. The official ${lookalike.symbol} token is ${lookalike.address}.`
            : "It may still be a different issuer's token (for example Ondo's *on tokens) or an unrelated token.",
        ],
      };
    }
    symbol = match.symbol;
  }

  const wanted = (symbol ?? "").replace(/^\$/, "").trim().toUpperCase();
  const t = list.find((x) => x.symbol.toUpperCase() === wanted);
  if (!t) {
    const close = list.filter((x) => x.symbol.toUpperCase().startsWith(wanted.slice(0, 2))).slice(0, 6).map((x) => x.symbol);
    throw new Error(`${wanted || "That"} is not an official Robinhood Stock Token on Robinhood Chain.${close.length ? ` Similar tickers: ${close.join(", ")}.` : ""}`);
  }
  const [q, dex] = await Promise.all([officialQuote(t.symbol), dexMarkets([t.address])]);
  const quote = buildQuote(t, q, dex.get(t.address.toLowerCase()));
  const notes = [SESSION_NOTE[session], "Exchange holidays are not modeled."];
  if (!quote.dex) notes.push("No DEX pool with meaningful liquidity was found for this token.");
  if (quote.tradingHalt) notes.push("Robinhood reports an active trading halt on the underlying stock.");
  if (quote.officialPrice == null) notes.push("Robinhood's official price was unavailable right now.");
  return { kind: "stock", official: true, session, notes, ...quote };
}

/** The most traded stock tokens on Robinhood Chain DEXs, with their premium or discount. */
export async function stockOverview(limit = 10): Promise<StockTokenReport> {
  const list = await officialStockTokens();
  const session = usMarketSession();
  const dex = await dexMarkets(list.map((t) => t.address));
  const top = list
    .filter((t) => dex.has(t.address.toLowerCase()))
    .sort((a, b) => dex.get(b.address.toLowerCase())!.volume24hUsd - dex.get(a.address.toLowerCase())!.volume24hUsd)
    .slice(0, Math.min(15, Math.max(3, limit)));
  const quotes = await Promise.all(top.map((t) => officialQuote(t.symbol)));
  return {
    kind: "stock_overview",
    session,
    officialCount: list.length,
    rows: top.map((t, i) => buildQuote(t, quotes[i], dex.get(t.address.toLowerCase()))),
    notes: [SESSION_NOTE[session], "Ranked by 24h DEX volume. Exchange holidays are not modeled."],
  };
}
