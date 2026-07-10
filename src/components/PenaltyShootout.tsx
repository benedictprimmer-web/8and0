import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Flag from "../components/Flag";
import {
  describeGoalDirection,
  describeMissDirection,
  describePlacedGoal,
  describePlacedMiss,
  type ShotDirection,
  type ShotHeight,
} from "../game8/penaltyText";
import {
  OPPONENT_SHOOTER_RATING,
  SHOOTER_CENTER_WEIGHT,
  keeperCenterWeight,
  pickDirection,
  resolveKick,
  resolvePlacedKick,
  resolvePoweredKick,
} from "../game8/penaltyModel";
import { REGULATION_KICKS, shootoutStatus } from "../game8/shootoutStatus";
import { type PenaltyTaker, takerForKick } from "../game8/penaltyLineup";
import type { EightZeroTeam } from "../game8/types";

interface InteractivePenaltyKick {
  round: number;
  team: "user" | "opponent";
  playerName: string;
  userDirection?: ShotDirection;
  userHeight?: ShotHeight;
  userDiveDirection?: ShotDirection;
  opponentShotDirection?: ShotDirection;
  keeperDirection: ShotDirection;
  result: "goal" | "saved" | "missed";
}

type PenaltyMode = "shooter" | "goalkeeper" | "both";

// Pixel-art art direction: two generated sprite sets the player can flip between
// in practice. Each style ships a stadium background plus keeper/ball sprites,
// and its own goal geometry (the generated goalmouth sits at a different height
// in each backdrop), so all overlay positions are driven off GOAL_RECT.
type SpriteStyle = "16" | "32";
// How the shooter aims. Two experiments toggled in practice: a 6-zone target
// grid, or a timed power/placement meter. See resolvePlacedKick / resolvePoweredKick.
type AimMode = "sixzone" | "power";

const A = "/assets/penalty";
const STYLE_ASSETS: Record<SpriteStyle, { bg: string; ready: string; dive: string; jump: string }> = {
  "16": { bg: `${A}/bg16.png`, ready: `${A}/keeper16_ready.png`, dive: `${A}/keeper16_dive.png`, jump: `${A}/keeper16_jump.png` },
  "32": { bg: `${A}/bg32.png`, ready: `${A}/keeper32_ready.png`, dive: `${A}/keeper32_dive.png`, jump: `${A}/keeper32_jump.png` },
};
const BALL_SRC = `${A}/ball.png`;

// Goalmouth rectangle within the 16:9 arena, as percentages. Measured from the
// generated backgrounds; nudge here if a sprite drifts off the posts.
interface GoalRect { left: number; right: number; top: number; bottom: number; keeperH: number; }
const GOAL_RECT: Record<SpriteStyle, GoalRect> = {
  "16": { left: 28, right: 71, top: 19, bottom: 51, keeperH: 34 },
  "32": { left: 29, right: 71, top: 42, bottom: 70, keeperH: 30 },
};
const SPOT = { top: 84, left: 50 }; // penalty spot in the arena

interface PenaltyShootoutProps {
  opponent: EightZeroTeam;
  userGkRating: number;
  oppGkRating: number;
  userShooterRating?: number;
  // Real named lineups. When provided, each kick is taken by a specific player
  // (with their real rating), and the keeper is that team's actual keeper. When
  // omitted (e.g. practice), the component falls back to the scalar ratings.
  userTakers?: PenaltyTaker[];
  userKeeper?: PenaltyTaker;
  oppTakers?: PenaltyTaker[];
  oppKeeper?: PenaltyTaker;
  onFinished: (userWon: boolean) => void;
  practiceMode?: boolean;
  mode?: PenaltyMode;
  onStopPractice?: () => void;
}

// Build a kick the user takes as the shooter (keeper is AI). `shooter` names the
// player stepping up and supplies their rating; `keeper` is the opponent's GK.
// `aim` carries the mode-specific placement: a height for 6-zone, an accuracy
// for power mode. The keeper always commits to a side (L/C/R) either way.
function buildUserShot(
  direction: ShotDirection,
  kickNumber: number,
  shooter: PenaltyTaker,
  keeper: PenaltyTaker,
  aim: { mode: "sixzone"; height: ShotHeight } | { mode: "power"; accuracy: number }
): InteractivePenaltyKick {
  const keeperDirection = pickDirection(keeperCenterWeight(keeper.rating), Math.random);
  const result =
    aim.mode === "sixzone"
      ? resolvePlacedKick(direction, aim.height, keeperDirection, shooter.rating, keeper.rating, Math.random)
      : resolvePoweredKick(direction, keeperDirection, shooter.rating, keeper.rating, aim.accuracy, Math.random);
  return {
    round: kickNumber,
    team: "user",
    playerName: shooter.name,
    userDirection: direction,
    userHeight: aim.mode === "sixzone" ? aim.height : "low",
    keeperDirection,
    result,
  };
}

