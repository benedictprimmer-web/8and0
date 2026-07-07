import { describe, it, expect } from "vitest";
import { buildEightZeroData, type RawTeam, type RawPlayer } from "./data";
import { applyLiveRatings, liveBoostFor } from "./liveRatings";
import teamsData from "../../public/data/teams.json";
import playersData from "../../public/data/players.json";

const VOZINHA_ID = 973;

describe("live ratings", () => {
  it("boosts Vozinha to 90 and ranks him top of Cape Verde", () => {
    const base = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);
    const vozinhaBase = base.players.find((p) => p.id === VOZINHA_ID);
    expect(vozinhaBase).toBeTruthy();
    expect(vozinhaBase!.name).toBe("Vozinha");
    expect(liveBoostFor(VOZINHA_ID)).toBe(24);

    const boosted = applyLiveRatings(base);
    const vozinha = boosted.players.find((p) => p.id === VOZINHA_ID)!;
    expect(vozinha.rating).toBe(vozinhaBase!.rating + 24); // 66 → 90

    // He should now sit at the very top of Cape Verde's pool (sorted by new rating).
    const capeVerde = boosted.playersByTeam.get(vozinha.teamId)!;
    expect(capeVerde[0].id).toBe(VOZINHA_ID);
    // And every teammate is ranked at or below him.
    expect(capeVerde.every((p) => p.rating <= vozinha.rating)).toBe(true);
  });

  it("leaves the base data untouched (boost is a copy)", () => {
    const base = buildEightZeroData(teamsData as RawTeam[], playersData as RawPlayer[]);
    const beforeRating = base.players.find((p) => p.id === VOZINHA_ID)!.rating;
    applyLiveRatings(base);
    expect(base.players.find((p) => p.id === VOZINHA_ID)!.rating).toBe(beforeRating);
  });
});
