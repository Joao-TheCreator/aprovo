# 07 · Como carregar o feed do Instagram pelo @ (estado em novembro de 2026)

Pesquisa feita com busca web e conhecimento prévio. A rede desta sessão bloqueia
`developers.facebook.com`, então os pontos marcados **[confirmar]** precisam ser conferidos na
documentação oficial antes da fase 1. Nada aqui muda a arquitetura; muda só detalhes de campos
e limites.

## 1. O que não existe mais

- **Instagram Basic Display API**: desligada em **4 de dezembro de 2024**. Era a API "leve" para
  contas pessoais lerem a própria mídia. Nunca serviu para ler perfis de terceiros.
- **Contas pessoais** não conectam mais a apps de terceiros. Só contas **profissionais**
  (Business ou Creator) conseguem autorizar um app.

## 2. As duas APIs oficiais atuais

| | Instagram API **com Instagram Login** | Instagram API **com Facebook Login** |
|---|---|---|
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Conta necessária | Profissional; **não** exige Página do Facebook | Profissional **ligada a uma Página** |
| Escopos principais | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages` | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` |
| Quem usa sem App Review | Usuários com **papel no app** (admin, developer, tester) enquanto o app está em modo Desenvolvimento / Standard Access **[confirmar]** | Idem |
| Para clientes externos | App Review + verificação do negócio (Advanced Access) | Idem |

## 3. Business Discovery: o caminho para "digitar o @"

`GET /{ig-user-id}?fields=business_discovery.username(<alvo>){username,name,biography,
profile_picture_url,website,followers_count,follows_count,media_count,
media{id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,
comments_count,children{media_url,media_type}}}`

- **Continua disponível** (a doc da versão Facebook Login foi atualizada em agosto de 2026).
  Disponibilidade na versão Instagram Login: **[confirmar]**; se não houver, usar Facebook Login.
- `{ig-user-id}` é a conta profissional **do próprio APROVO** (conta ponte da CPCann). O alvo
  pode ser **qualquer conta Business ou Creator pública**. O cliente não faz login.
- **Limitação principal:** se o alvo for **conta pessoal**, a chamada falha. É o motivo do
  fallback e da importação manual.
- `media` devolve até 25–50 itens por página com paginação por cursor **[confirmar]**.
- `media_url` e `thumbnail_url` apontam para o CDN do Instagram e **expiram** (horas a dias).
  Por isso o APROVO **copia avatar e miniaturas para o próprio Storage** no momento da
  importação.
- Alguns campos de vídeo podem vir vazios em mídia de terceiros (reels com download desativado).
- Rate limit: contabilizado no limite de chamadas do app (BUC); não há número fixo publicado para
  business discovery **[confirmar]**. Com cache de 24 h por perfil, o uso é baixo.
- Permissões: `instagram_basic` + `pages_show_list` + `pages_read_engagement` (Facebook Login)
  ou `instagram_business_basic` (Instagram Login) **[confirmar]**.

### Como provisionar (fase 1)

