import fs from "node:fs/promises";
import path from "node:path";

const NBC_URL =
  "https://www.nbcsports.com/soccer/news/2026-world-cup-squads-confirmed-rosters-for-all-48-teams";
const WCR_INDEX_URL = "https://worldcupranking.com/world-cup-2026/squads/";
const WCR_BASE_URL = "https://worldcupranking.com";

const POSITION_LABELS = {
  Goalkeepers: { position: "GK", isGoalkeeper: true },
  Defenders: { position: "DF", isGoalkeeper: false },
  Midfielders: { position: "MF", isGoalkeeper: false },
  Forwards: { position: "FW", isGoalkeeper: false },
};

const TEAM_ALIASES = new Map([
  ["bosnia and herzegovina", "bosnia and herzegovina"],
  ["cabo verde", "cape verde"],
  ["cape verde", "cape verde"],
  ["congo dr", "dr congo"],
  ["cote divoire", "ivory coast"],
  ["cote d ivoire", "ivory coast"],
  ["curacao", "curaçao"],
  ["czech republic", "czechia"],
  ["dr congo", "dr congo"],
  ["ir iran", "iran"],
  ["iran", "iran"],
  ["korea republic", "south korea"],
  ["south korea", "south korea"],
  ["turkiye", "turkey"],
  ["turkey", "turkey"],
  ["united states", "united states"],
  ["usa", "united states"],
]);

