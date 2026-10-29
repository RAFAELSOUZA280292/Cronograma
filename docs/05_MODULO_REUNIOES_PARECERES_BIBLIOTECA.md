# Reuniões, Pareceres e Biblioteca de conhecimento (o "pipeline de conhecimento")
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza. Fonte da verdade: o código; este texto é o mapa.
> Fora deste documento: Modelos de documentos (outro documento). A RENATA em si (chat, ferramentas) está em outro documento; aqui só aparece onde ela **lê** o que este pipeline produz.

## Em uma frase
A PRICETAX alimenta o painel com três tipos de conhecimento — **reuniões** (transcrição vira reunião estruturada), **pareceres** (PDFs que a RENATA estuda uma vez) e **materiais da Biblioteca** (PDF, Word, PowerPoint, Excel, texto que a RENATA lê, fatia e estuda) — e a RENATA usa os três para responder, orientar e montar o dossiê do cliente.

## Para quem é / quando ler (gatilhos)
Pedidos típicos do Rafael que mandam para cá:
- "A transcrição ficou em Processando para sempre" / "falhou com erro estranho" / "reunião duplicada".
- "A RENATA errou o responsável / o prazo / o lado (PRICETAX x cliente) das tarefas da reunião."
- "Uma IA externa precisa enviar ou corrigir transcrição" (chaves `transcripts`, `meetings_edit`, `write_all`).
- "Mudar o que o dossiê do cliente mostra" / "dossiê eternamente gerando".
- "O parecer novo não entrou nas respostas" / "estudo do parecer falhou" / "parecer de um cliente apareceu em outro".
- "A caixa Pareceres PRICETAX na reunião está vazia ou desatualizada."
- "Subi um material e a RENATA não acha" / "estudo do material cortado" / "aceitar outro formato de arquivo".
- "A reunião não aparece nas buscas da RENATA" (reindexação da memória).
- "Tarefa de reunião não avisou o responsável" (notificações).

**Palavras-chave para busca (robô):** `meeting_submissions`, `processSubmission`, `createSubmission`, `EXTRACTION_MAX_TOKENS`, `MeetingExtractionSchema`, `normalizeActionItems`, `friendlyAiError`, `applyMeetingEdit`, `meeting_edits`, `meetings_edit`, `transcripts`, `actionItems`, `activityLink`, `responsibleStatus`, `runDossierJob`, `project_dossiers`, `project_meeting_digests`, `reindexMeetingMemory`, `notifyTodoChanges`, `runTodoReminders`, `pareceres`, `parecer_studies`, `parecerUsableFor`, `startStudy`, `autoStudy`, `STUDY_MAX_TOKENS`, `meeting_parecer_advice`, `generateMeetingAdvice`, `loadMeetingAdviceDigest`, `pickRelevantPareceres`, `knowledge_materials`, `knowledge_material_chunks`, `processMaterial`, `studyMaterial`, `searchMaterial`, `materialPromptLines`, `extractText`, `chunkText`, `biblioteca_consultar`.

Siglas (primeira vez): **IA** = inteligência artificial (modelos da Anthropic: Opus, Sonnet, Haiku). **Embedding** = vetor numérico que representa o "significado" de um texto (serviço Voyage, opcional). **Trava** = regra que impede erro. **Exclusão lógica** = marcar como apagado sem remover. **Fire-and-forget** = o servidor dispara o trabalho em segundo plano e já responde à tela, sem esperar.

## Mapa rápido

### A. Reuniões
| Arquivo | Função/componente (conferido) | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `server/meetingInbox.js` | `createSubmission` | Cria linha em `meeting_submissions` (pending) e dispara o processamento | `POST /api/meeting-inbox` (tela) e `POST /api/connect/companies/:id/transcripts` (API) |
| `server/meetingInbox.js` | `processSubmission` | pending→processing→done/failed; chama IA, monta a reunião, grava em `projects.data.meetings[]`, reindexa memória, gera sugestão de pareceres | Fire-and-forget de `createSubmission`, `reprocessSubmission`, `/retry-failed` |
| `server/meetingInbox.js` | `extractMeetingFromTranscript`, `MeetingExtractionSchema`, `EXTRACTION_MAX_TOKENS` (16000), `isTruncated`, `COMPACT_HINT` | Extração estruturada (Opus) com 1 retentativa enxuta | `processSubmission` |
| `server/meetingInbox.js` | `normalizeActionItems`, `normalizeKind` | Amarra o responsável ao nome completo da equipe; normaliza `kind`/`area` | `processSubmission` |
| `server/meetingInbox.js` | `friendlyAiError` | Traduz erro cru da Anthropic para português | Gravação do erro e leitura (`subView`) |
| `server/meetingInbox.js` | `listSubmissions` | Lista os últimos 50 envios e recupera "processing" órfão (>5 min) | `GET /api/meeting-inbox`, `GET …/transcripts` |
| `server/meetingInbox.js` | `reprocessSubmission` | Volta o envio para pending e reprocessa | `POST /:id/retry`, `…/transcripts/:id/retry` |
| `server/meetingEdit.js` | `applyMeetingEdit` (pura) | Valida e aplica correção; devolve `changes` e o corpo `undo` | `runMeetingEdit` em `server/connect.js` |
| `server/meetingEditsSchema.js` | `ensureMeetingEditsSchema` | Cria a tabela `meeting_edits` | `initDb` (`server/db.js`) |
| `server/connect.js` | `runMeetingEdit`, `needTranscripts`, `needMeetingsEdit`, `meetingOut`, `itemOut` | Rotas Bearer de enviar/corrigir/desfazer; leitura da reunião | API de conectividade |
| `server/dossier.js` | `startDossier`, `runDossierJob`, `getDossierState`, `computeStaleness`, `failOrphanedDossiers` | Dossiê do cliente (map/reduce) | `server/assistant.js` `GET/POST /api/assistant/dossier` |
| `server/memoryIngest.js` | `reindexMeetingMemory`, `buildMeetingChunks`, `syncProjectMemoryFromDiff` | Quebra a reunião em trechos pesquisáveis (`project_memory_chunks`) | `processSubmission`, correção por API, `PATCH /api/projects/:id` |
| `server/todoNotifications.js` | `notifyTodoChanges`, `diffTodoEvents`, `runTodoReminders`, `startTodoScheduler` | Avisos de tarefa atribuída, comentada e vencida | `PATCH /api/projects/:id`, `POST /api/projects/:id/meetings`, timer de 30 min |
| `server/routes.js` | `POST /api/projects/:id/meetings` | Registra reunião inteira (sem IA de extração; usado pela skill `registrar-reuniao`) | Equipe PRICETAX |
| `shared/transcriptParser.js` | `parseTranscript`, `splitDecisionLines` | Reconhece "hora / quem fala / texto" | Front (`TranscriptView`) e `memoryIngest.js` |
| `src/meetings/Meetings.jsx` | `MeetingsView`, `TranscriptSubmitModal` | Lista, caixa de envios (polling 4 s), "Tentar novamente", botão Atualizar memória | Aba Reuniões da empresa |
| `src/meetings/MeetingDetail.jsx` | `MeetingDetailModal`, `MeetingShareModal`, `PublicMeetingScreen` | Detalhe da reunião, tarefas, compartilhar por link | Clique na reunião |
| `src/meetings/DossierPanel.jsx` + `dossierExport.js` | `DossierPanel` (polling 3 s) | Mostra/gera/exporta (Markdown, PDF) o dossiê | Botão "Dossiê do cliente" (só equipe) |
| `src/meetings/ParecerAdviceBox.jsx` | caixa "RENATA · Pareceres PRICETAX" | Mostra/atualiza a sugestão dos pareceres na reunião | `MeetingDetailModal` (só equipe) |
| `src/app/meetingActions.js` | `createMeetingActions` (`addMeeting`, `updateMeetingActionItem`, `deleteMeeting`…) | Mutações da tela (sempre pelo `mutateProject`) | Tela |

