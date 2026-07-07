import type { DraftPick } from "./types";

// ── Club Chemistry ("Ball Knowledge") ────────────────────────────────────────
// Players in your XI who share a real-world club quietly link up and lift the
// team's overall. A reward for football knowledge and clever drafting — hard to
// farm from random nation spins, so it's a nice-to-hit bonus, not a crutch.
//
// Per club with k of your players: (k - 1) * 0.5 OVR, summed across clubs and
// capped. Two same-club players → +0.5, three → +1.0, and it stacks.

export const CHEMISTRY_CAP = 3;
export const CHEMISTRY_PER_LINK = 0.5;

export interface ChemistryLink {
  club: string;
  count: number;
  bonus: number;
}

export interface Chemistry {
  total: number; // OVR bonus after the cap
  links: ChemistryLink[]; // clubs with 2+ of your players, strongest first
  capped: boolean; // true when the raw bonus exceeded the cap
}

export function calculateChemistry(picks: DraftPick[]): Chemistry {
  const byClub = new Map<string, number>();
  for (const pick of picks) {
    const club = pick.player.clubName;
    if (!club) continue;
    byClub.set(club, (byClub.get(club) ?? 0) + 1);
  }

  const links: ChemistryLink[] = [];
  for (const [club, count] of byClub) {
    if (count >= 2) {
      links.push({ club, count, bonus: (count - 1) * CHEMISTRY_PER_LINK });
    }
  }
  links.sort((a, b) => b.bonus - a.bonus || b.count - a.count || a.club.localeCompare(b.club));

  const raw = links.reduce((sum, link) => sum + link.bonus, 0);
  return { total: Math.min(raw, CHEMISTRY_CAP), links, capped: raw > CHEMISTRY_CAP };
}

/** The OVR bonus for a set of picks (0 when chemistry is off). */
export function chemistryBonus(picks: DraftPick[], enabled: boolean): number {
  return enabled ? calculateChemistry(picks).total : 0;
}
