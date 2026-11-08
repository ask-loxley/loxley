import {
  EXPLORER_URL,
  formatUnits,
  getAddress,
  getSmartContract,
  getToken,
  getTokenHolders,
  percentOf,
} from "./blockscout";

export type Severity = "high" | "medium" | "low" | "info";

export type Finding = { id: string; severity: Severity; title: string; detail: string };

export type AuditReport = {
  address: string;
  explorerUrl: string;
  isContract: boolean;
  verified: boolean;
  name: string | null;
  compiler: string | null;
  proxy: { type: string; implementation: string | null } | null;
  token: {
    name: string | null;
    symbol: string | null;
    type: string | null;
    totalSupply: string;
    holders: number | null;
  } | null;
  topHolders: { address: string; percent: number; isContract: boolean }[];
  findings: Finding[];
  score: number;
  verdict: "low risk" | "caution" | "high risk";
};

// Burn addresses don't count toward holder concentration.
const BURN = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

// Source-code patterns that commonly signal owner control or scam mechanics.
// These are heuristics: a match means "look closer", not proof of a scam.
const PATTERNS: { id: string; severity: Severity; re: RegExp; title: string; detail: string }[] = [
  {
    id: "mint",
    severity: "high",
    re: /function\s+_?mint\w*\s*\([^)]*\)[^{]*\b(onlyOwner|onlyRole|onlyMinter|auth)\b/i,
    title: "Owner can mint new tokens",
    detail: "A privileged account can create new supply at any time, which can dilute holders.",
  },
  {
    id: "blacklist",
    severity: "high",
    re: /\b(blacklist\w*|isBlacklisted|_isBot|isBot|bots\s*\[|_blocked|isSniper)\b/i,
    title: "Wallets can be blocked",
    detail: "The contract can stop specific wallets from transferring or selling.",
  },
  {
    id: "fees",
    severity: "medium",
    re: /function\s+set\w*(fee|tax)\w*\s*\(/i,
    title: "Owner can change buy/sell tax",
    detail: "Fees can be raised after launch. Check whether there is a hard cap in the code.",
  },
  {
    id: "trading",
    severity: "medium",
    re: /\b(tradingEnabled|enableTrading|tradingOpen|tradingActive|openTrading)\b/i,
    title: "Trading can be switched on or off",
    detail: "The owner controls when transfers are allowed, which can trap buyers.",
  },
  {
    id: "pause",
    severity: "medium",
    re: /\bwhenNotPaused\b|function\s+pause\s*\(/,
    title: "Transfers can be paused",
    detail: "A privileged account can freeze all transfers.",
  },
  {
    id: "limits",
    severity: "low",
    re: /\b(maxTx\w*|maxTransaction\w*|maxWallet\w*|_maxTxAmount)\b/i,
    title: "Transaction or wallet limits",
    detail: "Buys, sells or wallet sizes are capped. Common at launch, but they can block exits.",
  },
  {
    id: "selfdestruct",
    severity: "medium",
    re: /\bselfdestruct\s*\(/,
    title: "Contract can self-destruct",
    detail: "The code contains selfdestruct, which can remove the contract's code.",
  },
  {
    id: "delegatecall",
    severity: "low",
    re: /\bdelegatecall\s*\(/,
    title: "Uses delegatecall",
    detail: "The contract can run external code in its own context. Normal for proxies, risky elsewhere.",
  },
  {
    id: "renounce",
    severity: "info",
    re: /\brenounceOwnership\b/,
    title: "Ownership can be renounced",
    detail: "The contract supports giving up ownership. Check on the explorer whether the owner is the zero address.",
  },
];

const WEIGHT: Record<Severity, number> = { high: 25, medium: 10, low: 3, info: 0 };

export async function auditContract(address: string): Promise<AuditReport> {
  const addr = address.toLowerCase();
  const [info, contract, token, holders] = await Promise.all([
    getAddress(addr),
    getSmartContract(addr).catch(() => null),
    getToken(addr).catch(() => null),
    getTokenHolders(addr).catch(() => null),
  ]);

  const findings: Finding[] = [];
  const isContract = Boolean(info?.is_contract);
  const verified = Boolean(contract?.is_verified ?? info?.is_verified);

  if (!info) {
    findings.push({
      id: "unknown",
      severity: "info",
      title: "Address not found on Robinhood Chain",
      detail: "Blockscout has no record of this address. Double-check that it is on chain ID 4663.",
    });
  } else if (!isContract) {
    findings.push({
      id: "eoa",
      severity: "info",
      title: "This is a wallet, not a contract",
      detail: "There is no contract code to audit at this address.",
    });
  } else if (!verified) {
    findings.push({
      id: "unverified",
      severity: "high",
      title: "Source code is not verified",
      detail: "Nobody can read what this contract does. Treat unverified tokens as high risk.",
    });
  }

  const proxyType = contract?.proxy_type ?? info?.proxy_type ?? null;
  const impl = (contract?.implementations ?? info?.implementations ?? [])[0];
  const proxy = proxyType
    ? { type: proxyType, implementation: impl?.address_hash ?? impl?.address ?? null }
    : null;

  // For proxies the real logic lives in the implementation contract, so scan that code too.
  const implContract = proxy?.implementation
    ? await getSmartContract(proxy.implementation.toLowerCase()).catch(() => null)
    : null;

  const sourceOf = (c: typeof contract) =>
    c ? [c.source_code ?? "", ...(c.additional_sources ?? []).map((s) => s.source_code)].join("\n") : "";
  const source = [verified ? sourceOf(contract) : "", implContract?.is_verified ? sourceOf(implContract) : ""].join("\n");

  if (source.trim()) {
    for (const p of PATTERNS) {
      // delegatecall is expected inside a proxy, so only flag it for non-proxy contracts.
      if (p.id === "delegatecall" && proxy) continue;
      if (p.re.test(source)) findings.push({ id: p.id, severity: p.severity, title: p.title, detail: p.detail });
    }
  }

  if (proxy) {
    findings.push({
      id: "proxy",
      severity: "medium",
      title: "Upgradeable contract",
      detail: "The logic lives behind a proxy, so the team can change what the contract does later.",
    });
    if (proxy.implementation && implContract && !implContract.is_verified) {
      findings.push({
        id: "impl-unverified",
        severity: "high",
        title: "Implementation code is not verified",
        detail: "The proxy points to logic nobody can read.",
      });
    }
  }

  const tok = token ?? info?.token ?? null;
  const holdersCount = tok ? Number(tok.holders_count ?? tok.holders ?? NaN) : NaN;
  const topHolders = (holders?.items ?? [])
    .filter((h) => !BURN.has(h.address.hash.toLowerCase()))
    .slice(0, 10)
    .map((h) => ({
      address: h.address.hash,
      percent: percentOf(h.value, tok?.total_supply),
      isContract: Boolean(h.address.is_contract),
    }));

  if (tok) {
    const top = topHolders[0];
    if (top && top.percent >= 20) {
      findings.push({
        id: "whale",
        severity: top.isContract ? "medium" : "high",
        title: `One wallet holds ${top.percent.toFixed(1)}% of supply`,
        detail: top.isContract
          ? "The top holder is a contract, often a liquidity pool or vesting contract. Confirm which one."
          : "A single wallet can crash the price by selling.",
      });
    }
    const top10 = topHolders.reduce((s, h) => s + h.percent, 0);
    if (top10 >= 60) {
      findings.push({
        id: "concentration",
        severity: "medium",
        title: `Top 10 wallets hold ${top10.toFixed(1)}% of supply`,
        detail: "Supply is concentrated in a few hands.",
      });
    }
    if (Number.isFinite(holdersCount) && holdersCount < 50) {
      findings.push({
        id: "holders",
        severity: "medium",
        title: `Only ${holdersCount} holders`,
        detail: "Very new or thinly held tokens are easier to manipulate.",
      });
    }
  }

  const penalty = findings.reduce((s, f) => s + WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const verdict = score >= 75 ? "low risk" : score >= 45 ? "caution" : "high risk";

  return {
    address: addr,
    explorerUrl: `${EXPLORER_URL}/address/${addr}`,
    isContract,
    verified,
    name: contract?.name ?? info?.name ?? null,
    compiler: contract?.compiler_version ?? null,
    proxy,
    token: tok
      ? {
          name: tok.name ?? null,
          symbol: tok.symbol ?? null,
          type: tok.type ?? null,
          totalSupply: formatUnits(tok.total_supply, tok.decimals),
          holders: Number.isFinite(holdersCount) ? holdersCount : null,
        }
      : null,
    topHolders,
    findings,
    score: isContract ? score : 0,
    verdict: isContract ? verdict : "caution",
  };
}
