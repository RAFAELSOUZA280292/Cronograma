# Integrações, acesso público, observabilidade e infraestrutura
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza (decide escopos, links públicos e política de medição). Fonte da verdade: o código; este texto é o mapa.

## Em uma frase
Tudo o que fala com o mundo de fora do painel (outras janelas do Claude Code, o iPhone, o cliente sem login, o Power BI, o Google, as IAs) mais tudo o que mede, registra e publica o próprio painel (uso, erros, logs, build, deploy).

## Para quem é / quando ler (gatilhos)
Pedidos típicos do Rafael que mandam para este documento:
- "Gera uma chave para a outra janela do Claude Code" / "essa chave não deveria poder gravar" / "libera o escopo X".
- "A IA externa tem que mandar a transcrição / corrigir a reunião" (API de conectividade).
- "O widget do iPhone não atualiza" / "quero um bloco novo no widget".
- "O cliente quer ver o cronograma sem login" / "link do Power BI parou" / "o que o cliente enxerga?".
- "Subir um modelo de documento" / "o link do modelo não mostra prévia" / "arquivo de 40 MB".
- "Quem acessou o painel e de onde?" / "o tempo medido está errado" / "LGPD: o que a gente coleta?".
- "Deu erro em produção, acha no log" / "o site caiu depois do deploy" / "rota nova caiu no index.html".
- "Qual variável de ambiente liga a busca semântica / o push / o Google?".

**Palavras-chave para busca (robô):** `pxk_`, `pxw_`, `api_tokens`, `api_token_actions`, `SCOPE_RANK`, `needScope`, `bearer`, `crmViaToken`, `dryRun`, `ref`, `ENDPOINTS`, `buildGuide`, `ConnectSection`, `widgetSummary`, `sanitizeViews`, `Scriptable`, `company_share_links`, `buildPublicPayload`, `buildDataTables`, `toCsv`, `/a/`, `/d/`, `X-Robots-Tag`, `company_calendar_events`, `upsertBlockEvent`, `document_templates`, `FILE_TYPES`, `SANDBOX_CSP`, `fetchLinkPreview`, `isPrivateAddress`, `officePreviewText`, `user_usage_events`, `user_access_events`, `ip_geo_cache`, `recordUsage`, `purgeTelemetry`, `usagePolicy`, `detectAlerts`, `symbolicate`, `stash-sourcemaps`, `apiErrorHandler`, `describeError`, `client-error`, `railway-logs`, `VitePWA`, `sw.js`.

## Mapa rápido

