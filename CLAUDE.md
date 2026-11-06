# CLAUDE.md · APROVO

Guia para sessões do Claude Code neste repositório.

## O projeto em uma linha

Web app mobile-first (Next.js + Supabase) para social medias montarem o feed do Instagram de
clientes e colherem aprovação por link. Planejamento completo em `docs/`. Leia
`docs/01-visao-e-escopo.md` e `docs/04-telas-e-fluxos.md` antes de implementar qualquer tela.

## Idioma

Código, nomes de variáveis e commits em **inglês**. Textos de UI, docs e mensagens para o
usuário em **português do Brasil**.

## Política de modelos (quem faz o quê)

| Tipo de trabalho | Modelo | Exemplos |
|---|---|---|
| Planejamento, arquitetura, decisões (ADRs), revisão de fluxos críticos, segurança | **Fable** (sessão principal) | Mudar o modelo de dados, desenhar o fluxo de aprovação, revisar RLS, escolher provedor |
| Implementação de tarefas bem especificadas, testes, refatorações médias | **Sonnet** (subagente) | Implementar uma tela do `docs/04`, escrever Server Actions, criar migrations, e2e Playwright |
| Tarefas mecânicas e de baixo risco | **Haiku** (subagente) | Renomear, formatar docs, gerar fixtures, atualizar README, listar arquivos, buscas no código |

Regras:
- A sessão principal (Fable) **delega** implementação a subagentes Sonnet com um brief que cite o
  doc e a seção; ela revisa o resultado e cuida de commit/push.
- Qualquer mudança em `docs/03-modelo-de-dados.md`, RLS, tokens de aprovação ou integração com
  o Instagram passa por revisão da sessão principal.
- Pesquisa na web pode ir para Sonnet; se a rede bloquear um host, registrar no doc como
  "[confirmar]" em vez de inventar.

## Convenções técnicas (valem a partir da Fase 0)

- Next.js App Router, TypeScript estrito, ESLint + Prettier. Sem `any`.
- Pastas: `app/(auth)`, `app/(app)/perfis` (URLs sem prefixo `/app`), `app/a/[token]`, `app/api`, `components/ui`,
  `components/feed`, `lib/<módulo>`, `db/schema`, `db/migrations`, `tests/`.
- Validação com Zod em toda entrada (Server Actions e Route Handlers).
- Acesso a dados via Drizzle; nunca `service_role` no cliente.
- Originais de mídia são imutáveis; derivados em `previews/` e `thumbs/`; cópias do Instagram em `ig-cache/`.
- Tokens de aprovação: nunca logar o token claro; guardar só o hash.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), uma tarefa por commit.
- Antes de push: `pnpm lint && pnpm typecheck && pnpm test`.

## Pessoas

- **João** (Joao-TheCreator) é o dono do produto; decisões de escopo são dele.

## O que não fazer

- Não implementar calendário completo, stories ou publicação real no Instagram sem o João
  pedir (estão fora da primeira etapa).
- Não ligar o provedor de scraping por padrão.
- Não alterar a identidade visual (`docs/09-design-system.md`) sem aprovação.
