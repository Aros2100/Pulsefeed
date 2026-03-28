create or replace function public.count_affiliation_too_long()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from authors
  where affiliations is not null
    and country is null
    and geo_source = 'parser'
    and length(affiliations[1]) > 350;
$$;
