import { EXPLORER_URL, getAddressCounters, getTokenTransfers, getTransactions } from "./blockscout";
import { coinId, currentPrices } from "./prices";

// Airdrop-readiness score. Robinhood has not announced a token; this scores the on-chain habits that past L2
// airdrops (Arbitrum, Optimism, zkSync, Scroll) tended to reward: steady activity over time, breadth of protocols,
// unique contracts and real volume. It is a guide, not a prediction.

export type Category = "dex" | "lending" | "bridge" | "perps" | "rwa";

const CATEGORY_LABEL: Record<Category, string> = {
  dex: "DEX swaps",
  lending: "Lending or vaults",
  bridge: "Bridging",
  perps: "Perps or order books",
  rwa: "Stock tokens or RWAs",
};

const CATEGORY_RE: Record<Exclude<Category, "rwa">, RegExp> = {
  dex: /router|swap|pair|uniswap|ekubo|aggregat|dex|amm/i,
  lending: /morpho|lend|borrow|vault|aave|layerbank|spark|comet|savings|earn/i,
  bridge: /bridge|gateway|inbox|outbox|ccip|messenger|portal|across|stargate|layerzero|hyperlane|relay/i,
  perps: /perp|lighter|arcus|orderbook|order book|futures/i,
};
const RWA_TOKEN_RE = /stock|tokeni[sz]ed|\binc\b|corp|holdings|\betf\b|midas|ondo|treasur/i;

export type ScoreItem = { key: string; label: string; points: number; max: number; detail: string };

export type AirdropReport = {
  address: string;
  explorerUrl: string;
  score: number;
  tier: "Getting started" | "Active" | "Strong" | "Power user";
  metrics: {
    transactions: number;
    activeDays: number;
    activeWeeks: number;
    activeMonths: number;
    firstSeen: string | null;
    uniqueContracts: number;
    categories: Category[];
    volumeUsd: number;
  };
  breakdown: ScoreItem[];
  nextSteps: string[];
  sampled: boolean;
  note: string;
};

const tiers = (n: number, steps: [number, number][]) => steps.find(([min]) => n >= min)?.[1] ?? 0;

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

