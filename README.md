# OFLPM Challenge — Leaderboard

Tabla en vivo de elo/LP/wins-losses para el reto con tus amigos de LoL.
Dos piezas: **backend** (Vercel, guarda tu API key y consulta a Riot) y
**frontend** (GitHub Pages, la página que ven todos).

```
oflpm-challenge/
├── api/
│   ├── leaderboard.js   ← función serverless que llama a la API de Riot
│   └── players.js       ← lista de jugadores del reto (edítala aquí)
├── docs/                ← esto es lo que se publica en GitHub Pages
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── config.js        ← aquí pegas la URL de tu backend en Vercel
├── package.json
└── vercel.json
```

## 1. Sube el proyecto a GitHub

```bash
cd oflpm-challenge
git init
git add .
git commit -m "OFLPM Challenge leaderboard"
gh repo create oflpm-challenge --public --source=. --push
# o crea el repo manualmente en github.com y haz git remote add + push
```

## 2. Despliega el backend en Vercel

1. Entra a **https://vercel.com**, inicia sesión con GitHub.
2. **Add New → Project** → selecciona el repo `oflpm-challenge`.
3. Vercel detecta la carpeta `api/` automáticamente como funciones serverless. No cambies nada del build.
4. Antes de darle **Deploy**, ve a **Environment Variables** y agrega:
   - `RIOT_API_KEY` = tu key de developer.riotgames.com (la de desarrollo expira cada 24h — cuando tengas la Personal Key aprobada, reemplázala aquí y listo, no hay que tocar código).
5. Dale **Deploy**. Al terminar te da una URL tipo `https://oflpm-challenge.vercel.app`.
6. Prueba que funcione entrando a `https://oflpm-challenge.vercel.app/api/leaderboard` en el navegador — debería devolver JSON con los 5 jugadores.

**Importante:** cada vez que la key de desarrollo expire (24h), tendrás que ir a developer.riotgames.com, regenerarla, y pegar la nueva en Vercel → Settings → Environment Variables → editar `RIOT_API_KEY` → Redeploy. Por eso conviene tramitar la Personal API Key cuanto antes.

## 3. Conecta el frontend con tu backend

Edita `docs/config.js`:

```js
window.OFLPM_CONFIG = {
  BACKEND_URL: "https://oflpm-challenge.vercel.app/api/leaderboard", // tu URL real
  REFRESH_MS: 35 * 60 * 1000,
};
```

Sube el cambio (`git add`, `commit`, `push`).

## 4. Activa GitHub Pages

1. En tu repo de GitHub → **Settings → Pages**.
2. En **Source**, elige **Deploy from a branch**.
3. Branch: `main`, carpeta: **/docs**. Guardar.
4. En un par de minutos tu página queda en `https://tu-usuario.github.io/oflpm-challenge/`.

## Cómo funciona la actualización automática

- El backend cachea la respuesta de Riot por 35 minutos. Si alguien entra a la página antes de que se cumpla ese tiempo, recibe el dato cacheado (rápido, no gasta rate limit).
- Si pasaron los 35 minutos, la siguiente visita dispara una consulta fresca a Riot y renueva la cache.
- El frontend además se refresca solo cada 35 minutos mientras la pestaña siga abierta, y muestra una cuenta regresiva hasta la próxima actualización.
- Hay un botón "Actualizar ahora" que fuerza un refresh saltándose la cache (usa `?refresh=1`).

## Agregar/quitar jugadores

Edita `api/players.js`, agrega o quita objetos `{ gameName, tagLine }` con el Riot ID exacto (como aparece en el cliente de LoL, sin el `#`). También puedes definir una meta personal por jugador con `goalTier` para que la tabla dibuje el progreso hasta ese rango.

Ejemplo:

```js
{ gameName: "akang", tagLine: "lan", goalTier: "DIAMOND" }
```

Los valores válidos de `goalTier` son: `IRON`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `EMERALD`, `DIAMOND`, `MASTER`, `GRANDMASTER` y `CHALLENGER`.

Vuelve a hacer push — Vercel redespliega solo.

## Pasar de LAN a NA

En `api/players.js` cambia:

```js
const PLATFORM = "na1"; // antes "la1"
```

`REGIONAL` se queda igual (`"americas"` cubre ambas). También actualiza las tagLines de cada jugador si cambian al migrar de cuenta.

## Notas

- El link de cada fila lleva al perfil de OP.GG (`op.gg/summoners/lan/...`). Si alguien migra a NA, ese link también hay que ajustarlo (cambia `/lan/` por `/na/` en `api/leaderboard.js`, línea de `opggUrl`).
- Las flechitas de tendencia (▲/▼) junto al LP comparan contra la última vez que ESE navegador cargó la página (se guarda en `localStorage`), no es un historial global — cada persona ve su propia comparación según cuándo entró.
- Si Riot te tumba la conexión por rate limit, el backend sirve la última respuesta válida en vez de romper la página.
