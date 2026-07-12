import { createHash } from "node:crypto";
import { isConfigured, pipeline, redis } from "./_upstash.js";
import { sanitiseSubmission, teamScoreOf, type LeaderboardEntry } from "../src/game8/leaderboard.js";

// ── Vercel serverless function: global leaderboard ───────────────────────────
//
//   GET  /api/leaderboard?limit=200&ids=seedA,seedB&board=runs|team
//        → { entries: LeaderboardEntry[], total, mine: RankedEntry[], board }
//   POST /api/leaderboard
//        → { entry, rank, total, teamRank, teamTotal }
//
// There are two ranked boards over the SAME entry blobs:
//   • "runs"  — ranked by tournament score (how far you got). Default.
//   • "team"  — ranked by team overall rating (how good an XI you drafted),
//               so players compete to build the best team, not just get lucky.
//
// Storage (Upstash Redis):
//   lb:all          sorted set, score = run score, member = entry id
//   lb:team         sorted set, score = team overall, member = entry id
//   lb:entry:<id>   JSON string of the full LeaderboardEntry
//   rl:<ip>         per-minute rate-limit counter
//
// Entry id = a hash of the run seed (entryId()), NOT the raw seed. The seed is
// the caller's private idempotency key — re-submitting the same run overwrites
// the same row — but it is NEVER published in a response. If the raw seed were
// both the stored key and returned to every client (as it once was), anyone
// could read a victim's seed off the board and POST over their row. The `ids`
// query param is a list of the caller's OWN seeds; the server hashes them the
// same way to look up "mine".

const ALL_KEY = "lb:all";
const TEAM_KEY = "lb:team";
const ENTRY_PREFIX = "lb:entry:";
const MAX_ENTRIES = 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const RATE_LIMIT_PER_MIN = 20;
const MAX_MINE = 50;

/** Deterministic public entry id derived from the (private) run seed. */
function entryId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

/** Strip the private seed before returning an entry to any client. */
function toPublic(entry: LeaderboardEntry): LeaderboardEntry {
  const copy = { ...entry };
  delete copy.seed;
  return copy;
}

interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function clientIp(req: ApiRequest): string {
  // Prefer the platform-set real IP (not client-spoofable). Fall back to the
  // LAST hop of x-forwarded-for, which the proxy appends — never the left-most
  // value, which a caller can forge to bypass the rate limit.
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();

  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const parts = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "unknown";
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

function param(req: ApiRequest, key: string): string | undefined {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseEntry(raw: string | null): LeaderboardEntry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LeaderboardEntry;
  } catch {
    return null;
  }
}

/** "team" → the best-XI board; anything else → the tournament-runs board. */
function boardKey(board: string | undefined): string {
  return board === "team" ? TEAM_KEY : ALL_KEY;
}

/**
 * Look up the caller's own entries plus their current rank on the given board.
 * `seeds` are the caller's private run seeds; each is hashed to its entry id
 * (the same mapping used on write), so no raw seed is ever a lookup key a
 * third party could supply.
 */
async function rankEntries(
  seeds: string[],
  key: string
): Promise<Array<{ entry: LeaderboardEntry; rank: number | null }>> {
  const unique = Array.from(new Set(seeds.filter(Boolean))).slice(0, MAX_MINE);
  if (unique.length === 0) return [];

  const ids = unique.map(entryId);
  const raw = await redis<(string | null)[]>(["MGET", ...ids.map((id) => `${ENTRY_PREFIX}${id}`)]);
  const out: Array<{ entry: LeaderboardEntry; rank: number | null }> = [];
  for (let i = 0; i < ids.length; i += 1) {
    const entry = parseEntry(raw[i] ?? null);
    if (!entry) continue;
    const rank = await redis<number | null>(["ZREVRANK", key, ids[i]]);
    out.push({ entry: toPublic(entry), rank: rank === null ? null : rank + 1 });
  }
  return out;
}

async function handleGet(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Short shared-cache TTL to take read load off Redis without feeling stale.
  res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");

  const limitRaw = param(req, "limit");
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(limitRaw) || DEFAULT_LIMIT));

  const idsRaw = param(req, "ids");
  const mineIds = idsRaw ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const board = param(req, "board") === "team" ? "team" : "runs";
  const key = boardKey(board);

  const ids = await redis<string[]>(["ZREVRANGE", key, 0, limit - 1]);
  if (!ids || ids.length === 0) {
    const mine = mineIds.length > 0 ? await rankEntries(mineIds, key) : [];
    res.status(200).json({ entries: [], total: 0, mine, board });
    return;
  }

  const raw = await redis<(string | null)[]>(["MGET", ...ids.map((id) => `${ENTRY_PREFIX}${id}`)]);
  const entries: LeaderboardEntry[] = [];
  for (const item of raw) {
    const entry = parseEntry(item);
    if (entry) entries.push(toPublic(entry));
  }
  const total = await redis<number>(["ZCARD", key]);
  const mine = mineIds.length > 0 ? await rankEntries(mineIds, key) : [];
  res.status(200).json({ entries, total, mine, board });
}

