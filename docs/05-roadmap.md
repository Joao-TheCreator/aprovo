# 05 · Roadmap, épicos e estimativas

Estimativas para **1 dev full-stack** trabalhando com Claude Code, em dias úteis. Com 2 devs os
épicos 3, 4 e 5 correm em paralelo e o total cai para ~6 semanas.

## Resumo

| Fase | Épicos | Dias | Entrega |
|---|---|---|---|
| 0 · Fundação | E0 | 3 | Repo, CI, Postgres, R2, Auth.js, design system, deploy vazio |
| 1 · Perfil e feed | E1, E2 | 8 | Conectar @ e ver o feed simulado (Telas 01, 02) |
| 2 · Publicações | E3, E4 | 10 | Criar post/vídeo, upload, detalhe, edição (Telas 03, 04, 05) |
| 3 · Organização | E5 | 4 | Drag & drop, status, filtros (Tela 06) |
| 4 · Aprovação | E6, E7 | 8 | Link público, decisão, realtime, auditoria (Telas 05, 07) |
| 5 · Lançamento | E8 | 5 | PWA, e-mails, QA em dispositivos, piloto com 3 clientes |
| **Total** | | **38 dias ≈ 8 semanas** | |
| 6 · Publicação e link por pessoa | T1..T12 | 14 | Contas múltiplas, agendamento e publicação no Instagram, link único por destinatário (docs 12 e 13) |

## Épicos e tarefas

### E0 · Fundação (3 d) · concluído em 06/11/2026
- [x] `create-next-app` com TypeScript, App Router, Tailwind, ESLint, Prettier
- [x] shadcn/ui + tokens do design system (`docs/09-design-system.md`), Poppins, Lucide
- [x] Postgres gratuito (Neon) com branch de staging, Drizzle + drizzle-kit, primeira migration (users/auth, workspaces, members, profiles)
- [x] Auth.js (e-mail mágico via Resend + Google), middleware de proteção de rotas, criação do workspace
- [x] Bucket R2 `aprovo-media` com chave de API e CORS para upload direto
- [x] Logo do briefing (`assets/brand/aprovo-logo.png`) no header e no manifest
- [x] CI no GitHub Actions: lint, typecheck, vitest, build
- [ ] Deploy preview na Vercel (adiado: contas ainda não criadas)
- [x] Sentry (`SENTRY_DSN`), variáveis de ambiente documentadas em `.env.example`

### E1 · Integração Instagram (5 d) · concluído em 06/11/2026 (Graph API sem teste real: aguarda conta ponte)
- [x] Interface `InstagramProvider` (`fetchProfile`, `fetchMedia`)
- [x] Implementação Graph API Business Discovery com token da conta ponte (perfil do João convertido em Criador de conteúdo)
- [x] Fallback (provedor de scraping) atrás de feature flag: só o placeholder, sem scraping real
- [x] Importação manual (upload de imagens + formulário)
- [x] Cópia de avatar/miniaturas para o bucket `ig-cache`
- [x] Cache 24 h, botão "Atualizar feed", tratamento de erros amigável
- [x] Testes unitários do mapeamento de resposta → `imported_posts`
- [x] Conexão OAuth (Instagram Login) por workspace em Configurações › Instagram, token criptografado, refresh semanal por cron, caminho `/me/media` para a própria conta

### E2 · Perfil e feed simulado (3 d) · concluído em 06/11/2026
- [x] Tela 01 (formulário, estados, confirmação)
- [x] Componentes `ProfileHeader`, `ProfileTabs`, `FeedGrid`, `GridCell` (badges carrossel/vídeo)
- [x] Lista de perfis e navegação (barra inferior / sidebar)
- [x] Proporção da grade configurável (1:1 / 3:4)

### E3 · Mídia (5 d) · concluído em 06/11/2026
- [x] Upload direto com URL pré-assinada (PUT único com retry; multipart fica para depois), progresso, retry, limites (30 MB imagem, 300 MB e 90 s vídeo)
- [x] Route Handler de processamento com `sharp` (thumb 320 c/ crop, preview 1080, HEIC)
- [x] Captura de capa de vídeo no navegador + escolha de frame
- [x] Editor de enquadramento da miniatura (`grid_crop`) com arrastar + slider de zoom (pinça fica para depois)
- [x] Status do asset e dedup por sha256
- [x] Testes: pipeline de imagem com fixtures

