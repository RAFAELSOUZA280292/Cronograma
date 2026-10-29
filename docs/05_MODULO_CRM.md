# CRM PRICETAX
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza (decide o que entra); quem usa no dia a dia: Eduarda (comercial). Fonte da verdade: o código; este texto é o mapa.

## Em uma frase
O CRM é a aba do painel onde a PRICETAX cadastra **empresas e contatos**, acompanha **negócios** em funis de etapas (Lead é a 1ª etapa), agenda **atividades** (follow-ups), registra **notas** e vê **painéis** por função — tudo com histórico que nunca se apaga. Serve a tela, a RENATA (IA) e o Claude Code (por chave de API).

## Para quem é / quando ler (gatilhos)
Pedidos típicos do Rafael que mandam para este documento:
- "Mudar o que o card/linha do negócio mostra", "novo campo no negócio/empresa", "nova etapa ou funil".
- "O vendedor não consegue X" / "gestor precisa poder Y" (permissões por perfil).
- "A cadência não agendou", "o lembrete não chegou", "a atividade não apareceu no Google".
- "Importar planilha de empresas/negócios", "migrar do PipeRun", "importar leads do evento".
- "Exportar negócios para Excel", "busca não acha comentário/tag".
- "Claude Code gravou no CRM", "RENATA pode (ou não) mexer no CRM".
- "Painel (Meu dia / Time / Receita / Contas) mostra número errado".

**Palavras-chave para busca (para o robô):** `crm_role`, `crmCan`, `need('write')`, `createCrmRouter`, `actorOf`, `crmActor`, `moveDeal`, `cadenceAfterMove`, `applyWonAutomation`, `runReminders`, `syncActivity`, `exportDealsXlsx`, `classifyDeals`, `mergeCompanies`, `lookupCnpj`, `piperun_raw`, `crm_operate`, `silentNotify`, `skipCadence`, `external_id`, `Ponto Fora da Curva`, `DateField`.

## Mapa rápido

### Servidor (`server/crm/`)
| Arquivo | Funções/peças (conferidas) | O que faz | Quem chama |
|---|---|---|---|
| `routes.js` | `createCrmRouter`, `need(cap)`, `h()`, `actorOf` | Todas as rotas `/api/crm`. Nenhuma escreve SQL de dado (só 3 leituras soltas). | `server/index.js` (`/api/crm`) e `server/connect.js` (`/api/connect/crm`) |
| `permissions.js` | `CRM_ROLES`, `CAPABILITIES`, `crmRoleOf`, `crmCan`, `crmLenses`, `crmCapabilities` | Quem pode o quê. | rotas, RENATA (`tools/crm.js`), agenda, connect |
| `service.js` | `COMPANY_SPEC`, `CONTACT_SPEC`, `sanitize`, `tx`, `addAudit`, `addTimeline`, `createCompany/updateCompany/deleteCompany/restoreCompany`, `createContact/updateContact/deleteContact`, `addNote/updateNote/deleteNote`, `linkProject/unlinkProject`, `mergeCompanies` | Escrita de empresas, contatos, notas. **Toda escrita = dado + auditoria + linha do tempo na mesma transação.** | rotas, importadores, RENATA (via HTTP interno) |
| `deals.js` | `DEAL_SPEC`, `createDeal`, `updateDeal`, `moveDeal`, `deleteDeal`, `mapDeal`, `resolveItems` | Negócios (inclui itens/produtos, ganhar/perder, histórico de etapa). | rotas, `extras.quickLead`, importadores |
| `pipeline.js` | `DEFAULT_STAGES`, `LOST_REASONS`, `ensureDefaultPipeline`, `resolvePipeline` | Funil padrão e motivos de perda. | `deals.js`, `funnels.js` |
| `funnels.js` | `listPipelines`, `createPipelineTx`, `updatePipeline`, `deletePipeline`, `saveStages`, `appendOpenStageTx` | Configurar funis e etapas. | rotas `/pipelines*`, importadores |
| `automation.js` | `applyWonAutomation` | Ao ganhar, cria cópia do negócio em outro funil. | `moveDeal` |
| `extras.js` | `setDealTags`, `ensureTag`, `quickLead`, `saveCadence`, `cadenceAfterMove`, `cadenceAfterComplete` | Tags, lead rápido, cadências. | rotas |
| `activities.js` | `ACTIVITY_SPEC`, `createActivity`, `updateActivity`, `completeActivity`, `cancelActivity`, `reopenActivity`, `deleteActivity`, `activityHooks` | Atividades/follow-ups + gancho pós-gravação. | rotas, `extras.js` (cadência) |
| `googleSync.js` | `syncActivity`, `buildEventBody`, `linkedGoogleEventIds` | Espelha atividade no Google Calendar do responsável. | gancho `activityHooks.after` |
| `scheduler.js` | `startCrmScheduler`, `runReminders` | Lembretes de atividade vencida/de hoje (a cada 10 min). | `server/index.js:144` |
| `agendaFeed.js` | `crmAgendaEvents` | Atividades abertas do usuário como eventos da Agenda do painel. | `server/agenda.js` |
| `queries.js` | `listCompanies`, `getCompanyOverview`, `listContacts`, `getContact`, `listTimeline`, `listAudit`, `search`, `options`, `overview`, `companyStats` | Leitura de empresas/contatos/busca/opções/painel "Contas". | rotas |
| `dealQueries.js` | `listDeals`, `getBoard`, `getPipeline`, `getDealDetail`, `dealsOverview`, `searchDeals`, `dealFilters` | Leitura de negócios (lista, quadro, ficha). | rotas, `dealExport.js` |
| `activityQueries.js` | `listActivities`, `activitiesForCompany/Deal`, `activitiesOverview` | Leitura de atividades. | rotas |
| `dashboards.js` | `lensOverview`, `mineOverview`, `teamOverview`, `revenueOverview` | Painéis "Meu dia / Time / Receita". | `GET /overview?lens=` |
| `views.js` | `listViews`, `createView`, `updateView`, `deleteView`, `setDefault`, `cleanConfig` | Visões salvas de Negócios + página inicial por pessoa. | rotas `/views*` |
| `products.js` | `listProducts`, `createProduct`, `updateProduct`, `deleteProduct` | Catálogo de produtos. | rotas `/products*` |
| `duplicates.js` | `findCompanyDuplicates`, `findContactDuplicates` | Duplicidade de empresa (CNPJ/nome) e contato (e-mail/telefone). | `service.js`, rotas |
| `completeness.js` | `companyCompleteness` | % de completude da conta (8 itens). | `queries.js` |
| `cnpj.js` / `cnpjSuggestion.js` | `isValidCnpj`, `mapCnpjSuggestion` | Valida dígitos do CNPJ; traduz dados da Receita em campos do cadastro. | rotas, `sanitize` |
| `../cnpjLookup.js` | `lookupCnpj` | BrasilAPI (reserva ReceitaWS) com cache de 60 dias em `cnpj_cache`. | `GET /cnpj/:cnpj` |
| `importer.js` | `classifyCompanies`, `previewImport`, `commitImport` | Importação de planilha (empresas/contatos). | rotas `/import/*` |
| `dealImporter.js` | `classifyDeals`, `previewDealImport`, `commitDealImport` | Importação de planilha de negócios (export do PipeRun). | rotas `/import/deals/*`, migração |
| `bootstrap.js` | `previewBootstrap`, `commitBootstrap` | Traz clientes do cronograma (projetos) para o CRM. | rotas `/bootstrap/*` |
| `dealExport.js` / `xlsxExport.js` | `exportDealsXlsx`, `buildXlsx` | Excel dos negócios (OOXML montado com JSZip). | `GET /deals/export.xlsx` |
| `projectSummary.js` | `projectSummary` | Resumo do projeto do cronograma na ficha da empresa. | `getCompanyOverview` |
| `piperun/*` | `client`, `extract`, `transform`, `migrate`, `reconcile`, `runs`, `schema`, `extrasImport`, `routes` | Migração PipeRun → CRM (só admin, só pela tela). | `registerPiperunRoutes` |
| `server/renata/tools/crm.js` | `registerCrm` | 52 ferramentas da RENATA para o CRM. | RENATA |
| `server/connect.js` | `crmViaToken` | Porta de entrada por chave de API (`/api/connect/crm`). | Claude Code, scripts |

