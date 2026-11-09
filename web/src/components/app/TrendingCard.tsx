import type { TrendingReport } from "@/lib/trending";
import { trendingSpec } from "@/lib/postSpecs";
import ShareImage from "./ShareImage";
import styles from "./AgentApp.module.css";

const compactUsd = (n: number) => "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span>–</span>;
  const tone = pct >= 0 ? "ok" : pct > -15 ? "md" : "hi";
  return (
    <span className={`${styles.verdict} ${styles[tone]}`}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

export default function TrendingCard({ report }: { report: TrendingReport }) {
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>
          Trending pools · Robinhood Chain
          {report.paidUsd ? ` · paid $${report.paidUsd} via x402` : ""}
        </span>
        <strong>{report.pools.length ? `Top ${report.pools.length} by attention, last 24h` : "Nothing trending right now"}</strong>
      </div>
      {report.pools.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Pool</th>
                <th scope="col">24h</th>
                <th scope="col">Volume</th>
                <th scope="col">Liquidity</th>
              </tr>
            </thead>
            <tbody>
              {report.pools.map((p) => (
                <tr key={p.url}>
                  <th scope="row">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
                      {p.name}
                    </a>
                    <span className={styles.poolProject}>
                      {p.dex}
                      {p.ageDays != null ? ` · ${p.ageDays < 7 ? `new, ${p.ageDays}d old` : `${p.ageDays}d old`}` : ""}
                    </span>
                  </th>
                  <td>
                    <Change pct={p.change24hPct} />
                  </td>
                  <td>{compactUsd(p.volume24hUsd)}</td>
                  <td>{compactUsd(p.liquidityUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.notesText}>
        {report.notes.join(" ")} Source: {report.source}.
      </p>
      {report.pools.length > 0 && <ShareImage make={() => trendingSpec(report)} />}
    </div>
  );
}
