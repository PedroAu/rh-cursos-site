-- Mantém o painel comercial isolado por campanha sem carregar o outbox inteiro
-- na aplicação. Cada alerta é contado uma única vez, ainda que possua mais de
-- uma referência válida para a mesma campanha.

begin;

create or replace function public.sales_campaign_pending_notifications(
  p_campaign_key varchar
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with selected_campaign as (
    select campaign.campaign_key || '@' || campaign.version::text as sequence_key
    from public.sales_reactivation_campaign campaign
    where campaign.campaign_key = p_campaign_key
  )
  select count(*)::bigint
  from public.sales_notification_outbox outbox
  where outbox.status in ('PENDING', 'FAILED')
    and (
      (
        outbox.event_key not like 'attempt:%'
        and exists (
        select 1
        from public.lead_interaction interaction
        join public.lead_email_sequence sequence
          on sequence.id = interaction.sequence_id
        where interaction.id = outbox.interaction_id
          and sequence.campaign_key in (
            select selected.sequence_key from selected_campaign selected
          )
        )
      )
      or (
        outbox.event_key like 'attempt:%'
        and exists (
        select 1
        from public.sales_send_attempt attempt
        join public.lead_email_sequence_step step
          on step.id = attempt.sequence_step_id
        join public.lead_email_sequence sequence
          on sequence.id = step.sequence_id
        where outbox.event_key = 'attempt:' || attempt.id::text
          and sequence.campaign_key in (
            select selected.sequence_key from selected_campaign selected
          )
        )
      )
    );
$$;

revoke all on function public.sales_campaign_pending_notifications(varchar)
  from public, anon, authenticated;
grant execute on function public.sales_campaign_pending_notifications(varchar)
  to service_role;

comment on function public.sales_campaign_pending_notifications(varchar) is
  'Conta alertas pendentes ou com falha de todas as versões de uma campanha, sem expor PII.';

commit;
