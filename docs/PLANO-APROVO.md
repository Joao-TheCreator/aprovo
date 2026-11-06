---
title: "APROVO · Plano da primeira etapa"
subtitle: "Planeje. Aprove. Publique."
date: "6 de novembro de 2026"
lang: pt-BR
---

# Resumo executivo

O **APROVO** é um web app mobile-first para social medias montarem o feed do Instagram de clientes, organizarem as próximas publicações e colherem a aprovação por um link, sem o cliente precisar de conta. O briefing pede "primeiro, o essencial": organização visual do feed e fluxo de aprovação.

**O que precisamos para fazer o app**

| Frente | Resumo |
|---|---|
| Produto (MVP) | Login do social media; conectar perfil público pelo `@`; feed simulado como no Instagram; adicionar Post (foto/carrossel) e Vídeo da galeria preservando os originais; reorganizar a grade por arrastar e soltar com status por publicação; editar legenda, hashtags e data prevista; link de aprovação sem conta com registro de data, hora e link; retorno em tempo real |
| Fora desta etapa | Calendário completo, publicar/agendar no Instagram, stories e destaques |
| Tecnologia | Next.js 15 + TypeScript + Tailwind + shadcn/ui + dnd-kit; Supabase (Postgres, Auth, Storage, Realtime); sharp; Meta Graph API (Business Discovery); Vercel; Resend; Sentry; PWA |
| Dados do Instagram | Business Discovery com uma conta profissional do próprio APROVO carrega qualquer conta business/creator pública só pelo `@`. Contas pessoais caem em importação manual; scraping só atrás de flag |
| Prazo | 38 dias úteis (≈ 8 semanas) com 1 dev; ≈ 6 semanas com 2 |
| Providências externas | Conta profissional do Instagram do APROVO ligada a uma Página do Facebook; app na Meta for Developers; projetos Supabase e Vercel; domínio; logo em SVG; política de privacidade |
| Referência de uso | App My Feed · Grid Preview & Planner (as capturas do briefing são dele) |

Os capítulos a seguir são os documentos `docs/01` a `docs/09` do repositório, na ordem.

# 01 · Visão e escopo do APROVO

> **Planeje. Aprove. Publique.** Gestão e aprovação de conteúdos para redes sociais.

## 1. O problema

Social medias (freelancers e agências) montam o feed do Instagram dos clientes em ferramentas
soltas (Canva, WhatsApp, Google Drive, prints) e pedem aprovação por mensagem. O resultado:

- O cliente não vê **como o feed vai ficar** depois das próximas publicações.
- A aprovação se perde em conversas; não há registro de **quem aprovou, quando e o quê**.
- Ajustes viram idas e vindas de arquivo, com perda de qualidade e de contexto.

## 2. O produto

O APROVO é um **web app mobile-first** onde o social media:

1. Conecta o perfil público do Instagram do cliente (apenas o @, sem login do cliente).
2. Vê o perfil e o feed atuais simulados como no Instagram.
3. Adiciona novas publicações (post, carrossel ou vídeo) a partir da galeria do celular.
4. Organiza a ordem dos conteúdos na grade e vê a prévia atualizar na hora.
5. Preenche legenda, hashtags e data prevista; salva rascunho ou **envia para aprovação**.
6. Gera um **link de aprovação** por publicação ou por conjunto. O cliente abre sem conta,
   aprova ou pede ajustes, e o status volta em tempo real para o social media.

A referência de uso é o app **My Feed · Grid Preview & Planner** (iOS): mesma ideia de simular
o perfil e arrastar conteúdos na grade. O APROVO acrescenta o que o MyFeed não tem: o **fluxo de
aprovação com o cliente** e o **registro da aprovação**.

## 3. Usuários

| Papel | Quem é | O que faz no APROVO | Precisa de conta? |
|---|---|---|---|
| **Social media** (usuário principal) | Freelancer ou membro de agência | Conecta perfis, cria e organiza publicações, envia para aprovação | Sim (e-mail ou Google) |
| **Cliente aprovador** | Dono do negócio ou responsável de marketing | Abre o link, vê a prévia, aprova ou solicita ajustes com comentário | Não (acesso por link) |
| **Admin do workspace** (etapa futura) | Dono da agência | Gerencia membros e perfis | Sim |

## 4. Escopo da primeira etapa (MVP)

Segue o briefing: "Primeiro, o essencial". Prioridade é a **organização visual do feed** e o
**fluxo de aprovação**.

### Dentro do MVP

| # | Capacidade | Tela do briefing |
|---|---|---|
| 1 | Cadastro/login do social media | — |
| 2 | Conectar perfil público do Instagram pelo @ e importar cabeçalho + últimos posts | Tela 01 |
| 3 | Visualização do perfil e do feed simulando o Instagram (3 colunas, abas, contadores) | Tela 02 |
| 4 | Adicionar publicação: **Post** (foto ou carrossel) e **Vídeo** | Tela 03 |
| 5 | Upload preservando o arquivo original e gerando prévias leves para a grade | Telas 03/04 |
| 6 | Detalhe ampliado da publicação ao tocar na grade | Tela 04 |
| 7 | Edição da publicação: legenda, hashtags, data prevista, prévia no feed; salvar rascunho ou enviar para aprovação | Tela 05 |
| 8 | Link de aprovação por publicação ou por conjunto; abre sem conta; registra data, hora e link usado | Tela 05 |
| 9 | Feed organizado: reordenar por arrastar e soltar; status visível (Rascunho, Aguardando aprovação, Aprovada, Ajustes solicitados) | Tela 06 |
| 10 | Retorno da aprovação em tempo real no ambiente do social media | Tela 07 |
| 11 | Vários perfis (clientes) por social media | implícito |
| 12 | PWA instalável no celular (ícone na tela inicial, abre em tela cheia) | mobile-first |

### Fora do MVP (etapas futuras)

- **Calendário completo** (explicitamente adiado no briefing). Fica só o campo "data prevista".
- Publicar ou agendar no Instagram de verdade (exige autorização do cliente via Meta e App Review).
- Stories, destaques e edição de informações de perfil (aparecem no menu do Instagram, mas o
  briefing limita a Post e Vídeo).
- Edição de imagem (corte, filtros). O MVP só define o enquadramento da miniatura na grade.
- Comentários em thread, menções, notificações push, relatórios, cobrança/planos.
- Outras redes (TikTok, LinkedIn, Facebook).

## 5. Princípios de produto

1. **Fiel ao Instagram.** A grade, o cabeçalho e o detalhe devem parecer o app real para que o
   cliente entenda sem explicação.
2. **Zero atrito para o cliente.** Nenhum cadastro para aprovar. Um toque em "Aprovar".
3. **Mobile-first, mas funciona no desktop.** O social media edita no celular; o cliente aprova
   no celular; o desktop é bônus.
4. **Qualidade dos arquivos preservada.** O original nunca é recomprimido; prévias são derivadas.
5. **Rastreável.** Toda mudança de status guarda quem, quando, por qual link e com qual comentário.
6. **Identidade própria.** Cores e tipografia do APROVO (roxo, verde de aprovação, Poppins) em
   tudo que não é a simulação do Instagram.

