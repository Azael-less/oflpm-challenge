# OFLPM Challenge

Panel privado para seguir el reto de League of Legends: progreso hacia metas de rango, ranking actual, perfiles, premios y una galería de jugadas del equipo.

La aplicación se sirve desde un único Web Service de Render. El frontend vive en `docs/`; el servidor Node expone las rutas API y mantiene las claves fuera del navegador.

## Ejecutar en local

Requiere Node.js 18 o superior. Crea `.env` en la raíz con las variables que uses:

```env
RIOT_API_KEY=RGAPI-tu-clave-de-Riot
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=tu-secret-key
ADMIN_PASSWORD=una-contraseña-larga-y-privada
```

Nunca subas `.env` al repositorio ni compartas secretos en el frontend.

```bash
npm start
```

Abre `http://localhost:3000`.

## Render

1. Crea un **Web Service** en Render conectado al repositorio.
2. Usa `npm install` como Build Command y `npm start` como Start Command.
3. Agrega en **Environment** las mismas variables necesarias de `.env`.
4. Despliega. El frontend usa rutas relativas, por lo que no debes cambiar `docs/config.js` cuando todo vive en el mismo servicio.

## Riot: caché y límites

- Los datos se actualizan automáticamente cada 30 minutos.
- No hay refresco manual público.
- Las consultas pasan por una cola de aproximadamente 15 solicitudes/segundo.
- Si Riot falla, el backend intenta conservar el último resultado disponible.
- Una clave de desarrollo de Riot expira; actualízala en Render cuando la renueves.

## Jugadores y metas

Edita `api/players.js` para agregar o modificar jugadores:

```js
{ gameName: "nick", tagLine: "TAG", goalTier: "MASTER", startRank: { tier: "EMERALD", rank: "I", leaguePoints: 25 } }
```

Para migrar a NA, cambia `PLATFORM` de `la1` a `na1`. `REGIONAL` permanece como `americas`.

La vista **Progreso del reto** se ordena por cercanía actual a la meta de cada jugador. Si hay empate, se usa el rango/LP real como desempate.

## Premios

Los premios normales se calculan desde partidas reales de Riot. Los premios de rol usan la posición real de la partida y requieren al menos 3 partidas en el rol:

- Mejor Top, Jungla, Mid, ADC y Support.
- Mayor soporte permanece como premio independiente de asistencias acumuladas.
- Cuando no hay datos reales, la vista muestra un estado de espera; no inventa ganadores.

## Clips y votos

- Cloudinary almacena y entrega los MP4; el navegador sube directamente con una firma temporal del backend.
- Supabase guarda los clips, reacciones y moderación.
- ❤️ define **Mejor jugada** y la portada de “Jugada de la semana”.
- 😂 define **Jugada más graciosa**.

Antes de usar clips en un proyecto nuevo, ejecuta en Supabase → **SQL Editor**:

1. `supabase-schema.sql`
2. `supabase-reactions-migration.sql`
3. `supabase-reactions-toggle.sql`
4. supabase-challenge-matches.sql (historial de partidas y premios del reto)

## Administración privada

La moderación de clips está en:

```text
/admin.html
```

No está enlazada desde la página pública y pide `ADMIN_PASSWORD`. Al eliminar una jugada se elimina su registro de Supabase y el vídeo correspondiente de Cloudinary.

## Archivos principales

- `api/players.js`: jugadores, región y metas.
- `api/leaderboard.js`: Riot, estadísticas, premios y caché.
- `api/plays.js`: clips, reacciones, Cloudinary, Supabase y administración.
- `docs/script.js`: UI, ranking, modales y carrusel.
- `docs/style.css`: estilos.
- `supabase-*.sql`: estructura y migraciones de la base de datos.