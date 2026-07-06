---
name: design-review
description: Run a panel of game-design skills as reviewers against a target area of 8and0, propose ranked changes, apply the safe ones, then have a sub-agent verify the diff. Use when the user runs "/design-review <target>" or asks to design-review / feel-review / balance-review / UX-review a feature, file, or screen (e.g. the spin animation, ResultPanel, difficulty, the mobile "See my team" toggle). Triggers on "design review", "design-review", "review the feel", "review the UX", "review the balance", "review the mobile layout", "juice review", "get the skills to review".
---

# /design-review — reviewer panel → apply → sub-agent verify

Orchestrates the vendored game-design skills as a review panel, applies the
sensible suggestions, then spawns a sub-agent to verify the diff. Quality-only
polish on an existing, shipped web game — keep changes small and reversible.

## Input

The **target** is whatever follows the command (a file, function, feature, or
screen), e.g. `/design-review the spin animation in animateSpin`.

- If no target was given, ask the user what to review (offer the usual suspects:
  spin/draft feel, ResultPanel/celebration, difficulty tuning, mobile "See my
  team" layout) — do not guess and start editing.

## Which reviewer skills to use

Pick the lenses that fit the target (use several when they overlap):

| If the target touches… | Use skill |
| ---------------------- | --------- |
| animation, spin, pops, celebrations, responsiveness, "feels floaty" | `game-feel-and-juice` |
| HUD/menus, readability, information hierarchy, feedback, accessibility | `ui-ux-and-feedback` |
| easy/normal/hard, rating curves, rerolls, "too hard/easy", dominant strategy | `difficulty-and-balancing` |
| phone layout, touch targets, the "See my team" toggle, mobile-first UX | `mobile-app-ui-design` (apply its principles to our **web** UI; ignore native RN/Flutter specifics) |

When unsure, default to `game-feel-and-juice` + `ui-ux-and-feedback`.

## Procedure

**1. Review (no edits yet).** For each chosen skill, invoke it and produce a
ranked list of concrete suggestions. Each item = *what* to change, *why* (cite the
skill's principle), and *where* (`file:line` / component). Read the actual code
first — don't review from memory.

**2. Merge.** Combine the lists, drop duplicates, rank by impact ÷ effort, and
show the user the consolidated table. Flag each item as **safe** (obviously
wanted, low risk) or **ask** (ambiguous, architectural, or risky).

**3. Apply.** Implement only the **safe** items. For **ask** items, ask the user
via AskUserQuestion before touching them. Respect the house rules:
- Seeded RNG only in the sim path — never introduce `Math.random()`
  (see `src/game8/random.ts`, README "Determinism").
- Use IDs, not hard-coded team/player names.
- `src/components/PenaltyShootout.tsx` is **off-limits** unless the target is
  explicitly penalties.
- Keep game UI in `src/pages/EightZeroGame.tsx`; pure logic in `src/game8/`.

**4. Verify (sub-agent).** Spawn a sub-agent with the Agent tool
(`subagent_type: general-purpose`, or `code-reviewer` if available) and give it
the diff. Its brief:
- Does each change actually match what the skill recommended (no drift)?
- Any correctness regression, broken determinism, or perf issue?
- Anything that should have been an **ask** but got applied?
Adversarially verify — default to skepticism. Report its verdict verbatim and
fix anything it flags before finishing.

**5. Gate.** Run `npm test` and `npm run lint` (max-warnings 0) and, for
non-trivial UI/feel changes, the `verify` skill to drive the flow in a real
browser. Do not declare done until tests + lint pass. Summarize: what changed,
what the sub-agent said, what you deferred back to the user.

## Notes

- These skills are **scaffolding and checklists**, not doctrine — a human keeps
  taste authority on feel and balance. Prefer several small suggestions the user
  can accept individually over one big rewrite.
- The reviewer skills live in `.claude/skills/` (see
  [`../README.md`](../README.md) for provenance).
