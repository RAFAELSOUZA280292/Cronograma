# Módulo EMPRESAS (cronogramas dos clientes)

> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza. Fonte da verdade: o código; este texto é o mapa.

## Em uma frase

Cada empresa-cliente é **uma linha da tabela `projects`** cujo cronograma inteiro (empresa, equipe, fases, atividades, subatividades, reuniões, tarefas, log) mora **dentro de uma única coluna JSON (`projects.data`)**; a tela grava o documento inteiro de uma vez e o servidor só confere quem pode, guarda versões por gatilho do banco e oferece ferramentas em volta (padrão versionado, vínculo tarefa→atividade, levantamento, lacunas, agenda).

## Para quem é / quando ler (gatilhos)

Pedidos típicos do Rafael que mandam para este documento:
- "Adicionar um campo na atividade / subatividade / empresa" (o JSON é livre: ver seção **Dados**).
- "Mudar o que a Tabela / Fases / Quadro / Gantt / Mapa / Resumo mostra."
- "A empresa nova tem que nascer com outro cronograma" (cronograma padrão versionado).
- "Voltar o cronograma para como estava ontem" / "recuperei empresa apagada" (versionamento).
- "A RENATA/IA vinculou a tarefa na atividade errada" (vínculo tarefa→atividade).
- "Quero ver todas as atividades de todas as empresas por responsável/área" (Levantamento, Visão Geral).
- "Falta atividade que as outras empresas têm" (Lacunas).
- "Reservar reunião na agenda do Google" (Reservar na agenda) e "regras de reunião".
- "Por que o texto que digitei sumiu / dois usuários editando a mesma empresa" (concorrência).
- "Quem pode ver/editar/apagar a empresa?" (permissões).

**Palavras-chave para busca (robô):** `projects.data`, `blankProject`, `canAccessProject`, `effectiveOrgId`, `mutateProject`, `persistProjectDebounced`, `sendProject`, `reloadProjects`, `/api/projects`, `project_versions`, `project_versions_capture`, `scheduleOf`, `restoreSchedule`, `standard_plan_versions`, `instantiateTemplate`, `instantiateStandard`, `auditProject`, `planForProject`, `applyPlanToData`, `activityLink`, `activityId`, `task_activity_links`, `suggestActivityLinks`, `meetingItems`, `duplicateDays`, `assignDays`, `company_calendar_events`, `fitPeriods`, `computeRipple`, `syncLinkedStatus`, `involvedCompanyIds`, `ownerIds`, `groupRootId`, `CompanyWorkspace`, `TableView`, `PhasesView`, `KanbanView`, `TimelineView`, `MapView`, `CompanyTriage`.

Este documento **não** cobre (ver outros): CRM (`/api/crm`), RENATA (chat/ferramentas), API de conectividade `/api/connect` (só citada), quadro pessoal/Gestão de Atividades, link público de acompanhamento (`server/companyShare.js`, `/api/public-company`, `/d/…`), Pareceres.

## Mapa rápido

### Servidor

