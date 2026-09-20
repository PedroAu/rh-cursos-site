-- Corrige a seleção da prospecção: "Gestão de Pessoas" é o assunto editorial
-- da campanha, não um filtro sobre o tema/curso gravado em cada lead.

create or replace function public.sales_prospecting_cohort_members(
  p_campaign_key varchar
)
returns table (lead_id varchar, classification text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.sales_reactivation_campaign%rowtype;
begin
  select * into v_campaign
  from public.sales_reactivation_campaign
  where campaign_key = nullif(trim(p_campaign_key), '')
  order by version desc
  limit 1;

  if v_campaign.id is null or v_campaign.permission_purpose <> 'COMMERCIAL_PROSPECTING' then
    raise exception 'Campanha de prospecção não encontrada.' using errcode = 'P0002';
  end if;

  return query
  with imported as (
    select distinct permission.lead_id
    from public.lead_contact_permission_event permission
    where permission.evidence_ref like 'import-batch://%'
  )
  select
    imported.lead_id,
    case
      when lead.deleted_at is not null then 'LEAD_DELETED'
      when lead.email is null or lead.email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        then 'EMAIL_INVALID'
      when latest.status = 'BLOCKED' then 'PERMISSION_BLOCKED'
      when exists (
        select 1 from public.lead_email_suppression suppression
        where suppression.lead_id = lead.id
      ) then 'SUPPRESSED'
      when latest.status is distinct from 'UNKNOWN' then 'ALREADY_DECIDED'
      else 'ELIGIBLE'
    end
  from imported
  join public.lead lead on lead.id = imported.lead_id
  left join lateral (
    select permission.status
    from public.lead_contact_permission_event permission
    where permission.lead_id = lead.id
    order by permission.occurred_at desc, permission.id desc
    limit 1
  ) latest on true;
end;
$$;

revoke all on function public.sales_prospecting_cohort_members(varchar)
  from public, anon, authenticated;
grant execute on function public.sales_prospecting_cohort_members(varchar)
  to service_role;

create or replace function public.sales_plan_prospecting_permission_cohort(
  p_campaign_key varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.sales_reactivation_campaign%rowtype;
  v_result jsonb;
begin
  select * into v_campaign
  from public.sales_reactivation_campaign
  where campaign_key = nullif(trim(p_campaign_key), '')
  order by version desc
  limit 1;

  if v_campaign.id is null or v_campaign.permission_purpose <> 'COMMERCIAL_PROSPECTING' then
    raise exception 'Campanha de prospecção não encontrada.' using errcode = 'P0002';
  end if;

  with classified as materialized (
    select * from public.sales_prospecting_cohort_members(p_campaign_key)
  ), eligible as (
    select lead_id from classified where classification = 'ELIGIBLE'
  ), reason_counts as (
    select classification, count(*)::integer as count
    from classified
    where classification <> 'ELIGIBLE'
    group by classification
  )
  select jsonb_build_object(
    'campaignKey', v_campaign.campaign_key,
    'campaignVersion', v_campaign.version,
    'purpose', v_campaign.permission_purpose,
    'evaluated', (select count(*) from classified),
    'eligible', (select count(*) from eligible),
    'excludedByReason', coalesce(
      (select jsonb_object_agg(classification, count order by classification) from reason_counts),
      '{}'::jsonb
    ),
    'cohortDigest', encode(extensions.digest(coalesce(
      (select string_agg(lead_id, ',' order by lead_id) from eligible),
      ''
    ), 'sha256'), 'hex'),
    'messagesSent', 0,
    'sequencesCreated', 0
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.sales_apply_prospecting_permission_cohort(
  p_campaign_key varchar,
  p_decision_key varchar,
  p_expected_digest varchar,
  p_approval_reference varchar,
  p_expires_at timestamptz,
  p_actor_id varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.sales_reactivation_campaign%rowtype;
  v_existing public.sales_permission_cohort_decision%rowtype;
  v_decision_id uuid;
  v_digest varchar(64);
  v_count integer;
  v_inserted integer;
  v_candidate_ids varchar(80)[];
  v_now timestamptz := now();
begin
  if nullif(trim(p_decision_key), '') is null or length(trim(p_decision_key)) < 12 then
    raise exception 'Chave de decisão inválida.' using errcode = 'P0001';
  end if;
  if p_expected_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Digest esperado inválido.' using errcode = 'P0001';
  end if;
  if nullif(trim(p_approval_reference), '') is null or length(trim(p_approval_reference)) < 12 then
    raise exception 'Referência de aprovação inválida.' using errcode = 'P0001';
  end if;
  if nullif(trim(p_actor_id), '') is null or length(trim(p_actor_id)) < 3 then
    raise exception 'Ator inválido.' using errcode = 'P0001';
  end if;
  if p_expires_at <= v_now or p_expires_at > v_now + interval '30 days' then
    raise exception 'Validade deve estar entre agora e 30 dias.' using errcode = 'P0001';
  end if;

  select * into v_campaign
  from public.sales_reactivation_campaign
  where campaign_key = nullif(trim(p_campaign_key), '')
  order by version desc
  limit 1;

  if v_campaign.id is null
    or v_campaign.permission_purpose <> 'COMMERCIAL_PROSPECTING'
    or v_campaign.content_status <> 'APPROVED'
    or v_campaign.status <> 'DISABLED' then
    raise exception 'Campanha não está preparada e desabilitada.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'sales-prospecting-cohort:' || v_campaign.id::text,
    0
  ));

  select * into v_existing
  from public.sales_permission_cohort_decision
  where decision_key = trim(p_decision_key);

  if v_existing.id is not null then
    if v_existing.campaign_id <> v_campaign.id
      or v_existing.cohort_digest <> p_expected_digest
      or v_existing.evidence_ref <> trim(p_approval_reference)
      or v_existing.expires_at <> p_expires_at then
      raise exception 'Chave de decisão já existe com payload diferente.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'decisionId', v_existing.id,
      'campaignKey', v_campaign.campaign_key,
      'campaignVersion', v_campaign.version,
      'approved', v_existing.contact_count,
      'cohortDigest', v_existing.cohort_digest,
      'expiresAt', v_existing.expires_at,
      'idempotent', true,
      'messagesSent', 0,
      'sequencesCreated', 0
    );
  end if;

  select coalesce(
    array_agg(member.lead_id order by member.lead_id),
    array[]::varchar(80)[]
  ) into v_candidate_ids
  from public.sales_prospecting_cohort_members(p_campaign_key) member
  where member.classification = 'ELIGIBLE';

  v_count := cardinality(v_candidate_ids);
  v_digest := encode(extensions.digest(array_to_string(v_candidate_ids, ','), 'sha256'), 'hex');

  if v_count = 0 then
    raise exception 'Coorte elegível vazia.' using errcode = 'P0001';
  end if;
  if v_digest <> p_expected_digest then
    raise exception 'Coorte mudou após o dry-run; gere um novo plano.' using errcode = 'P0001';
  end if;

  insert into public.sales_permission_cohort_decision (
    decision_key, campaign_id, purpose, legal_basis, status, cohort_digest,
    contact_count, evidence_ref, decided_by, decided_at, expires_at
  ) values (
    trim(p_decision_key), v_campaign.id, v_campaign.permission_purpose,
    'LEGITIMATE_INTEREST', 'APPROVED', v_digest, v_count,
    trim(p_approval_reference), left(trim(p_actor_id), 120), v_now, p_expires_at
  ) returning id into v_decision_id;

  insert into public.lead_contact_permission_event (
    lead_id, status, legal_basis, purpose, evidence_ref, occurred_at,
    expires_at, actor_id, idempotency_key
  )
  select
    candidate.lead_id, 'APPROVED', 'LEGITIMATE_INTEREST',
    v_campaign.permission_purpose, trim(p_approval_reference), v_now,
    p_expires_at, left(trim(p_actor_id), 120),
    'permission-cohort:' || trim(p_decision_key) || ':' || candidate.lead_id
  from unnest(v_candidate_ids) as candidate(lead_id)
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> v_count then
    raise exception 'Aplicação incompleta da decisão de coorte.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'decisionId', v_decision_id,
    'campaignKey', v_campaign.campaign_key,
    'campaignVersion', v_campaign.version,
    'approved', v_inserted,
    'cohortDigest', v_digest,
    'expiresAt', p_expires_at,
    'idempotent', false,
    'messagesSent', 0,
    'sequencesCreated', 0
  );
