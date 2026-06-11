# 8and0 Handoff — Feature Implementation

## Project Overview

8and0 is a Vite + React + TypeScript web app. You draft a World Cup XI from a 48-team pool, then simulate a tournament run. The goal is to go 8-0 (unbeaten) and win the World Cup.

**Tech stack**: React 18, TypeScript, Tailwind CSS, TanStack Query (react-query), Lucide React icons

---

## What Was Just Completed

### Shirt Numbers Feature (DONE)

Official WC 2026 squad numbers added across the codebase.

### Feature 1: Spin the Wheel — Random Formation Hard Mode (DONE)

A gold-outline button below the Formation section triggers a slot-machine-style animation. It cycles through all formations, slows down, lands on a random one, auto-selects Hard mode, and starts the draft.

### Feature 2: Last Dance — Legend Mode (DONE)

A "Last Dance" button opens a modal with three cards: Messi, Ronaldo, Neymar. Choosing one auto-locks them into your XI as the first pick. The remaining 10 players are drafted via normal spins. Legend mode gets an easier opponent path in early rounds, an easier final stage, but a harder penalty shootout.

### Feature 3: Tournament Bracket Balancing (DONE)

Stage-weighted opponent draw with group stage tier filtering and rating-based progression bonuses. Stronger teams appear more in later stages; weaker teams in early knockouts.

**All tests pass** (40/40). **Build succeeds**.

---

## What Needs to Be Implemented (3 Features)

### Feature 1: Spin the Wheel — Random Formation Hard Mode

A separate button on the landing page that spins through formations like a slot machine and lands on a random one. Auto-selects Hard mode and starts the draft.

**Where to add:** `src/pages/EightZeroGame.tsx` — inside `SetupScreen` component

**Steps:**
1. Add a new state `spinningFormationId: string | null` in `SetupScreen`
2. Add a new `handleSpinWheel()` function that:
   - Sets `spinningFormationId` to `FORMATIONS[0].id`
   - Uses `setInterval` to cycle through formations every 150ms
   - After 1.5s, slow to 300ms
   - After 2.5s, slow to 500ms
   - After 3s, land on a random formation
   - Clear the interval
   - Call `updateOptions({ difficulty: "hard", blindMode: true })`
   - Call `onStart()` after 500ms
3. Add the button below the Formation section:
   - Style: Gold outline button, distinct from "Start draft"
   - Icon: `Shuffle` from lucide-react
   - Label: "🎲 Spin the Wheel"
   - Disabled while spinning
4. Add `animate-spin-formation` or use `animate-pulse` on the currently highlighted formation button

**Key files:** `src/pages/EightZeroGame.tsx`

---

### Feature 2: Last Dance — Legend Mode

A separate game mode where you choose Messi, Ronaldo, or Neymar. They are auto-locked as your first pick. Then you draft the remaining 10 players.

**Legend Data:**
```
Messi:     ARG, FW, player_id ~17,  team_id 17
Ronaldo:   POR, FW, player_id ~33, team_id 33  
Neymar:    BRA, MF, player_id ~13, team_id 13
```

**Where to add:** `src/pages/EightZeroGame.tsx` (SetupScreen + modal), `src/game8/types.ts`, `src/game8/draft.ts`, `src/game8/simulate.ts`

**Steps:**
1. **Data Model** (`src/game8/types.ts`):
   - Add `legendMode: "none" | "messi" | "ronaldo" | "neymar"` to `DraftOptions`
   
2. **Draft Logic** (`src/game8/draft.ts`):
   - In `createDraftState()`, check if `options.legendMode !== "none"`
   - If yes, find the legend player in `data.players` by matching `fifa_code` and `name`
   - Find the first compatible slot (FWD for Messi/Ronaldo, MID for Neymar)
   - Create a `DraftPick` and add it to `state.picks`
   - Set `activeSlotId` to the next open slot
   - Set `spinCount` to 0
   - `rerollsLeft` = 1 (normal mode, not hard)
   - `blindMode` = false

3. **UI** (`src/pages/EightZeroGame.tsx`):
   - Add a new "Last Dance" button below "Spin the Wheel"
   - Click opens a modal with 3 cards: Messi, Ronaldo, Neymar
   - Each card shows: large flag, player name, team, rating, position
   - Click a card → close modal → start draft with legend locked
   - Add `showLegendModal` state
   - Add `LegendModal` component

4. **Tournament Balancing** (`src/game8/simulate.ts`):
   - In `pickOpponent()`, add a `stage` parameter
   - In `scoreMatch()`, add a `legendMode` parameter
   - If legend mode: add +0.15 to ELO in `pickOpponent()` (easier opponents)
   - Reduce `STAGE_PRESSURE` by 0.05 for final stage
   - Reduce penalty win chance by 0.05

