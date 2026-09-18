-- Story 2026-09-18 — orquestrador seguro de reativação.
-- Todos os controles nascem fail-closed: campanha desabilitada, conteúdo em
-- rascunho, dry-run ativo e kill switch global ligado.

begin;

create table if not exists public.lead_contact_permission_event (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  status varchar(16) not null,
  legal_basis varchar(32),
  purpose varchar(80) not null,
  evidence_ref varchar(500),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz,
  actor_id varchar(120) not null,
  idempotency_key varchar(255) not null unique,
  constraint lead_contact_permission_status_chk check (status in ('APPROVED', 'BLOCKED', 'UNKNOWN')),
  constraint lead_contact_permission_basis_chk check (
    legal_basis is null or legal_basis in ('CONSENT', 'LEGITIMATE_INTEREST', 'CONTRACT', 'OTHER')
  ),
  constraint lead_contact_permission_approved_chk check (
    status <> 'APPROVED' or (legal_basis is not null and evidence_ref is not null)
  )
);

create index if not exists lead_contact_permission_current_idx
  on public.lead_contact_permission_event (lead_id, occurred_at desc, id desc);

create table if not exists public.sales_reactivation_campaign (
  id uuid primary key default gen_random_uuid(),
  campaign_key varchar(120) not null,
  version integer not null,
  status varchar(16) not null default 'DISABLED',
  content_status varchar(16) not null default 'DRAFT',
  policy_version varchar(80) not null,
  template_version varchar(80) not null,
  timezone varchar(64) not null default 'America/Sao_Paulo',
  sender_email varchar(180) not null,
  reply_to_email varchar(180) not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by varchar(120),
  constraint sales_reactivation_campaign_unique unique (campaign_key, version),
  constraint sales_reactivation_campaign_version_chk check (version > 0),
  constraint sales_reactivation_campaign_status_chk check (status in ('DISABLED', 'ACTIVE', 'PAUSED')),
  constraint sales_reactivation_content_status_chk check (content_status in ('DRAFT', 'APPROVED', 'RETIRED')),
  constraint sales_reactivation_campaign_approval_chk check (
    content_status <> 'APPROVED' or (approved_at is not null and approved_by is not null)
  )
);

