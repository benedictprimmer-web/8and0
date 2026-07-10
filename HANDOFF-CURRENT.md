# 8and0 — Current Session Handoff

_Snapshot for picking up work in a new chat. Last updated: 2026-07-10._

> ⚠️ **Multiple agents work on this repo in parallel.** PRs land fast. Before
> starting: `git checkout main && git pull`, then check open PRs so you don't
> collide with another branch. Keep PRs small and focused, branch off `main`,
> and never force-push someone else's branch.

## Start here

- **Full project context:** read [`README.md`](./README.md) — what the game is,
  file map, data flow, conventions. Say _"see README"_ and that's the context.
- **Deeper running log:** [`HANDOFF.md`](./HANDOFF.md) and [`ideas.md`](./ideas.md).
- **This repo is standalone:** `~/8and0` (GitHub `benedictprimmer-web/8and0`),
  separate from the World-Cup-Simulator repo — don't confuse the two.
- **Almost all game UI lives in** `src/pages/EightZeroGame.tsx`.

## The game in one line

Spin a slot machine of the 48 WC-2026 nations → draft a player into each slot →
simulate a tournament, chasing an **8-0** unbeaten run. Logic is 100% client-side;
the only server code is the Vercel leaderboard function (Upstash Redis).

## Shipped recently (all merged to `main`, 2026-07-09 → 07-10)

- **Phase 10 — Rating Fix + All-Time / Legends Mode** (see `PHASE10_BUILD_BRIEF.md`):
  - **Part A** — replaced inflated "estimated" ratings with real EA FC data.
  - **Part B** — real 2014/2018/2022 historical starting XIs + era-accurate team strength.
  - **Part C** — Last Dance expanded to **27 curated legends**.
  - **Part D1** — single-era draft mode (pick 2014/2018/2022/2026).
  - **Part D2** — **Dream Team** cross-era all-time draft (pools all eras + legends).
- **#69 chemistry v2** — Club Chemistry extended: legends count double, career-club
  links at half weight, `clubKey()` normaliser (also fixed a latent cross-era bug).
- **Pixel celebrations** — full-screen pixel-art goal/draft takeover, manifest-driven
  (`public/celebrations/celebrations.json` → `CelebrationClip.tsx`). Shipped: **#66**
  Mbappé (spike) + **#67** Messi. Adding a legend = 2 asset files + 1 JSON line.
- **#65 retro boutique skin** — self-hosted Silkscreen pixel font, pixel icons,
  teal state pills, faint CRT scanline/vignette overlay.
- **#62 / #63** — theme recolours: **Midnight Brass** (dark) + **Cream Console**
  (light), per-scheme `theme-color`.
- **Ball-knowledge quiz** (Higher or Lower) + `scripts/audit-ratings.mjs` rating audit tool.

## In flight (open PRs)

- **#68 — Cristiano Ronaldo pixel celebration** (`feat/celebration-196`).
  Data-only (`196.webm` / `196.png` / manifest line), no code changes. All checks
  green (`validate:data`, `lint`, 87 tests, `build`). Awaiting merge.

## Queued / not yet started

- **More legend celebrations** — the manifest scales to any `player_id`; pick which
  legends get clips next (asset pipeline in `docs/celebrations-handoff.md`).
- **Celebration sound** — clips are currently silent (visual-only was a locked call).
- **Share card (#8)** — generated shareable result image (XI + result + score).
  Biggest virality lever; `ResultPanel` currently only does text-to-clipboard share.

## Gotchas / how to verify

- **No visual browser preview for this repo** — verify with the build/test gates,
  and tell the user you couldn't capture a screenshot and why.
- Verify with: `npm run build` (full `tsc` for app + `api/`), `npm run lint`
  (max-warnings 0), `npm test` (vitest), `npm run validate:data`, and a dev smoke
  test (`npm run dev -- --port 5180 --strictPort` then `curl localhost:5180`).
- Keep the simulation **deterministic** — seeded RNG only, no `Math.random()` in
  the sim path. Celebrations/skins are presentational and must not touch sim/seed/penalties.

## Workflow notes

- Branch off `main`, one focused change per PR.
- End commit messages with the Co-Authored-By trailer; end PR bodies with the
  Claude Code generated-with line.
- Parallel work means occasional trivial merge conflicts in `EightZeroGame.tsx` —
  usually "keep both" adjacencies.