| Arquivo | Função/componente (conferido) | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/connect.js` | `router`, `SCOPES`, `SCOPE_RANK`, `bearer`, `needScope`, `crmViaToken`, `applyPlanOps`, `runMeetingEdit`, `ENDPOINTS` | API de conectividade `/api/connect`: gera/revoga chaves (cookie) e atende chamadas com `Authorization: Bearer pxk_…` | Outra janela do Claude Code / IA externa; tela `ConnectSection` |
| `src/connect/ConnectSection.jsx` | `ConnectSection` | Tela "Integrações (avançado)" em Meu perfil: gera chave, copia comando e guia, lista chaves, mostra gravações no CRM | Clique do usuário; chama `/api/connect/tokens` e `/actions` |
| `src/connect/guide.js` | `buildGuide` | Monta o guia de uso colado na outra janela (sem o token) conforme o escopo | `ConnectSection` ao gerar a chave |
| `docs/CONECTIVIDADE_CLAUDE_CODE.md`, `docs/IA_EXTERNA_ENVIAR_TRANSCRICAO.md`, `docs/testar-conectividade.sh` | guias e teste | Referência humana; o `.sh` só lê e checa 401/404 | Rafael entrega à IA externa; teste manual |
| `server/widget.js` | `router`, `encrypt`/`decrypt`, `limited` | Token `pxw_` do widget, visões, `GET /summary` público por Bearer | Script Scriptable no iPhone; tela `WidgetSection` |
| `server/widgetSummary.js` | `buildSummary`, `boardItems`, `agendaItems`, `sanitizeViews`, `BLOCKS` | Funções puras: só títulos e horários | `widget.js`; `todayInSp` também é usado por `connect.js` e `companyShare.js` |
| `src/widget/WidgetSection.jsx`, `src/widget/scriptableScript.js` | `WidgetSection`, `buildScriptableScript` | Aba iPhone: gerar/revogar código, editar visões, copiar script | Clique do usuário |
| `server/companyShare.js` | `router`, `publicRouter`, `dataRouter`, `buildPublicPayload`, `buildDataTables`, `toCsv` | Links públicos por empresa: página (`kind='page'`) e dados (`kind='data'`) | Equipe (cookie) gera; cliente/Power BI lê sem login |
| `src/screens/CompanyShareLink.jsx`, `src/screens/PublicCompanyScreen.jsx` | janela "Link para o cliente" e tela pública | Gera/copia/desativa e mostra Resumo/Cronograma/Tabela | `/a/<token>` e `/acompanhamento/<token>` (`src/App.jsx`) |
| `server/companyCalendar.js`, `server/companyCalendarPlan.js` | `createCalendarRouter`, `buildEventBody`, `fingerprint`, `candidateMeetings` | "Reservar na agenda": reunião do cronograma vira bloco no Google Calendar | `src/screens/CompanyCalendar.jsx` |
| `server/documentTemplates.js` | `router`, `FILE_TYPES`, `parseItem`, `sendItemFile` | Modelos de documentos (arquivo até 30 MB ou link) | `src/modelos/Modelos.jsx` |
| `server/linkPreview.js`, `server/officePreview.js` | `fetchLinkPreview`, `isPrivateAddress`, `officePreviewText` | Prévia de link (título/imagem) e texto de docx/pptx/xlsx | `documentTemplates.js` ao criar anexo |
| `server/opsIntel.js` | `router` (só Master), `loadEvidence`, `computeUser` | Central de Inteligência Operacional (`/api/ops-intel`) | `src/opsintel/OpsIntelScreen.jsx` |
| `server/usageLog.js` | `recordUsage`, `sanitizeSlices`, `purgeTelemetry`, `startRetentionJob`, `RETENTION` | Grava fatias de tempo e ações; apaga o velho | `POST /api/activity/usage` (em `server/routes.js`); job no boot |
| `server/usagePolicy.js` | `usagePolicy` | Texto LGPD único (o que coleta, o que não coleta, retenção) | `GET /api/activity/policy` e `/api/ops-intel/policy` |
| `server/accessLog.js` | `recordAccess`, `noteVisit`, `noteFirstUse`, `lookupGeo`, `backfillCoords`, `clientIp` | Acessos (login/visita/primeiro uso/senha errada) com IP e cidade aproximada | Login e `requireAuth`/`/activity/ping` (`server/routes.js`) |
| `server/projectAudit.js` | `installProjectAudit`, `setActor` | Grava quem escreveu em `projects` (variáveis `app.actor_*` para o gatilho do banco) | Instalado em `server/db.js` na criação do pool |
| `server/metrics.js` | `logMetric` | Eventos da RENATA em `ai_metrics_events` (sem tela) | RENATA, sem `await` |
| `server/clientError.js`, `src/lib/clientError.js` | `formatClientError`, `allowReport`, `reportClientError` | Erro de tela do navegador vira 1 linha de log | `POST /api/client-error` |
| `server/sourcemaps.js`, `scripts/stash-sourcemaps.mjs` | `symbolicate`, `countMaps` | Traduz pilha minificada para `src/arquivo.jsx:linha` só no log | `/api/client-error`; `npm run build` |
| `server/errorHandler.js` | `describeError`, `apiErrorHandler` | Erro da API em português + código curto `ref` no log | Final da cadeia de `/api` |
| `server/index.js` | `start()` | Ordem dos middlewares, boot, estático, fallback do SPA | `npm start` |
| `vite.config.js`, `src/sw.js`, `src/main.jsx` | `VitePWA`, `sourcemap:'hidden'`, service worker | PWA instalável, push no aparelho, sourcemaps ocultos | Build e navegador |
| `scripts/railway-logs.mjs` | script | Lê logs do deploy pela API GraphQL da Railway (só leitura) | Claude Code/Rafael no terminal |

---

# PARTE 1 — API de conectividade (`/api/connect`, chave `pxk_`)

## Como funciona (passo a passo)
1. **Gerar a chave (tela, cookie).** Meu perfil > Integrações (avançado) > nome, permissão, validade > "Gerar chave" -> `POST /api/connect/tokens` (`requireAuth`). O servidor cria `pxk_` + 32 bytes aleatórios (base64url), grava **só o sha256** em `api_tokens.token_hash` e devolve o texto **uma vez** (`Cache-Control: no-store`). Não dá para recuperar depois.
2. **Entregar à outra janela.** A tela dá dois botões: "comando da chave" (`export PRICETAX_URL=…; export PRICETAX_TOKEN=…`) e "guia de uso" (`buildGuide`, sem o token). O guia muda conforme o escopo (`canCreate`, `canWrite`, `canCrm`, `canTranscripts`, `canMeetingsEdit`, `readAll`).
3. **Chamar a API.** Toda chamada leva `Authorization: Bearer pxk_…`. Token na URL não vale (dá 401). O middleware `bearer` (em `connect.js`) faz, nesta ordem: limite de 120/min pelo hash -> procura `api_tokens` -> recusa revogado/vencido (401) -> carrega o usuário -> recusa bloqueado/vencido (403) -> atualiza `last_used_at` (no máximo 1 vez por minuto) -> `setActor` (para o histórico de quem gravou: "<nome> (API, chave "<nome da chave>")").
4. **A chave age como o dono.** Empresas: `canAccessProject` + mesma organização (`loadOne`/`loadProjects`). Atividades: só o quadro pessoal do dono. Agenda: só o Google do dono. CRM: perfil de CRM do dono (`crmCan`).
5. **Gravação** (quando o escopo permite): cada rota valida, grava em transação (`FOR UPDATE`) quando mexe no projeto, escreve o Log da empresa e/ou `api_token_actions`, e dispara reindexação da memória da RENATA (plano e correção de reunião).
6. **Revogar.** `DELETE /api/connect/tokens/:id` (só o dono da chave) marca `revoked_at`; vale na hora.

Fluxo da transcrição enviada por IA externa: `POST …/transcripts` -> `createSubmission` (`server/meetingInbox.js`) -> a RENATA do painel extrai a reunião -> a IA externa consulta `GET …/transcripts/:submissionId` a cada ~5 s até `done`/`failed`. A IA externa **não** resume nem cria atividade: só entrega e acompanha.

## Escopos: tabela completa (escopo × o que pode)
`rank` = valor em `SCOPE_RANK` (`connect.js:32`). Rotas de leitura (GET `/me`, `/activities`, `/companies*`, `/agenda`) aceitam **qualquer** escopo. Colunas de gravação/rotas especiais:

| Escopo | Rank | Quem gera (conferido em `POST /tokens`) | Criar atividade (`POST /activities`) | Ajustar cronograma (`POST …/plan`) | Transcrições (POST envio e retry / GET andamento) | Corrigir reunião (PATCH, desfazer / GET histórico) | CRM (`/api/connect/crm`) |
|---|---|---|---|---|---|---|---|
| `read_all` (tela: "Ler tudo") | 0 | qualquer usuário logado | não (403) | não | só GET (andamento); POST/retry 403 | só GET do histórico (exige acesso a Empresas) | só GET/HEAD, se o dono tem leitura de CRM; `/migration*` bloqueado |
| `write_all` (tela: "Ler e editar tudo") | 2 | só Master ou super admin; validade padrão 90 dias, máximo 180 | sim | sim, mas a rota exige Master na hora | sim | sim (exige Empresas) | tudo que o dono pode, exige administrador do CRM na hora; escrita da migração do PipeRun bloqueada |
| `read` (antigo) | 0 | qualquer | não | não | 403 até para GET | não | 403 ("não acessa o CRM") |
| `read_create` (antigo) | 1 | qualquer | sim | não | 403 | não | 403 |
| `read_write` (antigo) | 2 | só Master/super admin | sim | sim (e exige Master na hora) | sim | **não** | 403 |
| `crm_operate` (antigo) | 0 | só administrador do CRM (`crmCan(user,'admin')`) | não | não | 403 | não | sim, como administrador de CRM; grava `api_token_actions` |
| `transcripts` (antigo) | 0 | quem tem acesso a Empresas | não | não | sim | **não** (nem GET do histórico) | 403 |
| `meetings_edit` (antigo) | 0 | quem tem acesso a Empresas | não | não | sim | sim | 403 |

Onde é garantido: emissão em `POST /tokens` (403 com mensagem em português); uso em `needScope('read_create'|'read_write')`, `needTranscripts`, `needMeetingsEdit`, `crmViaToken` (todos em `connect.js`). **A regra de papel é conferida de novo a cada chamada** (Master em `/plan`, administrador do CRM em `crmViaToken`, Empresas em `needMeetingsEdit`): se o dono perde o papel, a chave perde o poder. Teste: `scripts/connect-scopes.test.mjs`.

As chaves antigas continuam valendo e podem ser geradas, mas a tela só destaca `read_all` e `write_all`; as demais ficam em "Chaves específicas (avançado)".

## Limites, validade, revogação, auditoria

| Item | Valor | Onde |
|---|---|---|
| Requisições | 120 por minuto por chave (contador em memória do processo, pelo hash; zera no restart) | `bearer`, `MAX_PER_WINDOW` |
| Atividades criadas | 60 por hora por chave | `bump(creates…)` em `POST /activities` |
| Transcrições novas | 30 por hora por chave (duplicado devolvido não conta) | `POST …/transcripts` |
| Correções de reunião | 200 por hora por chave (`dryRun` não conta) | `runMeetingEdit`, `MAX_EDIT_PER_HOUR` |
| Operações em `/plan` | 1 a 200 por chamada | `MAX_OPS` |
| Tamanho da transcrição | 200 a 400.000 caracteres (curta 400; longa 413) | `MAX_TRANSCRIPT_CHARS` |
| Validade escolhida | 30, 90, 180 (padrão), 365 dias; `write_all` limitado a 180 | `VALID_DAYS`, `WRITE_ALL_MAX_DAYS` |
| Chaves ativas por pessoa | 10 | `MAX_ACTIVE_TOKENS` |
| Formato | `pxk_` + 43 caracteres; só sha256 no banco | `POST /tokens` |
| Revogação | `UPDATE api_tokens SET revoked_at`; só o dono revoga (não há rota de admin revogar chave alheia) | `DELETE /tokens/:id` |
| Auditoria geral | `api_token_actions` (id, org, chave, usuário, método, caminho sem query, status, hora) | `crmViaToken` (todo método não-GET do CRM, inclusive os recusados) e `runMeetingEdit` (correção/desfazer gravados) |
| Auditoria por rota | `/plan`: linha no Log da empresa (`projects.data.log`, até 300); `/activities`: histórico do cartão ("criada pela API… token"); correção de reunião: Log + tabela `meeting_edits` (antes/depois + corpo que desfaz); CRM: auditoria/linha do tempo como "Claude Code (por <dono>)" | respectivas rotas |
| Quem vê as gravações | `GET /actions`: administrador do CRM vê as de toda a organização (últimas 100); os demais só as próprias. A tela só carrega a lista se `canCrm` | `GET /actions`, `ConnectSection` |

## Rotas desta área

| Método | Caminho | Quem pode (conferido) | Entrada (principais) | Saída | Erros comuns |
|---|---|---|---|---|---|
| GET | `/api/connect` | público (sem segredo) | nada | nome, `scopes`, `presets`, `endpoints` (`ENDPOINTS`), `limits`, `errors` | — |
| GET/POST/DELETE | `/api/connect/tokens[/:id]` | `requireAuth` (cookie) | POST: `name` (≤60), `scope`, `days` | GET: lista + `canAdmin/canCrm/canTranscripts`; POST: token (uma vez) | 400 sem nome/escopo ou 10 ativas; 403 escopo não permitido ao papel |
| GET | `/api/connect/actions` | `requireAuth` | — | últimas 100 gravações | — |
| GET | `/api/connect/me` | qualquer chave | — | dono, papel, escopo, validade, `today`, módulos | 401 token ruim; 403 usuário bloqueado |
| GET | `/api/connect/activities` | qualquer chave; dono precisa de Gestão de Atividades | `status=open\|overdue\|today\|urgent\|done\|all`, `q`, `limit`≤200 | `{today,total,activities}` atrasadas primeiro | 403 sem acesso à Gestão |
| POST | `/api/connect/activities` | rank ≥1 | `title` (obrig., ≤200), `desc` (≤4000), `dueDate` AAAA-MM-DD, `priority`, `board`, `column`, `ref` (≤80) | 201 `{created,activity}`; com `ref` repetido: 200 `created:false` | 400 título/data/prioridade; 404 página/coluna; 429 60/h |
| GET | `/api/connect/companies` e `/:id` | qualquer chave; dono com Empresas | `q` | empresas visíveis; detalhe sem transcrição | 403 sem Empresas; 404 outra organização |
| GET | `/api/connect/companies/:id/meetings/:meetingId` | qualquer chave | `transcript=1` (até 60.000 caracteres) | resumo, decisões, itens com `id` e `activityLink` | 404 |
| POST | `/api/connect/companies/:id/plan` | rank ≥2 **e** dono Master/super admin | `ops[]` (1–200), `dryRun` (**padrão true**), `note` | `{dryRun,applied,results,created,undo}` | 400 com `errors[]` e nada gravado; 403 |
| POST/GET | `…/transcripts`, `…/transcripts/:submissionId`, `…/retry` | ver tabela de escopos | `transcript`, `date`, `time` | 202 `submissionId`; `duplicate:true` (200) se o mesmo texto já existe | 400 curta/data/hora; 413; 429 30/h; 409 retry fora de `failed` |
| PATCH | `…/meetings/:meetingId` | `meetings_edit`/`write_all` + Empresas | só `title,date,time,summary,decisions,participants,actionItems,dryRun,note` | `editId`, `changes`, `undoWith`, reunião nova | 400 campo fora da lista (nada gravado); 429 200/h |
| GET/POST | `…/meetings/:meetingId/edits` e `/edits/:editId/undo` | idem | undo: `dryRun`, `note` | histórico (50) / desfazer | 409 já desfeita ou reunião mudou |
| GET | `/api/connect/agenda` | qualquer chave | `days` 1–14 | `{connected,events[]}` só aceitos/próprios | — |
| `*` | `/api/connect/crm/…` | `read_all` (GET), `crm_operate`/`write_all` (tudo) | mesmas rotas de `/api/crm` | igual ao CRM | 403 migração do PipeRun; 403 gravação com `read_all` |

Lista exata de rotas: `docs/gerado/ROTAS.md`, grupo `/api/connect`. Rota inexistente sob `/api` responde 404 JSON (`server/index.js`).

## Operações de `/plan` (resumo)
`activity.set`, `sub.set`, `sub.add` (`position` top|end, `kind`, `guide`, `pautaDe`), `sub.move`, `activity.add`, `pauta.link`/`pauta.restore`, `activity.delete`/`sub.delete` (exclusão lógica, volta pela lixeira), `activity.restore`/`sub.restore`. Regras: responsável precisa estar na equipe da empresa; status só `nao-iniciado|em-andamento|pausado|concluido`; datas AAAA-MM-DD válidas; título de atividade único; depois de aplicar, `fitPeriods` estica o período da atividade para cobrir as subatividades. Resposta traz `undo` (mande de volta como `ops` para desfazer). Código: `applyPlanOps` (`connect.js`) com tabelas `SET_ACT` e `SET_SUB`.

## Dados
| Tabela | Uso | Leitura/gravação | Observação |
|---|---|---|---|
| `api_tokens` | chaves (hash, escopo, validade, `last_used_at`, `revoked_at`) | lê/grava; **nunca apaga** (só revoga) | `UNIQUE(token_hash)`; `ON DELETE CASCADE` do usuário |
| `api_token_actions` | auditoria das gravações por chave (CRM e correção de reunião) | só insere | FK para `api_tokens`; índice `(user_id, at DESC)`; sem rotina de limpeza |
| `meeting_edits` | antes/depois e corpo que desfaz, por correção | insere; marca `undone_at` | criada por `server/meetingEditsSchema.js` |
| `personal_boards` | onde `POST /activities` grava o cartão (`createdVia:'api'`, `apiRef`) | grava | `mergeApiCards` (`server/routes.js`) impede o painel aberto de apagar cartão da API |
| `projects.data` | `/plan` e correção de reunião gravam o JSON inteiro | grava | gatilho de versionamento do cronograma registra quem (via `projectAudit.js`) |
| `meeting_submissions` | envios de transcrição | lê (md5 para duplicado) / grava via `createSubmission` | — |

Isolamento: toda leitura/gravação de empresa confere `r.org_id === req.apiUser.orgId` e `canAccessProject`; empresa de outra organização responde 404.

## Regras e travas

| Trava | O que impede | Onde é garantida | O que o usuário vê se violar |
|---|---|---|---|
| Token só em cabeçalho | Token vazar em URL/log | `bearer` (lê só `Authorization`) | 401 "Token ausente ou inválido." |
| Hash no banco | Quem lê o banco usar a chave | `POST /tokens` grava só sha256 | — |
| Escopo e papel a cada chamada | Chave com mais poder que o dono | `needScope`, `needTranscripts`, `needMeetingsEdit`, `crmViaToken`, checagem Master em `/plan` | 403 com mensagem do que gerar |
| `read_all` nunca grava | Leitura virar escrita no CRM | `crmViaToken` recusa método não-GET | 403 "Esta chave só lê…" |
| Migração do PipeRun fora da chave | Escrita da migração por API | `CRM_BLOCKED` em `crmViaToken` | 403 |
| Tudo ou nada + `FOR UPDATE` | Plano/correção pela metade | transação em `/plan` e `runMeetingEdit` | 400 com `errors[]`, nada gravado |
| `dryRun` | Gravar sem ver | `/plan` (padrão **true**); correção de reunião só simula se `dryRun:true` explícito | resposta `dryRun:true` |
| Lista fechada de campos | Mexer em vínculo, status, transcrição | `applyMeetingEdit` (`server/meetingEdit.js`) | 400 |
| Exclusão sempre lógica | Perder dado | `activity.delete`/`sub.delete` (marca `deleted`) | volta pela lixeira |
| Idempotência | Duplicar atividade/transcrição/correção desfeita | `ref` em atividades; `md5(transcript)` em envios; `undone_at` | 200 `created:false` / `duplicate:true` / 409 |
| Limites por hora | Gasto de IA e abuso | `bump` (contador em memória) | 429 |
| Isolamento por organização | Ler empresa de outra base | `loadOne`, `loadProjects`, `runMeetingEdit` | 404 |

## IA nesta área
A API em si não chama IA. Só `POST …/transcripts` dispara a RENATA (extração com `max_tokens` 16.000 e uma repetição compacta se cortar, em `server/meetingInbox.js`, §116e). Cada envio é chamada paga; por isso 30/h por chave e o guia manda enviar "só quando o Rafael pedir". Não existe teto de custo para `write_all` no CRM além dos 120/min.

## Bugs e armadilhas conhecidos
| Sintoma | Causa | Onde foi corrigido | Como não reintroduzir |
|---|---|---|---|
| Atividade criada pela API sumia | Painel aberto salva o quadro inteiro | `mergeApiCards` + `GET /personal-board/version` (§80) | Manter `updated_at` = `createdAt` do cartão ao inserir |
| `/api/health` devolvia HTML 200 | Fallback do SPA pegava rota inexistente | 404 JSON em `server/index.js` (§80) | Montar rota nova **antes** do `app.use('/api', 404)` |
| Data `2026-02-31` aceita | `Date.parse` arredonda | `isISODay` (`meetingEdit.js`) | Usar `isISODay` de `meetingEdit.js`. **Ainda existe** um `isISODay` próprio em `connect.js` (usado por `/plan`) que só usa `Date.parse`: testado em Node, `Date.parse('2026-02-31T00:00:00Z')` devolve um número, então `/plan` aceita 31/02 (vira março) |
| Chave read_all expõe e-mail/telefone do CRM | Decisão do Rafael (só GET, só o que o dono vê) | §116f | Guia manda não copiar dados para o repositório |
| Gravação na empresa sobrescrita por tela aberta | A tela grava o projeto inteiro | risco conhecido (§116e) | Conferir lendo de volta depois de gravar |

## Como testar
| Script | O que prova |
|---|---|
| `scripts/connect-scopes.test.mjs` | `read_all`/`write_all`, validade, 9 gravações recusadas, chaves antigas inalteradas, perda de papel |
| `scripts/connect-crm.test.mjs` | CRM por chave, auditoria "Claude Code (por …)", `api_token_actions` |
| `scripts/connect-transcripts.test.mjs`, `scripts/connect-meetings-edit.test.mjs` | envio e correção de reunião ponta a ponta (IA falsa local) |
| `scripts/connect-fixes.test.mjs` | `done` com desfazer e exemplos sem vínculo automático |
| `docs/testar-conectividade.sh` | Só leitura contra qualquer endereço; confere 401 sem token, 401 com token na URL, 401 em `/api/users` e 404 em rota inexistente |
Todos exigem servidor e Postgres **locais** (recusam outro banco). **Sem teste:** produção com chave real; uma segunda janela real lendo o guia; `GET /agenda` com Google real.

## Receitas — API de conectividade
1. **Novo escopo ou mudar quem gera:** `SCOPES`, `SCOPE_RANK`, `LEGACY_SCOPES` e `POST /tokens` em `connect.js`; `ConnectSection.jsx` (opção e rótulo `SCOPE_LABEL`); `guide.js` (flag); `ENDPOINTS`; `docs/CONECTIVIDADE_CLAUDE_CODE.md`; teste em `connect-scopes.test.mjs`.
2. **Nova rota de leitura:** `router.get` abaixo de `router.use(bearer)`; use `loadOne` (organização + `canAccessProject`); acrescente em `ENDPOINTS` e no guia; `clip` em todo texto.
3. **Nova rota que grava:** `needScope`/guarda própria, transação com `FOR UPDATE`, `dryRun`, Log da empresa, `api_token_actions`, limite por hora; escreva o teste HTTP.
4. **Mudar um limite:** constantes `MAX_PER_WINDOW`, `bump(creates…)`, 30 (transcrições), `MAX_EDIT_PER_HOUR`; atualizar texto de `ENDPOINTS.limits` e de `guide.js`.
5. **Nova operação de `/plan`:** ramo em `applyPlanOps`, validador em `SET_ACT`/`SET_SUB`, devolver `undo`; ver `shared/period.js` e `shared/pauta.js`.
6. **Chave do Claude Code do Rafael para o CRM:** o `.env` local guarda `PRICETAX_URL` e `PRICETAX_CRM_TOKEN` (só nomes aqui); use sempre `/api/connect/crm`, nunca cookie ou SQL (regra do `CLAUDE.md`).

---

# PARTE 2 — Widget do iPhone (`pxw_`)

## Como funciona
1. Meu perfil > iPhone > "Gerar código" -> `POST /api/widget/token` (cookie): cria `pxw_`+32 bytes; grava **sha256** em `users.widget_token_hash` e **também a versão cifrada** (AES-256-GCM, chave derivada do `JWT_SECRET`) em `users.widget_token_enc` para o painel remontar scripts sem gerar código novo (`GET /token`, `no-store`).
2. O usuário cola no app Scriptable um script por visão (`buildScriptableScript`, com endereço, token e nome da visão embutidos).
3. A cada atualização do iOS (15–30 min, não é tempo real) o script chama `GET /api/widget/summary?view=<nome>` com `Authorization: Bearer pxw_…`.
4. O servidor acha o usuário pelo hash, confere bloqueio/validade, lê `personal_boards` e a agenda (cache de 5 min por usuário; falha do Google não derruba) e devolve `buildSummary`.

## Rotas
| Método | Caminho | Quem pode | Entrada | Saída | Erros |
|---|---|---|---|---|---|
| GET | `/api/widget/status` | `requireAuth` | — | `active`, `recoverable`, datas | — |
| GET/PUT | `/api/widget/views` | `requireAuth` | PUT: `views[]` (até 6; nome ≤24 sem repetir; 1–5 blocos) | visões e `BLOCKS` | 400 com mensagem |
| GET/POST/DELETE | `/api/widget/token` | `requireAuth` | — | `{token}` | GET 404 se não gerado |
| GET | `/api/widget/summary` | Bearer `pxw_` (público, sem cookie) | `view` | atrasadas, vencem hoje, urgentes, próxima reunião, agenda; ≤12 itens/lista, ≤14 na agenda | 401 token ruim ou `?token=`; 403 bloqueado; 429 mais de 30/min por IP |

Blocos válidos (`BLOCKS`): `overdue`, `today`, `urgent`, `meeting`, `agenda`. O resumo traz só **títulos e horários**: nunca descrição, convidados, local ou link. "Hoje" é `America/Sao_Paulo`. O 429 usa memória do processo e `clientIp`.

## Travas e armadilhas
| Trava / armadilha | Detalhe | Onde |
|---|---|---|
| Token só no cabeçalho | `?token=` dá 401 | `GET /summary` |
| Um código por usuário | Gerar outro invalida o anterior; widgets antigos param até colar o novo | `POST /token` |
| Trocar `JWT_SECRET` | Tokens cifrados deixam de abrir (gera-se outro); o hash segue valendo para autenticar | `encKey` |
| Token antigo (só hash) | Não é recuperável: o painel pede um código novo | `status.recoverable` |
| Mudar blocos de uma visão | Não exige colar de novo; criar/renomear visão ou mudar o script, sim | `WidgetSection` |
| Sem teste automatizado no repositório | A lógica pura foi testada em Node na sessão (§76), mas não há script em `scripts/` | — |

## Receitas — widget
- **Bloco novo:** `BLOCKS` e `boardItems`/`buildSummary` em `widgetSummary.js`; rótulo/estilo em `src/widget/scriptableScript.js` (e dizer que todos os scripts precisam ser colados de novo se o script mudou); documentar no §76.
- **Mais itens por lista:** `MAX_ITEMS` (12) e o corte de 14 em `agendaItems`; ajustar o orçamento de linhas do script.

---

# PARTE 3 — Link público de acompanhamento e dados (sem login)

## Como funciona
1. Equipe (Master ou PRICETAX) abre a empresa > "Link para o cliente" (`CompanyShareLink.jsx`) e gera: `POST /api/company-share/:projectId` com `kind` (`page` ou `data`) e `days` (0, 30, 90, 180, 365; padrão 180; 0 = sem validade).
2. O servidor, em transação, **revoga o link anterior do mesmo `kind`**, cria token novo (`randomBytes(9)` = 12 caracteres; links antigos de 43 seguem valendo) e escreve no Log da empresa **quem gerou/revogou (nunca o token)**.
3. **Página:** o cliente abre `/a/<token>` (ou `/acompanhamento/<token>`). `src/App.jsx` desenha `PublicCompanyScreen`, que chama `GET /api/public-company/:token`. O servidor só entrega `buildPublicPayload`.
4. **Dados:** Power BI/Excel/Make/Zapier leem `/d/<token>/atividades.csv`, `/subatividades.csv` ou `/dados.json` (`dataRouter`, montado fora de `/api`). CSV UTF-8 com BOM; célula que começa com `= + @` (tab/CR) ganha apóstrofo para não virar fórmula no Excel (`toCsv`).
5. Cada leitura válida soma `views` e atualiza `last_viewed_at`.

## O que é exposto e o que NUNCA é
| Exposto (`buildPublicPayload`) | Nunca sai |
|---|---|
| Nome fantasia/razão, **logo** (se <400.000 caracteres) | Notas, comentários, anexos, descrição da atividade, log, reuniões, transcrições, tarefas de reunião, `guide` (roteiro), equipe/e-mails, CNPJ, regime, status interno da empresa |
| Fases (id, nome ≤80), até 500 atividades: título ≤200, fase, status, tipo (reunião/trabalho), datas, responsável ≤80 | Qualquer campo fora dessa lista (a lista é fechada no código) |
| Até 100 subatividades por atividade: título ≤240, tipo, feito, data, responsável | Atividades/subatividades excluídas (`deleted`) |
Os CSV/JSON usam os mesmos campos (colunas fixas `ATIV_COLS` e `SUB_COLS`); "atrasada" é calculada no servidor (fim < hoje e não concluída).

## Rotas
| Método | Caminho | Quem pode | Entrada | Saída | Erros |
|---|---|---|---|---|---|
| GET/POST/DELETE | `/api/company-share/:projectId` | `requireAuth` + `requireMasterOrPricetax`, e `canAccessProject` | `kind=page\|data`, `days` | metadados do link (token, validade, `views`) | 404 empresa |
| GET | `/api/public-company/:token` | público | — | `buildPublicPayload`; `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` | 404 "link inválido, venceu ou foi desativado"; 429 mais de 90/min por IP |
| GET | `/d/:token/:file` | público | `file` = `atividades.csv`, `subatividades.csv`, `dados.json` | CSV/JSON | 404; 429 |
| GET (HTML) | `/a/…`, `/acompanhamento/…` | público | — | `index.html` com `X-Robots-Tag: noindex, nofollow` | — |

Observação: a página e os dados têm tokens **separados** (`kind`); revogar um não derruba o outro. Existem também os links `/quadro/<token>` (quadro pessoal) e `/reuniao/<token>` (reunião), servidos por `GET /api/public-board/:token` e `/api/public-meeting/:token` em `server/routes.js` (outra área; ver `docs/gerado/ROTAS.md`).

## Dados
`company_share_links` (id, org_id, project_id, `token` único, created_by(_name), `expires_at`, `revoked_at`, `views`, `last_viewed_at`, `kind`). O token mora em tabela própria (não no JSON do projeto, que o painel regrava inteiro e poderia ressuscitar um link revogado). `ON DELETE CASCADE` com `projects`. Nada é apagado: link revogado fica com `revoked_at`.

## Regras e travas
| Trava | Onde | O que o usuário vê |
|---|---|---|
| Só Master/PRICETAX gera e revoga | `requireMasterOrPricetax` | 403 |
| Link vence ou foi revogado | consulta com `revoked_at IS NULL` e `expires_at` | 404 com mensagem única (não distingue inválido de vencido) |
| Token com formato `^[A-Za-z0-9_-]{10,80}$` | `TOKEN_RE` | 404 |
| Limite de 90 consultas/min por IP (página e dados dividem o contador) | `limited()` | 429 |
| Nenhum motor de busca indexa | cabeçalho nos três pontos | — |

## Bugs e armadilhas
- O limite por IP usa o **primeiro valor de `X-Forwarded-For` enviado pelo cliente** (`companyShare.js` não usa `trust proxy`): quem forja o cabeçalho escapa do limite. É anti-abuso, não segurança; o que protege é o token de 72 bits.
- Quem tem o endereço lê os dados até a validade: guardar como senha. Link de dados padrão da tela dura 365 dias.
- Gerar link novo derruba o antigo **na hora** (o Power BI quebra até trocar a URL).
- Erro em `/d/…` não passa pelo `apiErrorHandler` (que só cobre `/api`): cai no tratador padrão do Express (a forma da resposta depende de `NODE_ENV`; não verificado em produção).
- Sem teste automatizado de `buildPublicPayload`/`toCsv` no repositório.

## Receitas — links públicos
1. **Cliente quer ver um campo novo (ex.: data de conclusão):** adicionar em `buildPublicPayload` (e, se for para o Power BI, em `buildDataTables` + `ATIV_COLS`/`SUB_COLS`); mostrar em `PublicCompanyScreen.jsx`; **atualizar a tabela "o que é exposto" acima** e perguntar ao Rafael antes de expor texto livre.
2. **Link não deve vencer / vencer mais cedo:** `VALID_DAYS` e `DAYS` em `CompanyShareLink.jsx`.
3. **Revogar tudo de uma empresa:** `DELETE /api/company-share/:id?kind=page` e `…?kind=data`.
4. **Power BI parou:** conferir se o link foi regerado/revogado/vencido (404 JSON) e se a URL tem `/d/<token>/atividades.csv`.

---

# PARTE 4 — Calendário por empresa ("Reservar na agenda")

Só o que é desta área (o resto do calendário está em outro documento). **Não existe arquivo ICS nem link de calendário assinável**: o "link" de cada bloco é o `htmlLink` do evento do Google devolvido por `POST …/apply`.

| Ponto | Detalhe | Onde |
|---|---|---|
| Quem usa | Só Master/PRICETAX (`router.use(requireAuth, requireMasterOrPricetax)`) e `canAccessProject` | `companyCalendar.js` |
| Rotas | `GET /api/company-calendar/:projectId` (lista reuniões candidatas e estado); `POST …/:projectId/apply` (cria/atualiza/cancela) | idem |
| O que vira bloco | Atividade ou subatividade do tipo **Reunião**, com data, não concluída, de hoje em diante (`candidateMeetings`); trabalho nunca gera convite | `companyCalendarPlan.js` |
| Convites | Só os e-mails digitados (até 20, validados); `confirm:true` obrigatório; até 60 reuniões por vez; duração 30/60/90/120/180 min; hora padrão 10:00 | `apply` |
| Trava de uma reunião por dia na mesma empresa | `duplicateDays` entre as escolhidas e as reservas que continuam; o dia precisa estar dentro do período (`inWindow`) e não ser passado | `apply` (400 com mensagem) |
| Idempotência | `fingerprint` (título, descrição, início, fim, convidados); igual = "igual", sem nova chamada ao Google | `buildEventBody`/`fingerprint` |
| Onde ficam os mapas | `company_calendar_events` (PK projeto+atividade; `google_event_id`, `organizer_user_id`, `emails`, `fingerprint`), **fora** do JSON do projeto | `db.js` |
| Organizador | Conta Google conectada por quem clica; reatualizações usam o organizador original | `upsertBlockEvent` |
| Aviso por e-mail | `sendUpdates: 'all'`: convidados recebem convite, atualização e cancelamento do Google | `googleCalendar.js` |
| Conteúdo do evento | Título "<empresa> · <reunião>", fase, período, responsável, pauta, link `APP_BASE_URL/empresas`; cliente nunca é convidado | `buildEventBody` |
| Erro típico | Token do Google vencido/revogado vira "Reconecte o Google Calendar em Meu perfil" | `friendlyGoogleError` |
| Sem Google configurado | `googleConfigured()` falso: a tela avisa; `apply` com itens e sem conexão dá 409 | `apply` |

**Armadilha:** o comentário de abertura de `googleCalendar.js` diz que o painel "nunca lê a agenda de volta", mas `listEvents` existe e é usado por widget, `/api/connect/agenda` e RENATA. O código manda.

---

# PARTE 5 — Modelos de documentos

## Como funciona
1. Master/PRICETAX abre a aba Modelos (`src/modelos/Modelos.jsx`) e cria um modelo com o 1º anexo: `POST /api/templates` (arquivo em `fileDataBase64` ou `kind:'link'` com `url`).
2. Os demais anexos entram um por requisição em `POST /api/templates/:id/items` (até 12 anexos por modelo).
3. Arquivo: o servidor decide o tipo **pela extensão** (`FILE_TYPES`), ignora o tipo do navegador, grava o binário em `document_template_items.file_data` (BYTEA no Postgres) e extrai prévia de texto de docx/pptx/xlsx (`officePreviewText`).
4. Link: `fetchLinkPreview` busca a página (título, descrição, imagem) e guarda em `link_meta`.
5. Abrir/baixar: `GET /api/templates/:id/items/:itemId/file` (`?download=1` força download).

## Limites e tipos
| Item | Valor | Onde |
|---|---|---|
| Tamanho por arquivo | 30 MB (`MAX_FILE_BYTES`); front também confere (`MAX_FILE_MB`) | `documentTemplates.js`, `modelosMeta.js` |
| Corpo da requisição | **45 MB só em `/api/templates`** (30 MB em base64 ≈ 40 MB); o resto da API fica em 15 MB. O parser de 45 MB precisa vir **antes** do global | `server/index.js` linhas 50–51 |
| Anexos por modelo | 12 (`MAX_ITEMS`); não deixa remover o único anexo | rotas `items` |
| Extensões aceitas | pdf, png, jpg, jpeg, gif, webp, txt, html, htm, csv, doc, docx, rtf, odt, ppt, pptx, odp, xls, xlsx, ods, zip | `FILE_TYPES` |
| Recusado | SVG e qualquer outra extensão (400 "Tipo de arquivo não aceito…") | `parseItem` |
| Aberto no navegador (inline) | pdf, imagens, txt, html/htm; o resto baixa (`attachment`) | `type.inline` |
| HTML | servido **isolado**: CSP `sandbox; default-src 'none'; …` (sem scripts, sem origem própria) e `sandbox=""` no iframe da tela | `SANDBOX_CSP`, `Modelos.jsx` |
| Cabeçalhos do arquivo | `Content-Type` do servidor, `nosniff`, `Cache-Control: private, no-store` | `sendItemFile` |
| Comentário em modelo | texto ≤4.000; até 3 anexos de 3 MB; menções notificam | `POST /:id/comments` |

## Prévia de link (`linkPreview.js`) — defesa contra SSRF
- Só `http`/`https`, sem usuário/senha; DNS resolvido e validado **na conexão** (`safeLookup`), sem janela de rebinding; endereço privado/loopback/link-local/metadados recusado (`isPrivateAddress`); no máximo 3 redirecionamentos, cada um revalidado; corpo ≤300 KB; só `text/html`; tempo 6 s; `User-Agent: PRICETAXBot/1.0`.
- **Corrigido em 2026-10-29:** `isPrivateAddress` converte o IPv6 em 16 bytes (`ipv6Bytes`) e bloqueia, em qualquer escrita (inclusive hexadecimal), `::`, `::1`, `::ffff:a.b.c.d`, `::a.b.c.d`, NAT64 `64:ff9b::/96` e 6to4 `2002::/16` quando o IPv4 embutido é privado, além de `fc00::/7`, `fe80::/10`, `fec0::/10` e `ff00::/8`. Teste: `scripts/seguranca-altos.test.mjs` (24 endereços).

## Rotas
| Método | Caminho | Quem pode | Entrada | Saída | Erros |
|---|---|---|---|---|---|
| GET | `/api/templates` | `requireAuth` + `requireMasterOrPricetax` (`router.use`), org efetiva | — | modelos com anexos (sem o binário) | — |
| POST | `/api/templates` | idem | `title`, `description`, `category` (≤40), 1º anexo | 201 modelo | 400 tipo/tamanho/URL |
| POST | `/api/templates/:id/items` | idem | anexo | 201 modelo | 400 mais de 12 |
| PATCH | `/api/templates/:id` e `/:id/items/:itemId` | idem | título/descrição/categoria; URL do link (refaz prévia) | modelo | 400 título vazio; 404 |
| DELETE | `/api/templates/:id` e `/:id/items/:itemId` | idem | — | `{ok:true}` | 400 último anexo; 404 |
| GET | `/api/templates/:id/items/:itemId/file`, `/:id/file` | idem | `download=1` | binário | 404 |
| POST/PATCH/DELETE | `/api/templates/:id/comments[/:commentId]` | idem; editar só o autor; excluir autor ou Master | `text`, anexos, `mentions` | comentário | 403/404 |

## Dados e armadilhas
- `document_templates` (título, descrição, categoria, comentários JSONB, criador) e `document_template_items` (`kind` file|link, `file_name`, `file_data` BYTEA, `url`, `link_meta`, `preview_text`, `position`). Isolamento por `org_id` (`effectiveOrgId`).
- **Exclusão é física** (`DELETE FROM`), diferente do padrão de exclusão lógica do resto do app: apagar modelo ou anexo é definitivo e leva o arquivo junto. Qualquer Master/PRICETAX da organização apaga qualquer modelo (não só o criador).
- Os binários ficam no banco: modelos grandes engordam o backup do Postgres. Para arquivo maior que 30 MB, a tela manda usar link.
- `.doc/.ppt/.xls` antigos não têm prévia de texto (só ícone/baixar). A extração de docx/pptx/xlsx usa o `zlib` do Node com tetos (6 MB por entrada, 5000 entradas) contra zip bomb.
- O tipo é decidido só pela extensão; o conteúdo do arquivo não é validado (um `.png` que na verdade é HTML sai como `image/png` com `nosniff`).
- Sem teste automatizado de Modelos, `linkPreview` ou `officePreview` em `scripts/`.

## Receitas — Modelos
1. **Aceitar mais um tipo (ex.: `.md`):** `FILE_TYPES` (mime, `kind`, `inline`) + `ACCEPT`/`KIND_BY_EXT` em `src/modelos/modelosMeta.js` + o texto do erro em `parseItem`. Nunca coloque `svg`/`html` como `inline` sem `sandbox: true`.
2. **Subir o limite de 30 MB:** `MAX_FILE_BYTES`, `MAX_FILE_MB` e o `limit: '45mb'` em `server/index.js` (base64 cresce ~33%); lembrar do tamanho do Postgres e do limite do proxy da Railway (não verificado).
3. **Prévia de link falhando em um site:** `fetchLinkPreview` retorna `ok:false`/`needsLogin`; teste com `PATCH /:id/items/:itemId` (refaz a prévia). Não afrouxe o filtro de rede.

---

# PARTE 6 — Inteligência Operacional, uso, acessos e erros

## O que é medido, o que NUNCA é guardado
| Dado | Quem é medido | Tabela | Como entra |
|---|---|---|---|
| Fatias de tempo: aba visível (conectado) e com interação (ativo), por módulo, tela e id da empresa aberta; segundos | só `master` e `pricetax` (`isTracked`) | `user_usage_events` (`kind='slice'`) | App conta a cada 15 s, envia a cada 60 s (`src/lib/usageTracker.js`) -> `POST /api/activity/usage` |
| Ações pontuais (lista fechada `ACTIONS`: `export_pdf`, `export_excel`, `upload_transcript`, `upload_file`, `share_link_create`, `meeting_submit`, `search`) | só equipe | `user_usage_events` (`kind='action'`) | `trackAction(...)` no front |
| Acessos: `login`, `visit`, `first_use`, `login_failed` com IP, `X-Forwarded-For`, user-agent (300) e cidade/UF/país por IP | **todos os perfis** (inclusive cliente: só acessos de segurança) | `user_access_events` | `recordAccess` (login, senha errada), `noteVisit` (sessão nova após 30 min), `noteFirstUse` (`/activity/ping`) |
| Cidade e coordenadas do IP | idem | `ip_geo_cache` (ip, cidade, região, país, latitude, longitude) | `lookupGeo` consulta **`ipwho.is`** (3 s), uma vez por IP |
| Experiência de uso (fluxo, resultado, duração; nota 1–5) | só equipe | `product_events`, `product_csat` | `server/experience.js` (agregado por fluxo, nunca por pessoa) |
| Evidências já existentes (estimativa) | equipe | `projects.data.log`, `personal_card_events`, `xflow_events`, `crm_audit_logs`, `ai_messages`, `meeting_submissions` | lidas por `loadEvidence` |

**Nunca guardado (garantido em `usageLog.js`):** senhas, texto digitado, conteúdo de comentário/arquivo/transcrição, movimento de mouse, o que a pessoa faz fora da plataforma, aba em segundo plano. Os nomes de módulo/tela precisam casar `^[a-z0-9_:-]{0,40}$` e o id da empresa `^[A-Za-z0-9_-]{0,40}$`; fatia <=120 s, ativo <= conectado, <=40 fatias e <=20 ações por envio, 20 envios/min por pessoa; o horário só é aceito até 15 min no passado e 1 min no futuro.

## Como funciona na Central (`/inteligencia`)
1. Só Master (`requireMaster` em todo `/api/ops-intel`; no front, `user.role === 'master'` em `src/lib/routes.js` e `src/App.jsx`) e só a organização do usuário (`orgUsers` filtra `org_id`; super admin sem organização vê todas).
2. `parsePeriod`: padrão 30 dias, máximo 180; compara com o período anterior do mesmo tamanho.
3. Cada indicador leva um selo: **Medido** (fatias), **Estimado** (eventos antigos), **Misto** ou **Indisponível** (`BASIS` em `shared/usageMetrics.js`). O dia usa o medido se houver fatia, senão o estimado, senão fica de fora.
4. Fórmulas: sessão = eventos a <=30 min; tempo estimado = intervalos entre eventos limitados a 5 min; ocioso = conectado - ativo; **índice de atividade = ativo / conectado** (não é produtividade).
5. **Alertas** (`detectAlerts`): país novo, cidade nova, dispositivo novo, viagem impossível, >=3 senhas erradas em 24 h, >=3 IPs em 1 h, madrugada atípica, um IP errando várias contas. São sinais, não acusações.
6. **Mapa por IP:** ponto = centro da cidade informado pelo `ipwho.is`, com margem de dezenas de km; a API devolve o IP **mascarado** (`maskIp`); `backfillCoords` completa até 12 IPs por consulta.

## Rotas desta área
| Método | Caminho | Quem pode | Saída |
|---|---|---|---|
| POST | `/api/activity/usage` | `requireAuth`; só master/pricetax gravam (`skipped` para os outros) | `{ok,stored}` |
| POST | `/api/activity/ping` | `requireAuth` | `{ok:true}` (registra primeiro uso do dia) |
| GET | `/api/activity/policy` | `requireAuth` (toda a equipe lê como é medida) | texto LGPD (`usagePolicy`) |
| GET | `/api/ops-intel/overview`, `/users/:id`, `/map`, `/alerts`, `/experience`, `/policy` | `requireAuth` + `requireMaster` | indicadores; linha do tempo (até 300 itens); pontos; alertas (até 100); experiência; política e retenção |
| POST | `/api/client-error` | `requireAuth` | 204 sempre; log assíncrono |

## Retenção (o que é apagado e quando)
| Dado | Prazo | Variável | Onde |
|---|---|---|---|
| `user_usage_events`, `product_events`, `product_csat` | 395 dias (mínimo 30) | `USAGE_RETENTION_DAYS` | `purgeTelemetry` |
| `user_access_events` | 730 dias (mínimo 90) | `ACCESS_RETENTION_DAYS` | idem |
| `renata_conversations` | 90 dias por `updated_at` (guardam resultados de consultas com dados de clientes); a auditoria `renata_actions` **não** é apagada | fixo | idem |
| Versões do cronograma | ver `docs` de versionamento | `VERSIONS_*` | `server/projectVersions.js` |
| `ip_geo_cache`, `api_tokens`, `api_token_actions`, `company_share_links` | **sem rotina de limpeza** | — | (grep não achou `DELETE`) |
A rotina roda 60 s depois do boot e a cada 24 h (`startRetentionJob`); falha é só log.

## Registro de quem gravou em `projects` (`projectAudit.js`)
`installProjectAudit(pool)` (chamado em `server/db.js`) intercepta **só** `UPDATE projects` e `DELETE FROM projects`: antes de cada um grava `app.actor_id/actor_name/origin` na sessão do Postgres e limpa depois. A identidade vem do `AsyncLocalStorage` preenchido por `requireAuth`, pela chave de API (`bearer`) ou pela RENATA. O gatilho de versionamento (ver `docs/gerado/BANCO.md`) usa isso. Armadilha: escrita em `projects` por **SQL fora do pool** (script solto) fica sem autor.

## Erros do navegador e da API
- **Navegador:** `src/lib/clientError.js` envia erros de tela (`boundary`) e não tratados (`global`), com filtros de ruído (extensão, `ResizeObserver`, queda de rede, chunk de versão antiga, 401). Cada erro igual vai uma vez por sessão (até 20 por origem). O servidor responde 204 na hora, limita **10 por 10 min por pessoa e por origem** (`allowReport`), traduz a pilha (`symbolicate`) e escreve **1 linha JSON** com prefixo `[client-error]` (quebras de linha removidas: ninguém forja outra linha). Campos: `kind`, `userId`, `orgId`, `where`, `message`, `path`, `source`, `status`, `ua`, `stack`, `componentStack`.
- **API:** `apiErrorHandler` transforma o erro em português (`describeError`): 413 corpo grande, 400 JSON quebrado, 409 duplicidade (Postgres 23505) ou vínculo (23503), 400 formato inválido (22P02…), 503 banco indisponível/consulta lenta, 500 genérico. Erro 5xx ganha `ref` (6 hex) **na tela e no log** (`[erro REF] METODO /caminho user=… -> status`). Erro 4xx com `status` e `message` passa a mensagem adiante como está.
- **Sourcemaps:** o build gera `.map` "hidden" (sem referência no JS), `scripts/stash-sourcemaps.mjs` move para `.sourcemaps/` (fora de `dist/`), `server/index.js` ainda responde 404 a qualquer `*.map` (caminho decodificado) e `symbolicate` só usa nome de arquivo estrito dentro de `.sourcemaps/`. O log de boot diz quantos mapas há (`countMaps`).

## IA nesta área
Nenhuma chamada de IA. `server/metrics.js` (`logMetric`) grava eventos da RENATA em `ai_metrics_events` sem await (falha nunca derruba a resposta); não há tela, só SQL.

## Regras e travas
| Trava | O que impede | Onde | Usuário vê |
|---|---|---|---|
| Central só Master | Colega ver dados individuais | `router.use(requireAuth, requireMaster)` + gate no front | 403 / item de menu oculto |
| Cliente não tem tempo medido | Vigiar cliente | `isTracked` | — |
| Transparência | Medir sem avisar | `usagePolicy` exibida em Meu perfil > Privacidade (`PrivacyNotice.jsx`) | texto |
| IP mascarado na API | Expor IP inteiro na tela | `maskIp` em `/map` e `publicAlert` | IP parcial |
| Sanitização das fatias | Lixo/conteúdo na telemetria | `sanitizeSlices`, `sanitizeActions` | descarta |
| Limite de 20 envios/min | Spam de telemetria | `allow` | `skipped` |
| Alertas como sinal | Acusar pessoa | texto fixo em `/alerts` | nota na tela |

## Bugs e armadilhas conhecidos
| Sintoma | Causa | Correção / cuidado |
|---|---|---|
| Gravação de uso dava 500 sem `sessionId` | `String(undefined)` passava na regex | corrigido (§82): `sessionId` vira `''` se inválido |
| Estimativa baixa para quem faz 1 coisa a cada 40 min | cada intervalo é limitado a 5 min | limite conhecido (§82) |
| Nomes iguais no histórico das empresas ficam de fora | o `log` identifica só por **nome** | contados em `coverage.unmatchedLogs` |
| Cidade errada com VPN/rede móvel | geolocalização por IP | aviso fixo na tela do mapa |
| IP vindo de cabeçalho forjável | `clientIp` usa `x-real-ip`, depois o 1º `x-forwarded-for` | não há `trust proxy`; se a Railway não sobrescrever esses cabeçalhos, o cliente pode forjar o IP do próprio acesso (não verificado) |
| IP do usuário enviado a terceiro | `lookupGeo` chama `ipwho.is` com o IP | a política (`usagePolicy`) cita o serviço desde 2026-10-29 e o cache `ip_geo_cache` é apagado após 90 dias; contrato com o terceiro é jurídico (DPO) |
| Caminho com token no log de erros | `path` de `/client-error` é o `pathname` da tela; se a pessoa logada abrir `/quadro/<token>` o token pode ir ao log | cortado em 120 caracteres; não filtrado |

## Como testar
`scripts/usage-metrics.test.mjs` (fórmulas, sem banco), `scripts/ops-intel-http.test.mjs` (RBAC, isolamento de organização, sanitização, IP mascarado, política), `scripts/experience-http.test.mjs` (experiência e acesso só do master), `scripts/error-messages.test.mjs` (`describeError`). **Sem teste:** `accessLog.js` (geolocalização real), `projectAudit.js` direto (coberto indiretamente por `project-versions-http.test.mjs`), `clientError.js`/`sourcemaps.js`, retenção ao longo do tempo, dados reais de produção.

## Receitas — Inteligência e uso
1. **Medir uma ação nova:** adicionar o nome em `ACTIONS` (`usageLog.js`), chamar `trackAction('nome')` no front, mapear o rótulo em `ACTION` (`opsIntel.js`, `/users/:id`) e **atualizar `usagePolicy`** se mudar o que é coletado.
2. **Mudar retenção:** variáveis `USAGE_RETENTION_DAYS`/`ACCESS_RETENTION_DAYS` (Railway) e o texto da política (calculado de `RETENTION`).
3. **Nova regra de alerta:** `detectAlerts` em `shared/usageMetrics.js` + teste em `usage-metrics.test.mjs`; sempre texto "sinal, não acusação".
4. **Achar erro de tela do cliente:** `node scripts/railway-logs.mjs "client-error"` (ver Parte 7), procurar `message`/`where`; a pilha já vem em `src/arquivo.jsx:linha`.
5. **Um erro 500 que o usuário relatou com código:** `node scripts/railway-logs.mjs "erro ABC123"`.

---

# PARTE 7 — Infraestrutura, build e deploy

## Ordem dos middlewares e boot (`server/index.js`)
1. `express.json({limit:'45mb'})` só em `/api/templates`; depois `express.json({limit:'15mb'})` global. Express 5 deixa `req.body` indefinido sem corpo: um middleware o troca por `{}`.
2. `cookie-parser`.
3. Montagem dos roteadores, **nesta ordem** (o primeiro que casa vence): `/api` (`server/routes.js`, o grande), `/api/xflow`, `/api/google`, `/api/agenda`, `/api/macro`, `/api/inventory` (2), `/api/gaps`, `/api/task-links` (2), `/api/standard-plan`, `/api/meeting-inbox`, `/api/assistant`, `/api/knowledge`, `/api/pareceres`, `/api/knowledge-library`, `/api/crm`, `/api/renata`, `/api/widget`, `/api/daily`, `/api/templates`, `/api/connect`, `/api/company-share`, `/api/company-calendar`, `/api/public-company`, `/d` (dados públicos), `/api/push`, `/api/ops-intel`, `/api/experience`, `/api/project-history`.
4. `app.use('/api', …404 JSON "Rota não encontrada.")` e depois `apiErrorHandler`.
5. Filtro que responde 404 a qualquer caminho terminando em `.map` (decodifica o caminho antes).
6. `express.static(dist)`; arquivos em `/assets/` recebem `Cache-Control: public, max-age=31536000, immutable` (nome com hash); `index.html` não.
7. Fallback do SPA `GET /{*splat}`: `/assets/…` inexistente responde 404 texto (não cai no `index.html`); `/a/…` e `/acompanhamento/…` ganham `X-Robots-Tag: noindex, nofollow`; o resto devolve `dist/index.html`.
8. `start()`: `initDb()` -> `seedIfEmpty()` -> `migrateToPricetaxOrg()` -> `migrateAccessModel()` -> `migrateXflowBoardOrder()` -> `migrateInsightsToKnowledgeFacts()` -> `markV2Provisional()` (não fatal) -> `failOrphanedDossiers()` (não fatal) -> frases de inspiração (não fatal) -> `setServerPort` -> `app.listen(PORT || 3001)`. Falha em qualquer passo fatal = `process.exit(1)`.
9. Depois de ouvir: `countMaps()` (log), log do estado do push, `startCrmScheduler()` (10 min), `startTodoScheduler()` (30 min), `startRetentionJob()` (telemetria), `startVersionRetentionJob()` (versões). **Tudo roda dentro do único processo Node**; não há fila externa. Um deploy no meio mata o que estava em andamento (ver `docs/gerado/TAREFAS_AGENDADAS.md`).

Armadilha de ordem: rota nova montada **depois** de `app.use('/api', …404)` nunca é alcançada; rota fora de `/api` precisa ser montada antes do `express.static`/fallback (como `/d`). O proxy do Vite em dev só encaminha `/api` e `^/d/` (`vite.config.js`): outro prefixo fora de `/api` não funciona em dev sem acrescentar ali.

## Deploy (Railway) — como é de verdade
- O diretório de trabalho local **não é repositório git**. Deploy: clone separado (hoje `/private/tmp/deploy-clone`; refazer com `git clone` se sumir) -> `git fetch` e checar divergência -> `rsync -a --delete` do diretório de trabalho (excluindo `.git`, `node_modules`, `dist`, `.sourcemaps`, `.env`, `.claude`) -> `npm run build` limpo -> commit -> `git push origin main`. Repositório `RAFAELSOUZA280292/Cronograma` (público), branch `main`. **Nunca `git add -A`** (uma pasta `exports/` de cliente já subiu uma vez): adicionar por caminho e conferir `git status`.
- Política do Rafael (reafirmada): commit + push sem pedir confirmação a cada vez, **verificando em produção depois** (o hash do bundle em `https://painel.pricetax.com.br/` muda; uma rota nova responde 401/200 em JSON, não `index.html`). **Não existe `/api/health`.**
- A Railway detecta sozinha pelo `package.json` (sem `railway.json`, `Procfile` ou `nixpacks.toml`): `npm install` -> `npm run build` -> `npm start` (serve `dist/` e a API no mesmo processo; porta em `$PORT`). Node >= 22.12.
- `npm run build` = `vite build && node scripts/stash-sourcemaps.mjs`.
- Dev local: `npm run dev` (vite em 5173 + `node --watch server/index.js`; proxy `/api` para 3001). **Exporte `PORT=3001`** se houver outra `PORT` no ambiente, senão o Express colide com o Vite (memória do projeto).
- `dist/` e `.sourcemaps/` são gerados e nunca vão para o git (`.gitignore`).

