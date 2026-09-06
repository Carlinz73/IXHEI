-- IXHEI - TORNAR UMA CONTA CHEFE
-- 1. Primeiro execute INSTALAR_TUDO.sql.
-- 2. Troque SEU_EMAIL_AQUI pelo e-mail EXATO usado no IXHEI.
-- 3. Execute este arquivo no Supabase > SQL Editor.

update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('carloseduardojesusf@gmail.com');

-- Conferência:
select
  u.email,
  p.display_name,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('carloseduardojesusf@gmail.com');
