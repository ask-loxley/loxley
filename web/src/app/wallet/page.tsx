import type { Metadata } from "next";
import WalletView from "@/components/WalletView";

export const metadata: Metadata = {
  title: "Loxley's wallet",
  description: "Loxley pays for some of its data itself, per request, in USDC on Base. Every payment is public.",
};

export default function WalletPage() {
  return <WalletView />;
}