### B. Pareceres
| Arquivo | Função (conferido) | O que faz | Quem chama |
|---|---|---|---|
| `server/pareceres.js` | router (12 rotas) | CRUD do PDF e comentários; `/study`, `/advice` | Telas Pareceres, RENATA, caixa da reunião |
| `server/parecerScope.js` | `parecerUsableFor`, `loadProjectIdentity`, `companyTokens` | Regra FECHADA Geral x Cliente específico | Todo ponto que usa parecer |
| `server/parecerStudy.js` | `startStudy`, `autoStudy`, `runStudyJob`, `studyOne`, `computeStudyState`, `getStudyState` | Estuda o PDF com a IA, 1 vez por hash | `POST /api/pareceres/study`; automático após `POST /api/pareceres` |
| `server/parecerStudy.js` | `registerFact`, `archiveParecerFacts` | 1 fato de memória por parecer (`ai_knowledge_facts`) | `runStudyJob`; `DELETE /api/pareceres/:id` |
| `server/parecerStudy.js` | `generateMeetingAdvice`, `getMeetingAdvice`, `signatureOf` | Sugestão por reunião (`meeting_parecer_advice`) | `processSubmission`; `GET/POST /api/pareceres/advice` |
| `server/parecerStudy.js` | `loadMeetingAdviceDigest`, `loadGeneralAdviceDigest`, `formatAdviceDigest` | Levam a orientação já gravada ao prompt da RENATA | `server/assistantRetrieval.js`, `server/assistantGeneral.js` |
| `server/knowledgeFacts.js` | `loadRelevantFacts`, `pickRelevantPareceres` | Escolhe até 3 fatos de parecer que a pergunta toca | Chat da RENATA |
| `src/pareceres/Pareceres.jsx` | `PareceresScreen`, `UploadParecerModal`, `StudyBanner` | Tela de pareceres, upload, aviso de estudo | Módulo Pareceres (`/pareceres`) |
| `src/assistant/ParecerStudyModal.jsx` | `ParecerStudyModal` | Botão "Estudar Pareceres" no cabeçalho da RENATA | RENATA |

### C. Biblioteca de conhecimento
| Arquivo | Função (conferido) | O que faz | Quem chama |
|---|---|---|---|
| `server/knowledgeLibraryRoutes.js` | router (10 rotas), `readInput` | Envio, sugestão de metadados, busca, edição, reprocesso, arquivo | Aba Conhecimento > Biblioteca |
| `server/knowledgeLibrary.js` | `processMaterial`, `indexMaterial`, `studyMaterial`, `suggestMetadata` | Ler, indexar, estudar | Rotas |
| `server/knowledgeLibrary.js` | `searchMaterial`, `materialPromptLines` | Busca em 2 etapas; linhas `[MATERIAL]` do prompt | `loadRelevantFacts`; rota `/search`; ferramenta `biblioteca_consultar` |
| `server/materialText.js` | `extractText`, `chunkText`, `htmlToText`, `cleanText` | Arquivo vira texto; texto vira trechos de ~1.400 caracteres | `readInput`, `indexMaterial` |
| `server/renata/tools/biblioteca.js` | `biblioteca_consultar` | Ferramenta de leitura da RENATA operacional (só equipe) | RENATA operacional |
| `src/knowledge/LibraryTab.jsx` | `LibraryTab`, `AddModal`, `TestBox` | Tela (polling 3 s enquanto "processing") | `KnowledgeCenter.jsx` |

## Como funciona (passo a passo)

### A1. Enviar transcrição → reunião (caixa de transcrições)
1. **Gatilho:** clique em "Enviar transcrição" (`TranscriptSubmitModal`, `Meetings.jsx`) ou chamada `POST /api/connect/companies/:id/transcripts`.
2. `createSubmission`: confere `ANTHROPIC_API_KEY` (senão 503), exige `projectId` e texto (400), `loadAccessibleProject` (404/403). Na API, `dedupe:true`: mesmo texto (`md5(transcript)`) na mesma empresa, com envio em `pending/processing/done`, devolve o envio existente (200 `duplicate:true`) sem gastar IA.
3. INSERT em `meeting_submissions` (`status='pending'`, `manual_date`/`manual_time` se informados). Depois **aguarda** `appendProjectLog` (linha "enviou uma transcrição") e só então dispara `processSubmission` — a ordem importa (dois gravadores do mesmo `projects.data` se apagavam; bug de 2026-10-28).
4. A rota responde `202 {submissionId}` na hora. A tela faz polling de `GET /api/meeting-inbox?projectId=…` a cada 4 s enquanto houver pending/processing.
5. `processSubmission`: marca `processing` (`processed_at` = início da tentativa); lê o projeto; monta a lista da equipe (usuários da org, não bloqueados, `role <> 'cliente'`); chama `extractMeetingFromTranscript` (Opus, saída validada por Zod).
6. **Corte por tamanho:** se a resposta vier cortada (`stop_reason==='max_tokens'` ou erro de JSON — `isTruncated`), repete **uma vez** com `COMPACT_HINT` (resumo enxuto). Cortou de novo: falha com mensagem em português. Outros erros (chave, crédito, limite) não repetem.
7. Monta a reunião (`mtg-xxxx`): `date`/`time` = o que a pessoa/API informou (**vale mais**) ou o extraído; `normalizeActionItems` ajusta responsável/`kind`/`area`; itens nascem `status:'nao-iniciado'`, `createdBy:'IA (transcrição)'`.
8. **Vínculo tarefa→atividade (só sugere):** `suggestActivityLinks` + `applySuggestions` (`server/taskLinkSuggest.js`). Com confiança >= 0,5 (`MIN_CONFIDENCE`) a tarefa já nasce `activityLink.status='auto'` e recebe `activityId`; abaixo, `suggested`. Qualquer falha aqui é engolida (a reunião é registrada sem sugestão).
9. Grava `projects.data` (UPDATE do JSON inteiro, com linha de log), marca o envio `done` + `meeting_id`.
10. Depois, sem esperar: `reindexMeetingMemory` (memória da RENATA) e `generateMeetingAdvice` (sugestão dos pareceres; sem nenhum parecer estudado, nem chama a IA).
11. **Falha em qualquer ponto:** `status='failed'`, `error_message` já em português (`friendlyAiError`, 500 caracteres) e linha no log da empresa.
12. A tela esconde envios `done` (a reunião já está na lista); mostra "Na fila", "Processando…" e "Falhou". "Tentar novamente" aparece em `failed` e em `processing` há mais de 90 s; "Tentar novamente todas (N)" com 2+ falhas.

### A2. Recuperação e novas tentativas
- **Órfão:** o processamento roda dentro do processo; um deploy o mata. `listSubmissions` vira `failed` qualquer `processing` com mais de 5 min (mensagem "Processamento interrompido… clique em tentar novamente"). A recuperação só acontece quando alguém abre a lista (não há timer).
- `reprocessSubmission`: confere acesso (404/403/503), volta para `pending`, limpa o erro, log "tentou reprocessar", dispara `processSubmission`.
- `POST /retry-failed`: marca todas as `failed` da empresa como `pending` e processa **uma por vez, em sequência** (em paralelo estoura o limite da API).

### A3. Estrutura da reunião e das tarefas (`projects.data.meetings[]`)
Campos (conferidos em `processSubmission` e `meetingActions.js`):
| Campo da reunião | Observação |
|---|---|
| `id` (`mtg-…`), `title`, `date` (AAAA-MM-DD), `time` (HH:MM) | `date`/`time` informados valem mais que o extraído |
| `participants` | lista de nomes (texto livre; contato externo vira `externalContacts`) |
| `transcript`, `summary`, `decisions` | `decisions` é uma string (uma decisão por linha) |
| `topics[]` `{title,startTime}`, `highlights[]` `{type,time,quote}` | índice leve; nunca duplica a transcrição |
| `actionItems[]` | ver abaixo |
| `shareToken`, `shareVisibility` (`private`/`public`) | link público só-leitura |
| `createdAt`, `deleted`, `deletedAt`, `deletedBy` | exclusão lógica (a tela pede a frase de confirmação) |
| `editedAt`, `editedBy` | só quando corrigida pela API |

| Campo do item (`actionItems[]`) | Valores / observação |
|---|---|
| `id` (`mai-…`), `title`, `subtitle`, `notes` | `title` sem o nome do responsável embutido |
| `responsible` | nome da pessoa; vazio se não ficou claro |
| `responsibleOriginal`, `responsibleStatus` | `auto` (a RENATA trocou "Rafa" pelo nome completo; guarda o original) ou `confirmar` (ambíguo/desconhecido) |
| `owner` | `pricetax` ou `cliente` (lado que entrega). Padrão `pricetax` |
| `kind` | `tarefa`, `decisao`, `risco`, `pendencia` (`TASK_KINDS`); fora da lista vira `tarefa` |
| `area` | uma de `AREAS` (`server/areas.js`) ou vazio |
| `dueDate`, `status` | `status` nasce `nao-iniciado`; enum de `todoStatus.js` |
| `activityId`, `activityLink` | vínculo com o cronograma: `{status: auto|suggested|confirmed|none, suggestedId, confidence, reason, source, at}` |
| `subtasks[]`, `comments[]`, `attachments[]` | comentários disparam aviso ao responsável (A6) |
| `createdBy`, `createdAt`, `deleted`, `deletedAt`, `deletedBy` | exclusão lógica |

