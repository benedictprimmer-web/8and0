import { useEffect, useState, useRef, useCallback } from "react";
import Flag from "../components/Flag";
import type { EightZeroTeam, LegendMode, MatchEvent, MatchResult } from "../game8/types";

interface LiveMatchProps {
  stage: string;
  opponent: EightZeroTeam;
  result: MatchResult;
  events: MatchEvent[];
  onFinished: () => void;
  legendMode?: LegendMode;
}

const BASE_TICK_MS = 600;

type Speed = 1 | 2 | 5 | 10;

function EventRow({ event }: { event: MatchEvent }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 text-right font-mono font-bold text-gold-400">{event.minute}&apos;</span>
      {event.type === "goal" && (
        <span className="text-sm font-bold text-white">
          &#9917; {event.playerName}
          {event.playerRating ? ` (${event.playerRating})` : ""}
        </span>
      )}
      {event.type === "kickoff" && (
        <span className="text-gray-500">Kick off</span>
      )}
      {event.type === "halftime" && (
        <span className="text-gray-500">Half time</span>
      )}
      {event.type === "fulltime" && (
        <span className="text-gray-500">Full time</span>
      )}
      {event.type === "extra_time_start" && (
        <span className="text-purple-400 font-semibold">Extra Time starts</span>
      )}
      {event.type === "extra_time_end" && (
        <span className="text-purple-400 font-semibold">Extra Time ends</span>
      )}
      {event.type === "penalty_shootout" && (
        <span className="text-yellow-400 font-semibold">Penalty Shootout!</span>
      )}
      {event.type === "penalty_scored" && (
        <span className="text-green-400 font-bold">
          &#9917; {event.playerName} SCORES!
        </span>
      )}
      {event.type === "penalty_saved" && (
        <span className="text-red-400 font-bold">
          {event.playerName} - SAVED!
        </span>
      )}
      {event.type === "yellow_card" && (
        <span className="text-yellow-400">
          &#128993; {event.playerName}
        </span>
      )}
      {event.type === "red_card" && (
        <span className="text-red-400">
          &#128308; {event.playerName}
        </span>
      )}
      {event.type === "near_miss" && (
        <span className="text-gray-400">
          {event.playerName} {event.flavorText}
        </span>
      )}
    </div>
  );
}

