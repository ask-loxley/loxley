import { auditContract } from "./audit";
import { computePnl } from "./pnl";
import { findYields, type YieldQuery } from "./yields";
import { recentTrades, whaleActivity } from "./whales";
import { airdropScore } from "./airdrop";
import { readUrl, searchWeb, type Recency } from "./webSearch";
import { contentBrief, publishDrafts, type BriefKind } from "./content";
import {
  EXPLORER_URL,
  formatUnits,
  getAddress,
  getAddressCounters,
  getToken,
  getTokenBalances,
  getTokenHolders,
  isAddress,
  percentOf,
} from "./blockscout";

// OpenAI-style function definitions, accepted by OpenRouter for any tool-capable model.
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "audit_contract",
      description:
        "Security check of a smart contract or token on Robinhood Chain: verification, risky owner powers found in the source (mint, blacklist, tax changes, pause, trading switch), upgradeability and holder concentration. Use whenever the user asks if a token or contract is safe.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "0x-prefixed contract address" } },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_overview",
      description:
        "Read-only overview of a wallet on Robinhood Chain: native balance, transaction count and its largest token holdings.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "0x-prefixed wallet address" } },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_yields",
      description:
        "Find DeFi yield opportunities (lending, savings vaults, liquidity pools) on Robinhood Chain from DefiLlama, each with a low/medium/high risk rating and reasons. Use for questions about where to earn yield, APY, staking or farming.",
      parameters: {
        type: "object",
        properties: {
          asset: { type: "string", description: "Optional asset symbol to filter by, e.g. USDG, ETH, BTC" },
          stablecoinOnly: { type: "boolean", description: "Only stablecoin pools" },
          maxRisk: { type: "string", enum: ["low", "medium", "high"], description: "Highest risk level to include" },
          sortBy: { type: "string", enum: ["apy", "tvl"], description: "Sort by APY (default) or pool size" },
          limit: { type: "integer", description: "How many pools to return, max 25 (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_whale_activity",
      description:
        "Who is buying and selling a token right now on Robinhood Chain: the biggest net buyers and sellers, buy vs sell volume, over a recent window. Use for smart money, whale or 'who is buying' questions about a token.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "0x-prefixed token address" },
          hours: { type: "integer", description: "Look-back window in hours, 1-168 (default 24)" },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_trades",
      description:
        "A wallet's most recent token trades on Robinhood Chain, grouped per transaction (what it sold and what it got), with USD values at trade time. Use to follow what a specific wallet or whale is doing.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "0x-prefixed wallet address" } },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_airdrop_score",
      description:
        "Airdrop-readiness score (0-100) for a wallet on Robinhood Chain, based on the on-chain habits past L2 airdrops rewarded: transactions, active weeks and months, unique contracts, protocol variety (DEX, lending, bridge, perps, stock tokens) and volume. Includes next steps to improve. Use for airdrop eligibility or farming questions about a wallet.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "0x-prefixed wallet address" } },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the web for fresh off-chain information: news, announcements, airdrop or points campaigns, prices of stocks or currencies, general facts that may have changed. Returns a short answer plus the top results with snippets and source URLs. Costs a little per call: use it at most once or twice per question, and only when your other tools can't answer.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look up, e.g. 'Robinhood Chain airdrop points campaigns November 2026'" },
          recency: { type: "string", enum: ["day", "week", "month", "year"], description: "Only results from this period. Use 'day' or 'week' for news." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_url",
      description:
        "Read the text of a public web page: a link the user pasted, or a search result worth opening for detail (docs, announcements, articles). Returns the page title and up to ~8,000 characters of text. Free.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Full https:// link" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_content_brief",
      description:
        "Fresh data bundle for writing a social post about Robinhood Chain. Kinds: market_pulse (chain stats, top tokens by volume, top yields), yield_roundup (best low and medium risk yields), whale_watch (24h buy/sell pressure and biggest wallets for a token), token_spotlight (safety audit plus 24h activity for a token). Call this before writing any content.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["market_pulse", "yield_roundup", "whale_watch", "token_spotlight"] },
          token: { type: "string", description: "Token address, required for whale_watch and token_spotlight" },
        },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "publish_drafts",
      description:
        "Show finished post drafts to the user as copy-ready cards with Post-on-X and Send-to-Telegram buttons. Call once with all posts after writing them. For an X thread, pass each post as a separate item in order.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short label, e.g. 'Weekly yield roundup thread'" },
          posts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                platform: { type: "string", enum: ["x", "telegram"] },
                text: { type: "string" },
              },
              required: ["platform", "text"],
            },
          },
        },
        required: ["posts"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pnl_report",
      description:
        "Profit and loss report for a wallet on Robinhood Chain: realized and unrealized P&L in USD per token (FIFO cost basis from historical prices), current holdings value, and taxable disposals. Use for questions about profit, loss, performance or taxes.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "0x-prefixed wallet address" } },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_info",
      description:
        "Basic market facts for a token on Robinhood Chain: name, symbol, supply, holder count, price if known, and the top holders.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "0x-prefixed token address" } },
        required: ["address"],
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["function"]["name"];

async function walletOverview(address: string) {
  const [info, counters, balances] = await Promise.all([
    getAddress(address),
    getAddressCounters(address).catch(() => null),
    getTokenBalances(address).catch(() => null),
  ]);
  if (!info) return { found: false, address };
  const tokens = (balances ?? [])
    .map((b) => {
      const amount = formatUnits(b.value, b.token.decimals);
      const price = Number(b.token.exchange_rate ?? NaN);
      const qty = Number(amount.replace(/,/g, ""));
      return {
        symbol: b.token.symbol,
        name: b.token.name,
        address: b.token.address_hash ?? b.token.address,
        amount,
        usdValue: Number.isFinite(price) && Number.isFinite(qty) ? Math.round(price * qty * 100) / 100 : null,
      };
    })
    .sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1))
    .slice(0, 15);
  return {
    found: true,
    address,
    explorerUrl: `${EXPLORER_URL}/address/${address}`,
    isContract: Boolean(info.is_contract),
    nativeBalanceEth: formatUnits(info.coin_balance, 18),
    transactions: counters?.transactions_count ?? null,
    tokenTransfers: counters?.token_transfers_count ?? null,
    tokens,
  };
}

