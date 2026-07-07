export type SlotCategory = "GK" | "DEF" | "MID" | "FWD";
export type DraftDifficulty = "easy" | "normal" | "hard";
export type DraftMode = "squad-first" | "position-first";
export type LegendMode = "none" | "messi" | "ronaldo" | "neymar";

export interface DraftOptions {
  difficulty: DraftDifficulty;
  blindMode: boolean;
  draftMode: DraftMode;
  legendMode: LegendMode;
  liveRatings: boolean;
  chemistry: boolean;
  superSub: boolean;
}

export interface EightZeroTeam {
  teamId: number;
  name: string;
  fifaCode: string;
  group: string | null;
  ranking: number | null;
  elo: number;
}

export interface EightZeroPlayer {
  id: number;
  teamId: number;
  teamName: string;
  teamCode: string;
  name: string;
  position: string;
  category: SlotCategory;
  rating: number;
  clubName: string | null;
  aura: number | null;
  shirtNumber: number | null;
}

export interface FormationSlot {
  id: string;
  label: string;
  category: SlotCategory;
}

export interface Formation {
  id: string;
  label: string;
  slots: FormationSlot[];
}

export interface DraftPick {
  slotId: string;
  slotLabel: string;
  category: SlotCategory;
  player: EightZeroPlayer;
  spinTeam: EightZeroTeam;
  round: number;
}

export interface CurrentSpin {
  team: EightZeroTeam;
  spinIndex: number;
}

export interface DraftState {
  seed: string;
  formationId: string;
  picks: DraftPick[];
  activeSlotId: string;
  currentSpin: CurrentSpin | null;
  rerollsLeft: number;
  spinCount: number;
  complete: boolean;
  difficulty: DraftDifficulty;
  blindMode: boolean;
  draftMode: DraftMode;
  legendMode: LegendMode;
  liveRatings: boolean;
  chemistry: boolean;
  superSub: boolean;
  // The 12th man drafted before kickoff (a bench impact sub), or null until picked.
  superSubId: number | null;
}

export interface TeamRatings {
  overall: number;
  gk: number;
  defence: number;
  midfield: number;
  attack: number;
}

export interface MatchResult {
  stage: string;
  opponent: EightZeroTeam;
  userGoals: number;
  opponentGoals: number;
  regularTimeUserGoals: number;
  regularTimeOpponentGoals: number;
  // Goals scored during extra time only (excludes regulation and the penalty
  // shootout decider). Used to animate ET goals without replaying the pen bonus.
  extraTimeUserGoals: number;
  extraTimeOpponentGoals: number;
  opponentGkRating: number;
  result: "W" | "D" | "L";
  decidedByPens: boolean;
  extraTime: boolean;
}

export interface PenaltyKick {
  team: "user" | "opponent";
  scorer: string;
  saved: boolean;
  round: number;
}

export type MatchEventType = "kickoff" | "goal" | "halftime" | "fulltime" | "extra_time_start" | "extra_time_end" | "penalty_shootout" | "penalty_scored" | "penalty_saved" | "yellow_card" | "red_card" | "near_miss";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "user" | "opponent";
  playerName?: string;
  playerRating?: number;
  flavorText?: string;
}

export interface TournamentRun {
  id: string;
  createdAt: string;
  seed: string;
  formationId: string;
  formationLabel: string;
  difficulty: DraftDifficulty;
  blindMode: boolean;
  draftMode: DraftMode;
  legendMode: LegendMode;
  liveRatings: boolean;
  chemistry: boolean;
  superSub: boolean;
  superSubName: string | null;
  score: number;
  record: string;
  wins: number;
  draws: number;
  losses: number;
  stageReached: string;
  grade: string;
  label: string;
  ratings: TeamRatings;
  picks: DraftPick[];
  matches: MatchResult[];
  goalScorers: Record<string, number>;
  matchGoalScorers: Record<string, number>[];
}
