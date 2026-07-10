// Load a FIFA edition (the sofifa-sourced stefanoleone992 dataset, mirrored on
// GitHub by eddwebster) into a nationality → players index for rating lookups.
//
// Edition → World Cup mapping (closest available snapshot):
//   FIFA 15  → 2014 WC   (FIFA 14 lives only behind Cloudflare; 15 ships Sep'14)
//   FIFA 18  → 2018 WC   (Sep'17, exact fit)
//   FIFA 22  → 2022 WC   (Sep'21; FIFA 23 is not in the mirror)
// The mirror stops at FIFA 22, so there is no current-year (FC25/26) edition
// here — that is the documented gap for the live 2026 squad.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, fetchCached } from "./csv.mjs";
import { normalize, matchFullName, nameTokens } from "./text.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "..", "data-quality", "raw", "fifa");
const MIRROR =
  "https://raw.githubusercontent.com/eddwebster/football_analytics/master/data/fifa/raw";

// `year` = the calendar year the edition's ratings best represent, used to age
// the data toward a target tournament year (see growthAdjust in the backfill).
export const FIFA_EDITIONS = {
  fifa15: { file: "male_players_15.csv", label: "FIFA 15", year: 2014 },
  fifa18: { file: "male_players_18.csv", label: "FIFA 18", year: 2017 },
  fifa22: { file: "male_players_22.csv", label: "FIFA 22", year: 2021 },
};

// Some FIFA nationality labels differ from our team names — normalise both ends
// through this before comparing.
const NATIONALITY_ALIASES = new Map([
  ["korea republic", "south korea"],
  ["china pr", "china"],
  ["ir iran", "iran"],
  ["republic of ireland", "ireland"],
  ["united states", "united states"],
  ["usa", "united states"],
  ["ivory coast", "ivory coast"],
  ["cote divoire", "ivory coast"],
  ["cote d ivoire", "ivory coast"],
  ["czech republic", "czechia"],
  ["czechia", "czechia"],
  ["cape verde islands", "cape verde"],
  ["cape verde", "cape verde"],
  ["dr congo", "dr congo"],
  ["congo dr", "dr congo"],
]);

export function canonicalNationality(value) {
  const n = normalize(value);
  return NATIONALITY_ALIASES.get(n) ?? n;
}

// Age a player's rating from the edition year toward a target tournament year.
// A player who was young in the edition has since developed toward EA's own
// `potential` projection, so we blend overall→potential by how young they were
// and how many years have elapsed. Returns the edition `overall` unchanged when
// the edition is contemporaneous (historical eras) or the player was already
// mature — so it is a no-op exactly when it should be.
export function growthAdjust({ overall, potential, age }, editionYear, targetYear) {
  const gap = (targetYear ?? editionYear) - editionYear;
  if (gap <= 0 || !age || potential <= overall) return overall;
  const youth = Math.max(0, Math.min(0.65, (23 - age) * 0.12)); // 0 at age ≥23
  const elapsed = Math.max(0, Math.min(1, gap / 5)); // full weight at ~5 yrs
  const weight = youth * elapsed;
  return Math.min(potential, Math.round(overall + (potential - overall) * weight));
}

// Find the best FIFA row for a clean "First Last" (or mononym) name within a
// nationality's candidate list. Matches against BOTH long and short name: the
// long name catches full-name variants ("Gio"→"Giovanni Reyna"), the short name
// catches mononyms whose long name is unrelated (Hulk's long name is
// "Givanildo Vieira de Sousa"). matchFullName is directional/surname-anchored so
// short-name matching does NOT reintroduce surname-only collisions.
export function findRatingMatch(candidates, name) {
  const hits = candidates.filter(
    (c) => matchFullName(name, c.longName) || matchFullName(name, c.shortName)
  );
  if (hits.length === 0) return null;
  const exact = hits.find(
    (c) => normalize(c.longName) === normalize(name) || normalize(c.shortName) === normalize(name)
  );
  if (exact) return exact;
  return hits.sort(
    (a, b) => nameTokens(a.longName).length - nameTokens(b.longName).length || b.overall - a.overall
  )[0];
}

// Returns { byNationality: Map<natKey, PlayerRow[]>, edition }.
// PlayerRow = { shortName, longName, overall, age, positions, club, nationality }
export async function loadEdition(edition, { force = false } = {}) {
  const meta = FIFA_EDITIONS[edition];
  if (!meta) throw new Error(`Unknown FIFA edition: ${edition}`);
  const url = `${MIRROR}/${meta.file}`;
  const cachePath = path.join(RAW_DIR, meta.file);
  const csv = await fetchCached(url, cachePath, { force });
  const rows = parseCsv(csv);

  const byNationality = new Map();
  for (const r of rows) {
    const overall = Number(r.overall);
    if (!Number.isFinite(overall)) continue;
    const player = {
      shortName: r.short_name ?? "",
      longName: r.long_name ?? "",
      overall,
      potential: Number(r.potential) || overall,
      age: Number(r.age) || null,
      positions: (r.player_positions ?? "").split(",").map((p) => p.trim()).filter(Boolean),
      club: r.club_name ?? "",
      nationality: r.nationality_name ?? "",
    };
    const natKey = canonicalNationality(player.nationality);
    if (!byNationality.has(natKey)) byNationality.set(natKey, []);
    byNationality.get(natKey).push(player);
  }
  return { byNationality, edition, label: meta.label };
}