## 6. Métricas de sucesso do MVP

| Métrica | Meta inicial |
|---|---|
| Tempo para conectar um perfil e ver o feed | < 30 s |
| Tempo para criar uma publicação a partir da galeria | < 2 min |
| Taxa de aprovações concluídas pelo link (abertas → decididas) | > 70 % |
| Tempo médio entre "enviado" e "decidido" | < 24 h |
| Erros de importação de perfil | < 5 % das tentativas |

## 7. Perguntas em aberto para o João (dono do produto)

Respostas mudam detalhes, não a direção. Enquanto não vierem, seguimos com a premissa indicada.

| Pergunta | Premissa adotada |
|---|---|
| O cliente pode aprovar **parcialmente** um conjunto (aprova 3 de 5)? | Sim, decisão por publicação; o conjunto fica "parcial" |
| "Ajustes solicitados" exige comentário obrigatório? | Sim, mínimo 1 caractere |
| Quantos perfis por social media no MVP? | Ilimitado, sem cobrança |
| Vídeo: só o arquivo + capa, ou também corte de duração? | Só arquivo + capa (primeiro frame ou frame escolhido) |
| Precisa de login por Google ou basta e-mail com link mágico? | Ambos; Google via Supabase Auth custa pouco |
| O link de aprovação expira? | Sim, 30 dias, renovável pelo social media |


\newpage

# 02 · Arquitetura técnica

## 1. Decisão de stack

O MVP é um único app Next.js com Supabase atrás. A escolha privilegia **velocidade de entrega**,
**tempo real pronto** (status de aprovação) e **custo baixo** no início.

| Camada | Escolha | Por quê |
|---|---|---|
| Framework web | **Next.js 15 (App Router) + TypeScript** | SSR para o link público de aprovação (abre rápido, com preview no WhatsApp), Server Actions para mutações, PWA simples |
| UI | **Tailwind CSS + shadcn/ui + Radix** | Mobile-first, componentes acessíveis, fácil aplicar o design system do APROVO |
| Ícones | **Lucide** (traço fino arredondado) | Bate com o briefing ("ícones de traço fino arredondado") |
| Fonte | **Poppins** via `next/font` | Identidade visual |
| Drag & drop | **dnd-kit** | Funciona com toque, leve, acessível |
| Banco + Auth + Storage + Realtime | **Supabase (Postgres)** | Um fornecedor cobre login (e-mail mágico + Google), arquivos com URLs assinadas, Realtime para status, RLS para isolar clientes |
| ORM / migrations | **Drizzle ORM** + `supabase db` para migrations SQL | Tipagem forte e SQL explícito para RLS e índices |
| Processamento de imagem | **sharp** (em Route Handler Node) | Gera miniaturas e prévias sem tocar no original |
| Vídeo | Capa capturada no navegador (`<video>` + canvas) no MVP; `ffmpeg` em worker em etapa futura | Evita infra de fila no MVP |
| Integração Instagram | Módulo `instagram-provider` com duas implementações: **Meta Graph API (Business Discovery)** e **provedor de scraping** como fallback | Ver `docs/07-instagram-api.md` |
| Validação | **Zod** | Compartilhada entre formulários e Server Actions |
| Estado cliente | **TanStack Query** + Supabase Realtime | Cache por perfil, invalidação por evento |
| Testes | **Vitest** (unit), **Playwright** (e2e do fluxo de aprovação) | O fluxo de link é o caminho crítico |
| Hospedagem | **Vercel** (app) + **Supabase** (dados) | Deploy por PR, preview por branch |
| Observabilidade | **Sentry** + logs do Vercel | Erros na importação do Instagram são o ponto frágil |
| E-mail transacional | **Resend** | Link mágico e aviso "cliente aprovou" |

Alternativa considerada e descartada no MVP: app nativo (React Native/Expo). O briefing pede
mobile-first e acesso por link sem conta; PWA entrega os dois sem loja de apps. Se a captura de
galeria/vídeo no PWA se mostrar limitada, Expo entra numa fase posterior reaproveitando a API.

## 2. Visão geral

```
┌──────────────────────── Celular / Desktop ────────────────────────┐
│  PWA Next.js (React)                                              │
│  ├─ /perfis/*      área do social media (route group `(app)`)     │
│  └─ /a/[token]     página pública de aprovação (sem login)        │
└───────────────┬───────────────────────────────┬───────────────────┘
                │ Server Actions / Route Handlers│ Supabase JS (Realtime)
┌───────────────▼───────────────────────────────▼───────────────────┐
│  Next.js server (Vercel)                                          │
│  ├─ auth guard, validação Zod, regras de negócio                  │
│  ├─ /api/media/upload-url   → URL assinada para upload direto     │
│  ├─ /api/media/process      → sharp: thumb 320, preview 1080      │
│  ├─ /api/instagram/import   → provider (Graph API | scraping)     │
│  └─ /api/approval/[token]/decide → chama decide_approval() SQL    │
└───────┬───────────────┬────────────────────┬──────────────────────┘
        │               │                    │
┌───────▼─────┐ ┌───────▼────────┐ ┌─────────▼───────────┐
│ Postgres    │ │ Storage        │ │ Meta Graph API /    │
│ (Supabase)  │ │ originals/     │ │ provedor fallback   │
│ RLS por     │ │ previews/      │ │ cache 24 h          │
│ workspace   │ │ thumbs/ ig-cache│ │                     │
└─────────────┘ └────────────────┘ └─────────────────────┘
```

## 3. Módulos do app

| Módulo | Responsabilidade | Principais arquivos (proposta) |
|---|---|---|
| `auth` | Login por e-mail mágico/Google, sessão, workspace padrão | `app/(auth)/*`, `lib/supabase/*` |
| `profiles` | Conectar @, importar cabeçalho e posts, reimportar, remover | `app/(app)/perfis/*` (URL `/perfis`), `lib/instagram/*` |
| `feed` | Grade simulada: posts importados + planejados, ordenação, abas | `components/feed/*`, `lib/feed/order.ts` |
| `posts` | CRUD de publicações, mídia, legenda, hashtags, status | `app/(app)/perfis/[id]/posts/*`, `lib/posts/*` |
| `media` | Upload direto, processamento, URLs assinadas | `app/api/media/*`, `lib/media/*` |
| `approvals` | Links, página pública, decisão, auditoria, Realtime | `app/a/[token]/*`, `app/api/approval/*`, `lib/approvals/*` |
| `design-system` | Tokens, tema, componentes base | `app/globals.css`, `components/ui/*` |

## 4. Fluxos técnicos críticos

### 4.1 Conectar perfil (Tela 01)

1. Social media digita `@usuario`. Validação: 1–30 caracteres `[a-z0-9._]`.
2. Server Action chama `instagramProvider.fetchProfile(username)`.
3. Provider principal: **Business Discovery** da Graph API usando o token do próprio APROVO
   (conta profissional da CPCann). Cobre contas **business e creator**. Devolve nome, bio, avatar,
   contadores e até 25–50 mídias com tipo, miniatura e permalink.
4. Se a conta é pessoal (Business Discovery falha), tenta o **provedor de fallback** (scraping
   gerenciado) se habilitado; senão oferece **importação manual** (upload das últimas fotos).
