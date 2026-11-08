import type { AuditReport, Severity } from "@/lib/audit";
import styles from "./AgentApp.module.css";

const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", info: "Info" };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function AuditCard({ report }: { report: AuditReport }) {
  const tone = report.verdict === "low risk" ? "ok" : report.verdict === "caution" ? "md" : "hi";
  const title = report.token?.symbol
    ? `${report.token.name ?? report.token.symbol} (${report.token.symbol})`
    : report.name ?? short(report.address);
  const findings = [...report.findings].sort(
    (a, b) => ["high", "medium", "low", "info"].indexOf(a.severity) - ["high", "medium", "low", "info"].indexOf(b.severity),
  );

  return (
    <div className={styles.audit}>
      <div className={styles.auditHead}>
        <div className={`${styles.score} ${styles[tone]}`} aria-label={`Safety score ${report.score} of 100`}>
          <b>{report.isContract ? report.score : "–"}</b>
          <span>/100</span>
        </div>
        <div className={styles.auditTitle}>
          <span className={styles.auditEyebrow}>Contract audit</span>
          <strong>{title}</strong>
          <span className={`${styles.verdict} ${styles[tone]}`}>{report.verdict}</span>
        </div>
      </div>

      <div className={styles.facts}>
        <span>{report.verified ? "Verified source" : "Unverified source"}</span>
        {report.proxy && <span>Upgradeable ({report.proxy.type})</span>}
        {report.token?.holders != null && <span>{report.token.holders.toLocaleString("en-US")} holders</span>}
        {report.token && <span>Supply {report.token.totalSupply}</span>}
      </div>

      {findings.length > 0 ? (
        <ul className={styles.findings}>
          {findings.map((f) => (
            <li key={f.id}>
              <span className={`${styles.sev} ${styles["sev_" + f.severity]}`}>{SEVERITY_LABEL[f.severity]}</span>
              <div>
                <strong>{f.title}</strong>
                <p>{f.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.clean}>No red flags found in the source or holder data.</p>
      )}

      <a className={styles.explorer} href={report.explorerUrl} target="_blank" rel="noopener noreferrer">
        View on explorer ↗
      </a>
    </div>
  );
}
