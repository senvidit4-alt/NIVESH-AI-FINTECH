import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Particles from "@/components/Particles";
import { videos } from "@/lib/videos";

export default function Hero() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <video
        src={videos.candlestickChart}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover scale-110 animate-[float-y_18s_ease-in-out_infinite]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
      <Particles density={80} />

      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          Nivesh AI · Financial Intelligence OS
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1 }}
          className="text-gradient text-6xl font-semibold tracking-tight md:text-8xl"
          style={{ letterSpacing: "-0.04em" }}
        >
          NIVESH AI
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl"
        >
          Financial Intelligence Beyond Analysis. A multi-agent reasoning engine for markets,
          sentiment, and risk — orchestrated in real time.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="#chat"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground glow-cyan transition-transform hover:scale-[1.03]"
          >
            Launch Agent
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#intel"
            className="inline-flex items-center gap-2 rounded-full glass px-6 py-3 text-sm font-medium text-foreground"
          >
            Explore the Engine
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          Scroll
        </motion.div>
      </div>
    </section>
  );
}