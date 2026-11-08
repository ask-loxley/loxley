import type { Metadata } from "next";
import AgentApp from "@/components/app/AgentApp";

export const metadata: Metadata = {
  title: "Ask Loxley",
};

export default function AppPage() {
  return <AgentApp />;
}
