import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Globe,
  HelpCircle,
  Medal,
  Play,
  RefreshCw,
  Share2,
  Shield,
  Shuffle,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { api, leaderboardApi, type LeaderboardResponse, type RankedEntry, type SubmitResponse } from "../api/client";
import { buildSubmission } from "../game8/leaderboard";
import Celebration from "../components/Celebration";
import Flag from "../components/Flag";
import LiveMatch from "../components/LiveMatch";
import PenaltyShootout from "../components/PenaltyShootout";
import TournamentBracket from "../components/TournamentBracket";
import { buildEightZeroData, type RawPlayer, type RawTeam } from "../game8/data";
import { selectKeeper, selectPenaltyTakers } from "../game8/penaltyLineup";
import {
  autofillDraft,
  canPickPlayer,
  createDraftState,
  getActiveSlot,
  getAvailablePlayers,
  getCompatibleOpenSlots,
  getOpenSlots,
  rerollTeam,
  selectPlayer,
  spinTeam,
} from "../game8/draft";
import { FORMATIONS, getFormation } from "../game8/formations";
import { calculateTeamRatings } from "../game8/ratings";
import {
  addMyGlobalEntry,
  loadMyGlobalEntries,
  shareText,
  loadHistory,
  loadPlayerName,
  savePlayerName,
  saveRun,
  sortRuns,
} from "../game8/storage";
import { buildMatchEvents, simulateTournamentRun } from "../game8/simulate";
import type {
  DraftDifficulty,
  DraftMode,
  DraftOptions,
  DraftPick,
  DraftState,
  EightZeroPlayer,
  EightZeroTeam,
  FormationSlot,
  MatchEvent,
  SlotCategory,
  TournamentRun,
} from "../game8/types";

const DEFAULT_FORMATION = "433";
// Knockout stages that trigger the confetti celebration (group wins do not).
const KNOCKOUT_STAGES = new Set(["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"]);
const DEFAULT_OPTIONS: DraftOptions = {
  difficulty: "normal",
  blindMode: false,
  draftMode: "squad-first",
  legendMode: "none",
};

const DIFFICULTIES: Array<{
  id: DraftDifficulty;
  label: string;
  detail: string;
}> = [
  { id: "easy", label: "Easy", detail: "3 rerolls" },
  { id: "normal", label: "Normal", detail: "1 reroll" },
  { id: "hard", label: "Hard", detail: "No rerolls · ratings hidden" },
];

const DRAFT_MODES: Array<{ id: DraftMode; label: string; detail: string }> = [
  { id: "squad-first", label: "Squad first", detail: "Spin a nation, pick any player for an open category." },
  { id: "position-first", label: "Position first", detail: "The draft asks for a category, then auto-fills the next open slot." },
];

function makeSeed(): string {
  return `eight-zero-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shouldHideRatings(state: DraftState | null, reveal = false): boolean {
  if (reveal || !state) return false;
  return state.blindMode || state.difficulty === "hard";
}

function formatRating(value: number, hidden: boolean): string {
  return hidden ? "???" : String(Math.round(value));
}

function RatingPill({
  label,
  value,
  hidden = false,
}: {
  label: string;
  value: number;
  hidden?: boolean;
}) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-center">
      <p className="text-lg font-extrabold tabular-nums text-white">{formatRating(value, hidden)}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

function OptionButton({
  active,
  className = "",
  children,
  onClick,
  disabled = false,
}: {
  active: boolean;
  className?: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-center font-bold transition-colors ${
        active
          ? "border-gold-600 bg-gold-500 text-black"
          : "border-surface-700 bg-surface-950 text-gray-400 hover:border-gold-600/40 hover:text-white"
      } ${disabled ? "cursor-not-allowed opacity-50 hover:border-surface-700 hover:text-gray-400" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function FormationGlyph({ formationId, active }: { formationId: string; active: boolean }) {
  const formation = getFormation(formationId);
  const rows: SlotCategory[] = ["FWD", "MID", "DEF", "GK"];
  const dot = active ? "bg-black/80" : "bg-gold-500/70";
  return (
    <span className="flex flex-col items-center gap-[3px]" aria-hidden="true">
      {rows.map((category) => {
        const count = formation.slots.filter((slot) => slot.category === category).length;
        return (
          <span key={category} className="flex gap-[3px]">
            {Array.from({ length: count }).map((_, index) => (
              <span key={index} className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            ))}
          </span>
        );
      })}
    </span>
  );
}

function hashString(value: string): number {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getKitColors(code: string): { primary: string; secondary: string } {
  const known: Record<string, { primary: string; secondary: string }> = {
    ARG: { primary: "#ecfeff", secondary: "#38bdf8" },
    BEL: { primary: "#dc2626", secondary: "#facc15" },
    BRA: { primary: "#facc15", secondary: "#16a34a" },
    ENG: { primary: "#f8fafc", secondary: "#dc2626" },
    FRA: { primary: "#1d4ed8", secondary: "#f8fafc" },
    GER: { primary: "#f8fafc", secondary: "#111827" },
    ITA: { primary: "#2563eb", secondary: "#f8fafc" },
    NED: { primary: "#f97316", secondary: "#111827" },
    POR: { primary: "#dc2626", secondary: "#16a34a" },
    ESP: { primary: "#dc2626", secondary: "#facc15" },
    USA: { primary: "#f8fafc", secondary: "#1d4ed8" },
  };
  if (known[code]) return known[code];

  const palette = [
    ["#dc2626", "#facc15"],
    ["#2563eb", "#f8fafc"],
    ["#16a34a", "#f8fafc"],
    ["#f8fafc", "#dc2626"],
    ["#facc15", "#2563eb"],
    ["#7c3aed", "#f8fafc"],
    ["#0f172a", "#facc15"],
  ];
  const [primary, secondary] = palette[hashString(code) % palette.length];
  return { primary, secondary };
}

function ShirtIcon({
  code,
  empty = false,
  number,
}: {
  code: string;
  empty?: boolean;
  number?: number | null;
}) {
  const colors = getKitColors(code);
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className="h-10 w-10 drop-shadow-lg sm:h-12 sm:w-12">
      <path
        d="M19 8 7 18l9 13 5-4v27h22V27l5 4 9-13L45 8l-7 5H26l-7-5Z"
        fill={empty ? "rgba(15,23,42,0.82)" : colors.primary}
        stroke={empty ? "rgba(255,255,255,0.28)" : colors.secondary}
        strokeWidth="3"
      />
      {!empty && <path d="M26 13h12l-3 8h-6l-3-8Z" fill={colors.secondary} opacity="0.85" />}
      {number !== null && number !== undefined && (
        <text
          x="32"
          y="42"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={colors.secondary}
          fontSize="14"
          fontWeight="900"
          fontFamily="sans-serif"
        >
          {number}
        </text>
      )}
    </svg>
  );
}

function PitchXI({
  formationId,
  picks,
  activeSlotId,
  hideRatings,
  revealRatings = false,
  goalScorers = {},
  legendSlotId,
}: {
  formationId: string;
  picks: DraftPick[];
  activeSlotId?: string;
  hideRatings: boolean;
  revealRatings?: boolean;
  goalScorers?: Record<string, number>;
  legendSlotId?: string;
}) {
  const formation = getFormation(formationId);
  const pickBySlot = new Map(picks.map((pick) => [pick.slotId, pick]));
  const rows: SlotCategory[] = ["GK", "DEF", "MID", "FWD"];
  const hide = hideRatings && !revealRatings;

  return (
    <div className="overflow-hidden rounded-xl border border-green-900/60 bg-green-700">
      <div
        className="space-y-4 px-3 py-5 sm:px-5 sm:py-7"
        style={{
          background:
            "repeating-linear-gradient(180deg, #168a3f 0 72px, #12a14a 72px 144px)",
        }}
      >
        {rows.map((category) => {
          const slots = formation.slots.filter((slot) => slot.category === category);
          return (
            <div key={category} className="flex min-h-[92px] items-center justify-center gap-3 sm:gap-5">
              {slots.map((slot) => {
                const pick = pickBySlot.get(slot.id);
                const active = activeSlotId === slot.id && !pick;
                const goals = pick ? (goalScorers[pick.player.name] ?? 0) : 0;
                const isLegend = legendSlotId === slot.id && pick;
                return (
                  <div key={slot.id} className="flex min-w-0 flex-1 max-w-[116px] flex-col items-center">
                    <div
                      className={`relative rounded-xl px-2 py-1 ${
                        active ? "bg-gold-500/20 ring-2 ring-gold-400/80" : ""
                      }`}
                    >
                      <ShirtIcon code={pick?.player.teamCode ?? slot.category} empty={!pick} number={pick?.player.shirtNumber} />
                      {goals > 0 && (
                        <span className="absolute -top-1 -right-1 text-xs">
                          {"⚽".repeat(goals)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 w-full overflow-hidden rounded-md bg-white px-2 py-1 text-center text-xs font-black shadow-sm">
                      <p className={`truncate ${isLegend ? "text-gold-500" : "text-surface-950"}`}>{pick?.player.name ?? slot.label}</p>
                    </div>
                    <div className="w-[78%] rounded-b-md bg-surface-950 px-2 py-0.5 text-center text-xs font-black text-gold-400 tabular-nums">
                      {pick ? formatRating(pick.player.rating, hide) : "--"}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  compatibleSlots,
  disabled,
  hideRating,
  onPick,
  isLegend = false,
}: {
  player: EightZeroPlayer;
  compatibleSlots: FormationSlot[];
  disabled: boolean;
  hideRating: boolean;
  onPick: (playerId: number) => void;
  isLegend?: boolean;
}) {
  const kitColors = getKitColors(player.teamCode);
  return (
    <button
      type="button"
      onClick={() => onPick(player.id)}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:border-gold-600/40 hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-surface-700 disabled:hover:bg-surface-800 ${isLegend ? "border-gold-600/60 bg-gold-500/5" : "border-surface-700 bg-surface-800"}`}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-900 text-sm font-extrabold text-gold-400 tabular-nums">
        {formatRating(player.rating, hideRating)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">
          {player.name}
          {isLegend && (
            <span className="ml-2 inline-flex items-center rounded-full bg-gold-500/10 px-1.5 py-0.5 text-[10px] font-black text-gold-400">Legend</span>
          )}
        </p>
        <p className="truncate text-xs text-gray-500">
          {player.position} · {player.clubName ?? "Free agent"}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2 text-xs font-semibold text-gray-400">
        <Flag fifaCode={player.teamCode} size={20} />
        <span>{player.teamCode}</span>
        {player.shirtNumber !== null && (
          <span
            className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums"
            style={{
              backgroundColor: kitColors.primary,
              color: kitColors.secondary,
            }}
          >
            {player.shirtNumber}
          </span>
        )}
      </div>
      <span className="flex-shrink-0 text-xs font-bold text-gray-500">
        {compatibleSlots.length > 0 ? player.category : "Full"}
      </span>
    </button>
  );
}

