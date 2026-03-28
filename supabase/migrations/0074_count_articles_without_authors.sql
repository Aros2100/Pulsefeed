create or replace function public.count_articles_without_authors()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from articles a
  where not exists (
    select 1 from article_authors aa where aa.article_id = a.id
  );
$$;
