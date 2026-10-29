# Módulos do dia a dia: Gestão de Atividades, Agenda, XFlow e Notificações
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza. Fonte da verdade: o código; este texto é o mapa.

## Em uma frase
Quatro módulos que a pessoa usa todo dia: o **quadro Kanban pessoal** (Gestão de Atividades / "Meu quadro"), a **Agenda** ligada ao Google Calendar, o **XFlow** (bugs e TASKs do time de desenvolvimento) e a **central de avisos** (sino, push no celular, tarefas vencidas e a "Mensagem do dia").

## Para quem é / quando ler (gatilhos)
Leia este documento quando o Rafael pedir algo como:
- "mudar o que o cartão do Meu quadro mostra / criar campo novo no cartão / mudar a ordenação".
- "a atividade sumiu / o texto sumiu / duas abas brigando" (quadro, 409, fusão).
- "compartilhar uma coluna ou página por link" / "fixar o quadro de outra pessoa".
- "Indicadores / dia da semana que mais abre e encerra".
- "a Agenda mostra compromisso que eu não aceitei" / "criar compromisso" / "reservar reunião na agenda".
- "conectar Google Calendar" / "o evento da TASK não foi para o Google".
- "novo status / nova ação no XFlow" / "quem pode aprovar / publicar / excluir TASK" / "SLA".
- "o sino não avisou" / "aviso no celular (push)" / "silenciar categoria" / "tarefa de reunião vencida avisar".
- "Mensagem do dia / evangelho / horóscopo / frase de inspiração / boas-vindas".

**Palavras-chave para busca (robô):** `personal_boards`, `PersonalBoardScreen`, `PublicBoardScreen`, `sendPersonalBoard`, `mergeBoards`, `mergeApiCards`, `sameStamp`, `baseUpdatedAt`, `mergeable`, `shareToken`, `linkedBoards`, `columnAsBoard`, `applyColumnPatch`, `syncCardEvents`, `personal_card_events`, `sanitizeNoteHtml`, `descFormat`, `personalExtras`, `listEvents`, `myResponse`, `rsvpOf`, `summarizeDay`, `upsertBlockEvent`, `company_calendar_events`, `xflow_tickets`, `xflow_events`, `canDo`, `checkTransition`, `XFLOW_TRANSITIONS`, `board_order`, `computeBallHolder`, `computeSlaState`, `createNotification`, `notifications`, `muted`, `todayHidden`, `schedulePushForNotification`, `push_subscriptions`, `runTodoReminders`, `daily_content`, `quoteOfDay`, `OFFICIAL_QUOTES`, `product_events`, `product_csat`.

## Mapa rápido

### A) Gestão de Atividades / Meu quadro
| Arquivo | Função/componente (conferido) | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/routes.js` | `GET /personal-board` (684), `/version` (696), `PATCH` (733), `/stats` (772), `/stats/day` (785) | Lê/grava o quadro inteiro; carimbo barato; indicadores | Tela (login, poll de 12 s, autosave) |
| `server/routes.js` | `mergeApiCards` (705), `sameStamp` (728) | Devolve ao quadro cartões criados pela API que a tela não conhecia; compara carimbos no milissegundo | `PATCH /personal-board` |
| `server/routes.js` | `findBoardByShareToken` (930), `columnAsBoard` (925), `resolveBackBoard` (953), `locateColumn` (1031), `applyColumnPatch` (1043), `addLinkedBoard` (1000) | Link público de página ou coluna, botão "Voltar", fixar quadro de outra pessoa | `GET/PATCH /public-board/:token`, `POST /personal-board/linked` |
| `server/db.js` | `blankPersonalBoard()` (103) | Quadro inicial: página "Minhas atividades" com A fazer / Em andamento / Concluído | Primeiro `GET /personal-board`; API de conectividade |
| `server/personalActivity.js` | `cardEventsOf`, `syncCardEvents`, `getActivityStats`, `getDayDetail` | Deriva eventos de abertura/encerramento/subatividade concluída do JSON e grava em `personal_card_events` | `PATCH` do quadro (privado e público), `GET /stats` |
| `server/richNote.js` | `sanitizeNoteHtml`, `noteToText`, `sanitizeBoardNotes` | Higieniza a descrição formatada (HTML curto) dos cartões | `PATCH /personal-board`, `PATCH /public-board/:token` |
| `server/personalExtras.js` | `readExtras`, `buildExtrasPatch`, `cleanShortcutUrl` | Anotações e atalhos da PESSOA (fora do quadro) | `GET/PUT /personal-extras` |
| `server/connect.js` | `POST /activities` (274), `GET /activities` (259) | Outra janela do Claude Code cria/lê cartões (`createdVia:'api'`) | Chave de API, ver `docs/CONECTIVIDADE_CLAUDE_CODE.md` |
| `server/renata/tools/board.js` | ferramentas do quadro | RENATA edita o quadro da pessoa (também grava em `personal_boards`) | Chat da RENATA |
| `src/App.jsx` | `sendPersonalBoard` (1451), `savePersonalBoardNow` (1471), `persistPersonalBoardDebounced` (1501), poll de 12 s (~1531), `mutatePersonalBoard` (1553), `genShareToken` (177) | Autosave 500 ms, 409+fusão, retentativa, poll de versão | Toda edição do quadro |
| `src/screens/PersonalBoard.jsx` (2.926 linhas) | `PersonalBoardScreen` (1413), `PublicBoardScreen` (2727), `addCard` (1831), `setCardStatus` (1858), `deleteCard` (1891), `moveCardToIndex` (1934), `mutateBoardTree` (1565), `sortCards` (93), `cardMatchesFilters` (133), `buildDaily` (1213), `DailyPanel` (1264) | Toda a tela do quadro, lista, lixeira, Concluídas, compartilhar, Daily | Rota `/gestao-atividades`, `/quadro/:token` |
| `src/personal/boardMerge.js` | `mergeBoards`, `mergePage`, `deepEqual` | Fusão de 3 vias (base, minha, do servidor) | `App.jsx` no 409 e no poll |
| `src/personal/` | `PersonalStats.jsx`, `DaySummary.jsx`, `QuickBits.jsx`, `Waiting.jsx`, `Workbench.jsx`, `boardAttention.js`, `dailyExport.js`, `workbenchUtils.js` | Indicadores, resumo do dia, atalhos, marcador "Aguardando", calendário/anotações/atalhos, contagem de atrasadas, exportar Daily | `PersonalBoard.jsx`, tela inicial |
| `src/ui/RichNote.jsx`, `src/lib/richNote.js` | `RichNote`, `sanitizeNote`, `noteToEditorHtml` | Editor Tiptap enxuto (negrito, itálico, listas, link) e 2ª sanitização | Detalhe do cartão |
| `src/lib/saveRetry.js` | `isTransientSaveError`, `retryDelay` | Decide o que repete (rede, 5xx, 408, 429) e quando (2, 5, 10, 20, depois 30 s) | `App.jsx`, `PublicBoardScreen` |

### B) Agenda + Google Calendar
| Arquivo | Função/componente | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/agenda.js` | `GET /` (17), `POST /events` (99), `POST /events/:id/respond` (123), `brInstant` | Feed único (Google + TASK + atividade + CRM), criar compromisso, aceitar/recusar | `src/agenda/Agenda.jsx`, `NewEventModal.jsx`, `agendaActions.js` |
| `server/google.js` | `/status`, `/oauth/start`, `/oauth/callback`, `/disconnect` | Conexão OAuth do Google por usuário | Meu perfil > Agenda; redireciona para `/#google-calendar-connected` ou `-error` |
| `server/googleCalendar.js` | `getAuthUrl`, `exchangeCodeForTokens`, `saveConnection`, `getAuthedClientForUser`, `listEvents`, `mapGoogleEvent`, `myResponseOf`, `createEvent`, `applySelfResponse`, `respondToEvent`, `syncTicketEvent`, `deleteTicketEvent`, `upsertBlockEvent`, `removeBlockEvent` | Toda conversa com o Google | Agenda, XFlow, "Reservar na agenda", RENATA, CRM |
| `server/companyCalendar.js` + `companyCalendarPlan.js` | `createCalendarRouter`, `friendlyGoogleError`; puras: `candidateMeetings`, `buildEventBody`, `fingerprint`, `rowStatus`, `parseEmails` | "Reservar na agenda": um bloco por atividade/reunião do cronograma da empresa | `src/screens/CompanyCalendar.jsx` |
| `shared/calendarDays.js` | `assignDays`, `duplicateDays`, `inWindow`, `meetingConflicts` | Distribui as reuniões em dias livres; regra de 1 reunião por dia por empresa | `companyCalendar.js` |
| `src/agenda/dayLoad.js` | `rsvpOf`, `summarizeDay`, `timelineRows`, `afterMeetingsMessage`, `WORK` | **A regra do "aceito / sem resposta / recusado"** e a conta de horas livres | Agenda, painel da RENATA na tela inicial, Workbench |
| `src/agenda/` | `Agenda.jsx` (582), `RenataAgendaBriefing.jsx` (707), `NewEventModal.jsx`, `RsvpButtons.jsx`, `agendaPrefs.js` | Telas (Dia/Semana/Mês, "Mostrar/Ocultar detalhes"), painel da RENATA, expediente e almoço da pessoa | Rota `/agenda`, tela inicial |

