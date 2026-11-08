"use client";

import type { PnlReport } from "@/lib/pnl";
import styles from "./AgentApp.module.css";

const usd = (n: number | null | undefined) =>
  n == null
    ? "–"
    : (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number) =>
  n === 0 ? "0" : n < 0.001 ? "<0.001" : n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 });

const tone = (n: number | null | undefined) => (n == null || Math.abs(n) < 0.005 ? "" : n > 0 ? styles.up : styles.down);

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" }) : "–");

function downloadCsv(report: PnlReport) {
  const header = ["date", "token_symbol", "token_address", "quantity", "proceeds_usd", "cost_basis_usd", "gain_usd", "unknown_basis_qty", "tx_hash"];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = report.disposals.map((d) =>
    [d.date, d.symbol, d.token, d.quantity, d.proceedsUsd, d.costBasisUsd, d.gainUsd, d.unknownBasisQty, d.tx].map(esc).join(","),
  );
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `loxley-pnl-${report.address.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PnlCard({ report }: { report: PnlReport }) {
  const t = report.totals;
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>P&amp;L report</span>
        <strong>
          {report.address.slice(0, 6)}…{report.address.slice(-4)} · {day(report.from)} – {day(report.to)}
        </strong>
      </div>

      <div className={styles.kpis}>
        <div>
          <span>Total P&amp;L</span>
          <b className={tone(t.totalUsd)}>{usd(t.totalUsd)}</b>
        </div>
        <div>
          <span>Realized</span>
          <b className={tone(t.realizedUsd)}>{usd(t.realizedUsd)}</b>
        </div>
        <div>
          <span>Unrealized</span>
          <b className={tone(t.unrealizedUsd)}>{usd(t.unrealizedUsd)}</b>
        </div>
        <div>
          <span>Holdings now</span>
          <b>{usd(t.currentValueUsd)}</b>
        </div>
      </div>

      {report.tokens.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Holding</th>
                <th scope="col">Value</th>
                <th scope="col">Realized</th>
                <th scope="col">Unrealized</th>
              </tr>
            </thead>
            <tbody>
              {report.tokens.slice(0, 12).map((row) => (
                <tr key={row.token}>
                  <th scope="row">
                    {row.symbol}
                    {row.unknownBasis && (
                      <span className={styles.flag} title="Part of what was sold never arrived in this window, so its cost is unknown.">
                        *
                      </span>
                    )}
                  </th>
                  <td>{qty(row.holding)}</td>
                  <td>{usd(row.holdingValueUsd)}</td>
                  <td className={tone(row.realizedUsd)}>{usd(row.realizedUsd)}</td>
                  <td className={tone(row.unrealizedUsd)}>{usd(row.unrealizedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.clean}>No priced token activity found for this wallet.</p>
      )}

      <ul className={styles.notes}>
        {report.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <div className={styles.cardActions}>
        <button type="button" onClick={() => downloadCsv(report)} disabled={!report.disposals.length}>
          Download disposals CSV ({report.disposals.length})
        </button>
        <a className={styles.explorer} href={report.explorerUrl} target="_blank" rel="noopener noreferrer">
          View wallet on explorer ↗
        </a>
      </div>
    </div>
  );
}
