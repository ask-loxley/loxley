"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AgentEvent } from "@/lib/agent";
import type { AirdropReport } from "@/lib/airdrop";
import type { AuditReport } from "@/lib/audit";
import Socials from "../Socials";
import TokenBar from "../TokenBar";
import Wordmark from "../Wordmark";
import AirdropCard from "./AirdropCard";
import DraftCard from "./DraftCard";
import type { Draft } from "@/lib/content";
import type { PnlReport } from "@/lib/pnl";
import type { WhaleActivity } from "@/lib/whales";
import type { YieldPool } from "@/lib/yields";
import AuditCard from "./AuditCard";
import PnlCard from "./PnlCard";
import StockCard from "./StockCard";
import TrendingCard from "./TrendingCard";
import { CalendarCard, DevCard, WhatIfCard } from "./InsightCards";
import type { CalendarReport } from "@/lib/calendar";
import type { DevReport } from "@/lib/devwatch";
import type { WhatIfReport } from "@/lib/whatif";
import type { TrendingReport } from "@/lib/trending";
import type { StockTokenReport } from "@/lib/stocks";
import WhaleCard from "./WhaleCard";
import YieldCard from "./YieldCard";

type Card =
  | { kind: "audit"; key: string; data: AuditReport }
  | { kind: "pnl"; key: string; data: PnlReport }
  | { kind: "yield"; key: string; data: { pools: YieldPool[]; note: string } }
  | { kind: "whale"; key: string; data: WhaleActivity }
  | { kind: "airdrop"; key: string; data: AirdropReport }
  | { kind: "stock"; key: string; data: StockTokenReport }
  | { kind: "trending"; key: string; data: TrendingReport }
  | { kind: "whatif"; key: string; data: WhatIfReport }
  | { kind: "dev"; key: string; data: DevReport }
  | { kind: "calendar"; key: string; data: CalendarReport }
  | { kind: "drafts"; key: string; data: { title: string | null; drafts: Draft[]; warnings: string[] } };
import RichText from "./RichText";
import styles from "./AgentApp.module.css";

// Sent as a normal user message, so the answer stays in the conversation.
const EXPLAIN_SIMPLY = "Explain that again simply, like I'm new to crypto.";

type Step = { id: string; name: string; address?: string; done: boolean; failed?: boolean };

type UiMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      steps: Step[];
      cards: Card[];
      error?: string;
      pending: boolean;
    };

type Status = {
  llm: boolean;
  chain: boolean;
  model: string;
  telegram?: { bot: string | null; connected: boolean; watches: number };
};

const AGENTS = [
  { name: "Contract Auditor", live: true },
  { name: "Wallet & Token Lookup", live: true },
  { name: "P&L and Tax Report", live: true },
  { name: "DeFi Yield Finder", live: true },
  { name: "Smart Money Tracker", live: true },
  { name: "Airdrop Hunter", live: true },
  { name: "Content Creator", live: true },
];

const SUGGESTIONS = [
  { label: "Audit a token", text: "Is this token safe to buy? " },
  { label: "Check a wallet", text: "Give me an overview of this wallet: " },
  { label: "P&L report", text: "Show the profit and loss for this wallet: " },
  { label: "Best stablecoin yield", text: "Where can I earn the best yield on stablecoins with low risk?" },
  { label: "Who's buying?", text: "Who is buying and selling this token in the last 24 hours? " },
  { label: "Airdrop score", text: "How ready is this wallet for a Robinhood Chain airdrop? " },
  { label: "Live campaigns", text: "What airdrop or points campaigns are running on Robinhood Chain right now?" },
  { label: "Write a thread", text: "Write an X thread about the best low-risk yields on Robinhood Chain this week." },
  { label: "What can you do?", text: "What can you help me with on Robinhood Chain?" },
];

const STEP_LABEL: Record<string, string> = {
  audit_contract: "Auditing contract",
  get_wallet_overview: "Reading wallet",
  get_token_info: "Looking up token",
  get_pnl_report: "Building P&L report for",
  find_yields: "Scanning yield pools",
  get_whale_activity: "Tracking buyers and sellers of",
  get_recent_trades: "Reading recent trades of",
  get_airdrop_score: "Scoring airdrop readiness of",
  search_web: "Searching the web",
  read_url: "Reading the page",
  get_stock_tokens: "Checking stock tokens",
  get_trending_pools: "Finding trending pools",
  get_loxley_wallet: "Checking my wallet",
  what_if: "Running the numbers",
  get_dev_activity: "Tracing the dev wallet",
  get_chain_calendar: "Reading the calendar",
  get_content_brief: "Gathering data for the post",
  publish_drafts: "Preparing drafts",
};

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? "");

