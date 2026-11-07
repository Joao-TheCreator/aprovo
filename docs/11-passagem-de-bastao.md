# 11 · Passagem de bastão (estado da infraestrutura em 06/11/2026)

Registro do que o João fez pelo Claude Cowork e pelo Claude Code. **Sem chaves secretas**: os segredos ficam no
gerenciador de senhas do João com nomes "APROVO – …". Conta usada nos serviços:
jpedrobiel@gmail.com (Vercel via GitHub).

| Etapa | Status |
|---|---|
| Banco Neon | feito |
| Cloudflare R2 (bucket, token, CORS) | feito |
| Resend (API key) | feito |
| Login com Google (OAuth) | feito; falta adicionar o e-mail do Samuel como testador |
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
`CRON_SECRET`*. (* só Production.) Nenhuma variável falta.

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
- **Funções:** `samuelbozzuto` convidado como Testador do Instagram (pendente de aceite em
  Instagram › Configurações › Site e apps › Convites de testador).

Falta: **e-mail Google do Samuel** (ou outra conta Google) na lista de testadores do OAuth
(console.cloud.google.com › projeto `aprovo-513922` › Google Auth Platform › Público).

## Observações operacionais

- Previews da Vercel usam o mesmo `DATABASE_URL` e não têm `AUTH_URL`/`APP_URL`; para evitar
  logins quebrados em previews, ou cadastrar essas duas variáveis também em Preview (com a URL
  do preview) ou desligar deploys de preview até o merge.
- Plano Hobby é só para uso não comercial; ao cobrar clientes, migrar (ADR-002).
- O Claude não cola segredos, não faz login e não aceita termos; confere variáveis só por
  tamanho e prefixo.
