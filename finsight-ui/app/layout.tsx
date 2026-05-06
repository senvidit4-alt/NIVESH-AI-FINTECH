import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Ticker } from "@/components/ui/Ticker";

export const metadata: Metadata = {
  title: "FinSight AI — Financial Research Dashboard",
  description: "Professional financial research powered by LangGraph + FinBERT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <Ticker />
        <div className="flex" style={{ paddingTop: "32px" }}>
          <Sidebar />
          <main className="flex-1 ml-60 min-h-screen" style={{ background: "var(--bg-primary)" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
