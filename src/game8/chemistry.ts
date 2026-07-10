import type { DraftPick, EightZeroPlayer } from "./types";

// ── Club Chemistry ("Ball Knowledge") ────────────────────────────────────────
// Players in your XI who share a real-world club quietly link up and lift the
// team's overall. A reward for football knowledge and clever drafting — hard to
// farm from random nation spins, so it's a nice-to-hit bonus, not a crutch.
//
// A club link is worth (weightedK - 1) * 0.5 OVR, where weightedK sums each
// member's weight at that club:
//   - snapshot club (their current one)      → 1.0
//   - career club (played there historically) → 0.5   (half — a fainter bond)
//   - legends count DOUBLE their weight (fame carries the dressing room)
// Summed across clubs, capped. Needs 2+ real players at a club to activate, so
// a lone legend links nothing on its own.

export const CHEMISTRY_CAP = 3;
export const CHEMISTRY_PER_LINK = 0.5;
const CAREER_TIER = 0.5; // a career-only bond is worth half a snapshot bond
const LEGEND_MULTIPLIER = 2;

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

// Fold spelling/edition variants of the same club onto one key so career links
// actually match: "FC Barcelona"/"Barcelona", "Real Madrid CF"/"Real Madrid",
// "Bayern München"/"Bayern Munich", "Inter"/"Internazionale"/"Inter Milan".
// ponytail: explicit alias map over the known dual-language/abbrev collisions —
// swap for a fuzzy matcher only if unseen club names start mis-merging.
const GENERIC_TOKENS = new Set(["fc", "cf", "sc", "ac", "sl", "rcd", "ss", "cd", "afc", "de", "club"]);
const CLUB_ALIASES: Record<string, string> = {
  internazionale: "inter",
  "inter milan": "inter",
  "bayern munchen": "bayern munich",
};

export function clubKey(name: string): string {
  const base = name
    .split(",")[0] // drop role suffixes: "Bayern Munich, captain"
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (München → Munchen)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const cleaned = base
    .split(" ")
    .filter((t) => t && !GENERIC_TOKENS.has(t))
    .join(" ");
  const key = cleaned || base; // don't let an all-generic name collapse to ""
  return CLUB_ALIASES[key] ?? key;
}

// A player's clubs as (key → tier), snapshot winning over career on collision.
function playerClubs(player: EightZeroPlayer): Map<string, "snapshot" | "career"> {
  const history = player.clubHistory?.length ? player.clubHistory : player.clubName ? [player.clubName] : [];
  const clubs = new Map<string, "snapshot" | "career">();
  history.forEach((name, i) => {
    if (!name) return;
    const key = clubKey(name);
    if (!key) return;
    const tier = i === 0 ? "snapshot" : "career";
    if (tier === "snapshot" || !clubs.has(key)) clubs.set(key, tier);
  });
  return clubs;
}

interface Member {
  weight: number;
  display: string;
  tier: "snapshot" | "career";
}

export function calculateChemistry(picks: DraftPick[]): Chemistry {
  // key → its members (a player counts once per club, at its best tier).
  const byClub = new Map<string, Member[]>();
  for (const pick of picks) {
    const player = pick.player;
    const history = player.clubHistory?.length ? player.clubHistory : player.clubName ? [player.clubName] : [];
    const clubs = playerClubs(player);
    for (const [key, tier] of clubs) {
      const base = tier === "snapshot" ? 1 : CAREER_TIER;
      const weight = base * (player.isLegend ? LEGEND_MULTIPLIER : 1);
      // Prefer a snapshot spelling for display, else the first history entry.
      const display = history.find((n) => n && clubKey(n) === key) ?? key;
      const members = byClub.get(key) ?? [];
      members.push({ weight, display, tier });
      byClub.set(key, members);
    }
  }

  const links: ChemistryLink[] = [];
  for (const [, members] of byClub) {
    if (members.length < 2) continue; // need 2+ real players sharing the club
    const weightedK = members.reduce((sum, m) => sum + m.weight, 0);
    const bonus = Math.max(0, weightedK - 1) * CHEMISTRY_PER_LINK;
    if (bonus <= 0) continue; // e.g. two career-only regulars, no snapshot anchor
    const display = members.find((m) => m.tier === "snapshot")?.display ?? members[0].display;
    links.push({ club: display, count: members.length, bonus });
  }
  links.sort((a, b) => b.bonus - a.bonus || b.count - a.count || a.club.localeCompare(b.club));

  const raw = links.reduce((sum, link) => sum + link.bonus, 0);
  return { total: Math.min(raw, CHEMISTRY_CAP), links, capped: raw > CHEMISTRY_CAP };
}

/** The OVR bonus for a set of picks (0 when chemistry is off). */
export function chemistryBonus(picks: DraftPick[], enabled: boolean): number {
  return enabled ? calculateChemistry(picks).total : 0;
}
