#!/usr/bin/env node
/**
 * Rating double-check for 8and0.
 *
 * Surfaces the health of `ea_overall` across public/data/players.json:
 *   - estimated vs preserved split (estimated ratings are NOT real EA ratings)
 *   - range / null / distribution sanity
 *   - the "club-context inflation" signature: teams carrying an implausible
 *     number of 85+ players, and estimated players sitting in the 85+ band
 *
 * Usage: node scripts/audit-ratings.mjs [--list]
 *   --list  also prints every estimated player rated >= 85 for manual review
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "public", "data");
const players = JSON.parse(readFileSync(join(dataDir, "players.json"), "utf-8"));
const teams = JSON.parse(readFileSync(join(dataDir, "teams.json"), "utf-8"));
const teamName = new Map(teams.map((t) => [t.team_id, t.name ?? t.fifa_code]));
const showList = process.argv.includes("--list");

const rated = players.filter((p) => typeof p.ea_overall === "number");
const estimated = players.filter((p) => (p.rating_confidence ?? "") === "estimated");
const badRange = players.filter((p) => typeof p.ea_overall === "number" && (p.ea_overall < 40 || p.ea_overall > 99));
const noRating = players.filter((p) => typeof p.ea_overall !== "number");

console.log(`8and0 — rating audit\n`);
console.log(`players:            ${players.length}`);
console.log(`missing rating:     ${noRating.length}`);
console.log(`out of range:       ${badRange.length}`);
console.log(`estimated (not EA): ${estimated.length}  (${((estimated.length / players.length) * 100).toFixed(0)}%)`);
console.log(`preserved:          ${players.length - estimated.length}`);

const values = rated.map((p) => p.ea_overall);
const buckets = {};
for (const v of values) buckets[Math.floor(v / 5) * 5] = (buckets[Math.floor(v / 5) * 5] ?? 0) + 1;
console.log(`\ndistribution (by 5s):`);
for (const k of Object.keys(buckets).sort((a, b) => a - b)) console.log(`  ${k}-${+k + 4}: ${buckets[k]}`);

// Inflation signature: how many 85+ each team carries (an elite XI has ~3-6 stars).
console.log(`\nteams carrying the most 85+ players (inflation flag):`);
const byTeam = new Map();
for (const p of players) {
  if (p.ea_overall >= 85) byTeam.set(p.team_id, (byTeam.get(p.team_id) ?? 0) + 1);
}
[...byTeam.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([id, n]) => console.log(`  ${String(n).padStart(2)}  ${teamName.get(id) ?? id}`));

const risky = estimated.filter((p) => p.ea_overall >= 85);
console.log(`\nestimated players in the 85+ band (need review): ${risky.length}`);
if (showList) {
  risky
    .sort((a, b) => b.ea_overall - a.ea_overall)
    .forEach((p) => console.log(`  ${p.ea_overall}  ${p.name} (${p.fifa_code}, ${p.club_name})`));
} else {
  console.log(`  run with --list to print them`);
}

console.log(
  `\nNote: estimated ratings were derived from club/team strength and can inflate` +
    `\nsquad players at big clubs. Higher/Lower uses base EA ratings with a >=5-point` +
    `\ngap so questions stay fair; a full fix needs a real EA source.`
);
