create or replace function public.count_country_alias_pairs()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from authors
  where country in (select alias from country_aliases);
$$;
