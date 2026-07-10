import type { EightZeroPlayer, EightZeroTeam, SlotCategory } from "./types";

export interface RawTeam {
  team_id: number;
  name: string;
  fifa_code: string;
  wc2026_group: string | null;
  fifa_ranking: number | null;
  elo: number | null;
  qualified_2026: boolean;
}

export interface RawPlayer {
  player_id: number;
  team_id: number;
  fifa_code: string;
  name: string;
  position: string;
  is_goalkeeper: boolean;
  club_name: string | null;
  ea_overall: number | null;
  aura_composite: number | null;
  shirt_number: number | null;
}

export interface EightZeroData {
  teams: EightZeroTeam[];
  players: EightZeroPlayer[];
  playersByTeam: Map<number, EightZeroPlayer[]>;
  teamById: Map<number, EightZeroTeam>;
}

const POSITION_CATEGORY: Record<string, SlotCategory> = {
  GK: "GK",
  DF: "DEF",
  DEF: "DEF",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  MF: "MID",
  MID: "MID",
  CM: "MID",
  DM: "MID",
  AM: "MID",
  FW: "FWD",
  FWD: "FWD",
  ST: "FWD",
  CF: "FWD",
  LW: "FWD",
  RW: "FWD",
};

export function mapPositionCategory(position: string, isGoalkeeper = false): SlotCategory | null {
  if (isGoalkeeper) return "GK";
  const token = position.trim().toUpperCase();
  return POSITION_CATEGORY[token] ?? null;
}

// Historical eras use ISO codes (DEU, NLD) where 2026 uses FIFA codes (GER,
// NED). Fold them together so a nation is one entry in the all-time pool.
const NATION_CANON: Record<string, string> = {
  DEU: "GER", NLD: "NED", CHE: "SUI", CHL: "CHI", GRC: "GRE", URY: "URU",
  CRI: "CRC", HND: "HON", PRT: "POR", DZA: "ALG", SAU: "KSA", DNK: "DEN",
};
function canonNation(code: string): string {
  return NATION_CANON[code?.toUpperCase()] ?? code?.toUpperCase() ?? code;
}

// Dream Team pool: merge every era's players (plus any extra players, e.g.
// legends) into ONE team per nation, so spinning "Brazil" offers its all-time
// greats across eras. Same-name players are deduped to their highest-rated
// version. Ratings across FIFA editions aren't perfectly comparable — this is a
// for-fun mode, not the accuracy-critical 2026 model.
export function buildAllTimeData(
  sources: Array<{ teams: RawTeam[]; players: RawPlayer[] }>,
  extraPlayers: RawPlayer[] = []
): EightZeroData {
  const nationElo = new Map<string, { name: string; elo: number }>();
  for (const src of sources) {
    for (const t of src.teams) {
      if (typeof t.elo !== "number") continue;
      const key = canonNation(t.fifa_code);
      const prev = nationElo.get(key);
      if (!prev || t.elo > prev.elo) nationElo.set(key, { name: prev?.name ?? t.name, elo: t.elo });
    }
  }

  // Best version of each (nation, name) player. Normalise the name key hard
  // (strip accents + punctuation) so cross-source spelling variants collapse
  // ("Salem Al Dawsari" == "Salem Al-Dawsari").
  const nameKey = (name: string) =>
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  const best = new Map<string, RawPlayer>();
  const allPlayers = [...sources.flatMap((s) => s.players), ...extraPlayers];
  for (const p of allPlayers) {
    if (typeof p.ea_overall !== "number") continue;
    const nation = canonNation(p.fifa_code);
    const key = `${nation}:${nameKey(p.name)}`;
    const prev = best.get(key);
    if (!prev || (p.ea_overall ?? 0) > (prev.ea_overall ?? 0)) best.set(key, p);
  }

  // One synthetic team per nation; re-point every player to it.
  const nationTeamId = new Map<string, number>();
  const teams: RawTeam[] = [];
  let nextTeamId = 700000;
  for (const [nation, meta] of nationElo) {
    const id = nextTeamId++;
    nationTeamId.set(nation, id);
    teams.push({
      team_id: id,
      name: meta.name,
      fifa_code: nation,
      wc2026_group: null,
      fifa_ranking: null,
      elo: meta.elo,
      qualified_2026: true,
    });
  }

  const players: RawPlayer[] = [];
  for (const p of best.values()) {
    const nation = canonNation(p.fifa_code);
    const teamId = nationTeamId.get(nation);
    if (teamId === undefined) continue; // nation had no elo (shouldn't happen)
    players.push({ ...p, team_id: teamId, fifa_code: nation });
  }

  return buildEightZeroData(teams, players);
}

export function buildEightZeroData(rawTeams: RawTeam[], rawPlayers: RawPlayer[]): EightZeroData {
  const teams = rawTeams
    .filter((team) => team.qualified_2026 && typeof team.elo === "number")
    .map<EightZeroTeam>((team) => ({
      teamId: team.team_id,
      name: team.name,
      fifaCode: team.fifa_code,
      group: team.wc2026_group,
      ranking: team.fifa_ranking,
      elo: team.elo ?? 1450,
    }));

  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const players = rawPlayers
    .map<EightZeroPlayer | null>((player) => {
      const team = teamById.get(player.team_id);
      const category = mapPositionCategory(player.position, player.is_goalkeeper);
      if (!team || !category || typeof player.ea_overall !== "number" || player.ea_overall <= 0) {
        return null;
      }
      return {
        id: player.player_id,
        teamId: player.team_id,
        teamName: team.name,
        teamCode: team.fifaCode,
        name: player.name,
        position: player.position,
        category,
        rating: player.ea_overall,
        clubName: player.club_name,
        aura: player.aura_composite,
        shirtNumber: player.shirt_number,
      };
    })
    .filter((player): player is EightZeroPlayer => player !== null);

  const playersByTeam = new Map<number, EightZeroPlayer[]>();
  for (const player of players) {
    const current = playersByTeam.get(player.teamId) ?? [];
    current.push(player);
    playersByTeam.set(player.teamId, current);
  }

  for (const [teamId, teamPlayers] of playersByTeam.entries()) {
    playersByTeam.set(
      teamId,
      [...teamPlayers].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    );
  }

  return {
    teams: teams.filter((team) => (playersByTeam.get(team.teamId)?.length ?? 0) > 0),
    players,
    playersByTeam,
    teamById,
  };
}