Responsável (`normalizeActionItems` + `matchPerson` de `server/inventory.js`): só para itens do lado PRICETAX. Nome exato: usa o nome da lista. Parcial com uma só correspondência: troca pelo nome completo e marca `auto`. Nome de área: preenche `area`. Ambíguo/desconhecido: mantém o texto e marca `confirmar`. Itens do lado do cliente não são mexidos.

### A4. Corrigir uma reunião pela API (escopo `meetings_edit` ou `write_all`)
1. `PATCH /api/connect/companies/:id/meetings/:meetingId` (`runMeetingEdit`, `connect.js`). Limite de 200 correções por hora por chave (429). `dryRun:true` **não conta** no limite.
2. Abre transação, `SELECT … FOR UPDATE` no projeto; confere organização e `canAccessProject` (404). Roda `applyMeetingEdit` (pura): valida **tudo antes de aplicar**; qualquer erro = nada gravado (400 com `errors[]` e `target`, por exemplo `actionItems[1]`).
3. Campos aceitos (`MEETING_FIELDS`): `title` (<=200), `date` (`isISODay`, ou `""` para limpar), `time` (HH:MM), `summary` e `decisions` (<=20.000), `participants` (lista inteira **ou** `{add, remove, rename}`, comparado sem acento/caixa, máx. 60) e `actionItems` por operações (até 100 por chamada). Controle: `dryRun`, `note`. **Qualquer outro campo = 400** (inclui `status`, `activityId`, `activityLink`, `transcript`, `shareToken`, `deleted`, `id`).
4. Operações de item: `add` (nasce `createdBy` "Claude Code (por <dono>)"), `set` (campos `title, responsible, kind, dueDate, area, owner`; vêm em `set:{}` ou soltos), `delete` (lógico) e `restore`. O vínculo com o cronograma (`activityId`/`activityLink`) **nunca** é alterado. Corrigir `responsible` apaga o aviso `responsibleStatus` e mantém `responsibleOriginal`.
5. `dryRun`: faz ROLLBACK e devolve `changes` (antes -> depois). Sem `dryRun`: grava o projeto, linha no log da empresa, linha em `meeting_edits` (mesma transação), COMMIT; responde `editId` e `undoWith`.
6. Depois do COMMIT (sem esperar): `api_token_actions` e `reindexMeetingMemory` (a RENATA para de responder com a versão antiga).
7. **Desfazer:** `POST …/edits/:editId/undo` (aceita `dryRun`, `note`). Reaplica o corpo `undo` guardado (nunca vem do cliente; só ele pode trazer `responsibleStatus`, via `fromUndo`). 404 se a correção não existe; 409 se já foi desfeita ou se a reunião mudou de modo que não dá para voltar. O desfazer vira uma entrada nova (também desfazível). `GET …/edits` lista as últimas 50.
8. Por que `meeting_edits` e não `project_versions`: o versionamento do cronograma só enxerga atividades, fases e equipe, não reuniões (§116e).

### A5. Dossiê do cliente (compilado de todas as reuniões)
1. **Gatilho:** botão "Dossiê do cliente" (`DossierPanel`, só equipe) -> `POST /api/assistant/dossier {projectId}`.
2. `canUseDossier` (superAdmin/master/pricetax; 403), `ANTHROPIC_API_KEY` (503), empresa acessível (`loadAuthorizedProject`), pelo menos 1 reunião viva (400 "ainda não tem reuniões"). `startDossier` marca como erro jobs `generating` com mais de 45 min (`STALE_JOB_MS`); se já há um gerando, devolve o mesmo (não paga duas vezes). Senão cria `project_dossiers` (`generating`) e dispara `runDossierJob`. Resposta 202 com o estado.
3. `runDossierJob` (etapa 1, **sem IA**): `buildFicha` monta uma ficha por reunião (resumo, decisões, tópicos, destaques, até 40 atividades). Só quando a reunião tem resumo < 80 caracteres e transcrição >= 200, o Sonnet (`digestTranscript`, `max_tokens` 1800, 3 em paralelo, transcrição cortada em 120.000 caracteres: começo+fim) resume a transcrição; o resultado fica em `project_meeting_digests` (chave = hash de título+data+transcrição). Falha de 401/403 aborta; outras falhas seguem sem o resumo.
4. Etapa 2: o Opus (`consolidateOnce`, `max_tokens` 16000, `DossierSchema`) lê as fichas em ordem cronológica. Acima de ~180.000 caracteres (`BATCH_CHAR_BUDGET`) divide em blocos e faz uma **união** (`MERGE_SYSTEM`). Cada chamada repete uma vez com `COMPACT_SUFFIX` em qualquer erro, exceto 401/403.
5. `sanitizeConsolidation` descarta ids de reunião inventados. **Lista de pendências (`openItems`) e estatísticas (`stats`) são montadas por CÓDIGO**, nunca pela IA.
6. Grava `status='done'`, `content`, `sources` (hash de cada reunião). Guarda só as 5 últimas versões `done` (`KEEP_DONE_VERSIONS`) e apaga `error` com mais de 7 dias. A tela mostra **só a mais recente**; `computeStaleness` avisa "N novas / alteradas / removidas desde este dossiê".
7. Polling a cada 3 s enquanto `generating`. Ao subir o servidor, `failOrphanedDossiers` (chamada em `server/index.js`) vira erro qualquer `generating` (deploy mata o job). Exportação: `dossierExport.js` (Markdown e HTML/PDF), no navegador.

### A6. Memória e notificações
- **Memória:** `reindexMeetingMemory` apaga e recria os trechos da reunião em `project_memory_chunks` (transcrição, resumo, decisões, destaques, tópicos, atividades e comentários), com embeddings em lote se `VOYAGE_API_KEY` existir (sem ela, só busca por palavra). Chamado por `processSubmission`, pela correção via API e, a cada `PATCH /api/projects/:id`, só para reunião cujo JSON mudou (`syncProjectMemoryFromDiff`; reunião excluída tem os trechos removidos). Botão "Atualizar memória da RENATA" na aba Reuniões = `POST /api/assistant/reindex`.
- **Avisos de tarefa** (`todoNotifications.js`): `todo_assigned` (responsável mudou), `todo_comment` (comentário novo), `todo_overdue` (vencida e aberta). O responsável é um **nome**: só notifica se bater (sem diferenciar caixa) com um usuário da organização; nunca avisa o próprio autor. `todo_overdue`: timer de 30 min (`startTodoScheduler`), não avisa antes das 7h de Brasília, só tarefa vencida há até 14 dias, **um aviso por tarefa** (consulta `notifications`).

### A7. Outros caminhos de criação de reunião
- **À mão:** `addMeeting` (`meetingActions.js`) cria reunião em branco e abre a tela; tudo grava pelo `mutateProject` (autosave).
- **Reunião inteira pronta** (`POST /api/projects/:id/meetings`, `routes.js`): só master/pricetax; transação com `FOR UPDATE`; mesma data+título já existente = 409 (a menos que `force`); o responsável precisa ser da equipe da empresa (senão fica vazio); transcrição até 400.000 caracteres. **Não** chama a IA de extração, **não** sugere vínculo com atividade e **não** gera sugestão de pareceres (a caixa mostra "Gerar").
- **Link público:** `GET /api/public-meeting/:token` devolve uma **lista fechada** de campos (`publicMeetingView`) se `shareVisibility==='public'`.

