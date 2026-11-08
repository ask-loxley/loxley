"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import styles from "./LiveStats.module.css";

type Pulse = {
  totalTransactions: number | null;
  transactionsToday: number | null;
  totalAddresses: number | null;
  blockTimeMs: number | null;
  ethPriceUsd: number | null;
  tvlUsd: number | null;
};

type Stat = { label: string; value: number | null; format: (n: number) => string };

const compact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
const usd = (n: number) => "$" + Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const usdCompact = (n: number) => "$" + compact(n);

/** Counts from 0 to `to` with an ease-out once `run` turns true. */
function useCountUp(to: number | null, run: boolean, ms = 1600) {
  const [v, setV] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!run || to == null || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms, reduced]);
  return reduced && to != null ? to : v;
}

function StatTile({ stat, run, index }: { stat: Stat; run: boolean; index: number }) {
  const v = useCountUp(stat.value, run, 1400 + index * 150);
  return (
    <div className={styles.tile} style={{ transitionDelay: `${index * 90}ms` }}>
      <b>{stat.value == null ? "–" : stat.format(v)}</b>
      <span>{stat.label}</span>
    </div>
  );
}

export default function LiveStats() {
  const ref = useRef<HTMLElement>(null);
  const [data, setData] = useState<Pulse | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch("/api/pulse")
      .then((r) => r.json())
      .then(setData)
      .catch(() => null);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const stats: Stat[] = [
    { label: "Transactions all time", value: data?.totalTransactions ?? null, format: compact },
    { label: "Transactions today", value: data?.transactionsToday ?? null, format: compact },
    { label: "Wallet addresses", value: data?.totalAddresses ?? null, format: compact },
    { label: "DeFi TVL", value: data?.tvlUsd ?? null, format: usdCompact },
    { label: "ETH price", value: data?.ethPriceUsd ?? null, format: usd },
    {
      label: "Average block time",
      value: data?.blockTimeMs ?? null,
      format: (n) => `${(n / 1000).toFixed(2)}s`,
    },
  ];

  return (
    <section ref={ref} className={`${styles.section} ${visible ? styles.in : ""}`} aria-label="Robinhood Chain live stats">
      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.dot} aria-hidden /> Live from the chain
        </span>
        <h2>
          Robinhood Chain, <em>right now</em>
        </h2>
        <p>The same data Loxley reads every time you ask. Refreshed every few minutes.</p>
      </div>
      <div className={styles.grid}>
        {stats.map((s, i) => (
          <StatTile key={s.label} stat={s} run={visible && data != null} index={i} />
        ))}
      </div>
    </section>
  );
}
