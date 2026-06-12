import { useCallback, useEffect, useState } from "react";
import Flag from "../components/Flag";
import type { EightZeroTeam, PenaltyKick } from "../game8/types";

interface InteractivePenaltyKick {
  round: number;
  team: "user" | "opponent";
  playerName: string;
  userDirection?: "left" | "center" | "right";
  keeperDirection: "left" | "center" | "right";
  result: "goal" | "saved" | "missed";
}

interface PenaltyShootoutProps {
  opponent: EightZeroTeam;
  userGkRating: number;
  oppGkRating: number;
  userShooterRating?: number;
  onFinished: (userWon: boolean) => void;
  practiceMode?: boolean;
  initialKicks?: PenaltyKick[];
}

function getKeeperSaveChance(keeperRating: number): number {
  // Higher rating = better chance to save
  return 0.25 + (keeperRating - 60) * 0.005;
}

function getKeeperGuessWeight(keeperRating: number): number {
  // Higher rating = better chance to guess right direction
  return 0.33 + (keeperRating - 60) * 0.004;
}

function getMissChance(shooterRating: number): number {
  // Lower rating = slightly more likely to miss
  return Math.max(0.02, 0.08 - (shooterRating - 60) * 0.002);
}

function randomDirection(weight: number): "left" | "center" | "right" {
  const r = Math.random();
  // Weighted: higher weight means more likely to guess "center"
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
  userDirection?: "left" | "center" | "right"
): InteractivePenaltyKick {
  const keeperDirection = randomDirection(getKeeperGuessWeight(keeperRating));
  
  if (team === "user" && userDirection) {
    // User kick - check if missed
    if (Math.random() < getMissChance(shooterRating)) {
      return { round, team, playerName, userDirection, keeperDirection, result: "missed" };
    }
    // Check if saved
    if (userDirection === keeperDirection && Math.random() < getKeeperSaveChance(keeperRating)) {
      return { round, team, playerName, userDirection, keeperDirection, result: "saved" };
    }
    return { round, team, playerName, userDirection, keeperDirection, result: "goal" };
  } else {
    // Opponent kick - auto sim
    if (Math.random() < getMissChance(shooterRating)) {
      return { round, team, playerName, keeperDirection, result: "missed" };
    }
    if (Math.random() < getKeeperSaveChance(keeperRating)) {
      return { round, team, playerName, keeperDirection, result: "saved" };
    }
    return { round, team, playerName, keeperDirection, result: "goal" };
  }
}

