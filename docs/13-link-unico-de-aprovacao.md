# 13 · Link único de aprovação (um link por pessoa)

Planejamento da evolução do link de aprovação (ADR-005 → ADR-011). Hoje o link é **do envio**:
qualquer pessoa com o link decide, o mesmo link serve para vários contatos e só morre ao expirar
(30 dias) ou quando a social media revoga. Nesta fase o link passa a ser **da pessoa**: um token
por destinatário, que **expira sozinho ao registrar a decisão**; para reabrir, a social media gera
um link novo de propósito. Nada aqui está implementado; as tarefas são T10 e T11 da Fase 6 em
`docs/05-roadmap.md`. Pontos com **Decisão do João: pendente** estão reunidos na seção 10 e na
ADR-011 (`docs/08`).

## 1. Por que mudar

| Problema hoje (ADR-005) | Efeito | Com link por pessoa |
|---|---|---|
| Um link serve para todo mundo | não dá para saber **quem** decidiu além do nome digitado | cada decisão nasce ligada a um destinatário nomeado pela social media |
| O link continua vivo depois da decisão | quem reencaminha a mensagem semanas depois ainda abre a página de decidir | link usado vira recibo (ou mensagem genérica); decidir de novo exige link novo |
| Reenvio reaproveita o mesmo link | o cliente não percebe que há algo novo a decidir | reabrir gera link novo, com mensagem nova no WhatsApp |
| `already_decided` é por envio+post, não por link | um segundo contato com o mesmo link recebe "já decidido" sem entender | cada link registra a sua decisão; a regra de vários destinatários é explícita |

O que **não** muda: sem senha, sem conta, token de 256 bits guardado só como hash, teto de 30
dias, página pública `/a/[token]`, rate limit, registro de IP e user agent na decisão.

## 2. Modelo

### 2.1 Vocabulário

- **Envio** (`approval_requests`): conjunto de publicações mandadas de uma vez (1..50 itens).
- **Link** (`approval_links`): um token. Passa a ter **modo**: `shared` (comportamento atual) ou
  `personal` (um por destinatário). Novos links nascem `personal`; `shared` fica para os links
  antigos e, se o João quiser, como opção explícita ("link aberto, para grupos").
- **Destinatário**: nome (obrigatório) e contato opcional (ex.: "WhatsApp (11) 9…") que a social
  media informa ao gerar o link. Não é conta, não exige confirmação.
- **Decisão** (`approval_decisions`): continua por item, nunca editada, sempre com `link_id`.

### 2.2 Mudanças em `approval_links`

| Coluna | Tipo | Notas |
|---|---|---|
| mode | enum `approval_link_mode` (`shared`, `personal`) | padrão `personal` para novos; migração grava `shared` nos existentes |
| recipient_name | text | obrigatório quando `personal`; substitui o uso de `label` como "nome do contato" (`label` continua para texto livre, ex. "grupo do cliente") |
| recipient_contact | text | opcional, só para a social media se lembrar por onde mandou; nunca aparece na página pública |
| used_at | timestamptz | instante em que o link **se consumiu** (seção 3); nulo enquanto ativo |
| used_reason | enum `approval_link_used_reason` (`decided`, `superseded`) | `decided` = todas as decisões deste link feitas; `superseded` = a social media reabriu e gerou link novo para a mesma pessoa |
| superseded_by_link_id | uuid → approval_links | ligação para o link que o substituiu (auditoria da reabertura) |
| expires_at, revoked_at, opened_count, last_opened_at, token_hash | | iguais a hoje |

Regra de estado do link, nesta ordem de precedência: `revoked` (link ou envio revogado) →
`used` (`used_at` não nulo) → `expired` (`expires_at <= now()`) → `active`.

### 2.3 Nova tabela `approval_link_opens` (auditoria de aberturas)

