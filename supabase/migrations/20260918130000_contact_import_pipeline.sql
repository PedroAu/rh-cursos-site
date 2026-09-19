-- Pipeline auditável e fail-closed para incorporar bases externas ao CRM.
-- O modo DRY_RUN grava somente a decisão agregável; APPLY exige referência de
-- aprovação, nunca sobrescreve PII existente e nunca concede permissão comercial.

begin;

create table if not exists public.contact_import_batch (
  id uuid primary key default gen_random_uuid(),
  source_label varchar(120) not null,
  classification varchar(80) not null default 'Gestão de Pessoas',
  mode varchar(16) not null,
  status varchar(16) not null default 'OPEN',
  source_rows integer not null,
  candidate_count integer not null,
  file_set_digest varchar(64) not null,
  approval_reference varchar(255),
  created_by varchar(120) not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint contact_import_batch_mode_chk check (mode in ('DRY_RUN', 'APPLY')),
  constraint contact_import_batch_status_chk check (status in ('OPEN', 'COMPLETED', 'FAILED')),
  constraint contact_import_batch_counts_chk check (
    source_rows > 0 and candidate_count > 0 and candidate_count <= source_rows
  ),
  constraint contact_import_batch_digest_chk check (file_set_digest ~ '^[0-9a-f]{64}$'),
  constraint contact_import_batch_approval_chk check (
    mode <> 'APPLY' or length(trim(approval_reference)) >= 12
  ),
  constraint contact_import_batch_completion_chk check (
    (status = 'OPEN' and completed_at is null)
    or (status <> 'OPEN' and completed_at is not null)
  ),
  constraint contact_import_batch_replay_unique unique (file_set_digest, mode)
);

