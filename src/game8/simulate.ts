import { getFormation } from "./formations";
import { clamp, poisson, seededRandom } from "./random";
import { gradeRun } from "./ratings";
import { calculateRunScore } from "./scoring";
export { calculateRunScore } from "./scoring";
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

// Opponent draw is `sorted_by_elo[ floor(random()^exponent * n) ]`, so a HIGHER
// exponent biases toward weaker teams and a LOWER one toward stronger teams.
// Knockout exponents fall R32 → R16 → QF → Semi so the bracket ramps: you ease
// in against weaker sides and meet the strongest teams late. The semi-final
// draws the single strongest opponent (the "boss" gate); the final is also a
// top-tier draw but a touch below it, the way this game's funnel is tuned.
const STAGE_EXPONENT: Record<string, number> = {
  "Group match": 1.0,
  "Round of 32": 2.5,
  "Round of 16": 1.5,
  "Quarter-final": 0.9,
  "Semi-final": 0.26,
  "Final": 0.3,
};

// Group qualification: you must earn it. 4 points (e.g. 2W-0D-1L, 1W-1D-1L, or
// 1W-2D-0L) is the floor — a single win amid two losses (3 pts) no longer
// scrapes you through, so qualifiers have genuinely competed for their place.
const GROUP_QUALIFY_POINTS = 4;

function getStageExponent(stage: string): number {
  const key = stage.startsWith("Group") ? "Group match" : stage;
  return STAGE_EXPONENT[key] ?? 1.0;
}

function pickOpponent(
  teams: EightZeroTeam[],
  seed: string,
  excludeIds: Set<number>,
  stage: string,
  userOverall: number,
  legendMode: LegendMode
): EightZeroTeam {
  let pool = teams.filter((team) => !excludeIds.has(team.teamId));
  if (pool.length === 0) {
    throw new Error("No opponents available");
  }

  // Group stage: aim the draw a notch below the player on the same [64, 93]
  // strength scale the match model uses, with the gap widening as the squad
  // gets stronger. Elite squads should boss their group; modest squads still
  // get a competitive but winnable draw. Either way qualification is earned
  // with wins rather than scraped through against elite sides.
  if (stage.startsWith("Group")) {
    const margin = 3 + Math.max(0, userOverall - 72) * 0.5;
    const target = userOverall - margin;
    const lo = target - 7;
    const hi = target + 7;
    const banded = pool.filter((t) => {
      const strength = normalizeOpponentStrength(t, teams);
      return strength >= lo && strength <= hi;
    });
    if (banded.length >= 3) pool = banded;
  }

  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => a.elo - b.elo);

  let exponent = getStageExponent(stage);

  // Legend mode: easier opponents in early rounds. A higher exponent biases the
  // draw toward weaker teams, so add to it (not subtract) for the early stages.
  if (legendMode !== "none") {
    const stageKey = stage.startsWith("Group") ? "Group match" : stage;
    if (stageKey === "Group match" || stageKey === "Round of 32" || stageKey === "Round of 16") {
      exponent = exponent + 0.8;
    }
  }

  const index = Math.floor(Math.pow(random(), exponent) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}

// Elite ramp — above 80 overall, strong squads get a growing edge so the top
// of the rating curve has an easier ride (sub-80 is left untouched). Tuned per
// stage: bonus = base + slope * (overall - 80). One edge point ≈ +0.03 user
// goals / -0.025 opponent goals a match. The semi-final gets no bonus on
// purpose — paired with its stronger opponent draw (see STAGE_EXPONENT) it is
// the deliberate "boss" gate where roughly half of elite runs wash out.
const ELITE_EDGE: Record<string, { base: number; slope: number }> = {
  "Group match": { base: 0.5, slope: 2.05 },
  "Round of 32": { base: 0.2, slope: 0.16 },
  "Round of 16": { base: 0.3, slope: 0.24 },
  "Quarter-final": { base: 0.4, slope: 0.20 },
  "Semi-final": { base: 0.0, slope: 0.00 },
  "Final": { base: 0.5, slope: 0.28 },
};

