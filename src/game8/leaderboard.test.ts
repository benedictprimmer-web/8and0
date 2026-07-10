import { describe, expect, it } from "vitest";
import {
  buildSubmission,
  cleanName,
  containsProfanity,
  sanitiseSubmission,
  teamScoreOf,
  topScorerOf,
} from "./leaderboard";
import { calculateRunScore } from "./scoring";
import type { DraftPick, EightZeroPlayer, TournamentRun } from "./types";

function player(name: string): EightZeroPlayer {
  return {
    id: 1,
    teamId: 1,
    teamName: "Testland",
    teamCode: "TST",
    name,
    position: "FW",
    category: "FWD",
    rating: 88,
    clubName: "Test FC",
    aura: null,
    shirtNumber: null,
  };
}

function pick(name: string): DraftPick {
  return {
    slotId: "fwd-1",
    slotLabel: "FWD",
    category: "FWD",
    player: player(name),
    spinTeam: {
      teamId: 1,
      name: "Testland",
      fifaCode: "TST",
      group: "A",
      ranking: 1,
      elo: 1800,
    },
    round: 1,
  };
}

function makeRun(overrides: Partial<TournamentRun> = {}): TournamentRun {
  return {
    id: "run-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    seed: "seed-123",
    formationId: "433",
    formationLabel: "4-3-3",
    difficulty: "hard",
    blindMode: true,
    draftMode: "squad-first",
    legendMode: "none",
    liveRatings: false,
    chemistry: false,
    superSub: false,
    era: 2026,
    superSubName: null,
    score: 42,
    record: "8-0-0",
    wins: 8,
    draws: 0,
    losses: 0,
    stageReached: "Champion",
    grade: "S+",
    label: "Perfect 8-0",
    ratings: { overall: 87.6, gk: 85, defence: 86, midfield: 88, attack: 90 },
    picks: [pick("Alpha"), pick("Bravo")],
    matches: [],
    goalScorers: { Alpha: 5, Bravo: 2 },
    matchGoalScorers: [],
    ...overrides,
  };
}

describe("profanity filter", () => {
  it("blocks obvious profanity", () => {
    expect(containsProfanity("shit happens")).toBe(true);
    expect(containsProfanity("FUCK")).toBe(true);
  });

  it("catches leet-speak obfuscation", () => {
    expect(containsProfanity("sh1t")).toBe(true);
    expect(containsProfanity("a$$hole")).toBe(true);
    expect(containsProfanity("b1tch")).toBe(true);
  });

  it("allows clean names", () => {
    expect(containsProfanity("Ben")).toBe(false);
    expect(containsProfanity("Captain Marvel")).toBe(false);
  });
});

describe("cleanName", () => {
  it("trims and collapses whitespace", () => {
    const result = cleanName("  Ben   Rimmer  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("Ben Rimmer");
  });

  it("rejects too-short names", () => {
    expect(cleanName("a").ok).toBe(false);
  });

  it("rejects too-long names", () => {
    expect(cleanName("a".repeat(40)).ok).toBe(false);
  });

  it("rejects profane names", () => {
    expect(cleanName("bitchboy").ok).toBe(false);
  });
});

describe("topScorerOf", () => {
  it("returns the highest scorer", () => {
    expect(topScorerOf({ goalScorers: { Alpha: 5, Bravo: 2 } })).toEqual({
      name: "Alpha",
      goals: 5,
    });
  });

  it("returns null when nobody scored", () => {
    expect(topScorerOf({ goalScorers: {} })).toBeNull();
  });
});

describe("buildSubmission", () => {
  it("builds a valid submission from a run", () => {
    const result = buildSubmission(makeRun(), "Ben");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.name).toBe("Ben");
      expect(result.submission.score).toBe(42);
      expect(result.submission.overall).toBe(87.6);
      expect(result.submission.topScorer).toEqual({ name: "Alpha", goals: 5 });
      expect(result.submission.xi).toEqual(["Alpha", "Bravo"]);
      expect(result.submission.stageReached).toBe("Champion");
    }
  });

  it("rejects profane names", () => {
    const result = buildSubmission(makeRun(), "shithead");
    expect(result.ok).toBe(false);
  });

  it("records a zero chemistry bonus when chemistry mode is off", () => {
    const result = buildSubmission(makeRun(), "Ben");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.chemistry).toBe(0);
  });

  it("records a positive chemistry bonus for clubmates when enabled", () => {
    // Both fixture picks share "Test FC", so enabling chemistry links them.
    const result = buildSubmission({ ...makeRun(), chemistry: true }, "Ben");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.chemistry).toBeGreaterThan(0);
  });
});

