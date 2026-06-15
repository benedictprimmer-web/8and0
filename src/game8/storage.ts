import type { TournamentRun } from "./types";

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
  // De-duplicate by run id so re-saving the same run (e.g. after an interactive
  // penalty shootout updates the result) replaces the earlier entry instead of
  // creating a duplicate.
  const others = loadHistory().filter((item) => item.id !== run.id);
  const history = sortRuns([run, ...others]).slice(0, 12);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

export function shareText(run: TournamentRun): string {
  const xi = run.picks.map((pick) => pick.player.name).join(", ");
  return `8-0 World Cup run: ${run.record} · ${run.grade} ${run.label} · ${Math.round(
    run.ratings.overall
  )} OVR · XI: ${xi}`;
}