function LegendModal({
  onSelect,
  onClose,
}: {
  onSelect: (legendMode: "messi" | "ronaldo" | "neymar") => void;
  onClose: () => void;
}) {
  const legends = [
    {
      mode: "messi" as const,
      name: "Lionel Messi",
      team: "Argentina",
      code: "ARG",
      rating: 90,
      position: "FW",
    },
    {
      mode: "ronaldo" as const,
      name: "Cristiano Ronaldo",
      team: "Portugal",
      code: "POR",
      rating: 88,
      position: "FW",
    },
    {
      mode: "neymar" as const,
      name: "Neymar",
      team: "Brazil",
      code: "BRA",
      rating: 87,
      position: "MF",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-up" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Last Dance"
        className="w-full max-w-2xl rounded-2xl border border-indigo-900/70 bg-[#11111f] p-6 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-black text-white">Last Dance</h2>
          <p className="mt-1 text-sm text-gray-400">Choose your legend. They are auto-locked as your first pick.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {legends.map((legend) => (
            <button
              key={legend.mode}
              type="button"
              onClick={() => onSelect(legend.mode)}
              className="group flex flex-col items-center rounded-xl border border-surface-700 bg-surface-950 p-5 text-center transition-colors hover:border-gold-600/60 hover:bg-surface-900"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-500/10 group-hover:bg-gold-500/20">
                <Flag fifaCode={legend.code} size={48} />
              </div>
              <p className="mt-3 text-lg font-black text-white">{legend.name}</p>
              <p className="text-sm text-gray-400">{legend.team}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md bg-gold-500/10 px-2 py-1 text-xs font-bold text-gold-400">{legend.rating} OVR</span>
                <span className="rounded-md bg-surface-800 px-2 py-1 text-xs font-bold text-gray-400">{legend.position}</span>
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-sm font-bold text-gray-400 transition-colors hover:border-gold-600/40 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Compact live top-5 of the global leaderboard, shown on the setup screen so
// players see the board (and the competition) before they even start a run.
function GlobalTopFive() {
  // Seeds this device has submitted — sent with the request so the API returns
  // this player's current rank ("mine"), even when they're outside the top 5.
  const mySeeds = useMemo(() => loadMyGlobalEntries().map((entry) => entry.seed), []);
  const mySeedSet = useMemo(() => new Set(mySeeds), [mySeeds]);

  const query = useQuery<LeaderboardResponse>({
    queryKey: ["8-0-global-top5", mySeeds],
    queryFn: () => leaderboardApi.list(5, mySeeds),
    staleTime: 30_000,
  });
  const entries = (query.data?.entries ?? []).slice(0, 5);
  const myBest = (query.data?.mine ?? []).reduce<RankedEntry | null>((best, item) => {
    if (item.rank == null) return best;
    if (!best || best.rank == null || item.rank < best.rank) return item;
    return best;
  }, null);
  const myBestInTopFive = myBest?.rank != null && myBest.rank <= entries.length;

  return (
    <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <p className="section-label text-base tracking-[0.18em] inline-flex items-center gap-2">
          <Globe size={16} className="text-gold-400" />
          Global leaderboard
        </p>
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-1 text-sm font-bold text-gold-400 hover:underline"
        >
          View full
          <ArrowLeft size={14} className="rotate-180" />
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {query.isLoading && <p className="text-sm text-gray-500">Loading the board…</p>}
        {!query.isLoading && entries.length === 0 && (
          <p className="text-sm text-gray-500">No runs yet — be the first to make the board.</p>
        )}
        {entries.map((entry, index) => {
          const isMine = mySeedSet.has(entry.seed);
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                isMine ? "border-gold-600 bg-gold-500/10" : "border-surface-700 bg-surface-800"
              }`}
            >
              <span className="w-6 flex-shrink-0 text-center font-black text-gray-500">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-white">
                  {index === 0 && <Trophy size={14} className="flex-shrink-0 text-gold-400" />}
                  <span className="truncate">{entry.name}</span>
                  {isMine && (
                    <span className="flex-shrink-0 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-black text-black">
                      YOU
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {entry.stageReached} · {entry.formationLabel}
                </p>
              </div>
              <span className="flex-shrink-0 font-black tabular-nums text-gold-400">{entry.score}</span>
            </div>
          );
        })}
      </div>
      {myBest?.rank != null && !myBestInTopFive && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-gold-600/40 bg-gold-500/5 px-3 py-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-gold-300">
            <span className="rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-black text-black">YOU</span>
            Your best: #{myBest.rank}
          </span>
          <span className="font-black tabular-nums text-gold-400">{myBest.entry.score}</span>
        </div>
      )}
    </section>
  );
}

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { title: "Draft your XI", text: "Spin to fill your chosen formation with 11 players from the World Cup pool — you get who you get." },
    { title: "Play the tournament", text: "Your XI plays through the group stage and the knockouts. Win matches to advance toward the final." },
    { title: "Score points", text: "Earn points for results, goals, and how deep you run. Harder difficulty and bigger upsets are worth more." },
    { title: "Hit the global board", text: "Submit your run to climb the worldwide leaderboard and see how you stack up against everyone." },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-up"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How it works"
        className="w-full max-w-lg rounded-2xl border border-indigo-900/70 bg-[#11111f] p-6 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-black text-white">How it works</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.title} className="flex gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-sm font-black text-gold-400">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-white">{step.title}</p>
                <p className="text-sm text-gray-400">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-gold-500 px-6 py-3 text-base font-black text-black transition-colors hover:bg-gold-400"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function SetupScreen({
  formationId,
  options,
  bestRun,
  loading,
  teamsCount,
  playersCount,
  onFormationChange,
  onOptionsChange,
  onStart,
  onLegendSelect,
  onStartPracticePenalties,
}: {
  formationId: string;
  options: DraftOptions;
  bestRun: TournamentRun | null;
  loading: boolean;
  teamsCount: number;
  playersCount: number;
  onFormationChange: (formationId: string) => void;
  onOptionsChange: (options: DraftOptions) => void;
  onStart: () => void;
  onLegendSelect: (legendMode: "none" | "messi" | "ronaldo" | "neymar") => void;
  onStartPracticePenalties?: () => void;
}) {
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  function updateOptions(next: Partial<DraftOptions>) {
    const merged = { ...options, ...next };
    if (merged.difficulty === "hard") merged.blindMode = true;
    onOptionsChange(merged);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-up pb-28 sm:pb-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl sm:text-6xl font-black tracking-normal text-white">8-0</h1>
          <p className="mt-2 max-w-md text-lg leading-7 text-gray-400">
            Spin a random World Cup XI, then go unbeaten — win all 8 and climb the global board.
          </p>
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-950 px-3 py-1.5 text-sm font-bold text-gray-300 transition-colors hover:border-gold-600/40 hover:text-white"
          >
            <HelpCircle size={15} />
            How it works
          </button>
        </div>
        <div className="text-right">
          <p className="text-3xl sm:text-5xl font-black text-gold-400 tabular-nums">{bestRun?.score ?? 0}</p>
          <p className="section-label">Best</p>
        </div>
      </div>

      <GlobalTopFive />

      <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
        <p className="section-label text-base tracking-[0.18em]">Formation</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {FORMATIONS.map((formation) => (
            <OptionButton
              key={formation.id}
              active={formationId === formation.id}
              onClick={() => onFormationChange(formation.id)}
              className="flex min-w-[104px] flex-col items-center gap-2 py-3"
            >
              <FormationGlyph formationId={formation.id} active={formationId === formation.id} />
              <span className="text-lg sm:text-xl">{formation.label}</span>
            </OptionButton>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
        <p className="section-label text-base tracking-[0.18em]">Modes</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <button
              type="button"
              onClick={() => {
                if (options.legendMode !== "none") {
                  onLegendSelect("none");
                } else {
                  setShowLegendModal(true);
                }
              }}
              disabled={loading}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-6 py-4 text-lg font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                options.legendMode !== "none"
                  ? "border-gold-600 bg-gold-500/10 text-gold-400 hover:bg-gold-500/20"
                  : "border-surface-700 bg-surface-950 text-white hover:border-gold-600/40 hover:bg-surface-900"
              }`}
            >
              <Trophy size={20} className={options.legendMode !== "none" ? "text-gold-400" : "text-gray-400"} />
              {options.legendMode !== "none" ? `Last Dance: ${titleCase(options.legendMode)}` : "Last Dance"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">
              {options.legendMode !== "none" ? "Click to cancel legend mode." : "Lock a legend as your first pick."}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => onStartPracticePenalties?.()}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-surface-700 bg-surface-950 px-6 py-4 text-lg font-black text-white transition-colors hover:border-gold-600/40 hover:bg-surface-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Target size={20} className="text-gold-400" />
              Practice Penalties
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">Warm up with a standalone shootout.</p>
          </div>
        </div>
        {showLegendModal && (
          <LegendModal
            onSelect={(legendMode) => {
              setShowLegendModal(false);
              onLegendSelect(legendMode);
            }}
            onClose={() => setShowLegendModal(false)}
          />
        )}
      </section>

      <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
        <p className="section-label text-base tracking-[0.18em]">Difficulty</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {DIFFICULTIES.map((difficulty) => (
            <OptionButton
              key={difficulty.id}
              active={options.difficulty === difficulty.id}
              onClick={() => updateOptions({ difficulty: difficulty.id })}
              className="min-h-[92px]"
            >
              <span className="block text-lg">{difficulty.label}</span>
              <span className={`mt-1 block text-sm ${options.difficulty === difficulty.id ? "text-black/70" : "text-gray-500"}`}>
                {difficulty.detail}
              </span>
            </OptionButton>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
          <p className="section-label text-base tracking-[0.18em]">Ratings</p>
          <OptionButton
            active={options.blindMode}
            onClick={() => updateOptions({ blindMode: !options.blindMode })}
            disabled={options.difficulty === "hard"}
            className="mt-4 w-full text-lg"
          >
            Blind mode {options.blindMode ? "ON" : "OFF"}
          </OptionButton>
          <p className="mt-4 text-sm text-gray-500">
            {options.difficulty === "hard"
              ? "Hard mode always hides overalls during the draft. Final reveal still shows the squad."
              : "Hide overalls during the draft. Final reveal still shows the squad."}
          </p>
        </section>

        <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
          <p className="section-label text-base tracking-[0.18em]">Draft mode</p>
          <div className="mt-4 space-y-3">
            {DRAFT_MODES.map((mode) => (
              <OptionButton
                key={mode.id}
                active={options.draftMode === mode.id}
                onClick={() => updateOptions({ draftMode: mode.id })}
                className="w-full text-lg"
              >
                {mode.label}
              </OptionButton>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500">
            {DRAFT_MODES.find((mode) => mode.id === options.draftMode)?.detail}
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-surface-700 bg-surface-900 p-5">
        <div className="grid grid-cols-3 gap-3">
          <RatingPill label="Teams" value={loading ? 0 : teamsCount} />
          <RatingPill label="Players" value={loading ? 0 : playersCount} />
          <RatingPill label="Target" value={8} />
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-800 bg-surface-950/90 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            onClick={onStart}
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-xl bg-gold-500 px-6 py-5 text-xl font-black text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start draft →
          </button>
        </div>
      </div>

      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
    </div>
  );
}

function SquadPanel({
  picks,
  state,
  hideRatings,
  showPitch,
  matchGoalScorers = [],
  currentMatchIndex = 0,
  tournamentPhase = "idle",
}: {
  picks: DraftPick[];
  state: DraftState;
  hideRatings: boolean;
  showPitch: boolean;
  matchGoalScorers?: Record<string, number>[];
  currentMatchIndex?: number;
  tournamentPhase?: "idle" | "ready" | "live" | "penalties" | "practice_penalties" | "complete";
}) {
  // Accumulate goals only from completed matches
  const goalScorers: Record<string, number> = {};
  const matchesToShow = tournamentPhase === "complete"
    ? matchGoalScorers.length
    : currentMatchIndex;
  for (let i = 0; i < matchesToShow; i++) {
    const scorers = matchGoalScorers[i] ?? {};
    for (const [name, count] of Object.entries(scorers)) {
      goalScorers[name] = (goalScorers[name] ?? 0) + count;
    }
  }

  const ratings = picks.length ? calculateTeamRatings(picks) : null;

  return (
    <aside className="space-y-4">
      <div className="stat-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-label">Your XI</p>
            <h2 className="mt-1 text-lg font-extrabold text-white">{picks.length}/11 drafted</h2>
          </div>
          <Shield className="text-gold-500" size={22} />
        </div>
        {ratings && (
          <>
            <div className="mt-4 grid grid-cols-5 gap-2">
              <RatingPill label="OVR" value={ratings.overall} hidden={hideRatings} />
              <RatingPill label="GK" value={ratings.gk} hidden={hideRatings} />
              <RatingPill label="DEF" value={ratings.defence} hidden={hideRatings} />
              <RatingPill label="MID" value={ratings.midfield} hidden={hideRatings} />
              <RatingPill label="ATK" value={ratings.attack} hidden={hideRatings} />
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              OVR is weighted from your GK, defence, midfield and attack.
            </p>
          </>
        )}
      </div>

      {showPitch && (
        <PitchXI
          formationId={state.formationId}
          picks={picks}
          activeSlotId={state.activeSlotId}
          hideRatings={hideRatings}
          revealRatings
          goalScorers={goalScorers}
          legendSlotId={state.legendMode !== "none" ? picks[0]?.slotId : undefined}
        />
      )}
    </aside>
  );
}

function TeamSheet({
  state,
  picks,
  hideRatings,
  matchGoalScorers = [],
  currentMatchIndex = 0,
  tournamentPhase = "idle",
  onClose,
}: {
  state: DraftState;
  picks: DraftPick[];
  hideRatings: boolean;
  matchGoalScorers?: Record<string, number>[];
  currentMatchIndex?: number;
  tournamentPhase?: "idle" | "ready" | "live" | "penalties" | "practice_penalties" | "complete";
  onClose: () => void;
}) {
  // Mirror SquadPanel's goal accumulation so the sheet pitch shows the same scorers.
  const goalScorers: Record<string, number> = {};
  const matchesToShow = tournamentPhase === "complete" ? matchGoalScorers.length : currentMatchIndex;
  for (let i = 0; i < matchesToShow; i++) {
    for (const [name, count] of Object.entries(matchGoalScorers[i] ?? {})) {
      goalScorers[name] = (goalScorers[name] ?? 0) + count;
    }
  }

  const ratings = picks.length ? calculateTeamRatings(picks) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Your team">
      <button
        type="button"
        aria-label="Close team view"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-surface-700 bg-surface-900 p-4 pb-8 shadow-2xl shadow-black/60 animate-slide-up sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-2xl sm:border">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-700 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="section-label">Your XI</p>
            <h2 className="mt-1 text-lg font-extrabold text-white">{picks.length}/11 drafted</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-surface-700 bg-surface-950 text-gray-400 transition-colors hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {ratings && (
          <div className="mb-4 grid grid-cols-5 gap-2">
            <RatingPill label="OVR" value={ratings.overall} hidden={hideRatings} />
            <RatingPill label="GK" value={ratings.gk} hidden={hideRatings} />
            <RatingPill label="DEF" value={ratings.defence} hidden={hideRatings} />
            <RatingPill label="MID" value={ratings.midfield} hidden={hideRatings} />
            <RatingPill label="ATK" value={ratings.attack} hidden={hideRatings} />
          </div>
        )}
        <PitchXI
          formationId={state.formationId}
          picks={picks}
          hideRatings={hideRatings}
          goalScorers={goalScorers}
          legendSlotId={state.legendMode !== "none" ? picks[0]?.slotId : undefined}
        />
      </div>
    </div>
  );
}

function GlobalSubmit({ run }: { run: TournamentRun }) {
  const [name, setName] = useState(() => loadPlayerName());
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation<SubmitResponse, Error>({
    mutationFn: async () => {
      const built = buildSubmission(run, name);
      if (!built.ok) {
        throw new Error(built.reason);
      }
      savePlayerName(built.submission.name);
      const response = await leaderboardApi.submit(built.submission);
      addMyGlobalEntry({
        seed: built.submission.seed,
        score: built.submission.score,
        name: built.submission.name,
      });
      return response;
    },
  });

  function handleSubmit() {
    setValidationError(null);
    const built = buildSubmission(run, name);
    if (!built.ok) {
      setValidationError(built.reason);
      return;
    }
    mutation.mutate();
  }

  if (mutation.isSuccess) {
    const { rank, total } = mutation.data;
    return (
      <div className="rounded-2xl border border-gold-600/60 bg-gold-500/10 p-5 text-center">
        <Check className="mx-auto text-gold-400" size={28} />
        <p className="mt-2 text-lg font-black text-white">
          {rank ? `You're #${rank} of ${total} globally!` : "Submitted to the global board!"}
        </p>
        <Link
          to="/leaderboard"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gold-500 px-5 py-3 text-sm font-black text-black transition-colors hover:bg-gold-400"
        >
          <Globe size={16} />
          View global leaderboard
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5">
      <div className="flex items-center gap-2">
        <Globe className="text-gold-400" size={18} />
        <p className="section-label text-sm">Add your name to the global leaderboard</p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setValidationError(null);
          }}
          maxLength={20}
          placeholder="Your name"
          className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-gold-600/50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-black text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "Submitting…" : "Submit"}
        </button>
      </div>
      {validationError && (
        <p className="mt-3 text-xs font-semibold text-rose-400">{validationError}</p>
      )}
      {mutation.isError && (
        <p className="mt-3 text-xs font-semibold text-rose-400">
          Couldn&apos;t submit (you may be offline or the backend isn&apos;t configured). Your run is
          still saved locally.
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Only your name, team strength and top scorer are shown publicly.
      </p>
    </div>
  );
}

function ResultPanel({
  run,
  onCopy,
  copied,
  onPlayAgain,
  onLeaderboard,
}: {
  run: TournamentRun;
  onCopy: () => void;
  copied: boolean;
  onPlayAgain: () => void;
  onLeaderboard: () => void;
}) {
  const goalsFor = run.matches.reduce((sum, match) => sum + match.userGoals, 0);
  const goalsAgainst = run.matches.reduce((sum, match) => sum + match.opponentGoals, 0);
  const goalDiff = goalsFor - goalsAgainst;
  const cleanSheets = run.matches.filter((match) => match.opponentGoals === 0).length;
  const shootoutsWon = run.matches.filter((match) => match.decidedByPens && match.result === "W").length;
  const topScorer = Object.entries(run.goalScorers).sort((a, b) => b[1] - a[1])[0] ?? null;
  const biggestWin = run.matches
    .filter((match) => match.result === "W")
    .reduce<(typeof run.matches)[number] | null>(
      (best, match) =>
        best && best.userGoals - best.opponentGoals >= match.userGoals - match.opponentGoals ? best : match,
      null
    );

  const summaryStats = [
    { label: "GF", value: goalsFor },
    { label: "GA", value: goalsAgainst },
    { label: "GD", value: `${goalDiff > 0 ? "+" : ""}${goalDiff}` },
    { label: "Clean sheets", value: cleanSheets },
    { label: "Pens won", value: shootoutsWon },
    { label: "Played", value: run.matches.length },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-6 text-center">
        <p className="section-label text-base">Team rating {Math.round(run.ratings.overall)}</p>
        <h2 className="mt-4 font-serif text-5xl font-black tracking-normal text-gold-400">{run.stageReached}</h2>
        <p className="mt-3 text-2xl font-bold text-gray-300">+{run.score} points</p>
        <p className="mt-2 text-sm font-bold text-gray-400">
          {run.record} · {run.grade} · {run.label}
          {run.legendMode !== "none" && ` · Last Dance: ${titleCase(run.legendMode)}`}
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5">
        <p className="section-label">Tournament summary</p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-surface-700 bg-surface-800 px-2 py-3 text-center">
              <p className="text-xl font-black tabular-nums text-white">{stat.value}</p>
              <p className="section-label mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
        {(topScorer || biggestWin) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {topScorer && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2">
                <span className="text-xs font-bold text-gray-400">Top scorer</span>
                <span className="min-w-0 truncate text-sm font-black text-white">
                  {topScorer[0]} · {topScorer[1]}
                </span>
              </div>
            )}
            {biggestWin && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2">
                <span className="text-xs font-bold text-gray-400">Biggest win</span>
                <span className="min-w-0 truncate text-sm font-black text-white">
                  {biggestWin.userGoals}-{biggestWin.opponentGoals} vs {biggestWin.opponent.name}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-xl bg-gold-500 px-4 py-4 text-base font-black text-black transition-colors hover:bg-gold-400"
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onLeaderboard}
          className="rounded-xl border border-surface-700 bg-surface-950 px-4 py-4 text-base font-black text-white transition-colors hover:border-gold-600/40"
        >
          Leaderboard →
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-surface-700 bg-surface-950 px-4 py-4 text-base font-black text-white transition-colors hover:border-gold-600/40"
        >
          {copied ? <Copy size={18} /> : <Share2 size={18} />}
          {copied ? "Copied" : "Share"}
        </button>
      </div>

      <GlobalSubmit run={run} />

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-white">World Cup path</h3>
        {run.matches.map((match) => (
          <div
            key={`${match.stage}-${match.opponent.teamId}`}
            className="flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2"
          >
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-black ${
                match.result === "W"
                  ? "bg-green-500/15 text-green-400"
                  : match.result === "D"
                    ? "bg-gray-500/15 text-gray-300"
                    : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {match.result}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {match.stage} vs {match.opponent.name}
              </p>
              <p className="text-xs text-gray-500">
                {match.userGoals}-{match.opponentGoals}
                {match.decidedByPens ? " after penalties" : ""}
              </p>
            </div>
            <Flag fifaCode={match.opponent.fifaCode} size={24} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderboardPanel({
  history,
  formationId,
  onClose,
}: {
  history: TournamentRun[];
  formationId: string;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const filters = [
    { id: "all", label: "All" },
    { id: "easy", label: "Easy" },
    { id: "normal", label: "Normal" },
    { id: "hard", label: "Hard" },
    { id: "blind", label: "Blind" },
    { id: "legend", label: "Last Dance" },
    { id: "formation", label: getFormation(formationId).label },
  ];
  const filtered = history.filter((run) => {
    if (filter === "all") return true;
    if (filter === "blind") return run.blindMode;
    if (filter === "legend") return run.legendMode !== "none";
    if (filter === "formation") return run.formationId === formationId;
    return run.difficulty === filter;
  });

  return (
    <section className="stat-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">Local leaderboard</p>
          <h2 className="mt-1 text-2xl font-black text-white">Best runs on this device</h2>
        </div>
        <div className="flex gap-2">
          <Link
            to="/leaderboard"
            className="inline-flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm font-bold text-gold-400 hover:border-gold-600/40"
          >
            <Globe size={14} />
            Global
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm font-bold text-gray-300 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
              filter === item.id
                ? "border-gold-600 bg-gold-500 text-black"
                : "border-surface-700 bg-surface-950 text-gray-500 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {filtered.map((run, index) => (
          <div
            key={run.id}
            className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg border border-surface-700 bg-surface-800 px-3 py-3 text-sm"
          >
            <span className="font-black text-gray-500">#{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate font-bold text-white">
                {run.score} pts · {run.stageReached} · {run.record}
              </p>
              <p className="truncate text-xs text-gray-500">
                {run.formationLabel} · {titleCase(run.difficulty)} · {run.blindMode ? "Blind" : "Open ratings"} ·{" "}
                {run.draftMode === "squad-first" ? "Squad first" : "Position first"}
                {run.legendMode !== "none" && ` · Last Dance: ${titleCase(run.legendMode)}`}
              </p>
            </div>
            <span className="font-black text-gold-400">{Math.round(run.ratings.overall)} OVR</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-6 text-center text-sm text-gray-500">
            No saved runs for this filter yet.
          </div>
        )}
      </div>
    </section>
  );
}

export default function EightZeroGame() {
  const [formationId, setFormationId] = useState(DEFAULT_FORMATION);
  const [options, setOptions] = useState<DraftOptions>(DEFAULT_OPTIONS);
  const [draftState, setDraftState] = useState(() => createDraftState(makeSeed(), DEFAULT_FORMATION, DEFAULT_OPTIONS));
  const [started, setStarted] = useState(false);
  const [run, setRun] = useState<TournamentRun | null>(null);
  const [history, setHistory] = useState<TournamentRun[]>([]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  // The nation reel is a cosmetic vertical slot-machine strip. `reelStrip` is the
  // list of nations scrolling past, `reelOffset` the translateY (px), and
  // `reelAnimating` gates the long decelerating transition. The nation it lands
  // on is always the seed-determined draft result — never chosen here.
  const [reelStrip, setReelStrip] = useState<EightZeroTeam[]>([]);
  const [reelOffset, setReelOffset] = useState(0);
  const [reelAnimating, setReelAnimating] = useState(false);
  // True for the brief moment the reel snaps onto the chosen nation, driving
  // the scale-overshoot + gold glow landing flash.
  const [reelLanded, setReelLanded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<SlotCategory | "ALL">("ALL");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTeamSheet, setShowTeamSheet] = useState(false);
  const [tournamentPhase, setTournamentPhase] = useState<"idle" | "ready" | "live" | "penalties" | "practice_penalties" | "complete">("idle");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [allMatchEvents, setAllMatchEvents] = useState<MatchEvent[][]>([]);
  // Active full-screen confetti celebration (knockout wins + the final), or
  // null when nothing is celebrating.
  const [celebration, setCelebration] = useState<{ headline: string; intensity: "normal" | "big" } | null>(null);
  // Authoritative interactive-shootout results, keyed by knockout stage. Fed
  // back into simulateTournamentRun so the bracket follows actual play.
  const [penOverrides, setPenOverrides] = useState<Record<string, "W" | "L">>({});
  const draftControlsRef = useRef<HTMLDivElement | null>(null);
  const spinIntervalRef = useRef<number | null>(null);
  const spinTimeoutRef = useRef<number | null>(null);
  const reelRafRef = useRef<number | null>(null);
  const reelFinalOffsetRef = useRef(0);
  const reelLandIndexRef = useRef(0);
  const pendingDraftRef = useRef<DraftState | null>(null);

  // Reel tuning. A longer, decelerating travel that reads as a real spinning
  // wheel; skippable so the ceremony never drags across an 11-slot draft.
  const REEL_ROW_H = 64; // px per nation row (also the reel viewport height)
  const REEL_STRIP_LEN = 36; // nations that scroll past before landing
  const REEL_SPIN_MS = 2600; // travel duration; the decel curve does the rest
  const REEL_WINDUP_PX = 7; // anticipation nudge before launch
  const prefersReduced = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const teamsQuery = useQuery({
    queryKey: ["8-0-teams"],
    queryFn: () => api.get<RawTeam[]>("/api/teams"),
    staleTime: Infinity,
  });
  const playersQuery = useQuery({
    queryKey: ["8-0-players"],
    queryFn: () => api.get<RawPlayer[]>("/api/players"),
    staleTime: Infinity,
  });

  const gameData = useMemo(() => {
    if (!teamsQuery.data || !playersQuery.data) return null;
    return buildEightZeroData(teamsQuery.data, playersQuery.data);
  }, [teamsQuery.data, playersQuery.data]);

  // Real named penalty lineups for the current knockout: your XI vs the
  // opponent's actual squad (their real keeper + best takers). Falls back to
  // generic takers inside the component if squad data is unavailable.
  const penaltyLineups = useMemo(() => {
    if (!run) return null;
    const match = run.matches[currentMatchIndex];
    const userPlayers = run.picks.map((pick) => pick.player);
    const oppPlayers =
      match && gameData ? gameData.playersByTeam.get(match.opponent.teamId) ?? [] : [];
    return {
      userTakers: selectPenaltyTakers(userPlayers),
      userKeeper: selectKeeper(userPlayers, run.ratings.gk),
      oppTakers: selectPenaltyTakers(oppPlayers),
      oppKeeper: selectKeeper(oppPlayers, match?.opponentGkRating ?? 78),
    };
  }, [run, currentMatchIndex, gameData]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    return () => {
      if (spinIntervalRef.current) window.clearInterval(spinIntervalRef.current);
      if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current);
      if (reelRafRef.current) window.cancelAnimationFrame(reelRafRef.current);
    };
  }, []);

  // Close the "See my team" sheet on Escape and lock body scroll while it is open.
  useEffect(() => {
    if (!showTeamSheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTeamSheet(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showTeamSheet]);

  // Persist the finalized run once the tournament completes. Interactive
  // shootouts rebuild `run`, so the run saved here reflects actual play (the
  // provisional save at draft time is replaced by id).
  useEffect(() => {
    if (tournamentPhase === "complete" && run) {
      setHistory(saveRun(run));
    }
  }, [tournamentPhase, run]);

  const bestRun = history[0] ?? null;
  const openSlots = getOpenSlots(draftState);
  const activeSlot = getActiveSlot(draftState);
  const hideDraftRatings = shouldHideRatings(draftState);
  const teamSheetRatingsHidden = hideDraftRatings && !run;
  const teamOvr = draftState.picks.length
    ? Math.round(calculateTeamRatings(draftState.picks).overall)
    : null;
  const candidates = useMemo(() => {
    if (!gameData) return [];
    const normalizedSearch = search.trim().toLowerCase();
    return getAvailablePlayers(gameData, draftState).filter((player) => {
      const matchesSearch = player.name.toLowerCase().includes(normalizedSearch);
      const matchesCategory = categoryFilter === "ALL" || player.category === categoryFilter;
      const matchesDraftMode =
        draftState.draftMode === "squad-first" || player.category === activeSlot.category;
      return matchesSearch && matchesCategory && matchesDraftMode;
    });
  }, [activeSlot.category, categoryFilter, draftState, gameData, search]);
  const displayedTeam = draftState.currentSpin?.team ?? null;
  const loading = teamsQuery.isLoading || playersQuery.isLoading || !gameData;
  const error = teamsQuery.error || playersQuery.error;
  const spinDisabled = isSpinning || Boolean(draftState.currentSpin && draftState.rerollsLeft <= 0);
  const spinButtonLabel = isSpinning
    ? "Spinning"
    : draftState.currentSpin
      ? draftState.rerollsLeft > 0
        ? `Reroll (${draftState.rerollsLeft} left)`
        : "Pick a player"
      : "Spin";

  function clearSpinTimers() {
    if (spinIntervalRef.current) window.clearInterval(spinIntervalRef.current);
    if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current);
    if (reelRafRef.current) window.cancelAnimationFrame(reelRafRef.current);
    spinIntervalRef.current = null;
    spinTimeoutRef.current = null;
    reelRafRef.current = null;
  }

  function startDraft(nextFormationId = formationId, nextOptions = options) {
    clearSpinTimers();
    const resolvedOptions = {
      ...nextOptions,
      blindMode: nextOptions.blindMode || nextOptions.difficulty === "hard",
    };
    setFormationId(nextFormationId);
    setOptions(resolvedOptions);
    setDraftState(createDraftState(makeSeed(), nextFormationId, resolvedOptions, gameData ?? undefined));
    setRun(null);
    setPenOverrides({});
    setStarted(true);
    setSearch("");
    setCopied(false);
    setIsSpinning(false);
    resetReel();
    setCategoryFilter("ALL");
    setShowLeaderboard(false);
    setShowTeamSheet(false);
    setTournamentPhase("idle");
    setCurrentMatchIndex(0);
    setAllMatchEvents([]);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function resetToSetup() {
    clearSpinTimers();
    setRun(null);
    setShowTeamSheet(false);
    setPenOverrides({});
    setStarted(false);
    setSearch("");
    setCopied(false);
    setIsSpinning(false);
    resetReel();
    setCategoryFilter("ALL");
    setShowLeaderboard(false);
    setTournamentPhase("idle");
    setCurrentMatchIndex(0);
    setAllMatchEvents([]);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function finishDraftIfComplete(next: DraftState) {
    if (!gameData || !next.complete) return;
    const ratings = calculateTeamRatings(next.picks);
    // Fresh run starts with no shootout overrides.
    setPenOverrides({});
    const nextRun = simulateTournamentRun({
      teams: gameData.teams,
      picks: next.picks,
      ratings,
      seed: next.seed,
      formationId: next.formationId,
      difficulty: next.difficulty,
      blindMode: next.blindMode,
      draftMode: next.draftMode,
      legendMode: next.legendMode,
      penOverrides: {},
    });
    setRun(nextRun);
    setHistory(saveRun(nextRun));

    const events = nextRun.matches.map((match, index) =>
      buildMatchEvents(match, next.picks, `${next.seed}:events:${index}`).events
    );
    setAllMatchEvents(events);
    setCurrentMatchIndex(0);
    setTournamentPhase("ready");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  // Record the authoritative result of an interactive penalty shootout, re-run
  // the tournament with that override so the bracket/score stay consistent, then
  // advance to the next match (or finish if the run ended).
  function applyPenaltyResult(userWon: boolean) {
    if (!gameData || !run) {
      handleMatchFinished();
      return;
    }
    const match = run.matches[currentMatchIndex];
    if (!match) {
      handleMatchFinished();
      return;
    }
    const nextOverrides: Record<string, "W" | "L"> = {
      ...penOverrides,
      [match.stage]: userWon ? "W" : "L",
    };
    setPenOverrides(nextOverrides);

    const rebuilt = simulateTournamentRun({
      teams: gameData.teams,
      picks: run.picks,
      ratings: run.ratings,
      seed: run.seed,
      formationId: run.formationId,
      difficulty: run.difficulty,
      blindMode: run.blindMode,
      draftMode: run.draftMode,
      legendMode: run.legendMode,
      penOverrides: nextOverrides,
    });
    // Preserve identity so local history / leaderboard dedupe stays stable.
    rebuilt.id = run.id;
    rebuilt.createdAt = run.createdAt;
    setRun(rebuilt);

    // A shootout win is still a knockout/final win — celebrate at the run level
    // (never from inside PenaltyShootout).
    if (userWon) {
      celebrateWin(match.stage, rebuilt.stageReached === "Champion");
    }

    const events = rebuilt.matches.map((rebuiltMatch, index) =>
      buildMatchEvents(rebuiltMatch, rebuilt.picks, `${rebuilt.seed}:events:${index}`).events
    );
    setAllMatchEvents(events);

    const nextIndex = currentMatchIndex + 1;
    if (nextIndex >= rebuilt.matches.length) {
      setTournamentPhase("complete");
    } else {
      setCurrentMatchIndex(nextIndex);
      setTournamentPhase("ready");
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  // Clear the cosmetic reel back to rest. Timers are cleared separately.
  function resetReel() {
    setReelStrip([]);
    setReelOffset(0);
    setReelAnimating(false);
    setReelLanded(false);
    pendingDraftRef.current = null;
  }

  // Commit the drafted state once the reel has landed, and return to rest.
  function finishReel() {
    clearSpinTimers();
    setReelLanded(false);
    setReelAnimating(false);
    setReelOffset(0);
    setReelStrip([]);
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending) setDraftState(pending);
    setIsSpinning(false);
  }

  // Tap-to-skip: snap straight to the landing frame so a long ceremony is never
  // mandatory across an 11-slot draft.
  function skipReel() {
    if (!isSpinning || reelLanded) return;
    if (reelRafRef.current) window.cancelAnimationFrame(reelRafRef.current);
    reelRafRef.current = null;
    if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current);
    setReelAnimating(false); // transition off → instant snap
    setReelOffset(reelFinalOffsetRef.current);
    setReelLanded(true);
    spinTimeoutRef.current = window.setTimeout(finishReel, 340);
  }

  function animateSpin(nextState: DraftState) {
    if (!gameData) return;
    clearSpinTimers();
    setIsSpinning(true);
    setReelLanded(false);
    setSearch("");
    setCategoryFilter("ALL");

    const teams = gameData.teams;
    // The draft has already chosen the landing nation — the reel only performs
    // the reveal. Math.random below is pure UI flavour (the sim path is
    // untouched and stays seed-deterministic).
    const chosen = nextState.currentSpin?.team ?? teams[0] ?? null;
    pendingDraftRef.current = nextState;
    if (!chosen) {
      finishReel();
      return;
    }

    // Reduced motion (or a tiny pool): skip the travel, snap onto the nation.
    if (prefersReduced() || teams.length < 4) {
      reelLandIndexRef.current = 0;
      reelFinalOffsetRef.current = 0;
      setReelStrip([chosen]);
      setReelAnimating(false);
      setReelOffset(0);
      setReelLanded(true);
      spinTimeoutRef.current = window.setTimeout(finishReel, 550);
      return;
    }

    // Build a strip of nations that scrolls past and lands on `chosen`, with two
    // filler rows below it so the decel never reveals a gap.
    const randomTeam = () => teams[Math.floor(Math.random() * teams.length)] ?? chosen;
    const strip: EightZeroTeam[] = Array.from({ length: REEL_STRIP_LEN }, randomTeam);
    const landIndex = REEL_STRIP_LEN - 3;
    strip[landIndex] = chosen;
    const finalOffset = -(landIndex * REEL_ROW_H);
    reelLandIndexRef.current = landIndex;
    reelFinalOffsetRef.current = finalOffset;

    // Anticipation: a small downward wind-up, then a long decelerating launch.
    setReelStrip(strip);
    setReelAnimating(false);
    setReelOffset(REEL_WINDUP_PX);

    // Two frames so the browser paints the wind-up start before transitioning.
    reelRafRef.current = window.requestAnimationFrame(() => {
      reelRafRef.current = window.requestAnimationFrame(() => {
        setReelAnimating(true);
        setReelOffset(finalOffset);
        spinTimeoutRef.current = window.setTimeout(() => {
          setReelLanded(true); // scale-overshoot + gold glow on the landed row
          spinTimeoutRef.current = window.setTimeout(finishReel, 560);
        }, REEL_SPIN_MS);
      });
    });
  }

  function handleSpin() {
    if (!gameData || isSpinning) return;
    const next = draftState.currentSpin ? rerollTeam(gameData, draftState) : spinTeam(gameData, draftState);
    if (next === draftState) return;
    animateSpin(next);
  }

  function commitPick(playerId: number, slotId?: string) {
    if (!gameData) return;
    const next = selectPlayer(gameData, draftState, playerId, slotId);
    setDraftState(next);
    setSearch("");
    setCategoryFilter("ALL");
    if (!next.complete) {
      window.requestAnimationFrame(() => {
        draftControlsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    finishDraftIfComplete(next);
  }

  function handlePick(playerId: number) {
    if (!gameData || isSpinning) return;
    const player = getAvailablePlayers(gameData, draftState).find((candidate) => candidate.id === playerId);
    if (!player || !canPickPlayer(player, draftState)) return;
    if (draftState.draftMode === "position-first") {
      if (player.category !== activeSlot.category) return;
      commitPick(playerId);
      return;
    }
    commitPick(playerId);
  }

  function handleCopy() {
    if (!run) return;
    void navigator.clipboard.writeText(shareText(run)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  function startNextMatch() {
    setTournamentPhase("live");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  // Fire the full-screen confetti for a knockout/final win. Group-stage wins
  // are intentionally ignored. `champion` makes the final win bigger.
  function celebrateWin(stage: string, champion: boolean) {
    if (champion) {
      setCelebration({ headline: "🏆 WORLD CHAMPIONS", intensity: "big" });
      return;
    }
    if (!KNOCKOUT_STAGES.has(stage)) return;
    setCelebration({ headline: `${stage.toUpperCase()} WON`, intensity: "normal" });
  }

  function handleMatchFinished() {
    if (!run) return;
    const finished = run.matches[currentMatchIndex];
    if (finished && finished.result === "W") {
      celebrateWin(finished.stage, run.stageReached === "Champion");
    }
    const nextIndex = currentMatchIndex + 1;
    if (nextIndex >= run.matches.length) {
      setTournamentPhase("complete");
    } else {
      setCurrentMatchIndex(nextIndex);
      setTournamentPhase("ready");
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function skipAllGroupStage() {
    if (!run) return;
    if (run.matches.length <= 3) {
      setTournamentPhase("complete");
    } else {
      setCurrentMatchIndex(3);
      setTournamentPhase("ready");
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function handleAutofill() {
    if (!gameData || isSpinning || draftState.picks.length > 0) return;
    const next = autofillDraft(gameData, draftState);
    setDraftState(next);
    if (next.complete) {
      finishDraftIfComplete(next);
    }
  }

  if (error) {
    return (
      <div className="stat-card animate-fade-up">
        <p className="section-label">8-0</p>
        <h1 className="mt-2 text-2xl font-black text-white">Game data failed to load</h1>
        <p className="mt-2 text-sm text-gray-400">Refresh the page to retry the static data fallback.</p>
      </div>
    );
  }

  if (!started) {
    return (
      <SetupScreen
        formationId={formationId}
        options={options}
        bestRun={bestRun}
        loading={loading}
        teamsCount={gameData?.teams.length ?? 0}
        playersCount={gameData?.players.length ?? 0}
        onFormationChange={setFormationId}
        onOptionsChange={setOptions}
        onStart={() => startDraft()}
        onLegendSelect={(legendMode) => {
          const nextOptions: DraftOptions = { ...options, legendMode };
          setOptions(nextOptions);
        }}
        onStartPracticePenalties={() => {
          setStarted(true);
          setTournamentPhase("practice_penalties");
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-up pb-24">
      <section className="overflow-hidden rounded-xl border border-surface-700 bg-surface-900">
        <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <button
                  type="button"
                  onClick={resetToSetup}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white"
                >
                  <ArrowLeft size={16} />
                  Options
                </button>
                <h1 className="mt-4 font-serif text-3xl sm:text-5xl font-black tracking-normal text-white">8-0</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                  {getFormation(draftState.formationId).label} · {titleCase(draftState.difficulty)} ·{" "}
                  {draftState.draftMode === "squad-first" ? "Squad first" : "Position first"}
                  {draftState.blindMode ? " · Blind ratings" : ""}
                  {draftState.legendMode !== "none" && (
                    <span className="ml-1 text-gold-400">· Last Dance: {titleCase(draftState.legendMode)}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startDraft(draftState.formationId, options)}
                className="inline-flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-gold-600/40"
              >
                <RefreshCw size={16} />
                New run
              </button>
            </div>
          </div>

          <div className="border-t border-surface-700 bg-surface-950/60 p-5 lg:border-l lg:border-t-0">
            <div className="text-right">
              <p className="text-3xl sm:text-5xl font-black text-gold-400 tabular-nums">{bestRun?.score ?? 0}</p>
              <p className="section-label">Best</p>
            </div>
          </div>
        </div>
      </section>

      {celebration && (
        <Celebration
          headline={celebration.headline}
          intensity={celebration.intensity}
          onDismiss={() => setCelebration(null)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardPanel
          history={sortRuns(history)}
          formationId={draftState.formationId}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="stat-card">
          {tournamentPhase === "practice_penalties" && (
            <PenaltyShootout
              opponent={{ teamId: 0, name: "Practice Team", fifaCode: "GER", group: null, ranking: null, elo: 1600 }}
              userGkRating={85}
              oppGkRating={80}
              userShooterRating={85}
              practiceMode={true}
              onFinished={() => {
                setStarted(false);
                setTournamentPhase("idle");
              }}
              onStopPractice={() => {
                setStarted(false);
                setTournamentPhase("idle");
              }}
            />
          )}

          {run && tournamentPhase === "ready" && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="section-label">Tournament</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white">
                  {run.matches[currentMatchIndex]?.stage}
                </h2>
              </div>

              <div className="flex items-center justify-center gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/20 text-2xl font-black text-gold-400">
                    XI
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">
                    {run.legendMode !== "none"
                      ? `${titleCase(run.legendMode)} XI`
                      : "You"}
                  </p>
                </div>
                <span className="text-2xl font-bold text-gray-600">vs</span>
                <div className="flex flex-col items-center">
                  <Flag fifaCode={run.matches[currentMatchIndex]?.opponent.fifaCode ?? "FIFA"} size={56} />
                  <p className="mt-2 text-sm font-bold text-white">
                    {run.matches[currentMatchIndex]?.opponent.name}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={startNextMatch}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-500 px-6 py-4 text-lg font-black text-black transition-colors hover:bg-gold-400"
                >
                  <Play size={20} />
                  Play Match
                </button>
                {currentMatchIndex < 3 && (
                  <button
                    type="button"
                    onClick={skipAllGroupStage}
                    className="inline-flex items-center justify-center rounded-xl border border-surface-700 bg-surface-950 px-5 py-4 text-sm font-black text-gray-400 transition-colors hover:border-gold-600/40 hover:text-white"
                  >
                    Skip Group
                  </button>
                )}
              </div>
            </div>
          )}

          {run && tournamentPhase === "live" && (
            <LiveMatch
              stage={run.matches[currentMatchIndex]?.stage ?? ""}
              opponent={run.matches[currentMatchIndex]?.opponent ?? run.matches[0].opponent}
              result={run.matches[currentMatchIndex]}
              events={allMatchEvents[currentMatchIndex] ?? []}
              legendMode={run.legendMode}
              onFinished={() => {
                const match = run.matches[currentMatchIndex];
                if (match.decidedByPens) {
                  setTournamentPhase("penalties");
                } else {
                  handleMatchFinished();
                }
              }}
            />
          )}

          {run && tournamentPhase === "penalties" && (
            <PenaltyShootout
              opponent={run.matches[currentMatchIndex]?.opponent ?? run.matches[0].opponent}
              userGkRating={run.ratings.gk}
              oppGkRating={run.matches[currentMatchIndex]?.opponentGkRating ?? 75}
              userShooterRating={run.ratings.attack}
              userTakers={penaltyLineups?.userTakers}
              userKeeper={penaltyLineups?.userKeeper}
              oppTakers={penaltyLineups?.oppTakers}
              oppKeeper={penaltyLineups?.oppKeeper}
              onFinished={(userWon) => applyPenaltyResult(userWon)}
            />
          )}

          {run && tournamentPhase === "complete" && (
            <ResultPanel
              run={run}
              onCopy={handleCopy}
              copied={copied}
              onPlayAgain={() => startDraft(run.formationId, options)}
              onLeaderboard={() => setShowLeaderboard(true)}
            />
          )}

          {!run && tournamentPhase !== "practice_penalties" && (
            <div className="space-y-5">
              <div
                ref={draftControlsRef}
                className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-700 bg-surface-900/95 p-3 shadow-2xl shadow-black/20 backdrop-blur"
              >
                <div>
                  <p className="section-label">Round {draftState.picks.length + 1}/11</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    {draftState.draftMode === "position-first" ? `${activeSlot.category} needed` : "Spin a nation"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {openSlots.length} open · {draftState.rerollsLeft} rerolls left
                  </p>
                </div>
                <div className="flex gap-2">
                  {draftState.picks.length === 0 && (
                    <button
                      type="button"
                      onClick={handleAutofill}
                      disabled={isSpinning || !gameData}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-gold-600/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Auto-fill
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSpin}
                    disabled={spinDisabled}
                    className="inline-flex items-center gap-2 rounded-lg bg-gold-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Shuffle className={isSpinning ? "animate-spin" : ""} size={16} />
                    {spinButtonLabel}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-surface-700 bg-surface-800 p-4">
                  <div className="flex items-center justify-between">
                    <p className="section-label">{isSpinning ? "Nation reel" : "Nation"}</p>
                    {isSpinning && !reelLanded && (
                      <button
                        type="button"
                        onClick={skipReel}
                        className="text-[11px] font-bold uppercase tracking-wide text-gray-500 transition-colors hover:text-gold-400"
                      >
                        Tap to skip
                      </button>
                    )}
                  </div>
                  {isSpinning ? (
                    <div
                      className={`reel-viewport mt-3 ${reelLanded ? "animate-reel-land" : ""}`}
                      style={{ height: REEL_ROW_H }}
                      onClick={skipReel}
                      role="button"
                      tabIndex={-1}
                      aria-label="Skip nation reel"
                    >
                      <div
                        className="reel-strip"
                        style={{
                          transform: `translateY(${reelOffset}px)`,
                          transition: reelAnimating
                            ? `transform ${REEL_SPIN_MS}ms cubic-bezier(0.14, 0.72, 0.11, 1), filter ${REEL_SPIN_MS}ms ease-out`
                            : "none",
                          filter: reelAnimating || reelLanded ? "blur(0px)" : "blur(5px)",
                        }}
                      >
                        {reelStrip.map((team, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3"
                            style={{ height: REEL_ROW_H }}
                          >
                            <Flag fifaCode={team.fifaCode} size={42} />
                            <div className="min-w-0">
                              <p className="truncate text-xl font-black text-white">{team.name}</p>
                              <p className="text-xs font-semibold text-gray-500">
                                {reelLanded && index === reelLandIndexRef.current
                                  ? `Group ${team.group ?? "-"} · spin #${draftState.currentSpin?.spinIndex ?? 0}`
                                  : "Spinning…"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="mt-3 flex items-center gap-3 rounded-lg"
                      style={{ minHeight: REEL_ROW_H }}
                    >
                      {displayedTeam ? (
                        <>
                          <Flag fifaCode={displayedTeam.fifaCode} size={42} />
                          <div className="min-w-0">
                            <p className="truncate text-xl font-black text-white">{displayedTeam.name}</p>
                            <p className="text-xs font-semibold text-gray-500">
                              {`Group ${displayedTeam.group ?? "-"} · spin #${draftState.currentSpin?.spinIndex ?? 0}`}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-gray-500">Spin to reveal a player pool</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-surface-700 bg-surface-800 p-4">
                  <p className="section-label">Open slots</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {(["GK", "DEF", "MID", "FWD"] as SlotCategory[]).map((category) => (
                      <div key={category} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-2">
                        <p className="text-sm font-black text-white">
                          {openSlots.filter((slot) => slot.category === category).length}
                        </p>
                        <p className="text-[10px] font-bold text-gray-500">{category}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {draftState.currentSpin && !isSpinning && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-white">
                      {candidates.length} undrafted players from {draftState.currentSpin.team.name}
                    </h3>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      {draftState.draftMode === "squad-first" && (
                        <div className="flex gap-1 rounded-lg border border-surface-700 bg-surface-950 p-1">
                          {(["ALL", "GK", "DEF", "MID", "FWD"] as const).map((category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setCategoryFilter(category)}
                              className={`rounded-md px-2 py-1 text-xs font-bold transition-colors ${
                                categoryFilter === category
                                  ? "bg-gold-600 text-white"
                                  : "text-gray-500 hover:text-white"
                              }`}
                            >
                              {category}
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search players"
                        className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-gold-600/50 sm:w-56"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {candidates.map((player) => {
                      const compatibleSlots =
                        draftState.draftMode === "position-first"
                          ? player.category === activeSlot.category
                            ? [activeSlot]
                            : []
                          : getCompatibleOpenSlots(player, draftState);
                      return (
                        <PlayerRow
                          key={player.id}
                          player={player}
                          compatibleSlots={compatibleSlots}
                          disabled={compatibleSlots.length === 0 || isSpinning}
                          hideRating={hideDraftRatings}
                          onPick={handlePick}
                        />
                      );
                    })}
                    {candidates.length === 0 && (
                      <div className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-6 text-center text-sm text-gray-500">
                        No undrafted players match this filter.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <PitchXI
                formationId={draftState.formationId}
                picks={draftState.picks}
                activeSlotId={draftState.draftMode === "position-first" ? draftState.activeSlotId : undefined}
                hideRatings={hideDraftRatings}
                legendSlotId={draftState.legendMode !== "none" ? draftState.picks[0]?.slotId : undefined}
              />
            </div>
          )}
        </section>

        <div className="space-y-6">
          <SquadPanel
            picks={draftState.picks}
            state={draftState}
            hideRatings={hideDraftRatings && !run}
            showPitch={Boolean(run)}
            matchGoalScorers={run?.matchGoalScorers ?? []}
            currentMatchIndex={currentMatchIndex}
            tournamentPhase={tournamentPhase}
          />
          {run && (tournamentPhase === "ready" || tournamentPhase === "live" || tournamentPhase === "complete") && (
            <TournamentBracket
              run={run}
              currentMatchIndex={currentMatchIndex}
              tournamentPhase={tournamentPhase}
            />
          )}
          <section className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-label">Personal best</p>
                <h2 className="mt-1 text-lg font-extrabold text-white">
                  {bestRun ? `${bestRun.score} pts` : "No runs yet"}
                </h2>
              </div>
              {bestRun?.wins === 8 ? (
                <Trophy className="text-gold-500" size={22} />
              ) : (
                <Medal className="text-gray-600" size={22} />
              )}
            </div>
            <div className="mt-4 space-y-2">
              {history.slice(0, 5).map((item, index) => (
                <div key={item.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 text-sm">
                  <span className="text-gray-500">#{index + 1}</span>
                  <span className="min-w-0 truncate font-bold text-white">
                    {item.score} · {item.stageReached}
                  </span>
                  <span className="font-semibold text-gold-400">{Math.round(item.ratings.overall)} OVR</span>
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-sm text-gray-500">Finished runs are saved locally on this device.</p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowLeaderboard(true)}
                className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm font-bold text-white hover:border-gold-600/40"
              >
                Local
              </button>
              <Link
                to="/leaderboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm font-bold text-gold-400 hover:border-gold-600/40"
              >
                <Globe size={14} />
                Global
              </Link>
            </div>
          </section>
        </div>
      </div>

      {tournamentPhase !== "practice_penalties" && draftState.picks.length > 0 && !showTeamSheet && (
        <button
          type="button"
          onClick={() => setShowTeamSheet(true)}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-gold-500 px-4 py-3 text-sm font-black text-black shadow-2xl shadow-black/50 transition-transform hover:bg-gold-400 active:scale-95"
        >
          <Shield size={16} />
          <span>My team {draftState.picks.length}/11</span>
          {!teamSheetRatingsHidden && teamOvr !== null && (
            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-xs tabular-nums">{teamOvr}</span>
          )}
        </button>
      )}

      {showTeamSheet && (
        <TeamSheet
          state={draftState}
          picks={draftState.picks}
          hideRatings={teamSheetRatingsHidden}
          matchGoalScorers={run?.matchGoalScorers ?? []}
          currentMatchIndex={currentMatchIndex}
          tournamentPhase={tournamentPhase}
          onClose={() => setShowTeamSheet(false)}
        />
      )}
    </div>
  );
}
