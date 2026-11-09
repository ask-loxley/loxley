import type { CSSProperties } from "react";
import Agents from "@/components/Agents";
import Hero from "@/components/Hero";
import LiveStats from "@/components/LiveStats";
import Motion from "@/components/Motion";
import Reveal from "@/components/Reveal";
import Socials, { SOCIALS } from "@/components/Socials";
import SplitTitle from "@/components/SplitTitle";
import Wordmark from "@/components/Wordmark";
import styles from "./page.module.css";

const STEPS = [
  {
    title: "Add your wallet address",
    text: "Read-only. Loxley never asks for your private key or seed phrase.",
  },
  {
    title: "Ask Loxley anything",
    text: "Audit a token, check your P&L, find yield or see your airdrop score.",
  },
  {
    title: "Get alerts on Telegram",
    text: "Whale moves, big trades and new airdrops, sent the moment they happen.",
  },
];

const YIELDS = [
  { name: "Robinhood Earn · USDG", tag: "LOW RISK · ~7%", tone: "ok" },
  { name: "Morpho · USDG vault", tag: "LOW RISK", tone: "ok" },
  { name: "Uniswap · USDG/ETH LP", tag: "MEDIUM · IL risk", tone: "md" },
  { name: "New farm · 400% APY", tag: "HIGH · unaudited", tone: "hi" },
] as const;

const TICKER = [
  "Contract Auditor",
  "Blockscout",
  "Smart Money Tracker",
  "DefiLlama",
  "DeFi Yield Finder",
  "Telegram alerts",
  "Airdrop Hunter",
  "P&L and Tax Report",
  "Content Creator",
  "Robinhood Chain · 4663",
];

// Headline words animate in one by one; "Loxley" is set in italic.
const HEADLINE: { w: string; em?: boolean; br?: boolean }[] = [
  { w: "Meet" },
  { w: "Loxley,", em: true, br: true },
  { w: "your" },
  { w: "on-chain" },
  { w: "agent", br: true },
  { w: "for" },
  { w: "Robinhood" },
  { w: "Chain" },
];

const Arrow = () => <span className={styles.arrow}>→</span>;

