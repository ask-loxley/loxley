import type { Metadata } from "next";
import { Instrument_Serif, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const wordmark = Inter_Tight({
  variable: "--font-wordmark",
  subsets: ["latin"],
  weight: "500",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "500",
});

const DESCRIPTION =
  "Meet Loxley, your on-chain agent for Robinhood Chain. It reads contracts, follows smart money, finds yield and hunts airdrops.";

export const metadata: Metadata = {
  metadataBase: new URL("https://askloxley.com"),
  title: "Loxley — your on-chain agent for Robinhood Chain",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "https://askloxley.com",
    siteName: "Loxley",
    title: "Loxley — your on-chain agent for Robinhood Chain",
    description: DESCRIPTION,
    images: [{ url: "/brand/loxley-hero-blue.png", width: 1254, height: 1254, alt: "Loxley, an engraved Roman statue typing on a keyboard" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@askloxleycom",
    creator: "@askloxleycom",
    title: "Loxley — your on-chain agent for Robinhood Chain",
    description: DESCRIPTION,
    images: ["/brand/loxley-hero-blue.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${wordmark.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