### B1. Enviar e estudar um parecer
1. **Gatilho:** "Novo Parecer" (`UploadParecerModal`): título, descrição, escopo (Geral ou Cliente específico), PDF até 10 MB (conferido no front por `f.type` e tamanho). O arquivo vai em base64 no JSON.
2. `POST /api/pareceres`: exige título e arquivo (400), `mimeType` igual a `application/pdf` **se informado** (a regra é sobre o que o cliente declara; o servidor não confere os bytes), escopo válido (`parseScope`: `cliente` exige nome), 10 MB (`MAX_FILE_BYTES`). Se `scope='cliente'` e veio `companyProjectId`, só vincula se o projeto existe **nesta organização**; senão guarda só o nome. INSERT em `pareceres` (`file_data` BYTEA). Responde 201 e **depois** dispara `autoStudy` (segundo plano; falha não afeta o envio).
3. `startStudy` lê o estado **só em SQL**: estados `new` (sem linha), `done` (hash SHA-256 do arquivo igual ao do estudo), `changed` (hash diferente), `failed`, `running`. Sem pendente devolve `upToDate:true` **sem nem precisar de chave de IA** — apertar o botão à vontade não custa nada.
4. Há pendente: marca `running` em `parecer_studies` e dispara `runStudyJob` (um por organização — `running` Set). Para cada parecer, `studyOne`: Sonnet recebe o PDF como bloco `document` (base64), `max_tokens` 16000 (`STUDY_MAX_TOKENS`), saída `ParecerStudySchema`. Corte de tamanho: repete uma vez com `COMPACT_HINT`; chave/crédito/limite não repetem; erros transitórios (sobrecarga, 429, conexão) têm até 3 tentativas com espera (`withRetry`).
5. Sucesso: `registerFact` cria **um fato** em `ai_knowledge_facts` (`scope='org'`, `origin='internal_document'`, `knowledge_type='RULE'`, assunto "Parecer PRICETAX Nº X", referência `Parecer PRICETAX: <título>`) por INSERT direto, **de propósito sem `saveKnowledgeFact`** (a detecção de conflito geraria "conflitos" falsos entre pareceres vizinhos). Se já havia fato, o antigo vira `superseded`. `parecer_studies` = `done` com `study`, `fact_id`, `file_hash`.
6. Falha: `failed` + mensagem (`friendlyStudyError`). Erro fatal (sem crédito/chave inválida) marca todos os `running` como `failed` e interrompe o lote. Um parecer enviado enquanto o job roda é pego ao final (`autoFollowUp`).
7. **Estados órfãos:** `running` sem job vivo neste processo há mais de 1 min vira `failed` ("servidor reiniciou"); `running` há mais de 30 min (`STALE_STUDY_MS`) vira `failed` ("demorou demais"). A limpeza roda em `computeStudyState` (ao consultar o estado).
8. **Tela:** `StudyBanner` (`Pareceres.jsx`) mostra "estudou N de M", lista "Falhou: <título> — <motivo>" e o botão "Estudar os pendentes" (confirmação; polling de 5 s). `ParecerStudyModal` (botão na RENATA) mostra o estudo de cada parecer e polling de 4 s.

### B2. Regra de escopo (Geral x Cliente específico) — FECHADA
`parecerUsableFor(parecer, identity)` em `server/parecerScope.js`:
| Situação | Resultado |
|---|---|
| `scope` diferente de `cliente` (Geral) | Usável em qualquer empresa |
| Cliente específico, sem `identity` (RENATA sem empresa) | **Não** usável |
| Cliente específico com `company_project_id` | Usável só se for o id da empresa atual |
| Cliente específico só com nome | Usável se os "tokens" do nome (sem LTDA, SA, de, do…) são subconjunto de um dos nomes da empresa (razão social ou fantasia), ou o inverso |
| Nome vazio ou sem tokens | **Não** usável (na dúvida, fecha) |
O escopo é lido do parecer **na hora de usar** (nunca copiado para o fato): editar a tag vale imediatamente. Pontos que aplicam a regra: `loadRelevantFacts` (chat da empresa), `getStudyState`/`computeStudyState` (parecer de outro cliente nem aparece como título; só uma contagem em `others`), `loadDoneStudies` (sugestão por reunião), `getMeetingAdvice` (defesa extra: filtra sugestões antigas), `loadMeetingAdviceDigest`/`loadGeneralAdviceDigest`.

### B3. Sugestão dos pareceres em uma reunião (`meeting_parecer_advice`)
1. **Gatilho:** fim do `processSubmission`, ou botão da caixa (`POST /api/pareceres/advice {projectId, meetingId}`).
2. `generateMeetingAdvice`: se já está gerando essa reunião (`generatingAdvice`), sai; carrega só estudos `done` **usáveis nesta empresa**; sem nenhum, não chama a IA. O Sonnet (`ADVICE_MODEL`, `max_tokens` 8000 = `ADVICE_MAX_TOKENS`) recebe o resumo/decisões/tópicos/tarefas da reunião e um índice dos estudos; devolve 0 a 3 itens `{parecerId, topic, relevance, steps[2-4], caution}`. Corte de tamanho: 1 retentativa enxuta.
3. `buildAdvice` descarta ids inventados e itens sem passo, grava `advice` e `signature` (hash dos estudos vigentes: `id:file_hash`). Resultado **vazio também é gravado** (não paga de novo).
4. `getMeetingAdvice` devolve `hasStudies`, `advice`, `generating` e **`stale`** (a assinatura gravada difere da atual = a RENATA estudou parecer novo depois). A caixa mostra "Atualizar sugestões" quando `stale`. Não regera sozinha (gastaria crédito por reunião).
5. A sugestão fica **fora do JSON do projeto** de propósito: o JSON da reunião é lido por clientes e reescrito inteiro pelas telas.

### B4. Orientação no chat (§116i)
`loadMeetingAdviceDigest` (RENATA da empresa; até 6 reuniões, <=4.500 caracteres) e `loadGeneralAdviceDigest` (RENATA geral; só empresas que a pessoa acessa; 2 reuniões por empresa, 12 empresas, <=5.000 caracteres) leem a sugestão **já gravada** — sem chamada extra de IA — e a entregam ao prompt. Só equipe (`isStaff`); só parecer ainda usável naquela empresa; reunião excluída não gera linha. Os `factIds` entram em `dependencyFactIds` (o cache de respostas invalida se o parecer mudar). Fora isso, o chat só carrega fatos de parecer cujas palavras a pergunta toca: `pickRelevantPareceres` (máx. 3; ignora palavra comum a >=60% dos pareceres quando há 5 ou mais; entra o parecer que bate em 2+ palavras ou em 1 palavra rara).

### C1. Enviar um material para a Biblioteca
1. **Gatilho:** Conhecimento > Biblioteca > "Ensinar a RENATA" (`AddModal`). Ao escolher o arquivo, a tela chama `POST /api/knowledge-library/suggest` (não grava nada): lê o texto (`readInput`), checa duplicado por hash e pede ao Haiku (`suggestMetadata`) título, tema e 3 a 8 etiquetas, reaproveitando temas/etiquetas já usados. Falha da IA aqui é "suave" (200 com `suggestion:null` e `aiMessage`).
2. `POST /api/knowledge-library` (202): `readInput` aceita `kind:'text'` (texto colado, mínimo 200 caracteres) ou arquivo em base64 (até 10 MB, 413; extensão aceita pela lista `SUPPORTED`; leitura que falha = 422; texto < 200 caracteres = 422). Duplicado (SHA-256 do texto, entre os não arquivados) = 409 com o id existente. INSERT em `knowledge_materials` (`status='processing'`, `stage='indexar'`, arquivo original em `file_data`), e `processMaterial` dispara em segundo plano.
3. `processMaterial` (um por material — `running` Set): **indexar** (`indexMaterial`: `chunkText` em trechos de ~1.400 caracteres com título `#` e página/slide; embeddings Voyage em lotes de 100 se existir `VOYAGE_API_KEY`, senão só busca por palavra; grava trechos em transação) -> cria um **fato provisório** (o material já é citável antes do estudo) -> **estudar** (`studyMaterial`) -> atualiza o fato com o estudo (`upsertFact`) -> `status='ready'`.
4. **Estudo:** Sonnet, `max_tokens` 16000, `MaterialStudySchema` (resumo, pontos-chave, comparativo antes x depois com base legal, perguntas e respostas, temas, quando usar, base legal, limites). Material com mais de ~110.000 caracteres é lido em partes de 100.000 -> anotações (3.500 tokens cada) -> estudo final. Corte: 1 retentativa enxuta.
5. **Falha do estudo não derruba a leitura:** o material fica `ready` com `study_error` ("Pronto · sem resumo") e botão "Estudar de novo" (`?only=study`, mantém os trechos). Falha de leitura/indexação = `status='failed'` e botão "Ler de novo".
6. `publicRow` mostra como `failed` o material `processing` há mais de 1 min sem job vivo (`running`), ou há mais de 30 min (`STALE_MS`) — é só na resposta; a linha do banco não muda até alguém reprocessar.

