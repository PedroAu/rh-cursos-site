-- Story 2026-09-19 — alertas do painel comercial isolados por campanha.
begin;

select plan(21);

select ok(
  has_function_privilege('service_role', 'public.sales_campaign_pending_notifications(varchar)', 'EXECUTE'),
  'service role consulta alertas agregados por campanha'
);
select ok(
  not has_function_privilege('anon', 'public.sales_campaign_pending_notifications(varchar)', 'EXECUTE'),
  'anon não consulta alertas comerciais'
);
select ok(
  not has_function_privilege('authenticated', 'public.sales_campaign_pending_notifications(varchar)', 'EXECUTE'),
  'authenticated não consulta alertas comerciais diretamente'
);
select ok(
  has_function_privilege('service_role', 'public.sales_campaign_failed_attempts(varchar)', 'EXECUTE'),
  'service role consulta falhas agregadas por campanha'
);
select ok(
  not has_function_privilege('anon', 'public.sales_campaign_failed_attempts(varchar)', 'EXECUTE'),
  'anon não consulta falhas comerciais'
);
select ok(
  not has_function_privilege('authenticated', 'public.sales_campaign_failed_attempts(varchar)', 'EXECUTE'),
  'authenticated não consulta falhas comerciais diretamente'
);

insert into public.sales_reactivation_campaign (
  id, campaign_key, version, status, content_status, policy_version,
  template_version, sender_email, reply_to_email
) values
  ('71000000-0000-4000-8000-000000000001', 'status-scope-a', 1, 'PAUSED', 'DRAFT', 'status-policy', 'status-template', 'sender@example.test', 'reply@example.test'),
  ('72000000-0000-4000-8000-000000000001', 'status-scope-b', 1, 'PAUSED', 'DRAFT', 'status-policy', 'status-template', 'sender@example.test', 'reply@example.test');

insert into public.lead (id, nome, email, tipo, tema_interesse, status_crm, origem)
values
  ('status-scope-lead-a', 'Lead A', 'lead-a@example.test', 'Curso', 'Curso A', 'Novo', 'Teste'),
  ('status-scope-lead-b', 'Lead B', 'lead-b@example.test', 'Curso', 'Curso B', 'Novo', 'Teste');

insert into public.lead_email_sequence (id, lead_id, campaign_key, status)
values
  ('71000000-0000-4000-8000-000000000002', 'status-scope-lead-a', 'status-scope-a@1', 'ACTIVE'),
  ('72000000-0000-4000-8000-000000000002', 'status-scope-lead-b', 'status-scope-b@1', 'ACTIVE');

insert into public.lead_email_sequence_step (id, sequence_id, step_index, due_at, status)
values
  ('71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', 0, now(), 'PENDING'),
  ('72000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000002', 0, now(), 'PENDING');

insert into public.lead_interaction (
  id, lead_id, sequence_id, event_type, occurred_at, direction, source,
  correlation_id, actor_id, actor_version, safe_summary, metadata,
  idempotency_key, event_hash
) values
  ('71000000-0000-4000-8000-000000000004', 'status-scope-lead-a', '71000000-0000-4000-8000-000000000002', 'REPLIED', now(), 'INBOUND', 'IMAP', 'status:a', 'pgtap', '1', 'Resposta A', '{}'::jsonb, 'status:interaction:a', repeat('a', 64)),
  ('72000000-0000-4000-8000-000000000004', 'status-scope-lead-b', '72000000-0000-4000-8000-000000000002', 'REPLIED', now(), 'INBOUND', 'IMAP', 'status:b', 'pgtap', '1', 'Resposta B', '{}'::jsonb, 'status:interaction:b', repeat('b', 64));

-- O trigger sales_enqueue_terminal_notification cria estas duas linhas. As
-- asserções tornam explícita a origem do terceiro alerta de A e do segundo de B.
select is(
  (select count(*)::integer from public.sales_notification_outbox
   where event_key = 'interaction:71000000-0000-4000-8000-000000000004'),
  1,
  'interação da campanha A gera uma notificação terminal'
);
select is(
  (select count(*)::integer from public.sales_notification_outbox
   where event_key = 'interaction:72000000-0000-4000-8000-000000000004'),
  1,
  'interação da campanha B gera uma notificação terminal'
);

insert into public.sales_send_attempt (
  id, sequence_step_id, attempt_number, status, idempotency_key, claim_token
) values
  ('71000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000003', 1, 'PERMANENT_FAILED', 'status:attempt:a', '71000000-0000-4000-8000-000000000006'),
  ('72000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000003', 1, 'PERMANENT_FAILED', 'status:attempt:b', '72000000-0000-4000-8000-000000000006');

select is(
  public.sales_campaign_failed_attempts('status-scope-a'),
  1::bigint,
  'campanha A conta apenas sua tentativa com falha'
);
select is(
  public.sales_campaign_failed_attempts('status-scope-b'),
  1::bigint,
  'campanha B permanece isolada da campanha A nas falhas'
);
select is(
  public.sales_campaign_failed_attempts('status-scope-missing'),
  0::bigint,
  'campanha inexistente retorna zero falhas'
);

