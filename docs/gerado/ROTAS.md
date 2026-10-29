# Rotas da API (catálogo gerado)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

Total: **317 rotas** em **29 grupos**. Cada linha mostra o método, o endereço completo, a proteção que aparece na própria linha da rota (`requireAuth`, etc.) e onde fica o código. A coluna "Proteção" vem do código: se estiver vazia, **olhe o arquivo** — a proteção pode estar em `router.use(...)` no topo do arquivo (ver "Proteção do grupo" abaixo de cada título).

## Como o servidor monta os grupos (`server/index.js`)

| Prefixo | Arquivo | Linha |
|---|---|---|
| `/api` | `server/routes.js` | 56 |
| `/api/xflow` | `server/xflow.js` | 57 |
| `/api/google` | `server/google.js` | 58 |
| `/api/agenda` | `server/agenda.js` | 59 |
| `/api/macro` | `server/macro.js` | 60 |
| `/api/inventory` | `server/inventory.js` | 61 |
| `/api/inventory` | `server/inventoryEdit.js` | 62 |
| `/api/gaps` | `server/gaps.js` | 63 |
| `/api/task-links` | `server/taskLinks.js` | 64 |
| `/api/task-links` | `server/taskLinkBackfill.js` | 65 |
| `/api/standard-plan` | `server/standardPlanApi.js` | 66 |
| `/api/meeting-inbox` | `server/meetingInbox.js` | 67 |
| `/api/assistant` | `server/assistant.js` | 68 |
| `/api/knowledge` | `server/knowledge.js` | 69 |
| `/api/pareceres` | `server/pareceres.js` | 70 |
| `/api/knowledge-library` | `server/knowledgeLibraryRoutes.js` | 71 |
| `/api/crm` | `server/crm/routes.js` | 72 |
| `/api/renata` | `server/renata/routes.js` | 73 |
| `/api/widget` | `server/widget.js` | 74 |
| `/api/daily` | `server/daily.js` | 75 |
| `/api/templates` | `server/documentTemplates.js` | 76 |
| `/api/connect` | `server/connect.js` | 77 |
| `/api/company-share` | `server/companyShare.js` | 78 |
| `/api/company-calendar` | `server/companyCalendar.js` | 79 |
| `/api/public-company` | `server/companyShare.js` | 80 |
| `/d` | `server/companyShare.js` | 81 |
| `/api/push` | `server/push.js` | 82 |
| `/api/ops-intel` | `server/opsIntel.js` | 83 |
| `/api/experience` | `server/experience.js` | 84 |
| `/api/project-history` | `server/projectVersions.js` | 85 |
| `/api` | `server/errorHandler.js` | 93 |

Montagens extras (fora do `index.js`): `/api/connect/crm` = o roteador do CRM (`server/crm/routes.js`) reaproveitado por `server/connect.js` para a chave `crm_operate`/`write_all`/`read_all`; `/api/templates` tem limite de corpo próprio (45 MB) definido no `index.js`.

## `/api` — 50 rotas

