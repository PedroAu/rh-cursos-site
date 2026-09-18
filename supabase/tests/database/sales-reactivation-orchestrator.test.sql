-- Story 2026-09-18 — guardrails do orquestrador de reativação.
begin;

select plan(37);

select ok(not (select enabled from public.sales_orchestrator_control where id = 'global'), 'automação nasce desabilitada');
select ok((select dry_run from public.sales_orchestrator_control where id = 'global'), 'dry-run nasce ativo');
select ok((select kill_switch from public.sales_orchestrator_control where id = 'global'), 'kill switch nasce ativo');
select is((select status from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1), 'DISABLED', 'campanha nasce desabilitada');
select is((select content_status from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1), 'DRAFT', 'conteúdo nasce em rascunho');
select is((select count(*)::integer from public.sales_reactivation_campaign_course), 3, 'campanha contém exatamente três cursos');
select is(
  (select array_agg(delay_days order by step_index)::text from public.sales_reactivation_campaign_step),
  '{0,5,10}',
  'cadência materializada nos dias 0, 5 e 10'
);

select ok((select relrowsecurity from pg_class where oid = 'public.sales_reactivation_decision'::regclass), 'RLS habilitada nas decisões');
select ok(not has_table_privilege('anon', 'public.sales_reactivation_decision', 'SELECT'), 'anon não lê decisões');
select ok(has_table_privilege('authenticated', 'public.sales_reactivation_decision', 'SELECT'), 'authenticated recebe SELECT sujeito à RLS admin');
select ok(not has_table_privilege('authenticated', 'public.sales_reactivation_decision', 'INSERT'), 'cliente autenticado não grava decisões');
select ok(
  has_function_privilege('service_role', 'public.sales_list_reactivation_candidates(uuid,integer,integer)', 'EXECUTE'),
  'somente processo confiável lista candidatos'
);
select ok(
  not has_table_privilege('service_role', 'public.sales_orchestrator_control', 'UPDATE'),
  'service role altera controle somente pela função auditada'
);

insert into public.lead (id, nome, email, tipo, tema_interesse, status_crm, origem)
values
  ('reactivation-lead-1', 'Ana Exemplo', 'ana@example.test', 'Curso', 'Auditoria da Folha de Pagamento', 'Novo', 'Teste'),
  ('reactivation-lead-2', 'Bia Exemplo', 'bia@example.test', 'Curso', 'Tema fora da campanha', 'Novo', 'Teste');

insert into public.lead_contact_permission_event (
  lead_id, status, legal_basis, purpose, evidence_ref, occurred_at, actor_id, idempotency_key
) values (
  'reactivation-lead-1', 'APPROVED', 'CONSENT', 'COMMERCIAL_REACTIVATION',
  'test://permission/1', now() - interval '30 days', 'pgtap', 'permission:reactivation-lead-1'
);

