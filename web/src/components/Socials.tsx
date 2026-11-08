import styles from "./Socials.module.css";

export const SOCIALS = {
  x: { label: "Loxley on X", handle: "@askloxleycom", url: "https://x.com/askloxleycom" },
  telegram: { label: "Loxley Telegram bot", handle: "@loxleyalertsbot", url: "https://t.me/loxleyalertsbot" },
  github: { label: "Loxley on GitHub", handle: "ask-loxley/loxley", url: "https://github.com/ask-loxley/loxley" },
} as const;

const ICONS: Record<keyof typeof SOCIALS, React.ReactNode> = {
  x: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z"
      />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.94 4.66 18.9 19.03c-.23 1.01-.83 1.26-1.68.78l-4.63-3.41-2.23 2.15c-.25.25-.45.45-.93.45l.33-4.71 8.58-7.75c.37-.33-.08-.52-.58-.19L7.16 13.03l-4.56-1.43c-.99-.31-1.01-.99.21-1.47l17.82-6.87c.83-.31 1.55.19 1.31 1.4Z"
      />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  ),
};

/** Icon links to Loxley's X, Telegram bot and GitHub. `tone` picks colors for light or dark backgrounds. */
export default function Socials({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <ul className={`${styles.list} ${styles[tone]} ${className}`}>
      {(Object.keys(SOCIALS) as (keyof typeof SOCIALS)[]).map((k) => (
        <li key={k}>
          <a href={SOCIALS[k].url} target="_blank" rel="noopener noreferrer" aria-label={SOCIALS[k].label} title={SOCIALS[k].handle}>
            {ICONS[k]}
          </a>
        </li>
      ))}
    </ul>
  );
}
