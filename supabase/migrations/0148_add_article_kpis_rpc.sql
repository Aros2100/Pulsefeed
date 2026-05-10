CREATE OR REPLACE FUNCTION public.get_article_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now            timestamptz := NOW();
  v_last_night     date;
  v_window_start   timestamptz;
  v_window_end     timestamptz;
  v_total          int;
  v_last_30        int;
  v_last_7         int;
  v_last_night_n   int;
BEGIN
  IF v_now < (CURRENT_DATE::text || ' 06:00:00+00')::timestamptz THEN
    v_last_night := CURRENT_DATE - 1;
  ELSE
    v_last_night := CURRENT_DATE;
  END IF;
  v_window_start := (v_last_night::text || ' 02:00:00+00')::timestamptz;
  v_window_end   := (v_last_night::text || ' 06:00:00+00')::timestamptz;

  SELECT
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM article_specialties s WHERE s.article_id = a.id AND s.specialty_match = true)),
    COUNT(*) FILTER (WHERE a.imported_at > v_now - INTERVAL '30 days' AND EXISTS (
      SELECT 1 FROM article_specialties s WHERE s.article_id = a.id AND s.specialty_match = true)),
    COUNT(*) FILTER (WHERE a.imported_at > v_now - INTERVAL '7 days' AND EXISTS (
      SELECT 1 FROM article_specialties s WHERE s.article_id = a.id AND s.specialty_match = true)),
    COUNT(*) FILTER (WHERE a.imported_at >= v_window_start AND a.imported_at < v_window_end AND EXISTS (
      SELECT 1 FROM article_specialties s WHERE s.article_id = a.id AND s.specialty_match = true))
  INTO v_total, v_last_30, v_last_7, v_last_night_n
  FROM articles a;

  RETURN jsonb_build_object(
    'total',             v_total,
    'last_30_days',      v_last_30,
    'last_7_days',       v_last_7,
    'last_night',        v_last_night_n,
    'last_night_date',   v_last_night::text,
    'avg_per_night_30d', ROUND(v_last_30::numeric / 30)::int,
    'avg_per_night_7d',  ROUND(v_last_7::numeric / 7)::int
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_article_kpis() TO authenticated;
