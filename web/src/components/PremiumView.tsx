"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HolderStatus } from "@/lib/holder";
import type { WalletReport } from "@/lib/report";
import { reportSpec } from "@/lib/postSpecs";
import ShareImage from "./app/ShareImage";
import Wordmark from "./Wordmark";
import styles from "./PremiumView.module.css";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eth }).ethereum : undefined);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const DEV = { quiet: "quiet", burned: "burned supply", moving: "moved supply", selling: "selling", unknown: "unknown" } as const;
const tone = (h: WalletReport["holdings"][number]) =>
  h.kind !== "token" ? "ok" : h.verdict === "high risk" || h.dev === "selling" ? "hi" : h.verdict === "caution" || h.dev === "moving" ? "md" : "ok";

export default function PremiumView() {
  const [holder, setHolder] = useState<HolderStatus | null>(null);
  const [min, setMin] = useState<number | null>(null);
  const [minUsd, setMinUsd] = useState<number | null>(null);
  const [step, setStep] = useState<"idle" | "connecting" | "signing" | "checking">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notEnough, setNotEnough] = useState<HolderStatus | null>(null);
  const [report, setReport] = useState<WalletReport | null>(null);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState("");

  useEffect(() => {
    fetch("/api/holder/status")
      .then((r) => r.json())
      .then((d) => {
        setHolder(d.holder?.eligible ? d.holder : null);
        setMin(d.min ?? null);
        setMinUsd(d.minUsd ?? null);
      })
      .catch(() => null);
  }, []);

  async function verify() {
    setError(null);
    setNotEnough(null);
    const provider = eth();
    if (!provider) {
      setError("No wallet found in this browser. Open askloxley.com/premium in your wallet's browser (MetaMask, Rabby, Coinbase Wallet) or install a wallet extension.");
      return;
    }
    try {
      setStep("connecting");
      const [address] = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const c = await (await fetch("/api/holder/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) })).json();
      if (c.error) throw new Error(c.error);
      setStep("signing");
      const signature = (await provider.request({ method: "personal_sign", params: [c.message, address] })) as string;
      setStep("checking");
      const v = await (await fetch("/api/holder/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, message: c.message, signature, token: c.token }) })).json();
      if (v.error) throw new Error(v.error);
      if (v.eligible) setHolder(v);
      else setNotEnough(v);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/reject|denied|4001/i.test(msg) ? "Signature cancelled. Nothing was sent." : msg);
    } finally {
      setStep("idle");
    }
  }

  async function signOut() {
    await fetch("/api/holder/status", { method: "DELETE" }).catch(() => null);
    setHolder(null);
    setReport(null);
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await (await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: target.trim() || undefined }) })).json();
      if (r.error) throw new Error(r.error);
      setReport(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" aria-label="Loxley home">
          <Wordmark size="sm" />
        </Link>
        <Link href="/app" className={styles.cta}>Ask Loxley →</Link>
      </header>

      <main className={styles.main}>
        <span className={styles.eyebrow}>For $LOXLEY holders</span>
        <h1 className={styles.h1}>
          The premium <em>wallet report.</em>
        </h1>
        <p className={styles.lede}>
          Every token in your wallet audited, checked against Robinhood&apos;s official stock token list, with what each token&apos;s dev is
          doing and your airdrop readiness score, rolled into one health score.
        </p>

        {!holder ? (
          <section className={styles.box}>
            <h2>Verify you hold $LOXLEY</h2>
            <p>
              Hold at least <b>${minUsd ?? 10} worth of $LOXLEY</b>{min != null ? ` (about ${fmt(min)} $LOXLEY at today's price)` : ""}, then sign a message with your wallet. Signing is not a transaction: it
              costs no gas and gives no one access to your funds. Loxley never asks for your keys.
            </p>
            <button type="button" className={styles.primary} onClick={verify} disabled={step !== "idle"}>
              {step === "connecting" ? "Connecting…" : step === "signing" ? "Check your wallet…" : step === "checking" ? "Checking balance…" : "Connect wallet and sign"}
            </button>
            {notEnough && (
              <p className={styles.warn}>
                {short(notEnough.address)} holds {fmt(notEnough.balance)} $LOXLEY. The premium report needs ${notEnough.minUsd} worth, about {fmt(notEnough.min)} at today&apos;s price.
              </p>
            )}
          </section>
        ) : (
          <section className={styles.box}>
            <div className={styles.verified}>
              <span><i aria-hidden /> Verified holder · {short(holder.address)} · {fmt(holder.balance)} $LOXLEY</span>
              <button type="button" className={styles.link} onClick={signOut}>Sign out</button>
            </div>
            <label className={styles.label} htmlFor="target">Wallet to check</label>
            <div className={styles.row}>
              <input id="target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`${holder.address} (yours)`} spellCheck={false} />
              <button type="button" className={styles.primary} onClick={run} disabled={running}>
                {running ? "Reading the chain…" : "Run report"}
              </button>
            </div>
            {running && <p className={styles.muted}>This audits every token, so it takes up to a minute.</p>}
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {report && (
          <section className={styles.report} aria-label="Wallet report">
            <div className={styles.summary}>
              <div>
                <span className={styles.label}>Health</span>
                <b className={styles.big}>{report.health ?? "–"}<small>/100</small></b>
              </div>
              <div>
                <span className={styles.label}>Value</span>
                <b className={styles.big}>{usd(report.totalUsd)}</b>
              </div>
              <div>
                <span className={styles.label}>Airdrop score</span>
                <b className={styles.big}>{report.airdrop ? report.airdrop.score : "–"}<small>{report.airdrop ? ` · ${report.airdrop.tier}` : ""}</small></b>
              </div>
            </div>

            {report.alerts.length > 0 && (
              <ul className={styles.alerts}>
                {report.alerts.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th scope="col">Token</th><th scope="col">Value</th><th scope="col">Safety</th><th scope="col">Dev</th></tr>
                </thead>
                <tbody>
                  {report.holdings.map((h) => (
                    <tr key={h.address}>
                      <th scope="row">
                        <a href={`https://robinhoodchain.blockscout.com/token/${h.address}`} target="_blank" rel="noopener noreferrer">{h.symbol}</a>
                        <small>{h.flags[0] ?? h.name ?? ""}</small>
                      </th>
                      <td>{usd(h.valueUsd)}</td>
                      <td><span className={`${styles.pill} ${styles[tone(h)]}`}>{h.kind === "token" ? (h.score != null ? `${h.score}/100 · ${h.verdict}` : "n/a") : h.kind === "loxley" ? "official $LOXLEY" : "official stock token"}</span></td>
                      <td>{h.dev ? DEV[h.dev] : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.muted}>{report.notes.join(" ")}{report.unpriced ? ` ${report.unpriced} unpriced token${report.unpriced === 1 ? "" : "s"} skipped.` : ""}</p>
            <ShareImage make={() => reportSpec(report)} />
          </section>
        )}
      </main>
    </div>
  );
}
