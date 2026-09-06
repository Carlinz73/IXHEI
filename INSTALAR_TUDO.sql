-- ============================================================
-- IXHEI - INSTALAÇÃO COMPLETA
-- Execute este arquivo inteiro no Supabase > SQL Editor.
-- Pode ser usado em um projeto novo e também corrige a estrutura
-- das versões anteriores do IXHEI.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PUBLICAÇÕES
-- ============================================================

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  room text not null,
  title varchar(80) not null,
  description varchar(800) not null,
  location varchar(100),
  event_date date not null,
  image_url text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Corrige bancos antigos onde room era INTEGER.
alter table public.items drop constraint if exists items_room_check;
alter table public.items
  alter column room type text using room::text;

alter table public.items drop constraint if exists items_type_check;
alter table public.items
  add constraint items_type_check check (type in ('achado','perdido'));

alter table public.items drop constraint if exists items_room_valid_check;
alter table public.items
  add constraint items_room_valid_check
  check (
    room in (
      '1','2','3','4','5','6','7',
      '8','9','10','11','12','13','14',
      'patio','corredor'
    )
  );

create index if not exists idx_items_room on public.items(room);
create index if not exists idx_items_user_id on public.items(user_id);
create index if not exists idx_items_created_at on public.items(created_at desc);

-- ============================================================
-- 2. PERFIS
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'user',
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles drop constraint if exists display_name_length;
alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles
  add constraint profiles_display_name_check
  check (char_length(trim(display_name)) between 2 and 60);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user','admin'));

-- Cria perfis para usuários que já existiam.
insert into public.profiles (id, display_name)
select
  u.id,
  left(
    trim(
      coalesce(
        nullif(u.raw_user_meta_data->>'full_name',''),
        nullif(u.raw_user_meta_data->>'name',''),
        nullif(split_part(u.email,'@',1),''),
        'Usuário'
      )
    ),
    60
  )
from auth.users u
on conflict (id) do nothing;

-- Perfil automático para contas novas.
create or replace function public.handle_new_ixhei_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nome text;
begin
  nome := coalesce(
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'name',''),
    nullif(split_part(new.email,'@',1),''),
    'Usuário'
  );

  nome := left(trim(nome),60);

  if char_length(nome) < 2 then
    nome := 'Usuário';
  end if;

  insert into public.profiles(id,display_name,role)
  values(new.id,nome,'user')
  on conflict(id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ixhei on auth.users;
create trigger on_auth_user_created_ixhei
after insert on auth.users
for each row execute function public.handle_new_ixhei_user();

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_profile_updated_at on public.profiles;
create trigger trg_touch_profile_updated_at
before update on public.profiles
for each row execute function public.touch_profile_updated_at();

-- Verificação segura do cargo administrativo.
create or replace function public.is_ixhei_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_ixhei_admin() to anon, authenticated;

-- ============================================================
-- 3. CONVERSAS E MENSAGENS
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  item_owner_id uuid not null references auth.users(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(item_id, requester_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body varchar(500) not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_owner on public.conversations(item_owner_id);
create index if not exists idx_conversations_requester on public.conversations(requester_id);
create index if not exists idx_conversations_updated_at on public.conversations(updated_at desc);
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_created_at on public.messages(created_at);

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.items enable row level security;
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ITEMS
drop policy if exists "Items visiveis para todos" on public.items;
drop policy if exists "Usuarios criam seus itens" on public.items;
drop policy if exists "Usuarios atualizam seus itens" on public.items;
drop policy if exists "Usuarios excluem seus itens" on public.items;
drop policy if exists "Admin atualiza qualquer item" on public.items;
drop policy if exists "Admin exclui qualquer item" on public.items;

create policy "Items visiveis para todos"
on public.items for select
to anon, authenticated
using (true);

create policy "Usuarios criam seus itens"
on public.items for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Usuarios atualizam seus itens"
on public.items for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Usuarios excluem seus itens"
on public.items for delete
to authenticated
using (auth.uid() = user_id);

create policy "Admin atualiza qualquer item"
on public.items for update
to authenticated
using (public.is_ixhei_admin())
with check (public.is_ixhei_admin());

create policy "Admin exclui qualquer item"
on public.items for delete
to authenticated
using (public.is_ixhei_admin());

-- PROFILES
drop policy if exists "Perfis sao publicos" on public.profiles;
drop policy if exists "Usuario cria seu perfil" on public.profiles;
drop policy if exists "Usuario atualiza seu perfil" on public.profiles;
drop policy if exists "Admin atualiza qualquer perfil" on public.profiles;

create policy "Perfis sao publicos"
on public.profiles for select
to anon, authenticated
using (true);

create policy "Usuario cria seu perfil"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "Usuario atualiza seu perfil"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Admin atualiza qualquer perfil"
on public.profiles for update
to authenticated
using (public.is_ixhei_admin())
with check (public.is_ixhei_admin());

-- Impede que usuários comuns alterem role via API.
-- O frontend só recebe permissão de INSERT para id/display_name
-- e UPDATE para display_name. A promoção para admin é feita no SQL Editor.
revoke insert on public.profiles from authenticated;
grant insert (id, display_name) on public.profiles to authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- CONVERSATIONS
drop policy if exists "Participantes veem conversas" on public.conversations;
drop policy if exists "Usuario inicia conversa" on public.conversations;
drop policy if exists "Admin ve todas conversas" on public.conversations;

create policy "Participantes veem conversas"
on public.conversations for select
to authenticated
using (
  auth.uid() = item_owner_id
  or auth.uid() = requester_id
);

create policy "Usuario inicia conversa"
on public.conversations for insert
to authenticated
with check (
  auth.uid() = requester_id
  and auth.uid() <> item_owner_id
  and exists (
    select 1
    from public.items i
    where i.id = item_id
      and i.user_id = item_owner_id
  )
);

create policy "Admin ve todas conversas"
on public.conversations for select
to authenticated
using (public.is_ixhei_admin());

-- MESSAGES
drop policy if exists "Participantes veem mensagens" on public.messages;
drop policy if exists "Participantes enviam mensagens" on public.messages;
drop policy if exists "Participantes marcam mensagens" on public.messages;
drop policy if exists "Admin ve todas mensagens" on public.messages;

create policy "Participantes veem mensagens"
on public.messages for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Participantes enviam mensagens"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Participantes marcam mensagens"
on public.messages for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Admin ve todas mensagens"
on public.messages for select
to authenticated
using (public.is_ixhei_admin());

-- Somente read_at pode ser alterado diretamente por usuários autenticados.
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- ============================================================
-- 5. STORAGE DE IMAGENS
-- ============================================================

insert into storage.buckets (id, name, public)
values ('item-images','item-images',true)
on conflict (id) do update set public = true;

drop policy if exists "Upload autenticado item-images" on storage.objects;
drop policy if exists "Imagens publicas item-images" on storage.objects;
drop policy if exists "Usuario apaga suas imagens item-images" on storage.objects;

create policy "Upload autenticado item-images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Imagens publicas item-images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'item-images');

create policy "Usuario apaga suas imagens item-images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 6. REALTIME PARA O CHAT
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end
$$;

-- ============================================================
-- 7. RESULTADO
-- ============================================================

select
  'IXHEI instalado com sucesso' as status,
  (select count(*) from public.profiles) as perfis,
  (select count(*) from public.items) as publicacoes,
  (select count(*) from public.conversations) as conversas;
