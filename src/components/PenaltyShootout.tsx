import { useCallback, useEffect, useMemo, useState } from "react";
import Flag from "../components/Flag";
import type { EightZeroTeam, PenaltyKick } from "../game8/types";

interface InteractivePenaltyKick {
  round: number;
  team: "user" | "opponent";
  playerName: string;
  userDirection?: "left" | "center" | "right";
  userDiveDirection?: "left" | "center" | "right";
  opponentShotDirection?: "left" | "center" | "right";
  keeperDirection: "left" | "center" | "right";
  result: "goal" | "saved" | "missed";
}

type PenaltyMode = "shooter" | "goalkeeper" | "both";

interface PenaltyShootoutProps {
  opponent: EightZeroTeam;
  userGkRating: number;
  oppGkRating: number;
  userShooterRating?: number;
  onFinished: (userWon: boolean) => void;
  practiceMode?: boolean;
  initialKicks?: PenaltyKick[];
  mode?: PenaltyMode;
  onStopPractice?: () => void;
}

function getKeeperSaveChance(keeperRating: number): number {
  return 0.25 + (keeperRating - 60) * 0.005;
}

function getKeeperGuessWeight(keeperRating: number): number {
  return 0.33 + (keeperRating - 60) * 0.004;
}

function getMissChance(shooterRating: number): number {
  return Math.max(0.02, 0.08 - (shooterRating - 60) * 0.002);
}

function randomDirection(weight: number): "left" | "center" | "right" {
  const r = Math.random();
  const leftProb = (1 - weight) / 2;
  const rightProb = (1 - weight) / 2;
  if (r < leftProb) return "left";
  if (r < leftProb + rightProb) return "right";
  return "center";
}

function generateKick(
  round: number,
  team: "user" | "opponent",
  playerName: string,
  shooterRating: number,
  keeperRating: number,
  userDirection?: "left" | "center" | "right",
  userDiveDirection?: "left" | "center" | "right"
): InteractivePenaltyKick {
  if (team === "user" && userDirection) {
    const keeperDirection = randomDirection(getKeeperGuessWeight(keeperRating));
    if (Math.random() < getMissChance(shooterRating)) {
      return { round, team, playerName, userDirection, keeperDirection, result: "missed" };
    }
    if (userDirection === keeperDirection && Math.random() < getKeeperSaveChance(keeperRating)) {
      return { round, team, playerName, userDirection, keeperDirection, result: "saved" };
    }
    return { round, team, playerName, userDirection, keeperDirection, result: "goal" };
  } else {
    const opponentShotDirection = randomDirection(0.33);
    if (Math.random() < getMissChance(shooterRating)) {
      return { round, team, playerName, opponentShotDirection, keeperDirection: opponentShotDirection, result: "missed" };
    }
    if (userDiveDirection) {
      if (userDiveDirection === opponentShotDirection) {
        return { round, team, playerName, userDiveDirection, opponentShotDirection, keeperDirection: userDiveDirection, result: "saved" };
      }
      return { round, team, playerName, userDiveDirection, opponentShotDirection, keeperDirection: userDiveDirection, result: "goal" };
    }
    const keeperDirection = randomDirection(getKeeperGuessWeight(keeperRating));
    if (keeperDirection === opponentShotDirection && Math.random() < getKeeperSaveChance(keeperRating)) {
      return { round, team, playerName, opponentShotDirection, keeperDirection, result: "saved" };
    }
    return { round, team, playerName, opponentShotDirection, keeperDirection, result: "goal" };
  }
}

const ANIMATION_DURATION = 2000; // ms - ball fly + keeper dive
const RESULT_DURATION = 1500; // ms - show result before next kick

