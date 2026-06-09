import { getFormation } from "./formations";
import { clamp, poisson, seededRandom } from "./random";
import { gradeRun } from "./ratings";
import type {
  DraftDifficulty,
  DraftMode,
  DraftPick,
  EightZeroTeam,
  MatchEvent,
  MatchResult,
  TeamRatings,
  TournamentRun,
} from "./types";

const GROUP_STAGES = ["Group match 1", "Group match 2", "Group match 3"];
const KNOCKOUT_STAGES = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];

function normalizeOpponentStrength(team: EightZeroTeam, teams: EightZeroTeam[]): number {
  const elos = teams.map((candidate) => candidate.elo);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const normalized = (team.elo - min) / Math.max(1, max - min);
  return 70 + normalized * 22;
}

function pickOpponent(teams: EightZeroTeam[], seed: string, excludeIds: Set<number>): EightZeroTeam {
  const pool = teams.filter((team) => !excludeIds.has(team.teamId));
  if (pool.length === 0) {
    throw new Error("No opponents available");
  }
  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => b.elo - a.elo);
  const index = Math.floor(Math.pow(random(), 1.3) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}

const STAGE_PRESSURE: Record<string, number> = {
  "Group match 1": 1.0,
  "Group match 2": 1.0,
  "Group match 3": 1.0,
  "Round of 32": 1.03,
  "Round of 16": 1.06,
  "Quarter-final": 1.10,
  "Semi-final": 1.15,
  Final: 1.20,
};

function scoreMatch(
  stage: string,
  opponent: EightZeroTeam,
  ratings: TeamRatings,
  teams: EightZeroTeam[],
  seed: string,
  knockout: boolean
): MatchResult {
  const random = seededRandom(seed);
  const opponentStrength = normalizeOpponentStrength(opponent, teams);
  const ratingEdge = ratings.overall - opponentStrength;
  const attackEdge = (ratings.attack + ratings.midfield) / 2 - opponentStrength;
  const defenceEdge = (ratings.defence + ratings.gk) / 2 - opponentStrength;
  const pressure = STAGE_PRESSURE[stage] ?? 1.0;
  const userLambda = clamp(1.18 + ratingEdge * 0.020 + attackEdge * 0.013, 0.22, 3.5);
  const opponentLambda = clamp((1.18 - ratingEdge * 0.016 - defenceEdge * 0.011) * pressure, 0.2, 3.4);
  let userGoals = poisson(userLambda, random);
  let opponentGoals = poisson(opponentLambda, random);
  let decidedByPens = false;

  if (knockout && userGoals === opponentGoals) {
    decidedByPens = true;
    const edge = clamp(0.48 + ratingEdge * 0.010, 0.18, 0.75);
    if (random() <= edge) {
      userGoals += 1;
    } else {
      opponentGoals += 1;
    }
  }

  const result = userGoals > opponentGoals ? "W" : userGoals < opponentGoals ? "L" : "D";
  return { stage, opponent, userGoals, opponentGoals, result, decidedByPens };
}

function recordLabel(wins: number, draws: number, losses: number): string {
  return `${wins}-${draws}-${losses}`;
}

const STAGE_BONUS: Record<string, number> = {
  "Group stage": 0,
  "Round of 32": 2,
  "Round of 16": 4,
  "Quarter-final": 6,
  "Semi-final": 8,
  Final: 10,
  Champion: 14,
};

const DIFFICULTY_BONUS: Record<DraftDifficulty, number> = {
  easy: 0,
  normal: 3,
  hard: 7,
};

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

