import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Medal,
  Play,
  RefreshCw,
  Share2,
  Shield,
  Shuffle,
  Trophy,
} from "lucide-react";
import { api } from "../api/client";
import Flag from "../components/Flag";
import LiveMatch from "../components/LiveMatch";
import TournamentBracket from "../components/TournamentBracket";
import { buildEightZeroData, type RawPlayer, type RawTeam } from "../game8/data";
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
import { shareText, loadHistory, saveRun, sortRuns } from "../game8/storage";
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
const DEFAULT_OPTIONS: DraftOptions = {
  difficulty: "normal",
  blindMode: false,
  draftMode: "squad-first",
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
}: {
  active: boolean;
  className?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-center font-bold transition-colors ${
        active
          ? "border-gold-600 bg-gold-500 text-black"
          : "border-surface-700 bg-surface-950 text-gray-400 hover:border-gold-600/40 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
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
}: {
  code: string;
  empty?: boolean;
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
}: {
  formationId: string;
  picks: DraftPick[];
  activeSlotId?: string;
  hideRatings: boolean;
  revealRatings?: boolean;
  goalScorers?: Record<string, number>;
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
                return (
                  <div key={slot.id} className="flex min-w-0 flex-1 max-w-[116px] flex-col items-center">
                    <div
                      className={`relative rounded-xl px-2 py-1 ${
                        active ? "bg-gold-500/20 ring-2 ring-gold-400/80" : ""
                      }`}
                    >
                      <ShirtIcon code={pick?.player.teamCode ?? slot.category} empty={!pick} />
                      {goals > 0 && (
                        <span className="absolute -top-1 -right-1 text-xs">
                          {"⚽".repeat(goals)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 w-full overflow-hidden rounded-md bg-white px-2 py-1 text-center text-xs font-black text-surface-950 shadow-sm">
                      <p className="truncate">{pick?.player.name ?? slot.label}</p>
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
}: {
  player: EightZeroPlayer;
  compatibleSlots: FormationSlot[];
  disabled: boolean;
  hideRating: boolean;
  onPick: (playerId: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(player.id)}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-surface-700 bg-surface-800 px-3 py-3 text-left transition-colors hover:border-gold-600/40 hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-surface-700 disabled:hover:bg-surface-800"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-900 text-sm font-extrabold text-gold-400 tabular-nums">
        {formatRating(player.rating, hideRating)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{player.name}</p>
        <p className="truncate text-xs text-gray-500">
          {player.position} · {player.clubName ?? "Free agent"}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-gray-400">
        <Flag fifaCode={player.teamCode} size={20} />
        <span>{player.teamCode}</span>
      </div>
      <span className="flex-shrink-0 text-xs font-bold text-gray-500">
        {compatibleSlots.length > 0 ? player.category : "Full"}
      </span>
    </button>
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
}) {
  function updateOptions(next: Partial<DraftOptions>) {
    const merged = { ...options, ...next };
    if (merged.difficulty === "hard") merged.blindMode = true;
    onOptionsChange(merged);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400">
            <ArrowLeft size={16} />
            Home
          </button>
          <h1 className="mt-7 font-serif text-6xl font-black tracking-normal text-white">8-0</h1>
          <p className="mt-2 text-lg leading-7 text-gray-400">
            Draft the greatest World Cup XI. Go unbeaten - can you lift the trophy?
          </p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black text-gold-400 tabular-nums">{bestRun?.score ?? 0}</p>
          <p className="section-label">Best</p>
        </div>
      </div>

      <section className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-5 shadow-2xl shadow-black/20">
        <p className="section-label text-base tracking-[0.18em]">Formation</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {FORMATIONS.map((formation) => (
            <OptionButton
              key={formation.id}
              active={formationId === formation.id}
              onClick={() => onFormationChange(formation.id)}
              className="min-w-[110px] text-xl"
            >
              {formation.label}
            </OptionButton>
          ))}
        </div>
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
              <span className="block text-xl">{difficulty.label}</span>
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
            className="mt-4 w-full text-lg"
          >
            Blind mode {options.blindMode ? "ON" : "OFF"}
          </OptionButton>
          <p className="mt-4 text-sm text-gray-500">Hide overalls during the draft. Final reveal still shows the squad.</p>
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

      <button
        type="button"
        onClick={onStart}
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-xl bg-gold-500 px-6 py-5 text-xl font-black text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Start draft →
      </button>
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
  tournamentPhase?: "idle" | "ready" | "live" | "complete";
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
        />
      )}
    </aside>
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
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-900/70 bg-[#11111f] p-6 text-center">
        <p className="section-label text-base">Team rating {Math.round(run.ratings.overall)}</p>
        <h2 className="mt-4 font-serif text-5xl font-black tracking-normal text-gold-400">{run.stageReached}</h2>
        <p className="mt-3 text-2xl font-bold text-gray-300">+{run.score} points</p>
        <p className="mt-2 text-sm font-bold text-gray-500">
          {run.record} · {run.grade} · {run.label}
        </p>
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
    { id: "formation", label: getFormation(formationId).label },
  ];
  const filtered = history.filter((run) => {
    if (filter === "all") return true;
    if (filter === "blind") return run.blindMode;
    if (filter === "formation") return run.formationId === formationId;
    return run.difficulty === filter;
  });

  return (
    <section className="stat-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">Leaderboard</p>
          <h2 className="mt-1 text-2xl font-black text-white">Best runs</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm font-bold text-gray-300 hover:text-white"
        >
          Close
        </button>
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
  const [reelTeam, setReelTeam] = useState<EightZeroTeam | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<SlotCategory | "ALL">("ALL");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [tournamentPhase, setTournamentPhase] = useState<"idle" | "ready" | "live" | "complete">("idle");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [allMatchEvents, setAllMatchEvents] = useState<MatchEvent[][]>([]);
  const draftControlsRef = useRef<HTMLDivElement | null>(null);
  const spinIntervalRef = useRef<number | null>(null);
  const spinTimeoutRef = useRef<number | null>(null);

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

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    return () => {
      if (spinIntervalRef.current) window.clearInterval(spinIntervalRef.current);
      if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const bestRun = history[0] ?? null;
  const openSlots = getOpenSlots(draftState);
  const activeSlot = getActiveSlot(draftState);
  const hideDraftRatings = shouldHideRatings(draftState);
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
  const displayedTeam = isSpinning ? reelTeam : draftState.currentSpin?.team ?? null;
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
    spinIntervalRef.current = null;
    spinTimeoutRef.current = null;
  }

  function startDraft(nextFormationId = formationId, nextOptions = options) {
    clearSpinTimers();
    const resolvedOptions = {
      ...nextOptions,
      blindMode: nextOptions.blindMode || nextOptions.difficulty === "hard",
    };
    setFormationId(nextFormationId);
    setOptions(resolvedOptions);
    setDraftState(createDraftState(makeSeed(), nextFormationId, resolvedOptions));
    setRun(null);
    setStarted(true);
    setSearch("");
    setCopied(false);
    setIsSpinning(false);
    setReelTeam(null);
    setCategoryFilter("ALL");
    setShowLeaderboard(false);
    setTournamentPhase("idle");
    setCurrentMatchIndex(0);
    setAllMatchEvents([]);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function resetToSetup() {
    clearSpinTimers();
    setRun(null);
    setStarted(false);
    setSearch("");
    setCopied(false);
    setIsSpinning(false);
    setReelTeam(null);
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
    const nextRun = simulateTournamentRun({
      teams: gameData.teams,
      picks: next.picks,
      ratings,
      seed: next.seed,
      formationId: next.formationId,
      difficulty: next.difficulty,
      blindMode: next.blindMode,
      draftMode: next.draftMode,
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

  function animateSpin(nextState: DraftState) {
    if (!gameData) return;
    clearSpinTimers();
    setIsSpinning(true);
    setSearch("");
    setCategoryFilter("ALL");
    setReelTeam(gameData.teams[0] ?? null);
    spinIntervalRef.current = window.setInterval(() => {
      setReelTeam(gameData.teams[Math.floor(Math.random() * gameData.teams.length)] ?? null);
    }, 80);
    spinTimeoutRef.current = window.setTimeout(() => {
      clearSpinTimers();
      setReelTeam(null);
      setDraftState(nextState);
      setIsSpinning(false);
    }, 1000);
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

  function handleMatchFinished() {
    if (!run) return;
    const nextIndex = currentMatchIndex + 1;
    if (nextIndex >= run.matches.length) {
      setTournamentPhase("complete");
    } else {
      setCurrentMatchIndex(nextIndex);
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
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Version badge */}
      <div className="fixed top-3 right-3 z-50 rounded-md border border-surface-700 bg-surface-900/90 px-2.5 py-1.5 text-[10px] font-mono text-gray-500 backdrop-blur">
        <span className="font-bold text-gold-400">v0.2.0</span>
        <span className="mx-1.5 text-surface-700">·</span>
        <span className="text-gray-600">8bbec5e</span>
        <span className="mx-1.5 text-surface-700">·</span>
        <span className="hidden sm:inline text-gray-600">fix: remove '(pens)'</span>
      </div>

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
                <h1 className="mt-4 font-serif text-5xl font-black tracking-normal text-white">8-0</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                  {getFormation(draftState.formationId).label} · {titleCase(draftState.difficulty)} ·{" "}
                  {draftState.draftMode === "squad-first" ? "Squad first" : "Position first"}
                  {draftState.blindMode ? " · Blind ratings" : ""}
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
              <p className="text-5xl font-black text-gold-400 tabular-nums">{bestRun?.score ?? 0}</p>
              <p className="section-label">Best</p>
            </div>
          </div>
        </div>
      </section>

      {showLeaderboard && (
        <LeaderboardPanel
          history={sortRuns(history)}
          formationId={draftState.formationId}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="stat-card">
          {run && tournamentPhase === "ready" && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="section-label">Tournament</p>
                <h2 className="mt-2 text-3xl font-black text-white">
                  {run.matches[currentMatchIndex]?.stage}
                </h2>
              </div>

              <div className="flex items-center justify-center gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/20 text-2xl font-black text-gold-400">
                    XI
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">You</p>
                </div>
                <span className="text-2xl font-bold text-gray-600">vs</span>
                <div className="flex flex-col items-center">
                  <Flag fifaCode={run.matches[currentMatchIndex]?.opponent.fifaCode ?? "FIFA"} size={56} />
                  <p className="mt-2 text-sm font-bold text-white">
                    {run.matches[currentMatchIndex]?.opponent.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startNextMatch}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-6 py-4 text-lg font-black text-black transition-colors hover:bg-gold-400"
              >
                <Play size={20} />
                Play Match
              </button>
            </div>
          )}

          {run && tournamentPhase === "live" && (
            <LiveMatch
              stage={run.matches[currentMatchIndex]?.stage ?? ""}
              opponent={run.matches[currentMatchIndex]?.opponent ?? run.matches[0].opponent}
              result={run.matches[currentMatchIndex]}
              events={allMatchEvents[currentMatchIndex] ?? []}
              onFinished={handleMatchFinished}
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

          {!run && (
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
                  <p className="section-label">{isSpinning ? "Nation reel" : "Nation"}</p>
                  <div
                    className={`mt-3 flex min-h-[58px] items-center gap-3 rounded-lg ${
                      isSpinning ? "animate-pulse" : ""
                    }`}
                  >
                    {displayedTeam ? (
                      <>
                        <Flag fifaCode={displayedTeam.fifaCode} size={42} />
                        <div className="min-w-0">
                          <p className="truncate text-xl font-black text-white">{displayedTeam.name}</p>
                          <p className="text-xs font-semibold text-gray-500">
                            {isSpinning
                              ? "Finding your player pool"
                              : `Group ${displayedTeam.group ?? "-"} · spin #${draftState.currentSpin?.spinIndex ?? 0}`}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-gray-500">Spin to reveal a player pool</p>
                    )}
                  </div>
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
            <button
              type="button"
              onClick={() => setShowLeaderboard(true)}
              className="mt-4 w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm font-bold text-white hover:border-gold-600/40"
            >
              Leaderboard
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
