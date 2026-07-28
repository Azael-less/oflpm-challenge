// api/leaderboard.js
// Backend que consulta la API oficial de Riot Games
// para el grupo de jugadores definido en players.js, cachea el resultado
// por CACHE_TTL_MS y lo sirve como JSON al frontend.
//
// Variables de entorno requeridas (configúralas en Render o en tu entorno local,
// NUNCA las escribas en este archivo):
//   RIOT_API_KEY   -> tu API key de developer.riotgames.com
//
// Rutas de Riot usadas:
//   Account-v1  (regional: americas)  -> riotId  -> puuid
//   Summoner-v4 (platform: la1/na1)   -> puuid   -> profileIconId, level
//   League-v4   (platform: la1/na1)   -> puuid   -> rango, LP, wins, losses

const { PLAYERS, PLATFORM, REGIONAL } = require("./players.js");

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const RIOT_REQUEST_GAP_MS = 65; // ~15 solicitudes/segundo, bajo el límite de 20
const RIOT_KEY_HEADER = "X-Riot-Token";
// Reto: desde 30 de julio, 00:00 Colombia, hasta 30 de agosto, 00:00 Colombia.
const CHALLENGE_START_AT = Date.parse("2026-07-30T00:00:00-05:00");
const CHALLENGE_END_AT = Date.parse("2026-08-30T00:00:00-05:00");

// Cache en memoria (vive mientras la función serverless siga "caliente")
let cache = {
  data: null,
  fetchedAt: 0,
  ddragonVersion: null,
  championData: null,
};
const TIER_RANK = [
  "CHALLENGER",
  "GRANDMASTER",
  "MASTER",
  "DIAMOND",
  "EMERALD",
  "PLATINUM",
  "GOLD",
  "SILVER",
  "BRONZE",
  "IRON",
];
const DIVISION_RANK = { I: 0, II: 1, III: 2, IV: 3 };
const APEX_TIERS = new Set(["CHALLENGER", "GRANDMASTER", "MASTER"]);

function buildFallbackLeaderboard(now) {
  const tiers = ["DIAMOND", "PLATINUM", "GOLD", "SILVER", "BRONZE"];
  return PLAYERS.map((player, index) => {
    const tier = tiers[index % tiers.length];
    const division = index % 4 === 0 ? "I" : index % 4 === 1 ? "II" : index % 4 === 2 ? "III" : "IV";
    const leaguePoints = 100 + (index * 15) % 250;
    const wins = 120 + index * 7;
    const losses = 95 + index * 5;

    return {
      gameName: player.gameName,
      tagLine: player.tagLine,
      label: player.label || player.gameName,
      goalTier: player.goalTier || null,
    startRank: player.startRank || null,
      profileIconId: 1 + index,
      profileIconUrl: `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/profileicon/${1 + index}.png`,
      summonerLevel: 250 + index,
      ranked: {
        tier,
        rank: division,
        leaguePoints,
        wins,
        losses,
        hotStreak: index % 2 === 0,
      },
      opggUrl: `https://www.op.gg/summoners/lan/${encodeURIComponent(player.gameName)}-${encodeURIComponent(player.tagLine)}`,
      stats: {
        matchesPlayed: 8,
        wins: 4 + (index % 4),
        losses: 4 - (index % 4),
        assists: 38 + index * 11,
        pentakills: index === 0 ? 2 : index % 2,
        quadras: index === 1 ? 3 : index % 2,
        longestWinStreak: 2 + (index % 5),
        longestLossStreak: 1 + ((index * 2) % 4),
        championEntries: [
          { name: ["Ahri", "Jinx", "Yasuo", "Lee Sin", "Lux"][index % 5], games: 4, wins: 3 + (index % 2), losses: 1 - (index % 2), winRate: index % 2 ? 100 : 75, kda: "3.20" },
          { name: ["Orianna", "Kai'Sa", "Aatrox", "Viego", "Nami"][index % 5], games: 2, wins: 2, losses: 0, winRate: 100, kda: "2.80" },
        ],
        otpChampion: { name: ["Ahri", "Jinx", "Yasuo", "Lee Sin", "Lux"][index % 5], games: 4, wins: 3 + (index % 2), losses: 1 - (index % 2), winRate: index % 2 ? 100 : 75, kda: "3.20" },
        goodWinrateChampions: index % 2 ? [{ name: "Jinx" }, { name: "Kai'Sa" }] : [{ name: "Ahri" }],
        recentMatches: Array.from({ length: 8 }, (_, matchIndex) => {
          const champions = ["Ahri", "Jinx", "Yasuo", "LeeSin", "Lux", "Orianna", "Kaisa", "Aatrox"];
          const champion = champions[(index + matchIndex) % champions.length];
          const win = (index + matchIndex) % 3 !== 0;
          return {
            champion,
            championIconUrl: `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${champion}.png`,
            win,
            kills: 3 + ((index + matchIndex) % 8),
            deaths: 1 + (matchIndex % 5),
            assists: 2 + ((index * 2 + matchIndex) % 10),
            queue: "Solo/Duo",
          };
        }),
      },
    };
  });
}

