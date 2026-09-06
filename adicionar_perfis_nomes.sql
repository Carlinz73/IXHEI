-- IXHEI - PERFIS E NOMES DE USUÁRIO
-- Execute UMA VEZ em Supabase > SQL Editor > New query.
-- Não apaga publicações, conversas ou usuários.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now(),
  constraint display_name_length check (
    char_length(trim(display_name)) between 2 and 60
  )
);

alter table public.profiles enable row level security;

drop policy if exists "Perfis podem ser vistos por todos" on public.profiles;
drop policy if exists "Usuario cria o proprio perfil" on public.profiles;
drop policy if exists "Usuario edita o proprio perfil" on public.profiles;

-- Somente nome público e ID ficam nesta tabela; e-mail continua no Auth.
create policy "Perfis podem ser vistos por todos"
on public.profiles
for select
to anon, authenticated
using (true);

create policy "Usuario cria o proprio perfil"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Usuario edita o proprio perfil"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Cria o perfil automaticamente quando uma nova conta é criada.
create or replace function public.handle_new_ixhei_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(split_part(coalesce(new.email,''), '@', 1)), ''),
    'Usuário'
  );

  if char_length(chosen_name) < 2 then
    chosen_name := 'Usuário';
  end if;

  chosen_name := left(chosen_name, 60);

  insert into public.profiles (id, display_name)
  values (new.id, chosen_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ixhei_profile on auth.users;

create trigger on_auth_user_created_ixhei_profile
after insert on auth.users
for each row execute procedure public.handle_new_ixhei_user();

-- Cria perfis para usuários que já existem.
insert into public.profiles (id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(split_part(coalesce(u.email,''), '@', 1)), ''),
      'Usuário'
    ),
    60
  )
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

-- Atualiza automaticamente updated_at quando o nome mudar.
create or replace function public.touch_ixhei_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_ixhei_profile on public.profiles;

create trigger trg_touch_ixhei_profile
before update on public.profiles
for each row execute procedure public.touch_ixhei_profile();

select id, display_name, updated_at
from public.profiles
order by updated_at desc;