5. Resultado vira `profiles` + `profile_snapshots` + `imported_posts`. Avatar e miniaturas são
   **copiados para o Storage** (URLs do Instagram expiram).
6. Reimportação manual pelo botão "Atualizar feed", com cache de 24 h.

### 4.2 Upload de mídia (Tela 03/04)

1. Cliente pede `POST /api/media/upload-url` com nome, tipo e tamanho (limites: imagem 30 MB,
   vídeo 300 MB e 90 s; tipos jpg, png, heic, webp, mp4, mov).
2. Upload **direto para o Storage** com URL assinada (não passa pelo servidor Next). Vídeos
   usam o protocolo resumível (TUS) do Supabase Storage para sobreviver a quedas de rede.
3. Ao concluir, `POST /api/media/process`: `sharp` lê o original, gera `thumb` (320 px, corte
   conforme `grid_crop`) e `preview` (1080 px, sem corte). O original fica intacto.
4. Vídeo: o navegador captura um frame como capa (JPEG) e envia como segundo arquivo; a capa
   passa pelo mesmo pipeline. Duração e dimensões vêm do `<video>`.
5. HEIC: convertido para JPEG no servidor pelo `sharp` (libheif habilitado) ou, se indisponível,
   convertido no navegador com `heic2any`.

### 4.3 Ordenação da grade (Tela 06)

- Cada publicação planejada tem `position` (inteiro, denso). Posts importados são ordenados por
  `published_at` e ocupam as posições depois dos planejados (o Instagram mostra o mais novo
  primeiro, então os planejados ficam no topo).
- Drag & drop reordena só entre planejados no MVP. Mover para o meio dos importados simula
  "publicar depois de X" e exige ancoragem; fica para etapa futura.
- Reordenação persiste com uma única Server Action `reorderPosts(profileId, orderedIds[])` que
  reatribui posições em transação.

### 4.4 Link de aprovação (Tela 05/07)

1. Social media escolhe 1..N publicações e gera um **approval request**. Token: 32 bytes
   aleatórios, base64url, guardado como hash SHA-256 (o token claro só aparece uma vez na UI e
   na URL).
2. URL: `https://<domínio>/a/<token>` (ex.: `aprovo.app`). Página SSR, sem login, com Open Graph (capa do primeiro
   item + "Fulano enviou 3 publicações para sua aprovação").
3. O cliente vê o feed simulado com as publicações destacadas e, para cada uma, "Aprovar" ou
   "Pedir ajustes" (comentário obrigatório). Pode informar o nome (opcional, lembrado no
   `localStorage`).
4. `POST /api/approval/<token>/decide` (Route Handler, `service_role`) chama a função SQL
   `decide_approval(token, …)`, que valida o token (hash, expiração, revogação) e grava
   `approval_decisions` com `decided_at`, `ip`, `user_agent`, `approver_name`, `link_id`, e
   atualiza `posts.status`.
5. Supabase Realtime (canal `profile:<id>`) empurra a mudança para o app do social media.
   E-mail opcional via Resend.
6. Link expira em 30 dias; pode ser revogado; um novo link pode ser gerado a qualquer momento.
   Decisões antigas nunca são apagadas (auditoria).

## 5. Segurança e privacidade

- **RLS** em todas as tabelas: linha visível só para membros do `workspace`.
- Página de aprovação lê por **token hash**, nunca por id sequencial. Rate limit por IP
  (10 decisões/min) e por token.
- Storage privado; a UI recebe **URLs assinadas** de curta duração (1 h). A página pública
  recebe URLs assinadas geradas no servidor a cada render.
- Token da Graph API e chave do provedor fallback ficam só em variáveis de ambiente do servidor.
- LGPD: dados do cliente aprovador se limitam a nome opcional, IP e user agent, guardados para
  comprovar a aprovação. Política de retenção: enquanto o perfil existir.

## 6. Ambientes e variáveis

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Processamento de mídia e página pública (servidor) |
| `META_GRAPH_ACCESS_TOKEN`, `META_IG_USER_ID` | Business Discovery |
| `IG_FALLBACK_PROVIDER`, `IG_FALLBACK_API_KEY` | Provedor de scraping (opcional) |
| `RESEND_API_KEY` | E-mails |
| `APP_URL` | Montar links de aprovação |
| `SENTRY_DSN` | Erros |

Ambientes: `local` (Supabase CLI), `preview` (Vercel por PR + projeto Supabase de staging),
`production`.

## 7. Performance e limites

- Grade carrega miniaturas de 320 px (≈ 20–40 KB cada); 60 itens ≈ 2 MB.
- Página de aprovação: alvo LCP < 2,5 s em 4G.
- Supabase free tier aguenta o piloto (500 MB DB, 1 GB Storage). Em produção, plano Pro
  (US$ 25/mês) + Storage por uso. Originais de vídeo serão o maior custo; política futura de
  expurgo de originais 90 dias após aprovação.


\newpage

# 03 · Modelo de dados

Postgres (Supabase). Todas as tabelas têm `id uuid default gen_random_uuid()`, `created_at` e
`updated_at`, exceto as tabelas de ligação (`workspace_members`, `approval_items`), que usam
chave composta. RLS filtra por `workspace_id`: direto onde a coluna existe (`profiles`,
`media_assets`) e por junção `… → profile → workspace_id` nas demais (`posts`, `imported_posts`,
`approval_*`, `activity_log`), via função `is_workspace_member(profile_id)`.

## 1. Diagrama

```
workspaces ──< workspace_members >── auth.users
    │
    └──< profiles ──< imported_posts
            │
            ├──< posts ──< post_media >── media_assets
            │     │
            │     └──< approval_items >── approval_requests ──< approval_links
            │                 │
            │                 └──< approval_decisions
            │
            ├──< profile_snapshots
            └──< activity_log
```

## 2. Tabelas

### `workspaces`
| Coluna | Tipo | Notas |
|---|---|---|
| name | text | "Agência X" ou nome do freelancer |
| owner_id | uuid → auth.users | |

### `workspace_members`
| Coluna | Tipo | Notas |
|---|---|---|
| workspace_id | uuid → workspaces | |
| user_id | uuid → auth.users | |
| role | enum `owner, editor` | `viewer` fica para depois |
| PK | (workspace_id, user_id) | |

### `profiles` (perfil do cliente no Instagram)
| Coluna | Tipo | Notas |
|---|---|---|
| workspace_id | uuid | |
| ig_username | citext | único por workspace |
| display_name | text | |
| biography | text | |
| avatar_asset_id | uuid → media_assets | cópia do avatar |
| external_url | text | |
| posts_count, followers_count, following_count | int | do último snapshot |
| account_type | enum `business, creator, personal, unknown` | define provider usado |
| import_source | enum `graph_api, fallback, manual` | |
| last_imported_at | timestamptz | cache de 24 h |
| import_status | enum `idle, importing, ok, failed` | |
| import_error | text | mensagem amigável |
| grid_ratio | enum `1:1, 3:4` | proporção das células da grade simulada (o Instagram migrou para 3:4 em 2025) |

