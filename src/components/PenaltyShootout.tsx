import { useCallback, useEffect, useState } from "react";
import Flag from "../components/Flag";
import type { EightZeroTeam, PenaltyKick } from "../game8/types";

interface PenaltyShootoutProps {
  opponent: EightZeroTeam;
  kicks: PenaltyKick[];
  onFinished: () => void;
  userWon: boolean;
  userGkRating: number;
  oppGkRating: number;
}

export default function PenaltyShootout({ opponent, kicks, onFinished, userWon, userGkRating, oppGkRating }: PenaltyShootoutProps) {
  const [currentKickIndex, setCurrentKickIndex] = useState(0);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [kickPhase, setKickPhase] = useState<"waiting" | "stepping" | "revealed">("waiting");
  const [autoPlay, setAutoPlay] = useState(true);

  const visibleKicks = kicks.slice(0, currentKickIndex);
  const isFinished = currentKickIndex >= kicks.length;

  const takeNextKick = useCallback(() => {
    if (currentKickIndex >= kicks.length) return;
    const kick = kicks[currentKickIndex];
    if (!kick.saved) {
      if (kick.team === "user") {
        setUserScore((s) => s + 1);
      } else {
        setOppScore((s) => s + 1);
      }
    }
    setCurrentKickIndex((i) => i + 1);
  }, [currentKickIndex, kicks]);

  useEffect(() => {
    if (!autoPlay || isFinished) return;

    if (kickPhase === "waiting") {
      const timer = setTimeout(() => setKickPhase("stepping"), 100);
      return () => clearTimeout(timer);
    }

    if (kickPhase === "stepping") {
      const timer = setTimeout(() => setKickPhase("revealed"), 1500);
      return () => clearTimeout(timer);
    }

    if (kickPhase === "revealed") {
      const timer = setTimeout(() => {
        takeNextKick();
        setKickPhase("waiting");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [kickPhase, autoPlay, isFinished, takeNextKick]);

  return (
    <div className="stat-card animate-fade-up">
      <div className="text-center mb-4">
        <p className="section-label">Penalty Shootout</p>
        <h2 className="mt-1 text-xl sm:text-2xl font-black text-white">Sudden Death</h2>
      </div>

      {/* GK Ratings */}
      <div className="flex items-center justify-center gap-6 mb-4 pb-4 border-b border-surface-700">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Your GK</p>
          <p className="text-lg font-black text-gold-400 tabular-nums">{Math.round(userGkRating)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">vs</p>
          <p className="text-xs text-gray-600">GK</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Their GK</p>
          <p className="text-lg font-black text-gold-400 tabular-nums">{Math.round(oppGkRating)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex flex-col items-center flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/20 text-2xl font-black text-gold-400">
            XI
          </div>
          <p className="mt-2 text-sm font-bold text-white">You</p>
          <p className="text-2xl sm:text-3xl font-black text-white tabular-nums mt-1">{userScore}</p>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Penalties</p>
          <div className="text-lg font-bold text-gray-600">vs</div>
        </div>

        <div className="flex flex-col items-center flex-1">
          <Flag fifaCode={opponent.fifaCode} size={48} />
          <p className="mt-2 text-sm font-bold text-white">{opponent.name}</p>
          <p className="text-2xl sm:text-3xl font-black text-white tabular-nums mt-1">{oppScore}</p>
        </div>
      </div>

      {/* Kick history */}
      <div className="mb-6 space-y-2 max-h-64 overflow-y-auto">
        {visibleKicks.map((kick, index) => (
          <div
            key={index}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm animate-fade-in ${
              kick.team === "user" ? "border-gold-600/30 bg-gold-500/5" : "border-surface-700 bg-surface-800"
            }`}
          >
            <span className="text-xs text-gray-500">Kick {kick.round}</span>
            <span className="font-semibold text-white">
              {kick.team === "user" ? "You" : opponent.name}
            </span>
            <span
              className={`font-black ${
                kick.saved ? "text-red-400" : "text-green-400"
              }`}
            >
              {kick.saved ? "SAVED!" : "GOAL!"}
            </span>
          </div>
        ))}
      </div>

      {/* Current kick drama */}
      {!isFinished && currentKickIndex < kicks.length && (
        <div className="mb-4 rounded-lg border border-gold-600/50 bg-surface-800 p-6 text-center animate-goal-pop">
          {kickPhase === "stepping" && (
            <p className="text-xl font-black text-white animate-pulse">
              {kicks[currentKickIndex].team === "user" ? "Your player" : kicks[currentKickIndex].scorer} steps up.....
            </p>
          )}
          {kickPhase === "revealed" && (
            <p className={`text-2xl font-black ${kicks[currentKickIndex].saved ? "text-red-400" : "text-green-400"}`}>
              {kicks[currentKickIndex].saved ? "SAVED!" : "SCORES!"}
            </p>
          )}
          {kickPhase === "waiting" && (
            <p className="text-lg font-bold text-gray-500">Get ready...</p>
          )}
        </div>
      )}

      {isFinished && (
        <div className="text-center">
          <div className="mb-4">
            <span
              className={`inline-flex items-center rounded-full px-4 py-2 text-lg font-black ${
                userWon
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {userWon ? "YOU WIN ON PENALTIES!" : "LOST ON PENALTIES"}
            </span>
          </div>
          <button
            type="button"
            onClick={onFinished}
            className="rounded-xl bg-gold-500 px-6 py-3 text-sm sm:text-lg font-black text-black transition-colors hover:bg-gold-400"
          >
            Continue
          </button>
        </div>
      )}

      {!isFinished && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAutoPlay(!autoPlay)}
            className={`rounded-xl border px-4 py-4 text-sm font-black transition-colors ${
              autoPlay
                ? "border-gold-600 bg-gold-500/10 text-gold-400"
                : "border-surface-700 bg-surface-800 text-gray-500 hover:text-white"
            }`}
          >
            {autoPlay ? "Auto" : "Manual"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (kickPhase === "waiting") {
                setKickPhase("stepping");
              } else if (kickPhase === "stepping") {
                setKickPhase("revealed");
              } else if (kickPhase === "revealed") {
                takeNextKick();
                setKickPhase("waiting");
              }
            }}
            className="flex-1 rounded-xl bg-gold-500 px-6 py-4 text-sm sm:text-lg font-black text-black transition-colors hover:bg-gold-400"
          >
            {currentKickIndex === 0 ? "Start Penalties" : "Next Kick"}
          </button>
        </div>
      )}
    </div>
  );
}
