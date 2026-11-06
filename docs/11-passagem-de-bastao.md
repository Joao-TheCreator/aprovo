# 11 · Passagem de bastão (estado da infraestrutura em 06/11/2026)

Registro do que o João fez pelo Claude Cowork. **Sem chaves secretas**: os segredos ficam no
gerenciador de senhas do João com nomes "APROVO – …". Conta usada nos serviços:
jpedrobiel@gmail.com (Vercel via GitHub).

| Etapa | Status |
|---|---|
| Banco Neon | feito |
| Cloudflare R2 (bucket, token, CORS) | feito |
| Resend (API key) | feito |
| Login com Google (OAuth) | feito; falta adicionar o Gmail do Samuel como testador |
| Vercel (deploy + migrations) | feito, no ar |
| App na Meta (Instagram) | **próximo passo** |
| Conta do Samuel + validação | pendente |

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
- **Vercel:** time `jpedrobiel-6428` (Hobby), projeto `aprovo`, branch de produção
  `claude/blissful-archimedes-cxl86r` (trocar para `main` após o merge). Build command:
  `pnpm db:migrate && pnpm build` (migrations rodam a cada deploy).

## Variáveis cadastradas na Vercel

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`*, `APP_URL`*, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `STORAGE_DRIVER=s3`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `IG_FALLBACK_PROVIDER=none`,
`META_REDIRECT_URI`*. (* só Production.)

**Faltam:** `META_APP_ID` e `META_APP_SECRET` (saem do app na Meta) e `CRON_SECRET`
(qualquer string longa; protege a rota semanal `/api/instagram/refresh` que renova o token).
Depois de adicionar, fazer Redeploy.

## Próximo passo: app na Meta

Ver `docs/10-deploy-e-meta.md`, seção 6, usando as URLs:

- Redirect OAuth: `https://aprovo-six.vercel.app/api/instagram/callback` e
  `http://localhost:3000/api/instagram/callback`
- Deauthorize / Data deletion: `https://aprovo-six.vercel.app/legal/exclusao-de-dados`
- Privacy: `https://aprovo-six.vercel.app/legal/politica-de-privacidade`
- Terms: `https://aprovo-six.vercel.app/legal/termos-de-uso`

Dados que faltam do Samuel: **@ do Instagram** (convite de testador na Meta) e **Gmail**
(lista de testadores do Google OAuth).

## Observações operacionais

- Previews da Vercel usam o mesmo `DATABASE_URL` e não têm `AUTH_URL`/`APP_URL`; para evitar
  logins quebrados em previews, ou cadastrar essas duas variáveis também em Preview (com a URL
  do preview) ou desligar deploys de preview até o merge.
- Plano Hobby é só para uso não comercial; ao cobrar clientes, migrar (ADR-002).
- O Claude não cola segredos, não faz login e não aceita termos; confere variáveis só por
  tamanho e prefixo.
