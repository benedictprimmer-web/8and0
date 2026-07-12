# 8and0 — Repository Audit (Code Health · Data Integrity · Security)

_A read-only engineering audit covering code health & architecture, data
integrity, and security & config. The design / game-feel / UX dimension is
**out of scope** here — it is already covered by `design-review-report.md` and
`game-design-skills-report.md`._

**Date:** 2026-07-10 · **Model:** Opus 4.8 · **Scope commit:** `cb9b00f`
(branch `claude/ponytail-audit-yts5hg`)

---

## How this was produced

Three independent reviewer agents each audited one dimension (code health, data
integrity, security) against the real source. Every load-bearing finding was
then **re-verified against the code** — grepped, traced, or reproduced with a
throwaway script — before being written down. The goal was to kill
plausible-but-wrong claims, not to collect them.

Verdicts:

- **CONFIRMED** — independently reproduced/traced against the source during this audit.
- **PARTIAL** — real but overstated, mislocated, or already half-handled.
- **GOOD** — accurate, and the code is doing the right thing (worth preserving).

**No production code was changed by this audit.** This report is the only file
added.

## Health baseline (at audit time)

Measured after a clean `npm install` (the checked-out environment shipped with
no `node_modules`; these numbers are the true state once deps are present):

| Check | Result |
| ----- | ------ |
| `npm run lint` (eslint, `--max-warnings 0`) | ✅ clean |
| `npm run build` (tsc app + tsc API + vite) | ✅ builds; single 355.9 kB JS chunk (105.5 kB gzip) |
| `npm test` (vitest) | ✅ 95 passed, 1 skipped (6 files + 1 skipped) |
| `npm audit` | ✅ 0 vulnerabilities |
| `npm run validate:data` | ✅ passes — 1248 players, 48 teams, 26/team |

The repo is in genuinely good shape. The findings below are refinements and a
handful of real gaps, not a codebase on fire.

---

## Severity roll-up

| # | Area | Finding | Severity | Verdict |
| - | ---- | ------- | :------: | :-----: |
| S1 | Security | Leaderboard run summary is client-authoritative — forgeable up to the legit max (~92) | **High** | CONFIRMED |
| D1 | Data | `validate:data` never runs in CI — data corruption ships undetected | **High** | CONFIRMED |
| S2 | Security | Entries keyed by the **published** `seed` → any row is overwritable/griefable | **Medium** | CONFIRMED |
| C1 | Code | `EightZeroGame.tsx` — 2,764-LOC god component, 35 `useState` in one container | **Medium** | CONFIRMED |
| C2 | Code | ~235 lines of dead API types + dead routes in `src/api/client.ts` | **Medium** | CONFIRMED |
| D2 | Data | 3 historical squads have no GK → Wales has no GK in any era (all-time mode) | **Medium** | CONFIRMED |
| D3 | Data | `validate:data` skips historical files and has no upper rating bound | **Medium** | CONFIRMED |
| C3 | Code | Untyped JSON/API trust boundary (`as unknown as T`) in `client.ts` | **Medium** | CONFIRMED |
| C4 | Code/CI | CI uses `npm install` not `npm ci` (macOS lockfile) → non-reproducible builds | **Medium** | CONFIRMED |
| C5 | Code | No tests for `src/api/client.ts` fallback logic or the UI layer | **Medium** | CONFIRMED |
| C6 | Code | Internal duplication: `KNOCKOUT_STAGES` ×2, triple sim-arg spread, dup goal-scorer logic | **Low–Med** | CONFIRMED |
| S3 | Security | `formationId`/`record`/`createdAt` free-form (length-capped, not whitelisted) | **Low** | CONFIRMED |
| D4 | Data | Stale `data-quality/` snapshots (drifted, some `generated_at: null`) | **Low** | CONFIRMED |
| D5 | Data | `Date.now()`/`new Date()` in run **metadata** (not the sim math) | **Low** | CONFIRMED |
| D6 | Data | `pi_attack`/`pi_defence` null in 48/48 teams (dead schema fields) | **Low** | CONFIRMED |

---

## 1 · Security & config

The server-side code is small and, notably, **thoughtfully written** — see the
GOOD list at the end of this section. Two findings are worth action.

