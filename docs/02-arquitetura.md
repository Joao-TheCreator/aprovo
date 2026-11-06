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
