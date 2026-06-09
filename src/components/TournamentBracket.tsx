import Flag from "../components/Flag";
import type { TournamentRun } from "../game8/types";

interface TournamentBracketProps {
  run: TournamentRun;
  currentMatchIndex: number;
  tournamentPhase: "idle" | "ready" | "live" | "penalties" | "complete";
}

export default function TournamentBracket({ run, currentMatchIndex, tournamentPhase }: TournamentBracketProps) {
  const groupMatches = run.matches.slice(0, 3);
  const knockoutMatches = run.matches.slice(3);

  const visibleGroupMatches = groupMatches.filter((_match, index) =>
    tournamentPhase === "complete" || index <= currentMatchIndex
  );
  const visibleKnockoutMatches = knockoutMatches.filter((_match, index) => {
    const matchIndex = index + 3;
    return tournamentPhase === "complete" || matchIndex <= currentMatchIndex;
  });

  return (
    <div className="stat-card">
      <div className="mb-4">
        <p className="section-label">Tournament Progress</p>
      </div>

      {/* Group Stage */}
      {visibleGroupMatches.length > 0 && (
        <div className="mb-4">
          <p className="section-label mb-2">Group Stage</p>
          <div className="space-y-1.5">
            {visibleGroupMatches.map((match, index) => {
              const originalIndex = groupMatches.indexOf(match);
              const isCurrent = tournamentPhase !== "complete" && originalIndex === currentMatchIndex;
              const isPast = tournamentPhase === "complete" || originalIndex < currentMatchIndex;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                    isCurrent
                      ? "border-gold-600 bg-gold-500/10"
                      : "border-surface-700 bg-surface-800"
                  }`}
                >
                  <span className="font-semibold text-gray-400">Match {originalIndex + 1}</span>
                  <div className="flex items-center gap-2">
                    <Flag fifaCode={match.opponent.fifaCode} size={16} />
                    <span className="font-bold text-white">{match.opponent.name}</span>
                  </div>
                  {isPast ? (
                    <>
                      <span className="font-black tabular-nums text-gold-400">
                        {match.userGoals}-{match.opponentGoals}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          match.result === "W"
                            ? "bg-green-500/20 text-green-400"
                            : match.result === "L"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-500/20 text-gray-300"
                        }`}
                      >
                        {match.result}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-600">vs</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Knockout Stage */}
      {visibleKnockoutMatches.length > 0 && (
        <div>
          <p className="section-label mb-2">Knockout</p>
          <div className="space-y-1.5">
            {visibleKnockoutMatches.map((match, index) => {
              const originalIndex = knockoutMatches.indexOf(match);
              const matchIndex = originalIndex + 3;
              const isCurrent = tournamentPhase !== "complete" && matchIndex === currentMatchIndex;
              const isPast = tournamentPhase === "complete" || matchIndex < currentMatchIndex;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                    isCurrent
                      ? "border-gold-600 bg-gold-500/10"
                      : "border-surface-700 bg-surface-800"
                  }`}
                >
                  <span className="font-semibold text-gray-400">{match.stage}</span>
                  <div className="flex items-center gap-2">
                    <Flag fifaCode={match.opponent.fifaCode} size={16} />
                    <span className="font-bold text-white">{match.opponent.name}</span>
                  </div>
                  {isPast ? (
                    <>
                      <span className="font-black tabular-nums text-gold-400">
                        {match.userGoals}-{match.opponentGoals}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          match.result === "W"
                            ? "bg-green-500/20 text-green-400"
                            : match.result === "L"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-500/20 text-gray-300"
                        }`}
                      >
                        {match.result}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-600">vs</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