### E4 · Publicações (5 d) · concluído em 06/11/2026
- [x] Folha "Adicionar" (Post / Vídeo) e seletor de mídias com tira reordenável
- [x] CRUD de `posts` + `post_media` (Server Actions + Zod)
- [x] Tela 05: legenda, hashtags em chips, data prevista, observações, mini prévia
- [x] Tela 04: detalhe ampliado (carrossel com swipe, player de vídeo)
- [x] Ações: salvar rascunho, arquivar, excluir, ocultar importado
- [x] `activity_log` básico (post.created, post.updated, post.sent)

### E5 · Organização do feed (4 d) · concluído em 06/11/2026
- [x] dnd-kit na grade (toque com pressão longa, autoscroll), ordem otimista + desfazer
- [x] `reorderPosts` em transação
- [x] Pílulas de status, filtros, "Modo cliente", multi-seleção
- [x] Alternativa acessível (mover para cima/baixo)

### E6 · Aprovação (6 d) · concluído em 06/11/2026
- [x] Tabelas `approval_*`, transação `decideApproval` com `NOTIFY`, Route Handler `/api/approval/[token]/decide`, rate limit (10 decisões/min por IP e por token)
- [x] Folha "Compartilhar link": escopo, título, recado, geração do token, copiar/WhatsApp/share
- [x] Página pública `/a/[token]` SSR com Open Graph, feed destacado, detalhe, decisões
- [x] `ApprovalBar`: nome do aprovador, comentário obrigatório em ajustes, "Aprovar todos"
- [x] Páginas de link expirado/revogado; revogar e regenerar link
- [x] Fluxo enviar → abrir link → aprovar → status atualizado validado com Playwright (script ainda fora do repo; suíte e2e automatizada fica para o lançamento)

### E7 · Retorno em tempo real e histórico (2 d) · concluído em 06/11/2026
- [x] SSE `/api/events` com `LISTEN/NOTIFY` do Postgres (fallback polling 5 s), toasts, invalidação do TanStack Query
- [x] Tela "Aprovações": envios, links, aberturas, decisões (data, hora, link, comentário)
- [x] Eventos de aprovação no `activity_log` e exibição no detalhe da publicação

### E8 · Lançamento (5 d) · parcial em 06/11/2026
- [x] PWA: manifest, ícones, splash, `display: standalone`, atualização de versão
- [x] Configurações da conta: "Excluir conta" (exigido pela política de privacidade e pela Meta) e exportação simples dos dados
- [x] E-mails Resend: link mágico customizado, "cliente decidiu"
- [ ] QA em iOS Safari, Android Chrome, desktop; performance (LCP da página pública)
- [ ] Revisar com advogado(a) e publicar Política de Privacidade, Termos de Uso e Instruções de exclusão de dados (rascunhos em `docs/legal/`); cadastrar as URLs no app da Meta
- [ ] Piloto com 3 perfis reais; ajustes
- [ ] Produção: subdomínio `vercel.app` (domínio próprio depois), backup do Postgres, revisão dos limites gratuitos; ao cobrar clientes, sair do Vercel Hobby

## Fase 6 · Publicação automática e link por pessoa (14 d) · planejada em 06/11/2026

Planos: `docs/12-agendamento-e-publicacao.md` (ADR-010) e `docs/13-link-unico-de-aprovacao.md`
(ADR-011). Decisões pendentes do João estão nas ADRs; as tarefas abaixo assumem as
recomendações e marcam onde uma decisão diferente muda o trabalho.

Regras para todas as tarefas (brief do subagente Sonnet):

- Ler `CLAUDE.md`, a seção do doc citada e os arquivos listados antes de começar. Sem `any`,
  Zod em toda entrada, acesso sempre por `requireWorkspaceMember`/`requireWorkspaceForProfile`.
- Textos de UI em português do Brasil; código e commits em inglês; um commit por tarefa
  (`feat(...)`, `fix(...)`), mensagem citando a tarefa ("T4").
