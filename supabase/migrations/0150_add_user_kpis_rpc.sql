CREATE OR REPLACE FUNCTION public.get_user_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_active   int;
  v_signups_30d    int;
  v_signups_7d     int;
  v_signups_24h    int;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE subscribed_at > NOW() - INTERVAL '30 days'),
    COUNT(*) FILTER (WHERE subscribed_at > NOW() - INTERVAL '7 days'),
    COUNT(*) FILTER (WHERE subscribed_at > NOW() - INTERVAL '24 hours')
  INTO v_total_active, v_signups_30d, v_signups_7d, v_signups_24h
  FROM users;

  RETURN jsonb_build_object(
    'total_active', v_total_active,
    'signups_30d',  v_signups_30d,
    'signups_7d',   v_signups_7d,
    'signups_24h',  v_signups_24h
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_kpis() TO authenticated;
