-- Story 2026-09-16 — event store/timeline de e-mail.
begin;

select plan(14);

insert into public.lead (id, nome, email, tipo, status_crm, origem)
values ('timeline-lead-1', 'Lead Timeline', 'timeline@example.test', 'Curso', 'Novo', 'Teste');

insert into public.lead_email_sequence (id, lead_id, campaign_key)
values ('10000000-0000-0000-0000-000000000001', 'timeline-lead-1', 'reactivation-test');

insert into public.lead_email_sequence_step (sequence_id, step_index, due_at)
values
  ('10000000-0000-0000-0000-000000000001', 0, now()),
  ('10000000-0000-0000-0000-000000000001', 1, now() + interval '5 days');

insert into public.lead_email_message (
  id, lead_id, sequence_id, provider, provider_message_id, rfc_message_id
) values (
  '20000000-0000-0000-0000-000000000002', 'timeline-lead-1',
  '10000000-0000-0000-0000-000000000001', 'SES', 'ses-test-1', 'mail-test-1@example.test'
);

select is(
  (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'lead_interaction' and column_name = 'lead_id'),
  'character varying',
  'FK lead_id acompanha a PK varchar(80) real de lead'
);

select ok((select relrowsecurity from pg_class where oid = 'public.lead_interaction'::regclass), 'RLS habilitada');
select ok(not has_table_privilege('anon', 'public.lead_interaction', 'SELECT'), 'anon não lê timeline');
select ok(has_table_privilege('authenticated', 'public.lead_interaction', 'SELECT'), 'authenticated recebe SELECT sujeito à RLS admin');
select ok(not has_table_privilege('authenticated', 'public.lead_interaction', 'INSERT'), 'cliente autenticado não grava eventos');
select ok(has_function_privilege('service_role', 'public.ingest_lead_interaction(character varying,uuid,uuid,character varying,character varying,timestamp with time zone,character varying,character varying,character varying,character varying,character varying,character varying,character varying,character varying,character varying,jsonb,character varying,character varying)', 'EXECUTE'), 'somente processo confiável executa ingestão');

create temporary table first_event as
select * from public.ingest_lead_interaction(
  'timeline-lead-1', '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001', 'ses-event-open-1', 'OPENED',
  '2026-09-16T10:00:00Z', 'OUTBOUND', 'SES', '10000000-0000-0000-0000-000000000001',
  'ses-test-1', 'amazon-ses', 'eventbridge-v1', 'Abertura registrada.', null, null,
  '{"provider":"SES"}'::jsonb, 'ses:event-open-1', repeat('a', 64)
);

select ok(not (select duplicate from first_event), 'primeiro evento é criado');

create temporary table duplicate_event as
select * from public.ingest_lead_interaction(
  'timeline-lead-1', '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001', 'ses-event-open-1', 'OPENED',
  '2026-09-16T10:00:00Z', 'OUTBOUND', 'SES', '10000000-0000-0000-0000-000000000001',
  'ses-test-1', 'amazon-ses', 'eventbridge-v1', 'Abertura registrada.', null, null,
  '{"provider":"SES"}'::jsonb, 'ses:event-open-1', repeat('a', 64)
);

select ok((select duplicate from duplicate_event), 'reentrega idêntica é reconhecida');
select is((select count(*)::integer from public.lead_interaction), 1, 'reentrega não duplica interação');

select * from public.ingest_lead_interaction(
  'timeline-lead-1', '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001', 'imap-reply-1', 'REPLIED',
  '2026-09-16T11:00:00Z', 'INBOUND', 'IMAP', '10000000-0000-0000-0000-000000000001',
  'mail-test-1@example.test', 'locaweb-imap-collector', 'normalized-v1', 'Resposta recebida.',
  'imap://INBOX/42', null, '{"provider":"LOCAWEB","imap_uid":"42","mailbox":"INBOX"}'::jsonb,
  'imap:reply-1', repeat('b', 64)
);

select is((select status from public.lead_email_sequence where id = '10000000-0000-0000-0000-000000000001'), 'INTERRUPTED', 'resposta interrompe sequência');
select is((select count(*)::integer from public.lead_email_sequence_step where status = 'CANCELLED'), 2, 'passos pendentes são cancelados');
select ok((select interruption_event_id is not null from public.lead_email_sequence where id = '10000000-0000-0000-0000-000000000001'), 'evento causador fica auditável');

set local role service_role;
select throws_ok(
  $$update public.lead_interaction set safe_summary = 'sobrescrito' where id = (select id from public.lead_interaction limit 1)$$,
  '55000',
  'lead_interaction is append-only; record a correlated correction event',
  'event store bloqueia update no fluxo normal'
);
reset role;

select has_index('public', 'lead_interaction', 'lead_interaction_timeline_idx', 'índice cronológico existe');

select * from finish();
rollback;
