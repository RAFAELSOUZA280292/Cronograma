# PROJECT_MAP.md — Índice técnico (PRICETAX Cronograma)

Mapa de localização, não documentação completa. Números de linha são
aproximados no momento da escrita — **o índice de componentes de `App.jsx` (§3) foi regenerado do código em 2026-10-05** e a documentação toda foi reconciliada nessa data (`PROJECT_CONTEXT.md` §79). Se o arquivo tiver sido editado
depois, confirme com `grep -n "nome_da_função" src/App.jsx` antes de usar
`Read` com `offset`. Fonte da verdade é sempre o código.

## 1. Arquitetura geral

- **Frontend**: SPA React 18 (Vite), sem biblioteca de roteamento — navegação é
  estado em memória (`view`, `workspaceMode`, `openActivityId`, `openMeetingId`,
  etc. em `App()`) **espelhado na URL por módulo** (`src/lib/routes.js`, §74 do
  CONTEXT). Quase todo o app (telas, modais, estilos) está em
  `src/App.jsx`. Exceções (módulos em pasta própria, ver seção 2): XFlow
  (`src/xflow`), Agenda, Visão Macro, Reuniões, Conhecimento, Pareceres, **Modelos**,
  CRM, **Meu dia/boas-vindas** (`src/daily`), **Widget do iPhone** (`src/widget`) e as
  peças visuais comuns (`src/ui`) — todos importam primitivas compartilhadas (`S`, `uid`,
  `fmtDate`, `fmtTs`, `useIsMobile`, `useIsCompact`, `BrandLogo`,
  `ThemeToggleBtn`, `NotificationBell`, `SidePanel`, `STATUS_META`,
  `STATUS_ORDER`, `PRIORITY_META`, `PRIORITY_ORDER`, `useAutosaveTimestamp`,
  `useDirtyForm`, `ConfirmDiscardModal`, `savedStatusLabel`) exportadas de
  `App.jsx`.
- **Backend**: Express (`server/`), API REST sob `/api/*`. Rotas de usuários/
  projetos/etc. em `server/routes.js`; rotas do XFlow num router próprio,
  `server/xflow.js`, montado em `/api/xflow`. Serve também os estáticos de
  `dist/` e faz fallback de SPA (`app.get('*', ...)`).
- **Banco**: Postgres, driver `pg` puro (sem ORM/query builder). **45 tabelas**
  (lista por grupo em `PROJECT_CONTEXT.md` §5); a seção 6 abaixo descreve cada uma e as seções de módulo trazem o
  detalhe (XFlow §4, Notificações/Google Calendar `PROJECT_CONTEXT.md` §20/§21, Reuniões §24.1, CRM §54–§58, Meu dia §77, Modelos §78).
  Multi-tenant desde 2026-08 (Fase 1): `users`/`projects`/
  `xflow_tickets` têm `org_id` (FK pra `organizations`), toda query filtra
  por ele — ver CLAUDE.md seção "Multi-tenant".
- **APIs externas**: BrasilAPI/ReceitaWS (CNPJ, cache em `cnpj_cache`), Anthropic (IA), Voyage (embeddings), Google Calendar,
  Liturgia Diária, Midvash e AstroWay (conteúdo do Meu dia), geolocalização por IP e a busca de páginas para a prévia de link
  dos Modelos (com defesa contra SSRF). Tabela completa em `PROJECT_CONTEXT.md` §6.
- **Autenticação**: JWT em cookie httpOnly, ver `server/auth.js`.
- **Armazenamento de arquivos**: não há storage externo (S3 etc.). Anexos de
  atividade são **base64 inline dentro do JSONB** do projeto
  (`activity.attachments[].dataUrl`, até 8MB por arquivo — `MAX_ATTACHMENT_BYTES` em `App.jsx`; não escala bem, ver §9);
  arquivos de **Pareceres (≤10 MB) e Modelos (≤30 MB cada)** ficam em `BYTEA` no Postgres.
- **Processamento assíncrono / filas**: não há fila externa. Trabalhos longos (estudo dos Pareceres, Dossiê, transcrição, reindexação)
  rodam dentro do processo e gravam o estado em tabela; há um agendador de 10 min (lembretes do CRM, `server/crm/scheduler.js`).
  Debounce de autosave é client-side (`setTimeout`).
- **Infra/deploy**: Railway, auto-deploy on push para `main` do repo GitHub
  `RAFAELSOUZA280292/Cronograma`. `npm run build` gera `dist/`, `npm start`
  serve tudo num único processo Node.

## 2. Estrutura de diretórios