### `profile_snapshots` (histórico de cabeçalho)
| Coluna | Tipo |
|---|---|
| profile_id | uuid |
| captured_at | timestamptz |
| data | jsonb (nome, bio, contadores) |

### `imported_posts` (o que já está publicado no Instagram)
| Coluna | Tipo | Notas |
|---|---|---|
| profile_id | uuid | |
| ig_media_id | text | único por perfil |
| media_type | enum `image, carousel, video` | |
| thumb_asset_id | uuid → media_assets | cópia local da miniatura |
| permalink | text | |
| caption | text | |
| published_at | timestamptz | ordena a grade |
| is_hidden | bool | permite "arquivar" visualmente |

### `posts` (publicações planejadas no APROVO)
| Coluna | Tipo | Notas |
|---|---|---|
| profile_id | uuid | |
| kind | enum `post, video` | post = foto ou carrossel (1..10 mídias) |
| status | enum `draft, pending_approval, approved, changes_requested` | ver máquina de estados |
| position | int | ordem na grade entre os planejados; único por perfil |
| caption | text | até 2.200 caracteres |
| hashtags | text[] | normalizadas sem `#` |
| scheduled_for | timestamptz | "data prevista" (calendário fica para depois) |
| notes | text | observações internas, não vão para o cliente |
| archived_at | timestamptz | "Arquivar": some da grade sem apagar; reversível |
| created_by | uuid → auth.users | |
| sent_for_approval_at, approved_at | timestamptz | |

### `post_media` (mídias de uma publicação, ordenadas)
| Coluna | Tipo | Notas |
|---|---|---|
| post_id | uuid | |
| asset_id | uuid → media_assets | |
| sort_order | int | 0 = capa / primeira do carrossel |
| grid_crop | jsonb `{x,y,w,h}` em frações | enquadramento da miniatura na proporção `profiles.grid_ratio` (1:1 ou 3:4) |

### `media_assets`
| Coluna | Tipo | Notas |
|---|---|---|
| workspace_id | uuid | |
| kind | enum `image, video` | |
| original_path | text | Storage, bucket `originals`, nunca alterado |
| preview_path | text | 1080 px, bucket `previews` |
| thumb_path | text | 320 px, bucket `thumbs` |
| poster_path | text | capa de vídeo |
| width, height | int | |
| duration_ms | int | vídeo |
| size_bytes | bigint | |
| mime_type | text | |
| sha256 | text | deduplicação |
| status | enum `uploading, processing, ready, failed` | |

### `approval_requests` (um envio para aprovação)
| Coluna | Tipo | Notas |
|---|---|---|
| profile_id | uuid | |
| created_by | uuid | |
| title | text | "Posts de novembro" |
| message | text | recado para o cliente |
| status | enum `open, partially_decided, decided, revoked` | derivado dos itens |

### `approval_items`
| Coluna | Tipo |
|---|---|
| request_id | uuid |
| post_id | uuid |
| PK (request_id, post_id) | |

### `approval_links`
| Coluna | Tipo | Notas |
|---|---|---|
| request_id | uuid | |
| token_hash | text | SHA-256 do token; único |
| label | text | "WhatsApp do Carlos" |
| expires_at | timestamptz | 30 dias |
| revoked_at | timestamptz | |
| opened_count | int | |
| last_opened_at | timestamptz | |

### `approval_decisions` (auditoria; nunca apagada)
| Coluna | Tipo | Notas |
|---|---|---|
| request_id, post_id | uuid | |
| link_id | uuid → approval_links | **identificação do link utilizado** |
| decision | enum `approved, changes_requested` | |
| comment | text | obrigatório em `changes_requested` |
| approver_name | text | opcional |
| decided_at | timestamptz | **data e horário** |
| ip | inet | |
| user_agent | text | |

### `activity_log` (feed de atividades por perfil)
| Coluna | Tipo |
|---|---|
| profile_id | uuid |
| actor | text (`user:<id>` ou `link:<id>`) |
| event | text (`post.created`, `post.sent`, `approval.approved`, …) |
| payload | jsonb |

## 3. Máquina de estados da publicação

```
            criar            enviar p/ aprovação
  (nenhum) ───────► draft ───────────────────────► pending_approval
                      ▲                                 │        │
                      │ editar                 aprovar  │        │ pedir ajustes
                      │                                 ▼        ▼
                      └─────────────────────── approved   changes_requested
                                                  │              │
                                   (editar reabre)│  editar      │ reenviar
                                                  ▼              ▼
                                               draft ──────► pending_approval
```

Regras:
- Editar mídia ou legenda de uma publicação `approved` volta para `draft` e registra no log
  (a aprovação anterior continua no histórico).
- `changes_requested` mantém o comentário do cliente visível na edição.
- Reenviar cria um **novo** `approval_request` (ou reaproveita o aberto, se o social media
  quiser), sempre com nova decisão.

## 4. Índices e constraints essenciais

- `profiles (workspace_id, ig_username)` único.
- `posts (profile_id, position)` único; reordenação em transação com posições temporárias.
- `imported_posts (profile_id, ig_media_id)` único.
- `approval_links (token_hash)` único.
- `approval_decisions (post_id, decided_at desc)` para pegar a última decisão.
- `media_assets (workspace_id, sha256)` para dedup.

## 5. Políticas RLS (resumo)

| Tabela | select | insert/update/delete |
|---|---|---|
| workspaces, profiles, posts, post_media, media_assets, imported_posts, activity_log, approval_requests, approval_items, approval_links | membro do workspace | membro com role `owner` ou `editor` |
| approval_decisions | membro do workspace | **nenhum** (nem membro, nem anon); só a função `decide_approval(token, …)` com `security definer`, chamada pelo Route Handler `/api/approval/[token]/decide`, insere |
| Página pública `/a/[token]` | usa `service_role` no servidor, lendo apenas o que o request contém | — |

## 6. Storage (buckets)

| Bucket | Público? | Conteúdo |
|---|---|---|
| `originals` | não | arquivos enviados, intactos |
| `previews` | não | 1080 px |
| `thumbs` | não | 320 px, já com o corte da grade |
| `ig-cache` | não | avatar e miniaturas importadas do Instagram |

Caminho: `<workspace_id>/<asset_id>/<nome>`. Acesso só por URL assinada.


\newpage

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


\newpage

# 05 · Roadmap, épicos e estimativas

Estimativas para **1 dev full-stack** trabalhando com Claude Code, em dias úteis. Com 2 devs os
épicos 3, 4 e 5 correm em paralelo e o total cai para ~6 semanas.

## Resumo

| Fase | Épicos | Dias | Entrega |
|---|---|---|---|
| 0 · Fundação | E0 | 3 | Repo, CI, Supabase, design system, deploy vazio |
| 1 · Perfil e feed | E1, E2 | 8 | Conectar @ e ver o feed simulado (Telas 01, 02) |
| 2 · Publicações | E3, E4 | 10 | Criar post/vídeo, upload, detalhe, edição (Telas 03, 04, 05) |
| 3 · Organização | E5 | 4 | Drag & drop, status, filtros (Tela 06) |
| 4 · Aprovação | E6, E7 | 8 | Link público, decisão, realtime, auditoria (Telas 05, 07) |
| 5 · Lançamento | E8 | 5 | PWA, e-mails, QA em dispositivos, piloto com 3 clientes |
| **Total** | | **38 dias ≈ 8 semanas** | |