### C) XFlow
| Arquivo | Função/componente | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/xflow.js` (858) | `router`, `sanitizeDescriptionHtml` (24), `computeSlaState` (101), `computeBallHolder` (115), `logEvent`, `rowToTicket` (146), `splitData` (192) | Rotas, sanitização, SLA, "quem está com a bola", log de eventos | Tela do XFlow |
| `server/xflowTransitions.js` | `XFLOW_TRANSITIONS`, `checkTransition`, `CLOSURE_REASON_TO_STATUS`, `XFLOW_TERMINAL_STATUSES` | Matriz de ações: de qual status parte, para qual vai, qual permissão exige, campos obrigatórios | `PATCH /tickets/:id` |
| `server/xflowPermissions.js` | `canDo`, `effectiveXflowRole`, `RULES` | Quem pode cada ação (reporter, dev, gestão, admin) | `PATCH`, `DELETE`, `GET ?trash=1` |
| `server/db.js` | `blankXflowTicketData` (1493), `migrateXflowBoardOrder` (1550) | Campos do JSON do ticket; ordem inicial do quadro | `POST /tickets`, boot |
| `src/xflow/XFlow.jsx` (3.393) | `XFlowScreen` (2996), `XflowBoardView` (2865), `XFLOW_BOARD_COLUMNS` (460), `XFLOW_BOARD_DRAG_RULES` (489), `resolveDrag` (530), `canDoClient` (442), `RichTextEditor` (735), `TicketDetailModalImpl` (1379) | Home por papel, Lista, Quadro Kanban, detalhe, Tiptap, anexos/prints | Rota `/xflow` |

### D) Notificações, push, conteúdo do dia
| Arquivo | Função/componente | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/notifications.js` | `createNotification`, `rowToNotification` | Único jeito de gravar aviso no sino; agenda o push | XFlow, atividades, tarefas de reunião, CRM, Pareceres, Modelos |
| `server/notificationPrefs.js` | `NOTIFICATION_CATEGORIES`, `TODAY_SOURCES`, `readMuted`, `loadMutedPatterns` | Categorias que a pessoa silencia; fontes escondidas do painel Hoje | `GET /notifications`, push |
| `server/todoNotifications.js` | `diffTodoEvents`, `notifyTodoChanges`, `runTodoReminders`, `startTodoScheduler` | Avisos de tarefa de reunião: atribuída, comentada, vencida | `PATCH /projects/:id` (routes.js 568) e agendador de 30 min |
| `server/commentExtras.js` | `cleanCommentExtras`, `notifyMentions` | Valida anexos/links e notifica @menções (só mesma base) | Pareceres, Modelos, notas do CRM |
| `server/push.js` | `schedulePushForNotification`, `deliverNotificationPush`, `sendToUser`, `endpointAllowed`, `urlForNotification`, rotas | Web Push (VAPID) | Depois de cada `createNotification` |
| `src/sw.js`, `src/lib/push.js`, `src/lib/pushPayload.js` | `push`, `notificationclick`, `enablePush`, `safePath` | Mostra o aviso no aparelho e leva ao módulo | Navegador/PWA |
| `server/daily.js`, `server/dailyContent.js`, `server/inspirationQuotes.js` | `loadCard`, `cached`, `aiDay`, `quoteOfDay`, `OFFICIAL_QUOTES` | "Meu dia": Evangelho, Versículo, Sabedoria, Horóscopo, Chinês, Inspiração | `src/daily/DailyCards.jsx`, `WelcomeSetup.jsx` |
| `server/experience.js` | `recordEvents`, `csatEligible`, `recordCsat`, `summary` | NÃO é o "Meu dia": mede fluxos e nota de satisfação (só equipe) | `src/lib/experience.js`; Central de Inteligência |
| `src/App.jsx` | poll de notificações (1042-1050, a cada 45 s) | Atualiza sino em todas as telas | Sempre que há login |
| `src/app/notificationActions.js` | `goToNotificationTarget`, `markNotificationRead...` | Clique no aviso abre o item exato | Sino |

## Como funciona (passo a passo)

### 1. Gestão de Atividades / Meu quadro

**1.1 Forma do dado.** Uma linha por pessoa em `personal_boards` (`user_id` é a chave; `data` é JSON; `updated_at` é o carimbo). Não há `org_id`: o dono é a pessoa. Estrutura:

```
data = {
  boards: [ página ],               // "página" = um quadro; a tela chama de aba
  linkedBoards: [ {token, name, ownerName, addedAt} ],   // quadros de outras pessoas fixados como aba
  lastCompletedArchiveAt: ISO       // marca da última faxina semanal de concluídas
}
página = { id, name, visibility:'private'|'public', shareToken, backBoardId?, log:[{ts,action,user,col?}],
           viewPrefs:{view:'kanban'|'list', sortMode}, responsibles:[{id,name}], columns:[ coluna ] }
coluna = { id, name, color, hideCompleted?, visibility?, shareToken?, backTo?, cards:[ cartão ] }
cartão = { id, title, desc, descFormat:'html'|ausente, status, priority, dueDate, tags[],
           checklist:[{id,text,done,doneAt,dueDate?,responsibleIds?}], comments[], history[],
           completed, completedAt, completedBy, responsibleIds?, waiting?:{who,since},
           deleted/deletedAt/deletedBy/deletedFrom*, archived/archivedAt/archivedFrom*,
           createdAt, createdBy, updatedAt, updatedBy, createdVia?:'api', apiRef? }
```
- `status` vale `nao-iniciada | em-andamento | pausada | concluida` (`CARD_STATUS_ORDER`); `priority` vale `urgente | alta | media | baixa`.
- Campos novos são sempre **aditivos** (sem a chave = comportamento antigo): prazo do item do checklist (§102), responsáveis (§103/104), `waiting` (Waiting.jsx).
- Exclusão é **lógica**: `deleted:true` leva para a Lixeira; só "Excluir definitivamente" (digitar "Excluir") remove o cartão do JSON (`hardDeleteTrashedCard`).