export default function PenaltyShootout({ 
  opponent, 
  userGkRating, 
  oppGkRating, 
  userShooterRating = 80,
  onFinished, 
  practiceMode = false,
  initialKicks 
}: PenaltyShootoutProps) {
  const [kicks, setKicks] = useState<InteractivePenaltyKick[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [phase, setPhase] = useState<"waiting" | "kicking" | "opp_kicking" | "revealed" | "finished">("waiting");
  const [currentKick, setCurrentKick] = useState<InteractivePenaltyKick | null>(null);
  const [userWon, setUserWon] = useState<boolean | null>(null);

  const isUserTurn = currentRound % 2 === 1;
  const isFinished = phase === "finished";
  const maxRounds = 5;

  const addKick = useCallback((kick: InteractivePenaltyKick) => {
    setKicks(prev => [...prev, kick]);
    if (kick.team === "user" && kick.result === "goal") {
      setUserScore(s => s + 1);
    } else if (kick.team === "opponent" && kick.result === "goal") {
      setOppScore(s => s + 1);
    }
  }, []);

  const checkFinished = useCallback((newUserScore: number, newOppScore: number, round: number, totalKicks: number) => {
    // Check if someone has won after 5 rounds
    if (round > maxRounds && totalKicks % 2 === 0) {
      if (newUserScore !== newOppScore) {
        setUserWon(newUserScore > newOppScore);
        setPhase("finished");
        return true;
      }
    }
    // Check sudden death
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
      }, 1500);
    }, 1500);
  }, [phase, currentRound, userShooterRating, oppGkRating, userScore, oppScore, kicks.length, addKick, checkFinished]);

  const handleOpponentKick = useCallback(() => {
    if (phase !== "waiting") return;
    
    const kick = generateKick(
      currentRound,
      "opponent",
      opponent.name,
      80, // opponent shooter rating
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
        setPhase("waiting");
      }, 1500);
    }, 1500);
  }, [phase, currentRound, opponent.name, userGkRating, userScore, oppScore, kicks.length, addKick, checkFinished]);

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
      // Convert initial kicks to interactive format
      const converted: InteractivePenaltyKick[] = initialKicks.map((k) => ({
        round: k.round,
        team: k.team,
        playerName: k.scorer,
        keeperDirection: "center",
        result: k.saved ? "saved" : "goal"
      }));
      setKicks(converted);
      setUserScore(converted.filter(k => k.team === "user" && k.result === "goal").length);
      setOppScore(converted.filter(k => k.team === "opponent" && k.result === "goal").length);
    }
  }, [initialKicks]);

  return (
    <div className="stat-card animate-fade-up">
      <div className="text-center mb-4">
        <p className="section-label">Penalty Shootout</p>
        <h2 className="mt-1 text-xl sm:text-2xl font-black text-white">
          {currentRound > maxRounds ? "Sudden Death" : "Round " + currentRound}
        </h2>
      </div>

      {/* Scoreboard */}
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

      {/* Current action */}
      {currentKick && (phase === "kicking" || phase === "opp_kicking" || phase === "revealed") && (
        <div className="mb-6 rounded-lg border border-gold-600/50 bg-surface-800 p-6 text-center">
          {/* Goal */}
          <div className="relative h-32 bg-green-700 rounded-lg mb-4 overflow-hidden">
            {/* Goal net */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-24 border-4 border-white rounded-lg relative">
                {/* Net pattern */}
                <div className="absolute inset-0 opacity-30" style={{
                  background: 'repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 8px), repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 8px)'
                }} />
              </div>
            </div>
            
            {/* Keeper */}
            <div className={`absolute bottom-0 transition-all duration-500 ${
              currentKick.keeperDirection === "left" ? "left-4" : 
              currentKick.keeperDirection === "right" ? "right-4" : "left-1/2 -translate-x-1/2"
            }`}>
              <div className="text-4xl">
                🧤
              </div>
            </div>
            
            {/* Ball */}
            <div className={`absolute top-8 transition-all duration-700 ${
              currentKick.result === "saved" ? (
                currentKick.keeperDirection === "left" ? "left-4" : 
                currentKick.keeperDirection === "right" ? "right-4" : "left-1/2 -translate-x-1/2"
              ) : currentKick.result === "missed" ? (
                currentKick.userDirection === "left" ? "-left-4" : 
                currentKick.userDirection === "right" ? "-right-4" : "top-0"
              ) : (
                currentKick.userDirection === "left" ? "left-8" : 
                currentKick.userDirection === "right" ? "right-8" : "left-1/2 -translate-x-1/2"
              )
            }`}>
              <div className="text-2xl">⚽</div>
            </div>
          </div>
          
          {phase === "kicking" && (
            <p className="text-lg font-bold text-white animate-pulse">
              You shoot...
            </p>
          )}
          {phase === "opp_kicking" && (
            <p className="text-lg font-bold text-white animate-pulse">
              {opponent.name} shoots...
            </p>
          )}
          {phase === "revealed" && (
            <div className="animate-goal-pop">
              <p className={`text-2xl font-black ${
                currentKick.result === "goal" ? "text-green-400" : 
                currentKick.result === "saved" ? "text-red-400" : "text-yellow-400"
              }`}>
                {currentKick.result === "goal" ? "GOAL!" : 
                 currentKick.result === "saved" ? "SAVED!" : "MISSED!"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {currentKick.result === "saved" ? 
                  `Keeper dived ${currentKick.keeperDirection}!` : 
                  currentKick.result === "missed" ? 
                  "Wide of the goal!" : 
                  "Top corner!"}
              </p>
            </div>
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

      {/* User controls */}
      {isUserTurn && !isFinished && phase === "waiting" && (
        <div className="mb-6">
          <p className="text-center text-lg font-bold text-white mb-4">
            Where do you shoot?
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => handleUserKick("left")}
              className="flex-1 rounded-xl bg-surface-800 border border-surface-700 px-6 py-4 text-lg font-black text-white hover:bg-surface-700 hover:border-gold-600 transition-colors"
            >
              ← Left
            </button>
            <button
              onClick={() => handleUserKick("center")}
              className="flex-1 rounded-xl bg-surface-800 border border-surface-700 px-6 py-4 text-lg font-black text-white hover:bg-surface-700 hover:border-gold-600 transition-colors"
            >
              Center
            </button>
            <button
              onClick={() => handleUserKick("right")}
              className="flex-1 rounded-xl bg-surface-800 border border-surface-700 px-6 py-4 text-lg font-black text-white hover:bg-surface-700 hover:border-gold-600 transition-colors"
            >
              Right →
            </button>
          </div>
        </div>
      )}

      {/* Waiting for opponent */}
      {!isUserTurn && !isFinished && phase === "waiting" && (
        <div className="mb-6 text-center">
          <p className="text-lg font-bold text-white animate-pulse">
            {opponent.name} is taking their penalty...
          </p>
        </div>
      )}

      {/* Finished */}
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
    </div>
  );
}
