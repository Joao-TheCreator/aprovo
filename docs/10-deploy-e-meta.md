# 10 · Deploy na Vercel e app na Meta

Guia para colocar o APROVO no ar em tiers gratuitos e permitir que uma conta profissional do
Instagram (ex.: a do Samuel) seja conectada para os testes de integração.

> Estado real da infraestrutura em `docs/11-passagem-de-bastao.md` (produção: https://aprovo-six.vercel.app).
>
> Os nomes de menus da Meta e da Vercel mudam com frequência e a rede desta sessão não acessa
> `developers.facebook.com`. Onde o nome exato do botão puder variar, está marcado **[≈]**.

## Ordem recomendada

1. Criar as contas gratuitas: Vercel, Neon, Cloudflare (R2), Resend.
2. Subir o APROVO na Vercel (sem Instagram ainda) e confirmar o login por e-mail.
3. Criar o app na Meta e cadastrar a URL da Vercel como redirect.
4. Samuel converte a conta em profissional e aceita o convite de testador.
5. Em **Configurações › Instagram** no APROVO, clicar em "Conectar Instagram" e autorizar.
6. Conectar o perfil `@samuel…` pela Tela 01: o feed carrega pela API oficial.

## 1. Banco: Neon (grátis)

1. Criar projeto em neon.tech (região `aws-sa-east-1` São Paulo, se disponível; senão US East).
2. Copiar a connection string **pooled** (termina com `-pooler`). Ela vira `DATABASE_URL`.
3. Opcional: criar um branch `staging` para os previews da Vercel.

## 2. Storage: Cloudflare R2 (grátis até 10 GB)

1. Cloudflare Dashboard › R2 › Create bucket `aprovo-media` (privado; não habilitar acesso público).
2. R2 › Manage R2 API Tokens › Create token com permissão **Object Read & Write** no bucket.
   Guardar `Access Key ID` e `Secret Access Key`.
3. Anotar o `Account ID` (aparece na URL do painel) e o endpoint
   `https://<account_id>.r2.cloudflarestorage.com`.
4. No bucket, em Settings › CORS, permitir `PUT` e `GET` a partir do domínio da Vercel
   (`https://<projeto>.vercel.app`) com headers `Content-Type`.

## 3. E-mail: Resend (grátis até 3.000/mês)

1. Criar conta em resend.com e uma API key.
2. Sem domínio próprio, usar o remetente de teste `onboarding@resend.dev`. Ele só entrega para o
   e-mail do dono da conta Resend; para outras pessoas é preciso verificar um domínio. Para o
   piloto com poucas pessoas, usar o Google como login resolve.

## 4. Login com Google (opcional, recomendado para o piloto)

1. console.cloud.google.com › novo projeto › APIs e serviços › Tela de consentimento OAuth
   (externo, modo teste, adicionar os e-mails dos testadores).
2. Credenciais › Criar credenciais › ID do cliente OAuth › Aplicativo da Web.
   URIs de redirecionamento: `https://<projeto>.vercel.app/api/auth/callback/google` e
   `http://localhost:3000/api/auth/callback/google`.
3. Guardar `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`.

## 5. Vercel

1. vercel.com › Add New › Project › importar `Joao-TheCreator/aprovo`. Framework: Next.js.
   Branch de produção: `main` (ou a branch atual até fazer o merge).
2. Build command padrão (`pnpm build`). Install command padrão.
3. Environment Variables (Production e Preview):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string pooled do Neon |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<projeto>.vercel.app` |
| `APP_URL` | `https://<projeto>.vercel.app` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | do passo 4 (opcional) |
| `RESEND_API_KEY` | do passo 3 |
| `EMAIL_FROM` | `APROVO <onboarding@resend.dev>` |
| `STORAGE_DRIVER` | `s3` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | do passo 2 |
| `R2_BUCKET` | `aprovo-media` |
| `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
| `META_APP_ID`, `META_APP_SECRET` | do passo 6 (Instagram App ID e Secret) |
| `META_REDIRECT_URI` | `https://<projeto>.vercel.app/api/instagram/callback` |
| `IG_FALLBACK_PROVIDER` | `none` |
| `CRON_SECRET` | string longa aleatória; protege `/api/instagram/refresh` (cron semanal em `vercel.json`) |

4. Deploy. Depois do primeiro deploy, rodar as migrations uma vez a partir da sua máquina:

```bash
DATABASE_URL='<string do Neon>' pnpm db:migrate
```

5. Abrir `https://<projeto>.vercel.app/entrar` e entrar.

Observação: o plano Hobby da Vercel é só para uso não comercial. Ao cobrar clientes, migrar
para Pro ou Cloudflare Workers (ADR-002).

## 6. App na Meta (developers.facebook.com)

> Modelo vigente (ADR-009): Login do Instagram, feeds só de contas conectadas. A seção abaixo
> descreve a configuração do produto Instagram; o Login do Facebook (ADR-008) fica como opção.

Pré-requisito: uma conta do Facebook do João com acesso a developers.facebook.com. Pode ser
feito junto com o Claude Cowork.

1. My Apps › **Create App** › caso de uso **"Other"** › tipo **Business** **[≈]**. Nome: `Aprovo`.
2. No painel do app, em **Add products**, adicionar **Instagram** **[≈]**.
3. Em Instagram › **API setup with Instagram login** **[≈]**:
   - Copiar **Instagram App ID** e **Instagram App Secret** (são diferentes do App ID geral da
     Meta). Eles viram `META_APP_ID` e `META_APP_SECRET`.
   - Em **Business login settings** **[≈]**, adicionar a **OAuth Redirect URI**
     `https://<projeto>.vercel.app/api/instagram/callback`. A Meta só aceita HTTPS aqui
     (`http://localhost:3000/...` é recusado); para OAuth local use um túnel HTTPS.
   - Deauthorize callback e Data deletion request: `https://<projeto>.vercel.app/legal/exclusao-de-dados`.
4. Em **App Roles › Roles** **[≈]** (ou dentro de Instagram › "Add Instagram testers"), adicionar
   o @ do Samuel como **Instagram Tester**. O Samuel aceita o convite no Instagram em
   Configurações › Site e apps › Convites de testador **[≈]**.
5. Em **App settings › Basic**, preencher Privacy Policy URL
   (`https://<projeto>.vercel.app/legal/politica-de-privacidade`) e Terms
   (`…/legal/termos-de-uso`). O app pode ficar em **modo de desenvolvimento**: usuários com
   papel no app (testers) usam todas as permissões sem App Review.
6. Permissões usadas agora: `instagram_business_basic`. Quando entrar a publicação:
   `instagram_business_content_publish` (exige App Review para contas sem papel no app).

## 7. Conta do Samuel

1. Instagram › Configurações › Tipo de conta › **Mudar para conta profissional** › Criador (ou
   Empresa). Gratuito e reversível. Conta pessoal **não** consegue autorizar o app.
2. Aceitar o convite de testador (passo 6.4).
3. No APROVO: Configurações › Instagram › **Conectar Instagram** › autorizar.
4. Conectar o próprio perfil pela Tela 01 (`@samuel…`): o APROVO usa `/me/media` para a conta
   conectada e Business Discovery para qualquer outra conta profissional pública.

## 8. Checklist de validação da integração

Estado em 06/11/2026 (validação feita com a conta do João, convertida para profissional):

- [x] Login por e-mail ou Google funciona na Vercel.
- [ ] Upload de foto e vídeo grava no R2 (ver objetos no painel do Cloudflare).
- [x] "Conectar Instagram" redireciona para a Meta e volta com "Conectado como @…" (Login do
      Instagram, `@joaomoreiraj`).
- [x] Tela 01 com a conta conectada carrega cabeçalho e posts com miniaturas (6 posts).
- [ ] ~~Tela 01 com outra conta profissional pública via Business Discovery~~ — fora do modelo
      (ADR-009): o APROVO mostra só contas conectadas.
- [ ] Tela 01 com conta não conectada mostra a mensagem e oferece importação manual.
- [ ] Link de aprovação abre sem login no celular do cliente e a decisão aparece em tempo real.
- [ ] Samuel conecta `@samuelbozzuto` (profissional) no workspace dele e vê o próprio feed.
