#!/usr/bin/env node
/**
 * Health check + CI gate for the historical rosters (Part B), mirroring
 * audit-ratings.mjs. Reports match coverage, rating distribution and per-era
 * team strength; --ci fails on structural problems (incomplete XIs, an
 * estimated fallback leaking into the star band, or an implausible elo).
 *
 *   node scripts/audit-historical-ratings.mjs [--list] [--ci]
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "public", "data");
const players = JSON.parse(readFileSync(join(dataDir, "historical-players.json"), "utf8"));
const teams = JSON.parse(readFileSync(join(dataDir, "historical-teams.json"), "utf8"));
const showList = process.argv.includes("--list");

const sourced = players.filter((p) => p.rating_confidence === "sourced");
const estimated = players.filter((p) => p.rating_confidence === "estimated");

console.log(`8and0 — historical rating audit\n`);
console.log(`players:            ${players.length}`);
console.log(`teams:              ${teams.length}`);
console.log(`sourced (real EA):  ${sourced.length}  (${((sourced.length / players.length) * 100).toFixed(0)}%)`);
console.log(`estimated fallback: ${estimated.length}  (${((estimated.length / players.length) * 100).toFixed(0)}%)`);

for (const year of [2014, 2018, 2022]) {
  const ep = players.filter((p) => p.tournament_year === year);
  const es = ep.filter((p) => p.rating_confidence === "sourced").length;
  console.log(`  ${year}: ${ep.length} players, ${((es / ep.length) * 100).toFixed(0)}% sourced`);
}

console.log(`\nstrongest XIs by mean rating (sanity — the tournament favourites):`);
[...teams]
  .sort((a, b) => b.mean_xi_rating - a.mean_xi_rating)
  .slice(0, 6)
  .forEach((t) => console.log(`  ${t.mean_xi_rating}  elo ${t.elo}  ${t.name} ${t.tournament_year}`));

const riskyEstimates = estimated.filter((p) => p.ea_overall >= 82);
console.log(`\nestimated players rated >=82 (should be 0): ${riskyEstimates.length}`);
if (showList) {
  estimated
    .sort((a, b) => b.ea_overall - a.ea_overall)
    .slice(0, 25)
    .forEach((p) => console.log(`  ${p.ea_overall}  ${p.name} (${p.fifa_code} ${p.tournament_year})`));
}

if (process.argv.includes("--ci")) {
  const problems = [];
  // Every team must have exactly 11 XI players.
  const counts = new Map();
  for (const p of players) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1);
  const badXI = [...counts.values()].filter((n) => n !== 11).length;
  if (badXI > 0) problems.push(`${badXI} team(s) do not have exactly 11 players`);
  if (riskyEstimates.length > 0) problems.push(`${riskyEstimates.length} estimated players rated >=82 (fallback must stay below the star band)`);
  const badElo = teams.filter((t) => t.elo < 1200 || t.elo > 2200).length;
  if (badElo > 0) problems.push(`${badElo} team(s) have an out-of-range elo`);
  const badRating = players.filter((p) => p.ea_overall < 40 || p.ea_overall > 99).length;
  if (badRating > 0) problems.push(`${badRating} ratings out of 40–99 range`);
  if (problems.length > 0) {
    console.error(`\n✗ historical audit FAILED:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`\n✓ historical audit passed`);
}
