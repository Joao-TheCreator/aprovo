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
