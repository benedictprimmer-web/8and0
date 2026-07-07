# 8and0 — Full Design Review

_A multi-agent design review of the shipped game, run through four vendored
game-design skills, with every finding adversarially verified against the source._

**Date:** 2026-07-07 · **Model:** Opus 4.8 · **Baseline:** `74 tests pass, 1
skipped; eslint clean` at review time (no code was changed by this review).

---

## How this was produced

Four independent reviewer agents each read the real code through one skill lens
(`.claude/skills/`), then **every finding was re-checked against the cited code**
by a verification pass — the point of the exercise was to kill plausible-but-wrong
claims, not to collect them. Verdicts below:

- **CONFIRMED** — the code does what the finding says and the concern is real.
- **PARTIAL** — real but overstated, mislocated, or already half-handled.
- **INTENTIONAL** — accurate, but the code shows it is a deliberate design choice.

| Lens (skill) | Raw findings | Confirmed | Partial | Intentional |
| ------------ | :----------: | :-------: | :-----: | :---------: |
| game-feel-and-juice | 8 | 6 | 2 | — |
| ui-ux-and-feedback | 8 | 6 | 2 | — |
| difficulty-and-balancing | 8 | 6 | — | 2 |
| mobile-app-ui-design | 9 | 8 | 1 | — |
| **Total** | **33** | **26** | **5** | **2** |

Verification changed the picture in two places worth calling out:

1. **Reduced-motion is half-handled, not absent.** Three lenses independently
   flagged "no `prefers-reduced-motion` guard." Verification found
   `src/components/Celebration.tsx:27` **does** guard the win-confetti — but the
   reel, score-pop, and goal-float animations in `src/index.css` do **not**. The
   feel reviewer's nuanced version is correct; the UX/mobile "nothing is guarded"
   framing was overstated → **PARTIAL**.
2. **The balance instrument is obsolete — and that undercuts other claims.**
   `scripts/odds-report.mjs` has drifted hard from `src/game8/simulate.ts`, so the
   two "dominant strategy" findings (Easy>Hard, best formation) **cannot be proven
   until the instrument is fixed.** They're logged as real risks, not facts.

---

## Top 8 — do these first (ranked by impact ÷ effort)

| # | Finding | Lens | Sev | Effort | Verdict |
|---|---------|------|-----|--------|---------|
| 1 | **`odds-report.mjs` no longer mirrors `simulate.ts`** — every tuning decision is made against the wrong model | balance | high | M | CONFIRMED |
| 2 | **Opponent goal flashes your score gold** — a conceded goal reads as if you scored | feel | high | S | CONFIRMED |
| 3 | **Touch targets below 44px + primary Spin stranded at top** — core loop is hard to reach one-handed | mobile | high | S/M | CONFIRMED |
| 4 | **No visible keyboard focus anywhere** — keyboard/switch users are lost | ux | high | S | CONFIRMED |
| 5 | **Reel/score/goal animations ignore `prefers-reduced-motion`** — motion can't be opted out mid-game | feel | med | S | CONFIRMED |
| 6 | **No safe-area insets** — fixed bottom bar + "My team" FAB sit under the iOS home indicator | mobile | high | S | CONFIRMED |
| 7 | **"Options"/"New run" wipe an in-progress draft with no confirm** — a misclick destroys minutes of work | ux | med | S | CONFIRMED |
| 8 | **Secondary grays fail WCAG contrast** (`text-gray-500/600` on the dark bg) | ux | high | S | CONFIRMED |

Every item is a small, self-contained change. Seven of the eight are S-effort.

---

## Game feel & juice

Applies `.claude/skills/game-feel-and-juice`. The animation vocabulary here is
already above average — `reelLand`, `goalFloat`, `scorePop`, `championFlash` are
purpose-built keyframes, and `Celebration.tsx` respects reduced motion. The gaps
are about **event distinctness, feedback re-triggering, and audio.**

