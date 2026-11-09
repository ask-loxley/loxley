import type { StockQuote, StockTokenReport } from "@/lib/stocks";
import { stockSpec } from "@/lib/postSpecs";
import ShareImage from "./ShareImage";
import styles from "./AgentApp.module.css";

const usd = (n: number | null | undefined, digits = 2) =>
  n == null ? "–" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const compactUsd = (n: number) => "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const SESSION_LABEL = {
  regular: "US market open",
  "pre-market": "Pre-market",
  "after-hours": "After hours",
  overnight: "Overnight session",
  closed: "US market closed",
} as const;

/** Premium above +0.5% or discount below −0.5% is worth a color. */
function Premium({ pct }: { pct: number | null }) {
  if (pct == null) return <span>–</span>;
  const tone = Math.abs(pct) < 0.5 ? "ok" : Math.abs(pct) < 2 ? "md" : "hi";
  return (
    <span className={`${styles.verdict} ${styles[tone]}`} title={pct >= 0 ? "DEX price above the official price" : "DEX price below the official price"}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

function QuoteRow({ q }: { q: StockQuote }) {
  return (
    <tr>
      <th scope="row">
        <a href={q.explorerUrl} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
          {q.symbol}
        </a>
        <span className={styles.poolProject}>{q.name}</span>
      </th>
      <td>{usd(q.officialPrice)}</td>
      <td>
        {q.dex ? (
          q.dex.url ? (
            <a href={q.dex.url} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
              {usd(q.dex.price)}
            </a>
          ) : (
            usd(q.dex.price)
          )
        ) : (
          "–"
        )}
        {q.dex && <span className={styles.poolProject}>{compactUsd(q.dex.liquidityUsd)} liquidity</span>}
      </td>
      <td>
        <Premium pct={q.premiumPct} />
      </td>
    </tr>
  );
}

function QuoteTable({ rows }: { rows: StockQuote[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col">Official</th>
            <th scope="col">DEX</th>
            <th scope="col">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <QuoteRow key={q.address} q={q} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StockCard({ report }: { report: StockTokenReport }) {
  if (report.kind === "stock_check") {
    return (
      <div className={styles.audit}>
        <div className={styles.auditTitle}>
          <span className={styles.auditEyebrow}>Stock token check · Robinhood Chain</span>
          <strong>
            <span className={`${styles.verdict} ${styles.hi}`}>Not official</span> {report.symbol ?? short(report.address)}
            {report.name ? ` · ${report.name}` : ""}
          </strong>
        </div>
        {report.impersonates && (
          <p className={styles.notesText}>
            Copies <b>{report.impersonates.symbol}</b>. Official token:{" "}
            <a href={`https://robinhoodchain.blockscout.com/token/${report.impersonates.address}`} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
              {short(report.impersonates.address)}
            </a>
          </p>
        )}
        <p className={styles.notesText}>{report.notes.join(" ")}</p>
      </div>
    );
  }

  if (report.kind === "stock_overview") {
    return (
      <div className={styles.audit}>
        <div className={styles.auditTitle}>
          <span className={styles.auditEyebrow}>
            Stock tokens · {SESSION_LABEL[report.session]} · {report.officialCount} official
          </span>
          <strong>Most traded on Robinhood Chain</strong>
        </div>
        <QuoteTable rows={report.rows} />
        <p className={styles.notesText}>{report.notes.join(" ")} Sources: Robinhood, DexScreener.</p>
        {report.rows.length > 0 && <ShareImage make={() => stockSpec(report)} />}
      </div>
    );
  }

  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>
          Official Robinhood Stock Token · {SESSION_LABEL[report.session]}
        </span>
        <strong>
          {report.symbol} · {report.name}
        </strong>
      </div>
      <QuoteTable rows={[report]} />
      <p className={styles.notesText}>
        Official bid/ask {usd(report.officialBid)} / {usd(report.officialAsk)}
        {report.dex ? ` · DEX 24h volume ${compactUsd(report.dex.volume24hUsd)} across ${report.dex.pools} pool${report.dex.pools === 1 ? "" : "s"}` : ""} ·{" "}
        <a href={report.explorerUrl} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
          {short(report.address)}
        </a>
      </p>
      <p className={styles.notesText}>{report.notes.join(" ")} Sources: Robinhood, DexScreener.</p>
      <ShareImage make={() => stockSpec(report)} />
    </div>
  );
}
