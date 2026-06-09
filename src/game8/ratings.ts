import type { DraftPick, TeamRatings } from "./types";

function avg(values: number[], fallback = 0): number {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateTeamRatings(picks: DraftPick[]): TeamRatings {
  const gk = avg(picks.filter((pick) => pick.category === "GK").map((pick) => pick.player.rating), 65);
  const defence = avg(picks.filter((pick) => pick.category === "DEF").map((pick) => pick.player.rating), 65);
  const midfield = avg(picks.filter((pick) => pick.category === "MID").map((pick) => pick.player.rating), 65);
  const attack = avg(picks.filter((pick) => pick.category === "FWD").map((pick) => pick.player.rating), 65);
  const overall = gk * 0.16 + defence * 0.28 + midfield * 0.29 + attack * 0.27;

  return {
    overall: Math.round(overall * 10) / 10,
    gk: Math.round(gk * 10) / 10,
    defence: Math.round(defence * 10) / 10,
    midfield: Math.round(midfield * 10) / 10,
    attack: Math.round(attack * 10) / 10,
  };
}

export function gradeRun(wins: number, draws: number, losses: number, rating: number): { grade: string; label: string } {
  if (wins === 8 && losses === 0 && draws === 0) return { grade: "S+", label: "Perfect 8-0" };
  if (wins >= 7 && losses === 0) return { grade: "S", label: "Final boss XI" };
  if (wins >= 6) return { grade: "A", label: "Tournament contender" };
  if (wins >= 5) return { grade: "B", label: "Deep run" };
  if (wins >= 3 || rating >= 82) return { grade: "C", label: "Nearly clicked" };
  return { grade: "D", label: "Back to the spin" };
}
