# 14 · Redesign "Gen Z" (design system v2)

Status: **sistema atual**. Substitui a paleta e os componentes do `docs/09-design-system.md`
(que fica como referência da v1). A fundação (tokens, fontes, componentes base) já está no
código; as telas migram por área (A–D, no fim deste doc).

## 1. Direção

O APROVO é a ferramenta de quem vive dentro do Instagram. A v1 era correta e educada; a v2 tem
atitude. Mantemos o DNA (roxo `#6A00FF`, verde do check `#22E688`, o logo) e empurramos:

- **Dark-first.** Todo componente é desenhado primeiro no escuro (fundo quase preto com tom
  roxo), com modo claro de primeira classe. Segue o sistema por padrão; o usuário pode forçar.
- **Acentos elétricos.** Roxo vira gradiente (`#6A00FF → #9B3CFF`), verde vira o "sim" que
  brilha. Estados importantes ganham **glow** (halo de gradiente desfocado), não sombra cinza.
- **Tipografia gigante nos títulos.** Display geométrica e larga (Unbounded) em títulos curtos;
  sans legível (Plus Jakarta Sans) em todo o resto.
- **Superfícies chunky.** Raios grandes (24–40 px), pílulas, folhas inferiores de vidro (glass +
  blur), bordas finas em vez de sombras pesadas.
- **Movimento com mola.** Tudo que é tocável encolhe um pouco ao pressionar e volta com mola;
  folhas sobem com overshoot; aprovação explode em confete. Tudo some com movimento reduzido.
- **Sem emoji, cheio de ícone.** Lucide em todo lugar, traço 2, em pastilhas coloridas.
- **Copy curta e com voz.** "Nada por aqui. Ainda." em vez de "Nenhum item encontrado".

O que **não** muda: comportamento, Server Actions, rotas, dados, a simulação do Instagram (que
continua fiel ao Instagram, em ilha de tema claro) e os rótulos congelados da seção 9.

## 2. Tema

- Padrão: segue `prefers-color-scheme`.
- `<html data-theme="light" | "dark">` força um modo. O `ThemeToggle`
  (`components/app/ThemeToggle.tsx`) grava em `localStorage["aprovo-theme"]`; um script inline
  em `app/layout.tsx` aplica antes da pintura (sem flash).
- **Ilhas de tema:** qualquer elemento com `data-theme` redefine os tokens para seus filhos.
  Uso obrigatório: a simulação do Instagram (`PhoneFrame` com `bg-white text-black`) recebe
  `data-theme="light"`; a pílula `overlay` usa `data-theme="dark"` sobre fotos.
- Variante Tailwind `dark:` existe, mas **prefira tokens** (eles já mudam sozinhos). `dark:` não
  enxerga ilhas claras dentro da raiz escura; use só para trocar assets (ex.: logo).
- `color-scheme` acompanha o tema, então inputs nativos (data/hora do agendamento) ficam
  escuros no modo escuro.

## 3. Tokens de cor

Tokens crus têm prefixo `--ap-` (em `app/globals.css`). Use as classes Tailwind da coluna
"Classe". Os nomes do shadcn (`bg-primary`, `text-muted-foreground`...) continuam valendo e
apontam para os tokens v2.

| Token | Classe | Claro | Escuro | Uso |
|---|---|---|---|---|
| `--ap-bg` | `bg-background` / `bg-bg` | `#F7F5FF` | `#0B0816` | Fundo da página |
| `--ap-surface` | `bg-card` / `bg-surface` | `#FFFFFF` | `#151027` | Cards, folhas, popovers |
| `--ap-surface-2` | `bg-surface-2` / `bg-secondary` / `bg-muted` | `#EFEAFF` | `#201838` | Campos, chips, áreas recuadas |
| `--ap-glass` | `glass` (utilitário) | branco 72% | `#151027` 72% | Sheets, toasts, barras fixas (com blur 20 px) |
| `--ap-text` | `text-foreground` | `#140F26` | `#F5F2FF` | Texto principal |
| `--ap-text-muted` | `text-muted-foreground` | `#5E5878` | `#A9A2C4` | Texto secundário |
| `--ap-brand` | `bg-primary` / `bg-brand` | `#6A00FF` | `#7C2BFF` | Preenchimento de marca sólido |
| gradiente | `bg-gradient-brand` | `#6A00FF → #8418FF → #9B3CFF` | igual | Botão primário, aba ativa, FAB |
| `--ap-brand-ink` | `text-brand-ink` | `#6A00FF` | `#A77BFF` | Texto/ícone roxo sobre fundo |
| `--ap-brand-soft` | `bg-brand-soft` / `bg-accent` | `#EDE7FF` | `#241A45` | Realce suave, chip de marca |
| `--ap-brand-2` | `bg-brand-2` | `#22E688` | `#22E688` | Verde elétrico (acento) |
| `--ap-on-brand` | `text-on-brand` | `#FFFFFF` | `#FFFFFF` | Texto sobre roxo |
| `--ap-success` | `bg-success` | `#22E688` | `#22E688` | Aprovado, confirmação (preenchimento) |
| `--ap-ink` | `text-ink` | `#140F26` | `#140F26` | Texto sobre verde/amarelo (fixo) |
| `--ap-success-ink` | `text-success-ink` | `#0A7A45` | `#22E688` | Texto "sucesso" sobre fundo |
| `--ap-warning` | `bg-warning` | `#FFB020` | `#FFB020` | Ajustes, atenção (preenchimento) |
| `--ap-warning-ink` | `text-warning-ink` | `#8A5A00` | `#FFC24D` | Texto de aviso sobre fundo |
| `--ap-danger` | `bg-destructive` / `bg-danger` | `#C70D31` | `#C70D31` | Excluir, falha (preenchimento, texto branco) |
| `--ap-danger-ink` | `text-danger-ink` | `#C70D31` | `#FF6B85` | Texto de erro sobre fundo |
| `--ap-outline` | `border-border` / `border-outline` | `#E2DCF5` | `#2E2550` | Divisores, bordas decorativas |
| `--ap-outline-strong` | `border-input` / `border-outline-strong` | `#8E86AD` | `#6B5F99` | Borda de campo (≥ 3:1) |
| `--ap-ring` | `ring-ring` | `#6A00FF` | `#22E688` | Anel de foco |
| `--ap-scrim` | `bg-scrim` | ink 45% | quase preto 60% | Fundo atrás de sheet/dialog |
| `--ap-glow` | `bg-glow`, `shadow-glow` | roxo 28% | roxo 55% | Halo de destaque |
| `--ap-glow-success` | `shadow-glow-success` | verde 35% | verde 45% | Halo de aprovado |

