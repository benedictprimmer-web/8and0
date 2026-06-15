import { useEffect, useMemo, useState } from "react";

interface CelebrationProps {
  /** Big headline, e.g. "QUARTER-FINAL WON" or "🏆 WORLD CHAMPIONS". */
  headline: string;
  /** "big" throws more, longer-lasting confetti for the final win. */
  intensity?: "normal" | "big";
  /** Fired when the overlay auto-dismisses or is tapped. */
  onDismiss: () => void;
}

const COLORS = ["#facc15", "#d97706", "#ffffff", "#4ade80", "#f87171", "#60a5fa"];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rounded: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Full-screen, dependency-free confetti celebration. Pure CSS/DOM pieces
 * (no canvas, no audio). Respects prefers-reduced-motion by rendering a
 * single static flash instead of moving confetti. Auto-dismisses and is
 * dismissable by tap; the confetti layer never blocks the UI.
 */
export default function Celebration({ headline, intensity = "normal", onDismiss }: CelebrationProps) {
  const reduceMotion = useMemo(prefersReducedMotion, []);
  const [visible, setVisible] = useState(true);

  const count = reduceMotion ? 0 : intensity === "big" ? 80 : 48;
  const lifeMs = reduceMotion ? 1600 : intensity === "big" ? 3500 : 2600;

  const pieces = useMemo<Piece[]>(() => {
    // Deterministic-agnostic flavour: Math.random here is presentation-only.
    return Array.from({ length: count }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * (intensity === "big" ? 0.8 : 0.4),
      duration: 1.8 + Math.random() * 1.6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 7 + Math.random() * 7,
      rounded: Math.random() > 0.5,
    }));
  }, [count, intensity]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, lifeMs);
    return () => window.clearTimeout(timer);
  }, [lifeMs, onDismiss]);

  if (!visible) return null;

  function handleDismiss() {
    setVisible(false);
    onDismiss();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      role="presentation"
      onClick={handleDismiss}
    >
      {/* Confetti layer — never intercepts clicks. */}
      {!reduceMotion && (
        <div className="pointer-events-none absolute inset-0">
          {pieces.map((piece, index) => (
            <span
              key={index}
              className="confetti-piece absolute top-0 block"
              style={{
                left: `${piece.left}%`,
                width: `${piece.size}px`,
                height: `${piece.size}px`,
                backgroundColor: piece.color,
                borderRadius: piece.rounded ? "9999px" : "2px",
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Headline flash — dismissable, sits above the confetti. */}
      <div
        className={`pointer-events-none relative px-6 text-center ${
          reduceMotion ? "animate-champion-flash" : "animate-fade-up"
        }`}
      >
        <p
          className={`font-serif font-black tracking-tight text-gold-400 drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] ${
            intensity === "big" ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"
          }`}
        >
          {headline}
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-gray-300">
          Tap to continue
        </p>
      </div>
    </div>
  );
}
