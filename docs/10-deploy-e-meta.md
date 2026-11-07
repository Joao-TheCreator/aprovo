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

## 9. App Review: `instagram_business_content_publish`

Material para o João submeter a permissão de publicação (docs/12 §6.2, T12). Enquanto o app **ELIM
MKT** está em modo de desenvolvimento, só quem tem papel no app (testadores do Instagram) publica
sem revisão; para qualquer cliente de fora é preciso o **App Review** com **Acesso avançado**.
Os nomes de menus da Meta mudam: **[≈]** marca o que pode estar com outro nome. Nada daqui foi
conferido no painel (a rede da sessão não acessa `developers.facebook.com`).

> **Atenção, o login do revisor.** O revisor da Meta precisa entrar no APROVO sozinho. Hoje o
> login é por link mágico (Resend com `onboarding@resend.dev`, que só entrega ao dono da conta) ou
> Google (modo Testando, só e-mails da lista). **Nenhum dos dois serve a um revisor anônimo.**
> Antes de submeter, o João precisa decidir uma destas saídas **[confirmar]**: (a) verificar um
> domínio no Resend e criar uma caixa de e-mail de revisão cujo acesso é informado ao revisor
> (o link mágico chega nela);
> (b) pedir a uma sessão do Claude Code um "acesso de revisor" temporário (por exemplo, login por
> e-mail e senha só para uma conta de teste, desligável por variável de ambiente); (c) publicar o
> app do Google em produção e informar uma conta Google de teste. A opção (b) é a mais confiável
> para o App Review e não faz parte do código atual.

### 9.1 Passo a passo no painel da Meta

Pré-requisitos: conta de teste profissional do Instagram **já testadora do app** (docs/12,
pergunta 9: `@joaomoreiraj` publica de verdade; o ideal é uma conta profissional só de teste),
produção no ar com `IG_PUBLISH_ENABLED=true` (seção 9.5) e as páginas `/legal/*` abrindo.

1. Abrir developers.facebook.com › **Meus apps** › **ELIM MKT**.
2. **Casos de uso** › **Gerenciar mensagens e conteúdo no Instagram** › **Personalizar** ›
   **Permissões e recursos** **[≈]**. Em `instagram_business_content_publish`, clicar em
   **Adicionar**. O status passa a "Pronto para testes". Manter também `instagram_business_basic`.
3. Ainda no caso de uso, aba **Configuração da API com login do Instagram** › **Configurações do
   login da empresa** **[≈]**:
   - **URL de callback de desautorização:** trocar `https://aprovo-six.vercel.app/legal/exclusao-de-dados`
     por **`https://aprovo-six.vercel.app/api/instagram/deauthorize`**. A rota recebe um `POST`
     com `signed_request` e marca a conexão como revogada, falhando as publicações agendadas dela.
     Um `GET` no navegador devolve 405: é esperado.
   - **URL de solicitação de exclusão de dados:** `https://aprovo-six.vercel.app/legal/exclusao-de-dados`
     (a página de instruções do APROVO). Ver 9.2 se a Meta recusar.
   - Manter a **OAuth Redirect URI** `https://aprovo-six.vercel.app/api/instagram/callback`.
4. **Configurações do app › Básico:** conferir ícone (1024 × 1024), categoria, e-mail de contato,
   **URL da Política de Privacidade** (`/legal/politica-de-privacidade`), **Termos**
   (`/legal/termos-de-uso`) e **Domínios do app** (`aprovo-six.vercel.app`).
5. Reconectar a conta de teste no APROVO (Configurações › Reconectar) para o diálogo da Meta
   pedir "Publicar conteúdo", e executar o fluxo completo uma vez em produção com a conta de teste.
6. **Revisão do app › Permissões e recursos** **[≈]** › `instagram_business_content_publish` ›
   **Solicitar acesso avançado**. Preencher: descrição de uso (9.3), instruções de teste (9.4),
   upload do screencast (9.6) e as respostas de **Tratamento de dados** (finalidade: publicar
   posts aprovados; dados guardados: token criptografado, mídia e legendas; exclusão: seção 9.2).
