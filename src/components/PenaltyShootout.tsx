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
    // Opponent shoots
    const opponentShotDirection = randomDirection(0.33);
    if (Math.random() < getMissChance(shooterRating)) {
      return { round, team, playerName, opponentShotDirection, keeperDirection: opponentShotDirection, result: "missed" };
    }
    if (userDiveDirection) {
      // User is goalkeeper
      if (userDiveDirection === opponentShotDirection) {
        return { round, team, playerName, userDiveDirection, opponentShotDirection, keeperDirection: userDiveDirection, result: "saved" };
      }
      return { round, team, playerName, userDiveDirection, opponentShotDirection, keeperDirection: userDiveDirection, result: "goal" };
    }
    // Auto goalkeeper (AI keeper)
    const keeperDirection = randomDirection(getKeeperGuessWeight(keeperRating));
    if (keeperDirection === opponentShotDirection && Math.random() < getKeeperSaveChance(keeperRating)) {
      return { round, team, playerName, opponentShotDirection, keeperDirection, result: "saved" };
    }
    return { round, team, playerName, opponentShotDirection, keeperDirection, result: "goal" };
  }
}

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
      // In goalkeeper mode, user saves count as points
      if (kick.team === "opponent" && kick.result === "saved") {
        setUserScore(s => s + 1);
      } else if (kick.team === "opponent" && kick.result === "goal") {
        setOppScore(s => s + 1);
      }
    } else {
      // Shooter mode and both mode
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
        setCurrentKick(null);
        setPhase("waiting");
      }, 1500);
    }, 1200);
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
        setCurrentKick(null);
        setPhase("waiting");
      }, 1500);
    }, 1200);
  }, [phase, currentRound, opponent.name, userGkRating, userScore, oppScore, kicks.length, addKick, checkFinished, effectiveMode]);

  const handleOpponentKick = useCallback(() => {
    if (phase !== "waiting") return;
    if (!isUserTurn && practiceMode && effectiveMode !== "shooter") {
      // Practice mode with user as goalkeeper
      setCurrentKick(null);
      setPhase("selecting_dive");
      return;
    }
    // Auto opponent kick (shooter practice or real tournament)
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
      }, 1500);
    }, 1200);
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

  const displayShotDirection = useMemo(() => {
    if (!currentKick) return "center" as const;
    if (currentKick.team === "user") return currentKick.userDirection || "center";
    return currentKick.opponentShotDirection || "center";
  }, [currentKick]);

  const ballPosition = useMemo(() => {
    if (!currentKick || phase === "waiting") return { top: "85%", left: "50%" };
    const dir = displayShotDirection;
    if (currentKick.result === "saved") {
      // Ball stops at keeper's position
      if (currentKick.keeperDirection === "left") return { top: "65%", left: "18%" };
      if (currentKick.keeperDirection === "center") return { top: "65%", left: "50%" };
      return { top: "65%", left: "82%" };
    }
    if (currentKick.result === "missed") {
      if (dir === "left") return { top: "65%", left: "-5%" };
      if (dir === "right") return { top: "65%", left: "105%" };
      return { top: "-5%", left: "50%" };
    }
    if (dir === "left") return { top: "30%", left: "18%" };
    if (dir === "center") return { top: "30%", left: "50%" };
    return { top: "30%", left: "82%" };
  }, [currentKick, phase, displayShotDirection]);

  const keeperPosition = useMemo(() => {
    if (!currentKick || phase === "waiting") return { top: "65%", left: "50%" };
    if (currentKick.keeperDirection === "left") return { top: "65%", left: "18%" };
    if (currentKick.keeperDirection === "center") return { top: "65%", left: "50%" };
    return { top: "65%", left: "82%" };
  }, [currentKick, phase]);

  const keeperRotation = useMemo(() => {
    if (!currentKick || phase === "waiting") return 0;
    if (currentKick.keeperDirection === "left") return -60;
    if (currentKick.keeperDirection === "center") return 0;
    return 60;
  }, [currentKick, phase]);

  const isGoalAnimating = currentKick && (phase === "kicking" || phase === "opp_kicking" || phase === "revealed");
  const transitionClass = isGoalAnimating ? "transition-all duration-[1200ms] ease-out" : "";

  return (
    <>
      <style>{`
        @keyframes ball-fly {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.8); }
        }
        @keyframes keeper-dive {
          0% { transform: translateX(0); }
          100% { transform: translateX(var(--dive-x)); }
        }
        @keyframes goal-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
        @keyframes result-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
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
              <div className="mb-6 rounded-lg border border-gold-600/50 bg-surface-800 p-6 text-center">
                <div className="mb-3 min-h-[1.75rem]">
                  {phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both") && (
                    <p className="text-lg font-bold text-white">Click a corner to shoot!</p>
                  )}
                  {phase === "waiting" && !isUserTurn && effectiveMode === "both" && (
                    <p className="text-lg font-bold text-white animate-pulse">
                      {opponent.name} is preparing to shoot...
                    </p>
                  )}
                  {phase === "waiting" && effectiveMode === "goalkeeper" && (
                    <p className="text-lg font-bold text-white animate-pulse">
                      {opponent.name} is preparing to shoot...
                    </p>
                  )}
                  {phase === "selecting_dive" && (
                    <p className="text-lg font-bold text-white">Choose where to dive!</p>
                  )}
                  {phase === "kicking" && (
                    <p className="text-lg font-bold text-white animate-pulse">You shoot...</p>
                  )}
                  {phase === "opp_kicking" && (
                    <p className="text-lg font-bold text-white animate-pulse">
                      {opponent.name} shoots...
                    </p>
                  )}
                  {phase === "revealed" && currentKick && (
                    <div style={{ animation: "result-pop 0.5s ease-out" }}>
                      <p className={`text-2xl font-black ${
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

                <div
                  className="relative w-full aspect-[4/3] bg-green-800 rounded-lg overflow-hidden"
                  style={{
                    animation: currentKick?.result === "saved" && phase === "revealed" ? "goal-shake 0.4s ease-in-out" : undefined,
                  }}
                >
                  <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: "radial-gradient(circle at 25% 50%, rgba(255,255,255,0.3) 1px, transparent 1px), radial-gradient(circle at 75% 50%, rgba(255,255,255,0.3) 1px, transparent 1px)",
                    backgroundSize: "20px 20px"
                  }} />

                  <div className="absolute top-[10%] left-[10%] right-[10%] h-[60%] border-4 border-white rounded-t-lg border-b-0">
                    <div className="absolute inset-0 opacity-30" style={{
                      background: "repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 12px), repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 12px)"
                    }} />
                  </div>

                  {phase === "waiting" && isUserTurn && (effectiveMode === "shooter" || effectiveMode === "both") && (
                    <>
                      <div
                        className="absolute top-[10%] left-[10%] w-[26.67%] h-[60%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserKick("left")}
                      />
                      <div
                        className="absolute top-[10%] left-[36.67%] w-[26.67%] h-[60%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserKick("center")}
                      />
                      <div
                        className="absolute top-[10%] left-[63.33%] w-[26.67%] h-[60%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserKick("right")}
                      />
                    </>
                  )}

                  {phase === "selecting_dive" && (effectiveMode === "goalkeeper" || effectiveMode === "both") && (
                    <>
                      <div
                        className="absolute top-[10%] left-[10%] w-[26.67%] h-[60%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserDive("left")}
                      />
                      <div
                        className="absolute top-[10%] left-[36.67%] w-[26.67%] h-[60%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserDive("center")}
                      />
                      <div
                        className="absolute top-[10%] left-[63.33%] w-[26.67%] h-[60%] cursor-pointer hover:bg-white/10 active:bg-white/20"
                        onClick={() => handleUserDive("right")}
                      />
                    </>
                  )}

                  <div
                    className={`absolute w-[12%] aspect-square ${transitionClass}`}
                    style={{
                      top: keeperPosition.top,
                      left: keeperPosition.left,
                      transform: `translate(-50%, -50%) rotate(${keeperRotation}deg)`,
                    }}
                  >
                    <svg viewBox="0 0 40 40" width="100%" height="100%" className="drop-shadow-md">
                      <circle cx="20" cy="20" r="14" fill="#3b82f6" opacity="0.9" />
                      <rect x="2" y="16" width="10" height="8" fill="#3b82f6" rx="3" opacity="0.9" />
                      <rect x="28" y="16" width="10" height="8" fill="#3b82f6" rx="3" opacity="0.9" />
                      <rect x="14" y="30" width="12" height="6" fill="#3b82f6" rx="2" opacity="0.9" />
                    </svg>
                  </div>

                  <div
                    className={`absolute text-4xl ${transitionClass}`}
                    style={{
                      top: ballPosition.top,
                      left: ballPosition.left,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    ⚽
                  </div>
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
