create or replace function public.get_authors_affiliation_too_long()
returns table(id uuid)
language sql
security definer
set search_path = public
as $$
  select id
  from authors
  where affiliations is not null
    and country is null
    and geo_source = 'parser'
    and length(affiliations[1]) > 350;
$$;
