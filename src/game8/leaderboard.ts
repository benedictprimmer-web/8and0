import type { DraftDifficulty, TournamentRun } from "./types";
// NOTE: .js extension is required — the Vercel serverless function runs this as
// native ESM (see api/_upstash.ts / PR #32). Extensionless would crash at load.
import { calculateRunScore } from "./scoring.js";
import { CHEMISTRY_CAP, chemistryBonus } from "./chemistry.js";

// ── Shared leaderboard types ─────────────────────────────────────────────────
// This module is intentionally free of any browser/DOM or Node-only APIs so it
// can be imported by BOTH the React client (src/) and the Vercel serverless
// function (api/). Keep it pure.

export interface TopScorer {
  name: string;
  goals: number;
}

/** Payload sent from the client when a player opts in to the global board. */
export interface LeaderboardSubmission {
  name: string;
  score: number;
  stageReached: string;
  record: string;
  wins: number;
  draws: number;
  losses: number;
  /** Team overall rating — already includes the chemistry bonus below. */
  overall: number;
  /** Club-chemistry bonus baked into `overall` (0–3), surfaced for display. */
  chemistry: number;
  difficulty: string;
  formationId: string;
  formationLabel: string;
  blindMode: boolean;
  topScorer: TopScorer | null;
  xi: string[];
  seed: string;
  createdAt: string;
}

/** A stored / returned global leaderboard row (submission + server id). */
export interface LeaderboardEntry extends Omit<LeaderboardSubmission, "seed"> {
  id: string;
  // The run seed is the server-side idempotency key but is NEVER returned in
  // public GET responses — publishing it would let anyone overwrite another
  // player's row (the entry is keyed by a hash of this seed). Present only on
  // the owner's own submit response, if at all.
  seed?: string;
}

export const NAME_MAX_LENGTH = 20;
export const NAME_MIN_LENGTH = 2;

// ── Profanity filtering ──────────────────────────────────────────────────────

// Core list of disallowed roots. Matching is done against a normalised form of
// the name (lowercased, leet-speak folded, non-alphanumerics stripped) so common
// obfuscations like "sh1t", "f@ck", "a$$" are still caught. This is a casual
// filter, not a guarantee — it favours blocking over false negatives.
const PROFANITY_ROOTS = [
  "anal",
  "anus",
  "arse",
  "ass",
  "asshole",
  "bastard",
  "bitch",
  "bollock",
  "boner",
  "boob",
  "bugger",
  "cock",
  "coon",
  "crap",
  "cum",
  "cunt",
  "dick",
  "dildo",
  "dyke",
  "fag",
  "faggot",
  "fuck",
  "fuk",
  "gook",
  "handjob",
  "hoe",
  "jerk off",
  "jizz",
  "kike",
  "knob",
  "kunt",
  "nazi",
  "nigga",
  "nigger",
  "paki",
  "penis",
  "piss",
  "prick",
  "pussy",
  "queer",
  "rape",
  "retard",
  "schlong",
  "scrotum",
  "semen",
  "sex",
  "shit",
  "slut",
  "spastic",
  "spic",
  "tit",
  "tosser",
  "twat",
  "vagina",
  "wank",
  "whore",
].map((word) => word.replace(/[^a-z0-9]/g, ""));

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
};

