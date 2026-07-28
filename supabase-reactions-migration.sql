-- Ejecuta este bloque una vez en Supabase > SQL Editor.
-- Conserva los votos existentes como corazones.
alter table public.plays add column if not exists hearts integer not null default 0;
alter table public.plays add column if not exists laughs integer not null default 0;
update public.plays set hearts = greatest(hearts, votes) where hearts = 0;

alter table public.play_votes add column if not exists reaction text not null default 'heart';
alter table public.play_votes drop constraint if exists play_votes_pkey;
alter table public.play_votes add constraint play_votes_pkey primary key (play_id, voter_id, reaction);
alter table public.play_votes drop constraint if exists play_votes_reaction_check;
alter table public.play_votes add constraint play_votes_reaction_check check (reaction in ('heart', 'laugh'));

create or replace function public.react_to_play(p_play_id uuid, p_voter_id text, p_reaction text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_play public.plays;
  was_removed boolean := false;
begin
  if p_reaction not in ('heart', 'laugh') then
    raise exception 'Reacción no válida.' using errcode = 'P0001';
  end if;

  delete from public.play_votes
  where play_id = p_play_id and voter_id = p_voter_id and reaction = p_reaction;

  if found then
    was_removed := true;
    update public.plays
    set hearts = greatest(0, hearts - case when p_reaction = 'heart' then 1 else 0 end),
        laughs = greatest(0, laughs - case when p_reaction = 'laugh' then 1 else 0 end)
    where id = p_play_id and status = 'published'
    returning * into updated_play;
  else
    insert into public.play_votes (play_id, voter_id, reaction)
    values (p_play_id, p_voter_id, p_reaction);
    update public.plays
    set hearts = hearts + case when p_reaction = 'heart' then 1 else 0 end,
        laughs = laughs + case when p_reaction = 'laugh' then 1 else 0 end
    where id = p_play_id and status = 'published'
    returning * into updated_play;
  end if;

  if updated_play.id is null then
    raise exception 'La jugada no existe o ya no está disponible.' using errcode = 'P0001';
  end if;
  return json_build_object(
    'id', updated_play.id,
    'hearts', updated_play.hearts,
    'laughs', updated_play.laughs,
    'active', not was_removed,
    'reaction', p_reaction
  );
end;
$$;