```
src/App.jsx        Frontend principal: componentes, telas, estilos (S), lógica de estado. Exporta primitivas usadas por xflow/ e agenda/. 2026-09-16: flushProjectSave(pid) (ao lado de persistProjectDebounced/saveTimers) força o PATCH debounced a sair agora — usado por ActivityDetailModal/MeetingDetailModal antes de fechar; ActivityDetailModal ganha fieldsDirty (useDirtyForm sobre título/desc/notes/transcript) somado ao hasDraft, e "Sair sem salvar" reverte os campos de verdade — ver PROJECT_CONTEXT.md §43. 2026-09-17: novo useDebouncedField (perto de useDirtyForm) — campo de texto 100% local, só propaga pro resto do app 300ms após a última tecla, não a cada tecla; aplicado aos 4 campos autosave de ActivityDetailModal (bug real "escrevo e o texto some") — ver §45. 2026-09-17 (auditoria "onde mais isso?"): mesmo hook aplicado a título/descrição de PersonalCardDetailModal (Quadro Pessoal) — ver §46. 2026-09-17: os 3 casos que estavam dentro de `.map()` (pendência do §46) foram extraídos em componentes próprios — SubactivityRow (perto de ActivityDetailModal), AreaRow e PhaseRow (perto de App()) — cada um usando useDebouncedField; drag-and-drop de subatividade/fase preservado (estado do pai, só passado como prop) — ver §47. Só o TableView (§45) segue como pendência do mesmo padrão. 2026-09-17: novo workspaceMode='pareceres' (hasPareceres = master/pricetax, mesma condição de hasKnowledge) + card "Pareceres PRICETAX" na WorkspaceGateScreen — ver §48. 2026-09-20: quadros compartilhados fixados como aba na Gestão de Atividades — PublicBoardScreen ganha `embedded` (+ botão "Adicionar ao meu quadro", viewPrefs locais, refresh 45s), PersonalBoardScreen ganha abas de `board.linkedBoards` — ver PROJECT_CONTEXT.md §52. 2026-09-29: bug real "digito e some sozinho" (Amanda, criar atividade em reunião) — `reloadProjects` (chamado pelo poll de sincronização de 6s) sobrescrevia `projects` inteiro mesmo com edição local pendente; ganha `opts.background` + funde com `saveTimers`/`inFlightProjectSaves` (novo ref, marcado por `trackInFlightSave`) em vez de substituir; catch de erro não zera mais `projects` num poll de fundo. Amanda testou de novo e não viu efeito (aba aberta de antes do deploy, rodando JS antigo) — novo `useEffect` checa `/` sem cache a cada 4min e mostra toast persistente "Atualizar agora" (`window.location.reload()`) quando o JS servido mudou — ver §60. 2026-10-01: `PersonalCardDetailModal` ganha `columnId`/`otherColumns`/`onMoveTo` — o "Mover para…" que só existia no menu do card (`PersonalCardMenu`) agora também é um `<select>` no cabeçalho do modal de detalhe (reusa `moveCardToIndex`, já existente), pedido do Rafael — ver §61. 2026-10-01: item de checklist (Quadro Pessoal) agora é editável — clique no texto ou no lápis vira `<input>`, Enter/blur salva (`updateChecklistItem`, novo, mesmo padrão de `addChecklistItem`), Escape cancela sem salvar (`cancelingChecklistRef` evita que o blur do Escape salve por cima) — ver §62.
src/xflow/XFlow.jsx     Módulo XFlow (gestão de BUGs) — telas, constantes de status/severidade/prioridade, helpers. 2026-10-02: colar print (Ctrl+V) e arrastar imagem nas TASKs — helpers `clipboardImageFiles`/`imageFilesFrom`/`readEvidenceFile`, `ContentField` ganha `onPasteImage`, comentário aceita colar/arrastar, Ctrl+V sem foco anexa em Evidências, `FlashToast` — ver PROJECT_CONTEXT.md §64.
src/agenda/Agenda.jsx    Módulo Agenda (2026-08) — visão dia/semana/mês da disponibilidade (Google + XFlow + atividades), toggle de privacidade.
src/agenda/RenataAgendaBriefing.jsx  Painel da RENATA na tela inicial (2026-09-20, recomposto em cartões 2026-09-22) — agenda de hoje/semana pra quem conectou o Google, convite "vamos conectar sua agenda?" pra quem não. Sem IA (lê /api/agenda, texto montado local). 5 cartões: visão geral+veredito lateral, trilho da semana, agenda do dia (DayBar), atenção, reuniões. Montado em WorkspaceGateScreen (App.jsx) — ver PROJECT_CONTEXT.md §59.
src/macro/MacroOverview.jsx  Módulo Visão Macro (2026-08) — cronograma consolidado de TODAS as empresas da org, por dia, com destaque de atrasado/hoje/próximo.
src/meetings/Meetings.jsx   Módulo Reuniões (2026-09) — lista (MeetingsView) + caixa de transcrições (envio, status, retry). O detalhe da reunião em si mora em MeetingDetail.jsx. 2026-09-16: botão "Tentar novamente" também aparece pra 'processing' há mais de 90s (provável travamento), não só pra 'failed' — ver PROJECT_CONTEXT.md §44. 2026-10-02: botão "Dossiê do cliente" (só master/pricetax) abre o DossierPanel — ver PROJECT_CONTEXT.md §63.
src/meetings/MeetingDetail.jsx  Tela de detalhe de reunião — "AI Meeting Workspace" (2026-09) — MeetingDetailModal, MeetingShareModal, MeetingPrintReport, PublicMeetingScreen (PROJECT_CONTEXT.md §26). 2026-09-16: EditableTextCard (Resumo/Decisões) vira forwardRef com flush()/isDirty(); MeetingDetailModal ganha fieldsDirty (useDirtyForm sobre título/data/horário/resumo/decisões) somado ao hasDraft — antes só rascunho de participante contava, editar e fechar não pedia confirmação — ver PROJECT_CONTEXT.md §43.
src/meetings/TranscriptView.jsx  Card de transcrição com 3 modos: Completa/Por temas/Highlights, busca com destaque (2026-09, PROJECT_CONTEXT.md §26).
src/meetings/TodoBoard.jsx  Aba "Atividades" / "Centro de Execução" (2026-09) — todos os itens de TO_DO de todas as reuniões da empresa, achatados numa lista só, com cards de indicador, filtros/ordenação/agrupamento e "Minha fila" (PROJECT_CONTEXT.md §25).
src/meetings/TodoDrawer.jsx  Painel lateral de detalhe de uma atividade (2026-09) — Origem/Descrição/Subtarefas/Comentários/Arquivos/Histórico (PROJECT_CONTEXT.md §25). Reaproveitado direto pela tela de Reunião também. 2026-09-17: título/subtítulo/responsável/descrição migrados pra useDebouncedField (App.jsx) — mesmo bug de digitação do §45, encontrado aqui na auditoria do §46.
src/meetings/ActivityRow.jsx  Linha de atividade (2026-09) — extraída de TodoBoard.jsx pra ser o mesmo componente visual usado na aba Atividades e na coluna de atividades da Reunião. Exporta ACTIVITY_ROW_CSS (cada tela que a usa deve renderizar esse <style> uma vez).
src/meetings/todoUtils.js   Utilitários puros pra Atividades (2026-09) — iniciais/cor de avatar, cálculo de atraso, saudação por horário.
src/meetings/meetingUtils.js  Utilitários puros pra Reunião (2026-09) — parseTranscript (regex best-effort), sliceEntriesByTopics, buildMeetingText/downloadTextFile (exportação .txt).
src/main.jsx        Bootstrap do React (ReactDOM.createRoot).
src/lib/api.js        Wrapper fetch (apiGet/apiPost/apiPatch/apiDelete), credentials:'include'.
src/assets/brand/       Logos PNG da PRICETAX (preto = tema claro, branco = tema escuro).

server/index.js       Bootstrap Express: initDb, seedIfEmpty, monta todos os roteadores (mapa completo em `PROJECT_CONTEXT.md` §8.1: /api, /xflow, /google, /agenda, /macro, /meeting-inbox, /assistant, /knowledge, /pareceres, /crm, /widget, /daily, /templates), inicia o agendador do CRM e serve dist/. `/api/templates` tem parser JSON próprio de 45 MB montado antes do global de 15 MB. Caminho fora de `/api` devolve o `index.html` (fallback do SPA); rota inexistente SOB `/api` devolve 404 em JSON (2026-10-05; não existe `/api/health`).
server/db.js           Pool pg, criação de tabelas (initDb), seed inicial, defaults de projeto novo. Fase 8: ai_knowledge_facts ganha conflicts_with/disputed_reviewed_at/by/supersede_reason/source_meeting_id/content_tsv; ai_answer_cache e ai_messages ganham cited_fact_ids (ai_messages também from_cache); tabelas novas ai_knowledge_entities/ai_knowledge_fact_entities — ver PROJECT_CONTEXT.md §39. 2026-09-17: tabela nova `pareceres` (PDF em BYTEA, comments em JSONB) — ver §48. 2026-09-28: `pareceres` ganha `scope`/`company_name`/`company_project_id` (tag Geral×Cliente específico, sem CHECK — validado em JS). 2026-10-02: tabelas novas `project_dossiers` e `project_meeting_digests` (Dossiê do cliente) — ver §63.
server/auth.js         JWT/bcrypt, cookie de sessão, middlewares requireAuth/requireMaster*/requireXflowAccess.
server/routes.js        Rotas REST de auth, users, projects, personal-board, cnpj, organizations, notifications; GET /projects/versions (2026-09-10) — poll barato de {id,updatedAt} pra sincronização entre usuários, ver PROJECT_CONTEXT.md §28. canAccessProject() e effectiveOrgId() exportados (Fase 8) — reusados por server/permissions.js, nunca reimplementados. 2026-09-20: POST /personal-board/linked (addLinkedBoard) + isOwner/alreadyLinked em GET /public-board/:token — ver §52. 2026-09-28: GET /projects/lite — payload leve {id,name} por projeto (nunca o data JSONB inteiro), usado pelo autocomplete de cliente dos Pareceres, ver §48.
server/permissions.js  listAccessibleProjectIds(pool, user, orgId) (Fase 8, 2026-09-11) — reusa canAccessProject linha a linha pra devolver o CONJUNTO de projetos acessíveis (não um booleano por projeto), base do isolamento cross-projeto da Central de Conhecimento — ver PROJECT_CONTEXT.md §39.
server/xflow.js         Rotas REST do módulo XFlow (team, tickets, events, view) — router próprio montado em /api/xflow.
server/notifications.js    Central de Notificações (2026-08) — createNotification()/rowToNotification(), usado por xflow.js e routes.js.
server/widget.js           Widget do iPhone (2026-10-05, §76): /api/widget — token (hash em users), status, GET /summary por Bearer (público, limite por IP). Funções puras em server/widgetSummary.js.
server/inspirationQuotes.js  Frases de inspiração (2026-10-05, §77): base curada de Ayrton Senna e Henry Ford (`oficial` = conferida na fonte oficial × `pesquisa` = não conferida; Ford com original em inglês e aviso das frases não autenticadas), `quoteOfDay` (Mensagem do dia), `seedQuoteFacts`/`embedQuoteFacts` (memória da RENATA, ids `akf-quote-*`, chamados no boot em index.js). `knowledgeFacts.js` as mantém fora da janela geral de fatos.
server/daily.js            Meu dia (2026-10-05, §77): /api/daily — conteúdo do usuário, preferências (users.preferences), onboarding. Fontes, cache diário, signo/animal e IA em server/dailyContent.js.
server/documentTemplates.js  Modelos de documentos (2026-10-05, §78): /api/templates — arquivos (lista fechada de extensões, ≤30 MB) e links com prévia; mesma regra dos Pareceres. Auxiliares: officePreview.js (texto de docx/pptx/xlsx) e linkPreview.js (Open Graph com defesa contra SSRF).
server/connect.js         API de conectividade (2026-10-05, §80): `/api/connect` — tokens por janela do Claude Code (cookie) e API Bearer estreita (atividades ler/criar, empresas, reuniões, agenda). Tabela `api_tokens`. `mergeApiCards` (rede de segurança do quadro) está em routes.js.
server/xflowPermissions.js  Papel efetivo (reporter/dev/gestao/admin) + canDo() — matriz de "quem pode o quê" do XFlow.
server/xflowTransitions.js  Matriz de transições de status do XFlow — de onde cada ação pode partir e pra onde vai.
server/googleCalendar.js   Sincronização com Google Calendar (2026-08) — helper puro (OAuth2, criar/atualizar/apagar/listar evento), sem rotas; createEvent() (Fase 4, 2026-09-10) generaliza a criação de evento pra uso da RENATA — ver PROJECT_CONTEXT.md §32.
server/google.js        Rotas OAuth do Google Calendar (status, oauth/start, oauth/callback, disconnect) — router próprio em /api/google.
server/agenda.js        Rota única de leitura da Agenda (2026-08) — GET /api/agenda mescla Google + TASKs do XFlow + atividades do usuário.
server/macro.js         Rota única da Visão Macro (2026-08) — GET /api/macro mescla atividades de TODAS as empresas da org, filtra por período (semana atual/próxima/30 dias), gate por allCompaniesAccess.
server/meetingInbox.js    Caixa de transcrições (2026-09) — router próprio em /api/meeting-inbox: POST cria submissão + dispara extração via Claude API (fire-and-forget), GET lista, POST /:id/retry reprocessa — ver PROJECT_CONTEXT.md §24.1. 2026-09-14 (auditoria de Prompt Cache): system de extractMeetingFromTranscript vira array com cache_control ttl:'1h' (antes era string solta, sem como cachear); função devolve {output, usage}; processSubmission loga evento anthropic_api_call — ver §42. 2026-09-16: GET /api/meeting-inbox recupera sozinha submissão presa em 'processing' há mais de 5min (órfã de reinício do servidor) virando 'failed' — reaproveita o retry já existente — ver §44. 2026-09-18: friendlyAiError (erro da Anthropic em português, na gravação e na leitura), POST /retry-failed (reprocessa falhas em sequência), processed_at = início da tentativa — ver PROJECT_CONTEXT.md §49.
server/cnpjLookup.js     Cliente BrasilAPI/ReceitaWS + normalização + cache.
server/memoryIngest.js    Assistente Inteligente de Projetos — chunking/indexação de reuniões em `project_memory_chunks` (reindexMeetingMemory/reindexProjectMemory/syncProjectMemoryFromDiff), disparado no PATCH /projects/:id; reindexMeetingMemory também embeda os chunks em lote (Fase 3, 2026-09-10, opcional via VOYAGE_API_KEY) antes do insert — ver PROJECT_CONTEXT.md §27/§31.
server/memoryRetrieval.js  Assistente Inteligente de Projetos — busca HÍBRIDA sobre `project_memory_chunks`: lexical (full-text search + unaccent, com fallback OR — §30) + semântica (embeddings via server/embeddings.js, Fase 3, 2026-09-10 — §31), combinadas por id de chunk; filtro por participante/reunião/data/tipo comum às duas; getMeetingTranscriptChunks() busca a transcrição inteira de uma reunião sem ranking, pra explicar contexto de atividade — ver PROJECT_CONTEXT.md §27/§30/§31.
server/embeddings.js  Embeddings via Voyage AI (`voyage-3`, REST puro via fetch, sem SDK) pra busca semântica da RENATA — voyageConfigured()/embedTexts(texts, inputType)/cosineSimilarity() (Fase 3, 2026-09-10) — ver PROJECT_CONTEXT.md §31.
server/scripts/reindexAllMeetings.js  Backfill manual da memória do projeto pra reuniões já existentes (2026-09) — ver PROJECT_CONTEXT.md §27.
shared/transcriptParser.js  Funções puras de parsing de transcrição (parseTranscript/sliceEntriesByTopics/splitDecisionLines, 2026-09) — sem dependência de React/Express, usadas tanto por src/meetings/meetingUtils.js quanto por server/memoryIngest.js.
server/assistantRetrieval.js  Assistente Inteligente de Projetos — pipeline de 2 chamadas à IA (resolveQuery/synthesizeAnswer/askProjectAssistant), citações validadas contra os chunks recuperados; ProposedActionSchema com 8 tipos de ação (6 da Fase 4 + save_knowledge_fact da Fase 7 + flag_knowledge_conflict de 2026-09-12, campos knowledgeType/validFrom/scope de 3 valores desde a Fase 7.1, entityMentions desde a Fase 8, conflictingContent desde 2026-09-12) e contexto de Agenda (getConnectionStatus/listEvents); SynthesizeAnswerSchema resposta ESTRUTURADA (introduction/sections/insights, Fase 5) + citedFactIds (Fase 8, mesmo padrão de citedChunkIds) + flattenStructuredAnswer(); resolveQuery em claude-sonnet-5 + cache_control nos dois system prompts (Fase 6); askProjectAssistant integra cache semântico de Q&A (lookupCachedAnswer/saveCachedAnswer, com dependency_meeting_ids/dependency_fact_ids desde a Fase 7.1, citedFactIds desde a Fase 8) e CONHECIMENTO ACUMULADO (loadRelevantFacts, substitui o antigo ai_project_insights/learnedFact — Fase 7); grava cited_fact_ids/from_cache em ai_messages (Fase 8); logMetric nos pontos de question_asked/cache_hit/cache_miss/cache_rejected_stale/fact_proposed/conflict_flagged_from_answer (Fase 7.1 + 2026-09-12); decideProposedAction aceita `overrides` (Fase 7.1, o usuário escolhe o escopo final antes de confirmar) pra save_knowledge_fact E flag_knowledge_conflict. 2026-09-13: askProjectAssistant ganha parâmetro opcional `trace` (Eval Harness, server/evals/) — aditivo, populado com resolveQuery/chunks/fatos/synthesizeAnswer/latências quando passado, nunca influencia o pipeline, nunca usado por server/assistant.js. 2026-09-14 (auditoria de Prompt Cache): cache_control dos 2 system prompts ganha `ttl:'1h'`; a frase condicional de googleConnected saiu do bloco cacheado de synthesizeAnswer e virou linha dinâmica em `messages`; novo logAnthropicUsage() loga evento `anthropic_api_call` (feature/model/cacheReadTokens/cacheCreationTokens) por chamada; ai_messages ganha prompt_cache_read_tokens/prompt_cache_creation_tokens — ver PROJECT_CONTEXT.md §27/§32/§34/§35/§37/§38/§39/§40/§41/§42.
server/knowledgeFacts.js  Memória de conhecimento em camadas da RENATA (Fase 7, 2026-09-11) — findSimilarFact (antigo findConflictingFact)/saveKnowledgeFact (detecção de conflito por embedding do CONTEÚDO do fato, não do assunto — ver §37 por quê)/loadRelevantFacts (retorna {text, factIds} desde a Fase 7.1). Fase 7.1: classifyRelation — 4 categorias (duplicate/update/conflict/complement, ver §38) substitui a lógica binária duplicata/conflito da Fase 7; saveKnowledgeFact preenche superseded_by/valid_until de verdade numa atualização temporal; loadRelevantFacts ganha filtro por conversa (scope='conversation'). Fase 8: saveKnowledgeFact grava conflicts_with nos dois lados de um conflito, source_meeting_id, chama linkFactEntities (server/knowledgeEntities.js) e corrige project_id pra scope='conversation'; findSimilarFact/loadRelevantFacts filtram valid_until vencido; DUPLICATE_SIMILARITY_THRESHOLD/CONFLICT_SIMILARITY_THRESHOLD exportados. 2026-09-12: saveConflictPair (novo) — registra um conflito que a própria RENATA detectou entre duas fontes já existentes (não o usuário ensinando um fato), grava as duas linhas já `disputed`+`conflicts_with` cruzado direto, sem passar por classifyRelation. 2026-09-13: classifyRelation exportado (mesmo corpo, zero mudança de comportamento) pra teste unitário determinístico no Eval Harness (server/evals/runUnitEval.mjs) — ver PROJECT_CONTEXT.md §37/§38/§39/§40/§41.
server/knowledgeEntities.js  Grafo de entidades da RENATA, versão relacional (Fase 8, 2026-09-11) — findOrCreateEntity (dedup por nome normalizado via normalizeName, resolve linked_user_id/linked_project_id best-effort)/linkFactEntities/unlinkFactEntity/listEntities/getEntityDetail, sempre filtrando por escopo/permissão antes de listar — ver PROJECT_CONTEXT.md §39.
server/knowledgeCenter.js  Regra de negócio da Central de Conhecimento (Fase 8, 2026-09-11) — getOverview (KPIs/recentes/atenção/mais usados), searchKnowledgeFacts (busca híbrida, mesmo padrão de searchProjectMemory), getFactDetail (+walkSupersedeChain, histórico completo), editFactVersioned (edição SEM destruir histórico — sempre nova linha), listConflicts/resolveConflict (6 desfechos, nunca DELETE), getMetrics, checkFactMutationPermission (3 níveis, reusa role/canAccessProject) — ver PROJECT_CONTEXT.md §39. 2026-09-14: getMetrics ganha `promptCache` (cache NATIVO da Anthropic — cache_read/creation/uncached por feature+modelo, distinto do `cache` semântico caseiro acima) — ver §42.
server/knowledge.js  Rotas /api/knowledge/* (overview, facts, facts/:id/edit, facts/:id/entities, conflicts, conflicts/resolve, entities, metrics) — Fase 8, 2026-09-11. TODA a área atrás de requireMasterOrPricetax (visibilidade PRICETAX-only, 'cliente' nunca acessa) — ver PROJECT_CONTEXT.md §39.
server/answerCache.js  Cache semântico de perguntas/respostas da RENATA, modo seguro (Fase 7, 2026-09-11) — computeFingerprint/lookupCachedAnswer/saveCachedAnswer, chave é a pergunta já resolvida por resolveQuery (participant/meetingId/kind), não o texto cru. Fase 7.1: isStillFresh — invalidação por DEPENDÊNCIA real (reunião reindexada, fato editado/arquivado, fato novo no escopo), não só o data_fingerprint grosseiro da Fase 7; lookupCachedAnswer sinaliza {staleCandidate:true} quando rejeita por isso; saveCachedAnswer grava dependency_meeting_ids/dependency_fact_ids/tokens_input/tokens_output. Fase 8: cited_fact_ids (subconjunto ESTREITO citado, distinto do dependency_fact_ids largo) também gravado/devolvido — ver PROJECT_CONTEXT.md §37/§38/§39.
server/metrics.js  logMetric(pool, {orgId, projectId, eventType, metadata}) — eventos mensuráveis da RENATA em ai_metrics_events, fire-and-forget (nunca `await`, só `.catch()`), sem dashboard nesta fase (Fase 7.1, 2026-09-11; virou dashboard de verdade na Fase 8 via server/knowledgeCenter.js getMetrics) — ver PROJECT_CONTEXT.md §38/§39.
server/assistantContext.js  buildProjectSnapshot(project) — perfil compacto de identidade+cronograma (Resumo/Gantt/Tabela/Fases/Quadro) injetado no contexto do assistente; normalizeName() exportado (Fase 4) pra resolver nome de fase por aproximação, reusado por server/knowledgeEntities.js (Fase 8) — ver PROJECT_CONTEXT.md §27/§32/§39.
server/assistantActions.js  Agente executor — executeProposedAction(), 8 tipos suportados (create/delete_meeting_todo, reschedule/create/delete_schedule_activity, create_calendar_event — Fase 4; save_knowledge_fact — Fase 7; flag_knowledge_conflict — 2026-09-12), só chamado depois de confirmação explícita do usuário. executeSaveKnowledgeFact passa knowledgeType/validFrom adiante e aceita scope='conversation' desde a Fase 7.1, loga fact_confirmed (com factId desde a Fase 8, ver §39); Fase 8: também repassa sourceMeetingId/entityMentions. executeFlagKnowledgeConflict (novo, 2026-09-12) chama saveConflictPair pra registrar um conflito que a RENATA percebeu sozinha ao responder — ver PROJECT_CONTEXT.md §27/§32/§37/§38/§39/§40.
server/assistant.js       Rotas /api/assistant/* (conversation, ask, conversation/clear, messages/:id/feedback, messages/:id/action, reindex, reindex-needed — Fase 6), 2026-09. POST /messages/:id/action aceita `overrides` opcional no corpo desde a Fase 7.1 — ver PROJECT_CONTEXT.md §27/§35/§38. 2026-10-02: GET/POST /dossier (compilado de todas as reuniões, só master/pricetax, 403 pro cliente; POST responde 202 e roda em segundo plano) — ver §63.
src/lib/dates.js  `calendarDaysSince(iso, now)` — dias de CALENDÁRIO no fuso local (2026-10-05, §75), usado pelo selo "Nd" do cartão do quadro pessoal e pela idade dos bugs do XFlow. Nunca usar `floor(diff/86400000)` pra "há N dias".
src/lib/routes.js  Endereço por módulo (2026-10-05, §74): MODE_PATHS (/gestao-atividades, /empresas, /agenda…), `modeForPath` (aceita variantes), `pathForTag`, `canOpenMode` (regras de acesso). Usado por App.jsx (pushLocation, popstate, abertura direta por favorito). Módulo puro.
src/widget/         Widget do iPhone (§76): WidgetSection.jsx (seção em Meu perfil) + scriptableScript.js (gera o script do Scriptable com token).
src/daily/          Meu dia (§77): DailyCards (tela inicial), DailyPrefs (escolha de conteúdos, usada nas boas-vindas e em Meu perfil), WelcomeSetup + useWelcomeSetup (3 passos, raiz React própria).
src/modelos/         Modelos de documentos (§78): Modelos.jsx (grade, gaveta com prévia, adicionar arquivo/link) + modelosMeta.js (tipos, CSS mdl-*; reaproveita par-* dos Pareceres). Rota /modelos em src/lib/routes.js.
src/connect/        Conectar (§80): ConnectSection.jsx (aba Conectar em Meu perfil: gerar/revogar token) + guide.js (guia que o usuário cola no outro Claude Code, sem token).
src/crm/            CRM (§54–§58): CrmScreen (shell/abas), *Page.jsx (Empresas, Contatos, Negócios, Produtos, Agenda, Visão Geral), *Drawer/*Form/*Dialog/*Wizard (ficha, formulários, fechar negócio, importadores PipeRun), FunnelsAdmin, GlobalSearch, crmApi.js/crmMeta.js/importMapping.js/ui.jsx. `React.lazy` a partir de App.jsx.
src/ui/index.jsx + src/ui/ui.css  Peças visuais comuns (2026-10-04, §72): Card, Button, Chip, Segmented, Tabs, Select, Kpi, Section, EmptyState, Skeleton*, Callout, BusyBar, **ConfirmDialog** (Onda 0, §81: confirmação com `requireText`), activate/activateRow (clicável por teclado). Tokens `--ui-*` adaptativos ao tema. Migrados: Conhecimento, Visão Geral Empresas, Agenda. Auditoria medida em docs/AUDITORIA_VISUAL.md.
server/parecerScope.js  Isolamento de pareceres por cliente (2026-10-04, §70) — `parecerUsableFor` (Geral vale em qualquer empresa; específico só na empresa dele, por vínculo ou nome, regra fechada), `companyTokens`, `loadProjectIdentity`. Usado por parecerStudy.js (janela, sugestão) e knowledgeFacts.js (chat).
server/parecerStudy.js  RENATA estuda os Pareceres (2026-10-04, §70) — `startStudy` (só SQL decide se há parecer novo; sem novo = zero IA), `studyOne` (PDF como bloco document, Sonnet, zod achatado), `registerFact` (1 fato org/internal_document por parecer, INSERT direto sem detecção de conflito), `getStudyState` (no chat, `pickRelevantPareceres` em knowledgeFacts.js só carrega até 3 pareceres relevantes à pergunta), `generateMeetingAdvice`/`getMeetingAdvice` (sugestão na reunião, assinatura dos estudos → `stale`). Rotas em server/pareceres.js (`/study`, `/advice`); gancho em meetingInbox.js após registrar a reunião. Tabelas `parecer_studies` e `meeting_parecer_advice`.
src/assistant/ParecerStudyModal.jsx  Modal "Estudar Pareceres" aberto pelo botão no cabeçalho da RENATA (§70). src/meetings/ParecerAdviceBox.jsx  Caixa "RENATA · Pareceres PRICETAX" na coluna lateral de MeetingDetailModal (só staff).
server/accessLog.js  Auditoria de acessos (2026-10-04, §67) — `recordAccess` (login/login_failed/visit, fire-and-forget), `noteVisit` (volta à sessão após 30 min, chamado em GET /auth/me), `noteFirstUse` (1º clique/tecla do dia, `POST /api/activity/ping`; 1 evento/dia de Brasília), `clientIp` (x-real-ip → x-forwarded-for), geolocalização via ipwho.is com cache em `ip_geo_cache`, `deviceLabel`, `accessSummary`/`recentAccess` (GET /users traz `access`; GET /users/:id/access). Tabelas `user_access_events` e `ip_geo_cache`.
server/personalActivity.js  Indicadores da Gestão de Atividades (2026-10-04, §65) — `cardEventsOf` (deriva opened/closed de `createdAt`/`completedAt` + `card.history` + `board.log` público, deduplica por proximidade ±3s; conta cards sem data), `syncCardEvents` (idempotente, ON CONFLICT DO NOTHING, nunca derruba o save), `getActivityStats` (agrega por dia da semana/dia do mês em America/Sao_Paulo, + divisores da média), `getDayDetail` (eventos de um dia + janela de 30 dias, título do card atual). Tabela `personal_card_events` (append-only na prática, sem CHECK). Rotas `GET /api/personal-board/stats` e `/stats/day` em routes.js; sync em PATCH /personal-board e /public-board/:token.
src/personal/PersonalStats.jsx  Painel "Meus indicadores" (2026-10-04, §65) — botão Indicadores no topo de PersonalBoardScreen; frase-resumo, KPIs, velocímetro, barras por dia da semana e do mês, filtro 30/90/tudo; card Dia a dia (navegação por data, faixa de 30 dias, lista do dia), médias por dia e alternador Total/Média nos gráficos; cada usuário vê só o próprio.
src/personal/boardAttention.js  Módulo puro (2026-10-05, §73): `boardAttention(board, hoje)` → atrasadas, vencem hoje e a mais antiga do quadro pessoal; `attentionParts`/`oldestText` montam a frase da RENATA na tela inicial.
server/dossier.js      Dossiê do cliente (2026-10-02, §63) — compila TODAS as reuniões de uma empresa em um documento (resumo executivo, linha do tempo, frentes, decisões e o que mudou, pessoas, riscos, lacunas). Map/reduce: ficha por reunião montada SEM IA (resumo/decisões/atividades já existentes; Sonnet só resume transcrição de reunião sem resumo, em cache `project_meeting_digests`) → Opus consolida em JSON estruturado (zod achatado, sem discriminatedUnion); em blocos + união quando passa de ~180k caracteres. Pendências e estatísticas são montadas por CÓDIGO. Job em segundo plano (`startDossier`/`runDossierJob`, cliente de IA injetável pra teste), travado >45min vira erro (`failStaleJobs`), `computeStaleness` avisa "N reuniões novas/alteradas desde este dossiê".
src/meetings/DossierPanel.jsx  Tela do Dossiê do cliente (2026-10-02, §63) — modal que mostra o documento, acompanha a geração por polling (3s), avisa desatualização, cita a reunião de origem de cada item (clicável) e exporta (Copiar/Baixar Markdown, PDF/Imprimir). `src/meetings/dossierExport.js` = geradores PUROS de Markdown e HTML (testáveis em Node).
src/knowledge/  Central de Conhecimento — "o cérebro da RENATA" (Fase 8, 2026-09-11), módulo autocontido (mesmo padrão de src/xflow/), novo workspaceMode='knowledge' em src/App.jsx, visível só pra master/pricetax. KnowledgeCenter.jsx (shell + 6 abas + OverviewTab), MemoriesTab.jsx (busca híbrida + filtros, "Fontes" vira filtro de origem aqui), FactDrawer.jsx (drawer via SidePanel — histórico/relações/utilização/edição versionada), ConflictsTab.jsx (6 resoluções com confirmação), EntitiesTab.jsx (lista+detalhe, reusado pra Pessoas e Empresas via prop `types`), MetricsTab.jsx, knowledgeMeta.js (rótulos/CSS compartilhados) — ver PROJECT_CONTEXT.md §39.
server/pareceres.js  Rotas /api/pareceres/* (list, upload, patch, delete, GET /:id/file, comments) — 2026-09-17. Atrás de requireMasterOrPricetax (mesma regra do knowledge.js, 'cliente' nunca acessa) + effectiveOrgId. Upload sem multer — fileDataBase64 no corpo JSON, decodificado com Buffer.from, validado (mime/tamanho ≤10MB) antes de gravar. 2026-09-28: `parseScope()` valida scope/companyName (tag Geral×Cliente); POST/PATCH aceitam scope/companyName/companyProjectId — ver PROJECT_CONTEXT.md §48.
src/pareceres/  Pareceres PRICETAX — repositório de PDFs pra sócios/colaboradores (2026-09-17), módulo autocontido (mesmo padrão de src/knowledge/), novo workspaceMode='pareceres' em src/App.jsx, visível só pra master/pricetax. Pareceres.jsx (grid de cards, UploadParecerModal com dropzone, ParecerDrawer via SidePanel com título/descrição editáveis via useDebouncedField — nasceu já sem o bug de digitação dos §45-47 — e comentários), pareceresMeta.js (fmtFileSize, CSS `.par-*`) — ver PROJECT_CONTEXT.md §48. 2026-09-28: `.par-inner` (max-width, corrige tela "esticada"), `ScopePicker`/`ScopeTag` (tag Geral×Cliente específico, autocomplete via `/api/projects/lite`), filtro por cliente na busca, botão "Voltar" com texto no topbar (antes só ícone).
src/assistant/ProjectAssistant.jsx  Botão flutuante + painel lateral "RENATA" (2026-09) — visível nas abas Reuniões/Atividades, consciente de reunião aberta, card de confirmação de ação proposta (6 tipos), botão "Abrir a Agenda" (Fase 4). Redesign visual + resposta estruturada (Fase 5, 2026-09-10): cabeçalho com tooltips, cards por seção tipada (SECTION_META: warning/facts/impact/recommendation/timeline), renderInlineBold() interpreta **negrito**, insights clicáveis, fallback pra balão de texto simples quando não há `structured`. Fase 7.1: card de save_knowledge_fact ganha seletor de escopo editável (3 pills — SCOPE_OPTIONS, conversation/project/org, pré-selecionado na sugestão da IA) + chip de knowledgeType; decideAction manda a escolha em `overrides.scope`. 2026-09-12: KNOWLEDGE_ACTION_TYPES (save_knowledge_fact + flag_knowledge_conflict) compartilham o seletor de escopo/chip; actionCardMeta ganha caso pra flag_knowledge_conflict (mostra as duas versões em disputa) — ver PROJECT_CONTEXT.md §27/§32/§34/§38/§40.
server/evals/  RENATA Eval Harness — Fase 1 do plano P0/P1 (2026-09-13), mede o comportamento ATUAL da RENATA sem alterá-lo. fixtures.js (projeto sintético "Fixture Corp", seedado via reindexProjectMemory/saveKnowledgeFact reais), evidenceKeys.js (ids aleatórios de chunk/fato → chaves estáveis), evalCases.js (23 casos, 12 categorias), evalMetrics.js (recall@K/precision@K/MRR/citation/no-evidence/conflict, funções puras), evalRunner.js (chama askProjectAssistant de verdade), evalReport.js (relatório + failure trace por caso), runUnitEval.mjs (`npm run eval:unit`, zero rede), runFullEval.mjs (`npm run eval:full -- --baseline`, exige ANTHROPIC_API_KEY, nunca automático) — ver PROJECT_CONTEXT.md §41 e docs/RENATA_EVAL_BASELINE.md.

index.html            Shell HTML, variáveis CSS de tema (light/dark) em :root.
vite.config.js         Proxy /api -> localhost:3001 em dev.
```

