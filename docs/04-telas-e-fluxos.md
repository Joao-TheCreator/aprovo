# 04 · Telas e fluxos

Numeração igual à do briefing. Cada tela lista: objetivo, elementos, estados, regras e critérios
de aceite. Padrões de interação seguem o MyFeed (ver `docs/06-referencia-myfeed.md`).

## Mapa de rotas

| Rota | Tela | Acesso |
|---|---|---|
| `/entrar` | Login (e-mail mágico / Google) | público |
| `/perfis` | Lista de perfis conectados | autenticado |
| `/perfis/novo` | Tela 01 · Conectar perfil | autenticado |
| `/perfis/[id]` | Tela 02/06 · Perfil e feed | autenticado |
| `/perfis/[id]/posts/novo` | Tela 03/04 · Adicionar publicação | autenticado |
| `/perfis/[id]/posts/[postId]` | Tela 04 · Detalhe ampliado | autenticado |
| `/perfis/[id]/posts/[postId]/editar` | Tela 05 · Edição | autenticado |
| `/perfis/[id]/aprovacoes` | Lista de envios e links | autenticado |
| `/a/[token]` | Página de aprovação do cliente | público por link |

## Navegação

- **Mobile:** barra inferior com 3 itens: Perfis · Feed (perfil atual) · Aprovações. Botão
  flutuante "+" no feed abre a folha "Adicionar".
- **Desktop:** sidebar esquerda com os mesmos itens; o feed fica centralizado com largura máxima
  de 430 px para preservar a proporção do celular.

---

## Tela 00 · Login e lista de perfis

- Login por e-mail (link mágico) ou Google. Primeiro acesso cria `workspace` + `member owner`.
- Lista de perfis: avatar, @, contadores de publicações por status (ex.: "2 aguardando").
  Estado vazio leva à Tela 01.

**Aceite:** novo usuário chega ao feed de um perfil em até 3 passos (login → conectar → feed).

---

## Tela 01 · Conectar perfil do Instagram

**Objetivo:** adicionar o perfil público do cliente digitando o @.

**Elementos**
- Campo `@` com teclado sem autocapitalização, validação em tempo real.
- Texto de apoio: "Apenas contas públicas. Não pedimos a senha do cliente."
- Botão "Continuar" (desabilitado até @ válido).

**Estados**
1. Digitando.
2. Importando (skeleton do cabeçalho + grade cinza, 3–10 s).
3. Sucesso: mostra cabeçalho importado e pede confirmação "É este perfil?".
4. Conta pessoal/privada ou falha: mensagem clara + opções "Tentar de novo", "Importar
   manualmente" (upload de até 12 imagens e preenchimento de nome/bio) ou "Continuar sem feed".

**Regras**
- Mesmo @ não pode ser conectado duas vezes no mesmo workspace.
- Importação guarda cópia local do avatar e das miniaturas.

**Aceite:** conta business pública aparece com nome, bio, contadores e ≥ 12 posts em < 15 s.

---

## Tela 02 · Visualização do perfil e feed

**Objetivo:** a tela principal. Mostrar como o feed está e como ficará.

**Elementos (fiel ao Instagram)**
- Cabeçalho: avatar, nome, contadores (posts, seguidores, seguindo), bio, link, botões
  decorativos "Seguir / Mensagem" (sem ação), bolhas de destaques (decorativas no MVP).
- Abas: Grade (ativa), Reels, Marcados (decorativas no MVP).
- Grade 3 colunas, proporção das células igual ao Instagram atual (o Instagram mudou o grid de
  1:1 para 3:4 em 2025; configurável por perfil: `profiles.grid_ratio = '1:1' | '3:4'`).
- Ícones nas células: carrossel (quadrados sobrepostos), vídeo (play).
- Células dos posts **planejados** têm uma **borda/pílula de status** com as cores do APROVO:
  - Rascunho: branco com borda `--aprovo-borda`
  - Aguardando aprovação: roxo apoio `#9B3CFF`
  - Aprovada: verde `#22E688`
  - Ajustes solicitados: lavanda `#EDE7FF` com texto roxo
- Botão flutuante "+" (roxo principal) e botão "Atualizar feed" no menu do cabeçalho.
- Chip no topo da grade: "Modo cliente" (esconde pílulas de status para ver como o cliente vê).

**Estados:** carregando (skeleton), vazio (só importados), com planejados, erro de importação
(banner com "tentar de novo").

**Aceite:** a grade do APROVO e a do Instagram real têm a mesma ordem para os importados.

---

## Tela 03 · Adicionar nova publicação

**Objetivo:** escolher o tipo e as mídias.

**Fluxo**
1. Toque no "+" abre folha inferior "Adicionar" com **duas** opções: **Post** (foto ou carrossel)
   e **Vídeo**. (Os demais itens do menu do Instagram ficam fora do MVP.)
2. Abre o seletor nativo do celular (`<input type="file" accept="image/*" multiple>` ou
   `accept="video/*"`). No desktop, drag & drop na área.
3. Pré-visualização em tira horizontal com a ordem das mídias; arrastar para reordenar; "x"
   para remover; "+" para adicionar mais (máximo 10 em carrossel, 1 em vídeo).
4. Upload começa imediatamente em segundo plano, com barra de progresso por mídia.
5. "Avançar" vai para a Tela 05 (edição) já com as mídias.

**Regras**
- Imagem: jpg, png, heic, webp, até 30 MB. Vídeo: mp4, mov, até 300 MB e 90 s (limite de Reels
  no feed é maior, mas 90 s cobre o uso comum; configurável).
