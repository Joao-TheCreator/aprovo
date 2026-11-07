# APROVO

**Planeje. Aprove. Publique.** Web app mobile-first para social medias montarem o feed do
Instagram dos clientes, organizarem as próximas publicações e colherem a aprovação por um link,
sem o cliente precisar de conta.

Estado: **MVP completo em código** (Fases 0 a 4 e a maior parte da 5): perfil e feed, publicações, organização da grade,
links de aprovação com página pública e tempo real, conexão OAuth com o Instagram, páginas legais, exclusão e
exportação de conta. Falta: deploy na Vercel, app na Meta, revisão jurídica e piloto (ver `docs/10-deploy-e-meta.md`).

## Documentos

| Doc | Conteúdo |
|---|---|
| [01 · Visão e escopo](docs/01-visao-e-escopo.md) | Problema, produto, usuários, o que entra e o que fica de fora do MVP, métricas, perguntas em aberto |
| [02 · Arquitetura](docs/02-arquitetura.md) | Stack (Next.js + Postgres + Auth.js + R2), módulos, fluxos técnicos, segurança, ambientes |
| [03 · Modelo de dados](docs/03-modelo-de-dados.md) | Tabelas, máquina de estados da publicação, RLS, buckets |
| [04 · Telas e fluxos](docs/04-telas-e-fluxos.md) | Rotas, cada tela do briefing com elementos, estados, regras e critérios de aceite |
| [05 · Roadmap](docs/05-roadmap.md) | Fases, épicos, tarefas, estimativas (≈ 8 semanas, 1 dev) e marcos |
| [06 · Referência MyFeed](docs/06-referencia-myfeed.md) | Padrões de uso do app My Feed que o APROVO copia e onde se diferencia |
| [07 · API do Instagram](docs/07-instagram-api.md) | Como carregar o feed pelo @ (Business Discovery), fallbacks, publicação futura |
| [08 · Decisões e riscos](docs/08-decisoes-e-riscos.md) | ADRs, riscos com mitigação, dependências externas a providenciar |
| [09 · Design system](docs/09-design-system.md) | Cores, tipografia, status, componentes |
| [10 · Deploy e Meta](docs/10-deploy-e-meta.md) | Passo a passo: Neon, R2, Resend, Google, Vercel, app na Meta e conexão da conta do Instagram |
| [11 · Passagem de bastão](docs/11-passagem-de-bastao.md) | Estado real da infra (Neon, R2, Resend, Google, Vercel) e o que falta na Meta |
| [Legal](docs/legal/README.md) | Rascunhos de Política de Privacidade, Termos de Uso e Instruções de exclusão de dados (LGPD + exigências da Meta) |

## Resumo do que precisamos

**Produto (MVP, "primeiro o essencial")**
1. Login do social media e vários perfis de clientes.
2. Conectar perfil público pelo `@` e ver o perfil e o feed como no Instagram.
3. Adicionar Post (foto/carrossel) e Vídeo a partir da galeria, preservando os originais.
4. Reorganizar a grade por arrastar e soltar, com status por publicação.
5. Editar legenda, hashtags e data prevista; salvar rascunho ou enviar para aprovação.
6. Link de aprovação sem conta; aprovação registrada com data, hora e link; retorno em tempo real.

Fora desta etapa: calendário completo, publicar/agendar no Instagram, stories.

**Tecnologia**
Next.js 16 + TypeScript + Tailwind + shadcn/ui + dnd-kit · Postgres (Neon) + Drizzle · Auth.js ·
Cloudflare R2 (S3) · SSE · sharp · Meta Graph API (Business Discovery) · Vercel Hobby · Resend ·
Sentry · PWA. Engine própria e portável; tudo em tier gratuito no piloto (R$ 0).

**Providências externas**
Conta ponte do Instagram (perfil do João convertido em Criador de conteúdo); app na Meta for
Developers (depois, com Claude Cowork); contas gratuitas em Vercel, Neon e Cloudflare R2; sem
domínio por enquanto; logo do briefing em `assets/brand/`; documentos legais rascunhados em
`docs/legal/` para revisão de advogado(a).

## Desenvolvimento local

Requisitos: Node 22, pnpm 10 e um Postgres 16 (local ou Neon).

```bash
cp .env.example .env.local   # preencha DATABASE_URL, AUTH_SECRET e, se tiver, RESEND_API_KEY
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

Scripts úteis: `pnpm check` (lint + typecheck + testes), `pnpm db:generate` (nova migration a
partir de `db/schema`), `pnpm db:studio`, `pnpm icons:generate` (ícones do PWA a partir do logo).
Os testes usam `DATABASE_URL_TEST` e truncam as tabelas entre casos.

Sem `RESEND_API_KEY`, o link mágico não é enviado; para testar a área logada em desenvolvimento,
insira uma linha em `users` e outra em `sessions` e use o cookie `authjs.session-token`.

## Testes

**Unitários e de integração (Vitest).** Precisam de um Postgres vazio apontado por
`DATABASE_URL_TEST`; as tabelas são truncadas entre os casos, então nunca use o banco de
desenvolvimento.

```bash
DATABASE_URL_TEST=postgres://aprovo:aprovo@localhost:5432/aprovo_test pnpm test
```

**Ponta a ponta (Playwright, `tests/e2e/`).** Rodam contra o build de produção (`next start`) e um
Postgres já migrado. Cenários: enviar para aprovação, aprovar pelo link da pessoa, agendar e
publicar pelo cron com o publicador falso; e conexão expirada, falha e reagendamento. Nada fala com
a Meta nem com o Resend. Localmente é preciso:

1. Um Postgres com banco de teste migrado (`DATABASE_URL=... pnpm db:migrate`).
2. Instalar o Chromium uma vez: `pnpm exec playwright install chromium`.
3. Exportar as variáveis abaixo (o mesmo conjunto do job `e2e` em `.github/workflows/ci.yml`),
   construir e rodar:

```bash
export DATABASE_URL=postgres://aprovo:aprovo@localhost:5432/aprovo_test
export AUTH_SECRET=e2e-auth-secret AUTH_URL=http://localhost:3000 AUTH_TRUST_HOST=true
export APP_URL=http://localhost:3000 STORAGE_DRIVER=local
export IG_PUBLISHER=fake IG_PUBLISH_ENABLED=true CRON_SECRET=e2e-secret
export META_APP_ID=dummy META_APP_SECRET=dummy
pnpm build && pnpm e2e
```

`pnpm e2e:ui` abre o modo interativo. Sem `RESEND_API_KEY` os e-mails são ignorados. Os testes
criam usuários `e2e-*@x.co` (e os recriam a cada execução); use um banco descartável.

## Como trabalhar neste repositório com Claude Code

Ver [CLAUDE.md](CLAUDE.md): convenções do projeto e a política de uso de modelos (Fable para
planejamento e arquitetura; Sonnet para implementação; Haiku para tarefas mecânicas).