## Como ler os logs de produção
`node scripts/railway-logs.mjs [filtro-regex] [--deploy N] [--limit 2000]`: lê pela API GraphQL da Railway (`backboard.railway.com`) o deploy mais recente (ou o N-ésimo) do projeto `Painel`, serviço `Cronograma`, ambiente `production`, imprime `hora severidade mensagem`. **Só leitura.** Usa a variável `RAILWAY_API_TOKEN` do `.env` local (token de **workspace**, amplo; nunca colar em chat, commit ou log). A CLI `railway` não aceita esse tipo de token.
- O servidor **não registra requisições**: só inicialização, erros (`[erro REF]`), `[client-error]`, retenção, push e avisos de rotinas. Serve para achar exceções, não para saber quem gravou o quê (isso é o Log da empresa, `projects.data.log`, e `project_versions`).
- Filtros úteis: `"client-error"`, `"erro [0-9A-F]{6}"`, `"Falha"`, `"sourcemaps"`, `"Retenção"`.

## PWA e service worker
- `vite-plugin-pwa` com `strategies:'injectManifest'` e o arquivo próprio `src/sw.js`; registro em `src/main.jsx` só em produção (`import.meta.env.PROD`), falha de registro nunca atrapalha.
- **Sem precache** (cada deploy gera nomes novos com hash). **Nunca guarda respostas de `/api`** (o dado sempre vem do servidor). Navegação: rede primeiro (4 s), senão a última casca guardada ("Sem conexão" se não houver). `/assets/*` (hash = imutável): cache primeiro, 150 entradas, 60 dias.
- Push: o `sw.js` mostra a notificação (`title`, `body`, `url`, `tag`) e o toque foca/abre o módulo certo. Servidor: `server/push.js` (VAPID; só aceita endpoints https de FCM, Mozilla, Apple e Windows, contra SSRF).
- Manifesto: nome "PRICETAX — Cronograma de Reforma Tributária", atalhos `/gestao-atividades`, `/agenda`, `/empresas`.

