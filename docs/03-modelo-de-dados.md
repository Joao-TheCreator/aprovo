# 03 · Modelo de dados

Postgres (Supabase). Todas as tabelas têm `id uuid default gen_random_uuid()`, `created_at` e
`updated_at`, exceto as tabelas de ligação (`workspace_members`, `approval_items`), que usam
chave composta. RLS filtra por `workspace_id`: direto onde a coluna existe (`profiles`,
`media_assets`) e por junção `… → profile → workspace_id` nas demais (`posts`, `imported_posts`,
`approval_*`, `activity_log`), via função `is_workspace_member(profile_id)`.

## 1. Diagrama

```
workspaces ──< workspace_members >── auth.users
    │
    └──< profiles ──< imported_posts
            │
            ├──< posts ──< post_media >── media_assets
            │     │
            │     └──< approval_items >── approval_requests ──< approval_links
            │                 │
            │                 └──< approval_decisions
            │
            ├──< profile_snapshots
            └──< activity_log
```

## 2. Tabelas

### `workspaces`
| Coluna | Tipo | Notas |
|---|---|---|
| name | text | "Agência X" ou nome do freelancer |
| owner_id | uuid → auth.users | |

### `workspace_members`
| Coluna | Tipo | Notas |
|---|---|---|
| workspace_id | uuid → workspaces | |
| user_id | uuid → auth.users | |
| role | enum `owner, editor` | `viewer` fica para depois |
| PK | (workspace_id, user_id) | |

### `profiles` (perfil do cliente no Instagram)
| Coluna | Tipo | Notas |
|---|---|---|
| workspace_id | uuid | |
| ig_username | citext | único por workspace |
| display_name | text | |
| biography | text | |
| avatar_asset_id | uuid → media_assets | cópia do avatar |
| external_url | text | |
| posts_count, followers_count, following_count | int | do último snapshot |
| account_type | enum `business, creator, personal, unknown` | define provider usado |
| import_source | enum `graph_api, fallback, manual` | |
| last_imported_at | timestamptz | cache de 24 h |
| import_status | enum `idle, importing, ok, failed` | |
| import_error | text | mensagem amigável |
| grid_ratio | enum `1:1, 3:4` | proporção das células da grade simulada (o Instagram migrou para 3:4 em 2025) |

### `profile_snapshots` (histórico de cabeçalho)
| Coluna | Tipo |
|---|---|
| profile_id | uuid |
| captured_at | timestamptz |
| data | jsonb (nome, bio, contadores) |

### `imported_posts` (o que já está publicado no Instagram)
| Coluna | Tipo | Notas |
|---|---|---|
| profile_id | uuid | |
| ig_media_id | text | único por perfil |
| media_type | enum `image, carousel, video` | |
| thumb_asset_id | uuid → media_assets | cópia local da miniatura |
| permalink | text | |
| caption | text | |
| published_at | timestamptz | ordena a grade |
| is_hidden | bool | permite "arquivar" visualmente |

### `posts` (publicações planejadas no APROVO)
| Coluna | Tipo | Notas |
|---|---|---|
| profile_id | uuid | |
| kind | enum `post, video` | post = foto ou carrossel (1..10 mídias) |
| status | enum `draft, pending_approval, approved, changes_requested` | ver máquina de estados |
| position | int | ordem na grade entre os planejados; único por perfil |
| caption | text | até 2.200 caracteres |
| hashtags | text[] | normalizadas sem `#` |
| scheduled_for | timestamptz | "data prevista" (calendário fica para depois) |
| notes | text | observações internas, não vão para o cliente |
| archived_at | timestamptz | "Arquivar": some da grade sem apagar; reversível |
| created_by | uuid → auth.users | |
| sent_for_approval_at, approved_at | timestamptz | |

### `post_media` (mídias de uma publicação, ordenadas)
| Coluna | Tipo | Notas |
|---|---|---|
| post_id | uuid | |
| asset_id | uuid → media_assets | |
| sort_order | int | 0 = capa / primeira do carrossel |
| grid_crop | jsonb `{x,y,w,h}` em frações | enquadramento da miniatura na proporção `profiles.grid_ratio` (1:1 ou 3:4) |

