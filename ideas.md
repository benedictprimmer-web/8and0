# 8and0 - Implementation Plan

## Phase 1: Probability Rebalance

### Current state (`simulate.ts`)

| Formula | Current | Effect |
|---------|---------|--------|
| Opponent strength | `62 + normalized * 27` (62–89) | Opponents feel weak |
| userLambda | `1.35 + ratingEdge * 0.045 + attackEdge * 0.025` (0.2–4.6) | User scores too much |
| opponentLambda | `1.1 - ratingEdge * 0.035 - defenceEdge * 0.02` (0.1–3.6) | Opponents score too little |
| Penalty win | `0.5 + ratingEdge * 0.015` (0.18–0.82) | Too easy to win on pens |

### Target balance

- ~70-75% pass group stage (currently probably ~85%+)
- ~30-35% reach Round of 16
- ~12-15% reach QF
- ~5-7% reach SF
- ~2-3% reach Final
- ~1% win the whole thing
- 8-0 should feel like a genuine achievement, not the norm

### Changes to make

**Step 1: Tighten opponent strength range**
```
Before: 62 + normalized * 27   → range 62–89
After:  66 + normalized * 26   → range 66–92
```
Opponents start stronger on average and the top end is higher.

**Step 2: Lower user scoring**
```
Before: clamp(1.35 + ratingEdge * 0.045 + attackEdge * 0.025, 0.2, 4.6)
After:  clamp(1.10 + ratingEdge * 0.035 + attackEdge * 0.020, 0.15, 3.8)
```
Lower base (1.35 → 1.10), lower multipliers, tighter cap.

**Step 3: Raise opponent scoring**
```
Before: clamp(1.1 - ratingEdge * 0.035 - defenceEdge * 0.02, 0.1, 3.6)
After:  clamp(1.30 - ratingEdge * 0.025 - defenceEdge * 0.015, 0.2, 4.0)
```
Higher base (1.1 → 1.30), gentler reductions, higher cap.

**Step 4: Harder penalties**
```
Before: clamp(0.5 + ratingEdge * 0.015, 0.18, 0.82)
After:  clamp(0.45 + ratingEdge * 0.010, 0.15, 0.72)
```
Lower base and tighter range — penalties are more of a coin flip.

**Step 5: Tournament pressure (new)**
Add a stage multiplier that makes knockout rounds progressively harder:
```
Group stage: 1.0
Round of 32: 1.05
Round of 16: 1.10
Quarter-final: 1.15
Semi-final: 1.20
Final: 1.25
```
Applied as: `opponentLambda *= stageMultiplier`

### Implementation steps

1. **Write a batch test script** (`scripts/batch-simulate.mjs`)
   - Run 10,000 tournament sims with current formulas
   - Report: % reaching each stage, avg goals for/against, 8-0 rate
   - This is the baseline

2. **Apply formula changes** to `simulate.ts`
   - Update `normalizeOpponentStrength`
   - Update `scoreMatch` lambdas
   - Update penalty logic
   - Add stage multiplier

3. **Re-run batch test** with new formulas
   - Compare against targets above
   - Tune if needed — iterate until distribution feels right

4. **Update existing tests** in `game8.test.ts` if any assertions break

5. **Manual playtest** — play 5-10 runs, confirm it feels harder but fair

---

## Phase 2: Live Match Simulation

### Goal timing model — Poisson process

The existing sim already uses Poisson to get total goals per team. To distribute those goals across 90 minutes, we use the **Poisson process** (exponential inter-arrival times).