**1.2 Gravar (a rota mais importante do módulo).**
1. Gatilho: qualquer edição chama `mutatePersonalBoard` (App.jsx 1553), que atualiza a tela na hora e agenda a gravação com atraso de 500 ms (`persistPersonalBoardDebounced`).
2. A tela envia `PATCH /api/personal-board` com `{ board, baseUpdatedAt, mergeable:true }`. `baseUpdatedAt` é o carimbo da versão que a aba conhecia.
3. O servidor higieniza as descrições (`sanitizeBoardNotes`), abre transação e trava a linha (`SELECT ... FOR UPDATE`).
4. Se `mergeable` e o carimbo não bate (`sameStamp`), responde **409** `{conflict:true, board, updatedAt}` e **não grava**.
5. Se bate, `mergeApiCards` recoloca cartões criados pela API depois da versão conhecida (`createdVia:'api'`), grava (`updated_at=now()`) e responde `{board, updatedAt, merged}`.
6. Depois do COMMIT, `syncCardEvents` registra os eventos dos Indicadores (nunca derruba o salvamento).
7. No 409, a tela funde (`mergeBoards(base, mine, theirs)`), reenvia (até 5 voltas) e devolve à tela o que ficou gravado, preservando o que foi digitado nesse meio-tempo.
8. Falha de rede, 5xx, 408 ou 429: a edição FICA na tela, o indicador mostra "tentando salvar de novo" e a gravação repete sozinha (2, 5, 10, 20 s, depois a cada 30 s) e ao voltar a internet (evento `online`). Erro 400/401/403/404/413 desfaz a edição.
9. Poll: a cada 12 s a tela consulta `GET /personal-board/version`; se o carimbo mudou (outra aba, API, RENATA, link público) e não há gravação pendente, recarrega e funde com o que está na tela.
10. `beforeunload` avisa se a aba fecha com gravação pendente.

**1.3 Regras de comportamento do cartão (todas no front, `PersonalBoard.jsx`).**
- Concluir ou **pausar** manda o cartão para o fim da coluna (`setCardStatus`, só quando muda para esse status). Pausar não conta como abertura/encerramento.
- Reabrir limpa `completedAt`; reconcluir cria nova data de conclusão.
- **Arquivar concluídas:** um efeito da tela (linha ~2183) arquiva sozinho os cartões concluídos uma vez por semana (na primeira abertura depois da segunda-feira). Ou seja: **só acontece se alguém abrir a tela**.
- Ordenação (`sortCards`): `manual`, `priority` (ativa, depois pausada, depois concluída, e só depois prioridade e prazo), `dueDate`, `createdAt`, `updatedAt`, `name`. Fora de `manual` e `priority`, "fim da coluna" não vale.
- Prazo do cartão = a subatividade com data mais distante (§106). Recalcula só quando uma data de item muda.
- Selo "Sem movimentação há N dias" usa `calendarDaysSince` (`src/lib/dates.js`), em dias de calendário no fuso de quem vê (§75).
- Busca (`cardMatchesFilters`) olha título, descrição, tags, checklist e nome de responsável; vale só na página aberta.
- "Visões" do quadro: o que existe de fato é `viewPrefs` da página (Kanban/Lista + ordenação) e as "visões rápidas" de `QuickBits.jsx` (Hoje, Atrasadas, Urgentes, Aguardando, Em andamento), que são filtros de tela. As "visões salvas" do §98 pertencem ao CRM (`server/crm/views.js`), não ao quadro pessoal.

**1.4 Descrição formatada.** `card.desc` continua sendo texto. Quem diz que é HTML é `card.descFormat === 'html'`, nunca o conteúdo. HTML só entra pelo editor `RichNote` e é limpo duas vezes: no navegador (`sanitizeNote`, DOMPurify) e no servidor (`sanitizeNoteHtml`: só `p br strong b em i ul ol li a`, link `http/https/mailto`, `target/rel` forçados, até 50.000 caracteres). Cartão criado pela API ou RENATA é texto puro; `noteToText` converte HTML em texto para busca/API.

**1.5 Compartilhar por link, colunas e quadros fixados.**
1. Dono abre Compartilhar (página) ou o menu da coluna > Compartilhar coluna. A **tela** gera o token (`genShareToken`, App.jsx 177) e grava `visibility:'public'` + `shareToken` no JSON (vai pelo `PATCH` normal).
2. `GET /api/public-board/:token` (sem login) acha o token por busca JSON (`data @> ...`) em `personal_boards`. Para coluna devolve uma página "virtual" só com aquela coluna (`columnAsBoard`): nada do resto sai. `back` só aponta para destino **público** do mesmo dono.
3. Quem está **logado** edita: `PATCH /api/public-board/:token` (exige `requireAuth`). Página inteira: substitui a página do dono (mantém `backBoardId`). Coluna: `applyColumnPatch` grava **só os cartões** daquela coluna, descarta id de cartão que já existe em outra coluna, e carimba o histórico com o NOME DA SESSÃO.
4. Mesmo 409 + fusão (`mergePage`) vale no link público.
5. "Adicionar ao meu quadro" (`POST /personal-board/linked`, exige `personalAccess`) guarda só `{token,name,ownerName,addedAt}` em `linkedBoards`. A aba lê o quadro do dono a cada 15 s e ao voltar para a aba. Se o dono deixa de compartilhar ou troca o link, a aba avisa e deixa remover (nunca apaga o quadro do dono).
6. Alterações feitas por outros no quadro do dono são registradas em `syncCardEvents` na conta do **dono**.

**1.6 Indicadores (abrir/encerrar por dia).** `personal_card_events` guarda `opened`, `closed` e `step_done` (subatividade concluída; `card_id = "<cartão>#<item>"`). Eventos são derivados do JSON com o horário do próprio cartão (idempotente, `ON CONFLICT DO NOTHING`, janela de 3 s para não duplicar). Fuso fixo `America/Sao_Paulo`. `GET /stats?days=N` devolve totais, dia da semana, dia do mês e divisores de média; `GET /stats/day?date=` o detalhe do dia. Cartão sem `createdAt` ou concluído sem `completedAt` não entra (a rota informa quantos). Excluir definitivamente apaga o cartão mas **não** apaga os eventos. A primeira abertura da tela de Indicadores faz o "backfill" de cartões antigos.

**1.7 Daily e exportação.** `DailyPanel` (PersonalBoard.jsx 1264) agrupa por responsável (atividade principal + subatividades) com filtro por prazo, pessoa e atividade; exporta Excel/PDF (`src/personal/dailyExport.js`). Não grava nada.

**1.8 Anotações e atalhos.** `GET/PUT /api/personal-extras` guardam em `users.preferences.personalExtras` (anotações HTML limpas + até 24 atalhos http/https). Ficam fora do quadro de propósito (o quadro pode ter link público).

### 2. Agenda + Google Calendar

**2.1 Conectar.** Meu perfil > Agenda abre `GET /api/google/oauth/start` (redireciona ao Google, escopo `calendar.events`, `access_type=offline`, `prompt=consent`). O Google volta em `/api/google/oauth/callback`; o servidor confere o `state` (aleatório, guardado no cookie `g_oauth_state` por 10 min; sem ele o retorno é recusado) e só então troca o código por tokens (`saveConnection`) e redireciona para `/#google-calendar-connected` (ou `-error`). Uma conexão por usuário (`google_calendar_connections.user_id` é PK). O `googleapis` renova o token sozinho e o servidor grava o novo (`client.on('tokens')`).

**2.2 Ler a agenda.** `GET /api/agenda?start=&end=` monta num feed só:
1. Eventos do Google (`listEvents`, calendário `primary`, recorrência expandida, máx. 250), exceto os espelhos de atividades do CRM (`linkedGoogleEventIds`), que aparecem uma vez só como atividade.
2. TASKs do XFlow em que a pessoa é responsável, com `expectedCompletionAt` no período (dia inteiro).
3. Atividades de empresa em que o NOME da pessoa bate (sem diferenciar maiúscula) com `responsible` ou `participants` (dia inteiro).
4. Atividades em aberto do CRM (`crmAgendaEvents`, isolado em try/catch).
A tela repete a leitura a cada 60 s enquanto aberta (não há webhook do Google).

