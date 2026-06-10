import type { LeaderboardEntry, LeaderboardSubmission } from "../game8/leaderboard";

const BASE = import.meta.env.VITE_API_URL ?? "";

// ── Static data fallback (Vercel / no-backend mode) ──────────────────────────

function staticPath(apiPath: string): string | null {
  const p = apiPath.split("?")[0];
  if (p === "/api/health")                       return "/data/health.json";
  if (p === "/api/teams" || p === "/api/teams/") return "/data/teams.json";
  if (p.startsWith("/api/teams/groups"))         return "/data/groups.json";
  if (p.startsWith("/api/fixtures"))             return "/data/fixtures.json";
  if (p.startsWith("/api/bracket/simulate"))     return "/data/bracket.json";
  if (p.startsWith("/api/coaches"))              return "/data/coaches.json";
  if (p.startsWith("/api/aura"))                 return "/data/aura.json";
  if (p.startsWith("/api/predict/teams"))        return "/data/teams.json";
  if (p.startsWith("/api/players")) {
    // /api/players?team_id=X — filter at load time
    return "/data/players.json";
  }
  if (p.startsWith("/api/matches/h2h"))           return "/data/h2h.json";
  if (/^\/api\/teams\/\d+\/coach$/.test(p))       return "/data/coaches.json";
  if (/^\/api\/teams\/\d+\/players$/.test(p))     return "/data/players.json";
  return null;
}