function eliteEdgeBonus(stage: string, overall: number): number {
  // Preserve the original sub-80 behaviour exactly: only SF/Final gave a small
  // bonus down there (+0.2 for 76-79), everything else was 0.
  if (overall < 80) {
    if (stage === "Semi-final" || stage === "Final") return overall >= 76 ? 0.2 : 0;
    return 0;
  }
  const key = stage.startsWith("Group") ? "Group match" : stage;
  const ramp = ELITE_EDGE[key];
  if (!ramp) return 0;
  return ramp.base + ramp.slope * (overall - 80);
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
  legendMode: LegendMode,
  penOverride?: "W" | "L",
  superSubRating?: number | null
): MatchResult {
  const random = seededRandom(seed);
  const opponentStrength = normalizeOpponentStrength(opponent, teams);
  const opponentGkRating = calculateOpponentGkRating(opponent);

  const ratingEdgeBonus = eliteEdgeBonus(stage, ratings.overall);

  const ratingEdge = (ratings.overall - opponentStrength) + ratingEdgeBonus;
  const attackEdge = (ratings.attack + ratings.midfield) / 2 - opponentStrength;
  const defenceEdge = (ratings.defence + ratings.gk) / 2 - opponentStrength;
  let pressure = STAGE_PRESSURE[stage] ?? 1.0;

  // Tighten games in QF/SF/Final - less scoring = more ET and penalties
  if (stage === "Quarter-final" || stage === "Semi-final" || stage === "Final") {
    const tightFactor = stage === "Final" ? 1.20 : stage === "Semi-final" ? 1.15 : 1.10;
    pressure = pressure * tightFactor;
  }

  // Legend mode: easier final stage
  if (legendMode !== "none" && stage === "Final") {
    pressure = Math.max(1.0, pressure - 0.05);
  }

  const userLambda = clamp(1.10 + ratingEdge * 0.032 + attackEdge * 0.018, 0.15, 4.0);
  const opponentLambda = clamp((1.45 - ratingEdge * 0.025 - defenceEdge * 0.018) * pressure, 0.20, 3.8);
  let userGoals = poisson(userLambda, random);
  let opponentGoals = poisson(opponentLambda, random);
  // Super-sub: the chosen 12th man threatens a late impact goal in the knockouts
  // when the team is level or a goal down. Probability scales with his rating;
  // it's a regulation goal so the live match plays it out. Seeded like the rest,
  // and only consumes the RNG when a sub is actually set — existing runs are
  // byte-for-byte unchanged.
  if (knockout && superSubRating != null && userGoals <= opponentGoals) {
    const impactChance = clamp((superSubRating - 60) / 70, 0.05, 0.55);
    if (random() < impactChance) userGoals += 1;
  }
  const regularTimeUserGoals = userGoals;
  const regularTimeOpponentGoals = opponentGoals;
  let extraTimeUserGoals = 0;
  let extraTimeOpponentGoals = 0;
  let decidedByPens = false;
  let extraTime = false;

  if (knockout && userGoals === opponentGoals) {
    // Extra time - lower scoring in later rounds = more penalties
    extraTime = true;
    const etMultiplier = stage === "Final" ? 0.10 : stage === "Semi-final" ? 0.12 : stage === "Quarter-final" ? 0.15 : 0.20;
    const etUserLambda = userLambda * etMultiplier;
    const etOppLambda = opponentLambda * etMultiplier;
    extraTimeUserGoals = poisson(etUserLambda, random);
    extraTimeOpponentGoals = poisson(etOppLambda, random);
    userGoals += extraTimeUserGoals;
    opponentGoals += extraTimeOpponentGoals;

    if (userGoals === opponentGoals) {
      // Still level after extra time → penalty shootout. The interactive
      // shootout is authoritative; `penOverride` carries that result back in on
      // re-simulation. Without an override (initial provisional run) a seeded
      // shootout decides a winner that is never shown to the player.
      decidedByPens = true;
      let userWins: boolean;
      if (penOverride) {
        userWins = penOverride === "W";
      } else {
        const kicks = simulatePenalties(ratings, opponent, random, legendMode, superSubRating);
        const userPenGoals = kicks.filter((k) => k.team === "user" && !k.saved).length;
        const oppPenGoals = kicks.filter((k) => k.team === "opponent" && !k.saved).length;
        // Tie falls to the user (matches the previous safety fallback).
        userWins = userPenGoals >= oppPenGoals;
      }
      if (userWins) {
        userGoals += 1;
      } else {
        opponentGoals += 1;
      }
    }
  }

  const result = userGoals > opponentGoals ? "W" : userGoals < opponentGoals ? "L" : "D";
  return { stage, opponent, userGoals, opponentGoals, regularTimeUserGoals, regularTimeOpponentGoals, extraTimeUserGoals, extraTimeOpponentGoals, opponentGkRating, result, decidedByPens, extraTime };
}

