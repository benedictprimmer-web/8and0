import { useState } from "react";
import Flag from "../components/Flag";
import type { EightZeroTeam, PenaltyKick } from "../game8/types";

interface PenaltyShootoutProps {
  opponent: EightZeroTeam;
  kicks: PenaltyKick[];
  onFinished: () => void;
  userWon: boolean;
}

export default function PenaltyShootout({ opponent, kicks, onFinished, userWon }: PenaltyShootoutProps) {
  const [currentKickIndex, setCurrentKickIndex] = useState(0);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);

  const visibleKicks = kicks.slice(0, currentKickIndex);
  const isFinished = currentKickIndex >= kicks.length;

  function takeNextKick() {
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
  }

  const lastKick = visibleKicks[visibleKicks.length - 1];

  return (
    <div className="stat-card animate-fade-up">
      <div className="text-center mb-6">
        <p className="section-label">Penalty Shootout</p>
        <h2 className="mt-2 text-2xl font-black text-white">Sudden Death</h2>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex flex-col items-center flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/20 text-2xl font-black text-gold-400">
            XI
          </div>
          <p className="mt-2 text-sm font-bold text-white">You</p>
          <p className="text-3xl font-black text-white tabular-nums mt-1">{userScore}</p>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Penalties</p>
          <div className="text-lg font-bold text-gray-600">vs</div>
        </div>

        <div className="flex flex-col items-center flex-1">
          <Flag fifaCode={opponent.fifaCode} size={48} />
          <p className="mt-2 text-sm font-bold text-white">{opponent.name}</p>
          <p className="text-3xl font-black text-white tabular-nums mt-1">{oppScore}</p>
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
      {!isFinished && lastKick && (
        <div className="mb-4 rounded-lg border border-gold-600/50 bg-surface-800 p-4 text-center animate-goal-pop">
          <p className="text-sm text-gray-400 mb-1">
            {lastKick.team === "user" ? "Your player" : opponent.name} steps up...
          </p>
          <p className="text-lg font-black text-white">
            {lastKick.saved ? "SAVED!" : "SCORES!"}
          </p>
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
            className="rounded-xl bg-gold-500 px-6 py-3 text-base font-black text-black transition-colors hover:bg-gold-400"
          >
            Continue
          </button>
        </div>
      )}

      {!isFinished && (
        <button
          type="button"
          onClick={takeNextKick}
          className="w-full rounded-xl bg-gold-500 px-6 py-4 text-lg font-black text-black transition-colors hover:bg-gold-400"
        >
          {currentKickIndex === 0 ? "Start Penalties" : "Next Kick"}
        </button>
      )}
    </div>
  );
}
