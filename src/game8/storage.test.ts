import { describe, expect, it } from "vitest";
import { toRunLogEntry } from "./storage";
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
    spinTeam: { teamId: 1, name: "Testland", fifaCode: "TST", group: "A", ranking: 1, elo: 1800 },
    round: 1,
  };
}

function makeRun(overrides: Partial<TournamentRun> = {}): TournamentRun {
  return {
    id: "run-1",
    createdAt: "2026-07-10T12:00:00.000Z",
    seed: "seed-abc",
    formationId: "433",
    formationLabel: "4-3-3",
    difficulty: "normal",
    blindMode: false,
    draftMode: "squad-first",
    legendMode: "none",
    liveRatings: false,
    chemistry: false,
    superSub: false,
    era: 2026,
    superSubName: null,
    score: 42,
    record: "6-1-1",
    wins: 6,
    draws: 1,
    losses: 1,
    stageReached: "Champion",
    grade: "A",
    label: "Contenders",
    ratings: { overall: 87.6, gk: 85, defence: 86, midfield: 88, attack: 90 },
    picks: [pick("Alpha"), pick("Bravo")],
    matches: [],
    goalScorers: { Alpha: 5, Bravo: 2 },
    matchGoalScorers: [],
    ...overrides,
  };
}

describe("toRunLogEntry", () => {
  it("preserves the timestamp and core result of a run", () => {
    const entry = toRunLogEntry(makeRun());
    expect(entry.createdAt).toBe("2026-07-10T12:00:00.000Z");
    expect(entry.id).toBe("run-1");
    expect(entry.seed).toBe("seed-abc");
    expect(entry.score).toBe(42);
    expect(entry.stageReached).toBe("Champion");
    expect(entry.record).toBe("6-1-1");
    expect(entry.overall).toBe(87.6);
    expect(entry.xi).toEqual(["Alpha", "Bravo"]);
    expect(entry.topScorer).toEqual({ name: "Alpha", goals: 5 });
  });

  it("records the chemistry bonus (0 off, positive for clubmates when on)", () => {
    expect(toRunLogEntry(makeRun()).chemistry).toBe(0);
    // Both picks share "Test FC", so enabling chemistry links them.
    expect(toRunLogEntry(makeRun({ chemistry: true })).chemistry).toBeGreaterThan(0);
  });

  it("stringifies the era so historical and all-time runs log uniformly", () => {
    expect(toRunLogEntry(makeRun({ era: 2014 })).era).toBe("2014");
    expect(toRunLogEntry(makeRun({ era: "all-time" })).era).toBe("all-time");
  });
});
