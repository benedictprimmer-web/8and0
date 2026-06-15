// Minimal Upstash Redis REST client — no external dependency, just fetch.
// Configure with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.

type RedisArg = string | number;

// Read an Upstash env var defensively. Tolerates the common mistakes when
// copying from Upstash's ".env" view into a Vercel field: surrounding quotes,
// stray whitespace/newlines, a leading "NAME=" prefix, or even the entire
// .env block accidentally pasted into a single field.
function readEnvVar(name: string): string | undefined {
  let raw = process.env[name];
  if (!raw) return undefined;
  raw = raw.trim();
  // If a whole KEY=VALUE block was pasted, pull out this key's own line.
  const line = raw.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (line) raw = line[1].trim();
  // Strip one layer of surrounding quotes.
  raw = raw.replace(/^["']|["']$/g, "").trim();
  return raw || undefined;
}

function config(): { url: string; token: string } | null {
  const url = readEnvVar("UPSTASH_REDIS_REST_URL");
  const token = readEnvVar("UPSTASH_REDIS_REST_TOKEN");
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
