-- Registra a higienizacao deterministica da coorte sem transformar falhas locais
-- em bounces falsos. A aplicacao so pode ocorrer com a automacao fail-closed.

begin;

create table if not exists public.lead_email_hygiene_result (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  campaign_key varchar(160) not null,
  normalized_email_hash varchar(64) not null,
  result varchar(16) not null,
  reason_code varchar(32) not null,
  provider varchar(40) not null default 'LOCAL_DNS_PREFLIGHT',
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null,
  run_key varchar(120) not null,
  actor_id varchar(120) not null,
  idempotency_key varchar(255) not null unique,
  created_at timestamptz not null default now(),
  constraint lead_email_hygiene_hash_chk check (normalized_email_hash ~ '^[0-9a-f]{64}$'),
  constraint lead_email_hygiene_result_chk check (result in ('ELIGIBLE', 'BLOCKED')),
  constraint lead_email_hygiene_reason_chk check (
    reason_code in ('DNS_VALID', 'DNS_INCONCLUSIVE', 'INVALID_SYNTAX', 'NO_MAIL_ROUTE', 'DUPLICATE_EMAIL')
  ),
  constraint lead_email_hygiene_consistency_chk check (
    (result = 'ELIGIBLE' and reason_code in ('DNS_VALID', 'DNS_INCONCLUSIVE'))
    or (result = 'BLOCKED' and reason_code in ('INVALID_SYNTAX', 'NO_MAIL_ROUTE', 'DUPLICATE_EMAIL'))
  ),
  constraint lead_email_hygiene_evidence_object_chk check (jsonb_typeof(evidence) = 'object')
);

create index if not exists lead_email_hygiene_lead_idx
  on public.lead_email_hygiene_result (lead_id, checked_at desc, id desc);
create index if not exists lead_email_hygiene_campaign_idx
  on public.lead_email_hygiene_result (campaign_key, result, checked_at desc);

drop trigger if exists lead_email_hygiene_result_append_only on public.lead_email_hygiene_result;
create trigger lead_email_hygiene_result_append_only
  before update or delete on public.lead_email_hygiene_result
  for each row execute function public.reject_sales_audit_mutation();

alter table public.lead_email_hygiene_result enable row level security;
revoke all on table public.lead_email_hygiene_result from public, anon, authenticated, service_role;
grant select on table public.lead_email_hygiene_result to authenticated;
grant select on table public.lead_email_hygiene_result to service_role;

drop policy if exists lead_email_hygiene_admin_select on public.lead_email_hygiene_result;
create policy lead_email_hygiene_admin_select
  on public.lead_email_hygiene_result for select
  to authenticated using (public.is_admin());

