import { EXPLORER_URL, getToken, getTokenTransfers, getTransfersOfToken, type TokenTransfer } from "./blockscout";
import { coinId, currentPrices, historicalPrices } from "./prices";

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
const ZERO = "0x0000000000000000000000000000000000000000";

export type WhaleRow = { address: string; label: string | null; bought: number; sold: number; netUsd: number; trades: number };

export type WhaleActivity = {
  token: string;
  symbol: string | null;
  priceUsd: number | null;
  windowHours: number;
  windowCovered: string; // what the sample actually spans
  trades: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  topBuyers: WhaleRow[];
  topSellers: WhaleRow[];
  explorerUrl: string;
  note: string;
};

/**
 * Who is buying and selling a token right now. A transfer from a contract (DEX pool) to a wallet counts as a buy,
 * wallet to contract as a sell. Wallet-to-wallet moves and mints/burns are ignored.
 */
export async function whaleActivity(token: string, hours = 24): Promise<WhaleActivity> {
  const t = token.toLowerCase();
  const [info, transfers, prices] = await Promise.all([
    getToken(t),
    getTransfersOfToken(t, 6),
    currentPrices([coinId(t)]),
  ]);
  const price = prices[coinId(t)] ?? (info?.exchange_rate ? Number(info.exchange_rate) : null);
  const since = Date.now() - hours * 3600_000;

  const rows = new Map<string, WhaleRow>();
  let buyQty = 0;
  let sellQty = 0;
  let trades = 0;
  let oldest = Date.now();

  for (const tr of transfers.items) {
    const ts = Date.parse(tr.timestamp);
    if (ts < since) continue;
    oldest = Math.min(oldest, ts);
    const qty = toQty(tr.total?.value, tr.total?.decimals ?? info?.decimals);
    if (!qty || tr.from.hash === ZERO || tr.to.hash === ZERO) continue;
    const fromPool = Boolean(tr.from.is_contract);
    const toPool = Boolean(tr.to.is_contract);
    let wallet: TokenTransfer["to"] | null = null;
    let side: "buy" | "sell" | null = null;
    if (fromPool && !toPool) {
      wallet = tr.to;
      side = "buy";
    } else if (!fromPool && toPool) {
      wallet = tr.from;
      side = "sell";
    }
    if (!wallet || !side || wallet.is_scam) continue;
    trades++;
    const key = wallet.hash.toLowerCase();
    const row = rows.get(key) ?? { address: key, label: wallet.name ?? null, bought: 0, sold: 0, netUsd: 0, trades: 0 };
    row.trades++;
    if (side === "buy") {
      row.bought += qty;
      buyQty += qty;
    } else {
      row.sold += qty;
      sellQty += qty;
    }
    rows.set(key, row);
  }

  const list = [...rows.values()].map((r) => ({
    ...r,
    bought: round2(r.bought),
    sold: round2(r.sold),
    netUsd: price != null ? round2((r.bought - r.sold) * price) : 0,
  }));
  const byNet = [...list].sort((a, b) => b.netUsd - a.netUsd || b.bought - b.sold - (a.bought - a.sold));

  const spanH = Math.max(0, (Date.now() - oldest) / 3600_000);
  const covered = trades === 0 ? "no trades found" : spanH >= hours - 0.5 ? `last ${hours}h` : `last ${spanH.toFixed(1)}h (most recent trades only)`;

  return {
    token: t,
    symbol: info?.symbol ?? null,
    priceUsd: price,
    windowHours: hours,
    windowCovered: covered,
    trades,
    buyVolumeUsd: price != null ? round2(buyQty * price) : 0,
    sellVolumeUsd: price != null ? round2(sellQty * price) : 0,
    topBuyers: byNet.filter((r) => r.netUsd > 0 || (price == null && r.bought > r.sold)).slice(0, 8),
    topSellers: byNet.filter((r) => r.netUsd < 0 || (price == null && r.sold > r.bought)).reverse().slice(0, 8),
    explorerUrl: `${EXPLORER_URL}/token/${t}`,
    note: "Buys and sells are inferred from transfers between wallets and DEX contracts, valued at today's price. Busy tokens are sampled from their most recent ~300 transfers.",
  };
}

export type Trade = {
  time: string;
  tx: string;
  sent: { symbol: string; qty: number; usd: number | null }[];
  received: { symbol: string; qty: number; usd: number | null }[];
};

/** A wallet's latest token trades, grouped per transaction (a swap shows what went out and what came in). */
export async function recentTrades(
  address: string,
  limit = 12,
): Promise<{ address: string; trades: Trade[]; explorerUrl: string; note: string }> {
  const me = address.toLowerCase();
  const { items } = await getTokenTransfers(me, 2);
  const byTx = new Map<string, { ts: number; legs: { key: string; symbol: string; qty: number; dir: "in" | "out" }[] }>();
  for (const tr of items) {
    const key = (tr.token.address_hash ?? tr.token.address ?? "").toLowerCase();
    const qty = toQty(tr.total?.value, tr.total?.decimals ?? tr.token.decimals);
    if (!key || !qty || tr.token.symbol == null) continue;
    const dir = tr.to.hash.toLowerCase() === me ? "in" : tr.from.hash.toLowerCase() === me ? "out" : null;
    if (!dir) continue;
    const entry = byTx.get(tr.transaction_hash) ?? { ts: Date.parse(tr.timestamp) / 1000, legs: [] };
    entry.legs.push({ key, symbol: tr.token.symbol, qty, dir });
    byTx.set(tr.transaction_hash, entry);
  }
  const txs = [...byTx.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, limit);

  const hour = (ts: number) => Math.floor(ts / 3600) * 3600;
  const points = txs.flatMap(([, e]) => e.legs.map((l) => ({ coin: coinId(l.key), ts: hour(e.ts) })));
  const history = await historicalPrices(points);

  const trades: Trade[] = txs.map(([tx, e]) => {
    const leg = (l: (typeof e.legs)[number]) => {
      const p = history.get(`${coinId(l.key)}@${hour(e.ts)}`);
      return { symbol: l.symbol, qty: round2(l.qty), usd: p != null ? round2(p * l.qty) : null };
    };
    return {
      time: new Date(e.ts * 1000).toISOString(),
      tx,
      sent: e.legs.filter((l) => l.dir === "out").map(leg),
      received: e.legs.filter((l) => l.dir === "in").map(leg),
    };
  });
  return {
    address: me,
    trades,
    explorerUrl: `${EXPLORER_URL}/address/${me}`,
    note: "Token legs only: ETH paid or received in a swap is not shown, so a trade may look one-sided.",
  };
}
