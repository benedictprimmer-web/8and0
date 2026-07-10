#!/usr/bin/env node
/**
 * Part B — build historical starting-XI rosters + era-accurate team strength for
 * the 2014, 2018 and 2022 World Cups.
 *
 * Sources (both fetchable without hitting a Cloudflare wall):
 *   - Rosters/appearances: jfjelstul/worldcup (open dataset, MIT). The starting
 *     XI per team per tournament = the 11 players with the most match STARTS —
 *     deterministic, no manual curation.
 *   - Ratings: the sofifa-sourced FIFA editions mirrored by eddwebster —
 *     FIFA 15 (2014), FIFA 18 (2018), FIFA 22 (2022). Each edition is roughly
 *     contemporaneous with its tournament, so the growth adjustment is ~a no-op.
 *
 * Team strength (elo) is derived from the mean of each XI's real ratings, mapped
 * onto the game's ~1200–2100 elo scale (the scale simulate.ts assumes when it
 * turns elo into a GK rating). Self-consistent: opponent difficulty tracks the
 * same ratings the drafted players carry.
 *
 * Outputs: public/data/historical-players.json + historical-teams.json
 *
 *   node scripts/build-historical-data.mjs [--force]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCached, parseCsv, writeJson } from "./lib/csv.mjs";
import { loadEdition, canonicalNationality, growthAdjust, findRatingMatch, FIFA_EDITIONS } from "./lib/fifa.mjs";

// jfjelstul uses the literal string "not applicable" as a null placeholder for a
// missing given/family name (mononym players: Neymar, Hulk, Marcelo…). Strip it
// so the name is the real mononym, not "not applicable Oscar".
function cleanNamePart(part) {
  const v = (part ?? "").trim();
  return /^not applicable$/i.test(v) ? "" : v;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const force = process.argv.includes("--force");

const APPEARANCES_URL =
  "https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/player_appearances.csv";

// era → { jfjelstul tournament id, FIFA edition, tournament year }
const ERAS = [
  { year: 2014, tournament: "WC-2014", edition: "fifa15" },
  { year: 2018, tournament: "WC-2018", edition: "fifa18" },
  { year: 2022, tournament: "WC-2022", edition: "fifa22" },
];

// jfjelstul uses detailed position codes (CB, LWB, AM…) — collapse to the game's
// four groups.
function positionGroup(code, name) {
  const c = (code || "").toUpperCase();
  if (c === "GK" || /goal/i.test(name)) return "GK";
  if (/^(CB|LB|RB|LWB|RWB|SW|DF)$/.test(c) || /defen/i.test(name)) return "DF";
  if (/^(CM|DM|AM|LM|RM|MF|CDM|CAM)$/.test(c) || /midfield/i.test(name)) return "MF";
  if (/^(CF|ST|LF|RF|LW|RW|FW|SS)$/.test(c) || /forward|strik/i.test(name)) return "FW";
  return "MF"; // safe default
}

// Map a mean XI rating onto the game's elo scale (elo=1200 → GK≈60,
// elo≈2025 → GK≈87 in simulate.ts). Anchored so an elite ~85 XI ≈ 2025 and a
// weak ~66 XI ≈ 1400.
function ratingToElo(meanRating) {
  return Math.round(1200 + (meanRating - 60) * 33);
}

function startingXI(teamRows) {
  const byPlayer = new Map();
  for (const r of teamRows) {
    const id = r.player_id;
    if (!byPlayer.has(id)) {
      byPlayer.set(id, {
        name: `${cleanNamePart(r.given_name)} ${cleanNamePart(r.family_name)}`.trim(),
        group: positionGroup(r.position_code, r.position_name),
        shirt: Number(r.shirt_number) || 99,
        starts: 0,
        apps: 0,
      });
    }
    const p = byPlayer.get(id);
    p.apps += 1;
    if (r.starter === "1") p.starts += 1;
  }
  // Most starts, then most apps, then lowest shirt number (stable/deterministic).
  return [...byPlayer.values()]
    .sort((a, b) => b.starts - a.starts || b.apps - a.apps || a.shirt - b.shirt)
    .slice(0, 11);
}

function estimateHistoricalRating(group, teamMeanSoFar) {
  // Only used when a player has no FIFA card (older/obscure). Anchor near the
  // team's own average, nudged by position; capped so it never invents a star.
  const base = Number.isFinite(teamMeanSoFar) ? teamMeanSoFar : 72;
  const posAdj = group === "FW" ? 1 : group === "GK" ? -1 : 0;
  return Math.max(58, Math.min(80, Math.round(base + posAdj - 2)));
}

async function main() {
  const csv = await fetchCached(
    APPEARANCES_URL,
    path.join(root, "data-quality/raw/worldcup/player_appearances.csv"),
    { force }
  );
  const appearances = parseCsv(csv);

  const players = [];
  const teams = [];
  const unmatched = [];
  let playerId = 100000; // historical id namespace, well clear of the 2026 ids
  let teamId = 9000;

  for (const era of ERAS) {
    const { byNationality } = await loadEdition(era.edition, { force });
    const editionYear = FIFA_EDITIONS[era.edition].year;
    const eraRows = appearances.filter((r) => r.tournament_id === era.tournament);

    // Group appearances by team.
    const byTeam = new Map();
    for (const r of eraRows) {
      if (!byTeam.has(r.team_code)) byTeam.set(r.team_code, { name: r.team_name, rows: [] });
      byTeam.get(r.team_code).rows.push(r);
    }

    for (const [code, { name, rows }] of byTeam) {
      const xi = startingXI(rows);
      if (xi.length < 11) continue; // skip incomplete data defensively

      const natKey = canonicalNationality(name);
      const candidates = byNationality.get(natKey) ?? [];
      const teamPlayers = [];
      let ratingSum = 0;

      // Pass 1: resolve real ratings so the fallback can anchor to actual data,
      // not a self-referential running mean. Anchor to this team's sourced
      // average, or a neutral 71 when the whole XI is unmatched (native-script
      // squads like Japan/Qatar the mirror can't name-match).
      const resolved = xi.map((p) => {
        const hit = findRatingMatch(candidates, p.name);
        return hit
          ? { p, rating: growthAdjust(hit, editionYear, era.year), club: hit.club || null, sourced: true }
          : { p, sourced: false };
      });
      const sourcedRatings = resolved.filter((r) => r.sourced).map((r) => r.rating);
      const anchor = sourcedRatings.length
        ? sourcedRatings.reduce((a, b) => a + b, 0) / sourcedRatings.length
        : 71;

      resolved.forEach((r) => {
        const p = r.p;
        let rating;
        let confidence;
        let club = null;
        let source;
        if (r.sourced) {
          rating = r.rating;
          confidence = "sourced";
          club = r.club;
          source = `sofifa ${era.edition}`;
        } else {
          rating = estimateHistoricalRating(p.group, anchor);
          confidence = "estimated";
          source = "estimated: no FIFA card";
          unmatched.push({ era: era.year, team: code, name: p.name });
        }
        ratingSum += rating;

        teamPlayers.push({
          player_id: playerId++,
          team_id: teamId,
          fifa_code: code,
          name: p.name,
          position: p.group,
          is_goalkeeper: p.group === "GK",
          club_name: club,
          ea_overall: rating,
          aura_composite: Math.round((rating / 100) * 1000) / 1000,
          tournament_year: era.year,
          source_game: era.edition,
          rating_source: source,
          rating_confidence: confidence,
          shirt_number: p.shirt === 99 ? null : p.shirt,
        });
      });

      const meanRating = ratingSum / teamPlayers.length;
      teams.push({
        team_id: teamId,
        name,
        fifa_code: code,
        tournament_year: era.year,
        // Mirror the RawTeam shape so buildEightZeroData consumes historical
        // teams unchanged. `qualified_2026:true` here just means "in this era's
        // field"; group/ranking are 2026-only concepts, left null.
        wc2026_group: null,
        fifa_ranking: null,
        qualified_2026: true,
        mean_xi_rating: Math.round(meanRating * 10) / 10,
        elo: ratingToElo(meanRating),
      });
      players.push(...teamPlayers);
      teamId += 1;
    }
  }

  await writeJson(path.join(root, "public/data/historical-players.json"), players);
  await writeJson(path.join(root, "public/data/historical-teams.json"), teams);
  await writeJson(path.join(root, "data-quality/historical-mismatches.json"), {
    generated_at: null,
    unmatched_count: unmatched.length,
    unmatched,
  });

  const byEra = {};
  for (const t of teams) byEra[t.tournament_year] = (byEra[t.tournament_year] ?? 0) + 1;
  console.log(`Historical data built:`);
  console.log(`  players: ${players.length}  teams: ${teams.length}  (${JSON.stringify(byEra)})`);
  console.log(`  unmatched (estimated): ${unmatched.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
