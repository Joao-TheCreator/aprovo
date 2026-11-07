# 12 · Agendamento e publicação automática no Instagram

Planejamento da fase seguinte, decidida pelo João em 06/11/2026 (ADR-009 e ADR-010): depois de
aprovada, uma publicação (foto, carrossel ou vídeo/reel) é **publicada sozinha** no Instagram do
cliente na data e hora marcadas. Este doc descreve modelo de dados, fluxo pela API da Meta,
agendador, mudanças no app da Meta e na tela de Configurações, e o que acontece quando o
token ou a conta deixam de servir. Nada aqui está implementado; a ordem de tarefas está em
`docs/05-roadmap.md` (fase 6).

Pontos marcados **[confirmar]** dependem da documentação oficial da Meta
(`developers.facebook.com/docs/instagram-platform/content-publishing`), que a rede desta sessão
não acessa. Devem ser conferidos pelo subagente que implementar a tarefa correspondente, no
painel da Meta ou com uma chamada real à API em modo de desenvolvimento.

## 1. Premissas

- O feed de cada perfil vem de uma **conta conectada por Login do Instagram** (ADR-009). A
  publicação usa o **token dessa mesma conta**: quem autorizou o app é o cliente (ou a social
  media com acesso à conta dele). Não existe mais conta ponte.
- Pré-requisito desta fase: **conexões múltiplas por workspace** e **perfil criado a partir da
  conta conectada** (pendência da ADR-009, tarefas T1 e T2 do roadmap). A publicação precisa
  saber qual conexão pertence a qual perfil: `profiles.connection_id`.
- Só publicações **aprovadas** podem ser agendadas. A aprovação continua sendo o fluxo da
  fase 4 (ou o link único por pessoa de `docs/13`).
- Originais de mídia continuam imutáveis (ADR-004). O que vai para o Instagram é o original
  (vídeo) ou um **derivado de publicação** (imagem em JPEG), nunca o original recomprimido no
  lugar.
- Hospedagem continua na Vercel. O plano Hobby limita crons (seção 5); o agendador foi
  desenhado para funcionar com um disparo externo gratuito, sem depender de recurso exclusivo
  da Vercel.

## 2. Modelo de dados

### 2.1 Nova tabela `publications` (uma publicação agendada por post)

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid | |
| post_id | uuid → posts | |
| profile_id | uuid → profiles | redundante de propósito: filtro por workspace via perfil |
| connection_id | uuid → instagram_connections | conta que vai publicar; copiada do perfil no momento do agendamento |
| scheduled_at | timestamptz | instante UTC da publicação |
| timezone | text | IANA, ex. `America/Sao_Paulo`; só para exibir "às 14:00 (Brasília)" |
| status | enum `publication_status` | `scheduled, publishing, published, failed, cancelled` |
| attempts | int | tentativas já feitas (0 no início) |
| max_attempts | int | padrão 5 |
| next_attempt_at | timestamptz | quando o agendador deve pegar de novo; = `scheduled_at` no início |
| locked_at | timestamptz | lock por post (seção 5.3); nulo quando livre |
| locked_by | text | id da execução (`run_<timestamp>_<random>`), para diagnóstico |
| container_id | text | id do container da Meta (reaproveitado entre tentativas enquanto válido, 24 h **[confirmar]**) |
| container_created_at | timestamptz | para saber se o container ainda vale |
| ig_media_id | text | id da mídia publicada; nulo até publicar |
| permalink | text | link da publicação no Instagram |
| published_at | timestamptz | |
| last_error_code | text | código interno (seção 4.5): `token_expired`, `not_professional`, `missing_scope`, `media_rejected`, `daily_limit`, `rate_limited`, `container_error`, `network`, `unknown` |
| last_error | text | mensagem amigável, sem token, sem URL assinada |
| last_error_raw | jsonb | corpo do erro da Meta (sem token), só para diagnóstico |
| created_by | uuid → users | quem agendou |
| cancelled_at, cancelled_by | timestamptz, uuid | |
| created_at, updated_at | timestamptz | |

Constraints e índices:

- **Idempotência:** índice único parcial `publications (post_id) where status in ('scheduled',
  'publishing')`. Um post nunca tem duas publicações vivas. Reagendar = atualizar `scheduled_at`
  e `next_attempt_at` da linha viva, não criar outra.
- `publications (status, next_attempt_at)` para a consulta do agendador.
- `publications (profile_id, scheduled_at desc)` para a lista "Agendadas".
- `ig_media_id` único quando não nulo (uma mídia da Meta nunca é registrada duas vezes).

### 2.2 Mudanças em tabelas existentes

| Tabela | Mudança | Motivo |
|---|---|---|
| `posts.status` | novos valores no enum `post_status`: `scheduled`, `published`, `publish_failed` | a grade mostra pílulas "Agendada", "Publicada", "Falhou" |
| `posts.scheduled_for` | continua sendo a "data prevista" editável; ao agendar, vira o valor inicial de `publications.scheduled_at` | não quebra a Tela 05 |
| `posts.published_media_id` | text, nulo | atalho para o `ig_media_id` da publicação bem-sucedida |
| `profiles.connection_id` | uuid → instagram_connections, nulo para perfis manuais | vem das tarefas T1 e T2 |
| `profiles.timezone` | text, padrão `America/Sao_Paulo` | fuso padrão para novos agendamentos do perfil |
| `instagram_connections` | `status` enum `active, expired, revoked, not_professional, missing_scope`; `status_detail` text; `status_checked_at` timestamptz | seção 7 |
| `instagram_connections.scopes` | já existe; passa a ser consultada: publicar exige `instagram_business_content_publish` | seção 6 |
| `media_assets.publish_path` | text, nulo; prefixo `publish/` no R2 | JPEG derivado para o Instagram (seção 4.2) |
| `imported_posts` | nada; a publicação bem-sucedida é importada normalmente no próximo "Atualizar feed", ligada pelo `ig_media_id` | seção 4.6 |

Máquina de estados do post, complementando `docs/03` seção 3:

```
approved ──agendar──► scheduled ──publicado──► published
   ▲                     │   │
   │  cancelar agendamento│   │ esgotou tentativas / erro definitivo
   └─────────────────────┘   ▼
                       publish_failed ──reagendar──► scheduled
```

- Editar legenda ou mídia de um post `scheduled` **cancela o agendamento** e volta para `draft`
  (exige nova aprovação, como hoje com `approved`).
- `published` é terminal: não edita, não reenvia, não arquiva da grade (vira importado).
- O `activity_log` registra `publication.scheduled`, `publication.rescheduled`,
  `publication.cancelled`, `publication.attempt`, `publication.published`,
  `publication.failed`, com `actor = system:scheduler` nas execuções automáticas.

## 3. O que o Instagram aceita (resumo prático)

Fonte: Content Publishing API da Instagram Platform, versão com Login do Instagram
(`graph.instagram.com`). Valores conhecidos até novembro de 2026; conferir **[confirmar]**.

| Tipo | Requisitos | Observações |
|---|---|---|
| Imagem única | **JPEG** apenas; até 8 MB; largura 320–1440 px (maiores são redimensionadas); proporção entre 4:5 e 1.91:1 | PNG, HEIC e WebP precisam ser convertidos; proporção fora da faixa é recusada, não cortada |
| Carrossel | 2 a 10 itens, imagens e/ou vídeos; cada item com as regras acima; a Meta corta todos os itens para a proporção do primeiro **[confirmar]** | conta como **uma** publicação no limite diário |
| Vídeo / Reel | MP4 ou MOV; H.264 + AAC; até 1 GB; duração 3 s a 15 min **[confirmar]** (o APROVO limita a 90 s na Tela 03); 9:16 recomendado, aceita de 0.01:1 a 10:1 | desde 2023 vídeo no feed só como **Reel** (`media_type=REELS`); `share_to_feed=true` para aparecer na grade; capa via `cover_url` ou `thumb_offset` |
| Legenda | até 2.200 caracteres, até 30 hashtags, até 20 menções | já validado na Tela 05 |
| Limite diário | **100 publicações por 24 h** por conta (carrossel = 1) | consulta em `GET /{ig-user-id}/content_publishing_limit?fields=quota_usage,config` |
| Container | expira em **24 h** se não publicado **[confirmar]** | reaproveitável entre tentativas dentro da janela |