### S1 — Leaderboard is client-authoritative (High) — CONFIRMED
`api/leaderboard.ts:143` → `src/game8/leaderboard.ts:286` → `src/game8/scoring.ts:31`

The anti-cheat does the right *first* thing: `sanitiseSubmission` **recomputes**
`score` server-side (`leaderboard.ts:286`), so a naked forged `score=1000` with
a losing record is discarded. But `calculateRunScore` derives the score
*entirely from other client-supplied fields* — `wins`, `draws`, `losses`,
`stageReached`, `overall`, `difficulty`, `blindMode` (`scoring.ts:39-49`). There
is **no seed replay and no server-side simulation**, and **no cross-field
consistency check** (`wins+draws+losses` may exceed the real match count;
`stageReached="Champion"` need not agree with the win count).

A hand-crafted, internally-consistent payload (`wins=8, draws=8,
stageReached="Champion", difficulty="hard", blindMode=true, overall=120`)
computes to ≈ **92** — at/near the top of the board, with zero gameplay.

- **Protected:** raw `score` spoofing; out-of-range numbers (all clamped); the
  ceiling is bounded (~92) so no `999999` entries.
- **Not protected:** the authenticity of the run. The board is trivially
  forgeable up to the legitimate maximum.

**Recommendation.** For a casual hobby board this may be an acceptable, documented
risk. To raise the bar cheaply: add sanity checks (`wins+draws+losses <=
maxGames`, `stageReached` consistent with `wins`). For real integrity: make the
run reconstructible server-side from `seed` (deterministic replay — the sim is
already deterministic, see D5) and validate the summary against the replay, or
sign submissions with a server-issued per-run token.

### S2 — Entries keyed by the published `seed` → griefable (Medium) — CONFIRMED
`api/leaderboard.ts:151` (`id = result.submission.seed || randomId()`),
`:154-157` (`SET`/`ZADD` by that id), and `src/game8/leaderboard.ts:32,37`
(`seed` is part of the entry that GET serializes wholesale, `api/leaderboard.ts:119`).

Every entry's `seed` is returned to all clients on GET, and POST keys the stored
row by `seed`. So anyone can read a victim's `seed` from the public board, then
POST with that same `seed` to **overwrite** the victim's row — replacing name,
score, and XI, or lowering their score (up to 20 rows/min/IP).

**Recommendation.** Don't key public entries by a value you also publish. Store a
server-generated random `id` and either drop `seed` from GET responses or keep
it server-side. Cheapest mitigation: strip `seed` from the GET payload and key
by `randomId()`.

### S3 — Free-form stored fields (Low) — CONFIRMED
`src/game8/leaderboard.ts:263,271-272,277`

`formationId`, `formationLabel`, `record`, and `createdAt` are length-capped but
**not whitelisted**, and are echoed to all clients via GET. React auto-escapes
on render so there is no XSS today, but the "must stay escaped" invariant is
implicit — any future `dangerouslySetInnerHTML` consumer turns this into stored
XSS. `createdAt` accepts any ≤40-char string, so clients can set arbitrary/future
timestamps.

**Recommendation.** Whitelist `formationId` against known formations; stamp
`createdAt` server-side unconditionally.

### Security — what's GOOD (preserve)
- **Server-side score recompute** as defense-in-depth (`leaderboard.ts:286`) — right instinct even though the summary itself is untrusted (S1).
- **Spoof-resistant client IP** (`api/leaderboard.ts:37-51`): prefers platform `x-real-ip`, falls back to the *last* (proxy-appended) `x-forwarded-for` hop, never the client-forgeable left-most value. Correct and deliberate.
- **No error leakage** (`api/leaderboard.ts:196-201`): the handler logs server-side and returns a generic message; Upstash errors that embed status/body (and the `Authorization: Bearer <token>` header) are never echoed.
- **Comprehensive input clamping** (`leaderboard.ts:246-278`): every numeric clamped, every string length-capped, `xi` bounded to `.slice(0,11)` × `.slice(0,40)` — **no Redis-bloat vector**. `stageReached`/`difficulty` are whitelisted, which also keeps the scoring lookups NaN-safe.
- **Secret hygiene:** the Upstash token is read only server-side (`api/_upstash.ts:10-27`); no `UPSTASH`/`_upstash` import exists under `src/`, so it can't reach the client bundle. `.env`/`.env.local` gitignored; `.env.example` is placeholder-only.
- **`vercel.json` rewrite** `"/((?!api/).*)" → "/"` correctly excludes the API from the SPA fallback; no open-redirect surface.
- Redis trimmed to `MAX_ENTRIES` with orphaned-blob cleanup; GET cached via `Cache-Control: s-maxage=10` to cap read load.