| # | Finding | Sev | Effort | Location | Verdict & note |
|---|---------|-----|--------|----------|----------------|
| F1 | **Opponent goal lights up BOTH score digits celebratory gold.** `goalFlash` is a single boolean set on any goal; user and opponent digits both render `goalFlash ? "text-gold-400"`. Conceding *looks* like scoring. | high | S | `LiveMatch.tsx:138,258-272` | **CONFIRMED.** Split the flash by team — gold for you, `text-rose-400` on the opponent digit only. |
| F2 | **Score-pop doesn't re-trigger on back-to-back goals.** `scorePop` is keyed by value (`"user"`), so a 2nd goal inside the 420ms window re-renders the same class and the CSS animation never restarts. The adjacent `goalPop` already uses `key={Date.now()}` — proof the pattern is known. | med | S | `LiveMatch.tsx:131-140,261` | **CONFIRMED.** Give the popping digit a changing `key` (a goal counter). |
| F3 | **Goals have no hit-stop/beat.** `tick` runs on a constant `setInterval`; a goal fires flashes but the clock advances to the next minute on the same cadence. The biggest moment gets no pause to land. | high | M | `LiveMatch.tsx:117-160` | **CONFIRMED.** On a goal, hold the timeline ~600-900ms (clear interval, `setTimeout` to resume). |
| F4 | **Zero audio anywhere.** Grep for `Audio/AudioContext/.play(/vibrate` across `src` returns only `prefers-reduced-motion` comment matches. Reel, goals, wins are all silent — the causal loop rests entirely on the eye. | high | M | whole app | **CONFIRMED.** Add a tiny WebAudio SFX layer (reel tick, reel-land ding, goal roar, win sting) behind a persisted mute + reduced-motion gate. |
| F5 | **Reel/score/goal-float ignore `prefers-reduced-motion`.** `Celebration.tsx:27` guards confetti, but `animateSpin`, `.animate-score-pop`, `.animate-goal-float`, `.animate-reel-land` have no guard. | med | S | `index.css:347-358`, `EightZeroGame.tsx:1544-1592` | **CONFIRMED.** Add a `@media (prefers-reduced-motion: reduce)` block; extract Celebration's existing check and reuse it in `animateSpin`. |
| F6 | **Primary buttons have no press/hover tactility** — `transition-colors` only, no `active:scale`. The most-clicked gold buttons feel flat. | med | S | `EightZeroGame.tsx:788-793,1833-1840,1922-1930` | **CONFIRMED.** Add `transition-transform active:scale-[0.97] hover:scale-[1.02]` to a shared primary-button class. |
| F7 | **The reel is an in-place flicker, not a reel.** Each tick full-swaps the flag+name; the container gets Tailwind `animate-pulse` (a ~2s opacity fade) unrelated to the ~60-220ms swaps, so it reads as a stutter with an unsynced dim. Landing overshoot is good; the travel isn't. | low | M | `EightZeroGame.tsx:1587,1937-1940` | **PARTIAL.** Real, but "low" — the landing already carries most of the payoff. A per-swap `translateY` slide would sell continuous motion. |
| F8 | **The 1.6s reel is un-skippable and repeats 11-15×.** Fixed `~1150ms` decel + `450ms` land, and `spinDisabled` locks input the whole time. Ceremony with no shortcut across a full draft. | med | S | `EightZeroGame.tsx:1399,1563,1577-1583` | **PARTIAL/CONFIRMED.** Let a 2nd tap snap to the landing frame; optionally shorten `totalMs` after the first few spins. Keep ceremony optional, never mandatory. |

---

## UI / UX & feedback

Applies `.claude/skills/ui-ux-and-feedback`. Strong component vocabulary and a
clean dark theme; the gaps are **accessibility (focus, contrast, modal keyboard
flow), first-run onboarding, and destructive-action guards.**