create table if not exists public.sales_reactivation_campaign_step (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sales_reactivation_campaign(id) on delete restrict,
  step_index smallint not null,
  delay_days smallint not null,
  subject_template varchar(250) not null,
  body_text_template text not null,
  template_hash varchar(64) not null,
  created_at timestamptz not null default now(),
  constraint sales_reactivation_step_unique unique (campaign_id, step_index),
  constraint sales_reactivation_step_index_chk check (step_index between 0 and 2),
  constraint sales_reactivation_delay_chk check (
    (step_index = 0 and delay_days = 0)
    or (step_index = 1 and delay_days = 5)
    or (step_index = 2 and delay_days = 10)
  ),
  constraint sales_reactivation_template_hash_chk check (template_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.sales_reactivation_campaign_course (
  campaign_id uuid not null references public.sales_reactivation_campaign(id) on delete restrict,
  course_title varchar(240) not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, course_title)
);

create table if not exists public.sales_orchestrator_control (
  id varchar(40) primary key,
  enabled boolean not null default false,
  dry_run boolean not null default true,
  kill_switch boolean not null default true,
  timezone varchar(64) not null default 'America/Sao_Paulo',
  send_window_start smallint not null default 8,
  send_window_end smallint not null default 18,
  daily_limit integer not null default 25,
  batch_limit integer not null default 5,
  minimum_inactivity_days smallint not null default 15,
  updated_at timestamptz not null default now(),
  updated_by varchar(120) not null,
  constraint sales_orchestrator_control_id_chk check (id = 'global'),
  constraint sales_orchestrator_window_chk check (
    send_window_start between 0 and 23 and send_window_end between 1 and 24 and send_window_start < send_window_end
  ),
  constraint sales_orchestrator_limits_chk check (
    daily_limit between 1 and 500
    and batch_limit between 1 and 50
    and minimum_inactivity_days between 1 and 365
  ),
  constraint sales_orchestrator_live_chk check (enabled = false or dry_run = false),
  constraint sales_orchestrator_kill_chk check (kill_switch = false or enabled = false)
);

insert into public.sales_orchestrator_control (id, enabled, dry_run, kill_switch, updated_by)
values ('global', false, true, true, 'migration:20260918120000')
on conflict (id) do nothing;

create table if not exists public.sales_orchestrator_control_event (
  id uuid primary key default gen_random_uuid(),
  action varchar(16) not null,
  previous_state jsonb not null,
  new_state jsonb not null,
  actor_id varchar(120) not null,
  approval_reference varchar(255),
  idempotency_key varchar(255) not null unique,
  occurred_at timestamptz not null default now(),
  constraint sales_orchestrator_control_action_chk check (action in ('DRY_RUN', 'PAUSE', 'RESUME')),
  constraint sales_orchestrator_resume_approval_chk check (
    action <> 'RESUME' or length(trim(approval_reference)) >= 12
  )
);

create table if not exists public.sales_reactivation_decision (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  campaign_id uuid not null references public.sales_reactivation_campaign(id) on delete restrict,
  run_id uuid not null,
  decision varchar(16) not null,
  mode varchar(16) not null,
  reason_codes text[] not null,
  policy_version varchar(80) not null,
  correlation_id varchar(255) not null,
  decided_at timestamptz not null default now(),
  actor_id varchar(120) not null,
  idempotency_key varchar(255) not null unique,
  constraint sales_reactivation_decision_chk check (decision in ('ELIGIBLE', 'REJECTED')),
  constraint sales_reactivation_mode_chk check (mode in ('BLOCKED', 'DRY_RUN', 'LIVE')),
  constraint sales_reactivation_reasons_chk check (cardinality(reason_codes) > 0)
);

create index if not exists sales_reactivation_decision_run_idx
  on public.sales_reactivation_decision (run_id, decided_at, id);
create index if not exists sales_reactivation_decision_lead_idx
  on public.sales_reactivation_decision (lead_id, decided_at desc, id desc);

alter table public.lead_email_sequence_step
  add column if not exists claim_token uuid,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error_code varchar(80);

alter table public.lead_email_sequence_step
  drop constraint if exists lead_email_sequence_step_claim_chk;
alter table public.lead_email_sequence_step
  add constraint lead_email_sequence_step_claim_chk check (
    (claim_token is null and claim_expires_at is null)
    or (claim_token is not null and claim_expires_at is not null)
  );

create table if not exists public.sales_send_attempt (
  id uuid primary key default gen_random_uuid(),
  sequence_step_id uuid not null references public.lead_email_sequence_step(id) on delete restrict,
  attempt_number integer not null,
  status varchar(24) not null,
  idempotency_key varchar(255) not null unique,
  claim_token uuid not null,
  payload_hash varchar(64),
  provider_message_id varchar(255),
  rfc_message_id varchar(255),
  error_code varchar(80),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint sales_send_attempt_unique unique (sequence_step_id, attempt_number),
  constraint sales_send_attempt_number_chk check (attempt_number between 1 and 10),
  constraint sales_send_attempt_status_chk check (
    status in ('CLAIMED', 'SENDING', 'SENT', 'RETRYABLE_FAILED', 'PERMANENT_FAILED', 'AMBIGUOUS', 'DRY_RUN')
  ),
  constraint sales_send_attempt_hash_chk check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists sales_send_attempt_status_idx
  on public.sales_send_attempt (status, started_at);

create table if not exists public.sales_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key varchar(255) not null unique,
  kind varchar(32) not null,
  lead_id varchar(80) references public.lead(id) on delete restrict,
  interaction_id uuid references public.lead_interaction(id) on delete restrict,
  safe_payload jsonb not null default '{}'::jsonb,
  status varchar(16) not null default 'PENDING',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claim_token uuid,
  claim_expires_at timestamptz,
  sent_at timestamptz,
  error_code varchar(80),
  created_at timestamptz not null default now(),
  constraint sales_notification_kind_chk check (
    kind in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'PERMANENT_FAILURE', 'GUARDRAIL')
  ),
  constraint sales_notification_status_chk check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  constraint sales_notification_attempts_chk check (attempts between 0 and 10),
  constraint sales_notification_claim_chk check (
    (claim_token is null and claim_expires_at is null)
    or (claim_token is not null and claim_expires_at is not null)
  )
);

create index if not exists sales_notification_pending_idx
  on public.sales_notification_outbox (available_at, created_at)
  where status in ('PENDING', 'FAILED');

create or replace function public.sales_enqueue_terminal_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED') then
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

drop trigger if exists lead_interaction_terminal_notification on public.lead_interaction;
create trigger lead_interaction_terminal_notification
  after insert on public.lead_interaction
  for each row execute function public.sales_enqueue_terminal_notification();