---

## 2 · Data integrity

The static game data is in **very good shape**: 1248 players / 48 teams (26 each,
full GK/DEF/MID/FWD coverage), 1056 historical players / 96 historical teams,
uniform schemas, no orphan references, no duplicate ids, ratings in bounds. The
findings are targeted gaps.

### D1 — `validate:data` is not in CI (High) — CONFIRMED
`.github/workflows/ci.yml` (runs only `lint` → `build` → `test`);
`package.json:12` defines `validate:data` but nothing invokes it (verified: the
only reference in the repo is the script definition itself).

The one script that catches data corruption — a bad squad edit, a dropped player,
an unmapped position — **never runs automatically**. Given the game is entirely
data-driven, a bad data commit ships green.

**Recommendation.** Add a cheap `- run: npm run validate:data` step to `ci.yml`
(no build needed).

### D2 — Three historical squads have no goalkeeper (Medium) — CONFIRMED
`public/data/historical-players.json` — team_ids `9033`, `9042`, `9071` (Saudi
Arabia 2018, Argentina 2018, Wales 2022).

Reproduced with a script: exactly **3** historical XIs contain zero
`is_goalkeeper` / zero `position:"GK"` players, and **Wales (`WAL`) has no GK in
*any* edition**. After the all-time nation merge (`data.ts` `buildAllTimeData`),
Wales cannot fill its GK slot from real data — `calculateTeamRatings`
(`ratings.ts:10`) falls back to the hardcoded `65`, and squad-first drafting a GK
for Wales has no eligible candidate (`draft.ts:154` throws "No eligible teams
have a player for an open slot").

**Recommendation.** Add a GK to each of the three historical XIs, and add a
validator rule requiring ≥1 GK per historical team and per merged nation.

### D3 — Validator skips historical data + no upper rating bound (Medium) — CONFIRMED
`scripts/validate-data.mjs` (reads only `teams.json`/`players.json`).

The validator is otherwise solid (it already does referential integrity,
duplicate-id detection, required fields, position coverage). Gaps: (a)
`historical-players.json`/`historical-teams.json` are **not validated at all** —
that's exactly where D2 lives; (b) `ea_overall` has no **upper** bound (line 64
only rejects `<= 0`, so a stray `150` passes); (c) no `aura_composite` range
check; (d) duplicate check is id-only, not `name`+`team_id`.

**Recommendation.** Extend the validator to load the historical files (assert ≥1
GK per team/nation), add `ea_overall <= 99` and `0 <= aura_composite <= 1`, and a
name+team duplicate check.

### D4 — Stale `data-quality/` snapshots (Low) — CONFIRMED
None of `player-rating-overrides.json`, `squad-mismatches.json`,
`historical-mismatches.json`, `rating-backfill-report.json` is imported under
`src/` — they are generated audit artifacts, **not runtime inputs**, so they do
not affect gameplay. But they have drifted: `player-rating-overrides.json` (300
entries, mtime 2026-07-06 vs data 2026-07-10) has 90 `player_id`s that no longer
exist in `players.json` and 104 stale `club_name`s; `historical-mismatches.json`
has `generated_at: null`; `squad-mismatches.json` (377 name-format hints,
generated 2026-06-09) predates the latest data regen. Harmless but misleading.

**Recommendation.** Mark these as input snapshots / CI artifacts (move to `docs/`
or a build-output dir), add `generated_at`, and regenerate them in the data-build
step so they aren't mistaken for live integrity state.

### D5 — Wall-clock in run **metadata** only (Low) — CONFIRMED / GOOD
`src/game8/simulate.ts:409` (`id: ${seed}:${Date.now()}`) and `:410`
(`createdAt: new Date().toISOString()`).

