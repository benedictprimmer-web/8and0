// Minimal Upstash Redis REST client — no external dependency, just fetch.
// Configure with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.

type RedisArg = string | number;

function config(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function isConfigured(): boolean {
  return config() !== null;
}

/** Run a single Redis command. Returns the `result` field. */
export async function redis<T = unknown>(command: RedisArg[]): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Upstash is not configured");

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { result: T; error?: string };
  if (data.error) throw new Error(`Upstash error: ${data.error}`);
  return data.result;
}

/** Run multiple commands in a single round-trip. Returns array of results. */
export async function pipeline<T = unknown>(commands: RedisArg[][]): Promise<T[]> {
  const cfg = config();
  if (!cfg) throw new Error("Upstash is not configured");

  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as Array<{ result: T; error?: string }>;
  return data.map((item) => item.result);
}
