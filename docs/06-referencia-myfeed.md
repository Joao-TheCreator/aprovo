# 06 · Referência de uso: My Feed · Grid Preview & Planner

App iOS da Bigrowth (App Store id 1532504123). As capturas de tela do briefing (Telas 01 a 06)
são do próprio MyFeed em português de Portugal, então os padrões abaixo marcados **[briefing]**
estão confirmados pelas imagens. O que vem só de trechos de busca está marcado **[busca]**; o
que é dedução de apps do mesmo tipo está marcado **[inferido]**.

> Observação de pesquisa: a rede desta sessão bloqueia `apps.apple.com` e sites de análise de
> apps, então a ficha da loja não pôde ser lida diretamente.

## 1. Onboarding e conexão do perfil **[briefing]**

- Tela inicial mostra um perfil "vazio" simulado (`account1`, "Nome", 0 posts, 100 seguidores,
  100 seguindo, "Categoria", "Bio", botões Seguir/Mensagem, bolha "Destaque", abas grade/reels/
  marcados e uma célula "+" na grade) com um botão em gradiente do Instagram
  **"Conectar o Instagram"** no rodapé.
- Ao tocar, abre uma folha "Conectar o Instagram" com o texto **"Introduza o nome de utilizador
  do Instagram para carregar o seu feed (apenas contas públicas)"**, um campo com prefixo `@`
  e um botão "Continuar".
- Ou seja: **não há login do cliente**; o app carrega o feed público a partir do @. É exatamente
  o modelo que o briefing pede para o APROVO.
- Depois de carregar (Tela 02), o cabeçalho traz foto, nome, contadores reais, bio com links,
  handle do Threads, e a grade com os posts reais e os selos de vídeo.

## 2. Tela principal (perfil simulado) **[briefing]**

- Reprodução quase literal do perfil do Instagram: barra superior com `@ ▾` e ícones de
  compartilhar, check, histórico, "+" e menu; cabeçalho; botões Seguir/Mensagem (decorativos);
  destaques; abas; grade de 3 colunas sem espaçamento visível.
- Selos nas miniaturas: ícone de play (reels/vídeo) e de carrossel.
- Posts planejados entram **no topo da grade** (Tela 06: os três primeiros itens são os novos),
  empurrando os publicados para baixo, como o Instagram faria.

## 3. Adicionar conteúdo **[briefing]**

- O ícone "+" abre a folha inferior **"Adicionar"** com: **Post**, **Vídeo do Reels**,
  **História**, **Destaques das histórias**, **Informações de perfil**.
  O briefing do APROVO limita a **Post** e **Vídeo**.
- Ao escolher Post abre "Nova publicação" com duas abas: **"Galeria"** (fotos do celular) e
  **"Mar. de posição"** (marcador de posição = *placeholder*, um quadrado colorido para reservar
  lugar na grade antes de ter a mídia).
- O seletor "Recentes ▾" mostra a galeria do aparelho com três ícones no canto: selecionar
  (check), múltiplos (carrossel) e grade. Multi-seleção monta o carrossel.
- A nova mídia aparece **imediatamente na grade** (Tela 04: o print do mapa entra na primeira
  célula) com a folha "Recentes" ainda aberta para continuar adicionando.

## 4. Organizar a grade **[briefing]** + **[busca]**

- Reordenação por **arrastar e soltar** na grade (confirmado em descrições do app).
- Ao selecionar uma célula planejada aparece a barra de ações: **Partilhar · Detalhes · Ver ·
  Arquivar · Excluir** (Tela 04). "Arquivar" tira da grade sem apagar; "Ver" abre ampliado.
- **[inferido]** Planejados e publicados são distinguidos de forma sutil (o MyFeed não mostra
  status, porque não tem aprovação). O APROVO precisa de pílulas de status mais explícitas.

## 5. Detalhes e edição do post **[briefing]**

- Tela "Post" com a mídia grande e um botão **"Editar"** sobre ela (recorte/enquadramento).
- Campos: **"Escreva uma legenda..."**, chip **"# Hashtags"**, interruptor **"Agendar"** com
  data e hora ("nov. 4, 2026 às 23:04"), item **"Melhor altura para partilhar >"** (sugestão
  de horário) e o botão em gradiente **"Publicar no Instagram"** no rodapé.
- O APROVO troca o botão final por **"Salvar rascunho"** e **"Enviar para aprovação"**.

## 6. Múltiplas contas, compartilhamento e colaboração

- O seletor `@ ▾` no topo sugere troca entre contas **[briefing, inferido pelo ícone]**.
- Não há indício de colaboração, comentários ou aprovação por cliente **[busca]**. É o espaço
  de diferenciação do APROVO.

## 7. Monetização **[busca]**

- Gratuito com compras no app; recursos completos exigem assinatura. Uma avaliação em
  português reclama de "só consegui usar uma vez" (limite do plano gratuito sem aviso claro).

## 8. Dores conhecidas **[busca]** + **[inferido]**

- Limites do plano gratuito mal comunicados.
- Carregamento de feed depende de métodos não oficiais; sujeito a quebrar quando o Instagram
  muda (o MyFeed não pede login, então usa algum caminho de leitura pública).
- Aviso de que "nada aqui altera o Instagram real" aparece só como alerta simples.

## Padrões que vale copiar no APROVO

1. Conectar só pelo `@`, com o aviso "apenas contas públicas" e sem pedir senha.
2. Perfil simulado fiel, inclusive botões decorativos, para o cliente reconhecer na hora.
3. Novos conteúdos entram no topo da grade e reorganizam o feed imediatamente.
4. Folha "Adicionar" com poucas opções (Post, Vídeo) e seletor nativo da galeria.
5. Mídia aparece na grade antes de preencher a legenda; a edição vem depois.
6. Barra de ações da célula: Ver · Detalhes · Arquivar · Excluir (+ Compartilhar link).
7. Botão "Editar" sobre a mídia para enquadrar a miniatura.
8. Legenda, hashtags em chip e data/hora numa única tela de edição.
9. Placeholder ("marcador de posição") é útil para planejar estética; fica como etapa futura.
10. Selos de vídeo e carrossel nas miniaturas.

## O que o APROVO faz diferente

- Status visível por publicação (rascunho, aguardando, aprovada, ajustes).
- Link de aprovação para o cliente, sem conta, com registro de data, hora e link.
- Comentário de ajustes anexado à publicação.
- Vários perfis de clientes por social media, com separação por workspace.
- Fonte de dados oficial (Graph API) quando possível, com fallback explícito.

## Fontes

- Briefing do App APROVO (PDF, 12 páginas) com capturas do MyFeed.
- Resultados de busca sobre "My Feed・Grid Preview & Planner" (ficha da App Store em vários
  países, spark.mwm.ai, screensdesign.com), lidos apenas como trechos.
