-- Story 2026-09-19 — decisão de coorte e primeiro contato de prospecção.
begin;

select plan(27);

select is(
  (select permission_purpose from public.sales_reactivation_campaign where campaign_key = 'prospecting-v1' and version = 1),
  'COMMERCIAL_PROSPECTING',
  'campanha de prospecção possui propósito próprio'
);
select is(
  (select status from public.sales_reactivation_campaign where campaign_key = 'prospecting-v1' and version = 1),
  'DISABLED',
  'campanha nasce desabilitada'
);
select is(
  (select count(*)::integer from public.sales_reactivation_campaign_step step
   join public.sales_reactivation_campaign campaign on campaign.id = step.campaign_id
   where campaign.campaign_key = 'prospecting-v1' and campaign.version = 1),
  1,
  'campanha possui somente o primeiro contato'
);
select is(
  (select count(*)::integer from public.sales_reactivation_campaign_course campaign_course
   join public.sales_reactivation_campaign campaign on campaign.id = campaign_course.campaign_id
   where campaign.campaign_key = 'prospecting-v1' and campaign.version = 1),
  1,
  'campanha de prospecção seleciona somente o segmento Gestão de Pessoas'
);
select ok(
  has_function_privilege('service_role', 'public.sales_plan_prospecting_permission_cohort(varchar)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.sales_plan_prospecting_permission_cohort(varchar)', 'EXECUTE'),
  'planejador agregado é restrito ao processo confiável'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sales_permission_cohort_decision'::regclass),
  'RLS protege decisões de coorte'
);

insert into public.lead (id, nome, email, tipo, tema_interesse, status_crm, origem)
values
  ('prospect-eligible', 'Contato Elegível', 'eligible@example.test', 'Curso', 'Gestão de Pessoas', 'Novo', 'Importação'),
  ('prospect-blocked', 'Contato Bloqueado', 'blocked@example.test', 'Curso', 'Gestão de Pessoas', 'Novo', 'Importação'),
  ('prospect-invalid', 'Contato Inválido', 'email-invalido', 'Curso', 'Gestão de Pessoas', 'Novo', 'Importação'),
  ('prospect-suppressed', 'Contato Suprimido', 'suppressed@example.test', 'Curso', 'Gestão de Pessoas', 'Novo', 'Importação'),
  ('prospect-other-course', 'Outro Tema', 'other@example.test', 'Curso', 'Tema fora da campanha', 'Novo', 'Importação');

insert into public.lead_contact_permission_event (
  lead_id, status, legal_basis, purpose, evidence_ref, occurred_at, actor_id, idempotency_key
)
select
  lead_id, 'UNKNOWN', null, 'CONTACT_IMPORT', 'import-batch://pgtap/2026-09-19',
  now() - interval '1 day', 'pgtap', 'prospecting-source:' || lead_id
from (values
  ('prospect-eligible'),
  ('prospect-blocked'),
  ('prospect-invalid'),
  ('prospect-suppressed'),
  ('prospect-other-course')
) imported(lead_id);

insert into public.lead_contact_permission_event (
  lead_id, status, legal_basis, purpose, evidence_ref, occurred_at, actor_id, idempotency_key
) values (
  'prospect-blocked', 'BLOCKED', null, 'COMMERCIAL_PROSPECTING', 'test://opposition',
  now(), 'pgtap', 'prospecting-blocked:prospect-blocked'
);
insert into public.lead_interaction (
  id, lead_id, event_type, occurred_at, direction, source, correlation_id,
  actor_id, actor_version, safe_summary, idempotency_key, event_hash
) values (
  '90000000-0000-4000-8000-000000000019', 'prospect-suppressed', 'UNSUBSCRIBED', now(),
  'INBOUND', 'CRM', 'pgtap:prospect-suppressed', 'pgtap', '1',
  'Descadastro importado.', 'pgtap:prospect-suppressed', repeat('a', 64)
);
insert into public.lead_email_suppression (lead_id, reason, source_event_id, suppressed_at)
values ('prospect-suppressed', 'UNSUBSCRIBED', '90000000-0000-4000-8000-000000000019', now());

create temporary table prospecting_plan as
select
  public.sales_plan_prospecting_permission_cohort('prospecting-v1') as report,
  now() + interval '15 days' as expires_at;

