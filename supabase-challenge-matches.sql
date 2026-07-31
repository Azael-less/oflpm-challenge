-- Historial persistente de partidas Solo/Dúo del reto.
-- Ejecuta este archivo una vez en Supabase > SQL Editor.
create table if not exists public.challenge_matches (
  player_key text not null,
  match_id text not null,
  game_end_at timestamptz,
  match_data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_key, match_id)
);

create index if not exists challenge_matches_player_end_idx
  on public.challenge_matches (player_key, game_end_at desc);

alter table public.challenge_matches enable row level security;
-- Solo el backend usa la SERVICE_ROLE; no se exponen políticas públicas.