Não cobertos nesta fase: stories, colaboradores (`collaborators`), marcação de usuários e
produtos, localização, primeiro comentário automático. Ficam como perguntas abertas.

## 4. Fluxo de publicação

### 4.1 Visão geral

```
aprovado ─► social media agenda ─► publications.scheduled
                                        │ (cron a cada 1–5 min)
                                        ▼
                                 claim do job (lock)
                                        │
                        ┌───────────────┼──────────────────┐
                        ▼               ▼                  ▼
                 preparar mídia   criar container(s)   esperar FINISHED
                 (publish/ JPEG,  (image_url/video_url   (só vídeo e
                  URL assinada)    + is_carousel_item)    carrossel)
                        │               │                  │
                        └───────────────┴──────────────────┘
                                        ▼
                              POST /media_publish
                                        ▼
                       ig_media_id + permalink → published
                                        ▼
                   post.status = published, e-mail, SSE, activity_log
```

### 4.2 Preparar a mídia (`lib/publishing/prepare.ts`)

1. Para cada `post_media` do post, na ordem `sort_order`:
   - **Imagem:** se `mime_type` já for `image/jpeg`, ≤ 8 MB e dentro da proporção, o original
     serve (`original_path`). Caso contrário, gerar **uma vez** o derivado
     `publish/<workspace>/<asset>/publish.jpg` com `sharp` (JPEG qualidade 92, lado maior
     ≤ 1440 px, sem corte) e gravar em `media_assets.publish_path`. Proporção fora de
     4:5–1.91:1 → erro `media_rejected` com mensagem "A imagem X tem proporção A:B; o Instagram
     aceita entre 4:5 e 1.91:1" **antes** de agendar (validação na tela), nunca só no cron.
   - **Vídeo:** o original é enviado como está (MP4/MOV já são exigidos na Tela 03). Capa:
     `poster_path` como `cover_url` quando existir.
2. Gerar **URL assinada de leitura** (`getStorage().getSignedUrl(key, ttl)`) com TTL de
   **2 h** para imagem e **4 h** para vídeo (a Meta baixa o arquivo ao criar o container e
   pode demorar no processamento). A URL assinada nunca é gravada no banco nem logada.
   - R2 com URL pré-assinada (query string) funciona como "URL pública" para a Meta
     **[confirmar com uma publicação de teste]**. Se a Meta recusar query strings, o plano B é
     um Route Handler público `GET /api/publish-media/[signedToken]` que faz proxy do objeto
     (token HMAC de curta duração, como o driver local já faz em `lib/storage/local.ts`).
3. Validar antes de qualquer chamada à Meta: conexão ativa com escopo de publicação, mídia
   `ready`, limite diário com folga (`quota_usage < config.quota_total`).

### 4.3 Criar container(s) (`lib/instagram/publish.ts`)

Todas as chamadas em `https://graph.instagram.com/v21.0` com o token descriptografado da
conexão (`decryptToken`), via `fetch` com `AbortSignal.timeout(20_000)`.

| Caso | Chamadas |
|---|---|
| Imagem | `POST /{ig-user-id}/media` `{ image_url, caption }` → `{ id }` → `POST /{ig-user-id}/media_publish` `{ creation_id }` |
| Reel | `POST /{ig-user-id}/media` `{ media_type: "REELS", video_url, caption, share_to_feed: true, cover_url? }` → esperar `status_code = FINISHED` → `media_publish` |
| Carrossel | para cada item: `POST /media` `{ image_url \| (media_type: "VIDEO"/"REELS", video_url), is_carousel_item: true }` → esperar itens de vídeo → `POST /media` `{ media_type: "CAROUSEL", children: "id1,id2,…", caption }` → `media_publish` |

Legenda enviada = `caption` + `"\n\n"` + hashtags com `#`, montada por uma função pura e
testada (`buildCaption`).

### 4.4 Esperar o processamento

