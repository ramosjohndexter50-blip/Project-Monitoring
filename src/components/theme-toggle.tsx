"use client";

import { useSyncExternalStore } from "react";

const event = "project-monitor-theme";
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener("storage", callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("project-monitor-theme"); } catch {}
    document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : media.matches ? "dark" : "light";
    callback();
  };
  media.addEventListener("change", sync);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(event, callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener("storage", sync);
    media.removeEventListener("change", sync);
  };
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? "light", () => "light");
  const dark = theme === "dark";
  return (
    <button className="theme-toggle" type="button" aria-label="Dark mode" aria-pressed={dark} title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("project-monitor-theme", next); } catch {}
        window.dispatchEvent(new Event(event));
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />}
      </svg>
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
