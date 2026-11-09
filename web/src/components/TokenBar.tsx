"use client";

import { useEffect, useState } from "react";
import type { LoxleyToken } from "@/lib/token";
import styles from "./TokenBar.module.css";

/** Official $LOXLEY contract banner. Renders nothing until the contract address is set. */
export default function TokenBar({ compact = false }: { compact?: boolean }) {
  const [token, setToken] = useState<LoxleyToken | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setToken(d?.token ?? null))
      .catch(() => null);
  }, []);

  if (!token) return null;

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token.ca).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <aside className={`${styles.bar} ${compact ? styles.compact : ""}`} aria-label="Official $LOXLEY contract">
      <span className={styles.live}>
        <i aria-hidden />
        $LOXLEY is live on Robinhood Chain
      </span>
      <span className={styles.ca}>
        <span className={styles.label}>Official CA</span>
        <code>{token.ca}</code>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
      <span className={styles.links}>
        {token.pons && (
          <a href={token.pons} target="_blank" rel="noopener noreferrer">
            Pons ↗
          </a>
        )}
        <a href={token.explorerUrl} target="_blank" rel="noopener noreferrer">
          Explorer ↗
        </a>
        <a href={token.dexscreenerUrl} target="_blank" rel="noopener noreferrer">
          Chart ↗
        </a>
      </span>
      <span className={styles.warn}>Only this address is official. Not financial advice.</span>
    </aside>
  );
}