## Épicos e tarefas

### E0 · Fundação (3 d)
- [ ] `create-next-app` com TypeScript, App Router, Tailwind, ESLint, Prettier
- [ ] shadcn/ui + tokens do design system (`docs/09-design-system.md`), Poppins, Lucide
- [ ] Projeto Supabase (local + staging), Drizzle, primeira migration (workspaces, members, profiles)
- [ ] Auth (e-mail mágico + Google), middleware de proteção de rotas, criação do workspace
- [ ] CI no GitHub Actions: lint, typecheck, vitest; deploy preview na Vercel
- [ ] Sentry (`SENTRY_DSN`), variáveis de ambiente documentadas em `.env.example`

### E1 · Integração Instagram (5 d)
- [ ] Interface `InstagramProvider` (`fetchProfile`, `fetchMedia`)
- [ ] Implementação Graph API Business Discovery com token do APROVO
- [ ] Implementação fallback (provedor de scraping) atrás de feature flag
- [ ] Importação manual (upload de imagens + formulário)
- [ ] Cópia de avatar/miniaturas para o bucket `ig-cache`
- [ ] Cache 24 h, botão "Atualizar feed", tratamento de erros amigável
- [ ] Testes unitários do mapeamento de resposta → `imported_posts`

### E2 · Perfil e feed simulado (3 d)
- [ ] Tela 01 (formulário, estados, confirmação)
- [ ] Componentes `ProfileHeader`, `ProfileTabs`, `FeedGrid`, `GridCell` (badges carrossel/vídeo)
- [ ] Lista de perfis e navegação (barra inferior / sidebar)
- [ ] Proporção da grade configurável (1:1 / 3:4)

### E3 · Mídia (5 d)
- [ ] Upload direto com URL assinada (resumível/TUS para vídeo), progresso, retry, limites (30 MB imagem, 300 MB e 90 s vídeo)
- [ ] Route Handler de processamento com `sharp` (thumb 320 c/ crop, preview 1080, HEIC)
- [ ] Captura de capa de vídeo no navegador + escolha de frame
- [ ] Editor de enquadramento da miniatura (`grid_crop`) com pinça/arrastar
- [ ] Status do asset e dedup por sha256
- [ ] Testes: pipeline de imagem com fixtures

### E4 · Publicações (5 d)
- [ ] Folha "Adicionar" (Post / Vídeo) e seletor de mídias com tira reordenável
- [ ] CRUD de `posts` + `post_media` (Server Actions + Zod)
- [ ] Tela 05: legenda, hashtags em chips, data prevista, observações, mini prévia
- [ ] Tela 04: detalhe ampliado (carrossel com swipe, player de vídeo)
- [ ] Ações: salvar rascunho, arquivar, excluir, ocultar importado
- [ ] `activity_log` básico (post.created, post.updated, post.sent)

### E5 · Organização do feed (4 d)
- [ ] dnd-kit na grade (toque com pressão longa, autoscroll), ordem otimista + desfazer
- [ ] `reorderPosts` em transação
- [ ] Pílulas de status, filtros, "Modo cliente", multi-seleção
- [ ] Alternativa acessível (mover para cima/baixo)

### E6 · Aprovação (6 d)
- [ ] Tabelas `approval_*`, função `decide_approval` (security definer), Route Handler `/api/approval/[token]/decide`, rate limit (10 decisões/min por IP e por token)
- [ ] Folha "Compartilhar link": escopo, título, recado, geração do token, copiar/WhatsApp/share
- [ ] Página pública `/a/[token]` SSR com Open Graph, feed destacado, detalhe, decisões
- [ ] `ApprovalBar`: nome do aprovador, comentário obrigatório em ajustes, "Aprovar todos"
- [ ] Páginas de link expirado/revogado; revogar e regenerar link
- [ ] Testes e2e Playwright: enviar → abrir link → aprovar → status atualizado

### E7 · Retorno em tempo real e histórico (2 d)
- [ ] Supabase Realtime por perfil, toasts, invalidação do TanStack Query
- [ ] Tela "Aprovações": envios, links, aberturas, decisões (data, hora, link, comentário)
- [ ] Eventos de aprovação no `activity_log` e exibição no detalhe da publicação

### E8 · Lançamento (5 d)
- [ ] PWA: manifest, ícones, splash, `display: standalone`, atualização de versão
- [ ] E-mails Resend: link mágico customizado, "cliente decidiu"
- [ ] QA em iOS Safari, Android Chrome, desktop; performance (LCP da página pública)
- [ ] Política de privacidade e termos (necessários também para o app na Meta)
- [ ] Piloto com 3 perfis reais da CPCann; ajustes
- [ ] Produção: domínio, Supabase Pro, backups

## Marcos de demonstração

| Marco | Quando | O que mostrar |
|---|---|---|
| M1 | fim da fase 1 | Digitar @ e ver o feed do cliente no celular |
| M2 | fim da fase 2 | Adicionar carrossel e vídeo, ver na grade e no detalhe |
| M3 | fim da fase 3 | Arrastar e reorganizar com status |
| M4 | fim da fase 4 | Mandar link pelo WhatsApp e ver a aprovação chegar ao vivo |
| M5 | fim da fase 5 | App instalado na tela inicial, piloto rodando |

## Etapas futuras (fora da primeira etapa)

1. **Calendário completo** (visão mês/semana, arrastar entre datas).
2. **Publicação e agendamento no Instagram** via Instagram Login do cliente + Content Publishing
   API (requer App Review na Meta e conta profissional do cliente).
3. Stories e destaques; informações de perfil editáveis na simulação.
4. Comentários em thread no link e marcação na imagem.
5. Notificações push (Web Push) e WhatsApp (API oficial).
6. Planos e cobrança (Stripe), limites por workspace, membros com papéis.
7. Outras redes.


\newpage

# 06 · Referência de uso: My Feed · Grid Preview & Planner

App iOS da Bigrowth (App Store id 1532504123). As capturas de tela do briefing (Telas 01 a 06)
são do próprio MyFeed em português de Portugal, então os padrões abaixo marcados **[briefing]**
estão confirmados pelas imagens. O que vem só de trechos de busca está marcado **[busca]**; o
que é dedução de apps do mesmo tipo está marcado **[inferido]**.

> Observação de pesquisa: a rede desta sessão bloqueia `apps.apple.com` e sites de análise de
> apps, então a ficha da loja não pôde ser lida diretamente.

## 1. Onboarding e conexão do perfil **[briefing]**

- Tela inicial mostra um perfil "vazio" simulado (`account1`, "Nome", 0 posts, 100 seguidores,
  100 seguindo, "Categoria", "Bio", botões Seguir/Mensagem, bolha "Destaque", abas grade/reels/
  marcados e uma célula "+" na grade) com um botão em gradiente do Instagram
  **"Conectar o Instagram"** no rodapé.
- Ao tocar, abre uma folha "Conectar o Instagram" com o texto **"Introduza o nome de utilizador
  do Instagram para carregar o seu feed (apenas contas públicas)"**, um campo com prefixo `@`
  e um botão "Continuar".
