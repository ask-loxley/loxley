"use client";

import { useState } from "react";
import SplitTitle from "./SplitTitle";
import styles from "./Agents.module.css";

// The picture changes with the open agent: one duotone scene per pair of agents.
const PICS = [
  { src: "/brand/loxley-hero-blue.png", color: "var(--blue)", alt: "Loxley, an engraved Roman statue wearing headphones, typing on a keyboard" },
  { src: "/brand/loxley-hero-pink.png", color: "var(--pink)", alt: "Loxley, an engraved Roman statue wearing headphones, arms crossed" },
  { src: "/brand/loxley-hero-orange.png", color: "var(--orange)", alt: "Loxley, an engraved Roman statue wearing headphones, watching a chain dashboard" },
];

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
        <SplitTitle className={styles.title} text={"Six specialists,\n*one* Loxley"} />
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
      <div className={styles.pic} style={{ backgroundColor: PICS[Math.floor(open / 2)].color }}>
        {PICS.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.src}
            src={p.src}
            alt={i === Math.floor(open / 2) ? p.alt : ""}
            aria-hidden={i !== Math.floor(open / 2)}
            className={i === Math.floor(open / 2) ? styles.picOn : ""}
            loading="lazy"
            data-depth="-12"
          />
        ))}
        <span key={open} className={styles.picNum} aria-hidden>
          {String(open + 1).padStart(2, "0")}
        </span>
      </div>
    </section>
  );
}
