import { useMemo, useState } from "react";
import { ArrowLeft, Check, Flame, X } from "lucide-react";
import Flag from "./Flag";
import type { EightZeroPlayer } from "../game8/types";

const BEST_KEY = "8-0-higher-lower-best";
// Only pair players whose ratings differ by at least this much: keeps every
// question a fair, clear-cut call (and rides over the noisier estimated ratings).
const MIN_GAP = 5;
// Draw from the most recognisable players so the quiz stays about knowledge.
const POOL_SIZE = 300;

function loadBest(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(BEST_KEY) ?? 0);
}

function pickPair(pool: EightZeroPlayer[]): [EightZeroPlayer, EightZeroPlayer] {
  for (let tries = 0; tries < 300; tries += 1) {
    const a = pool[Math.floor(Math.random() * pool.length)];
    const b = pool[Math.floor(Math.random() * pool.length)];
    if (a.id !== b.id && Math.abs(a.rating - b.rating) >= MIN_GAP) {
      return Math.random() < 0.5 ? [a, b] : [b, a];
    }
  }
  return [pool[0], pool[pool.length - 1]];
}

function PlayerCard({
  player,
  revealed,
  outcome,
  onPick,
}: {
  player: EightZeroPlayer;
  revealed: boolean;
  outcome: "higher" | "lower" | null;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={revealed}
      className={`relative flex flex-1 flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-colors disabled:cursor-default ${
        revealed && outcome === "higher"
          ? "border-emerald-500 bg-emerald-500/10"
          : revealed && outcome === "lower"
            ? "border-surface-700 bg-surface-900 opacity-70"
            : "border-surface-700 bg-surface-800 hover:border-gold-600/50 hover:bg-surface-700"
      }`}
    >
      <Flag fifaCode={player.teamCode} size={44} />
      <div className="min-w-0">
        <p className="truncate text-lg font-black text-white">{player.name}</p>
        <p className="truncate text-xs font-semibold text-gray-500">
          {player.position} · {player.clubName ?? "Free agent"}
        </p>
      </div>
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-black tabular-nums ${
          revealed ? "bg-surface-950 text-gold-400" : "bg-surface-900 text-gray-600"
        }`}
      >
        {revealed ? player.rating : "?"}
      </div>
      {revealed && outcome === "higher" && (
        <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-black">
          <Check size={16} />
        </span>
      )}
    </button>
  );
}

export default function HigherLower({
  players,
  onExit,
}: {
  players: EightZeroPlayer[];
  onExit: () => void;
}) {
  const pool = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating).slice(0, POOL_SIZE),
    [players]
  );
  const [pair, setPair] = useState(() => pickPair(pool));
  const [revealed, setRevealed] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(loadBest);

  const [left, right] = pair;
  // The higher-rated side (ties are impossible thanks to MIN_GAP).
  const higherId = left.rating >= right.rating ? left.id : right.id;

  function choose(pickedId: number) {
    if (revealed) return;
    const correct = pickedId === higherId;
    setRevealed(true);
    setLastCorrect(correct);
    if (correct) {
      const next = streak + 1;
      setStreak(next);
      if (next > best) {
        setBest(next);
        if (typeof window !== "undefined") window.localStorage.setItem(BEST_KEY, String(next));
      }
    } else {
      setStreak(0);
    }
  }

  function next() {
    setPair(pickPair(pool));
    setRevealed(false);
    setLastCorrect(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-up pb-24">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Modes
        </button>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="section-label">Streak</p>
            <p className="flex items-center gap-1 text-2xl font-black tabular-nums text-gold-400">
              <Flame size={18} className={streak > 0 ? "text-gold-400" : "text-gray-600"} />
              {streak}
            </p>
          </div>
          <div className="text-right">
            <p className="section-label">Best</p>
            <p className="text-2xl font-black tabular-nums text-white">{best}</p>
          </div>
        </div>
      </div>

      <div className="text-center">
        <h1 className="font-serif text-3xl sm:text-4xl font-black text-white">Higher or Lower</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tap the player with the higher EA rating. How long can you go?
        </p>
      </div>

      <div className="flex items-stretch gap-3">
        <PlayerCard
          player={left}
          revealed={revealed}
          outcome={revealed ? (left.id === higherId ? "higher" : "lower") : null}
          onPick={() => choose(left.id)}
        />
        <div className="flex flex-col items-center justify-center">
          <span className="rounded-full border border-surface-700 bg-surface-900 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-gray-500">
            vs
          </span>
        </div>
        <PlayerCard
          player={right}
          revealed={revealed}
          outcome={revealed ? (right.id === higherId ? "higher" : "lower") : null}
          onPick={() => choose(right.id)}
        />
      </div>

      <div className="min-h-[3.5rem] text-center">
        {revealed && (
          <div className="animate-fade-up space-y-3">
            <p
              className={`inline-flex items-center gap-2 text-lg font-black ${
                lastCorrect ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {lastCorrect ? <Check size={20} /> : <X size={20} />}
              {lastCorrect ? "Correct!" : `Nope — ${left.rating > right.rating ? left.name : right.name} is higher`}
            </p>
            <div>
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center justify-center rounded-xl bg-gold-500 px-8 py-3 text-lg font-black text-black transition-colors hover:bg-gold-400"
              >
                {lastCorrect ? "Next →" : "Try again →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