select is(
  (select count(*)::integer from public.sales_list_reactivation_candidates(
    (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
    100,
    0
  ) where lead_id in ('reactivation-lead-1', 'reactivation-lead-2')),
  2,
  'listagem retorna candidatos para avaliação fail-closed'
);
select is(
  (select permission_status from public.sales_list_reactivation_candidates(
    (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
    100,
    0
  ) where lead_id = 'reactivation-lead-1'),
  'APPROVED',
  'listagem usa o evento de permissão mais recente'
);

select throws_ok(
  $$select public.sales_create_reactivation_sequence(
    'reactivation-lead-1',
    (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
    gen_random_uuid(),
    'pgtap:disabled',
    'pgtap'
  )$$,
  'P0001',
  'Campanha não está apta para execução.',
  'campanha desabilitada bloqueia criação'
);

update public.sales_reactivation_campaign
set status = 'ACTIVE', content_status = 'APPROVED', approved_at = now(), approved_by = 'pgtap'
where campaign_key = 'reactivation-v1' and version = 1;
update public.sales_orchestrator_control
set enabled = true, dry_run = false, kill_switch = false,
    send_window_start = 0, send_window_end = 24, updated_by = 'pgtap'
where id = 'global';

select throws_ok(
  $$select public.sales_create_reactivation_sequence(
    'reactivation-lead-2',
    (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
    gen_random_uuid(),
    'pgtap:wrong-course',
    'pgtap'
  )$$,
  'P0001',
  'Curso não pertence à campanha.',
  'curso fora da lista bloqueia criação'
);

create temporary table created_sequence as
select public.sales_create_reactivation_sequence(
  'reactivation-lead-1',
  (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
  '30000000-0000-0000-0000-000000000003',
  'pgtap:eligible',
  'pgtap'
) as id;

select ok((select id is not null from created_sequence), 'lead elegível cria sequência');
select is(
  public.sales_create_reactivation_sequence(
    'reactivation-lead-1',
    (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
    '30000000-0000-0000-0000-000000000003',
    'pgtap:eligible-retry',
    'pgtap'
  ),
  (select id from created_sequence),
  'retry retorna a sequência ativa existente'
);
select is(
  (select count(*)::integer from public.lead_email_sequence_step where sequence_id = (select id from created_sequence)),
  3,
  'sequência materializa três passos sem duplicação'
);
select is(
  (select campaign_course_title from public.lead_email_sequence where id = (select id from created_sequence)),
  'Auditoria da Folha de Pagamento',
  'sequência preserva o curso aprovado como snapshot auditável'
);

create temporary table claimed_step as
select * from public.sales_claim_reactivation_steps(
  '40000000-0000-0000-0000-000000000004',
  now() + interval '1 minute',
  120,
  1
);

select is((select count(*)::integer from claimed_step), 1, 'claim reserva um passo vencido');
select is(
  (select count(*)::integer from public.sales_claim_reactivation_steps(
    '41000000-0000-4000-8000-000000000004',
    now() + interval '1 minute',
    120,
    1
  )),
  0,
  'lease impede claim concorrente do mesmo passo'
);
select ok(
  public.sales_begin_send(
    (select attempt_id from claimed_step),
    '40000000-0000-0000-0000-000000000004',
    repeat('a', 64),
    '<pgtap-reactivation@example.test>',
    (select lead_email from claimed_step),
    (select course_title from claimed_step)
  ),
  'begin-send revalida e aceita claim válido'
);
select ok(
  public.sales_mark_send_failure(
    (select attempt_id from claimed_step),
    '40000000-0000-0000-0000-000000000004',
    'RETRYABLE_FAILED',
    'TEST_TRANSIENT'
  ),
  'falha transitória libera o passo para retry'
);
select is(
  (select status from public.lead_email_sequence_step where id = (select sequence_step_id from claimed_step)),
  'PENDING',
  'falha transitória não encerra o passo'
);

create temporary table guardrail_step as
select * from public.sales_claim_reactivation_steps(
  '42000000-0000-4000-8000-000000000004',
  now() + interval '1 minute',
  120,
  1
);
update public.lead set email = 'novo-endereco@example.test' where id = 'reactivation-lead-1';
select ok(
  not public.sales_begin_send(
    (select attempt_id from guardrail_step),
    '42000000-0000-4000-8000-000000000004',
    repeat('b', 64),
    '<pgtap-stale-email@example.test>',
    (select lead_email from guardrail_step),
    (select course_title from guardrail_step)
  ),
  'begin-send bloqueia destinatário alterado depois do claim'
);
update public.lead
set email = (select lead_email from guardrail_step), tema_interesse = 'Tema fora da campanha'
where id = 'reactivation-lead-1';
select ok(
  not public.sales_begin_send(
    (select attempt_id from guardrail_step),
    '42000000-0000-4000-8000-000000000004',
    repeat('c', 64),
    '<pgtap-stale-course@example.test>',
    (select lead_email from guardrail_step),
    (select course_title from guardrail_step)
  ),
  'begin-send bloqueia curso alterado depois do claim'
);
update public.lead set tema_interesse = (select course_title from guardrail_step) where id = 'reactivation-lead-1';
select ok(
  public.sales_mark_send_failure(
    (select attempt_id from guardrail_step),
    '42000000-0000-4000-8000-000000000004',
    'RETRYABLE_FAILED',
    'GUARDRAIL_REJECTED'
  ),
  'guardrail libera o passo sem envio'
);
select is(
  (select lead_id from public.sales_notification_outbox where kind = 'GUARDRAIL' limit 1),
  'reactivation-lead-1',
  'alerta de guardrail preserva somente a referência do lead'
);

insert into public.sales_notification_outbox (event_key, kind, lead_id, safe_payload)
values ('pgtap:notification:1', 'REPLIED', 'reactivation-lead-1', '{"safe_summary":"Resposta recebida."}'::jsonb);
create temporary table claimed_notification as
select * from public.sales_claim_notifications(
  '50000000-0000-0000-0000-000000000005', now(), 120, 1
);
select is((select count(*)::integer from claimed_notification), 1, 'outbox de Telegram usa claim com lease');
select ok(
  public.sales_complete_notification(
    (select notification_id from claimed_notification),
    '50000000-0000-0000-0000-000000000005'
  ),
  'notificação concluída de forma idempotente'
);

select ok(
  public.sales_set_orchestrator_state('PAUSE', 'pgtap', null, 'control:pgtap:pause'),
  'pause aciona o kill switch por função protegida'
);
select is(
  (select count(*)::integer from public.sales_orchestrator_control_event where idempotency_key = 'control:pgtap:pause'),
  1,
  'mudança de controle gera evento de auditoria'
);

set local role service_role;
select throws_ok(
  $$update public.sales_reactivation_campaign_step set delay_days = 4 where step_index = 1$$,
  '55000',
  'Registro comercial auditável é append-only.',
  'passos de uma versão publicada são imutáveis'
);
select throws_ok(
  $$update public.lead_contact_permission_event set actor_id = 'tampered' where lead_id = 'reactivation-lead-1'$$,
  '55000',
  'Registro comercial auditável é append-only.',
  'permissão é append-only no fluxo normal'
);
select throws_ok(
  $$update public.lead_email_sequence
    set campaign_course_title = 'Curso adulterado'
    where lead_id = 'reactivation-lead-1' and campaign_key = 'reactivation-v1@1'$$,
  '55000',
  'Curso auditável da sequência é imutável.',
  'curso capturado na sequência não pode ser alterado'
);
reset role;

select * from finish();
rollback;
