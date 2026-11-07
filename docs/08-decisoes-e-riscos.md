# 08 · Decisões de arquitetura (ADRs) e riscos

Decisões revisadas com o João em 06/11/2026. Cada ADR traz a decisão, o que o João definiu e
as consequências.

## Decisões

### ADR-001 · Web app PWA primeiro; APK como plano B
**Contexto:** briefing pede mobile-first e aprovação sem conta; equipe pequena.
**Decisão do João:** web app é o caminho mais fácil; se der problema, empacotar como APK para
distribuição direta até publicar na Play Store.
**Como fazemos:** Next.js como PWA instalável. O mesmo código pode ser empacotado como APK com
Capacitor (WebView + plugins nativos de galeria/arquivos) ou Trusted Web Activity (abre o PWA
dentro de um app Android). O gatilho para o APK é uma limitação concreta do PWA no piloto:
galeria, vídeo grande, notificações ou instalação no iOS.
**Consequências:** sem loja de apps no início; link universal funciona em qualquer celular; a
arquitetura não muda se o APK for necessário.

### ADR-002 · Engine própria e portável, em tiers gratuitos
**Contexto:** a proposta inicial usava Supabase (Auth + Storage + Realtime + Postgres) só por
custo e velocidade.
**Decisão do João:** não ficar refém do Supabase; o objetivo é custo baixo (grátis).
**Como fazemos:** cada peça em padrão aberto, hoje gratuita, trocável por configuração:
- Banco: Postgres padrão no **Neon free** (0,5 GB) via Drizzle; migrations no repo.
- Autenticação: **Auth.js** dentro do app (link mágico por e-mail via Resend + Google); sessões
  no Postgres.
- Mídia: **Cloudflare R2** pela API S3 (10 GB grátis, sem taxa de saída); qualquer S3 serve.
- Tempo real: **SSE** em Route Handler com `LISTEN/NOTIFY` do Postgres; fallback polling.
- Hospedagem: **Vercel Hobby** (grátis) em subdomínio `vercel.app`, sem domínio próprio por
  enquanto. O Hobby proíbe uso comercial: ao cobrar clientes, migrar para Pro (US$ 20/mês) ou
  Cloudflare Workers (grátis mesmo comercial).
**Custo do piloto: R$ 0.**
**Consequências:** um pouco mais de código próprio (auth, SSE, upload S3) em troca de zero
lock-in; RLS do Supabase sai e a autorização fica na aplicação (`requireWorkspaceMember`).

### ADR-003 · Business Discovery como fonte do feed importado
**Contexto:** Basic Display API acabou; o briefing pede "só o @, contas públicas".
**Decisão do João:** ok; refinar conforme o MVP/piloto mostrar.
**Como fazemos:** Graph API com token de uma conta ponte profissional (ver dependências);
importação manual sempre disponível; provedor de scraping atrás de flag, desligado.
**Consequências:** contas pessoais não importam automaticamente; medir no piloto quantos
clientes são profissionais antes de decidir sobre o fallback pago.

### ADR-004 · Originais imutáveis, derivados gerados no servidor
**Contexto:** briefing exige preservar a qualidade dos arquivos e gerar prévias adequadas.
**Pergunta do João:** como seria melhor isso?
**Como fazemos:**
1. O arquivo escolhido na galeria sobe **direto para o R2, sem recompressão** no navegador
   (upload pré-assinado; vídeo em multipart). Aceitamos HEIC do iPhone e convertemos no servidor,
   guardando o HEIC original.
2. O servidor gera os **derivados** com `sharp`: miniatura de 320 px já com o corte da grade e
   prévia de 1080 px em WebP; para vídeo, capa (frame escolhido) nos mesmos tamanhos.
3. A interface **só usa derivados** (grade, detalhe, página do cliente). O original só sai do
   bucket em "Baixar original" e, no futuro, na publicação no Instagram.
4. **Dedup** por SHA-256: a mesma foto enviada duas vezes ocupa espaço uma vez.
5. **Custo:** R2 dá 10 GB grátis; 1 GB ≈ 250 fotos de 4 MB ou ≈ 10 vídeos de 100 MB. Acima,
   US$ 0,015 por GB/mês, sem cobrança de download.
