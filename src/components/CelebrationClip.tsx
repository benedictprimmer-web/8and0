import { useEffect, useState } from "react";

interface ClipEntry {
  name: string;
  webm: string;
  poster: string;
}

// Loaded once and cached module-wide — the manifest is a tiny static file and
// never changes at runtime. `null` = not fetched yet, {} = fetched/empty.
let manifestCache: Record<string, ClipEntry> | null = null;
let manifestPromise: Promise<Record<string, ClipEntry>> | null = null;

function loadManifest(): Promise<Record<string, ClipEntry>> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (!manifestPromise) {
    manifestPromise = fetch("/celebrations/celebrations.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, ClipEntry>) => (manifestCache = data))
      .catch(() => (manifestCache = {}));
  }
  return manifestPromise;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface CelebrationClipProps {
  /** player_id of the scorer; a clip plays only if the manifest has an entry. */
  playerId: number;
}

/**
 * Presentational goal-celebration overlay: a looping pixel-art clip for players
 * that have one in `public/celebrations/celebrations.json` (keyed by player_id).
 * Renders nothing for players without a clip. Respects prefers-reduced-motion by
 * showing the static poster instead of the video. Never intercepts clicks.
 */
export default function CelebrationClip({ playerId }: CelebrationClipProps) {
  const [clip, setClip] = useState<ClipEntry | null>(manifestCache?.[String(playerId)] ?? null);

  useEffect(() => {
    let alive = true;
    loadManifest().then((m) => {
      if (alive) setClip(m[String(playerId)] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [playerId]);

  if (!clip) return null;

  const reduceMotion = prefersReducedMotion();

  // The sprite is rendered on an opaque light background, so it's framed as a
  // rounded "celebration card" that reads intentionally on any theme (rather
  // than a raw white rectangle floating over the dark UI).
  const media = "block h-40 w-auto sm:h-48";
  const mediaStyle = { imageRendering: "pixelated" as const };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="animate-goal-pop overflow-hidden rounded-2xl border border-black/10 shadow-2xl ring-1 ring-white/10">
        {reduceMotion ? (
          <img src={clip.poster} alt={`${clip.name} celebrates`} style={mediaStyle} className={media} />
        ) : (
          <video
            src={clip.webm}
            poster={clip.poster}
            autoPlay
            muted
            loop
            playsInline
            aria-label={`${clip.name} celebrates`}
            style={mediaStyle}
            className={media}
          />
        )}
      </div>
    </div>
  );
}