Worth stating precisely because it's easy to misread as a determinism bug: these
set only the run's `id`/`createdAt`. **Every outcome-bearing value** (scores,
bracket, grade) is computed *before* these lines from the seed alone. The
determinism guarantee that matters — **same seed ⇒ same results** — is intact. The
seeded RNG (`random.ts`) is a sound FNV-1a + mulberry32 generator, and a grep of
the whole `src/game8/` sim path finds **no `Math.random`**. This is a strength.

**Recommendation (only if byte-for-byte run reproducibility is ever needed).**
Derive `id` from the seed and accept `createdAt` as a caller parameter.

### D6 — Dead schema fields (Low) — CONFIRMED
`public/data/teams.json` — `pi_attack`/`pi_defence` are `null` for all 48/48
teams and are not read by the sim. Either populate or drop them.

---

## 3 · Code health & architecture

### C1 — `EightZeroGame.tsx` is a 2,764-LOC god component (Medium) — CONFIRMED
`src/pages/EightZeroGame.tsx`

One file holds **16 top-level components** plus the container. The container
`EightZeroGame()` (lines 1431–2764, ~1,330 LOC) alone carries **35 `useState`**
(reproduced), 9 `useRef`, 9 `useMemo`, 5 `useEffect`, and ~54 in-component
handlers, owning at least five distinct responsibilities in one flat state bag:
data loading/era assembly, the draft state machine, the cosmetic reel animation,
the Super-Sub flow, and the 7-state tournament phase machine. Symptom of the
strain: `startDraft` (1659) and `resetToSetup` (1689) each manually reset ~16
setters in sequence — a missed setter is an easy, hard-to-spot bug.

**Recommended decomposition (map only — do NOT refactor blindly):**
1. Move the 15 stateless/local sub-components into `src/pages/eightzero/components/` — they already take clean props; removes ~1,100 lines at near-zero risk.
2. Extract `useReelAnimation()` — the self-contained cosmetic reel state + `animateSpin`/`runReelSteps`/`finishReel`/`skipReel`/`resetReel` chain.
3. Extract `useGameData(era)` — the 4 React-Query queries + `dataByEra`/`gameData`/`boostedData`/`draftData` memos.
4. Collapse the 7-phase machine into a `useReducer`, and the **three** `simulateTournamentRun` call sites (1757, 1795, 1867) into one `runSim(source)` that builds the ~18-field arg object once.

Target end-state: `EightZeroGame` becomes a ~200-line orchestrator.

### C2 — Dead API types & routes in `client.ts` (Medium) — CONFIRMED
`src/api/client.ts:142-378`

~235 lines of exported interfaces (`Fixture`, `BacktestSummary`, `ModelSummary`,
`ShapExplanation`, `AuraEntry`, `StyleCluster`, `Coach`, `Team`, …) are **used in
0 files outside `client.ts`** (verified by grep) — leftovers from a larger
predictions/analytics app. `staticPath` also routes many endpoints the game
never calls and has a **duplicate, unreachable `/api/leaderboard` branch**
(lines 10 and 25 both return `/data/leaderboard.json`; the second is dead).

**Recommendation.** Delete the unused interfaces and dead routes — smaller API
surface, clearer module boundary.

### C3 — Untyped JSON/API trust boundary (Medium) — CONFIRMED
`src/api/client.ts:46,57,67` (`as unknown as T`), plus `res.json() as T` (97) and
unvalidated `r.json() as Promise<HistoricalTeam[]>` casts in
`EightZeroGame.tsx:1519,1524,1538`.

The static-fallback and fetched JSON is cast straight to the caller's generic
`T` with **no runtime validation** — the double-cast `as unknown as T` explicitly
defeats the type system at the exact boundary where external/persisted data
enters. Malformed data would flow through fully typed but wrong. (`storage.ts:37,86`
casts from `localStorage` guarded only by `Array.isArray` are a milder instance.)

**Recommendation.** Add a typed parse / lightweight runtime validation at this
boundary (the domain layer is otherwise strict).

### C4 — CI uses `npm install`, not `npm ci` (Medium) — CONFIRMED
`.github/workflows/ci.yml`

Deliberate, with a comment that the committed lockfile was generated on macOS and
omits Linux-only optional deps, so `npm ci` fails. But `npm install` may resolve
newer transitive versions and mutate `package-lock.json`, so CI (and Vercel) do
**not** build the exact locked graph — the core guarantee `npm ci` exists for —
and `--no-audit` disables vulnerability surfacing. (Observed directly this audit:
`npm install` produced a modified `package-lock.json` on Linux.)

