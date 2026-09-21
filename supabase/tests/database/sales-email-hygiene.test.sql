-- Higienizacao auditavel e fail-closed da coorte comercial.
begin;

select plan(23);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.lead_email_hygiene_result'::regclass),
  'RLS esta habilitada nos resultados de higienizacao'
);

insert into public.sales_reactivation_campaign (
  campaign_key, version, status, content_status, policy_version, template_version,
  sender_email, reply_to_email
) values (
  'hygiene-test', 1, 'PAUSED', 'DRAFT', 'hygiene-policy-v1', 'hygiene-template-v1',
  'pedro@rhcursos.com.br', 'pedro@rhcursos.com.br'
);
select ok(not has_table_privilege('anon', 'public.lead_email_hygiene_result', 'SELECT'), 'anon nao le resultados');
select ok(has_table_privilege('authenticated', 'public.lead_email_hygiene_result', 'SELECT'), 'admin autenticado recebe SELECT sujeito a RLS');
select ok(not has_table_privilege('authenticated', 'public.lead_email_hygiene_result', 'INSERT'), 'cliente autenticado nao grava resultados');
select ok(
  has_function_privilege('service_role', 'public.sales_apply_email_hygiene(varchar,jsonb,varchar,varchar,boolean)', 'EXECUTE'),
  'somente processo confiavel executa a higienizacao'
);
select ok(
  not has_table_privilege('service_role', 'public.lead_email_hygiene_result', 'TRUNCATE'),
  'service role nao pode truncar a trilha de auditoria'
);

insert into public.lead (id, nome, email, tipo, tema_interesse, status_crm, origem)
values
  ('hygiene-valid', 'Valida', 'valida@example.test', 'Curso', 'Gestao de Pessoas', 'Novo', 'Teste'),
  ('hygiene-invalid', 'Invalida', 'invalida@invalid.test', 'Curso', 'Gestao de Pessoas', 'Novo', 'Teste');

insert into public.lead_email_sequence (lead_id, campaign_key, campaign_course_title)
values
  ('hygiene-valid', 'hygiene-test@1', 'Gestao de Pessoas'),
  ('hygiene-invalid', 'hygiene-test@1', 'Gestao de Pessoas');

insert into public.lead_email_sequence_step (sequence_id, step_index, due_at)
select sequence.id, 0, now()
from public.lead_email_sequence sequence
where sequence.campaign_key = 'hygiene-test@1';

update public.sales_orchestrator_control
set enabled = false, dry_run = false, kill_switch = true, updated_by = 'pgtap'
where id = 'global';

create temporary table hygiene_payload as
select jsonb_agg(jsonb_build_object(
  'lead_id', lead.id,
  'email_hash', encode(extensions.digest(lower(trim(lead.email)), 'sha256'), 'hex'),
  'result', case when lead.id = 'hygiene-invalid' then 'BLOCKED' else 'ELIGIBLE' end,
  'reason_code', case when lead.id = 'hygiene-invalid' then 'NO_MAIL_ROUTE' else 'DNS_VALID' end,
  'checked_at', now(),
  'evidence', jsonb_build_object('method', 'pgtap')
) order by lead.id) as value
from public.lead lead
where lead.id in ('hygiene-valid', 'hygiene-invalid');

select throws_ok(
  $$select public.sales_apply_email_hygiene('hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-null-001', 'pgtap', null)$$,
  'P0001',
  'Lote de higienizacao invalido.',
  'p_apply nulo e rejeitado antes de qualquer mutacao'
);

