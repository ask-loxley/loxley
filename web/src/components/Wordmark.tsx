import styles from "./Wordmark.module.css";

type Size = "xs" | "sm" | "md" | "lg";

const LOGO_PX: Record<Size, number> = { xs: 32, sm: 40, md: 52, lg: 80 };

/** The Loxley lockup: round statue logo, italic serif name, and a small "On-chain agent" tagline. */
export default function Wordmark({ size = "md", tagline = true }: { size?: Size; tagline?: boolean }) {
  const px = LOGO_PX[size];
  return (
    <span className={`${styles.wm} ${styles[size]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/brand/loxley-logo-round.png" alt="" width={px} height={px} />
      <span className={styles.text}>
        <span className={styles.name}>Loxley</span>
        {tagline && <span className={styles.tag}>On-chain agent</span>}
      </span>
    </span>
  );
}
