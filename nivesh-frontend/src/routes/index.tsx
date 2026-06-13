import { createFileRoute } from "@tanstack/react-router";
import Nav from "@/components/Nav";
import Hero from "@/components/sections/Hero";
import MarketIntel from "@/components/sections/MarketIntel";
import AgentIntel from "@/components/sections/AgentIntel";
import Portfolio from "@/components/sections/Portfolio";
import Chat from "@/components/sections/Chat";
import CommandCenter from "@/components/sections/CommandCenter";
import Footer from "@/components/sections/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nivesh AI — Financial Intelligence Beyond Analysis" },
      {
        name: "description",
        content:
          "Nivesh AI is a multi-agent financial intelligence OS: LangGraph reasoning, FinBERT sentiment, and real-time market analytics.",
      },
      { property: "og:title", content: "Nivesh AI — Financial Intelligence OS" },
      {
        property: "og:description",
        content: "Multi-agent reasoning for markets, sentiment, and risk.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <Nav />
      <Hero />
      <MarketIntel />
      <AgentIntel />
      <Portfolio />
      <Chat />
      <CommandCenter />
      <Footer />
    </main>
  );
}
