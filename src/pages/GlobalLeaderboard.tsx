import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Globe, RefreshCw, Trophy, Users, X } from "lucide-react";
import { leaderboardApi, type LeaderboardResponse, type RankedEntry } from "../api/client";
import { loadMyGlobalEntries } from "../game8/storage";
import type { LeaderboardEntry } from "../game8/leaderboard";

type FilterId = "all" | "easy" | "normal" | "hard" | "blind";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
  { id: "blind", label: "Blind" },
];

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function matchesFilter(entry: LeaderboardEntry, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "blind") return entry.blindMode;
  return entry.difficulty === filter;
}

function Row({
  entry,
  rank,
  isOwn,
  onSelect,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isOwn: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title="View this team"
      className={`grid w-full grid-cols-[36px_1fr_auto_16px] items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
        isOwn
          ? "border-gold-600 bg-gold-500/10 hover:bg-gold-500/20"
          : "border-surface-700 bg-surface-800 hover:border-gold-600/40 hover:bg-surface-700"
      }`}
    >
      <span className="font-black text-gray-500">#{rank}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-bold text-white">
          {rank === 1 && <Trophy size={14} className="flex-shrink-0 text-gold-400" />}
          <span className="truncate">{entry.name}</span>
          {isOwn && (
            <span className="flex-shrink-0 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-black text-black">
              YOU
            </span>
          )}
        </p>
        <p className="truncate text-xs text-gray-500">
          {entry.stageReached} · {entry.record} · {entry.formationLabel} · {titleCase(entry.difficulty)}
          {entry.blindMode ? " · Blind" : ""}
          {entry.topScorer?.name
            ? ` · Top scorer: ${entry.topScorer.name} (${entry.topScorer.goals ?? 0})`
            : ""}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-black text-gold-400 tabular-nums">{entry.score} pts</span>
        <span className="text-[11px] font-bold text-gray-500 tabular-nums">
          {Math.round(entry.overall)} OVR
        </span>
      </div>
      <ChevronRight size={16} className="text-gray-600" />
    </button>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}

function TeamDetailModal({
  entry,
  rank,
  isOwn,
  onClose,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isOwn: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-up"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-indigo-900/70 bg-[#11111f] p-6 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gold-400">Rank #{rank}</p>
            <h2 className="mt-1 flex items-center gap-2 truncate text-2xl font-black text-white">
              {rank === 1 && <Trophy size={20} className="flex-shrink-0 text-gold-400" />}
              <span className="truncate">{entry.name}</span>
              {isOwn && (
                <span className="flex-shrink-0 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-black text-black">
                  YOU
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm font-bold text-gray-400">
              {entry.stageReached}
              {entry.blindMode ? " · Blind mode" : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-start gap-3">
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums text-gold-400">{entry.score}</p>
              <p className="section-label">points</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip label="Formation" value={entry.formationLabel} />
          <StatChip label="Overall" value={`${Math.round(entry.overall)}`} />
          <StatChip label="Record" value={`${entry.wins}-${entry.draws}-${entry.losses}`} />
          <StatChip label="Difficulty" value={titleCase(entry.difficulty)} />
        </div>

        {entry.topScorer?.name && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-gold-600/40 bg-gold-500/5 px-3 py-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-gold-300">
              <Trophy size={14} className="text-gold-400" />
              Top scorer · {entry.topScorer.name}
            </span>
            <span className="font-black tabular-nums text-gold-400">
              {entry.topScorer.goals ?? 0} {(entry.topScorer.goals ?? 0) === 1 ? "goal" : "goals"}
            </span>
          </div>
        )}

        <div className="mt-5">
          <p className="section-label inline-flex items-center gap-2">
            <Users size={14} className="text-gold-400" />
            Starting XI ({entry.xi.length})
          </p>
          {entry.xi.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">This run didn&apos;t record its squad.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {entry.xi.map((name, index) => (
                <div
                  key={`${name}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-950 text-xs font-black text-gray-500">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-bold text-white">{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function bestRanked(mine: RankedEntry[]): RankedEntry | null {
  let best: RankedEntry | null = null;
  for (const item of mine) {
    if (item.rank === null) continue;
    if (!best || best.rank === null || item.rank < best.rank) best = item;
  }
  return best;
}

export default function GlobalLeaderboard() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const mySeeds = useMemo(() => loadMyGlobalEntries().map((entry) => entry.seed), []);
  const mySeedSet = useMemo(() => new Set(mySeeds), [mySeeds]);

  const query = useQuery<LeaderboardResponse>({
    queryKey: ["global-leaderboard", mySeeds],
    queryFn: () => leaderboardApi.list(200, mySeeds),
    staleTime: 30_000,
    retry: 2,
    placeholderData: { entries: [], total: 0, mine: [] },
  });

  const entries = useMemo(() => query.data?.entries ?? [], [query.data]);
  // Position in the server-ordered top list == true global rank (we fetch from #1).
  const globalRankById = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry, index) => map.set(entry.id, index + 1));
    return map;
  }, [entries]);

  const filtered = entries.filter((entry) => matchesFilter(entry, filter));

  const myBest = bestRanked(query.data?.mine ?? []);
  // Only show the standalone banner when your best run isn't already visible above.
  const myBestVisible =
    myBest !== null && filtered.some((entry) => entry.id === myBest.entry.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to game
          </Link>
          <h1 className="mt-5 flex items-center gap-3 font-serif text-4xl font-black tracking-normal text-white sm:text-5xl">
            <Globe className="text-gold-400" size={36} />
            Global leaderboard
          </h1>
          <p className="mt-2 text-base text-gray-400">
            The best 8-0 World Cup runs from players everywhere.
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-gold-600/40"
        >
          <RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <section className="stat-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-label">Rankings</p>
            <h2 className="mt-1 text-2xl font-black text-white">
              {query.data ? `${query.data.total} runs` : "Top runs"}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
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
        </div>

        <div className="mt-4 space-y-2">
          {query.isLoading && (
            <div className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-6 text-center text-sm text-gray-500">
              Loading the global board…
            </div>
          )}

          {query.isError && (
            <div className="rounded-lg border border-rose-900/60 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-300">
              Couldn&apos;t reach the global leaderboard. It needs the live backend —
              this won&apos;t work offline or on a preview without Upstash configured.
            </div>
          )}

          {!query.isLoading && !query.isError && myBest && !myBestVisible && (
            <div className="rounded-lg border border-gold-600 bg-gold-500/10 px-3 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gold-400">Your best run</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-bold text-white">
                  #{myBest.rank} · {myBest.entry.name} · {myBest.entry.stageReached}
                </p>
                <span className="flex-shrink-0 font-black text-gold-400 tabular-nums">
                  {myBest.entry.score} pts
                </span>
              </div>
            </div>
          )}

          {!query.isLoading &&
            !query.isError &&
            filtered.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                rank={globalRankById.get(entry.id) ?? 0}
                isOwn={mySeedSet.has(entry.id)}
                onSelect={() => setSelected(entry)}
              />
            ))}

          {!query.isLoading && !query.isError && filtered.length === 0 && (
            <div className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-6 text-center text-sm text-gray-500">
              No runs on the global board for this filter yet. Be the first!
            </div>
          )}
        </div>
      </section>

      {selected && (
        <TeamDetailModal
          entry={selected}
          rank={globalRankById.get(selected.id) ?? 0}
          isOwn={mySeedSet.has(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