**Recommendation.** Fix the root cause — regenerate the lockfile on Linux (or add
platform-appropriate `optionalDependencies`) and commit it — then switch CI *and*
the Vercel install command to `npm ci`.

### C5 — Test coverage gaps: API client + UI layer (Medium) — CONFIRMED
7 test files, **all in `src/game8/`**. The hard-to-reason-about domain math
(simulate, scoring, ratings, chemistry, penalties, leaderboard validation) is
**well covered** by `game8.test.ts` (848 LOC) + 6 focused suites — a real
strength. **Zero tests** touch `src/pages/`, `src/components/`, or `src/api/`.
Highest-value gap: `src/api/client.ts` `request()`/`staticPath()` network-first-
then-static fallback logic — complex conditional branching with real failure
modes (offline, 4xx, no backend), pure-ish, and easily unit-testable with a
mocked `fetch`.

**Recommendation.** Add `fetch`-mocked tests for the `client.ts` fallback logic
first; component tests for `LiveMatch`/`PenaltyShootout` state machines later.

### C6 — Internal duplication (Low–Medium) — CONFIRMED
- **`KNOCKOUT_STAGES` defined twice** with divergent types: `EightZeroGame.tsx:83` (a `Set`) and `simulate.ts:21` (an array). They can silently drift.
- **Triple `simulateTournamentRun` arg-spread** (see C1.4) — any new sim field must be added in 3 places.
- **Goal-scorer accumulation duplicated verbatim** between `SquadPanel` (~936) and `TeamSheet` (~1039).

**Recommendation.** Hoist `KNOCKOUT_STAGES` to a shared module; centralize the sim
arg-builder; extract an `accumulateGoalScorers()` util.

### Code health — what's GOOD (preserve)
- **Domain/UI separation:** `src/game8/` is a clean, largely-pure logic layer; `scoring.ts` is intentionally dependency-free so it is shared verbatim by the client and the Vercel serverless validator (`scoring.ts:3-9`).
- **Type discipline (measured):** **0** `: any`, **0** `@ts-ignore`/`@ts-expect-error`, **0** non-null assertions in production code (all 15 `!` are in tests), a single legitimate `eslint-disable` (`no-control-regex`), and only 3 escape-hatch casts. Strict tsconfig (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).
- **Strong domain test suite** including a `probe` harness for the probabilistic sim.
- **Sensible server-state handling:** React-Query with `staleTime: Infinity` for static data and a deliberate network-first exception for the live leaderboard, plus a graceful static-JSON fallback so the game runs with no backend.
- **CI** runs lint + dual type-check (app + API) + build + test on every PR — the separate `tsconfig.api.json` guards the shared client/server scoring contract.

---

## Prioritized recommendations

**Do first (correctness / integrity):**
1. **D1** — add `npm run validate:data` to CI (one line; closes a real hole).
2. **D2** — add goalkeepers to the 3 historical squads (Saudi 2018 / Argentina 2018 / Wales 2022); Wales is currently GK-less in all-time mode.
3. **S2** — stop keying leaderboard entries by the published `seed` (or stop publishing it) to close the overwrite/grief vector.

**Do next (hardening / reproducibility):**
4. **S1** — add cheap cross-field consistency checks to the leaderboard validator; document the residual client-authoritative risk (full fix = seed-replay).
5. **C4** — fix the macOS lockfile so CI/Vercel can use `npm ci`.
6. **D3** — extend `validate:data` to cover historical files + upper rating bound.
7. **C3 / C5** — add runtime validation and `fetch`-mocked tests at the `client.ts` boundary.

**Cleanup (low-risk, high-clarity):**
8. **C2** — delete the ~235 lines of dead API types and dead routes in `client.ts`.
9. **C6** — de-duplicate `KNOCKOUT_STAGES`, the sim arg-builder, and goal-scorer logic.
10. **C1** — begin the low-risk sub-component extraction from `EightZeroGame.tsx`.
11. **S3 / D4 / D6** — whitelist `formationId` + server-stamp `createdAt`; mark/relocate stale `data-quality/` snapshots; drop the null `pi_*` fields.

_No code was modified by this audit. Act on the above at your discretion._
