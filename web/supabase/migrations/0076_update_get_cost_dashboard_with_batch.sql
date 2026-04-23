drop function if exists public.get_cost_dashboard(timestamp with time zone);

create or replace function public.get_cost_dashboard(since_ts timestamp with time zone)
returns table(
  task text,
  is_lab boolean,
  is_batch boolean,
  lab_step text,
  forbrug numeric,
  artikler bigint,
  kald bigint
)
language sql
security definer
set search_path to ''
as $$
  select
    case
      when task in ('article_type_lab','condensation_lab','condensation_text_lab','condensation_sari_lab','subspecialty_lab')
        then split_part(task,'_lab',1)
      when model_key = any(array['simulate_prompt','refine_prompt','pattern_analysis'])
        then 'specialty'
      else task
    end,
    (task in ('article_type_lab','condensation_lab','condensation_text_lab','condensation_sari_lab','subspecialty_lab')
      or model_key = any(array['simulate_prompt','refine_prompt','pattern_analysis'])),
    is_batch,
    case
      when task in ('article_type_lab','condensation_lab','condensation_text_lab','condensation_sari_lab','subspecialty_lab') then 'simulering'
      when model_key = 'pattern_analysis' then 'analyse'
      when model_key = 'refine_prompt'    then 'prompt-forbedring'
      when model_key = 'simulate_prompt'  then 'simulering'
      else null
    end,
    sum(cost_usd), count(distinct article_id), count(*)
  from public.api_usage
  where called_at >= since_ts
    and task is not null
    and (
      article_id is not null
      or model_key = any(array['simulate_prompt','refine_prompt','pattern_analysis'])
      or task in ('geo','article_type_lab','condensation_lab','condensation_text_lab','condensation_sari_lab','subspecialty_lab')
    )
  group by 1, 2, 3, 4;
$$;
