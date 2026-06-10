import { isConfigured, pipeline, redis } from "./_upstash";
import { sanitiseSubmission, type LeaderboardEntry } from "../src/game8/leaderboard";

// ── Vercel serverless function: global leaderboard ───────────────────────────
//
//   GET  /api/leaderboard?limit=200   → { entries: LeaderboardEntry[], total }
//   POST /api/leaderboard             → { entry, rank, total }
//
// Storage (Upstash Redis):
//   lb:all          sorted set, score = run score, member = entry id
//   lb:entry:<id>   JSON string of the full LeaderboardEntry
//   rl:<ip>         per-minute rate-limit counter

const ALL_KEY = "lb:all";
const ENTRY_PREFIX = "lb:entry:";
const MAX_ENTRIES = 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const RATE_LIMIT_PER_MIN = 20;

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
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw?.split(",")[0] ?? "unknown").trim() || "unknown";
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

async function handleGet(req: ApiRequest, res: ApiResponse): Promise<void> {
  const limitParam = req.query?.limit;
  const limitRaw = Array.isArray(limitParam) ? limitParam[0] : limitParam;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(limitRaw) || DEFAULT_LIMIT));

  const ids = await redis<string[]>(["ZREVRANGE", ALL_KEY, 0, limit - 1]);
  if (!ids || ids.length === 0) {
    res.status(200).json({ entries: [], total: 0 });
    return;
  }

  const raw = await redis<(string | null)[]>(["MGET", ...ids.map((id) => `${ENTRY_PREFIX}${id}`)]);
  const entries: LeaderboardEntry[] = [];
  for (const item of raw) {
    if (!item) continue;
    try {
      entries.push(JSON.parse(item) as LeaderboardEntry);
    } catch {
      // skip corrupt rows
    }
  }
  const total = await redis<number>(["ZCARD", ALL_KEY]);
  res.status(200).json({ entries, total });
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

  // Key the entry by the run seed so re-submitting the same run (e.g. to fix a
  // typo'd name) overwrites rather than creating a duplicate row.
  const id = result.submission.seed || randomId();
  const entry: LeaderboardEntry = { id, ...result.submission };

  await pipeline([
    ["SET", `${ENTRY_PREFIX}${id}`, JSON.stringify(entry)],
    ["ZADD", ALL_KEY, entry.score, id],
    // Keep only the top MAX_ENTRIES by score (drop lowest-ranked overflow).
    ["ZREMRANGEBYRANK", ALL_KEY, 0, -(MAX_ENTRIES + 1)],
  ]);

  const rank = await redis<number | null>(["ZREVRANK", ALL_KEY, id]);
  const total = await redis<number>(["ZCARD", ALL_KEY]);

  res.status(201).json({
    entry,
    rank: rank === null ? null : rank + 1,
    total,
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
    const message = err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
}
