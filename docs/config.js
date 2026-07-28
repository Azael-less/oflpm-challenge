// config.js
// Cambia esta URL por la de tu backend una vez lo despliegues en Vercel.
// Ejemplo: "https://oflpm-challenge.vercel.app/api/leaderboard"
window.OFLPM_CONFIG = {
  BACKEND_URL: "https://oflpm-challenge.vercel.app/api/leaderboard",
  REFRESH_MS: 35 * 60 * 1000, // 35 minutos, debe coincidir con CACHE_TTL_MS del backend
};