Arquivos: `server/routes.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| POST | `/api/auth/login` |  |  | `server/routes.js:126` |
| POST | `/api/auth/change-password-login` |  | primeiro e depois abrir "Meu perfil". Mesma checagem de bloqueio/ expiração do login normal antes de aceitar a troca. | `server/routes.js:167` |
| POST | `/api/auth/logout` |  |  | `server/routes.js:208` |
| GET | `/api/auth/me` | `requireAuth` |  | `server/routes.js:213` |
| POST | `/api/activity/ping` | `requireAuth` |  | `server/routes.js:218` |
| POST | `/api/activity/usage` | `requireAuth` | Rastreador de uso (Central de Inteligência Operacional): fatias de tempo e ações pontuais, só da equipe. Nunca guarda conteúdo. | `server/routes.js:224` |
| GET | `/api/activity/policy` | `requireAuth` | Transparência: toda a equipe pode ler como o uso é medido. | `server/routes.js:232` |
| PATCH | `/api/auth/me` | `requireAuth` |  | `server/routes.js:234` |
| POST | `/api/auth/change-password` | `requireAuth` |  | `server/routes.js:248` |
| GET | `/api/mentions/users` | `requireAuth` | Pessoas que podem ser @mencionadas em comentários (Onda 3): só a equipe PRICETAX da org da pessoa; cliente não enxerga a equipe. | `server/routes.js:265` |
| GET | `/api/users` | `requireAuth` `requireMaster` |  | `server/routes.js:277` |
| GET | `/api/users/:id/access` | `requireAuth` `requireMaster` |  | `server/routes.js:289` |
| POST | `/api/users` | `requireAuth` `requireMaster` |  | `server/routes.js:297` |
| PATCH | `/api/users/:id` | `requireAuth` `requireMaster` |  | `server/routes.js:318` |
| POST | `/api/users/:id/block` | `requireAuth` `requireMaster` |  | `server/routes.js:356` |
| POST | `/api/users/:id/renew` | `requireAuth` `requireMaster` |  | `server/routes.js:374` |
| POST | `/api/users/:id/reset-password` | `requireAuth` `requireMaster` |  | `server/routes.js:392` |
| DELETE | `/api/users/:id` | `requireAuth` `requireMaster` |  | `server/routes.js:411` |
| GET | `/api/projects` | `requireAuth` |  | `server/routes.js:431` |
| GET | `/api/projects/versions` | `requireAuth` | segundos) sem servidor de WebSocket, sem pub/sub, sem dependência nova. | `server/routes.js:454` |
| GET | `/api/projects/lite` | `requireAuth` | inteiro de cada projeto, que já é pesado (é por isso que Pareceres guarda o PDF numa tabela própria em vez de embutir em `projects.data`, ver PROJECT_CONTEXT.md §48). | `server/routes.js:470` |
| POST | `/api/projects` | `requireAuth` `requireMasterOrPricetax` |  | `server/routes.js:483` |
| POST | `/api/cnpj/lookup` | `requireAuth` `requireMasterOrPricetax` |  | `server/routes.js:529` |
| DELETE | `/api/projects/:id` | `requireAuth` `requireMasterOrPricetax` |  | `server/routes.js:537` |
| GET | `/api/projects/:id/team-candidates` | `requireAuth` |  | `server/routes.js:550` |
| PATCH | `/api/projects/:id` | `requireAuth` |  | `server/routes.js:568` |
| POST | `/api/projects/:id/meetings` | `requireAuth` `requireMasterOrPricetax` | Reuniões à mão, mas numa transação travada (não pisa em quem está editando) e sem limite de tamanho prático no texto. Só equipe PRICETAX. Idempotente: mesma data + mesmo… | `server/routes.js:598` |
| POST | `/api/projects/:id/plan` | `requireAuth` `requireMaster` | Ajustar o cronograma de uma empresa por operações (mesmo motor do /api/connect/companies/:id/plan, mas pela sessão — 2026-10-26): activity.set/add, sub.set/add/move/dele… | `server/routes.js:650` |
| POST | `/api/_internal/memory-search` | `requireAuth` | recuperada corretamente, com o mesmo isolamento de acesso de qualquer outra rota de projeto. | `server/routes.js:682` |
| GET | `/api/personal-board` | `requireAuth` |  | `server/routes.js:700` |
| GET | `/api/personal-board/version` | `requireAuth` | Versão barata do quadro (só o carimbo): o cliente consulta de tempos em tempos para saber se OUTRA origem (a API de conectividade, §80, ou o quadro público) alterou o qu… | `server/routes.js:712` |
| PATCH | `/api/personal-board` | `requireAuth` |  | `server/routes.js:749` |
| GET | `/api/personal-board/stats` | `requireAuth` |  | `server/routes.js:788` |
| GET | `/api/personal-board/stats/day` | `requireAuth` |  | `server/routes.js:801` |
| GET | `/api/notifications` | `requireAuth` |  | `server/routes.js:819` |
| GET | `/api/notifications/preferences` | `requireAuth` | Quais categorias o usuário quer ver — por usuário, fica salvo até ele mudar (users.preferences.notifications). | `server/routes.js:831` |
| PUT | `/api/notifications/preferences` | `requireAuth` |  | `server/routes.js:839` |
| GET | `/api/personal-extras` | `requireAuth` | Anotações rápidas e atalhos da pessoa (users.preferences.personalExtras) — fora do quadro porque o quadro pode ter link público. | `server/routes.js:866` |
| PUT | `/api/personal-extras` | `requireAuth` |  | `server/routes.js:873` |
| POST | `/api/client-error` | `requireAuth` | Erro de tela capturado por um limite de erro do navegador → uma linha no log do servidor. Só com login, com limite por pessoa. | `server/routes.js:887` |
| PATCH | `/api/notifications/:id` | `requireAuth` |  | `server/routes.js:896` |
| POST | `/api/notifications/read-all` | `requireAuth` |  | `server/routes.js:909` |
| POST | `/api/notifications/mark-read-for-target` | `requireAuth` | atividade) — regra do Rafael: só sai do contador quando lida OU quando acessada, nunca só por abrir o painel do sino. | `server/routes.js:920` |
| GET | `/api/public-board/:token` | `optionalAuth` |  | `server/routes.js:986` |
| POST | `/api/personal-board/linked` | `requireAuth` |  | `server/routes.js:1035` |
| PATCH | `/api/public-board/:token` | `requireAuth` |  | `server/routes.js:1078` |
| GET | `/api/public-meeting/:token` | `optionalAuth` |  | `server/routes.js:1166` |
| GET | `/api/organizations` | `requireAuth` `requireSuperAdmin` |  | `server/routes.js:1208` |
| POST | `/api/organizations` | `requireAuth` `requireSuperAdmin` |  | `server/routes.js:1220` |
| PATCH | `/api/organizations/:id` | `requireAuth` `requireSuperAdmin` |  | `server/routes.js:1236` |

## `(sem prefixo conhecido)` — 2 rotas

Arquivos: `server/index.js`, `server/xflowTransitions.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `(sem prefixo conhecido)/{*splat}` |  |  | `server/index.js:110` |
| DELETE | `(sem prefixo conhecido)/tickets/:id` |  | arquivar) — um ticket aberto por engano também precisa poder ir pra Lixeira. purgar (apagar de vez) não passa por aqui — é DELETE direto, | `server/xflowTransitions.js:54` |

## `/api/agenda` — 3 rotas

Arquivos: `server/agenda.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/agenda` | `requireAuth` |  | `server/agenda.js:17` |
| POST | `/api/agenda/events` | `requireAuth` |  | `server/agenda.js:99` |
| POST | `/api/agenda/events/:id/respond` | `requireAuth` |  | `server/agenda.js:123` |

## `/api/assistant` — 10 rotas