export default function Home() {
  return (
    <>
      <Motion />
      <a href="/app?q=How%20ready%20is%20my%20wallet%20for%20a%20Robinhood%20Chain%20airdrop%3F" className={styles.announce}>
        Robinhood Chain airdrop season is on. See how ready your wallet is.
        <b>
          Check my score <Arrow />
        </b>
      </a>

      <Hero />

      <main>
        <Reveal className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>On-chain intelligence</span>
            <p>
              Loxley is an AI agent with six specialist skills. It reads contracts, follows smart money, finds
              yield and hunts airdrops on Robinhood Chain, so you don&apos;t have to.
            </p>
          </div>
          <div>
            <h1 className={styles.h1}>
              {HEADLINE.map((h, i) => (
                <span key={i}>
                  <span className={styles.word} style={{ "--i": i } as CSSProperties}>
                    {h.em ? <em>{h.w}</em> : h.w}
                  </span>
                  {h.br ? <br /> : " "}
                </span>
              ))}
            </h1>
            <div className={styles.ctas}>
              <a href="/app" className={`${styles.btn} ${styles.dark}`} data-magnetic>
                Ask Loxley <Arrow />
              </a>
              <a href="#how" className={`${styles.btn} ${styles.light}`} data-magnetic>
                See how it works
              </a>
            </div>
          </div>
        </Reveal>

        <div className={styles.marquee} aria-label="Loxley's skills and data sources">
          <div className={styles.track} data-marquee>
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className={styles.source} aria-hidden={i >= TICKER.length}>
                {t}
                <i className={styles.sep} aria-hidden>
                  ✦
                </i>
              </span>
            ))}
          </div>
        </div>

        <Agents />

        <Reveal>
          <LiveStats />
        </Reveal>

        <Reveal className={styles.product}>
          <div className={styles.card} data-tilt="4">
            <div>
              <span className={styles.eyebrow} style={{ color: "var(--vermilion)" }}>
                Ask in plain words
              </span>
              <SplitTitle className={styles.h2} text="Answers you can *act* on" />
              <p className={styles.cardText}>
                No dashboards to decode. Ask Loxley a question, and it pulls the chain data, checks it, and
                tells you what it means, with every source linked.
              </p>
            </div>
            <div className={styles.chat}>
              <div className={`${styles.msg} ${styles.user}`}>Where can my idle USDG earn the most, low risk only?</div>
              <div className={styles.typing} aria-hidden>
                <i />
                <i />
                <i />
              </div>
              <div className={`${styles.msg} ${styles.agent}`}>
                <b>Loxley · top low-risk options right now</b>
                <ul className={styles.risk}>
                  {YIELDS.map((y, i) => (
                    <li key={y.name} style={{ "--i": i } as CSSProperties}>
                      <span>{y.name}</span>
                      <span className={`${styles.tag} ${styles[y.tone]}`}>{y.tag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>

        <section id="how" className={styles.steps}>
          <Reveal className={styles.howArt}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/loxley-standing.webp"
              alt="Loxley, a full-length engraved Roman statue wearing headphones, holding a book with his own portrait on the cover"
              loading="lazy"
              data-parallax="0.06"
            />
          </Reveal>
          <div className={styles.howBody}>
            <Reveal>
              <span className={styles.eyebrow}>How it works</span>
              <SplitTitle className={styles.h2} text="Three steps to a *sharper* wallet" />
            </Reveal>
            <ol className={styles.grid3} data-progress>
              {STEPS.map((s, i) => (
                <li key={s.title} data-tilt="5">
                  <Reveal delay={i * 140} className={styles.step}>
                    <div className={styles.num}>{String(i + 1).padStart(2, "0")}</div>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Reveal id="safety" className={styles.safe}>
          <div className={styles.safeText}>
            <span className={styles.eyebrow} style={{ color: "#fff" }}>
              Safety first
            </span>
            <SplitTitle className={styles.h2} text="Read-only by *design*" />
            <p>Loxley watches the chain for you. It never holds your funds and never signs a transaction.</p>
            <ul>
              <li>No private keys, no seed phrases, ever</li>
              <li>Every answer links to its on-chain source</li>
              <li>Research tool, not financial advice</li>
            </ul>
          </div>
          <div className={styles.safeImg}>
            <span className={styles.scan} aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/loxley-hero-orange.png"
              alt="Loxley, an engraved Roman statue wearing headphones, watching a chain dashboard"
              loading="lazy"
              data-parallax="0.08"
            />
          </div>
        </Reveal>
      </main>

      <footer className={styles.foot}>
        <Reveal className={styles.footCta}>
          <SplitTitle className={styles.h2} text="Ask *Loxley* anything on-chain" />
          <a href="/app" className={styles.btn} style={{ background: "var(--cream)" }} data-magnetic>
            Launch app <Arrow />
          </a>
        </Reveal>
        <div className={styles.cols}>
          <div>
            <Wordmark size="lg" />
            <p className={styles.footTag}>Loxley, your on-chain agent for Robinhood Chain.</p>
            <Socials tone="light" className={styles.footSocials} />
          </div>
          <div>
            <h4>Agents</h4>
            {["Contract Auditor", "Smart Money", "Yield Finder", "Airdrop Hunter", "P&L Report"].map((l) => (
              <a key={l} href="/app">
                {l}
              </a>
            ))}
          </div>
          <div>
            <h4>Community</h4>
            <a href={SOCIALS.x.url} target="_blank" rel="noopener noreferrer">
              X · {SOCIALS.x.handle}
            </a>
            <a href={SOCIALS.telegram.url} target="_blank" rel="noopener noreferrer">
              Telegram · {SOCIALS.telegram.handle}
            </a>
            <a href={SOCIALS.github.url} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
          <div>
            <h4>Loxley</h4>
            <a href="/app">Launch app</a>
            <a href="#how">How it works</a>
            <a href="#safety">Safety</a>
            <a href="/wallet">Loxley&apos;s wallet</a>
            <a href={`${SOCIALS.github.url}#readme`} target="_blank" rel="noopener noreferrer">
              Docs
            </a>
          </div>
        </div>
        <div className={styles.giant} aria-hidden data-px="0.35">
          Loxley <em>Loxley</em> Loxley <em>Loxley</em>
        </div>
        <div className={styles.legal}>
          <span>© 2026 LOXLEY · NOT FINANCIAL ADVICE</span>
          <span>BUILT FOR ROBINHOOD CHAIN</span>
        </div>
      </footer>
    </>
  );
}
