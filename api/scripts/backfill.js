// scripts/backfill.js
//
// Corre esto UNA sola vez (o cada vez que quieras ponerte al día rápido)
// para descargar TODAS las partidas Solo/Dúo del reto de cada jugador y
// guardarlas en Supabase de una vez, en vez de esperar varios ciclos de
// 30 minutos a que el trickle normal del leaderboard las vaya sincronizando
// de a 30 en 30.
//
// Uso (desde la raíz del proyecto, con Node 18+):
//
//   RIOT_API_KEY=tu_key \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key \
//   node scripts/backfill.js
//
// En Windows PowerShell:
//
//   $env:RIOT_API_KEY="tu_key"
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key"
//   node scripts/backfill.js
//
// Requisitos previos: ya debiste correr supabase-schema.sql (o el archivo
// que crea la tabla challenge_matches) en el SQL Editor de Supabase.

const { PLAYERS, REGIONAL } = require("../api/players.js");

const RIOT_API_KEY = (process.env.RIOT_API_KEY || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";

const RIOT_REQUEST_GAP_MS = 65; // ~15 solicitudes/segundo, bajo el límite de 20
const RIOT_KEY_HEADER = "X-Riot-Token";
const CHALLENGE_START_AT = Date.parse("2026-07-30T00:00:00-05:00");
const CHALLENGE_END_AT = Date.parse("2026-08-30T00:00:00-05:00");

if (!RIOT_API_KEY) {
  console.error("Falta RIOT_API_KEY en las variables de entorno.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  process.exit(1);
}

let nextRiotRequestAt = 0;
async function waitForRiotSlot() {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextRiotRequestAt);
  nextRiotRequestAt = scheduledAt + RIOT_REQUEST_GAP_MS;
  const delay = scheduledAt - now;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

async function riotFetch(url, attempt = 0) {
  await waitForRiotSlot();
  const res = await fetch(url, { headers: { [RIOT_KEY_HEADER]: RIOT_API_KEY } });
  if (res.status === 429 && attempt < 3) {
    const retryAfterSeconds = Number(res.headers.get("retry-after") || 2);
    console.warn(`  Rate limit, esperando ${retryAfterSeconds}s...`);
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
    return riotFetch(url, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Riot API ${res.status} en ${url}: ${body}`);
  }
  return res.json();
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function backfillPlayer(player) {
  const playerKey = `${player.gameName}#${player.tagLine}`;
  console.log(`\n${playerKey}`);

  const account = await riotFetch(
    `https://${REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`
  );

  const now = Date.now();
  const endTime = Math.min(now, CHALLENGE_END_AT);
  const query = `queue=420&startTime=${Math.floor(CHALLENGE_START_AT / 1000)}&endTime=${Math.floor(endTime / 1000)}`;

  // Riot pagina de a 100 máximo por request; recorremos todas las páginas
  // por si el jugador ya lleva más de 100 partidas en el reto.
  let allMatchIds = [];
  let start = 0;
  const pageSize = 100;
  while (true) {
    const page = await riotFetch(
      `https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/${account.puuid}/ids?${query}&start=${start}&count=${pageSize}`
    );
    allMatchIds.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }
  console.log(`  ${allMatchIds.length} partidas encontradas en el período del reto.`);

  if (!allMatchIds.length) return;

  const savedRows = await supabaseRequest(
    `challenge_matches?player_key=eq.${encodeURIComponent(playerKey)}&select=match_id&limit=1000`
  );
  const savedIds = new Set((savedRows || []).map((row) => row.match_id));
  const missingIds = allMatchIds.filter((id) => !savedIds.has(id));
  console.log(`  ${missingIds.length} nuevas por descargar (${savedIds.size} ya estaban guardadas).`);

  let saved = 0;
  for (let i = 0; i < missingIds.length; i += 5) {
    const batch = missingIds.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((matchId) =>
        riotFetch(`https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/${matchId}`)
      )
    );

    const rows = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const match = result.value;
        rows.push({
          player_key: playerKey,
          match_id: batch[index],
          game_end_at: match?.info?.gameEndTimestamp ? new Date(match.info.gameEndTimestamp).toISOString() : null,
          match_data: match,
        });
      } else {
        console.warn(`  Falló ${batch[index]}: ${result.reason?.message}`);
      }
    });

    if (rows.length) {
      await supabaseRequest("challenge_matches?on_conflict=player_key,match_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      saved += rows.length;
      console.log(`  Guardadas ${saved}/${missingIds.length}...`);
    }
  }
}

async function main() {
  console.log(`Backfill del reto — ${PLAYERS.length} jugadores.`);
  for (const player of PLAYERS) {
    try {
      await backfillPlayer(player);
    } catch (error) {
      console.error(`  Error con ${player.gameName}#${player.tagLine}: ${error.message}`);
    }
  }
  console.log("\nListo. El leaderboard ahora calculará rachas y premios sobre el historial completo del reto.");
}

main();