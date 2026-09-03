-- IXHEI - banco atualizado com conversas
create extension if not exists "pgcrypto";

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('achado','perdido')),
  room integer not null check (room between 1 and 14),
  title varchar(80) not null,
  description varchar(800) not null,
  location varchar(100),
  event_date date not null,
  image_url text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

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

alter table public.items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Items visiveis para todos" on public.items;
drop policy if exists "Usuarios criam seus itens" on public.items;
drop policy if exists "Usuarios atualizam seus itens" on public.items;
drop policy if exists "Usuarios excluem seus itens" on public.items;
drop policy if exists "Participantes veem conversas" on public.conversations;
drop policy if exists "Usuario inicia conversa" on public.conversations;
drop policy if exists "Participantes veem mensagens" on public.messages;
drop policy if exists "Participantes enviam mensagens" on public.messages;
drop policy if exists "Participantes marcam mensagens" on public.messages;

create policy "Items visiveis para todos"
on public.items for select using (true);

create policy "Usuarios criam seus itens"
on public.items for insert to authenticated
with check (auth.uid() = user_id);

create policy "Usuarios atualizam seus itens"
on public.items for update to authenticated
using (auth.uid() = user_id);

create policy "Usuarios excluem seus itens"
on public.items for delete to authenticated
using (auth.uid() = user_id);

create policy "Participantes veem conversas"
on public.conversations for select to authenticated
using (auth.uid() = item_owner_id or auth.uid() = requester_id);

create policy "Usuario inicia conversa"
on public.conversations for insert to authenticated
with check (auth.uid() = requester_id and auth.uid() <> item_owner_id);

create policy "Participantes veem mensagens"
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Participantes enviam mensagens"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Participantes marcam mensagens"
on public.messages for update to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
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

-- Storage: crie um bucket PUBLIC chamado item-images
drop policy if exists "Upload autenticado item-images" on storage.objects;
drop policy if exists "Imagens publicas item-images" on storage.objects;

create policy "Upload autenticado item-images"
on storage.objects for insert to authenticated
with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Imagens publicas item-images"
on storage.objects for select
using (bucket_id = 'item-images');
