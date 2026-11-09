// Thin client for the Blockscout REST API v2 on Robinhood Chain (chain ID 4663).
// Docs: https://docs.blockscout.com/robinhood-api

const DEFAULT_BASE = "https://api.blockscout.com/4663/api/v2";

export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

export class ChainDataError extends Error {}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

// The free Blockscout tier allows 5 requests per second, and rejects bursts with 402/429.
// Every request waits for a slot at least MIN_GAP_MS after the previous one, process-wide.
const MIN_GAP_MS = 230;
const RETRY_STATUSES = new Set([402, 429, 502, 503]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Small in-memory cache to save API credits. Verified source code rarely changes; balances do.
const cache = new Map<string, { data: unknown; expires: number }>();
const ttlFor = (path: string) => (path.startsWith("/smart-contracts/") ? 6 * 60 * 60_000 : 2 * 60_000);

let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function takeSlot(): Promise<void> {
  const slot = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  queue = slot;
  return slot;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.BLOCKSCOUT_API_KEY;
  if (!key) {
    throw new ChainDataError("BLOCKSCOUT_API_KEY is missing. Add it to web/.env.local.");
  }
  const url = new URL((process.env.BLOCKSCOUT_API_BASE || DEFAULT_BASE) + path);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const cacheKey = url.pathname + url.search.replace(/apikey=[^&]*&?/, "");
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.data as T | null;

  for (let attempt = 0; ; attempt++) {
    await takeSlot();
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404 || res.ok) {
      const data = res.ok ? ((await res.json()) as T) : null;
      cache.set(cacheKey, { data, expires: Date.now() + ttlFor(path) });
      return data;
    }
    if (res.headers.get("x-credits-remaining") === "0") {
      throw new ChainDataError(
        "Blockscout API credits are used up. Check the plan and credit balance at dev.blockscout.com.",
      );
    }
    if (RETRY_STATUSES.has(res.status) && attempt < 3) {
      await sleep(600 * 2 ** attempt);
      continue;
    }
    throw new ChainDataError(`Blockscout returned ${res.status} for ${path}`);
  }
}

// Only the fields Loxley reads. Blockscout responses carry many more.
export type AddressInfo = {
  hash: string;
  is_contract?: boolean;
  is_verified?: boolean;
  name?: string | null;
  coin_balance?: string | null;
  creator_address_hash?: string | null;
  creation_tx_hash?: string | null;
  proxy_type?: string | null;
  implementations?: { address_hash?: string; address?: string; name?: string | null }[];
  token?: TokenInfo | null;
};

export type SmartContract = {
  is_verified?: boolean;
  name?: string | null;
  compiler_version?: string | null;
  source_code?: string | null;
  additional_sources?: { file_path: string; source_code: string }[];
  proxy_type?: string | null;
  implementations?: { address_hash?: string; address?: string; name?: string | null }[];
};

export type TokenInfo = {
  address_hash?: string;
  address?: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: string | null;
  total_supply?: string | null;
  holders_count?: string | null;
  holders?: string | null;
  type?: string | null;
  exchange_rate?: string | null;
};

export type TokenHolder = {
  address: { hash: string; is_contract?: boolean; name?: string | null };
  value: string;
};

export type TokenBalance = {
  token: TokenInfo;
  value: string;
};

export const getAddress = (a: string) => get<AddressInfo>(`/addresses/${a}`);
export const getAddressCounters = (a: string) =>
  get<{ transactions_count?: string; token_transfers_count?: string }>(`/addresses/${a}/counters`);
export const getTokenBalances = (a: string) => get<TokenBalance[]>(`/addresses/${a}/token-balances`);
export const getSmartContract = (a: string) => get<SmartContract>(`/smart-contracts/${a}`);
export const getToken = (a: string) => get<TokenInfo>(`/tokens/${a}`);
export const getTokenHolders = (a: string) =>
  get<{ items: TokenHolder[] }>(`/tokens/${a}/holders`);

type AddressRef = { hash: string; is_contract?: boolean; name?: string | null; is_scam?: boolean };

