create or replace function public.count_articles_with_mismatch()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from articles a
  where a.authors is not null
    and json_array_length(a.authors::json) != (
      select count(*) from article_authors aa where aa.article_id = a.id
    ) + (
      select count(*) from rejected_authors ra where ra.article_id = a.id
    );
$$;