async function tokenInfo(address: string) {
  const [token, holders] = await Promise.all([getToken(address), getTokenHolders(address).catch(() => null)]);
  if (!token) return { found: false, address };
  return {
    found: true,
    address,
    explorerUrl: `${EXPLORER_URL}/token/${address}`,
    name: token.name,
    symbol: token.symbol,
    type: token.type,
    totalSupply: formatUnits(token.total_supply, token.decimals),
    holders: token.holders_count ?? token.holders ?? null,
    priceUsd: token.exchange_rate ?? null,
    topHolders: (holders?.items ?? []).slice(0, 10).map((h) => ({
      address: h.address.hash,
      label: h.address.name ?? null,
      isContract: Boolean(h.address.is_contract),
      percent: percentOf(h.value, token.total_supply),
    })),
  };
}

export async function runTool(name: string, rawArgs: string): Promise<unknown> {
  let args: { address?: string; hours?: number } & YieldQuery;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { error: "Arguments were not valid JSON." };
  }
  if (name === "publish_drafts") return publishDrafts(args as { posts?: unknown; title?: unknown });
  if (name === "get_content_brief") {
    const { kind, token } = args as { kind?: string; token?: string };
    const kinds = ["market_pulse", "yield_roundup", "whale_watch", "token_spotlight"];
    if (!kind || !kinds.includes(kind)) return { error: `kind must be one of ${kinds.join(", ")}` };
    return contentBrief(kind as BriefKind, token?.trim().toLowerCase());
  }
  if (name === "search_web") {
    const query = typeof (args as { query?: unknown }).query === "string" ? (args as { query: string }).query.trim() : "";
    if (!query) return { error: "Pass a search query." };
    const recency = (args as { recency?: unknown }).recency;
    return searchWeb(query, ["day", "week", "month", "year"].includes(recency as string) ? (recency as Recency) : undefined);
  }
  if (name === "read_url") {
    const url = typeof (args as { url?: unknown }).url === "string" ? (args as { url: string }).url : "";
    if (!url) return { error: "Pass a full https:// link." };
    return readUrl(url);
  }
  if (name === "find_yields") {
    return findYields({
      asset: typeof args.asset === "string" ? args.asset : undefined,
      stablecoinOnly: args.stablecoinOnly === true,
      maxRisk: ["low", "medium", "high"].includes(args.maxRisk as string) ? args.maxRisk : undefined,
      sortBy: args.sortBy === "tvl" ? "tvl" : "apy",
      limit: Number.isFinite(args.limit) ? Number(args.limit) : undefined,
    });
  }
  const address = (args.address ?? "").trim();
  if (!isAddress(address)) {
    return { error: `"${address}" is not a valid 0x address. Ask the user for the full 42-character address.` };
  }
  const a = address.toLowerCase();
  switch (name as ToolName) {
    case "audit_contract":
      return auditContract(a);
    case "get_wallet_overview":
      return walletOverview(a);
    case "get_token_info":
      return tokenInfo(a);
    case "get_pnl_report":
      return computePnl(a);
    case "get_whale_activity": {
      const hours = Math.min(168, Math.max(1, Math.round(Number(args.hours) || 24)));
      return whaleActivity(a, hours);
    }
    case "get_recent_trades":
      return recentTrades(a);
    case "get_airdrop_score":
      return airdropScore(a);
    default:
      return { error: `Unknown tool ${name}` };
  }
}