Arquivos: `server/assistant.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/assistant/conversation` | `requireAuth` |  | `server/assistant.js:45` |
| POST | `/api/assistant/ask` | `requireAuth` |  | `server/assistant.js:55` |
| POST | `/api/assistant/conversation/clear` | `requireAuth` |  | `server/assistant.js:68` |
| POST | `/api/assistant/messages/:id/feedback` | `requireAuth` |  | `server/assistant.js:78` |
| POST | `/api/assistant/reindex` | `requireAuth` | acesso ao Railway. Idempotente (reindexMeetingMemory sempre apaga e recria), então clicar de novo nunca duplica nem piora nada. | `server/assistant.js:97` |
| GET | `/api/assistant/reindex-needed` | `requireAuth` | NENHUM chunk (nunca foi indexada de verdade). Fora isso, reindexar de novo só reprocessaria embedding à toa em dados que já estão corretos. | `server/assistant.js:118` |
| GET | `/api/assistant/dossier` | `requireAuth` |  | `server/assistant.js:142` |
| POST | `/api/assistant/dossier` | `requireAuth` |  | `server/assistant.js:152` |
| POST | `/api/assistant/messages/:id/action` | `requireAuth` | confirma ou rejeita, sempre a partir de um clique explícito do usuário no painel (nunca automático). | `server/assistant.js:173` |
| POST | `/api/assistant/general/ask` | `requireAuth` | RENATA geral (disponível de qualquer tela, sem projeto): responde com o que a pessoa já vê + conhecimento da organização. A conversa fica no navegador; o servidor só rec… | `server/assistant.js:195` |

## `/api/company-calendar` — 2 rotas

Arquivos: `server/companyCalendar.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/company-calendar/:projectId` |  |  | `server/companyCalendar.js:40` |
| POST | `/api/company-calendar/:projectId/apply` |  | Cria ou atualiza os blocos escolhidos e cancela os marcados. Convites e cancelamentos saem por e-mail do Google: só roda com `confirm: true`. | `server/companyCalendar.js:80` |

## `/api/company-share` — 3 rotas

Arquivos: `server/companyShare.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/company-share/:projectId` | `requireAuth` `requireMasterOrPricetax` |  | `server/companyShare.js:53` |
| POST | `/api/company-share/:projectId` | `requireAuth` `requireMasterOrPricetax` | Gera um link novo; o anterior (se houver) para de funcionar. | `server/companyShare.js:62` |
| DELETE | `/api/company-share/:projectId` | `requireAuth` `requireMasterOrPricetax` |  | `server/companyShare.js:82` |

## `/api/connect` — 20 rotas

