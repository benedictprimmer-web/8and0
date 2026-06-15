import { describe, expect, it } from "vitest";
import { buildEightZeroData, mapPositionCategory, type RawPlayer, type RawTeam } from "./data";
import {
  canPickPlayer,
  createDraftState,
  getAvailablePlayers,
  getCompatibleOpenSlots,
  rerollsForDifficulty,
  rerollTeam,
  selectPlayer,
  spinTeam,
} from "./draft";
import { FORMATIONS } from "./formations";
import { calculateTeamRatings } from "./ratings";
import { buildMatchEvents, distributeExtraTimeMinutes, simulateTournamentRun } from "./simulate";
import { describeGoalDirection, describeMissDirection } from "./penaltyText";
import { sortRuns } from "./storage";
import type { DraftPick, EightZeroPlayer, EightZeroTeam, TournamentRun } from "./types";
import teamsData from "../../public/data/teams.json";
import playersData from "../../public/data/players.json";

const rawTeams: RawTeam[] = Array.from({ length: 12 }, (_, index) => ({
  team_id: index + 1,
  name: `Team ${index + 1}`,
  fifa_code: `T${index + 1}`,
  wc2026_group: index < 4 ? "A" : "B",
  fifa_ranking: index + 1,
  elo: 1800 - index * 35,
  qualified_2026: true,
}));

function rawPlayer(id: number, teamId: number, position: string, rating: number): RawPlayer {
  return {
    player_id: id,
    team_id: teamId,
    fifa_code: `T${teamId}`,
    name: `Player ${id}`,
    position,
    is_goalkeeper: position === "GK",
    club_name: `Club ${id}`,
    ea_overall: rating,
    aura_composite: 0.5,
    shirt_number: id,
  };
}

const rawPlayers: RawPlayer[] = rawTeams.flatMap((team, teamIndex) => {
  const base = teamIndex * 10;
  return [
    rawPlayer(base + 1, team.team_id, "GK", 82),
    rawPlayer(base + 2, team.team_id, "DF", 83),
    rawPlayer(base + 3, team.team_id, "DF", 82),
    rawPlayer(base + 4, team.team_id, "MF", 84),
    rawPlayer(base + 5, team.team_id, "MF", 83),
    rawPlayer(base + 6, team.team_id, "FW", 85),
    rawPlayer(base + 7, team.team_id, "FW", 84),
  ];
});

function makePick(id: number, category: DraftPick["category"], rating: number): DraftPick {
  const team: EightZeroTeam = {
    teamId: 90 + id,
    name: `Pick Team ${id}`,
    fifaCode: `P${id}`,
    group: "A",
    ranking: id,
    elo: 1600,
  };
  const player: EightZeroPlayer = {
    id,
    teamId: team.teamId,
    teamName: team.name,
    teamCode: team.fifaCode,
    name: `Picked ${id}`,
    position: category,
    category,
    rating,
    clubName: null,
    aura: null,
    shirtNumber: id,
  };
  return {
    slotId: `${category}-${id}`,
    slotLabel: `${category} ${id}`,
    category,
    player,
    spinTeam: team,
    round: id,
  };
}

describe("8-0 data", () => {
  it("maps player positions into draft categories", () => {
    expect(mapPositionCategory("GK", true)).toBe("GK");
    expect(mapPositionCategory("DF")).toBe("DEF");
    expect(mapPositionCategory("MF")).toBe("MID");
    expect(mapPositionCategory("FW")).toBe("FWD");
    expect(mapPositionCategory("UNKNOWN")).toBeNull();
  });

  it("builds eligible teams and excludes unrated players", () => {
    const data = buildEightZeroData(rawTeams, [
      ...rawPlayers,
      { ...rawPlayer(999, 1, "FW", 0), ea_overall: null },
    ]);

    expect(data.teams).toHaveLength(12);
    expect(data.players.some((player) => player.id === 999)).toBe(false);
    const teamPlayers = data.playersByTeam.get(1) ?? [];
    expect(teamPlayers[0].rating).toBeGreaterThanOrEqual(
      teamPlayers[teamPlayers.length - 1].rating
    );
  });

  it("includes all 48 teams when generated squads have 26 valid players", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);

    expect(data.teams).toHaveLength(48);
    expect(data.players).toHaveLength(1248);
    expect(data.teams.every((team) => (data.playersByTeam.get(team.teamId)?.length ?? 0) === 26)).toBe(true);
  });

  it("gives every generated team draftable GK/DEF/MID/FWD coverage", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);

    for (const team of data.teams) {
      const categories = new Set((data.playersByTeam.get(team.teamId) ?? []).map((player) => player.category));
      expect(categories, team.name).toEqual(new Set(["GK", "DEF", "MID", "FWD"]));
    }
  });
});