**2.3 A regra do aceito / sem resposta / recusado.** O servidor etiqueta cada evento do Google com `myResponse` (`myResponseOf`): `accepted | declined | tentative | needsAction | organizer | unknown`. Quem decide o que conta como compromisso:
| Valor | Conta como tempo ocupado? | Mostra como |
|---|---|---|
| `accepted`, `organizer`, `unknown`, ausente | Sim | Aceito |
| `needsAction` | Não (só entra em "se aceitar tudo") | Sem resposta |
| `tentative` | Não | Talvez |
| `declined` | Não | Recusado (por último/apagado) |
| `transparent` ("Livre" no Google), dia inteiro | Não entra na conta de horas | — |
- Frente: `rsvpOf` e `summarizeDay` em `src/agenda/dayLoad.js`. Servidor: o mesmo conjunto `accepted/organizer/unknown` está repetido em `server/widgetSummary.js` (`COMMITMENT`) e em `server/connect.js` (`GET /agenda`, `keep`); a RENATA etiqueta `[SEM RESPOSTA]` etc. em `server/assistantRetrieval.js`. **Mudou a regra, mude nos 4 lugares.**
- Expediente padrão 08:00–18:00 e almoço 12:00–13:00; cada pessoa muda em `agendaPrefs.js`, salvo **só no navegador** (localStorage, não vai ao banco). "Livre" = sem reunião aceita dentro do expediente.

**2.4 Criar compromisso.** `NewEventModal` chama `POST /api/agenda/events`: título, data, hora (horário de Brasília), duração 5 min a 12 h, até 30 convidados. O Google envia e-mail aos convidados (`sendUpdates:'all'`). **Aceitar/recusar/talvez:** `POST /api/agenda/events/google-<id>/respond` lê o evento, troca só a resposta de quem é `self` e avisa o organizador. A tela aplica a resposta na hora e desfaz se o servidor recusar; recusar pede confirmação.

**2.5 Espelho da TASK do XFlow.** Quando uma TASK tem responsável E `expectedCompletionAt`, e muda o responsável ou a Previsão, `PATCH /xflow/tickets/:id` chama `syncTicketEvent` **depois de responder** (rede externa não segura a transação). Cria evento de dia inteiro no calendário do responsável e guarda `data.googleEventId` na TASK. Evento apagado no Google é recriado (404/410). Mandar para a Lixeira ou apagar de vez remove o evento (`deleteTicketEvent`). Restaurar **não** recria sozinho. Só funciona se o responsável conectou a própria conta (silencioso se não).

**2.6 Reservar na agenda (cronograma da empresa).** `/api/company-calendar/:projectId` (só Master e PRICETAX, e `canAccessProject`).
1. `GET` lista as reuniões candidatas (tipo Reunião, com data, não concluídas, de hoje em diante) com status `reservada`/etc. e sugere dias livres (`assignDays`).
2. `POST /:projectId/apply` exige `confirm:true` (convites saem por e-mail do Google), até 20 e-mails e 60 reuniões, duração 30/60/90/120/180.
3. Regra do Rafael: no máximo **uma reunião por dia na mesma empresa** (`duplicateDays`); o dia precisa estar dentro do período da reunião e não ser passado.
4. `upsertBlockEvent` cria ou atualiza o MESMO evento; `fingerprint` evita reenviar o que não mudou (`action:'igual'`); a reserva fica em `company_calendar_events` (fora do JSON do projeto, de propósito). Cancelar = `removeBlockEvent` + apagar a linha.
5. O organizador é a conta Google de quem reservou; quem mexer depois usa a conexão **do organizador original** (`organizer_user_id`).

### 3. XFlow

**3.1 Acesso.** `users.xflow_role` (`''` sem acesso; `reporter`, `dev`, `gestao`). `admin` é o papel efetivo de quem tem `xflow_role` E é `master` ou super admin (`effectiveXflowRole`). Todas as rotas passam por `requireAuth` + `requireXflowAccess` (`server/auth.js`). **Todo mundo da base vê todas as TASKs** (decisão do Rafael); o que é restrito é a AÇÃO.

**3.2 Dado.** `xflow_tickets`: colunas relacionais (`status`, `severity`, `priority`, `suggested_priority`, `product`, `reporter_id`, `assignee_id`, tempo/SLA, `ball_holder_*`, `deleted*`, `board_order`) + `data` JSON (`description` em HTML, `evidence[]` com `dataUrl`, `comments[]`, `linkedTicketIds`, `googleEventId`, `expectedCompletionAt`, `statusBeforeBlock`, etc., ver `blankXflowTicketData`). `xflow_events` = linha do tempo (uma linha por ação, inclusive `view`). `ticket_number` é uma sequência **global** (SERIAL), não por base.

**3.3 Toda mudança é uma AÇÃO nomeada (nunca "grave este ticket").**
1. Tela: `PATCH /api/xflow/tickets/:id` com `{ action, payload }`.
2. Servidor abre transação, trava a linha, confere a base (`org_id`) e Lixeira (ticket excluído só aceita `restaurar`).
3. `checkTransition` (xflowTransitions.js): status de origem permitido e campos obrigatórios do `payload` (ex.: `note`, `blockedReason`, `closureJustification`).
4. `canDo(permissão, usuário, ticket, payload)` (xflowPermissions.js). Ação fora da tabela é negada por padrão.
5. `switch (action)` monta `data` e as colunas (`rel`), calcula status final, tempo por bucket (`STATUS_TO_BUCKET`), pausa do SLA, "quem está com a bola".
6. UPDATE, `xflow_events`, notificações (`xflow_assigned`, `xflow_mention`), COMMIT. Depois responde e só então fala com o Google.

**3.4 Ciclo de vida (resumo; a tabela completa é `XFLOW_TRANSITIONS`).**
`aberta` → `atribuida` (aceitar) → `em_desenvolvimento` → `em_revisao` → `pronta_para_teste` (exige "Solução aplicada" e "O que testar") → `em_homologacao` → `pronta_para_publicacao` → `publicada` (versão/build/release opcionais) → `aguardando_validacao_solicitante` → `concluida`.
- Laterais: `pausada`, `bloqueada` (exige motivo), `aguardando_terceiro` (solicitante/cliente/terceiro), `aguardando_gerencia`. Quem sai delas volta ao status guardado em `statusBeforeBlock` (`desbloquear`, `retomar`, `resolver_gerencia`).
- Encerramentos: `concluida`, `duplicada`, `nao_reproduzida`, `nao_e_bug`, `descartada` (via `fechar_sem_desenvolver` com motivo; `descartado_gestao` só gestão/admin). `reabrir` volta a `em_desenvolvimento`, soma `reopen_count`.
- Arquivar/desarquivar (só terminais), `excluir` (Lixeira, qualquer status), `restaurar`, `purgar` (DELETE; só admin e só quem já está na Lixeira).
- Sem mudar status: `editar_campo`, `mudar_severidade`, `mudar_prioridade`, `reatribuir`, `editar_prazo_proxima_acao`, `comentar`/`editar_comentario`/`excluir_comentario`, `anexar`/`remover_anexo`, `reordenar`, `vincular_ticket`/`desvincular_ticket` (bidirecional), `definir_prioridade_sugerida` (uma vez só).

**3.5 SLA.** Primeira resposta por **prioridade** (urgente 30 min, alta 2 h, normal 8 h, baixa 24 h) e resolução por **severidade** (s1 8 h, s2 24 h, s3 72 h, s4 168 h); padrão em `DEFAULT_SLA`, sobrescrevível em `organizations.settings.xflowSla`. O relógio de resolução **pausa** em `aguardando_terceiro`, `aguardando_gerencia`, `pausada`, `bloqueada`. Estado (`vencido`, `proximo_vencer`, `dentro_prazo`, `cumprido`) é calculado na leitura (`computeSlaState`), não gravado.

**3.6 Quadro Kanban.** 15 colunas fixas (`XFLOW_BOARD_COLUMNS`); "Encerrada" junta 4 status terminais. Arrastar não muda status direto: `resolveDrag` mapeia a coluna de destino para uma **ação nomeada** em 3 níveis: (1) ação direta; (2) pede um campo antes (`bloquear` pede motivo, `homolog_reprovar` pede nota, `resolver_gerencia` pede decisão); (3) sair de coluna lateral sempre chama a ação de retomada e o servidor decide o destino. Não há otimismo local: a tela só muda quando o servidor responde. Ordenação por coluna (`XFLOW_SORT_OPTIONS`): `priority`, `oldest`, `assignee`, `product`, `manual`; só no modo `manual` o arraste dentro da coluna chama `reordenar` com `board_order` fracionário (ponto médio entre vizinhos; o servidor só grava o número).

