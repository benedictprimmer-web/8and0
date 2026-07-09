# Session handoff — game modes & skill mechanics

_A running record of the work done in this session so a fresh chat (or teammate)
can pick up instantly. Pairs with the repo `README.md` (architecture) and
`HANDOFF.md` (older log)._

**Working branch:** `claude/game-design-skills-research-sjnb8y` (PRs merged to
`main` continuously; Vercel auto-deploys `main` to 8and0.app).

---

## What shipped this session (all merged to `main`)

1. **Nation reel rebuild + "gamble" teeter** — the spin is now a real vertical
   slot machine: anticipation wind-up → decelerating travel + motion blur →
   **teeter that hovers on the seam between the final two nations** → locks on.
   Skippable, reduced-motion safe. Cosmetic only (landed nation stays
   seed-determined). Interactive preview artifacts were built to tune it.
2. **Live Ratings mode** — a Setup toggle that boosts **21 in-form players** this
   tournament (Vozinha 66→90, Mbappé, Bellingham, Diomande, …). Applied via a
   **boosted copy of the data** (`applyLiveRatings`), re-sorted by the new rating,
   with a green **▲ "in form"** tag + emerald box outline on boosted players (in
   the candidate list and on the pitch). Config: `src/game8/liveRatings.ts`.
3. **Club Chemistry** ("ball-knowledge") mode — same-club players in your XI link
   up: `(k−1)×0.5` OVR per club, capped +3, revealed in a panel. Pure
   `src/game8/chemistry.ts` (unit-tested); lifts team OVR into the sim.
4. **Unified Game Modes screen** — all twists in one card grid: Live Ratings,
   Club Chemistry, Super-Sub, Blind Ratings, Last Dance, Practice Penalties,
   Higher or Lower. Mobile-friendly.
5. **Super-Sub** — a full sub-game:
   - Draft a **12th man before kickoff** (a dedicated "Draft your Super-Sub" gate
     after the XI is complete). He's kept **out of the XI's OVR**.
   - **Interactive in-game use:** in a knockout, once you're level/losing (from
     60'), a **"Bring on your Super-Sub"** button appears — press it and the match
     replays with him on (seeded late-winner chance scaled by his rating + steadier
     pens). **One-time use** per tournament. Shown in the LiveMatch scoreboard.
   - Impact applies only to the ONE stage where he's brought on (`superSubStage`),
     re-simulated via the same pattern the penalty shootout uses.
6. **Higher or Lower** — a standalone **EA-ratings quiz** (Game Modes → Higher or
   Lower): tap the higher-rated player, build a streak, chase your best (saved
   locally). Uses **base EA ratings, never the Live boosts**; pairs have a
   **≥5-point gap** from the top ~300 players so questions stay fair.
   `src/components/HigherLower.tsx`.
7. **Rating audit tool** — `scripts/audit-ratings.mjs` (the rating double-check).

**Concurrent work by others on `main`** (not this session): a light/dark **theme
+ accent-colour system** in `src/index.css` (CSS variables remap Tailwind
tokens), and a mobile draft-header tweak. Build cleanly on top; keep in mind that
`text-white`/`text-gray-*`/`gold-*`/`surface-*` are now theme-remapped.

## Key files

| Area | File |
| --- | --- |
| All game UI + flow | `src/pages/EightZeroGame.tsx` (~2.7k lines) |
| Sim (incl. super-sub hook) | `src/game8/simulate.ts` |
| Team ratings (+ chemistry) | `src/game8/ratings.ts` |
| Live Ratings boosts | `src/game8/liveRatings.ts` |
| Club chemistry | `src/game8/chemistry.ts` |
| Higher or Lower | `src/components/HigherLower.tsx` |
| Live match + Bring-on button | `src/components/LiveMatch.tsx` |
| Player/team data | `public/data/players.json`, `teams.json` |
| Rating audit | `scripts/audit-ratings.mjs` |

Every mode is a stackable option threaded through `DraftOptions` → `DraftState`
→ `TournamentRun`, defaulted off, shown in run summaries.

## ⚠️ Open issue: player ratings are mostly estimated

**83% of `ea_overall` values are "estimated," not real EA ratings**, and the
estimation inflated squad players at big clubs (England has 22 players rated
85+). This makes some Higher/Lower questions and squad OVRs unreliable.
**Next step:** run `docs/rating-correction-agent-prompt.md` (a ready-to-go
sub-agent task) to web-verify and patch the ratings to real EA FC 26 values.
Higher/Lower's ≥5-gap design keeps it fair until then.

## Backlog / next ideas (agreed, not yet built)

- **Fix the ratings** (see the agent prompt) — biggest quality win; makes
  Higher/Lower bulletproof.
- **Trivia Gate** — before a knockout, answer one auto-generated question
  (club / rating / nation, built from the data) to earn a boost/reroll.
- **Blind Scout Score** — score how accurate your blind-mode picks were (turns
  blind mode into a skill test with its own board).
- **More modes:** Moneyball (budget draft, uses squad value), Daily Challenge
  (one shared date-seed — near-free given determinism), Underdog (minnows only,
  score multiplier), Continental Cup (one confederation), Group of Death.
- **Predict the Result / Half-time Tactics** — light in-match skill layers.
- **Mobile "hold to peek your squad"** during the player-choice step.
- **Leaderboard tagging** so Live-Ratings / Chemistry / boosted runs are
  distinguishable from vanilla runs on the global board.

## House rules (keep to these)

- Sim stays **seed-deterministic** — no `Math.random` in the sim path (only the
  cosmetic reel/celebration use it). New sim inputs must not consume RNG when off.
- Pure logic in `src/game8/` with vitest tests; game UI in `EightZeroGame.tsx`.
- `src/components/PenaltyShootout.tsx` is off-limits unless the task is penalties.
- Ship small: build → `npm run build` + `npm run lint` + `npm test` green → verify
  the flow in a browser → PR → merge. Keep the working tree clean.
