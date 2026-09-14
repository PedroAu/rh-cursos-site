-- Blog editorial architecture.
-- This migration is additive and keeps the existing post_blog contract working.

alter type public.status_post_blog add value if not exists 'Em revisão';
alter type public.status_post_blog add value if not exists 'Agendado';

alter table public.post_blog
  add column if not exists agendado_em timestamptz,
  add column if not exists conteudo_formato varchar(20) not null default 'plain',
  add column if not exists imagem_alt varchar(240),
  add column if not exists seo_titulo varchar(240),
  add column if not exists seo_descricao varchar(320),
  add column if not exists canonical_url varchar(500),
  add column if not exists og_image_url varchar(500),
  add column if not exists revisao_atual integer not null default 1,
  add column if not exists autor_id uuid references auth.users(id) on delete set null,
  add column if not exists criado_por uuid references auth.users(id) on delete set null,
  add column if not exists atualizado_por uuid references auth.users(id) on delete set null,
  add column if not exists publicado_por uuid references auth.users(id) on delete set null;

drop policy if exists "post_blog_public_select" on public.post_blog;
create policy "post_blog_public_select" on public.post_blog for select
  to anon, authenticated
  using (
    deleted_at is null
    and status = 'Publicado'
    and publicado_em is not null
    and publicado_em <= now()
  );

alter table public.post_blog
  drop constraint if exists post_blog_conteudo_formato_check;

alter table public.post_blog
  add constraint post_blog_conteudo_formato_check
  check (conteudo_formato in ('plain', 'markdown'));

create index if not exists post_blog_schedule_idx
  on public.post_blog (status, agendado_em)
  where deleted_at is null;

create index if not exists post_blog_canonical_idx
  on public.post_blog (canonical_url)
  where canonical_url is not null and deleted_at is null;

create table if not exists public.post_blog_revision (
  id uuid primary key default gen_random_uuid(),
  post_id varchar(80) not null references public.post_blog(id) on delete cascade,
  numero integer not null,
  snapshot jsonb not null,
  alterado_por uuid references auth.users(id) on delete set null,
  motivo varchar(240),
  created_at timestamptz not null default now(),
  constraint post_blog_revision_unique unique (post_id, numero),
  constraint post_blog_revision_numero_check check (numero > 0)
);

create index if not exists post_blog_revision_post_idx
  on public.post_blog_revision (post_id, numero desc);

