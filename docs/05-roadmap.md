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

### E2 · Perfil e feed simulado (3 d) · concluído em 06/11/2026
- [x] Tela 01 (formulário, estados, confirmação)
- [x] Componentes `ProfileHeader`, `ProfileTabs`, `FeedGrid`, `GridCell` (badges carrossel/vídeo)
- [x] Lista de perfis e navegação (barra inferior / sidebar)
- [x] Proporção da grade configurável (1:1 / 3:4)

### E3 · Mídia (5 d)
- [ ] Upload direto com URL pré-assinada (multipart S3 para vídeo), progresso, retry, limites (30 MB imagem, 300 MB e 90 s vídeo)
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
- [ ] Tabelas `approval_*`, transação `decideApproval` com `NOTIFY`, Route Handler `/api/approval/[token]/decide`, rate limit (10 decisões/min por IP e por token)
- [ ] Folha "Compartilhar link": escopo, título, recado, geração do token, copiar/WhatsApp/share
- [ ] Página pública `/a/[token]` SSR com Open Graph, feed destacado, detalhe, decisões
- [ ] `ApprovalBar`: nome do aprovador, comentário obrigatório em ajustes, "Aprovar todos"
- [ ] Páginas de link expirado/revogado; revogar e regenerar link
- [ ] Testes e2e Playwright: enviar → abrir link → aprovar → status atualizado

### E7 · Retorno em tempo real e histórico (2 d)
- [ ] SSE `/api/events` com `LISTEN/NOTIFY` do Postgres (fallback polling 5 s), toasts, invalidação do TanStack Query
- [ ] Tela "Aprovações": envios, links, aberturas, decisões (data, hora, link, comentário)
- [ ] Eventos de aprovação no `activity_log` e exibição no detalhe da publicação

### E8 · Lançamento (5 d)
- [ ] PWA: manifest, ícones, splash, `display: standalone`, atualização de versão
- [ ] Configurações da conta: "Excluir conta" (exigido pela política de privacidade e pela Meta) e exportação simples dos dados
- [ ] E-mails Resend: link mágico customizado, "cliente decidiu"
- [ ] QA em iOS Safari, Android Chrome, desktop; performance (LCP da página pública)
- [ ] Revisar com advogado(a) e publicar Política de Privacidade, Termos de Uso e Instruções de exclusão de dados (rascunhos em `docs/legal/`); cadastrar as URLs no app da Meta
- [ ] Piloto com 3 perfis reais da CPCann; ajustes
- [ ] Produção: subdomínio `vercel.app` (domínio próprio depois), backup do Postgres, revisão dos limites gratuitos; ao cobrar clientes, sair do Vercel Hobby

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
   2b. **APK / Play Store** se o PWA mostrar limitação (Capacitor ou Trusted Web Activity).
3. Stories e destaques; informações de perfil editáveis na simulação.
4. Comentários em thread no link e marcação na imagem.
5. Notificações push (Web Push) e WhatsApp (API oficial).
6. Planos e cobrança (Stripe), limites por workspace, membros com papéis.
7. Outras redes.