function isAuditReport(d: unknown): d is AuditReport {
  return Boolean(d && typeof d === "object" && "findings" in d && "score" in d);
}

function isPnlReport(d: unknown): d is PnlReport {
  return Boolean(d && typeof d === "object" && "totals" in d && "disposals" in d);
}

/** Turns a successful tool result into a card for the thread, or null if it has no card. */
function toCard(name: string, id: string, d: unknown): Card | null {
  if (!d || typeof d !== "object" || "error" in d) return null;
  if (name === "audit_contract" && isAuditReport(d)) return { kind: "audit", key: id, data: d };
  if (name === "get_pnl_report" && isPnlReport(d)) return { kind: "pnl", key: id, data: d };
  if (name === "find_yields" && "pools" in d) return { kind: "yield", key: id, data: d as { pools: YieldPool[]; note: string } };
  if (name === "get_whale_activity" && "topBuyers" in d) return { kind: "whale", key: id, data: d as WhaleActivity };
  if (name === "get_airdrop_score" && "breakdown" in d) return { kind: "airdrop", key: id, data: d as AirdropReport };
  if (name === "what_if" && "valueNow" in d) return { kind: "whatif", key: id, data: d as WhatIfReport };
  if (name === "get_dev_activity" && "verdict" in d) return { kind: "dev", key: id, data: d as DevReport };
  if (name === "get_chain_calendar" && "upcoming" in d) return { kind: "calendar", key: id, data: d as CalendarReport };
  if (name === "get_trending_pools" && "pools" in d) return { kind: "trending", key: id, data: d as TrendingReport };
  if (name === "get_stock_tokens" && "kind" in d) return { kind: "stock", key: id, data: d as StockTokenReport };
  if (name === "publish_drafts" && "drafts" in d) {
    return { kind: "drafts", key: id, data: d as { title: string | null; drafts: Draft[]; warnings: string[] } };
  }
  return null;
}

