import { useEffect, useState, useRef, useCallback } from "react";
import Flag from "../components/Flag";
import type { EightZeroTeam, MatchEvent, MatchResult } from "../game8/types";

interface LiveMatchProps {
  stage: string;
  opponent: EightZeroTeam;
  result: MatchResult;
  events: MatchEvent[];
  onFinished: () => void;
}

const TICK_MS = 600;

export default function LiveMatch({ stage, opponent, result, events, onFinished }: LiveMatchProps) {
  const [currentMinute, setCurrentMinute] = useState(0);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [recentEvent, setRecentEvent] = useState<MatchEvent | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const eventsByMinute = useRef(new Map<number, MatchEvent[]>());

  useEffect(() => {
    const map = new Map<number, MatchEvent[]>();
    for (const event of events) {
      const existing = map.get(event.minute) ?? [];
      existing.push(event);
      map.set(event.minute, existing);
    }
    eventsByMinute.current = map;
  }, [events]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setCurrentMinute((prev) => {
        const next = prev + 1;
        if (next > 91) {
          return prev;
        }

        const minuteEvents = eventsByMinute.current.get(next);
        if (minuteEvents) {
          for (const event of minuteEvents) {
            if (event.type === "goal") {
              if (event.team === "user") {
                setUserScore((s) => s + 1);
              } else {
                setOppScore((s) => s + 1);
              }
            }
            setRecentEvent(event);
          }
        }

        if (next >= 91) {
          setIsFinished(true);
          clearTimer();
        }

        return next;
      });
    }, TICK_MS);

    return clearTimer;
  }, [clearTimer]);

  const displayMinute = currentMinute > 90 ? "90+" : String(currentMinute);

  return (
    <div className="stat-card animate-fade-up">
      <div className="text-center mb-4">
        <p className="section-label">{stage}</p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex flex-col items-center flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/20 text-2xl font-black text-gold-400">
            XI
          </div>
          <p className="mt-2 text-sm font-bold text-white">You</p>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3">
            <span className="text-5xl font-black text-white tabular-nums">{userScore}</span>
            <span className="text-2xl font-bold text-gray-600">-</span>
            <span className="text-5xl font-black text-white tabular-nums">{oppScore}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-black text-gold-400 tabular-nums">{displayMinute}&apos;</span>
            {!isFinished && currentMinute > 0 && (
              <span className="live-dot" />
            )}
          </div>
        </div>

        <div className="flex flex-col items-center flex-1">
          <Flag fifaCode={opponent.fifaCode} size={48} />
          <p className="mt-2 text-sm font-bold text-white">{opponent.name}</p>
        </div>
      </div>

      {recentEvent && (
        <div className="mb-4 rounded-lg border border-surface-700 bg-surface-800 p-3 animate-fade-in">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-gold-400">{recentEvent.minute}&apos;</span>
            {recentEvent.type === "goal" && (
              <>
                <span className="text-lg">&#9917;</span>
                <span className="text-sm font-bold text-white">
                  GOAL! {recentEvent.team === "user" ? recentEvent.playerName : opponent.name}
                </span>
              </>
            )}
            {recentEvent.type === "kickoff" && (
              <span className="text-sm font-semibold text-gray-400">Kick off</span>
            )}
            {recentEvent.type === "halftime" && (
              <span className="text-sm font-semibold text-gray-400">Half time</span>
            )}
            {recentEvent.type === "fulltime" && (
              <span className="text-sm font-semibold text-gray-400">Full time</span>
            )}
            {recentEvent.type === "penalty_shootout" && (
              <span className="text-sm font-semibold text-yellow-400">Penalties!</span>
            )}
          </div>
        </div>
      )}

      {isFinished && (
        <div className="text-center">
          <div className="mb-4">
            <span
              className={`inline-flex items-center rounded-full px-4 py-2 text-lg font-black ${
                result.result === "W"
                  ? "bg-green-500/20 text-green-400"
                  : result.result === "L"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-gray-500/20 text-gray-300"
              }`}
            >
              {result.result === "W" ? "WIN" : result.result === "L" ? "LOSS" : "DRAW"}
              {result.decidedByPens && " (pens)"}
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
    </div>
  );
}
