/** Country flag — emoji primary, CDN image fallback (for environments where flagcdn.com is reachable). */

import { useState } from "react";
import { getFlagIso, isoToEmoji } from "./flagUtils";

interface FlagProps {
  fifaCode: string;
  size?: number;
  className?: string;
}

export default function Flag({ fifaCode, size = 24, className = "" }: FlagProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const iso = getFlagIso(fifaCode);

  // Always render emoji — it's always correct and colourful
  const emoji = iso ? isoToEmoji(iso) : null;

  if (!iso || imgFailed || !emoji) {
    return (
      <span
        className={`inline-flex items-center justify-center select-none ${className}`}
        style={{ fontSize: Math.round(size * 0.88), lineHeight: 1, width: size }}
        aria-label={fifaCode}
      >
        {emoji ?? (
          <span className="inline-flex items-center justify-center bg-surface-700 rounded text-xs font-mono text-gray-400"
                style={{ width: size, height: Math.round(size * 0.67) }}>
            {fifaCode?.slice(0, 3)}
          </span>
        )}
      </span>
    );
  }

  // Try CDN image on top; fall back to emoji on error
  return (
    <span className={`relative inline-flex items-center justify-center select-none ${className}`}
          style={{ width: size, height: Math.round(size * 0.67) }}
          aria-label={fifaCode}>
      {/* Emoji base — always visible */}
      <span style={{ fontSize: Math.round(size * 0.82), lineHeight: 1, position: "absolute" }}>
        {emoji}
      </span>
      {/* CDN image overlay — hides emoji when loaded, shows emoji if 403/timeout */}
      <img
        src={`https://flagcdn.com/w40/${iso}.png`}
        alt=""
        width={size}
        height={Math.round(size * 0.67)}
        className="rounded-sm object-cover relative"
        loading="lazy"
        onError={() => setImgFailed(true)}
        style={{ opacity: imgFailed ? 0 : 1 }}
      />
    </span>
  );
}