`text.js` (normalização: `companyNameKey`, `similarity`, `parseDateBR`, `formatPhonesBR`) e `errors.js` (`CrmError(status, message, extra)`) são apoio.

### Front (`src/crm/`)
| Arquivo | O que é |
|---|---|
| `CrmScreen.jsx` | Casca: menu (Visão geral, Agenda, Negócios, Empresas, Contatos, Produtos), botões "Criar …", gavetas de empresa/negócio, `crm.me()` (capacidades). |
| `crmApi.js` | Objeto `crm` com todas as chamadas (`/api/crm`). Só monta URL/corpo; **regra e permissão ficam no servidor**. |
| `crmMeta.js` | Rótulos, formatadores (`fmtMoney`, `fmtCnpj`, `waHref`), cores de tag (`tagColor`) e o CSS inteiro (`CRM_CSS`). |
| `DealsPage.jsx` | Quadro Kanban + Lista, filtros, visões salvas, export Excel, botões Funis / Importar negócios / Migrar do PipeRun. |
| `boardMove.js` | `moveDealInBoard`, `replaceDealInBoard`: o cartão muda de coluna na hora, antes do servidor responder (§119). |
| `DealDrawer.jsx`, `DealForm.jsx`, `CloseDealDialog.jsx`, `DealTags.jsx`, `InlineCells.jsx` | Ficha, formulário, diálogo de ganho/perda (motivo obrigatório), tags, edição direta na célula. |
| `CompanyDrawer.jsx`, `CompanyForm.jsx`, `CompaniesPage.jsx`, `ContactForm.jsx`, `ContactsPage.jsx` | Ficha 360 da empresa, cadastro, listas. Aba Auditoria só se `caps.remove`. |
| `AgendaPage.jsx`, `ActivityForm.jsx`, `ActivityList.jsx`, `FollowUpQueue.jsx` | Agenda (Atrasadas/Hoje/7 dias/Depois), formulário, lista, fila de follow-up (uma atividade por vez). |
| `OverviewPage.jsx`, `OverviewLenses.jsx` | Visão geral por função (painéis Meu dia, Time, Receita, Contas). |
| `SavedViews.jsx`, `TagFilter.jsx` | Visões salvas; filtro de várias tags (E). |
| `FunnelsAdmin.jsx`, `CadenceEditor.jsx`, `ProductsPage.jsx` | Configuração de funis/etapas/automação, cadências, catálogo. |
| `ImportWizard.jsx`, `DealImportWizard.jsx`, `importMapping.js`, `BootstrapDialog.jsx`, `PipeRunMigration.jsx` | Assistentes de importação e migração. |
| `GlobalSearch.jsx`, `RenataAsk.jsx`, `ContactLinks.jsx`, `ui.jsx` | Busca do topo, "Perguntar à RENATA", ligar/WhatsApp, peças de UI. |
| `src/ui/DateTimeFields.jsx` | `DateField`, `TimeField`, `DatePopButton` (calendário que não é cortado; ver "Bugs"). |

## Como funciona (passo a passo)

### 1. Entrada e permissão
1. O navegador chama `/api/crm/...` com o cookie de sessão. `createCrmRouter` aplica `requireAuth` e depois `need('read')` em **todas** as rotas (`routes.js`, topo da função).
2. `need(cap)` chama `crmCan(req.user, cap)`; se falhar, responde **403 "Você não tem permissão pra isso no CRM."**
3. `orgOf(req)` = `effectiveOrgId(req)` (a base do usuário; só super admin troca com `?asOrg=`). Toda consulta leva `org_id`.
4. `h()` converte `CrmError` em `{ message, ...extra }` com o status dele; erro desconhecido vai para o `errorHandler` global.
5. `actorOf(req)` decide quem aparece na auditoria: pessoa da sessão; **RENATA** (`req.renataCommandId` definido) como "RENATA (IA, a pedido de …)"; **chave de API** (`req.crmActor`) como "Claude Code (por …)".

### 2. Gravar (qualquer entidade) — padrão único
1. Rota valida a capacidade e chama a função de `service.js`/`deals.js`/`activities.js`.
2. `sanitize(SPEC, input)` limpa e valida campo a campo (CNPJ com dígito verificador, UF, e-mail, data `YYYY-MM-DD`, número em formato BR, enum). Erros viram **400** com as mensagens juntas.
3. `tx()` abre transação: grava o dado, `addAudit` (campo a campo, de/para) e `addTimeline` (frase legível). Se algo falha, `ROLLBACK`.
4. Excluir é sempre **exclusão lógica** (`deleted_at`/`deleted_by`). Auditoria, linha do tempo e histórico de etapas são **somente-inserção** (gatilho no banco `crm_block_history_mutation`).

### 3. Negócio: criar, mover, ganhar, perder
1. **Criar** (`POST /deals` → `createDeal`): exige empresa (`companyId`), título e etapa **em aberto** (padrão: 1ª etapa aberta do funil, ou do funil padrão). `upsell` só para empresa com `relationship='client'`. Sem `ownerId`, o responsável é quem criou. Se vier `items[]`, o valor = soma dos itens (nome do item é um retrato do momento; produto inativo é recusado). Cria a 1ª linha de `crm_deal_stage_history`.
2. Depois de criar, a rota chama `cadenceAfterMove` (agenda o passo 1 da cadência da etapa), exceto com `skipCadence:true`.
3. **Mover** (`POST /deals/:id/move` → `moveDeal`): etapa precisa ser do mesmo funil. Se a etapa destino é `lost`, exige `lostReason` válido (e `lostDetail` se for `outro`). Atualiza etapa, situação, `stage_entered_at`, `closed_at`, ordem no quadro; grava histórico de etapa (com dias na etapa anterior), auditoria e linha do tempo.
4. **Ganhar** (etapa `won`): se a empresa era `prospect` ou `former_client`, vira `client` com `client_since` = hoje (registrado na linha do tempo). Depois roda `applyWonAutomation` (item 6).
5. **Reabrir**: mover de etapa fechada para aberta zera `closed_at` e o motivo da perda e gera evento `deal_reopened`.
6. **Automação ao ganhar** (`automation.js`): se o funil tem regra (`on_won_pipeline_id`, `on_won_stage_id`, opcional `on_won_from_stage_id`), cria **cópia em aberto** no funil/etapa destino (empresa, título, valor, MRR, dono, contato, origem, descrição, itens, tags). `external_source='auto-won'` + id do original: ganhar de novo não duplica.
7. Depois do `move`, a rota chama `cadenceAfterMove`: cancela passos abertos de etapa antiga (ou se o negócio fechou) e agenda o passo 1 da cadência da etapa nova. É **melhor esforço**: erro vai para o log e não derruba o movimento.

### 4. Cadência de follow-up
1. Configurada por **etapa** aberta (1 por etapa — índice único `crm_cadences_stage_uidx`), 1 a 8 passos `{title, type, days 0–90}` (`extras.js: cleanSteps`).
2. Entrou na etapa → agenda a atividade do passo 1 (data = hoje + `days`, responsável = dono do negócio ou quem moveu). Concluiu o passo → `cadenceAfterComplete` agenda o seguinte (dias contados da conclusão), se o negócio segue aberto na mesma etapa e não há outro passo aberto.
3. Os passos são atividades comuns (`cadence_id`, `cadence_step`): aparecem na Agenda, têm auditoria e vão ao Google.
4. Cadência só vale para negócios que **entram** na etapa depois de criada. Importadores e `skipCadence` não disparam.