select is(
  (public.sales_apply_email_hygiene(
    'hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-run-001', 'pgtap', false
  ) #>> '{mode}'),
  'DRY_RUN',
  'dry-run valida o lote sem mutacao'
);
select is((select count(*)::integer from public.lead_email_hygiene_result where run_key = 'pgtap-hygiene-run-001'), 0, 'dry-run nao grava auditoria');
select is((select count(*)::integer from public.lead_email_sequence where campaign_key = 'hygiene-test@1' and status = 'ACTIVE'), 2, 'dry-run nao interrompe sequencias');

update public.sales_orchestrator_control set kill_switch = false where id = 'global';
select throws_ok(
  $$select public.sales_apply_email_hygiene('hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-run-001', 'pgtap', true)$$,
  'P0001',
  'Higienizacao exige campanha pausada, kill switch ativo e nenhum envio em curso.',
  'apply bloqueia quando kill switch esta desligado'
);
update public.sales_orchestrator_control set enabled = true, dry_run = false where id = 'global';
select throws_ok(
  $$select public.sales_apply_email_hygiene('hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-run-001', 'pgtap', true)$$,
  'P0001',
  'Higienizacao exige campanha pausada, kill switch ativo e nenhum envio em curso.',
  'apply bloqueia quando automacao esta habilitada'
);
update public.sales_orchestrator_control set enabled = false, kill_switch = true where id = 'global';

update public.sales_reactivation_campaign set status = 'ACTIVE' where campaign_key = 'hygiene-test' and version = 1;
select throws_ok(
  $$select public.sales_apply_email_hygiene('hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-run-001', 'pgtap', true)$$,
  'P0001',
  'Higienizacao exige campanha pausada, kill switch ativo e nenhum envio em curso.',
  'apply bloqueia campanha ativa'
);
update public.sales_reactivation_campaign set status = 'PAUSED' where campaign_key = 'hygiene-test' and version = 1;

create temporary table hygiene_stale_payload as
select jsonb_set(value, '{0,email_hash}', to_jsonb(repeat('f', 64))) as value
from hygiene_payload;
select is(
  (public.sales_apply_email_hygiene(
    'hygiene-test@1', (select value from hygiene_stale_payload), 'pgtap-hygiene-stale-001', 'pgtap', false
  ) #>> '{stale}')::integer,
  1,
  'dry-run informa hash obsoleto sem mutacao'
);
select throws_ok(
  $$select public.sales_apply_email_hygiene('hygiene-test@1', (select value from hygiene_stale_payload), 'pgtap-hygiene-stale-001', 'pgtap', true)$$,
  'P0004',
  'A coorte mudou desde a verificacao; aplique nova varredura.',
  'apply bloqueia hash obsoleto'
);

create temporary table hygiene_applied as
select public.sales_apply_email_hygiene(
  'hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-run-001', 'pgtap', true
) as value;

select is(((select value from hygiene_applied) #>> '{inserted}')::integer, 2, 'apply grava os dois resultados');
select is(((select value from hygiene_applied) #>> '{interrupted}')::integer, 1, 'apply interrompe apenas o endereco bloqueado');
select is(
  (select status from public.lead_email_sequence where lead_id = 'hygiene-invalid' and campaign_key = 'hygiene-test@1'),
  'INTERRUPTED',
  'endereco invalido sai da coorte ativa'
);
select is(
  (select interruption_reason from public.lead_email_sequence where lead_id = 'hygiene-invalid' and campaign_key = 'hygiene-test@1'),
  'EMAIL_HYGIENE_INVALID',
  'interrupcao preserva motivo auditavel sem fingir bounce'
);
select is(
  (select step.status from public.lead_email_sequence_step step join public.lead_email_sequence sequence on sequence.id = step.sequence_id where sequence.lead_id = 'hygiene-invalid' and sequence.campaign_key = 'hygiene-test@1'),
  'CANCELLED',
  'passo pendente do endereco invalido e cancelado'
);
select is(
  (select status from public.lead_email_sequence where lead_id = 'hygiene-valid' and campaign_key = 'hygiene-test@1'),
  'ACTIVE',
  'endereco elegivel permanece ativo'
);
select is(
  (public.sales_apply_email_hygiene(
    'hygiene-test@1', (select value from hygiene_payload), 'pgtap-hygiene-run-001', 'pgtap', true
  ) #>> '{inserted}')::integer,
  0,
  'retry com a mesma run key e idempotente'
);
set local role service_role;
select throws_ok(
  $$update public.lead_email_hygiene_result set result = 'BLOCKED' where lead_id = 'hygiene-valid'$$,
  '42501',
  'permission denied for table lead_email_hygiene_result',
  'service role nao pode alterar diretamente a trilha append-only'
);
reset role;

select * from finish();
rollback;
