// Accent presets for the "choose your colour" picker. The actual colour ramps
// live in src/index.css, keyed on [data-accent] (and a [data-theme="light"]
// override that shifts each ramp darker for readable accent text on white).
// This file only carries the picker metadata: the id written to
// <html data-accent>, a label, and a swatch colour for the button.

export interface AccentPreset {
  id: string;
  label: string;
  /** Vivid swatch shown in the picker (matches the dark-mode 500 shade). */
  swatch: string;
}

export const ACCENTS: AccentPreset[] = [
  { id: "gold", label: "Gold", swatch: "#F59E0B" },
  { id: "blue", label: "Blue", swatch: "#3B82F6" },
  { id: "green", label: "Green", swatch: "#10B981" },
  { id: "teal", label: "Teal", swatch: "#14B8A6" },
  { id: "purple", label: "Purple", swatch: "#8B5CF6" },
  { id: "pink", label: "Pink", swatch: "#EC4899" },
  { id: "crimson", label: "Crimson", swatch: "#F43F5E" },
  { id: "orange", label: "Orange", swatch: "#F97316" },
];

export const DEFAULT_ACCENT = "gold";
export const ACCENT_IDS = ACCENTS.map((a) => a.id);