/** Fold a string into a comparable form for profanity matching. */
export function normaliseForProfanity(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => LEET_MAP[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

export function containsProfanity(value: string): boolean {
  const normalised = normaliseForProfanity(value);
  if (!normalised) return false;
  return PROFANITY_ROOTS.some((root) => root.length > 0 && normalised.includes(root));
}

// ── Name validation / sanitisation ───────────────────────────────────────────

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: string };

/**
 * Clean and validate a player-entered display name.
 * - trims & collapses whitespace
 * - strips control characters
 * - enforces length bounds
 * - rejects profanity
 */
export function cleanName(raw: string): NameCheck {
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u001f\u007f]/g, " ");
  const name = stripped.replace(/\s+/g, " ").trim();

  if (name.length < NAME_MIN_LENGTH) {
    return { ok: false, reason: `Name must be at least ${NAME_MIN_LENGTH} characters.` };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, reason: `Name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }
  if (containsProfanity(name)) {
    return { ok: false, reason: "Please choose a name without profanity." };
  }
  return { ok: true, name };
}

// ── Submission building ──────────────────────────────────────────────────────

/** Returns the top scorer for a run, or null if nobody scored. */
export function topScorerOf(run: Pick<TournamentRun, "goalScorers">): TopScorer | null {
  let best: TopScorer | null = null;
  for (const [name, goals] of Object.entries(run.goalScorers ?? {})) {
    if (goals <= 0) continue;
    if (!best || goals > best.goals) {
      best = { name, goals };
    }
  }
  return best;
}

/**
 * The metric for the "Best teams" board: how good the drafted XI is, regardless
 * of how the tournament went. It's simply the team's overall rating, which
 * already folds in the club-chemistry bonus (see ratings.ts) — so it rewards
 * both star power and squad cohesion, and matches the OVR the player watches
 * tick up while drafting. Kept as a named helper so the client and the server
 * rank on the exact same value.
 */
export function teamScoreOf(submission: Pick<LeaderboardSubmission, "overall">): number {
  return Math.round(submission.overall * 10) / 10;
}

export type SubmissionResult =
  | { ok: true; submission: LeaderboardSubmission }
  | { ok: false; reason: string };

/** Build a validated global-leaderboard submission from a finished run. */
export function buildSubmission(run: TournamentRun, rawName: string): SubmissionResult {
  const check = cleanName(rawName);
  if (!check.ok) return check;

  const submission: LeaderboardSubmission = {
    name: check.name,
    score: Math.max(0, Math.round(run.score)),
    stageReached: run.stageReached,
    record: run.record,
    wins: run.wins,
    draws: run.draws,
    losses: run.losses,
    overall: Math.round(run.ratings.overall * 10) / 10,
    chemistry: Math.round(chemistryBonus(run.picks, run.chemistry) * 10) / 10,
    difficulty: run.difficulty,
    formationId: run.formationId,
    formationLabel: run.formationLabel,
    blindMode: run.blindMode,
    topScorer: topScorerOf(run),
    xi: run.picks.map((pick) => pick.player.name),
    seed: run.seed,
    createdAt: run.createdAt,
  };
  return { ok: true, submission };
}

// ── Server-side validation (mirror, used by the API before persisting) ───────

const STAGES = new Set([
  "Group stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
  "Champion",
]);

/**
 * Validate & normalise an untrusted submission payload on the server.
 * Casual anti-cheat: clamp numeric ranges, re-validate the name, cap array sizes.
 */
export function sanitiseSubmission(input: unknown): SubmissionResult {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Invalid submission body." };
  }
  const body = input as Record<string, unknown>;

  const nameCheck = cleanName(typeof body.name === "string" ? body.name : "");
  if (!nameCheck.ok) return nameCheck;

  const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clampInt = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.round(value)));

  const stageReached = STAGES.has(String(body.stageReached))
    ? String(body.stageReached)
    : "Group stage";

  const xiRaw = Array.isArray(body.xi) ? body.xi : [];
  const xi = xiRaw
    .slice(0, 11)
    .map((entry) => String(entry).slice(0, 40));

  let topScorer: TopScorer | null = null;
  if (body.topScorer && typeof body.topScorer === "object") {
    const ts = body.topScorer as Record<string, unknown>;
    if (typeof ts.name === "string") {
      topScorer = { name: ts.name.slice(0, 40), goals: clampInt(num(ts.goals), 0, 50) };
    }
  }

  const submission: LeaderboardSubmission = {
    name: nameCheck.name,
    score: clampInt(num(body.score), 0, 1000),
    stageReached,
    record: String(body.record ?? "").slice(0, 16),
    wins: clampInt(num(body.wins), 0, 8),
    draws: clampInt(num(body.draws), 0, 8),
    losses: clampInt(num(body.losses), 0, 8),
    overall: Math.max(0, Math.min(120, Math.round(num(body.overall) * 10) / 10)),
    chemistry: Math.max(0, Math.min(CHEMISTRY_CAP, Math.round(num(body.chemistry) * 10) / 10)),
    difficulty: ["easy", "normal", "hard"].includes(String(body.difficulty))
      ? String(body.difficulty)
      : "normal",
    formationId: String(body.formationId ?? "").slice(0, 12),
    formationLabel: String(body.formationLabel ?? "").slice(0, 16),
    blindMode: Boolean(body.blindMode),
    topScorer,
    xi,
    seed: String(body.seed ?? "").slice(0, 80),
    createdAt:
      typeof body.createdAt === "string" ? body.createdAt.slice(0, 40) : new Date().toISOString(),
  };

  // Anti-cheat: the score is NOT trusted from the client. Recompute it from the
  // (already-clamped) run summary using the same formula the game uses, and
  // overwrite. A forged score (e.g. POST score=1000 with a losing record) is
  // simply replaced by the real value, so the worst a tampered payload can do is
  // claim the score its own summary legitimately earns — never an arbitrary one.
  submission.score = calculateRunScore({
    wins: submission.wins,
    draws: submission.draws,
    losses: submission.losses,
    stageReached: submission.stageReached,
    rating: submission.overall,
    difficulty: submission.difficulty as DraftDifficulty,
    blindMode: submission.blindMode,
  });

  return { ok: true, submission };
}
