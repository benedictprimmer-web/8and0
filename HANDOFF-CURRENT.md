# 8and0 — Current Session Handoff

_Snapshot for picking up work in a new chat. Last updated: 2026-06-15._

> ⚠️ **Multiple agents are working on this repo in parallel.** Several PRs are in
> flight at once. Before starting: `git checkout main && git pull`, then check
> `gh pr list` so you don't collide with another agent's branch. Keep PRs small
> and focused, branch off `main`, and never force-push someone else's branch.

## Start here

- **Full project context:** read [`README.md`](./README.md) (the "see README" doc:
  what the game is, file map, data flow, conventions).
- **This repo is standalone:** `~/8and0` (GitHub `benedictprimmer-web/8and0`),
  separate from the World-Cup-Simulator repo. Don't confuse the two.
- **Almost all game UI lives in** `src/pages/EightZeroGame.tsx`.

## Boundaries (do not touch)

- **`src/components/PenaltyShootout.tsx`** — penalties are actively being worked
  on by someone else. Leave it alone unless the task is explicitly penalties.
- **Other agents' open PR branches** — see `gh pr list`. As of this writing the
  open one is **#43 `feat/leaderboard-team-detail`** (not ours).

## Merged this session (all on `main`)

- **#37** `feat/see-my-team-sheet` — floating "My team N/11" button → slide-up
  bottom sheet showing your XI (ratings + pitch). Mobile + desktop; Escape /
  backdrop close; body-scroll lock; blind ratings stay hidden in hard mode.
- **#39** `feat/setup-ui-polish` — removed dead "Home" button; real hero tagline
  (replaced `#Russel=Mogged`); blind-mode toggle disabled+explained on Hard;
  removed the dev version stamp from the in-game header; sticky "Start draft"
  CTA on mobile; formation shape dot-glyphs; "Last Dance" + "Practice Penalties"
  moved into their own "Modes" section.
- **#42** `feat/results-and-contrast` — "Tournament summary" card on the results
  screen (GF/GA/GD, clean sheets, pens won, played, top scorer, biggest win);
  lightened global `.section-label` colour for contrast (`#4b5563 → #8a93a6`);
  `role="dialog"`/`aria-modal`/`aria-label` on the two modals + backdrop close.

## Queued / not yet started

From the UI/UX review, agreed but **not built yet**:

1. **Share card (#8)** — a generated shareable result image/card (XI + result +
   score). Biggest virality lever. Its own focused PR. `ResultPanel` currently
   only does text-to-clipboard share.
2. **Spin juice / pop-ups / win celebration** — the "addictiveness" phase:
   - Slot-machine spin feel + landing snap/flash (engine is `animateSpin()` in
     `EightZeroGame.tsx`).
   - Goal / +points pop-ups (there's a `goalPop` keyframe in `index.css` to build on).
   - Full-screen confetti celebration. **Decisions already locked with the user:**
     **visual only — NO sound**, and celebration fires on **every knockout win +
     the final result**. Trigger it at the match/run level in `EightZeroGame`,
     **not** inside `PenaltyShootout.tsx`.

Explicitly **declined / skipped:** card-style unification (#10) — user is fine
with the current mix of card styles.

## Gotchas / how to verify

- **Browser preview doesn't work for this repo.** The `mcp__Claude_Preview` tool
  is sandboxed to the World-Cup-Simulator project root and refuses a `cwd` in
  `~/8and0`. So you can't screenshot the running app via that tool.
- **Verify instead with:** `npm run build` (runs full `tsc` for app + `api/`),
  `npm run lint` (max-warnings 0), `npm test` (vitest), and a dev-server smoke
  test: `npm run dev -- --port 5180 --strictPort` then `curl localhost:5180`.
  Tell the user you couldn't capture a visual screenshot and why.
- Keep the simulation **deterministic** — seeded RNG only, no `Math.random()` in
  the sim path. Tests must pass before commit; build must succeed.

## Workflow notes

- Branch off `main`, one focused change per PR, open with `gh pr create`.
- End commit messages with the Co-Authored-By trailer; end PR bodies with the
  Claude Code generated-with line.
- Because work is parallel, expect occasional merge conflicts when your PR sits
  open — they're usually trivial "keep both" adjacencies in `EightZeroGame.tsx`.