- Toda tarefa termina com `pnpm check` verde (`lint`, `typecheck`, `vitest`). Testes de banco
  usam `DATABASE_URL_TEST` e o padrão de `tests/approvals/approvals.test.ts` (seed, mocks de
  `@/lib/auth/require`, truncate por teste).
- Chamadas à Meta sempre atrás de uma interface mockável; nenhum teste chama a rede.
- Nunca logar token, URL assinada ou token de aprovação claro. Pontos **[confirmar]** do doc 12
  que não puderem ser conferidos ficam anotados no doc, não inventados.
- Mudanças em schema, RLS, tokens ou integração com o Instagram voltam para revisão da sessão
  principal antes do push.

### T1 · Conexões múltiplas por workspace (1 d) · ADR-009
**Brief:** hoje `instagram_connections` tem índice único por `workspace_id` e todo o código
assume "a conexão do workspace". Permitir N conexões por workspace, uma por conta do Instagram.
- **Arquivos:** `db/schema/instagram.ts` (trocar `instagram_connections_workspace_uq` por único
  `(workspace_id, ig_user_id)`), migration via `pnpm db:generate`, `lib/instagram/oauth.ts`
  (`onConflictDoUpdate` passa a usar `(workspace_id, ig_user_id)`; `getConnection(workspaceId)`
  vira `listConnections(workspaceId)` e `getConnectionById(id, workspaceId)`),
  `lib/instagram/index.ts` (`getInstagramProviderForWorkspace` → `getInstagramProviderForConnection`),
  `app/(app)/configuracoes/page.tsx`, `DisconnectButton.tsx`, `actions.ts` (desconectar por id),
  `app/api/instagram/refresh/route.ts` (renova todas as conexões), `app/api/instagram/callback`.
- **UI (doc 12 §6.3):** lista de contas conectadas (avatar, @, tipo, "token válido até",
  permissões `Feed`/`Publicação` a partir de `scopes`), ações Reconectar e Desconectar por
  conta, botão "Conectar outra conta do Instagram".
- **Pronto quando:** duas contas diferentes conectam no mesmo workspace; reconectar a mesma
  conta atualiza a linha (não duplica); desconectar uma não afeta a outra; o cron renova as
  duas; nenhuma chamada antiga a "a conexão do workspace" sobrou (`grep` por
  `instagram_connections_workspace_uq`, `getConnection(`).
- **Testes:** `tests/instagram/connections.test.ts`: upsert por `(workspace, ig_user_id)`,
  listagem filtrada por workspace, desconexão por id só do próprio workspace, refresh percorre
  todas.

