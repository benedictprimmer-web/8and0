import fs from "node:fs";

const EXPECTED_TEAM_COUNT = 48;
const EXPECTED_PLAYERS_PER_TEAM = 26;
const EXPECTED_TOTAL_PLAYERS = EXPECTED_TEAM_COUNT * EXPECTED_PLAYERS_PER_TEAM;
const COVERAGE = new Map([
  ["GK", "GK"],
  ["DF", "DEF"],
  ["DEF", "DEF"],
  ["CB", "DEF"],
  ["LB", "DEF"],
  ["RB", "DEF"],
  ["MF", "MID"],
  ["MID", "MID"],
  ["CM", "MID"],
  ["DM", "MID"],
  ["AM", "MID"],
  ["FW", "FWD"],
  ["FWD", "FWD"],
  ["ST", "FWD"],
  ["CF", "FWD"],
  ["LW", "FWD"],
  ["RW", "FWD"],
]);

const teams = JSON.parse(fs.readFileSync("public/data/teams.json", "utf8"));
const players = JSON.parse(fs.readFileSync("public/data/players.json", "utf8"));
const errors = [];

function fail(message) {
  errors.push(message);
}

const qualifiedTeams = teams.filter((team) => team.qualified_2026 && typeof team.elo === "number");
const teamIds = new Set(qualifiedTeams.map((team) => team.team_id));
const seenPlayerIds = new Set();
const countsByTeam = new Map();
const categoriesByTeam = new Map();

if (qualifiedTeams.length !== EXPECTED_TEAM_COUNT) {
  fail(`expected ${EXPECTED_TEAM_COUNT} qualified teams, found ${qualifiedTeams.length}`);
}

if (players.length !== EXPECTED_TOTAL_PLAYERS) {
  fail(`expected ${EXPECTED_TOTAL_PLAYERS} players, found ${players.length}`);
}

for (const player of players) {
  if (seenPlayerIds.has(player.player_id)) {
    fail(`duplicate player_id ${player.player_id}`);
  }
  seenPlayerIds.add(player.player_id);

  for (const field of ["name", "team_id", "fifa_code", "position"]) {
    if (player[field] === null || player[field] === undefined || player[field] === "") {
      fail(`player ${player.player_id ?? "(missing id)"} is missing ${field}`);
    }
  }

  if (!teamIds.has(player.team_id)) {
    fail(`player ${player.player_id} references unknown team_id ${player.team_id}`);
  }

  if (typeof player.ea_overall !== "number" || player.ea_overall <= 0) {
    fail(`player ${player.player_id} has invalid ea_overall ${player.ea_overall}`);
  }

  const category = player.is_goalkeeper ? "GK" : COVERAGE.get(String(player.position).toUpperCase());
  if (!category) {
    fail(`player ${player.player_id} has unmapped position ${player.position}`);
  }

  countsByTeam.set(player.team_id, (countsByTeam.get(player.team_id) ?? 0) + 1);
  const categories = categoriesByTeam.get(player.team_id) ?? new Set();
  if (category) categories.add(category);
  categoriesByTeam.set(player.team_id, categories);
}

for (const team of qualifiedTeams) {
  const count = countsByTeam.get(team.team_id) ?? 0;
  if (count !== EXPECTED_PLAYERS_PER_TEAM) {
    fail(`${team.name} (${team.fifa_code}) has ${count} players`);
  }

  const categories = categoriesByTeam.get(team.team_id) ?? new Set();
  if (!categories.has("GK")) {
    fail(`${team.name} (${team.fifa_code}) has no goalkeeper`);
  }

  for (const required of ["GK", "DEF", "MID", "FWD"]) {
    if (!categories.has(required)) {
      fail(`${team.name} (${team.fifa_code}) has no draftable ${required} coverage`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Data validation passed: ${players.length} players, ${qualifiedTeams.length} teams, ${EXPECTED_PLAYERS_PER_TEAM} players per team.`
);