`GET /{container-id}?fields=status_code,status` devolve `IN_PROGRESS`, `FINISHED`, `ERROR`,
`EXPIRED` ou `PUBLISHED`. Regras:

- Imagem simples normalmente já vem `FINISHED`; ainda assim conferir uma vez.
- Vídeo: consultar a cada 15 s por até 60 s **dentro da mesma execução** (limite de duração da
  função, seção 5.4). Se ainda `IN_PROGRESS`, o job **não falha**: guarda `container_id`,
  `next_attempt_at = now() + 2 min`, libera o lock e deixa a próxima execução continuar de onde
  parou. Esse é o motivo de `container_id` ficar na tabela.
- `ERROR` → `container_error` com a mensagem da Meta; `EXPIRED` → recriar o container.
- `media_publish` com erro **9007** ("media not ready") é tratado como `IN_PROGRESS`.

### 4.5 Erros, classificação e retentativa

| Código interno | Como reconhecer (Meta) | Retentar? | Ação |
|---|---|---|---|
| `token_expired` | HTTP 400/401, `code 190` | não | conexão → `expired`; post → `publish_failed`; alerta "reconecte o Instagram" |
| `not_professional` | `code 10` / `OAuthException` com subcódigo de conta não profissional **[confirmar]** | não | conexão → `not_professional`; alerta |
| `missing_scope` | `code 10` / `200` permissão ausente | não | conexão → `missing_scope`; alerta "reconecte e autorize publicar" |
| `daily_limit` | `code 9` ou `quota_usage ≥ quota_total` | sim, `next_attempt_at` = virada da janela (24 h após a primeira publicação do dia) ou +1 h | aviso na lista |
| `rate_limited` | HTTP 429, `code 4, 17, 32, 613` | sim, backoff | |
| `media_rejected` | `code 36xxx` de mídia inválida, `ERROR` no container com motivo de formato | não | post → `publish_failed` com motivo; social media corrige e reagenda |
| `container_error` | `status_code = ERROR` sem motivo de formato | sim, até 2 vezes, recriando o container | |
| `network` | timeout, 5xx | sim, backoff | |
| `unknown` | qualquer outro | sim, backoff | `last_error_raw` guarda o corpo |

Backoff: 1, 5, 15, 60 e 180 minutos (`attempts` 1..5). Ao esgotar `max_attempts`: `failed`,
post `publish_failed`, e-mail e evento SSE. Nunca retentar erros definitivos (coluna
"Retentar? não"): isso evita publicar duas vezes e evita martelar um token morto.

### 4.6 Depois de publicar

1. `publications`: `published`, `ig_media_id`, `permalink`, `published_at`.
2. `posts`: `status = published`, `published_media_id`.
3. `activity_log` `publication.published`; `NOTIFY` para o SSE (`post.status`), toast
   "Publicado no Instagram: 'Post da coxinha'"; e-mail "Publicado" para quem agendou
   (`lib/email/send.ts`, novo template).
4. O post **sai dos planejados** e entra na grade pelo caminho normal de importação
   (`imported_posts` com o `ig_media_id`), disparando um "Atualizar feed" do perfil logo após a
   publicação. Enquanto a importação não acontece, a grade mostra o post com pílula "Publicada"
   na posição atual.
5. Retenção de originais (ADR-004): o expurgo após publicação passa a ter o gatilho real
   (`published_at`). O X de dias continua pendente de decisão do João.

### 4.7 Fuso horário

- A social media escolhe data e hora no fuso do perfil (`profiles.timezone`, padrão
  `America/Sao_Paulo`); o app converte para UTC e grava `scheduled_at` + `timezone`.
- Exibição sempre com `Intl.DateTimeFormat("pt-BR", { timeZone })`, como a tela de
  Configurações já faz.
- Sem horário de verão no Brasil desde 2019, mas a conversão usa a biblioteca de fuso mesmo
  assim (não fixar `-03:00` no código).

## 5. Agendador na Vercel

### 5.1 Restrição do plano Hobby

