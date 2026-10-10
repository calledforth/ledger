"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemePref, string> = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };

/** Cycles system → light → dark. The choice lives in a cookie so the server renders the right theme with no flash. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setPref(t);
  }, []);
  const cycle = () => {
    const next = NEXT[pref];
    setPref(next);
    const root = document.documentElement;
    if (next === "system") {
      delete root.dataset.theme;
      document.cookie = "theme=; path=/; max-age=0; samesite=lax";
    } else {
      root.dataset.theme = next;
      document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  };
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  return (
    <button type="button" className="iconbtn ghost" onClick={cycle} aria-label={`${LABEL[pref]}. Switch to ${NEXT[pref]}`} title={LABEL[pref]}>
      <Icon size={17} />
    </button>
  );
}