async function handlePost(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Casual rate limiting: max N submissions per IP per minute.
  const ip = clientIp(req);
  const rlKey = `rl:${ip}`;
  const count = await redis<number>(["INCR", rlKey]);
  if (count === 1) {
    await redis(["EXPIRE", rlKey, 60]);
  }
  if (count > RATE_LIMIT_PER_MIN) {
    res.status(429).json({ error: "Too many submissions. Try again in a minute." });
    return;
  }

  const result = sanitiseSubmission(parseBody(req.body));
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }

  // Key the entry by a hash of the run seed so re-submitting the same run (e.g.
  // to fix a typo'd name) overwrites rather than creating a duplicate row —
  // without exposing the seed itself, which is what a client would need to
  // overwrite someone else's row. Runs without a seed fall back to a random id.
  const id = result.submission.seed ? entryId(result.submission.seed) : randomId();
  const entry: LeaderboardEntry = { id, ...result.submission };
  const teamScore = teamScoreOf(entry);

  await pipeline([
    ["SET", `${ENTRY_PREFIX}${id}`, JSON.stringify(entry)],
    ["ZADD", ALL_KEY, entry.score, id],
    ["ZADD", TEAM_KEY, teamScore, id],
  ]);

  // Trim BOTH boards to the top MAX_ENTRIES by their own score. The entry blob
  // is SHARED between boards, so it must only be deleted once the row has fallen
  // off BOTH — a run can rank on the team board while off the bottom of the runs
  // board (and vice versa). Trim first, then delete only the blobs of ids that
  // are members of neither set afterwards.
  const runsOverflow = await redis<string[]>(["ZRANGE", ALL_KEY, 0, -(MAX_ENTRIES + 1)]);
  const teamOverflow = await redis<string[]>(["ZRANGE", TEAM_KEY, 0, -(MAX_ENTRIES + 1)]);
  const trimOps: (string | number)[][] = [];
  if (runsOverflow.length > 0) trimOps.push(["ZREMRANGEBYRANK", ALL_KEY, 0, -(MAX_ENTRIES + 1)]);
  if (teamOverflow.length > 0) trimOps.push(["ZREMRANGEBYRANK", TEAM_KEY, 0, -(MAX_ENTRIES + 1)]);
  if (trimOps.length > 0) await pipeline(trimOps);

  const candidates = Array.from(new Set([...runsOverflow, ...teamOverflow]));
  const orphaned: string[] = [];
  for (const cid of candidates) {
    const onRuns = await redis<number | null>(["ZSCORE", ALL_KEY, cid]);
    if (onRuns !== null) continue;
    const onTeam = await redis<number | null>(["ZSCORE", TEAM_KEY, cid]);
    if (onTeam === null) orphaned.push(cid);
  }
  if (orphaned.length > 0) {
    await redis(["DEL", ...orphaned.map((oid) => `${ENTRY_PREFIX}${oid}`)]);
  }

  const rank = await redis<number | null>(["ZREVRANK", ALL_KEY, id]);
  const total = await redis<number>(["ZCARD", ALL_KEY]);
  const teamRank = await redis<number | null>(["ZREVRANK", TEAM_KEY, id]);
  const teamTotal = await redis<number>(["ZCARD", TEAM_KEY]);

  res.status(201).json({
    entry: toPublic(entry),
    rank: rank === null ? null : rank + 1,
    total,
    teamRank: teamRank === null ? null : teamRank + 1,
    teamTotal,
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!isConfigured()) {
    res.status(503).json({ error: "Leaderboard backend is not configured." });
    return;
  }

  try {
    if (req.method === "GET") {
      await handleGet(req, res);
      return;
    }
    if (req.method === "POST") {
      await handlePost(req, res);
      return;
    }
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    // Never echo raw error text to the client — upstream (Upstash) errors can
    // contain credentials or internal details. Log server-side only.
    console.error("leaderboard handler error:", err);
    res.status(500).json({ error: "Internal error handling the leaderboard request." });
  }
}
