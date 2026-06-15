import type { EightZeroPlayer } from "./types";

// A named penalty taker / keeper with their real rating. Drives both the
// probability model (rating) and the on-screen "X steps up" narration (name).
export interface PenaltyTaker {
  name: string;
  rating: number;
}

// Your five (plus depth for sudden death) penalty takers: your highest-rated
// outfield players, best first. Goalkeepers are excluded — they keep the goal,
// they don't take the run-of-play kicks. Real shootouts send your best strikers
// first, so a straight rating sort matches both realism and intuition.
export function selectPenaltyTakers(players: EightZeroPlayer[]): PenaltyTaker[] {
  return players
    .filter((p) => p.category !== "GK")
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .map((p) => ({ name: p.name, rating: p.rating }));
}

// The team's actual keeper: the highest-rated player in the GK slot. Falls back
// to a synthetic keeper (using fallbackRating) when squad GK data is missing, so
// the shootout still works for practice / incomplete data.
export function selectKeeper(players: EightZeroPlayer[], fallbackRating = 78): PenaltyTaker {
  const keepers = players
    .filter((p) => p.category === "GK")
    .slice()
    .sort((a, b) => b.rating - a.rating);
  if (keepers.length > 0) {
    return { name: keepers[0].name, rating: keepers[0].rating };
  }
  return { name: "Goalkeeper", rating: fallbackRating };
}

// Who takes the nth kick (1-based). Cycles back through the order once everyone
// has taken one, so sudden death keeps pulling your best available taker.
export function takerForKick(takers: PenaltyTaker[], kickNumber: number, fallback: PenaltyTaker): PenaltyTaker {
  if (takers.length === 0) return fallback;
  return takers[(kickNumber - 1) % takers.length];
}
