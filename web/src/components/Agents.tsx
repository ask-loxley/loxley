"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import Reveal from "./Reveal";
import SplitTitle from "./SplitTitle";
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

// One scene per pair of agents, each with its own statue and tagline.
const SCENES = [
  {
    src: "/brand/loxley-hero-blue-typing.webp",
    color: "var(--blue)",
    tagline: "Reads the code.",
    sub: "Audits contracts and follows smart money, in plain English.",
    alt: "Loxley, an engraved Roman statue wearing headphones, typing on a keyboard",
  },
  {
    src: "/brand/loxley-hero-pink.png",
    color: "var(--pink)",
    tagline: "Finds the yield.",
    sub: "Ranks every pool by risk and scores your airdrop readiness.",
    alt: "Loxley, an engraved Roman statue wearing headphones, arms crossed",
  },
  {
    src: "/brand/loxley-hero-orange.png",
    color: "var(--orange)",
    tagline: "Keeps watch.",
    sub: "Tracks your P&L and turns chain data into posts.",
    alt: "Loxley, an engraved Roman statue wearing headphones, watching askloxley.com on a monitor",
    // shift left so the monitor showing askloxley.com stays in frame
    shift: true,
  },
];

// Scroll distance per agent while the section is pinned, in viewport heights.
const STEP_VH = 42;

export default function Agents() {
  const [open, setOpen] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Pin the section and drive it by scroll on wide screens only, and never for reduced motion.
  const pinned = useMediaQuery("(min-width: 1101px) and (prefers-reduced-motion: no-preference)");
  const scene = Math.floor(open / 2);

  useEffect(() => {
    if (!pinned) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = el.offsetHeight - window.innerHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
      setOpen(Math.min(AGENTS.length - 1, Math.floor(p * AGENTS.length)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pinned]);

  // While pinned, picking an agent scrolls to its step so the scroll position stays the source of truth.
  function pick(i: number) {
    const el = wrapRef.current;
    if (!pinned || !el) {
      setOpen(i);
      return;
    }
    const travel = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY + ((i + 0.5) / AGENTS.length) * travel;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <div
      ref={wrapRef}
      className={pinned ? styles.track : undefined}
      style={pinned ? ({ "--steps": AGENTS.length, "--step": `${STEP_VH}vh` } as CSSProperties) : undefined}
    >
      <div className={pinned ? styles.sticky : undefined}>
        <section id="agents" className={styles.section}>
          <div>
            <Reveal>
              <span className={styles.eyebrow}>The agents</span>
              <SplitTitle className={styles.title} text={"Six specialists,\n*one* Loxley"} />
            </Reveal>
            <ul className={styles.list}>
              {AGENTS.map((a, i) => (
                <li key={a.name} className={`${styles.item} ${i === open ? styles.on : ""}`}>
                  <button className={styles.head} aria-expanded={i === open} onClick={() => pick(i)}>
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

          <div className={styles.pic} style={{ backgroundColor: SCENES[scene].color }}>
            {SCENES.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={s.src}
                src={s.src}
                alt={i === scene ? s.alt : ""}
                aria-hidden={i !== scene}
                className={`${i === scene ? styles.picOn : ""} ${"shift" in s ? styles.shift : ""}`}
                loading="lazy"
                data-depth="-12"
              />
            ))}
            <div key={scene} className={styles.caption}>
              <span className={styles.captionNum}>
                {String(scene * 2 + 1).padStart(2, "0")} · {String(scene * 2 + 2).padStart(2, "0")}
              </span>
              <strong className={styles.tagline}>{SCENES[scene].tagline}</strong>
              <span className={styles.sub}>{SCENES[scene].sub}</span>
            </div>
            <div className={styles.progress} aria-hidden>
              {SCENES.map((s, i) => (
                <i key={s.src} className={i <= scene ? styles.progressOn : ""} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