export async function airdropScore(address: string): Promise<AirdropReport> {
  const me = address.toLowerCase();
  const [txs, transfers, counters] = await Promise.all([
    getTransactions(me, 4),
    getTokenTransfers(me, 4),
    getAddressCounters(me).catch(() => null),
  ]);

  // Only transactions this wallet sent count as its own activity.
  const sent = txs.items.filter((t) => t.from.hash.toLowerCase() === me && (!t.status || t.status === "ok"));
  const times = sent.map((t) => Date.parse(t.timestamp)).filter(Number.isFinite);
  const days = new Set(times.map((t) => new Date(t).toISOString().slice(0, 10)));
  const weeks = new Set(times.map((t) => Math.floor(t / 604_800_000)));
  const months = new Set(times.map((t) => new Date(t).toISOString().slice(0, 7)));

  const contracts = new Map<string, string>();
  for (const t of sent) {
    if (t.to?.is_contract) contracts.set(t.to.hash.toLowerCase(), t.to.name ?? "");
  }
  const cats = new Set<Category>();
  for (const name of contracts.values()) {
    for (const [cat, re] of Object.entries(CATEGORY_RE) as [Exclude<Category, "rwa">, RegExp][]) {
      if (re.test(name)) cats.add(cat);
    }
  }
  // Token transfers also reveal protocols (e.g. tokens arriving from a vault or pool) and stock-token holdings.
  for (const t of transfers.items) {
    const other = t.from.hash.toLowerCase() === me ? t.to : t.from;
    if (other.is_contract && other.name) {
      for (const [cat, re] of Object.entries(CATEGORY_RE) as [Exclude<Category, "rwa">, RegExp][]) {
        if (re.test(other.name)) cats.add(cat);
      }
    }
    if (RWA_TOKEN_RE.test(t.token.name ?? "")) cats.add("rwa");
  }

  // Volume: token value moved in or out, at today's prices (an approximation).
  const keys = [...new Set(transfers.items.map((t) => (t.token.address_hash ?? t.token.address ?? "").toLowerCase()).filter(Boolean))];
  const prices = await currentPrices(keys.map(coinId));
  let volume = 0;
  for (const t of transfers.items) {
    if (t.from.is_scam || t.to.is_scam) continue;
    const key = (t.token.address_hash ?? t.token.address ?? "").toLowerCase();
    const p = prices[coinId(key)];
    if (p == null) continue;
    volume += toQty(t.total?.value, t.total?.decimals ?? t.token.decimals) * p;
  }

  const txCount = Math.max(Number(counters?.transactions_count ?? 0), sent.length);
  const sampled = txs.truncated || transfers.truncated;

  const breakdown: ScoreItem[] = [
    {
      key: "tx",
      label: "Transactions",
      max: 20,
      points: tiers(txCount, [[100, 20], [50, 15], [20, 10], [5, 5], [1, 2]]),
      detail: `${txCount.toLocaleString("en-US")} transactions`,
    },
    {
      key: "months",
      label: "Active months",
      max: 15,
      points: tiers(months.size, [[4, 15], [3, 12], [2, 8], [1, 4]]),
      detail: `${months.size} of the months since mainnet (Jul 2026)`,
    },
    {
      key: "weeks",
      label: "Active weeks",
      max: 15,
      points: tiers(weeks.size, [[12, 15], [8, 11], [4, 7], [2, 4], [1, 2]]),
      detail: `${weeks.size} weeks with activity`,
    },
    {
      key: "contracts",
      label: "Unique contracts",
      max: 15,
      points: tiers(contracts.size, [[20, 15], [10, 11], [5, 7], [2, 3]]),
      detail: `${contracts.size} different contracts used`,
    },
    {
      key: "breadth",
      label: "Protocol variety",
      max: 20,
      points: cats.size * 4,
      detail: cats.size ? [...cats].map((c) => CATEGORY_LABEL[c]).join(", ") : "No protocol activity detected",
    },
    {
      key: "volume",
      label: "Volume",
      max: 15,
      points: tiers(volume, [[10_000, 15], [1_000, 10], [100, 5], [1, 2]]),
      detail: `About $${Math.round(volume).toLocaleString("en-US")} moved`,
    },
  ];
  const score = breakdown.reduce((s, b) => s + b.points, 0);
  const tier = score >= 80 ? "Power user" : score >= 55 ? "Strong" : score >= 30 ? "Active" : "Getting started";

  const nextSteps: string[] = [];
  const missing = (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => !cats.has(c));
  if (weeks.size < 8) nextSteps.push("Be active a little every week rather than in one burst. Consistency over time is what past airdrops rewarded most.");
  if (missing.length) nextSteps.push(`Try categories you haven't used yet: ${missing.map((c) => CATEGORY_LABEL[c]).join(", ")}.`);
  if (contracts.size < 10) nextSteps.push("Interact with more distinct, reputable dApps on Robinhood Chain (audit them first).");
  if (volume < 1_000) nextSteps.push("Small, real trades count. Volume helps, but don't take on risk just to farm it.");
  if (txCount < 20) nextSteps.push("Build a natural transaction history. Avoid spamming tiny self-transfers, which airdrops often filter out as sybil behavior.");
  if (!nextSteps.length) nextSteps.push("You already cover the usual criteria. Keep activity steady and watch for official announcements.");

  return {
    address: me,
    explorerUrl: `${EXPLORER_URL}/address/${me}`,
    score,
    tier,
    metrics: {
      transactions: txCount,
      activeDays: days.size,
      activeWeeks: weeks.size,
      activeMonths: months.size,
      firstSeen: times.length ? new Date(Math.min(...times)).toISOString() : null,
      uniqueContracts: contracts.size,
      categories: [...cats],
      volumeUsd: Math.round(volume),
    },
    breakdown,
    nextSteps: nextSteps.slice(0, 4),
    sampled,
    note:
      "Robinhood has not announced a Robinhood Chain token or airdrop. This score reflects habits past L2 airdrops rewarded and is not a guarantee." +
      (sampled ? " Very active wallets are scored on their most recent ~200 transactions." : ""),
  };
}