7. Se a Meta pedir, mudar o app para **Modo ativo (Live)**; isso exige política de privacidade e
   ícone válidos. Enviar para revisão e acompanhar em **Revisão do app › Solicitações**.

### 9.2 URL de instruções de exclusão de dados (doc 11)

Em 06/11/2026 a Meta recusou o campo **"URL de instruções de exclusão de dados"** de
**Configurações › Básico** ("deve ser uma URL válida"), mesmo com `/legal/exclusao-de-dados`
respondendo 200. Para tentar de novo, em ordem **[confirmar qual resolve]**:

1. Salvar **antes** os campos de política e termos e recarregar a página; só então colar a URL.
2. Colar a URL **sem espaços** e sem barra final, em HTTPS e no domínio já cadastrado em
   "Domínios do app": `https://aprovo-six.vercel.app/legal/exclusao-de-dados`.
3. Tentar em janela anônima, sem extensões e sem tradutor de página.
4. Usar o campo equivalente em **Casos de uso › Configurações do login da empresa**, que aceitou a
   mesma URL em 06/11/2026, e só depois repetir em Básico.
5. Se a Meta insistir, abrir um ticket pelo painel (**Ajuda › Suporte**) e, no formulário do App
   Review, informar a URL por escrito no campo de tratamento de dados. A exclusão manual por
   e-mail já está descrita na página.

### 9.3 Textos em inglês para colar

**How does your app use this permission? (`instagram_business_content_publish`)**

```text
APROVO is a planning and approval tool for social media agencies. An agency prepares upcoming
Instagram posts for a client and sends the client a personal approval link. The client reviews
each post and either approves it or requests changes. The client, who owns the Instagram
professional account, connects their own account to APROVO through Instagram Login. We use
instagram_business_content_publish only to publish posts that have been explicitly approved, at
the date and time the agency scheduled in APROVO. No content is created, edited or published
without the prior approval of the account owner. We publish only to the account that was
connected, and the owner can disconnect it at any time, which immediately cancels every
scheduled publication.
```

**How does your app use `instagram_business_basic`?**

```text
APROVO reads the connected account's username, profile picture and recent media so the agency
can preview how new posts will look on the real profile grid, and so a post that APROVO
published appears on that grid. Nothing is stored beyond what is needed for this preview.
```

**Data handling and deletion (if asked)**

```text
Access tokens are encrypted at rest and never logged. Media and captions are kept only while the
workspace exists. The account owner can disconnect the account in Settings, which revokes access
and cancels scheduled posts, and can request deletion of all data at
https://aprovo-six.vercel.app/legal/exclusao-de-dados.
```

### 9.4 Instruções de teste para o revisor (inglês)

Trocar os valores entre `<>` pelos reais (nunca colocar segredos neste repositório; as credenciais
vão só no formulário da Meta).

```text
APROVO is a web app (mobile-first). Open https://aprovo-six.vercel.app/entrar in a browser.

Test account (agency side)
  Login: <reviewer login, see attached credentials>
  Instagram test account (professional, already added as an Instagram Tester of the app):
  @<test_account>, login in the Instagram app/web: <username / password>

Steps
1. Log in to APROVO with the agency login above.
2. Go to "Configurações" (Settings) and tap "Conectar Instagram". Authorize the
   Instagram test account on the Instagram permission screen, including "Publicar conteúdo"
   (publish content). You return to APROVO with "Instagram conectado com sucesso".
3. Open the profile that was created from the account. Open the draft post "Post de teste" and
   tap "Enviar para aprovação". Type a name (for example "Reviewer") in "Nome" and tap
   "Gerar link". Copy the personal approval link.
4. Open that link in another browser window or on a phone (no login needed). Tap "Aprovar".
   The page confirms "Tudo decidido" and the link is closed.
5. Back in the agency login, open the post: its status is now "Aprovada". Tap "Agendar", choose a
   time about 5 minutes from now and confirm. The post shows "Agendada".
6. At the scheduled time the app publishes the post through the Content Publishing API. Reload the
   post or the "Agendadas" list: the status becomes "Publicada" and "Abrir no Instagram" opens the
   published media on the test account.

Notes: the UI is in Brazilian Portuguese; the English captions in the screencast name each step.
Publishing runs from a scheduler that checks every minute, so allow up to 2 minutes after the
scheduled time. Test posts can be deleted from the Instagram test account afterwards.
```