- Vídeo gera a capa a partir do primeiro frame; o usuário pode arrastar o scrubber para escolher.
- Enquanto uma mídia está em `processing`, o botão "Enviar para aprovação" fica desabilitado;
  "Salvar rascunho" fica liberado.

**Aceite:** 5 fotos de 4 MB do celular ficam prontas na grade em < 20 s em 4G.

---

## Tela 04 · Seleção/organização dos arquivos e Detalhes da publicação

**Organização dos arquivos**
- Para cada mídia, ajuste do enquadramento da miniatura (arrastar a imagem dentro da célula da
  grade, pinça para zoom). Salva `grid_crop`. A mídia completa não é cortada.
- Barra de ações da publicação (ícones do briefing): Compartilhar link · Detalhes · Ver ·
  Arquivar (`archived_at`, some da grade, reversível) · Excluir.

**Detalhes da publicação (ampliado)**
- Ao tocar numa célula da grade abre a visualização ampliada igual ao post do Instagram:
  cabeçalho com avatar e @, mídia em proporção original (swipe no carrossel, play no vídeo),
  ícones de ação decorativos, legenda com "mais", hashtags, data prevista.
- Para planejados: pílula de status, último comentário do cliente (se houver), botões
  "Editar", "Enviar para aprovação" / "Copiar link", "Excluir".
- Para importados: permalink "Abrir no Instagram" e opção "Ocultar da grade".

**Aceite:** carrossel de 10 imagens abre em < 1 s a partir da grade (prévias 1080 px).

---

## Tela 05 · Edição da publicação e compartilhar link

**Formulário**
- Prévia da mídia (tira) com atalho para a Tela 04.
- Legenda (textarea, contador 0/2200, emoji nativo).
- Hashtags (chips; cola uma lista e separa por espaço/vírgula; máximo 30).
- "Data prevista" (date-time picker simples; sem calendário completo).
- Observações internas (não aparecem para o cliente).
- Prévia "Como fica no feed": mini grade 3×3 com a nova publicação na posição atual.

**Ações (no lugar do "Publicar no Instagram")**
- **Salvar rascunho** (secundário, lavanda).
- **Enviar para aprovação** (primário, roxo). Abre a folha "Compartilhar link":
  - Escolher escopo: só esta publicação ou "incluir outras pendentes" (checkboxes).
  - Título e recado opcionais.
  - Gera o link; botões "Copiar", "WhatsApp" (`https://wa.me/?text=`), "Compartilhar"
    (Web Share API).
  - Mostra validade (30 dias) e rótulo do link.

**Regras**
- Salvar com mídia ainda processando é permitido como rascunho.
- Enviar exige ≥ 1 mídia `ready`.
- Editar uma publicação aprovada avisa: "Isso vai exigir nova aprovação".

**Aceite:** do "Enviar para aprovação" ao link copiado em ≤ 3 toques.

---

## Tela 06 · Feed organizado com os novos conteúdos

- Publicações planejadas aparecem na grade nas primeiras posições (o Instagram mostra o mais
  novo no topo).
- **Arrastar e soltar** (pressionar e segurar no celular) reordena entre os planejados; a grade
  reflui na hora e salva ao soltar (otimista, com desfazer por 5 s).
- Filtro por status (chips: Todos · Rascunho · Aguardando · Aprovada · Ajustes).
- Multi-seleção (pressão longa) para "Enviar para aprovação" em lote ou excluir.

**Aceite:** reordenar 10 itens não gera mais de uma requisição e a ordem persiste após recarregar.

---

## Tela 07 · Retorno da aprovação

**Página pública `/a/[token]` (lado do cliente)**
- Cabeçalho do APROVO (logo, "Fulano enviou N publicações para sua aprovação").
- Feed simulado do perfil com os itens do envio destacados; toque abre o detalhe ampliado.
- Para cada item: **Aprovar** (verde) · **Pedir ajustes** (lavanda) com campo de comentário
  obrigatório. Campo "Seu nome" opcional, lembrado no dispositivo.
- Botão "Aprovar todos" quando há mais de um item.
- Após decidir: confirmação "Aprovado em 06/11/2026 às 14:32" e o item fica travado; pode
  reabrir só se o social media reenviar.
- Link expirado/revogado: página amigável "Este link não está mais ativo. Peça um novo ao seu
  social media."

**Lado do social media**
- Status muda em tempo real na grade (Realtime) com toast "Carlos aprovou 'Post da coxinha'".
- Lista de aprovações: envios, links, quem abriu, decisões com data/hora/link.
- Comentário de ajustes aparece no detalhe e na edição.

**Aceite:** decisão do cliente aparece na grade do social media em < 3 s sem recarregar; o
registro guarda data, hora, link e comentário.

---

## Estados de erro e vazios (transversal)

| Situação | Comportamento |
|---|---|
| Sem internet no celular | Banner offline; rascunhos de legenda ficam no `localStorage` |
| Falha no upload | Item em vermelho com "Tentar de novo"; demais seguem |
| Instagram indisponível | Perfil continua usável com último snapshot; aviso de "feed de X dias atrás" |
| Token de link inválido | Página 404 amigável |

## Acessibilidade

- Alvos de toque ≥ 44 px, contraste AA nas pílulas de status (texto escuro no verde).
- Drag & drop com alternativa por botões "mover para cima/baixo" no menu da célula.
- Foco visível e rótulos em todos os ícones.
