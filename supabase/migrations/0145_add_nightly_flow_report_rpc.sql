-- Helper: human-readable duration
CREATE OR REPLACE FUNCTION public.fmt_duration(p_sec int) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_sec IS NULL  THEN NULL
    WHEN p_sec < 60     THEN p_sec::text || 's'
    WHEN p_sec < 3600   THEN (p_sec / 60)::text || 'm'
    WHEN p_sec < 86400  THEN (p_sec / 3600)::text || 'h ' || ((p_sec % 3600) / 60)::text || 'm'
    ELSE (p_sec / 86400)::text || 'd ' || ((p_sec % 86400) / 3600)::text || 'h'
  END;
$$;

-- Helper: build one scoring-batch box.
-- NULL run_kind rows (pre-migration) are attributed to 'new' (rarer than rescore).
CREATE OR REPLACE FUNCTION public._nfr_scoring_box(
  p_heading       text,
  p_technical     text,
  p_module        text,
  p_run_kind      text,
  p_ws            timestamptz,
  p_we            timestamptz,
  p_extra_details jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_b record;
  v_status       text;
  v_flag         text;
  v_sub_end      int;
  v_ing_lag      int;
  v_total        int;
  v_lat          jsonb;
BEGIN
  SELECT
    COALESCE(SUM((stats->>'scored')::int),   0)  AS scored,
    COALESCE(SUM((stats->>'failed')::int),   0)  AS failed,
    COALESCE(SUM((stats->>'approved')::int), 0)  AS approved,
    COALESCE(SUM((stats->>'rejected')::int), 0)  AS rejected,
    MAX(anthropic_batch_id)                       AS anthropic_batch_id,
    MAX(prompt_version)                           AS prompt_version,
    MIN(submitted_at)                             AS sub_at,
    MAX(ended_at)                                 AS end_at,
    MAX(ingested_at)                              AS ing_at
  INTO v_b
  FROM scoring_batches
  WHERE module = p_module
    AND submitted_at >= p_ws
    AND submitted_at <  p_we
    AND (
      CASE
        WHEN p_run_kind = 'new'     THEN run_kind = 'new'     OR run_kind IS NULL
        WHEN p_run_kind = 'rescore' THEN run_kind = 'rescore'
        ELSE FALSE
      END
    );

  IF v_b.sub_at IS NULL THEN
    RETURN jsonb_build_object(
      'status',         'expected_silent',
      'heading',        p_heading,
      'technical_name', p_technical,
      'details', jsonb_build_object(
        'scored', 0, 'failed', 0,
        'anthropic_batch_id', NULL, 'prompt_version', NULL,
        'latency', NULL
      ) || COALESCE(p_extra_details, '{}'::jsonb),
      'timing', NULL
    );
  END IF;

  IF v_b.end_at IS NULL THEN
    IF EXTRACT(EPOCH FROM (NOW() - v_b.sub_at)) > 4*3600 THEN
      v_flag := 'stuck_at_anthropic'; v_status := 'warn';
    ELSE
      v_flag := NULL; v_status := 'ok';
    END IF;
  ELSIF v_b.ing_at IS NULL THEN
    IF EXTRACT(EPOCH FROM (NOW() - v_b.end_at)) > 30*60 THEN
      v_flag := 'stuck_in_ingest'; v_status := 'warn';
    ELSE
      v_flag := NULL; v_status := 'ok';
    END IF;
  ELSE
    v_total := EXTRACT(EPOCH FROM (v_b.ing_at - v_b.sub_at))::int;
    IF    v_total >= 180*60 THEN v_flag := 'critical_total';   v_status := 'error';
    ELSIF v_total >=  60*60 THEN v_flag := 'very_slow_total';  v_status := 'warn';
    ELSIF v_total >=  20*60 THEN v_flag := 'slow_total';       v_status := 'warn';
    ELSE                         v_flag := NULL;               v_status := 'ok';
    END IF;
  END IF;

  IF v_b.failed > 0 AND v_status = 'ok' THEN v_status := 'warn'; END IF;

  v_sub_end := CASE WHEN v_b.end_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (v_b.end_at - v_b.sub_at))::int ELSE NULL END;
  v_ing_lag := CASE WHEN v_b.ing_at IS NOT NULL AND v_b.end_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (v_b.ing_at - v_b.end_at))::int ELSE NULL END;
  v_total   := CASE WHEN v_b.ing_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (v_b.ing_at - v_b.sub_at))::int ELSE NULL END;

  v_lat := jsonb_build_object(
    'submit_to_end_sec',   v_sub_end,
    'ingest_lag_sec',      v_ing_lag,
    'total_sec',           v_total,
    'submit_to_end_human', public.fmt_duration(v_sub_end),
    'ingest_lag_human',    public.fmt_duration(v_ing_lag),
    'total_human',         public.fmt_duration(v_total),
    'flag',                v_flag
  );

  RETURN jsonb_build_object(
    'status',         v_status,
    'heading',        p_heading,
    'technical_name', p_technical,
    'details', jsonb_build_object(
      'scored',             v_b.scored,
      'failed',             v_b.failed,
      'approved',           v_b.approved,
      'rejected',           v_b.rejected,
      'anthropic_batch_id', v_b.anthropic_batch_id,
      'prompt_version',     v_b.prompt_version,
      'latency',            v_lat
    ) || COALESCE(p_extra_details, '{}'::jsonb),
    'timing', jsonb_build_object(
      'started_at',   v_b.sub_at,
      'completed_at', v_b.ing_at,
      'duration_sec', v_total
    )
  );