describe("sanitiseSubmission (server-side)", () => {
  it("clamps out-of-range numbers and caps the XI", () => {
    const result = sanitiseSubmission({
      name: "Cheater",
      score: 999999,
      stageReached: "Not a stage",
      record: "8-0-0",
      wins: 99,
      draws: 0,
      losses: 0,
      overall: 5000,
      difficulty: "wat",
      formationId: "433",
      formationLabel: "4-3-3",
      blindMode: true,
      topScorer: { name: "X", goals: 9999 },
      xi: Array.from({ length: 50 }, (_, i) => `p${i}`),
      seed: "s",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Score is recomputed from the (clamped) summary, NOT taken from the
      // forged 999999: wins8*5 + normal(3) + blind(2) + ratingBonus(13) = 58.
      expect(result.submission.score).toBe(58);
      expect(result.submission.wins).toBe(8);
      expect(result.submission.overall).toBeLessThanOrEqual(120);
      expect(result.submission.difficulty).toBe("normal");
      expect(result.submission.stageReached).toBe("Group stage");
      expect(result.submission.xi).toHaveLength(11);
      expect(result.submission.topScorer?.goals).toBe(50);
    }
  });

  it("rejects non-object bodies", () => {
    expect(sanitiseSubmission(null).ok).toBe(false);
    expect(sanitiseSubmission("nope").ok).toBe(false);
  });
});

describe("sanitiseSubmission anti-cheat (authoritative score)", () => {
  const base = {
    name: "Honest",
    stageReached: "Round of 16",
    record: "4-1-0",
    wins: 4,
    draws: 1,
    losses: 0,
    overall: 80,
    difficulty: "normal",
    formationId: "433",
    formationLabel: "4-3-3",
    blindMode: false,
    topScorer: null,
    xi: ["a"],
    seed: "seed1",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("overwrites a forged score with the value recomputed from the summary", () => {
    const result = sanitiseSubmission({ ...base, score: 9999 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expected = calculateRunScore({
        wins: 4,
        draws: 1,
        losses: 0,
        stageReached: "Round of 16",
        rating: 80,
        difficulty: "normal",
        blindMode: false,
      });
      expect(result.submission.score).toBe(expected);
      expect(result.submission.score).toBeLessThan(9999);
    }
  });

  it("ignores the client score field entirely (same result for 0 and 1000)", () => {
    const low = sanitiseSubmission({ ...base, score: 0 });
    const high = sanitiseSubmission({ ...base, score: 1000 });
    expect(low.ok && high.ok).toBe(true);
    if (low.ok && high.ok) {
      expect(low.submission.score).toBe(high.submission.score);
    }
  });
});

describe("teamScoreOf (Best teams board metric)", () => {
  it("is the team overall, rounded to one decimal", () => {
    expect(teamScoreOf({ overall: 88.46 })).toBe(88.5);
    expect(teamScoreOf({ overall: 90 })).toBe(90);
  });

  it("ranks a higher-OVR team above a lower one regardless of run score", () => {
    // A weaker XI that went far still sits below a stronger XI on the team board.
    expect(teamScoreOf({ overall: 91.2 })).toBeGreaterThan(teamScoreOf({ overall: 85.0 }));
  });
});