**Status de publicação** (pontos da `StatusPill`):

| Status | Classe | Claro | Escuro |
|---|---|---|---|
| Rascunho | `text-status-draft` | `#7A7299` | `#8E86AD` |
| Aguardando aprovação | `text-status-pending` (pulsa) | `#9B3CFF` | `#B36BFF` |
| Aprovada | `text-status-approved` | `#0B8F57` | `#22E688` |
| Ajustes solicitados | `text-status-changes` | `#B86E00` | `#FFB020` |
| Agendada | `text-status-scheduled` | `#6A00FF` | `#A77BFF` |
| Publicada | `text-status-published` | `#0A84C6` | `#2EC5FF` |
| Falhou | `text-status-failed` | `#C70D31` | `#FF6B85` |

**Nomes v1** (`bg-lavanda`, `text-roxo`, `text-ink-2`, `bg-verde`, `text-ink`, `bg-roxo-apoio`)
continuam compilando e foram religados ao tema (`roxo` → `brand-ink`, `lavanda` → `brand-soft`,
`ink-2` → `text-muted`; `verde`, `ink` e `roxo-apoio` fixos). Ao tocar numa tela, troque pelos
nomes v2. Evite `bg-white`/`text-black` fora da simulação do Instagram.

## 4. Tipografia

