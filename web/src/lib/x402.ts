// Loxley's own wallet: pays for data per request with x402 (USDC on Base), within hard limits.
// Protocol: https://github.com/x402-foundation/x402 (v2 headers, with a v1 fallback).
// Safety: only allowlisted hosts, a per-call price cap, a daily budget, and a public ledger of every payment.

import { getAddress, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { kvGet, kvSet } from "./kv";

const BASE_NETWORK = "eip155:8453";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ALLOWED_HOSTS: Record<string, string> = {
  "x402.tavily.com": "Tavily",
  "pro-api.coingecko.com": "CoinGecko",
};
const maxPerCallUsd = () => Number(process.env.X402_MAX_PER_CALL_USD || 0.05);
export const dailyBudgetUsd = () => Number(process.env.X402_DAILY_BUDGET_USD || 1);

/** Thrown when Loxley can't or shouldn't pay; callers fall back to free sources. */
export class PaymentUnavailable extends Error {}

type Requirement = {
  scheme: string;
  network: string;
  amount?: string;
  maxAmountRequired?: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
};
type PaymentRequired = { x402Version?: number; accepts?: Requirement[]; resource?: unknown };

export type Payment = { at: string; service: string; what: string; amountUsd: number; tx: string | null };
export type Ledger = { day: string; spentTodayUsd: number; totalUsd: number; count: number; recent: Payment[] };

const LEDGER_KEY = "x402-ledger";
const today = () => new Date().toISOString().slice(0, 10);

function agentAccount() {
  const key = process.env.X402_PRIVATE_KEY?.trim();
  if (!key) return null;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}
export const agentWalletAddress = () => agentAccount()?.address ?? null;

const encode = (o: unknown) => btoa(JSON.stringify(o));
function decode<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(atob(s)) as T;
  } catch {
    return null;
  }
}

export async function readLedger(): Promise<Ledger> {
  const l = await kvGet<Ledger>(LEDGER_KEY);
  const fresh: Ledger = { day: today(), spentTodayUsd: 0, totalUsd: 0, count: 0, recent: [] };
  if (!l) return fresh;
  return l.day === today() ? l : { ...l, day: today(), spentTodayUsd: 0 };
}

async function record(p: Payment) {
  const l = await readLedger();
  await kvSet(LEDGER_KEY, {
    day: l.day,
    spentTodayUsd: +(l.spentTodayUsd + p.amountUsd).toFixed(6),
    totalUsd: +(l.totalUsd + p.amountUsd).toFixed(6),
    count: l.count + 1,
    recent: [p, ...l.recent].slice(0, 30),
  } satisfies Ledger);
}

const TRANSFER_WITH_AUTHORIZATION = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

/**
 * fetch() that pays when the server answers 402. `what` is a short public label for the ledger,
 * e.g. "Trending pools". Requests are bodies-as-strings so they can be replayed with the payment.
 */