**3.7 Descrição, imagens e comentários.** Descrição em HTML pelo editor Tiptap (`RichTextEditor`), sanitizada no navegador (DOMPurify) e no servidor (`sanitizeDescriptionHtml`: `<img>` só com `data:image/`, links só `http/https/mailto`, `target/rel` forçados). Colar print (Ctrl+V) ou arrastar imagem vira anexo em `evidence[]` (limite de 8 MB por arquivo, conferido na TELA, `MAX_EVIDENCE_BYTES`). Nome genérico "image.png" vira `print-AAAAMMDD-HHMMSS.ext`. Comentário aceita anexo e link; @menção cria `xflow_mention`.

### 4. Notificações, push e conteúdo do dia

**4.1 Sino.**
1. Um evento chama `createNotification` (INSERT em `notifications` com `type`, `title`, `body`, `target`).
2. `target` diz onde abrir: `{kind:'xflow_ticket', ticketId}`, `{kind:'activity', projectId, activityId}`, `{kind:'todo', projectId, meetingId, itemId}`, `crm_activity`, `parecer`, `modelo`.
3. A tela busca `GET /api/notifications` a cada 45 s (App.jsx 1042-1050) e ao receber o evento `notifications:refresh`. A rota devolve até 200, escondendo as categorias silenciadas.
4. Só sai do contador quando marcada como lida OU quando a pessoa abre o item (`POST /notifications/mark-read-for-target`, ou `POST /xflow/tickets/:id/view`). Abrir o painel do sino não marca nada.

**4.2 Quem gera cada tipo.**
| Tipo | Quem gera | Gatilho |
|---|---|---|
| `xflow_assigned`, `xflow_mention` | `server/xflow.js` | `reatribuir`, `redirecionar`, `comentar` com menção |
| `activity_assigned`, `activity_linked`, `activity_mention` | `notifyActivityChanges` (routes.js, linha 53) | `PATCH /projects/:id` compara antes e depois; nome do responsável/participante igual ao de um usuário da base |
| `todo_assigned`, `todo_comment` | `notifyTodoChanges` | `PATCH /projects/:id` e `POST /projects/:id/meetings` |
| `todo_overdue` | `runTodoReminders` | Agendador a cada 30 min (primeira rodada 45 s depois do boot), só depois das 7h de Brasília, só vencidas há até 14 dias, **uma vez por tarefa** |
| `crm_*`, `parecer_mention`, `modelo_mention` | `server/crm/`, `notifyMentions` | ver docs do CRM/Pareceres |
Categorias `gestao` (`personal_`) e `renata` (`renata_`) existem na lista mas estão `active:false`: **nenhum código grava esses tipos hoje**.

**4.3 Silenciar.** `PUT /api/notifications/preferences` grava em `users.preferences.notifications` `{muted:[categoria], todayHidden:[origem]}`. Silenciar **esconde na leitura** (não apaga); religar traz de volta. Tipo desconhecido nunca é escondido.

**4.4 Push no celular/computador.**
1. Sem `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` o push fica desligado e o sino segue igual (`VAPID_SUBJECT` é opcional).
2. Pessoa toca "Ativar": `enablePush` pede permissão, inscreve no navegador e chama `POST /api/push/subscribe` (grava em `push_subscriptions`, endpoint único, máx. 10 aparelhos por pessoa).
3. `createNotification` chama `schedulePushForNotification`; 1,5 s depois `deliverNotificationPush` confere no banco (se a transação foi desfeita, não envia), pula se já lida, se o usuário está bloqueado ou se a categoria está silenciada, e envia `{title ≤80, body ≤160, url, tag}`.
4. O `url` leva ao MÓDULO (`urlForNotification`), não ao item exato.
5. 404/410 do serviço de push apaga a inscrição; outros erros ficam em `last_error`.
6. iPhone só recebe se o app estiver instalado na tela de início (PWA). `src/sw.js` mostra o aviso e `safePath` só aceita caminho interno.

**4.5 Mensagem do dia e boas-vindas ("Meu dia").**
1. `users.preferences` guarda `{enabled, cards[], birthDate}`; `users.onboarding_done_at` marca a primeira configuração. Todo usuário já existente vê as boas-vindas uma vez; "Agora não" também conta como feito.
2. `GET /api/daily` devolve os cartões escolhidos (`no-store`). Cada fonte é buscada **uma vez por dia** (não por usuário) e cacheada em `daily_content (kind,key,day)`; falha vira "Indisponível" e só tenta de novo depois de 10 min.
3. Fontes: Evangelho (liturgia.up.railway.app, comunitária, não oficial da CNBB), Versículo e Sabedoria (Midvash, Bíblia Livre CC BY 4.0, crédito obrigatório junto do texto), Horóscopo (AstroWay), Horóscopo chinês (texto gerado por IA, marcado como entretenimento), Inspiração (curada, sem IA).
4. Signo e animal chinês são calculados no servidor a partir da data de nascimento (dado pessoal, só o próprio usuário lê e grava).
5. **Regra das frases:** só entra na tela frase com `verification:'oficial'` (conferida na fonte do autor). `quoteOfDay(day)` é determinística por data e intercala autores. Frases `pesquisa` (não conferidas) ficam só na memória da RENATA, com ressalva. `LEADERS_NOT_AUTHENTICATED` e `FORD_NOT_AUTHENTICATED` são avisos do que NÃO pode ser citado. Autor real nunca recebe frase "completada".

## Rotas desta área
Catálogo completo e atualizado: `docs/gerado/ROTAS.md` (grupos `/api`, `/api/xflow`, `/api/agenda`, `/api/google`, `/api/push`, `/api/daily`, `/api/company-calendar`, `/api/experience`). Resumo:

