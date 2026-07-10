export type ShotDirection = "left" | "center" | "right";

// Flavour text describing where a scored penalty went. Mirrors the on-screen
// ball animation: left/right tuck high into the side of the net, center goes
// straight down the middle (a Panenka-style finish).
export function describeGoalDirection(dir: ShotDirection): string {
  if (dir === "left") return "Top-left corner!";
  if (dir === "right") return "Top-right corner!";
  return "Panenka — straight down the middle!";
}

// Flavour text for a missed penalty: center misses sail over the bar, side
// misses go wide of the post.
export function describeMissDirection(dir: ShotDirection): string {
  if (dir === "center") return "Over the bar!";
  return "Wide of the post!";
}

// Vertical placement for the 6-zone aim mode. Height is layered on top of the
// L/C/R side: high shots are unsaveable but riskier, low shots are safer to
// hit but reachable by a keeper who guesses the right side.
export type ShotHeight = "high" | "low";

const SIDE_WORD: Record<ShotDirection, string> = { left: "left", center: "middle", right: "right" };

export function describePlacedGoal(dir: ShotDirection, height: ShotHeight): string {
  if (dir === "center") return height === "high" ? "Roofed it down the middle!" : "Straight down the middle!";
  return height === "high" ? `Top-${dir} corner — unstoppable!` : `Low into the ${dir} corner!`;
}

export function describePlacedMiss(dir: ShotDirection, height: ShotHeight): string {
  if (height === "high") return dir === "center" ? "Skied it over the bar!" : `Dragged it over the ${SIDE_WORD[dir]}!`;
  return dir === "center" ? "Scuffed straight at goal!" : `Pushed wide of the ${dir} post!`;
}
