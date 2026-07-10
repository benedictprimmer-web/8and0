import type { TournamentRun } from "./types";
import { chemistryBonus } from "./chemistry";
import { topScorerOf, type TopScorer } from "./leaderboard";

export const HISTORY_KEY = "eightZero:history:v1";
export const PLAYER_NAME_KEY = "eightZero:playerName";

export function loadPlayerName(): string {
  try {
    return window.localStorage.getItem(PLAYER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function savePlayerName(name: string): void {
  try {
    window.localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

export const MY_ENTRIES_KEY = "eightZero:myGlobalEntries:v1";
const MY_ENTRIES_LIMIT = 50;

export interface MyGlobalEntry {
  seed: string;
  score: number;
  name: string;
}

/** Seeds of runs this device has submitted to the global board. */
export function loadMyGlobalEntries(): MyGlobalEntry[] {
  try {
    const raw = window.localStorage.getItem(MY_ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MyGlobalEntry[]) : [];
  } catch {
    return [];
  }
}

/** Record (or update) a submitted run, de-duplicated by seed, best-first. */
export function addMyGlobalEntry(entry: MyGlobalEntry): void {
  try {
    const existing = loadMyGlobalEntries().filter((item) => item.seed !== entry.seed);
    const next = [entry, ...existing]
      .sort((a, b) => b.score - a.score)
      .slice(0, MY_ENTRIES_LIMIT);
    window.localStorage.setItem(MY_ENTRIES_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function scoreRun(run: TournamentRun): number {
  const stageRank: Record<string, number> = {
    "Group stage": 0,
    "Round of 32": 1,
    "Round of 16": 2,
    "Quarter-final": 3,
    "Semi-final": 4,
    Final: 5,
    Champion: 6,
  };
  const difficultyRank = run.difficulty === "hard" ? 2 : run.difficulty === "normal" ? 1 : 0;
  return (
    (run.score ?? 0) * 10000 +
    (stageRank[run.stageReached] ?? 0) * 1000 +
    run.wins * 100 -
    run.losses * 10 +
    difficultyRank * 5 +
    run.ratings.overall
  );
}

export function sortRuns(runs: TournamentRun[]): TournamentRun[] {
  return [...runs].sort((a, b) => scoreRun(b) - scoreRun(a));
}

export function loadHistory(): TournamentRun[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortRuns(parsed as TournamentRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(run: TournamentRun): TournamentRun[] {
  // Also record it in the permanent, complete run log (every run ever played,
  // with its timestamp). The detailed history below stays capped for the rich
  // results view; the log is the full record.
  logRun(run);

  // De-duplicate by run id so re-saving the same run (e.g. after an interactive
  // penalty shootout updates the result) replaces the earlier entry instead of
  // creating a duplicate.
  const others = loadHistory().filter((item) => item.id !== run.id);
  const history = sortRuns([run, ...others]).slice(0, 12);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

// ── Complete run log ─────────────────────────────────────────────────────────
// A permanent, append-only record of EVERY run this device has played, with the
// time it happened. Unlike `history` (top 12 by score, full detail) this keeps a
// slim ~1 KB summary per run so thousands fit comfortably under the localStorage
// quota. Newest-first, de-duplicated by run id.

export const RUN_LOG_KEY = "eightZero:runLog:v1";
// Generous safety cap so the log can never blow the ~5 MB localStorage quota.
// At ~1 KB/entry this is ~2 MB; far more runs than anyone will realistically play.
const RUN_LOG_LIMIT = 2000;

export interface RunLogEntry {
  id: string;
  seed: string;
  /** ISO timestamp of when the run was played. */
  createdAt: string;
  score: number;
  stageReached: string;
  record: string;
  wins: number;
  draws: number;
  losses: number;
  overall: number;
  chemistry: number;
  difficulty: string;
  era: string;
  draftMode: string;
  legendMode: string;
  blindMode: boolean;
  formationId: string;
  formationLabel: string;
  topScorer: TopScorer | null;
  xi: string[];
}

/** Project a full run down to the slim, permanent log shape. Pure. */
export function toRunLogEntry(run: TournamentRun): RunLogEntry {
  return {
    id: run.id,
    seed: run.seed,
    createdAt: run.createdAt,
    score: Math.max(0, Math.round(run.score)),
    stageReached: run.stageReached,
    record: run.record,
    wins: run.wins,
    draws: run.draws,
    losses: run.losses,
    overall: Math.round(run.ratings.overall * 10) / 10,
    chemistry: Math.round(chemistryBonus(run.picks, run.chemistry) * 10) / 10,
    difficulty: run.difficulty,
    era: String(run.era),
    draftMode: run.draftMode,
    legendMode: run.legendMode,
    blindMode: run.blindMode,
    formationId: run.formationId,
    formationLabel: run.formationLabel,
    topScorer: topScorerOf(run),
    xi: run.picks.map((pick) => pick.player.name),
  };
}

/** All runs this device has played, newest-first. */
export function loadRunLog(): RunLogEntry[] {
  try {
    const raw = window.localStorage.getItem(RUN_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RunLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Append (or update, by id) a completed run in the permanent log. Newest-first. */
export function logRun(run: TournamentRun): RunLogEntry[] {
  try {
    const entry = toRunLogEntry(run);
    const others = loadRunLog().filter((item) => item.id !== entry.id);
    const next = [entry, ...others].slice(0, RUN_LOG_LIMIT);
    window.localStorage.setItem(RUN_LOG_KEY, JSON.stringify(next));
    return next;
  } catch {
    // ignore storage failures (private mode, quota, etc.)
    return loadRunLog();
  }
}

export function shareText(run: TournamentRun): string {
  const xi = run.picks.map((pick) => pick.player.name).join(", ");
  return `8-0 World Cup run: ${run.record} · ${run.grade} ${run.label} · ${Math.round(
    run.ratings.overall
  )} OVR · XI: ${xi}`;
}
