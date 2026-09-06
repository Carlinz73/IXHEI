-- IXHEI - REMOVER CARGO DE CHEFE
-- Troque SEU_EMAIL_AQUI pelo e-mail da conta.

update public.profiles p
set role = 'user'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('SEU_EMAIL_AQUI');
