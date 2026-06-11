import { getFormation } from "./formations";
import { clamp, poisson, seededRandom } from "./random";
import { gradeRun } from "./ratings";
import type {
  DraftDifficulty,
  DraftMode,
  DraftPick,
  EightZeroTeam,
  LegendMode,
  MatchEvent,
  MatchResult,
  PenaltyKick,
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
  return 64 + normalized * 29;
}

function calculateOpponentGkRating(team: EightZeroTeam): number {
  // ELO typically ranges from ~1200 (weak) to ~2100 (strong)
  // GK rating: 60-92 scale based on ELO
  return clamp(60 + (team.elo - 1200) * 0.03, 58, 92);
}

const STAGE_EXPONENT: Record<string, number> = {
  "Group match": 0.5,
  "Round of 32": 3.5,
  "Round of 16": 0.3,
  "Quarter-final": 0.5,
  "Semi-final": 2.0,
  "Final": 2.0,
};

function getStageExponent(stage: string): number {
  const key = stage.startsWith("Group") ? "Group match" : stage;
  return STAGE_EXPONENT[key] ?? 1.0;
}

function pickOpponent(
  teams: EightZeroTeam[],
  seed: string,
  excludeIds: Set<number>,
  stage: string,
  userElo: number,
  legendMode: LegendMode
): EightZeroTeam {
  let pool = teams.filter((team) => !excludeIds.has(team.teamId));
  if (pool.length === 0) {
    throw new Error("No opponents available");
  }

  // Group stage balance: only pick from teams within ±1 tier of user
  if (stage.startsWith("Group")) {
    const userTier = Math.floor((userElo - 1400) / 100);
    const balanced = pool.filter((t) => Math.abs(Math.floor((t.elo - 1400) / 100) - userTier) <= 1);
    if (balanced.length > 0) pool = balanced;
  }

  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => a.elo - b.elo);

  let exponent = getStageExponent(stage);

  // Legend mode: easier opponents in early rounds (reduce exponent for earlier stages)
  if (legendMode !== "none") {
    const stageKey = stage.startsWith("Group") ? "Group match" : stage;
    if (stageKey === "Group match" || stageKey === "Round of 32" || stageKey === "Round of 16") {
      exponent = Math.max(0.3, exponent - 0.3);
    }
  }

  const index = Math.floor(Math.pow(random(), exponent) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}

const STAGE_PRESSURE: Record<string, number> = {
  "Group match 1": 1.0,
  "Group match 2": 1.0,
  "Group match 3": 1.0,
  "Round of 32": 1.00,
  "Round of 16": 1.30,
  "Quarter-final": 1.30,
  "Semi-final": 0.95,
  Final: 0.95,
};

