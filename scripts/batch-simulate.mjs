#!/usr/bin/env node
/**
 * Batch simulation script for 8and0 probability tuning.
 * Runs thousands of tournament sims at different team ratings
 * and reports the % reaching each stage.
 *
 * Usage: node scripts/batch-simulate.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "public", "data");

// ── Load data ──────────────────────────────────────────────────────────────────

const rawTeams = JSON.parse(readFileSync(join(dataDir, "teams.json"), "utf-8"));
const rawPlayers = JSON.parse(readFileSync(join(dataDir, "players.json"), "utf-8"));

// ── Inline game logic (mirrors src/game8/) ─────────────────────────────────────

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

// ── Build data ─────────────────────────────────────────────────────────────────

const POSITION_CATEGORY = {
  GK: "GK", DF: "DEF", DEF: "DEF", CB: "DEF", LB: "DEF", RB: "DEF",
  MF: "MID", MID: "MID", CM: "MID", DM: "MID", AM: "MID",
  FW: "FWD", FWD: "FWD", ST: "FWD", CF: "FWD", LW: "FWD", RW: "FWD",
};

function mapPositionCategory(position, isGoalkeeper = false) {
  if (isGoalkeeper) return "GK";
  const token = position.trim().toUpperCase();
  return POSITION_CATEGORY[token] ?? null;
}

const teams = rawTeams
  .filter((t) => t.qualified_2026 && typeof t.elo === "number")
  .map((t) => ({
    teamId: t.team_id,
    name: t.name,
    fifaCode: t.fifa_code,
    group: t.wc2026_group,
    ranking: t.fifa_ranking,
    elo: t.elo ?? 1450,
  }));

const teamById = new Map(teams.map((t) => [t.teamId, t]));

const players = rawPlayers
  .map((p) => {
    const team = teamById.get(p.team_id);
    const category = mapPositionCategory(p.position, p.is_goalkeeper);
    if (!team || !category || typeof p.ea_overall !== "number" || p.ea_overall <= 0) return null;
    return {
      id: p.player_id,
      teamId: p.team_id,
      teamName: team.name,
      teamCode: team.fifa_code,
      name: p.name,
      position: p.position,
      category,
      rating: p.ea_overall,
    };
  })
  .filter((p) => p !== null);

const playersByTeam = new Map();
for (const player of players) {
  const current = playersByTeam.get(player.teamId) ?? [];
  current.push(player);
  playersByTeam.set(player.teamId, current);
}

const validTeams = teams.filter((t) => (playersByTeam.get(t.teamId)?.length ?? 0) > 0);

// ── Simulation logic ───────────────────────────────────────────────────────────

// Formation: 4-3-3 (1 GK, 4 DEF, 3 MID, 3 FWD)
const FORMATION_SLOTS = [
  { category: "GK", count: 1 },
  { category: "DEF", count: 4 },
  { category: "MID", count: 3 },
  { category: "FWD", count: 3 },
];

function calculateRatings(picks) {
  const avg = (arr, fallback = 65) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : fallback;
  const gk = avg(picks.filter((p) => p.category === "GK").map((p) => p.rating));
  const defence = avg(picks.filter((p) => p.category === "DEF").map((p) => p.rating));
  const midfield = avg(picks.filter((p) => p.category === "MID").map((p) => p.rating));
  const attack = avg(picks.filter((p) => p.category === "FWD").map((p) => p.rating));
  const overall = gk * 0.16 + defence * 0.28 + midfield * 0.29 + attack * 0.27;
  return { overall: Math.round(overall * 10) / 10, gk, defence, midfield, attack };
}

function normalizeOpponentStrength(team, allTeams) {
  const elos = allTeams.map((t) => t.elo);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const normalized = (team.elo - min) / Math.max(1, max - min);
  return 70 + normalized * 22; // even tighter: 70-92
}

function pickOpponent(allTeams, seed, excludeIds) {
  const pool = allTeams.filter((t) => !excludeIds.has(t.teamId));
  if (pool.length === 0) throw new Error("No opponents available");
  const random = seededRandom(seed);
  const sorted = [...pool].sort((a, b) => b.elo - a.elo);
  const index = Math.floor(Math.pow(random(), 1.3) * sorted.length);
  return sorted[clamp(index, 0, sorted.length - 1)];
}

const STAGE_PRESSURE = {
  "Group match 1": 1.0,
  "Group match 2": 1.0,
  "Group match 3": 1.0,
  "Round of 32": 1.03,
  "Round of 16": 1.06,
  "Quarter-final": 1.10,
  "Semi-final": 1.15,
  "Final": 1.20,
};

function scoreMatch(stage, opponent, ratings, allTeams, seed, knockout) {
  const random = seededRandom(seed);
  const opponentStrength = normalizeOpponentStrength(opponent, allTeams);
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

function simulateTournamentRun(ratings, seed) {
  const excludeIds = new Set();
  const matches = [];
  let wins = 0, draws = 0, losses = 0;
  let stageReached = "Group stage";
  let groupPoints = 0;

  const GROUP_STAGES = ["Group match 1", "Group match 2", "Group match 3"];
  const KNOCKOUT_STAGES = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];

  for (let i = 0; i < GROUP_STAGES.length; i++) {
    const stage = GROUP_STAGES[i];
    const opponent = pickOpponent(validTeams, `${seed}:group:${i}`, excludeIds);
    excludeIds.add(opponent.teamId);
    const result = scoreMatch(stage, opponent, ratings, validTeams, `${seed}:${stage}`, false);
    matches.push(result);
    if (result.result === "W") { wins++; groupPoints += 3; }
    else if (result.result === "D") { draws++; groupPoints += 1; }
    else { losses++; }
  }

  if (groupPoints < 4) {
    stageReached = "Group stage";
  } else {
    for (let i = 0; i < KNOCKOUT_STAGES.length; i++) {
      const stage = KNOCKOUT_STAGES[i];
      const opponent = pickOpponent(validTeams, `${seed}:knockout:${i}`, excludeIds);
      excludeIds.add(opponent.teamId);
      const result = scoreMatch(stage, opponent, ratings, validTeams, `${seed}:${stage}`, true);
      matches.push(result);
      if (result.result === "W") {
        wins++;
        stageReached = stage === "Final" ? "Champion" : stage;
      } else {
        losses++;
        stageReached = stage;
        break;
      }
    }
  }

  return { wins, draws, losses, stageReached, matches };
}

// Generate fake picks for a given overall rating
function generatePicks(overallRating) {
  const picks = [];
  for (const slot of FORMATION_SLOTS) {
    for (let i = 0; i < slot.count; i++) {
      picks.push({ category: slot.category, rating: overallRating });
    }
  }
  return picks;
}

// ── Run batch simulation ───────────────────────────────────────────────────────

const ITERATIONS = 10000;
const RATINGS_TO_TEST = [68, 72, 76, 80, 84, 88];

console.log(`Running ${ITERATIONS.toLocaleString()} simulations per rating level...\n`);
console.log("Rating | Group | R32 | R16 | QF | SF | Final | Champion");
console.log("-------|-------|-----|-----|----|----|-------|----------");

for (const rating of RATINGS_TO_TEST) {
  const picks = generatePicks(rating);
  const ratings = calculateRatings(picks);

  const stageCounts = {
    "Group stage": 0,
    "Round of 32": 0,
    "Round of 16": 0,
    "Quarter-final": 0,
    "Semi-final": 0,
    "Final": 0,
    "Champion": 0,
  };

  for (let i = 0; i < ITERATIONS; i++) {
    const seed = `batch-${rating}-${i}-${Date.now()}`;
    const result = simulateTournamentRun(ratings, seed);
    stageCounts[result.stageReached]++;
  }

  // Calculate cumulative: % reaching each stage
  const reached = {
    "Group stage": 0,
    "Round of 32": 0,
    "Round of 16": 0,
    "Quarter-final": 0,
    "Semi-final": 0,
    "Final": 0,
    "Champion": 0,
  };
  
  // Group stage = everyone plays
  reached["Group stage"] = ITERATIONS;
  // R32 = passed group (not eliminated at group stage)
  reached["Round of 32"] = ITERATIONS - stageCounts["Group stage"];
  // R16 = passed R32
  reached["Round of 16"] = reached["Round of 32"] - stageCounts["Round of 32"];
  // QF = passed R16
  reached["Quarter-final"] = reached["Round of 16"] - stageCounts["Round of 16"];
  // SF = passed QF
  reached["Semi-final"] = reached["Quarter-final"] - stageCounts["Quarter-final"];
  // Final = passed SF
  reached["Final"] = reached["Semi-final"] - stageCounts["Semi-final"];
  // Champion = passed Final
  reached["Champion"] = reached["Final"] - stageCounts["Final"];

  const pct = (count) => ((count / ITERATIONS) * 100).toFixed(1).padStart(5) + "%";
  console.log(`${rating.toString().padStart(6)} | ${pct(reached["Group stage"])} | ${pct(reached["Round of 32"])} | ${pct(reached["Round of 16"])} | ${pct(reached["Quarter-final"])} | ${pct(reached["Semi-final"])} | ${pct(reached["Final"])} | ${pct(reached["Champion"])}`);
}

console.log("\nTargets:");
console.log("- Champion: ~1% overall");
console.log("- Final: 2-3%");
console.log("- Semi-final: 5-10%");
console.log("- Higher rated teams should have better chances");
