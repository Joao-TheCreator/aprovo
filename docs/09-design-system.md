# 09 · Design system

Base: slide "Identidade visual" do briefing. Tudo que não é a simulação do Instagram usa estes
tokens. A simulação do Instagram usa as cores do próprio Instagram (fundo branco, texto preto,
botão azul aproximado `#4150F7`) para ser fiel.

## Cores

| Token | Hex | Uso |
|---|---|---|
| `--aprovo-roxo` | `#6A00FF` | Ações primárias, títulos, ícones ativos, FAB |
| `--aprovo-roxo-apoio` | `#9B3CFF` | Status "Aguardando aprovação", hover, gradientes |
| `--aprovo-verde` | `#22E688` | Status "Aprovada", botão Aprovar, confirmações |
| `--aprovo-lavanda` | `#EDE7FF` | Fundos de cartão, botão secundário, status "Ajustes solicitados" |
| `--aprovo-offwhite` | `#F8F7FF` | Fundo de página |
| `--aprovo-ink` | `#1C1633` | Texto principal (escuro com tom roxo) |
| `--aprovo-ink-2` | `#6B6584` | Texto secundário |
| `--aprovo-borda` | `#DDD6F3` | Bordas e divisores |
| `--aprovo-erro` | `#FF3B5C` | Erros e exclusão |

Dark mode: fora do MVP (o Instagram simulado continua claro). Preparar tokens em `:root` para
não bloquear.

## Status de publicação

| Status | Fundo | Texto | Ícone (Lucide) |
|---|---|---|---|
| Rascunho | `#FFFFFF` borda `--aprovo-borda` | `--aprovo-ink-2` | `pencil` |
| Aguardando aprovação | `--aprovo-roxo-apoio` | branco | `clock` |
| Aprovada | `--aprovo-verde` | `--aprovo-ink` | `check` |
| Ajustes solicitados | `--aprovo-lavanda` | `--aprovo-roxo` | `message-circle` |

## Tipografia

Poppins (Google Fonts via `next/font`): **Bold** para títulos, **SemiBold** para botões e
rótulos, **Regular** para corpo.

| Papel | Tamanho / linha | Peso |
|---|---|---|
| Título de tela | 24 / 32 | Bold |
| Subtítulo | 18 / 26 | SemiBold |
| Corpo | 15 / 22 | Regular |
| Rótulo / pílula | 12 / 16 | SemiBold, caixa alta opcional |

Na simulação do Instagram a fonte é a do sistema (`-apple-system, Roboto`) para parecer real.

## Formas e espaçamento

- Raio: botões e pílulas 999 px (totalmente arredondados); cartões 16 px; células da grade 0.
- Espaçamento base 4 px; gutters de página 16 px; grade do feed com gap 2 px como o Instagram.
- Sombras suaves só em folhas inferiores e FAB.

## Componentes base (shadcn/ui customizados)

`Button` (primary roxo, secondary lavanda, success verde, ghost), `Sheet` (folha inferior),
`Chip`, `StatusPill`, `Avatar`, `Skeleton`, `Toast`, `Dialog`, `Input`, `Textarea`,
`TagInput` (hashtags), `DateTimePicker` simples, `ProgressBar`.

## Componentes do feed

`ProfileHeader`, `ProfileTabs`, `FeedGrid`, `GridCell` (badge carrossel/vídeo + `StatusPill`),
`PostDetail` (carrossel com swipe, player), `MediaStrip` (tira reordenável), `CropEditor`
(enquadramento da miniatura), `ApprovalBar` (Aprovar / Pedir ajustes).

## Ícones

Lucide, `stroke-width: 1.75`, tamanho 24 na navegação e 20 em botões. Ícone do app: o check
verde do logo sobre roxo principal.

## Assets necessários

- Logo: raster extraído do briefing em `assets/brand/aprovo-logo.png` (794×346, fundo
  transparente). Vetor SVG e símbolo isolado ficam pendentes.
- Ícones PWA 192/512 px e máscara (maskable), splash iOS.
- Imagem Open Graph padrão para links de aprovação (1200×630).
