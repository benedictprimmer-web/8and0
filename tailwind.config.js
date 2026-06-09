/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary brand → WC-trophy gold
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
        gold: {
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
        },
        // Deep navy-black surfaces (not pure black)
        surface: {
          950: "#060810",
          900: "#0D1117",
          800: "#161B27",
          700: "#1E2433",
          600: "#2A3145",
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
        gold:  "0 0 24px rgba(251,191,36,0.20)",
        amber: "0 0 40px rgba(217,119,6,0.18)",
        card:  "0 2px 16px rgba(0,0,0,0.7)",
        glow:  "0 0 0 1px rgba(251,191,36,0.15), 0 4px 24px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "sidebar-gradient": "linear-gradient(180deg, #0D1117 0%, #0A0D18 60%, #060810 100%)",
        "gold-shimmer":     "linear-gradient(90deg, #D97706, #FBBF24, #D97706)",
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