end;
$$;

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
  v_sequence_course text;
  v_campaign public.sales_reactivation_campaign%rowtype;
  v_permission public.lead_contact_permission_event%rowtype;
  v_control public.sales_orchestrator_control%rowtype;
  v_course_title text;
  v_lead_eligible boolean := false;
begin
  select * into v_campaign from public.sales_reactivation_campaign where id = p_campaign_id;
  if v_campaign.id is null or v_campaign.status <> 'ACTIVE' or v_campaign.content_status <> 'APPROVED' then
    raise exception 'Campanha não está apta para execução.' using errcode = 'P0001';
  end if;
  select * into v_control from public.sales_orchestrator_control where id = 'global';
  if v_control.id is null or not v_control.enabled or v_control.dry_run or v_control.kill_switch then
    raise exception 'Orquestrador não está habilitado para envio.' using errcode = 'P0001';
  end if;

  select true, case
      when v_campaign.permission_purpose = 'COMMERCIAL_PROSPECTING' then 'Gestão de Pessoas'
      else coalesce(nullif(trim(course.titulo), ''), nullif(trim(lead.tema_interesse), ''))
    end
    into v_lead_eligible, v_course_title
  from public.lead lead
  left join public.curso course on course.id = lead.curso_id and course.deleted_at is null
  where lead.id = p_lead_id
    and lead.deleted_at is null
    and lead.email is not null
    and lead.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';
  if not v_lead_eligible then
    raise exception 'Lead sem e-mail elegível.' using errcode = 'P0001';
  end if;
  if v_course_title is null then
    raise exception 'Lead sem curso ou tema elegível.' using errcode = 'P0001';
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
    or v_permission.purpose <> v_campaign.permission_purpose
    or (v_permission.expires_at is not null and v_permission.expires_at <= now()) then
    raise exception 'Permissão comercial ausente ou inválida.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lead_email_suppression where lead_id = p_lead_id) then
    raise exception 'Lead suprimido.' using errcode = 'P0001';
  end if;
  if v_campaign.permission_purpose = 'COMMERCIAL_REACTIVATION' and exists (
    select 1 from public.lead_interaction
    where lead_id = p_lead_id
      and occurred_at > now() - make_interval(days => v_control.minimum_inactivity_days)
  ) then
    raise exception 'Lead possui interação recente.' using errcode = 'P0001';
  end if;

  select id, campaign_course_title into v_sequence_id, v_sequence_course
  from public.lead_email_sequence
  where lead_id = p_lead_id
    and campaign_key = v_campaign.campaign_key || '@' || v_campaign.version::text
  order by created_at
  limit 1;
  if v_sequence_id is not null then
    if exists (select 1 from public.lead_email_sequence where id = v_sequence_id and status = 'ACTIVE')
      and v_sequence_course = v_course_title then
      return v_sequence_id;
    end if;
    if exists (select 1 from public.lead_email_sequence where id = v_sequence_id and status = 'ACTIVE') then
      raise exception 'Assunto do lead mudou após a criação da sequência.' using errcode = 'P0001';
    end if;
    raise exception 'Lead já participou desta versão de campanha.' using errcode = 'P0001';
  end if;

  insert into public.lead_email_sequence (lead_id, campaign_key, campaign_course_title)
  values (p_lead_id, v_campaign.campaign_key || '@' || v_campaign.version::text, v_course_title)
  on conflict do nothing
  returning id into v_sequence_id;

  if v_sequence_id is null then
    select id into v_sequence_id
    from public.lead_email_sequence
    where lead_id = p_lead_id
      and campaign_key = v_campaign.campaign_key || '@' || v_campaign.version::text
      and campaign_course_title = v_course_title
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

