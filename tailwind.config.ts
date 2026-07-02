import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f4f4f6",     // primary text (light on dark)
        muted: "#8b8b96",
        line: "#26262e",
        panel: "#131318",   // card surface
        surface: "#0e0e12", // header / elevated bars
        bg: "#08080b",      // page
        accent: "#5b8cff",
        good: "#22c55e",
        bad: "#ef4444",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