Arquivos: `server/connect.js`. Proteção do grupo (`router.use` global): `server/connect.js`: `bearer`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/connect/tokens` | `requireAuth` |  | `server/connect.js:43` |
| POST | `/api/connect/tokens` | `requireAuth` |  | `server/connect.js:51` |
| GET | `/api/connect/actions` | `requireAuth` | O que o Claude Code alterou no CRM pelas chaves do próprio administrador (últimas 100 gravações). | `server/connect.js:77` |
| DELETE | `/api/connect/tokens/:id` | `requireAuth` |  | `server/connect.js:88` |
| GET | `/api/connect` |  |  | `server/connect.js:116` |
| USE | `/api/connect/crm` |  | monta: crmViaToken, createCrmRouter({ auth: [(req, res, next) => next()] })); | `server/connect.js:213` |
| GET | `/api/connect/me` |  |  | `server/connect.js:215` |
| GET | `/api/connect/activities` |  |  | `server/connect.js:259` |
| POST | `/api/connect/activities` | `needScope('read_create')` |  | `server/connect.js:274` |
| GET | `/api/connect/companies` |  |  | `server/connect.js:345` |
| GET | `/api/connect/companies/:id` |  |  | `server/connect.js:368` |
| GET | `/api/connect/companies/:id/meetings/:meetingId` |  |  | `server/connect.js:397` |
| POST | `/api/connect/companies/:id/transcripts` | `needTranscripts` |  | `server/connect.js:440` |
| GET | `/api/connect/companies/:id/transcripts` | `needTranscripts` |  | `server/connect.js:464` |
| GET | `/api/connect/companies/:id/transcripts/:submissionId` | `needTranscripts` |  | `server/connect.js:472` |
| POST | `/api/connect/companies/:id/transcripts/:submissionId/retry` | `needTranscripts` |  | `server/connect.js:488` |
| PATCH | `/api/connect/companies/:id/meetings/:meetingId` | `needMeetingsEdit` |  | `server/connect.js:565` |
| GET | `/api/connect/companies/:id/meetings/:meetingId/edits` | `needMeetingsEdit` |  | `server/connect.js:572` |
| POST | `/api/connect/companies/:id/meetings/:meetingId/edits/:editId/undo` | `needMeetingsEdit` |  | `server/connect.js:581` |
| GET | `/api/connect/agenda` |  |  | `server/connect.js:589` |
| POST | `/api/connect/companies/:id/plan` | `needScope('read_write')` |  | `server/connect.js:788` |

## `/api/crm` — 87 rotas

Arquivos: `server/crm/piperun/routes.js`, `server/crm/routes.js`. Proteção do grupo (`router.use` global): `server/crm/routes.js`: `need('read')`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/crm/migration/piperun` | `need('admin')` |  | `server/crm/piperun/routes.js:12` |
| GET | `/api/crm/migration/piperun/runs/:id` | `need('admin')` |  | `server/crm/piperun/routes.js:16` |
| POST | `/api/crm/migration/piperun/extract` | `need('admin')` |  | `server/crm/piperun/routes.js:22` |
| POST | `/api/crm/migration/piperun/raw/histories` | `need('admin')` | Carrega na cópia bruta só o histórico (`histories`) vindo do backup em arquivo — evita refazer a extração (e digitar o token) para aplicar o percurso real. | `server/crm/piperun/routes.js:36` |
| POST | `/api/crm/migration/piperun/raw/deal-tags` | `need('admin')` |  | `server/crm/piperun/routes.js:45` |
| GET | `/api/crm/migration/piperun/preview` | `need('admin')` |  | `server/crm/piperun/routes.js:51` |
| POST | `/api/crm/migration/piperun/import` | `need('admin')` |  | `server/crm/piperun/routes.js:57` |
| GET | `/api/crm/migration/piperun/report` | `need('admin')` |  | `server/crm/piperun/routes.js:69` |
| POST | `/api/crm/migration/piperun/purge` | `need('admin')` |  | `server/crm/piperun/routes.js:71` |
| GET | `/api/crm/deals/:id/files` | `need('read')` | Arquivos do negócio (documentos importados do PipeRun) | `server/crm/piperun/routes.js:77` |
| GET | `/api/crm/deal-files/:fileId/download` | `need('read')` |  | `server/crm/piperun/routes.js:82` |
| GET | `/api/crm/me` |  |  | `server/crm/routes.js:58` |
| GET | `/api/crm/options` |  |  | `server/crm/routes.js:59` |
| GET | `/api/crm/overview` |  |  | `server/crm/routes.js:60` |
| GET | `/api/crm/views` |  | Visões salvas (filtros de Negócios) e página inicial por pessoa (§98). Pessoal: qualquer um que lê; compartilhada: quem tem 'funnel'. | `server/crm/routes.js:69` |
| POST | `/api/crm/views` |  |  | `server/crm/routes.js:70` |
| PUT | `/api/crm/views-default` |  |  | `server/crm/routes.js:71` |
| PATCH | `/api/crm/views/:id` |  |  | `server/crm/routes.js:72` |
| DELETE | `/api/crm/views/:id` |  |  | `server/crm/routes.js:73` |
| GET | `/api/crm/search` |  |  | `server/crm/routes.js:74` |
| GET | `/api/crm/cnpj/:cnpj` | `need('write')` | Cadastro rápido: digita o CNPJ, o resto vem da Receita (com cache) — e já diz se é duplicado. | `server/crm/routes.js:77` |
| GET | `/api/crm/companies` |  | ---- empresas | `server/crm/routes.js:87` |
| POST | `/api/crm/companies/check-duplicates` | `need('write')` |  | `server/crm/routes.js:91` |
| POST | `/api/crm/companies` | `need('write')` |  | `server/crm/routes.js:95` |
| GET | `/api/crm/companies/:id` |  |  | `server/crm/routes.js:99` |
| PATCH | `/api/crm/companies/:id` | `need('write')` |  | `server/crm/routes.js:100` |
| DELETE | `/api/crm/companies/:id` | `need('remove')` |  | `server/crm/routes.js:104` |
| POST | `/api/crm/companies/:id/restore` | `need('admin')` |  | `server/crm/routes.js:105` |
| POST | `/api/crm/companies/:id/merge` | `need('remove')` |  | `server/crm/routes.js:106` |
| GET | `/api/crm/companies/:id/timeline` |  |  | `server/crm/routes.js:107` |
| GET | `/api/crm/companies/:id/audit` | `need('remove')` |  | `server/crm/routes.js:108` |
| POST | `/api/crm/companies/:id/projects` | `need('write')` |  | `server/crm/routes.js:109` |
| DELETE | `/api/crm/companies/:id/projects/:projectId` | `need('write')` |  | `server/crm/routes.js:110` |
| GET | `/api/crm/companies/by-project/:projectId` |  | Projetos do cronograma que ainda não estão ligados a nenhuma empresa do CRM (pra ligar na mão). Empresa do CRM a partir do projeto do cronograma (Onda 5): alimenta "Abri… | `server/crm/routes.js:114` |
| GET | `/api/crm/projects-available` | `need('write')` |  | `server/crm/routes.js:121` |
| GET | `/api/crm/contacts` |  | ---- contatos | `server/crm/routes.js:129` |
| GET | `/api/crm/contacts/:id` |  |  | `server/crm/routes.js:130` |
| POST | `/api/crm/contacts/check-duplicates` | `need('write')` |  | `server/crm/routes.js:131` |
| POST | `/api/crm/contacts` | `need('write')` |  | `server/crm/routes.js:135` |
| PATCH | `/api/crm/contacts/:id` | `need('write')` |  | `server/crm/routes.js:139` |
| DELETE | `/api/crm/contacts/:id` | `need('write')` |  | `server/crm/routes.js:143` |
| GET | `/api/crm/pipeline` |  | ---- negócios / pipeline (Fase 2) | `server/crm/routes.js:146` |
| GET | `/api/crm/pipelines` |  | ---- funis e etapas (Fase 2b): todos leem; gestor+ configura | `server/crm/routes.js:149` |
| POST | `/api/crm/pipelines` | `need('funnel')` |  | `server/crm/routes.js:150` |
| PATCH | `/api/crm/pipelines/:id` | `need('funnel')` |  | `server/crm/routes.js:151` |
| DELETE | `/api/crm/pipelines/:id` | `need('funnel')` |  | `server/crm/routes.js:152` |
| POST | `/api/crm/pipelines/:id/stages` | `need('funnel')` |  | `server/crm/routes.js:153` |
| GET | `/api/crm/board` |  |  | `server/crm/routes.js:154` |
| GET | `/api/crm/deals` |  |  | `server/crm/routes.js:155` |
| POST | `/api/crm/deals` | `need('write')` |  | `server/crm/routes.js:156` |
| GET | `/api/crm/deals/export.xlsx` |  | Excel dos negócios com os mesmos filtros da tela (§116c). Vem antes de /deals/:id para "export.xlsx" não virar um id. | `server/crm/routes.js:161` |
| GET | `/api/crm/deals/:id` |  |  | `server/crm/routes.js:170` |
| PATCH | `/api/crm/deals/:id` | `need('write')` |  | `server/crm/routes.js:171` |
| POST | `/api/crm/leads` | `need('write')` |  | `server/crm/routes.js:172` |
| GET | `/api/crm/notes/:noteId/attachments/:attId` | `need('read')` | Conteúdo de um anexo de nota (imagem/PDF), sob demanda: a lista de notas vem só com nome/tipo/tamanho e esta `url`. | `server/crm/routes.js:174` |
| GET | `/api/crm/cadences` |  |  | `server/crm/routes.js:185` |
| POST | `/api/crm/cadences` | `need('funnel')` |  | `server/crm/routes.js:186` |
| PATCH | `/api/crm/cadences/:id` | `need('funnel')` |  | `server/crm/routes.js:187` |
| DELETE | `/api/crm/cadences/:id` | `need('funnel')` |  | `server/crm/routes.js:188` |
| GET | `/api/crm/tags` |  |  | `server/crm/routes.js:189` |
| PUT | `/api/crm/deals/:id/tags` | `need('write')` |  | `server/crm/routes.js:190` |
| POST | `/api/crm/deals/:id/move` | `need('write')` |  | `server/crm/routes.js:191` |
| DELETE | `/api/crm/deals/:id` | `need('remove')` |  | `server/crm/routes.js:195` |
| GET | `/api/crm/deals/:id/audit` | `need('remove')` |  | `server/crm/routes.js:196` |
| GET | `/api/crm/activities` |  | ---- atividades / follow-ups (Fase 3). ownerId=me vira o usuário logado. | `server/crm/routes.js:199` |
| GET | `/api/crm/activities/:id` |  |  | `server/crm/routes.js:200` |
| POST | `/api/crm/activities` | `need('write')` |  | `server/crm/routes.js:206` |
| PATCH | `/api/crm/activities/:id` | `need('write')` |  | `server/crm/routes.js:210` |
| POST | `/api/crm/activities/:id/complete` | `need('write')` |  | `server/crm/routes.js:215` |
| POST | `/api/crm/activities/:id/cancel` | `need('write')` |  | `server/crm/routes.js:219` |
| POST | `/api/crm/activities/:id/reopen` | `need('write')` |  | `server/crm/routes.js:220` |
| DELETE | `/api/crm/activities/:id` | `need('remove')` |  | `server/crm/routes.js:221` |
| GET | `/api/crm/products` |  | ---- produtos (catálogo): todos leem; quem define o que se vende é gestor+ | `server/crm/routes.js:224` |
| POST | `/api/crm/products` | `need('catalog')` |  | `server/crm/routes.js:225` |
| PATCH | `/api/crm/products/:id` | `need('catalog')` |  | `server/crm/routes.js:226` |
| DELETE | `/api/crm/products/:id` | `need('catalog')` |  | `server/crm/routes.js:227` |
| POST | `/api/crm/notes` | `need('write')` | ---- notas | `server/crm/routes.js:230` |
| PATCH | `/api/crm/notes/:id` | `need('write')` |  | `server/crm/routes.js:231` |
| DELETE | `/api/crm/notes/:id` | `need('write')` |  | `server/crm/routes.js:232` |
| GET | `/api/crm/import/fields` | `need('import')` | ---- importação (planilha) e clientes atuais do painel | `server/crm/routes.js:235` |
| POST | `/api/crm/import/preview` | `need('import')` |  | `server/crm/routes.js:236` |
| POST | `/api/crm/import/commit` | `need('import')` |  | `server/crm/routes.js:240` |
| GET | `/api/crm/import/deals/fields` | `need('import')` |  | `server/crm/routes.js:244` |
| POST | `/api/crm/import/deals/preview` | `need('import')` |  | `server/crm/routes.js:245` |
| POST | `/api/crm/import/deals/commit` | `need('import')` |  | `server/crm/routes.js:246` |
| GET | `/api/crm/bootstrap/preview` | `need('import')` |  | `server/crm/routes.js:250` |
| POST | `/api/crm/bootstrap/commit` | `need('import')` |  | `server/crm/routes.js:251` |