### C2. Formatos aceitos e leitura (`materialText.js`)
| Formato (`SUPPORTED`) | Como lê | Observação |
|---|---|---|
| `pdf` | `unpdf` | PDF com quase nenhum texto (digitalizado) é recusado com orientação |
| `docx` | `mammoth` -> HTML -> texto | Títulos viram `#` |
| `pptx` | `jszip` + XML | Inclui anotações do apresentador; até 600 slides; slide >8 MB descomprimido é ignorado |
| `xlsx`, `xls` | `xlsx` -> CSV por planilha | Marca `[Planilha: nome]` |
| `csv`, `txt`, `md`, `markdown`, `json` | texto UTF-8 | |
| `html`, `htm` | `htmlToText` | Remove script/estilo |
A extensão decide o formato (os bytes não são conferidos). Texto limitado a 1.500.000 caracteres (`MAX_TEXT_CHARS`; o resto é cortado — a resposta traz `truncated:true`). Não existe "link" como fonte (buscar URL no servidor abriria SSRF).

### C3. Como a RENATA usa os materiais
- `searchMaterial` (2 etapas, para não carregar vetores de toda a biblioteca): (1) escolhe até 5 materiais por palavra nos trechos (`plainto_tsquery`, todas as palavras; se nada, `websearch_to_tsquery` com `OR`) e por similaridade do resumo (embedding, se ligado); (2) ranqueia os trechos por **cobertura ponderada** dos termos da pergunta (exige >=2 termos casando; descarta trechos abaixo de 60% do melhor).
- `materialPromptLines` devolve o resumo dos 2 melhores materiais e até 6 trechos (<=8.000 caracteres), marcados `[MATERIAL]`, para o bloco "CONHECIMENTO ACUMULADO" de `loadRelevantFacts` — **só equipe** e **só quando a pergunta toca um material** (senão custo zero). Os fatos de material ficam **fora** da janela geral dos 30 fatos mais recentes (`MATERIAL_FACT_SQL`).
- RENATA operacional: ferramenta `biblioteca_consultar`. Tela: caixa "Testar o que a RENATA acha" (`POST /api/knowledge-library/search`).
- **Materiais valem para a organização inteira** (escopo `org`): não há Geral x Cliente como nos pareceres. A tela avisa para não enviar documento confidencial de cliente. Cliente (perfil `cliente`) nunca recebe material.

## Rotas desta área
Lista completa em `docs/gerado/ROTAS.md` (grupos `/api/meeting-inbox`, `/api/assistant`, `/api/pareceres`, `/api/knowledge-library`, `/api/connect`). Resumo:

### Caixa de transcrições (tela, cookie)
| Método | Caminho | Quem pode (conferido) | Entrada | Saída | Erros comuns |
|---|---|---|---|---|---|
| POST | `/api/meeting-inbox` | `requireAuth` + `canAccessProject` (Empresas + CNPJ liberado). **Não exige perfil de equipe** | `projectId`, `transcript`, `date`, `time` (sem validação de formato nem tamanho; limite do corpo 15 MB) | 202 `{submissionId}` | 400 "Informe projectId e transcript"; 403/404; 503 sem `ANTHROPIC_API_KEY` |
| GET | `/api/meeting-inbox?projectId=` | idem | — | `{submissions[]}` (50 mais recentes: id, status, errorMessage, meetingId, datas, quem enviou) | 400, 403, 404 |
| POST | `/api/meeting-inbox/:id/retry` | idem (acesso à empresa do envio) | — | `{message:'Reprocessando.'}` | 404 envio; 403; 503 |
| POST | `/api/meeting-inbox/retry-failed` | idem | `projectId` | `{retried:N}` | 400/403/404/503 |

### API de conectividade (Bearer `pxk_…`; resumo — ver `server/connect.js` e `docs/IA_EXTERNA_ENVIAR_TRANSCRICAO.md`)
| Método | Caminho | Escopos aceitos | Entrada / regras | Erros |
|---|---|---|---|---|
| POST | `/api/connect/companies/:id/transcripts` | `transcripts`, `meetings_edit`, `read_write`, `write_all` | `transcript` 200 a 400.000 caracteres; `date` AAAA-MM-DD válido; `time` HH:MM; duplicado = 200 `duplicate:true`; 30/hora por chave | 400, 413, 429 |
| GET | `…/transcripts` e `…/transcripts/:submissionId` | acima + `read_all` | Situação; com `done` traz `meeting` resumida | 404 |
| POST | `…/transcripts/:submissionId/retry` | escopos de envio | só `failed` | 409 se não for `failed` |
| GET | `…/meetings/:meetingId` | chaves de leitura | `?transcript=1` traz até 60.000 caracteres | 404 |
| PATCH | `…/meetings/:meetingId` | `meetings_edit`, `write_all` | Ver A4; 200/hora | 400 (com `errors[]`), 403, 404, 429 |
| GET | `…/meetings/:meetingId/edits` | `meetings_edit`, `write_all`, `read_all` | Últimas 50 | — |
| POST | `…/meetings/:meetingId/edits/:editId/undo` | `meetings_edit`, `write_all` | `dryRun`, `note` | 404, 409 |
Também exige `companiesAccess` do dono da chave (`needMeetingsEdit`, `loadOne`).

### Dossiê e registro de reunião
| Método | Caminho | Quem pode | Entrada | Saída | Erros |
|---|---|---|---|---|---|
| GET | `/api/assistant/dossier?projectId=` | `canUseDossier` (superAdmin, master, pricetax) + acesso à empresa | — | `{current, dossier{content}, staleness, meetingsNow}` | 403 "restrito à equipe PRICETAX", 404 |
| POST | `/api/assistant/dossier` | idem | `projectId` | 202 com o estado | 400 sem reuniões; 503 sem chave |
| POST | `/api/projects/:id/meetings` | `requireMasterOrPricetax` + `canAccessProject` | `title`, `date` (obrigatórios), `time`, `participants` (máx. 40), `transcript` (400.000), `summary`, `decisions`, `actionItems` (máx. 60), `via`, `force` | 201 `{meeting}` | 400, 403, 404, 409 duplicada |
| GET | `/api/public-meeting/:token` | **Público** (`optionalAuth`) | token | `{meeting, companyName}` | 404 se privada |

### Pareceres (`/api/pareceres` — todo o router usa `requireAuth` + `requireMasterOrPricetax`; organização = `effectiveOrgId`)
| Método | Caminho | Entrada | Saída / regra | Erros |
|---|---|---|---|---|
| GET | `/` | — | Lista **sem** o arquivo (`LIST_COLUMNS`) | 403 |
| POST | `/` | `title`, `description`, `fileName`, `mimeType`, `fileDataBase64`, `scope`, `companyName`, `companyProjectId` | 201 + dispara `autoStudy` | 400 título/arquivo/escopo/tamanho |
| PATCH | `/:id` | `title`, `description`, `scope`, `companyName`, `companyProjectId` | **Não troca o arquivo** | 400, 404 |
| DELETE | `/:id` | — | Arquiva o fato e **apaga de verdade** (cascade apaga estudo) | 404 |
| GET | `/:id/file` | — | PDF inline | 404 |
| POST/PATCH/DELETE | `/:id/comments[/:commentId]` | `text` <=4.000, anexos, links, menções | Editar só o próprio; excluir o próprio ou ser `master` | 400, 403, 404 |
| GET | `/study[?projectId=]` | — | Estado (só SQL); com `projectId` filtra pelo escopo da empresa | 404 empresa |
| POST | `/study` | — | 202 iniciou / 200 em dia / 503 sem chave | 503 |
| GET | `/advice?projectId=&meetingId=` | — | `{hasStudies, advice, stale, generating}` | 400, 404 |
| POST | `/advice` | `projectId`, `meetingId` | Gera (síncrono) e devolve o estado | 409 sem estudo; 503; 502 falha da IA |