async function fetchStatic<T>(apiPath: string): Promise<T> {
  const file = staticPath(apiPath);
  if (!file) throw new Error(`No static fallback for ${apiPath}`);

  const res = await fetch(file);
  if (!res.ok) throw new Error(`Static file ${file} not found`);
  const data = await res.json();

  // Apply any transforms needed to match API response shapes
  const params = new URLSearchParams(apiPath.includes("?") ? apiPath.split("?")[1] : "");

  if (apiPath.startsWith("/api/players")) {
    const teamId = params.get("team_id");
    if (teamId) {
      const filtered = (data as Record<string, unknown>[]).filter(
        (p) => String(p.team_id) === teamId
      );
      return filtered as unknown as T;
    }
  }

  // /api/teams/:id/coach — coaches.json is a list; find the matching entry
  const coachMatch = apiPath.match(/^\/api\/teams\/(\d+)\/coach$/);
  if (coachMatch) {
    const teamId = coachMatch[1];
    const coach = (data as Record<string, unknown>[]).find(
      (c) => String(c.team_id) === teamId
    );
    return (coach ?? null) as unknown as T;
  }

  // /api/teams/:id/players — players.json is a list; filter by team_id
  const teamPlayersMatch = apiPath.match(/^\/api\/teams\/(\d+)\/players$/);
  if (teamPlayersMatch) {
    const teamId = teamPlayersMatch[1];
    const filtered = (data as Record<string, unknown>[]).filter(
      (p) => String(p.team_id) === teamId
    );
    return filtered as unknown as T;
  }

  return data as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE && (!init?.method || init.method === "GET") && staticPath(path)) {
    return fetchStatic<T>(path);
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      // 4xx/5xx from the backend — try static fallback for GET requests
      if (!init?.method || init.method === "GET") {
        return fetchStatic<T>(path);
      }
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status} ${msg}`);
    }
    return await res.json() as T;
  } catch (err) {
    // Network error (no backend, CORS, etc.) — fall back to static data for GETs
    if (!init?.method || init.method === "GET") {
      return fetchStatic<T>(path);
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};

// ── Global leaderboard ────────────────────────────────────────────────────────

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
}

export interface SubmitResponse {
  entry: LeaderboardEntry;
  rank: number | null;
  total: number;
}

export const leaderboardApi = {
  list: (limit = 200) =>
    api.get<LeaderboardResponse>(`/api/leaderboard?limit=${limit}`),
  submit: (submission: LeaderboardSubmission) =>
    api.post<SubmitResponse>("/api/leaderboard", submission),
};

// ── Core team / match types ───────────────────────────────────────────────────

export interface Team {
  team_id: number;
  name: string;
  fifa_code: string;
  confederation: string;
  wc2026_group: string | null;
  fifa_ranking: number | null;
  elo: number | null;
  pi_attack: number | null;
  pi_defence: number | null;
  qualified_2026: boolean;
}

export interface TeamMini {
  team_id: number;
  name: string;
  fifa_code: string;
  confederation: string | null;
  wc2026_group: string | null;
  fifa_ranking: number | null;
  elo: number | null;
}

// ── Fixture types (Tournament Hub, Bracket) ───────────────────────────────────

export interface FixturePrediction {
  model_available: boolean;
  error?: string | null;
  expected_goals_home: number | null;
  expected_goals_away: number | null;
  expected_goals_home_p10: number | null;
  expected_goals_home_p90: number | null;
  expected_goals_away_p10: number | null;
  expected_goals_away_p90: number | null;
  prob_home_win: number | null;
  prob_draw: number | null;
  prob_away_win: number | null;
  confidence_band: "high" | "medium" | "low" | null;
  top_scorelines?: Scoreline[];
  btts_prob?: number | null;
  over_2_5_prob?: number | null;
}

export interface Scoreline {
  home: number;
  away: number;
  prob: number;
}

export interface VenueMini {
  venue_id: number;
  name: string;
  city: string;
  country: string;
  capacity: number | null;
  altitude_m: number | null;
}

export interface Fixture {
  match_id: number;
  date: string | null;
  kickoff_time: string | null;
  kickoff_utc: string | null;
  status: "upcoming" | "live" | "played";
  round: string;
  round_code: number;
  group: string | null;
  home_team: TeamMini | null;
  away_team: TeamMini | null;
  home_goals: number | null;
  away_goals: number | null;
  venue: VenueMini | null;
  neutral: boolean;
  prediction?: FixturePrediction | null;
}

// ── Model summary (Model Lab) ─────────────────────────────────────────────────

export interface BacktestSummary {
  tournament: string | null;
  n_matches: number | null;
  accuracy: number | null;
  log_loss: number | null;
  rps: number | null;
}

export interface BacktestPrediction {
  match_id: number;
  prob_home_win: number;
  prob_draw: number;
  prob_away_win: number;
  xg_home: number;
  xg_away: number;
  confidence_band: string;
  actual_home: number;
  actual_away: number;
}

export interface FeatureImportance {
  feature: string;
  label: string;
  importance: number;
}

export interface ModelSummary {
  model_available: boolean;
  model_error: string | null;
  ensemble_weights: { glm: number; rf: number; xgb: number } | null;
  model_components: { glm: boolean; rf: boolean; xgb: boolean; bayesian: boolean } | null;
  wc2022: BacktestSummary | null;
  wc2018: BacktestSummary | null;
  top_features: FeatureImportance[];
  feature_labels: Record<string, string>;
}

// ── SHAP explanation ──────────────────────────────────────────────────────────

export interface ShapFeature {
  feature: string;
  shap_value: number;
  label: string;
}

export interface ShapExplanation {
  match_id: number | null;
  model_available: boolean;
  home_team: string;
  away_team: string;
  narrative: string;
  top_features_home: ShapFeature[];
  top_features_away: ShapFeature[];
}

// ── Prediction / log types ────────────────────────────────────────────────────

export interface Prediction {
  match_id: number;
  expected_goals_home: number;
  expected_goals_away: number;
  expected_goals_home_p10: number;
  expected_goals_home_p90: number;
  expected_goals_away_p10: number;
  expected_goals_away_p90: number;
  prob_home_win: number;
  prob_draw: number;
  prob_away_win: number;
  confidence_band: "high" | "medium" | "low";
  predicted_at: string;
  model_version: string;
}

export interface PredictionLogEntry {
  log_id: number;
  predicted_at: string;
  match_id: number;
  model_version: string;
  expected_goals_home: number | null;
  expected_goals_away: number | null;
  expected_goals_home_p10: number | null;
  expected_goals_home_p90: number | null;
  expected_goals_away_p10: number | null;
  expected_goals_away_p90: number | null;
  prob_home_win: number | null;
  prob_draw: number | null;
  prob_away_win: number | null;
  confidence_band: string | null;
  prev_hash: string | null;
  this_hash: string | null;
}

export interface ChainVerification {
  valid: boolean;
  total_entries: number;
  first_broken_at: number | null;
  message: string;
}

// ── Aura / tactical types ─────────────────────────────────────────────────────

export interface AuraEntry {
  player_id: number;
  name: string;
  fifa_code: string;
  position: string;
  team_id: number;
  aura_composite: number;
  big_game_goals: number | null;
  big_game_goals_per_app: number | null;
  finals_goals: number | null;
  major_honors: number | null;
  tournament_goals: number | null;
  intl_appearances: number | null;
}

export interface StyleCluster {
  cluster_id: number;
  label: string;
  description: string | null;
}

export interface StyleMatchup {
  home_cluster: number;
  away_cluster: number;
  n_matches: number | null;
  avg_home_goals: number | null;
  avg_away_goals: number | null;
  home_win_pct: number | null;
}

export interface Coach {
  coach_id: number;
  name: string;
  nationality: string | null;
  birth_date: string | null;
  style_cluster: number | null;
  career_wins: number | null;
  career_matches: number | null;
  career_win_pct: number | null;
}

// ── Bracket simulation ────────────────────────────────────────────────────────

export interface BracketSimResult {
  team_id: number;
  name: string;
  fifa_code: string;
  wc2026_group: string | null;
  win_pct: number;
  final_pct: number;
  semi_pct: number;
  quarter_pct: number;
  r16_pct: number;
  advance_pct: number;
}