- Ou seja: **não há login do cliente**; o app carrega o feed público a partir do @. É exatamente
  o modelo que o briefing pede para o APROVO.
- Depois de carregar (Tela 02), o cabeçalho traz foto, nome, contadores reais, bio com links,
  handle do Threads, e a grade com os posts reais e os selos de vídeo.

## 2. Tela principal (perfil simulado) **[briefing]**

- Reprodução quase literal do perfil do Instagram: barra superior com `@ ▾` e ícones de
  compartilhar, check, histórico, "+" e menu; cabeçalho; botões Seguir/Mensagem (decorativos);
  destaques; abas; grade de 3 colunas sem espaçamento visível.
- Selos nas miniaturas: ícone de play (reels/vídeo) e de carrossel.
- Posts planejados entram **no topo da grade** (Tela 06: os três primeiros itens são os novos),
  empurrando os publicados para baixo, como o Instagram faria.

## 3. Adicionar conteúdo **[briefing]**

- O ícone "+" abre a folha inferior **"Adicionar"** com: **Post**, **Vídeo do Reels**,
  **História**, **Destaques das histórias**, **Informações de perfil**.
  O briefing do APROVO limita a **Post** e **Vídeo**.
- Ao escolher Post abre "Nova publicação" com duas abas: **"Galeria"** (fotos do celular) e
  **"Mar. de posição"** (marcador de posição = *placeholder*, um quadrado colorido para reservar
  lugar na grade antes de ter a mídia).
- O seletor "Recentes ▾" mostra a galeria do aparelho com três ícones no canto: selecionar
  (check), múltiplos (carrossel) e grade. Multi-seleção monta o carrossel.
- A nova mídia aparece **imediatamente na grade** (Tela 04: o print do mapa entra na primeira
  célula) com a folha "Recentes" ainda aberta para continuar adicionando.

## 4. Organizar a grade **[briefing]** + **[busca]**

- Reordenação por **arrastar e soltar** na grade (confirmado em descrições do app).
- Ao selecionar uma célula planejada aparece a barra de ações: **Partilhar · Detalhes · Ver ·
  Arquivar · Excluir** (Tela 04). "Arquivar" tira da grade sem apagar; "Ver" abre ampliado.
- **[inferido]** Planejados e publicados são distinguidos de forma sutil (o MyFeed não mostra
  status, porque não tem aprovação). O APROVO precisa de pílulas de status mais explícitas.

## 5. Detalhes e edição do post **[briefing]**

- Tela "Post" com a mídia grande e um botão **"Editar"** sobre ela (recorte/enquadramento).
- Campos: **"Escreva uma legenda..."**, chip **"# Hashtags"**, interruptor **"Agendar"** com
  data e hora ("nov. 4, 2026 às 23:04"), item **"Melhor altura para partilhar >"** (sugestão
  de horário) e o botão em gradiente **"Publicar no Instagram"** no rodapé.
- O APROVO troca o botão final por **"Salvar rascunho"** e **"Enviar para aprovação"**.

## 6. Múltiplas contas, compartilhamento e colaboração

- O seletor `@ ▾` no topo sugere troca entre contas **[briefing, inferido pelo ícone]**.
- Não há indício de colaboração, comentários ou aprovação por cliente **[busca]**. É o espaço
  de diferenciação do APROVO.

## 7. Monetização **[busca]**

- Gratuito com compras no app; recursos completos exigem assinatura. Uma avaliação em
  português reclama de "só consegui usar uma vez" (limite do plano gratuito sem aviso claro).

## 8. Dores conhecidas **[busca]** + **[inferido]**

- Limites do plano gratuito mal comunicados.
- Carregamento de feed depende de métodos não oficiais; sujeito a quebrar quando o Instagram
  muda (o MyFeed não pede login, então usa algum caminho de leitura pública).
- Aviso de que "nada aqui altera o Instagram real" aparece só como alerta simples.

## Padrões que vale copiar no APROVO

1. Conectar só pelo `@`, com o aviso "apenas contas públicas" e sem pedir senha.
2. Perfil simulado fiel, inclusive botões decorativos, para o cliente reconhecer na hora.
3. Novos conteúdos entram no topo da grade e reorganizam o feed imediatamente.
4. Folha "Adicionar" com poucas opções (Post, Vídeo) e seletor nativo da galeria.
5. Mídia aparece na grade antes de preencher a legenda; a edição vem depois.
6. Barra de ações da célula: Ver · Detalhes · Arquivar · Excluir (+ Compartilhar link).
7. Botão "Editar" sobre a mídia para enquadrar a miniatura.
8. Legenda, hashtags em chip e data/hora numa única tela de edição.
9. Placeholder ("marcador de posição") é útil para planejar estética; fica como etapa futura.
10. Selos de vídeo e carrossel nas miniaturas.

## O que o APROVO faz diferente

- Status visível por publicação (rascunho, aguardando, aprovada, ajustes).
- Link de aprovação para o cliente, sem conta, com registro de data, hora e link.
- Comentário de ajustes anexado à publicação.
- Vários perfis de clientes por social media, com separação por workspace.
- Fonte de dados oficial (Graph API) quando possível, com fallback explícito.

## Fontes

- Briefing do App APROVO (PDF, 12 páginas) com capturas do MyFeed.
- Resultados de busca sobre "My Feed・Grid Preview & Planner" (ficha da App Store em vários
  países, spark.mwm.ai, screensdesign.com), lidos apenas como trechos.


\newpage

# 07 · Como carregar o feed do Instagram pelo @ (estado em novembro de 2026)

Pesquisa feita com busca web e conhecimento prévio. A rede desta sessão bloqueia
`developers.facebook.com`, então os pontos marcados **[confirmar]** precisam ser conferidos na
documentação oficial antes da fase 1. Nada aqui muda a arquitetura; muda só detalhes de campos
e limites.

## 1. O que não existe mais

- **Instagram Basic Display API**: desligada em **4 de dezembro de 2024**. Era a API "leve" para
  contas pessoais lerem a própria mídia. Nunca serviu para ler perfis de terceiros.
- **Contas pessoais** não conectam mais a apps de terceiros. Só contas **profissionais**
  (Business ou Creator) conseguem autorizar um app.

## 2. As duas APIs oficiais atuais

| | Instagram API **com Instagram Login** | Instagram API **com Facebook Login** |
|---|---|---|
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Conta necessária | Profissional; **não** exige Página do Facebook | Profissional **ligada a uma Página** |
| Escopos principais | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages` | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` |
| Quem usa sem App Review | Usuários com **papel no app** (admin, developer, tester) enquanto o app está em modo Desenvolvimento / Standard Access **[confirmar]** | Idem |
| Para clientes externos | App Review + verificação do negócio (Advanced Access) | Idem |

## 3. Business Discovery: o caminho para "digitar o @"

`GET /{ig-user-id}?fields=business_discovery.username(<alvo>){username,name,biography,
profile_picture_url,website,followers_count,follows_count,media_count,
media{id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,
comments_count,children{media_url,media_type}}}`

