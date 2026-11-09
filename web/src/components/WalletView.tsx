"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WalletSummary } from "@/lib/x402";
import Wordmark from "./Wordmark";
import styles from "./WalletView.module.css";

const usd = (n: number | null | undefined, digits = 2) =>
  n == null ? "–" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 3) });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function WalletView() {
  const [data, setData] = useState<WalletSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const used = data ? Math.min(100, (data.spentTodayUsd / Math.max(0.0001, data.dailyBudgetUsd)) * 100) : 0;

  async function copy() {
    if (!data?.address) return;
    await navigator.clipboard.writeText(data.address).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" aria-label="Loxley home">
          <Wordmark size="sm" />
        </Link>
        <Link href="/app" className={styles.cta}>
          Ask Loxley →
        </Link>
      </header>

      <main className={styles.main}>
        <span className={styles.eyebrow}>Transparency</span>
        <h1 className={styles.h1}>
          Loxley pays its <em>own</em> way
        </h1>
        <p className={styles.lede}>
          Loxley buys some of its data itself, one request at a time, with USDC on Base using the x402 payment standard.
          No accounts, no API keys. Every payment is listed below with its on-chain receipt.
        </p>

        <div className={styles.warn} role="note">
          <b>Operating wallet only.</b> This is not a $LOXLEY wallet or a team wallet. Do not send funds to it; the
          Loxley team tops it up.
        </div>

        {failed && <p className={styles.muted}>Couldn&apos;t load the wallet right now. Try again in a minute.</p>}
        {!data && !failed && <p className={styles.muted}>Loading the wallet…</p>}

        {data && (
          <>
            <section className={styles.address} aria-label="Wallet address">
              <span className={styles.label}>Address · Base</span>
              {data.address ? (
                <div className={styles.addrRow}>
                  <code>{data.address}</code>
                  <button type="button" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  {data.explorerUrl && (
                    <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer">
                      Basescan ↗
                    </a>
                  )}
                </div>
              ) : (
                <p className={styles.muted}>The wallet is not set up yet.</p>
              )}
            </section>

            <section className={styles.stats} aria-label="Wallet numbers">
              <div>
                <span className={styles.label}>Balance</span>
                <b>{usd(data.balanceUsdc)}</b>
                <small>USDC</small>
              </div>
              <div>
                <span className={styles.label}>Spent today</span>
                <b>{usd(data.spentTodayUsd, 3)}</b>
                <small>of {usd(data.dailyBudgetUsd)} daily budget</small>
                <i className={styles.bar} aria-hidden>
                  <i style={{ width: `${used}%` }} />
                </i>
              </div>
              <div>
                <span className={styles.label}>Spent all time</span>
                <b>{usd(data.totalSpentUsd, 3)}</b>
                <small>
                  {data.payments} payment{data.payments === 1 ? "" : "s"}
                </small>
              </div>
            </section>

            <section className={styles.rules} aria-label="Spending rules">
              <span className={styles.label}>Rules Loxley follows</span>
              <ul>
                <li>Pays only these providers: {data.services.join(", ")}.</li>
                <li>Never more than {usd(data.maxPerCallUsd)} for a single request.</li>
                <li>Stops at {usd(data.dailyBudgetUsd)} a day and switches to free sources.</li>
              </ul>
            </section>

            <section aria-label="Recent payments">
              <span className={styles.label}>Recent payments</span>
              {data.recent.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Paid to</th>
                        <th scope="col">For</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((p, i) => (
                        <tr key={`${p.at}-${i}`}>
                          <td>{when(p.at)}</td>
                          <td>{p.service}</td>
                          <td>{p.what}</td>
                          <td>{usd(p.amountUsd, 3)}</td>
                          <td>
                            {p.txUrl && p.tx ? (
                              <a href={p.txUrl} target="_blank" rel="noopener noreferrer">
                                {short(p.tx)} ↗
                              </a>
                            ) : (
                              "–"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.muted}>No payments yet.</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