export type TokenTransfer = {
  from: AddressRef;
  to: AddressRef;
  token: TokenInfo;
  total: { value?: string | null; decimals?: string | null } | null;
  timestamp: string;
  transaction_hash: string;
  token_type?: string;
};

export type Transaction = {
  hash: string;
  from: AddressRef;
  to: AddressRef | null;
  value: string;
  timestamp: string;
  status?: string | null;
  result?: string | null;
};

type Page<T> = { items: T[]; next_page_params?: Record<string, string | number> | null };

/** Walks Blockscout's keyset pagination up to maxPages pages. */
async function allPages<T>(path: string, params: Record<string, string>, maxPages: number) {
  const items: T[] = [];
  let next: Record<string, string> = { ...params };
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const res = await get<Page<T>>(path, next);
    items.push(...(res?.items ?? []));
    if (!res?.next_page_params) return { items, truncated };
    next = { ...params, ...Object.fromEntries(Object.entries(res.next_page_params).map(([k, v]) => [k, String(v)])) };
    if (page === maxPages - 1) truncated = true;
  }
  return { items, truncated };
}

export const getTokenTransfers = (a: string, maxPages = 10) =>
  allPages<TokenTransfer>(`/addresses/${a}/token-transfers`, { type: "ERC-20" }, maxPages);
export type ChainStats = {
  total_transactions?: string;
  transactions_today?: string;
  total_addresses?: string;
  average_block_time?: number;
  coin_price?: string;
  gas_prices?: { slow?: number; average?: number; fast?: number };
};
export const getStats = () => get<ChainStats>("/stats");

export type ListedToken = TokenInfo & { volume_24h?: string | null; circulating_market_cap?: string | null };
export const getTopTokens = () => get<{ items: ListedToken[] }>("/tokens", { type: "ERC-20" });

/** Most recent transfers of one token, across all holders. */
export const getTransfersOfToken = (token: string, maxPages = 6) =>
  allPages<TokenTransfer>(`/tokens/${token}/transfers`, {}, maxPages);

export const getTransactions = (a: string, maxPages = 4) =>
  allPages<Transaction>(`/addresses/${a}/transactions`, {}, maxPages);

export type InternalTransaction = {
  from: { hash: string };
  to: { hash: string } | null;
  value: string;
  timestamp: string;
  transaction_hash: string;
  success?: boolean;
};

// ETH sent back by contracts (e.g. selling a token for ETH on a DEX) arrives as internal transactions.
export const getInternalTransactions = (a: string, maxPages = 4) =>
  allPages<InternalTransaction>(`/addresses/${a}/internal-transactions`, {}, maxPages);

/** Formats a raw integer amount with the token's decimals, e.g. "1234500000" + 6 -> "1,234.5". */
export function formatUnits(raw: string | null | undefined, decimals: string | number | null | undefined): string {
  if (!raw) return "0";
  const d = Number(decimals ?? 18);
  try {
    const v = BigInt(raw);
    const base = BigInt(10) ** BigInt(d);
    const whole = v / base;
    const frac = (v % base).toString().padStart(d, "0").slice(0, 4).replace(/0+$/, "");
    return whole.toLocaleString("en-US") + (frac ? "." + frac : "");
  } catch {
    return raw;
  }
}

/** Share of supply as a percentage with 2 decimals, using BigInt to stay exact. */
export function percentOf(part: string, total: string | null | undefined): number {
  try {
    const t = BigInt(total ?? "0");
    if (t === BigInt(0)) return 0;
    return Number((BigInt(part) * BigInt(10000)) / t) / 100;
  } catch {
    return 0;
  }
}

export type AddressDetail = AddressInfo & { creator_address_hash?: string | null; creation_transaction_hash?: string | null; creation_tx_hash?: string | null };
export const getAddressDetail = (a: string) => get<AddressDetail>(`/addresses/${a}`);
export const getTransaction = (hash: string) => get<Transaction & { method?: string | null }>(`/transactions/${hash}`);
/** Transfers of one token in or out of one address, newest first. */
export const getTokenTransfersOf = (a: string, token: string, maxPages = 2) =>
  allPages<TokenTransfer>(`/addresses/${a}/token-transfers`, { type: "ERC-20", token }, maxPages);