const CLUB_RATING_HINTS = [
  [/real madrid|barcelona|manchester city|bayern|psg|paris saint-germain/i, 7],
  [/arsenal|liverpool|chelsea|internazionale|inter milan|atletico|juventus|napoli/i, 5],
  [/tottenham|manchester united|newcastle|milan|dortmund|leverkusen|benfica|sporting cp/i, 4],
  [/brighton|aston villa|crystal palace|fulham|west ham|wolves|bournemouth|brentford|psv|ajax|porto/i, 3],
  [/mls|inter miami|la galaxy|lafc|new york city|columbus|seattle|toronto|fc cincinnati/i, 1],
];

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&#8220;/g, '"')
    .replace(/&rdquo;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/["“”]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalTeamName(value) {
  const normalized = normalize(value);
  return TEAM_ALIASES.get(normalized) ?? normalized;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "8and0 squad updater/1.0 (+https://8and0.app)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function splitPlayers(line) {
  const raw = line.replace(/^[^:]+:\s*/, "").replace(/\s+\.$/, ".");
  const parts = [];
  let start = 0;
  let depth = 0;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;

    if (char !== "," || raw[index + 1] !== " ") continue;

    const rest = raw.slice(index + 2);
    const nextLooksLikePlayer = /^[A-ZÀ-ÖØ-ÞĀ-ž][^,]*?(?:\(|,|$)/.test(rest);
    const hasPlayerClubAhead = /^[^,]*\(/.test(rest);
    if (depth === 0 || (depth > 0 && nextLooksLikePlayer && hasPlayerClubAhead)) {
      parts.push(raw.slice(start, index).trim());
      start = index + 2;
      depth = 0;
    }
  }

  parts.push(raw.slice(start).trim());
  return parts.filter(Boolean);
}

function cleanClubName(value) {
  if (!value) return null;
  return value
    .replace(/\)\.$/, "")
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlayerSegment(segment) {
  const cleaned = segment
    .replace(/^\u2060/, "")
    .replace(/^\s*⁠/, "")
    .replace(/\s+\.$/, "")
    .trim();
  const closedClub = cleaned.match(/^(.*?)\s*\((.*)\)$/);
  if (closedClub) {
    return {
      name: closedClub[1].trim(),
      clubName: cleanClubName(closedClub[2]),
    };
  }
  const openClub = cleaned.match(/^(.*?)\s*\((.*)$/);
  if (openClub) {
    return {
      name: openClub[1].trim(),
      clubName: cleanClubName(openClub[2]),
    };
  }
  return { name: cleaned, clubName: null };
}

function parseNbcRoster(html) {
  const start = html.indexOf("<h2>2026 World Cup squads");
  if (start === -1) throw new Error("Could not find NBC roster heading");
  const end = html.indexOf("</div>", start);
  const body = html.slice(start, end === -1 ? undefined : end);
  const blocks = [...body.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>|<p[^>]*>(.*?)<\/p>/g)]
    .map((match) => stripTags(match[1] ?? match[2] ?? ""))
    .filter(Boolean);

  const rosters = new Map();
  let currentTeam = null;

  for (const block of blocks) {
    const category = block.match(/^(Goalkeepers|Defenders|Midfielders|Forwards):/);
    if (!category) {
      if (
        block.includes("World Cup squads") ||
        block.includes("How to Watch") ||
        block.includes("Introducing") ||
        block.includes("World Soccer Ticket")
      ) {
        continue;
      }
      currentTeam = canonicalTeamName(block);
      rosters.set(currentTeam, []);
      continue;
    }

    if (!currentTeam) continue;
    const position = POSITION_LABELS[category[1]];
    const players = splitPlayers(block).map((segment) => ({
      ...parsePlayerSegment(segment),
      ...position,
      sourcePositionGroup: category[1],
    }));
    rosters.get(currentTeam).push(...players);
  }

  return rosters;
}

function parseWorldCupRankingIndex(html) {
  const links = new Map();
  for (const match of html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>\s*—\s*26 players/g)) {
    const href = match[1];
    const label = stripTags(match[2]).replace(/^[^\p{L}\p{N}]+/u, "");
    links.set(canonicalTeamName(label), new URL(href, WCR_BASE_URL).toString());
  }
  return links;
}

function parseWorldCupRankingRoster(html) {
  const players = [];
  for (const match of html.matchAll(
    /<tr><td>(\d+)<\/td><td>(GK|DF|MF|FW)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g
  )) {
    players.push({
      number: Number(match[1]),
      position: match[2],
      name: stripTags(match[3]),
      clubName: stripTags(match[4]),
    });
  }
  return players;
}

function clubRatingBonus(clubName) {
  if (!clubName) return 0;
  for (const [pattern, bonus] of CLUB_RATING_HINTS) {
    if (pattern.test(clubName)) return bonus;
  }
  return 0;
}

function estimateRating(team, player, indexInTeam) {
  const ranking = typeof team.fifa_ranking === "number" ? team.fifa_ranking : 75;
  const elo = typeof team.elo === "number" ? team.elo : 1450;
  const rankBase = 82 - Math.min(ranking, 120) * 0.19;
  const eloBase = 70 + (elo - 1450) / 32;
  const positionBonus = player.position === "FW" ? 1 : player.position === "MF" ? 0 : player.position === "DF" ? -1 : -2;
  const depthPenalty = Math.floor(indexInTeam / 6);
  const estimated = Math.round((rankBase + eloBase) / 2 + clubRatingBonus(player.clubName) + positionBonus - depthPenalty);
  return Math.max(55, Math.min(88, estimated));
}

function existingPlayerKey(teamId, name) {
  return `${teamId}:${normalize(name)}`;
}

function buildExistingLookup(players) {
  const lookup = new Map();
  for (const player of players) {
    lookup.set(existingPlayerKey(player.team_id, player.name), player);
  }
  return lookup;
}

function fuzzyExistingMatch(existingPlayers, teamId, name) {
  const normalizedName = normalize(name);
  const direct = existingPlayers.get(existingPlayerKey(teamId, name));
  if (direct) return direct;
  for (const [key, player] of existingPlayers.entries()) {
    if (!key.startsWith(`${teamId}:`)) continue;
    const existingName = key.slice(String(teamId).length + 1);
    if (existingName.includes(normalizedName) || normalizedName.includes(existingName)) {
      return player;
    }
  }
  return null;
}

function wcrNameMatchesNbc(wcrPlayer, nbcPlayer) {
  if (wcrPlayer.position !== nbcPlayer.position) return false;
  return wcrNameAppearsInNbc(wcrPlayer, nbcPlayer);
}

function wcrNameAppearsInNbc(wcrPlayer, nbcPlayer) {
  const wcrName = normalize(wcrPlayer.name);
  const nbcName = normalize(nbcPlayer.name);
  const shirtTokens = wcrName.split(" ").filter((token) => token.length > 1);
  return wcrName === nbcName || shirtTokens.every((token) => nbcName.includes(token));
}

function formatShirtName(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z]\.$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function wcrToSourcePlayer(player) {
  return {
    name: formatShirtName(player.name),
    clubName: player.clubName || null,
    position: player.position,
    isGoalkeeper: player.position === "GK",
    sourcePositionGroup:
      player.position === "GK" ? "Goalkeepers" : player.position === "DF" ? "Defenders" : player.position === "MF" ? "Midfielders" : "Forwards",
    rosterSource: "WorldCupRanking FIFA squad table top-up",
  };
}

function reconcileRoster(nbcRoster, wcrRoster) {
  if (nbcRoster.length === 26) return nbcRoster;

  const matchedNbcIndexes = new Set();
  const matchedWcrIndexes = new Set();

  wcrRoster.forEach((wcrPlayer, wcrIndex) => {
    const nbcIndex = nbcRoster.findIndex(
      (nbcPlayer, index) => !matchedNbcIndexes.has(index) && wcrNameMatchesNbc(wcrPlayer, nbcPlayer)
    );
    if (nbcIndex !== -1) {
      matchedNbcIndexes.add(nbcIndex);
      matchedWcrIndexes.add(wcrIndex);
    }
  });

  if (nbcRoster.length > 26 && matchedNbcIndexes.size >= 26) {
    return nbcRoster.filter((_, index) => matchedNbcIndexes.has(index)).slice(0, 26);
  }

  if (nbcRoster.length < 26) {
    const reconciled = [...nbcRoster];
    for (let index = 0; index < wcrRoster.length && reconciled.length < 26; index += 1) {
      const alreadyPresent = nbcRoster.some((nbcPlayer) => wcrNameAppearsInNbc(wcrRoster[index], nbcPlayer));
      if (!matchedWcrIndexes.has(index) && !alreadyPresent) {
        reconciled.push(wcrToSourcePlayer(wcrRoster[index]));
      }
    }
    return reconciled;
  }

  return nbcRoster.slice(0, 26);
}

function compareRosters(nbcRoster, wcrRoster) {
  const matchedNbc = new Set();
  const matchedWcr = new Set();

  wcrRoster.forEach((wcrPlayer, wcrIndex) => {
    const nbcIndex = nbcRoster.findIndex(
      (nbcPlayer, index) => !matchedNbc.has(index) && wcrNameMatchesNbc(wcrPlayer, nbcPlayer)
    );
    if (nbcIndex !== -1) {
      matchedNbc.add(nbcIndex);
      matchedWcr.add(wcrIndex);
    }
  });

  return {
    nbc_count: nbcRoster.length,
    worldcupranking_count: wcrRoster.length,
    matched_count: matchedNbc.size,
    nbc_only: nbcRoster
      .filter((_, index) => !matchedNbc.has(index))
      .map((player) => ({ name: player.name, position: player.position, club_name: player.clubName })),
    worldcupranking_only: wcrRoster
      .filter((_, index) => !matchedWcr.has(index))
      .map((player) => ({ name: player.name, position: player.position, club_name: player.clubName })),
  };
}

function validateSourceRoster(rosters, teams) {
  const failures = [];
  for (const team of teams) {
    const roster = rosters.get(canonicalTeamName(team.name)) ?? [];
    if (roster.length === 0) {
      failures.push(`${team.name} has no NBC roster`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`NBC roster validation failed:\n${failures.join("\n")}`);
  }
}

async function main() {
  const root = process.cwd();
  const teams = JSON.parse(await fs.readFile(path.join(root, "public/data/teams.json"), "utf8"));
  const ratingBaselinePath = path.join(root, "data-quality/player-rating-overrides.json");
  const existingPlayers = JSON.parse(
    await fs.readFile(ratingBaselinePath, "utf8").catch(() => fs.readFile(path.join(root, "public/data/players.json"), "utf8"))
  );
  const existingLookup = buildExistingLookup(existingPlayers);
  const usedIds = new Set();
  let nextPlayerId = Math.max(0, ...existingPlayers.map((player) => player.player_id ?? 0)) + 1;

  const [nbcHtml, wcrIndexHtml] = await Promise.all([fetchText(NBC_URL), fetchText(WCR_INDEX_URL)]);
  const nbcRosters = parseNbcRoster(nbcHtml);
  validateSourceRoster(nbcRosters, teams);

  const wcrLinks = parseWorldCupRankingIndex(wcrIndexHtml);
  const wcrRosters = new Map();
  for (const team of teams) {
    const canonical = canonicalTeamName(team.name);
    const url = wcrLinks.get(canonical);
    if (!url) throw new Error(`No WorldCupRanking link for ${team.name}`);
    const html = await fetchText(url);
    const roster = parseWorldCupRankingRoster(html);
    wcrRosters.set(canonical, roster);
    if (roster.length !== 26) {
      throw new Error(`WorldCupRanking roster for ${team.name} has ${roster.length} players`);
    }
  }

  const players = [];
  const mismatchReport = {
    generated_at: new Date().toISOString(),
    final_roster_source: NBC_URL,
    cross_check_source: WCR_INDEX_URL,
    notes: [
      "NBC rosters are used as the final generated player list.",
      "WorldCupRanking shirt names are matched against NBC full names by normalized token containment, so report entries are source-review hints rather than hard failures.",
    ],
    teams: [],
  };

  for (const team of teams) {
    const canonical = canonicalTeamName(team.name);
    const nbcRoster = nbcRosters.get(canonical) ?? [];
    const wcrRoster = wcrRosters.get(canonical) ?? [];
    const roster = reconcileRoster(nbcRoster, wcrRoster);
    const comparison = compareRosters(nbcRoster, wcrRoster);
    if (
      comparison.nbc_count !== 26 ||
      comparison.worldcupranking_count !== 26 ||
      comparison.nbc_only.length > 0 ||
      comparison.worldcupranking_only.length > 0
    ) {
      mismatchReport.teams.push({
        team_id: team.team_id,
        team_name: team.name,
        fifa_code: team.fifa_code,
        generated_count: roster.length,
        ...comparison,
      });
    }

    if (roster.length !== 26) {
      throw new Error(`Reconciled roster for ${team.name} has ${roster.length} players`);
    }

    roster.forEach((sourcePlayer, index) => {
      const existing = fuzzyExistingMatch(existingLookup, team.team_id, sourcePlayer.name);
      const playerId = existing && !usedIds.has(existing.player_id) ? existing.player_id : nextPlayerId++;
      usedIds.add(playerId);
      const rating = existing?.ea_overall && existing.ea_overall > 0
        ? existing.ea_overall
        : estimateRating(team, sourcePlayer, index);

      players.push({
        player_id: playerId,
        team_id: team.team_id,
        fifa_code: team.fifa_code,
        name: sourcePlayer.name,
        position: sourcePlayer.position,
        is_goalkeeper: sourcePlayer.isGoalkeeper,
        club_name: sourcePlayer.clubName,
        ea_overall: rating,
        aura_composite:
          typeof existing?.aura_composite === "number"
            ? existing.aura_composite
            : Math.round((rating / 100) * 1000) / 1000,
        roster_source: sourcePlayer.rosterSource ?? "NBC Sports confirmed 2026 World Cup squads",
        rating_source: existing?.ea_overall ? "existing public/data/players.json" : "estimated from team strength and club context",
        rating_confidence: existing?.ea_overall ? "preserved" : "estimated",
      });
    });
  }

  players.sort((a, b) => a.team_id - b.team_id || a.player_id - b.player_id);

  await fs.mkdir(path.join(root, "data-quality"), { recursive: true });
  await fs.writeFile(path.join(root, "public/data/players.json"), `${JSON.stringify(players, null, 2)}\n`);
  await fs.writeFile(
    path.join(root, "data-quality/squad-mismatches.json"),
    `${JSON.stringify(mismatchReport, null, 2)}\n`
  );

  console.log(`Wrote ${players.length} players to public/data/players.json`);
  console.log(`Wrote ${mismatchReport.teams.length} team mismatch entries to data-quality/squad-mismatches.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