1. **Conta ponte:** o perfil pessoal do João convertido em **Profissional** (tipo "Criador de
   conteúdo"; gratuito, reversível, feito em Configurações → Tipo de conta). Uma conta pessoal
   **não** serve como ponte: a Graph API só emite token para contas profissionais. Se não quiser
   converter, usar outra conta profissional. A conta da CPCann não será usada.
2. Página do Facebook ligada a ela só se usarmos a versão Facebook Login; com Instagram Login
   não é necessária.
3. App em **developers.facebook.com** com o produto Instagram, criado depois com Claude Cowork;
   João como admin.
4. Gerar token de usuário no Graph API Explorer com os escopos acima e trocar por **token de
   longa duração (60 dias)**; agendar renovação automática (cron semanal) no servidor.
5. Guardar `META_GRAPH_ACCESS_TOKEN` e `META_IG_USER_ID` nas variáveis do servidor.

## 4. Publicar e agendar (fases futuras)

- **Content Publishing API** publica imagem, carrossel (até 10 itens), reels e stories, em duas
  etapas: criar *container* → `media_publish`.
- A mídia precisa estar em **URL pública** no momento da publicação (o APROVO gera URL assinada
  temporária do Storage).
- Limite por conta: a doc atual cita **100 publicações por 24 h** (já foi 25 e 50; consultar
  `/{ig-id}/content_publishing_limit`).
- **Não há agendamento nativo**: o APROVO precisa do próprio agendador (cron + fila).
- Exige que **o cliente autorize o app** (OAuth com Instagram Login) e escopo de publicação, o
  que exige **App Review** para contas que não têm papel no app. Por isso fica fora do MVP.

## 5. oEmbed

Devolve HTML de incorporação e metadados de **um post** público. Exige a feature "Meta oEmbed
Read" com App Review. Não retorna perfil nem lista de posts, então não serve para montar a grade.
Pode ser útil no futuro para "abrir no Instagram" com prévia.

## 6. Fallback por provedores de terceiros (scraping gerenciado)

| Provedor | Preço aproximado | Observações |
|---|---|---|
| Apify `apify/instagram-scraper` | US$ 1,5–2,7 por 1.000 itens | Actor oficial da Apify; issues públicos de quebras ocasionais |
| ScrapeCreators | US$ 1–1,9 por 1.000 requisições | API simples por @; benchmark do próprio fornecedor |
| HikerAPI, RapidAPI "instagram-scraper" | não verificado | Variam muito em estabilidade |

Riscos: viola os Termos de Uso do Instagram, quebra quando o Instagram muda, e há questões de
LGPD ao coletar dados de terceiros. Posição do plano: implementar atrás de **feature flag**,
desligado por padrão, e só ligar com decisão do João (idealmente com parecer jurídico).

## 7. Mudanças recentes a acompanhar

- Dez/2024: fim da Basic Display.
- Jan/2025: objeto Media perde `filter_name`, `location`, `latitude`, `longitude`.
- Abr/2025: "oEmbed Read" vira "Meta oEmbed Read".
- Ago/2026: doc de Business Discovery atualizada (conteúdo não lido nesta sessão).
- Verificar o changelog da Graph API (versão vigente e datas de depreciação) **[confirmar]**.

## 8. Recomendação para o MVP

| Opção | Cobertura | Custo | Risco | Esforço |
|---|---|---|---|---|
| **Business Discovery (conta ponte)** | Business/Creator públicas (maioria dos clientes de social media) | Grátis | Baixo | Médio (app Meta + token) |
| OAuth do cliente (Instagram Login) | Só quem autorizar | Grátis | Baixo | Médio; necessário para publicar |
| oEmbed | Um post por vez | Grátis | Baixo (Review) | Não monta grade |
| Scraping gerenciado | Quase qualquer conta pública | ~US$ 1–3 / 1.000 | Alto (ToS, quebras, LGPD) | Baixo integrar, alto manter |
| Importação manual | Qualquer conta | Zero | Nenhum | Baixo |

**Decisão (ADR-003):** Business Discovery como principal; importação manual sempre disponível;
scraping atrás de flag; OAuth + publicação só na fase de publicação.

## Interface do provedor (para implementação)

```ts
export interface InstagramProvider {
  fetchProfile(username: string): Promise<IgProfile | IgError>;
  fetchMedia(username: string, cursor?: string): Promise<IgMediaPage | IgError>;
}
export type IgError =
  | { code: "not_found" }
  | { code: "private_or_personal" }
  | { code: "rate_limited"; retryAfterSec: number }
  | { code: "provider_down"; message: string };
```

Implementações: `GraphBusinessDiscoveryProvider`, `ScrapingProvider` (flag), `ManualImport`
(não é provider; é um formulário).

## Fontes consultadas (via trechos de busca)

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.facebook.com/docs/instagram-platform/oembed
- https://developers.facebook.com/docs/features-reference/meta-oembed-read
- https://smashballoon.com/instagram-is-shutting-down-basic-display-api-continue-displaying-instagram-feeds-on-your-site/
- https://www.getphyllo.com/post/instagram-api-guide
- https://apify.com/apify/instagram-scraper
- https://scrapecreators.com/blog/apify-instagram-scraper-benchmark
