create table if not exists public.city_aliases (
  id         uuid        primary key default gen_random_uuid(),
  alias      text        not null,
  canonical  text        not null,
  created_at timestamptz default now()
);

insert into public.city_aliases (alias, canonical) values
  ('Kobenhavn',    'Copenhagen'),
  ('New York City', 'New York'),
  ('St. Louis',    'St Louis'),
  ('Saint Louis',  'St Louis');

create or replace function public.count_city_alias_pairs()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from authors
  where city in (select alias from city_aliases);
$$;
