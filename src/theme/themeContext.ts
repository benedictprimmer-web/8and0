import { createContext, useContext } from "react";

// Theme context + shared types/keys, kept separate from ThemeProvider.tsx so
// that file can export only its component (satisfies react-refresh lint).

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "eightZero:theme";
export const ACCENT_KEY = "eightZero:accent";

export interface ThemeContextValue {
  theme: ThemePref;
  resolvedTheme: ResolvedTheme;
  accent: string;
  setTheme: (t: ThemePref) => void;
  setAccent: (a: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