## Variáveis de ambiente por finalidade (só NOMES)
Lista gerada exata em `docs/gerado/VARIAVEIS_DE_AMBIENTE.md`. Aqui, agrupadas por para que servem e o que falha se faltar. Os valores ficam no Railway e no `.env` local (nunca no git).

| Finalidade | Variável | Para que serve | Se faltar |
|---|---|---|---|
| Banco | `DATABASE_URL` | Conexão Postgres (SSL desligado só se contiver `localhost`) | O servidor não sobe (`initDb` falha, `process.exit(1)`) |
| Sessão | `JWT_SECRET` | Assina o cookie `cronograma_token` (7 dias) e deriva a chave que cifra o token do widget | O servidor **sobe**, mas login e qualquer rota autenticada falham (`requireSecret` lança na hora do uso). O comentário de `widget.js` ("sem JWT_SECRET o servidor nem sobe") está errado |
| Admin inicial | `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Cria o administrador no 1º boot com o banco vazio (e marca super admin) | Nenhum admin é criado (só aviso no log) |
| Rede | `PORT` | Porta do Express (padrão 3001; a Railway define) | Usa 3001 |
| Ambiente | `NODE_ENV` | `=== 'production'` liga `cookie.secure` (e muda o tratador padrão de erro do Express) | Cookie sem `secure` |
| IA | `ANTHROPIC_API_KEY` | RENATA, estudo de pareceres, dossiê, transcrições, Meu dia | Funções de IA respondem "não configurado" (503); o resto do app segue |
| IA | `RENATA_MODEL` | Modelo da RENATA (padrão `claude-sonnet-5`) | Usa o padrão |
| IA (teste) | `RENATA_SCRIPTED_MODEL` | Modelo falso roteirizado para testes | Não se aplica |
| Busca semântica | `VOYAGE_API_KEY` | Embeddings (`voyage-3`); sem ela a busca é só lexical | Busca semântica desligada, sem erro |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth do Google Calendar (agenda, widget, reservas, espelho do CRM) | `googleConfigured()` falso: telas dizem "integração não configurada" |
| Links | `APP_BASE_URL` | Endereço público para links gerados no servidor (retorno do OAuth, link de TASK, `/empresas` no evento) | Links sem domínio |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificações no aparelho; as duas chaves ou tudo fica desligado | Sem push; o sino segue. Trocar as chaves invalida todas as inscrições |
| Push (teste) | `PUSH_EXTRA_HOSTS` | Hosts extras aceitos como endpoint (só teste local) | — |
| Retenção | `USAGE_RETENTION_DAYS`, `ACCESS_RETENTION_DAYS`, `VERSIONS_KEEP_DAYS`, `VERSIONS_FULL_DAYS`, `VERSIONS_DELETED_DAYS` | Prazos de limpeza | Padrões: 395, 730, 730, 90, 365 dias |
| Vínculo tarefa->atividade | `TASK_LINK_MODE`, `TASK_LINK_AUTO` | `off`/`sem-ia` desliga sugestão; `auto=off` só sugere | Modo normal |
| Teste/eval | `GIT_COMMIT` | Rótulo do registro de eval da RENATA | — |
| Só local (`.env`) | `RAILWAY_API_TOKEN` | `scripts/railway-logs.mjs` (o app não lê) | Script avisa e sai |
| Só local (`.env`) | `PRICETAX_URL`, `PRICETAX_CRM_TOKEN` (e as chaves de transcrição/reunião que o `.env` também traz) | Chave do Claude Code para operar o CRM e enviar transcrições (regra do `CLAUDE.md`) | Sem a chave, sem escrita no CRM por API |
| Só scripts de teste | `BASE`, `SBX_PASS`, `SHOTS`, `THROTTLE`, `N`, `FAIL`, `EVENT_DIR`, `HOME` | Parâmetros de scripts em `scripts/` | — |
`PROD` aparece na lista gerada por engano: é `import.meta.env.PROD` do Vite, não variável do servidor.

## Integrações externas
| Serviço | Para que serve | Onde | Se falhar/faltar |
|---|---|---|---|
| Anthropic (Claude) | Toda a IA | `@anthropic-ai/sdk`; `server/assistant*.js`, `meetingInbox.js`, `pareceres.js`… | Mensagem em português ("IA não configurada" ou de crédito); resto do app segue |
| Voyage AI | Embeddings da busca da RENATA | `server/embeddings.js` (`https://api.voyageai.com/v1/embeddings`, `voyage-3`) | Só busca lexical |
| Google OAuth + Calendar API | Agenda, widget (próxima reunião), "Reservar na agenda", espelho do CRM | `server/google*.js`, `googleCalendar.js`; escopo `calendar.events` | "Reconecte o Google" (`friendlyGoogleError`); widget segue sem agenda |
| BrasilAPI (primária) e ReceitaWS (reserva) | Consulta de CNPJ | `server/cnpjLookup.js`; cache `cnpj_cache` por 60 dias; 15 s | CNPJ sem preenchimento automático |
| `ipwho.is` | Cidade e coordenadas do IP dos acessos | `server/accessLog.js` | Acesso sem cidade/mapa (nada é inventado) |
| Web Push (FCM, Mozilla, Apple, Windows) | Aviso no celular/computador | `server/push.js`, `src/sw.js` | Sem push |
| API GraphQL da Railway | Ler logs (só no seu terminal) | `scripts/railway-logs.mjs` | — |
| Scriptable (app do iPhone) | Hospeda o script do widget | `src/widget/scriptableScript.js` | — |
| Liturgia Diária, Midvash, AstroWay | Conteúdo do "Meu dia" | `server/dailyContent.js` (AstroWay conferido; os dois primeiros conforme `PROJECT_CONTEXT.md` §6, não reconferi no código) | O bloco do dia fica sem aquele conteúdo |
| Sites quaisquer (prévia de link) | Título/imagem dos Modelos | `server/linkPreview.js` | Prévia `ok:false` |
| OpenStreetMap (tiles do mapa) | Mapa da Central | `src/opsintel/AccessMap.jsx` (Leaflet; conforme §82) | Mapa sem fundo |

