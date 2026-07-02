"use client";
export type Theme = "dark" | "light";
export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem("psr_theme") === "light" ? "light" : "dark";
}
export function setTheme(t: Theme) {
  localStorage.setItem("psr_theme", t);
  document.documentElement.classList.toggle("light", t === "light");
}
