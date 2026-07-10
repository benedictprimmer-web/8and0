#!/usr/bin/env node
/**
 * Part A — replace fabricated "estimated" ratings in the 2026 squad with REAL
 * EA ratings.
 *
 * Why this exists: `scripts/update-squads.mjs` fills any player without a
 * preserved rating via `estimateRating()`, which adds a big club bonus
 * (+7 for Real/Barça/City/Bayern/PSG). That inflates every squad player at a
 * giant club into the 85+ band — the audit flags England carrying 22 players
 * rated 85+, more than any real squad. This script fixes it by looking each
 * player up in a real FIFA edition and, for the genuinely-uncovered rest,
 * recomputing an honest club-neutral baseline capped below the star band.
 *
 * Rating source is swappable: default is the FIFA 22 mirror (the newest edition
 * available without hitting a Cloudflare wall). Drop a fresher FC25/26 export in
 * and pass --edition to use it — the matcher is source-agnostic.
 *
 *   node scripts/backfill-2026-ratings.mjs [--edition fifa22] [--write] [--force]
 *
 * Without --write it does a dry run and prints the report only.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEdition, canonicalNationality, growthAdjust, FIFA_EDITIONS } from "./lib/fifa.mjs";
import { matchFullName, nameTokens, normalize } from "./lib/text.mjs";
import { writeJson } from "./lib/csv.mjs";

const TARGET_YEAR = 2026;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const edition = argValue("--edition") ?? "fifa22";
const doWrite = args.includes("--write");
const force = args.includes("--force");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

// Honest, club-neutral fallback for players with no real FIFA card. Uses only
// team strength + position + squad depth — deliberately NO club bonus (that was
// the inflation) and capped at 80 so an unknown squad player never masquerades
// as a star. Real stars overwhelmingly have a card and get their real rating.
const FALLBACK_CAP = 80;
function honestEstimate(team, player, depthIndex) {
  const ranking = typeof team.fifa_ranking === "number" ? team.fifa_ranking : 75;
  const elo = typeof team.elo === "number" ? team.elo : 1450;
  const rankBase = 82 - Math.min(ranking, 120) * 0.19;
  const eloBase = 70 + (elo - 1450) / 32;
  const positionBonus =
    player.position === "FW" ? 1 : player.position === "MF" ? 0 : player.position === "DF" ? -1 : -2;
  const depthPenalty = Math.floor(depthIndex / 6);
  const est = Math.round((rankBase + eloBase) / 2 + positionBonus - depthPenalty);
  return Math.max(55, Math.min(FALLBACK_CAP, est));
}

// Match ONLY against the full long name, directionally: every token of our
// clean "First Last" must appear in the candidate's long name. This rejects
// surname-only collisions (a FIFA short_name "A. Robinson" reduces to just
// "robinson" and would otherwise match any Robinson). Require a 2-token name to
// share both names, so "Miles Robinson" ≠ "Antonee Robinson".
function bestMatch(candidates, player) {
  const playerTokens = nameTokens(player.name);
  if (playerTokens.length === 0) return null;
  const hits = candidates.filter((c) => matchFullName(player.name, c.longName));
  if (hits.length === 0) return null;
  const exact = hits.find((c) => normalize(c.longName) === normalize(player.name));
  if (exact) return exact;
  // Closest name (fewest extra tokens) wins; tie-break by rating (the star).
  return hits.sort(
    (a, b) => nameTokens(a.longName).length - nameTokens(b.longName).length || b.overall - a.overall
  )[0];
}

async function main() {
  const players = JSON.parse(await fs.readFile(path.join(root, "public/data/players.json"), "utf8"));
  const teams = JSON.parse(await fs.readFile(path.join(root, "public/data/teams.json"), "utf8"));
  const teamById = new Map(teams.map((t) => [t.team_id, t]));

  const { byNationality, label } = await loadEdition(edition, { force });
  const editionYear = FIFA_EDITIONS[edition].year;

  // Track squad depth per team so the fallback can taper deeper players.
  const depthByTeam = new Map();

  let kept = 0;
  let matched = 0;
  let fallback = 0;
  const report = { edition: label, target_year: TARGET_YEAR, kept_preserved: 0, matched: [], unmatched: [] };

  for (const p of players) {
    const depthIndex = depthByTeam.get(p.team_id) ?? 0;
    depthByTeam.set(p.team_id, depthIndex + 1);

    // The 210 existing "preserved" ratings are the curated current stars
    // (Mbappé 93, Yamal 89 — some didn't exist in FIFA 22). They are more
    // current than any mirror edition; never overwrite them.
    if (p.rating_confidence === "preserved") {
      kept += 1;
      continue;
    }

    const team = teamById.get(p.team_id);
    const natKey = team ? canonicalNationality(team.name) : "";
    const candidates = byNationality.get(natKey) ?? [];
    const hit = bestMatch(candidates, p);

    if (hit) {
      matched += 1;
      const before = p.ea_overall;
      const aged = growthAdjust(hit, editionYear, TARGET_YEAR);
      p.ea_overall = aged;
      p.rating_confidence = "sourced";
      p.rating_source =
        aged !== hit.overall
          ? `sofifa ${edition} ${hit.overall}→${aged} age-adjusted to ${TARGET_YEAR}`
          : `sofifa ${edition} (eddwebster mirror)`;
      report.matched.push({
        name: p.name,
        fifa_code: p.fifa_code,
        before,
        edition_overall: hit.overall,
        after: aged,
        matched_as: hit.longName,
      });
    } else {
      fallback += 1;
      const before = p.ea_overall;
      p.ea_overall = honestEstimate(team ?? {}, p, depthIndex);
      p.rating_confidence = "estimated";
      p.rating_source = "estimated: club-neutral baseline (no FIFA card)";
      report.unmatched.push({ name: p.name, fifa_code: p.fifa_code, before, after: p.ea_overall });
    }
    // Keep aura_composite untouched — it is a separate signal.
  }

  report.kept_preserved = kept;
  const realPct = (((kept + matched) / players.length) * 100).toFixed(0);
  console.log(`Rating backfill against ${label} (target ${TARGET_YEAR})`);
  console.log(`  kept curated stars:     ${kept}`);
  console.log(`  matched to real rating: ${matched}`);
  console.log(`  club-neutral fallback:  ${fallback}`);
  console.log(`  real-data coverage:     ${kept + matched}/${players.length} (${realPct}%)`);

  if (doWrite) {
    players.sort((a, b) => a.team_id - b.team_id || a.player_id - b.player_id);
    await fs.writeFile(
      path.join(root, "public/data/players.json"),
      `${JSON.stringify(players, null, 2)}\n`
    );
    await writeJson(path.join(root, "data-quality/rating-backfill-report.json"), report);
    console.log(`\nWrote public/data/players.json + data-quality/rating-backfill-report.json`);
  } else {
    console.log(`\nDry run — pass --write to update players.json. Sample changes:`);
    report.matched.slice(0, 8).forEach((m) => console.log(`  ${m.before} → ${m.after}  ${m.name} (${m.matched_as})`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