export function simulateTournamentRun(args: {
  teams: EightZeroTeam[];
  picks: DraftPick[];
  ratings: TeamRatings;
  seed: string;
  formationId: string;
  difficulty?: DraftDifficulty;
  blindMode?: boolean;
  draftMode?: DraftMode;
}): TournamentRun {
  const excludeIds = new Set(args.picks.map((pick) => pick.player.teamId));
  const matches: MatchResult[] = [];
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let stageReached = "Group stage";
  let groupPoints = 0;

  for (let index = 0; index < GROUP_STAGES.length; index += 1) {
    const stage = GROUP_STAGES[index];
    const opponent = pickOpponent(args.teams, `${args.seed}:group:${index}`, excludeIds);
    excludeIds.add(opponent.teamId);
    const result = scoreMatch(stage, opponent, args.ratings, args.teams, `${args.seed}:${stage}`, false);
    matches.push(result);
    if (result.result === "W") {
      wins += 1;
      groupPoints += 3;
    } else if (result.result === "D") {
      draws += 1;
      groupPoints += 1;
    } else {
      losses += 1;
    }
  }

  if (groupPoints < 4) {
    stageReached = "Group stage";
  } else {
    for (let index = 0; index < KNOCKOUT_STAGES.length; index += 1) {
      const stage = KNOCKOUT_STAGES[index];
      const opponent = pickOpponent(args.teams, `${args.seed}:knockout:${index}`, excludeIds);
      excludeIds.add(opponent.teamId);
      const result = scoreMatch(stage, opponent, args.ratings, args.teams, `${args.seed}:${stage}`, true);
      matches.push(result);
      if (result.result === "W") {
        wins += 1;
        stageReached = stage === "Final" ? "Champion" : stage;
      } else {
        losses += 1;
        stageReached = stage;
        break;
      }
    }
  }

  const verdict = gradeRun(wins, draws, losses, args.ratings.overall);
  const formation = getFormation(args.formationId);
  const difficulty = args.difficulty ?? "normal";
  const blindMode = args.blindMode ?? false;
  const draftMode = args.draftMode ?? "squad-first";
  const score = calculateRunScore({
    wins,
    draws,
    losses,
    stageReached,
    rating: args.ratings.overall,
    difficulty,
    blindMode,
  });

  return {
    id: `${args.seed}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    seed: args.seed,
    formationId: formation.id,
    formationLabel: formation.label,
    difficulty,
    blindMode,
    draftMode,
    score,
    record: recordLabel(wins, draws, losses),
    wins,
    draws,
    losses,
    stageReached,
    grade: verdict.grade,
    label: verdict.label,
    ratings: args.ratings,
    picks: args.picks,
    matches,
  };
}

export function distributeGoalMinutes(totalGoals: number, random: () => number): number[] {
  if (totalGoals <= 0) return [];
  const times = Array.from({ length: totalGoals }, () => Math.floor(random() * 90) + 1);
  return times.sort((a, b) => a - b);
}

function pickScorer(picks: DraftPick[], random: () => number): string {
  const attackers = picks.filter((p) => p.category === "FWD" || p.category === "MID");
  const pool = attackers.length > 0 ? attackers : picks;
  const index = Math.floor(random() * pool.length);
  return pool[index]?.player.name ?? "Unknown";
}

export function buildMatchEvents(
  result: MatchResult,
  picks: DraftPick[],
  seed: string
): MatchEvent[] {
  const random = seededRandom(seed);
  const events: MatchEvent[] = [];

  events.push({ minute: 0, type: "kickoff", team: "user" });

  const userGoalMinutes = distributeGoalMinutes(result.userGoals, random);
  for (const minute of userGoalMinutes) {
    const playerName = pickScorer(picks, random);
    events.push({ minute, type: "goal", team: "user", playerName });
  }

  const oppGoalMinutes = distributeGoalMinutes(result.opponentGoals, random);
  for (const minute of oppGoalMinutes) {
    events.push({ minute, type: "goal", team: "opponent" });
  }

  events.push({ minute: 45, type: "halftime", team: "user" });
  events.push({ minute: 90, type: "fulltime", team: "user" });

  if (result.decidedByPens) {
    events.push({ minute: 91, type: "penalty_shootout", team: "user" });
  }

  return events.sort((a, b) => a.minute - b.minute);
}
