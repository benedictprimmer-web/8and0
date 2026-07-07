/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Foreground ramp — remaps Tailwind's white/gray to theme variables so
        // text adapts between light and dark. Values live in src/index.css.
        white: "rgb(var(--fg) / <alpha-value>)",
        gray: {
          300: "rgb(var(--fg-300) / <alpha-value>)",
          400: "rgb(var(--fg-400) / <alpha-value>)",
          500: "rgb(var(--fg-500) / <alpha-value>)",
          600: "rgb(var(--fg-600) / <alpha-value>)",
        },
        // Primary brand → WC-trophy gold (static ramp; not runtime-themed)
        brand: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
          950: "#451A03",
        },
        // Accent ramp — driven at runtime by [data-accent] + [data-theme].
        gold: {
          300: "rgb(var(--gold-300) / <alpha-value>)",
          400: "rgb(var(--gold-400) / <alpha-value>)",
          500: "rgb(var(--gold-500) / <alpha-value>)",
          600: "rgb(var(--gold-600) / <alpha-value>)",
        },
        // Surfaces — themed (deep navy-black in dark, near-white in light).
        surface: {
          950: "rgb(var(--surface-950) / <alpha-value>)",
          900: "rgb(var(--surface-900) / <alpha-value>)",
          800: "rgb(var(--surface-800) / <alpha-value>)",
          700: "rgb(var(--surface-700) / <alpha-value>)",
          600: "rgb(var(--surface-600) / <alpha-value>)",
        },
        // Rose-red for home-win probability bars
        rose: {
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
        },
        confidence: {
          high:   "#16a34a",
          medium: "#ca8a04",
          low:    "#dc2626",
        },
        status: {
          live:     "#22c55e",
          upcoming: "#3b82f6",
          played:   "#6b7280",
        },
      },
      boxShadow: {
        gold:  "0 0 24px rgb(var(--gold-400) / 0.20)",
        amber: "0 0 40px rgb(var(--gold-600) / 0.18)",
        card:  "0 2px 16px rgba(0,0,0,0.7)",
        glow:  "0 0 0 1px rgb(var(--gold-400) / 0.15), 0 4px 24px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "sidebar-gradient": "linear-gradient(180deg, rgb(var(--surface-900)) 0%, rgb(var(--surface-950)) 60%, rgb(var(--surface-950)) 100%)",
        "gold-shimmer":     "linear-gradient(90deg, rgb(var(--gold-600)), rgb(var(--gold-400)), rgb(var(--gold-600)))",
      },
      animation: {
        "fade-up":    "fadeUp 0.4s ease-out forwards",
        "fade-in":    "fadeIn 0.2s ease-out forwards",
        "pulse-gold": "pulseGold 2s ease-in-out infinite",
        "pulse-live": "pulseLive 1.5s ease-in-out infinite",
        "slide-in":   "slideIn 0.3s ease-out forwards",
        "shimmer":    "shimmer 2.5s linear infinite",
      },
      keyframes: {
        fadeUp:    { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        pulseGold: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
        pulseLive: { "0%, 100%": { opacity: "1", transform: "scale(1)" }, "50%": { opacity: "0.7", transform: "scale(0.95)" } },
        slideIn:   { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        shimmer:   { from: { backgroundPosition: "-200% center" }, to: { backgroundPosition: "200% center" } },
      },
    },
  },
  plugins: [],
};