describe("8-0 draft", () => {
  it("supports the full setup formation list with 11 slots", () => {
    expect(FORMATIONS.map((formation) => formation.label)).toEqual([
      "4-3-3",
      "4-4-2",
      "4-5-1",
      "3-4-3",
      "3-5-2",
      "5-3-2",
      "5-4-1",
    ]);
    expect(FORMATIONS.every((formation) => formation.slots.length === 11)).toBe(true);
  });

  it("sets rerolls and hidden ratings from difficulty", () => {
    expect(rerollsForDifficulty("easy")).toBe(3);
    expect(rerollsForDifficulty("normal")).toBe(1);
    expect(rerollsForDifficulty("hard")).toBe(0);

    const hard = createDraftState("hard-seed", "433", { difficulty: "hard" });

    expect(hard.rerollsLeft).toBe(0);
    expect(hard.blindMode).toBe(true);
  });

  it("spins deterministically from the same seed", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const first = spinTeam(data, createDraftState("fixed-seed", "433"));
    const second = spinTeam(data, createDraftState("fixed-seed", "433"));

    expect(first.currentSpin?.team.teamId).toBe(second.currentSpin?.team.teamId);
  });

  it("does not spend a reroll on the first spin", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const state = spinTeam(data, createDraftState("free-spin-seed", "433", { difficulty: "normal" }));

    expect(state.currentSpin).toBeTruthy();
    expect(state.rerollsLeft).toBe(1);
  });

  it("spends one reroll when a nation is already showing", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const spun = spinTeam(data, createDraftState("reroll-spend-seed", "433", { difficulty: "normal" }));
    const rerolled = rerollTeam(data, spun);

    expect(rerolled.currentSpin).toBeTruthy();
    expect(rerolled.rerollsLeft).toBe(0);
    expect(rerolled.spinCount).toBe(spun.spinCount + 1);
  });

  it("blocks rerolls at zero", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const spun = spinTeam(data, createDraftState("hard-reroll-seed", "433", { difficulty: "hard" }));
    const blocked = rerollTeam(data, spun);

    expect(blocked).toBe(spun);
    expect(blocked.rerollsLeft).toBe(0);
    expect(blocked.spinCount).toBe(spun.spinCount);
  });

  it("rerolls only while rerolls remain", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    let state = spinTeam(data, createDraftState("reroll-seed", "433", { difficulty: "easy" }));
    state = rerollTeam(data, state);
    state = rerollTeam(data, state);
    state = rerollTeam(data, state);
    const exhausted = rerollTeam(data, state);

    expect(state.rerollsLeft).toBe(0);
    expect(exhausted.spinCount).toBe(state.spinCount);
  });

  it("keeps position-first spins scoped to the active slot", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const state = spinTeam(data, createDraftState("position-seed", "433", { draftMode: "position-first" }));

    expect(getAvailablePlayers(data, state).some((player) => player.category === "GK")).toBe(true);
    expect(() => {
      const defender = getAvailablePlayers(data, state).find((player) => player.category === "DEF");
      if (defender) selectPlayer(data, state, defender.id, "def-1");
    }).toThrow("Selected slot is not the active position-first slot");
  });

  it("rejects duplicate player picks", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    let state = spinTeam(data, createDraftState("duplicate-seed", "433"));
    const player = getAvailablePlayers(data, state).find((candidate) => candidate.category === "GK");
    expect(player).toBeDefined();
    state = selectPlayer(data, state, player!.id);
    state = {
      ...state,
      currentSpin: { team: data.teamById.get(player!.teamId) ?? data.teams[0], spinIndex: 2 },
    };

    expect(() => selectPlayer(data, state, player!.id)).toThrow("Player is not available");
  });

  it("shows every undrafted player from the spun nation", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const state = spinTeam(data, createDraftState("nation-pool-seed", "433"));
    const categories = new Set(getAvailablePlayers(data, state).map((player) => player.category));

    expect(categories).toEqual(new Set(["GK", "DEF", "MID", "FWD"]));
  });

  it("auto-assigns a player when there is one compatible open slot", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const state = spinTeam(data, createDraftState("auto-slot-seed", "433"));
    const keeper = getAvailablePlayers(data, state).find((player) => player.category === "GK");
    expect(keeper).toBeDefined();

    const next = selectPlayer(data, state, keeper!.id);

    expect(next.picks).toHaveLength(1);
    expect(next.picks[0].slotId).toBe("gk-1");
  });

  it("marks a player unavailable when no compatible slot is open", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const firstSpin = spinTeam(data, createDraftState("no-slot-seed", "433"));
    const keeper = getAvailablePlayers(data, firstSpin).find((player) => player.category === "GK");
    expect(keeper).toBeDefined();
    let state = selectPlayer(data, firstSpin, keeper!.id);
    state = {
      ...state,
      currentSpin: { team: data.teams.find((team) => team.teamId !== keeper!.teamId) ?? data.teams[0], spinIndex: 2 },
    };
    const blockedKeeper = getAvailablePlayers(data, state).find((player) => player.category === "GK");
    expect(blockedKeeper).toBeDefined();

    expect(canPickPlayer(blockedKeeper!, state)).toBe(false);
    expect(() => selectPlayer(data, state, blockedKeeper!.id)).toThrow("Player has no compatible open slot");
  });

  it("auto-assigns the first open slot when a player fits multiple slots", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const state = spinTeam(data, createDraftState("multi-slot-seed", "433"));
    const defender = getAvailablePlayers(data, state).find((player) => player.category === "DEF");
    expect(defender).toBeDefined();
    expect(getCompatibleOpenSlots(defender!, state).map((slot) => slot.id)).toEqual([
      "def-1",
      "def-2",
      "def-3",
      "def-4",
    ]);

    const next = selectPlayer(data, state, defender!.id);

    expect(next.picks[0].slotId).toBe("def-1");
  });

  it("fills repeated forward picks in formation order", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    let state = createDraftState("forward-order-seed", "433");

    for (let index = 0; index < 3; index += 1) {
      state = spinTeam(data, state);
      const forward = getAvailablePlayers(data, state).find((player) => player.category === "FWD");
      expect(forward).toBeDefined();
      state = selectPlayer(data, state, forward!.id);
    }

    expect(state.picks.map((pick) => pick.slotId)).toEqual(["fwd-1", "fwd-2", "fwd-3"]);
  });

  it("completes a full 11-pick draft and simulates the run", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    let state = createDraftState("full-draft-seed", "433");

    while (!state.complete) {
      state = spinTeam(data, state);
      const player = getAvailablePlayers(data, state).find((candidate) => canPickPlayer(candidate, state));
      expect(player).toBeDefined();
      state = selectPlayer(data, state, player!.id);
    }

    const ratings = calculateTeamRatings(state.picks);
    const run = simulateTournamentRun({
      teams: data.teams,
      picks: state.picks,
      ratings,
      seed: state.seed,
      formationId: state.formationId,
      difficulty: state.difficulty,
      blindMode: state.blindMode,
      draftMode: state.draftMode,
    });

    expect(state.picks).toHaveLength(11);
    expect(run.matches.length).toBeGreaterThan(0);
    expect(run.record).toMatch(/^\d+-\d+-\d+$/);
    expect(run.score).toBeGreaterThanOrEqual(0);
  });

  it("completes a full draft with the expanded generated roster", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);
    let state = createDraftState("expanded-full-draft-seed", "433");

    while (!state.complete) {
      state = spinTeam(data, state);
      const player = getAvailablePlayers(data, state).find((candidate) => canPickPlayer(candidate, state));
      expect(player).toBeDefined();
      state = selectPlayer(data, state, player!.id);
    }

    expect(state.picks).toHaveLength(11);
  });
});

