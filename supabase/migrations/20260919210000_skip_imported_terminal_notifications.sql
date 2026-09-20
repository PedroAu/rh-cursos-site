-- Eventos terminais históricos importados preservam timeline e supressões, mas
-- não representam ocorrências novas que devam alertar o Telegram.

begin;

create or replace function public.sales_enqueue_terminal_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
    and not (new.source = 'CRM' and new.actor_version = 'contact-import-v1') then
    insert into public.sales_notification_outbox (
      event_key, kind, lead_id, interaction_id, safe_payload
    ) values (
      'interaction:' || new.id::text,
      new.event_type,
      new.lead_id,
      new.id,
      jsonb_build_object(
        'event_type', new.event_type,
        'occurred_at', new.occurred_at,
        'safe_summary', new.safe_summary,
        'correlation_id', new.correlation_id
      )
    ) on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

delete from public.sales_notification_outbox notification
using public.lead_interaction interaction
where notification.interaction_id = interaction.id
  and notification.status = 'PENDING'
  and interaction.source = 'CRM'
  and interaction.actor_version = 'contact-import-v1';

comment on function public.sales_enqueue_terminal_notification() is
  'Enfileira alertas terminais novos e exclui eventos históricos do importador de contatos.';

commit;
