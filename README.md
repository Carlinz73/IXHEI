# IXHEI — versão com chat melhorado

Esta versão adiciona:

- Caixa de entrada de conversas
- Uma conversa separada para cada item + pessoa interessada
- Mensagens em bolhas
- Contador de mensagens não lidas
- Atualização em tempo real usando Supabase Realtime
- Lista das conversas mais recentes
- Botão "Ver item"
- Dono do item pode abrir as conversas relacionadas
- Usuário interessado pode iniciar conversa pela publicação

## IMPORTANTE: banco novo

Se você ainda não criou o banco, rode `schema.sql` normalmente.

Se você já usou a versão anterior, o mais simples para um projeto ainda em testes é:
1. Apagar as tabelas `messages` antigas pelo Supabase.
2. Rodar o `schema.sql` desta nova versão.
3. Manter `items` se quiser preservar os itens existentes.

Se o SQL reclamar que uma tabela já existe com estrutura antiga, use o arquivo `migracao_chat.sql`.

## Supabase Realtime

No painel do Supabase:
1. Vá em Database > Publications ou Realtime.
2. Ative Realtime para a tabela `messages`.

## Configuração

Em `config.js`, coloque sua Project URL e sua chave anon/public.

Nunca use a service_role no site.


## Salas separadas

Agora cada sala possui uma página própria:

- `sala1.html`
- `sala2.html`
- ...
- `sala14.html`

Cada página filtra automaticamente as publicações daquela sala.
Ao publicar dentro de uma sala, o número da sala já fica definido.

No GitHub Pages, os links ficarão parecidos com:

`https://SEU-USUARIO.github.io/ixhei/sala1.html`

até

`https://SEU-USUARIO.github.io/ixhei/sala14.html`


## Nova página inicial

A página `index.html` agora tem visual de aplicativo com:
- 14 cartões grandes das salas
- atalhos de Achados, Perdidos, Conversas e Perfil
- botão rápido de publicação
- barra inferior no celular
- perfil com acesso às publicações e conversas

Nenhuma alteração adicional no banco é necessária para esta melhoria visual.


## Correção
As salas agora estão escritas diretamente no HTML e continuam navegáveis mesmo se o JavaScript ou Supabase falhar. O JavaScript também foi ajustado para não parar quando um botão opcional não existe.


## CORREÇÃO DO CHAT

1. Abra o Supabase.
2. Vá em SQL Editor.
3. Crie uma New query.
4. Copie TODO o conteúdo de `reparo_chat.sql`.
5. Clique em Run.
6. Substitua o `app.js` do GitHub pelo `app.js` desta versão.
7. Aguarde o GitHub Pages atualizar e teste com duas contas diferentes.

O novo app.js mostra na tela qualquer erro que vier do Supabase, em vez de falhar silenciosamente.


## Excluir publicação

Agora o dono de uma publicação vê o botão **Excluir publicação** ao abrir os detalhes do item.

Antes de testar, execute `permitir_excluir_publicacao.sql` no SQL Editor do Supabase.
A política RLS garante que um usuário autenticado só consiga excluir linhas da tabela `items` cujo `user_id` seja o próprio usuário.

Como `conversations.item_id` usa `ON DELETE CASCADE`, excluir o item também remove as conversas e mensagens relacionadas.


## Login com Google

Esta versão adiciona o botão **Continuar com Google** automaticamente em todas as páginas.

No Supabase:
- Authentication > Sign In / Providers > Google: habilite o Google e informe Client ID + Client Secret.
- Authentication > URL Configuration:
  - Site URL: `https://carlinz73.github.io/IXHEI/`
  - Redirect URL: `https://carlinz73.github.io/IXHEI/**`

No Google Cloud:
- URI autorizada de redirecionamento:
  `https://kcjfeanctyjxiiiackgo.supabase.co/auth/v1/callback`

Nunca coloque o Client Secret do Google no GitHub.


## Perfis e nomes de usuário

Execute `adicionar_perfis_nomes.sql` no SQL Editor do Supabase.

Com esta versão:
- Login Google usa automaticamente o nome da conta Google no primeiro acesso.
- Login por e-mail usa inicialmente a parte antes de `@` como nome.
- O usuário pode alterar o próprio nome em **Perfil**.
- As publicações mostram **Publicado por <nome>**.
- Outros usuários podem ver apenas o nome público; o e-mail não é salvo na tabela pública de perfis.


## Perfil Chefe / Administrador

1. Execute `adicionar_perfil_chefe.sql` no SQL Editor do Supabase.
2. Antes de executar, altere `SEU_EMAIL_AQUI` para o e-mail da conta que será o Chefe.
3. Entre novamente no IXHEI com essa conta.
4. O botão **Painel Chefe** aparecerá no menu.

O Chefe pode:
- editar qualquer publicação;
- excluir qualquer publicação;
- pesquisar publicações;
- alterar o nome público de usuários.

O cargo de administrador NÃO pode ser escolhido no cadastro comum.
As permissões também são verificadas no Supabase (RLS), não apenas no JavaScript.


## Login normal + Painel Chefe

Não existe uma segunda senha para abrir o painel.

O usuário entra normalmente no IXHEI com e-mail/senha ou Google. Se o perfil dele estiver com `role = 'admin'`, o botão **Painel Chefe** aparece automaticamente.

O painel agora possui:
- Publicações
- Usuários
- Conversas

A aba Conversas permite visualizar chats para fins de moderação.
