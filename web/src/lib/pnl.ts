import { EXPLORER_URL, getInternalTransactions, getTokenTransfers, getTransactions } from "./blockscout";
import { coinId, currentPrices, ETH_COIN, historicalPrices } from "./prices";

export type TokenPnl = {
  token: string; // contract address, or "ETH" for the native coin
  symbol: string;
  bought: number;
  sold: number;
  holding: number;
  costUsd: number; // cost basis of everything acquired in the window
  proceedsUsd: number;
  realizedUsd: number;
  holdingValueUsd: number | null;
  unrealizedUsd: number | null;
  priced: boolean;
  unknownBasis: boolean; // sold more than we saw arrive, so part of the cost basis is unknown
};

export type Disposal = {
  date: string;
  symbol: string;
  token: string;
  quantity: number;
  proceedsUsd: number;
  costBasisUsd: number;
  gainUsd: number;
  unknownBasisQty: number; // quantity sold that never arrived in the window; excluded from gain
  tx: string;
};

export type PnlReport = {
  address: string;
  explorerUrl: string;
  from: string | null;
  to: string | null;
  transfersCounted: number;
  truncated: boolean;
  totals: { realizedUsd: number; unrealizedUsd: number; totalUsd: number; investedUsd: number; currentValueUsd: number };
  tokens: TokenPnl[];
  unpricedTokens: string[];
  disposals: Disposal[];
  notes: string[];
};

type Movement = {
  key: string; // token address lowercased, or "eth"
  symbol: string;
  qty: number;
  dir: "in" | "out";
  ts: number; // unix seconds
  tx: string;
  coin: string;
};

const toQty = (raw: string | null | undefined, decimals: string | number | null | undefined) => {
  if (!raw) return 0;
  const d = Number(decimals ?? 18);
  try {
    const v = BigInt(raw);
    const base = BigInt(10) ** BigInt(d);
    return Number(v / base) + Number(v % base) / Number(base);
  } catch {
    return 0;
  }
};

const round2 = (n: number) => Math.round(n * 100) / 100;
// Round to the hour so repeated trades share one price lookup.
const hourOf = (ts: number) => Math.floor(ts / 3600) * 3600;

