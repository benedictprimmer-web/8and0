import type { EightZeroData } from "./data";
import type { EightZeroPlayer } from "./types";

// ── Live Ratings ─────────────────────────────────────────────────────────────
// A curated "in-form this tournament" layer: real players who are on song get a
// rating bump. Purely a draft-side boost — it never touches the seeded sim path.
// Keyed by player_id (which is the built player's `id`, see data.ts). Add a line
// here to boost another player.

export interface LiveBoost {
  id: number;
  name: string;
  delta: number;
}

export const LIVE_BOOSTS: LiveBoost[] = [
  // Golden Boot race — all level on goals in a record-tying scoring tournament.
  { id: 121, name: "Kylian Mbappe", delta: 4 }, // 93 → 97 · tournament top scorer
  { id: 104, name: "Lionel Messi", delta: 4 }, // 90 → 94 · WC all-time top scorer, 7 in a row
  { id: 284, name: "Erling Haaland", delta: 4 }, // 91 → 95 · brace vs Brazil
  { id: 150, name: "Harry Kane", delta: 3 }, // 91 → 94 · England's WC record scorer
  { id: 149, name: "Jude Bellingham", delta: 4 }, // 91 → 95 · brace vs Mexico
  // France's in-form attack.
  { id: 127, name: "Ousmane Dembele", delta: 4 }, // 87 → 91 · hat-trick vs Norway
  { id: 1009, name: "Michael Olise", delta: 2 }, // 88 → 90
  { id: 492, name: "Vinicius Junior", delta: 3 }, // 87 → 90 · 4 goals for Brazil
  // Morocco.
  { id: 510, name: "Ismael Saibari", delta: 5 }, // 78 → 83
  { id: 72, name: "Achraf Hakimi", delta: 2 }, // 88 → 90
  // Belgium / Spain.
  { id: 249, name: "Youri Tielemans", delta: 2 }, // 84 → 86
  { id: 923, name: "Mikel Oyarzabal", delta: 3 }, // 81 → 84
  // More in-form stars.
  { id: 177, name: "Lamine Yamal", delta: 4 }, // 89 → 93
  { id: 224, name: "Florian Wirtz", delta: 3 }, // 89 → 92
  { id: 270, name: "Viktor Gyokeres", delta: 3 }, // 86 → 89
  { id: 8, name: "Folarin Balogun", delta: 4 }, // 82 → 86
  // Breakout stars of the tournament — the ones who forced their way onto the map.
  { id: 973, name: "Vozinha", delta: 24 }, // 66 → 90 · Cape Verde's shot-stopping hero
  { id: 682, name: "Yan Diomande", delta: 8 }, // 73 → 81 · Ivory Coast, best individual run
  { id: 641, name: "Julio Enciso", delta: 6 }, // 67 → 73 · Paraguay, knocked out Germany
  { id: 412, name: "Johan Manzambi", delta: 5 }, // 73 → 78 · Switzerland breakout
  { id: 428, name: "Nathan Saliba", delta: 5 }, // 71 → 76 · Canada breakout
];

const BOOST_BY_ID: Record<number, number> = Object.fromEntries(
  LIVE_BOOSTS.map((boost) => [boost.id, boost.delta])
);

/** The live-ratings boost for a player id (0 if the player isn't boosted). */
export function liveBoostFor(playerId: number): number {
  return BOOST_BY_ID[playerId] ?? 0;
}

function boostPlayer(player: EightZeroPlayer): EightZeroPlayer {
  const delta = liveBoostFor(player.id);
  return delta ? { ...player, rating: player.rating + delta } : player;
}

/**
 * Return a copy of the game data with in-form boosts applied to player ratings.
 * Teams are unchanged; only player ratings move. Used when the Live Ratings mode
 * is on so every downstream read (candidates, squad, team OVR, and the sim, all
 * of which read `player.rating`) is boosted with no other code path aware of it.
 */
export function applyLiveRatings(data: EightZeroData): EightZeroData {
  // Boost, then re-sort by the NEW rating so in-form players (e.g. Vozinha 66→90)
  // rank where their boosted rating puts them — top of the pool, not their old
  // base spot. Mirrors buildEightZeroData's sort so candidate lists stay ordered.
  const byRating = (a: EightZeroPlayer, b: EightZeroPlayer) =>
    b.rating - a.rating || a.name.localeCompare(b.name);
  const playersByTeam = new Map<number, EightZeroPlayer[]>();
  for (const [teamId, teamPlayers] of data.playersByTeam) {
    playersByTeam.set(teamId, teamPlayers.map(boostPlayer).sort(byRating));
  }
  return {
    teams: data.teams,
    players: data.players.map(boostPlayer).sort(byRating),
    playersByTeam,
    teamById: data.teamById,
  };
}