### 5. Atividade, lembrete e Google
1. `createActivity`: título e data obrigatórios; empresa obrigatória; negócio e contato precisam ser **da mesma empresa**; `alreadyDone:true` registra como realizada (data não pode ser futura). Quem recebe atividade de outra pessoa ganha notificação (`crm_activity_assigned`), salvo `silentNotify`.
2. Concluir ligação/e-mail/reunião/WhatsApp/visita conta como "última interação" da empresa; tarefa e follow-up não (`INTERACTION_TYPES`).
3. **Lembretes** (`scheduler.js`): a cada **10 min** (primeira rodada 30 s após o boot) um `UPDATE … RETURNING` marca `due_notified_at` e cria notificação `crm_activity_due` para o responsável de cada atividade aberta com data ≤ hoje ainda não avisada. **Antes das 7h de Brasília não avisa.** O carimbo no mesmo `UPDATE` evita aviso duplo com duas instâncias. Não avisa usuário bloqueado nem `role='cliente'`.
4. Atividade criada/reagendada já vencida ou de hoje nasce com `due_notified_at` preenchido (quem criou sabe).
5. **Espelho no Google Calendar** (`googleSync.js`, registrado no gancho `activityHooks.after`): criar/editar → cria/atualiza o mesmo evento (id em `crm_activity_google`); concluir → título ganha "✔"; cancelar/excluir → apaga; trocar responsável → move de agenda. Dono sem Google conectado: nada acontece (409 tratado em silêncio). Evento **sem convidados**, 30 min se há horário, dia inteiro se não. Pela chave de API o espelho fica desligado, a menos que o corpo traga `syncGoogle:true`; `silentNotify` também desliga.
6. A **Agenda do painel** mostra as atividades abertas do usuário (`crmAgendaEvents`) e esconde o evento duplicado do Google (`linkedGoogleEventIds`).

### 6. Ler (telas)
- **Empresas**: `GET /companies` (lista paginada + estatísticas) → ficha `GET /companies/:id` (empresa, contatos, projetos do cronograma, notas, negócios, atividades, KPIs).
- **Negócios**: `GET /board` (quadro por etapa) ou `GET /deals` (lista); ficha `GET /deals/:id` (negócio, itens, atividades, histórico de etapas, linha do tempo, notas).
- **Visão geral**: `GET /overview?lens=mine|team|revenue|accounts`.

## Rotas desta área
Tudo sob `/api/crm` (cookie) e espelhado em `/api/connect/crm` (chave). Todas exigem `read` antes da regra da linha. Lista completa gerada: `docs/gerado/ROTAS.md`, grupo `/api/crm`.

| Método | Caminho | Quem pode (conferido) | Entrada principal | Saída | Erros comuns |
|---|---|---|---|---|---|
| GET | `/me` | read | — | `{capabilities}` | 403 sem CRM |
| GET | `/options` | read | — | usuários, funis/etapas, produtos, motivos de perda, origens, enums | — |
| GET | `/overview` | read; com `lens`: só painéis do perfil | `lens` | painel (JSON) | 400 painel inválido; 403 "Este painel não faz parte do seu perfil." |
| GET/POST/PATCH/DELETE | `/views`, `/views/:id`; PUT `/views-default` | read (pessoal); compartilhar = `funnel` | `scope`, `name`, `config`, `shared` | `{view}` | 403 "Só gestores compartilham…"; 409 nome repetido; 400 limite de 30 |
| GET | `/search` | read | `q` (mín. 2) | `{deals, companies, contacts}` (8 cada) | — |
| GET | `/cnpj/:cnpj` | write | 14 dígitos | `{found, suggestion, duplicates, fromCache}` | 400 "CNPJ inválido. Confira os 14 dígitos." |
| GET | `/companies` | read (`deleted=true`: admin) | `q, relationship, ownerId, segment, state, taxRegime, source, sort, limit≤200, offset` | `{total, items[]}` | 403 excluídas |
| POST | `/companies/check-duplicates` | write | `cnpj, legalName, tradeName, excludeId` | `{exactCnpj, byName[]}` | — |
| POST | `/companies` | write | campos de `COMPANY_SPEC`, `force` | 201 `{company}` | 400 validação; 409 CNPJ (`blocking:true`) ou nome parecido (`blocking:false`) |
| GET | `/companies/:id` | read | — | ficha 360 | 404 |
| PATCH | `/companies/:id` | write | campos, `force` | `{company}` | 400/404/409 |
| DELETE | `/companies/:id` | remove | — | `{ok}` | 404 |
| POST | `/companies/:id/restore` | admin | — | `{company}` | 404; 409 CNPJ já usado |
| POST | `/companies/:id/merge` | remove | `intoId` (empresa que fica) | `{ok, targetId, sourceId, moved{}}` | 400 iguais; 404 |
| GET | `/companies/:id/timeline` | read | `limit≤200, before` | `{events[]}` | 404 |
| GET | `/companies/:id/audit` | remove | — | `{logs[]}` (até 100) | — |
| POST/DELETE | `/companies/:id/projects[/:projectId]` | write | `projectId` | `{ok}` | 404; 409 projeto já ligado a outra empresa |
| GET | `/companies/by-project/:projectId` | read | — | `{company}` | 404 "Esta empresa ainda não está no CRM." |
| GET | `/projects-available` | write | — | projetos sem empresa | — |
| GET | `/contacts`, `/contacts/:id` | read | `q, companyId, decisionRole, limit≤500` | `{total, items}` | 404 |
| POST | `/contacts/check-duplicates`, `/contacts` | write | `email, phone, whatsapp`, `companyId, firstName…`, `force` | 201 `{contact}` | 409 duplicado (aviso); 404 empresa |
| PATCH | `/contacts/:id` | **write** | campos | `{contact}` | 404 |
| DELETE | `/contacts/:id` | **remove** (gestor+; antes era `write`, 2026-10-29) | — | `{ok}` | 403, 404 |
| GET | `/pipeline`, `/pipelines` | read | `pipelineId` | funil(is) e etapas | — |
| POST/PATCH/DELETE | `/pipelines`, `/pipelines/:id`, POST `/pipelines/:id/stages` | funnel | `name`, `stages[]`, `isDefault`, `onWon` | `{pipelines[]}` | 409 nome repetido / funil padrão / funil com negócios; 409 etapa com negócios; 400 etapas |
| GET | `/board` | read | `pipelineId, q, type, ownerId, source, tag, attention` | `{attention, pipeline, pipelines, stages[{deals[]}]}` | — |
| GET | `/deals` | read | filtros abaixo | `{total, totalValue, totalWeighted, items[]}` | — |
| GET | `/deals/export.xlsx` | **export** (gestor+, 2026-10-29) | mesmos filtros de `/deals` | arquivo `.xlsx` + cabeçalhos `X-Export-Count`, `X-Export-Total` | — |
| GET | `/deals/:id` | read | — | negócio completo | 404 |
| POST | `/deals` | write | `companyId, title, pipelineId, stageId, value, items[], ownerId, externalSource+externalId, skipCadence…` | 201 `{deal, cadence}` | 400/404; 409 chave externa repetida |
| PATCH | `/deals/:id` | write (negócio **fechado**: só `remove`) | campos, `items[]` | `{deal}` | 403 "Negócio já fechado: só gestores podem editar." |
| POST | `/deals/:id/move` | write | `stageId, lostReason, lostDetail` | `{deal, cadence}` (+ `autoCopy`) | 400 "Escolha o motivo da perda."; 404 etapa |
| DELETE | `/deals/:id` | remove | — | `{ok}` | 404 |
| GET | `/deals/:id/audit` | remove | — | `{logs[]}` | — |
| PUT | `/deals/:id/tags` | write | `tags[]` (≤30) | `{tags[]}` | 400 |
| POST | `/leads` | write | `companyName, contactName, phone, email, cnpj, companyData, title, source, force` | 201 `{deal, company, contact, cadence}` | 409 empresa parecida |
| GET/POST/PATCH/DELETE | `/cadences[/:id]` | read / funnel | `pipelineId, stageId, name, steps[], active` | `{cadence}` | 409 "Esta etapa já tem uma cadência"; 400 passos |
| GET | `/tags` | read | — | tags com contagem | — |
| GET | `/activities`, `/activities/:id` | read | `ownerId (me), companyId, dealId, type, q, status, bucket, limit≤300` | `{total, counts, items}` | 404 |
| POST | `/activities` | write | campos, `alreadyDone`, `silentNotify` (só chave/RENATA) | `{activity}` | 400; 409 "Só dá para editar atividade em aberto." |
| PATCH / POST | `/activities/:id`, `/activities/:id/complete`, `/cancel`, `/reopen` | write **e** ser o responsável, o criador ou ter `remove` (gestão) — `ownActivity`, 2026-10-29 | campos / `outcome` (≤3000) | `{activity, next}` | 403 "Só o responsável pela atividade, quem a criou ou a gestão pode alterá-la."; 409 estado inválido |
| DELETE | `/activities/:id` | remove | — | `{ok}` | 404 |
| GET/POST/PATCH/DELETE | `/products[/:id]` | read / catalog | `name, category, listPrice, billing, active`; `?all=true` (catalog) | `{product(s)}` | 409 nome repetido |
| POST/PATCH/DELETE | `/notes[/:id]` | write | `entityType (company/contact/deal), entityId, body≤5000, attachments≤5, links, mentions` | `{note}` | 400; 403 só a própria nota (editar); delete: moderador = `remove` |
| GET | `/notes/:noteId/attachments/:attId` | read | — | arquivo (imagem/PDF) | 404 |
| GET | `/import/fields` · POST `/import/preview`, `/import/commit` | import | `target (companies/contacts), rows[≤2000]` | contagens por status / `{created, skipped, failed[]}` | 400 limite de linhas |
| GET | `/import/deals/fields` · POST `/import/deals/preview`, `/commit` | import | `rows[≤2000], ownerMap` | idem | 400 |
| GET/POST | `/bootstrap/preview`, `/bootstrap/commit` | import | `keys[], withContacts` | `{created, linkedToExisting, projectsLinked…}` | — |
| GET | `/deals/:id/files`, `/deal-files/:fileId/download` | **export** (gestor+, 2026-10-29) | — | lista / arquivo (BYTEA) | 404 |
| GET/POST | `/migration/piperun/*` | **admin** | ver "Importadores" | JSON | 409 execução em andamento |

