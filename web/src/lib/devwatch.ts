// Dev watch: find the wallet that launched a token and what it has done with its supply.
// Launchpads like Pons deploy tokens through a factory contract, so when the creator is a contract,
// the real deployer is whoever sent the creation transaction.

import {
  EXPLORER_URL,
  getAddress,
  getAddressDetail,
  getToken,
  getTokenBalances,
  getTokenTransfersOf,
  getTransaction,
  isAddress,
  percentOf,
  type TokenTransfer,
} from "./blockscout";

export type DevMove = {
  at: string;
  kind: "sold" | "moved" | "burned" | "received";
  counterparty: string;
  counterpartyIsContract: boolean;
  amount: number;
  pctOfSupply: number;
  tx: string;
};

export type DevReport = {
  kind: "dev";
  token: string;
  symbol: string | null;
  name: string | null;
  dev: string | null;
  viaFactory: string | null;
  holdsPct: number | null;
  sentPct: number;
  soldPct: number;
  burnedPct: number;
  moves: DevMove[];
  verdict: "quiet" | "selling" | "moving" | "burned" | "unknown";
  explorerUrl: string;
  notes: string[];
};

const BURN = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);
const toNum = (raw: string | null | undefined, decimals: string | number | null | undefined) =>
  raw ? Number(BigInt(raw)) / 10 ** Number(decimals ?? 18) : 0;

/** The externally owned wallet behind a token's deployment, plus the factory name when one was used. */
export async function findDeployer(token: string): Promise<{ dev: string | null; viaFactory: string | null }> {
  const info = await getAddressDetail(token);
  const creator = info?.creator_address_hash ?? null;
  if (!creator) return { dev: null, viaFactory: null };
  const creatorInfo = await getAddress(creator.toLowerCase());
  if (!creatorInfo?.is_contract) return { dev: creator, viaFactory: null };
  const txHash = info?.creation_transaction_hash ?? info?.creation_tx_hash;
  const tx = txHash ? await getTransaction(txHash) : null;
  return { dev: tx?.from?.hash ?? null, viaFactory: creatorInfo.name ?? creator };
}

export async function devActivity(tokenArg: string): Promise<DevReport> {
  if (!isAddress(tokenArg)) throw new Error(`"${tokenArg}" is not a valid token address.`);
  const token = tokenArg.toLowerCase();
  const [meta, { dev, viaFactory }] = await Promise.all([getToken(token), findDeployer(token)]);
  if (!meta) throw new Error("That address is not a token Blockscout knows on Robinhood Chain (new tokens can take a few minutes to index).");
  const base: DevReport = {
    kind: "dev", token, symbol: meta.symbol ?? null, name: meta.name ?? null, dev, viaFactory,
    holdsPct: null, sentPct: 0, soldPct: 0, burnedPct: 0, moves: [], verdict: "unknown",
    explorerUrl: `${EXPLORER_URL}/token/${token}`, notes: [],
  };
  if (!dev) return { ...base, notes: ["Couldn't identify the wallet that created this token."] };

  const [{ items }, balances] = await Promise.all([getTokenTransfersOf(dev.toLowerCase(), token, 3), getTokenBalances(dev.toLowerCase()).catch(() => null)]);
  const supply = meta.total_supply;
  const d = dev.toLowerCase();
  let sent = 0, sold = 0, burned = 0;
  const moves: DevMove[] = items.slice(0, 40).map((t: TokenTransfer) => {
    const out = t.from.hash.toLowerCase() === d;
    const other = out ? t.to : t.from;
    const amount = toNum(t.total?.value, t.total?.decimals ?? meta.decimals);
    const pct = percentOf(t.total?.value ?? "0", supply);
    // Out to a contract is almost always a pool or router: treat it as a sale. Out to a wallet is a move.
    const kind: DevMove["kind"] = !out ? "received" : BURN.has(other.hash.toLowerCase()) ? "burned" : other.is_contract ? "sold" : "moved";
    if (out) sent += pct;
    if (kind === "sold") sold += pct;
    if (kind === "burned") burned += pct;
    return { at: t.timestamp, kind, counterparty: other.hash, counterpartyIsContract: Boolean(other.is_contract), amount, pctOfSupply: pct, tx: t.transaction_hash };
  });

  const bal = balances?.find((b) => (b.token.address_hash ?? b.token.address ?? "").toLowerCase() === token);
  const holdsPct = balances ? percentOf(bal?.value ?? "0", supply) : null;
  const moved = sent - sold - burned;
  const verdict: DevReport["verdict"] = sold >= 1 ? "selling" : moved >= 1 ? "moving" : burned > 0 && sold < 0.1 && moved < 0.1 ? "burned" : "quiet";
  const notes = [
    viaFactory ? `Launched through ${viaFactory}; the deployer is the wallet that sent the launch transaction.` : "The deployer is the wallet that created the contract.",
    "Sends to a burn address are counted as burns, which permanently remove supply. Sends to a contract are counted as sales (usually a pool or router). Sends to a wallet are counted as moves, which can also mean splitting supply across wallets.",
  ];
  if (items.length >= 40) notes.push("Showing the latest 40 transfers only.");
  return { ...base, holdsPct, sentPct: sent, soldPct: sold, burnedPct: burned, moves, verdict, notes };
}

/** Newest outgoing transfer time for the dev of a token, for Telegram watches. */
export async function devOutgoing(dev: string, token: string): Promise<TokenTransfer[]> {
  const { items } = await getTokenTransfersOf(dev.toLowerCase(), token.toLowerCase(), 1);
  return items.filter((t) => t.from.hash.toLowerCase() === dev.toLowerCase());
}