Não há `server/routes/`, `server/models/`, `src/components/` — tudo é flat.

## 3. Índice de componentes (`src/App.jsx`)

Helpers/constantes de topo: linhas 1–565 (formatação de data, `STATUS_META`, `PRIORITY_META`, `CARD_*_META`, hooks e componentes pequenos; o objeto de estilos `S` fica perto de L?).

`App()` — componente raiz, **linha 566 a ~3336** (~2771 linhas). Contém todo o estado global
e todas as funções de mutação (ver §5 e §8 para os fluxos), os efeitos de bootstrap (sessão, projetos, quadro, URL por módulo, boas-vindas) e o
`return` com o roteamento por estado (login → tela inicial → módulo). **`src/App.jsx` tem 9922 linhas**; módulos novos moram em `src/*/` (ver §2).

Componentes de tela/modal (nome → linha → responsabilidade). **Regenerado do código em 2026-10-05** (linhas exatas naquele dia; descrições antigas foram mantidas, as novas vêm do comentário acima da declaração — `—` = ainda sem descrição):

| Linha | Componente | Responsabilidade |
|---|---|---|
| 52 | `BrandLogo` | Logo PRICETAX, troca PNG conforme tema |
| 56 | `ThemeToggleBtn` | Botão sol/lua |
| 139 | `cardStatusOf` | Status efetivo de um cartão do quadro pessoal (`status` ou derivado de `completed`) |
| 158 | `initials` | Iniciais de um nome (avatar) |
| 165 | `dueDateTone` | Tom (cor) do prazo de um cartão: atrasado/hoje/futuro |
| 175 | `daysSinceCardMovement` | Dias de calendário desde a última movimentação do cartão (`calendarDaysSince`, §75) |
| 179 | `staleTone` | Tom do selo "Nd sem movimentação" (≥3 aviso, ≥7 crítico) |
| 184 | `fmtDateOnly` | Formata data AAAA-MM-DD sem fuso |
| 191 | `uid` | Gera id curto com prefixo |
| 192 | `genShareToken` | Gera token de link público |
| 194 | `todayISOStr` | Hoje em AAAA-MM-DD (fuso local) |
| 201 | `useMediaQuery` | Hook de media query |
| 214 | `useIsMobile` | Hook: viewport < 768px |
| 215 | `useIsCompact` | Hook: viewport < 1024px |
| 222 | `useDirtyForm` | Guarda de "alterações não salvas" — padrão único reusado em todo modal de formulário-rascunho (useDirtyForm) e em todo modal autosave-por-campo (useAutosaveTimestamp), pra nunca fechar e perder informação em silêncio. currentValue |
| 251 | `useDebouncedField` | Campo de texto com autosave DEBOUNCED, não por tecla (2026-09-17, bug real relatado pelo Rafael: "escrevo 3-4 letras e o texto é apagado por um fantasma"). Causa raiz: nos modais de autosave-por-campo, CADA tecla disparava a funçã |
| 292 | `useAutosaveTimestamp` | record = a prop vinda do pai (activity/ticket/card) que já muda sozinha toda vez que um autosave de campo grava — não precisa instrumentar cada handler individual, só observa o resultado. |
| 305 | `ConfirmDiscardModal` | Modal "Salvar e sair / Sair sem salvar / Continuar editando" (§16, guarda de alterações não salvas) |
| 325 | `savedStatusLabel` | Texto "Alterações não salvas / Salvo automaticamente às HH:MM" |
| 331 | `normalizeTeam` | Normaliza `project.team` (vínculo com usuários) |
| 339 | `normalizeProject` | Preenche defaults de um projeto carregado |
| 344 | `isExpiredNotYetFlagged` | Usuário com acesso expirado ainda não sinalizado |
| 348 | `fmtDate` | Data em pt-BR |
| 354 | `fmtTs` | Data e hora em pt-BR (exportado, usado pelos módulos) |
| 359 | `projectProgress` | % de conclusão de um projeto |
| 365 | `projectNextActivity` | Próxima atividade de um projeto |
| 376 | `groupRootId` | Grupo Empresarial: o Master é sua própria raiz de grupo (isGroupMaster=true, sem precisar de groupId apontando pra si mesmo); filhas têm company.groupId = id do Master. |
| 380 | `groupMembers` | Membros de um grupo empresarial (§12) |
| 387 | `involvedCompaniesLabel` | Selo "Empresas envolvidas" (v2) — só pra atividades do Master com o campo novo definido (involvedCompanyIds !== undefined); distinto do selo legado "Grupo inteiro"/"Várias empresas" (groupActivityId, mecanismo de cópia v1). |
| 395 | `parseDate` | AAAA-MM-DD → Date |
| 396 | `toISODate` | Date → AAAA-MM-DD |
| 397 | `startOfDay` | Início do dia |
| 398 | `addDays` | Soma dias |
| 399 | `addMonths` | Soma meses |
| 400 | `calcDeadline` | Prazo a partir de início + duração |
| 409 | `dayAfter` | Dia seguinte |
| 416 | `dayBefore` | Dia anterior |
| 423 | `startOfMonth` | Início do mês |
| 424 | `endOfMonth` | Fim do mês |
| 425 | `startOfWeek` | Início da semana |
| 426 | `fmtDayLabel` | Rótulo de dia (Gantt/Tabela) |
| 427 | `fmtDayFull` | Dia por extenso |
| 428 | `fmtMonthYearLabel` | Mês/ano |
| 429 | `fmtYearLabel` | Ano |
| 430 | `fmtWeekLabel` | Semana |
| 431 | `fmtMonthTitle` | Título de mês |
| 433 | `buildTimelineColumns` | Colunas da linha do tempo (dia/semana/mês) do Gantt |
| 473 | `colIndexFor` | Índice da coluna de uma data |
| 484 | `fractionInColumn` | Fração de uma data dentro da coluna |
| 492 | `sortActivities` | Ordena atividades (data/fase/prioridade) |
| 501 | `buildOrderMap` | Mapa de ordem manual de atividades |
| 512 | `AreaRow` | Extraído do .map() de "Áreas e responsáveis" (tela de configurações da empresa) pra poder usar useDebouncedField por linha sem violar Rules of Hooks — mesmo bug de digitação do PROJECT_CONTEXT.md §45/§46. onCommit recebe o valor r |
| 537 | `PhaseRow` | Extraído do .map() de "Fases" (SidePanel de fases do projeto) pelo mesmo motivo do AreaRow acima. O log de "Fase renomeada"/"Descrição alterada" usa o draft local (nameField.draft) em vez de p.name/p.sub das props — essas só atual |
| 3441 | `LoadingScreen` | Tela de carregamento inicial |
| 3454 | `LoginGate` | Formulário de login + modo "Trocar senha" (2026-08, `POST /api/auth/change-password-login`) |
| 3541 | `UserPasswordReset` | Modal de reset de senha de um usuário (master) |
| 3557 | `SuperAdminScreen` | Tela "Organizações (Super Admin)": lista, cria e entra numa organização |
| 3652 | `fmtAccessPlace` | Texto do local de um acesso (cidade/UF/país) — §67 |
| 3662 | `UserAccessHistory` | Gaveta com o histórico de acessos de um usuário — §67 |
| 3696 | `UsersManagementScreen` | Painel admin de usuários (master) |
| 3971 | `NewUserModal` | Criar/editar usuário — `NewUserModal` tem seletor "Organização (base)" visível só pra `isSuperAdmin` (2026-08, Fase 3) |
| 4079 | `EditUserModal` | Criar/editar usuário — `NewUserModal` tem seletor "Organização (base)" visível só pra `isSuperAdmin` (2026-08, Fase 3) |
| 4222 | `MyProfileModal` | Avatar do usuário logado + seção "Trocar senha" (2026-08, `POST /api/auth/change-password`) |
| 4394 | `CreateCompanyModal` | Cadastro de empresa (CNPJ lookup, clientType, clone) — mesmo seletor de organização visível só pra `isSuperAdmin` (2026-08, Fase 3) |
| 4730 | `UserAvatar` | Avatar (emoji) do usuário |
| 4748 | `AvatarPicker` | Seletor de avatar (`AVATAR_EMOJIS`) |
| 4766 | `CompanyBadge` | Selo de empresa |
| 4775 | `TeamLinkBadge` | Selo "vinculado a usuário" da equipe |
| 4783 | `CompanySectionHeader` | Cabeçalho de seção de empresa na visão multi-empresa |
| 4798 | `EditCompanyModal` | Edição de empresa já criada |
| 4968 | `GroupActivityCompaniesModal` | Escolha das empresas envolvidas numa atividade de grupo (§12) |
| 5022 | `CompanySelectorScreen` | Tela "Quais empresas você quer acompanhar" — busca, seleção múltipla, filtros por Tipo/Status/Regime (2026-08), atalho p/ Gestão de Atividades |
| 5343 | `WorkspaceGateScreen` | Pós-login: escolher Empresas vs Gestão de Atividades vs XFlow vs Agenda — é a própria "Home" |
| 5452 | `sortCards` | Ordena cartões do quadro pessoal (5 modos + manual) |
| 5468 | `cardMatchesFilters` | Filtros de busca/prioridade/prazo/tags/status do quadro pessoal |
| 5491 | `useToasts` | Hook de avisos temporários (toasts) |
| 5506 | `ToastStack` | Pilha de toasts |
| 5521 | `FadingSavedBadge` | Selo "salvo" que some sozinho |
| 5532 | `PersonalBoardSkeleton` | Esqueleto de carregamento do quadro pessoal |
| 5553 | `ColorSwatchGrid` | Grade de cores de coluna |
| 5564 | `PriorityPicker` | Seletor de prioridade do cartão |
| 5581 | `StatusPicker` | Seletor de status do cartão |
| 5597 | `TagEditor` | Editor de tags do cartão |
| 5629 | `PersonalColumnMenu` | Menu da coluna do quadro pessoal |
| 5667 | `PersonalCardMenu` | Menu do cartão (mover, concluir, excluir…) |
| 5714 | `PersonalCard` | Cartão do quadro pessoal |
| 5793 | `PersonalColumn` | Coluna do quadro pessoal (drag and drop) |
| 5920 | `PersonalCardDetailModal` | Modal de detalhe do cartão (campos, checklist, comentários, "Mover para…", §61–§62) |
| 6185 | `PersonalListView` | Visão em lista do quadro pessoal |
| 6258 | `ReassignCardsModal` | Reatribui cartões ao excluir uma coluna |
| 6287 | `PersonalTrashPanel` | Lixeira do quadro pessoal |
| 6306 | `PersonalArchivePanel` | Painel de concluídas arquivadas |
| 6324 | `BoardShareModal` | Modal de visibilidade da página (Privado/Público por link, copiar/gerar link) |
| 6378 | `BoardActivityLogModal` | Painel de histórico do quadro — agrega `board.log` + `card.history` de todas as colunas |
| 6401 | `PersonalBoardScreen` | Tela raiz do quadro pessoal (tabs de páginas, dnd-kit, filtros, `publicMode`/`readOnly` props) |
| 7464 | `PublicBoardScreen` | Embed de UMA página via `/quadro/:token` — busca sessão opcional + `GET /api/public-board/:token`, decide `readOnly` por `canEdit` |
| 7608 | `NoAccessScreen` | Tela para quem não tem acesso a nenhum módulo |
| 7632 | `SidePanel` | Painel lateral genérico (Log, Lixeira, Menções) |
| 7655 | `NotificationBell` | Central de Notificações (2026-08) — componente compartilhado, usado nas 3 telas (Empresas em App(), Gestão de Atividades em PersonalBoardScreen, XFlow em XflowScreen) via o mesmo estado/lista levantados em App(), pra contador e li |
| 7700 | `StatusPill` | Selo de status de atividade |
| 7712 | `renderCommentText` | Renderiza comentário com menções/links |
| 7724 | `SubactivityRow` | Extraído do .map() de subatividades dentro de ActivityDetailModal pra poder usar useDebouncedField por linha sem violar Rules of Hooks — mesmo bug de digitação do PROJECT_CONTEXT.md §45/§46 (não coberto pelo fix do §45, que só tra |
| 7752 | `ActivityDetailModal` | Modal fullscreen de uma atividade (empresa) — descrição, subatividades, comentários (com anexo de imagem/PDF e link por comentário, 2026-08), histórico, campo opcional `meetingTime` (2026-08, "Horário da reunião") e checkbox `clientDateConfirmed` (2026-08, "Data confirmada com o cliente?") |
| 8281 | `PrintActivityTable` | Tabela de atividades do relatório em PDF (usada em "Em atraso" e "Próximas etapas") |
| 8327 | `PrintReport` | Relatório em PDF dedicado (2026-08) — KPIs/progresso/próximas etapas, `display:none` na tela, só aparece em `@media print` — ver `PROJECT_CONTEXT.md` §13 |
| 8459 | `resumoMonthLabel` | Rótulo de mês do resumo |
| 8465 | `resumoCountdown` | Contagem regressiva do resumo |
| 8478 | `resumoDateLabel` | Rótulo de data do resumo |
| 8542 | `ResumoTable` | Tabela desktop da aba Resumo (2026-08) |
| 8595 | `ResumoCard` | Card mobile da aba Resumo (2026-08) — mesmos dados de `ResumoTable`, layout empilhado |
| 8632 | `ResumoView` | Aba "Resumo" do workspace de Empresas (2026-08) — KPIs, progresso, filtros/ordenação/agrupamento por mês, só `!isMulti` — ver `PROJECT_CONTEXT.md` §13 |
| 8814 | `TableView` | View "Tabela" das atividades de empresa (drag reorder, quick-expand de subatividades) — edição inline inclui Horário da reunião e "Data confirmada com o cliente?" (2026-08, colunas próprias, desktop e mobile) |
| 9381 | `PhasesView` | View "Fases" |
| 9511 | `KanbanView` | View "Quadro" (empresa, diferente do Kanban pessoal) |
| 9598 | `TimelineView` | View "Gantt" |

Detalhes completos em **`docs/RESPONSIVE_ARCHITECTURE.md`** — não repita aqui.
Resumo: dois hooks (`useIsMobile()` <768px, `useIsCompact()` <1024px) definidos
perto de `todayISOStr` (topo do arquivo); toda variante mobile é uma chave
`S.algoMobile` nova espalhada condicionalmente (nunca sobrescreve a chave
desktop). Componentes com lógica mobile própria: topbar de `App()`
(menu "Mais"), `TableView`, `UsersManagementScreen`, `KanbanView`,
`CompanySelectorScreen`, `PersonalColumn`/`PersonalCard`, e os ~9 modais que
usam `S.detailBox`.

## 4. Funcionalidades por módulo

### Autenticação / sessão
- Tela: `LoginGate` (~L2321) — modo login normal + modo "Trocar senha"
  (usuário + senha atual + nova 2x, troca e já loga, sem `requireAuth`
  já que ainda não há sessão nesse ponto). Fluxo completo em §7.
- API: `POST /auth/login`, `POST /auth/change-password-login`,
  `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`
  (autenticado, dentro de "Meu perfil" — `MyProfileModal`).
- Modelo: tabela `users`.

### Empresas (Cronograma de Reforma Tributária)
- Telas: `CompanySelectorScreen` (L3474), `CreateCompanyModal` (L2848),
  `EditCompanyModal` (L3250), workspace principal dentro de `App()` (views
  Resumo/Tabela/Fases/Quadro/Gantt — "Resumo" e "Fases"/"Quadro" só em
  empresa única, não em "visão geral"/`isMulti`).
- Componentes principais: `ResumoView`/`ResumoTable`/`ResumoCard` (aba
  Resumo, 2026-08), `TableView`, `PhasesView`, `KanbanView`,
  `TimelineView`, `ActivityDetailModal`, `UsersManagementScreen`,
  `PrintReport`/`PrintActivityTable` (relatório em PDF, 2026-08).
- APIs: `GET/POST/PATCH/DELETE /projects`, `GET /projects/:id/team-candidates`,
  `POST /cnpj/lookup`.
- Services: `server/cnpjLookup.js`.
- Modelo: tabela `projects` (JSONB) — `company`, `phases`, `activities`,
  `team`, `log`. Atividade tem campo opcional `meetingTime` (2026-08).
- Dependências: `xlsx` (export Excel, planilha de trabalho), `window.print`
  (export PDF, sem lib — desde 2026-08 imprime um relatório executivo
  dedicado, `PrintReport`, não mais a view crua da tela).

### Gestão de Atividades (quadro pessoal, dnd-kit)
- Telas: `WorkspaceGateScreen` (L2779, entrada), `PersonalBoardScreen` (L3626),
  `PublicBoardScreen` (L4386, embed de uma página via link público).
- Componentes: `PersonalColumn`, `PersonalCard`, `PersonalCardDetailModal`,
  `PersonalListView`, `PersonalColumnMenu`, `PersonalCardMenu`,
  `ReassignCardsModal`, `PersonalTrashPanel`, `ToastStack`, `BoardShareModal`,
  `BoardActivityLogModal`.
- APIs: `GET/PATCH /personal-board` (dono, autenticado); `GET/PATCH
  /public-board/:token` (link público — GET com `optionalAuth`, PATCH com
  `requireAuth` mas sem checar dono).
- Modelo: tabela `personal_boards` (JSONB, 1 linha por usuário) —
  `boards[].columns[].cards[]`; cada board tem `visibility`
  (`private`|`public`), `shareToken`, `log[]` (eventos estruturais — o board
  público some no `BoardActivityLogModal` junto com `card.history`
  agregado).
- Dependência: `@dnd-kit/core` + `@dnd-kit/sortable` (só usado aqui).

### Usuários (admin)
- Tela: `UsersManagementScreen` (L1830) + modais `NewUserModal`/`EditUserModal`.
- APIs: `GET/POST/PATCH/DELETE /users`, `POST /users/:id/block|renew|reset-password`.
- Modelo: tabela `users`.
- Regra: só `master` acessa (`requireMaster`).

### XFlow (gestão de BUGs, 2026-08, v2 + Quadro)
- Arquivo próprio: `src/xflow/XFlow.jsx` (não em `App.jsx`) — `XFlowScreen`
  (entrada, `viewMode` Quadro/Lista, abre em Quadro por padrão; Lista =
  três Homes por papel: `ReporterHome`/`DevHome`/`GestorHome`),
  `NewTicketModal`, `TicketDetailModal`, `FilterBar`, `ArchivedView`.
  Quadro (Kanban, 2026-08): `XflowBoardView`/`XflowBoardColumn`/
  `XflowBoardCard` — 15 colunas fixas (uma por status real do fluxo +
  "Encerrada" agregando os 4 encerramentos antecipados), arrastar-e-soltar
  mapeado pra ações nomeadas via `resolveDrag()`/`XFLOW_BOARD_DRAG_RULES`/
  `XFLOW_BOARD_RESUME_RULES` (nunca seta status livre). Filtro/contagem
  por "Responsável atual" (2026-08): `ballHolderKey()`/
  `ballHolderLabelForKey()`, novo select em `FilterBar` (prop `teamById`,
  hoje em todo lugar que renderiza `FilterBar`), painel "Por responsável
  atual" em `GestorHome` (clicável, aplica o filtro). Detalhe completo em
  `PROJECT_CONTEXT.md` §18.1.
- Vínculo entre TASKs + citação automática + link permanente (2026-08):
  `linkedTicketIds` (dentro do `data` JSONB), ações `vincular_ticket`/
  `desvincular_ticket` (`link_tickets` em `xflowPermissions.js`), seção
  "TASKs vinculadas" + busca no `TicketDetailModal`. `renderCommentText()`
  e o novo `TicketRefExtension` (Tiptap, usa `@tiptap/pm`) linkificam
  "#N" em comentário/descrição. `openTicketDetail()` soma `#<número>` na
  URL; `App.jsx` (efeito `hashXflowNavDone`) e `XFlowScreen` (efeito
  `hashOpenDone`) abrem a TASK certa quando a página carrega já com esse
  hash. Detalhe completo em `PROJECT_CONTEXT.md` §18.2.
- Anexo/link em comentário (2026-08): `comment.attachments[]`/`links[]`
  (mesmo formato dos de atividade de empresa), ação `comentar` em
  `server/xflow.js` aceita os dois campos + permite comentário só de
  anexo/link sem texto. Preview de imagem reaproveita o lightbox
  `previewEvidence` já usado pelas Evidências da TASK. Detalhe completo
  em `PROJECT_CONTEXT.md` §18.
- Acesso: card "XFlow" no `WorkspaceGateScreen`, visível só se
  `currentUser.xflowRole` (reporter/dev/gestao) — controlado em
  `NewUserModal`/`EditUserModal`. Papel efetivo (inclui `admin`) calculado em
  `effectiveXflowRole()`, duplicado em `server/xflowPermissions.js` e
  `src/xflow/XFlow.jsx`.
- APIs: `server/xflow.js` — `GET /xflow/team`, `GET /xflow/tickets`
  (visibilidade org-wide pra todo papel, 2026-08), `GET /xflow/tickets/:id/events`,
  `POST /xflow/tickets`, `PATCH /xflow/tickets/:id` (recebe
  `{action, payload}`, validado por `server/xflowPermissions.js` +
  `server/xflowTransitions.js` — não aceita mais o ticket inteiro solto;
  resposta inclui `relatedTicket` quando a ação também mexe noutro
  ticket, ex. vincular/desvincular). Montadas em `/api/xflow`, atrás de
  `requireXflowAccess`.
- Modelo: tabelas `xflow_tickets` + `xflow_events` (log estruturado da
  timeline). Detalhe completo do fluxo de estados, matriz de permissões/
  transições, tempo por status, SLA e "quem está com a bola" em
  `PROJECT_CONTEXT.md` §18.

### Central de Notificações (2026-08)
- Sino 🔔 global — mesmo componente `NotificationBell` (`App.jsx`,
  exportado) renderizado nas 3 telas (Tabela de Empresas, header do
  `PersonalBoardScreen`, header do `XflowScreen`); estado
  (`notifications`, polling 45s) mora em `App()`, único componente que
  sobrevive à troca de `workspaceMode`.
- Geração: `server/xflow.js` (menção em comentário — `comentar` — e
  definição de responsável — `reatribuir`/`redirecionar`) e
  `notifyActivityChanges()` em `server/routes.js` (menção em comentário
  de atividade, responsável/vinculado por nome batendo com usuário real
  — ver limitação do modelo de dados em `PROJECT_CONTEXT.md` §20).
  Helper de escrita comum em `server/notifications.js`.
- Leitura: `GET/PATCH /notifications`, `POST /notifications/read-all`,
  `POST /notifications/mark-read-for-target` (usada quando o usuário
  acessa a ocorrência, não só ao marcar manualmente — regra explícita:
  abrir o painel sozinho nunca marca como lido).
- Log de leitura de TASK: `POST /xflow/tickets/:id/view` — grava evento
  `type:'view'` (dedup 5min) e marca notificações daquela TASK como
  lidas. Detalhe completo em `PROJECT_CONTEXT.md` §20.

### Sincronização com Google Calendar (2026-08)
- Previsão de conclusão de uma TASK do XFlow → evento no Google Calendar
  do responsável (unidirecional, por usuário — cada um conecta a própria
  conta). Backend: `server/googleCalendar.js` (helper OAuth2/API) +
  `server/google.js` (rotas, `/api/google`). Schema:
  `google_calendar_connections` (`server/db.js`) + `data.googleEventId`
  em `xflow_tickets`.
- UI: seção "Google Calendar" dentro de `MyProfileModal` (`App.jsx`).
- Requer `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`/
  `APP_BASE_URL` como variável de ambiente (nunca commitado — só `.env`
  local e env vars do Railway). Detalhe completo, limitações conhecidas e
  passo a passo do cadastro no Google Cloud em `PROJECT_CONTEXT.md` §21.

### Agenda (2026-08)
- 4ª workspace, universal (todo usuário logado tem, sem depender de
  acesso concedido — `hasAgenda = true` em `App.jsx`). Só leitura: mescla
  Google Calendar (se conectado), TASKs do XFlow do usuário e atividades
  de empresa onde o nome dele bate em `responsible`/`participants`.
- Backend: `server/agenda.js` (rota única, `GET /api/agenda`) +
  `listEvents()` em `server/googleCalendar.js`.
- UI: `src/agenda/Agenda.jsx` — visão Dia/Semana/Mês, toggle "Mostrar
  detalhes"/"Ocultar detalhes" (client-side, redige título pra "Ocupado"),
  cor por fonte (Google=azul, TASK=roxo, atividade=verde), poll de 60s.
- Detalhe completo em `PROJECT_CONTEXT.md` §22.

### Visão Macro / "Visão Geral Empresas" (2026-08)
- 5º workspace, gate por `companiesAccess && allCompaniesAccess` (não é
  universal — só quem já enxerga todas as empresas da org, senão
  vazaria dado de cliente que o usuário não deveria ver).
- Backend: `server/macro.js` (rota única, `GET /api/macro?range=paused|overdue|current_week|next_week|next_30|no_date`)
  — varre `activities[]` de todos os `projects` da org, resolve fase por
  `phases.find(ph => ph.id === a.phase)`. 6 abas com recorte mutuamente
  exclusivo, checado nessa ordem de prioridade: `paused` (status pausado
  vence tudo, mesmo atrasado ou sem data) → `overdue` → janela de data →
  `no_date`; `overdueCount`/`noDateCount`/`pausedCount` sempre vêm no
  payload pra alimentar os badges das abas mesmo fora delas. `time` no
  item = `a.meetingTime` (campo que já existia no `ActivityDetailModal`,
  "Horário da reunião"). Também devolve `companies`/`responsibles`
  (universo completo da org, não só da aba atual) pra alimentar os
  filtros do frontend.
- UI: `src/macro/MacroOverview.jsx` — "Hoje" sempre visível no topo,
  6 abas com ícone+contagem, **4 filtros client-side** (Empresa/
  Responsável/Status/Prioridade, mesmo padrão da Tabela — `PRIORITY_META`/
  `PRIORITY_ORDER` agora exportados de `App.jsx`), lista agrupada por dia
  (com um bucket "Sem data definida" à parte pra item sem data dentro de
  qualquer aba — a aba "Sem data" em si é só uma lista única, sem
  agrupamento nenhum). **Clique na linha
  abre o `ActivityDetailModal` de verdade** (`onOpenActivity` →
  `openActivityDetail`, mesma função da Tabela) — editar ali reflete em
  todo o app porque é o mesmo estado `projects`/PATCH; a própria tela
  Macro recarrega sozinha quando o modal fecha (prop `activityModalOpen`).
  `App.jsx` extraiu esse modal pra `renderActivityDetailModal()` pra não
  duplicar JSX entre o branch da Tabela e o da Macro.
- Detalhe completo em `PROJECT_CONTEXT.md` §23.

### Atalho "Início" (Home, 2026-08)
- Ícone de casa (`Home`, lucide-react) ao lado do toggle de tema e do
  botão Sair, presente em toda tela pós-login que tem esse par (Tabela,
  `CompanySelectorScreen`, `PersonalBoardScreen`, `XflowScreen`,
  `AgendaScreen`, `MacroOverviewScreen`) — leva de volta ao `WorkspaceGateScreen`. Não aparece
  no próprio `WorkspaceGateScreen` (já é a Home) nem quando
  `availableModes.length <= 1` (usuário só tem 1 workspace — a Home nem
  existe pra esse caso, `goToWorkspace(null)` voltaria pro mesmo lugar).
  Reaproveita a mesma navegação que já existia via `onExit` (antes só
  acessível pelos links de texto "Sair da Agenda"/"Sair do XFlow"/"Ir
  para Empresas" no canto esquerdo) — não é uma rota nova, só um atalho
  visual mais consistente.

### CRM PRICETAX — Fases 1 a 3 + importação PipeRun (2026-09, `PROJECT_CONTEXT.md` §54–§58)
- **Backend `server/crm/`** (montado em `/api/crm` por `server/index.js`):
  `routes.js` (`createCrmRouter({ auth })`, auth injetável p/ teste; /me,
  /options, /overview, /search, /cnpj/:cnpj, /companies CRUD + check-duplicates
  + restore + timeline + audit + projects link/unlink, /projects-available,
  /contacts CRUD, /notes, /import/fields|preview|commit, /bootstrap/preview|
  commit) · `service.js` (escritas: dado+auditoria+timeline numa transação) ·
  `queries.js` (leituras/KPIs/busca) · `permissions.js` (`crmRoleOf`, capacidades
  read/write/remove/import/admin) · `duplicates.js` · `importer.js` ·
  `bootstrap.js` (importer.js/text.js: normalizadores de planilha, nomes-coringa recusados, §57) · `completeness.js` · `projectSummary.js` · `cnpj.js` ·
  `cnpjSuggestion.js` · `text.js` · `errors.js`.
  **Fase 2 (negócios)**: `pipeline.js` (constantes + `ensureDefaultPipeline`) · `deals.js`
  (create/update/move/delete; ganhar promove empresa a cliente) · `dealQueries.js`
  (board, lista, detalhe, KPIs, busca) · `products.js` (catálogo). Rotas: `/pipeline`,
  `/board`, `/deals[/:id[/move|/audit]]`, `/products`.
  **Fase 3 (atividades)**: `activities.js` (create/update/complete/cancel/reopen/delete + notificação ao
  responsável) · `activityQueries.js` (lista com contadores, por empresa/negócio, bloco da Visão geral) ·
  **Vários funis (§58)**: `funnels.js` (criar/renomear/padrão/arquivar funil, `saveStages`, `appendOpenStageTx`) · `dealImporter.js` (importação de negócios do PipeRun: prévia/gravação, idempotente por `external_id`) · rotas `/pipelines[/:id[/stages]]`, `/import/deals/*`.
  `scheduler.js` (lembretes a cada 10 min, iniciado em `server/index.js`) · `agendaFeed.js` (feed lido por
  `server/agenda.js`). Rotas `/activities[/:id[/complete|/cancel|/reopen]]`.
- **Frontend `src/crm/`** (`React.lazy` em `App.jsx`): `CrmScreen.jsx` (shell +
  submenus), `OverviewPage`, `CompaniesPage`, `ContactsPage`, `CompanyDrawer`
  (Ficha 360), `CompanyForm`, `ContactForm`, `ImportWizard` (xlsx.mini em
  `import()` dinâmico), `BootstrapDialog`, `GlobalSearch`, `ui.jsx`,
  `crmMeta.js` (rótulos + `CRM_CSS`), `crmApi.js`, `importMapping.js` (reconhecimento de colunas do assistente, puro/testável). **Fase 2**: `DealsPage` (Kanban+lista),
  `DealDrawer`, `DealForm`, `CloseDealDialog`, `ProductsPage`; `CompanyDrawer` ganhou aba
  Negócios e botão de upsell; `OverviewPage` ganhou bloco Funil. **§58**: `FunnelsAdmin` (funis e etapas), `DealImportWizard` (importar negócios + CSV dos que ficam de fora), seletor de funil em `DealsPage`/`DealForm`. **Fase 3**: `AgendaPage`, `ActivityList`,
  `ActivityForm`; aba Atividades na ficha da empresa, "Próximos passos" na do negócio, sino no topo;
  `App.jsx` trata `target.kind==='crm_activity'` (`pendingCrmOpen`); `Agenda.jsx`/`RenataAgendaBriefing.jsx` ganharam a fonte `crm_activity`.
- **Toques em arquivos existentes (aditivos)**: `App.jsx` (`hasCrm`, modo
  `'crm'` em `availableModes`/`locationTag`, card no `WorkspaceGateScreen`,
  select "Acesso ao CRM" no `EditUserModal`), `server/routes.js` (`PATCH
  /users/:id` aceita `crmRole`), `server/auth.js` (`rowToUser` → `crmRole`/
  `crmAccess`), `server/db.js` (fim de `initDb()`), `src/lib/api.js` (`err.data`).

### Agenda — resposta ao convite e carga do dia (2026-09, `PROJECT_CONTEXT.md` §59)
- `server/googleCalendar.js`: `myResponseOf`/`mapGoogleEvent` (resposta do usuário, `transparent`, organizador). `src/agenda/dayLoad.js` (puro): `rsvpOf`, `summarizeDay` (aceitos, pendentes, livre, pausas, almoço [padrão 12–13h, `lunch.blockers`], emendadas, conflitos); `src/agenda/agendaPrefs.js` (expediente padrão 08–18h e almoço padrão 12–13h configuráveis por pessoa, localStorage, `validatePrefs`, migra formato antigo), `timelineRows`, `fmtDur`. Consumido por `RenataAgendaBriefing.jsx` (tela inicial) e `Agenda.jsx` (grade). `assistantRetrieval.js` etiqueta a resposta no contexto da RENATA.

## 5. Fluxos críticos

```
LOGIN
Usuário → LoginGate → POST /auth/login → auth.js (bcrypt.compare, signToken) → cookie JWT → GET /auth/me (App bootstrap) → WorkspaceGateScreen

CRIAÇÃO DE EMPRESA
Usuário → CreateCompanyModal → POST /cnpj/lookup → cnpjLookup.js (cache → BrasilAPI → fallback ReceitaWS) → preenche form
        → confirma → POST /projects → routes.js (blankProject + merge company) → INSERT projects → CompanySelectorScreen atualizado

EDIÇÃO DE ATIVIDADE (autosave)
Usuário edita campo → updateActivity() em App() → mutateProject() (atualiza estado local + debounce) → PATCH /projects/:id (payload = projeto inteiro) → routes.js valida canAccessProject → UPDATE projects.data

EXCLUSÃO / LIXEIRA
Usuário → deleteActivity()/deleteSub() → seta deleted/deletedAt/deletedBy (soft delete) → some da view normal, aparece em SidePanel "Lixeira" → restoreActivity()/restoreSub() limpa as flags. Exclusão definitiva de projeto/usuário é DELETE SQL real.

EXPORTAÇÃO EXCEL
Usuário → botão "Excel" → exportExcel() em App() (client-side, usa lib `xlsx`) → gera .xlsx no browser, sem round-trip ao backend.

EXPORTAÇÃO PDF (relatório executivo, 2026-08)
Usuário → botão "PDF" → exportPdf() em App() → window.print() → CSS @media print troca o que aparece: .no-print (UI normal, inclusive <main>) some, .print-report (componente PrintReport, dedicado, já pronto no DOM mas display:none na tela) aparece, @page force paisagem → sem backend envolvido.

QUADRO PESSOAL — AUTOSAVE COM ROLLBACK
Usuário arrasta/edita card → mutatePersonalBoard() (update otimista) → persistPersonalBoardDebounced() → PATCH /personal-board → se falhar, reverte para lastGoodPersonalBoardRef e mostra "Falha ao salvar".
```

Não há storage externo nem fila: anexos de atividade são base64 inline no PATCH do projeto (ver §9), arquivos de Pareceres e Modelos ficam em BYTEA. Trabalhos assíncronos (estudo dos Pareceres, Dossiê, transcrição) rodam dentro do processo e o estado vai para tabela; há um agendador de 10 min (lembretes do CRM) — ver `PROJECT_CONTEXT.md` §6.

## 6. Banco de dados

| Tabela | Finalidade | Relacionamentos |
|---|---|---|
| `organizations` | Tenant/organização (2026-08). Colunas: `slug`, `name`, `display_name`, `logo_light/dark`, `favicon`, `primary_color`, `secondary_color`, `login_background`, `status` (active/suspended/blocked), `plan`, `max_users`, `max_companies`, `settings` JSONB | `users.org_id`/`projects.org_id` referenciam `organizations.id` |
| `users` | Conta de login, papel (master/pricetax/cliente), CNPJs liberados, `org_id`, `is_super_admin`, `crm_role` (acesso ao CRM, §54), `preferences`/`onboarding_done_at` (Meu dia e boas-vindas, §77), `widget_token_hash`/`widget_token_enc`/`widget_token_created_at`/`widget_last_used_at`/`widget_views` (widget do iPhone, §76) | `personal_boards.user_id` referencia `users.id` (CASCADE); `org_id → organizations.id` |
| `projects` | 1 linha = 1 empresa/cronograma inteiro, tudo em `data JSONB` (company, phases, activities, team, log) + coluna relacional `org_id` | Vínculo com `users` é lógico via `company.cnpj` / `allowed_cnpjs`, não FK; `org_id → organizations.id` |
| `cnpj_cache` | Cache de 60 dias das respostas de lookup de CNPJ — **não** tem `org_id`, é compartilhado entre organizações de propósito | Nenhum |
| `personal_boards` | 1 linha por usuário, `data JSONB` = quadro Kanban pessoal — **não** tem `org_id` (sempre buscado por `user_id`; o scan de `shareToken` público é cross-org de propósito) | FK `user_id → users.id` |
| `document_templates` / `document_template_items` | Modelos de documentos (2026-10-05, §78): o modelo (título, categoria, descrição, comentários) e seus até 12 anexos (arquivo em BYTEA ou link com `link_meta`/`preview_text`). Colunas de arquivo/link de `document_templates` são legado migrado | `org_id → organizations.id`; `template_id → document_templates.id` (CASCADE) |
| `api_tokens` | Tokens da API de conectividade (2026-10-05, §80): um por janela do Claude Code, `token_hash` (sha256, único), `scope` (`read`/`read_create`), `expires_at`, `last_used_at`, `revoked_at` | `user_id → users.id` (CASCADE) |
| `daily_content` | Cache diário das fontes do Meu dia (2026-10-05, §77): PK `(kind, key, day)`, `payload` JSONB; evangelho/versículo/sabedoria/horóscopo por signo/texto de IA do dia | — |
| `ai_eval_runs` | Registro de execução do eval da RENATA (`server/evals/`, §41) | — |
| `parecer_studies` / `meeting_parecer_advice` | Estudo de cada parecer (hash do arquivo, JSON estruturado, `fact_id` na memória) e sugestão de pareceres por reunião (fora do JSON do projeto de propósito, §70) | `parecer_id → pareceres.id` (CASCADE); `project_id → projects.id` (CASCADE) |
| `user_access_events` / `ip_geo_cache` | Auditoria de acessos (login, volta à sessão, tentativa falha) com IP, local e dispositivo; cache de geolocalização por IP (§67) | `user_id → users.id` (CASCADE) |
| `personal_card_events` | Registro permanente de abertura/conclusão de cada atividade do quadro pessoal (`kind` opened/closed, sem CHECK) — sobrevive a reabrir e excluir; base dos Indicadores (§65) | FK `user_id → users.id` (CASCADE); `card_id` solto, sem FK |
| `meeting_submissions` | Caixa de transcrições (2026-09) — 1 linha por transcrição enviada pra virar reunião via IA, `status` (pending/processing/done/failed) próprio, fora do JSONB do projeto de propósito (sobrevive independente do resultado do processamento) — ver `PROJECT_CONTEXT.md` §24.1 | FK `org_id → organizations.id`, `project_id → projects.id`, `submitted_by → users.id` |
| `ai_conversations` / `ai_messages` | Assistente do Projeto, Fase 2 (2026-09) — 1 conversa contínua por (projeto, usuário); mensagens com fontes/observabilidade/feedback + `proposed_action`/`action_status` do agente executor (Fase 6 v1) — ver `PROJECT_CONTEXT.md` §27 | FK `org_id`/`project_id`/`user_id`; `ai_messages.conversation_id → ai_conversations.id` (CASCADE) |
| `ai_project_insights` | Aprendizados duráveis do Assistente do Projeto (2026-09) — extraídos das conversas, à parte de `ai_messages` de propósito (sobrevivem a "Limpar conversa") — ver `PROJECT_CONTEXT.md` §27 | FK `org_id → organizations.id`, `project_id → projects.id` (CASCADE) |
| `project_dossiers` | Dossiê do cliente (2026-10-02, §63) — uma linha por geração (status `generating`/`done`/`error`, `progress`, `content` JSONB com o documento, `sources` = hash de cada reunião usada, `error`); mantém as 5 últimas `done` | FK `org_id → organizations.id`, `project_id → projects.id ON DELETE CASCADE`, `created_by → users.id`; sem CHECK (status validado em JS) |
| `project_meeting_digests` | Cache da ficha gerada pela IA a partir da TRANSCRIÇÃO de uma reunião sem resumo (2026-10-02, §63) — `digest_key` = hash de título+data+transcrição; mudou a transcrição, refaz só essa | PK `(project_id, meeting_id)`, FK `project_id → projects.id ON DELETE CASCADE` |
| `crm_companies` / `crm_contacts` / `crm_notes` | CRM Fase 1 (2026-09, `PROJECT_CONTEXT.md` §54; §57 acrescentou telefone, e-mail de contato, endereço/CEP, fundação, capital social e CNAEs secundários em `crm_companies`) — relacionais (não JSONB), UUID, soft delete, `org_id`. Índice único parcial `(org_id, cnpj)` em empresas ativas com CNPJ | `crm_contacts`/`crm_notes` → `crm_companies.id`; `org_id → organizations.id` |
| `crm_company_projects` | Vínculo empresa CRM ↔ projeto do cronograma (`project_id` UNIQUE; vários projetos por empresa). CRM só LÊ `projects.data` | `company_id → crm_companies.id`, `project_id → projects.id` |
| `crm_timeline_events` / `crm_audit_logs` | Histórico de negócio e auditoria campo a campo — **append-only por trigger** (`crm_block_history_mutation` barra UPDATE/DELETE); limpeza de teste exige `DISABLE TRIGGER USER` | `company_id → crm_companies.id` |
| `crm_pipelines` / `crm_pipeline_stages` | CRM Fase 2 (§55) — funil padrão por org criado sob demanda (7 etapas, prob. por etapa, `kind` open/won/lost); índice único parcial = 1 padrão por org | `pipeline_id → crm_pipelines.id` |
| `crm_deals` / `crm_deal_items` | Negócios (§58: `external_source`/`external_id` = ID no sistema de origem, índice único parcial p/ reimportar sem duplicar) (Lead = 1ª etapa; `deal_type` new/upsell; `status` open/won/lost; soft delete). Itens guardam retrato de nome e preço | `company_id → crm_companies.id`, `stage_id → crm_pipeline_stages.id`; itens → `crm_products` |
| `crm_activities` | CRM Fase 3 (§56) — atividades/follow-ups presas a uma empresa (negócio e contato opcionais, da mesma empresa); `due_notified_at` = carimbo do lembrete do agendador; soft delete | `company_id → crm_companies.id`, `deal_id → crm_deals.id`, `contact_id → crm_contacts.id`, `owner_id → users.id` |
| `crm_products` | Catálogo de produtos/serviços (preço de tabela, cobrança, ativo) | `org_id → organizations.id` |
| `crm_deal_stage_history` | 1 linha por mudança de etapa (dias na anterior) — **append-only por trigger**; base de aging/conversão da Fase 4 | `deal_id → crm_deals.id` |

Sem migrations formais — `initDb()` roda `CREATE TABLE IF NOT EXISTS` +
`ALTER TABLE ADD COLUMN IF NOT EXISTS` a cada boot do servidor.
`migrateToPricetaxOrg()` (`server/db.js`) roda logo em seguida, também a
cada boot: cria a organização `pricetax` se não existir e faz
`UPDATE ... SET org_id = <pricetax> WHERE org_id IS NULL` em `users` e
`projects` — é assim que dados pré-multi-tenant continuam funcionando sem
migration manual.

## 7. APIs

| Método + rota | Finalidade | Arquivo |
|---|---|---|
| POST /auth/login | Login, seta cookie JWT | routes.js |
| POST /auth/logout | Limpa cookie | routes.js |
| GET /auth/me | Sessão atual | routes.js |
| PATCH /auth/me | Trocar avatar | routes.js |
| GET /users | Listar usuários (master) | routes.js |
| POST /users | Criar usuário (master) | routes.js |
| PATCH /users/:id | Editar usuário (master) | routes.js |
| POST /users/:id/block | Bloquear/desbloquear (master) | routes.js |
| POST /users/:id/renew | Renovar acesso expirado (master) | routes.js |
| POST /users/:id/reset-password | Reset de senha (master) | routes.js |
| DELETE /users/:id | Remover usuário (master, guarda último admin) | routes.js |
| GET /projects | Lista projetos visíveis ao usuário logado | routes.js (`canAccessProject`) |
| POST /projects | Cria empresa/projeto | routes.js |
| PATCH /projects/:id | Salva projeto inteiro (autosave) | routes.js |
| DELETE /projects/:id | Remove projeto | routes.js |
| GET /projects/:id/team-candidates | Usuários elegíveis como responsável | routes.js |
| POST /cnpj/lookup | Consulta CNPJ (cache/BrasilAPI/ReceitaWS) | routes.js → cnpjLookup.js |
| GET /personal-board | Busca (ou cria) quadro pessoal do usuário | routes.js |
| PATCH /personal-board | Salva quadro pessoal inteiro | routes.js |
| GET /public-board/:token | Busca UMA página pública por token (sem auth; `optionalAuth` preenche `canEdit`) | routes.js |
| PATCH /public-board/:token | Salva UMA página pública (`requireAuth`, qualquer usuário logado — token é a autorização) | routes.js |
| GET /organizations | Lista organizações + contagem de usuários/empresas (`requireSuperAdmin`) | routes.js |
| POST /organizations | Cria organização (slug gerado do nome, `requireSuperAdmin`) | routes.js |
| PATCH /organizations/:id | Atualiza organização (status, branding — `requireSuperAdmin`) | routes.js |

**Roteadores além de `routes.js`** — lista completa com acesso e seção em `PROJECT_CONTEXT.md` §8.1. Resumo das mais novas:

| Prefixo | Rotas principais | Arquivo |
|---|---|---|
| `/api/widget` | `GET/POST/DELETE /token`, `GET /status`, `GET/PUT /views`, `GET /summary` (público, Bearer) | widget.js (+ widgetSummary.js) |
| `/api/daily` | `GET /` (conteúdo do usuário), `GET/PUT /preferences`, `POST /onboarding-complete`, `GET /options` | daily.js (+ dailyContent.js) |
| `/api/templates` | `GET /`, `POST /`, `PATCH/DELETE /:id`, `POST /:id/items`, `PATCH/DELETE /:id/items/:itemId`, `GET /:id/items/:itemId/file`, comentários | documentTemplates.js |
| `/api/pareceres` | CRUD + `/:id/file`, comentários, `/study`, `/advice` | pareceres.js |
| `/api/connect` | `GET /` (índice público), `/tokens` (cookie), `/me`, `/activities` (GET/POST), `/companies[/:id[/meetings/:mid]]`, `/agenda` — Bearer `pxk_…` | connect.js |
| `/api/crm` | 57 rotas (empresas, contatos, negócios, funis, atividades, importadores) | crm/routes.js |

`GET/POST /projects` e `GET/POST /users` aceitam `?asOrg=<orgId>` — só
respeitado quando `req.user.isSuperAdmin` (`effectiveOrgId()` em
routes.js); é como o Super Admin "entra" numa organização pra ver/criar
dados nela sem precisar de rota dedicada por recurso.

## 8. Dependências entre módulos (maior impacto lateral)

**`mutateProject()` (App.jsx)**
Usado por: `updateActivity`, `addActivity`, `deleteActivity`, `addSub`,
`updateSub`, `deleteSub`, `reorderSub`, `addComment`, `addLink`,
`toggleParticipant`, equipe (`addMember`/`removeMember`/`linkMember`), fases
(`addPhase`/`updatePhase`/`deletePhase`), empresa (`updateCompanyFields`).
→ Qualquer mudança nessa função afeta **todo** o módulo Empresas.

**`S` (objeto de estilos, App.jsx L5121+)**
Usado por todos os componentes do arquivo. Renomear ou remover uma chave
quebra silenciosamente (React ignora `style={undefined}`) — sempre `grep` o
nome da chave antes de remover.

**`canAccessProject()` (routes.js)**
Usado por: GET/PATCH/DELETE /projects, GET /projects/:id/team-candidates.
→ Mudar essa regra afeta visibilidade de dados para os 3 papéis de uma vez.

**`projectProgress()` / `projectNextActivity()` (App.jsx, topo)**
Usados por: `CompanySelectorScreen` (donut de progresso, próxima atividade).
Se o schema de `activity.status`/`activity.date` mudar, essas funções quebram.

**`cardStatusOf()` (App.jsx, topo)**
Usado por: `PersonalCard`, `PersonalListView`, filtros de status, badge de
status — fonte única de verdade do status derivado de `card.completed`.

## 9. Arquivos críticos

- **CRÍTICO**: `src/App.jsx` — app inteiro, 5500 linhas, um único componente
  `App()` de ~1450 linhas. Qualquer edição tem alto risco de afetar outra
  tela por compartilhar `S`, estado ou funções de mutação.
- **CRÍTICO**: `server/routes.js` — toda a superfície de API e as regras de
  autorização (`canAccessProject`, `requireMaster*`).
- **CRÍTICO**: `server/db.js` — schema do banco; mudança aqui é a única que
  precisa rodar em produção antes do frontend usar o campo novo (só se for
  coluna relacional nova — campo dentro do JSONB não precisa).
- **IMPORTANTE**: `server/auth.js` — sessão/JWT; bug aqui derruba login geral.
- **IMPORTANTE**: `server/cnpjLookup.js` — dependência de 2 APIs externas
  instáveis; já tem retry/timeout/cache, mas é ponto único de falha do
  cadastro de empresa.
- **IMPORTANTE**: `index.html` — variáveis CSS de tema; usadas em todo `S`.
- **LOCAL**: `src/lib/api.js`, `src/main.jsx`, `vite.config.js` — pequenos,
  baixo risco, poucas dependências.

## 10. Problemas técnicos conhecidos

- **Arquivo excessivamente grande**: `src/App.jsx` (~9.900 linhas, um único
  componente `App()` de ~2.800 linhas e mais de 100 funções/componentes no mesmo
  arquivo). Qualquer leitura completa consome muito contexto — use os números
  de linha da seção 3 e `Read` com `offset`/`limit`, ou `grep` por nome de
  função/componente.
- **Anexos em base64 dentro do JSONB**: `activity.attachments[].dataUrl` guarda
  o arquivo inteiro codificado dentro do projeto (limite 8MB/arquivo, sem
  limite de total). Em projetos com muitos anexos, o payload do
  `PATCH /projects/:id` (autosave, que reenvia o projeto inteiro a cada
  edição) cresce e fica mais lento. Não há storage externo (S3/etc).
- **Autosave reenvia o objeto inteiro**: tanto `PATCH /projects/:id` quanto
  `PATCH /personal-board` recebem o payload completo (não diffs), então o
  custo de rede/serialização cresce com o tamanho do projeto/board.
- **README.md**: reescrito em 2026-10-05 (antes descrevia a versão antiga em localStorage).
- **Sem testes automatizados nem lint configurado**: verificação de
  regressão é manual (build limpo + teste no browser).
- Nenhum outro gargalo, duplicação relevante ou risco de concorrência foi
  identificado na exploração desta rodada.

## 11. Estratégia de economia de contexto (lembrete)

1. Consulte este mapa antes de explorar.
2. Não faça busca ampla se o mapa já indica o arquivo/linha.
3. Leia só o trecho necessário (`Read` com `offset`/`limit`), não o arquivo inteiro.
4. Valide com o código antes de alterar — o mapa localiza, não substitui a leitura pontual.
5. Atualize este arquivo só quando descobrir algo estrutural novo (não para mudanças triviais).