O cron da Vercel no plano **Hobby** roda no máximo **uma vez por dia** por job e sem precisão
de minuto **[confirmar no painel]**; o cron semanal atual (`vercel.json`) cabe nisso, um
agendador a cada minuto não. Três caminhos:

| Opção | Custo | Prós | Contras |
|---|---|---|---|
| **A. Vercel Pro** | US$ 20/mês | cron a cada minuto no próprio `vercel.json`; função até 300 s; já resolve o uso comercial (R10) | custo fixo antes de ter receita |
| **B. Disparo externo gratuito** (Cloudflare Workers Cron Trigger ou cron-job.org) chamando `GET /api/publishing/run` com `CRON_SECRET` | R$ 0 | sem lock-in (é só um HTTP a cada 1–5 min); Workers é o plano B de hospedagem da ADR-002 | mais um serviço para configurar; depende da função responder em ≤ 60 s |
| C. GitHub Actions `schedule` a cada 5 min | R$ 0 em repo público; em privado consome a cota | zero serviço novo | imprecisão de minutos, repo é privado |

**Recomendação:** começar com **B** (Cloudflare Worker de 10 linhas, `fetch` com o header
`x-cron-secret`, que a rota de refresh já aceita) a cada **1 minuto**, e migrar para **A** quando
o APROVO começar a cobrar (R10 obriga de qualquer forma). O `vercel.json` ganha a mesma rota
com `schedule: "0 * * * *"` (uma vez por hora no Hobby, ou a cada minuto no Pro) como rede de
segurança; a rota é idempotente, então dois disparadores não causam publicação dupla.
**Decisão do João: pendente** (pergunta 1 da seção 9).

### 5.2 A rota `GET /api/publishing/run`

- Protegida como `/api/instagram/refresh`: `Authorization: Bearer $CRON_SECRET` ou
  `x-cron-secret`, comparação em tempo constante; adicionada ao `PUBLIC` do `proxy.ts`.
- `export const maxDuration = 60` (Hobby com Fluid Compute permite até 60 s por padrão e 300 s
  configurado **[confirmar]**); `dynamic = "force-dynamic"`.
- Cada execução: pega **até 5 jobs** vencidos, processa em série, devolve
  `{ claimed, published, retried, failed, skipped }`. Um job que não cabe no tempo volta para a
  fila (seção 4.4). Com 1 disparo/min e 5 jobs/execução, o teto é 300 publicações por hora,
  muito acima do limite da Meta.
- Logs estruturados sem segredos: `publication_id`, `post_id`, `connection_id`, código do erro,
  duração. Nunca o token, nunca a URL assinada.

### 5.3 Fila idempotente e lock por post

Claim atômico em SQL (uma transação curta):

```sql
with due as (
  select id from publications
  where status = 'scheduled'
    and next_attempt_at <= now()
    and (locked_at is null or locked_at < now() - interval '10 minutes')
  order by next_attempt_at
  limit 5
  for update skip locked
)
update publications p
set status = 'publishing', locked_at = now(), locked_by = $1, attempts = attempts + 1
from due where p.id = due.id
returning p.*;
```

- `for update skip locked` garante que duas execuções simultâneas (dois disparadores, ou
  um disparo lento) não pegam o mesmo job.
- `locked_at` antigo (> 10 min) é considerado abandonado (função morreu no meio) e o job volta a
  ser elegível; `container_id` salvo evita recriar o container.
- Ao terminar, cada job vira `published`, `failed` ou volta a `scheduled` com `next_attempt_at`
  no futuro e `locked_at = null`.
- **Proteção contra dupla publicação:** antes de chamar `media_publish` numa retentativa com
  `container_id` existente, consultar `status_code`; se `PUBLISHED`, buscar o `ig_media_id` em
  `GET /{container-id}?fields=id,status_code` **[confirmar campo da mídia publicada]** e
  encerrar como `published`, sem publicar de novo.

### 5.4 Limites de tempo

- Função: 60 s. Orçamento por job: ~20 s (container) + 1 consulta de status. Vídeo quase sempre
  precisa de 2 execuções; é esperado, não é erro.
- Download da mídia pela Meta não consome tempo da função (é assíncrono do lado deles).

### 5.5 Alertas

