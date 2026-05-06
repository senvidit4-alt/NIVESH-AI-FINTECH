import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        accent: {
          blue:   "#3b82f6",
          green:  "#10b981",
          red:    "#ef4444",
          amber:  "#f59e0b",
          purple: "#8b5cf6",
        },
      },
      animation: {
        "bounce-slow": "bounce 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