// Cola global por proceso: evita que varios perfiles disparen peticiones a Riot al mismo tiempo.
let nextRiotRequestAt = 0;
async function waitForRiotSlot() {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextRiotRequestAt);
  nextRiotRequestAt = scheduledAt + RIOT_REQUEST_GAP_MS;
  const delay = scheduledAt - now;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}
async function riotFetch(url, apiKey, attempt = 0) {
    await waitForRiotSlot();
const res = await fetch(url, { headers: { [RIOT_KEY_HEADER]: apiKey } });
  if (res.status === 429 && attempt < 1) {
    const retryAfterSeconds = Number(res.headers.get("retry-after") || 0);
    // Solo reintentamos bloqueos cortos; en uno largo servimos caché en vez de
    // mantener la función esperando y empeorar la ráfaga de solicitudes.
    if (retryAfterSeconds > 0 && retryAfterSeconds <= 5) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      return riotFetch(url, apiKey, attempt + 1);
    }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Riot API ${res.status} en ${url}: ${body}`);
    err.status = res.status;
    err.retryAfter = res.headers.get("retry-after");
    throw err;
  }
  return res.json();
}

async function getDdragonVersion() {
  if (cache.ddragonVersion) return cache.ddragonVersion;
  try {
    const versions = await fetch(
      "https://ddragon.leagueoflegends.com/api/versions.json"
    ).then((r) => r.json());
    cache.ddragonVersion = versions[0];
  } catch {
    cache.ddragonVersion = "14.1.1"; // fallback razonable
  }
  return cache.ddragonVersion;
}

async function getChampionData(ddragonVersion) {
  if (cache.championData) return cache.championData;
  try {
    const championData = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/es_ES/champion.json`
    ).then((r) => r.json());
    cache.championData = championData.data || {};
  } catch {
    cache.championData = {};
  }
  return cache.championData;
}

