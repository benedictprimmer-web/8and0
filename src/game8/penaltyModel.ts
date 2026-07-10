import { clamp } from "./random";
import type { ShotDirection, ShotHeight } from "./penaltyText";

export type KickOutcome = "goal" | "saved" | "missed";

// Average rating used for AI penalty takers / opponents.
export const OPPONENT_SHOOTER_RATING = 80;

// AI shooters favour the corners; keepers lean slightly toward the middle.
export const SHOOTER_CENTER_WEIGHT = 0.2;

// Chance a penalty is dragged wide / over the bar — purely down to the taker.
// Better takers miss less (~3% elite, ~12% poor).
export function missChance(shooterRating: number): number {
  return clamp(0.1 - (shooterRating - 70) * 0.003, 0.03, 0.12);
}

// Chance a keeper saves when they dive the SAME way as the shot, scaled by
// rating (~30% weak keeper, ~80% elite). Diving the wrong way never saves.
export function saveChanceWhenCorrect(keeperRating: number): number {
  return clamp(0.45 + (keeperRating - 70) * 0.01, 0.3, 0.8);
}

// How often a keeper guesses "center" (the remaining mass splits evenly between
// the two sides). Better keepers cover the middle a little more.
export function keeperCenterWeight(keeperRating: number): number {
  return clamp(0.3 + (keeperRating - 70) * 0.004, 0.25, 0.45);
}

// Pick a direction given the probability mass placed on "center".
export function pickDirection(centerWeight: number, rng: () => number): ShotDirection {
  const side = (1 - centerWeight) / 2;
  const r = rng();
  if (r < side) return "left";
  if (r < side * 2) return "right";
  return "center";
}

// Resolve a penalty outcome. A miss is independent of the keeper; otherwise the
// keeper can only save by diving the same way as the shot, with a rating-scaled
// chance. Consumes the RNG in a fixed order (miss roll, then save roll) so the
// result is deterministic for a given RNG sequence.
export function resolveKick(
  shotDirection: ShotDirection,
  keeperDirection: ShotDirection,
  shooterRating: number,
  keeperRating: number,
  rng: () => number
): KickOutcome {
  if (rng() < missChance(shooterRating)) return "missed";
  if (shotDirection === keeperDirection && rng() < saveChanceWhenCorrect(keeperRating)) {
    return "saved";
  }
  return "goal";
}

// --- 6-zone aim mode -------------------------------------------------------
// Adds a vertical axis to placement. Aiming HIGH roughly doubles the miss
// chance (skying it) but is unsaveable — a keeper who commits to the right side
// still can't reach the top corner. Aiming LOW is safe from skying but the
// keeper saves it on a correct-side dive, exactly like the classic model.
export function missChanceHeight(shooterRating: number, height: ShotHeight): number {
  const base = missChance(shooterRating);
  return height === "high" ? clamp(base * 2, 0.06, 0.28) : base;
}

export function resolvePlacedKick(
  side: ShotDirection,
  height: ShotHeight,
  keeperDirection: ShotDirection,
  shooterRating: number,
  keeperRating: number,
  rng: () => number
): KickOutcome {
  if (rng() < missChanceHeight(shooterRating, height)) return "missed";
  if (height === "low" && side === keeperDirection && rng() < saveChanceWhenCorrect(keeperRating)) {
    return "saved";
  }
  return "goal";
}

// --- power / placement aim mode --------------------------------------------
// The shooter picks a side, then times an accuracy meter (0 = mishit, 1 =
// perfect). Poor accuracy inflates the miss chance and leaves the shot weak
// enough for a correct-guessing keeper to save; perfect accuracy tucks it away.
export function resolvePoweredKick(
  side: ShotDirection,
  keeperDirection: ShotDirection,
  shooterRating: number,
  keeperRating: number,
  accuracy: number,
  rng: () => number
): KickOutcome {
  const acc = clamp(accuracy, 0, 1);
  if (rng() < clamp(missChance(shooterRating) * (1 + (1 - acc) * 3), 0.03, 0.6)) return "missed";
  if (side === keeperDirection && rng() < saveChanceWhenCorrect(keeperRating) * (1 - acc * 0.7)) {
    return "saved";
  }
  return "goal";
}
