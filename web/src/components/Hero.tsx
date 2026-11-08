"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import styles from "./Hero.module.css";
import Socials from "./Socials";
import Wordmark from "./Wordmark";

type Message = { from: "you" | "loxley"; text: string };

type Scene = {
  color: string;
  image: string;
  alt: string;
  messages: Message[];
};

const SCENES: Scene[] = [
  {
    color: "var(--blue)",
    image: "/brand/loxley-hero-blue.png",
    alt: "Loxley, an engraved Roman statue wearing headphones, typing on a keyboard",
    messages: [
      { from: "you", text: "Is this token safe to buy? 0x9f…c2" },
      {
        from: "loxley",
        text: "I read the contract. 2 red flags: the owner can mint unlimited supply, and liquidity is unlocked. I'd stay away.",
      },
    ],
  },
  {
    color: "var(--pink)",
    image: "/brand/loxley-hero-pink.png",
    alt: "Loxley, an engraved Roman statue wearing headphones, arms crossed",
    messages: [
      { from: "you", text: "Where can my idle USDG earn the most, low risk only?" },
      {
        from: "loxley",
        text: "Robinhood Earn pays about 7% on USDG right now. Morpho's USDG vault is the next safest pick.",
      },
    ],
  },
  {
    color: "var(--orange)",
    image: "/brand/loxley-hero-orange.png",
    alt: "Loxley, an engraved Roman statue wearing headphones, watching a chain dashboard on a monitor",
    messages: [
      { from: "loxley", text: "Heads up: a wallet I track just bought $1.2M of TSLA tokens." },
      { from: "you", text: "Tell me if they sell." },
      { from: "loxley", text: "Done. I'll ping you on Telegram the moment they move." },
    ],
  },
];

const SCENE_MS = 7500;
const TYPING_MS = 1000;
const GAP_MS = 900;

/** One scene's conversation. Remounted per scene (via key), so it always starts from an empty thread. */
function Conversation({ messages, reduced }: { messages: Message[]; reduced: boolean }) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);

  // User messages pop in; Loxley "types" before each reply.
  useEffect(() => {
    if (reduced) return;
    const timers: number[] = [];
    let t = 400;
    messages.forEach((m, i) => {
      if (m.from === "loxley") {
        timers.push(window.setTimeout(() => setTyping(true), t));
        t += TYPING_MS;
      }
      timers.push(
        window.setTimeout(() => {
          setTyping(false);
          setShown(i + 1);
        }, t),
      );
      t += GAP_MS;
    });
    return () => timers.forEach(clearTimeout);
  }, [messages, reduced]);

  const visible = reduced ? messages.length : shown;

  return (
    <div className={styles.chat} aria-live="polite">
      {messages.slice(0, visible).map((m, i) => (
        <div key={i} className={`${styles.bubble} ${m.from === "you" ? styles.you : ""}`}>
          <div className={styles.who}>
            {m.from === "loxley" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/loxley-logo-round.png" alt="" width={20} height={20} />
            )}
            {m.from === "loxley" ? "LOXLEY" : "YOU"}
          </div>
          {m.text}
        </div>
      ))}
      {typing && !reduced && (
        <div className={`${styles.bubble} ${styles.typing}`} aria-label="Loxley is typing">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/loxley-logo-round.png" alt="" width={20} height={20} />
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

export default function Hero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();

  // Advance to the next scene unless paused (hover) or the user prefers reduced motion.
  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(id);
  }, [index, paused, reduced]);

  const scene = SCENES[index];

  return (
    <section
      className={`${styles.hero} ${paused ? styles.paused : ""}`}
      style={{ backgroundColor: scene.color }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {SCENES.map((s, i) => (
        // Plain <img>: these are pre-sized brand renders that cross-fade as stacked layers.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.image}
          src={s.image}
          alt={i === index ? s.alt : ""}
          aria-hidden={i !== index}
          className={`${styles.statue} ${i === index ? styles.active : ""}`}
          loading={i === 0 ? "eager" : "lazy"}
        />
      ))}

      <header className={styles.nav}>
        <a href="#" className={styles.brand} aria-label="Loxley home">
          <Wordmark size="md" />
        </a>
        <nav className={styles.links} aria-label="Main">
          <a href="#agents">Agents</a>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href="/app">Ask Loxley</a>
        </nav>
        <div className={styles.navRight}>
          <Socials tone="light" className={styles.navSocials} />
          <a href="/app" className={styles.launch}>
            Launch app <span className={styles.arrow}>→</span>
          </a>
        </div>
      </header>

      <Conversation key={index} messages={scene.messages} reduced={reduced} />

      <div className={styles.bottom}>
        <span className={styles.live}>
          <span className={styles.pulse} aria-hidden />
          Loxley is watching Robinhood Chain
        </span>
        <div className={styles.dots} role="tablist" aria-label="Hero scenes">
          {SCENES.map((s, i) => (
            <button
              key={s.image}
              role="tab"
              aria-selected={i === index}
              aria-label={`Show scene ${i + 1}`}
              className={`${styles.dot} ${i === index ? styles.dotOn : ""}`}
              onClick={() => setIndex(i)}
            >
              {i === index && <span className={styles.progress} style={{ animationDuration: `${SCENE_MS}ms` }} />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
