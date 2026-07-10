import { describe, it, expect } from "vitest";
import { calculateChemistry, chemistryBonus, clubKey, CHEMISTRY_CAP } from "./chemistry";
import type { DraftPick, EightZeroPlayer } from "./types";

function pick(id: number, club: string | null, extra: Partial<EightZeroPlayer> = {}): DraftPick {
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
    ...extra,
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

describe("club-name normalization", () => {
  it("folds edition/spelling variants of the same club", () => {
    expect(clubKey("FC Barcelona")).toBe(clubKey("Barcelona"));
    expect(clubKey("Real Madrid CF")).toBe(clubKey("Real Madrid"));
    expect(clubKey("Bayern München")).toBe(clubKey("Bayern Munich"));
    expect(clubKey("Internazionale")).toBe(clubKey("Inter"));
    expect(clubKey("Inter Milan")).toBe(clubKey("Inter"));
    expect(clubKey("Bayern Munich, captain")).toBe(clubKey("Bayern Munich"));
  });

  it("keeps genuinely different clubs apart", () => {
    expect(clubKey("Santos")).not.toBe(clubKey("Santos Laguna"));
    expect(clubKey("Inter")).not.toBe(clubKey("Inter Miami"));
    expect(clubKey("Barcelona")).not.toBe(clubKey("Espanyol de Barcelona"));
  });

  it("links players across edition spellings of one club", () => {
    // Exact-match chemistry used to miss this — different strings, same club.
    const chem = calculateChemistry([pick(1, "FC Barcelona"), pick(2, "Barcelona")]);
    expect(chem.total).toBeCloseTo(0.5);
    expect(chem.links).toHaveLength(1);
  });
});

describe("career-club chemistry", () => {
  it("gives a half-value link when one player only shares a career club", () => {
    // A is at Juventus now; B is at Real but played Juventus historically.
    const chem = calculateChemistry([
      pick(1, "Juventus"),
      pick(2, "Real Madrid", { clubHistory: ["Real Madrid", "Juventus"] }),
    ]);
    expect(chem.total).toBeCloseTo(0.25); // (1.0 + 0.5 - 1) * 0.5
  });

  it("does not link two players who only share a career club (no snapshot anchor)", () => {
    const chem = calculateChemistry([
      pick(1, "Arsenal", { clubHistory: ["Arsenal", "Roma"] }),
      pick(2, "Milan", { clubHistory: ["Milan", "Roma"] }),
    ]);
    expect(chem.total).toBe(0); // (0.5 + 0.5 - 1) * 0.5 = 0
  });
});

describe("legend chemistry boost", () => {
  it("counts a legend double on a shared snapshot club", () => {
    const chem = calculateChemistry([
      pick(1, "Real Madrid", { isLegend: true }),
      pick(2, "Real Madrid"),
    ]);
    expect(chem.total).toBeCloseTo(1.0); // (2 + 1 - 1) * 0.5
  });

  it("lets a legend forge a full link through a career club", () => {
    // Zidane (snapshot Real, career Juventus) + a current Juventus player.
    const chem = calculateChemistry([
      pick(1, "Real Madrid", { isLegend: true, clubHistory: ["Real Madrid", "Juventus"] }),
      pick(2, "Juventus"),
    ]);
    expect(chem.total).toBeCloseTo(0.5); // (0.5*2 + 1 - 1) * 0.5
  });

  it("gives a lone legend nothing without a clubmate", () => {
    const chem = calculateChemistry([
      pick(1, "Real Madrid", { isLegend: true, clubHistory: ["Real Madrid", "Juventus"] }),
      pick(2, "Bayern Munich"),
      pick(3, "Arsenal"),
    ]);
    expect(chem.total).toBe(0);
  });
});
