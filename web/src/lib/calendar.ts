// Chain calendar: Robinhood Stock Token corporate actions (official RHJ API) and new Pons launches (GeckoTerminal).

import { rhGet } from "./stocks";

type RhAction = {
  id: string;
  type: string;
  status: string;
  processDate?: { year: number; month: number; day: number } | null;
  tokenSymbol: string;
  details?: Record<string, Record<string, string>>;
};

export type CalendarEvent = {
  id: string;
  date: string | null;
  symbol: string;
  kind: "dividend" | "stock dividend" | "split" | "reverse split" | "other";
  detail: string;
  status: "upcoming" | "processing" | "done";
};

export type NewLaunch = { name: string; symbol: string; address: string | null; createdAt: string; liquidityUsd: number; volume24hUsd: number; url: string };

export type CalendarReport = { kind: "calendar"; upcoming: CalendarEvent[]; recent: CalendarEvent[]; launches: NewLaunch[]; notes: string[] };

const KIND: Record<string, CalendarEvent["kind"]> = {
  CORPORATE_ACTION_TYPE_CASH_DIVIDEND: "dividend",
  CORPORATE_ACTION_TYPE_STOCK_DIVIDEND: "stock dividend",
  CORPORATE_ACTION_TYPE_FORWARD_SPLIT: "split",
  CORPORATE_ACTION_TYPE_REVERSE_SPLIT: "reverse split",
};

function describe(a: RhAction): string {
  const d = a.details ? Object.values(a.details)[0] ?? {} : {};
  if (d.rate && a.type.endsWith("CASH_DIVIDEND")) return `$${Number(d.rate).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} per share, reinvested into the token`;
  if (d.rate && a.type.endsWith("STOCK_DIVIDEND")) return `${d.rate} shares per share`;
  if (d.oldRate && d.newRate) return `${d.oldRate} → ${d.newRate}`;
  return a.type.replace("CORPORATE_ACTION_TYPE_", "").toLowerCase().replace(/_/g, " ");
}

export async function corporateActions(): Promise<{ upcoming: CalendarEvent[]; recent: CalendarEvent[] }> {
  const body = await rhGet<{ corpActions?: RhAction[] }>("/corporate-actions");
  const events = (body.corpActions ?? []).map((a): CalendarEvent => ({
    id: a.id,
    date: a.processDate ? `${a.processDate.year}-${String(a.processDate.month).padStart(2, "0")}-${String(a.processDate.day).padStart(2, "0")}` : null,
    symbol: a.tokenSymbol,
    kind: KIND[a.type] ?? "other",
    detail: describe(a),
    status: "upcoming",
  })).map((e, i) => {
    const a = (body.corpActions ?? [])[i];
    const today = new Date().toISOString().slice(0, 10);
    return { ...e, status: a.status.endsWith("COMPLETED") ? "done" : e.date && e.date <= today ? "processing" : "upcoming" } as CalendarEvent;
  });
  const byDate = (x: CalendarEvent, y: CalendarEvent) => (x.date ?? "9999").localeCompare(y.date ?? "9999");
  return {
    upcoming: events.filter((e) => e.status !== "done").sort(byDate),
    recent: events.filter((e) => e.status === "done").sort((x, y) => byDate(y, x)).slice(0, 10),
  };
}

type GtPool = {
  attributes: { name: string; address: string; pool_created_at?: string; reserve_in_usd?: string | null; volume_usd?: { h24?: string | null } };
  relationships?: { base_token?: { data?: { id?: string } }; dex?: { data?: { id?: string } } };
};

/** Newest pools launched on Pons, from GeckoTerminal's new-pools feed. */
export async function ponsLaunches(limit = 8): Promise<NewLaunch[]> {
  const res = await fetch("https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const pools = res?.ok ? (((await res.json()) as { data?: GtPool[] }).data ?? []) : [];
  return pools
    .filter((p) => (p.relationships?.dex?.data?.id ?? "").startsWith("pons"))
    .slice(0, limit)
    .map((p) => ({
      name: p.attributes.name,
      symbol: p.attributes.name.split(" / ")[0],
      address: p.relationships?.base_token?.data?.id?.split("_")[1] ?? null,
      createdAt: p.attributes.pool_created_at ?? "",
      liquidityUsd: Number(p.attributes.reserve_in_usd ?? 0),
      volume24hUsd: Number(p.attributes.volume_usd?.h24 ?? 0),
      url: `https://www.geckoterminal.com/robinhood/pools/${p.attributes.address}`,
    }));
}

export async function chainCalendar(): Promise<CalendarReport> {
  const [actions, launches] = await Promise.all([corporateActions().catch(() => ({ upcoming: [], recent: [] })), ponsLaunches()]);
  return {
    kind: "calendar",
    ...actions,
    launches,
    notes: [
      "Dividends are reinvested into the stock token through its multiplier, so holders receive no separate payout. The token's price oracle pauses briefly while an action is processed.",
      "New Pons launches are unaudited by default. Audit any of them with Loxley before buying.",
    ],
  };
}
