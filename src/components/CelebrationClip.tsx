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
  /** player_id whose clip to play; renders nothing unless the manifest has it. */
  playerId: number;
  /** Caption under the clip, e.g. the scorer's name or "STAR PLAYER". */
  label?: string;
}

/**
 * Full-screen pixel-art celebration takeover for players that have a clip in
 * `public/celebrations/celebrations.json` (keyed by player_id). A dark scrim
 * (identical in light and dark themes) with the looping clip and a caption
 * centred on top. Renders nothing for players without a clip. Respects
 * prefers-reduced-motion by showing the static poster. Never intercepts clicks
 * (pointer-events-none) so the game underneath keeps running.
 */
export default function CelebrationClip({ playerId, label }: CelebrationClipProps) {
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
  // The sprite has an opaque light background, so it's framed as a rounded card
  // that reads intentionally over the dark scrim on any theme.
  const media = "block h-56 w-auto sm:h-72";
  const mediaStyle = { imageRendering: "pixelated" as const };

  return (
    <div className="animate-fade-in pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/70 p-4">
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
      {label && (
        <p className="animate-fade-up text-center text-3xl font-black uppercase tracking-wide text-gold-400 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-4xl">
          {label}
        </p>
      )}
    </div>
  );
}
