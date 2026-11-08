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

export const metadata: Metadata = {
  title: "Loxley — On-chain intelligence for Robinhood Chain",
  description:
    "Six AI agents that read contracts, follow smart money, find yield and hunt airdrops on Robinhood Chain.",
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