5. **UI Polish**:
   - In draft screen, show a "Legend" badge on the locked player's row
   - Show a gold border around the legend's slot in the PitchXI
   - In the result screen, show "Last Dance: Messi" label

**Key files:** `src/game8/types.ts`, `src/game8/draft.ts`, `src/game8/simulate.ts`, `src/pages/EightZeroGame.tsx`

---

### Feature 3: Tournament Bracket Balancing

Weighted opponent draw so stronger teams appear in later stages and weaker teams in early knockouts.

**Current implementation** (`src/game8/simulate.ts` — `pickOpponent()`):
```typescript
function pickOpponent(teams, seed, excludeIds) {
  const pool = teams.filter(t => !excludeIds.has(t.teamId));
  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => b.elo - a.elo);
  const index = Math.floor(Math.pow(random(), 1.3) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}
```

**New implementation**:

```typescript
function pickOpponent(teams, seed, excludeIds, stage, userElo) {
  const pool = teams.filter(t => !excludeIds.has(t.teamId));
  
  // Group stage balance: only pick from teams within ±1 tier of user
  if (stage.startsWith("Group")) {
    const userTier = Math.floor((userElo - 1400) / 100);
    const balanced = pool.filter(t => Math.abs(Math.floor((t.elo - 1400) / 100) - userTier) <= 1);
    if (balanced.length > 0) pool = balanced;
  }
  
  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => b.elo - a.elo);
  
  // Stage-based weighting
  const stageExponent = {
    "Group match": 0.8,
    "Round of 32": 2.0,
    "Round of 16": 1.5,
    "Quarter-final": 1.0,
    "Semi-final": 0.5,
    "Final": 0.3,
  };
  
  const exponent = stageExponent[stage.split(" ")[0] + " " + (stage.split(" ")[1] || "")] ?? 1.0;
  const index = Math.floor(Math.pow(random(), exponent) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}
```

Also update `scoreMatch()`:
```typescript
// Rating-based progression bonus
let ratingEdgeBonus = 0;
if (stage === "Round of 16" && ratings.overall >= 85) ratingEdgeBonus = 0.5;
if (stage === "Quarter-final" && ratings.overall >= 86) ratingEdgeBonus = 0.5;
if (stage === "Semi-final" && ratings.overall >= 88) ratingEdgeBonus = 0.5;

const ratingEdge = (ratings.overall - opponentStrength) + ratingEdgeBonus;
```

**Steps:**
1. Update `pickOpponent()` signature to accept `stage` and `userElo`
2. Add group stage tier filter
3. Add stage-based exponent mapping
4. Update `scoreMatch()` to add `ratingEdgeBonus`
5. Update `simulateTournamentRun()` to pass `stage` and `userElo` to `pickOpponent()`
6. Test with `scripts/batch-simulate.mjs`

**Key files:** `src/game8/simulate.ts`, `src/game8/game8.test.ts`

---

## Architecture Overview

### File Structure
```
8and0/
├── public/data/
│   ├── players.json          ← 1,248 players with shirt_number
│   ├── teams.json            ← 48 teams
│   └── leaderboard.json
├── src/
│   ├── api/
│   │   └── client.ts         ← API client + static fallback
│   ├── components/
│   │   ├── Flag.tsx          ← Flag component
│   │   ├── LiveMatch.tsx     ← Live match simulation
│   │   ├── PenaltyShootout.tsx
│   │   └── TournamentBracket.tsx
│   ├── game8/
│   │   ├── data.ts           ← RawPlayer, RawTeam, buildEightZeroData
│   │   ├── draft.ts          ← Draft logic: createDraftState, spinTeam, selectPlayer
│   │   ├── formations.ts     ← FORMATIONS array, getFormation()
│   │   ├── game8.test.ts     ← Tests
│   │   ├── leaderboard.ts    ← Leaderboard logic
│   │   ├── leaderboard.test.ts
│   │   ├── ratings.ts        ← Team rating calculations
│   │   ├── random.ts         ← seededRandom, poisson, clamp
│   │   ├── simulate.ts       ← Tournament simulation, scoreMatch, pickOpponent
│   │   ├── storage.ts        ← Local storage for history
│   │   └── types.ts          ← All TypeScript interfaces
│   ├── pages/
│   │   ├── EightZeroGame.tsx ← Main game page (SetupScreen + Draft + Results)
│   │   └── GlobalLeaderboard.tsx
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vercel.json
```

