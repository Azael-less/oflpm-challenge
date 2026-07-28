-- Pega este bloque completo en Supabase > SQL Editor y presiona Run.
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  player_key text not null,
  player_name text not null,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 240),
  public_id text not null unique,
  video_url text not null,
  thumbnail_url text,
  votes integer not null default 0 check (votes >= 0),
  hearts integer not null default 0 check (hearts >= 0),
  laughs integer not null default 0 check (laughs >= 0),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.play_votes (
  play_id uuid not null references public.plays(id) on delete cascade,
  voter_id text not null,
  created_at timestamptz not null default now(),
  primary key (play_id, voter_id, reaction)
);

create or replace function public.vote_for_play(p_play_id uuid, p_voter_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_play public.plays;
begin
  insert into public.play_votes (play_id, voter_id) values (p_play_id, p_voter_id)
  on conflict (play_id, voter_id) do nothing;
  if not found then
    raise exception 'Ya votaste por esta jugada.' using errcode = 'P0001';
  end if;
  update public.plays set votes = votes + 1 where id = p_play_id and status = 'published'
  returning * into updated_play;
  if updated_play.id is null then
    raise exception 'La jugada no existe o ya no está disponible.' using errcode = 'P0001';
  end if;
  return json_build_object('id', updated_play.id, 'votes', updated_play.votes);
end;
$$;

alter table public.plays enable row level security;
alter table public.play_votes enable row level security;
-- La app usa exclusivamente SERVICE_ROLE desde Render; no se crean políticas públicas.