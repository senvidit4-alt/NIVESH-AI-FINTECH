import { Link } from "@tanstack/react-router";

export default function Nav() {
  return (
    <nav className="fixed left-1/2 top-5 z-50 -translate-x-1/2">
      <div className="glass flex items-center gap-1 rounded-full px-2 py-1.5 text-xs">
        <span className="px-3 py-1 text-gradient font-semibold tracking-wider">NIVESH</span>
        <a href="/#intel" className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">Intel</a>
        <a href="/#chat" className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">Agent</a>
        <Link to="/portfolio" className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors [&.active]:text-primary">Portfolio</Link>
        <a href="/#chat" className="ml-1 rounded-full bg-primary px-3 py-1.5 text-primary-foreground glow-cyan">Launch</a>
      </div>
    </nav>
  );
}