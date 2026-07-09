import { Route, Routes } from "react-router-dom";
import EightZeroGame from "./pages/EightZeroGame";
import GlobalLeaderboard from "./pages/GlobalLeaderboard";
import { ThemeProvider } from "./theme/ThemeProvider";
import SettingsButton from "./components/SettingsButton";
import { PixelIconSprite } from "./components/PixelIcon";

export default function App() {
  return (
    <ThemeProvider>
      {/* One-time pixel-icon sprite for the retro skin */}
      <PixelIconSprite />
      <main className="min-h-screen bg-surface-950 px-4 py-6 text-white sm:px-6 lg:px-8">
        <SettingsButton />
        <Routes>
          <Route path="/" element={<EightZeroGame />} />
          <Route path="/leaderboard" element={<GlobalLeaderboard />} />
        </Routes>
      </main>
      {/* Retro CRT scanline + vignette flourish (static; reduced-motion safe) */}
      <div className="crt-overlay" aria-hidden="true" />
    </ThemeProvider>
  );
}
