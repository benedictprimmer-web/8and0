# Sub-agent task: correct the estimated EA player ratings in 8and0

Copy everything below the line into a fresh agent/session. It is fully
self-contained — the agent needs web access and this repo.

---

## Your goal

The World Cup draft game **8and0** rates every player with an `ea_overall`
(EA Sports FC / "FIFA") number. A data audit found that **~83% of ratings
(1,038 of 1,248) are _estimated_, not real EA ratings** — they were derived from
club/team strength, which **inflated squad players at big clubs** (e.g. England
carries 22 players rated 85+, when a real squad has ~8) and **under-rated** some
stars in weaker contexts (Ødegaard at 80).

**Fix it:** replace the estimated ratings with real, web-verified **EA Sports FC 26**
overall ratings, starting with the players that matter most, and mark them as
verified. Do NOT invent numbers from memory — every change must be sourced.

## The data

- File: **`public/data/players.json`** — an array of 1,248 player objects. Each has:
  ```json
  {
    "player_id": 973, "team_id": 35, "fifa_code": "CPV",
    "name": "Vozinha", "position": "GK", "is_goalkeeper": true,
    "club_name": "Chaves", "ea_overall": 90,
    "aura_composite": 0.72, "rating_source": "...", "rating_confidence": "estimated",
    "shirt_number": 1
  }
  ```
- `ea_overall` is THE rating used everywhere (draft, team OVR, sim, the Higher/Lower
  quiz, Chemistry). `rating_confidence` is `"estimated"` (needs fixing) or
  `"preserved"` (leave those unless clearly wrong).
- **Audit tool:** `node scripts/audit-ratings.mjs --list` prints the flagged
  players (estimated + rated 85+). Run it first, and again at the end to watch the
  "estimated" count drop.

## What to change (and what NOT to)

For each player you correct:
- Set `ea_overall` to the verified EA FC 26 overall (integer, 40–99).
- Set `rating_source` to the source, e.g. `"EA FC 26 (sofifa.com)"` or
  `"EA FC 26 (futbin.com)"`.
- Set `rating_confidence` to `"verified"`.

Do **NOT** touch any other field (`player_id`, `name`, `club_name`, `position`,
`aura_composite`, `shirt_number`, `team_id`). Do NOT reformat the file — edit
values in place so the diff stays small and reviewable. Keep it valid JSON.

## Priority order (work top-down; you don't have to finish all 1,248)

1. **The 85+ band first** — run the audit; verify every estimated player rated 85+
   (~58 of them). These are the most visible (elite tier + the Higher/Lower quiz).
2. **Then 80–84**, then down. Aim for at least the **top ~250 players** by rating;
   note where you stopped.
3. Spot-check the "preserved" 210 too — if any are obviously wrong, fix them.

## How to verify each rating

Web-search **"EA FC 26 <player name> rating"** and prefer a reliable DB
(**sofifa.com**, **futbin.com**, or EA's official player database). Use the
**EA FC 26** number (released Sept 2025), not FC 25 or older. If sources
disagree by 1–2, pick the majority/most-recent; if a player genuinely isn't in
EA FC 26, leave the estimate and note it.

Sanity anchors already confirmed correct: Mbappé 91, Haaland 91, Bellingham 90,
Vinícius 90, Rodri 91, Kane 90, Salah 91, Ødegaard **should be ~88** (currently
wrongly 80). Known inflations to fix downward: Nico O'Reilly (88→~72), James
Trafford (88→~79), Zaïre-Emery (88→~82), Doué (88→~83), Barcola (88→~84),
plus the Atlético/PSG/Barça squad clusters at 86–88.

## Workflow

1. `git fetch origin main && git checkout -B fix/ea-ratings origin/main`
2. Run `node scripts/audit-ratings.mjs --list` — copy the list, it's your worklist.
3. Batch the work (e.g. 20–30 players at a time): verify → edit `ea_overall` +
   `rating_source` + `rating_confidence` in `players.json`.
4. After each batch: `node scripts/validate-data.mjs` (must pass) and
   `node scripts/audit-ratings.mjs` (estimated count should fall). Commit the batch
   with a clear message (e.g. `data: verify EA FC 26 ratings — England + France`).
5. Keep a changelog at **`data-quality/rating-corrections.md`**: a table of
   `name · old → new · source`.
6. When done (or at your stop point): `npm run build` and `npm test` must pass.
   Open a PR to `main` summarising how many ratings were verified, which tiers,
   and what remains.

## Guardrails

- Never fabricate a rating — sourced only.
- Don't change the JSON structure or key order; only values.
- Keep every `ea_overall` an integer in 40–99.
- The Live Ratings boosts (`src/game8/liveRatings.ts`) are deltas keyed by
  `player_id` on top of `ea_overall` — you don't need to touch them; corrected
  base ratings just flow through.
- If unsure about a player, leave them `"estimated"` rather than guess.

## Definition of done

- The 85+ band (and ideally the top ~250) are `"verified"` against EA FC 26.
- `node scripts/audit-ratings.mjs` shows a much lower "estimated" count and no
  team carrying an implausible number of 85+ players.
- `npm run build` + `npm test` green; `data-quality/rating-corrections.md` written;
  PR opened.
