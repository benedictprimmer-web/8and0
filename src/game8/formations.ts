import type { Formation, FormationSlot, SlotCategory } from "./types";

function makeSlots(sequence: SlotCategory[]): FormationSlot[] {
  const counts: Record<SlotCategory, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  return sequence.map((category) => {
    counts[category] += 1;
    return {
      id: `${category.toLowerCase()}-${counts[category]}`,
      label: category === "GK" ? "GK" : `${category} ${counts[category]}`,
      category,
    };
  });
}

export const FORMATIONS: Formation[] = [
  {
    id: "433",
    label: "4-3-3",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"]),
  },
  {
    id: "442",
    label: "4-4-2",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"]),
  },
  {
    id: "451",
    label: "4-5-1",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD"]),
  },
  {
    id: "343",
    label: "3-4-3",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"]),
  },
  {
    id: "352",
    label: "3-5-2",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD"]),
  },
  {
    id: "532",
    label: "5-3-2",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"]),
  },
  {
    id: "541",
    label: "5-4-1",
    slots: makeSlots(["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD"]),
  },
];

// Formations offered in the setup picker. 5-3-2 stays in FORMATIONS above so
// historical runs and leaderboard entries that used it still resolve their
// label, but it's no longer selectable — this keeps the mobile picker a tidy
// 3×2 block of six.
export const SELECTABLE_FORMATIONS: Formation[] = FORMATIONS.filter(
  (formation) => formation.id !== "532",
);

export function getFormation(id: string): Formation {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}
