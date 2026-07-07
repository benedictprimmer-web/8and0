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
  { id: 104, name: "Lionel Messi", delta: 3 },
  { id: 973, name: 'Josimar Dias "Vozinha"', delta: 15 },
  { id: 284, name: "Erling Haaland", delta: 3 },
  { id: 121, name: "Kylian Mbappe", delta: 4 },
  { id: 72, name: "Achraf Hakimi", delta: 2 },
  { id: 150, name: "Harry Kane", delta: 3 },
  { id: 149, name: "Jude Bellingham", delta: 4 },
  { id: 510, name: "Ismael Saibari", delta: 5 },
  { id: 249, name: "Youri Tielemans", delta: 2 },
  { id: 923, name: "Mikel Oyarzabal", delta: 3 },
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
  const playersByTeam = new Map<number, EightZeroPlayer[]>();
  for (const [teamId, teamPlayers] of data.playersByTeam) {
    playersByTeam.set(teamId, teamPlayers.map(boostPlayer));
  }
  return {
    teams: data.teams,
    players: data.players.map(boostPlayer),
    playersByTeam,
    teamById: data.teamById,
  };
}
