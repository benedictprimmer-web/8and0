import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ACCENT_IDS, DEFAULT_ACCENT } from "./accents";
import {
  ACCENT_KEY,
  THEME_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemePref,
} from "./themeContext";

// ── Theme state ──────────────────────────────────────────────────────────────
// The app supports light/dark, defaulting to the OS preference ("system"), plus
// a runtime accent colour. Both persist to localStorage and are reflected onto
// <html> via two data attributes; all colour is resolved in CSS from there
// (see src/index.css). The matching pre-paint script in index.html applies the
// same attributes before first paint to avoid a flash of the wrong theme.

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function readThemePref(): ThemePref {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
  return "system";
}

function readAccent(): string {
  try {
    const raw = window.localStorage.getItem(ACCENT_KEY);
    if (raw && ACCENT_IDS.includes(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT;
}

function resolve(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

function apply(resolved: ResolvedTheme, accent: string): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => readThemePref());
  const [accent, setAccentState] = useState<string>(() => readAccent());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(readThemePref()));

  // Reflect state onto <html> and persist.
  useEffect(() => {
    const resolved = resolve(theme);
    setResolvedTheme(resolved);
    apply(resolved, accent);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
      window.localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      /* ignore */
    }
  }, [theme, accent]);

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = resolve("system");
      setResolvedTheme(resolved);
      apply(resolved, accent);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, accent]);

  const setTheme = useCallback((t: ThemePref) => setThemeState(t), []);
  const setAccent = useCallback((a: string) => {
    if (ACCENT_IDS.includes(a)) setAccentState(a);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, accent, setTheme, setAccent }),
    [theme, resolvedTheme, accent, setTheme, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