| Método | Caminho | Quem pode (conferido) | Entrada principal | Saída | Erros comuns |
|---|---|---|---|---|---|
| GET | `/api/personal-board` | Qualquer logado (`requireAuth`); **não confere `personalAccess`** | — | `{board, updatedAt}` (cria quadro vazio se não existir) | 401 |
| GET | `/api/personal-board/version` | Idem | — | `{updatedAt}` | 401 |
| PATCH | `/api/personal-board` | Idem | `{board, baseUpdatedAt, mergeable}` (JSON até 15 MB; **forma não validada**) | `{board, updatedAt, merged}` | 400 "Payload inválido." (só se faltar `board`), **409 conflito**, 413 |
| GET | `/api/personal-board/stats?days=` | Idem (sempre do próprio usuário) | `days` 1..3650 ou vazio | totais, `weekday`, `monthDay`, `steps`, divisores | — |
| GET | `/api/personal-board/stats/day?date=` | Idem | `AAAA-MM-DD` | janela de 30 dias + eventos | 400 "Data inválida." |
| POST | `/api/personal-board/linked` | Logado com `personalAccess` | `{token}` | `{entry, already}` | 403, 400 "Esse quadro já é seu.", 404 |
| GET | `/api/public-board/:token` | Qualquer pessoa (`optionalAuth`) | token (≤200) | `{board, updatedAt, back, canEdit, ownerName, isOwner, alreadyLinked}` | 404 "Link inválido..." |
| PATCH | `/api/public-board/:token` | Qualquer logado (`requireAuth`) | `{board, baseUpdatedAt, mergeable}` | `{board, updatedAt}` | 400, 404, **409** |
| GET/PUT | `/api/personal-extras` | Logado | `{notes, shortcuts}` (≤24 atalhos, http/https) | extras | 400 "Atalhos inválidos." |
| GET | `/api/notifications` | Logado | — | até 200 avisos (sem categorias silenciadas) | — |
| GET/PUT | `/api/notifications/preferences` | Logado | `{muted[], todayHidden[]}` | categorias e fontes | 400 "Categoria de notificação desconhecida." |
| PATCH | `/api/notifications/:id` | Dono do aviso | `{read}` | aviso | 404 |
| POST | `/api/notifications/read-all`, `/mark-read-for-target` | Logado | `{kind, ticketId?, projectId?, activityId?}` | `{ok}` | 400 "kind é obrigatório." |
| GET | `/api/agenda?start&end` | Logado | ISO obrigatórios | `{connected, events[]}` | 400 (datas inválidas também; só mostra atividades das empresas que a pessoa pode abrir) |
| POST | `/api/agenda/events` | Logado com Google conectado | título, data, hora, duração, convidados | `{event:{id, htmlLink}}` | 400 (campos), 409 (Google não configurado/conectado) |
| POST | `/api/agenda/events/:id/respond` | Logado | `{response: accepted|declined|tentative}`; id começa com `google-` | `{id, myResponse}` | 400, 404, 409 |
| GET | `/api/google/status`, `/oauth/start`, `/oauth/callback`; POST `/disconnect` | Logado | — | status / redirecionamento | 400 "não configurada" |
| GET/POST | `/api/company-calendar/:projectId[/apply]` | Master ou PRICETAX com acesso à empresa | `{confirm:true, emails, items, cancel, durationMin}` | `{results[]}` por reunião | 400 (e-mail inválido, duas reuniões no mesmo dia), 409 (Google), 404 |
| GET | `/api/xflow/team`, `/affected-companies`, `/tickets[?trash=1]`, `/tickets/:id/events` | Quem tem `xflow_role`; Lixeira só gestão/admin | — | listas | 403 "Você não tem acesso ao XFlow." |
| POST | `/api/xflow/tickets`, `/tickets/:id/view` | Quem tem `xflow_role` | `title` obrigatório + campos | ticket | 400 "Título é obrigatório." |
| PATCH | `/api/xflow/tickets/:id` | `xflow_role` + `canDo(ação)` | `{action, payload}` | `{ticket, relatedTicket}` | 400 (transição inválida/campo faltando), 403 "Você não tem permissão para fazer isso." |
| DELETE | `/api/xflow/tickets/:id` | Só admin, só ticket na Lixeira | — | 204 | 400, 403 |
| GET/POST | `/api/push/config`, `/status`, `/subscribe`, `/unsubscribe`, `/test` | Logado | inscrição Web Push | `{ok}` | 503 sem VAPID; 400 endpoint não aceito; 429 teste (8 s) |
| GET/PUT/POST | `/api/daily/options`, `/preferences`, `/onboarding-complete`, `/` | Logado | `{enabled, cards[], birthDate}` | cartões | 400 "Conteúdo desconhecido." / "Data de nascimento inválida." |
| POST/GET | `/api/experience/events`, `/csat/eligible`, `/csat` | Logado; só Master/PRICETAX são medidos | eventos de fluxo (máx. 30, 20 envios/min) | `{stored}` | — |

## Dados
| Tabela / lugar | Leitura/gravação | Notas |
|---|---|---|
| `personal_boards` (`user_id` PK, `data`, `updated_at`) | Lê e grava o JSON inteiro | Sem `org_id`; dono = pessoa. **Sem histórico/versionamento** (o versionamento de `project_versions` é só do cronograma das empresas) |
| `personal_card_events` (PK `user_id, card_id, kind, occurred_at`) | Só insere | Sem FK para o cartão; **nunca é limpa** |
| `users.preferences` (JSON) | Mescla por chave | `notifications`, `personalExtras`, `enabled/cards/birthDate`; os `PUT` mesclam sem apagar as outras chaves |
| `users.xflow_role`, `personal_access`, `onboarding_done_at` | Lê | Quem concede é o Master (tela de usuários) |
| `xflow_tickets` / `xflow_events` | Grava / só insere | Isolado por `org_id`; exclusão lógica (`deleted`), purga só admin |
| `notifications` | Insere, marca lida | **Nunca é apagada** (a rota só devolve as 200 últimas) |
| `push_subscriptions` | Insere/apaga | Apagada em 404/410 e no limite de 10 por pessoa |
| `google_calendar_connections` | Grava tokens | Credenciais do Google da pessoa, **cifradas** (`secretBox.js`, prefixo `enc1:`) |
| `company_calendar_events` | Grava reserva | Chave `(project_id, activity_id)` |
| `daily_content` | Cache diário | Chave `(kind, key, day)`; **nunca é limpa** |
| `product_events`, `product_csat` | Insere | Só equipe; sem texto digitado |
Esquema exato: `docs/gerado/BANCO.md`. `org_id`: XFlow, notificações e Agenda filtram pela base da pessoa; o quadro pessoal não tem base (é da pessoa).

## Tipos de leitura e de saída
- **Quadro:** sempre o JSON inteiro (sem paginação). Pode crescer muito: comentários e anexos de cartão guardam `dataUrl` dentro do JSON.
- **Indicadores:** resumo agregado em SQL; `stats/day` devolve janela fixa de 30 dias.
- **Agenda:** lista de eventos do período; Google até 250 por consulta.
- **XFlow:** `GET /tickets` devolve **todos** os tickets da base de uma vez (com `data`, incluindo imagens em `dataUrl` e comentários). Ordenação no servidor por criação; ordenação do Quadro é na tela.
- **Sino:** até 200 avisos, mais novos primeiro.
- **Daily:** exporta Excel e PDF (na tela, `dailyExport.js`).
- **Push:** texto curto, igual ao do sino (aparece na tela bloqueada).

## Regras e travas
| Trava | O que impede | Onde é garantida | O que o usuário vê se violar |
|---|---|---|---|
| Carimbo do quadro (`baseUpdatedAt` + `mergeable`) | Aba velha apagar o trabalho de outra | `server/routes.js` `PATCH /personal-board` e `/public-board/:token` (`sameStamp`) | Nada (a tela funde e reenvia); após 5 voltas, "tentando salvar de novo" |
| Linha travada (`FOR UPDATE`) na gravação | Duas gravações simultâneas se atropelando | `PATCH /personal-board`, `PATCH /public-board`, API de conectividade, RENATA | — |
| `mergeApiCards` | Painel apagar cartão criado pela API/Claude Code | `server/routes.js` 705 | Cartão volta ao quadro |
| Coluna compartilhada só mexe nos cartões dela | Colaborador de link alterar outras colunas, nome, cor, visibilidade, "voltar" | `applyColumnPatch` | 400 "Quadro inválido." ou o campo é ignorado |
| "Voltar" só para destino público do mesmo dono | Vazar página privada | `resolveBackBoard` | Botão some |
| `personalAccess` | Usuário sem o módulo entrar na Gestão | Front (`canOpenMode`, `src/lib/routes.js`) e `POST /personal-board/linked`. **As rotas `/personal-board`, `/stats` e `/personal-extras` NÃO conferem** (qualquer logado lê/grava o próprio quadro) | A tela bloqueia; a API não |
| Descrição HTML higienizada | Script/HTML perigoso em cartão | `sanitizeNoteHtml` (servidor) + `sanitizeNote` (tela) | Etiquetas removidas |
| Atalhos só http/https | `javascript:` nos atalhos | `cleanShortcutUrl` | 400 "Use endereços http ou https válidos." |
| XFlow: papel por ação | Reporter/dev fazerem o que não podem | `canDo` em `server/xflowPermissions.js` (o front só espelha em `canDoClient`) | 403 "Você não tem permissão para fazer isso." |
| XFlow: status de origem e campos | Pular etapa do ciclo | `checkTransition` em `server/xflowTransitions.js` | 400 "Ação ... não é permitida a partir do status ..." |
| XFlow: ticket na Lixeira | Agir em ticket excluído | `PATCH` (só `restaurar`) | 400 "Este BUG está na Lixeira..." |
| XFlow: base do ticket | Ver/mexer em TASK de outra base | `org_id` conferido em `GET events`, `view`, `PATCH`, `DELETE`, `vincular_ticket` | 403 "Sem acesso a este ticket." |
| XFlow: purga | Apagar de vez | `canDo('purgar')` (admin) + ticket precisa estar na Lixeira | 403 / 400 |
| XFlow: prioridade sugerida imutável | Mudar a sugestão original | `definir_prioridade_sugerida` | 400 "A prioridade sugerida já foi definida..." |
| XFlow: editar/excluir comentário | Mexer em comentário alheio | handler (`authorId`); excluir também admin | 403 "Você só pode editar/excluir o seu próprio comentário." |
| XFlow: HTML da descrição | Script, imagem remota, link perigoso | `sanitizeDescriptionHtml` | Conteúdo removido |
| Agenda: 1 reunião por dia por empresa | Duas reuniões no mesmo dia na reserva | `duplicateDays` em `companyCalendar.js` | 400 "Duas reuniões no mesmo dia..." |
| Reservar: `confirm:true` | Enviar convite sem querer | `POST /apply` | 400 "Confirme o envio dos convites." |
| Reservar: só Master/PRICETAX | Cliente criar bloco | `router.use(requireAuth, requireMasterOrPricetax)` + `canAccessProject` | 403/404 |
| Push: lista de hosts | Servidor chamar endereço interno (SSRF) | `endpointAllowed` em `push.js` | 400 "...serviço de notificação que o sistema não aceita." |
| Push: respeita silêncio, lida e bloqueio | Aviso indesejado | `deliverNotificationPush` | — |
| @menção só da mesma base | Aviso a gente de fora | `notifyMentions` (Pareceres/Modelos/CRM). **O XFlow e as atividades de empresa NÃO usam esse helper** (ver achados) | — |
| Experiência: só equipe e sem "quem" | Vigilância | `isTracked`, `summary` agrega por fluxo | — |

