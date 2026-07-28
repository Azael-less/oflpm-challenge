const crypto = require("crypto");
const { PLAYERS } = require("./players.js");

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;
const CLIP_FOLDER = "oflpm/plays";

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.");
  return { url, key };
}

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Faltan las variables de Cloudinary.");
  return { cloudName, apiKey, apiSecret };
}

function findPlayer(playerKey) {
  return PLAYERS.find((player) => `${player.gameName}#${player.tagLine}` === playerKey) || null;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 16 * 1024) throw new Error("Solicitud demasiado grande.");
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("El formato de la solicitud no es válido."); }
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function json(res, status, payload) {
  return res.status(status).json(payload);
}

async function listPlays(res) {
  const plays = await supabaseRequest("plays?status=eq.published&select=*&order=hearts.desc,laughs.desc,created_at.desc&limit=24");
  return json(res, 200, { plays });
}

async function createSignature(req, res) {
  const body = await readJson(req);
  if (!findPlayer(body.playerKey)) return json(res, 400, { error: "Jugador no válido." });
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = `folder=${CLIP_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(`${params}${apiSecret}`).digest("hex");
  return json(res, 200, { cloudName, apiKey, timestamp, signature, folder: CLIP_FOLDER });
}

async function createPlay(req, res) {
  const body = await readJson(req);
  const player = findPlayer(body.playerKey);
  const title = cleanText(body.title, MAX_TITLE_LENGTH);
  const description = cleanText(body.description, MAX_DESCRIPTION_LENGTH);
  const publicId = cleanText(body.publicId, 180);
  const videoUrl = cleanText(body.videoUrl, 600);
  const thumbnailUrl = cleanText(body.thumbnailUrl, 600);

  if (!player || !title || !publicId.startsWith(`${CLIP_FOLDER}/`) || !videoUrl.startsWith("https://")) {
    return json(res, 400, { error: "Los datos del clip no son válidos." });
  }

  const inserted = await supabaseRequest("plays", {
    method: "POST",
    body: JSON.stringify({
      player_key: body.playerKey,
      player_name: player.gameName,
      title,
      description: description || null,
      public_id: publicId,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl || null,
    }),
  });
  return json(res, 201, { play: inserted[0] });
}

async function reactToPlay(req, res, playId) {
  const body = await readJson(req);
  const voterId = cleanText(body.voterId, 80);
  const reaction = body.reaction === "laugh" ? "laugh" : "heart";
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(voterId)) return json(res, 400, { error: "Voto no válido." });
  const result = await supabaseRequest("rpc/react_to_play", {
    method: "POST",
    body: JSON.stringify({ p_play_id: playId, p_voter_id: voterId, p_reaction: reaction }),
  });
  return json(res, 200, result);
}

function requireAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  if (!expected || !crypto.timingSafeEqual(expectedHash, providedHash)) {
    const error = new Error("No autorizado.");
    error.status = 401;
    throw error;
  }
}

async function listAdminPlays(req, res) {
  requireAdmin(req);
  const plays = await supabaseRequest("plays?select=*&order=created_at.desc");
  return json(res, 200, { plays });
}

async function deleteAdminPlay(req, res, playId) {
  requireAdmin(req);
  const found = await supabaseRequest(`plays?id=eq.${playId}&select=*`);
  const play = found[0];
  if (!play) return json(res, 404, { error: "Play no encontrada." });
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash("sha1").update(`public_id=${play.public_id}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ public_id: play.public_id, timestamp: String(timestamp), api_key: apiKey, signature }).toString(),
  });
  if (!cloudResponse.ok) throw new Error("Cloudinary no permitió eliminar el vídeo.");
  await supabaseRequest(`plays?id=eq.${playId}`, { method: "DELETE" });
  return json(res, 200, { deleted: playId });
}
module.exports = async (req, res, pathname) => {
  try {
    if (req.method === "GET" && pathname === "/api/admin/plays") return listAdminPlays(req, res);
    const adminDeleteMatch = pathname.match(/^\/api\/admin\/plays\/([0-9a-f-]{36})$/i);
    if (req.method === "DELETE" && adminDeleteMatch) return deleteAdminPlay(req, res, adminDeleteMatch[1]);
    if (req.method === "GET" && pathname === "/api/plays") return listPlays(res);
    if (req.method === "POST" && pathname === "/api/plays/signature") return createSignature(req, res);
    if (req.method === "POST" && pathname === "/api/plays") return createPlay(req, res);
    const reactionMatch = pathname.match(/^\/api\/plays\/([0-9a-f-]{36})\/react$/i);
    if (req.method === "POST" && reactionMatch) return reactToPlay(req, res, reactionMatch[1]);
    return json(res, 404, { error: "Ruta de clips no encontrada." });
  } catch (error) {
    console.error("Plays API:", error.message);
    return json(res, error.status || 500, { error: error.message.includes("Faltan") || error.status ? error.message : "No se pudo procesar la solicitud de clips." });
  }
};