"use client";
import { useEffect, useState } from "react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [t, setT] = useState<Theme>("dark");
  useEffect(() => setT(getTheme()), []);
  function toggle() { const n: Theme = t === "dark" ? "light" : "dark"; setTheme(n); setT(n); }
  return (
    <button onClick={toggle} className={`btn-ghost px-3 py-1.5 ${className}`} title={`Switch to ${t === "dark" ? "light" : "dark"} mode`} aria-label="Toggle theme">
      {t === "dark" ? "☀︎" : "☾"}
    </button>
  );
}
