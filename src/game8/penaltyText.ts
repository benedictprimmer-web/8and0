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