### Key Data Flow
```
1. Load teams.json + players.json → buildEightZeroData()
2. User picks formation + difficulty → createDraftState()
3. Spin team → spinTeam() → pickSeeded()
4. Pick player → selectPlayer() → getCompatibleOpenSlots()
5. Draft complete → simulateTournamentRun()
6. Show results → ResultPanel + SquadPanel
```

### State Management
React `useState` only. No Redux, no Zustand. State is:
- `draftState: DraftState` — current draft progress
- `formationId: string` — selected formation
- `options: DraftOptions` — difficulty, blind mode, draft mode
- `run: TournamentRun | null` — completed run results
- `history: TournamentRun[]` — local leaderboard

---

## UI Patterns

### Button Styles
```
Gold primary: bg-gold-500 hover:bg-gold-400 text-black
Gold outline: border-gold-600 bg-gold-500/10 text-gold-400
Dark outline: border-surface-700 bg-surface-950 text-gray-400 hover:text-white
Active option: border-gold-600 bg-gold-500 text-black
```

### Card Styles
```
Section card: rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl
Stat card:    stat-card (defined in index.css)
```

### Kit Colors
Use `getKitColors(code)` in `src/pages/EightZeroGame.tsx`:
```typescript
const colors = getKitColors("ENG");
// colors.primary = "#f8fafc" (white)
// colors.secondary = "#dc2626" (red)
```

---

## Testing

Run tests:
```bash
npm test        # vitest
npm run build   # tsc + vite build
npm run dev     # dev server on localhost:5173
```

All tests must pass before committing. No tests should be skipped.

---

## Quick Reference: Player Data

```json
{
  "player_id": 149,
  "team_id": 17,
  "fifa_code": "ARG",
  "name": "Lionel Messi",
  "position": "FW",
  "is_goalkeeper": false,
  "club_name": "Inter Miami",
  "ea_overall": 90,
  "shirt_number": 10,
  "aura_composite": 0.95
}
```

---

## Quick Reference: Formation Slots

All formations have 11 slots in order:
```
433: GK, DEF×4, MID×3, FWD×3
442: GK, DEF×4, MID×4, FWD×2
451: GK, DEF×4, MID×5, FWD×1
343: GK, DEF×3, MID×4, FWD×3
352: GK, DEF×3, MID×5, FWD×2
532: GK, DEF×5, MID×3, FWD×2
541: GK, DEF×5, MID×4, FWD×1
```

---

## Legend Mode Implementation Checklist

- [x] Add `legendMode` to `DraftOptions` in `types.ts`
- [x] Update `createDraftState` in `draft.ts` to auto-lock legend
- [x] Add `Last Dance` button in `SetupScreen` (`EightZeroGame.tsx`)
- [x] Add `LegendModal` component (inline)
- [x] Update `simulate.ts` — `pickOpponent` and `scoreMatch` for legend mode
- [x] Show "Legend" badge on locked player row
- [x] Show gold border on legend's slot in PitchXI
- [x] Add "Last Dance" label to result screen
- [x] Run tests
- [x] Build and verify

---

## Spin the Wheel Implementation Checklist

- [x] Add `spinningFormationId` state in `SetupScreen`
- [x] Add `handleSpinWheel()` function
- [x] Add spin animation (setInterval cycling through FORMATIONS)
- [x] Add "Spin the Wheel" button
- [x] Auto-select Hard mode after landing
- [x] Auto-start draft after landing
- [x] Run tests
- [x] Build and verify

---

## Bracket Balancing Implementation Checklist

- [x] Update `pickOpponent` signature to accept `stage` and `userElo`
- [x] Add group stage tier filter
- [x] Add stage-based exponent mapping
- [x] Update `scoreMatch` to add `ratingEdgeBonus`
- [x] Update `simulateTournamentRun` to pass new params
- [x] Test with `scripts/batch-simulate.mjs`
- [x] Run tests
- [x] Build and verify

---

## Notes

- The current branch is `main` (after merging `feat/full-26-player-squads`)
- Player dataset has 1,248 players across 48 teams
- 28 players are missing `shirt_number` — they are flagged as `null` and don't show badges
- All UI is in `src/pages/EightZeroGame.tsx` — this is the main file to modify
- The `SetupScreen` component is the landing page where all new buttons should go
- Keep changes minimal — the user prefers small, focused PRs
- Don't break existing tests
- If you need to add a new component, create it in `src/components/` or inline it

---

## Questions?

If something is unclear, check:
1. `ideas.md` — detailed implementation plan
2. `src/game8/types.ts` — all data types
3. `src/pages/EightZeroGame.tsx` — main UI component
4. `src/game8/draft.ts` — draft logic
5. `src/game8/simulate.ts` — simulation logic

Good luck!
