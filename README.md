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
Upstash Redis. Set these environment variables in Vercel (and `.env.local` for
local dev):

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Notes:

- The global board only works against the live function (`vercel dev` or a
  deployment). Plain `vite dev` has no `/api`, so submission fails gracefully and
  the run is still saved locally.
- Only the player's name, team strength (OVR) and top scorer are shown publicly.
- Names are filtered for profanity and length before being accepted.

## Odds report

`node scripts/odds-report.mjs [iterations]` prints stage-reach probabilities that
mirror the live `src/game8/simulate.ts` engine. (The older `batch-simulate.mjs`
has drifted from the game and is kept only for historical reference.)
