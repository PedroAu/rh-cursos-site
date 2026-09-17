-- Story 2026-09-16 — event store append-only da linha do tempo de e-mail.
-- A PK de public.lead e, intencionalmente, varchar(80).

begin;

create table if not exists public.lead_email_sequence (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  campaign_key varchar(120) not null,
  status varchar(20) not null default 'ACTIVE',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  interrupted_at timestamptz,
  interruption_reason varchar(40),
  interruption_event_id uuid,
  created_at timestamptz not null default now(),
  constraint lead_email_sequence_status_chk
    check (status in ('ACTIVE', 'INTERRUPTED', 'COMPLETED')),
  constraint lead_email_sequence_interruption_chk check (
    (status = 'INTERRUPTED' and interrupted_at is not null and interruption_reason is not null)
    or (status <> 'INTERRUPTED' and interrupted_at is null and interruption_reason is null)
  )
);

create unique index if not exists lead_email_sequence_active_idx
  on public.lead_email_sequence (lead_id, campaign_key)
  where status = 'ACTIVE';

create table if not exists public.lead_email_sequence_step (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.lead_email_sequence(id) on delete restrict,
  step_index smallint not null,
  due_at timestamptz not null,
  status varchar(20) not null default 'PENDING',
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_email_sequence_step_index_chk check (step_index between 0 and 100),
  constraint lead_email_sequence_step_status_chk
    check (status in ('PENDING', 'SENT', 'CANCELLED', 'SKIPPED')),
  constraint lead_email_sequence_step_state_chk check (
    (status = 'SENT' and sent_at is not null and cancelled_at is null)
    or (status = 'CANCELLED' and cancelled_at is not null and sent_at is null)
    or (status in ('PENDING', 'SKIPPED') and sent_at is null and cancelled_at is null)
  ),
  constraint lead_email_sequence_step_unique unique (sequence_id, step_index),
  constraint lead_email_sequence_step_identity_unique unique (id, sequence_id)
);

create index if not exists lead_email_sequence_step_due_idx
  on public.lead_email_sequence_step (due_at, sequence_id)
  where status = 'PENDING';

create table if not exists public.lead_email_message (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  sequence_id uuid references public.lead_email_sequence(id) on delete restrict,
  sequence_step_id uuid,
  provider varchar(20) not null,
  provider_message_id varchar(255) not null,
  rfc_message_id varchar(255),
  created_at timestamptz not null default now(),
  constraint lead_email_message_provider_chk check (provider in ('SES', 'IMAP')),
  constraint lead_email_message_step_sequence_chk check (sequence_step_id is null or sequence_id is not null),
  constraint lead_email_message_step_sequence_fk foreign key (sequence_step_id, sequence_id)
    references public.lead_email_sequence_step(id, sequence_id) on delete restrict,
  constraint lead_email_message_provider_id_unique unique (provider, provider_message_id)
);

create unique index if not exists lead_email_message_rfc_id_idx
  on public.lead_email_message (rfc_message_id)
  where rfc_message_id is not null;

create table if not exists public.lead_email_suppression (
  lead_id varchar(80) primary key references public.lead(id) on delete restrict,
  reason varchar(24) not null,
  source_event_id uuid not null,
  suppressed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint lead_email_suppression_reason_chk
    check (reason in ('BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED'))
);

create or replace function public.lead_interaction_metadata_is_safe(value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(coalesce(value, '{}'::jsonb)) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(coalesce(value, '{}'::jsonb)) as key
      where key not in (
        'campaign_id', 'sequence_id', 'step_index', 'link_url', 'bounce_type',
        'diagnostic_code', 'mail_timestamp', 'imap_uid', 'mailbox',
        'subject_hash', 'request_id', 'provider'
      )
    );
$$;