create or replace function public.sales_apply_email_hygiene(
  p_campaign_key varchar,
  p_results jsonb,
  p_run_key varchar,
  p_actor_id varchar,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_total integer;
  v_stale integer;
  v_inserted integer := 0;
  v_interrupted integer := 0;
  v_cancelled integer := 0;
begin
  if p_apply is null
    or nullif(trim(p_campaign_key), '') is null
    or length(trim(p_campaign_key)) > 160
    or nullif(trim(p_run_key), '') is null
    or length(trim(p_run_key)) < 12
    or length(trim(p_run_key)) > 120
    or nullif(trim(p_actor_id), '') is null
    or length(trim(p_actor_id)) > 120
    or jsonb_typeof(p_results) <> 'array'
    or jsonb_array_length(p_results) < 1
    or jsonb_array_length(p_results) > 5000 then
    raise exception 'Lote de higienizacao invalido.' using errcode = 'P0001';
  end if;

  drop table if exists pg_temp.email_hygiene_input;
  create temporary table pg_temp.email_hygiene_input (
    lead_id varchar(80) primary key,
    email_hash varchar(64) not null,
    result varchar(16) not null,
    reason_code varchar(32) not null,
    checked_at timestamptz not null,
    evidence jsonb not null
  ) on commit drop;
  insert into pg_temp.email_hygiene_input (lead_id, email_hash, result, reason_code, checked_at, evidence)
  select
    trim(value.lead_id), lower(trim(value.email_hash)), value.result,
    value.reason_code, value.checked_at, coalesce(value.evidence, '{}'::jsonb)
  from jsonb_to_recordset(p_results) as value(
    lead_id varchar,
    email_hash varchar,
    result varchar,
    reason_code varchar,
    checked_at timestamptz,
    evidence jsonb
  );

  get diagnostics v_total = row_count;
  if v_total <> jsonb_array_length(p_results)
    or exists (
      select 1 from pg_temp.email_hygiene_input
      where email_hash !~ '^[0-9a-f]{64}$'
        or result not in ('ELIGIBLE', 'BLOCKED')
        or reason_code not in ('DNS_VALID', 'DNS_INCONCLUSIVE', 'INVALID_SYNTAX', 'NO_MAIL_ROUTE', 'DUPLICATE_EMAIL')
        or (result = 'ELIGIBLE') <> (reason_code in ('DNS_VALID', 'DNS_INCONCLUSIVE'))
        or jsonb_typeof(evidence) <> 'object'
    ) then
    raise exception 'Resultados de higienizacao invalidos.' using errcode = 'P0001';
  end if;

  -- Locks em ordem estavel impedem que endereco ou estado da sequencia mudem
  -- entre a validacao do hash e a interrupcao do mesmo lote.
  perform current_lead.id
  from public.lead current_lead
  join pg_temp.email_hygiene_input input on input.lead_id = current_lead.id
  order by current_lead.id
  for update of current_lead;

  perform sequence.id
  from public.lead_email_sequence sequence
  join pg_temp.email_hygiene_input input on input.lead_id = sequence.lead_id
  where sequence.campaign_key = trim(p_campaign_key)
  order by sequence.id
  for update of sequence;

  select count(*)::integer into v_stale
  from pg_temp.email_hygiene_input input
  left join public.lead current_lead on current_lead.id = input.lead_id
  where current_lead.id is null
    or current_lead.deleted_at is not null
    or current_lead.email is null
    or input.email_hash <> encode(extensions.digest(lower(trim(current_lead.email)), 'sha256'), 'hex')
    or not exists (
      select 1 from public.lead_email_sequence sequence
      where sequence.lead_id = input.lead_id
        and sequence.campaign_key = trim(p_campaign_key)
    );

  if not p_apply then
    return jsonb_build_object(
      'mode', 'DRY_RUN',
      'evaluated', v_total,
      'eligible', (select count(*) from pg_temp.email_hygiene_input where result = 'ELIGIBLE'),
      'blocked', (select count(*) from pg_temp.email_hygiene_input where result = 'BLOCKED'),
      'stale', v_stale,
      'inserted', 0,
      'interrupted', 0,
      'cancelledSteps', 0
    );
  end if;

  if v_stale > 0 then
    raise exception 'A coorte mudou desde a verificacao; aplique nova varredura.' using errcode = 'P0004';
  end if;
  if not exists (
    select 1 from public.sales_orchestrator_control
    where id = 'global' and not enabled and kill_switch
  ) or not exists (
    select 1 from public.sales_reactivation_campaign campaign
    where campaign.campaign_key || '@' || campaign.version::text = trim(p_campaign_key)
      and campaign.status in ('PAUSED', 'DISABLED')
  ) or exists (
    select 1
    from public.sales_send_attempt attempt
    join public.lead_email_sequence_step step on step.id = attempt.sequence_step_id
    join public.lead_email_sequence sequence on sequence.id = step.sequence_id
    where sequence.campaign_key = trim(p_campaign_key) and attempt.status = 'SENDING'
  ) then
    raise exception 'Higienizacao exige campanha pausada, kill switch ativo e nenhum envio em curso.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pg_temp.email_hygiene_input input
    join public.lead_email_hygiene_result existing
      on existing.idempotency_key = 'email-hygiene:' || encode(extensions.digest(
        trim(p_campaign_key) || chr(31) || trim(p_run_key) || chr(31) || input.lead_id,
        'sha256'
      ), 'hex')
    where existing.normalized_email_hash <> input.email_hash
      or existing.result <> input.result
      or existing.reason_code <> input.reason_code
  ) then
    raise exception 'Run key reutilizada com resultado divergente.' using errcode = 'P0004';
  end if;

  insert into public.lead_email_hygiene_result (
    lead_id, campaign_key, normalized_email_hash, result, reason_code,
    evidence, checked_at, run_key, actor_id, idempotency_key
  )
  select
    input.lead_id, trim(p_campaign_key), input.email_hash, input.result, input.reason_code,
    input.evidence, input.checked_at, trim(p_run_key), trim(p_actor_id),
    'email-hygiene:' || encode(extensions.digest(
      trim(p_campaign_key) || chr(31) || trim(p_run_key) || chr(31) || input.lead_id,
      'sha256'
    ), 'hex')
  from pg_temp.email_hygiene_input input
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  drop table if exists pg_temp.email_hygiene_interrupted;
  create temporary table pg_temp.email_hygiene_interrupted (
    sequence_id uuid primary key
  ) on commit drop;
  with changed as (
    update public.lead_email_sequence sequence
    set status = 'INTERRUPTED',
        interrupted_at = now(),
        interruption_reason = 'EMAIL_HYGIENE_INVALID',
        interruption_event_id = null
    from pg_temp.email_hygiene_input input
    where sequence.lead_id = input.lead_id
      and sequence.campaign_key = trim(p_campaign_key)
      and sequence.status = 'ACTIVE'
      and input.result = 'BLOCKED'
    returning sequence.id
  )
  insert into pg_temp.email_hygiene_interrupted (sequence_id)
  select id from changed;
  get diagnostics v_interrupted = row_count;

  update public.lead_email_sequence_step step
  set status = 'CANCELLED',
      cancelled_at = now(),
      claim_token = null,
      claim_expires_at = null,
      last_error_code = 'EMAIL_HYGIENE_INVALID'
  where step.sequence_id in (select sequence_id from pg_temp.email_hygiene_interrupted)
    and step.status = 'PENDING';
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object(
    'mode', 'APPLY',
    'evaluated', v_total,
    'eligible', (select count(*) from pg_temp.email_hygiene_input where result = 'ELIGIBLE'),
    'blocked', (select count(*) from pg_temp.email_hygiene_input where result = 'BLOCKED'),
    'stale', 0,
    'inserted', v_inserted,
    'interrupted', v_interrupted,
    'cancelledSteps', v_cancelled
  );
end;
$$;

revoke all on function public.sales_apply_email_hygiene(varchar, jsonb, varchar, varchar, boolean)
  from public, anon, authenticated;
grant execute on function public.sales_apply_email_hygiene(varchar, jsonb, varchar, varchar, boolean)
  to service_role;

comment on table public.lead_email_hygiene_result is
  'Resultados append-only de higienizacao sem armazenar o endereco de e-mail em claro.';
comment on function public.sales_apply_email_hygiene(varchar, jsonb, varchar, varchar, boolean) is
  'Planeja ou aplica um lote idempotente de higienizacao com a automacao fail-closed.';

commit;
