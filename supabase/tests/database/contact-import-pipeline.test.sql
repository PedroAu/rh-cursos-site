-- Pipeline de importação de contatos: idempotência, privacidade e fail-closed.
begin;

select plan(28);

select ok((select relrowsecurity from pg_class where oid = 'public.contact_import_batch'::regclass), 'RLS habilitada no lote');
select ok((select relrowsecurity from pg_class where oid = 'public.contact_import_candidate'::regclass), 'RLS habilitada nos candidatos');
select ok(not has_table_privilege('anon', 'public.contact_import_candidate', 'SELECT'), 'anon não lê auditoria de importação');
select ok(not has_table_privilege('authenticated', 'public.contact_import_candidate', 'INSERT'), 'cliente autenticado não grava candidatos');
select ok(has_function_privilege(
  'service_role',
  'public.sales_import_contact_candidate(uuid,varchar,varchar,varchar,varchar,varchar,boolean,timestamptz,varchar,timestamptz,varchar,varchar)',
  'EXECUTE'
), 'service role executa importação pelo RPC controlado');
select ok(not has_function_privilege(
  'anon',
  'public.sales_import_contact_candidate(uuid,varchar,varchar,varchar,varchar,varchar,boolean,timestamptz,varchar,timestamptz,varchar,varchar)',
  'EXECUTE'
), 'anon não executa importação');

create temporary table dry_batch as
select public.sales_create_contact_import_batch(
  'pgtap-dry-run', 'DRY_RUN', 2, 1, repeat('a', 64), null, 'pgtap'
) as id;

create temporary table dry_candidate as
select * from public.sales_import_contact_candidate(
  (select id from dry_batch), repeat('1', 64), 'Ana Exemplo', 'IMPORT-ANA@EXAMPLE.TEST',
  '11999990000', 'Órgão Exemplo', false, null, null, null, 'LEGITIMATE_INTEREST', 'pgtap'
);

select is((select action from dry_candidate), 'WOULD_CREATE', 'dry-run projeta criação');
select ok(not exists (
  select 1 from public.lead where lower(email) = 'import-ana@example.test'
), 'dry-run não cria lead');
select ok(not (select email_hash from public.contact_import_candidate where id = (select candidate_id from dry_candidate)) like '%@%', 'auditoria persiste hash, não e-mail');
select is(
  (select candidate_id from public.sales_import_contact_candidate(
    (select id from dry_batch), repeat('1', 64), 'Ana Exemplo', 'import-ana@example.test',
    '11999990000', 'Órgão Exemplo', false, null, null, null, 'LEGITIMATE_INTEREST', 'pgtap'
  )),
  (select candidate_id from dry_candidate),
  'retry idêntico retorna a mesma decisão'
);
select throws_ok(
  $$select * from public.sales_import_contact_candidate(
    (select id from dry_batch), repeat('1', 64), 'Nome Divergente', 'import-ana@example.test',
    '11999990000', 'Órgão Exemplo', false, null, null, null, 'LEGITIMATE_INTEREST', 'pgtap'
  )$$,
  'P0004',
  'Chave de origem reutilizada com payload divergente.',
  'retry divergente é rejeitado'
);
select ok(public.sales_complete_contact_import_batch((select id from dry_batch), 'pgtap'), 'lote dry-run é concluído');
select is(
  (select candidate_id from public.sales_import_contact_candidate(
    (select id from dry_batch), repeat('1', 64), 'Ana Exemplo', 'import-ana@example.test',
    '11999990000', 'Órgão Exemplo', false, null, null, null, 'LEGITIMATE_INTEREST', 'pgtap'
  )),
  (select candidate_id from dry_candidate),
  'retry idêntico continua válido após conclusão do lote'
);
select throws_ok(
  $$select public.sales_create_contact_import_batch(
    'pgtap-dry-run', 'DRY_RUN', 2, 2, repeat('a', 64), null, 'pgtap'
  )$$,
  'P0004',
  'Digest de lote reutilizado com contrato divergente.',
  'digest não aceita contrato divergente'
);

create temporary table apply_batch as
select public.sales_create_contact_import_batch(
  'pgtap-apply', 'APPLY', 4, 4, repeat('b', 64), 'approval:pgtap:contacts', 'pgtap'
) as id;

