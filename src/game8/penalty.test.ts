import { describe, expect, it } from "vitest";
import { seededRandom } from "./random";
import {
  keeperCenterWeight,
  missChance,
  pickDirection,
  resolveKick,
  saveChanceWhenCorrect,
} from "./penaltyModel";
import { REGULATION_KICKS, shootoutStatus } from "./shootoutStatus";
import type { ShotDirection } from "./penaltyText";

describe("penalty probability model", () => {
  it("rewards better takers with fewer misses, within bounds", () => {
    expect(missChance(60)).toBeGreaterThan(missChance(90));
    expect(missChance(40)).toBeLessThanOrEqual(0.12);
    expect(missChance(120)).toBeGreaterThanOrEqual(0.03);
  });

  it("rewards better keepers with more saves when they go the right way", () => {
    expect(saveChanceWhenCorrect(90)).toBeGreaterThan(saveChanceWhenCorrect(60));
    expect(saveChanceWhenCorrect(40)).toBeGreaterThanOrEqual(0.3);
    expect(saveChanceWhenCorrect(200)).toBeLessThanOrEqual(0.8);
  });

  it("picks directions deterministically from the RNG", () => {
    // centerWeight 0.2 → sides occupy [0, 0.4) and [0.4, 0.8), center [0.8, 1).
    expect(pickDirection(0.2, () => 0)).toBe("left");
    expect(pickDirection(0.2, () => 0.5)).toBe("right");
    expect(pickDirection(0.2, () => 0.9)).toBe("center");
  });

  it("never saves when the keeper dives the wrong way", () => {
    // No miss (0.99), then directions differ → save roll is never reached.
    expect(resolveKick("left", "right", 80, 80, () => 0.99)).toBe("goal");
  });

  it("saves only when the keeper matches and the save roll succeeds", () => {
    const seq = (...vals: number[]) => {
      let i = 0;
      return () => vals[i++] ?? 0;
    };
    // miss roll high (no miss), save roll low (< save chance) → saved
    expect(resolveKick("center", "center", 80, 80, seq(0.99, 0))).toBe("saved");
    // miss roll high, save roll high (> save chance) → goal
    expect(resolveKick("center", "center", 80, 80, seq(0.99, 0.99))).toBe("goal");
    // miss roll low → missed
    expect(resolveKick("center", "center", 80, 80, seq(0))).toBe("missed");
  });

  it("converts penalties at a realistic ~75% over many kicks", () => {
    const rng = seededRandom("penalty-monte-carlo");
    const directions: ShotDirection[] = ["left", "center", "right"];
    const N = 6000;
    let goals = 0;
    for (let i = 0; i < N; i += 1) {
      const shot = directions[Math.floor(rng() * 3)];
      const keeper = pickDirection(keeperCenterWeight(80), rng);
      if (resolveKick(shot, keeper, 80, 80, rng) === "goal") goals += 1;
    }
    const rate = goals / N;
    expect(rate).toBeGreaterThan(0.68);
    expect(rate).toBeLessThan(0.82);
  });
});

describe("best-of-five shootout status", () => {
  it("does not end before either side can clinch", () => {
    const s = shootoutStatus({ userScore: 0, oppScore: 0, userKicks: 0, oppKicks: 0 });
    expect(s.decided).toBe(false);
    expect(s.suddenDeath).toBe(false);
    expect(s.nextTeam).toBe("user");
  });

  it("alternates teams, user first each round", () => {
    expect(shootoutStatus({ userScore: 0, oppScore: 0, userKicks: 1, oppKicks: 0 }).nextTeam).toBe("opponent");
    expect(shootoutStatus({ userScore: 0, oppScore: 0, userKicks: 1, oppKicks: 1 }).nextTeam).toBe("user");
  });

  it("clinches early once the trailing side cannot catch up", () => {
    // 3-0 after three kicks each: opponent has two left, cannot reach 3.
    const s = shootoutStatus({ userScore: 3, oppScore: 0, userKicks: 3, oppKicks: 3 });
    expect(s.decided).toBe(true);
    expect(s.winner).toBe("user");

    // Symmetric for the opponent leading.
    const o = shootoutStatus({ userScore: 0, oppScore: 3, userKicks: 3, oppKicks: 3 });
    expect(o.decided).toBe(true);
    expect(o.winner).toBe("opponent");
  });

  it("does not clinch while the trailing side can still draw level", () => {
    // 3-0 but opponent has taken only two kicks (three remaining) → still alive.
    const s = shootoutStatus({ userScore: 3, oppScore: 0, userKicks: 3, oppKicks: 2 });
    expect(s.decided).toBe(false);
  });

  it("decides at the end of regulation when not level", () => {
    const s = shootoutStatus({ userScore: 4, oppScore: 3, userKicks: REGULATION_KICKS, oppKicks: REGULATION_KICKS });
    expect(s.decided).toBe(true);
    expect(s.winner).toBe("user");
    expect(s.suddenDeath).toBe(false);
  });

  it("enters sudden death when level after regulation", () => {
    const s = shootoutStatus({ userScore: 3, oppScore: 3, userKicks: 5, oppKicks: 5 });
    expect(s.decided).toBe(false);
    expect(s.suddenDeath).toBe(true);
    expect(s.nextTeam).toBe("user");
  });

  it("waits for a complete pair in sudden death before deciding", () => {
    // User has scored the first sudden-death kick; opponent still to reply.
    const mid = shootoutStatus({ userScore: 4, oppScore: 3, userKicks: 6, oppKicks: 5 });
    expect(mid.decided).toBe(false);
    expect(mid.suddenDeath).toBe(true);
    expect(mid.nextTeam).toBe("opponent");

    // Opponent misses the reply → user wins the pair.
    const done = shootoutStatus({ userScore: 4, oppScore: 3, userKicks: 6, oppKicks: 6 });
    expect(done.decided).toBe(true);
    expect(done.winner).toBe("user");
  });
});
