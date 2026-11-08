"use client";

import { useState } from "react";
import styles from "./Agents.module.css";

const AGENTS = [
  {
    name: "Contract Auditor",
    text: "Paste any contract address. Loxley reads the source and flags mint functions, hidden taxes, honeypots and unlocked liquidity in plain English.",
  },
  {
    name: "Smart Money Tracker",
    text: "Follow wallets that keep winning. Get the trade, the token and a quick risk check the moment they move.",
  },
  {
    name: "DeFi Yield Finder",
    text: "Compare staking and lending yields across Robinhood Chain, ranked by return and by risk, with the contracts checked first.",
  },
  {
    name: "Airdrop Hunter",
    text: "See how active your wallet looks to airdrop teams, and exactly what to do next to raise your score.",
  },
  {
    name: "P&L and Tax Report",
    text: "Drop in your wallet or exchange history and get a clean profit and loss report, stock tokens included.",
  },
  {
    name: "Content Creator",
    text: "Turn whale moves, new airdrops and yield changes into ready-to-post threads for X and Telegram.",
  },
];

export default function Agents() {
  const [open, setOpen] = useState(0);

  return (
    <section id="agents" className={styles.section}>
      <div>
        <span className={styles.eyebrow}>The agents</span>
        <h2 className={styles.title}>
          Six specialists,
          <br />
          <em>one</em> Loxley
        </h2>
        <ul className={styles.list}>
          {AGENTS.map((a, i) => (
            <li key={a.name} className={`${styles.item} ${i === open ? styles.on : ""}`}>
              <button
                className={styles.head}
                aria-expanded={i === open}
                onClick={() => setOpen(i)}
              >
                <span>{a.name}</span>
                <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
              </button>
              <div className={`${styles.body} ${i === open ? styles.bodyOpen : ""}`} aria-hidden={i !== open}>
                <div>
                  <p>{a.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.pic}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/loxley-hero-pink.png"
          alt="Loxley, an engraved Roman statue wearing headphones, arms crossed"
          loading="lazy"
        />
      </div>
    </section>
  );
}