| Evento | Canal |
|---|---|
| Publicado | toast (SSE), e-mail para quem agendou, `activity_log` |
| Falha definitiva | toast vermelho, e-mail "Não foi possível publicar", badge na lista "Agendadas", `activity_log` |
| Conexão expirada / perdeu escopo / não profissional | banner na tela do perfil e em Configurações; e-mail; todos os agendamentos daquela conexão viram `failed` com `token_expired` (sem tentar um por um) |
| Agendamento atrasado > 15 min (cron parado) | Sentry (já configurado) via verificação na própria rota: ao rodar, se existir job com `next_attempt_at < now() - 15 min`, registra `captureMessage("scheduler lag")` |
| Limite diário atingido | aviso ao agendar ("hoje já há N publicações; a Meta permite 100 por 24 h") |

## 6. Escopo, app da Meta e App Review

### 6.1 Escopo

- `SCOPES` em `lib/instagram/oauth.ts` passa a ser `["instagram_business_basic",
  "instagram_business_content_publish"]` quando a flag `IG_PUBLISH_ENABLED=true`; sem a flag
  continua só `basic` (não pedir permissão que não se usa é critério de App Review).
- `instagram_connections.scopes` já guarda o que foi concedido; a UI de agendamento verifica se
  `content_publish` está lá e, se não, mostra "Reconecte o Instagram e autorize a publicação".
- Conexões antigas (só `basic`) continuam servindo para o feed; para publicar é preciso
  **reconectar** (o diálogo da Meta pede só o escopo novo).

### 6.2 No app ELIM MKT (developers.facebook.com)

1. Em **Casos de uso › Gerenciar mensagens e conteúdo no Instagram › Permissões**, adicionar
   `instagram_business_content_publish` **[≈]**.
2. Enquanto o app está em **modo de desenvolvimento**, testadores do Instagram
   (`joaomoreiraj`, `samuelbozzuto`, `samuelbdesigner`) publicam sem App Review. **Publicações
   feitas por testadores vão para o Instagram de verdade**: testar com conta de teste ou com
   posts marcados para apagar.
3. Para clientes sem papel no app: **App Review** da permissão com screencast mostrando
   conectar → aprovar → agendar → publicar, descrição de uso em inglês, política de privacidade
   e exclusão de dados já publicadas (`/legal/*`). O campo "URL de instruções de exclusão de
   dados" que a Meta recusou (doc 11) precisa ser resolvido antes.
4. **Verificação do negócio** (Business Verification) é exigida para Advanced Access
   **[confirmar se vale para Instagram Login sem portfólio empresarial]**. Pode exigir criar um
   portfólio empresarial (Meta Business) com CNPJ, o que a Meta já sugere ao marcar a
   configuração atual como obsoleta (doc 11).
5. Até o App Review sair, o produto funciona com os testadores convidados pelo João
   (**[confirmar limite de papéis]**), suficiente para o piloto.

### 6.3 Tela de Configurações

Hoje: uma conexão por workspace, "Conectar Instagram" / "Desconectar". Passa a ser:

- **Lista de contas conectadas** (T1): avatar, @, tipo, "token válido até", permissões
  (`Feed` · `Publicação`), status (ativa / expirada / sem permissão de publicar / não
  profissional), ações **Reconectar** e **Desconectar**.
- Botão **Conectar outra conta do Instagram**.
- Texto: "Para publicar automaticamente, a conta precisa ser profissional e autorizar
  'Publicar conteúdo'. Em modo de desenvolvimento, a conta precisa ser testadora do app."
- Seção **Publicação**: fuso padrão do workspace, "Avisar por e-mail quando publicar" (on/off),
  contador "publicações nas últimas 24 h por conta" (da Meta, cacheado 10 min).

## 7. Quando o token expira ou a conta muda