**Why this approach:**
- Mathematically consistent — if total goals ~ Poisson(λ), then goal times follow a Poisson process
- Natural-looking clustering (goals aren't perfectly spaced)
- Simple to implement
- More realistic than uniform random minutes

**Algorithm:**
```
Given: totalGoals for a team (already computed via poisson())
1. If totalGoals == 0, no events
2. Generate totalGoals random values from Uniform(0,1)
3. Sort them
4. Multiply each by 90 → these are the goal minutes
5. Round to nearest minute, clamp to 1–90
```

This is equivalent to the "order statistics" approach — given N events in [0,90], they're uniformly distributed order statistics. Simple and effective.

**Alternative models (for later):**
- **Weighted by real data** — use actual World Cup goal distribution (more goals in 75-90, 40-45, stoppage time). Would need a lookup table from real match data.
- **Momentum-based** — goals more likely right after a goal (cluster effect). More complex, maybe overkill.

### New types

```ts
// types.ts additions

export type MatchEventType =
  | "kickoff"
  | "goal"
  | "yellow_card"
  | "red_card"
  | "near_miss"
  | "halftime"
  | "fulltime"
  | "penalty_shootout";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "user" | "opponent";
  playerName?: string;  // for goals — pick from drafted picks
}

export interface LiveMatchState {
  stage: string;
  opponent: EightZeroTeam;
  userGoals: number;
  opponentGoals: number;
  currentMinute: number;
  events: MatchEvent[];
  finished: boolean;
  decidedByPens: boolean;
  result: "W" | "D" | "L" | null;
}
```

### New sim function

```ts
// simulate.ts addition

export function distributeGoalMinutes(
  totalGoals: number,
  random: () => number
): number[] {
  if (totalGoals <= 0) return [];
  // Order statistics: N uniform random values in [1, 90]
  const times = Array.from({ length: totalGoals }, () => 
    Math.floor(random() * 90) + 1
  );
  return times.sort((a, b) => a - b);
}

export function buildMatchEvents(
  result: MatchResult,
  userPicks: DraftPick[],
  random: () => number
): MatchEvent[] {
  const events: MatchEvent[] = [];
  
  events.push({ minute: 0, type: "kickoff", team: "user" });
  
  // Distribute user goals across minutes
  const userGoalMinutes = distributeGoalMinutes(result.userGoals, random);
  for (const minute of userGoalMinutes) {
    // Pick a random forward/midfielder from the drafted XI
    const scorer = pickScorer(userPicks, random);
    events.push({ minute, type: "goal", team: "user", playerName: scorer });
  }
  
  // Distribute opponent goals
  const oppGoalMinutes = distributeGoalMinutes(result.opponentGoals, random);
  for (const minute of oppGoalMinutes) {
    events.push({ minute, type: "goal", team: "opponent" });
  }
  
  // Optional: add yellow cards, near misses for flavour
  if (random() < 0.3) {
    events.push({
      minute: Math.floor(random() * 90) + 1,
      type: "yellow_card",
      team: random() < 0.5 ? "user" : "opponent",
    });
  }
  
  events.push({ minute: 45, type: "halftime", team: "user" });
  events.push({ minute: 90, type: "fulltime", team: "user" });
  
  if (result.decidedByPens) {
    events.push({ minute: 91, type: "penalty_shootout", team: "user" });
  }
  
  // Sort by minute
  return events.sort((a, b) => a.minute - b.minute);
}
```

### New components

**1. `LiveMatch` component**
- Shows: team shirts, flags, score (big), minute counter
- Ticks from 0' → 90' (speed configurable: 1x = ~60s real time, 2x = ~30s, skip = instant)
- When a goal event hits: flash the score, show "GOAL!" with player name
- Near misses / cards as smaller events
- End of match: show result (W/D/L) with final score
- "Continue" button → next match or tournament result

**2. `TournamentBracket` component (nice-to-have)**
- Visual bracket showing the tournament path
- Completed matches filled in, future matches as "TBD"
- Highlights current match

**3. `PlayNextMatch` flow**
- After draft completes, instead of instant sim → show first "Play Next Match" button
- Click → LiveMatch component runs
- After match → show brief result summary → "Play Next Match" for next round
- If eliminated → show tournament summary (current ResultPanel style)

### Tournament flow refactor

Current flow:
```
Draft complete → simulateTournamentRun() → show all results at once
```

New flow:
```
Draft complete → pre-compute all match results (hidden)
  → "Play Next Match" button
  → LiveMatch animates match 1
  → result revealed
  → if still alive → "Play Next Match"
  → LiveMatch animates match 2
  → ... until eliminated or champion
  → show tournament summary
```

Key: we still use `simulateTournamentRun` to pre-determine all outcomes (so the tournament is deterministic from the seed), but we reveal them one at a time through the live UI.

### Implementation steps

1. **Add types** — `MatchEvent`, `LiveMatchState`, `MatchEventType` to `types.ts`
2. **Add sim functions** — `distributeGoalMinutes()`, `buildMatchEvents()` to `simulate.ts`
3. **Refactor tournament flow** — split `simulateTournamentRun` so we can pre-compute matches but reveal them one at a time
4. **Build `LiveMatch` component** — minute ticker, score display, goal events
5. **Build match flow** — "Play Next Match" button → LiveMatch → result → next
6. **Wire it up** — replace instant result in `finishDraftIfComplete` with step-by-step flow
7. **Polish** — animations, goal celebrations, speed controls
8. **Bracket** (optional) — visual tournament bracket sidebar

### MVP scope (what to build first)

For the MVP, skip the bracket and fancy animations:
- Just the `LiveMatch` component with minute counter + score + goal popups
- "Play Next Match" flow
- 1x speed only (add 2x/skip later)
- No yellow cards or near misses yet (just goals + kickoff/halftime/fulltime)

---

## Phase 3: Tactical Modes (future)

Add tactical choice that affects probability values:

### Options
- **"Park the Bus"** — defensive
  - Lower userLambda (score less)
  - Lower opponentLambda (concede less)
  - Higher penalty win chance (defensive teams are better at pens?)
  - More draws in group stage

- **"Normal"** — current balanced values

- **"All Out Attack"** — offensive
  - Higher userLambda (score more)
  - Higher opponentLambda (concede more)
  - Lower penalty win chance (tired attackers miss pens?)
  - More high-scoring games, fewer draws

### Implementation
- Add `TacticalMode` type to `types.ts`
- Pass to `scoreMatch()` and adjust lambdas
- Could be a setup screen option like difficulty
- Would need re-tuning with batch sim for each mode

---

## Phase 4: Assists (future)

Track assists alongside goals for more depth.

### How it works
- For each goal, pick a second player from the XI as the assist provider
- Show assist icon on shirts (different from goal icon, e.g. a small arrow or different color badge)
- Display in goal popup: "GOAL! Mbappé (92) — assist by Dembélé"
- Track assists in `goalScorers` or separate `assistProviders` map

### Implementation
- In `buildMatchEvents()`, after picking a scorer, pick a different player for the assist
- Add `assistName?: string` to `MatchEvent`
- Update `TournamentRun` to track assists per player
- Show assist badge on pitch shirts

### UI
- Goal popup shows both scorer and assist
- Pitch shows goal count + assist count per player
- Post-match summary shows top scorers and assist leaders

---

## Phase 5: Penalty Taker Selection (future)

Let users choose their penalty takers before the shootout.

### How it works
- Before penalties start, show a "Select 5 Penalty Takers" screen
- User picks 5 players from their XI (or fewer if red cards)
- Show each player's attack rating as a guide
- During shootout, use selected players instead of generic "Player"
- Could add pressure factor: lower-rated players more likely to miss under pressure

### Implementation
- Add `penaltyTakers: string[]` to `TournamentRun` or `MatchResult`
- New component: `PenaltyTakerSelection` - shows XI with checkboxes
- Update `simulatePenalties()` to accept taker list
- Update `PenaltyShootout` component to show taker names
- Store selections in state before shootout begins

### UI Flow
```
Extra time ends → "Select your 5 penalty takers" → 
Show XI with attack ratings → User selects 5 → 
Confirm → Shootout begins with named players
```

---

## Phase 6: Spin the Wheel — Random Formation Hard Mode

**Status**: ✅ COMPLETED

A gold-outline "Spin the Wheel" button below the Formation section triggers a slot-machine animation. It cycles through formations, slows down, lands on a random one, auto-selects Hard mode, and starts the draft.

### Code Changes
- `src/pages/EightZeroGame.tsx` — `SetupScreen` component with `spinningFormationId` state, `handleSpinWheel()` animation loop, and gold outline button with `Shuffle` icon

---

## Phase 7: Last Dance — Legend Mode

**Status**: ✅ COMPLETED

A "Last Dance" button opens a modal with three cards: Messi, Ronaldo, Neymar. Choosing one auto-locks them into your XI as the first pick. The remaining 10 players are drafted via normal spins.

### Legend Data
| Legend | Nation | Position | FIFA Code | Team ID | Rating |
|--------|--------|----------|-----------|---------|--------|
| Lionel Messi | Argentina | FW | ARG | 17 | 90 |
| Cristiano Ronaldo | Portugal | FW | POR | 33 | 88 |
| Neymar | Brazil | MF | BRA | 13 | 87 |

### Code Changes
- `src/game8/types.ts` — `LegendMode` type added to `DraftOptions` and `TournamentRun`
- `src/game8/draft.ts` — `createDraftState()` auto-locks legend by name + FIFA code match, sets normal difficulty, 1 reroll, blind mode OFF
- `src/pages/EightZeroGame.tsx` — `LegendModal` component with flag cards, "Last Dance" button, gold border on legend slot in `PitchXI`, "Legend" badge on `PlayerRow`, result screen label
- `src/game8/simulate.ts` — Legend mode: easier opponent path in early rounds (reduced exponent), easier final stage (`STAGE_PRESSURE` -0.05), harder penalties (`userPenRating` -0.05)

---

## Phase 8: Tournament Bracket Balancing

**Status**: ✅ COMPLETED

Weighted opponent draw with group stage tier filtering and rating-based progression bonuses.

### Stage Buckets
| Stage | Exponent | Effect |
|-------|----------|--------|
| Group match | 0.8 | Uniform (balanced) |
| Round of 32 | 2.0 | Strongly favor weaker |
| Round of 16 | 1.5 | Favor weaker |
| Quarter-final | 1.0 | Balanced |
| Semi-final | 0.5 | Favor stronger |
| Final | 0.3 | Strongly favor stronger |

### Rating Edge Bonus
- R16: +0.5 if `overall >= 85`
- QF: +0.5 if `overall >= 86`
- SF: +0.5 if `overall >= 88`

### Group Stage Balance
- Tier filter: only opponents within ±1 ELO tier (100-point buckets) of the user's team

### Code Changes
- `src/game8/simulate.ts` — `pickOpponent()` accepts `stage` and `userElo`, adds tier filter and stage exponent mapping
- `src/game8/simulate.ts` — `scoreMatch()` adds `ratingEdgeBonus`
- `scripts/batch-simulate.mjs` — Mirrored bracket balancing logic for batch testing

---

## Phase 9: Quick Polish (Shirt Numbers)

**Status**: ✅ COMPLETED

Official WC 2026 squad numbers added to:
- `public/data/players.json` — `shirt_number` field injected for 1,220/1,248 players
- `src/game8/data.ts` — `RawPlayer` includes `shirt_number: number | null`
- `src/game8/types.ts` — `EightZeroPlayer` includes `shirtNumber: number | null`
- `src/game8/data.ts` — `buildEightZeroData` passes `shirtNumber` through
- `src/pages/EightZeroGame.tsx` — `PlayerRow` shows kit-colored badge
- `src/pages/EightZeroGame.tsx` — `ShirtIcon` shows number on shirt
- `src/pages/EightZeroGame.tsx` — `PitchXI` displays numbers on shirts

**Unmatched players**: 28 players (mostly from preliminary squads not on Wikipedia's final 26)

---

## All-Time Mode (deferred)

Left for later — needs historical data pipeline. Will plan separately when we get to it.
