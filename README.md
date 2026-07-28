# OFLPM Challenge

Tablero privado para seguir el reto de League of Legends: progreso individual hacia cada rango objetivo, ranking actual, estadísticas, premios y perfiles de jugador.

La aplicación se sirve completa desde un único servicio de **Render**. El frontend está en `docs/` y el backend consulta la API de Riot sin exponer la clave al navegador.

## Ejecutar en local

1. Instala Node.js 18 o superior.
2. Crea un archivo `.env` en la raíz:

```env
RIOT_API_KEY=RGAPI-tu-clave-de-Riot
```

3. Ejecuta:

```bash
npm start
```

Abre `http://localhost:3000`.

## Desplegar en Render

1. Sube este proyecto a un repositorio de GitHub.
2. En Render crea un **Web Service** y conecta el repositorio.
3. Configura:

| Campo | Valor |
| --- | --- |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |

4. En **Environment Variables**, agrega `RIOT_API_KEY` con tu clave de Riot.
5. Despliega y comparte la URL de Render, por ejemplo `https://tu-reto.onrender.com`.

`docs/config.js` usa `BACKEND_URL: "/api/leaderboard"`, por lo que no debes poner una URL externa mientras frontend y backend estén en este mismo servicio de Render.

## Límites de Riot y estabilidad

- El backend almacena los datos durante 30 minutos.
- Una actualización manual se limita a una cada 5 minutos.
- Las consultas a Riot pasan por una cola global de aproximadamente 15 por segundo, por debajo del máximo de 20 por segundo.
- Si Riot rechaza temporalmente una actualización, se conserva y muestra el último dato válido.

Con una clave de desarrollo, recuerda renovarla antes de que caduque y actualizar `RIOT_API_KEY` en Render. Nunca pongas esa clave en `docs/config.js` ni en el repositorio.

## Configuración del reto

- Jugadores, objetivos de rango y punto de partida: `api/players.js`.
- Lógica de datos y caché de Riot: `api/leaderboard.js`.
- Diseño del sitio: `docs/style.css` y `docs/script.js`.