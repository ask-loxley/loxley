"use client";

import { useState } from "react";
import type { Draft } from "@/lib/content";
import styles from "./AgentApp.module.css";

type Props = { title: string | null; drafts: Draft[]; warnings: string[] };

function DraftItem({ d, index, total }: { d: Draft; index: number; total: number }) {
  const [state, setState] = useState<"" | "copied" | "sending" | "sent" | string>("");

  async function copy() {
    await navigator.clipboard.writeText(d.text).catch(() => null);
    setState("copied");
    setTimeout(() => setState(""), 1500);
  }

  async function sendTelegram() {
    setState("sending");
    const res = await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: d.text }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setState(res?.ok ? "sent" : body?.error ?? "Send failed");
  }

  return (
    <li className={styles.draft}>
      <div className={styles.draftHead}>
        <span className={styles.auditEyebrow}>
          {d.platform === "x" ? "X post" : "Telegram"}
          {total > 1 ? ` · ${index + 1}/${total}` : ""}
        </span>
        <span className={d.overLimit ? styles.down : styles.notesText}>
          {d.chars}
          {d.platform === "x" ? "/280" : " chars"}
        </span>
      </div>
      <p className={styles.draftText}>{d.text}</p>
      <div className={styles.cardActions}>
        <button type="button" onClick={copy}>
          {state === "copied" ? "Copied" : "Copy"}
        </button>
        {d.platform === "x" && (
          <a
            className={styles.ghostBtn}
            href={`https://x.com/intent/post?text=${encodeURIComponent(d.text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Post on X ↗
          </a>
        )}
        <button type="button" className={styles.ghostBtn} onClick={sendTelegram} disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : state === "sent" ? "Sent to Telegram" : "Send to Telegram"}
        </button>
        {state && !["copied", "sending", "sent"].includes(state) && <span className={styles.down}>{state}</span>}
      </div>
    </li>
  );
}

export default function DraftCard({ title, drafts, warnings }: Props) {
  const [copiedAll, setCopiedAll] = useState(false);
  const xThread = drafts.filter((d) => d.platform === "x");

  return (
    <div className={styles.audit}>
      <div className={styles.draftHead}>
        <div className={styles.auditTitle}>
          <span className={styles.auditEyebrow}>Content drafts</span>
          <strong>{title ?? `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"}`}</strong>
        </div>
        {xThread.length > 1 && (
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={async () => {
              await navigator.clipboard.writeText(xThread.map((d) => d.text).join("\n\n")).catch(() => null);
              setCopiedAll(true);
              setTimeout(() => setCopiedAll(false), 1500);
            }}
          >
            {copiedAll ? "Thread copied" : "Copy whole thread"}
          </button>
        )}
      </div>
      {warnings.map((w) => (
        <p key={w} className={styles.down} style={{ margin: 0, fontSize: 13 }}>
          {w}
        </p>
      ))}
      <ol className={styles.drafts}>
        {drafts.map((d, i) => (
          <DraftItem key={i} d={d} index={i} total={drafts.length} />
        ))}
      </ol>
    </div>
  );
}