create table if not exists public.post_blog_audit_event (
  id uuid primary key default gen_random_uuid(),
  post_id varchar(80) references public.post_blog(id) on delete set null,
  action varchar(40) not null,
  from_status public.status_post_blog,
  to_status public.status_post_blog,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists post_blog_audit_event_post_idx
  on public.post_blog_audit_event (post_id, created_at desc);

create table if not exists public.post_blog_permission (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  can_edit boolean not null default false,
  can_review boolean not null default false,
  can_schedule boolean not null default false,
  can_publish boolean not null default false,
  can_archive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.post_blog_revision enable row level security;
alter table public.post_blog_audit_event enable row level security;
alter table public.post_blog_permission enable row level security;

drop policy if exists "post_blog_revision_admin_select" on public.post_blog_revision;
create policy "post_blog_revision_admin_select" on public.post_blog_revision for select
  to authenticated using (public.is_admin());

drop policy if exists "post_blog_audit_event_admin_select" on public.post_blog_audit_event;
create policy "post_blog_audit_event_admin_select" on public.post_blog_audit_event for select
  to authenticated using (public.is_admin());

drop policy if exists "post_blog_permission_admin_select" on public.post_blog_permission;
create policy "post_blog_permission_admin_select" on public.post_blog_permission for select
  to authenticated using (public.is_admin());

drop trigger if exists post_blog_permission_set_updated_at on public.post_blog_permission;
create trigger post_blog_permission_set_updated_at
  before update on public.post_blog_permission
  for each row execute function public.set_updated_at();

create or replace function public.can_blog_capability(
  p_user_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin'
  ) or exists (
    select 1
    from public.post_blog_permission
    where user_id = p_user_id
      and case p_capability
        when 'edit' then can_edit
        when 'review' then can_review
        when 'schedule' then can_schedule
        when 'publish' then can_publish
        when 'archive' then can_archive
        else false
      end
  );
$$;

grant execute on function public.can_blog_capability(uuid, text) to service_role;

create or replace function public.admin_transition_blog_post(
  p_post_id varchar(80),
  p_action varchar(40),
  p_actor_id uuid,
  p_scheduled_at timestamptz default null
)
returns public.post_blog
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.post_blog;
  v_from public.status_post_blog;
  v_to public.status_post_blog;
  v_now timestamptz := now();
  v_capability text;
  v_metadata jsonb := '{}'::jsonb;
begin
  if p_actor_id is null then
    raise exception using errcode = '42501', message = 'Identidade do operador é obrigatória.';
  end if;

  v_capability := case p_action
    when 'submit-review' then 'review'
    when 'schedule' then 'schedule'
    when 'publish' then 'publish'
    when 'archive' then 'archive'
    when 'restore' then 'edit'
    else null
  end;

  if v_capability is null then
    raise exception using errcode = '22023', message = 'Transição editorial inválida.';
  end if;

  if not public.can_blog_capability(p_actor_id, v_capability) then
    raise exception using errcode = '42501', message = 'Operador sem permissão para esta ação.';
  end if;

  select * into v_post
  from public.post_blog
  where id = p_post_id and deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Post não encontrado.';
  end if;

  v_from := v_post.status;
  case p_action
    when 'submit-review' then
      if v_from not in ('Rascunho', 'Arquivado') then
        raise exception using errcode = '22023', message = 'Somente rascunhos podem ser enviados para revisão.';
      end if;
      v_to := 'Em revisão';
    when 'schedule' then
      if p_scheduled_at is null or p_scheduled_at <= v_now then
        raise exception using errcode = '22023', message = 'A data de agendamento deve estar no futuro.';
      end if;
      if v_from not in ('Em revisão', 'Rascunho') then
        raise exception using errcode = '22023', message = 'Somente posts em revisão ou rascunho podem ser agendados.';
      end if;
      v_to := 'Agendado';
    when 'publish' then
      if v_from not in ('Em revisão', 'Agendado', 'Rascunho') then
        raise exception using errcode = '22023', message = 'O post não pode ser publicado a partir do status atual.';
      end if;
      v_to := 'Publicado';
    when 'archive' then
      if v_from not in ('Publicado', 'Agendado', 'Em revisão') then
        raise exception using errcode = '22023', message = 'Somente posts ativos podem ser arquivados.';
      end if;
      v_to := 'Arquivado';
    when 'restore' then
      if v_from <> 'Arquivado' then
        raise exception using errcode = '22023', message = 'Somente posts arquivados podem ser restaurados.';
      end if;
      v_to := 'Rascunho';
  end case;

  v_metadata := jsonb_build_object('scheduled_at', p_scheduled_at, 'transitioned_at', v_now);

  update public.post_blog
  set status = v_to,
      agendado_em = case when p_action = 'schedule' then p_scheduled_at else null end,
      publicado_em = case when p_action = 'publish' then coalesce(publicado_em, v_now) else publicado_em end,
      publicado_por = case when p_action = 'publish' then p_actor_id else publicado_por end,
      atualizado_por = p_actor_id,
      revisao_atual = revisao_atual + 1
  where id = p_post_id
  returning * into v_post;

  insert into public.post_blog_revision (post_id, numero, snapshot, alterado_por, motivo)
  values (
    v_post.id,
    v_post.revisao_atual,
    jsonb_build_object(
      'titulo', v_post.titulo, 'slug', v_post.slug, 'resumo', v_post.resumo,
      'conteudo', v_post.conteudo, 'categoria', v_post.categoria, 'tags', v_post.tags,
      'autor', v_post.autor, 'status', v_post.status, 'publicado_em', v_post.publicado_em,
      'agendado_em', v_post.agendado_em, 'imagem_url', v_post.imagem_url,
      'seo_titulo', v_post.seo_titulo, 'seo_descricao', v_post.seo_descricao,
      'canonical_url', v_post.canonical_url
    ),
    p_actor_id,
    p_action
  );

  insert into public.post_blog_audit_event (post_id, action, from_status, to_status, actor_id, metadata)
  values (v_post.id, p_action, v_from, v_to, p_actor_id, v_metadata);

  return v_post;
end;
$$;

grant execute on function public.admin_transition_blog_post(varchar, varchar, uuid, timestamptz) to service_role;

grant select, insert, update on public.post_blog_revision to service_role;
grant select, insert on public.post_blog_audit_event to service_role;
grant select, insert, update on public.post_blog_permission to service_role;

comment on table public.post_blog_revision is 'Snapshots imutáveis do conteúdo editorial do blog.';
comment on table public.post_blog_audit_event is 'Histórico de transições e ações editoriais do blog.';
comment on table public.post_blog_permission is 'Capacidades editoriais delegáveis por usuário.';