| Arquivo | Função/rota (conferido) | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/db.js` | `blankProject()` (l.80), `initDb`, tabela `projects` (l.174), semente do projeto demo (l.1577) | Modelo de empresa nova "de sempre"; cria a tabela; cria 1 empresa demo se a tabela estiver vazia | `POST /api/projects` quando a organização não tem padrão versionado |
| `server/routes.js` | `canAccessProject` (l.33), `effectiveOrgId` (l.115) | Regra única de "quem enxerga qual empresa" e de qual organização (base) vale | Quase toda rota de empresa |
| `server/routes.js` | `GET/POST/PATCH/DELETE /projects…` (l.415–577) | CRUD do documento da empresa | Tela de Empresas (autosave) |
| `server/routes.js` | `POST /projects/:id/meetings` (l.582), `POST /projects/:id/plan` (l.634) | Registrar reunião inteira por API; ajustar cronograma por operações (só administrador) | IA externa, scripts, RENATA |
| `server/routes.js` | `notifyActivityChanges` (l.53) | Compara antes/depois no PATCH e avisa: menção em comentário, responsável novo, participante novo | Todo `PATCH /projects/:id` |
| `server/todoNotifications.js` | `diffTodoEvents`, `notifyTodoChanges`, `runTodoReminders`, `startTodoScheduler` | Avisos de tarefa de reunião: atribuída, comentada, vencida (a cada 30 min, após 7h de Brasília) | `PATCH` e `POST …/meetings`; timer do servidor |
| `server/projectAudit.js` | `installProjectAudit`, `setActor` | Grava no Postgres "quem" está gravando `projects` antes de cada UPDATE/DELETE | Pool do `pg` (automático) |
| `server/projectVersionsSchema.js` | `ensureProjectVersionsSchema` | Cria `project_versions`, funções `pv_*` e os gatilhos `project_versions_upd/del` | `initDb` na subida |
| `server/projectVersions.js` | rotas `/api/project-history/…`, `pruneProjectVersions`, `startVersionRetentionJob` | Listar, comparar, criar ponto manual, restaurar (total/parcial), recriar empresa excluída; retenção diária | Botão Versões / Empresas excluídas |
| `shared/scheduleVersion.js` | `scheduleOf`, `diffSchedules`, `restoreSchedule`, `validateSchedule`, `statsOf` | Funções puras de comparar e restaurar activities/phases/team | `projectVersions.js` e teste |
| `server/standardTemplate.js` | `buildV1…buildV5`, `templateFromProject`, `instantiateTemplate`, `diffTemplates` | Funções puras do cronograma padrão: montar versões, sanear o que a tela manda, gerar cronograma de empresa nova | `standardTemplateStore.js` |
| `server/standardTemplateStore.js` | `getDraft`, `saveDraft`, `saveVersion`, `restoreVersion`, `setArchived`, `loadProposal`, `instantiateStandard`, `previewInstantiate` | Banco do padrão (por organização, com trava `pg_advisory_xact_lock`) | `standardPlanApi.js`, `POST /projects` |
| `server/standardPlanApi.js` | rotas `/api/standard-plan/…` | Rascunho/versões do padrão; prévia e aplicação do "padrão aprimorado" nas empresas existentes; auditoria | Tela do padrão, aba Padrão, botão Auditoria |
| `server/standardPlan.js` | `MODEL`, `NEW_ACTIVITIES`, `planForProject`, `applyPlanToData`, `improveTemplate` | "Padrão aprimorado" (descrições + subatividades que faltam + 3 atividades novas) sem mexer em datas/status | `/standard-plan/preview` e `/apply`; `db.js` (modelo antigo) |
| `server/standardAudit.js` | `auditProject` (pura, só leitura) | Confronta a empresa com o padrão: ausentes, datas, descrições, alertas de coerência | `GET /standard-plan/audit/:id` |
| `server/taskLinks.js` | `POST /task-links`, `/suggest`, `/learning`, `/forget`, `/eval`; `ledgerRow`, `recordDecision` | Livro-razão do vínculo tarefa→atividade; sugestão em lote; painel de aprendizado | Tela de Reuniões/Atividades, Central de Conhecimento |
| `server/taskLinkSuggest.js` | `suggestActivityLinks`, `applySuggestions`, `ruleSuggest`, `MIN_CONFIDENCE`, `HIGH_CONFIDENCE` | Pipeline aprendido → IA → regra | `taskLinks.js`, `meetingInbox.js` |
| `server/taskLinkLearn.js` | `learnedSuggest`, `loadLedgerExamples`, `activityKey`, `sameCompanyExamples` | Aprendizado por vizinhança sobre o livro-razão | `taskLinkSuggest.js` |
| `server/taskLinkBackfill.js` | `/backfill/*`, `/pending`, `/decide`, `/confirm-high` | Varredura da base antiga (só administrador) e revisão central | Central de Conhecimento |
| `server/activityDictionary.js` | `dictFor`, `dictPromptLine`, `keywordScore` | Dicionário de 40 tipos de atividade (só servidor) | Prompt da IA e regra |
| `server/inventory.js` / `inventoryEdit.js` | `/api/inventory/*`, `buildItems`, `applyRename`, `applyArea` | Levantamento de atividades+tarefas de todas as empresas; padronizar responsável; definir área; sugerir área por IA | Visão Geral › Levantamento |
| `server/gaps.js` | `/api/gaps/*`, `analyze`, `gapsForCompany` | Atividades-padrão que faltam numa empresa; cria as escolhidas | Visão Geral › Lacunas |
| `server/macro.js` | `GET /api/macro` | Feed por data de todas as empresas | Visão Geral › Por data |
| `server/areas.js` | `AREAS`, `canonicalArea` | Lista fechada de 11 áreas | Levantamento, Lacunas, IA de área |
| `server/companyCalendar.js` / `companyCalendarPlan.js` | `createCalendarRouter`, `candidateMeetings`, `buildEventBody`, `fingerprint` | Reservar reunião do cronograma no Google Calendar | Botão "Reservar na agenda" |
| `shared/calendarDays.js` | `meetingItems`, `duplicateDays`, `meetingConflicts`, `assignDays` | Regra "1 reunião por dia por empresa" (puras) | Servidor e tela |
| `shared/pauta.js`, `shared/period.js`, `shared/linkSync.js` | pauta, `fitPeriods`, `syncLinkedStatus` | Pauta da reunião, atividade estica sozinha, sincronia de conclusão tarefa↔atividade | `mutateProject` (tela) e `applyPlanOps` |

### Front-end

| Arquivo | Função/componente | O que faz |
|---|---|---|
| `src/App.jsx` | `normalizeProject` (l.318), `reloadProjects` (l.1077), poll de versões (l.1113–1140), `sendProject` (l.1635), `persistProjectDebounced` (l.1643), `flushProjectSave` (l.1664), `mutateProject` (l.1680) | Estado global `projects`, autosave de 500 ms, poll de 6 s |
| `src/App.jsx` | constantes `STATUS_META`, `COMPANY_STATUS_META`, `CLIENT_TYPE_META` (l.120–136); `COMPANY_VIEW_IDS` (l.452) | Vocabulário de status e as 9 abas da empresa |
| `src/screens/CompanyWorkspace.jsx` | `CompanyWorkspace` | Cabeçalho, botões (Versões, Lixeira, Log, Auditoria…), abas, modais |
| `src/screens/CompanyViews.jsx` | `ResumoView` (l.884), `TableView` (l.1241), `PhasesView` (l.1752), `KanbanView` (l.1885), `TimelineView` (l.1974), `ActivityDetailModal` (l.285), `SubactivityRow` (l.210) | Abas Resumo/Tabela/Fases/Quadro/Gantt e o detalhe da atividade |
| `src/screens/MapView.jsx` | `MapView` | Aba Mapa (mapa mental só leitura) |
| `src/screens/CompanyTriage.jsx` | `CompanyTriage` | Aba Triagem: Reunião×Trabalho e datas (calendário/lista) |
| `src/screens/CompanyCalendar.jsx` | `CompanyCalendarModal` | Janela "Reservar na agenda" |
| `src/screens/AdminScreens.jsx` | `CompanySelectorScreen`, `EditCompanyModal` | Lista de empresas, pausar/clonar/editar/excluir |
| `src/app/companyActivityActions.js` | `createCompanyActivityActions` | `addActivity`, `updateActivity`, `deleteActivity` (lógica), `updateSub`, comentários, anexos… |
| `src/app/companyAdminActions.js` | `createCompanyAdminActions` | `createCompany`, `cloneCompany`, `deleteCompany`, `updateCompanyFields` (pausa em cascata) |
| `src/app/meetingActions.js` | `createMeetingActions` | Reuniões e tarefas de reunião; `requestTaskSuggestions`, `linkTaskToActivity`, `resetTaskLinks` |
| `src/app/teamPhaseActions.js` | `createTeamPhaseActions` | Equipe, áreas e fases |
| `src/app/standardPlanActions.js` | `createStandardPlanActions` | Abrir/editar o padrão como "empresa" `std-plan` |
| `src/meetings/*` | `Meetings.jsx`, `MeetingDetail.jsx`, `TodoBoard.jsx`, `ActivityLink.jsx`, `LinkedTasks.jsx` | Abas Reuniões e Tarefas e o seletor de atividade |
| `src/macro/*` | `MacroOverview.jsx`, `Inventory.jsx`, `Gaps.jsx`, `StandardPlan.jsx`, `StandardPlanBar.jsx`, `StandardAudit.jsx` | Visão Geral (4 abas) e barra do padrão |
| `src/versions/VersionHistory.jsx` | `VersionHistoryModal`, `DeletedCompaniesModal` | Versões e Empresas excluídas |
| `src/companies/CompanyOwners.jsx` | `ownerIdsOf`, `OwnersField` | Responsáveis da empresa |

## Como funciona (passo a passo)

### 1. Abrir a Empresas e carregar
1. Login → escolha "Empresas" (rota do front `/empresas`; Visão Geral é `/visao-geral`, `src/lib/routes.js`).
2. `reloadProjects()` chama `GET /api/projects` (com `?asOrg=` só para super admin). O servidor lê **todas** as linhas da organização, filtra com `canAccessProject` e devolve o JSON completo de cada uma (sem paginação).
3. `normalizeProject` converte `team` de lista de textos em lista de objetos `{id,name,area,userId,username,role}` (os ids são gerados a cada carga se o banco ainda guarda textos).
4. Gatilho contínuo: um poll a cada **6 s** em `GET /api/projects/versions` (só `id` + `updated_at`). Se algum carimbo mudou, `reloadProjects({background:true})` recarrega tudo, **mas não sobrescreve** empresa com edição local pendente (`saveTimers`) ou em voo (`inFlightProjectSaves`).

### 2. Editar (autosave do documento inteiro)
1. Clique/digitação chama uma ação (`updateActivity`, `addSub`…) → `mutateProject(pid, updater, logMsg, activityId)`.
2. `mutateProject` aplica o `updater`, acrescenta uma linha no `log` (máx. 300 itens), roda `fitPeriods` (atividade estica para cobrir subatividade) e `syncLinkedStatus` (conclusão tarefa↔atividade), e agenda o envio.
3. `persistProjectDebounced` espera **500 ms** sem novas edições e chama `sendProject` → `PATCH /api/projects/:id` com `{ project: <documento inteiro> }`. Antes de fechar um modal, `flushProjectSave` envia na hora.
4. Servidor (`routes.js` l.552): carrega a linha, confere `canAccessProject`, confere `next.id === id`, faz `UPDATE projects SET data=…, updated_at=now()`. **Não valida o conteúdo.**
5. O gatilho `project_versions_upd` (banco) guarda o estado anterior se `activities/phases/team` mudaram (ver **Versionamento**).
6. Depois do UPDATE: `notifyActivityChanges` e `notifyTodoChanges` criam notificações; a resposta sai; em seguida `syncProjectMemoryFromDiff` reindexa a memória da RENATA (fire-and-forget).
7. Falha de rede: `src/lib/saveRetry.js` (§118) e aviso "Não foi possível salvar a última alteração".

### 3. Criar empresa
1. `CreateCompanyModal` (`src/App.jsx` ~l.2870) → `createCompany` (`companyAdminActions.js`) → `POST /api/projects` com `{company, kickoffDate}` (clonar manda também `activities/phases/team/log`).
2. Servidor: parte de `blankProject()`, mescla `company` (CNPJ de 14 dígitos vira formatado), e **se o corpo não traz `activities`** chama `instantiateStandard(org, kickoff)`: usa a **versão mais recente** do padrão da organização (datas = kickoff + dias de cada item). Falha ou organização sem padrão → cai no `blankProject` (cadastro nunca é bloqueado). Grava `project.standardVersion` e uma linha no log "Cronograma criado pelo padrão N.0…".
3. `INSERT INTO projects`; se o usuário tem acesso por lista de CNPJ (`allowed_cnpjs`), o CNPJ novo é acrescentado à lista dele.
4. A tela põe o responsável padrão = quem cadastrou (`withDefaultOwner`, só equipe PRICETAX e só na própria organização).
5. Grupo Empresarial: `createCompanyGroup` chama `createCompany` em loop (master primeiro, filhas com `groupId`).

### 4. Pausar, excluir, restaurar
- **Pausar** (`updateCompanyFields`, só front): `company.status='pausado'` e cada atividade ativa vira `pausado` guardando `statusBeforePause`; retomar devolve. A empresa some da lista principal.
- **Excluir atividade/subatividade/reunião/tarefa:** exclusão lógica no JSON (`deleted:true, deletedAt, deletedBy`); a **Lixeira** (botão no cabeçalho, só PRICETAX/master) restaura atividades e subatividades.
- **Excluir empresa:** `DELETE /api/projects/:id` é **exclusão física** (`DELETE FROM projects`). O gatilho `project_versions_del` antes guarda o documento inteiro como versão `pre_delete`; só Master recria (botão "Empresas excluídas"). As tabelas filhas com FK em `projects` (14 com `ON DELETE CASCADE`, 2 com `SET NULL`, conforme `docs/gerado/BANCO.md`) apagam ou perdem o vínculo (ver **Dados**). O texto de `docs/VERSIONAMENTO_CRONOGRAMA.md` diz 13; o banco gerado mostra 14.

### 5. Versionar e restaurar
1. Toda gravação em `projects` passa por `installProjectAudit` (grava `app.actor_id/name/origin` na sessão do Postgres).
2. Gatilho `project_versions_capture` (BEFORE UPDATE OF data): se `activities/phases/team` mudaram, insere em `project_versions` o estado **antes** da alteração (`kind='auto'`). Mesma pessoa+origem em **5 min** = 1 ponto só (atualiza `touched`). Falha do gatilho vira WARNING e a gravação segue.
3. `GET /api/project-history/:id/versions|diff` listam/comparam; `POST …/versions` cria ponto manual (nome obrigatório); `POST …/versions/:vid/restore` (Master): `dryRun:true` simula; sem `confirm:true` não grava; em transação com `FOR UPDATE`, grava antes um `pre_restore` (backup) e depois o documento restaurado com linha no log. Restauração parcial: `activityIds`.
4. Restaurar **não apaga**: o que não existia na versão vai para a lixeira; comentários, anexos e links de hoje são mantidos; equipe = união; bloqueia (409) se sobraria id repetido.
5. Retenção diária: tudo 730 dias; automáticas com mais de 90 dias = 1 por semana; empresa excluída 365 dias (`VERSIONS_KEEP_DAYS`, `VERSIONS_FULL_DAYS`, `VERSIONS_DELETED_DAYS`).

### 6. Cronograma padrão versionado
1. Botão "Ver cronograma padrão" (`CompanySelectorScreen`, só master/pricetax) → `openStandardPlan` busca `GET /api/standard-plan/template/draft` e injeta um "projeto" de id fixo `std-plan` no estado.
2. Edição normal da tela; `sendProject` desvia o autosave de `std-plan` para `PATCH /api/standard-plan/template/draft` (rascunho único por organização, último a gravar vence).
3. "Salvar nova versão" → `POST …/template/versions` → vira `N+1` (rótulo `N.0`), imutável, rascunho apagado; sem alteração = 400. Carregar versão antiga ou proposta (v3/v4/v5) só **substitui o rascunho**.
4. Empresa nova segue a **versão de maior número**. Empresas existentes **nunca mudam** por isso.
5. Para empresas existentes há outro mecanismo: aba **Padrão** da Visão Geral → `GET /standard-plan/preview` e `POST /standard-plan/apply` (só administrador, até 100 empresas): só acrescenta descrição antiga→nova, subatividades que faltam e 3 atividades novas sem data; `applyPlanToData` aborta se um campo protegido mudaria.
6. **Auditoria** (botão na empresa) → `GET /standard-plan/audit/:id` → `auditProject`: só lê.

### 7. Vínculo tarefa de reunião → atividade
1. Reunião registrada (transcrição → `meetingInbox.js`, ou à mão, ou `POST /projects/:id/meetings`). Cada tarefa fica em `meetings[].actionItems[]`.
2. Sugestão (`suggestActivityLinks`): aprendido forte (≥0,8) → IA → aprendido fraco → regra (só se a IA não rodou). A partir de **0,5** vira vínculo `auto` ("Automática, a validar"); abaixo disso, `suggested`.
3. A pessoa valida/troca no seletor (`ActivityLinkSelect`, só equipe): o campo vai no documento (autosave) e a **decisão humana** é registrada em `task_activity_links` por `POST /api/task-links` (o servidor deriva `confirmou/corrigiu/escolheu/nenhuma` relendo o projeto).
4. Sincronia de conclusão (`shared/linkSync.js`, só no front): vínculo **validado** conclui junto; `auto` nunca fecha nada.

### 8. Reservar na agenda
1. Botão "Reservar na agenda" → `GET /api/company-calendar/:projectId` lista reuniões (atividade ou subatividade com `kind:'reuniao'`, com data, não concluída, de hoje em diante) e o estado de cada reserva.
2. `POST …/apply` com `confirm:true`, e-mails, duração, itens (dia/hora) e `cancel`. Servidor recusa dia fora do período, dia passado e **duas reuniões no mesmo dia** (400, antes de chamar o Google); cria/atualiza/cancela no Google; mapa em `company_calendar_events` (fora do JSON).

## Rotas desta área

Lista completa e gerada: `docs/gerado/ROTAS.md` (grupos `/api`, `/api/project-history`, `/api/standard-plan`, `/api/task-links`, `/api/inventory`, `/api/gaps`, `/api/macro`, `/api/company-calendar`). Resumo com a permissão **real** conferida:

| Método | Caminho | Quem pode (onde é garantido) | Entrada principal | Saída | Erros comuns |
|---|---|---|---|---|---|
| GET | `/api/projects` | Qualquer logado; filtra por `canAccessProject` (`routes.js`) | `?asOrg` (super admin) | `{projects:[JSON inteiro]}` | 401 sessão |
| GET | `/api/projects/versions` | Idem | — | `{versions:[{id,updatedAt}]}` | — |
| GET | `/api/projects/lite` | Idem | — | `{projects:[{id,name}]}` | — |
| POST | `/api/projects` | `requireMasterOrPricetax` | `company{…}`, `kickoffDate`, opcional `activities/phases/team/log` | 201 `{project, standardSummary}` | 403 "Apenas Master ou PRICETAX…" |
| DELETE | `/api/projects/:id` | `requireMasterOrPricetax` + `canAccessProject` | — | `{ok:true}` | 404, 403 |
| GET | `/api/projects/:id/team-candidates` | Qualquer logado com acesso à empresa (inclui cliente) | — | usuários master/pricetax da org + clientes do CNPJ | 404, 403 |
| PATCH | `/api/projects/:id` | Qualquer logado com acesso (**inclusive cliente**; sem checagem de papel nem de campo) | `{project}` com `project.id == :id`; corpo até 15 MB | `{project}` | 400 "Payload de projeto inválido.", 403, 404, 413 |
| POST | `/api/projects/:id/meetings` | `requireMasterOrPricetax` + acesso | `title`≤200, `date` AAAA-MM-DD, `time`, `participants`≤40, `actionItems`≤60, `transcript`≤400.000, `force` | 201 `{meeting}` | 400 título/data, **409** mesma data+título (salvo `force`) |
| POST | `/api/projects/:id/plan` | `requireMaster` + acesso | `ops` 1–100, `dryRun` (padrão **true**), `note`≤300 | resultados/`undo` | 400 "Nada foi gravado…" |
| GET | `/api/project-history/:id/versions` | Master, PRICETAX ou super admin (`canView`) + acesso | `limit`≤100, `before`, `kind` | versões + `current` | 403, 404 |
| GET | `/api/project-history/:id/diff` | Idem | `from`,`to` (`id` ou `current`) | diff campo a campo | 404 |
| POST | `/api/project-history/:id/versions` | Idem (`canView`) | `label` ≤120 obrigatório | 201 versão | 400 |
| POST | `/api/project-history/:id/versions/:vid/restore` | **Só Master/super admin** (`canRestore`) | `dryRun` ou `confirm:true`; `activityIds`≤200; `note`≤200 | relatório, `backupVersionId` | 400 sem confirmar, 409 vínculo ameaçado |
| GET/POST | `/api/project-history/deleted/list`, `/deleted/:vid/restore` | **Só Master** | `confirm:true` | recria empresa mesmo id | 409 já existe |
| GET | `/api/standard-plan/template/draft`, `/versions`, `/proposals`, `/draft/diff`, `/instantiate-preview` | `requireMasterOrPricetax` (grupo inteiro) | `?kickoff=` | JSON | 400 sem organização |
| PATCH | `/api/standard-plan/template/draft` | Master ou PRICETAX | `project` (sanitizado, ≥1 fase, ≥1 atividade, ≤3 MB) | `{dirty}` | 400 |
| POST | `/api/standard-plan/template/versions` | **Master ou PRICETAX** (não exige administrador) | `note`≤500 | 201 `{version,label}` | 400 "Não há alterações para salvar." |
| POST | `/api/standard-plan/template/versions/archive`, `/restore/:version`, `/proposals/:key/load`, `/draft/discard` | Master ou PRICETAX | ver código | `ok` | 400 (arquivar 1.0 ou atual), 404 |
| GET | `/api/standard-plan/preview`, `/audit/:id` | Master ou PRICETAX + acesso | — | listas | 404 |
| POST | `/api/standard-plan/apply` | **Só administrador** | `projectIds` 1–100 | `results[]` | 403 |
| POST | `/api/task-links`, `/suggest` | Master ou PRICETAX | `projectId, taskId,…`; `taskIds`≤80 | 201 / sugestões | 400 tarefa não salva; **429** 8 pedidos/10 min |
| GET | `/api/task-links/pending` | Master ou PRICETAX | — | até 50/200 sugestões | — |
| POST | `/api/task-links/decide`, `/confirm-high` | Master ou PRICETAX | ≤200 / ≤500 | `ok` | — |
| GET/POST | `/api/task-links/backfill/*`, `/forget`, `/eval` | **Só administrador** | — | job em memória | 403, 409 (`TASK_LINK_MODE=off` ou já rodando), 503 sem IA |
| GET | `/api/inventory`, `/quality`, `/export.xlsx` | Master ou PRICETAX | filtros (`status, company, phase, responsible, origin, area, overdue, groupBy`) | grupos/planilha | — |
| POST | `/api/inventory/responsible`, `/area`, `/suggest-areas` | **Master ou PRICETAX** (escreve em várias empresas) | `dryRun`; `refs`≤800; sugerir ≤40 | contagens | 400 área fora da lista; 503 sem IA |
| GET/POST | `/api/gaps/overview`, `/company/:id`, `/create` | Master ou PRICETAX | `keys`≤40, `min` | lacunas / 201 | **409** "já não são lacunas" |
| GET | `/api/macro` | Logado com `companiesAccess` **e** `allCompaniesAccess` (não usa `canAccessProject`) | `range`: `overdue, current_week, next_week, next_30, no_date, paused` | itens + contadores | 403 |
| GET/POST | `/api/company-calendar/:projectId`, `/apply` | Master ou PRICETAX + acesso | `confirm:true`, e-mails ≤20, itens ≤60 | resultados por item | 400 e-mail/dia; 409 Google não conectado |
| GET | `/api/public-meeting/:token` | **Sem login** (token da reunião) | — | reunião inteira | 404 |

## Dados

### Tabelas que importam (leitura/gravação)

| Tabela | Papel | Tipo de acesso |
|---|---|---|
| `projects` (`id text PK, data jsonb, created_at, updated_at, org_id FK`) | A empresa inteira | Lê/grava o JSON inteiro; exclusão **física** |
| `project_versions` (`id bigserial, project_id, org_id, kind, label, actor_*, origin, company_name, snapshot jsonb, stats, touched, restored_from, last_write_at`) | Versões do cronograma. **Sem FK** (sobrevive à exclusão) | Só o gatilho e `projectVersions.js` gravam |
| `standard_plan_versions` (`org_id, version, data, note, summary, created_by(_name), created_at`; PK org+version) | Versões imutáveis do padrão | Insere; `summary.archived` marca arquivada |
| `standard_plan_draft` (`org_id PK, data, updated_by(_name), updated_at`) | Rascunho único por organização | Upsert |
| `task_activity_links` (livro-razão, só acrescenta; `ignored` = "Esquecer") | Decisões humanas de vínculo | Insere; `/forget` marca |
| `company_calendar_events` (PK `project_id, activity_id`; FK cascata) | Mapa atividade→evento do Google | Upsert/delete |
| `meeting_edits`, `meeting_submissions`, `company_share_links`, `project_dossiers`, `project_memory_chunks`, `ai_*`, `crm_company_projects`, `project_meeting_digests`, `meeting_parecer_advice`, `ai_metrics_events` | Dados em volta da empresa (FK com `ON DELETE CASCADE`; `ai_knowledge_entities` e `pareceres` ficam com `SET NULL`) | Apagam junto com a empresa (ver `docs/gerado/BANCO.md`) |

**`org_id`:** a base (organização) da empresa. Toda leitura filtra `org_id` e depois `canAccessProject`. Super admin vê tudo; `?asOrg=` só vale para super admin (`effectiveOrgId`). **Exceção:** `GET /api/macro` usa `req.user.orgId` direto, ignorando `asOrg`.

**Quem enxerga uma empresa (`canAccessProject`, `routes.js` l.33):** super admin sempre; senão o usuário precisa ser da mesma organização, ter `companiesAccess`, e (`allCompaniesAccess` **ou** o CNPJ da empresa constar em `allowedCnpjs` dele). Ser "responsável" (`ownerIds`) **não** dá acesso nem é lido pelo servidor.

### Estrutura de `projects.data` (o mais importante)

Tipos: `texto`, `AAAA-MM-DD` (data), `ISO` (data e hora UTC), `id` (texto gerado como `prefixo-xxxxxxx` com `Math.random`), `bool`, `[]` lista. **Não há esquema no banco nem validação no servidor**: o que a tela mandar, grava. Campo ausente deve ser tratado como vazio.

#### Raiz do documento

| Campo | Tipo | Para que serve |
|---|---|---|
| `id` | id `proj-…` | Igual ao `projects.id` (o PATCH confere) |
| `company` | objeto | Dados da empresa (tabela abaixo) |
| `phases` | `[]` de fase | Fases do cronograma |
| `team` | `[]` | Responsáveis possíveis (nomes usados em `responsible`) |
| `activities` | `[]` de atividade | O cronograma (atividades principais) |
| `meetings` | `[]` de reunião | Reuniões gravadas e suas tarefas |
| `externalContacts` | `[]` | Pessoas de fora reaproveitadas como participantes |
| `log` | `[]` | Histórico (mais novo primeiro), **máx. 300** (limite aplicado no front e nas rotas de servidor que gravam log) |
| `standardVersion` | número | Versão do padrão com que a empresa nasceu (só aviso) |
| `isStandardTemplate`, `kickoffDate` | bool, data | **Só no projeto virtual `std-plan`** (não existe em `projects`) |

#### `company`

| Campo | Tipo | Para que serve |
|---|---|---|
| `cnpj` | texto | Formato `00.000.000/0000-00`; **chave de acesso de usuário cliente** (`allowedCnpjs`) |
| `name` | texto | Razão social |
| `nomeFantasia` | texto | Nome de exibição (a tela usa `nomeFantasia \|\| name`) |
| `logo` | texto | Imagem em data URL (base64) dentro do JSON |
| `color` | texto | Cor da empresa (`#RRGGBB`) |
| `clientType` | texto | `diagnostico` \| `diagnostico-consultoria` \| `poc-demo` (`CLIENT_TYPE_META`) |
| `status`, `resumeDate` | texto, data | `ativo` \| `pausado`; data prevista de retomada |
| `regimeTributario`, `porte`, `uf`, `municipio`, `cnaePrincipal`, `descricaoCnae` | texto | Vêm da consulta de CNPJ (`POST /api/cnpj/lookup`, `cnpjLookup.js`) |
| `cnaesSecundarios`, `qsa` | `[]` | Idem (CNAEs e quadro societário) |
| `areas` | `[{id,area,name,email}]` | "Áreas e responsáveis" do cliente (`teamPhaseActions.js`) |
| `ownerIds`, `principalOwnerId` | `[]` de id de usuário, id | Responsáveis PRICETAX pela empresa (`CompanyOwners.jsx`). **Só o front usa** (filtro "Minhas empresas") |
| `isGroupMaster`, `groupId`, `groupName` | bool, id, texto | Grupo Empresarial: Master tem `isGroupMaster:true`; filhas apontam `groupId` = id do Master (`groupRootId`) |
| `structureType` | `individual`\|`grupo` | Gravado só quando se converte pela `EditCompanyModal`; **nada no código lê** |
| `teamLinks` | objeto | Legado de `normalizeTeam` (vínculo equipe↔usuário antes de `team` virar objeto) |

#### `team[]` (após `normalizeProject`)
`{ id, name, area, userId|null, username|null, role|null }`. No banco novo (`blankProject`) vem como **lista de textos** (`defaultTeam()`); vira objeto na 1ª carga e persiste no 1º PATCH. `userId/role` ≠ null = pessoa vinculada a usuário real (PRICETAX ou cliente).

#### `phases[]`
`{ id (número), name, sub (descrição), color }`. Atividade aponta para `phase` = `id`. Excluir fase move as atividades para a primeira fase restante; "pelo menos 1 fase" só é garantido no front (`deletePhase`).

#### `activities[]` — atividade principal

| Campo | Tipo | Para que serve |
|---|---|---|
| `id` | id (`act-…`, `m-…`, `m1`) | Chave estável; vínculos usam |
| `month` | número | Ordinal de criação (máx.+1); usado como ordem |
| `phase` | número | `id` da fase |
| `title`, `desc` | texto | Título e descrição |
| `responsible` | texto | **Nome** da equipe (não é id) |
| `priority` | `alta`\|`media`\|`baixa`\|`''` | `PRIORITY_META` |
| `participants` | `[]` de nome | Participantes |
| `date`, `endDate` | data | Início e fim (`''` = sem data) |
| `durationDays` | texto/número | Duração alternativa |
| `status` | `nao-iniciado`\|`em-andamento`\|`pausado`\|`concluido` | `STATUS_META` |
| `statusBeforePause` | texto | Guardado na pausa da empresa |
| `required` | bool | Obrigatória |
| `kind` | `reuniao`\|`trabalho` (ausente = trabalho) | Só `reuniao` vai para a agenda e entra na regra "1/dia" |
| `meetingTime` | `HH:MM` | Horário da reunião (só atividade) |
| `clientDateConfirmed` | bool | "Data confirmada com o cliente?" |
| `dateLocked` | bool | Data travada (o ajuste automático não move) |
| `subactivities` | `[]` | Itens do checklist |
| `notes`, `transcript` | texto | Notas e transcrição colada |
| `attachments` | `[{id,name,size,type,dataUrl,…}]` | **Arquivo em base64 dentro do JSON** (limite de 8 MB por arquivo só no front: `MAX_ATTACHMENT_BYTES`) |
| `comments` | `[{id,text,ts,author,authorId,mentions[],attachments[],links[],editedAt?}]` | Comentários; `mentions` = ids de usuário (geram notificação) |
| `links` | `[{id,label,url}]` | Links |
| `deleted`, `deletedAt`, `deletedBy` | bool, ISO, texto | Exclusão lógica (Lixeira) |
| `stdKey` | texto | Marca do padrão (casa com a auditoria) |
| `area` | uma de `AREAS` | Área (Levantamento) |
| `responsibleConfirmed`, `responsibleOriginal` | bool, texto | Padronização de responsável (Levantamento) |
| `groupActivityId`, `groupScopeType` | id, `multi`\|`all` | Atividade de grupo v1 (cópia por empresa) |
| `involvedCompanyIds` | `[]` de id de projeto | Grupo v2: empresas-filhas envolvidas; só no projeto Master; vazio = "Geral do Grupo" |

#### `activities[].subactivities[]`

| Campo | Tipo | Para que serve |
|---|---|---|
| `id` | id (`s-…`) | Único no projeto inteiro (restauração bloqueia repetido) |
| `title`, `done` | texto, bool | Item e conclusão |
| `doneAt`, `doneBy` | ISO, texto | Gravados ao marcar (`updateSub`) |
| `skipped`, `skipReason` | bool, texto | "Pulada" (continua contando como concluída) |
| `responsible`, `date` | texto, data | Responsável e data próprios |
| `kind` | `reuniao`\|`trabalho` | Subatividade tipo Reunião tem dia próprio |
| `pautaDe` | id | Id da subatividade-Reunião cuja pauta este item integra (`shared/pauta.js`) |
| `meetingId` | id | Reunião gravada vinculada; **nunca vai para padrão nem empresa nova** |
| `guide` | texto (≤4000 na API) | Roteiro |
| `priority`, `executor`, `areas[]`, `applicability`, `recurrence`, `code` | vários | Campos do padrão (`SubExtras.jsx`) |
| `anchor` | `kickoff`\|`virada`\|`fixa` | Como a data se comporta no padrão e no ajuste automático |
| `limit` | `{date,type,source,conf,checked}` | Prazo-limite da norma |
| `predecessors` | `[]` de id de subatividade | Dependências (aviso, não trava) |
| `compressed`, `compressedFrom` | bool, data | Prazo cortado pelo limite na criação da empresa |
| `dateLocked` | bool | Data travada |
| `stdId` | texto | Marca do "padrão aprimorado" |
| `deleted`, `deletedAt`, `deletedBy` | — | Exclusão lógica |

#### `meetings[]` e `meetings[].actionItems[]`

Reunião: `{ id (mtg-…), title, date, time, participants[] (nomes), transcript, summary, decisions, actionItems[], topics?, highlights?, shareToken, shareVisibility ('private'|'public'), createdAt, deleted, deletedAt, deletedBy }`. Reuniões **não** entram em `project_versions`.

Tarefa (`actionItems[]`, id `mai-…`): `title, subtitle, notes, responsible (nome), responsibleOriginal?, responsibleStatus?, area?, owner ('pricetax'|'cliente'), kind ('tarefa'|'decisao'|'risco'|'pendencia'), dueDate, status ('nao-iniciado'|'urgente'|'em-andamento'|'pausada'|'concluida'|'nao-relevante'), subtasks[{id,title,done}], comments[{id,text,ts,user,userId,attachments?,links?}], attachments[], deleted, createdBy, createdAt`, mais o **vínculo**: `activityId` (id da atividade; `''` = sem vínculo), `activityLink` (`{status:'confirmed'|'none'|'suggested'|'auto', suggestedId, confidence 0–1, reason, source, confirmedBy, confirmedAt, at}`) e `closedWith` (marca da sincronia de conclusão).

#### `externalContacts[]` e `log[]`
- Contato: `{ id (ctt-…), name, email, createdAt }`. **Divergência:** `POST /projects/:id/meetings` cria contatos só com `{name, email}`.
- Log: `{ ts (ISO), action (texto), user (nome), activityId (id ou null) }`. O "Histórico" da atividade é o log filtrado por `activityId`.

### Exclusão lógica × física (resumo)
- **Lógica (`deleted:true`):** atividade, subatividade, reunião, tarefa. Aparecem na Lixeira/ lixeira de reuniões.
- **Física:** empresa (`DELETE`), comentário/anexo/link (com aviso "Desfazer" de 8 s só na tela).
- Versões/padrão: nada se apaga sozinho, exceto a retenção diária de `project_versions`.

## Tipos de leitura e de saída

| Saída | Onde | Observação |
|---|---|---|
| Lista inteira da organização (JSON completo) | `GET /api/projects` | Sem paginação; carrega anexos em base64 junto |
| Carimbos leves | `GET /api/projects/versions` | A cada 6 s por aba aberta; **o SQL lê o JSON inteiro** de todas as empresas só para filtrar acesso |
| Visões prontas | `GET /api/macro`, `/api/inventory` (agrupado por fase/responsável/empresa/área), `/api/gaps/*`, `/api/standard-plan/audit/:id` | Calculadas na hora, sem cache |
| Planilha | `GET /api/inventory/export.xlsx` (abas Atividades, Fase×Responsável, Sobre); Excel da empresa é gerado no navegador (`exportExcel`, abas Cronograma e Subatividades) | `Cache-Control: no-store` |
| PDF | Só navegador (`window.print`, `src/pdf/`) | Não existe PDF no servidor |
| Histórico | `GET /api/project-history/:id/versions` | Página de até 100 (`hasMore`) |

## Regras e travas

Legenda: **S** = garantida no servidor; **F** = só no front (um cliente de API ignora); **B** = no banco.

### Acesso e permissão

| Trava | O que impede | Onde é garantida | O que o usuário vê se violar |
|---|---|---|---|
| Isolamento por organização/CNPJ | Ler ou gravar empresa de outra base ou de CNPJ não liberado | S: `canAccessProject` em cada rota | 404/403 "Sem acesso a este projeto." |
| Criar/excluir empresa só equipe | Cliente criar/apagar | S: `requireMasterOrPricetax` | 403 "Apenas Master ou PRICETAX podem cadastrar empresas." |
| Restaurar versão / recriar empresa só Master | PRICETAX restaurar | S: `canRestore` em `projectVersions.js` | 403 "Só administradores (Master) restauram versões." |
| Ajustar cronograma por operações só Master | Outros alterarem em lote | S: `requireMaster` em `/projects/:id/plan` | 403 |
| Aplicar padrão aprimorado e varredura de vínculos só administrador | PRICETAX aplicar em lote | S: `isAdmin` nas rotas | 403 |
| Cliente não vê Versões, Log, Lixeira, Auditoria, botões de equipe | Poluir a tela do cliente | **F** (`CompanyWorkspace.jsx`, `role === 'master' \|\| 'pricetax'`) | Botões somem. **O servidor não bloqueia** `PATCH /projects/:id` do cliente (ver Achados) |
| Só equipe vincula tarefa a atividade | Cliente mexer no vínculo | **F** (`canLinkTasks`, `meetingActions.js`) + S só para o **livro-razão** (`requireMasterOrPricetax` em `POST /task-links`) | Seletor oculto; o campo no JSON não é protegido |
| Cliente nunca vê visão consolidada de grupo | Grupo para cliente | `canAccessProject` (cliente só por CNPJ) + telas | — |

### Integridade e gravação

| Trava | O que impede | Onde é garantida | O que o usuário vê |
|---|---|---|---|
| `project.id` igual ao da URL | PATCH de documento trocado | S: `routes.js` PATCH | 400 "Payload de projeto inválido." |
| Gravações do servidor em transação com `FOR UPDATE` | Perder edição em lote (levantamento, lacunas, plano, `/meetings`, restauração, padrão) | S | — |
| Restauração: tudo-ou-nada, `confirm:true`, backup `pre_restore`, 409 se id repetido | Restaurar sem querer / quebrar vínculos | S: `projectVersions.js`, `validateSchedule` | 400/409 com mensagem |
| Gatilho nunca derruba a gravação | Versionamento travar o salvamento | B: bloco `EXCEPTION WHEN OTHERS` do gatilho | Nada (vira WARNING no log) |
| Exclusão por digitar "Excluir" (atividade/reunião) e o nome da empresa (empresa) | Apagar sem querer | **F**: `DELETE_CONFIRM_PHRASE`, `ConfirmDialog` | Pede a digitação |
| Anexo ≤ 8 MB | Documento gigante | **F**: `readFileAsAttachment`; no servidor só o limite de corpo de **15 MB** (`express.json`) | Aviso no navegador; 413 se passar de 15 MB |
| Log ≤ 300 | Log crescer sem fim | F (`mutateProject`) e nas rotas de servidor que gravam log (`slice(0,300)`) | — |
| Atividade estica sozinha para cobrir subatividade | Subatividade fora do período | F: `fitPeriods` em `mutateProject`; S só em `applyPlanOps` (API) | Linha no Log "Período esticado…" |
| Ajustar datas automaticamente | Mudar kickoff sem mover o resto | **F**, preferência por empresa e por pessoa em `localStorage` (`cron:autoDates:<id>`), começa **desligada** | Aviso com "Desfazer" |
| Sincronia de conclusão tarefa↔atividade (só vínculo validado) | Esquecer de fechar o par | **F**: `syncLinkedStatus` em `mutateProject` (não roda em API/RENATA) | Aviso "Desfazer" |
| Pausar empresa pausa as atividades ativas | Cronograma andando com empresa parada | F: `updateCompanyFields` | Toast com Desfazer |
| Desvincular empresa de grupo com atividade pendente | Perder referência `involvedCompanyIds` | F: `EditCompanyModal.unlinkFromGroup` | `alert` com os títulos |
| Cronograma padrão: ≥1 fase, ≥1 atividade, ≤3 MB; sem alteração não salva; 1.0 e atual não arquivam | Versão inválida | S: `templateValid`, `saveVersion`, `setArchived` | 400 |
| Padrão aprimorado nunca muda data/status/responsável/fase/prioridade/título | Estragar cronograma em andamento | S: `PROTECTED_FIELDS` em `applyPlanToData` (aborta com erro) | Resultado `erro` por empresa |
| Lacunas: só existe "padrão" se ≥3 empresas têm; só copia título/fase/área; recalcula no servidor com trava; ≤40 | Vazar dado de cliente para outro; duplicar com 2 cliques | S: `MIN_FLOOR`, `gapsForCompany` | 409 "já não são lacunas" |
| Levantamento: ≤800 itens por lote; área só da lista; prévia `dryRun` | Gravação em massa acidental | S: `inventoryEdit.js` | 400 |
| Vínculo: `activityId` precisa ser atividade viva; livro-razão deriva a decisão relendo o projeto | Dado forjado no aprendizado | S: `ledgerRow` (só o livro-razão) | 400 "Atividade não encontrada neste cronograma." |
| Vínculo: limiares 0,5 e 0,8 | Vincular sem confiança | S `taskLinkSuggest.js` **e** F `ActivityLink.jsx` (duplicados: mudar nos dois) | — |
| Aprendizado entre empresas: piso de 3 empresas, motivo genérico | Texto de um cliente aparecer para outro | S: `MIN_FLOOR` em `taskLinkLearn.js`/`gaps.js` | — |
| `TASK_LINK_MODE=off`/`sem-ia`, `TASK_LINK_AUTO=off` | Desligar sugestão sem deploy | S (variáveis do Railway) | 409 na varredura |

### Regras de negócio (cada uma, onde vale e o que se vê)

| Regra | Onde é validada | O que o usuário vê |
|---|---|---|
| **No máximo 1 reunião por dia por empresa** (só tipo Reunião; Trabalho pode repetir) | **S só na reserva de agenda** (`companyCalendar.js` `/apply` com `duplicateDays`, 400 antes do Google). **F: apenas aviso** no detalhe da atividade/linha da subatividade (`meetingConflicts`), destaque na Triagem, cartão "dias com 2+ reuniões". **Não bloqueia** a edição da data | Aviso amarelo; na reserva, "Duas reuniões no mesmo dia… só pode haver uma reunião por dia" |
| **Máximo 2 reuniões por semana com o cliente; workshops externos contam** | **Não existe no código** (busca em `shared/`, `server/`, `src/screens/` não achou). É regra de conduta do Rafael ao propor datas | Nada |
| Reunião em dias úteis seguidos / "cada assunto tem a sua reunião" / "Reunião \| Área" no topo | Só convenção (memória do Rafael); o código não confere | Nada |
| Reserva: dia dentro do período da reunião, não no passado; duração ∈ {30,60,90,120,180}; ≤20 e-mails; ≤60 itens; `confirm:true` | S: `companyCalendar.js` e `companyCalendarPlan.js` | 400 com mensagem |
| Reunião registrada por API é idempotente (mesma data + mesmo título → 409, salvo `force`); responsável da tarefa só se estiver na equipe, senão vazio | S: `POST /projects/:id/meetings` | 409 "Já existe a reunião…" |
| Vínculo `auto` (≥50%) nunca fecha tarefa nem atividade; só validado propaga | F: `shared/linkSync.js` | Selo "Automática, a validar" |
| Pauta: mudar data da reunião leva os itens; reunião deixar de ser Reunião desvincula; data do item diferente desvincula | F: `reconcilePautaProject` em `updateSub` (e `applyPlanOps`) | Itens saem da pauta |
| Atividade de grupo v1 sincroniza título/descrição/datas/fase/obrigatória entre cópias; status/responsável não | F: `updateActivity` (`GROUP_SYNC_FIELDS`) | — |
| Empresa nova herda a última versão do padrão; data com limite da norma vira "prazo comprimido"; item já vencido "nasce vencido" | S: `instantiateTemplate` | Aviso no cadastro e no Log |
| Tarefa vencida e aberta gera 1 aviso por tarefa (até 14 dias de atraso; só depois das 7h; só usuário com nome igual ao responsável; nunca cliente) | S: `runTodoReminders` | Notificação |
| `responsible` só notifica se o texto bater (sem diferenciar maiúscula) com o **nome** de um usuário da organização | S: `notifyActivityChanges`, `diffTodoEvents` | Papéis como "Fiscal" não notificam |
| Reuniões e tarefas não entram nas versões | B/S: `pv_schedule` guarda só `activities/phases/team` | Versão não restaura reunião |

## IA nesta área

| Uso | Modelo / limites (conferido) | O que entra | Falha |
|---|---|---|---|
| Sugestão de vínculo tarefa→atividade (`taskLinkSuggest.js`) | `STUDY_MODEL`, `messages.parse` com `zodOutputFormat`, `max_tokens` 4000, lotes de 30; prompt = atividades da própria empresa (id, título, fase, responsável, data, descrição ≤140 + linha do dicionário), até 8 exemplos já vinculados **da própria empresa**, resumo da reunião ≤900, tarefas | Só dados da empresa em questão | Cai para aprendido/regra; transcrição nunca falha por isso (try/catch em `meetingInbox.js`) |
| Sugerir área (`inventoryEdit.js` `suggestAreas`) | `STUDY_MODEL`, `max_tokens` 4000, ≤40 itens por pedido, `z.enum(AREAS)` (nunca enum aberto) | Empresa, título, descrição ≤220, responsável | 503 sem `ANTHROPIC_API_KEY`; revisão humana antes de gravar |
| Avaliação do vínculo (`/task-links/eval`) | 3/hora/usuário, 56 casos sintéticos | Nada de dado real | 503 sem chave |

**Nunca entra no prompt:** dados de outra empresa (aprendizado entre empresas só devolve motivo genérico); o dicionário de atividades só é lido no servidor. **Regra de ouro:** campo novo no esquema de saída da IA nunca é enum rígido (incidente do `kind`, §87.9); normalizar depois. A RENATA **não cria atividade** (só tarefa vinculada a atividade existente).

## Bugs e armadilhas conhecidos

| Sintoma | Causa | Onde foi tratado / como NÃO reintroduzir |
|---|---|---|
| Texto digitado some ~2 s depois (Amanda, 2026-09-29, §60) | Poll de 6 s recarregava `projects` e apagava edição local ainda não enviada | `reloadProjects({background:true})` preserva projeto com `saveTimers`/`inFlightProjectSaves`. Nunca sobrescreva `projects` em recarga de fundo sem checar pendência |
| "Escrevo e o texto some" em modais (§45/§46/§47) | Autosave por tecla + re-render | `useDebouncedField`; linhas extraídas de `.map()` para componente próprio (`AreaRow`, `PhaseRow`, `SubactivityRow`) |
| **Duas pessoas editando a mesma empresa: última gravação vence** | `PATCH` envia o documento inteiro, sem versão/ETag | Não resolvido. Mitigação: versionamento (o estado sobrescrito fica numa versão atribuída a quem gravou depois). Controle otimista é melhoria futura (`docs/VERSIONAMENTO_CRONOGRAMA.md` §8) |
| Transcrição apagava edições feitas durante o processamento | `processSubmission` lia `project.data` antes da IA e gravava a cópia velha depois | **Corrigido em 2026-10-29:** relê o projeto com `FOR UPDATE` na hora de gravar e só acrescenta reunião e linha de log; reprocessar uma envio já em `processing` não duplica (`UPDATE … WHERE status <> 'processing'`). Teste: `scripts/connect-transcripts.test.mjs` (A8) |
| Idem em menor escala | `assistant.js` (`appendProjectLog`) e `assistantActions.js` (5 gravações) fazem ler-modificar-gravar sem `FOR UPDATE` | Não tratado (janela curta) |
| Hoje igual ao padrão "kickoff" mas datas erradas | Datas do padrão são "kickoff + dias"; âncora `virada`/`fixa` mantém data absoluta | `instantiateTemplate`; ver `anchor` em Dados |
| Versão do padrão com erro | Versões são imutáveis | Corrigir = salvar versão nova. Propostas mudam no código sem mudar rascunhos já carregados: recarregar a proposta |
| Dois editores no rascunho do padrão se sobrescrevem | Rascunho único por organização, sem merge | Combinar antes |
| Link da reunião revela tudo | `GET /public-meeting/:token` devolve a reunião inteira (transcrição, tarefas com anexos base64) e varre **todos os projetos de todas as organizações** a cada acesso; token gerado no navegador (`genShareToken`, `App.jsx` l.177, agora com `crypto.getRandomValues`, 192 bits) | Não tratado (ver Achados) |
| Excluir empresa avisa "Não dá para desfazer" | Texto antigo; Master pode recriar por `pre_delete` (mas tabelas filhas, links públicos, dossiês e reservas de agenda **não** voltam) | Ajustar o texto de `AdminScreens.jsx` (`CompanySelectorScreen`) se o Rafael quiser |
| Reserva no Google não acompanha mudança de data do cronograma | Atualização é manual: reabrir a janela e reenviar | Linha vira "Mudou: atualizar" (`rowStatus`) |
| `GET /api/macro` mostra datas pelo relógio do servidor, não por São Paulo | `macro.js` usa `new Date()` local | Não tratado (não verificado o fuso do Railway) |
| Caixa de busca da aba Triagem não filtra nada | `CompanyTriage` não recebe `shownActs` | Conhecido (§90.1) |
| Auditoria só compara início da atividade e só com a versão atual do padrão | Desenho | `standardAudit.js` |
| Tempo de carga cresce com anexos | Anexos/logotipo em base64 dentro de `projects.data`, devolvidos em toda carga e no poll | Evitar novos blobs no JSON; usar tabela própria (como Pareceres) |
| Time/ids de equipe mudam a cada carga até o 1º PATCH | `normalizeTeam` gera `uid` para itens que ainda são texto | Não use `team[].id` como chave persistente antes de salvar |

## Como testar

Não há runner (Jest). Verificação = `npm run build` limpo + scripts em `scripts/` que sobem servidor e Postgres **locais** (recusam banco que não seja `localhost`).

| Script | O que prova |
|---|---|
| `scripts/schedule-version.test.mjs` (sem banco) | Comparar/restaurar/desfazer/parcial, vínculos de pauta, ids repetidos, equipe/fases |
| `scripts/project-versions-http.test.mjs` (≈75 verificações, HTTP+Postgres) | Gatilho, autoria, coalescência de 5 min, permissões, isolamento entre bases, restauração com backup, exclusão/recriação de empresa |
| `scripts/gaps-http.test.mjs` | Dois cliques simultâneos em "criar lacunas" não duplicam |
| `scripts/meeting-register.test.mjs` | `POST /api/projects/:id/meetings` (idempotência, validações) |
| `scripts/connect-fixes.test.mjs` | Cita o vínculo de tarefa (cobertura parcial) |
| `scripts/connect-meetings-edit.test.mjs`, `connect-scopes.test.mjs`, `connect-transcripts.test.mjs` | API de conectividade (escopos, correção de reunião) |
| `scripts/save-retry.test.mjs` | Retentativa de salvamento |

**Sem teste automatizado no repositório (conferido por busca em `scripts/`):** `standardTemplate.js`, `standardAudit.js`, `standardPlan.js`, `taskLinks*.js` (exceto menção), `activityDictionary.js`, `shared/calendarDays.js`, `shared/period.js`, `shared/linkSync.js`, `src/lib/dateRipple.js`, `inventory*.js`, `macro.js`, `companyCalendar*.js`, `todoNotifications.js`, `PATCH /api/projects/:id` e o poll. O PROJECT_CONTEXT cita testes descartáveis (t2–t34) que **não estão** no repositório. Verificação manual sugerida do padrão (não precisa de banco): `cd server && node -e "import('./standardTemplate.js').then(m=>{for(const f of ['buildV3','buildV4','buildV5']){console.log(f,m.countTemplate(m[f]()))}})"` (esperado 22/92, 26/206, 27/213, segundo §89 — não rodado nesta documentação).

## Receitas: "se o Rafael pedir X, faça Y"

1. **Novo campo na atividade ou subatividade.** Abrir `src/app/companyActivityActions.js` (`addActivity`/`addSub` e a função que edita) e `src/screens/CompanyViews.jsx` (`ActivityDetailModal` l.285, `SubactivityRow` l.210). O servidor aceita sem mudança. Se a empresa nova deve herdar/limpar o campo, ver `instantiateTemplate` (`standardTemplate.js`) e `cloneCompany` (`companyAdminActions.js`); se entra no padrão, `templateFromProject`. Se deve aparecer na API de conectividade, `server/connect.js` (`SET_SUB`/`SET_ACT`). Conferir: `npm run build`; criar, recarregar a página, restaurar uma versão (`scheduleOf` guarda a atividade inteira). Atualizar este documento (tabela de campos).
2. **Novo campo na empresa.** `EditCompanyModal`/`CreateCompanyModal` (`AdminScreens.jsx`, `App.jsx`) e `updateCompanyFields`. `POST /projects` já repassa qualquer chave de `company`. `company` **não** é versionado.
3. **Mudar o que a Tabela/Fases/Quadro/Gantt mostram.** `src/screens/CompanyViews.jsx` (`TableView` l.1241, `PhasesView` l.1752, `KanbanView` l.1885, `TimelineView` l.1974); filtros e abas em `CompanyWorkspace.jsx`; busca em `src/lib/screenSearch.js`. Respeitar mobile (padrões em `PROJECT_CONTEXT.md` §16). Para nova aba: acrescentar o id em `COMPANY_VIEW_IDS` (`App.jsx` l.452) e `SINGLE_ONLY_VIEWS` se for só de uma empresa.
4. **Empresa nova deve nascer diferente.** Não edite `blankProject`. Edite o padrão pela tela ("Ver cronograma padrão" → salvar versão) ou crie nova proposta em `standardTemplate.js` (funções `buildV1`…`buildV5`) e registre em `PROPOSALS`/`BUILDERS` (`standardTemplateStore.js`). Conferir `instantiateTemplate` (kickoff, limites). Lembrar: empresas existentes não mudam.
5. **Aplicar melhoria do padrão em empresas que já existem.** Só pela aba Padrão (`/standard-plan/apply`, administrador) e só acrescenta; para mudar data/status em massa use `POST /projects/:id/plan` (Master, `dryRun` primeiro) ou a API `/api/connect/companies/:id/plan`.
6. **"Voltar o cronograma de ontem".** Master: empresa › Versões › Comparar › Restaurar (simulação, digitar `RESTAURAR`). Por API: `POST /api/project-history/:id/versions/:vid/restore` com `dryRun:true` e depois `confirm:true`. Se foi excluída: Empresas excluídas.
7. **Mudar a lógica de sugestão de vínculo.** `server/taskLinkSuggest.js` (ordem aprendido→IA→regra, limiares), `taskLinkLearn.js`, `activityDictionary.js` (nova entrada `E(...)`); cliente: `src/meetings/ActivityLink.jsx` (limiares duplicados). Rodar "Rodar avaliação" (`/task-links/eval`, administrador) e comparar com `RELEASE_GATE` em `server/evals/taskLinkEval.js`.
8. **Tarefa vinculada à atividade errada em massa.** Aba Tarefas › "Zerar vínculos" (`resetTaskLinks`, desfazível) e refazer com "Vincular com a RENATA"; para tirar aprendizado ruim, Central de Conhecimento › Tarefas × atividades › Esquecer (administrador).
9. **Nova regra de reunião (ex.: limite por semana).** Pura em `shared/calendarDays.js` (acrescentar a função, usada no servidor e na tela). Servidor: `companyCalendar.js` (`/apply`, onde `duplicateDays` já bloqueia). Tela: `CompanyViews.jsx` (aviso `meetingConflicts`) e `CompanyTriage.jsx`. Decidir com o Rafael se **bloqueia** a edição (hoje nunca bloqueia) ou só avisa.
10. **Nova área na lista.** Editar só `server/areas.js` (`AREAS`); o servidor valida e entrega a lista à tela (`GET /api/inventory/areas`). A IA de área usa `z.enum(AREAS)`.
11. **Nova coluna/filtro no Levantamento.** `server/inventory.js` (`buildItems`, `parseFilters`, `applyFilters`, `/export.xlsx`) e `src/macro/Inventory.jsx`.
12. **Nova notificação de tarefa.** `server/todoNotifications.js` (`diffTodoEvents` + `notifyTodoChanges`; lembretes em `runTodoReminders`); tipos de notificação em `server/notifications.js` e categorias em `server/notificationPrefs.js` (não lidos nesta documentação).
13. **Proteger o servidor contra edição de cliente.** Em `routes.js` PATCH, comparar `next_` com `current` e rejeitar campos de equipe (ver Achados); testar com `scripts/project-versions-http.test.mjs` como modelo (usuário cliente).
14. ~~Corrigir a corrida da transcrição~~ — feito em 2026-10-29 (ver acima).

## Não verificado / dúvidas

- Não rodei nenhum script de teste nem subi o servidor; tudo acima vem de leitura do código.
- Não confirmei se um usuário `role='cliente'` realmente chega a abrir a empresa pela interface (o menu mostra menos botões), nem o conteúdo exato que o cliente vê; confirmei só que o **servidor** aceita o PATCH dele.
- Não li `server/connect.js` (`applyPlanOps`), `server/memoryIngest.js`, `server/notifications.js`/`notificationPrefs.js` nem `server/companyShare.js`: citados pelo que dizem §91 do PROJECT_CONTEXT e o código chamador.
- Não conferi o fuso do processo no Railway (afeta `server/macro.js`).
- Valores de produção (versões reais do padrão, "9.0 atual" citada no PROJECT_CONTEXT) não verificados.
- A função exata que renderiza a Lixeira de reuniões e a lista de reuniões (`Meetings.jsx`) não foi lida linha a linha.
- `docs/PROJECT_MAP.md` §3 tem números de linha antigos (ex.: `TableView` L70); usei as linhas conferidas de hoje.
- Se há trava de CNPJ duplicado no cadastro: o servidor **não** confere; o front não foi lido para isso.

## Achados de segurança
Os achados de segurança desta área ficam no registro privado `docs/11_ACHADOS_E_PENDENCIAS.md` (não é publicado).