create or replace function public.sales_create_reactivation_sequence(
  p_lead_id varchar,
  p_campaign_id uuid,
  p_run_id uuid,
  p_correlation_id varchar,
  p_actor_id varchar
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence_id uuid;
  v_campaign public.sales_reactivation_campaign%rowtype;
  v_permission public.lead_contact_permission_event%rowtype;
  v_control public.sales_orchestrator_control%rowtype;
  v_course_title text;
begin
  select * into v_campaign from public.sales_reactivation_campaign where id = p_campaign_id;
  if v_campaign.id is null or v_campaign.status <> 'ACTIVE' or v_campaign.content_status <> 'APPROVED' then
    raise exception 'Campanha não está apta para execução.' using errcode = 'P0001';
  end if;
  select * into v_control from public.sales_orchestrator_control where id = 'global';
  if v_control.id is null or not v_control.enabled or v_control.dry_run or v_control.kill_switch then
    raise exception 'Orquestrador não está habilitado para envio.' using errcode = 'P0001';
  end if;

  select coalesce(nullif(trim(course.titulo), ''), nullif(trim(lead.tema_interesse), ''))
    into v_course_title
  from public.lead lead
  left join public.curso course on course.id = lead.curso_id and course.deleted_at is null
  where lead.id = p_lead_id
    and lead.deleted_at is null
    and lead.email is not null
    and lead.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';
  if v_course_title is null then
    raise exception 'Lead sem e-mail elegível.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.sales_reactivation_campaign_course
    where campaign_id = p_campaign_id and course_title = v_course_title
  ) then
    raise exception 'Curso não pertence à campanha.' using errcode = 'P0001';
  end if;

  select * into v_permission
  from public.lead_contact_permission_event
  where lead_id = p_lead_id
  order by occurred_at desc, id desc
  limit 1;
  if v_permission.id is null
    or v_permission.status <> 'APPROVED'
    or v_permission.purpose <> 'COMMERCIAL_REACTIVATION'
    or (v_permission.expires_at is not null and v_permission.expires_at <= now()) then
    raise exception 'Permissão comercial ausente ou inválida.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lead_email_suppression where lead_id = p_lead_id) then
    raise exception 'Lead suprimido.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.lead_interaction
    where lead_id = p_lead_id
      and occurred_at > now() - make_interval(days => v_control.minimum_inactivity_days)
  ) then
    raise exception 'Lead possui interação recente.' using errcode = 'P0001';
  end if;

  select id into v_sequence_id
  from public.lead_email_sequence
  where lead_id = p_lead_id
    and campaign_key = v_campaign.campaign_key || '@' || v_campaign.version::text
  order by created_at
  limit 1;
  if v_sequence_id is not null then
    if exists (select 1 from public.lead_email_sequence where id = v_sequence_id and status = 'ACTIVE') then
      return v_sequence_id;
    end if;
    raise exception 'Lead já participou desta versão de campanha.' using errcode = 'P0001';
  end if;

  insert into public.lead_email_sequence (lead_id, campaign_key)
  values (p_lead_id, v_campaign.campaign_key || '@' || v_campaign.version::text)
  on conflict do nothing
  returning id into v_sequence_id;

  if v_sequence_id is null then
    select id into v_sequence_id
    from public.lead_email_sequence
    where lead_id = p_lead_id
      and campaign_key = v_campaign.campaign_key || '@' || v_campaign.version::text
      and status = 'ACTIVE';
  end if;
  if v_sequence_id is null then
    raise exception 'Não foi possível criar sequência ativa.' using errcode = 'P0001';
  end if;

  insert into public.lead_email_sequence_step (sequence_id, step_index, due_at)
  select v_sequence_id, step_index, now() + make_interval(days => delay_days)
  from public.sales_reactivation_campaign_step
  where campaign_id = p_campaign_id
  on conflict (sequence_id, step_index) do nothing;

  insert into public.sales_reactivation_decision (
    lead_id, campaign_id, run_id, decision, mode, reason_codes, policy_version,
    correlation_id, actor_id, idempotency_key
  ) values (
    p_lead_id, p_campaign_id, p_run_id, 'ELIGIBLE', 'LIVE', array['ELIGIBLE'],
    v_campaign.policy_version, p_correlation_id, p_actor_id,
    'sequence:' || p_campaign_id::text || ':' || p_lead_id
  ) on conflict (idempotency_key) do nothing;

  return v_sequence_id;
end;
$$;

