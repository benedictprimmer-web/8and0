import { describe, expect, it } from "vitest";
import { selectKeeper, selectPenaltyTakers, takerForKick } from "./penaltyLineup";
import type { EightZeroPlayer, SlotCategory } from "./types";

function player(name: string, category: SlotCategory, rating: number): EightZeroPlayer {
  return {
    id: rating + name.length,
    teamId: 1,
    teamName: "Test",
    teamCode: "TST",
    name,
    position: category,
    category,
    rating,
    clubName: null,
    aura: null,
    shirtNumber: null,
  };
}

const SQUAD: EightZeroPlayer[] = [
  player("Keeper A", "GK", 88),
  player("Keeper B", "GK", 81),
  player("Striker", "FWD", 90),
  player("Winger", "FWD", 84),
  player("Playmaker", "MID", 86),
  player("Defender", "DEF", 79),
];

describe("selectPenaltyTakers", () => {
  it("excludes goalkeepers", () => {
    const takers = selectPenaltyTakers(SQUAD);
    expect(takers.some((t) => t.name.startsWith("Keeper"))).toBe(false);
  });

  it("orders outfield players best rating first", () => {
    const takers = selectPenaltyTakers(SQUAD);
    expect(takers.map((t) => t.name)).toEqual(["Striker", "Playmaker", "Winger", "Defender"]);
    expect(takers.map((t) => t.rating)).toEqual([90, 86, 84, 79]);
  });

  it("returns an empty list for a squad with no outfield players", () => {
    expect(selectPenaltyTakers([player("Keeper A", "GK", 88)])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...SQUAD];
    selectPenaltyTakers(input);
    expect(input).toEqual(SQUAD);
  });
});

describe("selectKeeper", () => {
  it("picks the highest-rated goalkeeper with their real name", () => {
    expect(selectKeeper(SQUAD)).toEqual({ name: "Keeper A", rating: 88 });
  });

  it("falls back to a synthetic keeper when no GK exists", () => {
    expect(selectKeeper([player("Striker", "FWD", 90)], 70)).toEqual({ name: "Goalkeeper", rating: 70 });
  });
});

describe("takerForKick", () => {
  const takers = selectPenaltyTakers(SQUAD); // 4 outfield players
  const fallback = { name: "You", rating: 80 };

  it("assigns kicks 1..n to takers in order", () => {
    expect(takerForKick(takers, 1, fallback).name).toBe("Striker");
    expect(takerForKick(takers, 2, fallback).name).toBe("Playmaker");
    expect(takerForKick(takers, 4, fallback).name).toBe("Defender");
  });

  it("cycles back through the order in sudden death", () => {
    expect(takerForKick(takers, 5, fallback).name).toBe("Striker");
    expect(takerForKick(takers, 6, fallback).name).toBe("Playmaker");
  });

  it("returns the fallback when there are no takers", () => {
    expect(takerForKick([], 1, fallback)).toEqual(fallback);
  });
});
