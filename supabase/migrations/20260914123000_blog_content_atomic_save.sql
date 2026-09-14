-- Atomic content save: post, revision snapshot and audit event commit together.

create or replace function public.admin_save_blog_post_content(
  p_post_id varchar(80),
  p_actor_id uuid,
  p_payload jsonb
)
returns public.post_blog
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.post_blog;
  v_status public.status_post_blog;
  v_revision integer;
begin
  if p_actor_id is null or not public.can_blog_capability(p_actor_id, 'edit') then
    raise exception using errcode = '42501', message = 'Operador sem permissão para editar o post.';
  end if;

  select * into v_post
  from public.post_blog
  where id = p_post_id and deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Post não encontrado.';
  end if;

  v_status := coalesce(nullif(p_payload->>'status', ''), v_post.status::text)::public.status_post_blog;
  if v_status <> v_post.status then
    raise exception using errcode = '22023', message = 'Altere o status usando uma ação editorial específica.';
  end if;

  update public.post_blog
  set titulo = coalesce(nullif(p_payload->>'titulo', ''), v_post.titulo),
      slug = coalesce(nullif(p_payload->>'slug', ''), v_post.slug),
      resumo = coalesce(nullif(p_payload->>'resumo', ''), v_post.resumo),
      conteudo = coalesce(nullif(p_payload->>'conteudo', ''), v_post.conteudo),
      categoria = coalesce(nullif(p_payload->>'categoria', ''), v_post.categoria),
      tags = case when jsonb_typeof(p_payload->'tags') = 'array' then p_payload->'tags' else v_post.tags end,
      autor = coalesce(nullif(p_payload->>'autor', ''), v_post.autor),
      tempo_leitura = coalesce(nullif(p_payload->>'tempo_leitura', ''), v_post.tempo_leitura),
      imagem_url = case when p_payload ? 'imagem_url' then nullif(p_payload->>'imagem_url', '') else v_post.imagem_url end,
      imagem_alt = case when p_payload ? 'imagem_alt' then nullif(p_payload->>'imagem_alt', '') else v_post.imagem_alt end,
      conteudo_formato = coalesce(nullif(p_payload->>'conteudo_formato', ''), v_post.conteudo_formato),
      seo_titulo = case when p_payload ? 'seo_titulo' then nullif(p_payload->>'seo_titulo', '') else v_post.seo_titulo end,
      seo_descricao = case when p_payload ? 'seo_descricao' then nullif(p_payload->>'seo_descricao', '') else v_post.seo_descricao end,
      canonical_url = case when p_payload ? 'canonical_url' then nullif(p_payload->>'canonical_url', '') else v_post.canonical_url end,
      og_image_url = case when p_payload ? 'og_image_url' then nullif(p_payload->>'og_image_url', '') else v_post.og_image_url end,
      curso_id = case when p_payload ? 'curso_id' then nullif(p_payload->>'curso_id', '') else v_post.curso_id end,
      atualizado_por = p_actor_id,
      revisao_atual = v_post.revisao_atual + 1
  where id = p_post_id
  returning * into v_post;

  v_revision := v_post.revisao_atual;
  insert into public.post_blog_revision (post_id, numero, snapshot, alterado_por, motivo)
  values (v_post.id, v_revision, to_jsonb(v_post), p_actor_id, 'save-content');

  insert into public.post_blog_audit_event (post_id, action, from_status, to_status, actor_id, metadata)
  values (v_post.id, 'save-content', v_status, v_status, p_actor_id, jsonb_build_object('revision', v_revision));

  return v_post;
end;
$$;

grant execute on function public.admin_save_blog_post_content(varchar, uuid, jsonb) to service_role;
