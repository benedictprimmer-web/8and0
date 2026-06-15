export type ShootoutTeam = "user" | "opponent";

// Each side takes five kicks in regulation before sudden death begins.
export const REGULATION_KICKS = 5;

export interface ShootoutScore {
  userScore: number;
  oppScore: number;
  userKicks: number;
  oppKicks: number;
}

export interface ShootoutStatus {
  decided: boolean;
  winner: ShootoutTeam | null;
  // True while the shootout is being played under sudden-death rules and is not
  // yet decided (both teams have used their five regulation kicks).
  suddenDeath: boolean;
  // Which team takes the next kick (teams alternate, user first each round).
  nextTeam: ShootoutTeam;
}

// Real best-of-five shootout logic: a winner is declared the instant the result
// can no longer be overturned (early clinch), at the end of regulation if the
// teams are not level, or after any completed sudden-death pair that separates
// them.
export function shootoutStatus({ userScore, oppScore, userKicks, oppKicks }: ShootoutScore): ShootoutStatus {
  const userRemaining = Math.max(0, REGULATION_KICKS - userKicks);
  const oppRemaining = Math.max(0, REGULATION_KICKS - oppKicks);
  const pastRegulation = userKicks >= REGULATION_KICKS && oppKicks >= REGULATION_KICKS;

  let decided = false;
  let winner: ShootoutTeam | null = null;

  if (!pastRegulation) {
    // Early clinch: the trailing side cannot catch up even by scoring all of
    // their remaining kicks.
    if (userScore > oppScore + oppRemaining) {
      decided = true;
      winner = "user";
    } else if (oppScore > userScore + userRemaining) {
      decided = true;
      winner = "opponent";
    }
  } else if (userKicks === oppKicks && userScore !== oppScore) {
    // End of regulation / end of a sudden-death pair with a separation.
    decided = true;
    winner = userScore > oppScore ? "user" : "opponent";
  }

  const nextTeam: ShootoutTeam = userKicks === oppKicks ? "user" : "opponent";

  return { decided, winner, suddenDeath: pastRegulation && !decided, nextTeam };
}