### Biblioteca (`/api/knowledge-library` — `requireAuth` + `requireMasterOrPricetax`)
| Método | Caminho | Entrada | Saída | Erros |
|---|---|---|---|---|
| GET | `/` | — | `{materials[], embeddings, supported, maxFileMb}` | 403 |
| GET | `/:id` | — | Material + `study` completo | 404 |
| POST | `/` | `title`, `kind` (`file`/`text`), `fileName`, `dataBase64`, `text`, `topic`, `tags`, `note` | 202 `{material, truncated}` | 400, 409 duplicado, 413 >10 MB, 422 sem texto |
| POST | `/suggest` | mesmo corpo do envio | `{suggestion, duplicate, charCount, aiMessage}`; não grava | 400, 413, 422 |
| POST | `/search` | `query` | `{materials, passages, embeddings}` | — |
| PATCH | `/:id` | `title`, `topic`, `tags`, `note` | Material | 400, 404 |
| POST | `/:id/reprocess[?only=study]` | — | 202 | 404; 409 já lendo |
| DELETE / POST `/:id/restore` | — | Arquiva/restaura (nunca apaga; fato vai a `archived`/`active`) | `{ok}` | 404 |
| GET | `/:id/file` | — | Baixa o original (ou `.txt` do texto) com `nosniff` | 404 |

## Dados
| Tabela | Uso | Leitura/gravação | Isolamento |
|---|---|---|---|
| `projects.data.meetings[]` | Fonte da verdade da reunião (JSONB) | Lê/grava o JSON inteiro | Pela empresa (`projects.org_id`) |
| `meeting_submissions` | Envios de transcrição: `id`, `org_id`, `project_id`, `submitted_by`, `transcript`, `manual_date/time`, `status` (CHECK pending/processing/done/failed), `error_message`, `meeting_id`, `processed_at` | Grava; nunca apaga (some só com a empresa, cascade) | `org_id` + `project_id` |
| `meeting_edits` | Correções via API: `changes`, `undo` (JSONB), `undone_at`, `token_id`, `actor_name`, `note`; índice `(project_id, meeting_id, created_at DESC)` | Só insere; marca `undone_at` | `org_id` |
| `project_memory_chunks` | Trechos pesquisáveis da reunião | Apaga e recria por reunião | `org_id`, `project_id` |
| `project_dossiers` | `status` (generating/done/error), `progress`, `content`, `sources`, `error`, `created_by_name` | Insere; poda para 5 `done` | `org_id`, `project_id` |
| `project_meeting_digests` | Cache da ficha gerada da transcrição (PK projeto+reunião; `digest_key`) | Upsert | `project_id` |
| `pareceres` | PDF (`file_data` BYTEA), `scope` (geral/cliente; sem CHECK, validado em JS), `company_name`, `company_project_id` (FK `ON DELETE SET NULL`), `comments` JSONB | Insere; **DELETE físico** | `org_id` |
| `parecer_studies` | PK `parecer_id`; `file_hash`, `status` (running/done/failed, sem CHECK), `study` JSONB, `fact_id`, `error` | Upsert | `org_id` |
| `meeting_parecer_advice` | PK projeto+reunião; `advice` JSONB, `signature` | Upsert | `org_id` |
| `knowledge_materials` | Material: `full_text`, `text_hash`, `status` (processing/ready/failed), `stage`, `progress`, `study`, `study_error`, `fact_id`, `archived_at` | Exclusão lógica (`archived_at`) | `org_id` |
| `knowledge_material_chunks` | Trechos (`heading`, `ref`, `content`, `embedding` JSONB, `content_tsv` gerado, GIN) | Apaga e recria na indexação (transação) | `org_id` (FK cascade ao material) |
| `ai_knowledge_facts` | 1 fato por parecer (`Parecer PRICETAX: …`) e 1 por material (`Material PRICETAX:<id>`), `scope='org'`, `origin='internal_document'` | Insere/atualiza; `archived`/`superseded` | `org_id` |
Detalhes de colunas: `docs/gerado/BANCO.md`. As tabelas `meeting_edits` e `knowledge_*` são criadas por `ensure…Schema` chamadas no `initDb` (`server/db.js`).

## Tipos de leitura e de saída
- **Listas:** envios = 50 mais recentes por empresa; correções = 50; dossiê = só a mais recente `done` (as 5 últimas ficam no banco).
- **Reunião pela API:** `summary`/`decisions` cortados em 20.000 caracteres; transcrição só com `?transcript=1` e até 60.000 (`transcriptTruncated`).
- **Estado de estudo de parecer:** `getStudyState` entrega `items` (só os usáveis na empresa), `others{count, studied}` (contagem dos de outros clientes, sem título) e `pending`; `allItems` **nunca sai** do servidor.
- **Dossiê:** JSON estruturado (`executiveSummary`, `timeline`, `workstreams`, `decisions` com `state` vigente/alterada/revogada/incerta, `people`, `risks`, `gaps`, mais `openItems`, `stats`, `meetings`, `notes`). Exporta para Markdown/HTML no navegador.
- **Arquivos:** parecer e material saem como download/inline; o material de texto sai como `.txt`.
- **Texto da IA em português:** os erros passam por `friendlyAiError` (reuniões), `friendlyStudyError` (pareceres) e `friendlyError` (material/dossiê, cada um com sua cópia da lista).

## Regras e travas
| Trava | O que impede | Onde é garantida | O que o usuário vê |
|---|---|---|---|
| Sem `ANTHROPIC_API_KEY` | Envio/retry/dossiê/estudo sem IA | `createSubmission`, `reprocessSubmission`, `POST /dossier`, `startStudy` | 503 "…não configurado nesse ambiente" |
| Acesso à empresa | Enviar/ler/reprocessar em empresa sem acesso | `canAccessProject` (`server/routes.js`: `companiesAccess` + CNPJ ou `allCompaniesAccess`; mesma organização) | 403/404 |
| Duplicidade de transcrição (**só na API**) | Mesmo texto na mesma empresa processado 2 vezes | `createSubmission` com `dedupe:true` (`md5(transcript)`) | 200 `duplicate:true` |
| Limite de 30 envios/hora por chave | Gasto de IA por chave | `server/connect.js` (`transcriptsLimit`) | 429 |
| Transcrição 200 a 400.000 caracteres (API) | Texto curto ou gigante | `POST …/transcripts` | 400 / 413 |
| Correção só de campos da lista, tudo-ou-nada | Corrigir `status`, vínculo, transcrição etc. | `applyMeetingEdit` + transação `FOR UPDATE` | 400 com `errors[]`, nada gravado |
| Limite 200 correções/hora | Abuso | `runMeetingEdit` (`editLimit`) | 429 |
| Chave de correção exige Empresas | Corrigir sem acesso | `needMeetingsEdit` | 403 |
| Dossiê só da equipe | Cliente ler compilado interno | `canUseDossier` (`server/assistant.js`) | 403 |
| Um dossiê por vez por empresa | Pagar 2x | `startDossier` | Devolve o mesmo (`alreadyRunning`) |
| Job de dossiê/estudo/envio morto | Botão travado para sempre | `failStaleJobs` (45 min), `failOrphanedDossiers` (ao subir), `computeStudyState` (1/30 min), `listSubmissions` (5 min) | Vira erro/failed e libera nova tentativa |
| Pareceres só da equipe | Cliente ver parecer | `router.use(requireAuth, requireMasterOrPricetax)` | 403 |
| Parecer Cliente específico só na empresa dele | Vazar parecer de um cliente a outro | `parecerUsableFor` | Parecer não aparece (nem como título) |
| PDF <= 10 MB e `application/pdf` declarado | Arquivo grande/outro tipo | `POST /api/pareceres` | 400 |
| Estudo 1 vez por hash | Pagar IA de novo | `computeStudyState` (SHA-256 em SQL) | "Nada novo — nada foi gasto" |
| Sugestão sem estudo não chama IA | Custo | `generateMeetingAdvice` | Caixa "a RENATA ainda não estudou nenhum parecer" |
| Material <= 10 MB, >= 200 caracteres, formato da lista, sem duplicado | Entrada ruim | `readInput`, `POST /api/knowledge-library` | 413 / 422 / 400 / 409 |
| Biblioteca só da equipe | Cliente ver material | `router.use(requireAuth, requireMasterOrPricetax)`; `isStaff` no prompt | 403; cliente nunca recebe |
| Exclusão lógica | Perder reunião/tarefa/material | `deleted` (reunião e item), `archived_at` (material) | Lixeira / "Restaurar" |
| Pareceres excluídos de verdade | — (exceção) | `DELETE /api/pareceres/:id` (fato é arquivado antes) | Confirmação na tela; sem desfazer |