create temporary table created_contact as
select * from public.sales_import_contact_candidate(
  (select id from apply_batch), repeat('2', 64), 'Bia Exemplo', 'import-bia@example.test',
  '11988880000', 'Órgão B', true, now() - interval '40 days', 'SENT', now() - interval '40 days',
  'LEGITIMATE_INTEREST', 'pgtap'
);

select is((select action from created_contact), 'CREATED', 'apply cria lead inexistente');
select is((select count(*)::integer from public.lead where lower(email) = 'import-bia@example.test'), 1, 'lead é único após criação');
select is((select segment_key from public.lead_segment_assignment where lead_id = (select lead_id from created_contact)), 'GESTAO_DE_PESSOAS', 'classificação é registrada fora do interesse de curso');
select is((select status from public.lead_contact_permission_event where lead_id = (select lead_id from created_contact)), 'UNKNOWN', 'base importada não vira aprovação');
select is((select event_type from public.lead_interaction where lead_id = (select lead_id from created_contact)), 'SENT', 'evento histórico conhecido entra na timeline');

create temporary table preserved_contact as
select * from public.sales_import_contact_candidate(
  (select id from apply_batch), repeat('3', 64), 'Nome que não substitui', 'import-bia@example.test',
  '11977770000', 'Outro órgão', false, null, null, null, null, 'pgtap'
);
select is((select action from preserved_contact), 'EXISTING', 'registro existente é reutilizado');
select ok((select reason_codes @> array['CRM_HISTORY_PRESENT'] from preserved_contact), 'comparação detecta histórico oficial antes de preservar o registro');
select is((select nome from public.lead where id = (select lead_id from preserved_contact)), 'Bia Exemplo', 'PII existente não é sobrescrita');

create temporary table undated_contact as
select * from public.sales_import_contact_candidate(
  (select id from apply_batch), repeat('4', 64), 'Caio Exemplo', 'import-caio@example.test',
  null, null, true, null, null, null, 'LEGITIMATE_INTEREST', 'pgtap'
);
select is(
  (select last_interaction_at::text from public.sales_list_reactivation_candidates(
    (select id from public.sales_reactivation_campaign where campaign_key = 'reactivation-v1' and version = 1),
    500, 0
  ) where lead_id = (select lead_id from undated_contact)),
  'infinity',
  'histórico sem data bloqueia a política indefinidamente'
);

insert into public.lead (id, nome, email, tipo, status_crm, origem)
values
  ('import-duplicate-a', 'Duplicado A', 'duplicate-import@example.test', 'Contato', 'Novo', 'Teste'),
  ('import-duplicate-b', 'Duplicado B', 'DUPLICATE-IMPORT@example.test', 'Contato', 'Novo', 'Teste');

create temporary table blocked_duplicate as
select * from public.sales_import_contact_candidate(
  (select id from apply_batch), repeat('5', 64), 'Duplicado', 'duplicate-import@example.test',
  null, null, false, null, null, null, null, 'pgtap'
);
select is((select action from blocked_duplicate), 'BLOCKED', 'duplicidade preexistente bloqueia importação');
select ok((select reason_codes @> array['DUPLICATE_CRM_EMAIL'] from blocked_duplicate), 'bloqueio tem reason code auditável');

select ok(public.sales_complete_contact_import_batch((select id from apply_batch), 'pgtap'), 'lote apply é concluído');
select throws_ok(
  $$select * from public.sales_import_contact_candidate(
    (select id from apply_batch), repeat('6', 64), 'Depois do fechamento', 'closed@example.test',
    null, null, false, null, null, null, null, 'pgtap'
  )$$,
  'P0001',
  'Lote de importação não está aberto.',
  'lote concluído rejeita novos candidatos'
);

select throws_ok(
  $$select public.sales_create_contact_import_batch(
    'sem-aprovacao', 'APPLY', 1, 1, repeat('c', 64), null, 'pgtap'
  )$$,
  'P0001',
  'Aplicação exige referência de aprovação.',
  'apply exige referência explícita de aprovação'
);

select * from finish();
rollback;
