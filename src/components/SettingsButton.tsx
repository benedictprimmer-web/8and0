import { useEffect, useRef, useState } from "react";
import { Settings, Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme, type ThemePref } from "../theme/themeContext";
import { ACCENTS } from "../theme/accents";

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Square settings control fixed to the top-right of the screen. Opens a compact
 * popover to switch the light/dark theme and pick the accent colour. All state
 * lives in ThemeProvider; this is purely the control surface.
 */
export default function SettingsButton() {
  const { theme, accent, setTheme, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed right-3 top-3 z-50 sm:right-4 sm:top-4">
      <button
        type="button"
        aria-label="Theme settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-700 bg-surface-900/80 text-gray-400 backdrop-blur transition hover:border-gold-600/50 hover:text-gold-400"
      >
        <Settings className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Theme settings"
          className="absolute right-0 mt-2 w-64 origin-top-right animate-fade-in rounded-xl border border-surface-700 bg-surface-900 p-3 shadow-card"
        >
          {/* Theme mode */}
          <p className="section-label mb-2">Theme</p>
          <div className="grid grid-cols-3 gap-1.5">
            {THEME_OPTIONS.map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[0.7rem] font-semibold transition ${
                    active
                      ? "border-gold-600/50 bg-gold-600/15 text-gold-400"
                      : "border-surface-700 text-gray-400 hover:border-surface-600 hover:text-gray-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Accent colour */}
          <p className="section-label mb-2 mt-4">Accent colour</p>
          <div className="grid grid-cols-4 gap-2">
            {ACCENTS.map((preset) => {
              const active = accent === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAccent(preset.id)}
                  aria-pressed={active}
                  aria-label={preset.label}
                  title={preset.label}
                  className={`flex h-9 items-center justify-center rounded-lg border transition ${
                    active ? "border-white/70" : "border-transparent hover:border-surface-600"
                  }`}
                  style={{ backgroundColor: preset.swatch }}
                >
                  {/* Literal white so the tick stays legible on the vivid swatch
                      in both themes (the `white` token is theme-remapped). */}
                  {active && <Check className="h-4 w-4" strokeWidth={3} style={{ color: "#fff" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