## IA nesta área
| Uso | Modelo | `max_tokens` | Entra no prompt | Se cortar/falhar |
|---|---|---|---|---|
| Extração da transcrição | `claude-opus-5` | 16000 (`EXTRACTION_MAX_TOKENS`) | Transcrição inteira (sem limite no código), nome do cliente, equipe PRICETAX | 1 retentativa com `COMPACT_HINT`; depois `failed` com mensagem em português |
| Vínculo tarefa→atividade | via `suggestActivityLinks` (`server/taskLinkSuggest.js`) | (ver esse arquivo) | Tarefas e atividades da empresa | Engolido; reunião sai sem sugestão |
| Resumo da transcrição para o dossiê | `claude-sonnet-5` | 1800 | Transcrição (<=120.000 caracteres) | Segue sem o resumo; conta `digestFailures` |
| Dossiê (consolida e une) | `claude-opus-5` | 16000 | Fichas de reunião (sem transcrição bruta, salvo o resumo gerado) | 1 retentativa enxuta; depois `error` |
| Estudo de parecer | `claude-sonnet-5` | 16000 (`STUDY_MAX_TOKENS`) | O PDF (base64) + título | 1 retentativa enxuta; erro na tela |
| Sugestão por reunião | `claude-sonnet-5` | 8000 (`ADVICE_MAX_TOKENS`) | Resumo/decisões/tópicos/tarefas + índice dos estudos usáveis na empresa | 1 retentativa enxuta; 502 na rota |
| Estudo de material | `claude-sonnet-5` | 16000 (+3500 por parte longa) | Texto do material (ou anotações das partes) | 1 retentativa enxuta; `study_error` |
| Título/tema/etiquetas do material | `claude-haiku-4-5-20251001` | 600 | Começo (9.000) + 3 amostras do texto + vocabulário da biblioteca | Sugestão nula com aviso |
- **Regra de fidelidade** (todos os prompts): usar SÓ o que está no texto; não inventar data, nome, norma, número; vazio quando não consta.
- **Nunca entra no prompt:** segredos/`.env`. Orientação dos pareceres só vai para equipe (`isStaff`); parecer de outro cliente nunca entra no prompt de outra empresa.
- **Custo/cache:** `system` em bloco com `cache_control` `ttl:'1h'` na extração, estudo de parecer, sugestão e estudo de material (a extração tem instrução curta demais para cachear de fato; o custo é a transcrição). Cada chamada grava `anthropic_api_call` em métricas (`logMetric`) com tokens.
- **Saída estruturada:** `messages.parse` + Zod achatado (nunca `discriminatedUnion`, que derrubou a RENATA em 2026-09-10). Quando o JSON estoura o limite, o SDK **lança erro** ("Unterminated string…") em vez de devolver `stop_reason` — por isso `isTruncated`/`isTruncatedError` olham o texto do erro.

## Bugs e armadilhas conhecidos
| Sintoma -> causa | Onde foi corrigido | Como NÃO reintroduzir |
|---|---|---|
| Transcrição presa em "Processando…" -> processo morreu num deploy (§44) | `listSubmissions` (5 min) + botão após 90 s na tela | Todo job fire-and-forget precisa de recuperação de órfão |
| Erro cru da Anthropic na tela (§49) | `friendlyAiError` na gravação **e** na leitura | Qualquer erro novo conhecido entra na função; a leitura cobre linhas antigas |
| Extração de reunião longa cortada (§116e) | `EXTRACTION_MAX_TOKENS` 16000 + retentativa enxuta | Não baixar o teto; manter `isTruncated` |
| Estudo de parecer longo falhava para sempre (§116g) | `STUDY_MAX_TOKENS` 16000, `ADVICE_MAX_TOKENS` 8000, retentativa, motivo na tela | Teste `parecer-study-truncation.test.mjs` |
| Estudo da LC 214 inteira cortado (§116) | `studyMaterial`: 16000 + prompt conciso + retentativa | Idem; material gigante passa por partes |
| Linha "enviou transcrição" do log sumia (2026-10-28) | `createSubmission` **aguarda** o log antes de disparar o processamento | Não paralelizar dois gravadores do `projects.data` |
| Data `2026-02-31` aceita (`Date.parse` arredonda) | `isISODay` (ida e volta) | Sempre validar data com `isISODay` |
| Parecer de um cliente aparecendo em outro (§70) | `parecerUsableFor` (regra fechada) em todos os pontos | Todo ponto novo que leia parecer **tem** que filtrar por `parecerUsableFor` |
| "Conflitos" falsos entre pareceres vizinhos | `registerFact` por INSERT direto; `findSimilarFact` ignora `Parecer PRICETAX:%` | Não usar `saveKnowledgeFact` para fato de parecer |
| RENATA mostrava `[id=akf-…]` (§116h) | `stripInternalIds`; citar por título | Instrução de citação por id só vale onde há campo estruturado |
| Dossiê "eternamente gerando" (2026-10-19) | `failOrphanedDossiers` ao subir | O job vive no processo; deploy o mata |
| RENATA travada em "…" (§116j) | Resposta forçada ao fim dos passos; ferramentas `reuniao_ver`/`reunioes_buscar` | — |

**Armadilhas ainda abertas (achados de leitura do código; nenhuma reproduzida em produção):**
1. ~~Gravação com dado velho em `processSubmission`~~ — **corrigido em 2026-10-29**: relê o projeto com `FOR UPDATE` imediatamente antes de gravar (mesma família do bug das duas abas, §117).
2. **Reprocessar:** desde 2026-10-29 `processSubmission` só começa se o envio **não** estiver já em `processing` (trava no `UPDATE … WHERE status <> 'processing'`), o que evita duas reuniões iguais. As rotas `POST /meeting-inbox`, `/retry-failed` e `/:id/retry` agora exigem Master ou PRICETAX (usuário `cliente` recebe 403).
3. **Tela sem dedupe:** `POST /api/meeting-inbox` não usa `dedupe`; colar a mesma transcrição duas vezes cria duas reuniões.
4. **Sem aviso de tarefa quando a origem é a IA ou a API:** a reunião criada por transcrição e a correção de responsável via API **não** geram `todo_assigned` (`processSubmission` e `runMeetingEdit` não chamam `notifyTodoChanges`; só `PATCH /api/projects/:id` e `POST /api/projects/:id/meetings` chamam). O lembrete de tarefa vencida (`runTodoReminders`) pega depois, para qualquer origem.
5. **`responsibleStatus: 'confirmar'` não aparece na tela:** nenhum arquivo de `src/` lê `responsibleStatus`/`responsibleOriginal`; o aviso só existe na API/ferramentas.
6. **Estado `changed` do parecer é inalcançável pela aplicação:** nenhuma rota troca `file_data` (o `PATCH` não aceita arquivo). Para atualizar um parecer: excluir e enviar de novo.
7. **Material arquivado reativa o fato:** `upsertFact` põe `status='active'`; reprocessar um material arquivado (botões continuam na tela) reativaria o fato (a busca ainda ignora material arquivado) — não testado.
8. **Vínculo `company_project_id` do parecer** vira `NULL` se a empresa for apagada (FK `SET NULL`); o parecer passa a depender só do nome (regra de tokens).
9. **Comentário inexistente excluído:** `DELETE …/comments/:id` responde `{ok:true}` mesmo se o comentário não existe.

## Como testar
Sem test runner; cada script é descartável e usa banco **local** (recusa outro).
| Script | O que prova | Cobre |
|---|---|---|
| `scripts/connect-transcripts.test.mjs` (~50 checagens; servidor :3012 + "Anthropic" falsa :3911) | Chaves/permissões, validações, envio -> reunião, data/hora informadas valendo mais, duplicado sem nova IA, falha de crédito em português + retry, limite 30/h, revogação, comandos do `.md` | A1, A2, API de transcrição |
| `scripts/connect-meetings-edit.test.mjs` (~100; :3013 + falsa :3912) | Permissões, 30 recusas sem gravar, tudo-ou-nada, `dryRun`, log, memória reindexada, histórico, desfazer em ordem inversa, extração cortada (1 retentativa) | A4 |
| `scripts/connect-scopes.test.mjs` | Escopos `read_all`/`write_all` e os antigos | Chaves |
| `scripts/meeting-register.test.mjs` | `POST /api/projects/:id/meetings` | A7 |
| `scripts/parecer-study-truncation.test.mjs` (4) | Estudo com corte: 16000, retentativa, erro 401 não repete (IA simulada) | B1 |
| `scripts/renata-parecer-orientacao.test.mjs` (17) | Orientação no chat: só equipe, escopo por empresa, parecer apagado some, limites | B2, B4 |
| `scripts/knowledge-library.test.mjs` (40) e `knowledge-library-http.test.mjs` | Leitura de PDF/PPTX/DOCX/XLSX/MD/HTML, fatiamento, pipeline com IA simulada, busca, isolamento, falha de IA, rotas reais | C |
| `scripts/renata-tools.test.mjs`, `renata.test.mjs` | Cobertura das ferramentas/rotas da RENATA (inclui `biblioteca_consultar`) | C3 |
**Sem teste automatizado:** o Dossiê (`server/dossier.js`; funções puras e job sem script em `scripts/`), `todoNotifications.js`, `memoryIngest.js` direto, upload de PDF de parecer pela rota HTTP, `ParecerAdviceBox`, polling das telas. **Nunca testado com IA real:** qualidade da extração, estudo de parecer longo, estudo de material, título/tema sugeridos, resposta da RENATA citando material/parecer (ver §116, §116g, §116i).