create or replace function public.sales_claim_reactivation_steps(
  p_campaign_key varchar,
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
  if nullif(trim(p_campaign_key), '') is null
    or p_claim_token is null
    or p_lease_seconds not between 30 and 900
    or p_limit not between 1 and 50 then
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
    join public.lead current_lead
      on current_lead.id = sequence.lead_id
      and current_lead.deleted_at is null
      and current_lead.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    left join public.curso current_course
      on current_course.id = current_lead.curso_id and current_course.deleted_at is null
    join public.sales_reactivation_campaign campaign
      on sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
      and campaign.campaign_key = trim(p_campaign_key)
      and campaign.version = (
        select max(latest_campaign.version)
        from public.sales_reactivation_campaign latest_campaign
        where latest_campaign.campaign_key = trim(p_campaign_key)
      )
      and campaign.status = 'ACTIVE' and campaign.content_status = 'APPROVED'
    where step.status = 'PENDING'
      and sequence.campaign_course_title is not null
      and (
        campaign.permission_purpose = 'COMMERCIAL_PROSPECTING'
        or coalesce(
          nullif(trim(current_course.titulo), ''),
          nullif(trim(current_lead.tema_interesse), '')
        ) = sequence.campaign_course_title
      )
      and exists (
        select 1 from public.sales_reactivation_campaign_course campaign_course
        where campaign_course.campaign_id = campaign.id
          and campaign_course.course_title = sequence.campaign_course_title
      )
      and step.attempt_count < 10
      and step.due_at <= p_now
      and (step.claim_expires_at is null or step.claim_expires_at <= p_now)
      and not exists (
        select 1 from public.sales_send_attempt sending
        where sending.sequence_step_id = step.id and sending.status = 'SENDING'
      )
      and not exists (
        select 1 from public.lead_email_suppression suppression
        where suppression.lead_id = sequence.lead_id
      )
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
    sequence.campaign_course_title::text,
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
  join public.sales_reactivation_campaign campaign
    on sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
    and campaign.campaign_key = trim(p_campaign_key)
  join public.sales_reactivation_campaign_step campaign_step
    on campaign_step.campaign_id = campaign.id and campaign_step.step_index = claimed.step_index;
end;
$$;

create or replace function public.sales_begin_send(
  p_attempt_id uuid,
  p_claim_token uuid,
  p_payload_hash varchar,
  p_rfc_message_id varchar,
  p_recipient_email varchar,
  p_course_title text
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
      from public.lead current_lead
      left join public.curso current_course
        on current_course.id = current_lead.curso_id and current_course.deleted_at is null
      where current_lead.id = sequence.lead_id
        and current_lead.deleted_at is null
        and current_lead.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        and lower(trim(current_lead.email)) = lower(trim(p_recipient_email))
        and sequence.campaign_course_title = p_course_title
        and (
          coalesce(
            nullif(trim(current_course.titulo), ''),
            nullif(trim(current_lead.tema_interesse), '')
          ) = p_course_title
          or exists (
            select 1
            from public.sales_reactivation_campaign subject_campaign
            where sequence.campaign_key = subject_campaign.campaign_key || '@' || subject_campaign.version::text
              and subject_campaign.permission_purpose = 'COMMERCIAL_PROSPECTING'
          )
        )
    )
    and exists (
      select 1
      from public.sales_reactivation_campaign campaign
      join public.sales_orchestrator_control control on control.id = 'global'
      where sequence.campaign_key = campaign.campaign_key || '@' || campaign.version::text
        and campaign.status = 'ACTIVE'
        and campaign.content_status = 'APPROVED'
        and exists (
          select 1
          from public.sales_reactivation_campaign_course campaign_course
          where campaign_course.campaign_id = campaign.id
            and campaign_course.course_title = p_course_title
        )
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
            and permission.purpose = campaign.permission_purpose
            and (permission.expires_at is null or permission.expires_at > now())
        )
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.sales_plan_prospecting_permission_cohort(varchar)
  from public, anon, authenticated;
revoke all on function public.sales_apply_prospecting_permission_cohort(
  varchar, varchar, varchar, varchar, timestamptz, varchar
) from public, anon, authenticated;
revoke all on function public.sales_create_reactivation_sequence(
  varchar, uuid, uuid, varchar, varchar
) from public, anon, authenticated;
revoke all on function public.sales_claim_reactivation_steps(
  varchar, uuid, timestamptz, integer, integer
) from public, anon, authenticated;
revoke all on function public.sales_begin_send(
  uuid, uuid, varchar, varchar, varchar, text
) from public, anon, authenticated;

grant execute on function public.sales_plan_prospecting_permission_cohort(varchar)
  to service_role;
grant execute on function public.sales_apply_prospecting_permission_cohort(
  varchar, varchar, varchar, varchar, timestamptz, varchar
) to service_role;
grant execute on function public.sales_create_reactivation_sequence(
  varchar, uuid, uuid, varchar, varchar
) to service_role;
grant execute on function public.sales_claim_reactivation_steps(
  varchar, uuid, timestamptz, integer, integer
) to service_role;
grant execute on function public.sales_begin_send(
  uuid, uuid, varchar, varchar, varchar, text
) to service_role;