create table if not exists public.lead_interaction (
  id uuid primary key default gen_random_uuid(),
  lead_id varchar(80) not null references public.lead(id) on delete restrict,
  message_id uuid references public.lead_email_message(id) on delete restrict,
  sequence_id uuid references public.lead_email_sequence(id) on delete restrict,
  external_event_id varchar(255),
  event_type varchar(24) not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  channel varchar(20) not null default 'EMAIL',
  direction varchar(12) not null,
  source varchar(20) not null,
  correlation_id varchar(255) not null,
  causation_id varchar(255),
  actor_id varchar(120) not null,
  actor_version varchar(80) not null,
  safe_summary varchar(500) not null,
  content_ref varchar(500),
  content_hash varchar(64),
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key varchar(255) not null,
  event_hash varchar(64) not null,
  constraint lead_interaction_type_chk check (
    event_type in ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
  ),
  constraint lead_interaction_channel_chk check (channel = 'EMAIL'),
  constraint lead_interaction_direction_chk check (direction in ('OUTBOUND', 'INBOUND')),
  constraint lead_interaction_source_chk check (source in ('SES', 'IMAP', 'CRM', 'INTERNAL')),
  constraint lead_interaction_content_hash_chk
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint lead_interaction_event_hash_chk check (event_hash ~ '^[0-9a-f]{64}$'),
  constraint lead_interaction_metadata_chk check (public.lead_interaction_metadata_is_safe(metadata)),
  constraint lead_interaction_idempotency_unique unique (idempotency_key)
);

alter table public.lead_email_sequence
  add constraint lead_email_sequence_interruption_event_fk
  foreign key (interruption_event_id) references public.lead_interaction(id) on delete restrict;
alter table public.lead_email_suppression
  add constraint lead_email_suppression_source_event_fk
  foreign key (source_event_id) references public.lead_interaction(id) on delete restrict;

create index if not exists lead_interaction_timeline_idx
  on public.lead_interaction (lead_id, occurred_at desc, id desc);
create index if not exists lead_interaction_external_message_idx
  on public.lead_interaction (message_id, occurred_at desc)
  where message_id is not null;
create index if not exists lead_interaction_correlation_idx
  on public.lead_interaction (correlation_id, occurred_at, id);
create unique index if not exists lead_interaction_external_event_idx
  on public.lead_interaction (source, external_event_id)
  where external_event_id is not null;

create or replace function public.reject_lead_interaction_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'lead_interaction is append-only; record a correlated correction event'
    using errcode = '55000';
end;
$$;

drop trigger if exists lead_interaction_append_only on public.lead_interaction;
create trigger lead_interaction_append_only
  before update or delete on public.lead_interaction
  for each row execute function public.reject_lead_interaction_mutation();