## IA nesta área
- Só o **Horóscopo chinês** usa IA: `claude-haiku-4-5-20251001`, `max_tokens: 3000`, **uma chamada por dia** com os 12 animais (saída estruturada por Zod), cache em `daily_content (ai, day)`, chamadas simultâneas compartilham a mesma tentativa (`inflight`).
- O prompt NUNCA recebe dado de pessoa (só a data); pede tom de entretenimento, sem promessa nem conselho financeiro/saúde/jurídico.
- Se a IA falhar, vier cortada (`max_tokens`) ou não houver `ANTHROPIC_API_KEY`: o cartão mostra "Indisponível agora" e tenta de novo depois de 10 min. Custo registrado em `logMetric` (`feature:'dailyContent'`).
- A **Inspiração não usa IA** (decisão do Rafael: só frase verificada).
- Gestão de Atividades, Agenda, XFlow e sino não usam IA. A RENATA lê e edita o quadro e a agenda por ferramentas próprias (ver `docs/` da RENATA).

## Bugs e armadilhas conhecidos
| Sintoma | Causa | Onde foi corrigido | Como NÃO reintroduzir |
|---|---|---|---|
| Atividade nova some depois de 3 a 4 s com duas abas abertas | Quadro é gravado inteiro e a última gravação vencia | §117 (`boardMerge.js`, 409, `mergeable`) | Nunca grave o quadro sem `baseUpdatedAt` + `mergeable:true`; o poll nunca pode substituir às cegas; rode `scripts/board-conflict-http.test.mjs` |
| Painel antigo (sem a flag) ainda apaga | Servidor mantém o comportamento antigo se `mergeable` faltar | §117 | Cliente novo sempre manda a flag |
| Texto digitado some | Poll de 6 s sobrescrevia edição local | §60 | Poll só quando não há gravação pendente (`personalBoardBusyRef`) |
| Edição desfeita quando a rede cai | Falha transitória revertia a tela | §118 | Use `isTransientSaveError`; só 4xx desfaz |
| Renomear coluna travava e mostrava "fantasma" | Espaço/Enter no campo ativava o arrasto por teclado | §51 | `stopPropagation` no campo; mesma classe de risco ainda existe nos botões do cartão |
| Cartão "0d" na segunda | Contava blocos de 24 h | §75 | Use `calendarDaysSince` |
| Fechar editor com Escape salvava texto cancelado | `onBlur` rodava depois do Escape | §62 | Flag `cancelingChecklistRef` |
| Convite não aceito aparecia como compromisso | `myResponse` era ignorado | §59 | Toda leitura de agenda usa `myResponse` (4 lugares, ver 2.3) |
| Aviso "Hoje você já terminou" falso | Agenda vazia não significa dia acabado | §73 | `afterMeetingsMessage` |
| XFlow: `aceitar` sobrescrevia responsável | Usava sempre o usuário atual | `xflow.js` (`row.assignee_id \|\| req.user.id`) | Mantenha o `||` |
| XFlow: evento do Google não era criado | Só disparava ao editar a data, não ao atribuir | `xflow.js` (gatilho duplo) | Mantenha os dois gatilhos |
| XFlow: link da descrição perdia `target/rel` | `allowedAttributes` não listava | §18 | Mantenha `transformTags` e a lista de atributos juntos |
| `GET /agenda` com `start` ou `end` inválido responde 500 (só com Google conectado) | `new Date(start).toISOString()` lança `RangeError` em `listEvents` | **Não corrigido** | Validar as datas antes (só a tela chama, com datas boas) |
| Mencionar id inexistente no XFlow derruba o `PATCH` | `xflow_mention` usa o id vindo do cliente sem conferir; a FK de `notifications.user_id` falha dentro da transação | **Não corrigido** | Conferir `mentions` na base (como faz `notifyMentions`) |
| Primeira rodada de `todo_overdue` avisou meses de atraso | Sem janela | `maxDaysLate = 14` | Mantenha a janela |
| `todo_overdue` não repete | Verificação única por `itemId` no banco | `runTodoReminders` | É proposital; se mudar, cuidar de spam |
| Pausar/concluir "não vai para o fim" fora de Manual/Prioridade | Outros modos ordenam pelo campo | §66 | Limite consciente |
| Faxina semanal de concluídas só roda ao abrir a tela | É um efeito da tela, não do servidor | `PersonalBoard.jsx` ~2183 | Se precisar rodar sem ninguém abrir, mover para o servidor |
| Quadro de link de coluna não limita por pessoa | Qualquer logado com o link edita os cartões da coluna | §121 (aviso) | Tratar o link como senha |
| Mudança no quadro compartilhado aparece em 10 a 15 s | Polling, sem tempo real | §122 | Limite conhecido |

### Achados de segurança
Os achados de segurança desta área ficam no registro privado `docs/11_ACHADOS_E_PENDENCIAS.md` (não é publicado).

## Como testar
Não há test runner; verificação = `npm run build` limpo + scripts descartáveis (todos recusam banco que não seja local). Cobertura desta área:

| Script | O que prova |
|---|---|
| `scripts/board-merge.test.mjs` | Fusão de 3 vias do quadro (19 checagens) |
| `scripts/board-conflict-http.test.mjs` | HTTP real: perda com painel antigo, 409 com painel novo, fusão, quadro público |
| `scripts/board-back-http.test.mjs` | Botão "Voltar" nunca vaza página privada |
| `scripts/board-column-share-http.test.mjs` | Link de coluna: só a coluna sai, abusos de PATCH, histórico carimbado |
| `scripts/e2e/board-coluna.mjs`, `board-voltar.mjs`, `board-adicionar-ao-painel.mjs` | Fluxos reais no Chromium (exigem `playwright-core` fora do projeto) |
| `scripts/save-retry.test.mjs` | Quais erros repetem e em que tempo |
| `scripts/daily-export.test.mjs` | Filtro de prazo e exportação da Daily |
| `scripts/inspiration-quotes.test.mjs` | Só frase conferida vai para a tela; nada reprovado entra |
| `scripts/experience-http.test.mjs` | Só equipe é medida; resumo sem pessoa |
| `scripts/renata-tools.test.mjs` | Ferramentas da RENATA no quadro (checklist, responsáveis, prazos) |
| `scripts/crm-google-sync.test.mjs` | Espelho do CRM no Google com Google falso (referência de como simular o Google) |