export default function AgentApp() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Deep link: /app?q=... asks that question right away (used by landing page buttons).
  const askedFromUrl = useRef(false);
  useEffect(() => {
    if (askedFromUrl.current) return;
    askedFromUrl.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      window.history.replaceState(null, "", "/app");
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateLast = (fn: (m: Extract<UiMessage, { role: "assistant" }>) => void) =>
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== "assistant") return prev;
      const copy = { ...last, steps: [...last.steps], cards: [...last.cards] };
      fn(copy);
      next[next.length - 1] = copy;
      return next;
    });

  const handleEvent = (e: AgentEvent) => {
    if (e.type === "tool_start") {
      updateLast((m) => m.steps.push({ id: e.id, name: e.name, address: e.address, done: false }));
    } else if (e.type === "tool_result") {
      const failed = Boolean(e.data && typeof e.data === "object" && "error" in e.data);
      updateLast((m) => {
        m.steps = m.steps.map((s) => (s.id === e.id ? { ...s, done: true, failed } : s));
        const card = toCard(e.name, e.id, e.data);
        if (card) m.cards.push(card);
      });
    } else if (e.type === "text") {
      updateLast((m) => {
        m.text = e.text;
      });
    } else if (e.type === "error") {
      updateLast((m) => {
        m.error = e.message;
      });
    }
  };

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const history = [
      ...messages
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.text))
        .map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content },
    ];

    setMessages((prev) => [
      ...prev,
      { role: "user", text: content },
      { role: "assistant", text: "", steps: [], cards: [], pending: true },
    ]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line) as AgentEvent);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        updateLast((m) => {
          m.error = err instanceof Error ? err.message : "Request failed.";
        });
      }
    } finally {
      updateLast((m) => {
        m.pending = false;
      });
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  const missing = status && (!status.llm || !status.chain);

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Link href="/" className={styles.brand} aria-label="Loxley home">
          <Wordmark size="sm" />
        </Link>
        <button className={styles.newChat} onClick={newChat}>
          + New chat
        </button>
        <h2 className={styles.sideTitle}>Agents</h2>
        <ul className={styles.agentList}>
          {AGENTS.map((a) => (
            <li key={a.name} className={a.live ? styles.live : styles.soon}>
              <span>{a.name}</span>
              <small>{a.live ? "Live" : "Soon"}</small>
            </li>
          ))}
        </ul>
        {status?.telegram?.bot && (
          <div className={styles.tg}>
            <h2 className={styles.sideTitle}>Telegram alerts</h2>
            <p>
              {status.telegram.connected
                ? `Connected · ${status.telegram.watches} ${status.telegram.watches === 1 ? "watch" : "watches"}`
                : "Not connected yet. Open the bot and send /start."}
            </p>
            <a href={`https://t.me/${status.telegram.bot}`} target="_blank" rel="noopener noreferrer">
              Open @{status.telegram.bot} ↗
            </a>
          </div>
        )}
        <TokenBar compact />
        <div className={styles.tg}>
          <h2 className={styles.sideTitle}>Loxley&apos;s wallet</h2>
          <p>Loxley pays for some data itself with x402. Every payment is public.</p>
          <Link href="/wallet">See the wallet ↗</Link>
        </div>
        <div className={styles.sideFoot}>
          <Socials tone="light" />
          <p className={styles.sideNote}>Read-only. Loxley never asks for keys or seed phrases. Not financial advice.</p>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mobileBar}>
          <Link href="/" className={styles.brand} aria-label="Loxley home">
            <Wordmark size="xs" />
          </Link>
          <button onClick={newChat}>New chat</button>
        </div>
        {missing && (
          <div className={styles.setup} role="status">
            <strong>Almost ready.</strong> Add{" "}
            {[!status.llm && "OPENROUTER_API_KEY", !status.chain && "BLOCKSCOUT_API_KEY"].filter(Boolean).join(" and ")}{" "}
            to <code>web/.env.local</code>, then restart the dev server.
          </div>
        )}

        <div className={styles.thread}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/loxley-logo-round.png" alt="" width={96} height={96} />
              <h1>
                Ask <em>Loxley</em>
              </h1>
              <p>Paste a token, contract or wallet address on Robinhood Chain.</p>
              <div className={styles.chips}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setInput(s.text);
                      inputRef.current?.focus();
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className={styles.userMsg}>
                  {m.text}
                </div>
              ) : (
                <div key={i} className={styles.agentMsg}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.avatar} src="/brand/loxley-logo-round.png" alt="" width={32} height={32} />
                  <div className={styles.agentBody}>
                    {m.steps.length > 0 && (
                      <ul className={styles.steps}>
                        {m.steps.map((s) => (
                          <li key={s.id} className={s.done ? (s.failed ? styles.stepFail : styles.stepDone) : ""}>
                            <span className={styles.stepIcon} aria-hidden>
                              {s.done ? (s.failed ? "!" : "✓") : ""}
                            </span>
                            {STEP_LABEL[s.name] ?? s.name} {short(s.address)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.cards.map((c) =>
                      c.kind === "audit" ? (
                        <AuditCard key={c.key} report={c.data} />
                      ) : c.kind === "pnl" ? (
                        <PnlCard key={c.key} report={c.data} />
                      ) : c.kind === "yield" ? (
                        <YieldCard key={c.key} pools={c.data.pools} note={c.data.note} />
                      ) : c.kind === "airdrop" ? (
                        <AirdropCard key={c.key} report={c.data} />
                      ) : c.kind === "whatif" ? (
                        <WhatIfCard key={c.key} r={c.data} />
                      ) : c.kind === "dev" ? (
                        <DevCard key={c.key} r={c.data} />
                      ) : c.kind === "calendar" ? (
                        <CalendarCard key={c.key} r={c.data} />
                      ) : c.kind === "trending" ? (
                        <TrendingCard key={c.key} report={c.data} />
                      ) : c.kind === "stock" ? (
                        <StockCard key={c.key} report={c.data} />
                      ) : c.kind === "drafts" ? (
                        <DraftCard key={c.key} title={c.data.title} drafts={c.data.drafts} warnings={c.data.warnings} />
                      ) : (
                        <WhaleCard key={c.key} data={c.data} />
                      ),
                    )}
                    {m.text && (
                      <div className={styles.prose}>
                        <RichText text={m.text} />
                      </div>
                    )}
                    {m.text && !m.pending && !busy && i === messages.length - 1 && (
                      <button type="button" className={styles.simple} onClick={() => send(EXPLAIN_SIMPLY)}>
                        Explain simply
                      </button>
                    )}
                    {m.pending && !m.text && m.steps.every((s) => s.done) && (
                      <div className={styles.thinking} aria-label="Thinking">
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                    {m.error && <div className={styles.error}>{m.error}</div>}
                  </div>
                </div>
              ),
            )
          )}
          <div ref={endRef} />
        </div>

        <form className={styles.composer} onSubmit={onSubmit}>
          <label htmlFor="ask" className={styles.srOnly}>
            Message Loxley
          </label>
          <textarea
            id="ask"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Is 0x… safe to buy?"
            rows={1}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Working…" : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}
