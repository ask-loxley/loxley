import type { WhaleActivity, WhaleRow } from "@/lib/whales";
import styles from "./AgentApp.module.css";
import { whaleSpec } from "@/lib/postSpecs";
import ShareImage from "./ShareImage";

const EXPLORER = "https://robinhoodchain.blockscout.com/address/";
const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Side({ title, rows, tone }: { title: string; rows: WhaleRow[]; tone: string }) {
  return (
    <div className={styles.whaleSide}>
      <span className={styles.auditEyebrow}>{title}</span>
      {rows.length ? (
        <ol>
          {rows.slice(0, 5).map((r) => (
            <li key={r.address}>
              <a href={EXPLORER + r.address} target="_blank" rel="noopener noreferrer">
                {r.label ?? short(r.address)}
              </a>
              <b className={tone}>{usd(r.netUsd)}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.notesText}>None in this window.</p>
      )}
    </div>
  );
}

export default function WhaleCard({ data }: { data: WhaleActivity }) {
  const total = data.buyVolumeUsd + data.sellVolumeUsd;
  const buyShare = total > 0 ? Math.round((data.buyVolumeUsd / total) * 100) : 50;
  return (
    <div className={styles.audit}>
      <div className={styles.auditTitle}>
        <span className={styles.auditEyebrow}>Smart money · {data.windowCovered}</span>
        <strong>
          {data.symbol ?? short(data.token)} · {data.trades} trades
        </strong>
      </div>

      <div>
        <div className={styles.pressure} role="img" aria-label={`${buyShare}% buy volume, ${100 - buyShare}% sell volume`}>
          <span style={{ width: `${buyShare}%` }} />
        </div>
        <div className={styles.pressureLegend}>
          <span className={styles.up}>Buys {usd(data.buyVolumeUsd)}</span>
          <span className={styles.down}>Sells {usd(data.sellVolumeUsd)}</span>
        </div>
      </div>

      <div className={styles.whaleGrid}>
        <Side title="Top net buyers" rows={data.topBuyers} tone={styles.up} />
        <Side title="Top net sellers" rows={data.topSellers} tone={styles.down} />
      </div>

      <p className={styles.notesText}>{data.note}</p>
      <a className={styles.explorer} href={data.explorerUrl} target="_blank" rel="noopener noreferrer">
        View token on explorer ↗
      </a>
      <ShareImage make={() => whaleSpec(data)} />
    </div>
  );
}