function scoreMatch(
  stage: string,
  opponent: EightZeroTeam,
  ratings: TeamRatings,
  teams: EightZeroTeam[],
  seed: string,
  knockout: boolean,
  legendMode: LegendMode
): MatchResult {
  const random = seededRandom(seed);
  const opponentStrength = normalizeOpponentStrength(opponent, teams);
  const opponentGkRating = calculateOpponentGkRating(opponent);

  let ratingEdgeBonus = 0;
  // Aggressive bonuses for SF/Final to help high-rated teams close out
  if (stage === "Semi-final") {
    if (ratings.overall >= 88) ratingEdgeBonus = 2.0;
    else if (ratings.overall >= 84) ratingEdgeBonus = 1.2;
    else if (ratings.overall >= 80) ratingEdgeBonus = 0.6;
    else if (ratings.overall >= 76) ratingEdgeBonus = 0.2;
  }
  if (stage === "Final") {
    if (ratings.overall >= 88) ratingEdgeBonus = 1.2;
    else if (ratings.overall >= 84) ratingEdgeBonus = 0.8;
    else if (ratings.overall >= 80) ratingEdgeBonus = 0.4;
    else if (ratings.overall >= 76) ratingEdgeBonus = 0.2;
  }

  const ratingEdge = (ratings.overall - opponentStrength) + ratingEdgeBonus;
  const attackEdge = (ratings.attack + ratings.midfield) / 2 - opponentStrength;
  const defenceEdge = (ratings.defence + ratings.gk) / 2 - opponentStrength;
  let pressure = STAGE_PRESSURE[stage] ?? 1.0;

  // Legend mode: easier final stage
  if (legendMode !== "none" && stage === "Final") {
    pressure = Math.max(1.0, pressure - 0.05);
  }

  const userLambda = clamp(1.10 + ratingEdge * 0.032 + attackEdge * 0.018, 0.15, 4.0);
  const opponentLambda = clamp((1.45 - ratingEdge * 0.025 - defenceEdge * 0.018) * pressure, 0.20, 3.8);
  let userGoals = poisson(userLambda, random);
  let opponentGoals = poisson(opponentLambda, random);
  const regularTimeUserGoals = userGoals;
  const regularTimeOpponentGoals = opponentGoals;
  let decidedByPens = false;
  let extraTime = false;
  let penaltyShootout: PenaltyKick[] | undefined;

  if (knockout && userGoals === opponentGoals) {
    // Extra time
    extraTime = true;
    const etUserLambda = userLambda * 0.35;
    const etOppLambda = opponentLambda * 0.35;
    userGoals += poisson(etUserLambda, random);
    opponentGoals += poisson(etOppLambda, random);

    if (userGoals === opponentGoals) {
      // Penalties
      decidedByPens = true;
      penaltyShootout = simulatePenalties(ratings, opponent, random, legendMode);
      const userPenGoals = penaltyShootout.filter((k) => k.team === "user" && !k.saved).length;
      const oppPenGoals = penaltyShootout.filter((k) => k.team === "opponent" && !k.saved).length;
      if (userPenGoals > oppPenGoals) {
        userGoals += 1;
      } else if (oppPenGoals > userPenGoals) {
        opponentGoals += 1;
      } else {
        // Safety: if somehow tied, force a winner
        userGoals += 1;
      }
    }
  }

  const result = userGoals > opponentGoals ? "W" : userGoals < opponentGoals ? "L" : "D";
  return { stage, opponent, userGoals, opponentGoals, regularTimeUserGoals, regularTimeOpponentGoals, opponentGkRating, result, decidedByPens, extraTime, penaltyShootout };
}