## `/api/daily` — 5 rotas

Arquivos: `server/daily.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/daily/options` | `requireAuth` |  | `server/daily.js:33` |
| GET | `/api/daily/preferences` | `requireAuth` |  | `server/daily.js:37` |
| PUT | `/api/daily/preferences` | `requireAuth` |  | `server/daily.js:44` |
| POST | `/api/daily/onboarding-complete` | `requireAuth` |  | `server/daily.js:57` |
| GET | `/api/daily` | `requireAuth` |  | `server/daily.js:64` |

## `/api/experience` — 3 rotas

Arquivos: `server/experience.js`. Proteção do grupo (`router.use` global): `server/experience.js`: `requireAuth`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| POST | `/api/experience/events` |  |  | `server/experience.js:134` |
| GET | `/api/experience/csat/eligible` |  |  | `server/experience.js:135` |
| POST | `/api/experience/csat` |  |  | `server/experience.js:136` |

## `/api/gaps` — 3 rotas

Arquivos: `server/gaps.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/gaps/overview` |  |  | `server/gaps.js:172` |
| GET | `/api/gaps/company/:id` |  |  | `server/gaps.js:180` |
| POST | `/api/gaps/create` |  | Cria as atividades escolhidas no cronograma da empresa. O servidor RECALCULA as lacunas e só cria o que ainda é lacuna (o título vem do cálculo, não do navegador); trans… | `server/gaps.js:192` |

## `/api/google` — 4 rotas

Arquivos: `server/google.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/google/status` | `requireAuth` |  | `server/google.js:11` |
| GET | `/api/google/oauth/start` | `requireAuth` | GET (não POST) de propósito — é pra ser um redirect direto de window.location.href, não uma chamada fetch(). | `server/google.js:21` |
| GET | `/api/google/oauth/callback` | `requireAuth` | aqui igual em qualquer outra rota autenticada — não precisa de `state` carregando o id do usuário. | `server/google.js:30` |
| POST | `/api/google/disconnect` | `requireAuth` |  | `server/google.js:44` |

## `/api/inventory` — 7 rotas