select is((select (report #>> '{evaluated}')::integer from prospecting_plan), 5, 'plano avalia a base importada');
select is((select (report #>> '{eligible}')::integer from prospecting_plan), 2, 'plano seleciona todos os contatos elegíveis, independentemente do tema');
select is((select (report #>> '{excludedByReason,PERMISSION_BLOCKED}')::integer from prospecting_plan), 1, 'BLOCKED permanece excluído');
select is((select (report #>> '{excludedByReason,SUPPRESSED}')::integer from prospecting_plan), 1, 'supressão permanece excluída');
select is((select (report #>> '{excludedByReason,EMAIL_INVALID}')::integer from prospecting_plan), 1, 'e-mail inválido permanece excluído');
select ok(not ((select report from prospecting_plan) #> '{excludedByReason}') ? 'COURSE_NOT_APPROVED', 'tema do lead não restringe a coorte de primeiro contato');
select matches(
  (select report #>> '{cohortDigest}' from prospecting_plan),
  '^[0-9a-f]{64}$',
  'digest SHA-256 identifica a coorte sem PII'
);
select is((select (report #>> '{messagesSent}')::integer from prospecting_plan), 0, 'dry-run não envia mensagens');

select throws_ok(
  $$select public.sales_apply_prospecting_permission_cohort(
    'prospecting-v1',
    'controller-2026-09-19-prospecting-v1-stale',
    repeat('f', 64),
    'https://github.com/rhcursos/site/commit/pgtap',
    (select expires_at from prospecting_plan),
    'controller-pedro'
  )$$,
  'P0001',
  'Coorte mudou após o dry-run; gere um novo plano.',
  'aplicação rejeita digest diferente do plano revisado'
);

create temporary table prospecting_apply as
select public.sales_apply_prospecting_permission_cohort(
  'prospecting-v1',
  'controller-2026-09-19-prospecting-v1-pgtap',
  (select report #>> '{cohortDigest}' from prospecting_plan),
  'https://github.com/rhcursos/site/commit/pgtap',
  (select expires_at from prospecting_plan),
  'controller-pedro'
) as report;

select is((select (report #>> '{approved}')::integer from prospecting_apply), 2, 'aplicação aprova toda a coorte elegível');
select is(
  (select purpose from public.lead_contact_permission_event where lead_id = 'prospect-eligible' order by occurred_at desc, id desc limit 1),
  'COMMERCIAL_PROSPECTING',
  'evento append-only registra o propósito da campanha'
);
select is(
  (select legal_basis from public.lead_contact_permission_event where lead_id = 'prospect-eligible' order by occurred_at desc, id desc limit 1),
  'LEGITIMATE_INTEREST',
  'evento registra a decisão de legítimo interesse'
);
select is((select count(*)::integer from public.lead_email_sequence where lead_id like 'prospect-%'), 0, 'aprovação não cria sequências');
select is((select count(*)::integer from public.lead_email_message where lead_id like 'prospect-%'), 0, 'aprovação não cria mensagens');

select ok((
  public.sales_apply_prospecting_permission_cohort(
    'prospecting-v1',
    'controller-2026-09-19-prospecting-v1-pgtap',
    (select report #>> '{cohortDigest}' from prospecting_plan),
    'https://github.com/rhcursos/site/commit/pgtap',
    (select expires_at from prospecting_plan),
    'controller-pedro'
  ) #>> '{idempotent}'
)::boolean, 'reaplicação idêntica é idempotente');

insert into public.lead_interaction (
  lead_id, event_type, occurred_at, direction, source, correlation_id,
  actor_id, actor_version, safe_summary, idempotency_key, event_hash
) values (
  'prospect-other-course', 'SENT', now() - interval '1 minute', 'OUTBOUND', 'CRM',
  'pgtap:recent-prospecting', 'pgtap', '1', 'Contato anterior sem oposição.',
  'pgtap:recent-prospecting', repeat('b', 64)
);
update public.sales_orchestrator_control
set enabled = true, dry_run = false, kill_switch = false, updated_by = 'pgtap'
where id = 'global';
update public.sales_reactivation_campaign
set status = 'ACTIVE'
where campaign_key = 'prospecting-v1' and version = 1;

select lives_ok(
  $$select public.sales_create_reactivation_sequence(
    'prospect-other-course',
    (select id from public.sales_reactivation_campaign where campaign_key = 'prospecting-v1' and version = 1),
    '91000000-0000-4000-8000-000000000019',
    'pgtap:prospecting-sequence',
    'pgtap'
  )$$,
  'prospecção aprovada inclui outro tema e não exige prova individual de inatividade'
);
select is(
  (select count(*)::integer
   from public.lead_email_sequence_step step
   join public.lead_email_sequence sequence on sequence.id = step.sequence_id
   where sequence.lead_id = 'prospect-other-course'
     and sequence.campaign_key = 'prospecting-v1@1'),
  1,
  'prospecção materializa somente o primeiro contato'
);

set local role service_role;
select throws_ok(
  $$update public.sales_permission_cohort_decision set decided_by = 'mutated'$$,
  '55000',
  'Registro comercial auditável é append-only.',
  'decisão de coorte não pode ser alterada'
);
reset role;
select is(
  (select status from public.lead_contact_permission_event where lead_id = 'prospect-blocked' order by occurred_at desc, id desc limit 1),
  'BLOCKED',
  'aplicação nunca sobrescreve a oposição mais recente'
);
select ok(
  has_function_privilege('service_role', 'public.sales_claim_reactivation_steps(varchar,uuid,timestamptz,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.sales_claim_reactivation_steps(varchar,uuid,timestamptz,integer,integer)', 'EXECUTE'),
  'claim isolado por campanha é restrito ao worker'
);
select is(
  (select permission_purpose from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
  'COMMERCIAL_REACTIVATION',
  'campanha anterior preserva seu propósito'
);

select * from finish();
rollback;
