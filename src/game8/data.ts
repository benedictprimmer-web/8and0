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