## Cabeçalhos de segurança e sessão
- Cookie: `httpOnly`, `secure` só com `NODE_ENV=production`, `sameSite=lax`, 7 dias.
- Cabeçalhos de segurança globais (`server/index.js`, desde 2026-10-29): `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` e, em produção, `Strict-Transport-Security` (180 dias). **Sem CSP** de propósito (exige teste de tela inteira no navegador).

## Receitas — infraestrutura e deploy
1. **Publicar uma mudança:** seguir o bloco "Deploy" (fetch, rsync, build, commit por caminho, push) e depois conferir em produção: hash do bundle novo e a rota nova em JSON.
2. **Rota nova responde HTML 200:** ela foi montada depois do fallback ou fora de `/api` sem montagem própria; montar antes de `app.use('/api', …404)` e conferir `docs/gerado/ROTAS.md`.
3. **Variável nova:** ler com `process.env.NOME` em um único lugar, documentar aqui e em `PROJECT_CONTEXT.md` §4 e rodar `npm run docs:gerar`; pôr no Railway antes do push.
4. **Site fora do ar após deploy:** `node scripts/railway-logs.mjs "Falha ao iniciar|erro" --limit 500`; causas comuns: `DATABASE_URL`, migração do `initDb` falhando, dependência nova não instalada.
5. **"Aba antiga" quebrada depois de deploy:** esperado: `/assets/…` antigo responde 404 (de propósito) e o `lazyRetry` avisa a pessoa para recarregar.
6. **Subir o limite de corpo para uma rota nova:** colocar `app.use('/api/<rota>', express.json({limit}))` **antes** do `express.json` global em `server/index.js`.
7. **Ver se os sourcemaps estão no lugar:** linha de log "sourcemaps (só para o log de erros): N arquivo(s)" no boot; N=0 = pilha sem tradução.

