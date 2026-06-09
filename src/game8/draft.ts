import { getFormation } from "./formations";
import { pickSeeded } from "./random";
import type { EightZeroData } from "./data";
import type {
  DraftDifficulty,
  DraftMode,
  DraftOptions,
  DraftPick,
  DraftState,
  EightZeroPlayer,
  EightZeroTeam,
  FormationSlot,
} from "./types";

const DEFAULT_OPTIONS: DraftOptions = {
  difficulty: "normal",
  blindMode: false,
  draftMode: "squad-first",
};

export function rerollsForDifficulty(difficulty: DraftDifficulty): number {
  if (difficulty === "easy") return 3;
  if (difficulty === "hard") return 0;
  return 1;
}

export function createDraftState(
  seed: string,
  formationId = "433",
  options: Partial<DraftOptions> = {}
): DraftState {
  const formation = getFormation(formationId);
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  return {
    seed,
    formationId: formation.id,
    picks: [],
    activeSlotId: formation.slots[0].id,
    currentSpin: null,
    rerollsLeft: rerollsForDifficulty(resolvedOptions.difficulty),
    spinCount: 0,
    complete: false,
    difficulty: resolvedOptions.difficulty,
    blindMode: resolvedOptions.blindMode || resolvedOptions.difficulty === "hard",
    draftMode: resolvedOptions.draftMode,
  };
}

export function getActiveSlot(state: DraftState): FormationSlot {
  const formation = getFormation(state.formationId);
  return formation.slots.find((slot) => slot.id === state.activeSlotId) ?? formation.slots[0];
}

export function getOpenSlots(state: DraftState): FormationSlot[] {
  const filled = new Set(state.picks.map((pick) => pick.slotId));
  return getFormation(state.formationId).slots.filter((slot) => !filled.has(slot.id));
}

export function setActiveSlot(state: DraftState, slotId: string): DraftState {
  const open = getOpenSlots(state);
  if (!open.some((slot) => slot.id === slotId)) return state;
  return { ...state, activeSlotId: slotId, currentSpin: null };
}

export function getCompatibleOpenSlots(player: EightZeroPlayer, state: DraftState): FormationSlot[] {
  return getOpenSlots(state).filter((slot) => slot.category === player.category);
}

export function canPickPlayer(player: EightZeroPlayer, state: DraftState): boolean {
  return getCompatibleOpenSlots(player, state).length > 0;
}

export function getAvailablePlayers(
  data: EightZeroData,
  state: DraftState,
  team: EightZeroTeam | null = state.currentSpin?.team ?? null
): EightZeroPlayer[] {
  if (!team) return [];
  const draftedIds = new Set(state.picks.map((pick) => pick.player.id));
  return (data.playersByTeam.get(team.teamId) ?? []).filter((player) => !draftedIds.has(player.id));
}

function playerCanFillSpinContext(player: EightZeroPlayer, state: DraftState, draftMode: DraftMode): boolean {
  if (draftMode === "position-first") {
    return player.category === getActiveSlot(state).category;
  }
  return canPickPlayer(player, state);
}

export function spinTeam(data: EightZeroData, state: DraftState): DraftState {
  if (state.complete) return state;
  const eligibleTeams = data.teams.filter((team) =>
    getAvailablePlayers(data, state, team).some((player) =>
      playerCanFillSpinContext(player, state, state.draftMode)
    )
  );
  if (eligibleTeams.length === 0) {
    throw new Error("No eligible teams have a player for an open slot");
  }
  const spinIndex = state.spinCount + 1;
  const seedKey =
    state.draftMode === "position-first"
      ? `${state.seed}:spin:${spinIndex}:${state.activeSlotId}`
      : `${state.seed}:spin:${spinIndex}`;
  const team = pickSeeded(eligibleTeams, seedKey);
  return {
    ...state,
    currentSpin: { team, spinIndex },
    spinCount: spinIndex,
  };
}

export function rerollTeam(data: EightZeroData, state: DraftState): DraftState {
  if (state.rerollsLeft <= 0 || !state.currentSpin) return state;
  return {
    ...spinTeam(data, { ...state, currentSpin: null }),
    rerollsLeft: state.rerollsLeft - 1,
  };
}

export function selectPlayer(
  data: EightZeroData,
  state: DraftState,
  playerId: number,
  slotId?: string
): DraftState {
  if (!state.currentSpin) {
    throw new Error("Spin before selecting a player");
  }
  const player = getAvailablePlayers(data, state).find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error("Player is not available for this nation");
  }
  const compatibleSlots = getCompatibleOpenSlots(player, state);
  if (compatibleSlots.length === 0) {
    throw new Error("Player has no compatible open slot");
  }
  if (state.draftMode === "position-first" && slotId && slotId !== state.activeSlotId) {
    throw new Error("Selected slot is not the active position-first slot");
  }
  const slot = slotId ? compatibleSlots.find((candidate) => candidate.id === slotId) : compatibleSlots[0];
  if (!slot) {
    if (slotId) {
      throw new Error("Selected slot is not compatible with this player");
    }
    throw new Error("Player has no compatible open slot");
  }
  const pick: DraftPick = {
    slotId: slot.id,
    slotLabel: slot.label,
    category: slot.category,
    player,
    spinTeam: state.currentSpin.team,
    round: state.picks.length + 1,
  };
  const picks = [...state.picks, pick];
  const nextSlot = getFormation(state.formationId).slots.find(
    (candidate) => !picks.some((filled) => filled.slotId === candidate.id)
  );

  return {
    ...state,
    picks,
    activeSlotId: nextSlot?.id ?? slot.id,
    currentSpin: null,
    complete: !nextSlot,
  };
}

export function autofillDraft(
  data: EightZeroData,
  state: DraftState
): DraftState {
  let current = state;
  const formation = getFormation(state.formationId);

  for (const slot of formation.slots) {
    if (current.picks.some((p) => p.slotId === slot.id)) continue;

    current = { ...current, activeSlotId: slot.id };

    // Spin a team
    const eligibleTeams = data.teams.filter((team) =>
      getAvailablePlayers(data, current, team).some(
        (player) => player.category === slot.category
      )
    );
    if (eligibleTeams.length === 0) break;

    const spinIndex = current.spinCount + 1;
    const seedKey = `${current.seed}:autofill:spin:${spinIndex}`;
    const team = pickSeeded(eligibleTeams, seedKey);
    current = {
      ...current,
      currentSpin: { team, spinIndex },
      spinCount: spinIndex,
    };

    // Pick best available player for this slot's category
    const available = getAvailablePlayers(data, current, team).filter(
      (p) => p.category === slot.category
    );
    if (available.length === 0) break;

    const best = [...available].sort((a, b) => b.rating - a.rating)[0];

    const pick: DraftPick = {
      slotId: slot.id,
      slotLabel: slot.label,
      category: slot.category,
      player: best,
      spinTeam: team,
      round: current.picks.length + 1,
    };

    current = {
      ...current,
      picks: [...current.picks, pick],
      currentSpin: null,
    };
  }

  const nextSlot = formation.slots.find(
    (candidate) => !current.picks.some((filled) => filled.slotId === candidate.id)
  );

  return {
    ...current,
    activeSlotId: nextSlot?.id ?? current.activeSlotId,
    complete: !nextSlot,
  };
}