**Filtros de `GET /deals` e `/board`** (`dealFilters`): `q` (título, descrição, empresa, contatos, tags, notas do negócio e da empresa, atividades; sem acento/maiúscula), `type` (new/upsell), `ownerId` (id ou `none`), `pipelineId`, `source`, `tag` (várias, separadas por `|` ou repetidas; o negócio precisa ter **todas**), `attention` (`late`, `nonext`, `stalled` = +14 dias na etapa, `overdue` = previsão vencida), `companyId`, `externalSource`, `externalId`; só na lista: `status` (`open` padrão, `won`, `lost`, `all`), `stageId`, `sort` (`value`, `close`, `stage`; padrão `updated_at` desc), `limit≤200`, `offset`.

## Dados

### Tabelas (colunas completas: `docs/gerado/BANCO.md`)
| Tabela | O que guarda | Escrita |
|---|---|---|
| `crm_companies` | Empresa. `name_norm` (chaves de nome para duplicidade), `cnpj` (único por base entre não excluídas), `relationship` (prospect/client/former_client/partner), dono, endereço, `cnae_secondary`… | grava / exclusão lógica |
| `crm_contacts` | Contato da empresa. `is_primary` (o 1º vira principal sozinho), `decision_role`, `influence`, `relationship_strength`. | grava / lógica |
| `crm_deals` | Negócio. `pipeline_id`, `stage_id`, `status` (open/won/lost), `value`, `mrr`, `probability_override`, `lost_reason`, `closed_at`, `stage_entered_at`, `board_order`, `external_source`+`external_id` (único quando preenchido). | grava / lógica |
| `crm_deal_items` | Itens do negócio (produto, nome-retrato, quantidade, preço). Substituídos por inteiro a cada edição de itens. | grava (apaga e reescreve) |
| `crm_deal_stage_history` | Percurso de etapas (de/para, dias na etapa, quem, quando). **Somente-inserção.** | só insere |
| `crm_deal_files` | Documentos do negócio (BYTEA), vindos da migração. | grava / lógica |
| `crm_deal_tags` + `crm_tags` | Tags (nome único sem diferenciar caixa por base). | grava |
| `crm_pipelines` + `crm_pipeline_stages` | Funis e etapas (`kind` open/won/lost, `probability` 0–100, `sla_days`, `position`). Colunas `on_won_*` = automação ao ganhar. Arquivar = `deleted_at`. | grava / lógica |
| `crm_cadences` | Regra por etapa: `steps` JSONB `[{title,type,days}]`, `active`. | grava / lógica |
| `crm_activities` | Atividade: tipo (task/call/email/meeting/whatsapp/visit/followup), prioridade (low/normal/high), `status` (open/done/cancelled), `due_date`, `due_time` (texto HH:MM), `due_notified_at`, `outcome`, `cadence_id/step`. | grava / lógica |
| `crm_activity_google` | Elo atividade ↔ evento do Google (`user_id`, `google_event_id`). | grava |
| `crm_notes` | Nota em empresa/contato/negócio; `attachments` e `links` JSONB; `author_name` (autor exibido quando a nota veio de chave de API ou da migração). | grava / lógica |
| `crm_products` | Catálogo (`billing` one_time/recurring, `active`). | grava / lógica |
| `crm_saved_views` + `crm_view_defaults` | Visões salvas (JSONB `config`) e a visão/painel inicial por pessoa. | grava / lógica |
| `crm_company_projects` | Ligação empresa ↔ projeto do cronograma (`project_id` único). | grava / apaga |
| `crm_timeline_events` | Linha do tempo da empresa (frase pronta + `data` JSONB). **Somente-inserção.** | só insere |
| `crm_audit_logs` | Auditoria campo a campo (`changes` JSONB), com `actor_name`. **Somente-inserção.** | só insere |
| `cnpj_cache` | Resposta da Receita por CNPJ (60 dias). Sem `org_id` (dado público). | grava |
| `piperun_raw`, `piperun_map`, `piperun_runs` | Cópia bruta, mapa de ids e execuções da migração. | ver migração |
| `api_token_actions` | Gravações feitas por chave de API (método, caminho, status; sem corpo). | só insere |

Colunas no `users`: `crm_role` (vazio = sem acesso).

### Regras de dados
- **`org_id`**: todas as leituras e escritas filtram por base (`orgOf`). Responsável (`ownerId`) precisa ser usuário da mesma base (`assertUserInOrg` → 400 "Responsável inválido.").
- **Exclusão lógica** em empresa, contato, negócio, atividade, nota, produto, funil/etapa, cadência, visão. Não existe exclusão definitiva pelo CRM.
- **Esquema aditivo**: tabelas nascem em `server/db.js` (`initDb`) e nas funções `ensure*Schema` de `extras.js`, `views.js`, `automation.js`, `googleSync.js`, `piperun/schema.js`.
- **Estrutura JSON de visão salva** (`cleanConfig`): `{view: board|list, pipelineId, q, type, ownerId (id|me|none), source, tag ("a|b"), attention, listStatus}`; chave desconhecida é descartada.
- **Probabilidade do negócio** = 100 se ganho, 0 se perdido, senão `probability_override` ou a da etapa. `weightedValue` = valor × probabilidade.
- **Completude da conta** (`completeness.js`): 8 itens de peso igual (CNPJ, segmento, regime, ERP, decisor, contato principal, faturamento, interação registrada).
- **Duplicidade**: empresa com mesmo CNPJ = bloqueia (409 `blocking:true`); nome com similaridade ≥ 0,85 = só avisa (409 `blocking:false`, repetir com `force:true`). Contato: mesmo e-mail ou últimos 9 dígitos do telefone/WhatsApp = aviso.