## Receitas: "se o Rafael pedir X, faça Y"
1. **"A RENATA extrai pouco/mal da reunião (campos novos, tarefas)":** abrir `server/meetingInbox.js` (`MeetingExtractionSchema` e prompt `system`) -> se criar campo novo, repassar em `processSubmission` (objeto `meeting`) e em `normalizeActionItems` -> `server/meetingEdit.js` (`ITEM_FIELDS`/`ITEM`) se a API deve poder corrigir -> `server/connect.js` `itemOut`/`meetingOut` para leitura -> front (`src/meetings/`) para exibir. Conferir `connect-transcripts.test.mjs` e `connect-meetings-edit.test.mjs`; atualizar `docs/IA_EXTERNA_ENVIAR_TRANSCRICAO.md` se mudar o contrato.
2. **"Transcrição falhou/travou":** ver `error_message` em `meeting_submissions` (só `SELECT`) e o log do servidor ("Falha ao processar transcrição de reunião"). Erro de crédito/chave: ação do Rafael no console da Anthropic/Railway; depois "Tentar novamente todas". Reunião gigante: já há 1 retentativa enxuta; se persistir, considerar subir `EXTRACTION_MAX_TOKENS` (teto de saída do SDK sem streaming ~16000: conferir antes).
3. **"Mensagem de erro nova em português":** `friendlyAiError` (reuniões); para pareceres `friendlyStudyError`; para material `friendlyError`. Acrescentar o padrão e um caso no teste correspondente.
4. **"Liberar mais um tipo de correção pela API":** `MEETING_FIELDS`/`ITEM_FIELDS` + validador em `meetingEdit.js`; lembrar que `activityId`/`activityLink`/`status` são proibidos de propósito. Rodar `connect-meetings-edit.test.mjs` (ele testa 30 recusas) e ajustar `src/connect/guide.js` e a lista `ENDPOINTS` de `connect.js`.
5. **"Mudar o dossiê (nova seção, outro limite)":** `DossierSchema` e prompts em `server/dossier.js` (instâncias novas de `ids()`; sem `discriminatedUnion`) -> `sanitizeConsolidation` (tem que listar o campo novo) -> `src/meetings/DossierPanel.jsx` e `dossierExport.js`. Mudar o que entra na ficha muda `meetingSourceHash` (todos os dossiês antigos ficam "desatualizados" — esperado). Se mudar `digestKeyOf`, o cache de resumos é invalidado.
6. **"Dossiê não termina":** ver `project_dossiers.error`/`progress` (só `SELECT`); lembrar que o job morre no deploy (`failOrphanedDossiers`); o botão volta sozinho a gerar.
7. **"Parecer novo não entrou nas respostas":** ver `GET /api/pareceres/study` (estado) e o aviso "Falhou: … — motivo" -> `parecer_studies`. Conferir `parecerUsableFor` (tag Geral/Cliente e nome/projeto da empresa onde está testando) e `pickRelevantPareceres` (a pergunta precisa tocar o tema; limite de 3).
8. **"Mudar a regra de escopo de parecer":** só `server/parecerScope.js`; qualquer ponto novo de leitura **deve** chamar `parecerUsableFor`. Rodar `renata-parecer-orientacao.test.mjs` (cobre cliente sem acesso e outro cliente).
9. **"Trocar o PDF de um parecer":** hoje não há rota; excluir e enviar de novo (o fato antigo é arquivado). Se o Rafael quiser troca com re-estudo, criar rota que atualize `file_data` (o estado `changed` e o fato `superseded` já estão prontos em `computeStudyState`/`runStudyJob`).
10. **"Aceitar outro formato de material" (ex.: `.rtf`, `.odt`):** `SUPPORTED` e `extractText` em `server/materialText.js` (+ mensagem de formato); dependência nova: fixar versão e rodar `npm audit`; teste em `knowledge-library.test.mjs`. Texto vai a `cleanText` (limite 1,5 milhão de caracteres).
11. **"A RENATA não acha o material":** usar a caixa "Testar o que a RENATA acha" (`/search`); ver se o status é "A RENATA já sabe" (`ready`); `searchMaterial` exige >=2 termos casando e descarta trechos < 60% do melhor; sem `VOYAGE_API_KEY` só há busca por palavra. Ajustes de limiar em `searchMaterial` (0,2 / 0,48) afetam todas as perguntas: testar com `knowledge-library.test.mjs`.
12. **"Material cortado no estudo":** `studyMaterial` (`PART_CHARS`, `COMPACT_HINT`, 16000). Botão "Estudar de novo" (`?only=study`) não refaz os trechos.
13. **"Reunião sumiu da busca da RENATA":** botão "Atualizar memória da RENATA" (aba Reuniões) = `POST /api/assistant/reindex`; script manual `server/scripts/reindexAllMeetings.js` (escreve no banco: só o Rafael/ambiente local). Causa comum: gravação direta no banco sem `reindexMeetingMemory`.
14. **"Avisar o responsável quando a RENATA criar a tarefa":** hoje não avisa (armadilha 4). Chamar `notifyTodoChanges` (assinatura com `req`; precisa adaptar para chamada sem `req`) depois do UPDATE em `processSubmission`; conferir que o nome do responsável bate com um usuário.
15. **"Gerar a sugestão dos pareceres para reunião criada por outro caminho":** chamar `generateMeetingAdvice` (como `processSubmission` faz) no caminho novo; ele já se protege (sem estudo, não chama IA).

## Não verificado / dúvidas
- Não executei nada contra IA real, banco de produção ou Railway; tudo vem da leitura do código e dos documentos.
- `requireMasterOrPricetax` (`server/auth.js`) confere `role` master/pricetax e **não** `isSuperAdmin`; não verifiquei se o super admin sempre tem um desses perfis. Já o dossiê usa `canUseDossier`, que inclui super admin. A mensagem de 403 desse middleware diz "podem cadastrar empresas", enganosa para Pareceres/Biblioteca.
- Se perfis `cliente` com `companiesAccess` veem a aba Reuniões (e portanto o botão "Enviar transcrição"): o servidor não bloqueia (`canAccessProject` apenas); não confirmei no front se a aba é escondida para eles.
- `genShareToken` (`src/App.jsx`) usa `crypto.getRandomValues` (192 bits) e o servidor só aceita token NOVO nesse formato (troca o fraco). `GET /api/public-meeting/:token` devolve lista fechada de campos e consulta o banco por contenção JSONB (1 linha), com limite de 60/min por IP.
- `xlsx` (leitura de planilha em `materialText.js`) aparece como biblioteca desatualizada na auditoria de 2026-10-16; não conferi se continua vulnerável. Só equipe envia, mas o arquivo vem do usuário.
- O comentário no topo do `StudyBanner` (`Pareceres.jsx`) ainda diz "O estudo é MANUAL (não roda ao enviar o PDF)", mas o servidor roda `autoStudy` após o envio (`server/pareceres.js`, `POST /`) e o texto do próprio aviso diz "estudados sozinhos". Vale corrigir o comentário.
- O texto do §24 do `PROJECT_CONTEXT.md` descreve a reunião com poucos campos (`{id,title,responsible,dueDate,status,deleted}` por tarefa); o código atual tem muito mais (A3).
- Não li `server/taskLinkSuggest.js`, `server/inventory.js` (`matchPerson`), `src/meetings/TranscriptView.jsx`, `TodoBoard.jsx`, `TodoDrawer.jsx` nem `src/knowledge/LibraryTab.jsx` linha a linha; só confirmei os trechos citados.
- Rotas e limites de `meeting-inbox` na tela: não há limite de tamanho do texto além dos 15 MB do corpo JSON (`server/index.js`) e nenhum limite por hora (só a API tem).
