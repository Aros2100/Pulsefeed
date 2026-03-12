-- 1) Opret indexed_date hvis den ikke findes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'indexed_date'
  ) THEN
    ALTER TABLE articles ADD COLUMN indexed_date DATE;
  END IF;
END $$;

-- 2) Populer fra indexed_year + indexed_week (mandag i ugen)
UPDATE articles
SET indexed_date = make_date(indexed_year, 1, 4) + ((indexed_week - 1) * 7) * INTERVAL '1 day'
WHERE indexed_year IS NOT NULL AND indexed_week IS NOT NULL AND indexed_date IS NULL;

-- 3) Index
CREATE INDEX IF NOT EXISTS idx_articles_indexed_date ON articles(indexed_date);

-- 4) KPI RPC
CREATE OR REPLACE FUNCTION get_kpi_overview(
  p_period text,              -- 'week', 'month', 'year'
  p_subspecialty text DEFAULT NULL  -- NULL = alle artikler
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_latest_date date;
  v_since date;
  v_total bigint;
  v_regions jsonb;
  v_period_label text;
  v_week int;
BEGIN
  -- Find seneste indexed_date
  SELECT max(indexed_date) INTO v_latest_date FROM articles;
  IF v_latest_date IS NULL THEN
    RETURN jsonb_build_object('totalArticles', 0, 'regions', '[]'::jsonb, 'periodLabel', 'Ingen data');
  END IF;

  -- Beregn since-dato
  v_since := CASE p_period
    WHEN 'week' THEN v_latest_date - INTERVAL '7 days'
    WHEN 'month' THEN v_latest_date - INTERVAL '30 days'
    WHEN 'year' THEN v_latest_date - INTERVAL '365 days'
    ELSE v_latest_date - INTERVAL '7 days'
  END;

  -- Period label
  v_week := EXTRACT(WEEK FROM v_latest_date);
  v_period_label := CASE p_period
    WHEN 'week' THEN 'Uge ' || v_week || ', ' || EXTRACT(YEAR FROM v_latest_date)::text
    WHEN 'month' THEN to_char(v_latest_date, 'TMMonth YYYY')
    WHEN 'year' THEN EXTRACT(YEAR FROM v_latest_date)::text
  END;

  -- Total articles
  SELECT count(*) INTO v_total
  FROM articles
  WHERE indexed_date > v_since
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai));

  -- Regions
  SELECT coalesce(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.count DESC), '[]'::jsonb)
  INTO v_regions
  FROM (
    SELECT r AS name, count(*) AS count
    FROM articles, unnest(article_regions) AS r
    WHERE indexed_date > v_since
      AND article_regions IS NOT NULL
      AND article_regions != '{}'
      AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai))
    GROUP BY r
    ORDER BY count DESC
  ) sub;

  RETURN jsonb_build_object(
    'totalArticles', v_total,
    'regions', v_regions,
    'periodLabel', v_period_label
  );
END;
$$;
