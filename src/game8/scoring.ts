import type { DraftDifficulty } from "./types";

// ── Run scoring ──────────────────────────────────────────────────────────────
// Pure, dependency-free scoring used by BOTH the client simulation (simulate.ts)
// and the server-side leaderboard validation (api/leaderboard.ts via
// leaderboard.ts). Keep it free of any browser/Node-only APIs and of any
// runtime relative import other than this type-only one, so it bundles cleanly
// into the Vercel serverless function as native ESM.

export const STAGE_BONUS: Record<string, number> = {
  "Group stage": 0,
  "Round of 32": 2,
  "Round of 16": 4,
  "Quarter-final": 6,
  "Semi-final": 8,
  Final: 10,
  Champion: 14,
};

export const DIFFICULTY_BONUS: Record<DraftDifficulty, number> = {
  easy: 0,
  normal: 3,
  hard: 7,
};

/**
 * The single source of truth for a run's score. Given a run summary it returns
 * the score deterministically — so the server can recompute it from a submitted
 * summary and reject/overwrite any client-forged value.
 */
export function calculateRunScore(args: {
  wins: number;
  draws: number;
  losses: number;
  stageReached: string;
  rating: number;
  difficulty: DraftDifficulty;
  blindMode: boolean;
}): number {
  const ratingBonus = Math.max(0, Math.round((args.rating - 68) / 4));
  const raw =
    args.wins * 5 +
    args.draws * 2 -
    args.losses +
    (STAGE_BONUS[args.stageReached] ?? 0) +
    DIFFICULTY_BONUS[args.difficulty] +
    (args.blindMode ? 2 : 0) +
    ratingBonus;
  return Math.max(0, raw);
}