### `media_assets`
| Coluna | Tipo | Notas |
|---|---|---|
| workspace_id | uuid | |
| kind | enum `image, video` | |
| original_path | text | Storage, bucket `originals`, nunca alterado |
| preview_path | text | 1080 px, bucket `previews` |
| thumb_path | text | 320 px, bucket `thumbs` |
| poster_path | text | capa de vídeo |
| width, height | int | |
| duration_ms | int | vídeo |
| size_bytes | bigint | |
| mime_type | text | |
| sha256 | text | deduplicação |
| status | enum `uploading, processing, ready, failed` | |

### `approval_requests` (um envio para aprovação)
| Coluna | Tipo | Notas |
|---|---|---|
| profile_id | uuid | |
| created_by | uuid | |
| title | text | "Posts de novembro" |
| message | text | recado para o cliente |
| status | enum `open, partially_decided, decided, revoked` | derivado dos itens |

### `approval_items`
| Coluna | Tipo |
|---|---|
| request_id | uuid |
| post_id | uuid |
| PK (request_id, post_id) | |

### `approval_links`
| Coluna | Tipo | Notas |
|---|---|---|
| request_id | uuid | |
| token_hash | text | SHA-256 do token; único |
| label | text | "WhatsApp do Carlos" |
| expires_at | timestamptz | 30 dias |
| revoked_at | timestamptz | |
| opened_count | int | |
| last_opened_at | timestamptz | |

### `approval_decisions` (auditoria; nunca apagada)
| Coluna | Tipo | Notas |
|---|---|---|
| request_id, post_id | uuid | |
| link_id | uuid → approval_links | **identificação do link utilizado** |
| decision | enum `approved, changes_requested` | |
| comment | text | obrigatório em `changes_requested` |
| approver_name | text | opcional |
| decided_at | timestamptz | **data e horário** |
| ip | inet | |
| user_agent | text | |

### `activity_log` (feed de atividades por perfil)
| Coluna | Tipo |
|---|---|
| profile_id | uuid |
| actor | text (`user:<id>` ou `link:<id>`) |
| event | text (`post.created`, `post.sent`, `approval.approved`, …) |
| payload | jsonb |

## 3. Máquina de estados da publicação

```
            criar            enviar p/ aprovação
  (nenhum) ───────► draft ───────────────────────► pending_approval
                      ▲                                 │        │
                      │ editar                 aprovar  │        │ pedir ajustes
                      │                                 ▼        ▼
                      └─────────────────────── approved   changes_requested
                                                  │              │
                                   (editar reabre)│  editar      │ reenviar
                                                  ▼              ▼
                                               draft ──────► pending_approval
```

Regras:
- Editar mídia ou legenda de uma publicação `approved` volta para `draft` e registra no log
  (a aprovação anterior continua no histórico).
- `changes_requested` mantém o comentário do cliente visível na edição.
- Reenviar cria um **novo** `approval_request` (ou reaproveita o aberto, se o social media
  quiser), sempre com nova decisão.

## 4. Índices e constraints essenciais

- `profiles (workspace_id, ig_username)` único.
- `posts (profile_id, position)` único; reordenação em transação com posições temporárias.
- `imported_posts (profile_id, ig_media_id)` único.
- `approval_links (token_hash)` único.
- `approval_decisions (post_id, decided_at desc)` para pegar a última decisão.
- `media_assets (workspace_id, sha256)` para dedup.

## 5. Políticas RLS (resumo)

| Tabela | select | insert/update/delete |
|---|---|---|
| workspaces, profiles, posts, post_media, media_assets, imported_posts, activity_log, approval_requests, approval_items, approval_links | membro do workspace | membro com role `owner` ou `editor` |
| approval_decisions | membro do workspace | **nenhum** (nem membro, nem anon); só a função `decide_approval(token, …)` com `security definer`, chamada pelo Route Handler `/api/approval/[token]/decide`, insere |
| Página pública `/a/[token]` | usa `service_role` no servidor, lendo apenas o que o request contém | — |

## 6. Storage (buckets)

| Bucket | Público? | Conteúdo |
|---|---|---|
| `originals` | não | arquivos enviados, intactos |
| `previews` | não | 1080 px |
| `thumbs` | não | 320 px, já com o corte da grade |
| `ig-cache` | não | avatar e miniaturas importadas do Instagram |

Caminho: `<workspace_id>/<asset_id>/<nome>`. Acesso só por URL assinada.