**Sem teste automatizado** (conferido em `docs/gerado/TESTES.md` e `ls scripts`): XFlow inteiro (permissões, transições, SLA, sanitização), `personalActivity` (Indicadores), `richNote`/`personalExtras`, notificações e preferências, `todoNotifications`, push (`endpointAllowed`, entrega), `dayLoad` (regra de aceito/recusado), Google Calendar real (OAuth, `respondToEvent`, `syncTicketEvent`), "Reservar na agenda" (`companyCalendarPlan`). Vários desses têm teste descartável citado no `PROJECT_CONTEXT.md` que não está mais em `scripts/`.

## Receitas: "se o Rafael pedir X, faça Y"
1. **Novo campo no cartão do Meu quadro** (ex.: "cliente"). Abrir `src/screens/PersonalBoard.jsx` (`addCard` 1831, `PersonalCardDetailModal` 707, `PersonalCard` 472). Campo **aditivo** (sem a chave = comportamento antigo); duplicar cartão (`duplicateCard`) já copia tudo. Não precisa mexer em servidor nem banco (o JSON é livre). Conferir `server/connect.js` (`flattenCards`) se a API de conectividade deve expor, e `server/renata/tools/board.js` se a RENATA deve editar. Documentar em §103-§106 do `PROJECT_CONTEXT.md`.
2. **Mudar a ordenação ou criar nova visão rápida.** `SORT_OPTIONS`/`sortCards` (PersonalBoard.jsx 85-110) ou `QuickBits.jsx`. É só tela; `viewPrefs` já persiste Kanban/Lista + ordenação por página.
3. **"Minha atividade sumiu" / "texto sumiu".** Reproduzir com duas abas. Ler `sendPersonalBoard` (App.jsx 1451) e `PATCH /personal-board` (routes.js 733). Conferir: a tela manda `mergeable:true`? o poll respeita `personalBoardBusyRef`? Rodar `board-conflict-http.test.mjs` e `board-merge.test.mjs`. Lembrar que NÃO há histórico do quadro: se perdeu, só o backup do Postgres do Railway.
4. **Mudar o que conta nos Indicadores** (`personalActivity.js`). Mexer em `cardEventsOf` (o que gera evento) e `getActivityStats`. Cuidado: eventos antigos já gravados não mudam, e `PersonalStats.jsx` assume `weekday`/`monthDay`. Atualizar §65.
5. **Nova ação no XFlow** (ex.: "devolver ao solicitante"). Ordem: (a) `server/xflowTransitions.js` (nova entrada com `from`, `to`, `permission`, `requiresFields`); (b) `server/xflowPermissions.js` (regra em `RULES`; sem regra = negado); (c) `case` em `PATCH /tickets/:id` (`xflow.js` 368-722); (d) espelho na tela (`XFLOW_RULES` 413, botão no detalhe, e se for arrastável `XFLOW_BOARD_DRAG_RULES` 489); (e) se mexe em SLA/bola, `computeBallHolder`/`PAUSING_STATUSES`. Testar com `curl` real nos dois papéis (não há teste automatizado). Atualizar §18.
6. **Mudar quem pode fazer o quê no XFlow.** Só `RULES` em `xflowPermissions.js` + `XFLOW_RULES` na tela. O servidor decide; a tela só esconde botão.
7. **Mudar prazos de SLA.** `DEFAULT_SLA` em `xflow.js` (76) ou `organizations.settings.xflowSla` (admin da base). Estados são calculados na leitura; tickets antigos mantêm `sla_*_due_at` já gravado (só recalcula ao mudar severidade/prioridade).
8. **Novo status/coluna no Quadro do XFlow.** Status novo em `XFLOW_TRANSITIONS` e `STATUS_TO_BUCKET`/`computeBallHolder` (servidor), `XFLOW_STATUS_META`, `XFLOW_BOARD_COLUMNS` e `XFLOW_BOARD_DRAG_RULES` (tela). Se o status deve pausar SLA, incluir em `PAUSING_STATUSES`. Cuidado: a coluna `status` não tem CHECK, então o banco aceita qualquer texto.
9. **Mudar o que a Agenda considera compromisso.** `rsvpOf`/`summarizeDay` em `src/agenda/dayLoad.js` **e** `COMMITMENT` em `server/widgetSummary.js`, `keep` em `server/connect.js` (`GET /agenda`), rótulos em `server/assistantRetrieval.js`. Testar com casos reais (aceito, sem resposta, recusado, livre, dia inteiro).
10. **Mudar expediente/almoço padrão.** `WORK` em `dayLoad.js` e `LIMITS` em `agendaPrefs.js`. Hoje é por navegador; para "por pessoa em qualquer aparelho" seria preciso gravar em `users.preferences` (não existe).
11. **"A TASK não apareceu no Google".** Conferir: responsável conectou o Google (`google_calendar_connections`)? TASK tem responsável E `expectedCompletionAt`? A mudança foi no responsável ou na Previsão (únicos gatilhos)? Log do servidor "Falha ao sincronizar com Google Calendar". Token revogado dá erro de autorização; pedir para reconectar em Meu perfil > Agenda.
12. **Novo tipo de aviso no sino.** (a) Gerar com `createNotification(client, {orgId, userId, type, title, body, actorName, target})` com `type` começando por um prefixo já existente em `NOTIFICATION_CATEGORIES` (senão nunca é silenciável); (b) `target.kind` novo exige caso em `goToNotificationTarget` (`src/app/notificationActions.js`) e, se quiser abrir o módulo certo no push, prefixo em `urlForNotification` (`push.js`); (c) validar que o `userId` é da mesma base. Atualizar §20.
13. **Aviso no celular não chega.** Checar: `VAPID_*` no ambiente (`GET /api/push/config` devolve `enabled`)? aparelho inscrito (`/api/push/status`)? categoria silenciada? aviso já lido em 1,5 s? iPhone com o app instalado na tela de início? `POST /api/push/test` isola o problema. `last_error` em `push_subscriptions` mostra a falha do serviço de push.
14. **Nova fonte ou novo cartão do "Meu dia".** `CARDS` e `loadCard` em `dailyContent.js` (sempre via `cached`, nunca por usuário), saudação e ícone em `src/daily/DailyCards.jsx`. Se for texto de IA, entrar no schema Zod e no prompt, sem dado pessoal. Citar crédito/licença da fonte.
15. **Nova frase de inspiração.** `server/inspirationQuotes.js`: só com fonte conferida (`verification:'oficial'`, `source`, `sourceUrl`; traduzida leva `original`). Sem fonte, vai como `pesquisa` (não aparece na tela). Rodar `scripts/inspiration-quotes.test.mjs`.
16. **Mudar a "faxina semanal" de concluídas.** Efeito em `PersonalBoard.jsx` (~2183) usa `lastCompletedArchiveAt`. Hoje só roda no navegador de quem abre a tela.

## Não verificado / dúvidas
- Não executei nada contra o banco ou o Google; tudo foi lido do código (e de `docs/gerado/`). Números de linha foram conferidos em 2026-10-29 e mudam a cada edição: use o nome da função.
- Conteúdo do `PersonalCardDetailModal`, `Agenda.jsx` (grade, empacotamento de eventos) e `RenataAgendaBriefing.jsx` foi só localizado, não lido por inteiro.
- A lista de ações exata de `src/personal/Workbench.jsx` (calendário, anotações) e `DaySummary.jsx` ficou resumida pelos cabeçalhos dos arquivos.
- Não confirmei se o Railway mantém backup automático do Postgres (relevante porque o quadro pessoal não tem histórico próprio).
- Não confirmei quais usuários têm `personal_access`, `xflow_role` ou push ativo em produção.
- `docs/gerado/ROTAS.md` marca erradamente `DELETE /tickets/:id` como "(sem prefixo conhecido)" no grupo de `xflowTransitions.js` (o comentário do arquivo cita a rota); a rota real está em `server/xflow.js` 841.
- O `PROJECT_CONTEXT.md` §20 detalha mais tipos de aviso do que os conferidos aqui; usei só o que achei no código (`grep` por `type:`).