- **Continua disponível** (a doc da versão Facebook Login foi atualizada em agosto de 2026).
  Disponibilidade na versão Instagram Login: **[confirmar]**; se não houver, usar Facebook Login.
- `{ig-user-id}` é a conta profissional **do próprio APROVO** (conta ponte da CPCann). O alvo
  pode ser **qualquer conta Business ou Creator pública**. O cliente não faz login.
- **Limitação principal:** se o alvo for **conta pessoal**, a chamada falha. É o motivo do
  fallback e da importação manual.
- `media` devolve até 25–50 itens por página com paginação por cursor **[confirmar]**.
- `media_url` e `thumbnail_url` apontam para o CDN do Instagram e **expiram** (horas a dias).
  Por isso o APROVO **copia avatar e miniaturas para o próprio Storage** no momento da
  importação.
- Alguns campos de vídeo podem vir vazios em mídia de terceiros (reels com download desativado).
- Rate limit: contabilizado no limite de chamadas do app (BUC); não há número fixo publicado para
  business discovery **[confirmar]**. Com cache de 24 h por perfil, o uso é baixo.
- Permissões: `instagram_basic` + `pages_show_list` + `pages_read_engagement` (Facebook Login)
  ou `instagram_business_basic` (Instagram Login) **[confirmar]**.

### Como provisionar (fase 1)

1. Conta do Instagram do APROVO/CPCann convertida em **Profissional** (Business).
2. Página do Facebook ligada a ela (necessária na versão Facebook Login).
3. App em **developers.facebook.com** com o produto Instagram; João como admin.
4. Gerar token de usuário no Graph API Explorer com os escopos acima e trocar por **token de
   longa duração (60 dias)**; agendar renovação automática (cron semanal) no servidor.
5. Guardar `META_GRAPH_ACCESS_TOKEN` e `META_IG_USER_ID` nas variáveis do servidor.

## 4. Publicar e agendar (fases futuras)

- **Content Publishing API** publica imagem, carrossel (até 10 itens), reels e stories, em duas
  etapas: criar *container* → `media_publish`.
- A mídia precisa estar em **URL pública** no momento da publicação (o APROVO gera URL assinada
  temporária do Storage).
- Limite por conta: a doc atual cita **100 publicações por 24 h** (já foi 25 e 50; consultar
  `/{ig-id}/content_publishing_limit`).
- **Não há agendamento nativo**: o APROVO precisa do próprio agendador (cron + fila).
- Exige que **o cliente autorize o app** (OAuth com Instagram Login) e escopo de publicação, o
  que exige **App Review** para contas que não têm papel no app. Por isso fica fora do MVP.

## 5. oEmbed

Devolve HTML de incorporação e metadados de **um post** público. Exige a feature "Meta oEmbed
Read" com App Review. Não retorna perfil nem lista de posts, então não serve para montar a grade.
Pode ser útil no futuro para "abrir no Instagram" com prévia.

## 6. Fallback por provedores de terceiros (scraping gerenciado)

| Provedor | Preço aproximado | Observações |
|---|---|---|
| Apify `apify/instagram-scraper` | US$ 1,5–2,7 por 1.000 itens | Actor oficial da Apify; issues públicos de quebras ocasionais |
| ScrapeCreators | US$ 1–1,9 por 1.000 requisições | API simples por @; benchmark do próprio fornecedor |
| HikerAPI, RapidAPI "instagram-scraper" | não verificado | Variam muito em estabilidade |

Riscos: viola os Termos de Uso do Instagram, quebra quando o Instagram muda, e há questões de
LGPD ao coletar dados de terceiros. Posição do plano: implementar atrás de **feature flag**,
desligado por padrão, e só ligar com decisão do João (idealmente com parecer jurídico).

## 7. Mudanças recentes a acompanhar

- Dez/2024: fim da Basic Display.
- Jan/2025: objeto Media perde `filter_name`, `location`, `latitude`, `longitude`.
- Abr/2025: "oEmbed Read" vira "Meta oEmbed Read".
- Ago/2026: doc de Business Discovery atualizada (conteúdo não lido nesta sessão).
- Verificar o changelog da Graph API (versão vigente e datas de depreciação) **[confirmar]**.

## 8. Recomendação para o MVP

| Opção | Cobertura | Custo | Risco | Esforço |
|---|---|---|---|---|
| **Business Discovery (conta ponte)** | Business/Creator públicas (maioria dos clientes de social media) | Grátis | Baixo | Médio (app Meta + token) |
| OAuth do cliente (Instagram Login) | Só quem autorizar | Grátis | Baixo | Médio; necessário para publicar |
| oEmbed | Um post por vez | Grátis | Baixo (Review) | Não monta grade |
| Scraping gerenciado | Quase qualquer conta pública | ~US$ 1–3 / 1.000 | Alto (ToS, quebras, LGPD) | Baixo integrar, alto manter |
| Importação manual | Qualquer conta | Zero | Nenhum | Baixo |

**Decisão (ADR-003):** Business Discovery como principal; importação manual sempre disponível;
scraping atrás de flag; OAuth + publicação só na fase de publicação.

## Interface do provedor (para implementação)

```ts
export interface InstagramProvider {
  fetchProfile(username: string): Promise<IgProfile | IgError>;
  fetchMedia(username: string, cursor?: string): Promise<IgMediaPage | IgError>;
}
export type IgError =
  | { code: "not_found" }
  | { code: "private_or_personal" }
  | { code: "rate_limited"; retryAfterSec: number }
  | { code: "provider_down"; message: string };
```

Implementações: `GraphBusinessDiscoveryProvider`, `ScrapingProvider` (flag), `ManualImport`
(não é provider; é um formulário).

## Fontes consultadas (via trechos de busca)

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.facebook.com/docs/instagram-platform/oembed
- https://developers.facebook.com/docs/features-reference/meta-oembed-read
- https://smashballoon.com/instagram-is-shutting-down-basic-display-api-continue-displaying-instagram-feeds-on-your-site/
- https://www.getphyllo.com/post/instagram-api-guide
- https://apify.com/apify/instagram-scraper
- https://scrapecreators.com/blog/apify-instagram-scraper-benchmark


\newpage

# 08 · Decisões de arquitetura (ADRs) e riscos

## Decisões

### ADR-001 · Web app PWA em vez de app nativo
**Contexto:** briefing pede mobile-first e aprovação sem conta; equipe pequena.
**Decisão:** Next.js + PWA. **Consequências:** sem loja de apps, link universal funciona; galeria
e vídeo via `<input type="file">` (sem acesso contínuo à biblioteca de fotos). Reavaliar Expo se
o piloto mostrar limitação.

### ADR-002 · Supabase como backend único
**Contexto:** precisamos de auth, Postgres, storage e tempo real rapidamente.
**Decisão:** Supabase com RLS. **Consequências:** lock-in moderado (Postgres padrão mitiga);
Realtime resolve a Tela 07 sem WebSocket próprio.

### ADR-003 · Business Discovery como fonte principal do feed importado
**Contexto:** Basic Display API foi descontinuada; o briefing pede "só o @, contas públicas".
**Decisão:** usar a Graph API com o token da conta profissional do próprio APROVO; cobre contas
business/creator públicas sem o cliente fazer login. Fallback por provedor de scraping atrás de
flag, e importação manual sempre disponível. **Consequências:** contas pessoais não importam
automaticamente; dependência de um app Meta configurado. Detalhes em `docs/07-instagram-api.md`.

