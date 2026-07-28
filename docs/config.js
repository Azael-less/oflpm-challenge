// Frontend y backend viven en el mismo servicio de Render.
// Mantén esta ruta relativa para que funcione también en local y en producción.
window.OFLPM_CONFIG = {
  BACKEND_URL: "/api/leaderboard",
  REFRESH_MS: 30 * 60 * 1000, // 30 minutos, debe coincidir con CACHE_TTL_MS del backend
};