create or replace function public.sales_list_reactivation_candidates(
  p_campaign_id uuid,
  p_limit integer,
  p_offset integer default 0
)
returns table (
  lead_id varchar,
  lead_name text,
  lead_email text,
  deleted_at timestamptz,
  course_title text,
  permission_status varchar,
  permission_legal_basis varchar,
  permission_purpose varchar,
  permission_occurred_at timestamptz,
  permission_expires_at timestamptz,
  suppressed boolean,
  has_active_sequence boolean,
  has_campaign_sequence boolean,
  last_interaction_at timestamptz,
  minimum_inactivity_days smallint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit not between 1 and 500 or p_offset < 0 then
    raise exception 'Paginação de candidatos inválida.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.sales_reactivation_campaign where id = p_campaign_id) then
    raise exception 'Campanha não encontrada.' using errcode = 'P0002';
  end if;

  return query
  select
    lead.id,
    lead.nome::text,
    lead.email::text,
    lead.deleted_at,
    coalesce(nullif(trim(course.titulo), ''), nullif(trim(lead.tema_interesse), ''))::text,
    permission.status,
    permission.legal_basis,
    permission.purpose,
    permission.occurred_at,
    permission.expires_at,
    suppression.lead_id is not null,
    campaign_sequence.id is not null and campaign_sequence.status = 'ACTIVE',
    campaign_sequence.id is not null,
    last_interaction.occurred_at,
    control.minimum_inactivity_days
  from public.lead lead
  cross join public.sales_reactivation_campaign campaign
  cross join public.sales_orchestrator_control control
  left join public.curso course on course.id = lead.curso_id and course.deleted_at is null
  left join lateral (
    select event.status, event.legal_basis, event.purpose, event.occurred_at, event.expires_at
    from public.lead_contact_permission_event event
    where event.lead_id = lead.id
    order by event.occurred_at desc, event.id desc
    limit 1
  ) permission on true
  left join public.lead_email_suppression suppression on suppression.lead_id = lead.id
  left join lateral (
    select sequence.id, sequence.status
    from public.lead_email_sequence sequence
    where sequence.lead_id = lead.id
      and sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
    order by sequence.created_at
    limit 1
  ) campaign_sequence on true
  left join lateral (
    select interaction.occurred_at
    from public.lead_interaction interaction
    where interaction.lead_id = lead.id
    order by interaction.occurred_at desc, interaction.id desc
    limit 1
  ) last_interaction on true
  where campaign.id = p_campaign_id and control.id = 'global'
  order by lead.created_at, lead.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.sales_claim_reactivation_steps(
  p_claim_token uuid,
  p_now timestamptz,
  p_lease_seconds integer,
  p_limit integer
)
returns table (
  attempt_id uuid,
  sequence_step_id uuid,
  sequence_id uuid,
  lead_id varchar,
  lead_name text,
  lead_email text,
  course_title text,
  campaign_id uuid,
  campaign_key varchar,
  campaign_version integer,
  step_index smallint,
  subject_template varchar,
  body_text_template text,
  sender_email varchar,
  reply_to_email varchar,
  idempotency_key varchar
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_control public.sales_orchestrator_control%rowtype;
  v_sent_today integer;
begin
  if p_claim_token is null or p_lease_seconds not between 30 and 900 or p_limit not between 1 and 50 then
    raise exception 'Parâmetros de claim inválidos.' using errcode = 'P0001';
  end if;
  select * into v_control from public.sales_orchestrator_control where id = 'global' for update;
  if v_control.id is null or not v_control.enabled or v_control.dry_run or v_control.kill_switch then
    return;
  end if;
  if extract(hour from p_now at time zone v_control.timezone)::integer < v_control.send_window_start
    or extract(hour from p_now at time zone v_control.timezone)::integer >= v_control.send_window_end then
    return;
  end if;
  select count(*)::integer into v_sent_today
  from public.lead_interaction interaction
  where interaction.event_type = 'SENT'
    and (interaction.occurred_at at time zone v_control.timezone)::date = (p_now at time zone v_control.timezone)::date;
  if v_sent_today >= v_control.daily_limit then return; end if;

  return query
  with eligible as (
    select step.id
    from public.lead_email_sequence_step step
    join public.lead_email_sequence sequence on sequence.id = step.sequence_id and sequence.status = 'ACTIVE'
    join public.sales_reactivation_campaign campaign
      on sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
      and campaign.status = 'ACTIVE' and campaign.content_status = 'APPROVED'
    where step.status = 'PENDING'
      and step.attempt_count < 10
      and step.due_at <= p_now
      and (step.claim_expires_at is null or step.claim_expires_at <= p_now)
      and not exists (
        select 1 from public.sales_send_attempt sending
        where sending.sequence_step_id = step.id and sending.status = 'SENDING'
      )
      and not exists (select 1 from public.lead_email_suppression suppression where suppression.lead_id = sequence.lead_id)
      and not exists (
        select 1 from public.lead_interaction interaction
        where interaction.lead_id = sequence.lead_id
          and interaction.event_type in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
          and interaction.occurred_at >= sequence.started_at
      )
    order by step.due_at, step.id
    for update of step skip locked
    limit least(p_limit, v_control.batch_limit, v_control.daily_limit - v_sent_today)
  ), claimed as (
    update public.lead_email_sequence_step step
    set claim_token = p_claim_token,
        claim_expires_at = p_now + make_interval(secs => p_lease_seconds),
        attempt_count = step.attempt_count + 1,
        last_error_code = null
    from eligible
    where step.id = eligible.id
    returning step.id, step.sequence_id, step.step_index, step.attempt_count
  ), attempts as (
    insert into public.sales_send_attempt (
      sequence_step_id, attempt_number, status, idempotency_key, claim_token
    )
    select claimed.id, claimed.attempt_count, 'CLAIMED',
      'send:' || claimed.id::text || ':' || claimed.attempt_count::text, p_claim_token
    from claimed
    returning
      sales_send_attempt.id as attempt_id,
      sales_send_attempt.sequence_step_id as attempted_step_id,
      sales_send_attempt.idempotency_key as attempt_idempotency_key
  )
  select
    attempts.attempt_id,
    claimed.id,
    sequence.id,
    sequence.lead_id,
    lead.nome::text,
    lead.email::text,
    coalesce(nullif(trim(course.titulo), ''), nullif(trim(lead.tema_interesse), ''))::text,
    campaign.id,
    campaign.campaign_key,
    campaign.version,
    claimed.step_index,
    campaign_step.subject_template,
    campaign_step.body_text_template,
    campaign.sender_email,
    campaign.reply_to_email,
    attempts.attempt_idempotency_key
  from attempts
  join claimed on claimed.id = attempts.attempted_step_id
  join public.lead_email_sequence sequence on sequence.id = claimed.sequence_id
  join public.lead on lead.id = sequence.lead_id and lead.deleted_at is null
  left join public.curso course on course.id = lead.curso_id and course.deleted_at is null
  join public.sales_reactivation_campaign campaign
    on sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
  join public.sales_reactivation_campaign_step campaign_step
    on campaign_step.campaign_id = campaign.id and campaign_step.step_index = claimed.step_index;
end;
$$;

create or replace function public.sales_begin_send(
  p_attempt_id uuid,
  p_claim_token uuid,
  p_payload_hash varchar,
  p_rfc_message_id varchar
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash de payload inválido.' using errcode = 'P0001';
  end if;
  update public.sales_send_attempt attempt
  set status = 'SENDING', payload_hash = p_payload_hash, rfc_message_id = p_rfc_message_id
  from public.lead_email_sequence_step step
  join public.lead_email_sequence sequence on sequence.id = step.sequence_id
  where attempt.id = p_attempt_id
    and attempt.sequence_step_id = step.id
    and attempt.claim_token = p_claim_token
    and attempt.status = 'CLAIMED'
    and step.claim_token = p_claim_token
    and step.claim_expires_at > now()
    and step.status = 'PENDING'
    and sequence.status = 'ACTIVE'
    and not exists (select 1 from public.lead_email_suppression where lead_id = sequence.lead_id)
    and not exists (
      select 1 from public.lead_interaction terminal
      where terminal.lead_id = sequence.lead_id
        and terminal.event_type in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
        and terminal.occurred_at >= sequence.started_at
    )
    and exists (
      select 1
      from public.sales_reactivation_campaign campaign
      join public.sales_orchestrator_control control on control.id = 'global'
      where sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
        and campaign.status = 'ACTIVE'
        and campaign.content_status = 'APPROVED'
        and control.enabled
        and not control.dry_run
        and not control.kill_switch
        and extract(hour from now() at time zone control.timezone)::integer >= control.send_window_start
        and extract(hour from now() at time zone control.timezone)::integer < control.send_window_end
        and (
          select count(*)
          from public.lead_interaction sent
          where sent.event_type = 'SENT'
            and (sent.occurred_at at time zone control.timezone)::date = (now() at time zone control.timezone)::date
        ) < control.daily_limit
    )
    and exists (
      select 1
      from public.lead_contact_permission_event permission
      where permission.id = (
        select latest.id
        from public.lead_contact_permission_event latest
        where latest.lead_id = sequence.lead_id
        order by latest.occurred_at desc, latest.id desc
        limit 1
      )
        and permission.status = 'APPROVED'
        and permission.purpose = 'COMMERCIAL_REACTIVATION'
        and (permission.expires_at is null or permission.expires_at > now())
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.sales_complete_send(
  p_attempt_id uuid,
  p_claim_token uuid,
  p_provider_message_id varchar,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.sales_send_attempt%rowtype;
  v_step public.lead_email_sequence_step%rowtype;
  v_sequence public.lead_email_sequence%rowtype;
  v_message_id uuid;
  v_rfc_message_id varchar(255);
begin
  select * into v_attempt from public.sales_send_attempt
  where id = p_attempt_id and claim_token = p_claim_token for update;
  if v_attempt.id is null or v_attempt.status <> 'SENDING' then
    raise exception 'Attempt não está pronto para conclusão.' using errcode = 'P0001';
  end if;
  select * into v_step from public.lead_email_sequence_step where id = v_attempt.sequence_step_id for update;
  select * into v_sequence from public.lead_email_sequence where id = v_step.sequence_id for update;
  if v_step.status <> 'PENDING' or v_sequence.status <> 'ACTIVE' then
    raise exception 'Sequência não está mais elegível.' using errcode = 'P0001';
  end if;

  v_rfc_message_id := '<' || trim(both '<>' from p_provider_message_id) || '@email.amazonses.com>';

  insert into public.lead_email_message (
    lead_id, sequence_id, sequence_step_id, provider, provider_message_id, rfc_message_id
  ) values (
    v_sequence.lead_id, v_sequence.id, v_step.id, 'SES', p_provider_message_id, v_rfc_message_id
  ) returning id into v_message_id;

  update public.lead_email_sequence_step
  set status = 'SENT', sent_at = p_occurred_at, claim_token = null, claim_expires_at = null
  where id = v_step.id;
  update public.sales_send_attempt
  set status = 'SENT', provider_message_id = p_provider_message_id,
      rfc_message_id = v_rfc_message_id, completed_at = now()
  where id = v_attempt.id;

  perform * from public.ingest_lead_interaction(
    v_sequence.lead_id, v_message_id, v_sequence.id, p_provider_message_id, 'SENT', p_occurred_at,
    'OUTBOUND', 'SES', v_sequence.id::text, v_attempt.id::text,
    'sales-reactivation-orchestrator', 'v1', 'E-mail de reativação enviado pelo Amazon SES.',
    'ses://' || p_provider_message_id, null, jsonb_build_object(
      'campaign_id', split_part(v_sequence.campaign_key, '@', 1),
      'sequence_id', v_sequence.id,
      'step_index', v_step.step_index,
      'provider', 'SES'
    ), 'send-attempt:' || v_attempt.id::text, v_attempt.payload_hash
  );
  return v_message_id;
end;
$$;

create or replace function public.sales_mark_send_failure(
  p_attempt_id uuid,
  p_claim_token uuid,
  p_status varchar,
  p_error_code varchar
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step_id uuid;
begin
  if p_status not in ('RETRYABLE_FAILED', 'PERMANENT_FAILED', 'AMBIGUOUS') then
    raise exception 'Status de falha inválido.' using errcode = 'P0001';
  end if;
  update public.sales_send_attempt
  set status = p_status, error_code = left(p_error_code, 80), completed_at = now()
  where id = p_attempt_id and claim_token = p_claim_token and status in ('CLAIMED', 'SENDING')
  returning sequence_step_id into v_step_id;
  if v_step_id is null then return false; end if;

  update public.lead_email_sequence_step
  set claim_token = null,
      claim_expires_at = null,
      last_error_code = left(p_error_code, 80),
      status = case when p_status in ('PERMANENT_FAILED', 'AMBIGUOUS') then 'SKIPPED' else status end
  where id = v_step_id and claim_token = p_claim_token;

  if p_status in ('PERMANENT_FAILED', 'AMBIGUOUS') or p_error_code = 'GUARDRAIL_REJECTED' then
    insert into public.sales_notification_outbox (event_key, kind, lead_id, safe_payload)
    select
      'attempt:' || p_attempt_id::text,
      case when p_error_code = 'GUARDRAIL_REJECTED' then 'GUARDRAIL' else 'PERMANENT_FAILURE' end,
      sequence.lead_id,
      jsonb_build_object('attempt_id', p_attempt_id, 'status', p_status, 'error_code', left(p_error_code, 80))
    from public.lead_email_sequence_step step
    join public.lead_email_sequence sequence on sequence.id = step.sequence_id
    where step.id = v_step_id
    on conflict (event_key) do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.sales_claim_notifications(
  p_claim_token uuid,
  p_now timestamptz,
  p_lease_seconds integer,
  p_limit integer
)
returns table (
  notification_id uuid,
  event_key varchar,
  kind varchar,
  lead_id varchar,
  lead_name text,
  lead_email text,
  interaction_id uuid,
  safe_payload jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_claim_token is null or p_lease_seconds not between 30 and 900 or p_limit not between 1 and 50 then
    raise exception 'Parâmetros de claim inválidos.' using errcode = 'P0001';
  end if;

  return query
  with eligible as (
    select outbox.id
    from public.sales_notification_outbox outbox
    where outbox.status in ('PENDING', 'FAILED')
      and outbox.attempts < 10
      and outbox.available_at <= p_now
      and (outbox.claim_expires_at is null or outbox.claim_expires_at <= p_now)
    order by outbox.available_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.sales_notification_outbox outbox
    set status = 'SENDING',
        attempts = outbox.attempts + 1,
        claim_token = p_claim_token,
        claim_expires_at = p_now + make_interval(secs => p_lease_seconds),
        error_code = null
    from eligible
    where outbox.id = eligible.id
    returning outbox.*
  )
  select claimed.id, claimed.event_key, claimed.kind, claimed.lead_id,
    lead.nome::text, lead.email::text, claimed.interaction_id, claimed.safe_payload
  from claimed
  left join public.lead lead on lead.id = claimed.lead_id;
end;
$$;

create or replace function public.sales_complete_notification(
  p_notification_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.sales_notification_outbox
  set status = 'SENT', sent_at = now(), claim_token = null, claim_expires_at = null
  where id = p_notification_id and claim_token = p_claim_token and status = 'SENDING';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.sales_mark_notification_failure(
  p_notification_id uuid,
  p_claim_token uuid,
  p_error_code varchar,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.sales_notification_outbox
  set status = 'FAILED',
      error_code = left(p_error_code, 80),
      claim_token = null,
      claim_expires_at = null,
      available_at = case
        when p_retryable and attempts < 10 then now() + make_interval(secs => least(3600, 30 * (2 ^ attempts)::integer))
        else 'infinity'::timestamptz
      end
  where id = p_notification_id and claim_token = p_claim_token and status = 'SENDING';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.sales_set_orchestrator_state(
  p_action varchar,
  p_actor_id varchar,
  p_approval_reference varchar,
  p_idempotency_key varchar
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_control public.sales_orchestrator_control%rowtype;
  v_previous jsonb;
  v_new jsonb;
begin
  if p_action not in ('DRY_RUN', 'PAUSE', 'RESUME')
    or nullif(trim(p_actor_id), '') is null
    or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Comando de controle inválido.' using errcode = 'P0001';
  end if;
  if p_action = 'RESUME' and length(trim(coalesce(p_approval_reference, ''))) < 12 then
    raise exception 'Resume exige referência de aprovação.' using errcode = 'P0001';
  end if;
  if p_action = 'RESUME' and not exists (
    select 1 from public.sales_reactivation_campaign
    where status = 'ACTIVE' and content_status = 'APPROVED'
  ) then
    raise exception 'Nenhuma campanha ativa e aprovada.' using errcode = 'P0001';
  end if;

  select * into v_control from public.sales_orchestrator_control where id = 'global' for update;
  v_previous := jsonb_build_object(
    'enabled', v_control.enabled,
    'dry_run', v_control.dry_run,
    'kill_switch', v_control.kill_switch,
    'daily_limit', v_control.daily_limit,
    'batch_limit', v_control.batch_limit
  );

  update public.sales_orchestrator_control
  set enabled = p_action = 'RESUME',
      dry_run = p_action = 'DRY_RUN',
      kill_switch = p_action <> 'RESUME',
      updated_at = now(),
      updated_by = left(trim(p_actor_id), 120)
  where id = 'global'
  returning jsonb_build_object(
    'enabled', enabled,
    'dry_run', dry_run,
    'kill_switch', kill_switch,
    'daily_limit', daily_limit,
    'batch_limit', batch_limit
  ) into v_new;

  insert into public.sales_orchestrator_control_event (
    action, previous_state, new_state, actor_id, approval_reference, idempotency_key
  ) values (
    p_action, v_previous, v_new, left(trim(p_actor_id), 120),
    nullif(trim(p_approval_reference), ''), p_idempotency_key
  ) on conflict (idempotency_key) do nothing;
  return true;
end;
$$;

create or replace function public.reject_sales_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Registro comercial auditável é append-only.' using errcode = '55000';
end;
$$;

create or replace function public.protect_sales_campaign_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Versão de campanha não pode ser removida.' using errcode = '55000';
  end if;
  if row(
    old.campaign_key, old.version, old.policy_version, old.template_version,
    old.timezone, old.sender_email, old.reply_to_email
  ) is distinct from row(
    new.campaign_key, new.version, new.policy_version, new.template_version,
    new.timezone, new.sender_email, new.reply_to_email
  ) then
    raise exception 'Campos versionados da campanha são imutáveis.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists lead_contact_permission_append_only on public.lead_contact_permission_event;
create trigger lead_contact_permission_append_only before update or delete on public.lead_contact_permission_event
  for each row execute function public.reject_sales_audit_mutation();
drop trigger if exists sales_reactivation_decision_append_only on public.sales_reactivation_decision;
create trigger sales_reactivation_decision_append_only before update or delete on public.sales_reactivation_decision
  for each row execute function public.reject_sales_audit_mutation();
drop trigger if exists sales_orchestrator_control_event_append_only on public.sales_orchestrator_control_event;
create trigger sales_orchestrator_control_event_append_only before update or delete on public.sales_orchestrator_control_event
  for each row execute function public.reject_sales_audit_mutation();
drop trigger if exists sales_reactivation_campaign_version_protected on public.sales_reactivation_campaign;
create trigger sales_reactivation_campaign_version_protected before update or delete on public.sales_reactivation_campaign
  for each row execute function public.protect_sales_campaign_version();
drop trigger if exists sales_reactivation_campaign_step_append_only on public.sales_reactivation_campaign_step;
create trigger sales_reactivation_campaign_step_append_only before update or delete on public.sales_reactivation_campaign_step
  for each row execute function public.reject_sales_audit_mutation();
drop trigger if exists sales_reactivation_campaign_course_append_only on public.sales_reactivation_campaign_course;
create trigger sales_reactivation_campaign_course_append_only before update or delete on public.sales_reactivation_campaign_course
  for each row execute function public.reject_sales_audit_mutation();

alter table public.lead_contact_permission_event enable row level security;
alter table public.sales_reactivation_campaign enable row level security;
alter table public.sales_reactivation_campaign_step enable row level security;
alter table public.sales_reactivation_campaign_course enable row level security;
alter table public.sales_orchestrator_control enable row level security;
alter table public.sales_orchestrator_control_event enable row level security;
alter table public.sales_reactivation_decision enable row level security;
alter table public.sales_send_attempt enable row level security;
alter table public.sales_notification_outbox enable row level security;

revoke all on table public.lead_contact_permission_event, public.sales_reactivation_campaign,
  public.sales_reactivation_campaign_step, public.sales_reactivation_campaign_course,
  public.sales_orchestrator_control, public.sales_orchestrator_control_event,
  public.sales_reactivation_decision, public.sales_send_attempt, public.sales_notification_outbox
  from public, anon, authenticated;
grant select on table public.lead_contact_permission_event, public.sales_reactivation_campaign,
  public.sales_reactivation_campaign_step, public.sales_reactivation_campaign_course,
  public.sales_orchestrator_control, public.sales_orchestrator_control_event,
  public.sales_reactivation_decision, public.sales_send_attempt, public.sales_notification_outbox
  to authenticated;
grant all on table public.lead_contact_permission_event, public.sales_reactivation_campaign,
  public.sales_reactivation_campaign_step, public.sales_reactivation_campaign_course,
  public.sales_reactivation_decision, public.sales_send_attempt, public.sales_notification_outbox
  to service_role;
grant select on table public.sales_orchestrator_control, public.sales_orchestrator_control_event to service_role;

create policy lead_contact_permission_admin_select on public.lead_contact_permission_event
  for select to authenticated using (public.is_admin());
create policy sales_reactivation_campaign_admin_select on public.sales_reactivation_campaign
  for select to authenticated using (public.is_admin());
create policy sales_reactivation_campaign_step_admin_select on public.sales_reactivation_campaign_step
  for select to authenticated using (public.is_admin());
create policy sales_reactivation_campaign_course_admin_select on public.sales_reactivation_campaign_course
  for select to authenticated using (public.is_admin());
create policy sales_orchestrator_control_admin_select on public.sales_orchestrator_control
  for select to authenticated using (public.is_admin());
create policy sales_orchestrator_control_event_admin_select on public.sales_orchestrator_control_event
  for select to authenticated using (public.is_admin());
create policy sales_reactivation_decision_admin_select on public.sales_reactivation_decision
  for select to authenticated using (public.is_admin());
create policy sales_send_attempt_admin_select on public.sales_send_attempt
  for select to authenticated using (public.is_admin());
create policy sales_notification_outbox_admin_select on public.sales_notification_outbox
  for select to authenticated using (public.is_admin());

revoke all on function public.sales_create_reactivation_sequence(varchar, uuid, uuid, varchar, varchar) from public, anon, authenticated;
revoke all on function public.sales_list_reactivation_candidates(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.sales_claim_reactivation_steps(uuid, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.sales_begin_send(uuid, uuid, varchar, varchar) from public, anon, authenticated;
revoke all on function public.sales_complete_send(uuid, uuid, varchar, timestamptz) from public, anon, authenticated;
revoke all on function public.sales_mark_send_failure(uuid, uuid, varchar, varchar) from public, anon, authenticated;
revoke all on function public.sales_claim_notifications(uuid, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.sales_complete_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sales_mark_notification_failure(uuid, uuid, varchar, boolean) from public, anon, authenticated;
revoke all on function public.sales_set_orchestrator_state(varchar, varchar, varchar, varchar) from public, anon, authenticated;
grant execute on function public.sales_create_reactivation_sequence(varchar, uuid, uuid, varchar, varchar) to service_role;
grant execute on function public.sales_list_reactivation_candidates(uuid, integer, integer) to service_role;
grant execute on function public.sales_claim_reactivation_steps(uuid, timestamptz, integer, integer) to service_role;
grant execute on function public.sales_begin_send(uuid, uuid, varchar, varchar) to service_role;
grant execute on function public.sales_complete_send(uuid, uuid, varchar, timestamptz) to service_role;
grant execute on function public.sales_mark_send_failure(uuid, uuid, varchar, varchar) to service_role;
grant execute on function public.sales_claim_notifications(uuid, timestamptz, integer, integer) to service_role;
grant execute on function public.sales_complete_notification(uuid, uuid) to service_role;
grant execute on function public.sales_mark_notification_failure(uuid, uuid, varchar, boolean) to service_role;
grant execute on function public.sales_set_orchestrator_state(varchar, varchar, varchar, varchar) to service_role;

with campaign as (
  insert into public.sales_reactivation_campaign (
    campaign_key, version, status, content_status, policy_version, template_version,
    sender_email, reply_to_email
  ) values (
    'reactivation-v1', 1, 'DISABLED', 'DRAFT', 'reactivation-policy-v1',
    'reactivation-v1-draft-1', 'pedro@rhcursos.com.br', 'pedro@rhcursos.com.br'
  ) on conflict (campaign_key, version) do update
    set campaign_key = excluded.campaign_key
  returning id
)
insert into public.sales_reactivation_campaign_step (
  campaign_id, step_index, delay_days, subject_template, body_text_template, template_hash
)
select campaign.id, values.step_index, values.delay_days, values.subject_template, values.body_text_template,
  encode(digest(values.subject_template || E'\n' || values.body_text_template, 'sha256'), 'hex')
from campaign
cross join (values
  (0::smallint, 0::smallint, '{{firstName}}, este tema ainda é prioridade para sua equipe?', 'Olá, {{firstName}}. Estou retomando nosso contato sobre {{courseTitle}}. Se este tema ainda estiver no planejamento, posso encaminhar as próximas turmas e formatos disponíveis. Caso não queira receber novos contatos, use {{unsubscribeUrl}}.'),
  (1::smallint, 5::smallint, 'Posso enviar os detalhes de {{courseTitle}}?', 'Olá, {{firstName}}. Passando apenas para confirmar se faz sentido receber informações atualizadas sobre {{courseTitle}}. Responda a este e-mail e eu encaminho os detalhes. Para encerrar os contatos, use {{unsubscribeUrl}}.'),
  (2::smallint, 10::smallint, 'Encerrando este contato sobre {{courseTitle}}', 'Olá, {{firstName}}. Este é meu último contato desta sequência sobre {{courseTitle}}. Se quiser retomar depois, basta responder a este e-mail. Para não receber novas mensagens, use {{unsubscribeUrl}}.')
) as values(step_index, delay_days, subject_template, body_text_template)
on conflict (campaign_id, step_index) do nothing;

insert into public.sales_reactivation_campaign_course (campaign_id, course_title)
select campaign.id, course_title
from public.sales_reactivation_campaign campaign
cross join (values
  ('Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos'),
  ('Auditoria da Folha de Pagamento'),
  ('Inteligência Artificial na Execução Orçamentária')
) as allowed(course_title)
where campaign.campaign_key = 'reactivation-v1' and campaign.version = 1
on conflict (campaign_id, course_title) do nothing;

comment on table public.lead_contact_permission_event is
  'Eventos append-only de elegibilidade/base legal; classificação temática nunca substitui permissão.';
comment on table public.sales_send_attempt is
  'Tentativas de envio com estado AMBIGUOUS para impedir retry automático quando o resultado externo é incerto.';
comment on table public.sales_notification_outbox is
  'Outbox idempotente de alertas operacionais com payload mínimo e sanitizado.';

commit;
