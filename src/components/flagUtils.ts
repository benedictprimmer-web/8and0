const CODE_TO_ISO: Record<string, string> = {
  // Americas
  ARG: "ar", BRA: "br", CAN: "ca", COL: "co", CRC: "cr",
  ECU: "ec", HON: "hn", JAM: "jm", MEX: "mx", PAN: "pa",
  PAR: "py", PRY: "py", URU: "uy", URY: "uy", USA: "us", VEN: "ve",
  // Europe
  AUT: "at", BEL: "be", BIH: "ba", CZE: "cz", DEU: "de",
  DEN: "dk", ENG: "gb-eng", ESP: "es", FRA: "fr", GBR: "gb",
  GER: "de", HRV: "hr", HUN: "hu", ITA: "it", NED: "nl",
  NLD: "nl", NOR: "no", POR: "pt", PRT: "pt", ROU: "ro",
  SCO: "gb-sct", SRB: "rs", SUI: "ch", CHE: "ch", SWE: "se",
  TUR: "tr", UKR: "ua",
  // Africa
  ALG: "dz", DZA: "dz", CAM: "cm", CMR: "cm", CIV: "ci",
  EGY: "eg", GHA: "gh", MAR: "ma", NGA: "ng", NIG: "ng",
  RSA: "za", ZAF: "za", SEN: "sn", TUN: "tn",
  // Asia / Pacific
  AUS: "au", IRN: "ir", IRQ: "iq", JOR: "jo", JPN: "jp",
  KOR: "kr", KSA: "sa", SAU: "sa", NZL: "nz", UZB: "uz",
  // Misc / extras
  QAT: "qa", DRC: "cd", COD: "cd", HTI: "ht", CUR: "cw", CPV: "cv",
};

// Sub-national flag tag sequences (gb-eng, gb-sct, gb-wls)
const SUBNATIONAL_EMOJI: Record<string, string> = {
  "gb-eng": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  "gb-sct": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  "gb-wls": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
  "gb":     "\u{1F1EC}\u{1F1E7}",
};

export function getFlagIso(fifaCode: string): string | null {
  return CODE_TO_ISO[fifaCode?.toUpperCase()] ?? null;
}

export function isoToEmoji(iso: string): string {
  const sub = SUBNATIONAL_EMOJI[iso.toLowerCase()];
  if (sub) return sub;

  // Standard 2-letter ISO → regional indicator pair
  const upper = iso.toUpperCase().slice(0, 2);
  return [...upper]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

export function getFlagEmoji(fifaCode: string): string {
  const iso = getFlagIso(fifaCode);
  if (!iso) return "🏳️";
  return isoToEmoji(iso);
}

export function getFlagUrl(fifaCode: string): string | null {
  const iso = getFlagIso(fifaCode);
  if (!iso) return null;
  return `https://flagcdn.com/w40/${iso}.png`;
}