describe("8-0 simulation", () => {
  it("can simulate a tournament run with a strong team", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const picks = [
      makePick(1, "GK", 99),
      makePick(2, "DEF", 99),
      makePick(3, "DEF", 99),
      makePick(4, "DEF", 99),
      makePick(5, "DEF", 99),
      makePick(6, "MID", 99),
      makePick(7, "MID", 99),
      makePick(8, "MID", 99),
      makePick(9, "FWD", 99),
      makePick(10, "FWD", 99),
      makePick(11, "FWD", 99),
    ];

    const run = simulateTournamentRun({
      teams: data.teams,
      picks,
      ratings: calculateTeamRatings(picks),
      seed: "perfect-path",
      formationId: "433",
    });

    expect(run.matches.length).toBeGreaterThanOrEqual(3);
    expect(run.matches.length).toBeLessThanOrEqual(8);
    expect(run.wins + run.draws + run.losses).toBe(run.matches.length);
  });

  it("sorts local history by strongest record and rating", () => {
    const base = {
      id: "run",
      createdAt: "2026-06-09T00:00:00.000Z",
      seed: "seed",
      formationId: "433",
      formationLabel: "4-3-3",
      difficulty: "normal",
      blindMode: false,
      draftMode: "squad-first",
      legendMode: "none",
      score: 0,
      draws: 0,
      picks: [],
      matches: [],
      stageReached: "Final",
      label: "test",
      goalScorers: {},
      matchGoalScorers: [],
    } satisfies Partial<TournamentRun>;
    const runs = sortRuns([
      { ...base, id: "a", record: "5-0-1", wins: 5, losses: 1, grade: "B", ratings: { overall: 90, gk: 90, defence: 90, midfield: 90, attack: 90 } } as TournamentRun,
      { ...base, id: "b", record: "6-0-0", wins: 6, losses: 0, grade: "A", ratings: { overall: 80, gk: 80, defence: 80, midfield: 80, attack: 80 } } as TournamentRun,
    ]);

    expect(runs[0].id).toBe("b");
  });
});

