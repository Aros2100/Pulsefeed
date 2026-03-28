create or replace function public.count_suspect_country_values()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from authors
  where country is not null
    and (
      country ~ '\d'
      or length(country) > 50
      or country ~ '^(Region|Province|District|Republic|State|Territory)'
    );
$$;

create or replace function public.count_country_alias_pairs()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from authors
  where country in ('Turkey', 'Türkiye', 'The Netherlands');
$$;