Hoje a abertura só incrementa `opened_count` e grava `link.opened` no `activity_log`, sem IP nem
user agent. Para responder "quem abriu, quando e de onde":

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid | |
| link_id | uuid → approval_links | |
| opened_at | timestamptz | |
| ip | inet | nulo quando o header não vem ou é inválido (mesma regra da rota `decide`) |
| user_agent | text | até 500 caracteres |
| link_state | text | `active` ou `used` (abriu o recibo) |

Índice `(link_id, opened_at desc)`. Retenção: 90 dias (expurgo no cron semanal), porque IP é
dado pessoal (LGPD, seção 8). `opened_count`/`last_opened_at` continuam como atalho para a lista.

### 2.4 `approval_decisions` e `approval_requests`

- `approval_decisions`: **sem mudança de colunas**. A coluna `link_id` já identifica a pessoa
  (via `recipient_name` do link). O índice novo `(request_id, link_id, post_id)` único garante
  **uma decisão por link por item** (hoje o único índice é `(post_id, decided_at)`).
- `approval_requests.status` continua derivado: `open` → `partially_decided` → `decided`; o
  cálculo passa a considerar a regra de vários destinatários (seção 5), não só "existe alguma
  decisão para o item".
- `posts.sent_for_approval_at` continua sendo o **marco de reabertura** (`decide.ts` já ignora
  decisões anteriores a ele).

## 3. Expiração ao decidir

Um link `personal` se consome quando **todas as publicações do envio têm decisão registrada por
aquele link** (`approval_decisions` com `link_id = link.id` para cada `approval_items` do
envio). Casos:

| Envio | Quando o link morre |
|---|---|
| 1 item | na primeira decisão (aprovar ou pedir ajustes) |
| N itens, cliente decide um a um | na N-ésima decisão; entre uma e outra o link continua ativo e a página mostra os já decididos travados (como hoje) |
| N itens, "Aprovar todos" | na mesma transação (uma chamada por item hoje; T10 adiciona a variante em lote, seção 7.2) |
| cliente decide 3 de 5 e some | o link **não** morre; continua até `expires_at` (30 dias). A social media vê "3 de 5 decididos por Carlos" e pode reabrir ou esperar |

Implementação: dentro da transação de `decideByToken`, depois de inserir a decisão, contar itens
do envio e decisões do link; se iguais, `update approval_links set used_at = now(), used_reason =
'decided'` e registrar `approval.link_used` no `activity_log`. A resposta da rota devolve
`linkUsed: true` para a `ApprovalBar` trocar para o estado "Tudo decidido. Este link foi
encerrado." sem recarregar.

Links `shared` **não** se consomem (comportamento atual), só expiram ou são revogados.

## 4. Reabertura explícita

"Reabrir" é uma ação da social media sobre um envio já decidido (ou parcialmente), para pedir
nova decisão **sem criar outro envio**:

1. A social media escolhe os itens a reabrir (padrão: os que estão em `changes_requested` e os
   que foram editados depois da decisão) e o(s) destinatário(s).
2. O app reaproveita o `approval_request`: status volta para `open`/`partially_decided`,
   `posts.sent_for_approval_at = now()` nos itens reabertos e `posts.status = pending_approval`.
   É exatamente o que `decide.ts` já prevê: a checagem `existing.decidedAt >=
   post.sentForApprovalAt` deixa de bloquear e uma decisão nova é aceita.
3. Gera um link `personal` **novo** por destinatário; o link anterior da mesma pessoa, se ainda
   ativo, recebe `used_at = now()`, `used_reason = 'superseded'`, `superseded_by_link_id`.
4. Registra `approval.reopened` (`payload: { requestId, postIds, linkIds }`) e, para cada link,
   `approval.link_issued`.
5. A folha mostra os links novos com "Copiar" / "WhatsApp", como no envio.

Diferença para "reenviar" (fluxo da fase 4): reenviar é editar o post e criar **outro** envio;
reabrir mantém o histórico de decisões no mesmo envio e a tela "Aprovações" mostra as rodadas
("Rodada 1: ajustes por Carlos em 03/11 · Rodada 2: aprovado por Carlos em 05/11").

Editar legenda ou mídia de um item `approved` continua voltando para `draft` (doc 03 §3); o
envio não é reaberto sozinho, a social media decide se reabre ou cria envio novo.

