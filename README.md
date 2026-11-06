# APROVO

**Planeje. Aprove. Publique.** Web app mobile-first para social medias montarem o feed do
Instagram dos clientes, organizarem as próximas publicações e colherem a aprovação por um link,
sem o cliente precisar de conta.

Estado: **Fases 0 e 1 concluídas** (fundação; conectar perfil, importação manual e feed simulado). A importação
automática pela Graph API está implementada e testada com fixtures, aguardando a conta ponte da Meta. Próxima: Fase 2, publicações.

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

## Como trabalhar neste repositório com Claude Code

Ver [CLAUDE.md](CLAUDE.md): convenções do projeto e a política de uso de modelos (Fable para
planejamento e arquitetura; Sonnet para implementação; Haiku para tarefas mecânicas).
