// "What if I had bought X": past price from daily DEX candles (GeckoTerminal), price now from the same pool.

import { isAddress } from "./blockscout";
import { coinId, currentPrices, historicalPrices } from "./prices";
import { dexMarkets, officialStockTokens } from "./stocks";

export type WhatIfReport = {
  kind: "whatif";
  token: string;
  symbol: string;
  name: string | null;
  amountUsd: number;
  daysAgo: number;
  boughtOn: string;
  priceThen: number;
  priceNow: number;
  valueNow: number;
  changePct: number;
  pool: string;
  poolUrl: string;
  notes: string[];
};

const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";
type GtPool = { attributes: { address: string; name: string; reserve_in_usd?: string | null; base_token_price_usd?: string | null; quote_token_price_usd?: string | null }; relationships?: { base_token?: { data?: { id?: string } } } };

// GeckoTerminal rate-limits shared cloud IPs, so a failed direct call is retried once through the Jina relay.
async function gt<T>(path: string): Promise<T> {
  const direct = await fetch(GT + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (direct?.ok) return (await direct.json()) as T;
  const relay = await fetch(`https://r.jina.ai/${GT}${path}`, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(25_000) }).catch(() => null);
  const text = relay?.ok ? await relay.text() : "";
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
  throw new Error(`Price history unavailable (HTTP ${direct?.status ?? "network error"}).`);
}

/** DefiLlama prices (then and now) for one token, if it tracks it. */
async function fromLlama(address: string, days: number) {
  const coin = coinId(address);
  const ts = Math.floor(Date.now() / 1000) - days * 86_400;
  const [now, then] = await Promise.all([currentPrices([coin]), historicalPrices([{ coin, ts }])]);
  const priceNow = now[coin], priceThen = then.get(`${coin}@${ts}`);
  return priceNow > 0 && (priceThen ?? 0) > 0 ? { priceNow, priceThen: priceThen as number, ts } : null;
}

/** Resolves a ticker (official stock tokens first) or an address to a token address. */
async function resolve(arg: string): Promise<{ address: string; label: string | null }> {
  const a = arg.trim();
  if (isAddress(a)) return { address: a.toLowerCase(), label: null };
  const sym = a.replace(/^\$/, "").toUpperCase();
  const stock = (await officialStockTokens().catch(() => [])).find((t) => t.symbol.toUpperCase() === sym);
  if (stock) return { address: stock.address.toLowerCase(), label: stock.symbol };
  throw new Error(`I don't know a token called ${sym}. Paste its contract address, or use an official stock token ticker.`);
}

export async function whatIf({ token, amountUsd = 100, daysAgo = 7 }: { token: string; amountUsd?: number; daysAgo?: number }): Promise<WhatIfReport> {
  const amount = Math.min(1_000_000, Math.max(1, Number(amountUsd) || 100));
  const days = Math.min(365, Math.max(1, Math.round(Number(daysAgo) || 7)));
  const { address, label } = await resolve(token);

  try {
    return await fromDex(address, label, amount, days);
  } catch (err) {
    // Last resort: DefiLlama's reference price, which can differ from the DEX price.
    const llama = await fromLlama(address, days).catch(() => null);
    if (!llama) throw err;
    const dex = (await dexMarkets([address]).catch(() => new Map())).get(address);
    const stock = (await officialStockTokens().catch(() => [])).find((t) => t.address.toLowerCase() === address);
    return {
      kind: "whatif",
      token: address,
      symbol: label ?? stock?.symbol ?? "token",
      name: stock?.name.replace(/\s*•\s*Robinhood Token$/, "") ?? null,
      amountUsd: amount,
      daysAgo: days,
      boughtOn: new Date(llama.ts * 1000).toISOString().slice(0, 10),
      priceThen: llama.priceThen,
      priceNow: llama.priceNow,
      valueNow: (amount / llama.priceThen) * llama.priceNow,
      changePct: (llama.priceNow / llama.priceThen - 1) * 100,
      pool: "DefiLlama reference price",
      poolUrl: dex?.url ?? `https://robinhoodchain.blockscout.com/token/${address}`,
      notes: ["DEX price history was unavailable, so this uses DefiLlama's reference price, which can differ from the DEX price. Ignores fees, slippage and gas."],
    };
  }
}

async function fromDex(address: string, label: string | null, amount: number, days: number): Promise<WhatIfReport> {
  // Deepest pool where this token is the base asset.
  const pools = (await gt<{ data: GtPool[] }>(`/tokens/${address}/pools?page=1`)).data ?? [];
  const mine = pools.filter((p) => p.relationships?.base_token?.data?.id?.toLowerCase() === `robinhood_${address}`);
  const pool = (mine.length ? mine : pools).sort((x, y) => Number(y.attributes.reserve_in_usd ?? 0) - Number(x.attributes.reserve_in_usd ?? 0))[0];
  if (!pool) throw new Error("No DEX pool found for this token on Robinhood Chain.");

  const ohlcv = await gt<{ data?: { attributes?: { ohlcv_list?: number[][] } }; meta?: { base?: { symbol?: string; name?: string; address?: string } } }>(
    `/pools/${pool.attributes.address}/ohlcv/day?limit=${days + 2}&token=${address}&currency=usd`,
  );
  const rows = (ohlcv.data?.attributes?.ohlcv_list ?? []).slice().sort((a, b) => a[0] - b[0]);
  if (rows.length < 2) throw new Error("Not enough price history for this token yet.");

  const target = Date.now() / 1000 - days * 86_400;
  const then = rows.reduce((best, r) => (Math.abs(r[0] - target) < Math.abs(best[0] - target) ? r : best), rows[0]);
  const priceThen = Number(then[4]); // that day's close
  const priceNow = Number(rows[rows.length - 1][4]);
  if (!(priceThen > 0) || !(priceNow > 0)) throw new Error("Price history for this token looks incomplete.");

  const actualDays = Math.round((Date.now() / 1000 - then[0]) / 86_400);
  const notes = ["Uses the daily closing price of the deepest DEX pool. Ignores fees, slippage and gas."];
  if (rows[0][0] > target + 86_400) notes.push(`The pool only has ${rows.length} days of history, so this starts from its first day.`);
  if (actualDays !== days) notes.push(`Closest available day was ${actualDays} days ago.`);
  const base = ohlcv.meta?.base;
  return {
    kind: "whatif",
    token: address,
    symbol: label ?? base?.symbol ?? pool.attributes.name.split(" / ")[0],
    name: base?.name ?? null,
    amountUsd: amount,
    daysAgo: actualDays,
    boughtOn: new Date(then[0] * 1000).toISOString().slice(0, 10),
    priceThen,
    priceNow,
    valueNow: (amount / priceThen) * priceNow,
    changePct: (priceNow / priceThen - 1) * 100,
    pool: pool.attributes.name,
    poolUrl: `https://www.geckoterminal.com/robinhood/pools/${pool.attributes.address}`,
    notes,
  };
}