Arquivos: `server/inventory.js`, `server/inventoryEdit.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/inventory` |  |  | `server/inventory.js:324` |
| GET | `/api/inventory/quality` |  |  | `server/inventory.js:331` |
| GET | `/api/inventory/export.xlsx` |  |  | `server/inventory.js:339` |
| GET | `/api/inventory/areas` |  |  | `server/inventoryEdit.js:136` |
| POST | `/api/inventory/responsible` |  |  | `server/inventoryEdit.js:138` |
| POST | `/api/inventory/area` |  |  | `server/inventoryEdit.js:165` |
| POST | `/api/inventory/suggest-areas` |  |  | `server/inventoryEdit.js:182` |

## `/api/knowledge` — 11 rotas

Arquivos: `server/knowledge.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/knowledge/overview` |  |  | `server/knowledge.js:29` |
| GET | `/api/knowledge/facts` |  |  | `server/knowledge.js:36` |
| GET | `/api/knowledge/facts/:id` |  |  | `server/knowledge.js:49` |
| POST | `/api/knowledge/facts/:id/edit` |  |  | `server/knowledge.js:58` |
| POST | `/api/knowledge/facts/:id/entities` |  |  | `server/knowledge.js:79` |
| DELETE | `/api/knowledge/facts/:id/entities/:entityId` |  |  | `server/knowledge.js:101` |
| GET | `/api/knowledge/conflicts` |  |  | `server/knowledge.js:114` |
| POST | `/api/knowledge/conflicts/resolve` |  |  | `server/knowledge.js:122` |
| GET | `/api/knowledge/entities` |  |  | `server/knowledge.js:143` |
| GET | `/api/knowledge/entities/:id` |  |  | `server/knowledge.js:151` |
| GET | `/api/knowledge/metrics` |  |  | `server/knowledge.js:160` |

## `/api/knowledge-library` — 10 rotas

Arquivos: `server/knowledgeLibraryRoutes.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/knowledge-library` |  |  | `server/knowledgeLibraryRoutes.js:28` |
| GET | `/api/knowledge-library/:id` |  |  | `server/knowledgeLibraryRoutes.js:36` |
| POST | `/api/knowledge-library` |  |  | `server/knowledgeLibraryRoutes.js:64` |
| POST | `/api/knowledge-library/suggest` |  | A RENATA lê o material ao ser escolhido e sugere título, tema e etiquetas (a tela preenche os campos que a pessoa ainda não escreveu). Não grava nada. Só a sugestão falh… | `server/knowledgeLibraryRoutes.js:88` |
| POST | `/api/knowledge-library/search` |  |  | `server/knowledgeLibraryRoutes.js:108` |
| PATCH | `/api/knowledge-library/:id` |  |  | `server/knowledgeLibraryRoutes.js:115` |
| POST | `/api/knowledge-library/:id/reprocess` |  | Ler de novo (refaz trechos e estudo) ou só estudar de novo (`?only=study`, mantém os trechos). | `server/knowledgeLibraryRoutes.js:131` |
| DELETE | `/api/knowledge-library/:id` |  |  | `server/knowledgeLibraryRoutes.js:141` |
| POST | `/api/knowledge-library/:id/restore` |  |  | `server/knowledgeLibraryRoutes.js:151` |
| GET | `/api/knowledge-library/:id/file` |  |  | `server/knowledgeLibraryRoutes.js:161` |

## `/api/macro` — 1 rotas

Arquivos: `server/macro.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/macro` | `requireAuth` |  | `server/macro.js:31` |

## `/api/meeting-inbox` — 4 rotas

Arquivos: `server/meetingInbox.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| POST | `/api/meeting-inbox` | `requireAuth` `requireMasterOrPricetax` |  | `server/meetingInbox.js:395` |
| GET | `/api/meeting-inbox` | `requireAuth` |  | `server/meetingInbox.js:403` |
| POST | `/api/meeting-inbox/retry-failed` | `requireAuth` `requireMasterOrPricetax` | já mostra "Na fila") e processa UMA POR VEZ, em sequência — em paralelo estouraria o rate limit da API justamente num lote grande. | `server/meetingInbox.js:416` |
| POST | `/api/meeting-inbox/:id/retry` | `requireAuth` `requireMasterOrPricetax` |  | `server/meetingInbox.js:446` |

## `/api/ops-intel` — 6 rotas

Arquivos: `server/opsIntel.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/ops-intel/experience` |  |  | `server/opsIntel.js:130` |
| GET | `/api/ops-intel/policy` |  |  | `server/opsIntel.js:137` |
| GET | `/api/ops-intel/overview` |  |  | `server/opsIntel.js:139` |
| GET | `/api/ops-intel/users/:id` |  |  | `server/opsIntel.js:199` |
| GET | `/api/ops-intel/map` |  |  | `server/opsIntel.js:234` |
| GET | `/api/ops-intel/alerts` |  |  | `server/opsIntel.js:259` |

## `/api/pareceres` — 12 rotas

Arquivos: `server/pareceres.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/pareceres/study` |  | RENATA estuda os pareceres (§70). `GET /study` e o "nada novo" de `POST /study` são só SQL — zero chamada à IA. | `server/pareceres.js:32` |
| POST | `/api/pareceres/study` |  |  | `server/pareceres.js:43` |
| GET | `/api/pareceres/advice` |  |  | `server/pareceres.js:63` |
| POST | `/api/pareceres/advice` |  |  | `server/pareceres.js:71` |
| GET | `/api/pareceres` |  |  | `server/pareceres.js:89` |
| POST | `/api/pareceres` |  |  | `server/pareceres.js:100` |
| PATCH | `/api/pareceres/:id` |  |  | `server/pareceres.js:132` |
| DELETE | `/api/pareceres/:id` |  |  | `server/pareceres.js:173` |
| GET | `/api/pareceres/:id/file` |  |  | `server/pareceres.js:184` |
| POST | `/api/pareceres/:id/comments` |  |  | `server/pareceres.js:196` |
| PATCH | `/api/pareceres/:id/comments/:commentId` |  |  | `server/pareceres.js:215` |
| DELETE | `/api/pareceres/:id/comments/:commentId` |  |  | `server/pareceres.js:232` |

## `/api/project-history` — 6 rotas

Arquivos: `server/projectVersions.js`. Proteção do grupo (`router.use` global): `server/projectVersions.js`: `requireAuth`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/project-history/:id/versions` |  |  | `server/projectVersions.js:43` |
| GET | `/api/project-history/:id/diff` |  | Comparar duas versões (ou uma versão com o estado atual): ?from=<id\|current>&to=<id\|current>. "from" é o antes, "to" é o depois. | `server/projectVersions.js:69` |
| POST | `/api/project-history/:id/versions` |  |  | `server/projectVersions.js:80` |
| POST | `/api/project-history/:id/versions/:vid/restore` |  | { confirm: true } -> grava. Sem a confirmação explícita nada é gravado. { activityIds: [...] } -> restauração parcial: só essas atividades voltam à versão. | `server/projectVersions.js:99` |
| GET | `/api/project-history/deleted/list` |  | ---- Empresas excluídas (só Master): a última versão `pre_delete` de cada empresa que não existe mais. | `server/projectVersions.js:141` |
| POST | `/api/project-history/deleted/:vid/restore` |  |  | `server/projectVersions.js:153` |