### T2 · Perfil criado a partir da conta conectada (1 d) · ADR-009
**Brief:** ao terminar o OAuth, criar (ou ligar) o perfil daquela conta e importar o feed com o
token dela. "Conectar perfil" passa a ser "Conectar conta do Instagram".
- **Arquivos:** `db/schema/profiles.ts` (`connection_id uuid` nulo → `instagram_connections`,
  `on delete set null`; `timezone text default 'America/Sao_Paulo'`), migration,
  `app/api/instagram/callback/route.ts` (após salvar a conexão: `findOrCreateProfileForConnection`,
  importa via `/me` + `/me/media`, redireciona para `/perfis/[id]`), `lib/profiles/*` (helper
  novo; `ig_username` do `/me`; `import_source = graph_api`, `account_type` da conta),
  `app/(app)/perfis/novo/page.tsx` e `app/(app)/perfis/page.tsx` (botão principal "Conectar
  conta do Instagram" → `/api/instagram/connect`; importação manual fica como link secundário),
  "Atualizar feed" usa `profiles.connection_id`.
- **Pronto quando:** conectar uma conta nova cria o perfil com cabeçalho e ≥ 1 post importado;
  conectar de novo a mesma conta reaproveita o perfil (único por `(workspace, ig_username)`);
  perfil manual continua funcionando com `connection_id` nulo; desconectar a conta mantém o
  perfil com aviso "conta desconectada" e botão Reconectar.
- **Testes:** `tests/profiles/from-connection.test.ts` com provider mockado: cria perfil,
  reaproveita por `ig_username`, importação usa o token da conexão certa (dois workspaces).

### T3 · Escopo de publicação e status da conexão (1 d) · doc 12 §6.1, §7
**Brief:** pedir `instagram_business_content_publish` atrás de flag e passar a registrar a saúde
de cada conexão.
- **Arquivos:** `lib/instagram/oauth.ts` (`SCOPES` dinâmico por `IG_PUBLISH_ENABLED`;
  `canPublish(connection)` = `scopes` contém o escopo), `db/schema/instagram.ts` (`status`
  enum `connection_status` `active|expired|revoked|not_professional|missing_scope`,
  `status_detail text`, `status_checked_at timestamptz`), migration,
  `app/api/instagram/refresh/route.ts` (além de renovar: `GET /me?fields=id,username,account_type`
  por conexão; `code 190` → `expired`; conta não profissional → `not_professional`; grava
  `status_checked_at`), `lib/instagram/graph.ts` (`classifyGraphError(status, body)` →
  `token_expired | not_professional | missing_scope | rate_limited | network | unknown`),
  Configurações (status por conta com as mensagens do doc 12 §7), `.env.example`
  (`IG_PUBLISH_ENABLED`), nova rota `app/api/instagram/deauthorize/route.ts` (recebe o POST
  `signed_request` da Meta e marca `revoked` **[confirmar formato]**; a página
  `app/legal/[slug]` de exclusão de dados continua só informativa; se não der para confirmar o
  formato, deixar o parser isolado e testado com um exemplo da documentação).
- **Pronto quando:** com a flag ligada o diálogo da Meta pede os dois escopos; com a flag
  desligada nada muda; `status` reflete `/me` após o cron; a tela mostra "Reconecte e autorize
  'Publicar conteúdo'" quando falta escopo.
- **Testes:** `tests/instagram/oauth.test.ts` (escopos por flag), `tests/instagram/status.test.ts`
  (classificação de erros com corpos de exemplo; refresh marca `expired` em 190), parser do
  `signed_request` com HMAC de teste.

### T4 · Schema de `publications` e máquina de estados (1 d) · doc 12 §2
**Brief:** criar a tabela e os enums, sem UI nem cron.
- **Arquivos:** `db/schema/publications.ts` (tabela da §2.1 completa, índices: único parcial
  `(post_id) where status in ('scheduled','publishing')`, `(status, next_attempt_at)`,
  `(profile_id, scheduled_at desc)`, único `ig_media_id` quando não nulo),
  `db/schema/enums.ts` (`publication_status`; `post_status` ganha `scheduled`, `published`,
  `publish_failed`), `db/schema/posts.ts` (`published_media_id text`), `db/schema/media.ts`
  (`publish_path text`), `db/schema/index.ts`, migration (atenção: `ALTER TYPE ... ADD VALUE`
  não roda em transação no Postgres; conferir como `db/migrate.ts` executa),
  `lib/publishing/contracts.ts` (tipos, `PUBLICATION_ERROR_MESSAGES`, Zod de agendar/reagendar),
  `lib/publishing/state.ts` (função pura `nextPostStatus(event)` da máquina de estados da §2.2),
  `lib/posts/*` (editar post `scheduled` cancela a publicação viva e volta para `draft`;
  `published` é terminal: não edita, não arquiva, não envia).
- **Pronto quando:** `pnpm db:generate` produz uma migration limpa; `tests/db/schema.test.ts`
  enxerga a tabela; inserir duas publicações vivas para o mesmo post falha; editar post
  `scheduled` cancela; editar `published` é recusado com mensagem.
- **Testes:** `tests/publishing/schema.test.ts` (constraints), `tests/publishing/state.test.ts`
  (transições válidas e inválidas), ajuste em `tests/posts/*` para os novos status.

### T5 · Preparação de mídia para publicação (1 d) · doc 12 §4.2
**Brief:** gerar o JPEG de publicação e a URL assinada, com validação antes de agendar.
- **Arquivos:** `lib/publishing/prepare.ts` (`validateForInstagram(post)` → lista de erros
  amigáveis: proporção 4:5–1.91:1, ≤ 8 MB após derivado, carrossel 2–10, vídeo MP4/MOV ≤ 1 GB
  **[confirmar limites]**; `ensurePublishDerivative(asset)` gera uma vez
  `publish/<workspace>/<asset>/publish.jpg` com `sharp` (JPEG q92, lado maior ≤ 1440, sem
  corte) e grava `publish_path`; `signedMediaUrl(asset, kind)` com TTL 2 h imagem / 4 h vídeo),
  `lib/publishing/caption.ts` (`buildCaption(caption, hashtags)` pura), `lib/storage/*` (nada
  novo; usa `getSignedUrl`). Reaproveitar `lib/media/process*` para o pipeline `sharp`.
- **Pronto quando:** PNG/HEIC/WebP viram JPEG uma única vez (segunda chamada não regrava);
  JPEG dentro das regras usa `original_path`; imagem 1:3 é recusada com a mensagem do doc;
  URL assinada nunca aparece em log nem no banco.
- **Testes:** `tests/publishing/prepare.test.ts` com fixtures de `tests/media` (PNG 1:1,
  JPEG 4:5, imagem 1:3, HEIC se a fixture existir), `tests/publishing/caption.test.ts` (sem
  hashtags, 30 hashtags, legenda vazia).

### T6 · Cliente da Content Publishing API (1 d) · doc 12 §3, §4.3, §4.4, §4.5
**Brief:** módulo isolado que fala com `graph.instagram.com`, sem banco e sem agendador.
- **Arquivos:** `lib/instagram/publish.ts` com interface `InstagramPublisher`
  (`createImageContainer`, `createVideoContainer` (Reel), `createCarouselItem`,
  `createCarouselContainer`, `getContainerStatus`, `publish(creationId)`, `getPublishingLimit`,
  `getMediaPermalink(igMediaId)`), implementação `GraphPublisher({ igUserId, accessToken })`
  com `fetch` + `AbortSignal.timeout(20_000)`, `lib/instagram/publish-errors.ts`
  (`classifyPublishError(status, body)` → códigos da tabela §4.5 + `retryable: boolean`;
  **9007 = IN_PROGRESS**), `FakePublisher` em `tests/publishing/fake-publisher.ts` para T7.
  Versão da API centralizada (`v21.0`, constante já existente em `graph.ts`).
- **Pronto quando:** cada método monta a chamada da tabela §4.3 (URL, campos, método) e nunca
  inclui o token em erros/logs (`sanitize` remove `access_token=`); classificação cobre 190, 10,
  200, 9, 4/17/32/613, 429, 36xxx, 5xx, timeout.
- **Testes:** `tests/publishing/publisher.test.ts` com `fetch` mockado: requests esperados por
  tipo de mídia, status `IN_PROGRESS/FINISHED/ERROR/EXPIRED/PUBLISHED`, classificação de erros,
  sanitização.

### T7 · Rota `/api/publishing/run` com claim `SKIP LOCKED` e retentativas (1,5 d) · doc 12 §4, §5
**Brief:** o agendador. Pega jobs vencidos, publica em série, classifica erros, reagenda.
- **Arquivos:** `app/api/publishing/run/route.ts` (`GET`, `maxDuration = 60`,
  `dynamic = "force-dynamic"`, auth por `CRON_SECRET` igual a `/api/instagram/refresh`,
  resposta `{ claimed, published, retried, failed, skipped }`, `captureMessage("scheduler lag")`
  quando há job com `next_attempt_at < now() - 15 min`), `proxy.ts` (adicionar ao `PUBLIC`),
  `lib/publishing/queue.ts` (`claimDue(limit, runId)` com o SQL da §5.3; `release(id, outcome)`),
  `lib/publishing/run.ts` (`runPublication(job, publisher)`: valida conexão `active` +
  `canPublish`, prepara mídia (T5), cria/reaproveita container, espera até 60 s em passos de
  15 s, consulta `PUBLISHED` antes de `media_publish` em retentativa, publica, grava
  `ig_media_id`/`permalink`, chama o pós-publicação de T9 (ou um hook vazio até T9)),
  `lib/publishing/backoff.ts` (`nextAttemptAt(attempts, code)` pura: 1/5/15/60/180 min;
  `daily_limit` → virada da janela ou +1 h), `vercel.json` (cron horário da mesma rota como rede
  de segurança), `lib/publishing/logger.ts` (log estruturado sem segredos).
- **Pronto quando:** dois `GET` concorrentes não processam o mesmo job (teste com duas
  transações); job abandonado (`locked_at` > 10 min) volta a ser elegível; erro definitivo não
  retenta e marca `publish_failed`; erro retentável respeita o backoff; `IN_PROGRESS` em vídeo
  libera o job com `container_id` guardado e `next_attempt_at = +2 min`; ao esgotar
  `max_attempts` vira `failed`; conexão fora de `active` falha na hora com `token_expired`.
- **Testes:** `tests/publishing/run.test.ts` com `FakePublisher` roteirizado (sucesso imagem,
  carrossel, vídeo em duas execuções, 190, 9, 429, `ERROR`, `EXPIRED`, `PUBLISHED` em
  retentativa), `tests/publishing/queue.test.ts` (claim concorrente, lock abandonado),
  `tests/publishing/backoff.test.ts`.

### T8 · UI de agendar, cancelar e reagendar (1,5 d) · doc 12 §2.2, §4.7, §5.5
**Brief:** a social media agenda um post aprovado e acompanha a lista "Agendadas".
- **Arquivos:** `lib/publishing/actions.ts` (Server Actions `schedulePublication`,
  `reschedulePublication`, `cancelPublication`, todas com Zod, `requireWorkspaceForProfile`,
  validação de T5 antes de gravar, conversão fuso → UTC com `profiles.timezone`, `activity_log`
  `publication.scheduled|rescheduled|cancelled`, aviso de limite diário via
  `getPublishingLimit` cacheado 10 min), `components/publishing/ScheduleSheet.tsx` (data e hora
  no fuso do perfil, texto "às 14:00 (Brasília)", erro de proporção na hora, aviso "Vídeo será
  publicado como Reel"), `components/publishing/ScheduledList.tsx` (aba/rota
  `/perfis/[id]/agendadas`: agendadas, publicadas, falhas com motivo e botão "Reagendar"),
  Tela 04/05 (botão "Agendar" só em `approved`; pílulas "Agendada" roxo-escuro, "Publicada"
  cinza, "Falhou" vermelho conforme `docs/09`), `app/(app)/configuracoes` (fuso padrão do
  workspace, "Avisar por e-mail quando publicar").
- **Pronto quando:** agendar um post aprovado cria a publicação viva e muda o status; reagendar
  atualiza a mesma linha; cancelar volta para `approved`; post com mídia fora da proporção não
  agenda e explica; tudo em ≤ 3 toques a partir do detalhe.
- **Testes:** `tests/publishing/actions.test.ts` (idempotência da publicação viva, fuso,
  recusa de `draft`/`pending_approval`, cancelamento, membro de outro workspace recebe
  `not_found`); e2e em T12.

### T9 · Pós-publicação, notificações e importação (1 d) · doc 12 §4.6, §5.5, §7
**Brief:** o que acontece depois de `media_publish` e quando a conexão quebra.
- **Arquivos:** `lib/publishing/after.ts` (`onPublished(publication)`: `posts.status =
  published`, `published_media_id`, `activity_log`, `notifyEvent` `post.status`, e-mail
  "Publicado" via novo template em `lib/email/send.ts`, dispara importação do perfil para
  criar o `imported_posts` com o `ig_media_id`; `onFailed(publication)`: e-mail "Não foi
  possível publicar" com o motivo amigável), `lib/instagram/*` (importação reconhece o
  `ig_media_id` já publicado e não duplica), `lib/realtime/events.ts` (`post.status` com
  `published|publish_failed` e `permalink`), toasts na grade, `app/api/instagram/refresh`
  (ao marcar conexão fora de `active`, falhar na hora todas as publicações vivas da conexão
  com `token_expired` e enviar um e-mail só), Configurações (botão "Reagendar as N publicações
  que falharam" ao reconectar), banner de conexão expirada no perfil.
- **Pronto quando:** publicação bem-sucedida aparece na grade como importada após o
  "Atualizar feed" e some dos planejados (decisão pendente 6 do doc 12: se o João preferir
  manter na grade com pílula, trocar aqui); falha definitiva gera e-mail e toast vermelho;
  conexão expirada derruba os agendamentos dela de uma vez.
- **Testes:** `tests/publishing/after.test.ts` (status, e-mail mockado, evento SSE, importação
  sem duplicar), `tests/instagram/refresh.test.ts` (falha em lote por conexão).

### T10 · Link por pessoa: schema, `resolveLink`, `decide`, página pública (1,5 d) · doc 13 §2, §3, §5, §6, §7
**Brief:** um token por destinatário, consumido ao decidir; links antigos seguem como `shared`.
- **Arquivos:** `db/schema/approvals.ts` (colunas da §2.2 em `approval_links`; tabela
  `approval_link_opens` da §2.3; índice único `(request_id, link_id, post_id)` em
  `approval_decisions`), `db/schema/enums.ts` (`approval_link_mode`,
  `approval_link_used_reason`), migration (com `update ... set mode = 'shared'` nas linhas
  existentes), `lib/approvals/contracts.ts` (`LinkState` + `used`; `recipients` no schema de
  criação, 1..5; mensagens `link_used`, `link_expired`, `link_revoked`; `linkUsed` e
  `recipientName` em `DecideResult`/`LiveEvent`), `lib/approvals/decide.ts` (`resolveLink` com
  precedência revoked → used → expired → active; `already` por link em `personal`;
  `derivePostStatus` pura com "ajustes prevalece" e regra "basta um" (decisão pendente 2:
  "todos precisam" muda só essa função); consumo do link na transação; `decideManyByToken`),
  `app/api/approval/[token]/decide/route.ts` (410 para `used/expired/revoked`) e nova
  `decide-all/route.ts`, `lib/approvals/actions.ts` (`createApprovalRequest` com
  `recipients`, `issuePersonalLink`), `lib/approvals/queries.ts` (`getPublicApproval` com
  `ip`/`userAgent`, grava `approval_link_opens`; estado `used` devolve itens com decisão),
  `app/a/[token]/page.tsx` (roteia por estado; `notFound()` para inexistente),
  `components/approvals/InactiveLinkCard.tsx` (`reason`), `PublicApprovalView`/`ApprovalBar`
  (`readOnly` = recibo, decisão pendente 1; "Decidindo como Carlos"; trata 410),
  `ShareLinkSheet.tsx` (destinatários, um bloco Copiar/WhatsApp por pessoa).
- **Pronto quando:** envio com 2 destinatários gera 2 URLs distintas; decidir o último item
  consome o link e a resposta traz `linkUsed: true`; abrir link usado mostra o recibo sem
  botões; link `shared` antigo continua decidindo como antes; um destinatário pedindo ajustes
  depois da aprovação do outro leva o post a `changes_requested`; token claro não aparece em
  banco nem log.
- **Testes:** ampliar `tests/approvals/approvals.test.ts`: consumo em 1 e N itens, parcial não
  consome, `decide-all` transacional, 410 por motivo, `derivePostStatus` (tabela da §5),
  `shared` inalterado, aberturas gravadas com IP/UA, índice único por link.

### T11 · Reabertura, auditoria e lista por pessoa (1 d) · doc 13 §4, §7.3, §7.4, §8
**Brief:** a social media reabre um envio gerando links novos e vê quem abriu/decidiu.
- **Arquivos:** `lib/approvals/actions.ts` (`reopenApprovalRequest(requestId, { postIds,
  recipients })`: transação com `sent_for_approval_at = now()`, posts → `pending_approval`,
  envio → `open`/`partially_decided`, links antigos da mesma pessoa → `superseded` +
  `superseded_by_link_id`, novos links, `activity_log` `approval.reopened` e
  `approval.link_issued`), `lib/approvals/queries.ts` (`ApprovalLinkSummary` com `mode`,
  `recipientName`, `usedAt`, `usedReason`, últimas 20 aberturas, decisões por link; `decidedViaLink`
  → `recipientName`; rodadas por `sent_for_approval_at`), `components/approvals/ApprovalRequestCard.tsx`
  (links por destinatário com estado, aberturas "abriu 3× · última 06/11 14:20", botão
  **Reabrir** → folha com itens pré-selecionados (decisão pendente 7) e destinatários),
  `app/api/instagram/refresh` ou job semanal (expurgo de `approval_link_opens` > 90 dias),
  detalhe do post (histórico de rodadas).
- **Pronto quando:** reabrir um envio `decided` aceita nova decisão pelo link novo e recusa o
  antigo com `link_used`; a lista mostra por pessoa estado, aberturas e decisões; expurgo
  remove só aberturas antigas; e-mail "cliente decidiu" usa o nome do destinatário.
- **Testes:** `tests/approvals/reopen.test.ts` (link antigo 410, novo aceita, `sent_for_approval_at`
  bumpado só nos itens reabertos, rodadas na query, expurgo), ajuste nos testes de listagem.

### T12 · App Review e e2e (1,5 d) · doc 12 §6.2, doc 04 Tela 07
**Brief:** preparar o material do App Review da permissão de publicação e automatizar o fluxo
ponta a ponta no repo.
- **Arquivos:** `docs/10-deploy-e-meta.md` (seção "App Review: `instagram_business_content_publish`"
  com passo a passo no painel, textos em inglês da descrição de uso, roteiro do screencast
  conectar → aprovar → agendar → publicar, checklist de verificação do negócio **[confirmar]** e
  o problema da "URL de instruções de exclusão de dados" do doc 11), `tests/e2e/` com Playwright
  (`playwright.config.ts`, `pnpm e2e`; cenários: enviar para aprovação com 2 destinatários →
  abrir link → aprovar todos → link vira recibo → agendar → `GET /api/publishing/run` com
  `FakePublisher` injetado por `IG_PUBLISHER=fake` → post `published` na grade; e: conexão
  expirada → agendamento falha → reconectar → reagendar), CI (`.github/workflows`) rodando o e2e
  contra o banco de teste, `README` (como rodar).
- **Pronto quando:** `pnpm e2e` passa local e no CI; o doc 10 tem tudo que o João precisa para
  submeter o App Review sem perguntar; nenhum teste depende da rede da Meta.
- **Testes:** os próprios e2e; smoke de `/api/publishing/run` sem `CRON_SECRET` → 401.

**Ordem e dependências:** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9; T10 → T11 só dependem
da fase 4 e podem correr em paralelo a partir de T4; T12 por último. Antes de T7 ir para
produção, o João escolhe o disparador do cron (ADR-010) e configura o Worker ou o Vercel Pro.

## Marcos de demonstração

| Marco | Quando | O que mostrar |
|---|---|---|
| M1 | fim da fase 1 | Digitar @ e ver o feed do cliente no celular |
| M2 | fim da fase 2 | Adicionar carrossel e vídeo, ver na grade e no detalhe |
| M3 | fim da fase 3 | Arrastar e reorganizar com status |
| M4 | fim da fase 4 | Mandar link pelo WhatsApp e ver a aprovação chegar ao vivo |
| M5 | fim da fase 5 | App instalado na tela inicial, piloto rodando |
| M6 | fim da fase 6 | Cliente aprova pelo link dele, o post é publicado sozinho no horário e aparece na grade como importado |

## Etapas futuras (fora da primeira etapa)

1. **Calendário completo** (visão mês/semana, arrastar entre datas).
2. **Publicação e agendamento no Instagram** via Instagram Login do cliente + Content Publishing
   API (requer App Review na Meta e conta profissional do cliente). **Planejada como Fase 6**
   (docs 12 e 13).
   2b. **APK / Play Store** se o PWA mostrar limitação (Capacitor ou Trusted Web Activity).
3. Stories e destaques; informações de perfil editáveis na simulação.
4. Comentários em thread no link e marcação na imagem.
5. Notificações push (Web Push) e WhatsApp (API oficial).
6. Planos e cobrança (Stripe), limites por workspace, membros com papéis.
7. Outras redes.