create table if not exists public.contact_import_candidate (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.contact_import_batch(id) on delete restrict,
  source_key varchar(64) not null,
  email_hash varchar(64) not null,
  payload_hash varchar(64) not null,
  lead_id varchar(80) references public.lead(id) on delete restrict,
  action varchar(24) not null,
  reason_codes text[] not null,
  had_source_history boolean not null default false,
  source_last_activity_at timestamptz,
  source_event_type varchar(24),
  source_event_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contact_import_candidate_source_key_chk check (source_key ~ '^[0-9a-f]{64}$'),
  constraint contact_import_candidate_email_hash_chk check (email_hash ~ '^[0-9a-f]{64}$'),
  constraint contact_import_candidate_payload_hash_chk check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint contact_import_candidate_action_chk check (
    action in ('WOULD_CREATE', 'CREATED', 'EXISTING', 'BLOCKED')
  ),
  constraint contact_import_candidate_reasons_chk check (cardinality(reason_codes) > 0),
  constraint contact_import_candidate_event_chk check (
    source_event_type is null
    or source_event_type in ('SENT', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
  ),
  constraint contact_import_candidate_unique unique (batch_id, source_key)
);

create index if not exists contact_import_candidate_batch_idx
  on public.contact_import_candidate (batch_id, action, created_at);

create table if not exists public.lead_segment_assignment (
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  segment_key varchar(80) not null,
  source_batch_id uuid not null references public.contact_import_batch(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (lead_id, segment_key),
  constraint lead_segment_assignment_key_chk check (segment_key = 'GESTAO_DE_PESSOAS')
);

create table if not exists public.lead_source_history_evidence (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  batch_id uuid not null references public.contact_import_batch(id) on delete restrict,
  source_key varchar(64) not null,
  has_prior_interaction boolean not null,
  last_activity_at timestamptz,
  source_event_type varchar(24),
  recorded_at timestamptz not null default now(),
  constraint lead_source_history_source_key_chk check (source_key ~ '^[0-9a-f]{64}$'),
  constraint lead_source_history_event_chk check (
    source_event_type is null
    or source_event_type in ('SENT', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
  ),
  constraint lead_source_history_consistency_chk check (
    has_prior_interaction or (last_activity_at is null and source_event_type is null)
  ),
  constraint lead_source_history_unique unique (batch_id, source_key)
);

create index if not exists lead_source_history_lookup_idx
  on public.lead_source_history_evidence (lead_id, last_activity_at desc, recorded_at desc)
  where has_prior_interaction;

drop trigger if exists contact_import_candidate_append_only on public.contact_import_candidate;
create trigger contact_import_candidate_append_only
  before update or delete on public.contact_import_candidate
  for each row execute function public.reject_lead_interaction_mutation();

drop trigger if exists lead_segment_assignment_append_only on public.lead_segment_assignment;
create trigger lead_segment_assignment_append_only
  before update or delete on public.lead_segment_assignment
  for each row execute function public.reject_lead_interaction_mutation();

drop trigger if exists lead_source_history_append_only on public.lead_source_history_evidence;
create trigger lead_source_history_append_only
  before update or delete on public.lead_source_history_evidence
  for each row execute function public.reject_lead_interaction_mutation();

create or replace function public.sales_create_contact_import_batch(
  p_source_label varchar,
  p_mode varchar,
  p_source_rows integer,
  p_candidate_count integer,
  p_file_set_digest varchar,
  p_approval_reference varchar,
  p_actor_id varchar
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_batch_id uuid;
  v_existing public.contact_import_batch%rowtype;
begin
  if length(trim(coalesce(p_source_label, ''))) < 3
    or p_mode not in ('DRY_RUN', 'APPLY')
    or p_source_rows <= 0
    or p_candidate_count <= 0
    or p_candidate_count > p_source_rows
    or p_file_set_digest !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_actor_id, ''))) < 3 then
    raise exception 'Contrato do lote de importação inválido.' using errcode = 'P0001';
  end if;
  if p_mode = 'APPLY' and length(trim(coalesce(p_approval_reference, ''))) < 12 then
    raise exception 'Aplicação exige referência de aprovação.' using errcode = 'P0001';
  end if;

  insert into public.contact_import_batch (
    source_label, mode, source_rows, candidate_count, file_set_digest,
    approval_reference, created_by
  ) values (
    left(trim(p_source_label), 120), p_mode, p_source_rows, p_candidate_count,
    p_file_set_digest, nullif(trim(p_approval_reference), ''), left(trim(p_actor_id), 120)
  )
  on conflict (file_set_digest, mode) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    select * into v_existing
    from public.contact_import_batch
    where file_set_digest = p_file_set_digest and mode = p_mode;
    if v_existing.source_rows <> p_source_rows
      or v_existing.candidate_count <> p_candidate_count
      or v_existing.source_label <> left(trim(p_source_label), 120)
      or coalesce(v_existing.approval_reference, '') <> coalesce(nullif(trim(p_approval_reference), ''), '') then
      raise exception 'Digest de lote reutilizado com contrato divergente.' using errcode = 'P0004';
    end if;
    v_batch_id := v_existing.id;
  end if;
  return v_batch_id;
end;
$$;

create or replace function public.sales_import_contact_candidate(
  p_batch_id uuid,
  p_source_key varchar,
  p_name varchar,
  p_email varchar,
  p_phone varchar,
  p_organization varchar,
  p_has_source_history boolean,
  p_source_last_activity_at timestamptz,
  p_source_event_type varchar,
  p_source_event_at timestamptz,
  p_legal_basis varchar,
  p_actor_id varchar
)
returns table (
  candidate_id uuid,
  lead_id varchar,
  action varchar,
  reason_codes text[]
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_batch public.contact_import_batch%rowtype;
  v_candidate public.contact_import_candidate%rowtype;
  v_email varchar(180);
  v_email_hash varchar(64);
  v_payload_hash varchar(64);
  v_existing_count integer;
  v_existing_lead_id varchar(80);
  v_existing_history_count integer;
  v_lead_id varchar(80);
  v_action varchar(24);
  v_reasons text[] := array[]::text[];
  v_event_hash varchar(64);
  v_idempotency_key varchar(255);
begin
  select * into v_batch from public.contact_import_batch where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Lote de importação não encontrado.' using errcode = 'P0002';
  end if;
  if p_source_key !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_actor_id, ''))) < 3 then
    raise exception 'Identidade do candidato inválida.' using errcode = 'P0001';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if length(v_email) > 180
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Nome ou e-mail do candidato inválido.' using errcode = 'P0001';
  end if;
  if p_source_event_type is not null
    and p_source_event_type not in ('SENT', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED') then
    raise exception 'Evento histórico não suportado.' using errcode = 'P0001';
  end if;
  if p_legal_basis is not null
    and p_legal_basis not in ('CONSENT', 'LEGITIMATE_INTEREST', 'CONTRACT', 'OTHER') then
    raise exception 'Base legal importada não suportada.' using errcode = 'P0001';
  end if;

  v_email_hash := encode(digest(v_email, 'sha256'), 'hex');
  v_payload_hash := encode(digest(jsonb_build_object(
    'source_key', p_source_key,
    'name', trim(p_name),
    'email', v_email,
    'phone', nullif(trim(p_phone), ''),
    'organization', nullif(trim(p_organization), ''),
    'has_source_history', coalesce(p_has_source_history, false),
    'source_last_activity_at', p_source_last_activity_at,
    'source_event_type', p_source_event_type,
    'source_event_at', p_source_event_at,
    'legal_basis', p_legal_basis
  )::text, 'sha256'), 'hex');

  select * into v_candidate
  from public.contact_import_candidate
  where batch_id = p_batch_id and source_key = p_source_key;
  if v_candidate.id is not null then
    if v_candidate.payload_hash <> v_payload_hash then
      raise exception 'Chave de origem reutilizada com payload divergente.' using errcode = 'P0004';
    end if;
    return query select v_candidate.id, v_candidate.lead_id, v_candidate.action, v_candidate.reason_codes;
    return;
  end if;
  if v_batch.status <> 'OPEN' then
    raise exception 'Lote de importação não está aberto.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  select count(*)::integer, min(id)
    into v_existing_count, v_existing_lead_id
  from public.lead
  where deleted_at is null and lower(trim(email)) = v_email;

  if v_existing_count = 1 then
    select count(*)::integer into v_existing_history_count
    from (
      select 1
      from public.lead_interaction interaction
      where interaction.lead_id = v_existing_lead_id
      union all
      select 1
      from public.lead_source_history_evidence evidence
      where evidence.lead_id = v_existing_lead_id and evidence.has_prior_interaction
    ) history;
    if v_existing_history_count > 0 then
      v_reasons := array_append(v_reasons, 'CRM_HISTORY_PRESENT');
    end if;
  end if;

  if v_existing_count > 1 then
    v_action := 'BLOCKED';
    v_reasons := array_append(v_reasons, 'DUPLICATE_CRM_EMAIL');
  elsif p_source_event_type in ('BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
    and p_source_event_at is null then
    v_action := 'BLOCKED';
    v_reasons := array_append(v_reasons, 'SOURCE_EVENT_DATE_MISSING');
  elsif v_batch.mode = 'DRY_RUN' then
    v_action := case when v_existing_count = 0 then 'WOULD_CREATE' else 'EXISTING' end;
    v_reasons := array_append(v_reasons, 'DRY_RUN_ONLY');
    v_lead_id := v_existing_lead_id;
  else
    if v_existing_count = 0 then
      insert into public.lead (
        nome, email, telefone, tipo, orgao, status_crm, origem
      ) values (
        left(trim(p_name), 180), v_email, nullif(left(trim(p_phone), 30), ''),
        'Contato', nullif(left(trim(p_organization), 180), ''), 'Novo',
        left('Importação: ' || v_batch.source_label, 80)
      ) returning id into v_lead_id;
      v_action := 'CREATED';
      v_reasons := array_append(v_reasons, 'CRM_RECORD_CREATED');
    else
      v_lead_id := v_existing_lead_id;
      v_action := 'EXISTING';
      v_reasons := array_append(v_reasons, 'CRM_RECORD_PRESERVED');
    end if;

    insert into public.lead_segment_assignment (lead_id, segment_key, source_batch_id)
    values (v_lead_id, 'GESTAO_DE_PESSOAS', p_batch_id)
    on conflict on constraint lead_segment_assignment_pkey do nothing;

    if coalesce(p_has_source_history, false) or p_source_event_type is not null then
      insert into public.lead_source_history_evidence (
        lead_id, batch_id, source_key, has_prior_interaction,
        last_activity_at, source_event_type
      ) values (
        v_lead_id, p_batch_id, p_source_key, true,
        p_source_last_activity_at, p_source_event_type
      ) on conflict (batch_id, source_key) do nothing;
    end if;

    if p_source_event_type is not null and p_source_event_at is not null then
      v_idempotency_key := 'contact-import:' || p_batch_id::text || ':' || p_source_key || ':' || p_source_event_type;
      v_event_hash := encode(digest(
        v_lead_id || ':' || p_source_event_type || ':' || p_source_event_at::text || ':' || p_source_key,
        'sha256'
      ), 'hex');
      perform * from public.ingest_lead_interaction(
        v_lead_id, null, null, v_idempotency_key, p_source_event_type, p_source_event_at,
        'OUTBOUND', 'CRM', p_batch_id::text, p_source_key,
        left(trim(p_actor_id), 120), 'contact-import-v1',
        'Evento histórico de e-mail importado do CRM.',
        'import://' || p_batch_id::text || '/' || p_source_key,
        null, jsonb_build_object('provider', 'CRM'), v_idempotency_key, v_event_hash
      );
      v_reasons := array_append(v_reasons, 'SOURCE_EMAIL_EVENT_IMPORTED');
    elsif coalesce(p_has_source_history, false) and p_source_last_activity_at is null then
      v_reasons := array_append(v_reasons, 'SOURCE_HISTORY_DATE_UNKNOWN');
    elsif coalesce(p_has_source_history, false) then
      v_reasons := array_append(v_reasons, 'SOURCE_HISTORY_IMPORTED');
    end if;

    if not exists (
      select 1 from public.lead_contact_permission_event permission
      where permission.lead_id = v_lead_id
    ) then
      insert into public.lead_contact_permission_event (
        lead_id, status, legal_basis, purpose, evidence_ref, occurred_at,
        actor_id, idempotency_key
      ) values (
        v_lead_id, 'UNKNOWN', p_legal_basis, 'COMMERCIAL_REACTIVATION',
        'import-batch://' || p_batch_id::text || '/' || p_source_key,
        now(), left(trim(p_actor_id), 120),
        'contact-import-permission:' || p_batch_id::text || ':' || p_source_key
      );
    end if;
    v_reasons := array_append(v_reasons, 'PERMISSION_REVIEW_REQUIRED');
  end if;

  insert into public.contact_import_candidate (
    batch_id, source_key, email_hash, payload_hash, lead_id, action, reason_codes,
    had_source_history, source_last_activity_at, source_event_type, source_event_at
  ) values (
    p_batch_id, p_source_key, v_email_hash, v_payload_hash, v_lead_id,
    v_action, v_reasons, coalesce(p_has_source_history, false),
    p_source_last_activity_at, p_source_event_type, p_source_event_at
  ) returning * into v_candidate;

  return query select v_candidate.id, v_candidate.lead_id, v_candidate.action, v_candidate.reason_codes;
end;
$$;

create or replace function public.sales_complete_contact_import_batch(
  p_batch_id uuid,
  p_actor_id varchar
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.contact_import_batch%rowtype;
  v_processed integer;
begin
  select * into v_batch from public.contact_import_batch where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Lote de importação não encontrado.' using errcode = 'P0002';
  end if;
  if v_batch.status = 'COMPLETED' then return true; end if;
  if v_batch.status <> 'OPEN' or length(trim(coalesce(p_actor_id, ''))) < 3 then
    raise exception 'Lote não pode ser concluído.' using errcode = 'P0001';
  end if;
  select count(*)::integer into v_processed
  from public.contact_import_candidate where batch_id = p_batch_id;
  if v_processed <> v_batch.candidate_count then
    raise exception 'Lote incompleto: candidatos processados divergem do esperado.' using errcode = 'P0001';
  end if;
  update public.contact_import_batch
  set status = 'COMPLETED', completed_at = now()
  where id = p_batch_id;
  return true;
end;
$$;

-- A projeção de candidatos passa a considerar atividade histórica importada.
-- Evidência sem data usa infinity deliberadamente: o policy engine interpreta a
-- data inválida como RECENT_INTERACTION e mantém o contato bloqueado.
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
    case
      when coalesce(source_history.has_undated_history, false) then 'infinity'::timestamptz
      when last_interaction.occurred_at is null then source_history.last_activity_at
      when source_history.last_activity_at is null then last_interaction.occurred_at
      else greatest(last_interaction.occurred_at, source_history.last_activity_at)
    end,
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
  left join lateral (
    select
      max(evidence.last_activity_at) filter (where evidence.has_prior_interaction) as last_activity_at,
      bool_or(evidence.has_prior_interaction and evidence.last_activity_at is null) as has_undated_history
    from public.lead_source_history_evidence evidence
    where evidence.lead_id = lead.id
  ) source_history on true
  where campaign.id = p_campaign_id and control.id = 'global'
  order by lead.created_at, lead.id
  limit p_limit offset p_offset;
end;
$$;

alter table public.contact_import_batch enable row level security;
alter table public.contact_import_candidate enable row level security;
alter table public.lead_segment_assignment enable row level security;
alter table public.lead_source_history_evidence enable row level security;

revoke all on table public.contact_import_batch, public.contact_import_candidate,
  public.lead_segment_assignment, public.lead_source_history_evidence
  from public, anon, authenticated;
grant select on table public.contact_import_batch, public.contact_import_candidate,
  public.lead_segment_assignment, public.lead_source_history_evidence
  to authenticated;
grant select on table public.contact_import_batch, public.contact_import_candidate,
  public.lead_segment_assignment, public.lead_source_history_evidence
  to service_role;

drop policy if exists contact_import_batch_admin_select on public.contact_import_batch;
create policy contact_import_batch_admin_select on public.contact_import_batch
  for select to authenticated using (public.is_admin());
drop policy if exists contact_import_candidate_admin_select on public.contact_import_candidate;
create policy contact_import_candidate_admin_select on public.contact_import_candidate
  for select to authenticated using (public.is_admin());
drop policy if exists lead_segment_assignment_admin_select on public.lead_segment_assignment;
create policy lead_segment_assignment_admin_select on public.lead_segment_assignment
  for select to authenticated using (public.is_admin());
drop policy if exists lead_source_history_admin_select on public.lead_source_history_evidence;
create policy lead_source_history_admin_select on public.lead_source_history_evidence
  for select to authenticated using (public.is_admin());

revoke all on function public.sales_create_contact_import_batch(
  varchar, varchar, integer, integer, varchar, varchar, varchar
) from public, anon, authenticated;
grant execute on function public.sales_create_contact_import_batch(
  varchar, varchar, integer, integer, varchar, varchar, varchar
) to service_role;
revoke all on function public.sales_import_contact_candidate(
  uuid, varchar, varchar, varchar, varchar, varchar, boolean, timestamptz, varchar, timestamptz, varchar, varchar
) from public, anon, authenticated;
grant execute on function public.sales_import_contact_candidate(
  uuid, varchar, varchar, varchar, varchar, varchar, boolean, timestamptz, varchar, timestamptz, varchar, varchar
) to service_role;
revoke all on function public.sales_complete_contact_import_batch(uuid, varchar)
  from public, anon, authenticated;
grant execute on function public.sales_complete_contact_import_batch(uuid, varchar)
  to service_role;

comment on table public.contact_import_candidate is
  'Auditoria sem PII da comparação/importação; armazena somente hashes, ação e reason codes.';
comment on table public.lead_source_history_evidence is
  'Evidência de atividade da fonte usada pela janela de inatividade sem fabricar evento de e-mail.';
comment on function public.sales_import_contact_candidate is
  'Importação idempotente e fail-closed; não sobrescreve PII nem concede permissão comercial.';

commit;
