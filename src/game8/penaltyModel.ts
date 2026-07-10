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
// One crosshair sweeps across the goal; the shooter taps to place the ball at
// xShot (0 = left post, 1 = right post). Timing IS the aim. Tucking it tight to
// a post beats a keeper who dived that way but risks dragging it wide; placing
// it where the keeper goes gets saved; a safe central shot stays on target but
// the keeper is more likely to be standing there.
const KEEPER_X: Record<ShotDirection, number> = { left: 0.2, center: 0.5, right: 0.8 };
const KEEPER_REACH = 0.22; // how far around the dive point the keeper can cover

export function resolveAimedKick(
  xShot: number,
  keeperDirection: ShotDirection,
  shooterRating: number,
  keeperRating: number,
  rng: () => number
): KickOutcome {
  const x = clamp(xShot, 0, 1);
  const edge = Math.min(x, 1 - x); // 0 = on a post, 0.5 = dead centre
  // Aiming inside ~0.14 of a post risks dragging it wide; better takers less so.
  const cornerRisk = Math.max(0, 0.14 - edge) / 0.14; // 0..1
  if (rng() < clamp(missChance(shooterRating) + cornerRisk * 0.35, 0.03, 0.5)) return "missed";
  // The keeper only reaches shots within KEEPER_REACH of where they dived; the
  // closer to their hands, the likelier the save.
  const dist = Math.abs(x - KEEPER_X[keeperDirection]);
  if (dist < KEEPER_REACH && rng() < saveChanceWhenCorrect(keeperRating) * (1 - dist / KEEPER_REACH)) {
    return "saved";
  }
  return "goal";
}
