import type { AirdropReport } from "@/lib/airdrop";
import styles from "./AgentApp.module.css";

export default function AirdropCard({ report }: { report: AirdropReport }) {
  const tone = report.score >= 55 ? "ok" : report.score >= 30 ? "md" : "hi";
  return (
    <div className={styles.audit}>
      <div className={styles.auditHead}>
        <div className={`${styles.score} ${styles[tone]}`} aria-label={`Airdrop readiness ${report.score} of 100`}>
          <b>{report.score}</b>
          <span>/100</span>
        </div>
        <div className={styles.auditTitle}>
          <span className={styles.auditEyebrow}>Airdrop readiness · Robinhood Chain</span>
          <strong>
            {report.address.slice(0, 6)}…{report.address.slice(-4)}
          </strong>
          <span className={`${styles.verdict} ${styles[tone]}`}>{report.tier}</span>
        </div>
      </div>

      <ul className={styles.bars}>
        {report.breakdown.map((b) => (
          <li key={b.key}>
            <div className={styles.barHead}>
              <span>{b.label}</span>
              <span>
                {b.points}/{b.max}
              </span>
            </div>
            <div className={styles.barTrack} role="img" aria-label={`${b.label}: ${b.points} of ${b.max}`}>
              <span style={{ width: `${(b.points / b.max) * 100}%` }} />
            </div>
            <small>{b.detail}</small>
          </li>
        ))}
      </ul>

      <div>
        <span className={styles.auditEyebrow}>Next steps</span>
        <ul className={styles.notes} style={{ marginTop: 6 }}>
          {report.nextSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <p className={styles.notesText}>{report.note}</p>
      <a className={styles.explorer} href={report.explorerUrl} target="_blank" rel="noopener noreferrer">
        View wallet on explorer ↗
      </a>
    </div>
  );
}
