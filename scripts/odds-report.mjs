#!/usr/bin/env node
/**
 * Accurate odds report for 8and0.
 *
 * Unlike the older `batch-simulate.mjs` (which has drifted from the live game),
 * this script mirrors `src/game8/simulate.ts` EXACTLY as of this PR:
 *   - normalizeOpponentStrength: 64 + normalized * 32
 *   - userLambda / opponentLambda formulas + STAGE_PRESSURE
 *   - group qualification threshold: groupPoints >= 3
 *   - knockout extra time (lambda * 0.35) then penalty shootout
 *   - calculateRunScore for the average points line
 *
 * Usage: node scripts/odds-report.mjs [iterations]
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "public", "data");

const ITERATIONS = Number(process.argv[2]) || 20000;

// ── RNG (mirror random.ts) ───────────────────────────────────────────────────

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let t = hashSeed(seed);
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function poisson(lambda, random) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = 1;
  do {
    k += 1;
    product *= random();
  } while (product > limit);
  return k - 1;
}

// ── Teams (mirror data.ts filtering) ─────────────────────────────────────────

const rawTeams = JSON.parse(readFileSync(join(dataDir, "teams.json"), "utf-8"));
const rawPlayers = JSON.parse(readFileSync(join(dataDir, "players.json"), "utf-8"));

const teams = rawTeams
  .filter((t) => t.qualified_2026 && typeof t.elo === "number")
  .map((t) => ({ teamId: t.team_id, elo: t.elo ?? 1450 }));

const playerTeamIds = new Set(rawPlayers.map((p) => p.team_id));
const validTeams = teams.filter((t) => playerTeamIds.has(t.teamId));

// ── Sim constants (mirror simulate.ts) ───────────────────────────────────────

const GROUP_STAGES = ["Group match 1", "Group match 2", "Group match 3"];
const KNOCKOUT_STAGES = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];

const STAGE_PRESSURE = {
  "Group match 1": 1.0,
  "Group match 2": 1.0,
  "Group match 3": 1.0,
  "Round of 32": 1.0,
  "Round of 16": 1.02,
  "Quarter-final": 1.1,
  "Semi-final": 1.15,
  Final: 1.2,
};

const STAGE_BONUS = {
  "Group stage": 0,
  "Round of 32": 2,
  "Round of 16": 4,
  "Quarter-final": 6,
  "Semi-final": 8,
  Final: 10,
  Champion: 14,
};
const DIFFICULTY_BONUS = { easy: 0, normal: 3, hard: 7 };

function normalizeOpponentStrength(team, allTeams) {
  const elos = allTeams.map((t) => t.elo);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const normalized = (team.elo - min) / Math.max(1, max - min);
  return 64 + normalized * 32;
}

function pickOpponent(allTeams, seed, excludeIds) {
  const pool = allTeams.filter((t) => !excludeIds.has(t.teamId));
  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => b.elo - a.elo);
  const index = Math.floor(Math.pow(random(), 1.3) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}

function simulatePenalties(ratings, random) {
  const userPenRating = clamp(0.675 + (ratings.attack - 75) * 0.005, 0.45, 0.85);
  const oppPenRating = clamp(0.675 - (ratings.gk - 75) * 0.008, 0.35, 0.85);
  let userScored = 0;
  let oppScored = 0;
  for (let i = 0; i < 5; i++) {
    if (random() <= userPenRating) userScored++;
    if (random() <= oppPenRating) oppScored++;
    const remaining = 5 - i - 1;
    if (userScored > oppScored + remaining || oppScored > userScored + remaining) break;
  }
  while (userScored === oppScored) {
    if (random() <= userPenRating) userScored++;
    if (random() <= oppPenRating) oppScored++;
  }
  return userScored > oppScored;
}

function scoreMatch(stage, opponent, ratings, allTeams, seed, knockout) {
  const random = seededRandom(seed);
  const opponentStrength = normalizeOpponentStrength(opponent, allTeams);
  const ratingEdge = ratings.overall - opponentStrength;
  const attackEdge = (ratings.attack + ratings.midfield) / 2 - opponentStrength;
  const defenceEdge = (ratings.defence + ratings.gk) / 2 - opponentStrength;
  const pressure = STAGE_PRESSURE[stage] ?? 1.0;
  const userLambda = clamp(1.3 + ratingEdge * 0.025 + attackEdge * 0.015, 0.2, 3.2);
  const opponentLambda = clamp((1.4 - ratingEdge * 0.02 - defenceEdge * 0.013) * pressure, 0.25, 3.6);
  let userGoals = poisson(userLambda, random);
  let opponentGoals = poisson(opponentLambda, random);

  if (knockout && userGoals === opponentGoals) {
    userGoals += poisson(userLambda * 0.35, random);
    opponentGoals += poisson(opponentLambda * 0.35, random);
    if (userGoals === opponentGoals) {
      if (simulatePenalties(ratings, random)) userGoals += 1;
      else opponentGoals += 1;
    }
  }

  const result = userGoals > opponentGoals ? "W" : userGoals < opponentGoals ? "L" : "D";
  return { result, userGoals, opponentGoals };
}

function calculateRunScore({ wins, draws, losses, stageReached, rating, difficulty, blindMode }) {
  const ratingBonus = Math.max(0, Math.round((rating - 68) / 4));
  const raw =
    wins * 5 +
    draws * 2 -
    losses +
    (STAGE_BONUS[stageReached] ?? 0) +
    DIFFICULTY_BONUS[difficulty] +
    (blindMode ? 2 : 0) +
    ratingBonus;
  return Math.max(0, raw);
}

function simulateTournamentRun(ratings, seed) {
  const excludeIds = new Set();
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let stageReached = "Group stage";
  let groupPoints = 0;

  for (let i = 0; i < GROUP_STAGES.length; i++) {
    const stage = GROUP_STAGES[i];
    const opponent = pickOpponent(validTeams, `${seed}:group:${i}`, excludeIds);
    excludeIds.add(opponent.teamId);
    const r = scoreMatch(stage, opponent, ratings, validTeams, `${seed}:${stage}`, false);
    goalsFor += r.userGoals;
    goalsAgainst += r.opponentGoals;
    if (r.result === "W") {
      wins++;
      groupPoints += 3;
    } else if (r.result === "D") {
      draws++;
      groupPoints += 1;
    } else {
      losses++;
    }
  }

  if (groupPoints >= 3) {
    for (let i = 0; i < KNOCKOUT_STAGES.length; i++) {
      const stage = KNOCKOUT_STAGES[i];
      const opponent = pickOpponent(validTeams, `${seed}:knockout:${i}`, excludeIds);
      excludeIds.add(opponent.teamId);
      const r = scoreMatch(stage, opponent, ratings, validTeams, `${seed}:${stage}`, true);
      goalsFor += r.userGoals;
      goalsAgainst += r.opponentGoals;
      if (r.result === "W") {
        wins++;
        stageReached = stage === "Final" ? "Champion" : stage;
      } else {
        losses++;
        stageReached = stage;
        break;
      }
    }
  }

  return { wins, draws, losses, stageReached, goalsFor, goalsAgainst };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const RATINGS_TO_TEST = [70, 74, 78, 82, 86, 90];
const STAGE_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
  "Champion",
];

console.log(`8and0 — accurate odds report (${ITERATIONS.toLocaleString()} sims per rating)`);
console.log(`Opponent pool: ${validTeams.length} qualified teams\n`);
console.log("OVR | PassGrp |   R16 |    QF |    SF | Final | Champ |   8-0 | GF/GA | AvgPts");
console.log("----|---------|-------|-------|-------|-------|-------|-------|-------|-------");

for (const rating of RATINGS_TO_TEST) {
  const ratings = { overall: rating, gk: rating, defence: rating, midfield: rating, attack: rating };
  const reached = {
    "Round of 32": 0,
    "Round of 16": 0,
    "Quarter-final": 0,
    "Semi-final": 0,
    Final: 0,
    Champion: 0,
  };
  let perfect = 0;
  let totalGF = 0;
  let totalGA = 0;
  let totalPts = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const run = simulateTournamentRun(ratings, `odds-${rating}-${i}`);
    const idx = STAGE_ORDER.indexOf(run.stageReached);
    // Credit every stage up to and including the one reached.
    for (let s = 0; s <= idx; s++) reached[STAGE_ORDER[s]]++;
    if (run.wins === 8 && run.losses === 0 && run.draws === 0) perfect++;
    totalGF += run.goalsFor;
    totalGA += run.goalsAgainst;
    totalPts += calculateRunScore({
      wins: run.wins,
      draws: run.draws,
      losses: run.losses,
      stageReached: run.stageReached,
      rating,
      difficulty: "normal",
      blindMode: false,
    });
  }

  const pct = (n) => ((n / ITERATIONS) * 100).toFixed(1).padStart(5) + "%";
  const gfga = `${(totalGF / ITERATIONS).toFixed(1)}/${(totalGA / ITERATIONS).toFixed(1)}`;
  console.log(
    `${String(rating).padStart(3)} | ${pct(reached["Round of 32"])} | ${pct(reached["Round of 16"])} | ${pct(
      reached["Quarter-final"]
    )} | ${pct(reached["Semi-final"])} | ${pct(reached["Final"])} | ${pct(reached["Champion"])} | ${pct(
      perfect
    )} | ${gfga.padStart(5)} | ${(totalPts / ITERATIONS).toFixed(1).padStart(5)}`
  );
}

console.log(
  "\nPassGrp = qualified from group (>=3 pts). Champ = won the tournament. 8-0 = won all 8, no draws/losses."
);