| Situação | Como detectar | Efeito | Mensagem |
|---|---|---|---|
| Token de 60 dias venceu sem renovar (cron semanal falhou, ou a pessoa trocou a senha / revogou o app) | `code 190` em qualquer chamada; `token_expires_at < now()` | conexão `expired`; feed usa o último cache; publicações agendadas da conexão → `failed/token_expired` imediatamente (sem esperar a hora) | "O Instagram @x desconectou. Reconecte para continuar publicando." |
| Conta voltou a ser pessoal | erro da Meta ao chamar `/me` ou `/media` **[confirmar código]** | conexão `not_professional`; mesmo efeito | "A conta @x deixou de ser profissional. Mude para Criador ou Empresa e reconecte." |
| Pessoa revogou só a permissão de publicar | `code 10`/`200` em `/media` | conexão `missing_scope` | "Reconecte e autorize 'Publicar conteúdo'." |
| App sai do modo de desenvolvimento sem App Review da permissão | erro de permissão para contas sem papel | idem | aviso interno no Sentry |
| Deauthorize callback (`/legal/exclusao-de-dados`) | já configurado no app da Meta; hoje só mostra instruções | passa a **receber o POST assinado** da Meta e marcar a conexão como `revoked` **[confirmar formato `signed_request`]** | |

Regras:

- O cron semanal de refresh (`/api/instagram/refresh`) passa a **também** chamar `/me` para
  cada conexão e gravar `status`/`status_checked_at` (verificação de saúde), e a marcar como
  `failed` os agendamentos de conexões que não renovaram.
- O agendador nunca tenta publicar com conexão fora de `active`.
- Reconectar (mesmo `ig_user_id`) **reativa** a conexão e a UI oferece "Reagendar as N
  publicações que falharam" em um toque.

## 8. Segurança e privacidade

- Token: continua em `access_token_enc` (AES-256-GCM), descriptografado só dentro da execução
  do job. Nunca em log, nunca em `last_error_raw` (o corpo da Meta não ecoa tokens, mas a
  função que grava o erro remove qualquer `access_token=` por garantia).
- URL assinada: TTL curto, gerada por execução, não persistida.
- Autorização: agendar, cancelar e reagendar passam por `requireWorkspaceForProfile`; a rota
  do cron é a única que escreve `published`.
- LGPD: publicar é uma ação em nome do cliente; os Termos de Uso (`docs/legal/`) precisam de
  uma cláusula de **mandato para publicar** após aprovação registrada. Revisão de advogado(a)
  junto com a publicação dos termos (E8).

## 9. Perguntas abertas para o João

1. **Disparador do cron:** Cloudflare Worker gratuito a cada minuto (recomendado agora) ou
   migrar já para Vercel Pro (US$ 20/mês)?
2. **Agendar ao aprovar?** Quando o cliente aprova um post que já tem "data prevista", o APROVO
   agenda sozinho ou a social media confirma com um toque em "Agendar"? Recomendação:
   confirmação explícita no início; "agendar automaticamente" como opção por perfil depois.
3. **Quem agenda:** só a social media, ou o cliente pode escolher a data no link de aprovação?
   Recomendação: só a social media.
4. **Vídeo sempre como Reel** (exigência da Meta) com `share_to_feed=true`: ok mostrar na UI
   "Vídeo (Reel)"? O limite de 90 s da Tela 03 continua?
5. **Primeiro comentário automático** (hashtags no comentário em vez da legenda): entra nesta
   fase ou depois?
6. **Pós-publicação:** o post publicado some dos planejados e entra como importado (recomendado),
   ou fica na grade com a pílula "Publicada" até a social media arquivar?
7. **Retenção de originais** após publicação (ADR-004, "X dias"): 30, 90 dias, nunca?
8. **App Review e verificação do negócio:** criar portfólio empresarial na Meta com o CNPJ da
   agência do João ou da CPCann? Quem é o responsável legal? Sem isso, só testadores publicam.
9. **Conta de teste para publicar de verdade:** usar `@joaomoreiraj` (publicações reais) ou
   criar uma conta profissional de teste só para o APROVO?
10. **Falha definitiva:** além de e-mail e toast, avisar por WhatsApp (API oficial, custo) fica
    para a etapa de notificações?
11. **Limite por workspace:** impor um teto próprio (ex.: 20 agendamentos/dia por conta) abaixo
    do da Meta para proteger a conta do cliente de erros?
