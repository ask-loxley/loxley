import type { YieldPool } from "@/lib/yields";
import styles from "./AgentApp.module.css";

const compactUsd = (n: number) =>
  "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

const RISK_TONE = { low: "ok", medium: "md", high: "hi" } as const;

export default function YieldCard({ pools, note }: { pools: YieldPool[]; note: string }) {
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>DeFi yields · Robinhood Chain</span>
        <strong>{pools.length ? `${pools.length} pools, safest first` : "No pools match"}</strong>
      </div>
      {pools.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Pool</th>
                <th scope="col">APY</th>
                <th scope="col">TVL</th>
                <th scope="col">Risk</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.poolLink}>
                      {p.symbol}
                    </a>
                    <span className={styles.poolProject}>
                      {p.project}
                      {p.meta ? ` · ${p.meta}` : ""}
                    </span>
                  </th>
                  <td>
                    {p.apy.toFixed(2)}%
                    {p.apyReward > 0 && <span className={styles.poolProject}>{p.apyReward.toFixed(1)}% rewards</span>}
                  </td>
                  <td>{compactUsd(p.tvlUsd)}</td>
                  <td>
                    <span className={`${styles.verdict} ${styles[RISK_TONE[p.risk]]}`} title={p.riskReasons.join(". ")}>
                      {p.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.notesText}>{note} Source: DefiLlama.</p>
    </div>
  );
}