END;
$$;

-- Main nightly flow report RPC.
-- Window: 02:00–06:00 UTC on p_date (matches cron schedule).
-- Tier 9 (cron job details) uses dynamic SQL with exception handling since
-- pg_cron tables may not be accessible to the authenticated role.
CREATE OR REPLACE FUNCTION public.get_nightly_flow_report(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_ws  timestamptz;
  v_we  timestamptz;
  v_c1  jsonb; v_c2 jsonb; v_c4 jsonb; v_combined jsonb;
  v_import record;
  v_sync    jsonb; v_linking jsonb;
  v_sync_r  record; v_linking_r record;
  v_atag_spec jsonb; v_author_upd jsonb;
  v_atag_spec_r record; v_author_upd_r record;
  v_spec_new jsonb; v_spec_res jsonb;
  v_atag_type jsonb; v_atag_type_r record;
  v_sub_new jsonb; v_sub_res jsonb;
  v_atype_new jsonb; v_atype_res jsonb;
  v_ctext_new jsonb; v_ctext_res jsonb;
  v_geoa_new jsonb; v_geoa_res jsonb;
  v_geob_new jsonb; v_geob_res jsonb;
  v_geoa_country int;
  v_sari_new jsonb; v_sari_res jsonb;
  v_ready jsonb; v_ready_r record;
  v_poll jsonb; v_ingest jsonb;
  v_irr jsonb;
  v_ok int := 0; v_warn int := 0; v_err int := 0;
  v_status_arr text[];
  v_summary jsonb;
  v_s text;
BEGIN
  v_ws := (p_date::text || ' 02:00:00+00')::timestamptz;
  v_we := (p_date::text || ' 06:00:00+00')::timestamptz;

  -- Tier 1: Import circles
  FOR v_import IN
    SELECT circle, status,
      COALESCE(articles_imported,     0) AS imported,
      COALESCE(articles_fetched,      0) AS fetched,
      COALESCE(articles_skipped,      0) AS skipped,
      COALESCE(author_slots_imported, 0) AS author_slots,
      COALESCE(errors::text, 'null')     AS errors_text,
      started_at, completed_at
    FROM import_logs
    WHERE circle IN (1, 2, 4)
      AND started_at >= v_ws AND started_at < v_we
      AND trigger = 'cron'
    ORDER BY circle
  LOOP
    v_s := CASE WHEN v_import.status = 'completed' THEN 'ok'
                WHEN v_import.status = 'failed'    THEN 'error'
                ELSE 'warn' END;
    DECLARE v_box jsonb;
    BEGIN
      v_box := jsonb_build_object(
        'status', v_s,
        'heading', CASE v_import.circle
          WHEN 1 THEN 'Fetch by journal'
          WHEN 2 THEN 'Fetch by institution'
          WHEN 4 THEN 'Fetch by MeSH terms' END,
        'technical_name', 'import-c' || v_import.circle::text,
        'details', jsonb_build_object(
          'circle', v_import.circle, 'fetched', v_import.fetched,
          'imported', v_import.imported, 'skipped', v_import.skipped,
          'author_slots_imported', v_import.author_slots,
          'errors', CASE WHEN v_import.errors_text IN ('null','{}')
                         THEN '[]'::jsonb ELSE v_import.errors_text::jsonb END),
        'timing', jsonb_build_object(
          'started_at', v_import.started_at, 'completed_at', v_import.completed_at,
          'duration_sec', EXTRACT(EPOCH FROM (v_import.completed_at - v_import.started_at))::int));
      IF    v_import.circle = 1 THEN v_c1 := v_box;
      ELSIF v_import.circle = 2 THEN v_c2 := v_box;
      ELSIF v_import.circle = 4 THEN v_c4 := v_box;
      END IF;
    END;
  END LOOP;

  IF v_c1 IS NULL THEN v_c1 := jsonb_build_object('status','missing','heading','Fetch by journal','technical_name','import-c1','details','{}'::jsonb,'timing',NULL); END IF;
  IF v_c2 IS NULL THEN v_c2 := jsonb_build_object('status','missing','heading','Fetch by institution','technical_name','import-c2','details','{}'::jsonb,'timing',NULL); END IF;
  IF v_c4 IS NULL THEN v_c4 := jsonb_build_object('status','missing','heading','Fetch by MeSH terms','technical_name','import-c4','details','{}'::jsonb,'timing',NULL); END IF;

  SELECT SUM(articles_imported) AS total_imported, SUM(articles_fetched) AS total_fetched,
    SUM(articles_skipped) AS total_skipped,
    COUNT(*) FILTER (WHERE status = 'completed') AS ok_circles,
    COUNT(*) AS total_circles, MIN(started_at) AS earliest_start,
    MAX(completed_at) AS latest_complete,
    MAX(CASE WHEN status = 'failed' THEN 2 WHEN status = 'completed' THEN 1 ELSE 0 END) AS worst
  INTO v_import
  FROM import_logs WHERE circle IN (1,2,4) AND started_at >= v_ws AND started_at < v_we AND trigger = 'cron';

  DECLARE v_cs text;
  BEGIN
    v_cs := CASE WHEN v_import.total_circles = 0 THEN 'missing'
                 WHEN v_import.worst = 2 THEN 'error'
                 WHEN v_import.ok_circles < v_import.total_circles THEN 'warn'
                 WHEN v_import.total_circles < 3 THEN 'warn'
                 ELSE 'ok' END;
    v_combined := jsonb_build_object('status', v_cs, 'heading', 'Combined import result',
      'technical_name', 'daily-import',
      'details', jsonb_build_object(
        'total_imported', COALESCE(v_import.total_imported,0),
        'total_fetched',  COALESCE(v_import.total_fetched,0),
        'total_skipped',  COALESCE(v_import.total_skipped,0),
        'circles_succeeded', COALESCE(v_import.ok_circles,0),
        'circles_total',  COALESCE(v_import.total_circles,0)),
      'timing', CASE WHEN v_import.earliest_start IS NOT NULL THEN jsonb_build_object(
        'started_at', v_import.earliest_start, 'completed_at', v_import.latest_complete,
        'duration_sec', EXTRACT(EPOCH FROM (v_import.latest_complete - v_import.earliest_start))::int)
      ELSE NULL END);
  END;

  -- Tier 2: Sync & author linking
  SELECT COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE event = 'updated')   AS n_updated,
    COUNT(*) FILTER (WHERE event = 'retracted') AS n_retracted,
    COUNT(DISTINCT pubmed_id) AS distinct_articles
  INTO v_sync_r FROM pubmed_sync_log WHERE synced_at >= v_ws AND synced_at < v_we;

  DECLARE v_top_fields jsonb;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('field', f, 'count', c) ORDER BY c DESC) INTO v_top_fields
    FROM (SELECT f, COUNT(*) AS c FROM pubmed_sync_log, unnest(fields_changed) AS f
          WHERE synced_at >= v_ws AND synced_at < v_we GROUP BY f ORDER BY COUNT(*) DESC LIMIT 3) x;
    v_sync := jsonb_build_object(
      'status', CASE WHEN COALESCE(v_sync_r.total_events,0) = 0 THEN 'expected_silent' ELSE 'ok' END,
      'heading', 'Fetch modified articles', 'technical_name', 'daily-pubmed-sync',
      'details', jsonb_build_object(
        'events_total', COALESCE(v_sync_r.total_events,0),
        'events_updated', COALESCE(v_sync_r.n_updated,0),
        'events_retracted', COALESCE(v_sync_r.n_retracted,0),
        'distinct_articles', COALESCE(v_sync_r.distinct_articles,0),
        'top_fields_changed', COALESCE(v_top_fields,'[]'::jsonb)),
      'timing', NULL);
  END;

  SELECT status, COALESCE(articles_processed,0) AS articles_processed,
    COALESCE(authors_processed,0) AS authors_processed, COALESCE(authors_linked,0) AS authors_linked,
    COALESCE(new_authors,0) AS new_authors, COALESCE(duplicates,0) AS duplicates,
    COALESCE(rejected,0) AS rejected, errors, started_at, completed_at
  INTO v_linking_r FROM author_linking_logs
  WHERE started_at >= v_ws AND started_at < v_we ORDER BY started_at DESC LIMIT 1;

  v_linking := CASE WHEN v_linking_r.status IS NULL THEN jsonb_build_object(
    'status','missing','heading','Link articles to authors database',
    'technical_name','trigger-author-linking','details','{}'::jsonb,'timing',NULL)
  ELSE jsonb_build_object(
    'status', CASE WHEN v_linking_r.status = 'completed' THEN 'ok'
                   WHEN v_linking_r.status = 'failed' THEN 'error' ELSE 'warn' END,
    'heading','Link articles to authors database','technical_name','trigger-author-linking',
    'details', jsonb_build_object('articles_processed',v_linking_r.articles_processed,
      'authors_processed',v_linking_r.authors_processed,'authors_linked',v_linking_r.authors_linked,
      'new_authors',v_linking_r.new_authors,'duplicates',v_linking_r.duplicates,
      'rejected',v_linking_r.rejected,'errors',COALESCE(v_linking_r.errors,'[]'::jsonb)),
    'timing', jsonb_build_object('started_at',v_linking_r.started_at,
      'completed_at',v_linking_r.completed_at,
      'duration_sec',EXTRACT(EPOCH FROM (v_linking_r.completed_at - v_linking_r.started_at))::int))
  END;

  -- Tier 3: Auto-tag specialty & author update
  SELECT status, COALESCE(approved,0) AS approved, errors, started_at, completed_at
  INTO v_atag_spec_r FROM auto_tag_logs
  WHERE job = 'specialty' AND started_at >= v_ws AND started_at < v_we ORDER BY started_at DESC LIMIT 1;

  v_atag_spec := CASE WHEN v_atag_spec_r.status IS NULL THEN jsonb_build_object(
    'status','missing','heading','Rule-based scoring (specialty)',
    'technical_name','auto-tag-specialty','details','{}'::jsonb,'timing',NULL)
  ELSE jsonb_build_object(
    'status', CASE WHEN v_atag_spec_r.status = 'completed' AND v_atag_spec_r.approved = 0 THEN 'expected_silent'
                   WHEN v_atag_spec_r.status = 'completed' THEN 'ok' ELSE 'error' END,
    'heading','Rule-based scoring (specialty)','technical_name','auto-tag-specialty',
    'details', jsonb_build_object('approved',v_atag_spec_r.approved,
      'errors',COALESCE(to_jsonb(v_atag_spec_r.errors),'[]'::jsonb)),
    'timing', jsonb_build_object('started_at',v_atag_spec_r.started_at,
      'completed_at',v_atag_spec_r.completed_at,
      'duration_sec',EXTRACT(EPOCH FROM (v_atag_spec_r.completed_at - v_atag_spec_r.started_at))::int))
  END;

  SELECT status, COALESCE(processed,0) AS processed, COALESCE(scenario_a,0) AS scenario_a,
    COALESCE(scenario_b,0) AS scenario_b, COALESCE(scenario_c,0) AS scenario_c,
    COALESCE(unmatched,0) AS unmatched, COALESCE(dry_run,false) AS dry_run,
    errors, started_at, completed_at
  INTO v_author_upd_r FROM author_update_logs
  WHERE started_at >= v_ws AND started_at < v_we ORDER BY started_at DESC LIMIT 1;

  v_author_upd := CASE WHEN v_author_upd_r.status IS NULL THEN jsonb_build_object(
    'status','missing','heading','Update modified author profiles',
    'technical_name','daily-author-update','details','{}'::jsonb,'timing',NULL)
  ELSE jsonb_build_object(
    'status', CASE WHEN v_author_upd_r.status = 'completed' THEN 'ok'
                   WHEN v_author_upd_r.status = 'running' AND v_author_upd_r.started_at < NOW() - INTERVAL '30 min' THEN 'warn'
                   WHEN v_author_upd_r.status = 'failed' THEN 'error' ELSE 'warn' END,
    'heading','Update modified author profiles','technical_name','daily-author-update',
    'details', jsonb_build_object('processed',v_author_upd_r.processed,
      'scenario_a',v_author_upd_r.scenario_a,'scenario_b',v_author_upd_r.scenario_b,
      'scenario_c',v_author_upd_r.scenario_c,'unmatched',v_author_upd_r.unmatched,
      'dry_run',v_author_upd_r.dry_run,'errors',COALESCE(v_author_upd_r.errors,'[]'::jsonb)),
    'timing', jsonb_build_object('started_at',v_author_upd_r.started_at,
      'completed_at',v_author_upd_r.completed_at,
      'duration_sec',EXTRACT(EPOCH FROM (v_author_upd_r.completed_at - v_author_upd_r.started_at))::int))
  END;

  -- Tier 4: Specialty AI scoring
  v_spec_new := public._nfr_scoring_box('Score new articles',        'specialty · new',    'specialty','new',     v_ws, v_we);
  v_spec_res := public._nfr_scoring_box('Re-score updated articles', 'specialty · rescore','specialty','rescore', v_ws, v_we);

  -- Tier 5: Auto-tag article type
  SELECT status, evaluated, scored, skipped, COALESCE(approved,0) AS approved,
    errors, started_at, completed_at
  INTO v_atag_type_r FROM auto_tag_logs
  WHERE job = 'article_type' AND started_at >= v_ws AND started_at < v_we ORDER BY started_at DESC LIMIT 1;

  v_atag_type := CASE WHEN v_atag_type_r.status IS NULL THEN jsonb_build_object(
    'status','missing','heading','Rule-based scoring (article type)',
    'technical_name','auto-tag-article-type','details','{}'::jsonb,'timing',NULL)
  ELSE jsonb_build_object(
    'status', CASE WHEN v_atag_type_r.status = 'completed' THEN 'ok' ELSE 'error' END,
    'heading','Rule-based scoring (article type)','technical_name','auto-tag-article-type',
    'details', jsonb_build_object('evaluated',v_atag_type_r.evaluated,'scored',v_atag_type_r.scored,
      'skipped',v_atag_type_r.skipped,'approved',v_atag_type_r.approved,
      'errors',COALESCE(to_jsonb(v_atag_type_r.errors),'[]'::jsonb)),
    'timing', jsonb_build_object('started_at',v_atag_type_r.started_at,
      'completed_at',v_atag_type_r.completed_at,
      'duration_sec',EXTRACT(EPOCH FROM (v_atag_type_r.completed_at - v_atag_type_r.started_at))::int))
  END;

  -- Tier 6: Scoring swarm
  v_sub_new  := public._nfr_scoring_box('Score subspecialty (new)',      'subspecialty · new',       'subspecialty',      'new',     v_ws, v_we);
  v_sub_res  := public._nfr_scoring_box('Re-score subspecialty',         'subspecialty · rescore',   'subspecialty',      'rescore', v_ws, v_we);
  v_atype_new:= public._nfr_scoring_box('Score article type (new)',      'article_type · new',       'article_type_prod', 'new',     v_ws, v_we);
  v_atype_res:= public._nfr_scoring_box('Re-score article type',         'article_type · rescore',   'article_type_prod', 'rescore', v_ws, v_we);
  v_ctext_new:= public._nfr_scoring_box('Score condensation text (new)', 'condensation_text · new',  'condensation_text', 'new',     v_ws, v_we);
  v_ctext_res:= public._nfr_scoring_box('Re-score condensation text',    'condensation_text · rescore','condensation_text','rescore',v_ws, v_we);
  v_geob_new := public._nfr_scoring_box('Score geo class B (new)',       'geo_class_b · new',        'article_geo_class_b','new',    v_ws, v_we);
  v_geob_res := public._nfr_scoring_box('Re-score geo class B',          'geo_class_b · rescore',    'article_geo_class_b','rescore',v_ws, v_we);

  SELECT COUNT(*) INTO v_geoa_country
  FROM article_geo_addresses aga JOIN articles a ON a.id = aga.article_id
  WHERE a.geo_class = 'A' AND aga.ai_processed_at >= v_ws AND aga.ai_processed_at < v_we AND aga.country IS NOT NULL;

  v_geoa_new := public._nfr_scoring_box('Score geo class A (new)',  'geo_class_a · new',    'article_geo_class_a','new',     v_ws, v_we, jsonb_build_object('country_tagged',v_geoa_country));
  v_geoa_res := public._nfr_scoring_box('Re-score geo class A',     'geo_class_a · rescore','article_geo_class_a','rescore', v_ws, v_we, jsonb_build_object('country_tagged',v_geoa_country));

  -- Tier 7: SARI
  v_sari_new := public._nfr_scoring_box('Score SARI (new)', 'sari · new',    'condensation_sari','new',     v_ws, v_we);
  v_sari_res := public._nfr_scoring_box('Re-score SARI',    'sari · rescore','condensation_sari','rescore', v_ws, v_we);

  -- Tier 8: Result
  SELECT COUNT(*) FILTER (WHERE a.imported_at >= v_ws AND a.imported_at < v_we) AS in_window,
    COUNT(*) AS total
  INTO v_ready_r FROM articles a;

  DECLARE v_in_spec int; v_out_spec int; v_pending int;
  BEGIN
    SELECT COUNT(DISTINCT a.id) FILTER (WHERE asp.specialty_match = true) INTO v_in_spec
    FROM articles a LEFT JOIN article_specialties asp ON asp.article_id = a.id AND asp.specialty = 'neurosurgery'
    WHERE a.imported_at >= v_ws AND a.imported_at < v_we;

    SELECT COUNT(DISTINCT a.id) INTO v_out_spec FROM articles a
    WHERE a.imported_at >= v_ws AND a.imported_at < v_we
      AND NOT EXISTS (SELECT 1 FROM article_specialties asp WHERE asp.article_id = a.id AND asp.specialty = 'neurosurgery' AND asp.specialty_match = true)
      AND     EXISTS (SELECT 1 FROM article_specialties asp2 WHERE asp2.article_id = a.id AND asp2.specialty = 'neurosurgery');

    SELECT COUNT(DISTINCT a.id) INTO v_pending FROM articles a
    WHERE a.imported_at >= v_ws AND a.imported_at < v_we
      AND NOT EXISTS (SELECT 1 FROM article_specialties asp WHERE asp.article_id = a.id AND asp.specialty = 'neurosurgery');

    v_ready := jsonb_build_object('status','ok','heading','Result after the night','technical_name',NULL,
      'details', jsonb_build_object(
        'imported_in_window', COALESCE(v_ready_r.in_window,0), 'in_specialty', COALESCE(v_in_spec,0),
        'out_of_specialty', COALESCE(v_out_spec,0), 'pending', COALESCE(v_pending,0),
        'total_in_system', COALESCE(v_ready_r.total,0),
        'previous_night_total', GREATEST(0,COALESCE(v_ready_r.total,0)-COALESCE(v_ready_r.in_window,0)),
        'delta', COALESCE(v_ready_r.in_window,0)),
      'timing', NULL);
  END;

  -- Tier 9: Background cron (pg_cron may not be accessible; graceful fallback)
  BEGIN
    EXECUTE $q$
      SELECT jsonb_build_object('status',
        CASE WHEN COUNT(*)=0 THEN 'missing' WHEN COUNT(*) FILTER (WHERE status='failed')=COUNT(*) THEN 'error'
             WHEN COUNT(*) FILTER (WHERE status='failed')>0 THEN 'warn' ELSE 'ok' END,
        'heading','Poll Anthropic batches','technical_name','scoring-batch-poll',
        'details', jsonb_build_object('total_runs',COUNT(*)::int,
          'succeeded',COUNT(*) FILTER (WHERE status='succeeded')::int,
          'failed',COUNT(*) FILTER (WHERE status='failed')::int,
          'batches_changed_state',(SELECT COUNT(*)::int FROM scoring_batches WHERE ended_at>=$1 AND ended_at<$2)),
        'timing',NULL)
      FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid
      WHERE j.jobname ILIKE '%poll%batch%' AND jrd.start_time>=$1 AND jrd.start_time<$2
    $q$ INTO v_poll USING v_ws, v_we;
  EXCEPTION WHEN OTHERS THEN
    v_poll := jsonb_build_object('status','missing','heading','Poll Anthropic batches',
      'technical_name','scoring-batch-poll',
      'details',jsonb_build_object('total_runs',0,'succeeded',0,'failed',0,
        'batches_changed_state',(SELECT COUNT(*)::int FROM scoring_batches WHERE ended_at>=v_ws AND ended_at<v_we)),
      'timing',NULL);
  END;

  BEGIN
    EXECUTE $q$
      SELECT jsonb_build_object('status',
        CASE WHEN COUNT(*)=0 THEN 'missing' WHEN COUNT(*) FILTER (WHERE status='failed')=COUNT(*) THEN 'error'
             WHEN COUNT(*) FILTER (WHERE status='failed')>0 THEN 'warn' ELSE 'ok' END,
        'heading','Ingest scored results','technical_name','scoring-batch-ingest',
        'details', jsonb_build_object('total_runs',COUNT(*)::int,
          'succeeded',COUNT(*) FILTER (WHERE status='succeeded')::int,
          'failed',COUNT(*) FILTER (WHERE status='failed')::int,
          'batches_changed_state',(SELECT COUNT(*)::int FROM scoring_batches WHERE ingested_at>=$1 AND ingested_at<$2)),
        'timing',NULL)
      FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid
      WHERE j.jobname ILIKE '%ingest%batch%' AND jrd.start_time>=$1 AND jrd.start_time<$2
    $q$ INTO v_ingest USING v_ws, v_we;
  EXCEPTION WHEN OTHERS THEN
    v_ingest := jsonb_build_object('status','missing','heading','Ingest scored results',
      'technical_name','scoring-batch-ingest',
      'details',jsonb_build_object('total_runs',0,'succeeded',0,'failed',0,
        'batches_changed_state',(SELECT COUNT(*)::int FROM scoring_batches WHERE ingested_at>=v_ws AND ingested_at<v_we)),
      'timing',NULL);
  END;

  -- Irregularities
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'component', CASE module
      WHEN 'specialty'           THEN 'specialty_'         || COALESCE(run_kind,'new')
      WHEN 'subspecialty'        THEN 'subspecialty_'      || COALESCE(run_kind,'new')
      WHEN 'article_type_prod'   THEN 'article_type_'      || COALESCE(run_kind,'new')
      WHEN 'condensation_text'   THEN 'condensation_text_' || COALESCE(run_kind,'new')
      WHEN 'condensation_sari'   THEN 'sari_'              || COALESCE(run_kind,'new')
      WHEN 'article_geo_class_a' THEN 'geo_class_a_'       || COALESCE(run_kind,'new')
      WHEN 'article_geo_class_b' THEN 'geo_class_b_'       || COALESCE(run_kind,'new')
      ELSE module || '_' || COALESCE(run_kind,'new') END,
    'kind', lat_flag,
    'severity', CASE WHEN lat_flag='critical_total' THEN 'error' ELSE 'warn' END,
    'message', CASE lat_flag
      WHEN 'critical_total'     THEN 'total ' || public.fmt_duration(total_sec) || ' (norm: <20m)'
      WHEN 'very_slow_total'    THEN 'total ' || public.fmt_duration(total_sec) || ' (norm: <20m)'
      WHEN 'slow_total'         THEN 'total ' || public.fmt_duration(total_sec) || ' (norm: <20m)'
      WHEN 'stuck_at_anthropic' THEN 'stuck at Anthropic > 4h'
      WHEN 'stuck_in_ingest'    THEN 'awaiting ingest > 30m' END,
    'detail', jsonb_build_object(
      'submit_to_end_min', ROUND(sub_end_sec::numeric/60,1),
      'ingest_lag_min',    ROUND(ing_lag_sec::numeric/60,1),
      'total_min',         ROUND(total_sec::numeric/60,1)))
    ORDER BY CASE WHEN lat_flag='critical_total' THEN 0 ELSE 1 END, COALESCE(total_sec,0) DESC),
  '[]'::jsonb)
  INTO v_irr
  FROM (
    SELECT module, run_kind,
      EXTRACT(EPOCH FROM (ended_at - submitted_at))::int    AS sub_end_sec,
      EXTRACT(EPOCH FROM (ingested_at - ended_at))::int     AS ing_lag_sec,
      EXTRACT(EPOCH FROM (ingested_at - submitted_at))::int AS total_sec,
      CASE
        WHEN ingested_at IS NOT NULL THEN
          CASE WHEN EXTRACT(EPOCH FROM (ingested_at-submitted_at)) >= 180*60 THEN 'critical_total'
               WHEN EXTRACT(EPOCH FROM (ingested_at-submitted_at)) >=  60*60 THEN 'very_slow_total'
               WHEN EXTRACT(EPOCH FROM (ingested_at-submitted_at)) >=  20*60 THEN 'slow_total' ELSE NULL END
        WHEN ended_at IS NULL THEN
          CASE WHEN EXTRACT(EPOCH FROM (NOW()-submitted_at)) > 4*3600 THEN 'stuck_at_anthropic' ELSE NULL END
        ELSE CASE WHEN EXTRACT(EPOCH FROM (NOW()-ended_at)) > 30*60 THEN 'stuck_in_ingest' ELSE NULL END
      END AS lat_flag
    FROM scoring_batches WHERE submitted_at >= v_ws AND submitted_at < v_we
  ) x WHERE lat_flag IS NOT NULL;

  -- Status counts
  v_status_arr := ARRAY[
    v_c1->>'status', v_c2->>'status', v_c4->>'status', v_combined->>'status',
    v_sync->>'status', v_linking->>'status',
    v_atag_spec->>'status', v_author_upd->>'status',
    v_spec_new->>'status', v_spec_res->>'status',
    v_atag_type->>'status',
    v_sub_new->>'status',  v_sub_res->>'status',
    v_atype_new->>'status',v_atype_res->>'status',
    v_ctext_new->>'status',v_ctext_res->>'status',
    v_geoa_new->>'status', v_geoa_res->>'status',
    v_geob_new->>'status', v_geob_res->>'status',
    v_sari_new->>'status', v_sari_res->>'status',
    v_ready->>'status',
    v_poll->>'status', v_ingest->>'status'
  ];

  SELECT COUNT(*) FILTER (WHERE s IN ('ok','expected_silent','missing')),
    COUNT(*) FILTER (WHERE s='warn'), COUNT(*) FILTER (WHERE s='error')
  INTO v_ok, v_warn, v_err FROM unnest(v_status_arr) AS s;

  DECLARE v_hl_status text; v_hl_text text;
  BEGIN
    v_hl_status := CASE WHEN v_err>0 THEN 'error' WHEN v_warn>0 THEN 'warn' ELSE 'ok' END;
    v_hl_text   := CASE WHEN v_err>0 THEN v_err::text || ' error(s) tonight'
                        WHEN v_warn>0 THEN (v_warn+v_err)::text || ' item(s) to check'
                        ELSE 'Pipeline ran cleanly' END;
    v_summary := jsonb_build_object(
      'total_components', array_length(v_status_arr,1),
      'ok_count', v_ok, 'warn_count', v_warn, 'error_count', v_err,
      'headline_status', v_hl_status, 'headline_text', v_hl_text);
  END;

  RETURN jsonb_build_object(
    'date', p_date, 'window_start', v_ws, 'window_end', v_we,
    'summary', v_summary,
    'tier1_import_circles', jsonb_build_object('import_c1',v_c1,'import_c2',v_c2,'import_c4',v_c4),
    'tier1_combined',          jsonb_build_object('daily_import',v_combined),
    'tier2_sync_authorlink',   jsonb_build_object('daily_pubmed_sync',v_sync,'trigger_author_linking',v_linking),
    'tier3_autotag_authorupdate', jsonb_build_object('auto_tag_specialty',v_atag_spec,'daily_author_update',v_author_upd),
    'tier4_specialty_scoring', jsonb_build_object('specialty_new',v_spec_new,'specialty_rescore',v_spec_res),
    'tier5_autotag_articletype',jsonb_build_object('auto_tag_article_type',v_atag_type),
    'tier6_scoring_swarm', jsonb_build_object(
      'subspecialty_new',v_sub_new,'subspecialty_rescore',v_sub_res,
      'article_type_new',v_atype_new,'article_type_rescore',v_atype_res,
      'condensation_text_new',v_ctext_new,'condensation_text_rescore',v_ctext_res,
      'geo_class_a_new',v_geoa_new,'geo_class_a_rescore',v_geoa_res,
      'geo_class_b_new',v_geob_new,'geo_class_b_rescore',v_geob_res),
    'tier7_sari',   jsonb_build_object('sari_new',v_sari_new,'sari_rescore',v_sari_res),
    'tier8_result', jsonb_build_object('ready_by_morning',v_ready),
    'tier9_background', jsonb_build_object('scoring_batch_poll',v_poll,'scoring_batch_ingest',v_ingest),
    'irregularities', v_irr
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fmt_duration(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public._nfr_scoring_box(text,text,text,text,timestamptz,timestamptz,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nightly_flow_report(date) TO authenticated;
