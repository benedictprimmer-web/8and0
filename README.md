# 8and0

Standalone 8-0 World Cup draft game for `8and0.app`.

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
```

Vercel settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Global leaderboard

Finished runs are always saved locally (`localStorage`). At the end of a run you
can optionally enter a name to submit to the **global leaderboard** at
`/leaderboard`.

This is backed by a Vercel Serverless Function (`api/leaderboard.ts`) and
Upstash Redis. Copy `.env.example` to `.env.local` and fill in your Upstash
credentials (set the same vars in the Vercel project settings for production):

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Run the function locally with the Vercel CLI so `/api` is served:

```bash
npm i -g vercel
vercel dev
```

Notes:

- The global board only works against the live function (`vercel dev` or a
  deployment). Plain `vite dev` has no `/api`, so submission fails gracefully and
  the run is still saved locally.
- Submissions are idempotent per run (keyed by the run seed), so re-submitting to
  fix a name overwrites rather than duplicating.
- Only the player's name, team strength (OVR) and top scorer are shown publicly.
- Names are filtered for profanity and length before being accepted.

### Type-checking & CI

- `npm run build` runs `tsc` (app) **and** `tsc -p tsconfig.api.json` (the `/api`
  functions) before `vite build`, so serverless code is type-checked too.
- `npm run lint` works again (see `.eslintrc.cjs`).

## Odds report

`node scripts/odds-report.mjs [iterations]` prints stage-reach probabilities that
mirror the live `src/game8/simulate.ts` engine. (The older `batch-simulate.mjs`
has drifted from the game and is kept only for historical reference.)