## 5. Vários destinatários

Um envio pode ter 2+ links `personal` (ex.: cliente e sócia). Cada link registra a própria
decisão por item (índice único da seção 2.4). O status do **post** deriva das decisões vigentes
(posteriores a `sent_for_approval_at`) de todos os links do envio:

| Decisões vigentes do item | `posts.status` |
|---|---|
| alguém pediu ajustes | `changes_requested` (**ajustes solicitados prevalece**, mesmo que outro tenha aprovado antes ou depois) |
| todos os destinatários aprovaram | `approved` |
| só parte aprovou, ninguém pediu ajustes | **Decisão do João: pendente** (seção 10, pergunta 2): (a) `approved` na primeira aprovação ("basta um"); (b) continua `pending_approval` até todos aprovarem ("todos precisam") |

Recomendação: **(a) basta um**, porque o uso típico é "mando para o cliente e para a assistente,
quem ver primeiro aprova", e porque "ajustes prevalece" já protege o caso de discordância: se a
segunda pessoa pedir ajustes depois de uma aprovação, o post volta para `changes_requested` e a
aprovação anterior fica no histórico. O e-mail/toast dizem "Carlos aprovou (1 de 2 contatos)".

Com `shared` continua como hoje: a primeira decisão vale e a segunda recebe `already_decided`.

## 6. O que o cliente vê ao abrir um link já usado

**Decisão do João: pendente** (pergunta 1). As duas opções, ambas sem botões de decidir:

| | A. Recibo somente leitura (recomendado) | B. Mensagem genérica |
|---|---|---|
| Conteúdo | cabeçalho do perfil, os itens do envio com a pílula "Aprovado em 06/11 às 14:32" / "Ajustes solicitados" e o comentário, nome do destinatário | "Este link já foi utilizado. Se precisar mudar algo, fale com seu social media." |
| Para quem é útil | o cliente que quer conferir o que aprovou, ou mostrar para alguém | ninguém, mas é o mais simples |
| Exposição | mostra as publicações para quem tiver o link (igual a hoje, porque o link já circulou no WhatsApp) | não mostra nada |
| Validade | até `expires_at` (30 dias); depois cai na mensagem de expirado | imediata |
| Implementação | `getPublicApproval` devolve `linkState: "used"` com os itens e decisões; `PublicApprovalView` em modo `readOnly` | `InactiveLinkCard` com `reason="used"` |

Mensagens (`APPROVAL_ERROR_MESSAGES`), todas em português do Brasil:

- `link_used`: "Este link já foi utilizado. Para uma nova aprovação, peça um link novo ao seu
  social media."
- `link_expired`: "Este link expirou. Peça um novo link ao seu social media."
- `link_revoked`: "Este link foi cancelado pelo seu social media."
- `link_inactive` continua como fallback (desconhecido).

Hoje `InactiveLinkCard` mostra o mesmo texto para expirado, revogado e inexistente; passa a
receber `reason` e, para inexistente (`not_found`), responde 404 como já previsto no doc 04.

## 7. Diferenças concretas com o código atual

### 7.1 `lib/approvals/token.ts`

Nenhuma mudança: `issueToken` (32 bytes base64url) e `hashToken` (SHA-256 hex) servem. Um
token por pessoa não muda o formato, muda quantos tokens o envio tem.

### 7.2 `lib/approvals/decide.ts`