function simulatePenalties(
  ratings: TeamRatings,
  opponent: EightZeroTeam,
  random: () => number,
  legendMode: LegendMode,
  superSubRating?: number | null
): PenaltyKick[] {
  const kicks: PenaltyKick[] = [];
  let userPenRating = clamp(0.675 + (ratings.attack - 75) * 0.005, 0.45, 0.85);
  const oppPenRating = clamp(0.675 - (ratings.gk - 75) * 0.008, 0.35, 0.85);

  // Legend mode: harder to win on penalties
  if (legendMode !== "none") {
    userPenRating = Math.max(0.4, userPenRating - 0.05);
  }

  // Super-sub steps up to the spot: a steadier conversion in the shootout.
  if (superSubRating != null) {
    userPenRating = Math.min(0.92, userPenRating + 0.06);
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
  liveRatings?: boolean;
  chemistry?: boolean;
  superSub?: boolean;
  superSubName?: string | null;
  superSubRating?: number | null;
  // The knockout stage where the player brought the sub on (interactive, one-time).
  superSubStage?: string | null;
  // Authoritative knockout shootout results, keyed by stage name. When the
  // player wins/loses an interactive shootout, the run is re-simulated with the
  // result recorded here so the bracket and score stay consistent with play.
  penOverrides?: Record<string, "W" | "L">;
}): TournamentRun {
  const excludeIds = new Set(args.picks.map((pick) => pick.player.teamId));
  const matches: MatchResult[] = [];
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let stageReached = "Group stage";
  let groupPoints = 0;
  const legendMode = args.legendMode ?? "none";
  // The super-sub's impact applies only to the ONE knockout stage where the
  // player brought him on (interactive, one-time use). No stage → he stays benched.
  const superSubRating = args.superSub ? args.superSubRating ?? null : null;
  const superSubStage = args.superSubStage ?? null;
  const userOverall = args.ratings.overall;

  for (let index = 0; index < GROUP_STAGES.length; index += 1) {
    const stage = GROUP_STAGES[index];
    const opponent = pickOpponent(args.teams, `${args.seed}:group:${index}`, excludeIds, stage, userOverall, legendMode);
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

  if (groupPoints < GROUP_QUALIFY_POINTS) {
    stageReached = "Group stage";
  } else {
    for (let index = 0; index < KNOCKOUT_STAGES.length; index += 1) {
      const stage = KNOCKOUT_STAGES[index];
      const opponent = pickOpponent(args.teams, `${args.seed}:knockout:${index}`, excludeIds, stage, userOverall, legendMode);
      excludeIds.add(opponent.teamId);
      const subRating = superSubStage === stage ? superSubRating : null;
      const result = scoreMatch(stage, opponent, args.ratings, args.teams, `${args.seed}:${stage}`, true, legendMode, args.penOverrides?.[stage], subRating);
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
  const liveRatings = args.liveRatings ?? false;
  const chemistry = args.chemistry ?? false;
  const superSub = args.superSub ?? false;
  const superSubName = args.superSubName ?? null;
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
    liveRatings,
    chemistry,
    superSub,
    superSubName,
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

// Extra-time goals fall within minutes 91-120 (two 15-minute halves), so the
// live match playback (capped at minute 120) always animates them.
export function distributeExtraTimeMinutes(totalGoals: number, random: () => number): number[] {
  if (totalGoals <= 0) return [];
  const times = Array.from({ length: totalGoals }, () => Math.floor(random() * 30) + 91);
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
    // Extra-time goals only — never the penalty-shootout decider, which is
    // played out interactively rather than animated here.
    if (result.extraTimeUserGoals > 0) {
      const etMinutes = distributeExtraTimeMinutes(result.extraTimeUserGoals, random);
      for (const minute of etMinutes) {
        const scorer = pickRandomPlayer(picks, random);
        events.push({ minute, type: "goal", team: "user", playerName: scorer.name, playerRating: scorer.rating });
        scorers[scorer.name] = (scorers[scorer.name] ?? 0) + 1;
      }
    }
    if (result.extraTimeOpponentGoals > 0) {
      const etMinutes = distributeExtraTimeMinutes(result.extraTimeOpponentGoals, random);
      for (const minute of etMinutes) {
        events.push({ minute, type: "goal", team: "opponent", playerName: result.opponent.name, playerRating: 0 });
      }
    }
    events.push({ minute: 120, type: "extra_time_end", team: "user" });
  }

  // The penalty shootout is handled by the interactive PenaltyShootout
  // component, so no penalty events are emitted into the live-match timeline.

  return { events: events.sort((a, b) => a.minute - b.minute), scorers };
}