// Build an opponent kick the user faces as the keeper (shooter is AI). `shooter`
// is the opponent's named taker; `keeper` is the user's GK.
function buildUserDive(
  direction: ShotDirection,
  kickNumber: number,
  shooter: PenaltyTaker,
  keeper: PenaltyTaker
): InteractivePenaltyKick {
  const opponentShotDirection = pickDirection(SHOOTER_CENTER_WEIGHT, Math.random);
  const result = resolveKick(opponentShotDirection, direction, shooter.rating, keeper.rating, Math.random);
  return {
    round: kickNumber,
    team: "opponent",
    playerName: shooter.name,
    userDiveDirection: direction,
    opponentShotDirection,
    keeperDirection: direction,
    result,
  };
}

type DotOutcome = "made" | "missed";

// A row of penalty markers for one team: green = scored/saved, red = missed,
// hollow = not yet taken. At least five slots, growing into sudden death.
function PenaltyDots({ label, dots, total }: { label: string; dots: DotOutcome[]; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 truncate text-xs font-bold text-gray-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: total }).map((_, index) => {
          const outcome = dots[index];
          const cls =
            outcome === "made"
              ? "bg-green-500 border-green-400"
              : outcome === "missed"
                ? "bg-red-500 border-red-400"
                : "bg-surface-700 border-surface-600";
          const isSuddenDeath = index >= REGULATION_KICKS;
          return (
            <span
              key={index}
              className={`h-3.5 w-3.5 rounded-full border ${cls} ${isSuddenDeath ? "ring-1 ring-gold-500/40" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}

const ANIMATION_DURATION = 2000; // ms - ball fly + keeper dive
const RESULT_DURATION = 1500; // ms - show result before next kick

export default function PenaltyShootout({
  opponent,
  userGkRating,
  oppGkRating,
  userShooterRating = 80,
  userTakers,
  userKeeper,
  oppTakers,
  oppKeeper,
  onFinished,
  practiceMode = false,
  mode,
  onStopPractice
}: PenaltyShootoutProps) {
  // Effective lineups: use the real named players when supplied, otherwise
  // synthesize single generic takers/keepers from the scalar ratings (practice).
  const effUserTakers = useMemo<PenaltyTaker[]>(
    () => (userTakers && userTakers.length > 0 ? userTakers : [{ name: "You", rating: userShooterRating }]),
    [userTakers, userShooterRating]
  );
  const effUserKeeper = useMemo<PenaltyTaker>(
    () => userKeeper ?? { name: "You", rating: userGkRating },
    [userKeeper, userGkRating]
  );
  const effOppTakers = useMemo<PenaltyTaker[]>(
    () => (oppTakers && oppTakers.length > 0 ? oppTakers : [{ name: opponent.name, rating: OPPONENT_SHOOTER_RATING }]),
    [oppTakers, opponent.name]
  );
  const effOppKeeper = useMemo<PenaltyTaker>(
    () => oppKeeper ?? { name: opponent.name, rating: oppGkRating },
    [oppKeeper, opponent.name, oppGkRating]
  );
  const [kicks, setKicks] = useState<InteractivePenaltyKick[]>([]);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [phase, setPhase] = useState<"waiting" | "selecting_dive" | "kicking" | "opp_kicking" | "revealed" | "finished">("waiting");
  const [currentKick, setCurrentKick] = useState<InteractivePenaltyKick | null>(null);
  const [userWon, setUserWon] = useState<boolean | null>(null);
  const [selectedMode, setSelectedMode] = useState<PenaltyMode | null>(mode || null);
  // Art direction + aim experiment. Default to the 16-bit look and the 6-zone
  // grid; both can be flipped live from the practice control strip.
  const [spriteStyle, setSpriteStyle] = useState<SpriteStyle>("16");
  const [aimMode, setAimMode] = useState<AimMode>("sixzone");
  // Power-mode meter: a marker sweeps 0→100→0; the shooter locks a side first,
  // then taps to fire. Accuracy = how close the marker is to the sweet spot (50).
  const [powerSide, setPowerSide] = useState<ShotDirection | null>(null);
  const [meter, setMeter] = useState(0);
  const meterRef = useRef(0);
  // The ball/keeper render parked at rest for one painted frame, then `launched`
  // flips and they move — so the CSS transition eases instead of snapping (a
  // value + transition set in the same commit skips the animation).
  const [launched, setLaunched] = useState(false);
  const activeRect = GOAL_RECT[spriteStyle];
  const assets = STYLE_ASSETS[spriteStyle];

  const effectiveMode = useMemo(() => {
    if (selectedMode) return selectedMode;
    if (mode) return mode;
    return "both";
  }, [selectedMode, mode]);

  const showModeSelector = practiceMode && !selectedMode && !mode;

  // Kicks taken so far, per team — drives turn order and termination.
  const userKicks = useMemo(() => kicks.filter((k) => k.team === "user").length, [kicks]);
  const oppKicks = useMemo(() => kicks.filter((k) => k.team === "opponent").length, [kicks]);

  const isUserTurn = useMemo(() => {
    if (effectiveMode === "shooter") return true;
    if (effectiveMode === "goalkeeper") return false;
    // Both mode: teams alternate and the user shoots first each round.
    return userKicks === oppKicks;
  }, [effectiveMode, userKicks, oppKicks]);

  // Live shootout status (only meaningful for two-sided "both" mode).
  const status = useMemo(
    () => shootoutStatus({ userScore, oppScore, userKicks, oppKicks }),
    [userScore, oppScore, userKicks, oppKicks]
  );

  // Marker rows: a "made" dot is a goal you scored, or — as keeper — a save.
  const userDots = useMemo<DotOutcome[]>(() => {
    if (effectiveMode === "goalkeeper") {
      return kicks.filter((k) => k.team === "opponent").map((k) => (k.result === "saved" ? "made" : "missed"));
    }
    return kicks.filter((k) => k.team === "user").map((k) => (k.result === "goal" ? "made" : "missed"));
  }, [kicks, effectiveMode]);

  const oppDots = useMemo<DotOutcome[]>(() => {
    if (effectiveMode === "shooter") return [];
    return kicks.filter((k) => k.team === "opponent").map((k) => (k.result === "goal" ? "made" : "missed"));
  }, [kicks, effectiveMode]);

  const dotTotal = Math.max(REGULATION_KICKS, userDots.length, oppDots.length);

  const roundLabel = useMemo(() => {
    if (effectiveMode === "both" && status.suddenDeath) return "Sudden Death";
    const taken =
      effectiveMode === "shooter" ? userKicks : effectiveMode === "goalkeeper" ? oppKicks : Math.min(userKicks, oppKicks);
    return `Round ${Math.min(REGULATION_KICKS, taken + 1)}`;
  }, [effectiveMode, status.suddenDeath, userKicks, oppKicks]);

  const isFinished = phase === "finished";

  const addKick = useCallback((kick: InteractivePenaltyKick) => {
    setKicks(prev => [...prev, kick]);
    if (effectiveMode === "goalkeeper") {
      if (kick.team === "opponent" && kick.result === "saved") {
        setUserScore(s => s + 1);
      } else if (kick.team === "opponent" && kick.result === "goal") {
        setOppScore(s => s + 1);
      }
    } else {
      if (kick.team === "user" && kick.result === "goal") {
        setUserScore(s => s + 1);
      } else if (kick.team === "opponent" && kick.result === "goal") {
        setOppScore(s => s + 1);
      }
    }
  }, [effectiveMode]);

  // After a kick is revealed: apply the score, then either finish the shootout
  // or hand over to the next taker. Pre-kick counts/scores are passed in so the
  // decision is computed from a stable snapshot (state updates are async).
  const resolveAfterKick = useCallback(
    (kick: InteractivePenaltyKick, preUserKicks: number, preOppKicks: number, preUserScore: number, preOppScore: number) => {
      const userKicksAfter = preUserKicks + (kick.team === "user" ? 1 : 0);
      const oppKicksAfter = preOppKicks + (kick.team === "opponent" ? 1 : 0);

      let newUserScore = preUserScore;
      let newOppScore = preOppScore;
      if (effectiveMode === "goalkeeper") {
        if (kick.team === "opponent" && kick.result === "saved") newUserScore += 1;
        else if (kick.team === "opponent" && kick.result === "goal") newOppScore += 1;
      } else {
        if (kick.team === "user" && kick.result === "goal") newUserScore += 1;
        else if (kick.team === "opponent" && kick.result === "goal") newOppScore += 1;
      }

      let finishedWinner: boolean | null = null;
      if (effectiveMode === "both") {
        const st = shootoutStatus({
          userScore: newUserScore,
          oppScore: newOppScore,
          userKicks: userKicksAfter,
          oppKicks: oppKicksAfter,
        });
        if (st.decided) finishedWinner = st.winner === "user";
      } else if (userKicksAfter >= REGULATION_KICKS && effectiveMode === "shooter") {
        // Shooter practice: a set of five — "win" by scoring the majority.
        finishedWinner = newUserScore > REGULATION_KICKS / 2;
      } else if (oppKicksAfter >= REGULATION_KICKS && effectiveMode === "goalkeeper") {
        // Goalkeeper practice: "win" by saving the majority of five kicks.
        finishedWinner = newUserScore > REGULATION_KICKS / 2;
      }

      if (finishedWinner !== null) {
        setUserWon(finishedWinner);
        setPhase("finished");
      } else {
        setCurrentKick(null);
        setPhase("waiting");
      }
    },
    [effectiveMode]
  );

  // Who is stepping up for the next kick on each side (1-based kick number).
  const nextUserTaker = useMemo(
    () => takerForKick(effUserTakers, userKicks + 1, effUserTakers[0]),
    [effUserTakers, userKicks]
  );
  const nextOppTaker = useMemo(
    () => takerForKick(effOppTakers, oppKicks + 1, effOppTakers[0]),
    [effOppTakers, oppKicks]
  );

  // The decisive moments run in slow motion — a longer ball flight ramps the tension.
  const flightMs = status.suddenDeath ? 2900 : ANIMATION_DURATION;

  const fireUserShot = useCallback(
    (direction: ShotDirection, aim: { mode: "sixzone"; height: ShotHeight } | { mode: "power"; accuracy: number }) => {
      if (phase !== "waiting" || !isUserTurn) return;
      setPowerSide(null);
      const kick = buildUserShot(direction, userKicks + 1, nextUserTaker, effOppKeeper, aim);
      setCurrentKick(kick);
      setPhase("kicking");
      window.setTimeout(() => {
        setPhase("revealed");
        addKick(kick);
        window.setTimeout(() => resolveAfterKick(kick, userKicks, oppKicks, userScore, oppScore), RESULT_DURATION);
      }, flightMs);
    },
    [phase, isUserTurn, userKicks, oppKicks, userScore, oppScore, nextUserTaker, effOppKeeper, addKick, resolveAfterKick, flightMs]
  );

  // 6-zone: a target click carries both a side and a height.
  const handleZoneKick = useCallback(
    (direction: ShotDirection, height: ShotHeight) => fireUserShot(direction, { mode: "sixzone", height }),
    [fireUserShot]
  );

  // Power mode: first tap picks a side and starts the meter sweeping; second tap
  // locks the accuracy (marker nearest 50 = perfect) and fires.
  const startPower = useCallback(
    (direction: ShotDirection) => {
      if (phase !== "waiting" || !isUserTurn) return;
      setPowerSide(direction);
    },
    [phase, isUserTurn]
  );
  const lockPower = useCallback(() => {
    if (powerSide === null) return;
    const accuracy = 1 - Math.abs(meterRef.current - 50) / 50;
    fireUserShot(powerSide, { mode: "power", accuracy });
  }, [powerSide, fireUserShot]);

  // Drive the power meter with rAF while a side is armed and we're still waiting.
  useEffect(() => {
    if (powerSide === null || phase !== "waiting") return;
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      // ~0.55s per full sweep; triangle wave 0..100..0.
      const p = ((t - start) / 550) % 2;
      const v = (p < 1 ? p : 2 - p) * 100;
      meterRef.current = v;
      setMeter(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [powerSide, phase]);

  const handleUserDive = useCallback(
    (direction: ShotDirection) => {
      if (phase !== "selecting_dive") return;
      const kick = buildUserDive(direction, oppKicks + 1, nextOppTaker, effUserKeeper);
      setCurrentKick(kick);
      setPhase("opp_kicking");
      window.setTimeout(() => {
        setPhase("revealed");
        addKick(kick);
        window.setTimeout(() => resolveAfterKick(kick, userKicks, oppKicks, userScore, oppScore), RESULT_DURATION);
      }, ANIMATION_DURATION);
    },
    [phase, userKicks, oppKicks, userScore, oppScore, nextOppTaker, effUserKeeper, addKick, resolveAfterKick]
  );

  // Reached only when it is the opponent's turn and the user keeps the goal, so
  // always hand control to the dive selector (real knockouts and practice).
  const handleOpponentKick = useCallback(() => {
    if (phase !== "waiting") return;
    setCurrentKick(null);
    setPhase("selecting_dive");
  }, [phase]);

  useEffect(() => {
    if (phase === "waiting" && !isUserTurn && !isFinished) {
      const timer = setTimeout(() => handleOpponentKick(), 1000);
      return () => clearTimeout(timer);
    }
  }, [phase, isUserTurn, isFinished, handleOpponentKick]);

  useEffect(() => {
    if (userWon !== null) {
      onFinished(userWon);
    }
  }, [userWon, onFinished]);

  // Defer the "launch" to the next frame so the ball/keeper paint at rest first,
  // then transition to their target. Reset the instant the flight ends.
  useEffect(() => {
    if (phase !== "kicking" && phase !== "opp_kicking") {
      setLaunched(false);
      return;
    }
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setLaunched(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [phase]);


  // Compute the shot direction being displayed
  const displayShotDirection = useMemo(() => {
    if (!currentKick) return "center" as const;
    if (currentKick.team === "user") return currentKick.userDirection || "center";
    return currentKick.opponentShotDirection || "center";
  }, [currentKick]);

  // Geometry helpers driven off the active style's goalmouth rectangle. The
  // keeper stands on the goal line; the ball flies from the spot into a corner.
  const gc = (activeRect.left + activeRect.right) / 2; // goal centre x
  const postInset = (activeRect.right - activeRect.left) * 0.12;
  const sideX = useCallback(
    (dir: ShotDirection) => (dir === "left" ? activeRect.left + postInset : dir === "right" ? activeRect.right - postInset : gc),
    [activeRect, gc, postInset]
  );
  const keeperLineY = activeRect.bottom - 1;

  const flightPhase = phase === "kicking" || phase === "opp_kicking";
  const restPhase = phase === "waiting" || phase === "selecting_dive";

  // Ball position logic — parked on the spot until the kick launches.
  const ballPosition = useMemo(() => {
    if (!currentKick || restPhase || (flightPhase && !launched)) {
      return { top: `${SPOT.top}%`, left: `${SPOT.left}%` }; // Penalty spot
    }
    const dir = displayShotDirection;
    const height: ShotHeight = currentKick.userHeight ?? "low";

    if (currentKick.result === "saved") {
      return { top: `${keeperLineY - 6}%`, left: `${sideX(currentKick.keeperDirection)}%` };
    }
    if (currentKick.result === "missed") {
      if (height === "high" && dir === "center") return { top: `${activeRect.top - 10}%`, left: "50%" };
      if (dir === "left") return { top: `${activeRect.top + 4}%`, left: `${activeRect.left - 7}%` };
      if (dir === "right") return { top: `${activeRect.top + 4}%`, left: `${activeRect.right + 7}%` };
      return { top: `${activeRect.top - 10}%`, left: "50%" };
    }
    // GOAL — into the corner. High tucks under the bar, low nestles by the post.
    const yTop = activeRect.top + (activeRect.bottom - activeRect.top) * (height === "high" ? 0.16 : 0.7);
    return { top: `${yTop}%`, left: `${sideX(dir)}%` };
  }, [currentKick, restPhase, flightPhase, launched, displayShotDirection, activeRect, sideX, keeperLineY]);

  // Keeper sprite + placement. Ready pose while at rest (and until launch); a
  // side dive uses the horizontal sprite (mirrored for a left dive, since it's
  // drawn diving right), and a centre stay uses the jump pose.
  const keeper = useMemo(() => {
    if (!currentKick || restPhase || (flightPhase && !launched)) return { src: assets.ready, flip: false, top: keeperLineY, left: gc };
    const kd = currentKick.keeperDirection;
    if (kd === "center") return { src: assets.jump, flip: false, top: keeperLineY, left: gc };
    return { src: assets.dive, flip: kd === "left", top: keeperLineY - 4, left: sideX(kd) };
  }, [currentKick, restPhase, flightPhase, launched, assets, keeperLineY, gc, sideX]);

  // Long easing only during the flight; a quick 120ms reset snaps everything
  // back to rest for the next kick.
  const moveTransition = flightPhase
    ? `top ${flightMs}ms ease-out, left ${flightMs}ms ease-out, transform ${flightMs}ms ease-out`
    : "top 120ms, left 120ms, transform 120ms";
  const suddenZoom = status.suddenDeath && (phase === "kicking" || phase === "opp_kicking" || phase === "revealed");

  return (
    <>
      <style>{`
        @keyframes result-pop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes goal-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes pen-ball-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes arena-shake {
          0%, 100% { transform: translate(0, 0); }
          15% { transform: translate(-6px, 3px); }
          35% { transform: translate(6px, -2px); }
          55% { transform: translate(-4px, 2px); }
          75% { transform: translate(4px, -1px); }
        }
      `}</style>
      <div className="stat-card animate-fade-up">
        {showModeSelector && (
          <div className="text-center mb-6">
            <p className="section-label mb-4">Penalty Practice</p>
            <h2 className="mt-1 text-xl sm:text-2xl font-black text-white mb-6">
              Choose Your Practice Mode
            </h2>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setSelectedMode("shooter")}
                className="rounded-xl bg-gold-500 px-6 py-4 text-lg font-black text-black transition-colors hover:bg-gold-400"
              >
                Practice as Shooter
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode("goalkeeper")}
                className="rounded-xl bg-blue-500 px-6 py-4 text-lg font-black text-white transition-colors hover:bg-blue-400"
              >
                Practice as Goalkeeper
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode("both")}
                className="rounded-xl bg-surface-700 px-6 py-4 text-lg font-black text-white transition-colors hover:bg-surface-600"
              >
                Practice Both (Real Simulation)
              </button>
            </div>
            {onStopPractice && (
              <button
                type="button"
                onClick={() => onStopPractice()}
                className="mt-4 rounded-xl border border-surface-700 bg-surface-950 px-6 py-3 text-sm font-black text-gray-400 transition-colors hover:border-gold-600/40 hover:text-white"
              >
                Back to Menu
              </button>
            )}
          </div>
        )}

        {!showModeSelector && (
          <>
            <div className="text-center mb-4">
              <p className="section-label">Penalty Shootout</p>
              <h2 className={`mt-1 text-xl sm:text-2xl font-black ${roundLabel === "Sudden Death" ? "text-gold-400" : "text-white"}`}>
                {roundLabel}
              </h2>
              {practiceMode && (
                <p className="text-xs text-gray-500 mt-1">
                  {effectiveMode === "shooter" && "Practice Mode: Shooter"}
                  {effectiveMode === "goalkeeper" && "Practice Mode: Goalkeeper"}
                  {effectiveMode === "both" && "Practice Mode: Both"}
                </p>
              )}
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

            {/* Penalty marker dots so you can see exactly where the shootout stands */}
            <div className="mb-6 space-y-2 rounded-xl border border-surface-700 bg-surface-800/50 p-3">
              <PenaltyDots label="You" dots={userDots} total={dotTotal} />
              {effectiveMode !== "shooter" && (
                <PenaltyDots label={opponent.name} dots={oppDots} total={dotTotal} />
              )}
              {effectiveMode === "both" && status.suddenDeath && (
                <p className="pt-1 text-center text-xs font-black uppercase tracking-wide text-gold-400">
                  Sudden Death — next goal advantage wins
                </p>
              )}
            </div>

            {!isFinished && (
              <div className="mb-6 rounded-xl border border-gold-600/30 bg-surface-800 p-4 sm:p-6 text-center">
                {/* Status text */}
                <div className="mb-4 min-h-[2rem]">
                  {phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both") && (
                    <p className="text-lg font-bold text-white">
                      {(() => {
                        const who = nextUserTaker.name === "You" ? "Your kick" : `${nextUserTaker.name} steps up`;
                        const how =
                          aimMode === "power"
                            ? powerSide === null
                              ? "pick a side"
                              : "time the meter"
                            : "pick your spot";
                        return `${who} — ${how}!`;
                      })()}
                    </p>
                  )}
                  {phase === "waiting" && !isUserTurn && effectiveMode === "both" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {nextOppTaker.name} steps up for {opponent.name}...
                    </p>
                  )}
                  {phase === "waiting" && effectiveMode === "goalkeeper" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {nextOppTaker.name} steps up for {opponent.name}...
                    </p>
                  )}
                  {phase === "selecting_dive" && (
                    <p className="text-lg font-bold text-white">Choose where to dive!</p>
                  )}
                  {phase === "kicking" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {currentKick && currentKick.playerName !== "You" ? `${currentKick.playerName} shoots...` : "You shoot..."}
                    </p>
                  )}
                  {phase === "opp_kicking" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {currentKick?.playerName ?? opponent.name} shoots...
                    </p>
                  )}
                  {phase === "revealed" && currentKick && (
                    <div style={{ animation: "result-pop 0.6s ease-out" }}>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">{currentKick.playerName}</p>
                      <p className={`text-3xl font-black ${
                        currentKick.result === "goal" ? "text-green-400" :
                        currentKick.result === "saved" ? "text-red-400" : "text-yellow-400"
                      }`}>
                        {currentKick.result === "goal" ? "GOAL!" :
                         currentKick.result === "saved" ? "SAVED!" : "MISSED!"}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {currentKick.result === "saved" ? (
                          currentKick.team === "user" ?
                            `Keeper dived ${currentKick.keeperDirection}!` :
                            `You dived ${currentKick.keeperDirection}!`
                        ) : currentKick.result === "missed" ? (
                          currentKick.team === "user" && currentKick.userHeight
                            ? describePlacedMiss(displayShotDirection, currentKick.userHeight)
                            : describeMissDirection(displayShotDirection)
                        ) : (
                          currentKick.team === "user" && currentKick.userHeight
                            ? describePlacedGoal(displayShotDirection, currentKick.userHeight)
                            : describeGoalDirection(displayShotDirection)
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {/* Practice-only experiment controls: art style + aim mode */}
                {practiceMode && (
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                    <div className="inline-flex overflow-hidden rounded-lg border border-surface-700 text-xs font-black">
                      {(["16", "32"] as SpriteStyle[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSpriteStyle(s)}
                          className={`px-3 py-1.5 transition-colors ${spriteStyle === s ? "bg-gold-500 text-black" : "bg-surface-900 text-gray-400 hover:text-white"}`}
                        >
                          {s}-bit
                        </button>
                      ))}
                    </div>
                    <div className="inline-flex overflow-hidden rounded-lg border border-surface-700 text-xs font-black">
                      {([["sixzone", "6-Zone"], ["power", "Power"]] as [AimMode, string][]).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setAimMode(m); setPowerSide(null); }}
                          className={`px-3 py-1.5 transition-colors ${aimMode === m ? "bg-gold-500 text-black" : "bg-surface-900 text-gray-400 hover:text-white"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* THE ARENA — generated pixel-art stadium; all actors positioned off GOAL_RECT */}
                {(() => {
                  const shooterTurn = phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both");
                  const diveTurn = phase === "selecting_dive" && (effectiveMode === "goalkeeper" || effectiveMode === "both");
                  const gw = activeRect.right - activeRect.left;
                  const gh = activeRect.bottom - activeRect.top;
                  const isDive = keeper.src === assets.dive;
                  const isJump = keeper.src === assets.jump;
                  const keeperH = isDive ? activeRect.keeperH * 0.66 : isJump ? activeRect.keeperH * 1.12 : activeRect.keeperH;
                  const shakeAnim =
                    phase === "revealed" && currentKick
                      ? currentKick.result === "saved"
                        ? "arena-shake 0.5s ease-in-out"
                        : currentKick.result === "goal"
                          ? "arena-shake 0.35s ease-in-out"
                          : undefined
                      : undefined;
                  return (
                    <div
                      className="relative w-full aspect-video rounded-xl overflow-hidden select-none bg-black"
                      style={{ animation: shakeAnim }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          transform: suddenZoom ? "scale(1.12)" : "scale(1)",
                          transformOrigin: "50% 40%",
                          transition: "transform 700ms ease-out",
                        }}
                      >
                        {/* Stadium background */}
                        <img
                          src={assets.bg}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          style={{ imageRendering: "pixelated" }}
                          draggable={false}
                        />

                        {/* KEEPER sprite (feet on the goal line, bottom-centre anchored) */}
                        <img
                          src={keeper.src}
                          alt="Goalkeeper"
                          className="absolute z-10 pointer-events-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]"
                          style={{
                            top: `${keeper.top}%`,
                            left: `${keeper.left}%`,
                            height: `${keeperH}%`,
                            width: "auto",
                            transform: `translate(-50%, -100%) scaleX(${keeper.flip ? -1 : 1})`,
                            transition: moveTransition,
                            imageRendering: "pixelated",
                          }}
                          draggable={false}
                        />

                        {/* BALL sprite — outer div positions/translates, inner img spins */}
                        <div
                          className="absolute z-20 pointer-events-none"
                          style={{
                            top: ballPosition.top,
                            left: ballPosition.left,
                            width: "6%",
                            transform: "translate(-50%, -50%)",
                            transition: moveTransition,
                          }}
                        >
                          <img
                            src={BALL_SRC}
                            alt="Ball"
                            className="block w-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.55)]"
                            style={{
                              height: "auto",
                              animation: flightPhase ? "pen-ball-spin 0.4s linear infinite" : undefined,
                              imageRendering: "pixelated",
                            }}
                            draggable={false}
                          />
                        </div>

                        {/* 6-ZONE shooter grid */}
                        {shooterTurn && aimMode === "sixzone" && (
                          <div
                            className="absolute z-30 grid grid-cols-3 grid-rows-2 overflow-hidden rounded-md ring-1 ring-white/20"
                            style={{ top: `${activeRect.top}%`, left: `${activeRect.left}%`, width: `${gw}%`, height: `${gh}%` }}
                          >
                            {(["high", "low"] as ShotHeight[]).flatMap((h) =>
                              (["left", "center", "right"] as ShotDirection[]).map((side) => (
                                <button
                                  key={`${h}-${side}`}
                                  type="button"
                                  onClick={() => handleZoneKick(side, h)}
                                  className={`flex items-center justify-center border border-white/15 text-sm font-black text-white/45 transition-colors hover:bg-gold-400/30 hover:text-white active:bg-gold-400/50 ${h === "high" ? "items-start pt-1" : "items-end pb-1"}`}
                                >
                                  {h === "high" ? "▲" : "▼"}
                                </button>
                              ))
                            )}
                          </div>
                        )}

                        {/* POWER shooter: pick a side, then lock the accuracy meter */}
                        {shooterTurn && aimMode === "power" && powerSide === null && (
                          <div
                            className="absolute z-30 grid grid-cols-3 overflow-hidden rounded-md ring-1 ring-white/20"
                            style={{ top: `${activeRect.top}%`, left: `${activeRect.left}%`, width: `${gw}%`, height: `${gh}%` }}
                          >
                            {(["left", "center", "right"] as ShotDirection[]).map((side) => (
                              <button
                                key={side}
                                type="button"
                                onClick={() => startPower(side)}
                                className="flex items-center justify-center border border-white/10 text-xs font-black uppercase text-white/30 transition-colors hover:bg-gold-400/25 hover:text-white/80"
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                        )}
                        {shooterTurn && aimMode === "power" && powerSide !== null && (
                          <button
                            type="button"
                            onClick={lockPower}
                            className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-end pb-[6%]"
                            aria-label="Lock the shot"
                          >
                            <div className="relative h-4 w-[70%] overflow-hidden rounded-full border border-white/40 bg-black/60">
                              {/* sweet spot */}
                              <div className="absolute inset-y-0 left-[42%] w-[16%] bg-green-500/40" />
                              {/* marker */}
                              <div
                                className="absolute inset-y-0 w-1.5 bg-white"
                                style={{ left: `calc(${meter.toFixed(1)}% - 3px)` }}
                              />
                            </div>
                            <span className="mt-2 rounded bg-black/70 px-3 py-1 text-sm font-black uppercase tracking-wide text-gold-400">
                              Tap to shoot
                            </span>
                          </button>
                        )}

                        {/* KEEPER dive zones (user in goal) */}
                        {diveTurn && (
                          <div
                            className="absolute z-30 grid grid-cols-3 overflow-hidden rounded-md ring-1 ring-blue-300/30"
                            style={{ top: `${activeRect.top}%`, left: `${activeRect.left}%`, width: `${gw}%`, height: `${gh}%` }}
                          >
                            {(["left", "center", "right"] as ShotDirection[]).map((side) => (
                              <button
                                key={side}
                                type="button"
                                onClick={() => handleUserDive(side)}
                                className="flex items-center justify-center border border-white/10 text-xs font-black uppercase text-white/30 transition-colors hover:bg-blue-400/30 hover:text-white/80"
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {practiceMode && onStopPractice && (
                  <button
                    type="button"
                    onClick={() => onStopPractice()}
                    className="mt-4 rounded-xl border border-surface-700 bg-surface-950 px-6 py-3 text-sm font-black text-gray-400 transition-colors hover:border-gold-600/40 hover:text-white"
                  >
                    Stop Practice
                  </button>
                )}
              </div>
            )}

            {/* Kick history */}
            <div className="mb-6 space-y-2 max-h-48 overflow-y-auto">
              {kicks.map((kick, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    kick.team === "user" ? "border-gold-600/30 bg-gold-500/5" : "border-surface-700 bg-surface-800"
                  }`}
                >
                  <span className="text-xs text-gray-500">Kick {kick.round}</span>
                  <span className="font-semibold text-white">
                    {kick.playerName}
                  </span>
                  <span
                    className={`font-black ${
                      kick.result === "saved" ? "text-red-400" :
                      kick.result === "missed" ? "text-yellow-400" : "text-green-400"
                    }`}
                  >
                    {kick.result === "saved" ? "SAVED" : kick.result === "missed" ? "MISSED" : "GOAL"}
                  </span>
                </div>
              ))}
            </div>

            {/* Finished state */}
            {isFinished && userWon !== null && (
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
                  onClick={() => onFinished(userWon)}
                  className="rounded-xl bg-gold-500 px-6 py-3 text-sm sm:text-lg font-black text-black transition-colors hover:bg-gold-400"
                >
                  {practiceMode ? "Play Again" : "Continue"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
