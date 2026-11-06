# APROVO

**Planeje. Aprove. Publique.** Web app mobile-first para social medias montarem o feed do
Instagram dos clientes, organizarem as próximas publicações e colherem a aprovação por um link,
sem o cliente precisar de conta.

Este repositório está na fase de **planejamento**. O código começa na Fase 0 do roadmap.

## Documentos

| Doc | Conteúdo |
|---|---|
| [01 · Visão e escopo](docs/01-visao-e-escopo.md) | Problema, produto, usuários, o que entra e o que fica de fora do MVP, métricas, perguntas em aberto |
| [02 · Arquitetura](docs/02-arquitetura.md) | Stack (Next.js + Supabase), módulos, fluxos técnicos, segurança, ambientes |
| [03 · Modelo de dados](docs/03-modelo-de-dados.md) | Tabelas, máquina de estados da publicação, RLS, buckets |
| [04 · Telas e fluxos](docs/04-telas-e-fluxos.md) | Rotas, cada tela do briefing com elementos, estados, regras e critérios de aceite |
| [05 · Roadmap](docs/05-roadmap.md) | Fases, épicos, tarefas, estimativas (≈ 8 semanas, 1 dev) e marcos |
| [06 · Referência MyFeed](docs/06-referencia-myfeed.md) | Padrões de uso do app My Feed que o APROVO copia e onde se diferencia |
| [07 · API do Instagram](docs/07-instagram-api.md) | Como carregar o feed pelo @ (Business Discovery), fallbacks, publicação futura |
| [08 · Decisões e riscos](docs/08-decisoes-e-riscos.md) | ADRs, riscos com mitigação, dependências externas a providenciar |
| [09 · Design system](docs/09-design-system.md) | Cores, tipografia, status, componentes |

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
Next.js 15 + TypeScript + Tailwind + shadcn/ui + dnd-kit · Supabase (Postgres, Auth, Storage,
Realtime) · sharp · Meta Graph API (Business Discovery) · Vercel · Resend · Sentry · PWA.

**Providências externas**
Conta profissional do Instagram do APROVO ligada a uma Página do Facebook; app na Meta for
Developers; projetos Supabase e Vercel; domínio; logo em SVG; política de privacidade.

## Como trabalhar neste repositório com Claude Code

Ver [CLAUDE.md](CLAUDE.md): convenções do projeto e a política de uso de modelos (Fable para
planejamento e arquitetura; Sonnet para implementação; Haiku para tarefas mecânicas).