create or replace function public.ingest_lead_interaction(
  p_lead_id varchar,
  p_message_id uuid,
  p_sequence_id uuid,
  p_external_event_id varchar,
  p_event_type varchar,
  p_occurred_at timestamptz,
  p_direction varchar,
  p_source varchar,
  p_correlation_id varchar,
  p_causation_id varchar,
  p_actor_id varchar,
  p_actor_version varchar,
  p_safe_summary varchar,
  p_content_ref varchar,
  p_content_hash varchar,
  p_metadata jsonb,
  p_idempotency_key varchar,
  p_event_hash varchar
)
returns table (interaction_id uuid, duplicate boolean, sequence_interrupted boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_interaction_id uuid;
  v_existing record;
  v_interrupted boolean := false;
begin
  if p_lead_id is null or not exists (select 1 from public.lead where id = p_lead_id and deleted_at is null) then
    raise exception 'Lead não correlacionado.' using errcode = 'P0002';
  end if;
  if p_event_type not in ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED') then
    raise exception 'Tipo de interação não suportado.' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or p_event_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Contrato idempotente inválido.' using errcode = 'P0001';
  end if;

  insert into public.lead_interaction (
    lead_id, message_id, sequence_id, external_event_id, event_type, occurred_at,
    direction, source, correlation_id, causation_id, actor_id, actor_version,
    safe_summary, content_ref, content_hash, metadata, idempotency_key, event_hash
  ) values (
    p_lead_id, p_message_id, p_sequence_id, p_external_event_id, p_event_type, p_occurred_at,
    p_direction, p_source, p_correlation_id, p_causation_id, p_actor_id, p_actor_version,
    p_safe_summary, p_content_ref, p_content_hash, coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key, p_event_hash
  )
  on conflict (idempotency_key) do nothing
  returning id into v_interaction_id;

  if v_interaction_id is null then
    select id, event_hash, lead_id, event_type into v_existing
    from public.lead_interaction where idempotency_key = p_idempotency_key;
    if v_existing.event_hash <> p_event_hash
      or v_existing.lead_id <> p_lead_id
      or v_existing.event_type <> p_event_type then
      raise exception 'Chave de idempotência reutilizada com evento divergente.' using errcode = 'P0004';
    end if;
    return query select v_existing.id::uuid, true, false;
    return;
  end if;

  if p_event_type in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED') then
    update public.lead_email_sequence
       set status = 'INTERRUPTED',
           interrupted_at = p_occurred_at,
           interruption_reason = p_event_type,
           interruption_event_id = v_interaction_id
     where id = p_sequence_id
       and lead_id = p_lead_id
       and status = 'ACTIVE';
    v_interrupted := found;

    if v_interrupted then
      update public.lead_email_sequence_step
         set status = 'CANCELLED', cancelled_at = now()
       where sequence_id = p_sequence_id and status = 'PENDING';
    end if;
  end if;

  if p_event_type in ('BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED') then
    insert into public.lead_email_suppression (lead_id, reason, source_event_id, suppressed_at)
    values (p_lead_id, p_event_type, v_interaction_id, p_occurred_at)
    on conflict (lead_id) do nothing;
  end if;

  return query select v_interaction_id, false, v_interrupted;
end;
$$;

revoke all on function public.ingest_lead_interaction(
  varchar, uuid, uuid, varchar, varchar, timestamptz, varchar, varchar, varchar,
  varchar, varchar, varchar, varchar, varchar, varchar, jsonb, varchar, varchar
) from public, anon, authenticated;
grant execute on function public.ingest_lead_interaction(
  varchar, uuid, uuid, varchar, varchar, timestamptz, varchar, varchar, varchar,
  varchar, varchar, varchar, varchar, varchar, varchar, jsonb, varchar, varchar
) to service_role;

alter table public.lead_email_sequence enable row level security;
alter table public.lead_email_sequence_step enable row level security;
alter table public.lead_email_message enable row level security;
alter table public.lead_email_suppression enable row level security;
alter table public.lead_interaction enable row level security;

revoke all on table public.lead_email_sequence, public.lead_email_sequence_step,
  public.lead_email_message, public.lead_email_suppression, public.lead_interaction
  from public, anon, authenticated;
grant select on table public.lead_email_sequence, public.lead_email_sequence_step,
  public.lead_email_message, public.lead_email_suppression, public.lead_interaction
  to authenticated;
grant all on table public.lead_email_sequence, public.lead_email_sequence_step,
  public.lead_email_message, public.lead_email_suppression, public.lead_interaction
  to service_role;

drop policy if exists lead_interaction_admin_select on public.lead_interaction;
create policy lead_interaction_admin_select on public.lead_interaction for select
  to authenticated using (public.is_admin());
drop policy if exists lead_email_sequence_admin_select on public.lead_email_sequence;
create policy lead_email_sequence_admin_select on public.lead_email_sequence for select
  to authenticated using (public.is_admin());
drop policy if exists lead_email_sequence_step_admin_select on public.lead_email_sequence_step;
create policy lead_email_sequence_step_admin_select on public.lead_email_sequence_step for select
  to authenticated using (public.is_admin());
drop policy if exists lead_email_message_admin_select on public.lead_email_message;
create policy lead_email_message_admin_select on public.lead_email_message for select
  to authenticated using (public.is_admin());
drop policy if exists lead_email_suppression_admin_select on public.lead_email_suppression;
create policy lead_email_suppression_admin_select on public.lead_email_suppression for select
  to authenticated using (public.is_admin());

-- Backfill defensivo: se esta migration for reaplicada sobre dados importados por
-- uma etapa intermediária, qualquer evento terminal já existente converge o
-- estado da sequência e cancela os passos pendentes sem fabricar interações.
update public.lead_email_sequence s
set status = 'INTERRUPTED',
    interrupted_at = terminal.occurred_at,
    interruption_reason = terminal.event_type,
    interruption_event_id = terminal.id
from (
  select distinct on (i.sequence_id)
    i.sequence_id, i.id, i.event_type, i.occurred_at
  from public.lead_interaction i
  where i.event_type in ('REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED')
  order by i.sequence_id, i.occurred_at, i.id
) terminal
where s.status = 'ACTIVE' and terminal.sequence_id = s.id;

update public.lead_email_sequence_step step
set status = 'CANCELLED', cancelled_at = now()
from public.lead_email_sequence sequence
where step.sequence_id = sequence.id
  and sequence.status = 'INTERRUPTED'
  and step.status = 'PENDING';

comment on table public.lead_interaction is
  'Event store append-only de interações; armazena somente resumo seguro e referência/hash, nunca corpo integral.';
comment on function public.ingest_lead_interaction is
  'Ingestão idempotente e transacional; eventos terminais interrompem a sequência antes de novos passos.';

commit;
