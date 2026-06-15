# 8and0

The **8-0 World Cup draft game**, live at [`8and0.app`](https://8and0.app).

> **New chat / new session? Start here.** This README is the single source of
> truth for what the project is, how it's built, and how to work on it. Say
> _"see README"_ and this is the context. For a deeper running log of completed
> features and implementation notes, see [`HANDOFF.md`](./HANDOFF.md) and
> [`ideas.md`](./ideas.md).

---

## What the game is

You build a World Cup XI by **spinning a slot machine of nations**. Each spin
lands on one of the 48 WC 2026 teams and offers up its real squad; you pick one
player into an open slot in your chosen formation. Repeat 11 times to fill the
team, then **simulate a tournament run**. The dream is to go **8-0** — win all
eight matches (group stage + knockouts) and lift the trophy unbeaten.

**Core loop:**

```
Pick formation + difficulty  →  Spin a nation  →  Pick a player into a slot
        →  (×11 until XI is full)  →  Simulate tournament  →  Score + share
```

**Modes & twists** (all in `SetupScreen`):

- **Difficulty** — easy / normal / hard. Hard adds blind ratings and fewer rerolls.
- **Draft mode** — _squad-first_ (spin a nation, pick any position) or
  _position-first_ (a slot is demanded, you fill it).
- **Spin the Wheel** — slot-machines a random formation, forces hard mode, starts the draft.
- **Last Dance (Legend mode)** — lock in Messi, Ronaldo, or Neymar as your first
  pick; the tournament path is tuned around it.
- **Practice penalties** — standalone penalty shootout trainer.

Finished runs are scored, saved locally, and can be submitted to a global
leaderboard.

---

## Tech stack

- **React 18 + TypeScript + Vite** (`type: module`)
- **Tailwind CSS** for styling (custom theme + component classes in `src/index.css`)
- **TanStack Query** (react-query) for the leaderboard fetch/submit
- **react-router-dom** — two routes: `/` (game) and `/leaderboard`
- **lucide-react** icons
- **Vitest** for unit tests
- **Vercel** for hosting + a serverless function (`api/`) backed by **Upstash Redis**

There is **no traditional backend** — game logic and simulation run entirely in
the browser. The only server code is the leaderboard function.

---

## Architecture & file map

```
8and0/
├── public/data/              ← static game data shipped with the app
│   ├── players.json          ← ~1,248 WC 2026 players (rating, position, shirt #, aura)
│   ├── teams.json            ← 48 teams (elo, group, ranking, fifa code)
│   └── leaderboard.json      ← placeholder; real board comes from the API
├── api/                      ← Vercel serverless functions (Node, type-checked separately)
│   ├── leaderboard.ts        ← GET/POST global leaderboard
│   └── _upstash.ts           ← Upstash Redis REST helper
├── src/
│   ├── App.tsx               ← router: "/" → game, "/leaderboard" → board
│   ├── main.tsx, index.css   ← entry + Tailwind + all custom CSS/animations
│   ├── api/client.ts         ← data loader (fetch JSON) + leaderboard client
│   ├── components/
│   │   ├── Flag.tsx, flagUtils.ts   ← country flags
│   │   ├── LiveMatch.tsx            ← animated match playback + scoreboard
│   │   ├── PenaltyShootout.tsx      ← penalty shootout UI  ⚠️ see "Active work"
│   │   └── TournamentBracket.tsx    ← bracket view
│   ├── game8/                ← pure game logic (no React) — the engine
│   │   ├── types.ts          ← all interfaces (DraftState, TournamentRun, etc.)
│   │   ├── data.ts           ← RawPlayer/RawTeam → buildEightZeroData()
│   │   ├── draft.ts          ← createDraftState, spinTeam, rerollTeam, selectPlayer, autofill
│   │   ├── formations.ts     ← FORMATIONS (433/442/451/343/352/532/541), getFormation()
│   │   ├── ratings.ts        ← calculateTeamRatings (OVR/GK/DEF/MID/ATK)
│   │   ├── simulate.ts       ← simulateTournamentRun, scoreMatch, pickOpponent
│   │   ├── random.ts         ← seededRandom, poisson, clamp (deterministic per seed)
│   │   ├── storage.ts        ← localStorage history
│   │   ├── leaderboard.ts    ← scoring / sorting helpers
│   │   ├── penaltyText.ts    ← penalty flavour text
│   │   └── *.test.ts         ← vitest suites (game8 + leaderboard)
│   └── pages/
│       ├── EightZeroGame.tsx ← THE main file (~1.7k lines): SetupScreen, draft UI,
│       │                        spin animation, PitchXI, SquadPanel, ResultPanel,
│       │                        LeaderboardPanel, and the top-level game state machine
│       └── GlobalLeaderboard.tsx
└── scripts/                  ← data + analysis (run with `node scripts/<file>.mjs`)
    ├── update-squads.mjs     ← refresh squad data
    ├── validate-data.mjs     ← sanity-check players/teams JSON
    ├── odds-report.mjs       ← stage-reach probabilities (mirrors live simulate.ts)
    └── batch-simulate*.mjs    ← historical/offline simulation (may have drifted)
```

### Data flow

```
1. client.ts loads teams.json + players.json → buildEightZeroData()
2. SetupScreen: formation + difficulty + mode → createDraftState()
3. handleSpin → spinTeam()/rerollTeam() → animateSpin() (the nation reel)
4. handlePick → selectPlayer() → fills a slot
5. XI complete → simulateTournamentRun() (deterministic from run seed)
6. Match playback (LiveMatch) → penalties if drawn knockout → ResultPanel
```

### State management

Plain React `useState` in `EightZeroGame` — no Redux/Zustand. The big pieces of
state: `draftState`, `formationId`, `options`, `run` (completed simulation),
`tournamentPhase` (`idle | ready | live | penalties | practice_penalties | complete`),
`currentMatchIndex`, and `history`.

### Determinism

Everything sim-related is seeded (`random.ts` → `seededRandom`). A run's seed
fully determines its matches, so results are reproducible and the leaderboard can
dedupe by seed. **Never** introduce `Math.random()` into the simulation path.

---

## Key commands

```bash
npm install
npm run dev          # Vite dev server on :5173 (no /api — leaderboard submit fails gracefully)
npm run build        # tsc + tsc -p tsconfig.api.json + vite build → dist/
npm run preview      # preview the production build
npm test             # vitest run
npm run lint         # eslint (max-warnings 0)
npm run format       # prettier
vercel dev           # full local stack incl. /api leaderboard (needs Upstash env)
```

`npm run build` type-checks the serverless `api/` functions too, so a build
failure there blocks deploy.

---

## Global leaderboard

Finished runs always save locally (`localStorage`). At the end of a run you may
enter a name to submit to the global board at `/leaderboard`, backed by
`api/leaderboard.ts` + Upstash Redis. Copy `.env.example` → `.env.local` and fill
in (same vars in Vercel project settings for prod):

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

- The board only works against the live function (`vercel dev` or a deployment);
  plain `vite dev` has no `/api`, so submission fails gracefully and the run is
  still saved locally.
- Submissions are idempotent per run (keyed by seed) — re-submitting to fix a
  name overwrites rather than duplicates.
- Only name, team OVR, and top scorer are shown publicly. Names are
  profanity/length filtered.

---

## Deployment (Vercel)

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Set the Upstash env vars in project settings for the live leaderboard.

---

## Conventions & house rules

- **All game UI lives in `src/pages/EightZeroGame.tsx`.** Add small components
  inline there or, if reusable, in `src/components/`.
- **Pure logic goes in `src/game8/`** and should stay React-free + unit-tested.
- **Use IDs, never hard-coded team/player names** in logic.
- **Keep the simulation deterministic** — seeded RNG only, no `Math.random()` in sim.
- **Tests must pass before commit** (`npm test`), and `npm run build` must succeed.
- Prefer **small, focused changes** / PRs.
- Tailwind theme tokens: `gold-*`, `surface-*`, `indigo-*`. Reusable styles live
  as component classes in `src/index.css` (e.g. `.stat-card`, `.section-label`).
  Animations are defined in both `src/index.css` and `tailwind.config.js`.

---

## Active work / boundaries

- **Penalties are being actively worked on** (`src/components/PenaltyShootout.tsx`
  and recent `penalty`/goalkeeper commits). Treat that file as off-limits unless
  the task is explicitly about penalties.
- Current focus areas: **UX polish / "juice"** (spin feel, score pop-ups, win
  celebrations) and a **"See my team" toggle** so the drafted XI is reachable at a
  glance on mobile (and desktop) without scrolling.

---

## Where to look when…

| You want to change…                | Go to                                            |
| ---------------------------------- | ------------------------------------------------ |
| The spin / draft screen & feel     | `EightZeroGame.tsx` (`animateSpin`, draft render)|
| How matches are simulated/scored   | `src/game8/simulate.ts`                          |
| Team ratings (OVR/GK/DEF/MID/ATK)  | `src/game8/ratings.ts`                           |
| Formations available               | `src/game8/formations.ts`                        |
| Match playback / scoreboard        | `src/components/LiveMatch.tsx`                   |
| The end-of-run result screen       | `ResultPanel` in `EightZeroGame.tsx`             |
| Colours / animations / card styles | `src/index.css` + `tailwind.config.js`           |
| Player / team data                 | `public/data/*.json` (+ `scripts/update-squads`) |
| The global leaderboard             | `api/leaderboard.ts`, `src/pages/GlobalLeaderboard.tsx` |
