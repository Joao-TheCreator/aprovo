# 11 · Passagem de bastão (estado da infraestrutura em 06/11/2026)

Registro do que o João fez pelo Claude Cowork e pelo Claude Code. **Sem chaves secretas**: os segredos ficam no
gerenciador de senhas do João com nomes "APROVO – …". Conta usada nos serviços:
jpedrobiel@gmail.com (Vercel via GitHub).

| Etapa | Status |
|---|---|
| Banco Neon | feito |
| Cloudflare R2 (bucket, token, CORS) | feito |
| Resend (API key) | feito |
| Login com Google (OAuth) | feito; e-mail do Samuel na lista de testadores |
| Vercel (deploy + migrations) | feito, no ar; produção segue `main`; `CRON_SECRET` cadastrada |
| GitHub | `main` é a branch padrão |
| App na Meta (Instagram) | feito no app existente **ELIM MKT** (ver seção abaixo) |
| Conta do Samuel + validação | convite de Instagram Tester enviado (pendente de aceite); checklist da seção 8 do doc 10 pendente |

**Produção:** https://aprovo-six.vercel.app · login em `/entrar`.

## Infra

- **Neon:** projeto `aprovo` (São Paulo, `aws-sa-east-1`), branch `production`, banco `neondb`,
  pooling ligado. Migrations aplicadas.
- **R2:** bucket privado `aprovo-media`, token `aprovo-vercel` (Object Read & Write só nesse
  bucket). CORS: origens `https://aprovo-six.vercel.app` e `http://localhost:3000`, métodos
  GET/PUT/HEAD, header `Content-Type`, expõe `ETag`, max-age 3600.
- **Resend:** key "Onboarding", remetente `APROVO <onboarding@resend.dev>` (só entrega para o
  e-mail do dono; testadores entram pelo Google).
- **Google OAuth:** projeto `aprovo-513922`, tela de consentimento externa em modo Testando;
  cliente "APROVO Web" com redirects `http://localhost:3000/api/auth/callback/google` e
  `https://aprovo-six.vercel.app/api/auth/callback/google`.
- **Vercel:** time `jpedrobiel-6428` (Hobby), projeto `aprovo`, branch de produção `main`
  (Settings › Environments › Production › Branch Tracking). Build command:
  `pnpm db:migrate && pnpm build` (migrations rodam a cada deploy). Cron semanal
  `/api/instagram/refresh` (segunda 03:00 UTC, `vercel.json`); a rota é pública no `proxy.ts`
  e se protege com `CRON_SECRET`.
- **GitHub:** `Joao-TheCreator/aprovo`, branch padrão `main`.

## Variáveis cadastradas na Vercel

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`*, `APP_URL`*, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `STORAGE_DRIVER=s3`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `IG_FALLBACK_PROVIDER=none`,
`META_REDIRECT_URI`*, `META_APP_ID`* (`26109955498700488`, Config), `META_APP_SECRET`*,
`CRON_SECRET`*, `META_FB_APP_ID`* (`1912316206111250`, Config), `META_FB_CONFIG_ID`*
(`1474715154853745`, Config), `META_FB_APP_SECRET`*. (* só Production.)
`META_OAUTH_PROVIDER` não está cadastrada: o padrão do código é `instagram` (ADR-009).

## App na Meta (feito em 06/11/2026)

Usado o app existente **ELIM MKT** (App ID `1912316206111250`, modo de desenvolvimento, sem
portfólio empresarial) em vez de criar um novo. Caso de uso "Gerenciar mensagens e conteúdo no
Instagram" › aba **Configuração da API com login do Instagram**:

- **Instagram App ID** `26109955498700488` (= `META_APP_ID`); o secret está no gerenciador de
  senhas como "APROVO – META_APP_SECRET".
- **Configurações do login da empresa:** redirect `https://aprovo-six.vercel.app/api/instagram/callback`;
  desautorização e exclusão de dados em `https://aprovo-six.vercel.app/legal/exclusao-de-dados`.
  A Meta **recusou** `http://localhost:3000/...` (só aceita HTTPS); para testar OAuth local é
  preciso um túnel HTTPS ou testar em produção.
- **Configurações › Básico:** política de privacidade, termos e domínio `aprovo-six.vercel.app`
  salvos. O campo "URL de instruções de exclusão de dados" dessa tela foi recusado pela Meta
  ("deve ser uma URL válida") mesmo com a página respondendo 200; só importa para App Review.
- A Meta marca essa configuração como obsoleta em favor do "login unificado", que exige
  portfólio empresarial. Continua funcionando; migrar quando for preciso [confirmar prazo].
- **Funções:** Testadores do Instagram: `samuelbozzuto` e `joaomoreiraj` (aceitos),
  `samuelbdesigner` (pendente). O convite não gera notificação; aceita-se em
  instagram.com/accounts/manage_access › Convites de testador.
- **Login do Facebook (ADR-008, opcional):** produto "Login do Facebook para Empresas" com
  redirect, desautorização e exclusão configurados; `instagram_basic` habilitada; configuração
  de login "Aprovo" (`config_id` `1474715154853745`) com `instagram_basic`, `pages_show_list`,
  `pages_read_engagement`. Validado até a concessão de ativos; não é o padrão.

### Validação de 06/11/2026 e o que ficou temporário

- `@joaomoreiraj` foi convertido para conta **profissional (Empresa)** e conectado pelo Login
  do Instagram: "Conectado como @joaomoreiraj", feed com 6 posts e miniaturas. A Graph API
  confirmou que `business_discovery` **não existe** no Login do Instagram, o que levou às
  ADR-008 e ADR-009.
- A Página do Facebook **Heloisa Souza** foi vinculada a `@joaomoreiraj` só para testar o Login
  do Facebook e depois **excluída** pelo João (06/11/2026; o Facebook permite reativar por 14
  dias). A conversão de `@joaomoreiraj` para profissional permanece. **Atenção:** a conta
  precisa continuar profissional enquanto for a conta de teste do APROVO; ao voltar para
  pessoal, a conexão para de funcionar.
- Integração ELIM MKT nas "Integrações comerciais" do Facebook do João: pode ser removida se o
  Login do Facebook não for usado.

### Próxima tarefa (ADR-009)

Conexões múltiplas por workspace (uma por conta do Instagram), perfil criado a partir da conta
conectada, "Conectar perfil" vira "Conectar conta do Instagram"; depois, publicação agendada
com `instagram_business_content_publish`.

- **Google OAuth:** e-mail do Samuel adicionado como usuário de teste (console.cloud.google.com
  › projeto `aprovo-513922` › Google Auth Platform › Público). O endereço fica no gerenciador
  de senhas, não neste doc.

## Observações operacionais

- Previews da Vercel usam o mesmo `DATABASE_URL` e não têm `AUTH_URL`/`APP_URL`; para evitar
  logins quebrados em previews, ou cadastrar essas duas variáveis também em Preview (com a URL
  do preview) ou desligar deploys de preview até o merge.
- Plano Hobby é só para uso não comercial; ao cobrar clientes, migrar (ADR-002).
- O Claude não cola segredos, não faz login e não aceita termos; confere variáveis só por
  tamanho e prefixo.
