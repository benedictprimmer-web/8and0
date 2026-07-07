import { describe, it, expect } from "vitest";
import { calculateChemistry, chemistryBonus, CHEMISTRY_CAP } from "./chemistry";
import type { DraftPick, EightZeroPlayer } from "./types";

function pick(id: number, club: string | null): DraftPick {
  const player: EightZeroPlayer = {
    id,
    teamId: 1,
    teamName: "Testland",
    teamCode: "TST",
    name: `Player ${id}`,
    position: "FW",
    category: "FWD",
    rating: 80,
    clubName: club,
    aura: null,
    shirtNumber: null,
  };
  return {
    slotId: `s${id}`,
    slotLabel: "FWD",
    category: "FWD",
    player,
    spinTeam: { teamId: 1, name: "Testland", fifaCode: "TST", group: "A", ranking: 1, elo: 1500 },
    round: id,
  };
}

describe("club chemistry", () => {
  it("gives no bonus when every player is at a different club", () => {
    const chem = calculateChemistry([pick(1, "A"), pick(2, "B"), pick(3, "C")]);
    expect(chem.total).toBe(0);
    expect(chem.links).toHaveLength(0);
    expect(chem.capped).toBe(false);
  });

  it("scores +0.5 for two same-club, +1.0 for three, and stacks across clubs", () => {
    const chem = calculateChemistry([
      pick(1, "Real"),
      pick(2, "Real"),
      pick(3, "City"),
      pick(4, "City"),
      pick(5, "City"),
    ]);
    expect(chem.total).toBeCloseTo(1.5); // Real ×2 (0.5) + City ×3 (1.0)
    expect(chem.links[0]).toMatchObject({ club: "City", count: 3, bonus: 1 });
    expect(chem.links[1]).toMatchObject({ club: "Real", count: 2, bonus: 0.5 });
  });

  it("caps the total at +3 and flags it", () => {
    const picks = Array.from({ length: 9 }, (_, i) => pick(i + 1, "Mega")); // (9-1)*0.5 = 4.0 raw
    const chem = calculateChemistry(picks);
    expect(chem.total).toBe(CHEMISTRY_CAP);
    expect(chem.capped).toBe(true);
  });

  it("ignores players with no club", () => {
    const chem = calculateChemistry([pick(1, null), pick(2, null), pick(3, "X")]);
    expect(chem.total).toBe(0);
  });

  it("chemistryBonus respects the enabled flag", () => {
    const picks = [pick(1, "A"), pick(2, "A")];
    expect(chemistryBonus(picks, false)).toBe(0);
    expect(chemistryBonus(picks, true)).toBeCloseTo(0.5);
  });
});
