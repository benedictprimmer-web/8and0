# Phase 10 Build Brief — Rating Fix + All-Time/Legends Mode

_Self-contained execution brief. Anyone (human or agent) picking this up cold should be able to build the whole thing from this file alone. Companion to the [Phase 10 summary](./ideas.md#phase-10-all-time--legends-mode) in `ideas.md` — this is the detailed version with sources, algorithms, and a file-by-file plan._

**Decisions locked in (2026-07-10):**
1. Era model: **single-era draft is the primary mode** (pick 2014/2018/2022/2026, draft an XI from that tournament's real teams, play that tournament's real opponents) **+ a "Dream Team" toggle** added after, which pools all eras + legends into one spin pool.
2. Historical opponents use **era-accurate team strength**, not the 2026 bracket reused.
3. Legends: curated shortlist (below), extending the existing Last Dance mechanic — never in the random spin pool.

---

## Part A — Fix 2026 ratings (prerequisite, do this first)

**Why first:** everything in Parts B/C reuses the same `ea_overall` + `rating_confidence` pattern. Building historical eras on top of a broken rating system just triples the bug.

**Current state** (`node scripts/audit-ratings.mjs --list`):
- 1,038 / 1,248 players (83%) are `rating_confidence: "estimated"` — derived from club/team strength, not a real EA card.
- Inflation signature confirmed: England carries 22 players rated 85+, France 20, Spain 18 — more than any real squad has.
- 210 players have a genuine preserved rating.

**Fix:**
1. New script `scripts/fetch-ea-ratings.mjs`:
   - Source: sofifa.com or futbin.com's current EA FC edition player search/export (same non-official source class the existing 210 preserved ratings already came from — no new precedent).
   - For each of the 1,248 players in `players.json`, look up by `name` + `club_name` (fall back to `name` + `fifa_code`/nationality if club match fails — transfers happen).
   - **Name matching**: reuse the token-containment matcher already built for `data-quality/squad-mismatches.json` (handles accents, "M. Rashford" vs "Marcus Rashford", etc.) — don't rewrite it.
   - Cache every raw response to `data-quality/raw/ea-ratings/` (mirrors the "cache scraped data aggressively" discipline from the sibling World-Cup-Simulator repo — good practice, adopt it here even without a CLAUDE.md mandating it).
   - Rate limit: random 1–3s sleep between requests, real user-agent, same as sibling repo's convention.
2. Update `players.json`: set `ea_overall` to the real value, `rating_confidence: "preserved"`, `rating_source: "sofifa-fc26"` (or `futbin-fc26`) for every match found.
3. **No-match fallback**: player genuinely has no card (happens for young/lower-league squad players). Keep `rating_confidence: "estimated"` but compute it honestly — drop the club-context inflation logic in favor of a simpler baseline (e.g. league-tier + position average), and make sure `audit-ratings.mjs`'s "estimated in the 85+ band" check stays near-zero.
4. **Gate**: re-run `node scripts/audit-ratings.mjs`. Ship only when: estimated % is in the single digits, zero teams show an 85+ count above ~10 (a real elite squad tops out around there), and `--list` shows no more estimated 85+ outliers.
5. Add a test (`scripts/audit-ratings.mjs` becomes a real gate, not just a report — consider a `--ci` flag that exits non-zero if estimated% > threshold, so this can't silently regress).

---

## Part B — Historical rosters (2014, 2018, 2022)

**Scope**: starting XI only. 11 players × 32 teams × 3 tournaments ≈ **1,056 players**, plus era-accurate team strength for bracket balancing.

### B1. Roster + starting XI

- **Source**: [jfjelstul/worldcup](https://github.com/jfjelstul/worldcup) (MIT, all men's WCs 1930–2022, includes a squads table and an appearances/lineups table with starts per match).
- **Algorithm** (deterministic, no manual curation):
  ```
  for each (team, tournament) in {2014, 2018, 2022}:
    starts = count of matches started, per player, in that tournament
    startingXI = top 11 players by starts
    tie-break: total minutes played, then shirt number (stable, deterministic)
  ```
- Script: `scripts/fetch-historical-rosters.mjs` — pulls the dataset (vendored copy or direct CSV fetch from the repo's `data/` folder), computes starting XIs, writes an intermediate `data-quality/raw/historical-rosters.json`.

### B2. Ratings per era

Numeric rating only — no card art/assets, same as the current `ea_overall` field.

| Era | Source game | Why | Dataset |
|---|---|---|---|
| 2014 | FIFA 14 | Released Sep 2013, closest to the June 2014 tournament | [sofifa FIFA 14 archive](https://sofifa.com/?r=140052&set=true) / [fifaindex.com/players/fifa14](https://fifaindex.com/players/fifa14) |
| 2018 | FIFA 18 | Released Sep 2017, EA shipped a free World Cup content update in-tournament | [4m4n5/fifa18-all-player-statistics](https://github.com/4m4n5/fifa18-all-player-statistics) (pre-scraped, no live scraping needed) |
| 2022 | **FIFA 23** (not 22) | Released Sep 2022, weeks before the Nov–Dec tournament — closer snapshot than FIFA 22 | [stefanoleone992/fifa-23-complete-player-dataset](https://www.kaggle.com/datasets/stefanoleone992/fifa-23-complete-player-dataset) (covers FIFA 15–23, one file, version column) |

- Script: `scripts/fetch-historical-ratings.mjs` — loads the right dataset per era, matches each starting-XI player by name (+ nationality as disambiguator for common names), writes `ea_overall` + `source_game` per player.
- Same audit discipline as Part A: build `scripts/audit-historical-ratings.mjs` (mirror `audit-ratings.mjs`) before calling this done. Expect a higher legitimate "estimated" rate here (some 2014-era players may predate good FIFA 14 data) — that's fine, just be honest about it, don't inflate.

### B3. Era-accurate team strength (for opponent balancing)

**Don't build a new ELO system — reuse the one that already exists.** The sibling repo `/Users/benrimmer/World-Cup-Simulator` computes composite ELO from **49k real historical matches** as its canonical model (see its `scripts/generate_static_data.py` and `CLAUDE.md`). That pipeline already produces exactly what's needed here: real team strength at any point in time, including June 2014, June 2018, and November 2022.

- Snapshot each of the 32 teams' ELO at tournament start for each era from that existing pipeline/data (either export a small JSON from the sibling repo, or vendor the relevant historical-matches dataset if it's more portable — check what `generate_static_data.py` reads from before deciding which).
- Write `public/data/historical-teams.json`: `{ team_id, fifa_code, tournament_year, elo }[]`.
- Wire into `simulate.ts`'s `pickOpponent()` so historical-era matches use `historical-teams.json` ELOs instead of 2026 `teams.json` ELOs when `era !== 2026`.

---

## Part C — Legends

Extends the existing **Last Dance** mechanic (`LegendMode` in `types.ts`, currently a 3-value union: `messi | ronaldo | neymar`). Never enters the random spin pool — Icon-tier ratings would dominate any draw.

### Proposed shortlist (edit freely — ratings below are from a first pass, need a final verification fetch against live futbin/fut.gg before shipping, same as any other sourced rating)

| Legend | Nation | Position | Icon OVR (approx, verify) |
|---|---|---|---|
| Pelé | Brazil | CAM/FW | 95 |
| Diego Maradona | Argentina | CAM | 95 |
| Zinedine Zidane | France | CM/CAM | 97 |
| Ronaldo Nazário | Brazil | ST | 97 |
| Ronaldinho | Brazil | LW | 93 |
| Paolo Maldini | Italy | CB/LB | 92 |
| Franz Beckenbauer | Germany | CB/CDM | 92 |
| Cafu | Brazil | RB | 91 |
| Gianluigi Buffon | Italy | GK | 91 |
| Zico | Brazil | CAM/CM | 91 |
| Miroslav Klose | Germany | ST | 88 (93 on promo card — use base) |
| Roberto Carlos | Brazil | LB | ~91 (verify) |
| Carles Puyol | Spain | CB | ~91 (verify — one search hit showed 95, likely a special card; confirm base) |
| Fabio Cannavaro | Italy | CB | ~89 (verify) |
| Andrea Pirlo | Italy | CDM/CM | ~90 (verify) |
| Xavi | Spain | CM | ~90 (verify) |
| Andrés Iniesta | Spain | CAM | ~90 (verify — new to FC26 Icons) |
| Toni Kroos | Germany | CM | ~90 (verify — new to FC26 Icons) |
| Thierry Henry | France | ST | ~90 (verify) |
| Gerd Müller | Germany | ST | ~90 (verify) |
| Eusébio | Portugal | ST | ~89 (verify) |
| Johan Cruyff | Netherlands | CF | ~91 (verify — check FC26 availability) |
| Iker Casillas | Spain | GK | ~90 (verify) |
| Romário | Brazil | ST | ~89 (verify) |

24 names, spans GK/DF/MF/FW and 8 nations. Trim or extend before build — this is a first draft, not final.

**Implementation:**
- `scripts/fetch-icon-ratings.mjs` — same fetch+cache+match pattern as Parts A/B, sourced from futbin.com/fut.gg Icon pages.
- Extend `LegendMode` from a 3-value union to `string` (legend ID) backed by a `LEGENDS` table in `src/game8/legends.ts`, so adding #25 later doesn't touch the type.
- `LegendModal` in `EightZeroGame.tsx` needs a layout change for 24 cards vs. 3 — grid/scroll, not the current 3-card row.

---

## Part D — Era model wiring (UI + engine)

### D1. Single-era mode (build first)

- `SetupScreen` gets an **Era selector**: 2026 (default) / 2022 / 2018 / 2014, alongside formation/difficulty.
- `src/game8/types.ts`: add `export type Era = 2014 | 2018 | 2022 | 2026;` threaded through `DraftOptions`, `TournamentRun`.
- `src/game8/data.ts`: `buildEightZeroData()` takes an `era` param, loads from `historical-players.json` + `historical-teams.json` when `era !== 2026`, else current files. Same shape, different source — no duplicate logic.
- `simulate.ts`: `pickOpponent()` and bracket generation scope to the chosen era's 32 teams (real 2014/2018/2022 fields, not 2026's 48-team expanded format — group/bracket sizes differ, check `formations.ts`/bracket logic doesn't hardcode 48).
- **Known wrinkle**: 2026 is 48 teams, 2014/2018/2022 are 32. The bracket structure (`TournamentBracket.tsx`, group logic) needs to handle both — don't hardcode 48 anywhere that historical eras will hit.

### D2. Dream Team toggle (build second, after D1 ships and is stable)

- A toggle on `SetupScreen` (only enabled once an era is otherwise selectable): pools all 4 eras' starting XIs + all legends into one spin pool.
- Opponent pool for Dream Team: use 2026 bracket (mixing "historical opponents" doesn't make sense once the player pool itself is timeless).
- **Cross-era rating caveat**: FIFA 14/18/23/FC26 ratings aren't perfectly comparable (rating inflation drifts across editions — a 2026 88 and a 2014 88 aren't strictly equivalent). Don't attempt a statistical normalization pass for this — it's a "for fun" mode, not the accuracy-critical 2026 live model. Note the caveat in a tooltip/help text so it reads as an intentional choice, not a bug.

---

## File-by-file change map

```
public/data/
  historical-players.json     NEW — 1,056 starting-XI players, 3 eras
  historical-teams.json       NEW — era-accurate team ELOs
  players.json                MODIFIED — Part A rating backfill

scripts/
  fetch-ea-ratings.mjs             NEW — Part A
  fetch-historical-rosters.mjs     NEW — Part B1
  fetch-historical-ratings.mjs     NEW — Part B2
  fetch-icon-ratings.mjs           NEW — Part C
  audit-historical-ratings.mjs     NEW — mirrors audit-ratings.mjs
  audit-ratings.mjs                MODIFIED — add --ci gate flag

data-quality/
  raw/ea-ratings/               NEW — cached scrape responses
  raw/historical-rosters/       NEW
  raw/historical-ratings/       NEW
  raw/icon-ratings/              NEW

src/game8/
  types.ts        MODIFIED — Era type, LegendMode → string
  legends.ts       NEW — LEGENDS table
  data.ts         MODIFIED — era-aware buildEightZeroData()
  draft.ts        MODIFIED — era-aware spin pool (incl. dream-team merge)
  simulate.ts     MODIFIED — era-aware pickOpponent(), historical team ELOs
  game8.test.ts   MODIFIED — era-aware test cases
  historical.test.ts   NEW — starting-XI algorithm, era data loading

src/pages/EightZeroGame.tsx   MODIFIED — Era selector, Dream Team toggle,
                                LegendModal grid layout for 24 legends
```

---

## Sequencing

Even under "build it all," ship in reviewable chunks — each is independently testable:

1. **Part A** — rating fix. Data-only change, `players.json` diff + new script. Gate: `audit-ratings.mjs` clean.
2. **Part B** — historical data pipeline (rosters, ratings, team ELOs). Data-only, three new JSON-producing scripts. Gate: `audit-historical-ratings.mjs` clean + spot-check 5-10 known starting XIs by hand (e.g. Germany 2014 final XI should be recognizable).
3. **Part C** — legends data. Small, same pattern as B.
4. **Part D1** — single-era UI wiring. This is the first user-visible change.
5. **Part D2** — Dream Team toggle, once D1 is stable.
6. Full regression: `npm run build && npm run lint && npm test` clean, plus the manual playtest checklist from `HANDOFF-CURRENT.md` (no browser preview available for this repo — verify via build/lint/test/dev-server smoke test, not screenshots).

---

## Risks / open flags

- **FC26 Icons list may still be shifting** (game is newly released) — treat the shortlist ratings as a snapshot needing a refresh path, same as squad data already has.
- **32 vs 48 team bracket structure** — audit every place `formations.ts`/bracket/group code assumes 48 before wiring in 2014/2018/2022.
- **Scraping etiquette** — sofifa/futbin/fut.gg have no official API; apply the same caching + rate-limit discipline the sibling repo's `CLAUDE.md` mandates for its own scraping, even though this repo has no such file yet.
- **Name-matching failure rate** — expect some manual review for historical eras (older transliterations, nicknames change over decades more than the 2026 squad-mismatches case did). Budget for a `data-quality/historical-mismatches.json` review pass like the existing `squad-mismatches.json`.

---

## Postscript — what actually shipped (2026-07-10)

All five parts landed on `feat/phase10-ratings-and-eras`. Deviations from the
plan above, and why:

- **Current-year (FC25/26) ratings were a genuine blocker.** sofifa, futbin,
  fut.gg and fifaindex are all Cloudflare-blocked (403) from this environment,
  and Kaggle needs auth. The best GitHub-hosted mirror
  (`eddwebster/football_analytics`) stops at **FIFA 22**. So Part A uses FIFA 22
  as the rating base for the 2026 squad (real EA data beats club-strength
  guesses), **age-adjusted toward EA's `potential`** for players who were young
  in 2021 (Pepi 65→74, Reyna 77→83). The 210 curated current stars
  (Mbappé 93, Yamal 89) are kept untouched. The rating source is a swappable
  CSV — drop a fresher FC26 export in and re-run with `--edition`.
- **Historical editions:** FIFA 15 → 2014 (FIFA 14 is Cloudflare-only; 15 ships
  Sep'14, ~2 months post-tournament), FIFA 18 → 2018 (exact), FIFA 22 → 2022
  (FIFA 23 not in the mirror).
- **Team strength = mean of the XI's real ratings**, mapped to the game's
  ~1200–2100 elo scale — self-contained, no dependency on the sibling
  World-Cup-Simulator Elo pipeline. Simpler and consistent with the ratings the
  drafted players carry.
- **32-vs-48 bracket was a non-issue.** The game is fixed at 8 matches (the
  "8-0" identity) and draws 8 opponents from a pool by strength — it never
  simulates a real 48- or 32-team bracket. Historical eras just swap the pool.
- **Legends stay elite but not absurd:** Icon *peak* overalls (88–96), not the
  95–97 promo specials for everyone.
- **Name matching** handles: accents, nicknames via first-name prefix
  (Gio→Giovanni), mononyms via long+short name (Hulk = Givanildo Vieira de
  Sousa), jfjelstul "not applicable" placeholders, and nation aliases
  (Côte d'Ivoire, SAU/KSA, DEU/GER). Japan/Qatar stay estimated (native-script /
  sparse FIFA coverage) at a sane ~69 mean.

Verified end-to-end in a real browser: era selector, 27-legend grid, 2014 draft
with Zidane locked (96), Dream Team merge (Saudi Arabia 45 players across
2018/22/26). No console errors. `npm run build`, `npm test` (88), `npm run lint`
all clean.
