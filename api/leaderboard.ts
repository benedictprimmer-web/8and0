import { isConfigured, pipeline, redis } from "./_upstash";
import { sanitiseSubmission, type LeaderboardEntry } from "../src/game8/leaderboard";

// ── Vercel serverless function: global leaderboard ───────────────────────────
//
//   GET  /api/leaderboard?limit=200&ids=seedA,seedB
//        → { entries: LeaderboardEntry[], total, mine: RankedEntry[] }
//   POST /api/leaderboard
//        → { entry, rank, total }
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

/** Look up specific entries (by id) plus their current global rank. */
async function rankEntries(
  ids: string[]
): Promise<Array<{ entry: LeaderboardEntry; rank: number | null }>> {
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 25);
  if (unique.length === 0) return [];

  const raw = await redis<(string | null)[]>(["MGET", ...unique.map((id) => `${ENTRY_PREFIX}${id}`)]);
  const out: Array<{ entry: LeaderboardEntry; rank: number | null }> = [];
  for (let i = 0; i < unique.length; i += 1) {
    const entry = parseEntry(raw[i] ?? null);
    if (!entry) continue;
    const rank = await redis<number | null>(["ZREVRANK", ALL_KEY, unique[i]]);
    out.push({ entry, rank: rank === null ? null : rank + 1 });
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

  const ids = await redis<string[]>(["ZREVRANGE", ALL_KEY, 0, limit - 1]);
  if (!ids || ids.length === 0) {
    const mine = mineIds.length > 0 ? await rankEntries(mineIds) : [];
    res.status(200).json({ entries: [], total: 0, mine });
    return;
  }

  const raw = await redis<(string | null)[]>(["MGET", ...ids.map((id) => `${ENTRY_PREFIX}${id}`)]);
  const entries: LeaderboardEntry[] = [];
  for (const item of raw) {
    const entry = parseEntry(item);
    if (entry) entries.push(entry);
  }
  const total = await redis<number>(["ZCARD", ALL_KEY]);
  const mine = mineIds.length > 0 ? await rankEntries(mineIds) : [];
  res.status(200).json({ entries, total, mine });
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
  ]);

  // Trim to the top MAX_ENTRIES by score, deleting the orphaned entry blobs of
  // any rows that fall off the bottom so they don't leak memory in Redis.
  const overflowIds = await redis<string[]>(["ZRANGE", ALL_KEY, 0, -(MAX_ENTRIES + 1)]);
  if (overflowIds.length > 0) {
    await pipeline([
      ["DEL", ...overflowIds.map((overflowId) => `${ENTRY_PREFIX}${overflowId}`)],
      ["ZREMRANGEBYRANK", ALL_KEY, 0, -(MAX_ENTRIES + 1)],
    ]);
  }

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