| Hoje | Depois |
|---|---|
| `resolveLink` devolve `not_found \| active \| expired \| revoked` | adiciona `used` (precedência da seção 2.2) e devolve também `recipientName`, `mode` |
| `decideByToken` recusa qualquer estado ≠ `active` com `link_inactive` (404) | `used` → 410 `link_used`; `expired` → 410 `link_expired`; `revoked` → 410 `link_revoked`; `not_found` → 404 |
| checagem `already` por `(request, post)` ignorando o link | por `(request, link, post)` para `personal`; mantém `(request, post)` para `shared` |
| atualiza `posts.status` direto com a decisão recebida | calcula o status pela regra da seção 5 (função pura `derivePostStatus(decisions, sentForApprovalAt, rule)`, testada) |
| status do envio = "todo item tem alguma decisão" | = "todo item tem status final pela regra da seção 5" |
| não mexe no link | ao fechar o último item do link: `used_at`, `used_reason = 'decided'`, evento `approval.link_used`, `linkUsed: true` na resposta |
| uma chamada por item | nova função `decideManyByToken(token, decisions[], meta)` para "Aprovar todos" numa transação só (rota `POST /api/approval/[token]/decide-all`), evitando o link morrer no meio de uma sequência com falha de rede |

`DecidedPayload`/`LiveEvent` ganham `recipientName` e `linkUsed` para o toast "Carlos aprovou
'Post da coxinha'" sair do nome do destinatário quando o cliente não digita o nome.

### 7.3 `lib/approvals/actions.ts`

| Hoje | Depois |
|---|---|
| `createApprovalRequest` cria o envio e **um** link com `label` | recebe `recipients: [{ name, contact? }]` (1..5) e devolve `links: [{ linkId, recipientName, url, expiresAt }]`; `label` vira opcional e só descreve o link |
| `issueApprovalLink(requestId, label)` | `issuePersonalLink(requestId, { name, contact? })`; continua permitido em `open`/`partially_decided`; para um envio `decided` usa-se `reopenApprovalRequest` |
| não existe | `reopenApprovalRequest(requestId, { postIds, recipients })` (seção 4): transação que bumpa `sent_for_approval_at`, muda status dos posts e do envio, consome links antigos da mesma pessoa (`superseded`) e emite os novos |
| `revokeApprovalLink`, `cancelApprovalRequest` | iguais; revogação não preenche `used_at` (revogar não é usar) |
| `newLinkValues` | recebe `mode`, `recipientName`, `recipientContact` |

Validação Zod: `recipientName` 1..80 caracteres, `recipientContact` até 120, até 5 destinatários
por chamada (acima disso a social media provavelmente quer um link `shared`).

### 7.4 `lib/approvals/queries.ts` e `contracts.ts`

- `LinkState` ganha `used`. `PublicApprovalView` ganha `recipientName`, `readOnly` e, quando
  `used`, mantém `items` com `decision` preenchido (opção A) ou vazio (opção B).
- `getPublicApproval(token, { recordOpen, ip, userAgent })` grava a abertura em
  `approval_link_opens` além do contador; a página passa `ip`/`user-agent` lidos de `headers()`.
- `ApprovalLinkSummary` ganha `mode`, `recipientName`, `usedAt`, `usedReason`, `opens: [{ openedAt,
  ip, userAgent }]` (últimas 20) e `decisions` por link, para a tela "Aprovações" mostrar
  "Carlos · abriu 3× · decidiu 5/5 em 06/11".
- `ApprovalRequestSummary.items[].decidedViaLink` passa a devolver `recipientName` (hoje `label`).

### 7.5 `app/a/[token]/page.tsx` e componentes

- `page.tsx`: lê `headers()` para IP/UA e os passa a `getPublicApproval`; roteia por
  `linkState`: `active` → `PublicApprovalView`; `used` → `PublicApprovalView readOnly` (A) ou
  `InactiveLinkCard reason="used"` (B); `expired`/`revoked` → `InactiveLinkCard` com o motivo;
  `not_found` → `notFound()`.
- `generateMetadata`: para `used` com recibo, título "Aprovação registrada · @perfil";
  `robots: noindex` como hoje.
- `ApprovalBar`: trata 410 `link_used` (mostra o recibo sem recarregar), exibe
  "Decidindo como **Carlos**" quando o link é `personal` (o campo "Seu nome" fica oculto e
  `approver_name` recebe `recipientName`, a menos que o João prefira manter o campo editável,
  pergunta 4).