### 9.5 Variáveis na Vercel e fluxo de reconexão

Cadastrar em **Production** (e conferir `META_*`, que já existem):

| Variável | Valor | Observação |
|---|---|---|
| `IG_PUBLISH_ENABLED` | `true` | a conexão passa a pedir `instagram_business_content_publish` |
| `CRON_SECRET` | já cadastrada | o disparador (seção 10) envia o mesmo valor |
| `IG_PUBLISHER` | **não cadastrar** | `fake` só existe para e2e; em produção a variável fica ausente |

Conexões antigas (só `instagram_business_basic`) precisam **reconectar** uma vez; a tela de
Configurações avisa "Reconecte para autorizar a publicação".

### 9.6 Roteiro do screencast

Gravar em 1080p, voz ou legendas em **inglês** (a interface está em português; o revisor precisa
entender cada passo), na ordem abaixo, em um único take de 3 a 5 minutos **[confirmar limite de
tamanho/duração do upload]**. Mostrar a barra de endereço (`aprovo-six.vercel.app`) o tempo todo.

| # | Cena | O que mostrar |
|---|---|---|
| 1 | Login | `/entrar`, entrar como a social media (legenda: "Agency user logs in") |
| 2 | Configurações | menu › Configurações, seção Instagram sem conta conectada |
| 3 | Conectar conta | "Conectar Instagram" › tela da Meta com **todas** as permissões, incluindo "Publicar conteúdo" › autorizar |
| 4 | Perfil criado | volta com "Instagram conectado com sucesso"; o perfil `@conta` aparece com o feed real |
| 5 | Enviar para aprovação | abrir o rascunho › "Enviar para aprovação" › nome da pessoa › "Gerar link" (um link por pessoa) |
| 6 | Abrir no celular | colar o link no navegador do celular (sem login) ou em janela anônima; mostrar "Decidindo como …" |
| 7 | Aprovar | "Aprovar" › "Tudo decidido"; recarregar e mostrar "Aprovação registrada" |
| 8 | Agendar | na conta da agência, post "Aprovada" › "Agendar" › data e hora próximas › confirmar › "Agendada" |
| 9 | Cron publica | esperar o horário (acelerar o vídeo, mantendo o relógio visível); a lista "Agendadas" muda para "Publicadas" |
| 10 | Resultado | o post na grade do perfil e, em seguida, "Abrir no Instagram" mostrando o post publicado na conta de teste |
| 11 | Desconectar (opcional) | Configurações › Desconectar mostra que o dono revoga o acesso quando quiser |

### 9.7 Verificação do negócio (Business Verification) **[confirmar se exigido]**

A Meta costuma exigir a verificação do negócio para **Acesso avançado** a permissões de apps de
terceiros. Não está confirmado se vale para o Login do Instagram sem portfólio empresarial (o
doc 11 registra que a configuração atual já é marcada como obsoleta). Se for exigida:

- [ ] **Decisão do João:** em nome de qual CNPJ? (agência do João ou CPCann, doc 12 pergunta 8)
      e **quem assina** como responsável legal.
- [ ] Criar o **portfólio empresarial** (Meta Business) e vincular o app ELIM MKT a ele.
- [ ] Documentos do CNPJ: cartão CNPJ e um comprovante de endereço ou contrato social com o
      mesmo nome e endereço **[confirmar a lista aceita]**.
- [ ] Telefone ou e-mail comercial do domínio da empresa, com acesso para receber o código
      **[confirmar]**.
