import type { CalendarReport } from "@/lib/calendar";
import type { DevReport } from "@/lib/devwatch";
import { devSpec, whatIfSpec } from "@/lib/postSpecs";
import type { WhatIfReport } from "@/lib/whatif";
import ShareImage from "./ShareImage";
import styles from "./AgentApp.module.css";

const EXPLORER = "https://robinhoodchain.blockscout.com";
const usd = (n: number, d = 2) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const price = (n: number) => (n >= 1 ? usd(n) : "$" + n.toPrecision(3));
const compactUsd = (n: number) => "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export function WhatIfCard({ r }: { r: WhatIfReport }) {
  const up = r.changePct >= 0;
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>What if · {r.daysAgo} days ago</span>
        <strong>
          {usd(r.amountUsd, 0)} of {r.symbol} on {r.boughtOn} is now{" "}
          <span className={`${styles.verdict} ${styles[up ? "ok" : "hi"]}`}>{usd(r.valueNow)}</span>
        </strong>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th scope="row">Price then</th><td>{price(r.priceThen)}</td></tr>
            <tr><th scope="row">Price now</th><td>{price(r.priceNow)}</td></tr>
            <tr><th scope="row">Change</th><td><span className={`${styles.verdict} ${styles[up ? "ok" : "hi"]}`}>{pct(r.changePct)}</span></td></tr>
            <tr>
              <th scope="row">Pool</th>
              <td>
                <a href={r.poolUrl} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>{r.pool}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={styles.notesText}>{r.notes.join(" ")} Past performance says nothing about the future. Source: GeckoTerminal.</p>
      <ShareImage make={() => whatIfSpec(r)} />
    </div>
  );
}

const VERDICT = {
  quiet: ["Dev is quiet", "ok"],
  burned: ["Dev burned supply", "ok"],
  moving: ["Dev moved supply", "md"],
  selling: ["Dev is selling", "hi"],
  unknown: ["Dev not found", "md"],
} as const;

export function DevCard({ r }: { r: DevReport }) {
  const [label, tone] = VERDICT[r.verdict];
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>Dev watch · {r.symbol ?? short(r.token)}</span>
        <strong>
          <span className={`${styles.verdict} ${styles[tone]}`}>{label}</span>{" "}
          {r.dev && (
            <a href={`${EXPLORER}/address/${r.dev}`} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
              {short(r.dev)}
            </a>
          )}
        </strong>
      </div>
      {r.dev && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Holds now</th><th scope="col">Sold</th><th scope="col">Burned</th><th scope="col">Moved</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{r.holdsPct == null ? "–" : `${r.holdsPct.toFixed(2)}%`}</td>
                <td>{r.soldPct.toFixed(2)}%</td>
                <td>{r.burnedPct.toFixed(2)}%</td>
                <td>{Math.max(0, r.sentPct - r.soldPct - r.burnedPct).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {r.moves.filter((m) => m.kind !== "received").length > 0 && (
        <ul className={styles.notesText} style={{ margin: 0, paddingLeft: 18 }}>
          {r.moves.filter((m) => m.kind !== "received").slice(0, 6).map((m) => (
            <li key={m.tx}>
              {new Date(m.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {m.kind}{" "}
              {m.pctOfSupply.toFixed(2)}% of supply ·{" "}
              <a href={`${EXPLORER}/tx/${m.tx}`} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>tx</a>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.notesText}>{r.notes.join(" ")} Alerts on Telegram: /devwatch {short(r.token)}.</p>
      {r.dev && <ShareImage make={() => devSpec(r)} />}
    </div>
  );
}

const KIND_TONE = { dividend: "ok", "stock dividend": "ok", split: "md", "reverse split": "hi", other: "md" } as const;

export function CalendarCard({ r }: { r: CalendarReport }) {
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>Chain calendar · Robinhood Chain</span>
        <strong>{r.upcoming.length} stock token actions ahead · {r.launches.length} new Pons launches</strong>
      </div>
      {r.upcoming.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Token</th><th scope="col">Action</th></tr>
            </thead>
            <tbody>
              {r.upcoming.slice(0, 10).map((e) => (
                <tr key={e.id}>
                  <td>{e.date ?? "TBA"}{e.status === "processing" ? " · processing" : ""}</td>
                  <th scope="row">{e.symbol}</th>
                  <td>
                    <span className={`${styles.verdict} ${styles[KIND_TONE[e.kind]]}`}>{e.kind}</span>
                    <span className={styles.poolProject}>{e.detail}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.launches.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">New on Pons</th><th scope="col">Liquidity</th><th scope="col">24h volume</th></tr>
            </thead>
            <tbody>
              {r.launches.map((l) => (
                <tr key={l.url}>
                  <th scope="row">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>{l.symbol}</a>
                    <span className={styles.poolProject}>{l.createdAt ? new Date(l.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </th>
                  <td>{compactUsd(l.liquidityUsd)}</td>
                  <td>{compactUsd(l.volume24hUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.notesText}>{r.notes.join(" ")} Sources: Robinhood, GeckoTerminal.</p>
    </div>
  );
}