- `ShareLinkSheet`: campo "Para quem?" com nome e contato, botão "+ outra pessoa", um bloco de
  Copiar/WhatsApp **por pessoa**, texto "Cada link vale para uma pessoa e se encerra sozinho
  quando ela terminar de decidir. Validade máxima: 30 dias."
- `ApprovalRequestCard`: links listados por destinatário com estado (ativo · usado em … ·
  expirado · cancelado), aberturas e botão **Reabrir** quando o envio tem item decidido.

### 7.6 Rate limit e `proxy.ts`

Sem mudança: a rota nova `decide-all` cai no mesmo prefixo público `/api/approval/` e usa o
mesmo `allow()` por IP e por hash do token.

## 8. Auditoria e privacidade

| Pergunta | Onde está a resposta |
|---|---|
| Quem decidiu | `approval_decisions.link_id` → `approval_links.recipient_name` (+ `approver_name` se digitado) |
| Quando | `approval_decisions.decided_at` |
| De onde | `approval_decisions.ip`, `user_agent` (já existe) |
| Quantas vezes abriu, quando e de onde | `approval_link_opens` (novo) + `opened_count`/`last_opened_at` |
| Quem reabriu e quando | `activity_log` `approval.reopened` com `actor = user:<id>`; `superseded_by_link_id` |
| Qual link foi usado em cada decisão | `link_id` (já existe) |

Regras:

- IP e user agent de aberturas ficam **90 dias**; os da decisão ficam enquanto a decisão existir
  (é a prova da aprovação, base dos Termos de Uso). Ao excluir a conta, decisões são anonimizadas
  como já previsto em `docs/legal/`.
- `recipient_contact` é dado pessoal do cliente guardado pela social media: aparece só para
  membros do workspace, nunca na página pública, nunca em e-mail.
- Nunca logar o token claro; eventos usam `link:<id>`.
- O recibo (opção A) não mostra IP nem user agent para o cliente, só data/hora e decisão.

## 9. Migração a partir da ADR-005

1. Migration `000X_personal_links`: enum `approval_link_mode`, colunas novas em
   `approval_links` (`mode` default `personal`; a migration faz `update approval_links set mode
   = 'shared'` nas linhas existentes antes de fixar o default), `used_at`, `used_reason`,
   `recipient_name`, `recipient_contact`, `superseded_by_link_id`; tabela
   `approval_link_opens`; índice único `(request_id, link_id, post_id)` em
   `approval_decisions` (conferir antes que não há duplicata; hoje a checagem `already`
   impede).
2. **Links antigos** (`shared`) seguem funcionando exatamente como hoje até `expires_at` ou
   revogação: `resolveLink` nunca os marca `used`; `decideByToken` aplica a regra antiga de
   `already_decided`. Não há reemissão em massa.
3. **Teto de 30 dias** (`LINK_TTL_DAYS`) continua para os dois modos; o `personal` só costuma
   morrer antes.
4. Tela "Aprovações" mostra links `shared` com a etiqueta "link aberto" para a social media
   distinguir.
5. Rollback: as colunas novas são nulas/default e o código antigo as ignora; a tabela nova pode
   ficar vazia.

## 10. Perguntas abertas para o João

1. **Link usado:** recibo somente leitura (A, recomendado) ou mensagem genérica (B)?
2. **Vários destinatários sem ajustes:** basta uma aprovação (a, recomendado) ou todos precisam
   aprovar (b)? "Ajustes prevalece" vale nos dois casos.
3. **Link aberto (`shared`) continua disponível** como opção na folha ("para grupos") ou só
   existe para os links antigos?
4. **Nome do aprovador:** com link por pessoa, esconder o campo "Seu nome" e usar o nome do
   destinatário, ou manter o campo editável (útil quando o cliente repassa para alguém)?
5. **Parcial abandonado** (decidiu 3 de 5 e sumiu): deixar o link vivo até os 30 dias
   (recomendado) ou encerrar em N dias sem atividade?
6. **Retenção das aberturas** (IP/UA): 90 dias está bom?
7. **Reabrir seleciona por padrão** os itens em `changes_requested` + editados depois da decisão,
   ou sempre o envio inteiro?
