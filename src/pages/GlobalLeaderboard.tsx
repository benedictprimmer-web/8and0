import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe, RefreshCw, Trophy } from "lucide-react";
import { leaderboardApi, type LeaderboardResponse } from "../api/client";
import { loadPlayerName } from "../game8/storage";
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
}: {
  entry: LeaderboardEntry;
  rank: number;
  isOwn: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-lg border px-3 py-3 text-sm ${
        isOwn
          ? "border-gold-600 bg-gold-500/10"
          : "border-surface-700 bg-surface-800"
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
          {entry.topScorer
            ? ` · Top scorer: ${entry.topScorer.name} (${entry.topScorer.goals})`
            : ""}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-black text-gold-400 tabular-nums">{entry.score} pts</span>
        <span className="text-[11px] font-bold text-gray-500 tabular-nums">
          {Math.round(entry.overall)} OVR
        </span>
      </div>
    </div>
  );
}

export default function GlobalLeaderboard() {
  const [filter, setFilter] = useState<FilterId>("all");
  const playerName = useMemo(() => loadPlayerName().trim().toLowerCase(), []);

  const query = useQuery<LeaderboardResponse>({
    queryKey: ["global-leaderboard"],
    queryFn: () => leaderboardApi.list(200),
    staleTime: 30_000,
    retry: 1,
  });

  const entries = query.data?.entries ?? [];
  const filtered = entries.filter((entry) => matchesFilter(entry, filter));

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

          {!query.isLoading &&
            !query.isError &&
            filtered.map((entry, index) => (
              <Row
                key={entry.id}
                entry={entry}
                rank={index + 1}
                isOwn={Boolean(playerName) && entry.name.trim().toLowerCase() === playerName}
              />
            ))}

          {!query.isLoading && !query.isError && filtered.length === 0 && (
            <div className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-6 text-center text-sm text-gray-500">
              No runs on the global board for this filter yet. Be the first!
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
