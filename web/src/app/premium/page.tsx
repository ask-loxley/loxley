import type { Metadata } from "next";
import PremiumView from "@/components/PremiumView";

export const metadata: Metadata = {
  title: "Premium wallet report",
  description: "For $LOXLEY holders: every token in your wallet audited, lookalikes flagged, dev activity and airdrop readiness, in one health score.",
};

export default function PremiumPage() {
  return <PremiumView />;
}
