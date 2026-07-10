import type { EightZeroData } from "./data";
import type { EightZeroPlayer, EightZeroTeam, LegendMode, SlotCategory } from "./types";

// ── Last Dance legends ────────────────────────────────────────────────────────
// Curated all-time greats you can lock as your first pick. Ratings are EA FC
// "Icon" peak-career values (approx — Icon cards vary by promo; these are the
// well-known peak overalls), deliberately elite so a legend is a real anchor.
//
// Two kinds:
//   - live:   still in the 2026 squad data (Messi/Ronaldo/Neymar) — resolved
//             from live players so their existing sim tuning is untouched.
//   - synthetic: retired greats, materialised from the fields here.
//
// Legends never enter the random spin pool (Icon ratings would dominate a draw);
// they are only ever the pre-locked Last Dance pick.

export interface Legend {
  id: string;
  name: string;
  nation: string; // FIFA/ISO code used for the flag
  nationName: string;
  category: SlotCategory;
  position: string;
  rating: number; // EA FC Icon peak overall
  club: string; // iconic club, for flavour + chemistry display
  // Senior career clubs, snapshot (iconic) club first — must equal `club`.
  // Powers career-club chemistry (e.g. Zidane links a Juventus player). Spelling
  // is normalised by chemistry's clubKey, so natural forms are fine.
  clubHistory: string[];
  live?: boolean; // true → resolve from current squad data instead of synthesising
  match?: (name: string) => boolean; // name test for live legends
}

export const LEGENDS: Legend[] = [
  // Live (active, in the 2026 data) — behaviour preserved from the original mode.
  { id: "messi", name: "Lionel Messi", nation: "ARG", nationName: "Argentina", category: "FWD", position: "RW", rating: 90, club: "Inter Miami", clubHistory: ["Inter Miami", "Barcelona", "Paris Saint-Germain"], live: true, match: (n) => n.includes("Messi") },
  { id: "ronaldo", name: "Cristiano Ronaldo", nation: "POR", nationName: "Portugal", category: "FWD", position: "ST", rating: 88, club: "Al Nassr", clubHistory: ["Al Nassr", "Real Madrid", "Manchester United", "Juventus", "Sporting CP"], live: true, match: (n) => n.includes("Ronaldo") },
  { id: "neymar", name: "Neymar", nation: "BRA", nationName: "Brazil", category: "MID", position: "LW", rating: 87, club: "Santos", clubHistory: ["Santos", "Barcelona", "Paris Saint-Germain", "Al Hilal"], live: true, match: (n) => n.includes("Neymar") },

  // Synthetic (retired) — Icon peak ratings.
  { id: "pele", name: "Pelé", nation: "BRA", nationName: "Brazil", category: "FWD", position: "FW", rating: 95, club: "Santos", clubHistory: ["Santos", "New York Cosmos"] },
  { id: "maradona", name: "Diego Maradona", nation: "ARG", nationName: "Argentina", category: "MID", position: "CAM", rating: 95, club: "Napoli", clubHistory: ["Napoli", "Barcelona", "Boca Juniors"] },
  { id: "zidane", name: "Zinedine Zidane", nation: "FRA", nationName: "France", category: "MID", position: "CAM", rating: 96, club: "Real Madrid", clubHistory: ["Real Madrid", "Juventus", "Bordeaux"] },
  { id: "r9", name: "Ronaldo Nazário", nation: "BRA", nationName: "Brazil", category: "FWD", position: "ST", rating: 96, club: "Real Madrid", clubHistory: ["Real Madrid", "Inter", "Barcelona", "AC Milan", "PSV"] },
  { id: "ronaldinho", name: "Ronaldinho", nation: "BRA", nationName: "Brazil", category: "FWD", position: "LW", rating: 94, club: "Barcelona", clubHistory: ["Barcelona", "AC Milan", "Paris Saint-Germain", "Flamengo"] },
  { id: "cruyff", name: "Johan Cruyff", nation: "NLD", nationName: "Netherlands", category: "FWD", position: "CF", rating: 95, club: "Ajax", clubHistory: ["Ajax", "Barcelona"] },
  { id: "henry", name: "Thierry Henry", nation: "FRA", nationName: "France", category: "FWD", position: "ST", rating: 94, club: "Arsenal", clubHistory: ["Arsenal", "Barcelona", "Juventus", "Monaco"] },
  { id: "romario", name: "Romário", nation: "BRA", nationName: "Brazil", category: "FWD", position: "ST", rating: 92, club: "Barcelona", clubHistory: ["Barcelona", "PSV", "Flamengo", "Vasco da Gama"] },
  { id: "gerdmuller", name: "Gerd Müller", nation: "DEU", nationName: "Germany", category: "FWD", position: "ST", rating: 92, club: "Bayern München", clubHistory: ["Bayern München"] },
  { id: "eusebio", name: "Eusébio", nation: "PRT", nationName: "Portugal", category: "FWD", position: "ST", rating: 91, club: "Benfica", clubHistory: ["Benfica"] },
  { id: "klose", name: "Miroslav Klose", nation: "DEU", nationName: "Germany", category: "FWD", position: "ST", rating: 88, club: "Lazio", clubHistory: ["Lazio", "Bayern Munich", "Werder Bremen"] },
  { id: "zico", name: "Zico", nation: "BRA", nationName: "Brazil", category: "MID", position: "CAM", rating: 91, club: "Flamengo", clubHistory: ["Flamengo", "Udinese"] },
  { id: "xavi", name: "Xavi", nation: "ESP", nationName: "Spain", category: "MID", position: "CM", rating: 91, club: "Barcelona", clubHistory: ["Barcelona", "Al Sadd"] },
  { id: "iniesta", name: "Andrés Iniesta", nation: "ESP", nationName: "Spain", category: "MID", position: "CAM", rating: 92, club: "Barcelona", clubHistory: ["Barcelona", "Vissel Kobe"] },
  { id: "pirlo", name: "Andrea Pirlo", nation: "ITA", nationName: "Italy", category: "MID", position: "CM", rating: 91, club: "Juventus", clubHistory: ["Juventus", "AC Milan", "Inter", "Brescia"] },
  { id: "kroos", name: "Toni Kroos", nation: "DEU", nationName: "Germany", category: "MID", position: "CM", rating: 90, club: "Real Madrid", clubHistory: ["Real Madrid", "Bayern Munich", "Bayer Leverkusen"] },
  { id: "maldini", name: "Paolo Maldini", nation: "ITA", nationName: "Italy", category: "DEF", position: "CB", rating: 93, club: "AC Milan", clubHistory: ["AC Milan"] },
  { id: "beckenbauer", name: "Franz Beckenbauer", nation: "DEU", nationName: "Germany", category: "DEF", position: "CB", rating: 92, club: "Bayern München", clubHistory: ["Bayern München", "New York Cosmos", "Hamburger SV"] },
  { id: "cannavaro", name: "Fabio Cannavaro", nation: "ITA", nationName: "Italy", category: "DEF", position: "CB", rating: 90, club: "Real Madrid", clubHistory: ["Real Madrid", "Juventus", "Inter", "Napoli", "Parma"] },
  { id: "puyol", name: "Carles Puyol", nation: "ESP", nationName: "Spain", category: "DEF", position: "CB", rating: 89, club: "Barcelona", clubHistory: ["Barcelona"] },
  { id: "cafu", name: "Cafu", nation: "BRA", nationName: "Brazil", category: "DEF", position: "RB", rating: 91, club: "AC Milan", clubHistory: ["AC Milan", "Roma", "Palmeiras", "São Paulo"] },
  { id: "robertocarlos", name: "Roberto Carlos", nation: "BRA", nationName: "Brazil", category: "DEF", position: "LB", rating: 91, club: "Real Madrid", clubHistory: ["Real Madrid", "Inter", "Palmeiras"] },
  { id: "buffon", name: "Gianluigi Buffon", nation: "ITA", nationName: "Italy", category: "GK", position: "GK", rating: 92, club: "Juventus", clubHistory: ["Juventus", "Paris Saint-Germain", "Parma"] },
  { id: "casillas", name: "Iker Casillas", nation: "ESP", nationName: "Spain", category: "GK", position: "GK", rating: 91, club: "Real Madrid", clubHistory: ["Real Madrid", "Porto"] },
];