6. **Retenção:** originais podem ser expurgados X dias após a publicação aprovada (configurável,
   com aviso na interface), mantendo os derivados para o histórico. Decidir o X no piloto.
**Alternativa descartada:** comprimir no navegador antes do upload. Economiza storage, mas perde
qualidade e contraria o briefing.
**Consequências:** storage é o único custo que cresce com o uso; limites de 30 MB por imagem e
300 MB / 90 s por vídeo seguram o pior caso.

### ADR-005 · Link de aprovação aberto, com token aleatório hasheado
**Decisão do João:** mantida.
**Como fazemos:** token de 256 bits, guardado como hash, expira em 30 dias, revogável; a decisão
registra link, data/hora, IP, user agent, nome opcional e comentário.
**Consequências:** sem senha, sem conta; quem tem o link decide. PIN opcional fica para o
futuro se o piloto pedir.

### ADR-006 · Decisão por publicação, não só por conjunto
**Decisão do João:** ok.
**Consequências:** o conjunto deriva o status; UI tem "Aprovar todos".

### ADR-007 · Planejados ficam no topo da grade
**Decisão do João:** sem objeção.
**Consequências:** fiel ao Instagram (novo em cima); ancoragem entre importados fica para
etapa futura.

### ADR-008 · Conexão do Instagram via Login do Facebook (06/11/2026)
**Contexto:** a validação em produção mostrou que a API do Instagram **com Login do Instagram**
(`graph.instagram.com`) não expõe `business_discovery`: a Graph API responde
`Tried accessing nonexisting field (business_discovery)` (code 100). Com ela só o feed da
própria conta conectada carrega; o fluxo central do produto (digitar o @ do cliente) não
funciona. Business Discovery existe apenas na API **com Login do Facebook**
(`graph.facebook.com`), que exige a conta profissional ligada a uma Página do Facebook.
**Decisão do João:** migrar para Login do Facebook.
**Como fazemos:**
- OAuth em `https://www.facebook.com/v21.0/dialog/oauth` com escopos `instagram_basic`,
  `pages_show_list`, `pages_read_engagement` (ou `config_id` de "Login do Facebook para
  Empresas" quando `META_FB_CONFIG_ID` estiver definido).
- Troca do `code` em `graph.facebook.com/v21.0/oauth/access_token`; depois
  `grant_type=fb_exchange_token` para o token de usuário de longa duração (60 dias).
- A conta do Instagram vem de `/me/accounts?fields=instagram_business_account{...}`; a
  primeira Página com `instagram_business_account` é usada. Sem Página ligada, o callback
  devolve o erro `no_instagram_page` com orientação na tela.
- O cron semanal renova o token repetindo `fb_exchange_token` com o token atual.
- A tabela `instagram_connections` ganha a coluna `provider` (`instagram` | `facebook`).
  Conexões antigas continuam lendo só a própria conta em `graph.instagram.com` até o usuário
  reconectar; a tela de Configurações pede a reconexão.
- Variáveis novas: `META_FB_APP_ID`, `META_FB_APP_SECRET`, `META_FB_CONFIG_ID` (opcional).
  `META_APP_ID`/`META_APP_SECRET` (Instagram Login) ficam como legado.
**Alternativas descartadas:** manter Instagram Login só com importação manual (perde a
automação do fluxo principal); cada cliente autorizar o app (sem convite de workspace no MVP);
provedor de scraping (ADR-003: desligado por decisão do João).
**Consequências:** cada social media precisa de uma Página do Facebook ligada ao Instagram
profissional dela (gratuito, feito no Instagram em Configurações › Contas vinculadas). App
Review passa a cobrir `instagram_basic` e `pages_*` quando sair do modo de desenvolvimento.
**Revisão em 06/11/2026 (ADR-009):** o Login do Facebook foi implementado e validado até a
concessão de ativos, mas deixou de ser o padrão; fica disponível com `META_OAUTH_PROVIDER=facebook`.

### ADR-009 · Feeds só de contas conectadas; Login do Instagram como padrão (06/11/2026)
**Contexto:** ao validar o Login do Facebook em produção ficou claro o atrito do modelo
"digitar o @ de qualquer conta": Página do Facebook obrigatória, seleção de ativos no diálogo,
App Review de permissões de Página. Ao mesmo tempo, o João definiu que o APROVO vai **publicar
sozinho** no feed do cliente após a aprovação, na data e hora marcadas, o que exige de qualquer
forma a autorização da conta do cliente.
**Decisão do João:** o APROVO mostra só os feeds das contas que a pessoa conectou com login.
Esse é o padrão; Business Discovery deixa de ser necessário.
**Como fazemos:**
- Login do Instagram (`graph.instagram.com`, `instagram_business_basic`) é o padrão
  (`META_OAUTH_PROVIDER=instagram`). Não exige Página do Facebook. Login do Facebook continua
  implementado como opção.
- Um workspace passa a ter **várias conexões**, uma por conta do Instagram (hoje é uma por
  workspace). Cada conta conectada vira um perfil (Tela 00) automaticamente; "Conectar perfil"
  passa a ser "Conectar conta do Instagram". A importação manual continua como exceção.
- O feed de cada perfil vem de `/me` e `/me/media` com o token daquela conta.
- Publicação automática após aprovação (fase seguinte): escopo
  `instagram_business_content_publish`, agendador no servidor (cron + fila), e App Review
  antes de abrir para contas sem papel no app.
**Alternativas descartadas:** Business Discovery com conta ponte (ADR-003; limitado a contas
profissionais públicas e sem caminho para publicar); scraping (ADR-003).
**Consequências:** o cliente (ou a social media com acesso à conta) autoriza o app uma vez por
conta; contas pessoais não conectam (limitação da Meta). A conta ponte deixa de existir.
Pendente de implementação: conexões múltiplas, perfil a partir da conexão, publicação.

### ADR-010 · Agendamento e publicação automática no Instagram (06/11/2026)
**Contexto:** a ADR-009 definiu que o APROVO publica sozinho no feed do cliente depois da
aprovação. O plano completo está em `docs/12-agendamento-e-publicacao.md`; esta ADR resume o
que foi decidido e o que ainda falta decidir.
**Decisão do João:** publicar automaticamente na data e hora marcadas, com o token da própria
conta conectada (Login do Instagram, escopo `instagram_business_content_publish`).
**Como fazemos:**
- Nova tabela `publications` (uma publicação viva por post, índice único parcial), com
  `scheduled_at` em UTC + `timezone` IANA, `attempts`/`next_attempt_at`, lock por post
  (`locked_at`/`locked_by`), `container_id` reaproveitado entre tentativas e erro classificado
  (`last_error_code`). `posts.status` ganha `scheduled`, `published`, `publish_failed`.
- Mídia: imagem vai como JPEG (original quando já serve; senão derivado `publish/` gerado com
  `sharp`, sem corte); vídeo vai como Reel (`share_to_feed=true`) com o original. Proporção fora
  de 4:5–1.91:1 é recusada **na tela**, antes de agendar. URL assinada do R2 com TTL curto,
  nunca persistida **[confirmar que a Meta aceita query string; plano B é um proxy público com
  token HMAC]**.
- Content Publishing API em `graph.instagram.com/v21.0`: `POST /media` → esperar `FINISHED` →
  `POST /media_publish`; carrossel via `is_carousel_item` + container `CAROUSEL`.
- Agendador: rota `GET /api/publishing/run` protegida por `CRON_SECRET`, claim atômico com
  `for update skip locked` (até 5 jobs por execução, 60 s), backoff 1/5/15/60/180 min, erros
  definitivos (`token_expired`, `not_professional`, `missing_scope`, `media_rejected`) nunca
  retentam. Antes de `media_publish` numa retentativa, consulta o container para não publicar
  duas vezes.
- Disparo: **Decisão do João: pendente** entre Cloudflare Worker gratuito a cada minuto
  (recomendado agora) e Vercel Pro (US$ 20/mês). A rota é idempotente, então os dois podem
  coexistir.
- Conexão: `instagram_connections.status` (`active, expired, revoked, not_professional,
  missing_scope`); o cron semanal passa a verificar saúde com `/me`; agendamentos de conexão
  fora de `active` falham na hora com aviso para reconectar; reconectar oferece "Reagendar as N
  que falharam".
- Escopo de publicação pedido só com `IG_PUBLISH_ENABLED=true`; conexões antigas (só `basic`)
  precisam reconectar para publicar.
- Pós-publicação: post vira `published`, e-mail e toast, e entra na grade pelo caminho normal de
  importação (`imported_posts` com o `ig_media_id`).
- App Review da permissão de publicação (screencast, verificação do negócio **[confirmar]**)
  antes de abrir para contas sem papel no app; até lá só os testadores do app publicam.
**Alternativas descartadas:** publicar via conta ponte (não existe mais, ADR-009); cron da Vercel
Hobby (uma vez ao dia, sem precisão de minuto); fila externa (Upstash, SQS) antes de ter
volume, porque o Postgres com `skip locked` resolve o piloto sem serviço novo.
**Consequências:** publicação é uma ação em nome do cliente: os Termos de Uso precisam de
cláusula de mandato (E8); a conta de teste precisa continuar profissional; publicações de
testadores vão para o Instagram de verdade. Custo continua R$ 0 até o App Review.
**Decisão do João: pendente** nas perguntas da seção 9 do doc 12: disparador do cron; agendar
ao aprovar ou com toque explícito (recomendado: explícito); quem agenda (recomendado: só a
social media); vídeo sempre como Reel e o limite de 90 s; primeiro comentário automático;
destino do post publicado; retenção de originais após publicar; CNPJ para o portfólio
empresarial da Meta; conta de teste para publicar de verdade; aviso por WhatsApp em falha; teto
próprio de agendamentos por dia.

### ADR-011 · Link de aprovação único por pessoa (06/11/2026)
**Contexto:** a ADR-005 definiu um link por envio, compartilhável, válido por 30 dias. No uso
real o mesmo link circula no WhatsApp, continua aberto depois da decisão e não diz quem decidiu
além do nome digitado. O plano completo está em `docs/13-link-unico-de-aprovacao.md`.
**Decisão do João:** um link por destinatário, que expira ao registrar a decisão; reabrir
exige a social media gerar link novo. Detalhes marcados abaixo seguem pendentes.
**Como fazemos:**
- `approval_links.mode` (`shared` | `personal`), `recipient_name` (obrigatório em `personal`),
  `recipient_contact` (só para a social media), `used_at`/`used_reason` (`decided` |
  `superseded`), `superseded_by_link_id`. Novos links nascem `personal`; os existentes viram
  `shared` e seguem como hoje até expirar ou serem revogados. Teto de 30 dias mantido.
- O link `personal` se consome quando **todos os itens do envio** têm decisão por aquele link
  (1 item = primeira decisão). Parcial abandonado continua vivo até os 30 dias.
- Reabrir reaproveita o `approval_request`, bumpa `posts.sent_for_approval_at` (regra que
  `decide.ts` já aplica), marca o link antigo da pessoa como `superseded` e emite um novo.
- Vários destinatários: uma decisão por link por item (índice único); **ajustes solicitados
  prevalece** sobre aprovação.
- Auditoria: `approval_decisions` já guarda link, data/hora, IP e user agent; nova tabela
  `approval_link_opens` (quando, IP, user agent, 90 dias de retenção) e evento
  `approval.reopened`.
- Token: `token.ts` não muda. `decide.ts` ganha o estado `used`, a checagem por link e a
  derivação de status; `actions.ts` recebe destinatários e ganha `reopenApprovalRequest`;
  `app/a/[token]` roteia `used`/`expired`/`revoked` com mensagens distintas.
**Alternativas descartadas:** PIN no link (atrito para o cliente; não resolve "quem decidiu");
conta para o cliente (contraria o briefing); expirar por tempo curto (horas) em vez de por uso
(o cliente abre quando pode).
**Consequências:** a folha "Compartilhar link" passa a pedir o nome de cada pessoa; a lista de
aprovações mostra por pessoa quem abriu e decidiu; um link encaminhado a terceiros depois da
decisão não permite decidir de novo. R6 cai de "Baixa" para "Muito baixa" no período pós-decisão.
**Decisão do João: pendente** (perguntas da seção 10 do doc 13):
1. Link usado mostra recibo somente leitura (recomendado) ou mensagem genérica?
2. Vários destinatários sem ajustes: basta uma aprovação (recomendado) ou todos precisam aprovar?
3. Link aberto (`shared`) continua como opção para grupos ou só para links antigos?
4. Esconder o campo "Seu nome" e usar o nome do destinatário, ou manter editável?
5. Parcial abandonado: vivo até 30 dias (recomendado) ou encerra após N dias sem atividade?
6. Retenção de IP/user agent das aberturas: 90 dias?
7. Reabrir seleciona por padrão só itens com ajustes/editados, ou o envio inteiro?

## Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Business Discovery não cobre contas pessoais ou muda de regra | Alta | Alto | Importação manual; UI explica a limitação; cache local de tudo importado; fallback atrás de flag |
| R2 | Provedor de scraping instável ou com risco de ToS | Média | Médio | Atrás de feature flag; nunca único caminho; só com decisão do João |
| R3 | Upload de vídeo grande falha em 4G | Média | Médio | Multipart S3 com retry por parte, limite 300 MB |
| R4 | HEIC/iOS gera erros de processamento | Média | Baixo | `sharp` com libheif; fallback de conversão no navegador |
| R5 | Grade divergente do Instagram (mudança de proporção 1:1 → 3:4) | Alta | Baixo | Proporção configurável por perfil (`profiles.grid_ratio`) |
| R6 | Link vaza e terceiro aprova | Baixa | Médio | Expiração, revogação, nome do aprovador, IP/UA registrados, opção futura de PIN |
| R7 | Custo de storage com originais de vídeo | Média | Médio | 10 GB grátis no R2; política de expurgo de originais (ADR-004) |
| R8 | PWA no iOS sem notificações confiáveis | Alta | Baixo | SSE enquanto aberto + e-mail; push fica para depois; APK como plano B (ADR-001) |
| R9 | Escopo cresce para calendário/publicação | Média | Alto | Briefing adia explicitamente; roadmap separa etapas |
| R10 | Vercel Hobby não permite uso comercial | Certa ao cobrar | Médio | Migrar para Pro ou Cloudflare Workers antes de cobrar; app não depende de recursos exclusivos da Vercel |
| R11 | Conta ponte pessoal não gera token na Graph API | Alta | Alto | Converter o perfil do João em Criador de conteúdo (gratuito, reversível) ou usar outra conta profissional |
| R12 | Limites gratuitos (Neon 0,5 GB, R2 10 GB) estourarem no piloto | Baixa | Baixo | Monitorar uso; metadados são pequenos; mídia é o único volume |
| R13 | Publicação duplicada ou na hora errada (cron duplo, função morta no meio, fuso) | Média | Alto | Índice único de publicação viva, `skip locked`, consulta do container antes de republicar, `scheduled_at` em UTC + `timezone` (doc 12 §5.3, §4.7) |
| R14 | Meta recusa a permissão de publicação no App Review ou exige verificação do negócio | Média | Alto | Piloto com testadores do app; screencast e textos preparados em T12; portfólio empresarial com CNPJ (decisão do João) |
| R15 | Token da conta do cliente expira e agendamentos falham em silêncio | Média | Médio | Verificação de saúde semanal, status da conexão, falha imediata com aviso e "Reagendar as N que falharam" (doc 12 §7) |

## Dependências externas (decisões do João)

| # | Item | Decisão | Responsável | Quando |
|---|---|---|---|---|
| 1 | Conta ponte do Instagram | Não usar a da CPCann. João envia a página pessoal dele para testar; se não funcionar (conta pessoal não gera token), converte em Criador de conteúdo ou envia outra profissional | João | antes da fase 1 |
| 2 | App na Meta for Developers | Criar depois, com Claude Cowork | João + Claude | fase 1 |
| 3 | Banco, storage e hospedagem | Onde for melhor, de preferência grátis: Neon, Cloudflare R2, Vercel Hobby | dev | fase 0 |
| 4 | Domínio | Sem domínio por enquanto; subdomínio `vercel.app` | — | depois |
| 5 | Resend com domínio verificado | Ok; sem domínio próprio, usar o domínio de teste do Resend no piloto | dev | fase 5 |
| 6 | Política de privacidade, termos e exclusão de dados | Rascunhados pelo Claude em `docs/legal/`; revisão de advogado(a) antes de publicar | Claude + João | fase 5 |
| 7 | Logo | Usar a do briefing: extraída para `assets/brand/aprovo-logo.png`; vetor fica pendente | — | feito |