## `/api/public-company` — 1 rotas

Arquivos: `server/companyShare.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/public-company/:token` |  |  | `server/companyShare.js:123` |

## `/api/push` — 5 rotas

Arquivos: `server/push.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/push/config` | `requireAuth` |  | `server/push.js:119` |
| GET | `/api/push/status` | `requireAuth` |  | `server/push.js:123` |
| POST | `/api/push/subscribe` | `requireAuth` |  | `server/push.js:130` |
| POST | `/api/push/unsubscribe` | `requireAuth` |  | `server/push.js:153` |
| POST | `/api/push/test` | `requireAuth` |  | `server/push.js:162` |

## `/api/renata` — 8 rotas

Arquivos: `server/renata/routes.js`. Proteção do grupo (`router.use` global): `server/renata/routes.js`: `requireAuth`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/renata/status` |  |  | `server/renata/routes.js:34` |
| POST | `/api/renata/chat` |  |  | `server/renata/routes.js:38` |
| POST | `/api/renata/conversations/:id/decide` |  | Confirma ou cancela ações pendentes: [{actionId, decision: 'confirm'\|'cancel'}] | `server/renata/routes.js:50` |
| GET | `/api/renata/conversations/:id` |  | Conversa em formato de tela: mensagens (texto), passos executados com status, e cartões pendentes. | `server/renata/routes.js:58` |
| GET | `/api/renata/conversations` |  |  | `server/renata/routes.js:79` |
| GET | `/api/renata/actions` |  | Registro de auditoria: o seu; o administrador vê o da organização inteira (?scope=org). | `server/renata/routes.js:85` |
| POST | `/api/renata/actions/:id/undo` |  |  | `server/renata/routes.js:96` |
| GET | `/api/renata/catalog` |  | Transparência: o que a RENATA consegue fazer por este usuário e como cada rota da plataforma é coberta. | `server/renata/routes.js:102` |

## `/api/standard-plan` — 14 rotas

Arquivos: `server/standardPlanApi.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/standard-plan/preview` |  |  | `server/standardPlanApi.js:31` |
| GET | `/api/standard-plan/audit/:id` |  | Auditoria de UMA empresa contra o padrão (2026-10-19): somente leitura, equipe PRICETAX/master. Ver server/standardAudit.js. | `server/standardPlanApi.js:44` |
| POST | `/api/standard-plan/apply` |  |  | `server/standardPlanApi.js:60` |
| GET | `/api/standard-plan/template/draft` |  |  | `server/standardPlanApi.js:110` |
| GET | `/api/standard-plan/template/draft/diff` |  |  | `server/standardPlanApi.js:118` |
| PATCH | `/api/standard-plan/template/draft` |  |  | `server/standardPlanApi.js:125` |
| POST | `/api/standard-plan/template/draft/discard` |  |  | `server/standardPlanApi.js:133` |
| GET | `/api/standard-plan/template/versions` |  |  | `server/standardPlanApi.js:141` |
| POST | `/api/standard-plan/template/versions` |  |  | `server/standardPlanApi.js:148` |
| POST | `/api/standard-plan/template/versions/archive` |  | Arquivar/desarquivar versões do histórico (não apaga). `versions` = lista de números ou "old" (todas menos a 1.0 e a atual). | `server/standardPlanApi.js:157` |
| POST | `/api/standard-plan/template/restore/:version` |  |  | `server/standardPlanApi.js:169` |
| GET | `/api/standard-plan/template/proposals` |  |  | `server/standardPlanApi.js:179` |
| POST | `/api/standard-plan/template/proposals/:key/load` |  |  | `server/standardPlanApi.js:187` |
| GET | `/api/standard-plan/template/instantiate-preview` |  | Prévia do cadastro de empresa: com este kickoff, quantas atividades terão prazo comprimido, já nascem vencidas ou têm predecessora que vence depois. | `server/standardPlanApi.js:197` |

## `/api/task-links` — 12 rotas

Arquivos: `server/taskLinkBackfill.js`, `server/taskLinks.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/task-links/backfill/estimate` |  |  | `server/taskLinkBackfill.js:174` |
| POST | `/api/task-links/backfill` |  |  | `server/taskLinkBackfill.js:181` |
| GET | `/api/task-links/backfill/status` |  |  | `server/taskLinkBackfill.js:197` |
| POST | `/api/task-links/backfill/cancel` |  |  | `server/taskLinkBackfill.js:202` |
| GET | `/api/task-links/pending` |  | ---------- Revisão central ---------- | `server/taskLinkBackfill.js:210` |
| POST | `/api/task-links/decide` |  |  | `server/taskLinkBackfill.js:254` |
| POST | `/api/task-links/confirm-high` |  |  | `server/taskLinkBackfill.js:263` |
| POST | `/api/task-links` | `requireAuth` `requireMasterOrPricetax` |  | `server/taskLinks.js:65` |
| POST | `/api/task-links/suggest` | `requireAuth` `requireMasterOrPricetax` |  | `server/taskLinks.js:106` |
| GET | `/api/task-links/learning` | `requireAuth` `requireMasterOrPricetax` |  | `server/taskLinks.js:197` |
| POST | `/api/task-links/forget` | `requireAuth` `requireMasterOrPricetax` |  | `server/taskLinks.js:239` |
| POST | `/api/task-links/eval` | `requireAuth` `requireMasterOrPricetax` |  | `server/taskLinks.js:257` |

## `/api/templates` — 12 rotas

Arquivos: `server/documentTemplates.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/templates` |  |  | `server/documentTemplates.js:98` |
| POST | `/api/templates` |  | Cria o modelo já com o 1º anexo (arquivo ou link). Os demais entram em POST /:id/items, um por requisição (cada arquivo pode ter até 30 MB; juntar todos num corpo só est… | `server/documentTemplates.js:107` |
| POST | `/api/templates/:id/items` |  |  | `server/documentTemplates.js:124` |
| PATCH | `/api/templates/:id` |  |  | `server/documentTemplates.js:138` |
| PATCH | `/api/templates/:id/items/:itemId` |  | Troca o endereço de um link e refaz a prévia (url ausente = só refaz a prévia do endereço atual). | `server/documentTemplates.js:153` |
| DELETE | `/api/templates/:id/items/:itemId` |  |  | `server/documentTemplates.js:172` |
| DELETE | `/api/templates/:id` |  |  | `server/documentTemplates.js:184` |
| GET | `/api/templates/:id/items/:itemId/file` |  |  | `server/documentTemplates.js:211` |
| GET | `/api/templates/:id/file` |  | compatibilidade: 1º arquivo do modelo | `server/documentTemplates.js:212` |
| POST | `/api/templates/:id/comments` |  |  | `server/documentTemplates.js:214` |
| PATCH | `/api/templates/:id/comments/:commentId` |  |  | `server/documentTemplates.js:231` |
| DELETE | `/api/templates/:id/comments/:commentId` |  |  | `server/documentTemplates.js:246` |

## `/api/widget` — 7 rotas

Arquivos: `server/widget.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/widget/status` | `requireAuth` |  | `server/widget.js:61` |
| GET | `/api/widget/views` | `requireAuth` |  | `server/widget.js:69` |
| PUT | `/api/widget/views` | `requireAuth` |  | `server/widget.js:76` |
| GET | `/api/widget/token` | `requireAuth` |  | `server/widget.js:85` |
| POST | `/api/widget/token` | `requireAuth` |  | `server/widget.js:95` |
| DELETE | `/api/widget/token` | `requireAuth` |  | `server/widget.js:104` |
| GET | `/api/widget/summary` |  |  | `server/widget.js:111` |

## `/api/xflow` — 8 rotas

Arquivos: `server/xflow.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/api/xflow/team` | `requireAuth` `requireXflowAccess` | rota própria porque GET /api/users exige requireMaster, e reporter/dev comuns não são master. | `server/xflow.js:205` |
| GET | `/api/xflow/affected-companies` | `requireAuth` `requireXflowAccess` | por frequência de uso — quem aparece mais costuma ser quem o usuário mais quer digitar de novo. | `server/xflow.js:220` |
| GET | `/api/xflow/tickets` | `requireAuth` `requireXflowAccess` |  | `server/xflow.js:235` |
| GET | `/api/xflow/tickets/:id/events` | `requireAuth` `requireXflowAccess` |  | `server/xflow.js:252` |
| POST | `/api/xflow/tickets/:id/view` | `requireAuth` `requireXflowAccess` | TASK (regra do Rafael: só some do contador quando lida OU quando o usuário efetivamente acessa a ocorrência). | `server/xflow.js:270` |
| POST | `/api/xflow/tickets` | `requireAuth` `requireXflowAccess` |  | `server/xflow.js:292` |
| PATCH | `/api/xflow/tickets/:id` | `requireAuth` `requireXflowAccess` |  | `server/xflow.js:322` |
| DELETE | `/api/xflow/tickets/:id` | `requireAuth` `requireXflowAccess` | antes), e só admin (master/superAdmin do Cronograma com xflow_role) pode fazer isso — ver xflowPermissions.js. | `server/xflow.js:841` |

## `/d` — 1 rotas

Arquivos: `server/companyShare.js`.

| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |
|---|---|---|---|---|
| GET | `/d/:token/:file` |  |  | `server/companyShare.js:178` |

## Rotas que NÃO passam pelo roteador `/api`

- `GET /d/…` (dados públicos do link de acompanhamento) e `/a/…`, `/acompanhamento/…` (páginas públicas; `X-Robots-Tag: noindex`) — ver `server/companyShare.js` e `server/index.js`.
- Arquivos estáticos do front (`dist/`) e o *fallback* de página única (SPA) ficam no fim do `server/index.js`; qualquer `/api/...` desconhecido responde 404 em JSON.