export async function paidFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }, what: string): Promise<Response> {
  const host = new URL(url).hostname;
  const service = ALLOWED_HOSTS[host];
  if (!service) throw new PaymentUnavailable(`${host} is not on Loxley's payment allowlist.`);
  const account = agentAccount();
  if (!account) throw new PaymentUnavailable("Loxley's wallet is not configured.");

  const first = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (first.status !== 402) return first;

  const required =
    decode<PaymentRequired>(first.headers.get("PAYMENT-REQUIRED")) ?? ((await first.json().catch(() => null)) as PaymentRequired | null);
  const version = required?.x402Version ?? 1;
  const req = required?.accepts?.find(
    (a) => a.scheme === "exact" && (a.network === BASE_NETWORK || a.network === "base") && a.asset?.toLowerCase() === USDC_BASE.toLowerCase(),
  );
  if (!req) throw new PaymentUnavailable(`${service} offered no USDC-on-Base payment option.`);

  const atomic = BigInt(req.amount ?? req.maxAmountRequired ?? "0");
  const usd = Number(atomic) / 1e6;
  if (!(usd > 0) || usd > maxPerCallUsd()) throw new PaymentUnavailable(`${service} asked $${usd}, above the $${maxPerCallUsd()} per-call cap.`);
  const ledger = await readLedger();
  if (ledger.spentTodayUsd + usd > dailyBudgetUsd()) throw new PaymentUnavailable("Loxley's daily data budget is used up.");

  // EIP-3009 transferWithAuthorization, signed off-chain; the server's facilitator submits it and pays the gas.
  const validBefore = Math.floor(Date.now() / 1000) + Math.min(600, req.maxTimeoutSeconds ?? 120);
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const to = getAddress(req.payTo);
  const signature = await account.signTypedData({
    domain: { name: req.extra?.name ?? "USD Coin", version: req.extra?.version ?? "2", chainId: 8453, verifyingContract: getAddress(req.asset) },
    types: { TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION },
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to, value: atomic, validAfter: BigInt(0), validBefore: BigInt(validBefore), nonce },
  });
  const payload = {
    signature,
    authorization: { from: account.address, to, value: atomic.toString(), validAfter: "0", validBefore: String(validBefore), nonce },
  };
  const headers = { ...(init.headers ?? {}) };
  if (version >= 2) headers["PAYMENT-SIGNATURE"] = encode({ x402Version: 2, resource: required?.resource, accepted: req, payload });
  else headers["X-PAYMENT"] = encode({ x402Version: 1, scheme: "exact", network: req.network, payload });

  const paid = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(60_000) });
  const receipt = decode<{ success?: boolean; transaction?: string; errorReason?: string }>(
    paid.headers.get("PAYMENT-RESPONSE") ?? paid.headers.get("X-PAYMENT-RESPONSE"),
  );
  if (!paid.ok) throw new PaymentUnavailable(`${service} did not accept the payment (${receipt?.errorReason ?? `HTTP ${paid.status}`}).`);
  await record({ at: new Date().toISOString(), service, what, amountUsd: usd, tx: receipt?.transaction || null }).catch(() => null);
  return paid;
}

/** USDC balance of Loxley's wallet on Base, read from a public RPC. */
export async function walletUsdcBalance(): Promise<number | null> {
  const address = agentWalletAddress();
  if (!address) return null;
  const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
  const res = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE, data }, "latest"] }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { result?: string } | null;
  return body?.result ? Number(BigInt(body.result)) / 1e6 : null;
}

export type WalletSummary = {
  configured: boolean;
  address: string | null;
  network: "Base";
  explorerUrl: string | null;
  balanceUsdc: number | null;
  dailyBudgetUsd: number;
  maxPerCallUsd: number;
  spentTodayUsd: number;
  totalSpentUsd: number;
  payments: number;
  recent: (Payment & { txUrl: string | null })[];
  services: string[];
  note: string;
};

/** Public view of Loxley's wallet: balance, limits and the payment ledger. */
export async function walletSummary(): Promise<WalletSummary> {
  const address = agentWalletAddress();
  const [balance, ledger] = await Promise.all([walletUsdcBalance(), readLedger()]);
  return {
    configured: Boolean(address),
    address,
    network: "Base",
    explorerUrl: address ? `https://basescan.org/address/${address}` : null,
    balanceUsdc: balance,
    dailyBudgetUsd: dailyBudgetUsd(),
    maxPerCallUsd: maxPerCallUsd(),
    spentTodayUsd: ledger.spentTodayUsd,
    totalSpentUsd: ledger.totalUsd,
    payments: ledger.count,
    recent: ledger.recent.slice(0, 15).map((p) => ({ ...p, txUrl: p.tx ? `https://basescan.org/tx/${p.tx}` : null })),
    services: Object.values(ALLOWED_HOSTS),
    note: "Loxley's operating wallet. It only pays allowlisted data providers per request, within a daily budget. It is not a $LOXLEY or team wallet, and you should never send funds to it.",
  };
}
