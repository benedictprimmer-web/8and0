/// <reference types="node" />
/**
 * Probability harness for the 8-0 tournament model.
 *
 * This is a measurement tool, NOT part of the test suite — the heavy test below
 * is skipped unless PROBE=1, so a normal `npm test` ignores it. Run it with:
 *
 *     npm run probe                       # defaults: ratings 75-90, 4000 runs
 *     PROBE_N=8000 npm run probe          # more runs = tighter numbers
 *     PROBE_MIN=80 PROBE_MAX=92 npm run probe
 *
 * It simulates many seeded runs per rating against the real 48-team pool and
 * prints six tables (and writes them to probe_report.md): stage-reach odds,
 * per-stage win rates, group qualifier records, extra-time/penalty rates, goal
 * averages, and opponent strength by round. Edit the knobs in simulate.ts
 * (ELITE_EDGE, STAGE_EXPONENT, GROUP_QUALIFY_POINTS, the lambda lines, etc.),
 * re-run this, and watch the numbers move.
 */
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import teamsRaw from "../../public/data/teams.json";
import { simulateTournamentRun } from "./simulate";
import type { DraftPick, EightZeroTeam, MatchResult, TeamRatings } from "./types";

const ENABLED = process.env.PROBE === "1";
const N = Number(process.env.PROBE_N ?? 4000);
const MIN = Number(process.env.PROBE_MIN ?? 75);
const MAX = Number(process.env.PROBE_MAX ?? 90);

const teams: EightZeroTeam[] = (teamsRaw as Array<Record<string, unknown>>)
  .filter((t) => t.qualified_2026 && typeof t.elo === "number")
  .map((t) => ({
    teamId: t.team_id as number,
    name: t.name as string,
    fifaCode: t.fifa_code as string,
    group: (t.wc2026_group as string) ?? null,
    ranking: (t.fifa_ranking as number) ?? null,
    elo: t.elo as number,
  }));

const elos = teams.map((t) => t.elo);
const eMin = Math.min(...elos);
const eMax = Math.max(...elos);
// Mirror of normalizeOpponentStrength in simulate.ts, for the read-out only.
const strengthOf = (t: EightZeroTeam) => 64 + ((t.elo - eMin) / Math.max(1, eMax - eMin)) * 29;

// A flat squad whose every line equals `overall`, so a single rating fully
// characterises the team — keeps the sweep one-dimensional and readable.
const ratingsFor = (overall: number): TeamRatings => ({ overall, gk: overall, defence: overall, midfield: overall, attack: overall });
const NO_PICKS: DraftPick[] = []; // empty: only affects the (irrelevant here) exclude set + event flavour

const KO = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];
// stageReached values, worst -> best, for "reached at least stage X".
const REACH = ["Group stage", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final", "Champion"];
const RATINGS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);

const pct = (n: number, d: number) => (d === 0 ? "  -  " : `${((n / d) * 100).toFixed(1)}%`);
const f2 = (n: number, d: number) => (d === 0 ? "-" : (n / d).toFixed(2));

interface Row {
  o: number;
  reach: Record<string, number>;
  champ: number;
  qual: number;
  rec: Record<string, number>;
  gGF: number; gGA: number; gN: number;
  koPlayed: Record<string, number>;
  koWon: Record<string, number>;
  koET: Record<string, number>;
  koPens: Record<string, number>;
  koPenWin: Record<string, number>;
  koGF: number; koGA: number; koN: number;
  oppStr: Record<string, { s: number; n: number }>;
}

function measure(overall: number): Row {
  const ratings = ratingsFor(overall);
  const r: Row = { o: overall, reach: {}, champ: 0, qual: 0, rec: {}, gGF: 0, gGA: 0, gN: 0, koPlayed: {}, koWon: {}, koET: {}, koPens: {}, koPenWin: {}, koGF: 0, koGA: 0, koN: 0, oppStr: {} };
  for (let i = 0; i < N; i += 1) {
    const run = simulateTournamentRun({ teams, picks: NO_PICKS, ratings, seed: `probe-${overall}-${i}`, formationId: "433" });
    const reachedIdx = REACH.indexOf(run.stageReached);
    for (let k = 0; k <= reachedIdx; k += 1) r.reach[REACH[k]] = (r.reach[REACH[k]] ?? 0) + 1;
    if (run.stageReached === "Champion") r.champ += 1;

    const group = run.matches.slice(0, 3);
    for (const m of group) { r.gGF += m.regularTimeUserGoals; r.gGA += m.regularTimeOpponentGoals; r.gN += 1; }
    if (run.stageReached !== "Group stage") {
      r.qual += 1;
      const w = group.filter((m) => m.result === "W").length;
      const d = group.filter((m) => m.result === "D").length;
      const l = group.filter((m) => m.result === "L").length;
      r.rec[`${w}W-${d}D-${l}L`] = (r.rec[`${w}W-${d}D-${l}L`] ?? 0) + 1;
    }
    for (const m of run.matches.slice(3) as MatchResult[]) {
      const s = m.stage;
      r.koPlayed[s] = (r.koPlayed[s] ?? 0) + 1;
      if (m.result === "W") r.koWon[s] = (r.koWon[s] ?? 0) + 1;
      if (m.extraTime) r.koET[s] = (r.koET[s] ?? 0) + 1;
      if (m.decidedByPens) {
        r.koPens[s] = (r.koPens[s] ?? 0) + 1;
        if (m.result === "W") r.koPenWin[s] = (r.koPenWin[s] ?? 0) + 1;
      }
      r.koGF += m.regularTimeUserGoals; r.koGA += m.regularTimeOpponentGoals; r.koN += 1;
      r.oppStr[s] = r.oppStr[s] ?? { s: 0, n: 0 };
      r.oppStr[s].s += strengthOf(m.opponent); r.oppStr[s].n += 1;
    }
  }
  return r;
}