## Permissões por perfil (`crm_role`)
Fonte: `server/crm/permissions.js`. `master` e super admin viram **admin do CRM** sozinhos; `role='cliente'` **nunca** acessa, mesmo com `crm_role`. Quem define o `crm_role` de um usuário é um **master**, na tela Usuários (`PATCH /users/:id`, `requireMaster`, `routes.js`).

| Capacidade | admin | diretor | gestor | vendedor | consultor | financeiro | visualizacao |
|---|---|---|---|---|---|---|---|
| `read` | sim | sim | sim | sim | sim | sim | sim |
| `write` | sim | sim | sim | sim | sim | não | não |
| `remove` | sim | sim | sim | não | não | não | não |
| `import` | sim | sim | sim | não | não | não | não |
| `catalog` | sim | sim | sim | não | não | não | não |
| `funnel` | sim | sim | sim | não | não | não | não |
| `admin` | sim | não | não | não | não | não | não |

Painéis (`LENSES_BY_ROLE`; o 1º é o que abre): admin/diretor/gestor = team, mine, revenue, accounts · vendedor/consultor = mine, accounts · financeiro = revenue, accounts · visualizacao = team, revenue, accounts.

**Onde cada rota confere** (resumo; a tabela de rotas tem o detalhe): `read` = a barreira geral (`router.use(need('read'))`); `write` = criar/editar empresa, contato, negócio, atividade, nota, tags, lead rápido, mover negócio, consulta de CNPJ, projetos vinculados; `remove` = excluir empresa/negócio/atividade/**contato**, unir empresas, ver auditoria, editar negócio fechado, moderar nota; `import` = `/import/*` e `/bootstrap/*`; `export` (nova, mesma régua de gestão: admin/diretor/gestor) = Excel de negócios e arquivos importados do PipeRun (`caps.export` esconde o botão e a seção de arquivos); `catalog` = produtos; `funnel` = funis, etapas, cadências e compartilhar visão; `admin` = restaurar empresa, ver empresas excluídas, migração PipeRun.

**O que a tela esconde × o que o servidor garante**
| Item | Servidor garante? |
|---|---|
| Botões Criar/Importar/Funis/Migrar, aba Auditoria, Excluir | Sim: cada rota tem `need(...)`. O botão só some por conforto (`caps.*` vem de `GET /me`). |
| Painéis por perfil | Só a rota **com** `lens` confere (403). o filtro "meu" das demais listas é de tela; detalhe do ponto de endurecimento em `docs/11` (privado). |
| Negócio fechado "só gestor edita" | `PATCH /deals/:id` confere (403). `POST /deals/:id/move` num negócio já fechado exige `remove` (gestor+), igual ao `PATCH` (403 "Negócio já fechado…"); teste em `scripts/crm-eduarda.test.mjs`. |
| Excluir contato | `DELETE /contacts/:id` exige `remove` (gestor+) desde 2026-10-29 (exclusão lógica, com auditoria). Vendedor/consultor não excluem: a tela esconde o botão. |

## Tipos de leitura e de saída
| Leitura | Formato | Limites/ordenação |
|---|---|---|
| Listas (`/companies`, `/contacts`, `/deals`, `/activities`) | JSON `{total, items}` (+ `totalValue/totalWeighted` em negócios; `counts` em atividades) via `count(*) OVER()` | empresas e negócios `limit` ≤ 200 (padrão 50); contatos ≤ 500; atividades ≤ 300 (padrão 100); empresas: ordem `lower(legal_name)` ou `recent`; negócios: padrão `updated_at` desc |
| Quadro `/board` | JSON por etapa | abertos + fechados dos últimos **60 dias** (`BOARD_CLOSED_DAYS`); o filtro `attention` é aplicado em memória |
| Ficha da empresa / do negócio | JSON agregado | notas da empresa (100), linha do tempo da empresa (50/200), do negócio (60); anexos de nota vêm **sem conteúdo**, com `url` própria |
| Painéis `overview?lens=` | JSON calculado na hora | "Contas" lê **todas** as empresas da base para calcular completude (custo cresce com a base) |
| Busca `/search` | JSON | 8 por tipo, mínimo 2 caracteres; busca de negócios da lista é mais ampla (inclui notas/atividades), a global não |
| Anexo de nota, arquivo de negócio | binário (`Content-Type` validado; `nosniff`; CSP restritivo no anexo) | cache privado |
| **Excel** `/deals/export.xlsx` | `.xlsx` com título, subtítulo do filtro, cabeçalho fixo, filtro, links de e-mail/WhatsApp; 19 colunas (`DEAL_COLUMNS`) | até **5.000** linhas (`EXPORT_MAX_ROWS`); páginas internas de 200; cabeçalhos `X-Export-Count/Total`; `Cache-Control: no-store`; nome `negocios[-tag]-AAAA-MM-DD.xlsx` |

Datas de dia (`due_date`, previsão) viajam como texto `YYYY-MM-DD`; "hoje" é sempre o de Brasília (`todayBR`).

## Importadores e migração
| Fluxo | Onde | Quem | Como funciona |
|---|---|---|---|
| Planilha de empresas/contatos | `importer.js`, `ImportWizard.jsx` | `import` | O navegador lê o arquivo e mapeia colunas; o servidor recebe linhas prontas (≤ 2.000). **Prévia** classifica (`new`, `duplicate`, `possible_duplicate`, `invalid`) sem gravar; **commit reclassifica no servidor** (não confia na prévia) e cria só `new` (e `possible_duplicate` se `includePossibleDuplicates`). Nome "Nome não informado" é recusado. Valor ruim em campo de apoio (data, CEP, e-mail) vira aviso, não erro. |
| Planilha de negócios | `dealImporter.js`, `DealImportWizard.jsx` | `import` | Feito para o export "Oportunidades" do PipeRun. Lixeira é descartada; sem empresa ou empresa fora do CRM vai para a lista "ficou de fora"; congelada entra aberta; perdido sem motivo recebe `nao_informado`; ganho promove a empresa a cliente na data do fechamento; cria funis/etapas que faltam; idempotente por `external_id` (Hash do PipeRun). |
| Clientes do cronograma | `bootstrap.js`, `BootstrapDialog.jsx` | `import` | Lê `projects` (só leitura), agrupa por CNPJ, cria empresa `client` e liga o projeto; áreas do cliente podem virar contatos. |
| **Migração PipeRun** | `piperun/*`, `PipeRunMigration.jsx` | **só `admin`, só pela tela** | Ver abaixo. |
| Leads do evento 22–23/10 | `scripts/crm-evento-import.mjs` | quem tem a chave `crm_operate` | Usa a API (`/api/connect/crm`), repetível por `origem_id`. Detalhe e mapeamento: `docs/CRM_IMPORTACAO_EVENTO.md`. |

### Migração PipeRun (resumo; roteiro: `docs/MIGRACAO_PIPERUN.md`; parecer: `docs/AUDITORIA_MIGRACAO_PIPERUN.md`)
1. **Extrair** (`POST /migration/piperun/extract`, corpo `{token}`): responde **202 `{runId}`** e roda em segundo plano. `client.js` só faz GET (limite 120 req; espera em 429; 350 ms entre chamadas). Grava cada recurso em `piperun_raw` (19 recursos em `RESOURCES` + CNAEs). O token só vive na memória da execução.
2. **Revisar** (`GET /migration/piperun/preview`): conta o que seria criado, casa donos/autores com usuários do CRM (`ownerMap`), **não grava**.
3. **Importar** (`POST /migration/piperun/import`): fases em ordem — empresas, empresas provisórias (negócio sem empresa), contatos, funis completos + produtos, negócios, histórico real de etapas, tags/MRR/previsão, formulários/assinaturas, notas e propostas, imagens das notas, atividades, documentos, reparo de autoria. Cada registro numa transação própria; erro de um não derruba os outros (até 400 problemas listados). Repetível: `piperun_map` + `crm_deals.external_id` impedem duplicar.
4. **Conferir** (`GET /migration/piperun/report`): compara cópia bruta × CRM (contagens, valor por situação e por funil, lista de divergências).
5. **Apagar a cópia bruta** (`POST /migration/piperun/purge`, exige `confirm:true`): remove `piperun_raw` (dados pessoais); `piperun_map` fica.
6. Só **uma** execução por vez por base (`startRun`; execução presa há mais de 45 min é dada como falha). Extras: `POST /raw/histories` (até 20.000 eventos) e `/raw/deal-tags` (até 2.000).
7. **Estado conhecido**: o parecer de 25/10 foi **NÃO APROVADO para cancelar o PipeRun** (pendências: imagens de notas, 143 empresas provisórias a completar). Veja o arquivo antes de afirmar que a migração "está pronta".

## Operação por chave de API (`/api/connect/crm`)
1. `server/connect.js` monta o **mesmo** `createCrmRouter` com autenticação trocada por `crmViaToken`. Mesmas rotas, mesmas validações e auditoria. `bearer` exige a chave `pxk_…`; limite 120 requisições por minuto por chave; chave expirada, revogada ou dono bloqueado → 401/403.
2. **Escopos que entram** (`crmViaToken`):
   - `read_all`: só `GET`/`HEAD`; `/migration` bloqueado; dono precisa ter `read` no CRM.
   - `crm_operate` ou `write_all`: qualquer método, **desde que o dono seja admin do CRM** (`crmCan(apiUser,'admin')`, senão 403 "O dono da chave deixou de ser administrador do CRM."). Gerar essas chaves também exige admin do CRM (`POST /tokens`).
   - Outros escopos (`read`, `read_create`…): 403 "Esta chave não acessa o CRM."
3. **Ator "Claude Code"**: `req.crmActor = {id: dono, name: "Claude Code" (se o dono se chama Claude Code) ou "Claude Code (por <dono>)", viaApi: true}`. `actorOf` usa isso em auditoria, linha do tempo, histórico de etapa e **autor da nota** (`crm_notes.author_name`).
4. **Registro**: toda chamada que não é GET entra em `api_token_actions` (método, caminho sem query, status, inclusive 403). Visível em Meu perfil › Conectar.
5. **Fora do alcance de propósito**: escrita da migração do PipeRun (`CRM_BLOCKED = /^\/migration(\/|$)/` → 403 em método ≠ GET); exclusão definitiva (não existe); usuários, senhas e tokens (não são rotas do CRM).
6. **Parâmetros que só a chave/RENATA usam**: `silentNotify:true` em `PATCH /activities/:id` (reatribui sem avisar; para lote); `syncGoogle:true` (liga o espelho do Google, que por chave vem desligado); `skipCadence:true` em `POST /deals`; `externalSource`+`externalId` em `POST /deals` (esses dois e `skipCadence` valem também pela tela).
7. Regra do Rafael no `CLAUDE.md`: gravar só por esta chave (nunca pelo cookie dele nem SQL em produção); descrever, gravar, **ler de volta**; mais de ~20 registros = prévia primeiro. Se o harness recusar, parar e explicar.
8. `super admin` com `?asOrg=` troca de base também por aqui (herdado de `effectiveOrgId`).

## RENATA e o CRM (`server/renata/tools/crm.js`)
52 ferramentas (registradas em `registerCrm`); cada uma chama a **mesma rota** que a tela, em nome do usuário, com a permissão dele (`cap` da ferramenta = `crmCan`). A auditoria sai como "RENATA (IA, a pedido de <nome>)". Escrita crítica (`risk:'critical'`) e configuração (`confirm:'always'`) pedem confirmação; várias têm "Desfazer". `server/renata/policy.js` **bloqueia** para a IA: migração PipeRun, unir empresas e importações/bootstrap.

| Grupo | Ferramentas |
|---|---|
| Consulta | `crm_buscar`, `crm_listar_opcoes`, `crm_listar_empresas`, `crm_ver_empresa`, `crm_historico_empresa`, `crm_listar_contatos`, `crm_listar_negocios`, `crm_ver_negocio`, `crm_listar_atividades`, `crm_ver_atividade`, `crm_painel`, `crm_listar_funis`, `crm_listar_produtos`, `crm_listar_cadencias`, `crm_listar_tags`, `crm_consultar_cnpj` |
| Empresas/contatos | `crm_criar_empresa`, `crm_atualizar_empresa`, `crm_excluir_empresa`, `crm_vincular_projeto`, `crm_criar_contato`, `crm_atualizar_contato`, `crm_excluir_contato` |
| Negócios | `crm_criar_negocio`, `crm_criar_lead_rapido`, `crm_atualizar_negocio`, `crm_mover_negocio`, `crm_fechar_negocio_ganho`, `crm_fechar_negocio_perdido`, `crm_excluir_negocio`, `crm_definir_tags_negocio` |
| Atividades | `crm_criar_atividade`, `crm_atualizar_atividade`, `crm_concluir_atividade`, `crm_reabrir_atividade`, `crm_cancelar_atividade`, `crm_excluir_atividade` |
| Notas | `crm_registrar_nota`, `crm_editar_nota`, `crm_excluir_nota` |
| Catálogo/funis/cadências | `crm_criar_produto`, `crm_atualizar_produto`, `crm_excluir_produto`, `crm_criar_funil`, `crm_atualizar_funil`, `crm_arquivar_funil`, `crm_salvar_etapas`, `crm_criar_cadencia`, `crm_excluir_cadencia` |
| Lote | `crm_lote_atualizar_negocios`, `crm_lote_atualizar_atividades` (até 100 ids; só responsável/previsão/origem e responsável/data/prioridade; sempre confirmam), `crm_lote_restaurar_valores` (interna, só para o "Desfazer"; não é oferecida à IA) |

Não existe ferramenta para: editar cadência existente, restaurar empresa, exportar Excel, ver auditoria, visões salvas, unir empresas.

## Front: leitura e gravação na tela
- **Gravar**: ações em `crm.*` (`crmApi.js`) → recarregam a lista (`refreshKey` em `CrmScreen`). O quadro move o cartão **antes** do servidor responder (`boardMove.js`), mostra "Movido para …" com Desfazer, repete até 3 vezes em falha de rede/5xx (`src/lib/saveRetry.js`) e volta atrás se o servidor recusar.
- **Edição direta**: na lista de Negócios as células (`InlineCells.jsx`) salvam ao sair do campo (etapa, valor, previsão, responsável…).
- **Aviso de descarte**: todos os modais editáveis usam `guardedModal` (avisa antes de perder alteração).
- **Rotas do navegador**: `/crm` (`src/lib/routes.js`, exige `user.crmAccess`); link `…/crm?negocio=ID` ou `?empresa=ID` abre direto a ficha (usado pelo evento do Google e por "Copiar link").
- **DateField/TimeField** (`src/ui/DateTimeFields.jsx`): digita `dd/mm/aaaa` ou abre calendário (react-day-picker, posição fixa); `TimeField` de 15 em 15 min.

## Regras e travas
| Trava | O que impede | Onde é garantida | O que o usuário vê |
|---|---|---|---|
| Barreira `read` | Qualquer rota sem acesso ao CRM | `routes.js` `router.use(need('read'))` | 403 "Você não tem permissão pra isso no CRM." |
| `cliente` nunca entra | Cliente do painel abrir o CRM | `permissions.js crmRoleOf` | 403 |
| CNPJ inválido | Dígito verificador errado | `service.js sanitize` + `cnpj.js isValidCnpj` | 400 "CNPJ inválido." |
| CNPJ único por base | Duas empresas ativas com o mesmo CNPJ | índice `crm_companies_org_cnpj_uidx` + `findCompanyDuplicates` | 409 "Já existe uma empresa com este CNPJ." |
| Nome parecido | Duplicar empresa sem perceber | `duplicates.js` (limiar 0,85) | 409 "Possível registro duplicado." (repetir com confirmação/`force`) |
| Upsell só em cliente | Upsell em prospect | `deals.js createDeal/updateDeal` | 400 "Upsell só existe para empresas que já são clientes." |
| Negócio novo em etapa aberta | Criar já ganho/perdido | `deals.js createDeal` | 400 "Um negócio novo precisa começar numa etapa em aberto." |
| Motivo de perda | Perder sem motivo; "Outro" sem detalhe | `deals.js moveDeal` | 400 "Escolha o motivo da perda." / "Descreva o motivo da perda." |
| Contato/negócio da mesma empresa | Misturar empresas | `deals.js`, `activities.js` (`assertContactOfCompany`, `assertDealOfCompany`) | 400 "O contato precisa ser da mesma empresa…" |
| Negócio fechado | Edição por quem não é gestor | `deals.js updateDeal` (`canEditClosed` = `remove`) | 403 "Negócio já fechado: só gestores podem editar…" |
| Chave externa única | Mesmo lead do evento/importação duas vezes | `createDeal` + índice `crm_deals_external_uidx` | 409 "Já existe um negócio com a chave externa …" |
| Funil: estrutura | Funil padrão arquivado; funil/etapa com negócios removidos; etapa Ganho/Perdido renomeada | `funnels.js` | 409/400 com o motivo |
| Cadência: 1 por etapa | Duas cadências na mesma etapa | índice `crm_cadences_stage_uidx` + `saveCadence` | 409 "Esta etapa já tem uma cadência" |
| Atividade só editável aberta | Editar atividade concluída/cancelada | `activities.js updateActivityCore` | 409 "Só dá para editar atividade em aberto. Reabra-a antes." |
| Histórico imutável | Apagar/alterar auditoria, linha do tempo, histórico de etapas | gatilho `crm_block_history_mutation` (`db.js`) | erro do banco; nunca pela tela |
| Nota: só o autor edita | Editar nota de outra pessoa (nem admin) | `service.js updateNote` | 403 "Você só pode editar as suas próprias notas." |
| Nota: moderação | Remover nota alheia sem ser `remove` | `service.js deleteNote` | 403 |
| Nota ≤ 5.000 caracteres, ≤ 5 anexos (≤ 4 milhões de caracteres cada, em base64) | Notas gigantes | `addNote`, `cleanNoteExtras` | 400 |
| Importação ≤ 2.000 linhas | Estourar memória/tempo | `importer.js MAX_IMPORT_ROWS` | 400 |
| Uma migração por vez | Duas extrações/importações juntas | `piperun/runs.js startRun` | 409 "Já existe uma extração ou importação em andamento." |
| Purga com confirmação | Apagar a cópia bruta sem querer | `piperun/routes.js` | 400 "Confirme a exclusão da cópia bruta (confirm: true)…" |
| Migração só pela tela | Escrita da migração por chave | `connect.js CRM_BLOCKED` | 403 |
| Export ≤ 5.000 linhas | Planilha gigante | `dealExport.js` | cabeçalho `X-Export-Total` maior que `X-Export-Count`; subtítulo avisa "refine o filtro" |

## IA nesta área
- A **RENATA** opera o CRM só pelas 52 ferramentas acima (HTTP interno, mesmas travas e permissões). Prompt/modelo/`max_tokens`: ver o documento da RENATA em `docs/` (não repetido aqui).
- **Botão "Perguntar à RENATA"** nas fichas (`RenataAsk.jsx`): só existe quando a empresa tem projeto do cronograma vinculado e o usuário tem acesso a Empresas.
- Nenhum texto do CRM é enviado a modelo por rotina do servidor do CRM; o que a IA vê é o que a ferramenta devolve ao usuário que pediu.
- A IA **não cria** funil/produto/cadência sem confirmação (`confirm:'always'`) e **não** une empresas, importa planilhas nem migra do PipeRun (`policy.js`).

## Bugs e armadilhas conhecidos
| Sintoma | Causa | Onde foi tratado | Como não reintroduzir |
|---|---|---|---|
| "Arrastei o cartão e não gravou" (computador lento) | Quadro só mudava depois da volta do servidor; re-render de centenas de cartões; `drop` dependia de estado do React | §119, `boardMove.js`, `DealsPage.jsx` (id arrastado em `ref`, `DealCard` memoizado, retry) | Manter a mudança otimista; rodar `scripts/crm-board-move.test.mjs` |
| Calendário do navegador cortado em modal | `<input type="date">` nativo | §109, `src/ui/DateTimeFields.jsx` | Usar `DateField`/`TimeField` no CRM, não `<input type="date">` |
| Busca não achava "249,90" | Busca só em título/empresa | §111, `dealQueries.js dealFilters` | A busca de **Negócios** cobre notas, tags, contatos e atividades; a busca **global** do topo e as listas de Empresas/Contatos não |
| `ownerId=me` não funciona em `/deals`, `/board`, `/companies` e no Excel | Só `/activities` traduz `me` (`routes.js`); a tela troca `me` pelo id antes de chamar | `DealsPage.jsx applyConfig` | Mandar o **id** do usuário. A ferramenta `crm_listar_empresas` descreve "me", mas o servidor devolve lista vazia |
| Mesmo lead duplicado ao reimportar | Falta de chave externa | §58/§108, `external_source`+`external_id` | Todo importador deve preencher a chave |
| Cadência não agenda | Negócio criado com `skipCadence`, importado, ou entrou na etapa antes de a cadência existir; erro engolido em `cadenceAfterMove` (só `console.error`) | `extras.js` | Olhar o log do servidor ("Cadência (entrada/saída de etapa)") |
| Lembrete não chegou | Antes das 7h de Brasília; atividade criada já vencida (nasce "avisada"); dono sem usuário ativo/ é `cliente` | `scheduler.js` | Conferir `due_notified_at` e a hora |
| Atividade não aparece no Google | Dono não conectou o Google; chave de API (espelho desligado sem `syncGoogle`); falha só vai ao log | `googleSync.js` | Ler log "CRM→Google Calendar"; teste `crm-google-sync.test.mjs` |
| Empresa excluída "sumiu" | Exclusão lógica; só admin vê com `?deleted=true` e restaura | `service.js restoreCompany` | Restaurar em vez de recriar (CNPJ único) |
| Trocar de funil com negócios | Etapa/funil com negócio não pode ser removido | `funnels.js` | Mover os negócios antes |
| Migração apaga histórico "somente-inserção" | A fase "histórico real" **desliga o gatilho** `crm_deal_stage_history_append_only` dentro da transação (`ALTER TABLE … DISABLE TRIGGER`) | `piperun/migrate.js` (fase 4b) | Exceção única e proposital; só em negócios que ninguém moveu depois; exige dono da tabela |
| Quadro "perde" negócios fechados antigos | Quadro mostra fechados só dos últimos 60 dias; indicadores de conversão usam 90 | `dealQueries.js` | Para ver tudo, usar a Lista com `status=all` |
| `quickLead` deixa empresa pela metade | Empresa → contato → negócio não são uma transação única; falha no passo seguinte mantém o que foi criado | `extras.js quickLead` | Reenviar com `force`/usar a empresa criada |

## Como testar
Não há test runner; os scripts em `scripts/` rodam contra servidor e Postgres **locais** (sandbox `sandbox-eduarda.mjs`). Lista geral: `docs/gerado/TESTES.md`.
| Script | O que prova |
|---|---|
| `connect-crm.test.mjs` | Só admin gera chave; cookie não entra; criar/editar/mover/excluir pela chave; ator "Claude Code (por …)"; `api_token_actions`; migração recusada |
| `crm-eduarda.test.mjs` | Rotina do perfil Vendedor (cadastro, lead rápido, atividade, mover) |
| `views-dashboards.test.mjs` | Visões salvas e painéis por função |
| `crm-evento-import.test.mjs` | Importação do evento: prévia sem gravar, sem duplicar, preserva o que o time fez, tags/curvas |
| `crm-export-xlsx.test.mjs` | Excel com os mesmos filtros da tela |
| `crm-google-sync.test.mjs` | Espelho atividade → Google (Google simulado) |
| `crm-board-move.test.mjs`, `crm-move-sim.mjs` | Movimento otimista (puro) e 1.350 movimentos pela API |
| `piperun-migration.test.mjs` | Migração com API do PipeRun **simulada** |
| `scripts/e2e/crm-drag-*.mjs` | Arrasto real no Chromium (exige `playwright-core` fora do projeto) |

**Sem teste automático** (ou só manual): permissões de **todas** as rotas por perfil (só há amostras), scheduler de lembretes em produção, cadência ponta a ponta com várias etapas, Google real, extração real do PipeRun, Safari/Firefox/iPad no quadro.

## Receitas: "se o Rafael pedir X, faça Y"
1. **Novo campo na empresa** (ex.: "Inscrição estadual"): `server/db.js` (coluna aditiva, **só se o pedido pedir**; `CLAUDE.md` restringe `db.js`) → `service.js` (`COMPANY_SPEC`, `COMPANY_SELECT`) → `routes.js` não muda → `src/crm/CompanyForm.jsx` e `CompanyDrawer.jsx` → `importer.js` (`COMPANY_IMPORT_FIELDS`) se importável → atualizar `docs/gerado/BANCO.md` (gerado) e `PROJECT_CONTEXT.md`.
2. **Novo campo no negócio**: `deals.js` (`DEAL_SPEC`, `DEAL_SELECT`, `mapDeal`) → coluna → `DealForm.jsx`/`DealDrawer.jsx`; se for aparecer no Excel: `dealExport.js DEAL_COLUMNS`.
3. **Mudar permissão de um perfil**: só `permissions.js` (`CAPABILITIES`/`LENSES_BY_ROLE`); conferir `src/crm/crmMeta.js CRM_ROLE_OPTIONS` (rótulos); RENATA herda sozinha (`vis(cap)`); testar com `connect-crm.test.mjs`/`crm-eduarda.test.mjs`. Se o pedido é "vendedor não ver negócio dos outros", isso **não existe** hoje: precisa filtro por dono em `dealQueries.js`, `queries.js`, `activityQueries.js`, busca e Excel.
4. **Nova etapa/funil**: pela tela (Funis) ou `POST /pipelines` / `POST /pipelines/:id/stages` (precisa `funnel`; lista completa de etapas abertas, com `probability` obrigatória). Não mexa em código.
5. **Nova cadência**: `POST /cadences` (`pipelineId`, `stageId`, `steps`) — só vale para negócios que entrarem depois; para os que já estão na etapa, mover para fora e para dentro.
6. **Novo motivo de perda**: `pipeline.js` (`LOST_REASONS`) → aparece em `/options`; conferir `piperun/transform.js mapLostReason` se for do PipeRun.
7. **Nova coluna no Excel**: `dealExport.js DEAL_COLUMNS` (cabeçalho, largura, `get`, `kind`); `scripts/crm-export-xlsx.test.mjs`. Se mudar o limite: `EXPORT_MAX_ROWS`.
8. **Novo painel/indicador na Visão geral**: `dashboards.js` (função do painel) + `OverviewLenses.jsx`; se for painel novo, `views.js LENSES` e `permissions.js LENSES_BY_ROLE`; teste `views-dashboards.test.mjs`.
9. **Nova visão/filtro de negócio**: `dealQueries.js dealFilters` (SQL) + `views.js cleanConfig` (para a visão salvar) + `DealsPage.jsx` (`EMPTY_FILTERS`, `fieldsOf`) + `dealExport.js` (repassar o filtro na chamada `exportDealsXlsx` em `routes.js`).
10. **Dar à RENATA uma ação nova no CRM**: `server/renata/tools/crm.js` (`add({ name, cap, route, … })`; `risk`/`confirm`/`undo`); conferir `server/renata/policy.js`; rodar `scripts/renata-tools.test.mjs`.
11. **Importar nova planilha de leads**: preferir o padrão do evento (`scripts/crm-evento-import.mjs`): chave externa (`externalSource`+`externalId`), `skipCadence`, sem dono se não souber, prévia antes de `--apply`; usar a chave `crm_operate`.
12. **"Claude Code, mova/crie isto no CRM"**: seguir o `CLAUDE.md`: `export $(grep -E '^PRICETAX_(URL|CRM_TOKEN)=' .env | xargs)` → `curl` em `$PRICETAX_URL/api/connect/crm/...` → ler de volta. Mais de ~20 registros: prévia (contagem + 3 exemplos) e lotes. Transferência em lote de atividades: `silentNotify:true`.
13. **Lembrete errado/ausente**: `scheduler.js` (`MIN_HOUR_SP`, `INTERVAL_MS`) e notificações em `server/notifications.js`; conferir `due_notified_at`.
14. **Unir duas empresas duplicadas**: `POST /companies/:id/merge` com `{intoId}` (precisa `remove`; não é da RENATA). Move contatos, negócios, atividades, notas, arquivos e projetos; a absorvida fica excluída (restaurável por admin).
15. **Qualquer mudança**: atualizar `PROJECT_CONTEXT.md` (§54–§58 base; seção nova com data) e, se mudou rota/tabela, regenerar `docs/gerado/` (`scripts/docs-gen.mjs`).

## Não verificado / dúvidas
- Textos de §54–§58, §84–§85, §98 do `PROJECT_CONTEXT.md` não foram relidos por inteiro; as regras acima vêm do **código**.
- Comportamento de telas (React) foi conferido só por cabeçalhos/`grep` (permissões `caps.*`, chamadas de API); não abri `DealsPage.jsx`, `CompanyDrawer.jsx` etc. linha a linha.
- Detalhes internos de `piperun/transform.js` e `migrate.js` (regras de transformação campo a campo) não foram lidos; use `docs/MIGRACAO_PIPERUN.md` §3.
- `server/connect.js`: li `bearer`, `crmViaToken` e a geração de token; não conferi `GET /api/connect/actions` nem as demais rotas de conexão (ver doc de conectividade).
- Modelo/`max_tokens`/prompt da RENATA e o executor de ferramentas (`server/renata/*`, `internalCall.js`) não foram lidos; a descrição da confirmação/desfazer vem das definições em `tools/crm.js`.
- Não rodei nenhum teste nem consultei o banco; "52 ferramentas" é a contagem de `add({ name: …` no arquivo (inclui a interna `crm_lote_restaurar_valores`).
- Afirmei que `GET /overview` sem `lens` devolve dados da base inteira: confirmado em `routes.js` e `queries.js overview`, mas não testei por perfil.
- Não confirmei se o front de Negócios esconde "Exportar Excel" por perfil (a rota só pede `read`).
