import type { TournamentRun } from "./types";

export const HISTORY_KEY = "eightZero:history:v1";

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
  const history = sortRuns([run, ...loadHistory()]).slice(0, 12);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

export function shareText(run: TournamentRun): string {
  const xi = run.picks.map((pick) => pick.player.name).join(", ");
  return `8-0 World Cup run: ${run.record} · ${run.grade} ${run.label} · ${Math.round(
    run.ratings.overall
  )} OVR · XI: ${xi}`;
}
