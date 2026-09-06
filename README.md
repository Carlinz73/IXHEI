# IXHEI — Achados e Perdidos

Versão refeita e consolidada.

## O que está incluído

- Página inicial.
- Salas 1 a 14.
- Pátio e Corredor.
- Publicação de itens achados e perdidos.
- Foto opcional armazenada no Supabase Storage.
- Login por e-mail e senha.
- Login com Google.
- Perfil com nome público editável.
- Nome do autor nas publicações.
- Exclusão da própria publicação.
- Conversas entre usuários.
- Realtime para novas mensagens.
- Página "Conheça o projeto".
- Painel Chefe/Admin.
- Chefe pode editar e excluir qualquer publicação.
- Chefe pode alterar nomes públicos.
- Chefe pode visualizar conversas para moderação.
- Aviso de moderação na área de conversas.

## Instalação do zero

### 1. Supabase

Abra `INSTALAR_TUDO.sql`, copie tudo e execute em:

Supabase > SQL Editor > New query > Run

Esse único arquivo cria/corrige:
- items
- profiles
- conversations
- messages
- RLS
- Storage `item-images`
- Realtime
- permissões do Chefe

### 2. Chave do Supabase

Abra `config.js`.

O URL do projeto já está preenchido:

https://kcjfeanctyjxiiiackgo.supabase.co

Troque somente:

COLE_SUA_PUBLISHABLE_KEY_AQUI

pela Publishable key do Supabase.

Nunca coloque Secret key/service_role no site.

### 3. Criar o Chefe

Primeiro faça login/crie a conta no IXHEI.

Depois abra `TORNAR_CHEFE.sql`.

Troque as DUAS ocorrências de:

SEU_EMAIL_AQUI

pelo e-mail exato da sua conta.

Execute o SQL.

Saia do IXHEI e entre novamente. A conta com `role = admin` verá o botão `Painel Chefe`.

Não existe segunda senha administrativa. O login é o login normal da conta.

### 4. Google OAuth

No Supabase, ative o provedor Google.

No Google Cloud, use como Authorized redirect URI:

https://kcjfeanctyjxiiiackgo.supabase.co/auth/v1/callback

No Supabase > Authentication > URL Configuration:

Site URL:
https://carlinz73.github.io/IXHEI/

Redirect URL:
https://carlinz73.github.io/IXHEI/**

### 5. GitHub Pages

Envie TODOS os arquivos desta pasta para a raiz do repositório IXHEI.

GitHub:
Settings > Pages

Source:
Deploy from a branch

Branch:
main

Folder:
/ (root)

Depois faça o commit e aguarde a publicação.

## Teste recomendado

1. Abra o site.
2. Crie/entre com uma conta comum.
3. Publique um item.
4. Entre com outra conta e inicie uma conversa.
5. Teste o chat.
6. Entre com a conta Chefe.
7. Confirme que aparece `Painel Chefe`.
8. Teste Publicações, Usuários e Conversas.

## Segurança

A conta não vira Chefe pelo JavaScript. O cargo fica no banco (`profiles.role`) e as operações administrativas são verificadas pelas políticas RLS do Supabase.

Usuários comuns não recebem permissão de banco para modificar `profiles.role`.