function simulatePenalties(
  ratings: TeamRatings,
  opponent: EightZeroTeam,
  random: () => number,
  legendMode: LegendMode
): PenaltyKick[] {
  const kicks: PenaltyKick[] = [];
  let userPenRating = clamp(0.675 + (ratings.attack - 75) * 0.005, 0.45, 0.85);
  const oppPenRating = clamp(0.675 - (ratings.gk - 75) * 0.008, 0.35, 0.85);

  // Legend mode: harder to win on penalties
  if (legendMode !== "none") {
    userPenRating = Math.max(0.4, userPenRating - 0.05);
  }

  let userScored = 0;
  let oppScored = 0;
  let round = 1;

  // 5 rounds each
  for (let i = 0; i < 5; i++) {
    const userSaved = random() > userPenRating;
    kicks.push({ team: "user", scorer: "Player", saved: userSaved, round });
    if (!userSaved) userScored++;

    const oppSaved = random() > oppPenRating;
    kicks.push({ team: "opponent", scorer: opponent.name, saved: oppSaved, round });
    if (!oppSaved) oppScored++;

    // Check if decided early
    const remaining = 5 - i - 1;
    if (userScored > oppScored + remaining || oppScored > userScored + remaining) {
      break;
    }
    round++;
  }

  // Sudden death if still tied
  while (userScored === oppScored) {
    round++;
    const userSaved = random() > userPenRating;
    kicks.push({ team: "user", scorer: "Player", saved: userSaved, round });
    if (!userSaved) userScored++;

    const oppSaved = random() > oppPenRating;
    kicks.push({ team: "opponent", scorer: opponent.name, saved: oppSaved, round });
    if (!oppSaved) oppScored++;
  }

  return kicks;
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
  legendMode?: LegendMode;
}): TournamentRun {
  const excludeIds = new Set(args.picks.map((pick) => pick.player.teamId));
  const matches: MatchResult[] = [];
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let stageReached = "Group stage";
  let groupPoints = 0;
  const legendMode = args.legendMode ?? "none";
  const userElo = args.ratings.overall * 20 + 1000; // Approximate ELO from rating

  for (let index = 0; index < GROUP_STAGES.length; index += 1) {
    const stage = GROUP_STAGES[index];
    const opponent = pickOpponent(args.teams, `${args.seed}:group:${index}`, excludeIds, stage, userElo, legendMode);
    excludeIds.add(opponent.teamId);
    const result = scoreMatch(stage, opponent, args.ratings, args.teams, `${args.seed}:${stage}`, false, legendMode);
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

  if (groupPoints < 3) {
    stageReached = "Group stage";
  } else {
    for (let index = 0; index < KNOCKOUT_STAGES.length; index += 1) {
      const stage = KNOCKOUT_STAGES[index];
      const opponent = pickOpponent(args.teams, `${args.seed}:knockout:${index}`, excludeIds, stage, userElo, legendMode);
      excludeIds.add(opponent.teamId);
      const result = scoreMatch(stage, opponent, args.ratings, args.teams, `${args.seed}:${stage}`, true, legendMode);
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

  const goalScorers: Record<string, number> = {};
  const matchGoalScorers: Record<string, number>[] = [];
  for (const match of matches) {
    const { scorers } = buildMatchEvents(match, args.picks, `${args.seed}:events:${matches.indexOf(match)}`);
    matchGoalScorers.push(scorers);
    for (const [name, count] of Object.entries(scorers)) {
      goalScorers[name] = (goalScorers[name] ?? 0) + count;
    }
  }

  return {
    id: `${args.seed}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    seed: args.seed,
    formationId: formation.id,
    formationLabel: formation.label,
    difficulty,
    blindMode,
    draftMode,
    legendMode,
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
    goalScorers,
    matchGoalScorers,
  };
}

export function distributeGoalMinutes(totalGoals: number, random: () => number): number[] {
  if (totalGoals <= 0) return [];
  const times = Array.from({ length: totalGoals }, () => Math.floor(random() * 90) + 1);
  return times.sort((a, b) => a - b);
}

const NEAR_MISS_FLAVORS = [
  "draws it wide",
  "skies it over the bar",
  "hits the post!",
  "saved brilliantly!",
  "misses an open goal!",
  "blazes it over",
  "header just wide",
  "shot blocked at the last second",
];

function pickRandomPlayer(picks: DraftPick[], random: () => number): { name: string; rating: number } {
  const attackers = picks.filter((p) => p.category === "FWD" || p.category === "MID");
  const pool = attackers.length > 0 ? attackers : picks;
  const index = Math.floor(random() * pool.length);
  const player = pool[index];
  return { name: player?.player.name ?? "Unknown", rating: player?.player.rating ?? 0 };
}

export function buildMatchEvents(
  result: MatchResult,
  picks: DraftPick[],
  seed: string
): { events: MatchEvent[]; scorers: Record<string, number> } {
  const random = seededRandom(seed);
  const events: MatchEvent[] = [];
  const scorers: Record<string, number> = {};

  events.push({ minute: 0, type: "kickoff", team: "user" });

  const userGoalMinutes = distributeGoalMinutes(result.regularTimeUserGoals, random);
  for (const minute of userGoalMinutes) {
    const scorer = pickRandomPlayer(picks, random);
    events.push({ minute, type: "goal", team: "user", playerName: scorer.name, playerRating: scorer.rating });
    scorers[scorer.name] = (scorers[scorer.name] ?? 0) + 1;
  }

  const oppGoalMinutes = distributeGoalMinutes(result.regularTimeOpponentGoals, random);
  for (const minute of oppGoalMinutes) {
    events.push({ minute, type: "goal", team: "opponent", playerName: result.opponent.name, playerRating: 0 });
  }

  // Cards per player
  const userYellows: Record<string, number> = {};
  const oppYellows: Record<string, number> = {};

  // User team cards
  for (const pick of picks) {
    const playerName = pick.player.name;
    // 10% chance of yellow per player
    if (random() < 0.10) {
      const minute = Math.floor(random() * 89) + 1;
      userYellows[playerName] = (userYellows[playerName] ?? 0) + 1;
      events.push({ minute, type: "yellow_card", team: "user", playerName, playerRating: pick.player.rating });
    }
    // 1% chance of direct red per player
    if (random() < 0.01) {
      const minute = Math.floor(random() * 89) + 1;
      events.push({ minute, type: "red_card", team: "user", playerName, playerRating: pick.player.rating });
    }
    // 2% chance of second yellow (→ red) if already booked
    if ((userYellows[playerName] ?? 0) >= 1 && random() < 0.02) {
      const minute = Math.floor(random() * 89) + 1;
      events.push({ minute, type: "red_card", team: "user", playerName, playerRating: pick.player.rating });
    }
  }

  // Opponent cards (simplified - just team name)
  const oppPlayerName = result.opponent.name;
  if (random() < 0.10) {
    const minute = Math.floor(random() * 89) + 1;
    oppYellows[oppPlayerName] = (oppYellows[oppPlayerName] ?? 0) + 1;
    events.push({ minute, type: "yellow_card", team: "opponent", playerName: oppPlayerName, playerRating: 0 });
  }
  if (random() < 0.01) {
    const minute = Math.floor(random() * 89) + 1;
    events.push({ minute, type: "red_card", team: "opponent", playerName: oppPlayerName, playerRating: 0 });
  }
  if ((oppYellows[oppPlayerName] ?? 0) >= 1 && random() < 0.02) {
    const minute = Math.floor(random() * 89) + 1;
    events.push({ minute, type: "red_card", team: "opponent", playerName: oppPlayerName, playerRating: 0 });
  }

  // Near misses: 2-3 per match
  const nearMissCount = 2 + Math.floor(random() * 2);
  for (let i = 0; i < nearMissCount; i++) {
    const minute = Math.floor(random() * 89) + 1;
    const isUser = random() < 0.5;
    const player = isUser ? pickRandomPlayer(picks, random) : { name: result.opponent.name, rating: 0 };
    const flavor = NEAR_MISS_FLAVORS[Math.floor(random() * NEAR_MISS_FLAVORS.length)];
    events.push({ minute, type: "near_miss", team: isUser ? "user" : "opponent", playerName: player.name, playerRating: player.rating, flavorText: flavor });
  }

  events.push({ minute: 45, type: "halftime", team: "user" });
  events.push({ minute: 90, type: "fulltime", team: "user" });

  if (result.extraTime) {
    events.push({ minute: 91, type: "extra_time_start", team: "user" });
    // Distribute extra time goals (91-120)
    const etUserGoals = result.userGoals - result.regularTimeUserGoals;
    const etOppGoals = result.opponentGoals - result.regularTimeOpponentGoals;
    if (etUserGoals > 0) {
      const etMinutes = distributeGoalMinutes(etUserGoals, random).map((m) => m + 90);
      for (const minute of etMinutes) {
        const scorer = pickRandomPlayer(picks, random);
        events.push({ minute, type: "goal", team: "user", playerName: scorer.name, playerRating: scorer.rating });
        scorers[scorer.name] = (scorers[scorer.name] ?? 0) + 1;
      }
    }
    if (etOppGoals > 0) {
      const etMinutes = distributeGoalMinutes(etOppGoals, random).map((m) => m + 90);
      for (const minute of etMinutes) {
        events.push({ minute, type: "goal", team: "opponent", playerName: result.opponent.name, playerRating: 0 });
      }
    }
    events.push({ minute: 120, type: "extra_time_end", team: "user" });
  }

  if (result.decidedByPens && result.penaltyShootout) {
    events.push({ minute: 121, type: "penalty_shootout", team: "user" });
    for (const kick of result.penaltyShootout) {
      events.push({
        minute: 121 + kick.round,
        type: kick.saved ? "penalty_saved" : "penalty_scored",
        team: kick.team,
        playerName: kick.scorer,
      });
    }
  }

  return { events: events.sort((a, b) => a.minute - b.minute), scorers };
}