## Não verificado / dúvidas
- **Cabeçalhos da Railway:** se o proxy sobrescreve ou apenas anexa `X-Forwarded-For`/`X-Real-IP` (define se o limite de IP e o IP do acesso podem ser forjados) e se HSTS/`X-Frame-Options` são aplicados na borda.
- **`NODE_ENV` em produção** (afeta `cookie.secure` e o tratador de erro padrão do Express fora de `/api`, p.ex. em `/d/…`).
- **Limite de corpo do proxy** da Railway para upload de 40 MB em `/api/templates` (o código aceita; a borda não foi testada).
- Uso real do `PRICETAX_TRANSCRIPTS_TOKEN`/`PRICETAX_MEETINGS_TOKEN` do `.env` (só vi os nomes; não sei qual script os lê).
- Não rodei nenhum teste de HTTP nem toquei no banco: tudo acima vem de leitura de código, de `docs/gerado/` e de uma única execução pura de `isPrivateAddress` (sem rede).
- Conteúdo de `src/opsintel/OpsIntelScreen.jsx` lido só por amostra (abas e filtros); `src/screens/PublicCompanyScreen.jsx` e `CompanyCalendar.jsx` não foram abertos por dentro.
- `server/experience.js` (nota de satisfação) só foi consultada no cabeçalho; ele pertence à medição de experiência (§97).