function report(rows: Row[]): string {
  const L: string[] = [];
  L.push(`# 8-0 model probabilities — N=${N} runs per rating, real ${teams.length}-team pool (elo ${eMin}–${eMax})\n`);

  L.push(`## 1. Tournament progression — P(reach at least this stage)\n`);
  L.push(`| Rating | Qualify | R16 | Quarter | Semi | Final | 🏆 Champion |`);
  L.push(`|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    L.push(`| ${r.o} | ${pct(r.reach["Round of 32"] ?? 0, N)} | ${pct(r.reach["Round of 16"] ?? 0, N)} | ${pct(r.reach["Quarter-final"] ?? 0, N)} | ${pct(r.reach["Semi-final"] ?? 0, N)} | ${pct(r.reach["Final"] ?? 0, N)} | ${pct(r.champ, N)} |`);
  }

  L.push(`\n## 2. Per-stage win rate — P(win | you played that stage)\n`);
  L.push(`| Rating | R32 | R16 | Quarter | Semi | Final |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const r of rows) L.push(`| ${r.o} | ${KO.map((s) => pct(r.koWon[s] ?? 0, r.koPlayed[s] ?? 0)).join(" | ")} |`);

  L.push(`\n## 3. Group qualifier record distribution (share of qualifiers)\n`);
  const recCols = ["3W-0D-0L", "2W-1D-0L", "2W-0D-1L", "1W-2D-0L", "1W-1D-1L"];
  L.push(`| Rating | Qualify% | 3W | 2W-1D | 2W-1L | 1W-2D | 1W-1D-1L |`);
  L.push(`|---|---|---|---|---|---|---|`);
  for (const r of rows) L.push(`| ${r.o} | ${pct(r.qual, N)} | ${recCols.map((c) => pct(r.rec[c] ?? 0, r.qual)).join(" | ")} |`);

  L.push(`\n## 4. Extra time & penalty shootouts (knockout matches)\n`);
  L.push(`| Rating | KO→ET | KO→Pens | Shootout win% | Final ET% | Final pens% |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const r of rows) {
    const etTot = KO.reduce((a, s) => a + (r.koET[s] ?? 0), 0);
    const penTot = KO.reduce((a, s) => a + (r.koPens[s] ?? 0), 0);
    const penWinTot = KO.reduce((a, s) => a + (r.koPenWin[s] ?? 0), 0);
    const koTot = KO.reduce((a, s) => a + (r.koPlayed[s] ?? 0), 0);
    L.push(`| ${r.o} | ${pct(etTot, koTot)} | ${pct(penTot, koTot)} | ${pct(penWinTot, penTot)} | ${pct(r.koET["Final"] ?? 0, r.koPlayed["Final"] ?? 0)} | ${pct(r.koPens["Final"] ?? 0, r.koPlayed["Final"] ?? 0)} |`);
  }

  L.push(`\n## 5. Average goals per match (regulation, user–opp)\n`);
  L.push(`| Rating | Group GF | Group GA | KO GF | KO GA |`);
  L.push(`|---|---|---|---|---|`);
  for (const r of rows) L.push(`| ${r.o} | ${f2(r.gGF, r.gN)} | ${f2(r.gGA, r.gN)} | ${f2(r.koGF, r.koN)} | ${f2(r.koGA, r.koN)} |`);

  L.push(`\n## 6. Average opponent strength faced by round (64–93 scale)\n`);
  L.push(`| Rating | R32 | R16 | Quarter | Semi | Final |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const r of rows) L.push(`| ${r.o} | ${KO.map((s) => (r.oppStr[s] ? (r.oppStr[s].s / r.oppStr[s].n).toFixed(1) : "-")).join(" | ")} |`);

  L.push("");
  return L.join("\n");
}

test.runIf(ENABLED)(
  "probability harness",
  () => {
    const rows = RATINGS.map(measure);
    const out = report(rows);
    writeFileSync("probe_report.md", out);
    // process.stdout.write bypasses vitest's console interception so the tables
    // land in the terminal as well as probe_report.md.
    process.stdout.write(`\n${out}\nWritten to probe_report.md\n`);
  },
  // Generous timeout: a full sweep is tens of thousands of simulations.
  600000
);
