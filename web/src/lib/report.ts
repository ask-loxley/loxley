// Premium "wallet health" report for $LOXLEY holders: every meaningful token in a wallet, audited,
// checked against the official stock token list, with its dev's behaviour, plus the airdrop score.

import { airdropScore } from "./airdrop";
import { auditContract } from "./audit";
import { EXPLORER_URL, getTokenBalances, isAddress } from "./blockscout";
import { devActivity } from "./devwatch";
import { coinId, currentPrices } from "./prices";
import { dexMarkets, officialStockTokens } from "./stocks";
import { loxleyToken } from "./token";

export type HoldingRow = {
  address: string;
  symbol: string;
  name: string | null;
  valueUsd: number;
  kind: "stock" | "loxley" | "token";
  score: number | null;
  verdict: string | null;
  flags: string[];
  dev: "quiet" | "burned" | "moving" | "selling" | "unknown" | null;
};

export type WalletReport = {
  kind: "report";
  address: string;
  explorerUrl: string;
  totalUsd: number;
  health: number | null;
  holdings: HoldingRow[];
  unpriced: number;
  airdrop: { score: number; tier: string } | null;
  alerts: string[];
  notes: string[];
};

const MAX_TOKENS = 8;

export async function walletReport(addressArg: string): Promise<WalletReport> {
  if (!isAddress(addressArg)) throw new Error("Not a valid wallet address.");
  const address = addressArg.toLowerCase();
  const [balances, stocks, lox] = await Promise.all([getTokenBalances(address), officialStockTokens().catch(() => []), loxleyToken().catch(() => null)]);
  const stockSet = new Map(stocks.map((s) => [s.address.toLowerCase(), s.symbol]));

  const tokens = (balances ?? [])
    // Robinhood Stock Tokens are ERC-8056 (ERC-20 with a corporate-action multiplier); NFTs are skipped.
    .filter((b) => ["ERC-20", "ERC-8056"].includes(b.token.type ?? "ERC-20"))
    .map((b) => {
      const addr = (b.token.address_hash ?? b.token.address ?? "").toLowerCase();
      return { addr, symbol: b.token.symbol ?? "?", name: b.token.name ?? null, qty: Number(BigInt(b.value || "0")) / 10 ** Number(b.token.decimals ?? 18) };
    })
    .filter((t) => t.addr && t.qty > 0);
  const prices = await currentPrices(tokens.map((t) => coinId(t.addr)));
  // Many Robinhood Chain tokens have no DefiLlama price: fall back to their DEX price.
  const missing = tokens.filter((t) => prices[coinId(t.addr)] == null).map((t) => t.addr);
  const dex = missing.length ? await dexMarkets(missing).catch(() => new Map()) : new Map();
  const priceOf = (addr: string) => prices[coinId(addr)] ?? dex.get(addr)?.price ?? 0;
  const valued = tokens.map((t) => ({ ...t, valueUsd: priceOf(t.addr) * t.qty }));
  const top = valued.filter((t) => t.valueUsd >= 1).sort((a, b) => b.valueUsd - a.valueUsd).slice(0, MAX_TOKENS);

  const holdings: HoldingRow[] = [];
  for (const t of top) {
    const kind: HoldingRow["kind"] = lox && t.addr === lox.ca.toLowerCase() ? "loxley" : stockSet.has(t.addr) ? "stock" : "token";
    const row: HoldingRow = { address: t.addr, symbol: t.symbol, name: t.name, valueUsd: t.valueUsd, kind, score: null, verdict: null, flags: [], dev: null };
    if (kind === "stock") {
      row.verdict = "official stock token";
    } else {
      const audit = await auditContract(t.addr).catch(() => null);
      if (audit) {
        row.score = audit.score;
        row.verdict = audit.verdict;
        row.flags = audit.findings.filter((f) => f.severity === "high" || f.severity === "medium").slice(0, 3).map((f) => f.title);
      }
      const dev = await devActivity(t.addr).catch(() => null);
      row.dev = dev?.verdict ?? null;
    }
    holdings.push(row);
  }

  const airdrop = await airdropScore(address).then((a) => ({ score: a.score, tier: a.tier })).catch(() => null);
  const totalUsd = valued.reduce((s, t) => s + t.valueUsd, 0);
  const scored = holdings.filter((h) => h.kind === "stock" || h.kind === "loxley" || h.score != null);
  const weight = scored.reduce((s, h) => s + h.valueUsd, 0);
  const health = weight > 0 ? Math.round(scored.reduce((s, h) => s + h.valueUsd * (h.kind === "token" ? (h.score ?? 0) : 100), 0) / weight) : null;

  const alerts: string[] = [];
  for (const h of holdings) {
    if (h.flags.some((f) => /pretends|not the official/i.test(f))) alerts.push(`${h.symbol} copies a well-known name and is not the official token.`);
    if (h.dev === "selling") alerts.push(`The dev of ${h.symbol} is selling.`);
    if (h.verdict === "high risk") alerts.push(`${h.symbol} scores ${h.score}/100 (high risk).`);
  }

  return {
    kind: "report",
    address,
    explorerUrl: `${EXPLORER_URL}/address/${address}`,
    totalUsd,
    health,
    holdings,
    unpriced: tokens.length - valued.filter((t) => t.valueUsd > 0).length,
    airdrop,
    alerts: [...new Set(alerts)],
    notes: [
      `Covers the ${MAX_TOKENS} largest token positions worth at least $1. Tokens without a price are often unsolicited airdrops: don't interact with them.`,
      "Official stock tokens and $LOXLEY count as 100 in the health score. Signals, not proof. Not financial advice.",
    ],
  };
}