const LEGEND_BY_ID = new Map(LEGENDS.map((l) => [l.id, l]));

export function getLegend(mode: LegendMode): Legend | null {
  return mode === "none" ? null : LEGEND_BY_ID.get(mode) ?? null;
}

// Synthetic id/team namespaces, well clear of real 2026 ids (<10k) and
// historical ids (100k+).
const LEGEND_PLAYER_ID_BASE = 800000;
const LEGEND_TEAM_ID_BASE = 8000;

function legendIndex(id: string): number {
  return LEGENDS.findIndex((l) => l.id === id);
}

// A standalone team for a synthetic legend, so the pick renders a nation + flag
// without depending on that nation being present in the current era's data.
function legendTeam(legend: Legend): EightZeroTeam {
  return {
    teamId: LEGEND_TEAM_ID_BASE + legendIndex(legend.id),
    name: legend.nationName,
    fifaCode: legend.nation,
    group: null,
    ranking: null,
    elo: 1500 + (legend.rating - 75) * 25,
  };
}

// Resolve a legend to a draftable player + its spin team. Live legends reuse
// their real squad entry (and real team); synthetic legends are materialised.
export function resolveLegend(
  legend: Legend,
  data: EightZeroData
): { player: EightZeroPlayer; team: EightZeroTeam } | null {
  if (legend.live) {
    const match = legend.match;
    const player = data.players.find((p) => p.teamCode === legend.nation && (match ? match(p.name) : false));
    if (player) {
      const team = data.teamById.get(player.teamId) ?? legendTeam(legend);
      // Tag a copy so chemistry sees the legend boost + career clubs; the real
      // squad entry in the spin pool stays untouched.
      return { player: { ...player, isLegend: true, clubHistory: legend.clubHistory }, team };
    }
    // Live legend not in this era's data (e.g. Messi in a 2014 draft) — fall
    // through to synthesis from the table so the pick still locks.
  }
  const team = legendTeam(legend);
  const player: EightZeroPlayer = {
    id: LEGEND_PLAYER_ID_BASE + legendIndex(legend.id),
    teamId: team.teamId,
    teamName: team.name,
    teamCode: team.fifaCode,
    name: legend.name,
    position: legend.position,
    category: legend.category,
    rating: legend.rating,
    clubName: legend.club,
    clubHistory: legend.clubHistory,
    isLegend: true,
    aura: Math.round((legend.rating / 100) * 1000) / 1000,
    shirtNumber: 10,
  };
  return { player, team };
}