export async function computePnl(address: string): Promise<PnlReport> {
  const me = address.toLowerCase();
  const [transfers, txs, internals] = await Promise.all([
    getTokenTransfers(me),
    getTransactions(me),
    getInternalTransactions(me),
  ]);

  const moves: Movement[] = [];
  for (const t of transfers.items) {
    const tokenAddr = (t.token.address_hash ?? t.token.address ?? "").toLowerCase();
    const qty = toQty(t.total?.value, t.total?.decimals ?? t.token.decimals);
    if (!tokenAddr || qty <= 0) continue;
    const from = t.from.hash.toLowerCase();
    const to = t.to.hash.toLowerCase();
    if (from === to) continue;
    const dir = to === me ? "in" : from === me ? "out" : null;
    if (!dir) continue;
    moves.push({
      key: tokenAddr,
      symbol: t.token.symbol ?? tokenAddr.slice(0, 8),
      qty,
      dir,
      ts: Math.floor(Date.parse(t.timestamp) / 1000),
      tx: t.transaction_hash,
      coin: coinId(tokenAddr),
    });
  }
  for (const t of txs.items) {
    if (t.status && t.status !== "ok") continue;
    const qty = toQty(t.value, 18);
    if (qty <= 0) continue;
    const from = t.from.hash.toLowerCase();
    const to = t.to?.hash.toLowerCase();
    const dir = to === me ? "in" : from === me ? "out" : null;
    if (!dir || from === to) continue;
    moves.push({ key: "eth", symbol: "ETH", qty, dir, ts: Math.floor(Date.parse(t.timestamp) / 1000), tx: t.hash, coin: ETH_COIN });
  }
  for (const t of internals.items) {
    if (t.success === false) continue;
    const qty = toQty(t.value, 18);
    if (qty <= 0) continue;
    const from = t.from.hash.toLowerCase();
    const to = t.to?.hash.toLowerCase();
    const dir = to === me ? "in" : from === me ? "out" : null;
    if (!dir || from === to) continue;
    moves.push({
      key: "eth",
      symbol: "ETH",
      qty,
      dir,
      ts: Math.floor(Date.parse(t.timestamp) / 1000),
      tx: t.transaction_hash,
      coin: ETH_COIN,
    });
  }
  moves.sort((a, b) => a.ts - b.ts);

  // Prices at the time of each movement, plus today's price for what is still held.
  const points = new Map<string, { coin: string; ts: number }>();
  for (const m of moves) points.set(`${m.coin}@${hourOf(m.ts)}`, { coin: m.coin, ts: hourOf(m.ts) });
  const [history, current] = await Promise.all([
    historicalPrices([...points.values()]),
    currentPrices([...new Set(moves.map((m) => m.coin))]),
  ]);
  const priceAt = (m: Movement) => history.get(`${m.coin}@${hourOf(m.ts)}`);

  // FIFO lots per token.
  const lots = new Map<string, { qty: number; unitCost: number }[]>();
  const stats = new Map<string, TokenPnl & { anyPrice: boolean }>();
  const disposals: Disposal[] = [];

  for (const m of moves) {
    const s =
      stats.get(m.key) ??
      ({
        token: m.key === "eth" ? "ETH" : m.key,
        symbol: m.symbol,
        bought: 0,
        sold: 0,
        holding: 0,
        costUsd: 0,
        proceedsUsd: 0,
        realizedUsd: 0,
        holdingValueUsd: null,
        unrealizedUsd: null,
        priced: false,
        unknownBasis: false,
        anyPrice: false,
      } as TokenPnl & { anyPrice: boolean });
    stats.set(m.key, s);
    const q = lots.get(m.key) ?? [];
    lots.set(m.key, q);
    const price = priceAt(m) ?? current[m.coin];
    if (price !== undefined) s.anyPrice = true;
    const unit = price ?? 0;

    if (m.dir === "in") {
      s.bought += m.qty;
      s.costUsd += m.qty * unit;
      q.push({ qty: m.qty, unitCost: unit });
    } else {
      s.sold += m.qty;
      let left = m.qty;
      let basis = 0;
      while (left > 1e-12 && q.length) {
        const lot = q[0];
        const take = Math.min(lot.qty, left);
        basis += take * lot.unitCost;
        lot.qty -= take;
        left -= take;
        if (lot.qty <= 1e-12) q.shift();
      }
      // Only the part we saw arrive has a known cost. The rest is reported, but not counted as gain.
      const unmatched = left > 1e-9 ? left : 0;
      if (unmatched) s.unknownBasis = true;
      const proceeds = m.qty * unit;
      const matchedProceeds = (m.qty - unmatched) * unit;
      s.proceedsUsd += proceeds;
      s.realizedUsd += matchedProceeds - basis;
      if (price !== undefined) {
        disposals.push({
          date: new Date(m.ts * 1000).toISOString(),
          symbol: m.symbol,
          token: m.key === "eth" ? "ETH" : m.key,
          quantity: m.qty,
          proceedsUsd: round2(proceeds),
          costBasisUsd: round2(basis),
          gainUsd: round2(matchedProceeds - basis),
          unknownBasisQty: unmatched,
          tx: m.tx,
        });
      }
    }
  }

  const tokens: TokenPnl[] = [];
  const unpriced: string[] = [];
  for (const [key, s] of stats) {
    const q = lots.get(key) ?? [];
    s.holding = q.reduce((sum, l) => sum + l.qty, 0);
    const remainingCost = q.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
    const now = current[key === "eth" ? ETH_COIN : coinId(key)];
    s.priced = s.anyPrice;
    if (now !== undefined) {
      s.holdingValueUsd = round2(s.holding * now);
      s.unrealizedUsd = round2(s.holding * now - remainingCost);
    }
    if (!s.priced) {
      unpriced.push(s.symbol);
      continue;
    }
    const { anyPrice: _drop, ...clean } = s;
    void _drop;
    tokens.push({
      ...clean,
      costUsd: round2(clean.costUsd),
      proceedsUsd: round2(clean.proceedsUsd),
      realizedUsd: round2(clean.realizedUsd),
    });
  }
  tokens.sort((a, b) => Math.abs(b.realizedUsd) + Math.abs(b.unrealizedUsd ?? 0) - (Math.abs(a.realizedUsd) + Math.abs(a.unrealizedUsd ?? 0)));

  const realized = tokens.reduce((s, t) => s + t.realizedUsd, 0);
  const unrealized = tokens.reduce((s, t) => s + (t.unrealizedUsd ?? 0), 0);
  const invested = tokens.reduce((s, t) => s + t.costUsd, 0);
  const currentValue = tokens.reduce((s, t) => s + (t.holdingValueUsd ?? 0), 0);

  const notes = [
    "Cost basis uses FIFO and the USD price at the hour of each transfer.",
    "Every incoming transfer counts as an acquisition and every outgoing one as a disposal, including moves between your own wallets.",
    "Gas fees are not included yet.",
  ];
  if (transfers.truncated || txs.truncated) {
    notes.push("Only the most recent activity was read. Older history is not included, so cost basis for old holdings may be missing.");
  }
  if (tokens.some((t) => t.unknownBasis)) {
    notes.push(
      "Some tokens were sent out without a matching arrival in this window. That part has no known cost, so it is left out of realized P&L.",
    );
  }
  if (unpriced.length) {
    notes.push(`${unpriced.length} tokens have no USD price (often spam or copycat airdrops) and are left out of the totals.`);
  }

  return {
    address: me,
    explorerUrl: `${EXPLORER_URL}/address/${me}`,
    from: moves.length ? new Date(moves[0].ts * 1000).toISOString() : null,
    to: moves.length ? new Date(moves[moves.length - 1].ts * 1000).toISOString() : null,
    transfersCounted: moves.length,
    truncated: transfers.truncated || txs.truncated,
    totals: {
      realizedUsd: round2(realized),
      unrealizedUsd: round2(unrealized),
      totalUsd: round2(realized + unrealized),
      investedUsd: round2(invested),
      currentValueUsd: round2(currentValue),
    },
    tokens,
    unpricedTokens: [...new Set(unpriced)].slice(0, 20),
    disposals,
    notes,
  };
}