- [ ] Site da empresa com razão social e endereço; `aprovo-six.vercel.app` pode não bastar.
- [ ] Política de Privacidade e Termos publicados (já em `/legal/*`; revisão jurídica pendente).
- [ ] Conta do Facebook do João com autenticação em dois fatores, administradora do portfólio.

### 9.8 Prazo esperado e motivos comuns de recusa

**Prazo:** a Meta informa alguns dias úteis para o App Review; na prática, de 2 a 10 dias, e cada
rodada de ajustes recomeça a contagem **[confirmar: números não verificados]**. A verificação do
negócio, se exigida, pode levar mais alguns dias e acontece antes ou em paralelo.

**Recusas comuns e como evitar:**

- Screencast que não mostra o **login** nem a **tela de autorização** com a permissão pedida.
- Interface em português sem legendas em inglês, ou vídeo que corta antes da publicação aparecer
  no Instagram.
- Revisor **não consegue entrar** no app (credenciais ausentes, e-mail que não chega, ver o aviso
  no início desta seção).
- Pedir permissões que o fluxo não usa (por isso `IG_PUBLISH_ENABLED` só liga a de publicação).
- Descrição genérica: dizer **quem** aprova, **quando** o app publica e que nada é postado sem
  aprovação (texto 9.3).
- Política de privacidade ou instruções de exclusão de dados inacessíveis ou sem o que se faz
  com os dados do Instagram (ver 9.2).
- App em modo de desenvolvimento sem o recurso funcionando em produção no momento da revisão
  (o app precisa estar no ar, com `IG_PUBLISH_ENABLED=true`, e o cron rodando).
- Conta de teste que não é profissional ou não é testadora do app.

## 10. Disparador do cron em produção

A rota `GET /api/publishing/run` (docs/12 §5) precisa ser chamada **a cada minuto**; no plano
Hobby da Vercel o cron do `vercel.json` roda no máximo uma vez por dia **[confirmar no painel]**
(a entrada diária atual, `30 3 * * *`, é só rede de segurança: o plano Hobby recusa o deploy com
cron mais frequente que uma vez por dia). Duas opções, decisão do João (ADR-010):

| Opção | Custo | Quando usar |
|---|---|---|
| **A. Cloudflare Worker com Cron Trigger** | R$ 0 **[confirmar limites do plano gratuito]** | piloto e enquanto o app estiver no Hobby |
| **B. Vercel Pro** | US$ 20/mês | quando o APROVO cobrar (o Hobby é não comercial) |

### Opção A: Worker de 10 linhas

`src/index.js`:

```js
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      fetch(`${env.APROVO_URL}/api/publishing/run`, {
        headers: { "x-cron-secret": env.CRON_SECRET },
      }).then((res) => {
        if (!res.ok) throw new Error(`publishing run failed: ${res.status}`);
      }),
    );
  },
};
```

`wrangler.toml`:

```toml
name = "aprovo-cron"
main = "src/index.js"
compatibility_date = "2026-11-01"

[triggers]
crons = ["* * * * *"]

[vars]
APROVO_URL = "https://aprovo-six.vercel.app"
```

Publicar com `npx wrangler deploy` e cadastrar o segredo **sem colar no terminal compartilhado**:
`npx wrangler secret put CRON_SECRET` (o mesmo valor da Vercel). Conferir em **Workers › aprovo-cron
› Logs** que cada minuto retorna 200, e em `/api/publishing/run` (resposta `claimed`, `published`,
`lagSeconds`) que o atraso fica abaixo de 15 minutos. Dois disparadores ao mesmo tempo não
duplicam publicações: a rota é idempotente (docs/12 §5.3).

### Opção B: Vercel Pro

Mudar o `schedule` de `/api/publishing/run` em `vercel.json` para `* * * * *`. A Vercel envia
`Authorization: Bearer <CRON_SECRET>`, que a rota já aceita.

### Variáveis na Vercel (resumo)

`IG_PUBLISH_ENABLED=true`; `CRON_SECRET` (já existe); `IG_PUBLISHER` **ausente** em produção.
