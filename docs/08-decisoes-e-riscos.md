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