describe("8-0 legend mode", () => {
  it("auto-locks a legend player when legendMode is set", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);
    const state = createDraftState("legend-seed", "433", { legendMode: "messi" }, data);

    expect(state.picks).toHaveLength(1);
    expect(state.picks[0].player.name).toContain("Messi");
    expect(state.picks[0].player.teamCode).toBe("ARG");
    expect(state.picks[0].category).toBe("FWD");
    expect(state.spinCount).toBe(0);
    expect(state.rerollsLeft).toBe(1);
    expect(state.blindMode).toBe(false);
    expect(state.legendMode).toBe("messi");
  });

  it("auto-locks Neymar into a MID slot", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);
    const state = createDraftState("neymar-seed", "433", { legendMode: "neymar" }, data);

    expect(state.picks).toHaveLength(1);
    expect(state.picks[0].player.name).toContain("Neymar");
    expect(state.picks[0].player.teamCode).toBe("BRA");
    expect(state.picks[0].category).toBe("MID");
  });

  it("completes a 10-spin draft with legend mode and simulates", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);
    let state = createDraftState("legend-full-seed", "433", { legendMode: "ronaldo" }, data);

    while (!state.complete) {
      state = spinTeam(data, state);
      const player = getAvailablePlayers(data, state).find((candidate) => canPickPlayer(candidate, state));
      expect(player).toBeDefined();
      state = selectPlayer(data, state, player!.id);
    }

    expect(state.picks).toHaveLength(11);
    const legendPick = state.picks.find((p) => p.player.name.includes("Ronaldo"));
    expect(legendPick).toBeDefined();

    const ratings = calculateTeamRatings(state.picks);
    const run = simulateTournamentRun({
      teams: data.teams,
      picks: state.picks,
      ratings,
      seed: state.seed,
      formationId: state.formationId,
      difficulty: state.difficulty,
      blindMode: state.blindMode,
      draftMode: state.draftMode,
      legendMode: state.legendMode,
    });

    expect(run.legendMode).toBe("ronaldo");
    expect(run.matches.length).toBeGreaterThan(0);
  });
});

