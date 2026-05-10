-- RPC to read cron.job_run_details stats for a named job.
-- Falls back gracefully if cron schema is inaccessible (exception handling).
CREATE OR REPLACE FUNCTION public.get_background_cron_stats(
  p_jobname text,
  p_since   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total int;
  v_ok    int;
  v_fail  int;
  v_last  timestamptz;
BEGIN
  BEGIN
    SELECT
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE r.status = 'succeeded')::int,
      COUNT(*) FILTER (WHERE r.status = 'failed')::int,
      MAX(r.start_time)
    INTO v_total, v_ok, v_fail, v_last
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname = p_jobname
      AND r.start_time >= p_since;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_total = 0 THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'total_runs', v_total,
    'succeeded',  v_ok,
    'failed',     v_fail,
    'last_run',   v_last
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_background_cron_stats(text, timestamptz) TO authenticated;