const ROLE_KEYS = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
function normalizeRole(participant) {
  const role = String(participant?.teamPosition || participant?.individualPosition || "").toUpperCase();
  return ROLE_KEYS.has(role) ? role : null;
}
function createRoleEntry() {
  return { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, damage: 0, cs: 0, vision: 0, objectives: 0, duration: 0, champions: new Map() };
}
function summarizeRoleStats(roleStats) {
  return Object.fromEntries(Object.entries(roleStats).map(([role, entry]) => {
    const minutes = Math.max(1, entry.duration / 60);
    const champions = Array.from(entry.champions.values())
      .map((champion) => ({ ...champion, winRate: champion.games ? Math.round((champion.wins / champion.games) * 100) : 0 }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
    return [role, {
      games: entry.games,
      wins: entry.wins,
      losses: entry.games - entry.wins,
      winRate: entry.games ? Math.round((entry.wins / entry.games) * 100) : 0,
      kda: ((entry.kills + entry.assists) / Math.max(1, entry.deaths)).toFixed(2),
      damagePerMin: Math.round(entry.damage / minutes),
      csPerMin: Number((entry.cs / minutes).toFixed(1)),
      visionPerMin: Number((entry.vision / minutes).toFixed(1)),
      objectivesPerGame: Number((entry.objectives / Math.max(1, entry.games)).toFixed(1)),
      topChampion: champions[0] || null,
    }];
  }));
}
async function getRecentMatchStats(puuid, apiKey, ddragonVersion, query = "start=0&count=8") {
  try {
    const matchIds = await riotFetch(
      `https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?${query}`,
      apiKey
    );

    // Riot limita las peticiones por segundo. Con varios jugadores, pedir las
    // partidas en bloques pequeños evita que todas las estadísticas fallen a la vez.
    const matchDetails = [];
    const recentIds = matchIds.slice(0, 8);
    for (let index = 0; index < recentIds.length; index += 2) {
      const batch = recentIds.slice(index, index + 2);
      const details = await Promise.all(
        batch.map((matchId) =>
          riotFetch(`https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/${matchId}`, apiKey)
        )
      );
      matchDetails.push(...details);
    }

    const championStats = new Map();
    const recentMatches = [];
    const roleStats = {};
    let matchesPlayed = 0;
    let wins = 0;
    let losses = 0;
    let assists = 0;
    let pentakills = 0;
    let quadras = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;

    matchDetails.forEach((match) => {
      const participant = match?.info?.participants?.find((p) => p.puuid === puuid);
      if (!participant) return;

      matchesPlayed += 1;
      if (participant.win) {
        wins += 1;
        currentWinStreak += 1;
        currentLossStreak = 0;
        longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
      } else {
        losses += 1;
        currentLossStreak += 1;
        currentWinStreak = 0;
        longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
      }

      assists += participant.assists || 0;
      pentakills += participant.pentaKills || 0;
      quadras += participant.quadraKills || 0;

      const role = normalizeRole(participant);
      if (role) {
        const roleEntry = roleStats[role] || (roleStats[role] = createRoleEntry());
        const duration = Number(match?.info?.gameDuration || 0);
        const durationSeconds = duration > 10000 ? duration / 1000 : duration;
        roleEntry.games += 1;
        roleEntry.wins += participant.win ? 1 : 0;
        roleEntry.kills += participant.kills || 0;
        roleEntry.deaths += participant.deaths || 0;
        roleEntry.assists += participant.assists || 0;
        roleEntry.damage += participant.totalDamageDealtToChampions || 0;
        roleEntry.cs += (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0);
        roleEntry.vision += participant.visionScore || 0;
        roleEntry.objectives += (participant.dragonKills || 0) + (participant.baronKills || 0) + (participant.objectivesStolen || 0);
        roleEntry.duration += durationSeconds;
        const roleChampion = roleEntry.champions.get(participant.championName) || { name: participant.championName || "Desconocido", games: 0, wins: 0 };
        roleChampion.games += 1;
        roleChampion.wins += participant.win ? 1 : 0;
        roleEntry.champions.set(participant.championName, roleChampion);
      }
      const name = participant.championName || "Desconocido";
      recentMatches.push({
        champion: name,
        championIconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${name}.png`,
        win: Boolean(participant.win),
        kills: participant.kills || 0,
        deaths: participant.deaths || 0,
        assists: participant.assists || 0,
        queue: match?.info?.queueId === 420 ? "Solo/Duo" : "Partida reciente",
        duration: match?.info?.gameDuration || 0,
        cs: (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0),
        items: [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].filter((itemId) => Number(itemId) > 0),
      });
      const entry = championStats.get(name) || {
        name,
        games: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
      entry.games += 1;
      entry.wins += participant.win ? 1 : 0;
      entry.losses += participant.win ? 0 : 1;
      entry.kills += participant.kills || 0;
      entry.deaths += participant.deaths || 0;
      entry.assists += participant.assists || 0;
      championStats.set(name, entry);
    });

    const championEntries = Array.from(championStats.values())
      .map((entry) => ({
        ...entry,
        winRate: entry.games ? Math.round((entry.wins / entry.games) * 100) : 0,
        kda: entry.games ? ((entry.kills + entry.assists) / Math.max(1, entry.deaths)).toFixed(2) : "0.00",
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate);

    const otpChampion = [...championEntries].sort((a, b) => b.games - a.games || b.winRate - a.winRate)[0] || null;

    return {
      matchesPlayed,
      wins,
      losses,
      assists,
      pentakills,
      quadras,
      longestWinStreak,
      longestLossStreak,
      championEntries,
      otpChampion,
      goodWinrateChampions: championEntries.filter((entry) => entry.games >= 2 && entry.winRate >= 60).slice(0, 3),
      recentMatches,
      roleStats: summarizeRoleStats(roleStats),
    };
  } catch (error) {
    console.warn("No se pudieron cargar estadísticas recientes:", error.message);
    return {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      assists: 0,
      pentakills: 0,
      quadras: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      championEntries: [],
      otpChampion: null,
      goodWinrateChampions: [],
      recentMatches: [],
      roleStats: {},
    };
  }
}

async function getChallengeStats(puuid, apiKey, ddragonVersion) {
  const now = Date.now();
  if (now < CHALLENGE_START_AT) {
    return { matchesPlayed: 0, periodStatus: "upcoming" };
  }

  const endTime = Math.min(now, CHALLENGE_END_AT);
  const query = `start=0&count=100&startTime=${Math.floor(CHALLENGE_START_AT / 1000)}&endTime=${Math.floor(endTime / 1000)}`;
  const stats = await getRecentMatchStats(puuid, apiKey, ddragonVersion, query);
  return { ...stats, periodStatus: now >= CHALLENGE_END_AT ? "completed" : "active" };
}
async function fetchPlayer(player, apiKey, ddragonVersion) {
  const { gameName, tagLine } = player;

  // 1) Riot ID -> PUUID (ruta regional: americas)
  const account = await riotFetch(
    `https://${REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName
    )}/${encodeURIComponent(tagLine)}`,
    apiKey
  );

  // 2) PUUID -> datos de invocador (ruta de plataforma: la1/na1)
  const summoner = await riotFetch(
    `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
    apiKey
  );

  // 3) PUUID -> entradas de ranked
  const entries = await riotFetch(
    `https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
    apiKey
  );

  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  const recentStats = await getRecentMatchStats(account.puuid, apiKey, ddragonVersion);
  // Vista previa antes del inicio: usa el historial reciente en vez de dejar Premios vacío.
  const awardStats = Date.now() < CHALLENGE_START_AT
    ? { ...recentStats, periodStatus: "preview" }
    : await getChallengeStats(account.puuid, apiKey, ddragonVersion);

  return {
    gameName: account.gameName || gameName,
    tagLine: account.tagLine || tagLine,
    label: player.label || gameName,
    goalTier: player.goalTier || null,
    startRank: player.startRank || null,
    profileIconId: summoner.profileIconId,
    profileIconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${summoner.profileIconId}.png`,
    summonerLevel: summoner.summonerLevel,
    ranked: solo
      ? {
          tier: solo.tier,
          rank: solo.rank,
          leaguePoints: solo.leaguePoints,
          wins: solo.wins,
          losses: solo.losses,
          hotStreak: solo.hotStreak,
        }
      : null,
    opggUrl: `https://www.op.gg/summoners/lan/${encodeURIComponent(
      account.gameName || gameName
    )}-${encodeURIComponent(account.tagLine || tagLine)}`,
    stats: recentStats,
    awardStats,
  };
}

function sortLeaderboard(players) {
  return [...players].sort((a, b) => {
    if (!a.ranked && !b.ranked) return 0;
    if (!a.ranked) return 1; // sin rango va al final
    if (!b.ranked) return -1;

    const tierDiff =
      TIER_RANK.indexOf(a.ranked.tier) - TIER_RANK.indexOf(b.ranked.tier);
    if (tierDiff !== 0) return tierDiff;

    // Dentro de tiers apex (master+) no hay divisiones reales: se ordena por LP
    if (APEX_TIERS.has(a.ranked.tier)) {
      return b.ranked.leaguePoints - a.ranked.leaguePoints;
    }

    const divDiff =
      DIVISION_RANK[a.ranked.rank] - DIVISION_RANK[b.ranked.rank];
    if (divDiff !== 0) return divDiff;

    return b.ranked.leaguePoints - a.ranked.leaguePoints;
  });
}

module.exports = async (req, res) => {
  // CORS se mantiene para permitir el acceso desde el frontend.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = (process.env.RIOT_API_KEY || "").trim();
  const now = Date.now();
  const useDemoData = req.query && req.query.demo === "1";

  if (!apiKey) {
    if (!useDemoData) {
      return res.status(500).json({
        error: "Falta configurar RIOT_API_KEY. Agrega la clave en Render o en tu entorno local para usar datos reales.",
      });
    }

    const fallbackPlayers = sortLeaderboard(buildFallbackLeaderboard(now));
    return res.status(200).json({
      players: fallbackPlayers,
      updatedAt: now,
      cached: false,
      nextUpdateAt: now + CACHE_TTL_MS,
      warning: "Modo demo activado; mostrando datos locales de ejemplo.",
    });
  }
  const isStale = now - cache.fetchedAt > CACHE_TTL_MS;
  if (cache.data && !isStale) {
    return res.status(200).json({
      players: cache.data,
      updatedAt: cache.fetchedAt,
      cached: true,
      nextUpdateAt: cache.fetchedAt + CACHE_TTL_MS,
    });
  }


  try {
    const ddragonVersion = await getDdragonVersion();
    // Procesar dos perfiles a la vez mantiene las llamadas de Match-v5 por
    // debajo del límite de Riot sin sacrificar los datos del resto del grupo.
    const settled = [];
    for (let index = 0; index < PLAYERS.length; index += 2) {
      const batch = PLAYERS.slice(index, index + 2);
      const batchResults = await Promise.allSettled(
        batch.map((player) => fetchPlayer(player, apiKey, ddragonVersion))
      );
      settled.push(...batchResults);
    }
    const results = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failedPlayers = settled
      .map((result, index) => ({ result, player: PLAYERS[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ player }) => `${player.gameName}#${player.tagLine}`);

    if (!results.length) {
      const reasons = settled
        .map((result) => result.status === "rejected" ? result.reason?.message : "")
        .filter(Boolean)
        .slice(0, 2)
        .join(" | ");
      throw new Error(`No se pudo actualizar ningún jugador del reto. ${reasons}`);
    }

    const sorted = sortLeaderboard(results);
    cache = { data: sorted, fetchedAt: now, ddragonVersion };

    return res.status(200).json({
      players: sorted,
      updatedAt: now,
      cached: false,
      nextUpdateAt: now + CACHE_TTL_MS,
      warning: failedPlayers.length
        ? `No se pudo actualizar: ${failedPlayers.join(", ")}. El resto de la tabla sí está disponible.`
        : undefined,
    });
  } catch (err) {
    console.error(err);
    // Si falla (ej. rate limit) pero hay cache vieja, mejor servir eso que nada
    if (cache.data) {
      return res.status(200).json({
        players: cache.data,
        updatedAt: cache.fetchedAt,
        cached: true,
        stale: true,
        nextUpdateAt: cache.fetchedAt + CACHE_TTL_MS,
        warning: "No se pudo refrescar; mostrando el último dato válido.",
      });
    }
    return res.status(502).json({ error: err.message });
  }
};