| # | Finding | Sev | Effort | Location | Verdict & note |
|---|---------|-----|--------|----------|----------------|
| U1 | **No visible keyboard focus state on any control.** Buttons style only `transition-colors`; the two inputs set `outline-none` and replace it with a ~1px `focus:border` tint. `index.css` defines no global focus style. | high | S | `EightZeroGame.tsx:145,1013,2003` | **CONFIRMED.** Add a shared `focus-visible:ring-2 focus-visible:ring-gold-400 ring-offset-2 ring-offset-surface-950` and keep the input outline. |
| U2 | **Secondary text fails WCAG contrast.** `text-gray-600` (#4b5563 ≈2.5:1) carries the match "vs", chevrons, placeholders; `text-gray-500` (≈3.9:1) carries most body copy — both under the 4.5:1 floor on the #060810/#0D1117 bg. `section-label` (#8a93a6) is fine. | high | S | `EightZeroGame.tsx:350,1823,1907` | **CONFIRMED.** Move body/secondary text to `text-gray-400` (≈6:1); reserve gray-600 for hairline borders only. |
| U3 | **Setup screen front-loads 5 config sections at a first-timer.** Formation, Last Dance, Practice Penalties, Difficulty, Blind, Draft-mode all get equal weight; the only teaching affordance is a secondary "How it works" button. | high | M | `EightZeroGame.tsx:636,653,670,721,741,758` | **CONFIRMED.** Default everything sensibly, collapse advanced toggles behind a disclosure, auto-open How-it-works on first visit so the first decision is just "Start draft." |
| U4 | **"Options"/"New run" discard an in-progress draft/run with no confirm.** Both handlers wipe `draftState`/`run`/match progress immediately, even at 7/11 picks. | med | S | `EightZeroGame.tsx:1729-1736,1747-1754` | **CONFIRMED.** Guard with a confirm when `draftState.picks.length > 0` and the run isn't complete. |
| U5 | **Info/help modals can't be dismissed with Escape and don't trap focus.** HowItWorks, Legend, and the leaderboard TeamDetail close only by overlay/button click. TeamSheet is the one modal wired for Escape (`:1354`) — the pattern exists, just isn't shared. | med | S | `EightZeroGame.tsx:411,546,1354`, `GlobalLeaderboard.tsx:102` | **CONFIRMED.** Extract a `useModalDismiss` (Escape + scroll-lock + focus restore) and apply to all four dialogs. |
| U6 | **Highest-drama moments are visual-only (no audio).** Reel-land, goal, and win fire only visual channels. | med | L | `EightZeroGame.tsx:294-297,1573-1583,1643-1650` | **CONFIRMED.** (Same fix as F4 — one SFX layer serves both lenses.) |
| U7 | **Multi-goal marker stacks raw emoji.** `"⚽".repeat(goals)` pinned at `-top-1 -right-1` widens past the 40px shirt tile at 3+ goals and collides with neighbours; count is only decodable by counting. | low | S | `EightZeroGame.tsx:295-297` | **CONFIRMED.** Cap at one ⚽ with a numeric superscript (`⚽×3`) in a fixed-width pill. |
| U8 | **No `prefers-reduced-motion` guard for spin/pulse.** | med | S | `index.css:347-358` | **PARTIAL.** Confetti *is* guarded (Celebration.tsx); the index.css helpers aren't. Merges with F5. |

---

## Difficulty & balancing

Applies `.claude/skills/difficulty-and-balancing`. The sim is thoughtfully tuned
(per-stage draw exponents, an elite ramp, pressure multipliers, earned group
qualification) and **the determinism discipline is intact** — no `Math.random`
in the sim path. The issues are a **broken measuring instrument**, a couple of
**suspected dominant strategies that can't be proven while the instrument is
broken**, and **opaque non-linear bonuses.**

| # | Finding | Sev | Effort | Location | Verdict & note |
|---|---------|-----|--------|----------|----------------|
| B1 | **`odds-report.mjs` has silently drifted from `simulate.ts`.** Verified divergences: `normalizeOpponentStrength` `*32` vs live `*29`; group qualify `>=3` vs live `>=4`; `userLambda 1.3+edge*0.025+atk*0.015` vs live `1.10+edge*0.032+atk*0.018`; R16 pressure `1.02` vs live `1.30`; `pickOpponent` uses a flat `pow(random(),1.3)` sorted **descending** with **no** `STAGE_EXPONENT`, group banding, or `eliteEdgeBonus`. The report describes a game that no longer ships. | high | M | `odds-report.mjs:79-158` vs `simulate.ts:22-228` | **CONFIRMED (understated).** Have the script import `scoreMatch`/`pickOpponent`/`STAGE_*`/`ELITE_EDGE` from `simulate.ts` (or share a module) and add a unit test asserting the lambda formulas match, so drift can't recur. |
| B2 | **Score formula may reward Easy over Hard.** `DIFFICULTY_BONUS` easy 0/normal 3/hard 7 (+2 blind) is flat, while Easy's 3 rerolls + visible ratings raise expected OVR → more `wins*5`, deeper `STAGE_BONUS` (≤14), higher `ratingBonus`. A single extra win (+5) already eats most of Hard's +7. | high | M | `scoring.ts:20-24,40-49`, `draft.ts:29-33,59` | **CONFIRMED as risk (magnitude unproven).** Directionally sound; can't be quantified until B1 is fixed. Consider a **multiplicative** difficulty factor (`raw * {easy:1.0,normal:1.15,hard:1.4}`) so the bonus scales with harder-won points. |
| B3 | **The elite ramp is a steep convex curve with a hard OVR-80 cliff, and it's invisible.** `ELITE_EDGE["Group match"] = {base:0.5, slope:2.05}` vs knockout slopes 0.16-0.28. At OVR 85 the group bonus is `0.5+2.05×5 ≈ 10.75` straight into `ratingEdge` (≈ +0.32 user goals/match); at 90 ≈ 21. Sub-80 gets nothing, so crossing 80 discontinuously changes the game. | high | S | `simulate.ts:80,115-135` | **CONFIRMED (partly INTENTIONAL).** Git history shows the ramp is deliberate ("elite squads ride easier"), but the group `slope: 2.05` — ~10× the knockout ramps — plus the 80 cliff over-delivers and is undisclosed. Cut the group slope toward ~0.2-0.3 (linear), and/or surface the edge in the UI. |
| B4 | **Team OVR is formation-independent and each line is a flat average**, so lone-striker / three-at-the-back shapes max the high-weight lines (0.27 attack on ONE elite FWD) with fewer good draws needed. No viability audit across the 7 formations. | med | M | `ratings.ts:8-22`, `formations.ts` | **CONFIRMED mechanic (dominance unproven).** Real and reinforced by autofill picking best-per-slot. Weight each line by its slot count (or normalize per formation), then re-run the fixed B1 report across all 7 formations. |
| B5 | **"Hard" welds two independent axes** — `blindMode = ... \|\| difficulty==="hard"` bolts hidden ratings onto Hard, while `rerollsForDifficulty` separately sets 3/1/0. You can't take the reroll challenge but keep visible ratings. Labels are also judgmental. | med | M | `draft.ts:29-33,59` | **CONFIRMED.** Expose the two axes as independent toggles layered over the presets (reroll slider 0-3, "hide ratings" switch); consider effect-based names (Assisted/Standard/Blind). |
| B6 | **Group qualification cliff (4 pts) + zero elite edge below OVR 80** can brick the bottom quartile: a weak squad at 1W-0D-2L (3 pts) is out before the knockouts, with no assist axis and only a `margin=3` draw softening. | med | S | `simulate.ts:54,79-89,124-135` | **CONFIRMED mechanic.** Give low-OVR squads a rating-scaled draw floor symmetric to the elite ramp, or tie the qualify threshold to difficulty (easy=3, hard=4). |
| B7 | **Reroll economy is flat across draft modes** where its value differs sharply — near-worthless in squad-first (any spin is usable), much more valuable in position-first (a demanded slot can whiff). Same 3/1/0 regardless. | low | S | `draft.ts:29-33,135-171` | **CONFIRMED.** Scale rerolls by draft mode (position-first +1-2) or make them per-slot, keeping the seeded spin keys unchanged. |
| B8 | **Difficulty inverts at the trophy match** — Semi draws the strongest opponent (`STAGE_EXPONENT` 0.26) and gets zero elite bonus, while the Final is drawn slightly easier (0.30) and uniquely restores `{base:0.5,slope:0.28}`; Legend eases only the Final. | low | S | `simulate.ts:42-49,115-122,176-178` | **INTENTIONAL.** Code comments explicitly design the Semi as the "boss gate" and the Final as a power-fantasy finish. Working as intended — just **document it** so a future editor doesn't "fix" it as drift. |

---

## Mobile-web experience

Applies `.claude/skills/mobile-app-ui-design` (principles → responsive web; native
RN/Flutter specifics ignored). This is the **weakest surface** and the one the
README calls out as active work. The draft UI has some responsive intent
(`sm:grid-cols-2`, a bottom "See my team" FAB) but the **core loop isn't tuned for
the thumb, targets are too small, and there's no safe-area / PWA handling.**

| # | Finding | Sev | Effort | Location | Verdict & note |
|---|---------|-----|--------|----------|----------------|
| M1 | **Primary Spin/Reroll/Pick button is stranded at the top** (`sticky top-3`), outside the thumb zone — while the setup "Start draft" CTA is correctly a fixed bottom bar. The single most-repeated action sits in the least-reachable zone. | high | M | `EightZeroGame.tsx:1898-1932` | **CONFIRMED.** On mobile, mirror the setup pattern: render Spin in a `fixed inset-x-0 bottom-0 … sm:static` bar; keep the sticky-top block for context. |
| M2 | **Primary Spin button is below the 44px target** (`px-4 py-2 text-sm` ≈36px); Auto-fill and "New run" share `py-2`. | high | S | `EightZeroGame.tsx:1917,1926,1750` | **CONFIRMED.** Bump primary actions to `py-3`/`min-h-[44px]`. (Note: `OptionButton` at `:145` is already `py-3` — fine.) |
| M3 | **Draft filter pills (ALL/GK/DEF/MID/FWD) are ~24px and tightly packed** (`px-2 py-1 text-xs` in a `p-1` row) — the 5 most-used filters are half the min target. | high | S | `EightZeroGame.tsx:1984-1996` | **CONFIRMED.** `px-3 py-2 text-sm` (or `min-h-[40px]`) with `gap-1.5`; compact again at `sm:`. |
| M4 | **No safe-area-inset handling.** Viewport is `width=device-width, initial-scale=1.0` with no `viewport-fit=cover`, and `env(safe-area-inset-*)` appears nowhere. The fixed bottom CTA and the `fixed bottom-4 right-4` "My team" FAB sit under the iOS home indicator / Android gesture bar. | high | S | `index.html:6`, `EightZeroGame.tsx:786,2115` | **CONFIRMED.** Add `viewport-fit=cover`; pad fixed bottom elements with `env(safe-area-inset-bottom)`. |
| M5 | **Not installable — no PWA manifest.** `<head>` has `theme-color` + description but no `manifest`, `apple-touch-icon`, or `apple-mobile-web-app-capable`; no manifest/service worker in the repo. A repeat-play game at its own domain gets no home-screen install. | med | M | `index.html:1-17` | **CONFIRMED.** Add a `manifest.webmanifest` (standalone, icons, bg/theme `#060810`) + `apple-touch-icon`. |
| M6 | **Spin/pulse/confetti ignore `prefers-reduced-motion` on mobile** (where full-screen confetti is most nauseating). | med | S | `index.css:295-359` | **PARTIAL.** Confetti *is* guarded via Celebration.tsx; the index.css reel/pop helpers aren't. Merges with F5. |
| M7 | **Sub-legible 10px labels carry real info** — RatingPill stats (`text-[10px]`), open-slot categories (`text-[10px]`), `.section-label` (0.65rem ≈10.4px) at ~375px. | med | S | `EightZeroGame.tsx:122,1967`, `index.css:64-70` | **CONFIRMED.** Raise informational labels to `text-xs` (12px); build hierarchy with weight/opacity, not sub-12px size. |
| M8 | **Draft controls bar wraps unpredictably at 375px** (`flex flex-wrap justify-between`) — the Spin button's position shifts with label length ("Reroll (3 left)" vs "Pick a player"). | med | S | `EightZeroGame.tsx:1898-1932` | **CONFIRMED.** Below `sm:`, stack deterministically: `flex-col`, button group `w-full`, Spin `flex-1` so its position/size are stable every round. |
| M9 | **Back-link & secondary header actions are low, padding-less targets** — the "Options" back control (`text-sm`, no padding, ≈18px) and `py-2` buttons. | low | S | `EightZeroGame.tsx:1729-1736` | **CONFIRMED.** Wrap the back link in `-m-2 p-2` (bigger hit area, same visual size); floor secondaries at `min-h-[40px]`. |

---

## Cross-cutting themes

Four themes recur across lenses — fixing them once pays multiple findings:

1. **Accessibility baseline is missing.** Focus states (U1), contrast (U2),
   modal Escape/focus-trap (U5), and reduced-motion on the reel (F5/U8/M6) are a
   single coherent workstream. A first-time player using a keyboard, a screen
   reader, or reduced-motion is currently second-class.
2. **Feedback lacks a signature per event.** The same gold flash for both teams'
   goals (F1), the non-restarting score-pop (F2), and the total absence of audio
   (F4/U6) all mean "something happened" is communicated but not *what*.
3. **Mobile core-loop ergonomics.** Primary actions out of the thumb zone (M1),
   under-sized targets (M2/M3/M9), no safe-area (M4) — the repeated spin→pick loop
   is the exact surface that's hardest to run one-handed.
4. **The balance instrument is broken, which hides balance truth.** B1 is
   load-bearing: until `odds-report.mjs` mirrors `simulate.ts`, the Easy>Hard (B2)
   and dominant-formation (B4) risks can't be measured, and the elite ramp (B3)
   can't be re-tuned with confidence. **Fix B1 first, then B2/B3/B4 become data.**

---

## Suggested sequence

**Quick wins (all S-effort, high impact) — a single afternoon:**
`F1` team-split goal flash · `F5` reduced-motion block · `U1` focus ring ·
`U2` contrast bump · `U4` reset confirm · `M2`/`M3` target sizes · `M4`
safe-area · `F6` button tactility.

**Load-bearing fix (M) — unblocks all balance work:** `B1` — reunify
`odds-report.mjs` with `simulate.ts` behind a shared module + a drift test.

**Then, with data in hand (M):** `B2` multiplicative difficulty · `B3` linearize
the group elite slope · `B4` formation viability audit · `M1` move Spin to the
thumb zone · `F3`/`F4` hit-stop + audio layer.

**Design decisions to make (not just code):** `U3` onboarding disclosure ·
`B5` split difficulty axes · `B8` document (or invert) the Semi/Final curve.

---

## Caveats

- These skills are **review scaffolding**, not doctrine. Every finding here is
  grounded in a real `file:line`, but "should we change it" is a design call —
  keep a human with taste on feel (F-series) and balance (B-series).
- **Nothing was edited.** This is a report; the baseline (`74 tests pass, eslint
  clean`) is unchanged. Use `/design-review <target>` to run the reviewer →
  apply → sub-agent-verify loop on any single item above.
- The two "dominant strategy" findings (B2, B4) are **hypotheses pending a fixed
  B1** — logged as risks, not proven facts, precisely because the current
  measuring tool disagrees with the shipped sim.