- **Display:** [Unbounded](https://fonts.google.com/specimen/Unbounded) 600/700/800 — larga,
  geométrica, com cara de app. Só em títulos curtos (até ~4 palavras), números grandes e
  estados vazios. Classe `font-display`.
- **UI:** [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) 400–800 —
  geométrica como a Poppins, mais legível em tamanhos pequenos. É a `font-sans` padrão.
- **Fallback:** Poppins, depois a fonte do sistema. A simulação do Instagram segue com
  `font-instagram` (fonte do sistema).
- Carregadas por `next/font/google` em `app/layout.tsx` (auto-hospedadas no build; o build
  precisa de rede para baixá-las). `@fontsource/poppins` deixou de ser importado e pode sair do
  `package.json` quando ninguém mais precisar.

| Papel | Classe | Tamanho (clamp) | Linha | Peso / tracking | Fonte |
|---|---|---|---|---|---|
| Display | `font-display text-display` | `clamp(2.25rem, 1.6rem + 3.2vw, 3.5rem)` (36→56 px) | 1.0 | 800 / -0.03em | Unbounded |
| H1 | `font-display text-h1` | `clamp(1.75rem, 1.4rem + 1.6vw, 2.25rem)` (28→36) | 1.1 | 700 / -0.02em | Unbounded |
| H2 | `font-display text-h2` | `clamp(1.25rem, 1.1rem + 0.8vw, 1.5rem)` (20→24) | 1.2 | 600 / -0.01em | Unbounded |
| Título | `text-title` | 17 px | 1.35 | 700 | Jakarta |
| Corpo | `text-body` | 15 px (16 px em campos no mobile, evita zoom do iOS) | 1.5 | 400–500 | Jakarta |
| Legenda | `text-caption` | 13 px | 1.35 | 600 | Jakarta |
| Micro | `text-micro uppercase` | 11 px | 1.2 | 700 / +0.08em | Jakarta |

`lib/utils.ts` ensina o `tailwind-merge` a tratar `text-h1` etc. como tamanho (sem isso o `cn`
apagaria a cor ou o tamanho).

## 5. Forma, profundidade e espaço

**Raios** (`--radius` = 22 px):

| Classe | Valor | Uso |
|---|---|---|
| `rounded-sm` | 12 px | Miniaturas, checkboxes |
| `rounded-md` | 16 px | Itens de lista compactos |
| `rounded-lg` | 22 px | Botões quadrados, tiles |
| `rounded-xl` | 28 px | — |
| `rounded-2xl` | 24 px (era 16) | Campos, cards pequenos |
| `rounded-3xl` | 32 px (era 24) | Cards, toasts |
| `rounded-4xl` | 40 px | Topo de sheet, dialog, estado vazio |
| `rounded-full` | pílula | Botões, chips, pills, tabs |
| — | 0 | Células da grade do feed (fidelidade ao Instagram) |

**Sombras e brilho:** `shadow-card` (card em repouso), `shadow-sheet` (folhas, toasts),
`shadow-glow` (primário, aba ativa, campo focado), `shadow-glow-success` (aprovado),
`shadow-glow-danger` (destrutivo). No escuro a profundidade vem de glow e borda, não de sombra.

**Gradientes:** `bg-gradient-brand`, `bg-gradient-success`, `bg-aurora` (fundo de login/página
pública), `text-gradient-brand` (palavra de destaque em display).

**Espaço:** base 4 px (Tailwind padrão). Escala usada: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 ·
56 · 72. Gutter da página 16 px no mobile, 32 px no desktop; seções separadas por 32–40 px;
grade do feed com gap 2 px.

## 6. Movimento

| Token | Valor | Uso |
|---|---|---|
| `--ap-dur-instant` | 90 ms | Cor/opacidade de hover |
| `--ap-dur-fast` | 160 ms | Press, toggles, saída de dialog |
| `--ap-dur-base` | 240 ms | Fade, troca de aba, saída de sheet |
| `--ap-dur-sheet` | 380 ms | Entrada de sheet (com mola) |
| `--ap-dur-slow` | 420 ms | Entrada de lista, glow |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Press, sheet, pop (overshoot) |
| `ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entradas |
| `ease-in-out-quint` | `cubic-bezier(0.83, 0, 0.17, 1)` | Saídas |

Use em Tailwind: `duration-(--ap-dur-fast) ease-spring`.

Animações prontas: `animate-fade-in/out`, `animate-sheet-in/out`, `animate-pop-in/out`,
`animate-rise` (entrada de item; escalone com `style={{ animationDelay }}` de 30–40 ms por item,
máx. 8 itens), `animate-pulse-dot` (status ao vivo), `animate-glow-pulse`, `animate-shimmer`
(skeleton), `animate-success-pop` (ícone de check), `animate-burst` (confete).

**Movimento reduzido:** regra global em `globals.css` zera duração e repetição de toda
animação/transição. Nada pode depender de animação para comunicar estado (o texto sempre diz).
`haptic()` também não vibra nesse modo.

**Biblioteca:** sem dependência nova. Tudo é CSS (Tailwind + keyframes). `motion` (Framer) não
está instalado; só adicionar se uma área precisar de gesto arrastável real (ex.: arrastar a
sheet para fechar), com decisão registrada.

**Feedback háptico** (`lib/ui/haptics.ts`): `haptic("tap" | "success" | "warning" | "error")`
usa `navigator.vibrate` onde existe (Android). No iOS não há API; o retorno é visual (press +
pulse). Usar em: Aprovar (`success`), Pedir ajustes (`warning`), erro de envio (`error`),
reordenar na grade (`tap` ao soltar). Nunca em rolagem ou digitação.

## 7. Componentes

Todos mantêm a API v1; os acréscimos são opcionais.

### Botões (`components/ui/button.tsx`)
Pílula, `font-bold`, encolhe para 96% ao pressionar (mola), anel de foco 2 px com offset.

| Variante | Visual | Quando |
|---|---|---|
| `default` (primário) | `bg-gradient-brand` + `shadow-glow`, texto branco | Uma ação principal por tela |
| `secondary` | `surface-2`, vira `brand-soft` no hover | Ações de apoio |
| `success` | gradiente verde + glow verde, texto ink | Aprovar, confirmar agendamento |
| `destructive` | `danger` sólido + glow vermelho | Excluir, cancelar agendamento |
| `outline` | borda 1.5 px `outline-strong`, transparente | Terciária em fundo de card |
| `ghost` | só texto, `surface-2` no hover | Ações em barras |
| `glass` *(novo)* | vidro + borda branca 10% | Sobre foto/mídia |
| `link` *(novo)* | texto `brand-ink` sublinhado no hover | Inline |

Tamanhos: `default` 48 px, `sm` 40 px (área de toque estendida a 48 px por pseudo-elemento),
`lg` 56 px, `icon` 44 px, `icon-lg` *(novo)* 56 px. Desabilitado: opacidade 45%.

### Chips e badges (`components/ui/badge.tsx`)
Pílula `text-caption`. Variantes v1 + `brand` (roxo suave), `warning`, `glass`. Chips de
filtro (StatusFilter) usam `secondary` em repouso e `default` (gradiente) quando ativos.

### Status pills (`components/feed/StatusPill.tsx`)
Reformuladas para **ponto + rótulo**: fundo `surface-2`, ponto 8 px na cor do status;
"Aguardando aprovação" pulsa. Nova prop `variant`:
- `dot` (padrão): listas, detalhes, sheets.
- `overlay`: vidro escuro sobre foto (grade do feed, cards de mídia); força tema escuro.
- `solid`: preenchida com ícone (estilo v1), para destaque em cabeçalhos.
O rótulo continua sendo texto puro dentro da pílula (os testes leem "Aprovada" etc.).

### Cards (`components/ui/card.tsx`, novo)
`Card` + `CardHeader/Title/Description/Content/Footer`. Variantes `default` (surface + borda
fina + `shadow-card`), `flat` (`surface-2`), `glass`, `glow`. `interactive` adiciona press,
foco e realce de borda. Raio 32 px, padding 20 px.

### Navegação inferior + FAB (área A)
Barra flutuante de vidro (`glass`, `rounded-full`, margem 12 px das bordas e da safe area),
3 itens com ícone 24 px + rótulo `text-micro`. Item ativo: ícone em `text-brand-ink`, pastilha
`bg-brand-soft` atrás do ícone e glow suave; troca com `ease-spring`. O FAB "+" do feed é
`size-14`, `bg-gradient-brand shadow-glow`, encaixado acima da barra, gira 45° quando a sheet
"Adicionar" está aberta. Desktop: sidebar com o mesmo estilo de item ativo.

### Sheets (`components/ui/sheet.tsx`)
Vidro com blur, topo `rounded-4xl`, alça 44×6 px, sobe com mola (380 ms) e desce em 240 ms;
fundo `bg-scrim` com blur leve. Botão fechar vira pastilha 44 px. Título em display `text-h2`.
`max-h-[90dvh]` com rolagem interna.

### Dialog (`components/ui/dialog.tsx`)
Mesmo tratamento da sheet, centralizado, entra com `pop` (escala 0.92 → 1).

### Toasts (`components/ui/sonner.tsx`)
Pílula de vidro no topo (respeita safe area), ícone colorido por tom (sucesso verde, erro
vermelho, aviso âmbar, info/carregando roxo), glow do tom. Texto curto (seção 8).

### Inputs (`input.tsx`, `textarea.tsx`)
Altura 48 px, `rounded-2xl`, borda 1.5 px `outline-strong`, fundo `surface-2` 60%. Foco: borda
`brand-ink` + `shadow-glow` + fundo `surface`. `aria-invalid` deixa a borda `danger-ink`.
16 px no mobile (sem zoom do iOS), 15 px a partir de `md`.

### Avatar
Anel de gradiente (2 px, `bg-gradient-brand`) em perfis com pendências; fallback com iniciais
em `font-display` sobre `brand-soft`. (Implementação na área A.)

### Tabs (`tabs.tsx`)
Trilho `surface-2` em pílula; aba ativa com gradiente + glow + texto branco.

### Glow e Press (novos)
- `components/ui/glow.tsx`: `<Glow tone="brand|success|danger|aurora" intensity="soft|strong"
  active pulse asChild>` desenha um halo de gradiente atrás do filho (herda o raio).
- `components/ui/press.tsx`: `<Press scale="sm|md|lg" asChild>` aplica o encolher-com-mola em
  qualquer elemento (célula da grade, card-link). Também existe o utilitário CSS `press`.

### Sucesso (`components/ui/success-burst.tsx`)
`<SuccessBurst />` dentro de um elemento `relative`: 14 partículas nas cores da marca saem em
círculo e somem (720 ms). Decorativo (`aria-hidden`), some com movimento reduzido. Combine com
`animate-success-pop` no ícone de check e `haptic("success")`.

### Skeleton (`skeleton.tsx`)
Shimmer em `surface-2` (substitui o pulse). Use a forma final do conteúdo (célula quadrada,
linha de texto de 12 px, avatar redondo).

### Estados vazios (`components/app/EmptyState.tsx`)
Card tracejado `rounded-4xl` com glow no topo, título em display `text-h2`, descrição curta,
uma ação. Props novas opcionais: `icon` (Lucide em pastilha de gradiente), `eyebrow`
(micro-rótulo), `tone` (`brand` | `success`).

### ThemeToggle (`components/app/ThemeToggle.tsx`)
Segmentado Sistema / Claro / Escuro (`role="radiogroup"`), prop `compact` para só ícones. Vai em
Configurações e no menu da conta.

### Logo
`components/app/Logo.tsx` alterna entre `aprovo-logo.png` (roxo, fundos claros) e
`aprovo-logo-dark.png` (palavra off-white, check verde; gerado do original) conforme o tema.
Vetor SVG continua pendente (área D).

## 8. Voz e copy (pt-BR)

- **Você**, frases curtas, verbo na frente. Sem corporativês ("efetuar", "realizar",
  "prezado", "solicitação"), sem exclamação em excesso (no máximo uma por tela, só em sucesso).
- Título diz o que é; descrição diz o que fazer. Botão diz o resultado ("Gerar link", não "OK").
- Erros assumem a culpa e dizem o próximo passo: "Não rolou enviar. Tenta de novo em
  instantes."
- Estados vazios com atitude, mas úteis:

| Lugar | Título | Descrição |
|---|---|---|
| Lista de perfis | Nada por aqui. Ainda. | Conecte o primeiro Instagram e comece a montar o feed. |
| Aprovações | Ninguém te devendo resposta. | Quando você enviar um link, ele aparece aqui. |
| Agendadas | Agenda livre. | Aprove um post e escolha a hora. A gente publica. |
| Falhas | (manter "Nenhuma falha.") | — |
| Feed sem planejados | Grade em branco, ideia nova. | Toque no + pra adicionar o primeiro post. |

- Toasts: até 6 palavras ("Link copiado", "Agendado pra sexta, 10:00", "Ajustes enviados").
- Nada de emoji na interface nem nos e-mails.

## 9. Rótulos congelados (testes e2e)

Os testes em `tests/e2e/` localizam a interface por estes textos. **Não mude o texto, o papel
(role) nem quem é o dono do nome acessível.** Pode mudar estilo, ícone e posição.

| Texto | Como o teste encontra | Onde está |
|---|---|---|
| Rascunho | `getByText(exact)` | `StatusPill` |
| Aprovada | `getByText(exact)` | `StatusPill` |
| Agendada | `getByText(exact)` | `StatusPill` |
| Publicada | `getByText(exact)` | `StatusPill` |
| Agendada para … | `getByText(/Agendada para/)` | `PostDetailView` |
| Enviar para aprovação | `getByRole("link")` e `getByRole("heading")` | `PostDetailView`, `aprovacoes/novo/page.tsx` |
| Nome | `getByLabel(exact)` | `SendForApprovalForm` / `RecipientsField` |
| Gerar link | `getByRole("button", exact)` | `SendForApprovalForm` |
| Link de aprovação de {nome} | `getByLabel(exact)` (input com o link) | `ShareLinkSheet` |
| Decidindo como {nome} | `getByText` | `ApprovalBar` |
| Aprovar | `getByRole("button", exact)` | `ApprovalBar` |
| Tudo decidido | `getByText` | `PublicApprovalView` |
| Aprovação registrada | `getByRole("heading")` | `PublicApprovalView` / `a/[token]/page.tsx` |
| Agendar | `getByRole("button", exact)` (no detalhe e dentro da sheet) | `PostDetailView`, `ScheduleSheet` |
| Agendar publicação | `getByRole("heading")` dentro de `getByRole("dialog")` | `ScheduleSheet` |
| Hora | `getByLabel` | `ScheduleSheet` |
| Agendadas | `getByRole("region", { name })` | `ScheduledList` (`<section aria-label>`) |
| Publicadas | `getByRole("region", { name })` | `ScheduledList` |
| Falhas | `getByRole("region", { name })` | `ScheduledList` |
| Nenhuma falha. | `toContainText` na região Falhas | `ScheduledList` |
| Reagendar | `getByRole("button")` na região Falhas | `ScheduledList` |
| Abrir no Instagram | `getByRole("link")` | `ScheduledList`, `PostSheet` |
| Reagendar a 1 publicação que falhou | `getByRole("button", /regex/)` | `configuracoes/RescheduleFailedButton.tsx` |
| 1 publicação reagendada | `getByText` | `RescheduleFailedButton` |

Também protegidos (fluxos críticos citados pelo João, sem teste ainda): **Cancelar
agendamento**, **Reagendar** (detalhe), **Reconectar**, **Conectar conta do Instagram**,
**Pedir ajustes**. A sheet de agendamento precisa continuar sendo um `role="dialog"` (Radix).

## 10. Acessibilidade

- Contraste AA verificado para todos os pares abaixo (texto normal ≥ 4.5; componentes e texto
  grande ≥ 3). Cálculo pela fórmula WCAG 2.x.
- Foco: anel 2 px `ring` com offset 2 px na cor do fundo (verde no escuro, roxo no claro);
  nunca remover `outline` sem substituto.
- Alvos de toque ≥ 44×44 px (botão `sm` estende a área por pseudo-elemento; fechar de
  sheet/dialog é 44 px; itens da barra inferior ≥ 56 px de altura).
- Status nunca só por cor: a pílula sempre tem rótulo; o ponto é reforço.
- Glass sempre com cor de fundo de 72% de opacidade, para o texto não depender do que está
  atrás. Sobre fotos, use `overlay` (vidro escuro 60% + blur).
- Movimento reduzido respeitado globalmente; confete e pulsos somem.
- Display (Unbounded) só em títulos; corpo em Jakarta ≥ 15 px.

**Contraste — modo claro**

| Primeiro plano | Fundo | Razão |
|---|---|---|
| `text` #140F26 | `bg` #F7F5FF | 17.28 |
| `text` #140F26 | `surface` #FFFFFF | 18.65 |
| `text` #140F26 | `surface-2` #EFEAFF | 15.88 |
| `text-muted` #5E5878 | `bg` #F7F5FF | 6.19 |
| `text-muted` #5E5878 | `surface` #FFFFFF | 6.68 |
| `text-muted` #5E5878 | `surface-2` #EFEAFF | 5.69 |
| `brand-ink` #6A00FF | `bg` #F7F5FF | 6.37 |
| `brand-ink` #6A00FF | `surface` #FFFFFF | 6.87 |
| `brand-ink` #6A00FF | `brand-soft` #EDE7FF | 5.72 |
| `on-brand` #FFFFFF | `brand` #6A00FF | 6.87 |
| `on-brand` #FFFFFF | gradiente meio #8418FF | 5.91 |
| `on-brand` #FFFFFF | gradiente fim #9B3CFF | 4.68 |
| `ink` #140F26 | `success`/`brand-2` #22E688 | 11.32 |
| `ink` #140F26 | `warning` #FFB020 | 10.20 |
| branco #FFFFFF | `danger` #C70D31 | 5.95 |
| `success-ink` #0A7A45 | `surface` #FFFFFF | 5.41 |
| `success-ink` #0A7A45 | `bg` #F7F5FF | 5.01 |
| `warning-ink` #8A5A00 | `surface` #FFFFFF | 5.93 |
| `danger-ink` #C70D31 | `surface` #FFFFFF | 5.95 |
| `danger-ink` #C70D31 | `surface-2` #EFEAFF | 5.07 |
| `outline-strong` #8E86AD (borda de campo) | `surface` #FFFFFF | 3.41 |
| `ring` #6A00FF | `bg` #F7F5FF | 6.37 |
| `ink` #140F26 | `status-published` #0A84C6 (pílula sólida) | 4.55 |
| pontos de status (todos) | `surface-2` #EFEAFF | 3.39–5.85 (≥ 3) |

**Contraste — modo escuro**

| Primeiro plano | Fundo | Razão |
|---|---|---|
| `text` #F5F2FF | `bg` #0B0816 | 17.94 |
| `text` #F5F2FF | `surface` #151027 | 16.76 |
| `text` #F5F2FF | `surface-2` #201838 | 15.23 |
| `text` #F5F2FF | `brand-soft` #241A45 | 14.54 |
| `text-muted` #A9A2C4 | `bg` #0B0816 | 8.16 |
| `text-muted` #A9A2C4 | `surface` #151027 | 7.62 |
| `text-muted` #A9A2C4 | `surface-2` #201838 | 6.93 |
| `text-muted` #A9A2C4 | `brand-soft` #241A45 | 6.61 |
| `brand-ink` #A77BFF | `bg` #0B0816 | 6.53 |
| `brand-ink` #A77BFF | `surface` #151027 | 6.10 |
| `brand-ink` #A77BFF | `brand-soft` #241A45 | 5.29 |
| `on-brand` #FFFFFF | `brand` #7C2BFF | 5.76 |
| `on-brand` #FFFFFF | gradiente início #6A00FF | 6.87 |
| `on-brand` #FFFFFF | gradiente fim #9B3CFF | 4.68 |
| `brand` #7C2BFF (preenchimento) | `bg` #0B0816 | 3.44 |
| `ink` #140F26 | `success`/`brand-2` #22E688 | 11.32 |
| `success-ink` #22E688 | `surface` #151027 | 11.22 |
| `warning-ink` #FFC24D | `surface` #151027 | 11.52 |
| `danger-ink` #FF6B85 | `surface` #151027 | 6.78 |
| `danger-ink` #FF6B85 | `surface-2` #201838 | 6.16 |
| branco #FFFFFF | `danger` #C70D31 | 5.95 |
| `danger` #C70D31 (preenchimento) | `bg` #0B0816 | 3.33 |
| `outline-strong` #6B5F99 (borda de campo) | `surface` #151027 | 3.28 |
| `ring` #22E688 | `bg` #0B0816 | 12.01 |
| `ink` #140F26 | `status-published` #2EC5FF | 9.37 |
| pontos de status (todos) | `surface-2` #201838 | 4.93–10.20 |

`outline` (#E2DCF5 / #2E2550) é decorativo (divisores); nunca é a única fronteira de um
controle.

## 11. Briefs por área

Regras comuns: não mexer em Server Actions, rotas, queries, contratos Zod nem em
`lib/profiles/from-connection.ts` e `app/api/instagram/callback/route.ts`; manter os rótulos da
seção 9; usar só tokens v2 (sem hex solto, sem `bg-white` fora do Instagram simulado); rodar
`corepack pnpm lint && corepack pnpm typecheck` ao fim; checar os dois temas e 375 px de largura.

### A · Shell, navegação, login, lista de perfis, configurações

Arquivos: `components/app/AppShell.tsx`, `nav-items.ts`, `UserMenu.tsx`, `PhoneFrame.tsx`,
`app/(app)/layout.tsx`, `app/(app)/perfis/page.tsx`, `app/(app)/perfis/novo/*`,
`app/(app)/configuracoes/*`, `components/ui/avatar.tsx`, `components/ui/dropdown-menu.tsx`.

- Top bar mobile de vidro (`glass`, sem borda inferior sólida; borda `outline` só ao rolar se
  for simples). Logo 28 px.
- Barra inferior flutuante (seção 7) com item ativo em pastilha + glow; sidebar desktop com o
  mesmo item ativo e `ThemeToggle compact` no rodapé.
- Lista de perfis: título display "Seus perfis" (`text-h1`), cards `Card interactive` com
  avatar em anel de gradiente quando há pendências, contadores como pílulas `dot`
  (reaproveitar cores de status em vez de `bg-roxo-apoio`/`bg-verde` soltos). Estado vazio
  "Nada por aqui. Ainda." com ícone `Instagram`/`Plus` e o botão **Conectar conta do
  Instagram** (texto congelado).
- Conectar perfil: cartão grande com passo-a-passo numerado em display, botão primário.
- Configurações: seções em `Card`; `ThemeToggle` em "Aparência"; **Reconectar** (primário com
  glow quando a conexão expirou) e **Reagendar a 1 publicação que falhou** (manter o texto e o
  papel de botão); excluir conta em `destructive` dentro de dialog.
- `UserMenu`/dropdown: superfície `glass`, itens 44 px.
- Login (`app/(auth)/*`): fica com a área D (marketing), mas a área A garante que o shell não
  quebra a rota.
- Não mudar: o cookie `aprovo_last_profile`, a lógica de `getNavItems`, `requireUser`.

### B · Grade do feed, detalhe, editor, sheet de agendamento, agendadas

Arquivos: `components/feed/*` (FeedGrid, GridCell, SortableGrid, FeedToolbar, StatusFilter,
SelectionBar, AddPostFab, PostSheet, InstagramHeader, ProfileFeedView),
`components/media/*`, `components/publishing/ScheduleSheet.tsx`, `ScheduledList.tsx`,
`app/(app)/perfis/[id]/page.tsx`, `posts/[postId]/PostDetailView.tsx`,
`posts/[postId]/editar/PostEditor.tsx`, `posts/novo/NewPostFlow.tsx`, `agendadas/page.tsx`,
`importar/*`.

- Simulação do Instagram: envolver em `data-theme="light"` (continua branca, fonte do sistema,
  gap 2 px, células sem raio). Em volta dela, o app é v2.
- `GridCell`: `StatusPill variant="overlay"`, `Press scale="sm"` na célula, seleção com anel
  `ring-brand-ink` + check em pastilha gradiente; arrastar (dnd-kit) ganha sombra `shadow-glow`
  e leve escala 1.04 no item ativo; `haptic("tap")` ao soltar.
- `FeedToolbar`/`StatusFilter`: chips em trilho rolável horizontal, chip ativo em gradiente.
- `SelectionBar`: barra flutuante de vidro acima da nav, contador em display.
- `AddPostFab`: gradiente + glow, gira o "+" em 45° com a sheet aberta; opções da sheet viram
  tiles grandes `Card interactive`.
- Detalhe (`PostDetailView`): cabeçalho com `StatusPill variant="solid"`; ações em pilha no
  rodapé fixo de vidro: **Enviar para aprovação** (link, primário), **Agendar** (primário),
  **Reagendar**, **Cancelar agendamento** (`destructive` com dialog de confirmação). Manter
  "Agendada para …" como texto visível.
- Editor: campos v2, contador de caracteres com cor `warning-ink` perto do limite, tira de
  mídia com `Press`.
- `ScheduleSheet`: título "Agendar publicação" (heading), campos de data e **Hora** (label
  congelado) lado a lado, chips de atalho ("Hoje 18h", "Amanhã 10h"), botão **Agendar**
  `success`. Continua sendo Sheet Radix (`role="dialog"`).
- `ScheduledList`: três `<section aria-label>` (**Agendadas**, **Publicadas**, **Falhas**)
  com cabeçalho display + contador; linha do tempo com ponto de status; falhas em card com
  borda `danger-ink` e botão **Reagendar**; **Abrir no Instagram** como link com ícone
  `ExternalLink`. Vazio da região Falhas mantém "Nenhuma falha.".
- Skeletons com a forma da grade (3 colunas quadradas) e do detalhe.
- Não mudar: ordenação/posições, dnd-kit sensors, Server Actions de post e agendamento,
  `LiveUpdates`, `RememberProfile`.

### C · Página pública `/a/[token]`, compartilhar, lista de aprovações, reabrir

Arquivos: `app/a/[token]/page.tsx`, `components/approvals/*` (PublicApprovalView,
PublicFeedGrid, PublicMedia, ApprovalBar, InactiveLinkCard, ShareLinkSheet,
SendForApprovalForm, RecipientsField, ApprovalList, ApprovalRequestCard, ReopenSheet),
`app/(app)/aprovacoes/page.tsx`, `app/(app)/perfis/[id]/aprovacoes/**`.

- Página pública é o cartão de visita para o cliente final: fundo `bg-aurora` sobre `bg`,
  logo, saudação em display ("Oi, Carlos. Bora decidir?"), progresso "3 de 5 decididos" em
  barra com gradiente. Mídia dentro da ilha clara do Instagram.
- `ApprovalBar`: barra fixa de vidro no rodapé; **Aprovar** `success` grande (h-14) +
  **Pedir ajustes** `secondary`; "Decidindo como {nome}" em `text-caption` acima. Ao aprovar:
  `SuccessBurst` + `animate-success-pop` no check + `haptic("success")`; ao pedir ajustes:
  `haptic("warning")`.
- Final: tela cheia "Tudo decidido" (texto congelado) com glow verde; heading **Aprovação
  registrada** mantido como heading.
- `InactiveLinkCard`: estado vazio com atitude ("Esse link já era." + quem procurar).
- `ShareLinkSheet`: link em campo grande com botão copiar (toast "Link copiado"), botões de
  compartilhar nativo/WhatsApp; manter o `aria-label` "Link de aprovação de {nome}".
- `SendForApprovalForm`: título **Enviar para aprovação**, campo **Nome**, botão **Gerar
  link**; seleção de posts em tiles com check em gradiente (trocar `bg-white`/`bg-roxo`).
- Lista de aprovações e `ApprovalRequestCard`: cards com pílulas de estado (Aberto/Decidido/
  Cancelado) no estilo `dot`, avatares dos destinatários empilhados, progresso.
- `ReopenSheet`: sheet v2; itens com `StatusPill`.
- Não mudar: tokens/hashes, `decide.ts`, rate limit, eventos ao vivo, regras de link por
  pessoa, nada que logue o token.

### D · E-mails, ícones PWA, splash, imagem OG, login "marketing"

Arquivos: `lib/email/send.ts` (só o HTML), `lib/auth/config.ts` (só o template visual do link
mágico, se houver), `scripts/generate-icons.ts`, `public/icons/*`, `app/manifest.ts`,
`app/(auth)/layout.tsx`, `app/(auth)/entrar/page.tsx`, `app/(auth)/verificar/page.tsx`,
`app/legal/*` (visual), novo `app/opengraph-image.tsx` e `app/a/[token]/opengraph-image.tsx`
(opcional), `assets/brand/*`.

- Login: tela cheia `bg-aurora`, headline display com `text-gradient-brand` ("Planeje.
  Aprove. Publique."), formulário em card de vidro, botão primário "Enviar link de acesso",
  "Entrar com Google" em `secondary`. Mensagens de erro com tom v2 (seção 8), mesmas chaves.
- E-mails: HTML de tabela com estilos inline, fundo `#0B0816`, card `#151027`, título em
  Arial/Helvetica bold (fontes web não carregam em e-mail), botão roxo `#6A00FF` com texto
  branco, link puro de fallback, sem imagens obrigatórias. Assuntos não mudam de formato.
- Ícones PWA: símbolo (check verde) sobre gradiente roxo, sem a placa branca; maskable com
  80% de área segura; `apple-touch-icon` 180 px. Regenerar por `scripts/generate-icons.ts`.
- Manifest: `background_color` `#0B0816`, `theme_color` `#0B0816` (ou manter roxo, decidir no
  visual), `display: standalone`. Avaliar `statusBarStyle: "black-translucent"` só se todas as
  telas públicas respeitarem `safe-area-inset-top`.
- Splash iOS (`apple-touch-startup-image`) nos tamanhos principais, fundo escuro com logo
  `aprovo-logo-dark.png`.
- OG 1200×630: fundo aurora escuro, logo, frase. Para `/a/[token]` não expor dados do cliente
  nem o token na imagem.
- Logo SVG: vetorizar (palavra + check) com variantes clara/escura e símbolo isolado.
- Não mudar: fluxo de login (Auth.js), remetente, chamadas `deliver`/`Resend`.

## 12. O que já está implementado (fundação)

`app/globals.css` (tokens, temas, `@theme`, utilitários `glass`/`press`/gradientes, keyframes,
movimento reduzido), `app/layout.tsx` (fontes, script de tema, `themeColor` claro/escuro),
`lib/utils.ts` (`cn` com escala tipográfica), `lib/ui/haptics.ts`, `components/app/theme.ts`,
`components/app/ThemeToggle.tsx`, `components/app/Logo.tsx` (+ `public/brand/aprovo-logo-dark.png`),
`components/app/EmptyState.tsx`, `components/feed/StatusPill.tsx`, e em `components/ui/`:
`button`, `badge`, `card` (novo), `sheet`, `dialog`, `input`, `textarea`, `tabs`, `sonner`,
`skeleton`, `glow` (novo), `press` (novo), `success-burst` (novo).