export default function LiveMatch({ stage, opponent, result, events, onFinished, legendMode }: LiveMatchProps) {
  const [currentMinute, setCurrentMinute] = useState(0);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [recentEvent, setRecentEvent] = useState<MatchEvent | null>(null);
  const [visibleEvents, setVisibleEvents] = useState<MatchEvent[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [goalFlash, setGoalFlash] = useState(false);
  // Which scoreboard digit just changed (drives the score-pop pulse).
  const [scorePop, setScorePop] = useState<"user" | "opponent" | null>(null);
  // Transient floating "+1 GOAL" callout for user goals only. `key` re-triggers
  // the CSS animation when the same scorer pops twice in a row.
  const [goalPop, setGoalPop] = useState<{ name: string; key: number } | null>(null);
  const intervalRef = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleEvents]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    setCurrentMinute((prev) => {
      // Playback always ends at the final whistle of extra time (120'). A level
      // game then routes to the interactive penalty shootout.
      const maxMinute = result.extraTime ? 120 : 90;
      const next = prev + 1;
      if (next > maxMinute) return prev;

      const minuteEvents = eventsByMinute.current.get(next);
      if (minuteEvents) {
        for (const event of minuteEvents) {
          if (event.type === "goal") {
            if (event.team === "user") {
              setUserScore((s) => s + 1);
              setScorePop("user");
              // Only user goals get the celebratory floating callout.
              setGoalPop({ name: event.playerName ?? "GOAL", key: Date.now() });
            } else {
              setOppScore((s) => s + 1);
              setScorePop("opponent");
            }
            setGoalFlash(true);
            window.setTimeout(() => setGoalFlash(false), 800);
            window.setTimeout(() => setScorePop(null), 420);
          }
          setRecentEvent(event);
          setVisibleEvents((prev) => [...prev, event]);
        }
      }

      if (next >= maxMinute) {
        setIsFinished(true);
        clearTimer();
      }

      return next;
    });
  }, [clearTimer, result.extraTime]);

  useEffect(() => {
    clearTimer();
    intervalRef.current = window.setInterval(tick, BASE_TICK_MS / speed);
    return clearTimer;
  }, [clearTimer, tick, speed]);

  function skipToHalf() {
    const targetMinute = currentMinute < 45 ? 45 : 90;
    setCurrentMinute(targetMinute);
    const halfEvents = events.filter((e) => e.minute <= targetMinute);
    setVisibleEvents(halfEvents);
    const uGoals = halfEvents.filter(e => e.type === "goal" && e.team === "user").length;
    const oGoals = halfEvents.filter(e => e.type === "goal" && e.team === "opponent").length;
    setUserScore(uGoals);
    setOppScore(oGoals);
    setRecentEvent({ minute: targetMinute, type: targetMinute === 45 ? "halftime" : "fulltime", team: "user" });
    if (targetMinute === 90) {
      setIsFinished(true);
      clearTimer();
    }
  }

  function skipToEnd() {
    const maxMinute = result.extraTime ? 120 : 90;
    setCurrentMinute(maxMinute);
    setIsFinished(true);
    clearTimer();
    setVisibleEvents(events);
    const uGoals = events.filter(e => e.type === "goal" && e.team === "user").length;
    const oGoals = events.filter(e => e.type === "goal" && e.team === "opponent").length;
    setUserScore(uGoals);
    setOppScore(oGoals);
    const endEvent = result.extraTime
      ? { minute: 120, type: "extra_time_end" as const, team: "user" as const }
      : { minute: 90, type: "fulltime" as const, team: "user" as const };
    setRecentEvent(endEvent);
  }

  const displayMinute = currentMinute > 120 ? "120+" : (result.extraTime && currentMinute > 90) ? `${currentMinute}' ET` : `${currentMinute}'`;
  const speeds: Speed[] = [1, 2, 5, 10];

  return (
    <div className="stat-card animate-fade-up">
      <div className="text-center mb-4">
        <p className="section-label text-sm">{stage}</p>
      </div>

      {/* Speed controls */}
      <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
        {speeds.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-bold transition-colors min-w-[44px] ${
              speed === s
                ? "bg-gold-600 text-white"
                : "bg-surface-800 text-gray-500 hover:text-white"
            }`}
          >
            {s}x
          </button>
        ))}
        <button
          type="button"
          onClick={skipToHalf}
          className="ml-2 rounded-lg bg-surface-800 px-4 py-2 text-xs sm:text-sm font-bold text-gray-500 hover:text-white min-w-[44px]"
        >
          Half
        </button>
        <button
          type="button"
          onClick={skipToEnd}
          className="rounded-lg bg-surface-800 px-4 py-2 text-xs sm:text-sm font-bold text-gray-500 hover:text-white min-w-[44px]"
        >
          End
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex flex-col items-center flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/20 text-2xl font-black text-gold-400">
            XI
          </div>
          <p className="mt-2 text-sm font-bold text-white">
            {legendMode && legendMode !== "none"
              ? `${legendMode.charAt(0).toUpperCase() + legendMode.slice(1)} XI`
              : "You"}
          </p>
        </div>

        <div className="relative flex flex-col items-center">
          {/* Floating "+1 GOAL" callout — user goals only. */}
          {goalPop && (
            <div
              key={goalPop.key}
              className="animate-goal-float pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-full bg-gold-500/90 px-3 py-1 text-xs sm:text-sm font-black text-black shadow-lg"
            >
              &#9917; +1 {goalPop.name}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span
              className={`inline-block text-4xl sm:text-5xl font-black tabular-nums transition-colors ${
                goalFlash ? "text-gold-400" : "text-white"
              } ${scorePop === "user" ? "animate-score-pop" : ""}`}
            >
              {userScore}
            </span>
            <span className="text-2xl font-bold text-gray-600">-</span>
            <span
              className={`inline-block text-4xl sm:text-5xl font-black tabular-nums transition-colors ${
                goalFlash ? "text-gold-400" : "text-white"
              } ${scorePop === "opponent" ? "animate-score-pop" : ""}`}
            >
              {oppScore}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-black text-gold-400 tabular-nums">{displayMinute}&apos;</span>
            {!isFinished && currentMinute > 0 && <span className="live-dot" />}
          </div>
        </div>

        <div className="flex flex-col items-center flex-1">
          <Flag fifaCode={opponent.fifaCode} size={48} />
          <p className="mt-2 text-sm font-bold text-white">{opponent.name}</p>
        </div>
      </div>

      {recentEvent && (
        <div
          className={`mb-4 rounded-lg border border-surface-700 bg-surface-800 p-3 ${
            recentEvent.type === "goal" ? "animate-goal-pop border-gold-600/50" : "animate-fade-in"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-gold-400">{recentEvent.minute}&apos;</span>
            {recentEvent.type === "goal" && (
              <>
                <span className="text-lg">&#9917;</span>
                <span className="text-xs sm:text-sm font-bold text-white">
                  GOAL! {recentEvent.playerName}
                  {recentEvent.playerRating ? ` (${recentEvent.playerRating})` : ""}
                </span>
              </>
            )}
            {recentEvent.type === "kickoff" && (
              <span className="text-xs sm:text-sm font-semibold text-gray-400">Kick off</span>
            )}
            {recentEvent.type === "halftime" && (
              <span className="text-xs sm:text-sm font-semibold text-gray-400">Half time</span>
            )}
            {recentEvent.type === "fulltime" && (
              <span className="text-xs sm:text-sm font-semibold text-gray-400">Full time</span>
            )}
            {recentEvent.type === "penalty_shootout" && (
              <span className="text-xs sm:text-sm font-semibold text-yellow-400">Penalties!</span>
            )}
            {recentEvent.type === "yellow_card" && (
              <>
                <span className="text-base">&#128993;</span>
                <span className="text-xs sm:text-sm font-semibold text-yellow-400">
                  {recentEvent.playerName}
                </span>
              </>
            )}
            {recentEvent.type === "red_card" && (
              <>
                <span className="text-base">&#128308;</span>
                <span className="text-xs sm:text-sm font-semibold text-red-400">
                  {recentEvent.playerName}
                </span>
              </>
            )}
            {recentEvent.type === "near_miss" && (
              <span className="text-xs sm:text-sm font-semibold text-gray-300">
                {recentEvent.playerName} {recentEvent.flavorText}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Full match log */}
      {visibleEvents.length > 0 && (
        <div className="mb-4 rounded-lg border border-surface-700 bg-surface-800/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-700">
            <p className="section-label">Match Log</p>
          </div>
          <div
            ref={logRef}
            className="max-h-48 overflow-y-auto space-y-1 p-3"
          >
            {visibleEvents.map((event, index) => (
              <EventRow key={index} event={event} />
            ))}
          </div>
        </div>
      )}

      {isFinished && (
        <div className="text-center">
          <div className="mb-4">
            {result.decidedByPens ? (
              <span className="inline-flex items-center rounded-full px-4 py-2 text-lg font-black bg-yellow-500/20 text-yellow-400">
                LEVEL AFTER EXTRA TIME
              </span>
            ) : (
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
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onFinished}
            className="rounded-xl bg-gold-500 px-6 py-3 text-sm sm:text-base font-black text-black transition-colors hover:bg-gold-400"
          >
            {result.decidedByPens ? "Take penalties" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}