export default function PenaltyShootout({
  opponent,
  userGkRating,
  oppGkRating,
  userShooterRating = 80,
  onFinished,
  practiceMode = false,
  initialKicks,
  mode,
  onStopPractice
}: PenaltyShootoutProps) {
  const [kicks, setKicks] = useState<InteractivePenaltyKick[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [phase, setPhase] = useState<"waiting" | "selecting_dive" | "kicking" | "opp_kicking" | "revealed" | "finished">("waiting");
  const [currentKick, setCurrentKick] = useState<InteractivePenaltyKick | null>(null);
  const [userWon, setUserWon] = useState<boolean | null>(null);
  const [selectedMode, setSelectedMode] = useState<PenaltyMode | null>(mode || null);

  const effectiveMode = useMemo(() => {
    if (selectedMode) return selectedMode;
    if (mode) return mode;
    return "both";
  }, [selectedMode, mode]);

  const showModeSelector = practiceMode && !selectedMode && !mode;

  const isUserTurn = useMemo(() => {
    if (effectiveMode === "shooter") return true;
    if (effectiveMode === "goalkeeper") return false;
    return currentRound % 2 === 1;
  }, [effectiveMode, currentRound]);

  const isFinished = phase === "finished";
  const maxRounds = 5;

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

  const checkFinished = useCallback((newUserScore: number, newOppScore: number, round: number, totalKicks: number) => {
    if (round > maxRounds && totalKicks % 2 === 0) {
      if (newUserScore !== newOppScore) {
        setUserWon(newUserScore > newOppScore);
        setPhase("finished");
        return true;
      }
    }
    if (round > maxRounds && totalKicks % 2 === 0) {
      if (newUserScore !== newOppScore) {
        setUserWon(newUserScore > newOppScore);
        setPhase("finished");
        return true;
      }
    }
    return false;
  }, []);

  const handleUserKick = useCallback((direction: "left" | "center" | "right") => {
    if (phase !== "waiting") return;
    if (!isUserTurn) return;
    const kick = generateKick(
      currentRound,
      "user",
      "You",
      userShooterRating,
      oppGkRating,
      direction
    );
    setCurrentKick(kick);
    setPhase("kicking");
    setTimeout(() => {
      setPhase("revealed");
      addKick(kick);
      const newUserScore = kick.result === "goal" ? userScore + 1 : userScore;
      setTimeout(() => {
        if (checkFinished(newUserScore, oppScore, currentRound, kicks.length + 1)) {
          return;
        }
        setCurrentRound(r => r + 1);
        setPhase("waiting");
      }, RESULT_DURATION);
    }, ANIMATION_DURATION);
  }, [phase, isUserTurn, currentRound, userShooterRating, oppGkRating, userScore, oppScore, kicks.length, addKick, checkFinished]);

  const handleUserDive = useCallback((direction: "left" | "center" | "right") => {
    if (phase !== "selecting_dive") return;
    const kick = generateKick(
      currentRound,
      "opponent",
      opponent.name,
      80,
      userGkRating,
      undefined,
      direction
    );
    setCurrentKick(kick);
    setPhase("opp_kicking");
    setTimeout(() => {
      setPhase("revealed");
      addKick(kick);
      const newOppScore = kick.result === "goal" ? oppScore + 1 : oppScore;
      const newUserScore = effectiveMode === "goalkeeper" && kick.result === "saved" ? userScore + 1 : userScore;
      setTimeout(() => {
        if (checkFinished(newUserScore, newOppScore, currentRound, kicks.length + 1)) {
          return;
        }
        setCurrentRound(r => r + 1);
        setPhase("waiting");
      }, RESULT_DURATION);
    }, ANIMATION_DURATION);
  }, [phase, currentRound, opponent.name, userGkRating, userScore, oppScore, kicks.length, addKick, checkFinished, effectiveMode]);

  const handleOpponentKick = useCallback(() => {
    if (phase !== "waiting") return;
    if (!isUserTurn && practiceMode && effectiveMode !== "shooter") {
      setCurrentKick(null);
      setPhase("selecting_dive");
      return;
    }
    const kick = generateKick(
      currentRound,
      "opponent",
      opponent.name,
      80,
      userGkRating
    );
    setCurrentKick(kick);
    setPhase("opp_kicking");
    setTimeout(() => {
      setPhase("revealed");
      addKick(kick);
      const newOppScore = kick.result === "goal" ? oppScore + 1 : oppScore;
      setTimeout(() => {
        if (checkFinished(userScore, newOppScore, currentRound, kicks.length + 1)) {
          return;
        }
        setCurrentRound(r => r + 1);
        setCurrentKick(null);
        setPhase("waiting");
      }, RESULT_DURATION);
    }, ANIMATION_DURATION);
  }, [phase, isUserTurn, practiceMode, effectiveMode, currentRound, opponent.name, userGkRating, userScore, oppScore, kicks.length, addKick, checkFinished]);

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

  useEffect(() => {
    if (initialKicks && initialKicks.length > 0) {
      const converted: InteractivePenaltyKick[] = initialKicks.map((k) => ({
        round: k.round,
        team: k.team,
        playerName: k.scorer,
        keeperDirection: "center",
        result: k.saved ? "saved" : "goal",
        userDiveDirection: k.team === "opponent" ? "center" : undefined,
        opponentShotDirection: k.team === "opponent" ? "center" : undefined,
      }));
      setKicks(converted);
      setUserScore(converted.filter(k => k.team === "user" && k.result === "goal").length);
      setOppScore(converted.filter(k => k.team === "opponent" && k.result === "goal").length);
    }
  }, [initialKicks]);

  // Compute the shot direction being displayed
  const displayShotDirection = useMemo(() => {
    if (!currentKick) return "center" as const;
    if (currentKick.team === "user") return currentKick.userDirection || "center";
    return currentKick.opponentShotDirection || "center";
  }, [currentKick]);

  // Ball position logic
  const ballPosition = useMemo(() => {
    if (!currentKick || phase === "waiting" || phase === "selecting_dive") {
      return { top: "88%", left: "50%" }; // Penalty spot
    }
    const dir = displayShotDirection;
    
    if (currentKick.result === "saved") {
      // Ball meets keeper - keeper's position
      if (currentKick.keeperDirection === "left") return { top: "65%", left: "18%" };
      if (currentKick.keeperDirection === "center") return { top: "65%", left: "50%" };
      return { top: "65%", left: "82%" };
    }
    
    if (currentKick.result === "missed") {
      // Ball goes past the goal
      if (dir === "left") return { top: "45%", left: "-8%" };
      if (dir === "right") return { top: "45%", left: "108%" };
      return { top: "-12%", left: "50%" }; // Over the bar
    }
    
    // GOAL - ball inside the goal
    if (dir === "left") return { top: "32%", left: "22%" };
    if (dir === "center") return { top: "28%", left: "50%" };
    return { top: "32%", left: "78%" };
  }, [currentKick, phase, displayShotDirection]);

  // Keeper position logic
  const keeperPosition = useMemo(() => {
    if (!currentKick || phase === "waiting" || phase === "selecting_dive") {
      return { top: "65%", left: "50%" }; // Centered in front of goal
    }
    if (currentKick.keeperDirection === "left") return { top: "65%", left: "18%" };
    if (currentKick.keeperDirection === "center") return { top: "65%", left: "50%" };
    return { top: "65%", left: "82%" };
  }, [currentKick, phase]);

  // Keeper rotation for dive effect
  const keeperRotation = useMemo(() => {
    if (!currentKick || phase === "waiting" || phase === "selecting_dive") return 0;
    if (currentKick.keeperDirection === "left") return -55;
    if (currentKick.keeperDirection === "center") return 0;
    return 55;
  }, [currentKick, phase]);

  const transitionClass = currentKick && (phase === "kicking" || phase === "opp_kicking")
    ? "transition-all duration-[2000ms] ease-out"
    : "transition-all duration-300";

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
              <h2 className="mt-1 text-xl sm:text-2xl font-black text-white">
                {currentRound > maxRounds ? "Sudden Death" : "Round " + currentRound}
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

            {!isFinished && (
              <div className="mb-6 rounded-xl border border-gold-600/30 bg-surface-800 p-4 sm:p-6 text-center">
                {/* Status text */}
                <div className="mb-4 min-h-[2rem]">
                  {phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both") && (
                    <p className="text-lg font-bold text-white">Click a corner to shoot!</p>
                  )}
                  {phase === "waiting" && !isUserTurn && effectiveMode === "both" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {opponent.name} is preparing to shoot...
                    </p>
                  )}
                  {phase === "waiting" && effectiveMode === "goalkeeper" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {opponent.name} is preparing to shoot...
                    </p>
                  )}
                  {phase === "selecting_dive" && (
                    <p className="text-lg font-bold text-white">Choose where to dive!</p>
                  )}
                  {phase === "kicking" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      You shoot...
                    </p>
                  )}
                  {phase === "opp_kicking" && (
                    <p className="text-lg font-bold text-white" style={{ animation: "pulse-text 1.5s ease-in-out infinite" }}>
                      {opponent.name} shoots...
                    </p>
                  )}
                  {phase === "revealed" && currentKick && (
                    <div style={{ animation: "result-pop 0.6s ease-out" }}>
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
                        ) : currentKick.result === "missed" ?
                          "Wide of the goal!" :
                          "Top corner!"}
                      </p>
                    </div>
                  )}
                </div>

                {/* THE GOAL */}
                <div
                  className="relative w-full h-80 sm:h-96 bg-green-900 rounded-xl overflow-hidden"
                  style={{
                    animation: currentKick?.result === "saved" && phase === "revealed" ? "goal-shake 0.5s ease-in-out" : undefined,
                  }}
                >
                  {/* Grass texture */}
                  <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
                  }} />
                  
                  {/* Pitch markings */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[30%] border-2 border-white/20 rounded-t-full" />

                  {/* GOAL FRAME - much bigger */}
                  <div className="absolute top-[5%] left-[5%] right-[5%] h-[55%]">
                    {/* Goal posts and crossbar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-white" />
                    <div className="absolute top-0 left-0 w-1 h-full bg-white" />
                    <div className="absolute top-0 right-0 w-1 h-full bg-white" />
                    
                    {/* Net */}
                    <div className="absolute inset-[2px] opacity-40" style={{
                      background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 10px), repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 10px)"
                    }} />
                    
                    {/* Net depth lines */}
                    <div className="absolute top-[20%] left-[20%] right-[20%] h-[60%] border border-white/20" />
                    <div className="absolute top-[40%] left-[40%] right-[40%] h-[20%] border border-white/20" />
                  </div>

                  {/* CLICKABLE ZONES - User shooter */}
                  {phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both") && (
                    <>
                      <div
                        className="absolute top-[5%] left-[5%] w-[30%] h-[55%] cursor-pointer hover:bg-white/10 active:bg-white/20 rounded-l-lg"
                        onClick={() => handleUserKick("left")}
                        title="Shoot left"
                      />
                      <div
                        className="absolute top-[5%] left-[35%] w-[30%] h-[55%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserKick("center")}
                        title="Shoot center"
                      />
                      <div
                        className="absolute top-[5%] left-[65%] w-[30%] h-[55%] cursor-pointer hover:bg-white/10 active:bg-white/20 rounded-r-lg"
                        onClick={() => handleUserKick("right")}
                        title="Shoot right"
                      />
                    </>
                  )}

                  {/* CLICKABLE ZONES - User goalkeeper */}
                  {phase === "selecting_dive" && (effectiveMode === "goalkeeper" || effectiveMode === "both") && (
                    <>
                      <div
                        className="absolute top-[5%] left-[5%] w-[30%] h-[55%] cursor-pointer hover:bg-blue-500/20 active:bg-blue-500/30 rounded-l-lg"
                        onClick={() => handleUserDive("left")}
                        title="Dive left"
                      />
                      <div
                        className="absolute top-[5%] left-[35%] w-[30%] h-[55%] cursor-pointer hover:bg-blue-500/20 active:bg-blue-500/30"
                        onClick={() => handleUserDive("center")}
                        title="Dive center"
                      />
                      <div
                        className="absolute top-[5%] left-[65%] w-[30%] h-[55%] cursor-pointer hover:bg-blue-500/20 active:bg-blue-500/30 rounded-r-lg"
                        onClick={() => handleUserDive("right")}
                        title="Dive right"
                      />
                    </>
                  )}

                  {/* Zone labels (only visible on hover) */}
                  {phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both") && (
                    <div className="absolute top-[5%] left-[5%] right-[5%] h-[55%] flex pointer-events-none">
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-white/20 text-sm font-bold">LEFT</span>
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-white/20 text-sm font-bold">CENTER</span>
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-white/20 text-sm font-bold">RIGHT</span>
                      </div>
                    </div>
                  )}

                  {/* KEEPER SVG */}
                  <div
                    className={`absolute z-10 ${transitionClass}`}
                    style={{
                      top: keeperPosition.top,
                      left: keeperPosition.left,
                      transform: `translate(-50%, -50%) rotate(${keeperRotation}deg)`,
                      width: "60px",
                      height: "60px",
                    }}
                  >
                    <svg viewBox="0 0 60 60" width="100%" height="100%" className="drop-shadow-lg">
                      {/* Body */}
                      <ellipse cx="30" cy="32" rx="12" ry="14" fill="#2563eb" opacity="0.95" />
                      {/* Head */}
                      <circle cx="30" cy="14" r="9" fill="#2563eb" opacity="0.95" />
                      {/* Left arm (outstretched) */}
                      <rect x="2" y="26" width="22" height="7" fill="#2563eb" rx="3" opacity="0.95" />
                      {/* Right arm (outstretched) */}
                      <rect x="36" y="26" width="22" height="7" fill="#2563eb" rx="3" opacity="0.95" />
                      {/* Left leg */}
                      <rect x="20" y="44" width="7" height="14" fill="#2563eb" rx="2" opacity="0.95" />
                      {/* Right leg */}
                      <rect x="33" y="44" width="7" height="14" fill="#2563eb" rx="2" opacity="0.95" />
                      {/* Gloves */}
                      <circle cx="6" cy="29" r="5" fill="#fbbf24" opacity="0.9" />
                      <circle cx="54" cy="29" r="5" fill="#fbbf24" opacity="0.9" />
                    </svg>
                  </div>

                  {/* BALL */}
                  <div
                    className={`absolute z-20 ${transitionClass}`}
                    style={{
                      top: ballPosition.top,
                      left: ballPosition.left,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div className="text-5xl filter drop-shadow-lg">⚽</div>
                  </div>

                  {/* Save effect overlay */}
                  {phase === "revealed" && currentKick?.result === "saved" && (
                    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                      <div className="text-6xl animate-bounce" style={{ animation: "result-pop 0.5s ease-out" }}>
                        🧤
                      </div>
                    </div>
                  )}
                </div>

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
                    {kick.team === "user" ? "You" : opponent.name}
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
