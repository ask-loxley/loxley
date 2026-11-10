// $LOXLEY holder verification: the visitor signs a plain message (no transaction, no gas) to prove they own a
// wallet, then Loxley reads that wallet's $LOXLEY balance on-chain. Holders worth at least HOLDER_MIN_USD
// (at the live DEX price) get a signed session cookie that unlocks premium reports. Nothing is stored server-side.

import { getAddress, verifyMessage, type Hex } from "viem";
import { getTokenBalances, isAddress } from "./blockscout";
import { kvGet, kvSet } from "./kv";
import { paidFetch } from "./x402";
import { loxleyToken } from "./token";

const COOKIE = "lx_holder";
const SESSION_SEC = 24 * 3600;
const CHALLENGE_SEC = 10 * 60;
export const minUsd = () => Number(process.env.HOLDER_MIN_USD || 10);
// Used when no live price is available.
const fallbackTokens = () => Number(process.env.HOLDER_MIN_LOXLEY || 2_500_000);

let priceCache: { at: number; value: number | null } | null = null;

const PRICE_KEY = "loxley-price";

/**
 * Live $LOXLEY price in USD. GeckoTerminal first (free, but it rate-limits Cloudflare), then CoinGecko paid
 * by Loxley's own wallet with x402. Shared through the kv store and refreshed at most once an hour.
 */
export async function loxleyPrice(): Promise<number | null> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60_000) return priceCache.value;
  const stored = await kvGet<{ at: number; value: number }>(PRICE_KEY);
  if (stored && Date.now() - stored.at < 60 * 60_000) {
    priceCache = { at: Date.now(), value: stored.value };
    return stored.value;
  }
  const token = await loxleyToken();
  let value: number | null = null;
  if (token) {
    const ca = token.ca.toLowerCase();
    const free = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/${ca}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const read = async (res: Response | null) =>
      Number(((await res?.json().catch(() => null)) as { data?: { attributes?: { token_prices?: Record<string, string> } } } | null)?.data?.attributes?.token_prices?.[ca]);
    let p = free?.ok ? await read(free) : NaN;
    if (!(p > 0)) {
      // GeckoTerminal rate-limits cloud IPs; the Jina relay usually gets through before we pay.
      const relay = await fetch(`https://r.jina.ai/https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/${ca}`, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
      const text = relay?.ok ? await relay.text() : "";
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      p = json ? await read(new Response(json)) : NaN;
    }
    if (!(p > 0)) {
      const paid = await paidFetch(`https://pro-api.coingecko.com/api/v3/x402/onchain/simple/networks/robinhood/token_price/${ca}`, { headers: { Accept: "application/json" } }, "$LOXLEY price").catch(() => null);
      p = paid?.ok ? await read(paid) : NaN;
    }
    value = p > 0 ? p : null;
  }
  if (value != null) await kvSet(PRICE_KEY, { at: Date.now(), value }).catch(() => null);
  else if (stored) value = stored.value; // keep the last known price rather than dropping to the fallback
  priceCache = { at: Date.now(), value };
  return value;
}

/** Tokens needed right now: HOLDER_MIN_USD worth at the live price, or the fixed fallback amount. */
export async function minHolding(): Promise<number> {
  const price = await loxleyPrice().catch(() => null);
  return price ? Math.ceil(minUsd() / price) : fallbackTokens();
}

function secret(): string {
  const s = process.env.HOLDER_SECRET;
  if (!s || s.length < 32) throw new Error("Holder verification is not configured.");
  return s;
}

const enc = new TextEncoder();
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A fresh message to sign, plus a token that lets the server check it later without storing anything. */
export async function challenge(addressArg: string) {
  if (!isAddress(addressArg)) throw new Error("Not a valid wallet address.");
  const address = getAddress(addressArg);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  const issued = new Date().toISOString();
  const message = [
    "askloxley.com wants you to confirm you hold $LOXLEY.",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issued}`,
    "",
    "Signing proves you own this wallet. It is not a transaction, costs no gas and gives no one access to your funds.",
  ].join("\n");
  return { message, token: await hmac(message) };
}

// ---------- balance ----------

const balanceCache = new Map<string, { at: number; value: number }>();

/** $LOXLEY balance (whole tokens) of a wallet: Robinhood Chain RPC first, Blockscout as a fallback. */
export async function loxleyBalance(address: string): Promise<number> {
  const token = await loxleyToken();
  if (!token) throw new Error("$LOXLEY is not configured yet.");
  const key = address.toLowerCase();
  const hit = balanceCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;

  let value: number | null = null;
  try {
    const data = "0x70a08231" + key.slice(2).padStart(64, "0");
    const res = await fetch("https://rpc.mainnet.chain.robinhood.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token.ca, data }, "latest"] }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await res.json()) as { result?: string };
    if (body.result && /^0x[0-9a-f]*$/i.test(body.result)) value = Number(BigInt(body.result || "0x0")) / 1e18;
  } catch {
    /* fall back to Blockscout */
  }
  if (value == null) {
    const balances = await getTokenBalances(key);
    const b = balances?.find((x) => (x.token.address_hash ?? x.token.address ?? "").toLowerCase() === token.ca.toLowerCase());
    value = b ? Number(BigInt(b.value)) / 10 ** Number(b.token.decimals ?? 18) : 0;
  }
  balanceCache.set(key, { at: Date.now(), value });
  return value;
}

// ---------- verify + session ----------

export type HolderStatus = { address: string; balance: number; min: number; minUsd: number; eligible: boolean };

export async function verifySignature(input: { address: string; message: string; signature: string; token: string }): Promise<HolderStatus> {
  if (!isAddress(input.address)) throw new Error("Not a valid wallet address.");
  const address = getAddress(input.address);
  if (!sameHex(await hmac(input.message), input.token)) throw new Error("That sign-in request is not from askloxley.com. Start again.");
  if (!input.message.includes(`Wallet: ${address}`)) throw new Error("The message is for a different wallet.");
  const issued = Date.parse(input.message.match(/^Issued: (.+)$/m)?.[1] ?? "");
  if (!(Date.now() - issued < CHALLENGE_SEC * 1000)) throw new Error("That sign-in request expired. Start again.");
  const ok = await verifyMessage({ address, message: input.message, signature: input.signature as Hex }).catch(() => false);
  if (!ok) throw new Error("The signature doesn't match this wallet.");
  const [balance, min] = await Promise.all([loxleyBalance(address), minHolding()]);
  return { address, balance, min, minUsd: minUsd(), eligible: balance >= min };
}

export async function sessionCookie(address: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SEC;
  const value = `${address.toLowerCase()}.${exp}.${await hmac(`${address.toLowerCase()}.${exp}`)}`;
  const secure = process.env.LOXLEY_RUNTIME === "cloudflare" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SEC}${secure}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The verified wallet behind this request, re-checking that it still holds enough $LOXLEY. */
export async function currentHolder(request: Request): Promise<HolderStatus | null> {
  const raw = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  const [address, exp, sig] = raw.split(".");
  if (!address || !exp || !sig || !isAddress(address) || Number(exp) * 1000 < Date.now()) return null;
  if (!sameHex(await hmac(`${address}.${exp}`), sig)) return null;
  const [balance, min] = await Promise.all([loxleyBalance(address), minHolding()]);
  return { address: getAddress(address), balance, min, minUsd: minUsd(), eligible: balance >= min };
}
