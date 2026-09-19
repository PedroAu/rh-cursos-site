-- Mantém o gatilho de criação de perfil compatível com profiles_role_check.
-- A migração editorial anterior preserva administradores, mas usava o papel
-- legado "user" para as demais contas; desde 20260604164120 o papel correto
-- para uma conta comum é "student".

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'student' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