insert into public.sales_notification_outbox (
  event_key, kind, lead_id, interaction_id, safe_payload, status
) values
  ('status:duplicate-interaction-a', 'REPLIED', 'status-scope-lead-a', '71000000-0000-4000-8000-000000000004', '{}'::jsonb, 'PENDING'),
  ('attempt:71000000-0000-4000-8000-000000000005', 'PERMANENT_FAILURE', 'status-scope-lead-a', '71000000-0000-4000-8000-000000000004', '{}'::jsonb, 'FAILED'),
  ('attempt:72000000-0000-4000-8000-000000000005', 'PERMANENT_FAILURE', 'status-scope-lead-b', null, '{}'::jsonb, 'PENDING'),
  ('status:unmatched', 'GUARDRAIL', 'status-scope-lead-a', null, '{}'::jsonb, 'PENDING'),
  ('status:sent-a', 'GUARDRAIL', 'status-scope-lead-a', '71000000-0000-4000-8000-000000000004', '{}'::jsonb, 'SENT');

select is(
  public.sales_campaign_pending_notifications('status-scope-a'),
  3::bigint,
  'campanha A conta duas notificações da interação e uma do envio apenas uma vez por linha'
);
select is(
  public.sales_campaign_pending_notifications('status-scope-b'),
  2::bigint,
  'campanha B permanece isolada da campanha A'
);
select is(
  public.sales_campaign_pending_notifications('status-scope-missing'),
  0::bigint,
  'campanha inexistente retorna zero'
);

update public.sales_notification_outbox
set status = 'SENT'
where event_key = 'interaction:71000000-0000-4000-8000-000000000004';

select is(
  public.sales_campaign_pending_notifications('status-scope-a'),
  2::bigint,
  'notificações concluídas deixam de compor o total'
);

insert into public.sales_reactivation_campaign (
  id, campaign_key, version, status, content_status, policy_version,
  template_version, sender_email, reply_to_email
) values (
  '71000000-0000-4000-8000-000000000011', 'status-scope-a', 2, 'PAUSED', 'DRAFT',
  'status-policy-v2', 'status-template-v2', 'sender@example.test', 'reply@example.test'
);

select is(
  public.sales_campaign_pending_notifications('status-scope-a'),
  2::bigint,
  'todas as versões da campanha continuam compondo o painel agregado'
);

insert into public.lead_email_sequence (id, lead_id, campaign_key, status)
values ('71000000-0000-4000-8000-000000000012', 'status-scope-lead-a', 'status-scope-a@2', 'ACTIVE');

insert into public.lead_email_sequence_step (id, sequence_id, step_index, due_at, status)
values ('71000000-0000-4000-8000-000000000013', '71000000-0000-4000-8000-000000000012', 0, now(), 'PENDING');

insert into public.sales_send_attempt (
  id, sequence_step_id, attempt_number, status, idempotency_key, claim_token
) values (
  '71000000-0000-4000-8000-000000000015',
  '71000000-0000-4000-8000-000000000013',
  1, 'PERMANENT_FAILED', 'status:attempt:a:v2',
  '71000000-0000-4000-8000-000000000016'
);

insert into public.sales_notification_outbox (
  event_key, kind, lead_id, interaction_id, safe_payload, status
) values (
  'attempt:71000000-0000-4000-8000-000000000015',
  'PERMANENT_FAILURE', 'status-scope-lead-a',
  '71000000-0000-4000-8000-000000000004', '{}'::jsonb, 'PENDING'
);

select is(
  public.sales_campaign_failed_attempts('status-scope-a'),
  2::bigint,
  'falhas de todas as versões da campanha A são agregadas'
);

select is(
  public.sales_campaign_pending_notifications('status-scope-a'),
  3::bigint,
  'uma linha ligada a versões distintas por interação e tentativa é contada uma vez'
);

insert into public.sales_send_attempt (
  id, sequence_step_id, attempt_number, status, idempotency_key, claim_token
) values (
  '72000000-0000-4000-8000-000000000025',
  '72000000-0000-4000-8000-000000000003',
  2, 'PERMANENT_FAILED', 'status:attempt:b:divergent',
  '72000000-0000-4000-8000-000000000026'
);

insert into public.sales_notification_outbox (
  event_key, kind, lead_id, interaction_id, safe_payload, status
) values (
  'attempt:72000000-0000-4000-8000-000000000025',
  'PERMANENT_FAILURE', 'status-scope-lead-b',
  '71000000-0000-4000-8000-000000000004', '{}'::jsonb, 'PENDING'
);

select ok(
  public.sales_campaign_failed_attempts('status-scope-a') = 2::bigint
  and public.sales_campaign_failed_attempts('status-scope-b') = 2::bigint,
  'tentativas com falha continuam isoladas por campanha após novos registros'
);

select ok(
  public.sales_campaign_pending_notifications('status-scope-a') = 3::bigint
  and public.sales_campaign_pending_notifications('status-scope-b') = 3::bigint,
  'event_key de tentativa prevalece sobre interaction_id divergente'
);

select is(
  (select count(*)::bigint from public.sales_notification_outbox where event_key = 'status:unmatched'),
  1::bigint,
  'alerta sem correlação permanece fora do total sem ser alterado'
);

select * from finish();
rollback;