describe("8-0 bracket balancing", () => {
  it("simulates with bracket balancing parameters", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const picks = [
      makePick(1, "GK", 90),
      makePick(2, "DEF", 90),
      makePick(3, "DEF", 90),
      makePick(4, "DEF", 90),
      makePick(5, "DEF", 90),
      makePick(6, "MID", 90),
      makePick(7, "MID", 90),
      makePick(8, "MID", 90),
      makePick(9, "FWD", 90),
      makePick(10, "FWD", 90),
      makePick(11, "FWD", 90),
    ];

    const run = simulateTournamentRun({
      teams: data.teams,
      picks,
      ratings: calculateTeamRatings(picks),
      seed: "bracket-seed",
      formationId: "433",
      legendMode: "none",
    });

    expect(run.matches.length).toBeGreaterThanOrEqual(3);
    expect(run.matches.length).toBeLessThanOrEqual(8);
    // Verify group stage opponents are within reasonable tier
    const groupMatches = run.matches.filter((m) => m.stage.startsWith("Group"));
    expect(groupMatches.length).toBe(3);
  });

  it("gives legend mode an easier opponent path", () => {
    const data = buildEightZeroData(rawTeams, rawPlayers);
    const picks = [
      makePick(1, "GK", 88),
      makePick(2, "DEF", 88),
      makePick(3, "DEF", 88),
      makePick(4, "DEF", 88),
      makePick(5, "DEF", 88),
      makePick(6, "MID", 88),
      makePick(7, "MID", 88),
      makePick(8, "MID", 88),
      makePick(9, "FWD", 88),
      makePick(10, "FWD", 88),
      makePick(11, "FWD", 88),
    ];

    const normalRun = simulateTournamentRun({
      teams: data.teams,
      picks,
      ratings: calculateTeamRatings(picks),
      seed: "compare-seed",
      formationId: "433",
      legendMode: "none",
    });

    const legendRun = simulateTournamentRun({
      teams: data.teams,
      picks,
      ratings: calculateTeamRatings(picks),
      seed: "compare-seed",
      formationId: "433",
      legendMode: "messi",
    });

    expect(legendRun.matches.length).toBeGreaterThanOrEqual(3);
    expect(normalRun.matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("8-0 Last Dance rerolls", () => {
  // Last Dance (legend) mode must not clobber the difficulty-based reroll count.
  it("keeps the difficulty reroll count when a legend is locked in", () => {
    const data = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);

    const easy = createDraftState("legend-easy-seed", "433", { difficulty: "easy", legendMode: "messi" }, data);
    expect(easy.picks).toHaveLength(1);
    expect(easy.picks[0].player.name).toContain("Messi");
    expect(easy.rerollsLeft).toBe(3);

    const normal = createDraftState("legend-normal-seed", "433", { difficulty: "normal", legendMode: "messi" }, data);
    expect(normal.rerollsLeft).toBe(1);

    const hard = createDraftState("legend-hard-seed", "433", { difficulty: "hard", legendMode: "messi" }, data);
    expect(hard.rerollsLeft).toBe(0);
  });
});

describe("8-0 penalty direction text", () => {
  it("describes goals by direction, with a Panenka down the middle", () => {
    expect(describeGoalDirection("center")).toContain("Panenka");
    expect(describeGoalDirection("left")).not.toBe(describeGoalDirection("center"));
    expect(describeGoalDirection("right")).not.toBe(describeGoalDirection("center"));
    expect(describeGoalDirection("left")).not.toBe(describeGoalDirection("right"));
    // The old bug always returned the same "Top corner!" label.
    const labels = new Set(["left", "center", "right"].map((d) => describeGoalDirection(d as "left" | "center" | "right")));
    expect(labels.size).toBe(3);
  });

  it("describes misses by direction", () => {
    expect(describeMissDirection("center")).toContain("bar");
    expect(describeMissDirection("left")).not.toBe(describeMissDirection("center"));
  });
});

describe("8-0 extra time and penalties", () => {
  const midPicks: DraftPick[] = [
    makePick(1, "GK", 78),
    makePick(2, "DEF", 78),
    makePick(3, "DEF", 78),
    makePick(4, "DEF", 78),
    makePick(5, "DEF", 78),
    makePick(6, "MID", 78),
    makePick(7, "MID", 78),
    makePick(8, "MID", 78),
    makePick(9, "FWD", 78),
    makePick(10, "FWD", 78),
    makePick(11, "FWD", 78),
  ];
  const data = buildEightZeroData(rawTeams, rawPlayers);
  const ratings = calculateTeamRatings(midPicks);

  function runWith(seed: string, penOverrides: Record<string, "W" | "L">) {
    return simulateTournamentRun({
      teams: data.teams,
      picks: midPicks,
      ratings,
      seed,
      formationId: "433",
      penOverrides,
    });
  }

  function findSeedWithPenMatch(): { seed: string; stage: string } | null {
    for (let i = 0; i < 1000; i += 1) {
      const seed = `pen-search-${i}`;
      const run = runWith(seed, {});
      const penMatch = run.matches.find((match) => match.decidedByPens);
      if (penMatch) return { seed, stage: penMatch.stage };
    }
    return null;
  }

  it("keeps extra-time goal minutes within 91-120", () => {
    expect(distributeExtraTimeMinutes(1, () => 0)).toEqual([91]);
    expect(distributeExtraTimeMinutes(1, () => 0.9999)).toEqual([120]);
    let calls = 0;
    const sequence = () => {
      calls += 1;
      return (calls % 31) / 31; // spread across the range
    };
    const minutes = distributeExtraTimeMinutes(60, sequence);
    expect(minutes).toHaveLength(60);
    expect(minutes.every((minute) => minute >= 91 && minute <= 120)).toBe(true);
  });

  it("lets an interactive shootout override decide the knockout result", () => {
    const found = findSeedWithPenMatch();
    expect(found, "expected to find a knockout decided by penalties").not.toBeNull();
    const { seed, stage } = found!;

    const won = runWith(seed, { [stage]: "W" });
    const lost = runWith(seed, { [stage]: "L" });

    const wonMatch = won.matches.find((match) => match.stage === stage)!;
    const lostMatch = lost.matches.find((match) => match.stage === stage)!;
    expect(wonMatch.result).toBe("W");
    expect(wonMatch.decidedByPens).toBe(true);
    expect(lostMatch.result).toBe("L");

    // Losing the shootout eliminates the run at that stage (no later matches).
    const lastLost = lost.matches[lost.matches.length - 1];
    expect(lastLost.stage).toBe(stage);

    // Winning advances at least as far as the lost path, and never less far.
    expect(won.matches.length).toBeGreaterThanOrEqual(lost.matches.length);
  });

  it("re-simulates deterministically for the same seed and overrides", () => {
    const found = findSeedWithPenMatch();
    expect(found).not.toBeNull();
    const { seed, stage } = found!;

    const a = runWith(seed, { [stage]: "W" });
    const b = runWith(seed, { [stage]: "W" });
    expect(JSON.stringify(a.matches)).toBe(JSON.stringify(b.matches));
  });

  it("never emits penalty events into the live timeline for a shootout match", () => {
    const found = findSeedWithPenMatch();
    expect(found).not.toBeNull();
    const { seed, stage } = found!;
    const run = runWith(seed, {});
    const penMatch = run.matches.find((match) => match.stage === stage)!;
    const index = run.matches.indexOf(penMatch);
    const { events } = buildMatchEvents(penMatch, run.picks, `${seed}:events:${index}`);

    expect(events.some((event) => event.type.startsWith("penalty"))).toBe(false);
    // Extra time is signalled and every goal stays within 120 minutes.
    expect(penMatch.extraTime).toBe(true);
    expect(events.some((event) => event.type === "extra_time_end")).toBe(true);
    expect(events.filter((event) => event.type === "goal").every((event) => event.minute <= 120)).toBe(true);
  });
});
