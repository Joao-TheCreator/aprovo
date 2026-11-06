# 01 · Visão e escopo do APROVO

> **Planeje. Aprove. Publique.** Gestão e aprovação de conteúdos para redes sociais.

## 1. O problema

Social medias (freelancers e agências) montam o feed do Instagram dos clientes em ferramentas
soltas (Canva, WhatsApp, Google Drive, prints) e pedem aprovação por mensagem. O resultado:

- O cliente não vê **como o feed vai ficar** depois das próximas publicações.
- A aprovação se perde em conversas; não há registro de **quem aprovou, quando e o quê**.
- Ajustes viram idas e vindas de arquivo, com perda de qualidade e de contexto.

## 2. O produto

O APROVO é um **web app mobile-first** onde o social media:

1. Conecta o perfil público do Instagram do cliente (apenas o @, sem login do cliente).
2. Vê o perfil e o feed atuais simulados como no Instagram.
3. Adiciona novas publicações (post, carrossel ou vídeo) a partir da galeria do celular.
4. Organiza a ordem dos conteúdos na grade e vê a prévia atualizar na hora.
5. Preenche legenda, hashtags e data prevista; salva rascunho ou **envia para aprovação**.
6. Gera um **link de aprovação** por publicação ou por conjunto. O cliente abre sem conta,
   aprova ou pede ajustes, e o status volta em tempo real para o social media.

A referência de uso é o app **My Feed · Grid Preview & Planner** (iOS): mesma ideia de simular
o perfil e arrastar conteúdos na grade. O APROVO acrescenta o que o MyFeed não tem: o **fluxo de
aprovação com o cliente** e o **registro da aprovação**.

## 3. Usuários

| Papel | Quem é | O que faz no APROVO | Precisa de conta? |
|---|---|---|---|
| **Social media** (usuário principal) | Freelancer ou membro de agência | Conecta perfis, cria e organiza publicações, envia para aprovação | Sim (e-mail ou Google) |
| **Cliente aprovador** | Dono do negócio ou responsável de marketing | Abre o link, vê a prévia, aprova ou solicita ajustes com comentário | Não (acesso por link) |
| **Admin do workspace** (etapa futura) | Dono da agência | Gerencia membros e perfis | Sim |

## 4. Escopo da primeira etapa (MVP)

Segue o briefing: "Primeiro, o essencial". Prioridade é a **organização visual do feed** e o
**fluxo de aprovação**.

### Dentro do MVP

| # | Capacidade | Tela do briefing |
|---|---|---|
| 1 | Cadastro/login do social media | — |
| 2 | Conectar perfil público do Instagram pelo @ e importar cabeçalho + últimos posts | Tela 01 |
| 3 | Visualização do perfil e do feed simulando o Instagram (3 colunas, abas, contadores) | Tela 02 |
| 4 | Adicionar publicação: **Post** (foto ou carrossel) e **Vídeo** | Tela 03 |
| 5 | Upload preservando o arquivo original e gerando prévias leves para a grade | Telas 03/04 |
| 6 | Detalhe ampliado da publicação ao tocar na grade | Tela 04 |
| 7 | Edição da publicação: legenda, hashtags, data prevista, prévia no feed; salvar rascunho ou enviar para aprovação | Tela 05 |
| 8 | Link de aprovação por publicação ou por conjunto; abre sem conta; registra data, hora e link usado | Tela 05 |
| 9 | Feed organizado: reordenar por arrastar e soltar; status visível (Rascunho, Aguardando aprovação, Aprovada, Ajustes solicitados) | Tela 06 |
| 10 | Retorno da aprovação em tempo real no ambiente do social media | Tela 07 |
| 11 | Vários perfis (clientes) por social media | implícito |
| 12 | PWA instalável no celular (ícone na tela inicial, abre em tela cheia) | mobile-first |

### Fora do MVP (etapas futuras)

- **Calendário completo** (explicitamente adiado no briefing). Fica só o campo "data prevista".
- Publicar ou agendar no Instagram de verdade (exige autorização do cliente via Meta e App Review).
- Stories, destaques e edição de informações de perfil (aparecem no menu do Instagram, mas o
  briefing limita a Post e Vídeo).
- Edição de imagem (corte, filtros). O MVP só define o enquadramento da miniatura na grade.
- Comentários em thread, menções, notificações push, relatórios, cobrança/planos.
- Outras redes (TikTok, LinkedIn, Facebook).

## 5. Princípios de produto

1. **Fiel ao Instagram.** A grade, o cabeçalho e o detalhe devem parecer o app real para que o
   cliente entenda sem explicação.
2. **Zero atrito para o cliente.** Nenhum cadastro para aprovar. Um toque em "Aprovar".
3. **Mobile-first, mas funciona no desktop.** O social media edita no celular; o cliente aprova
   no celular; o desktop é bônus.
4. **Qualidade dos arquivos preservada.** O original nunca é recomprimido; prévias são derivadas.
5. **Rastreável.** Toda mudança de status guarda quem, quando, por qual link e com qual comentário.
6. **Identidade própria.** Cores e tipografia do APROVO (roxo, verde de aprovação, Poppins) em
   tudo que não é a simulação do Instagram.

## 6. Métricas de sucesso do MVP

| Métrica | Meta inicial |
|---|---|
| Tempo para conectar um perfil e ver o feed | < 30 s |
| Tempo para criar uma publicação a partir da galeria | < 2 min |
| Taxa de aprovações concluídas pelo link (abertas → decididas) | > 70 % |
| Tempo médio entre "enviado" e "decidido" | < 24 h |
| Erros de importação de perfil | < 5 % das tentativas |

## 7. Perguntas em aberto para o João (dono do produto)

Respostas mudam detalhes, não a direção. Enquanto não vierem, seguimos com a premissa indicada.

| Pergunta | Premissa adotada |
|---|---|
| O cliente pode aprovar **parcialmente** um conjunto (aprova 3 de 5)? | Sim, decisão por publicação; o conjunto fica "parcial" |
| "Ajustes solicitados" exige comentário obrigatório? | Sim, mínimo 1 caractere |
| Quantos perfis por social media no MVP? | Ilimitado, sem cobrança |
| Vídeo: só o arquivo + capa, ou também corte de duração? | Só arquivo + capa (primeiro frame ou frame escolhido) |
| Precisa de login por Google ou basta e-mail com link mágico? | Ambos; Google via Supabase Auth custa pouco |
| O link de aprovação expira? | Sim, 30 dias, renovável pelo social media |
