CREATE OR REPLACE FUNCTION public.count_articles_by_specialty_multi(
  p_specialty       text,
  p_specialty_match text,
  p_subspecialties  text[]  DEFAULT NULL,
  p_article_types   text[]  DEFAULT NULL,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_geo_continent   text    DEFAULT NULL,
  p_geo_region      text    DEFAULT NULL,
  p_geo_country     text    DEFAULT NULL,
  p_geo_state       text    DEFAULT NULL,
  p_geo_city        text    DEFAULT NULL,
  p_circle          integer DEFAULT NULL,
  p_search          text    DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)
  FROM public.article_specialties asp
  JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE
      WHEN p_specialty_match = 'true'  THEN asp.specialty_match = true
      WHEN p_specialty_match = 'false' THEN asp.specialty_match = false
      WHEN p_specialty_match = 'null'  THEN asp.specialty_match IS NULL
      ELSE true
    END
    AND (p_subspecialties IS NULL OR a.subspecialty_ai && p_subspecialties)
    AND (
      p_article_types IS NULL
      OR ('Unclassified' = ANY(p_article_types) AND a.article_type IS NULL)
      OR a.article_type = ANY(p_article_types)
    )
    AND (p_date_from IS NULL OR a.published_date >= p_date_from)
    AND (p_date_to   IS NULL OR a.published_date <= p_date_to)
    AND (p_geo_continent IS NULL OR a.geo_continent = p_geo_continent)
    AND (p_geo_region    IS NULL OR a.geo_region    = p_geo_region)
    AND (p_geo_country   IS NULL OR a.geo_country   = p_geo_country)
    AND (p_geo_state     IS NULL OR a.geo_state     = p_geo_state)
    AND (p_geo_city      IS NULL OR a.geo_city      = p_geo_city)
    AND (p_circle        IS NULL OR a.circle        = p_circle)
    AND (p_search        IS NULL OR a.title ILIKE '%' || p_search || '%' OR a.journal_abbr ILIKE '%' || p_search || '%');
$$;

CREATE OR REPLACE FUNCTION public.get_article_ids_by_specialty_paged_multi(
  p_specialty       text,
  p_specialty_match text,
  p_limit           integer,
  p_offset          integer,
  p_subspecialties  text[]  DEFAULT NULL,
  p_article_types   text[]  DEFAULT NULL,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_sort_by         text    DEFAULT 'published_date',
  p_sort_dir        text    DEFAULT 'desc',
  p_geo_continent   text    DEFAULT NULL,
  p_geo_region      text    DEFAULT NULL,
  p_geo_country     text    DEFAULT NULL,
  p_geo_state       text    DEFAULT NULL,
  p_geo_city        text    DEFAULT NULL,
  p_circle          integer DEFAULT NULL,
  p_search          text    DEFAULT NULL
)
RETURNS TABLE(article_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT asp.article_id
  FROM public.article_specialties asp
  JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE
      WHEN p_specialty_match = 'true'  THEN asp.specialty_match = true
      WHEN p_specialty_match = 'false' THEN asp.specialty_match = false
      WHEN p_specialty_match = 'null'  THEN asp.specialty_match IS NULL
      ELSE true
    END
    AND (p_subspecialties IS NULL OR a.subspecialty_ai && p_subspecialties)
    AND (
      p_article_types IS NULL
      OR ('Unclassified' = ANY(p_article_types) AND a.article_type IS NULL)
      OR a.article_type = ANY(p_article_types)
    )
    AND (p_date_from IS NULL OR a.published_date >= p_date_from)
    AND (p_date_to   IS NULL OR a.published_date <= p_date_to)
    AND (p_geo_continent IS NULL OR a.geo_continent = p_geo_continent)
    AND (p_geo_region    IS NULL OR a.geo_region    = p_geo_region)
    AND (p_geo_country   IS NULL OR a.geo_country   = p_geo_country)
    AND (p_geo_state     IS NULL OR a.geo_state     = p_geo_state)
    AND (p_geo_city      IS NULL OR a.geo_city      = p_geo_city)
    AND (p_circle        IS NULL OR a.circle        = p_circle)
    AND (p_search        IS NULL OR a.title ILIKE '%' || p_search || '%' OR a.journal_abbr ILIKE '%' || p_search || '%')
  ORDER BY
    CASE WHEN p_sort_by = 'published_date' AND p_sort_dir = 'desc' THEN a.published_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'published_date' AND p_sort_dir = 'asc'  THEN a.published_date END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'imported_at'    AND p_sort_dir = 'desc' THEN a.imported_at    END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'imported_at'    AND p_sort_dir = 'asc'  THEN a.imported_at    END ASC  NULLS LAST,
    a.published_date DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;
