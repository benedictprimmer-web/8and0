# Page 1 (SetupScreen) — UI/UX Review

_Grounded review of the first screen a player sees. Screenshots taken from the
running app on an iPhone-class viewport (390×844, DSF 3), **both** themes._

**Date:** 2026-07-09 · **Target:** `SetupScreen` in `src/pages/EightZeroGame.tsx:660`
· **Lenses:** `ui-ux-and-feedback`, `mobile-app-ui-design`, `game-feel-and-juice`

---

## The thesis

Page 1 is **structurally sound but visually undifferentiated**. Every important
thing is styled at the same volume — the same saturated gold fills the selected
formation, the selected difficulty, *and* the primary CTA — so nothing wins the
eye. The screen the game was designed for (gold-on-navy, trophy energy) is the
**dark** theme, but the app follows the OS, so a large share of users land on a
flat, washed-out light version that reads like a settings page, not a World Cup
draft. The fixes are cheap and mostly CSS.

---

## Findings

Severity: **High** = hurts first impression / usability now · **Med** = clear
polish win · **Low** = nice-to-have. `safe` = apply without a design call;
`ask` = needs your taste call.

### 🎨 Colours

| # | Sev | Finding | Why (skill principle) | Where |
|---|-----|---------|----------------------|-------|
| C1 | **High** | **One accent does three jobs.** `bg-gold-500` fills the active Formation tile, the active Difficulty tile, *and* the "Start draft" CTA. Selection state and the primary action are indistinguishable, so the CTA stops being "the one thing." | mobile: *"Save strong colors for meaningful moments — overuse kills hierarchy"*; 60/30/10 (accent ≈10%, not 3 roles). | `EightZeroGame.tsx:723,740,851` · `OptionButton` |
| C2 | **High** | **Light theme looks corporate.** Grey text on white with orange chips reads like a form, not a football game. Dark is the on-brand one but only shows if the OS is in dark mode. | mobile Step 4 (Peak-End: first impression is flat); ui-ux E (contrast measured against *brightest* scene). | `index.css:74` (light tokens); default = `prefers-color-scheme` (`index.html:17`) |
| C3 | Med | **"ON/OFF" is not colour-coded.** Mode toggles show a muted grey "OFF" and a barely-different "ON"; enabled state is carried by text alone at low contrast. | ui-ux C (*success/enabled needs a distinct signal vocabulary*); E (don't encode state by colour/text alone at low contrast). | `ModeCard` `rightLabel` |
| C4 | Med | **Emoji icons clash with the gold/lucide system.** 🔥🔗⚡🙈🏆🎯 sit next to refined lucide glyphs and the gold palette — two visual languages. | mobile: *"Keep visual style consistent — no random mix."* | `EightZeroGame.tsx:760–821` |
| C5 | Low | **No brand/hero colour moment.** "8-0" is plain text top-left; there's no pitch, trophy, or colour field to anchor identity. | mobile hero / Peak-End. | `EightZeroGame.tsx:700` |

### ✍️ Text

| # | Sev | Finding | Why (skill principle) | Where |
|---|-----|---------|----------------------|-------|
| T1 | **High** | **Everything is bold.** All-caps gold section labels + bold card titles + black CTA all shout at once — no quiet layer to push against. | mobile: *"Create hierarchy with size, weight and opacity — not just bold everything"* (max 2 weights). | `section-label` (`index.css:189`) + card titles |
| T2 | Med | **Mobile copy truncates awkwardly.** Mode descriptions are written for desktop width and clip mid-word on a phone ("…Diomande…", "…lif…"). | ui-ux menu template (*reflow tested at real label length*). | `ModeCard desc`, e.g. `:762,:778` |
| T3 | Med | **"BEST 0" competes with the title** and means nothing on a first visit — a large gold zero pulls the eye to a non-value. | ui-ux B (visual weight = priority); progressive disclosure. | `EightZeroGame.tsx:713–716` |
| T4 | Low | Section-label tracking (`0.18em` at `text-base`) is wide enough to read slightly dated on the larger labels. | type craft (letter-spacing scales *down* as size goes up). | `EightZeroGame.tsx:720,737,756` |

### 📱 Phone

| # | Sev | Finding | Why (skill principle) | Where |
|---|-----|---------|----------------------|-------|
| P1 | **High** | **Solo games are mixed into the modifier list.** "Practice Penalties" and "Higher or Lower" are *separate games*, not stackable modifiers, but they sit in the same "Stack any combination" grid styled identically → IA confusion. | ui-ux B (*group by function / tier*). | `EightZeroGame.tsx:805–822` |
| P2 | Med | **Long scroll to the CTA.** Formation + Difficulty + 7 stacked mode cards + leaderboard + stat row before "Start draft." Optional toggles dominate the fold budget. | mobile: expose the essential, defer the optional; thumb-zone. | `SetupScreen` layout |
| P3 | Low | Fixed bottom CTA is correct and `pb-28` clears it — keep. Touch targets (full-width cards) are comfortably ≥44px. | ui-ux D (thumb-zone CTA, ≥44px targets). | `EightZeroGame.tsx:845` |

---

## Top 3 to do first

1. **Split the accent's jobs (C1).** Keep the solid gold *fill* for the CTA only.
   Make selection state a gold **ring + tint** (`ring-2 ring-gold-400 bg-gold-500/10`)
   instead of a solid fill. Instantly restores "one primary action." — `safe`
2. **Colour-code the toggles (C3).** ON = gold/green tinted pill, OFF = muted
   outline. State readable at a glance without reading the word. — `safe`
3. **Separate "Solo games" from "Modifiers" (P1).** Two labelled groups; the two
   standalone games get a "Play" affordance visually distinct from the on/off
   toggles. — `safe`

**Defer to a design call (`ask`):** whether to default to the dark theme (C2),
the hero treatment (C5), and swapping emoji for a consistent icon set (C4).

_No product code was changed in this pass — see the mockup artifact for the
proposed direction._
</content>