### ADR-004 · Originais imutáveis, derivados gerados no servidor
**Decisão:** o arquivo enviado nunca é alterado; miniatura e prévia são derivadas por `sharp`.
**Consequências:** custo de storage maior; garante o requisito "preservar a qualidade".

### ADR-005 · Link de aprovação com token aleatório hasheado
**Decisão:** token de 256 bits, guardado como hash, expiração de 30 dias, revogável, e decisão
registrada com link, data/hora, IP e user agent. **Consequências:** sem senha, sem conta, mas
quem tem o link decide; o social media escolhe com quem compartilha.

### ADR-006 · Decisão por publicação, não só por conjunto
**Decisão:** cada item do envio recebe sua própria decisão; o conjunto deriva o status.
**Consequências:** mais granular para o cliente; UI precisa de "Aprovar todos".

### ADR-007 · Planejados ficam no topo da grade
**Decisão:** publicações planejadas ocupam as primeiras posições; reordenação só entre elas.
**Consequências:** fiel ao Instagram (novo em cima); ancoragem entre importados fica para depois.

## Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Business Discovery não cobre contas pessoais ou muda de regra | Alta | Alto | Fallback por provedor + importação manual; UI explica a limitação; cache local de tudo importado |
| R2 | Provedor de scraping instável ou com risco de ToS | Média | Médio | Atrás de feature flag; nunca único caminho; limitar a uso sob demanda |
| R3 | Upload de vídeo grande falha em 4G | Média | Médio | Upload direto resumível (TUS do Supabase), limite 300 MB, retry |
| R4 | HEIC/iOS gera erros de processamento | Média | Baixo | `sharp` com libheif; fallback de conversão no navegador |
| R5 | Grade divergente do Instagram (mudança de proporção 1:1 → 3:4) | Alta | Baixo | Proporção configurável por perfil (`profiles.grid_ratio`) |
| R6 | Link vaza e terceiro aprova | Baixa | Médio | Expiração, revogação, nome do aprovador, IP/UA registrados, opção futura de PIN |
| R7 | Custo de storage com originais de vídeo | Média | Médio | Política de expurgo de originais após X dias da aprovação (etapa futura) |
| R8 | PWA no iOS sem notificações confiáveis | Alta | Baixo | Realtime enquanto aberto + e-mail; push fica para depois |
| R9 | Escopo cresce para calendário/publicação | Média | Alto | Briefing adia explicitamente; roadmap separa etapas |

## Dependências externas a providenciar

| Item | Responsável | Quando |
|---|---|---|
| Conta profissional do Instagram do APROVO/CPCann ligada a uma Página do Facebook | João | antes da fase 1 |
| App na Meta for Developers (modo dev) com produto Instagram e token de longa duração | João + dev | fase 1 |
| Projeto Supabase (staging e produção) | dev | fase 0 |
| Conta Vercel e domínio (ex.: aprovo.app ou aprovo.cpcann.com) | João | fase 0 |
| Resend com domínio verificado | dev | fase 5 |
| Política de privacidade e termos publicados (exigência da Meta) | João | fase 5 |
| Logo em SVG e ícones do PWA | design | fase 0 |


\newpage

# 09 · Design system

Base: slide "Identidade visual" do briefing. Tudo que não é a simulação do Instagram usa estes
tokens. A simulação do Instagram usa as cores do próprio Instagram (fundo branco, texto preto,
botão azul aproximado `#4150F7`) para ser fiel.

## Cores

| Token | Hex | Uso |
|---|---|---|
| `--aprovo-roxo` | `#6A00FF` | Ações primárias, títulos, ícones ativos, FAB |
| `--aprovo-roxo-apoio` | `#9B3CFF` | Status "Aguardando aprovação", hover, gradientes |
| `--aprovo-verde` | `#22E688` | Status "Aprovada", botão Aprovar, confirmações |
| `--aprovo-lavanda` | `#EDE7FF` | Fundos de cartão, botão secundário, status "Ajustes solicitados" |
| `--aprovo-offwhite` | `#F8F7FF` | Fundo de página |
| `--aprovo-ink` | `#1C1633` | Texto principal (escuro com tom roxo) |
| `--aprovo-ink-2` | `#6B6584` | Texto secundário |
| `--aprovo-borda` | `#DDD6F3` | Bordas e divisores |
| `--aprovo-erro` | `#FF3B5C` | Erros e exclusão |

Dark mode: fora do MVP (o Instagram simulado continua claro). Preparar tokens em `:root` para
não bloquear.

## Status de publicação

| Status | Fundo | Texto | Ícone (Lucide) |
|---|---|---|---|
| Rascunho | `#FFFFFF` borda `--aprovo-borda` | `--aprovo-ink-2` | `pencil` |
| Aguardando aprovação | `--aprovo-roxo-apoio` | branco | `clock` |
| Aprovada | `--aprovo-verde` | `--aprovo-ink` | `check` |
| Ajustes solicitados | `--aprovo-lavanda` | `--aprovo-roxo` | `message-circle` |

## Tipografia

Poppins (Google Fonts via `next/font`): **Bold** para títulos, **SemiBold** para botões e
rótulos, **Regular** para corpo.

| Papel | Tamanho / linha | Peso |
|---|---|---|
| Título de tela | 24 / 32 | Bold |
| Subtítulo | 18 / 26 | SemiBold |
| Corpo | 15 / 22 | Regular |
| Rótulo / pílula | 12 / 16 | SemiBold, caixa alta opcional |

Na simulação do Instagram a fonte é a do sistema (`-apple-system, Roboto`) para parecer real.

## Formas e espaçamento

- Raio: botões e pílulas 999 px (totalmente arredondados); cartões 16 px; células da grade 0.
- Espaçamento base 4 px; gutters de página 16 px; grade do feed com gap 2 px como o Instagram.
- Sombras suaves só em folhas inferiores e FAB.

## Componentes base (shadcn/ui customizados)

`Button` (primary roxo, secondary lavanda, success verde, ghost), `Sheet` (folha inferior),
`Chip`, `StatusPill`, `Avatar`, `Skeleton`, `Toast`, `Dialog`, `Input`, `Textarea`,
`TagInput` (hashtags), `DateTimePicker` simples, `ProgressBar`.

## Componentes do feed

`ProfileHeader`, `ProfileTabs`, `FeedGrid`, `GridCell` (badge carrossel/vídeo + `StatusPill`),
`PostDetail` (carrossel com swipe, player), `MediaStrip` (tira reordenável), `CropEditor`
(enquadramento da miniatura), `ApprovalBar` (Aprovar / Pedir ajustes).

## Ícones

Lucide, `stroke-width: 1.75`, tamanho 24 na navegação e 20 em botões. Ícone do app: o check
verde do logo sobre roxo principal.

## Assets necessários

- Logo APROVO em SVG (horizontal e símbolo).
- Ícones PWA 192/512 px e máscara (maskable), splash iOS.
- Imagem Open Graph padrão para links de aprovação (1200×630).


\newpage

