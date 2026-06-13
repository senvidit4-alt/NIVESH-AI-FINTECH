import Particles from "@/components/Particles";
import { videos } from "@/lib/videos";

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border/40">
      <video
        src={videos.glowingStock}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
      <Particles density={50} />
      <div className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="text-gradient text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              NIVESH AI
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              A multi-agent financial intelligence operating system. Built with LangGraph, FinBERT,
              and a relentless obsession for signal.
            </p>
          </div>
          <div>
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Engine</div>
            <ul className="space-y-2 text-sm">
              <li>Research</li>
              <li>Data Fetch</li>
              <li>Sentiment</li>
              <li>Risk · Decision</li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Stack</div>
            <ul className="space-y-2 text-sm">
              <li>LangGraph · Groq</li>
              <li>FinBERT · TextBlob</li>
              <li>PostgreSQL · Redis</li>
              <li>FastAPI</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-border/30 pt-6 text-xs text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} Nivesh AI · Financial Intelligence Beyond Analysis</div>
          <div>Not investment advice.</div>
        </div>
      </div>
    </footer>
  );
}