# Bugs já vividos e lições (catálogo por CLASSE)
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza. Fonte da verdade: o código; este texto é o mapa.

## Em uma frase
Catálogo dos TIPOS de bug que já aconteceram neste projeto, agrupados por classe (não por data), com o sintoma que o Rafael relata, a causa típica, onde já foi corrigido, qual script protege e o que conferir para não trazer o bug de volta.

## Para quem é / quando ler (gatilhos)
- O Rafael relata algo estranho: "o texto sumiu", "a RENATA travou em …", "não gravou", "a data está errada", "um cliente viu dado de outro", "a transcrição não sai de Processando".
- Antes de mexer em: digitação/autosave, gravação do quadro ou do projeto, chamada à IA (`max_tokens`, schema), datas, permissão por empresa, trabalho longo em segundo plano, `initDb`, CSS/mobile, Google, deploy.
- Antes de dizer "feito": conferir a classe correspondente abaixo.
- **Palavras-chave para busca (robô):** texto some, fantasma, 409, mergeBoards, saveTimers, useDebouncedField, max_tokens, Unterminated string, discriminatedUnion, todayInSp, GMT-3, org_id, parecerUsableFor, órfão, processing, tuple concurrently updated, disabled clique morto, add -A, aba antiga, Atualizar agora.

## Como ler este documento
Cada classe tem 5 blocos: **Como reconhece**, **Causa típica**, **Onde já foi corrigido** (§ = seção de `PROJECT_CONTEXT.md`; `docs/gerado/INDICE_PROJECT_CONTEXT.md` dá a linha), **Trava/teste que protege** e **Checklist**. No fim: tabela sintoma → primeira checagem (A), as 15 armadilhas (B) e o passo a passo para investigar produção (C).

| # | Classe | Quase sempre aparece como |
|---|---|---|
| 1 | Digitação e estado no React | texto some, cursor pula, campo trava |
| 2 | Perda de dados por concorrência | tarefa "desaparece" depois de 3 s; abas brigando |
| 3 | IA (limite, schema, laço, erro cru) | "Não consegui processar", "…" para sempre, JSON cru na tela |
| 4 | Datas e fuso | "hoje" errado, "0d", dia 31 de fevereiro |
| 5 | Permissões e isolamento | cliente/empresa vendo o que não devia |
| 6 | Trabalho longo morto por deploy | "Processando…" eterno, "Estudando…" eterno |
| 7 | Banco e migração | boot cai em banco novo/antigo; 500 em campo novo |
| 8 | Front, CSS, tema, mobile, acessibilidade | tela cortada, botão que "não faz nada", fonte errada |
| 9 | Integrações externas | Google/Receita/Railway/API de terceiros falham |
| 10 | Deploy e repositório | "corrigi e não mudou", pasta de cliente no GitHub |
| 11 | Documentação e verificação | doc diz uma coisa, código outra; "feito" sem prova |

---

## Classe 1 — Digitação e estado no React

**Como reconhece**
- Relato: "escrevo e o texto some", "o cursor pula", "ao renomear a coluna aparece um fantasma", "ao editar o checklist e apertar Esc salvou o texto cancelado".
- Confirmar: o valor no DOM está certo, mas o estado global muda a cada tecla (muitos `PATCH /api/projects/:id` por palavra digitada, visível na aba Rede do navegador); ou o `GET /api/projects` do poll chega no meio da digitação.

**Causa típica**
1. Campo de texto cujo `onChange` chama `mutateProject`/`setProjects` direto, a cada tecla (re-render do app inteiro) — §45–§47.
2. Hook (`useDebouncedField`) dentro de `.map()`: hooks não podem ficar em laço; a linha precisa ser componente próprio — §47.
3. Poll de sincronização (6 s) recarregando `projects` por cima de uma edição ainda não enviada (autosave 500 ms + campo 300 ms = até ~800 ms de janela) — §60.
4. `<input>` dentro de área com `listeners` do dnd-kit: Espaço/Enter inicia arrasto por teclado e bloqueia a digitação — §51.
5. `onBlur` rodando depois de Esc e salvando o texto "cancelado" — §62 (usa `cancelingChecklistRef`).
6. Ordem de `useEffect`: dois efeitos com a mesma dependência rodam na ordem em que aparecem; o de reset ganhou e desfez o salto — §18 (XFlow).
7. Formulário lido uma só vez no mount (`useState(() => new Set(initialSelected))`): mudar a prop depois não reflete — §17 (`CompanySelectorScreen`).

**Onde já foi corrigido**
| Problema | Arquivo / função | Seção |
|---|---|---|
| Debounce de campo (estado local, commit 300 ms depois) | `src/App.jsx` `useDebouncedField` (l.234) | §45 |
| Mesma correção em Item de Ação, cartão pessoal | `src/meetings/TodoDrawer.jsx`, `PersonalCardDetailModal` | §46 |
| Linhas extraídas p/ componente próprio | `AreaRow`, `PhaseRow` (`src/App.jsx`); `SubactivityRow` (`src/screens/CompanyViews.jsx`, a doc antiga dizia `App.jsx`) | §47 |
| Poll não sobrescreve edição pendente | `src/App.jsx` `reloadProjects(opts.background)`, `saveTimers`, `inFlightProjectSaves`, `trackInFlightSave` | §60 |
| Campo da coluna não inicia arrasto | `src/screens/PersonalBoard.jsx` `PersonalColumn` (`stopPropagation` em `onKeyDown`/`onPointerDown`, l.~622) | §51 |
| Fechar modal editando sem aviso | `useDirtyForm`, `useAutosaveTimestamp`, `ConfirmDiscardModal`, `flushProjectSave` (`src/App.jsx`) | §43, §16 |

**Trava/teste que protege**
- Não há script em `scripts/` para digitação: as checagens foram descartáveis (digitar rápido e ler o valor final no Postgres, §46–§47; PATCH atrasado 7 s forçado via `window.fetch`, §60).
- `python3 scripts/scope-check.py` pega componente JSX sem import e variável usada antes do `const` no corpo de `AppScreens` (o `vite build` não pega).
- Pendência registrada: `TableView` (título/descrição inline na aba Tabela) ainda tem update por tecla (§45, §47).

**Checklist para não reintroduzir**
- [ ] Campo de texto novo: usar `useDebouncedField`, nunca `onChange` → `mutateProject` direto.
- [ ] Campo dentro de `.map()`: extrair a linha para um componente (hooks não rodam em laço).
- [ ] Ao ler "o valor de verdade" no `onBlur` de um campo debounced, usar o rascunho local (`overrides`), não o estado já commitado (corrida do §47).
- [ ] Cancelar (Esc/botão) nunca pode commitar: marcar uma ref antes de tirar o foco.
- [ ] Input dentro de cabeçalho/cartão arrastável: `stopPropagation` em teclado e ponteiro. Ainda sujeitos: botões dos cartões do Quadro Pessoal (`PersonalCard`, §51).
- [ ] Toda mudança em `projects`/`personalBoard` passa por `mutateProject`/`mutatePersonalBoard` (§16), nunca `setProjects` direto.
- [ ] Todo modal de edição segue `useDirtyForm` ou `useAutosaveTimestamp` (+ `requestClose()`), nunca um terceiro padrão (§16).

---

## Classe 2 — Perda de dados por concorrência (última gravação vence)

**Como reconhece**
- Relato: "adiciono a tarefa e depois de 3–4 segundos ela some" (duas abas abertas), "a edição da API foi sobrescrita", "o cartão volta para a coluna antiga", "o ajuste feito pela API/RENATA sumiu".
- Confirmar: duas abas/pessoas gravando o mesmo JSONB inteiro (`personal_boards.data` ou `projects.data`); `PATCH` sem `mergeable`; aba aberta antes de um deploy (sem a correção).

**Causa típica**
- O quadro pessoal e o projeto são **um JSONB regravado inteiro**; quem grava por último vence — §117, §83 (17 pontos regravam o projeto).
- Duas gravações disparadas em paralelo sobre o mesmo `data` (log "enviou transcrição" × processamento) — uma apagava a outra (§116d).
- Dois cliques simultâneos recalculando antes da trava (lacunas duplicavam atividades) — §86.
- Falha de rede/5xx desfazia a edição local — §118.
- Arrastar negócio do CRM "não gravava": quadro só mudava depois da volta do servidor, com tela lenta o `drop` dependia de estado do React — §119.

**Onde já foi corrigido**
| Problema | Arquivo / função | Seção |
|---|---|---|
| Fusão de 3 vias (base × minha × servidor) | `src/personal/boardMerge.js` `mergeBoards`/`mergePage` | §117 |
| 409 com `mergeable: true` + `baseUpdatedAt` | `server/routes.js` `PATCH /api/personal-board` e `PATCH /api/public-board/:token`, `sameStamp` (l.728) | §117 |
| Painel reenvia até 5 voltas no 409 | `src/App.jsx` `sendPersonalBoard`, `PublicBoardScreen` (`src/screens/PersonalBoard.jsx`) | §117 |
| Retentativa em erro transitório | `src/lib/saveRetry.js` `isTransientSaveError`, `retryDelay` (2/5/10/20 s, depois 30 s) | §118 |
| Movimento otimista no CRM | `src/crm/boardMove.js`, `src/crm/DealsPage.jsx` | §119 |
| Log aguarda antes de processar | `createSubmission` (`server/meetingInbox.js`) | §116d |
| Trava de lacunas | `POST /api/gaps/create` (recalcula DEPOIS da trava) | §15 |
| Padrão da org: lock por organização | `server/standardTemplateStore.js` (`pg_advisory_xact_lock`) | §89 |
| Rede de proteção: versão a cada gravação | gatilho `pv_schedule`, `server/projectVersions.js`; restaurar só Master | §83 |

**Trava/teste que protege**
- `scripts/board-merge.test.mjs` (fusão pura), `scripts/board-conflict-http.test.mjs` (reproduz a perda com painel antigo e prova o 409 com o novo), `scripts/save-retry.test.mjs`, `scripts/crm-board-move.test.mjs`, `scripts/crm-move-sim.mjs`, `scripts/gaps-http.test.mjs`, `scripts/project-versions-http.test.mjs`, `scripts/board-back-http.test.mjs` / `board-column-share-http.test.mjs` (quadro público).
- E2E com Chromium real (`scripts/e2e/*.mjs`): precisam de `playwright-core` fora do projeto.

**Limites conhecidos (não resolvidos)**
- Mesmo campo editado nos dois lados: "quem grava vence" (não dá para juntar dois textos) — §117.
- Painel de empresa (`PATCH /projects/:id`) e escritas por API/RENATA seguem "último a gravar vence" com quem estiver com a empresa aberta (§87.12, §91). Combinar antes.
- `findBoardByShareToken` varre todos os quadros a cada acesso público (não escala) — §6.

**Checklist**
- [ ] Gravação de JSONB inteiro nova: usar `mergeable` + `baseUpdatedAt` e responder 409, nunca sobrescrever às cegas.
- [ ] Poll/recarga em segundo plano nunca substitui o que tem gravação pendente (`saveTimers`, `inFlightProjectSaves`).
- [ ] Erro 5xx/rede: manter a edição na tela e repetir; 4xx: desfazer e avisar (`isTransientSaveError`).
- [ ] Duas escritas no mesmo `data`: serializar (`await`) ou usar `FOR UPDATE` dentro de transação.
- [ ] Teste de duas abas reais no navegador, não só curl.
- [ ] Lembrar que aba aberta antes do deploy continua com o código velho (classe 10).

---

## Classe 3 — IA: limite de saída, schema, laço, erro cru, custo

**Como reconhece**
- "Não consegui processar essa pergunta agora" (mensagem do servidor, dentro do pipeline) × "Não consegui responder agora" (erro HTTP; indica exceção fora do `try/catch`).
- Log do Railway com `Unterminated string in JSON at position N` / `Failed to parse structured output` — **truncamento por `max_tokens`**, não schema errado.
- Bolha "…" para sempre na RENATA operacional (laço de ferramentas sem resposta final).
- JSON cru da Anthropic na tela (`credit balance is too low`, 401, 429).
- Resposta com `[id=akf-…]` visível.
- Aviso "estudou 11 de 12 pareceres" que nunca fecha.

**Causa típica**
| Causa | Detalhe | Seção |
|---|---|---|
| `max_tokens` baixo demais | JSON estruturado cortado no meio; o retry gera a mesma resposta e corta no mesmo lugar (falha **determinística**, retry só ajuda falha transitória) | §33 (1500→4000), §81 (resolveQuery 500→4000, synthesizeAnswer →8000), §116e (extração 10.000→16.000), §116g (estudo 6000→16.000, conselho 3500→8000) |
| `z.discriminatedUnion` em `zodOutputFormat` | `anyOf` aninhado quebra toda chamada; schema de IA = objeto achatado com campos `nullable()` | §27 (memória `cronograma_assistant_zod_schema_pitfalls`) |
| Helper fora do `try/catch` | exceção sobe como 500 genérico (ex.: `.toLowerCase()` em dado inesperado de `project.data`) | §27 |
| Laço sem fim | `MAX_STEPS = 10` gastos só em consultas; conversa termina sem texto | §116j |
| Ferramenta que faltava | a RENATA não tinha ferramenta para ler o conteúdo de reunião e vasculhava rotas | §116j (`reuniao_ver`, `reunioes_buscar`) |
| Erro cru da API | saldo/chave/limite mostrados em JSON | §49 (`friendlyAiError`) |
| Instrução herdada | "cite pelo [id]" fazia sentido só onde `citedFactIds` é campo estruturado | §116h |
| Data sem âncora | a IA não tem relógio; "hoje/amanhã" era chute | §36 |
| Busca AND-only | `plainto_tsquery` exige todas as palavras; pergunta genérica = 0 resultados | §30 (fallback OR) |
| Contexto incompleto | a IA só via reuniões, nunca cadastro/cronograma | §27 |

**Onde já foi corrigido**
| Arquivo / função | Proteção |
|---|---|
| `server/meetingInbox.js` | `EXTRACTION_MAX_TOKENS = 16000`, `isTruncated`, `COMPACT_HINT` (repete 1×), `friendlyAiError`, `processed_at` |
| `server/parecerStudy.js` | `STUDY_MAX_TOKENS` 16000, `ADVICE_MAX_TOKENS` 8000, `isTruncatedError`, repete 1× enxuto; erro de chave/crédito/limite não é tratado como corte |
| `server/knowledgeLibrary.js` | `studyMaterial` com teto 16.000 e `COMPACT_HINT` |
| `server/assistantRetrieval.js` | `withRetry` (l.80, 1 retentativa), `console.error` do motivo real, `resolveQuery` falhando 2× segue com a pergunta literal |
| `server/renata/agent.js` | `MAX_STEPS`; ao esgotar, nova chamada com `tool_choice: { type: 'none' }` + aviso; falha/vazio vira mensagem em português |
| `server/assistantGeneral.js` | `stripInternalIds` (rede de segurança) + regra no `SYSTEM` |
| `server/errorHandler.js` | `describeError` + `apiErrorHandler`: erro 5xx ganha `ref` (código curto) na tela e no log |
| `server/assistantContext.js` | `todayIso()` em `America/Sao_Paulo` + linha "DATA DE HOJE" no perfil |
| `src/meetings/Meetings.jsx` + `server/meetingInbox.js` | "Tentar novamente" (unitário e `POST /api/meeting-inbox/retry-failed`, em sequência) |

**Trava/teste que protege**
- `scripts/parecer-study-truncation.test.mjs` (sem corte = 1 chamada com 16000; corte 1× = repete enxuto; corte 2× = para; erro 401 não repete).
- `scripts/connect-meetings-edit.test.mjs` (extração cortada: 1 retentativa; cortada sempre = falha clara).
- `scripts/knowledge-library.test.mjs` (estudo cortado/erro de chave).
- `scripts/renata-limite-passos.test.mjs` (10 passos → resposta final; `_at` nunca vai à IA).
- `scripts/renata-general-ids.test.mjs`, `scripts/error-messages.test.mjs`, `scripts/renata.test.mjs`, `scripts/renata-tools.test.mjs`.
- IA simulada: `ANTHROPIC_BASE_URL` aponta para uma "Anthropic" falsa local (ex.: `scripts/connect-transcripts.test.mjs`). **Isso prova o caminho e a retentativa, não a qualidade nem se cabe no limite com a IA real.**

**Checklist**
- [ ] Todo `messages.parse`/`zodOutputFormat` novo: `max_tokens` folgado (pior caso 16.000), sem união no schema, objeto achatado com `nullable()`.
- [ ] Detectar corte (`stop_reason === 'max_tokens'` ou erro de JSON não terminado) e repetir **uma** vez em versão enxuta; nunca laço.
- [ ] Erro de chave/crédito/limite **não** é corte: traduzir com `friendlyAiError`, não repetir.
- [ ] Helper que lê `project.data` dentro do `try/catch` do pipeline, com `String(x || '')` antes de métodos de string.
- [ ] Todo laço de ferramentas tem teto e resposta final forçada.
- [ ] Instrução de prompt que cita ids só onde o id é campo estruturado; texto livre cita título.
- [ ] Data de hoje vai no prompt, calculada em Brasília.
- [ ] IA com custo: cache por dia/hash, 1 chamada para N pessoas; falha degrada o cartão ("Indisponível") sem derrubar a tela (§16.1).
- [ ] Dizer "não testado com IA real" e registrar na §15.

---

## Classe 4 — Datas e fuso

**Como reconhece**
- "Hoje é 11/09" às 23h de 10/09; "0d" para algo aberto no domingo; reunião de hoje tratada como de ontem; evento em dia errado; data `2026-02-31` aceita.
- Confirmar: a janela de erro é ~21h–meia-noite de Brasília (o Railway roda em UTC; Brasília = UTC-3, sem horário de verão em 2026).

**Causa típica**
- `getFullYear()/getMonth()/getDate()` ou `new Date()` com getters locais no servidor: usam o fuso do **processo** (UTC) — §36.
- Contar "dias" como blocos de 24 h (`floor(ms/86400000)`) em vez de dias de calendário — §75.
- `Date.parse('2026-02-31')` arredonda para março (valor 1772496000000 = 3 de março); precisa de ida-e-volta (`toISOString().slice(0,10) === v`) — §116e.
- Formatar timestamp ISO completo com função que só entende `YYYY-MM-DD` (`fmtDate` × `fmtTs`) — §48.
- Constante de fuso usada sem declarar no arquivo (`TZ` em `accessLog.js`) — §68.
- Janela "hoje" no cliente: fuso do navegador de quem vê (limite do §75).

**Onde já foi corrigido**
| Arquivo / função | O que faz | Seção |
|---|---|---|
| `server/widgetSummary.js` `todayInSp` (l.7) | "hoje" em `America/Sao_Paulo` (usado em widget, Meu dia, calendário da empresa, `connect.js`) | §76–§77 |
| `server/assistantContext.js` `todayIso` (l.31) | idem para a RENATA | §36 |
| `src/lib/dates.js` `calendarDaysSince` | dias de calendário no fuso local | §75 |
| `server/meetingEdit.js` `isISODay` (l.14) | ida-e-volta; recusa `2026-02-31` | §116e |
| `server/accessLog.js` (`TZ` declarado) | contagem de dias ativos por fuso de Brasília | §67–§68 |
| RENATA mostra `dd/mm hh:mm · GMT-3` | sempre `America/Sao_Paulo`, cada mensagem guarda `_at` (ISO) | §116j |
| `server/crm/scheduler.js` | só avisa a partir das 7h de Brasília | §56 |

**Achados em aberto (conferidos no código em 2026-10-29)**
- `server/macro.js` l.37: `const today = new Date();` + `isoDate(today)` — mesma classe do §36 (janela 21h–meia-noite). Sinalizado em §36 como tarefa separada; **segue sem correção**.
- `server/connect.js` l.612: `isISODay` **local, fraco** (`Date.parse`), usado nos operadores de data do plano (`date`/`endDate`, l.643, 644, 657). Aceita `2026-02-31`. A versão correta é a de `server/meetingEdit.js`; `connect.js` só a usa na rota de transcrições (`isMeetingDay`, l.451).

**Trava/teste que protege**
- `scripts/connect-meetings-edit.test.mjs` cobre `isISODay` (datas inválidas).
- Para "dias": teste Node descartável com `TZ=America/Sao_Paulo`, data de borda (domingo → segunda, virada de mês/ano) — §75. **Sem script em `scripts/` para `todayIso`/`todayInSp`/`calendarDaysSince`.**

**Checklist**
- [ ] No servidor, "hoje" = `todayInSp()`; nunca `new Date().getDate()` nem `toISOString().slice(0,10)` (UTC).
- [ ] Comparar datas como string `YYYY-MM-DD`, não como instante.
- [ ] "Há N dias" = diferença de dias de calendário (`calendarDaysSince`).
- [ ] Validar data de entrada com ida-e-volta.
- [ ] Todo texto "Nd"/contagem exibida: testar a data de borda antes de dizer "feito" (§16.1).
- [ ] Relatar horário em Brasília (e UTC entre parênteses); ao ler log, somar 3 h (classe C abaixo).

---

## Classe 5 — Permissões e isolamento (org_id, cliente, empresa)

**Como reconhece**
- "Vi um parecer da TECUMSEH dentro da DAJU"; cliente vendo anotação interna; botão que aparece para quem não tem acesso; acesso por id direto a recurso de outra base.
- Confirmar: a regra existe só no front (botão escondido) ou falta o filtro `org_id`/`canAccessProject` na rota.

**Causa típica**
- Confiar em checagem de `role` no front; query em `users`/`projects` sem `org_id` — regra §16.
- Gate esquecido em dois pontos de UI (botão "Gestão de Atividades" aparecia sem `personalAccess`) — §17.
- Recurso criado em outra organização entrando no estado local (`crossOrg`) — §17.
- Conteúdo "geral" × "de cliente" misturado: parecer de um cliente entrando no prompt de outro — §70.
- Fato de parecer entrando na detecção de conflito/cache de outro projeto — §70.
- Ordem de `if (...) return <Tela/>` em `App()`: só o primeiro gate que casar renderiza — §17.
- Token na URL (Power BI) cai em log de proxy — §90.

**Onde já foi corrigido**
| Arquivo / função | Regra | Seção |
|---|---|---|
| `server/parecerScope.js` `parecerUsableFor` (l.24) | Geral vale em qualquer empresa; específico só na empresa dele (vínculo `company_project_id` decide; sem vínculo, nome; sem nome = não vale). Prefere calar a vazar | §70 |
| `server/parecerStudy.js` `loadDoneStudies` / `getMeetingAdvice` | filtra por empresa antes do prompt e de novo na leitura | §70 |
| `server/knowledgeFacts.js` `loadRelevantFacts(isStaff)` | cliente nunca recebe parecer; fato sem vínculo verificável não entra | §70 |
| Rotas com `canAccessProject`/`sameOrg()`/`org_id` | autoridade é o servidor | §7, §16 |
| `canOpenMode`/`availableModes` (`src/lib/routes.js`, `src/App.jsx`) | mesmo guard do servidor | §16.1, §74 |
| Chaves `pxk_` (`server/connect.js`) | escopos separados; só hash autentica; credencial no `Authorization`, nunca na URL | §80, §99, §116e–f |

**Trava/teste que protege**
- `scripts/renata-parecer-orientacao.test.mjs` (parecer de OUTRO cliente nunca aparece; só equipe; apagado some).
- `scripts/ops-intel-http.test.mjs` (RBAC 401/403, isolamento por organização), `scripts/connect-scopes.test.mjs`, `scripts/connect-crm.test.mjs`, `scripts/connect-meetings-edit.test.mjs` (outra organização/sem acesso → 404), `scripts/views-dashboards.test.mjs`, `scripts/experience-http.test.mjs`, `scripts/project-versions-http.test.mjs`.
- Os 27 testes de isolamento de pareceres (§70) foram descartáveis; os de `renata-parecer-orientacao` são o que ficou em `scripts/`.

**Limites conhecidos**
- `organizations.status` (suspensa/bloqueada) não bloqueia login; planos/limites não são aplicados (§15).
- Casamento de parecer por nome é conservador: sem vínculo e nome diferente, o parecer **não** aparece nem na empresa certa. A saída é escolher a empresa na lista ao enviar (grava o vínculo).
- Escopo da chave: o servidor é quem confere (`needTranscripts` etc.); a tela só esconde opções.

**Checklist**
- [ ] Rota nova em `users`/`projects`/CRM: `org_id` + `canAccessProject()`/`sameOrg()` no servidor.
- [ ] Todo gate de UI repetido nos 3 pontos: topbar, menu "Mais", cards da `WorkspaceGateScreen`, `availableModes`.
- [ ] Conteúdo que vai ao prompt de IA: filtrar por empresa **antes** de montar o prompt; cliente (`role` cliente) nunca recebe conteúdo interno.
- [ ] Segredo só por hash (ou cifrado AES-GCM); nunca na URL.
- [ ] Busca no servidor com URL de usuário passa por `server/linkPreview.js` (SSRF).
- [ ] Arquivo enviado: lista fechada de extensões, `nosniff`, SVG recusado (§16.1).
- [ ] Dizer onde a permissão é garantida (arquivo + função); se só o front esconde, é achado.

---

## Classe 6 — Trabalho longo interrompido por deploy (estado órfão)

**Como reconhece**
- "Processando…" para sempre numa transcrição; "Estudando…" preso; "Gerando…" sem fim; um deploy aconteceu nos minutos anteriores.
- Confirmar: linha com `status='processing'`/`'running'` e `processed_at`/`started` antigos; o log do Railway mostra reinício (boot) no horário.

**Causa típica**
- Não há fila nem worker externo (§6): o trabalho roda **dentro do processo** (fire-and-forget). Deploy mata o processo e nada mais toca a linha.
- O botão "Tentar novamente" só existia para `failed`.
- Medir "travado" a partir de `created_at` marcava como travada uma transcrição antiga reenviada (§49).

**Onde já foi corrigido**
| Trabalho | Recuperação | Seção |
|---|---|---|
| Transcrição (`meeting_submissions`) | `GET /api/meeting-inbox` vira `failed` o `processing` com mais de 5 min; a tela oferece "Tentar novamente" após 90 s; mede de `COALESCE(processed_at, created_at)` | §44, §49 |
| Lote de retentativa | `POST /api/meeting-inbox/retry-failed`: uma por vez em sequência | §49 |
| Estudo de pareceres (`parecer_studies`) | `computeStudyState` marca `failed` o `running` há mais de 1 min sem job vivo no processo (`running` Set); teto `STALE_STUDY_MS` = 30 min | §70 |
| Chunk do front de aba antiga | `src/lib/lazyRetry.jsx` mostra aviso com botão, nunca recarrega sozinho | §88 |

**Trava/teste que protege**
- Verificações descartáveis em Node (órfão vira falho; recém-iniciado continua) — §44, §49, §70. **Sem script em `scripts/`.**
- Limite honesto: item `pending` esperando na fila do lote quando o servidor reinicia fica órfão (o recupero cobre só `processing`) — §49.
- Mesmo para Dossiê, reindexação da memória e a varredura de vínculos (jobs em memória; "refazer pelo botão").

**Checklist**
- [ ] Todo job em segundo plano grava `status` + carimbo de início **desta tentativa** (`processed_at`), e tem recupero de órfão por tempo.
- [ ] Toda falha tem botão/rota de nova tentativa; nunca exigir `UPDATE` manual em produção.
- [ ] Lote: sequencial (paralelo estoura rate limit de IA).
- [ ] Avisar no texto da entrega o que um deploy no meio faz.
- [ ] Após o deploy, conferir se ficou algo em `processing`/`running`.

---

## Classe 7 — Banco e migração

**Como reconhece**
- Serviço cai no boot depois do deploy (log: erro em `initDb`); 500 com `null value in column …` em caminho que não é a tela; `tuple concurrently updated` em teste local.
- Confirmar: o bug só aparece com dado real antigo (banco de dev limpo não reproduz) — foi o caso das duas quedas abaixo.

**Causa típica**
| Caso | O que aconteceu | Seção |
|---|---|---|
| Migração de `CHECK` na ordem errada | traduzir valores antigos **antes** de derrubar a constraint antiga: o próprio `UPDATE` violava a constraint. Produção caiu ~12 min (08:54–09:06 BRT, 3 tentativas de deploy; o 1º hotfix mirou a hipótese errada) | §38 |
| Tabela com FK antes da referenciada | `parecer_studies` criada antes de `pareceres` derrubaria o boot em banco novo (hoje: `pareceres` l.916, `parecer_studies` l.950 em `server/db.js`) | §70 |
| Coluna `NOT NULL` sem caminho que a preencha | `createDeal` sem `mrr` dava 500 desde o deploy do MRR; achado pelo teste do lead rápido | `docs/AUDITORIA_PRONTIDAO_EDUARDA.md` (B2) |
| Dois servidores subindo juntos | `initDb` concorrente colide (`tuple concurrently updated`, `CREATE OR REPLACE` concorrente) | §88, §101 |
| `sessionId` ausente | `String(undefined)` passava na regex e a gravação dava 500 | §82 |
| Datas/uuid | `users.id` não é UUID (cuidado ao criar FK/consulta) | §98 |

**Trava/teste que protege**
- `initDb` roda em todo boot e tem que ser **idempotente** (rodar duas vezes = mesmo resultado).
- `scripts/project-versions-http.test.mjs` (gatilho, versões, exclusão/recuperação), `scripts/piperun-migration.test.mjs` (integração em organização descartável), `scripts/experience-http.test.mjs`.
- Todos os scripts de HTTP recusam rodar contra banco que não seja `localhost` (conferir no cabeçalho de cada um).
- Esquema completo: `docs/gerado/BANCO.md`.

**Checklist**
- [ ] Só migração aditiva: `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` dentro de `initDb()`; nunca `DROP`/`UPDATE` destrutivo sem copiar antes.
- [ ] Tabela com FK vem depois da referenciada.
- [ ] Trocar vocabulário de `CHECK`: derrubar a constraint antiga primeiro, traduzir os dados, recriar a nova por último.
- [ ] Testar migração com uma linha **antiga de verdade** (inserir de propósito o estado de produção).
- [ ] Coluna `NOT NULL` nova: todo caminho de criação (tela, API, lead rápido, importador) preenche; testar pelo caminho que não é a tela.
- [ ] Campo novo em `projects.data`/`personal_boards.data`: só o front, sempre com fallback (`campo || default`) (§16).
- [ ] Subir um servidor de cada vez contra o mesmo banco local.
- [ ] `server/db.js` é sensível: só mexer se a tarefa pedir coluna relacional (CLAUDE.md).

---

## Classe 8 — Front, CSS, tema, mobile, acessibilidade

**Como reconhece**
- "Cliquei e nada acontece" (botão `disabled` por validação); tela cortada à direita no celular; zoom estranho no iPhone ao focar campo; fonte de livro antigo (Times) em módulo novo; aba ativa indistinta; campo sem estilo; texto invisível.
- Confirmar: medir no navegador (largura 360/375/390/820), não "de olho"; tela que não herda `font-family` de `S.page`.

**Causa típica**
| Sintoma | Causa | Seção |
|---|---|---|
| Botão "não faz nada" | `disabled={!form.name || !form.clientType}` — clique nem dispara o evento | §17 (validar dentro do `submit()` e mostrar erro) |
| Chave de `S` removida/renomeada | React ignora `style={undefined}` sem erro | §16 (`grep` o nome antes) |
| Clique "vaza" para o overlay de baixo | faltou `stopPropagation` ao fechar lightbox (XFlow) | §18 |
| `border` + `borderBottomColor` misturados | aviso do React, resíduo de estilo ao trocar de aba; abas quase sem contraste | §53 (só `longhand`) |
| Fonte serifada | módulo sem `font-family`; body é Times, Inter vem de `S.page` | §71 |
| Tabela cortada no celular | pai flex com `align-items:flex-start` + `body{overflow-x:hidden}` | §88.5 |
| Zoom do iOS | campo < 16 px (`input:not([type])`, `[contenteditable]` ficavam fora da regra) | §88.5 |
| Arrastar não funciona no toque | só `mouse*`; trocado por Pointer Events (Tabela, Gantt); HTML5 drag do CRM/quadro da empresa **não testado em toque** | §88.5 |
| Contraste reprovado (56%) | texto esmaecido, tema | §72, `docs/AUDITORIA_VISUAL.md` |
| Editor Tiptap converte cartão só por abrir | `editor.setEditable(x, false)` sem o 2º argumento emite "update" falso | §86 |
| Quadro pesado em máquina lenta | re-render de centenas de cartões por passo do arrasto | §119 |
| `S` inline × media query | media query nunca vence estilo inline | §16 (chave `S.algoMobile` nova) |

**Trava/teste que protege**
- `python3 scripts/scope-check.py` (JSX sem import; TDZ no corpo de `AppScreens`; falsos positivos conhecidos: `Icon` em `src/crm/CrmScreen.jsx` e `src/xflow/XFlow.jsx`).
- `python3 scripts/ui-audit.py [-v]`: `window.confirm/alert/prompt` (deve ser 0), botão só com ícone sem nome acessível, `<button disabled>` sem `title`.
- `npm run build` limpo.
- `docs/ROTEIRO_TESTE_MOBILE.md` (roteiro para aparelho real). **Safari/iPhone/Android reais nunca foram testados** (só Chromium); foco real por `.focus()` não funciona no navegador do painel (§72).

**Checklist**
- [ ] Botão de submit: sem `disabled` por validação; erro visível dentro do handler.
- [ ] Tela nova injeta o próprio bloco `<style>` de `input/select/textarea` (tema) (§16).
- [ ] Módulo novo declara fonte Inter na raiz (inclusive drawer/modal) (§16.1).
- [ ] Variante mobile = chave nova `S.xMobile`; nunca sobrescrever a desktop.
- [ ] Campos ≥ 16 px; alvos ≥ 44 px no toque; sem rolagem lateral (medir em 360/375/390).
- [ ] Peça de UI nova: usar `src/ui` (Card/Chip/Tabs/Kpi/EmptyState/Skeleton…) (§72).
- [ ] Preferências por endereço/porta (`localStorage`) distorcem comparação antigo × novo — limpar ao medir (§88.5).
- [ ] Rodar `scope-check.py` e `ui-audit.py` antes do deploy.

---

## Classe 9 — Integrações externas

**Como reconhece**
- Agenda "sem eventos"/recusados contando como compromisso; falha ao criar evento do Google; cadastro de empresa sem CNPJ; conteúdo do dia "Indisponível"; `railway logs` sem acesso; resposta 200 com HTML no lugar de JSON.

**Causa típica**
| Integração | Armadilha | Seção |
|---|---|---|
| Google Calendar | `listEvents` ignorava `attendees[].self.responseStatus`; usava o `status` do **evento**. Hoje: `myResponse` (accepted/declined/tentative/needsAction/organizer/unknown). Sem novo escopo | §59 |
| Google OAuth | `invalid_grant`/refresh inválido só loga e **não** afeta a TASK; `409` se o app está configurado e a conta de quem clica não conectou; o servidor **não** atualiza o evento quando a data muda (manual) | §21, §91 |
| Receita/BrasilAPI | duas APIs externas instáveis; ponto único de falha do cadastro; já tem retry/timeout/cache (`cnpj_cache` 60 dias) | §6, §14 |
| APIs de conteúdo (Liturgia, Midvash, AstroWay) | 3 de 6 estavam fora do ar, 1 em outro idioma; testar cada uma antes; mostrar crédito da licença; degradar para "Indisponível" | §77 |
| Anthropic | saldo/chave/limite: `friendlyAiError`; custo: cache | §49 |
| Railway | `RAILWAY_TOKEN` de projeto ficou inválido; hoje `RAILWAY_API_TOKEN` (workspace, só ler logs) e `node scripts/railway-logs.mjs` | §3, §117 |
| Voyage | chave local inválida: reindexação grava trechos sem vetor | §116e |
| `apiGet` | não põe `/api` sozinho: o Vite devolveu HTML com 200 e a tela ficou em "Carregando…" | §65 |
| Rota desconhecida sob `/api` | antes caía no fallback do SPA com 200 (enganava clientes da API); hoje 404 em JSON | §3 |
| Servidor Express 5 | rodar Express 4 e 5 juntos colide na migração | §88 |

**Trava/teste que protege**
- `scripts/crm-google-sync.test.mjs` (Google falso em memória; o Google real **não foi testado**).
- Agenda real, OAuth real, WhatsApp/Telegram: não testados (§15, `docs/TELEGRAM_BOT_ESTUDO.md` só estudo).
- `scripts/railway-logs.mjs` é só leitura.

**Checklist**
- [ ] Antes de depender de API de terceiros: testar a API, definir o estado "Indisponível", logar `Meu dia: falha em …`-style.
- [ ] Resposta de API do front: tratar HTML/200 como erro (falta de `weekday`, etc.).
- [ ] Nunca `fetch(url)` com endereço vindo do usuário (SSRF, `server/linkPreview.js`).
- [ ] Segredo só em `.env`/Railway; nunca em conversa, commit ou log.
- [ ] Conteúdo de terceiros: crédito junto; frase de pessoa real só de base curada com fonte (§100).

---

## Classe 10 — Deploy e repositório

**Como reconhece**
- "Corrigi e continua igual" (a Amanda testou de novo e "não deu certo"); bug em produção que não bate com o código local; pasta de cliente aparecendo no GitHub público; push divergente.

**Causa típica**
1. **SPA não atualiza aba aberta**: quem estava com a aba aberta antes do deploy roda o JS velho indefinidamente (§60).
2. **Correção escrita depois do último deploy**: o bug de `personalAccess` já estava corrigido no working dir mas nunca publicado — o `rsync` completo anterior não a carregou (§17). Lição: comparar o **bundle servido** com o commit antes de supor dado/configuração.
3. **O working dir NÃO é repo git**: deploy é num clone à parte (`/private/tmp/deploy-clone` ou refazer com `git clone`): `git fetch` → conferir divergência → `rsync -a --delete` → `npm run build` → commit → `git push origin main` (Railway builda sozinho) (§3).
4. **`git add -A` no clone subiu `exports/`** (auditoria e e-mail da ALCAST, planilhas) para o repo **público** (commit 183f9ab, 2026-10-26); removido no 2a2fea9 e ignorado (`exports/` está no `.gitignore`), mas **continua no histórico**; reescrever histórico é decisão do Rafael (memória `feedback-deploy-nao-usar-add-all`).
5. **Logs do container antigo somem**: `railway logs` só traz o deploy atual; conferir antes de outro deploy (§3, memória `cronograma_railway_log_access`).
6. O servidor **não registra requisições**; só boot, erros e `client-error` (§3).
7. `PORT` no dev: o preview do navegador pode exportar `PORT=5173` e o Express colide com o Vite; usar `PORT=3001` no script local (memória `cronograma_local_dev_port_quirk`).
8. `node --watch` fica parado depois de erro de sintaxe (`touch server/index.js` reinicia); o cookie de teste some ao reiniciar o dev server (§14).

**Onde já foi tratado**
| Proteção | Onde | Seção |
|---|---|---|
| Aviso "Nova versão disponível — Atualizar agora" (poll de 4 min do `<script type="module">`) | `useEffect` em `src/App.jsx` (perto do poll de sincronização) | §60 |
| `lazyRetry` (chunk velho) | `src/lib/lazyRetry.jsx` | §88 |
| `exports/` ignorado | `.gitignore` (l.6) | memória de deploy |
| `.sourcemaps/` fora de `dist/` | `scripts/stash-sourcemaps.mjs` (roda no `npm run build`) | §88 |
| Verificação em produção | hash do bundle em `https://painel.pricetax.com.br/` muda; rota nova responde 401/200 em JSON | §3 |

**Checklist**
- [ ] `git fetch` e checar divergência antes do `rsync`.
- [ ] Antes do commit: `git status --short` e **adicionar por caminho** (`git add src server scripts docs PROJECT_CONTEXT.md …`), nunca `-A`.
- [ ] Nunca force-push sem o Rafael aprovar.
- [ ] Depois do push: verificar produção (hash do bundle, rota nova) e o log do Railway.
- [ ] Bug relatado que não bate com o código: comparar o bundle servido com o commit atual.
- [ ] Antes de novo deploy, ler o log do container atual se há bug aberto.
- [ ] Peça ao usuário para recarregar a aba (ou aguardar o aviso de nova versão) antes de testar uma correção.
- [ ] Pedido que cita outro projeto/repo (ex.: XPED): parar e perguntar (memória `feedback-stop-on-other-project`).

---

## Classe 11 — Documentação desatualizada e verificação por improviso

**Como reconhece**
- A doc diz uma coisa e o código outra; "feito" sem prova na tela; o usuário descobre o erro antes de mim.

**Causa típica**
- Edição só do parser do cliente quando o fluxo passa por parser do servidor (outro projeto, mesma lição): rastrear o dado até a tela.
- Verificação por improviso, diferente a cada entrega; teste feito por "curl arrumado" e não pelo caminho da tela (mesmos headers/corpo do helper `api`).
- `PROJECT_CONTEXT.md` cronológico (8.350 linhas): o mesmo assunto em vários parágrafos datados; arquivos movidos entre `src/App.jsx` e `src/screens/` com a doc ainda apontando o lugar antigo.
- "Corrigi" sem dizer o que **não** foi testado (IA real, aparelho real, OAuth real).
- Pedido interpretado errado (página × coluna do quadro: "aba Amanda" era a COLUNA, §121).

**Onde já foi tratado**
| Proteção | Onde |
|---|---|
| Regra "o código é a fonte da verdade; corrija a doc antes de seguir" | `CLAUDE.md` item 8 |
| Doc gerada do código (rotas, banco, testes, índice) | `scripts/docs-gen.mjs` → `docs/gerado/` (`npm run docs:gerar`) |
| Consolidação contra o código | §79, §86–§91 |
| Lista de "entregue mas nunca visto funcionando" | §15 |
| Testes descartáveis citados (t2–t34) **não estão em `scripts/`** | §15 |

**Checklist**
- [ ] Rastrear o dado até a tela; provar valor esperado × obtido com dado real.
- [ ] Testar ação de escrita pelo mesmo caminho da tela (mesmos headers e corpo).
- [ ] Listar o que ficou **não testado** e anotar na §15.
- [ ] Atualizar `PROJECT_CONTEXT.md` e/ou `docs/PROJECT_MAP.md` na mesma sessão; rodar `npm run docs:gerar`.
- [ ] Pedido ambíguo ("aba/quadro/lista" de uma pessoa): olhar o print/breadcrumb (`PÁGINA / COLUNA`) e confirmar em uma linha.
- [ ] Fazer o `grep` antes de escrever um nome de arquivo/função numa doc.

---

# (A) Sintoma relatado pelo Rafael → primeira coisa a checar

Hora relatada em Brasília: somar 3 h para procurar no log (UTC).

| # | Sintoma | Primeira coisa a checar | Classe |
|---|---|---|---|
| 1 | "Escrevo e o texto some" | Se a aba é anterior ao último deploy; depois `reloadProjects` (poll) × `saveTimers`; se o campo usa `useDebouncedField` | 1, 10 |
| 2 | "A tarefa que criei desapareceu depois de 3 s" | Há outra aba aberta? `PATCH` com `mergeable`? resposta 409? | 2 |
| 3 | "Não consegui processar essa pergunta agora" | Log: `Assistente do Projeto: … falhou` — `Unterminated string` = `max_tokens`; senão chave/crédito | 3 |
| 4 | "Não consegui responder agora" (texto diferente) | Exceção fora do `try/catch` de `askProjectAssistant` (`[erro REF]` no log) | 3 |
| 5 | RENATA fica em "…" | `server/renata/agent.js` `MAX_STEPS`; log da conversa; resposta final forçada | 3 |
| 6 | JSON cru da Anthropic na tela | `friendlyAiError` cobre aquele padrão? saldo da conta | 3, 9 |
| 7 | Resposta com `[id=…]` | `stripInternalIds` e o prompt de `assistantGeneral.js` | 3 |
| 8 | Transcrição presa em "Processando…" | `meeting_submissions.status`/`processed_at`; houve deploy? "Tentar novamente" | 6 |
| 9 | "Estudou 11 de 12 pareceres, 1 aguarda" | Log `Pareceres: falha ao estudar parecer`; aviso `StudyBanner` mostra o motivo | 3, 6 |
| 10 | "A RENATA errou a data / disse que hoje é amanhã" | Hora do relato (21h–24h?): `todayIso()`/`todayInSp`; linha "DATA DE HOJE" no perfil | 4 |
| 11 | "Selo diz 0d mas abri ontem" | `calendarDaysSince` (`src/lib/dates.js`); fuso do navegador | 4 |
| 12 | "Visão Geral mostra a semana errada à noite" | `server/macro.js` l.37 (`new Date()` local) | 4 |
| 13 | Aceita data "31/02" | Qual validador: `meetingEdit.isISODay` (certo) × `connect.js` l.612 (fraco) | 4 |
| 14 | "Vi dado de outro cliente" | `parecerUsableFor`; filtro por empresa **antes** do prompt; `canAccessProject` | 5 |
| 15 | "Cliente vê coisa interna" | Rota confere `role`/`isStaff` no servidor? o front só esconde? | 5 |
| 16 | "Botão aparece para quem não tem acesso" | Gates repetidos (`personalAccess`, `availableModes`, topbar, menu Mais) | 5 |
| 17 | "Cliquei em Criar e nada acontece" | Botão `disabled` por validação (clique morto) | 8 |
| 18 | "A tela está cortada no celular" | Medir 360/375/390; pai flex; `TABLE_MIN_W`; `S.xMobile` | 8 |
| 19 | "Tela com cara de anos 1980 (serifa)" | `font-family` da raiz do módulo (Inter vem de `S.page`) | 8 |
| 20 | "Ao renomear a coluna apareceu um fantasma" | `stopPropagation` no input do `PersonalColumn`; sensores do dnd-kit | 1, 8 |
| 21 | "Arrastei o lead e não gravou" | `scripts/crm-move-sim.mjs` (servidor); CPU lenta; mensagem "Movido para…" com Desfazer; histórico de etapas | 2, 8 |
| 22 | "Corrigi e continua igual" | Aba antiga? aviso "Atualizar agora"? hash do bundle em produção | 10 |
| 23 | "Subiu coisa de cliente no GitHub" | `git status --short` no clone; `.gitignore`; adicionar por caminho | 10 |
| 24 | "Agenda mostra compromisso que recusei" | `myResponse` no `mapGoogleEvent` (`server/googleCalendar.js`) | 9 |
| 25 | "Google não cria o evento" | Conta conectada? `409`? `invalid_grant` no log (só loga) | 9 |
| 26 | "Cadastro de CNPJ não preenche" | `server/cnpjLookup.js` (BrasilAPI → ReceitaWS), `cnpj_cache` | 9 |
| 27 | "Serviço caiu depois do deploy" | Log de boot (`initDb`); migração na ordem certa; FK; `CHECK` | 7 |
| 28 | "Erro 500 num caminho que não é a tela" | Coluna `NOT NULL` nova sem valor no caminho (API/lead rápido) | 7 |
| 29 | "Falhou ao salvar, a edição voltou" | `isTransientSaveError`: 4xx desfaz por regra; 5xx/rede deve repetir | 2 |
| 30 | "A edição pela API sumiu" | A tela gravou o projeto inteiro depois? versões em `project_versions` | 2 |
| 31 | "Duas atividades iguais do botão das lacunas" | Dois cliques simultâneos; `POST /api/gaps/create` recalcula depois da trava | 2 |
| 32 | "Não consigo ver o log do Railway" | `RAILWAY_API_TOKEN` no `.env`; `node scripts/railway-logs.mjs`; o container antigo já foi trocado? | 9, 10 |
| 33 | "Erro com código curto na tela (ex.: A1B2C3)" | Procurar `[erro A1B2C3]` no log (`apiErrorHandler`) | 3, C |

---

# (B) As 15 armadilhas que mais pegam (resumo de §16 e §16.1)

1. **Nunca `setProjects`/`setPersonalBoard` direto** para editar dado existente: sempre `mutateProject(pid, updater, logMsg, activityId)` / `mutatePersonalBoard(updater)` (debounce, persistência, log e rollback embutidos).
2. **Campo novo em `projects.data`/`personal_boards.data` é só front**, com fallback (`campo || default`). Coluna relacional nova só se o pedido exigir (`server/db.js` é sensível).
3. **Uma fonte de verdade por dado derivado** (ex.: `cardStatusOf()` deriva de `card.completed`). Nunca gravar dois campos para o mesmo estado.
4. **Exclusão é sempre lógica** (`deleted/deletedAt/deletedBy` + filtro nas views + Lixeira). Item novo excluível segue o mesmo padrão. Exceção: linhas SQL de projeto/usuário.
5. **Modal que edita dado precisa da guarda de alterações não salvas** (`useDirtyForm` ou `useAutosaveTimestamp` + `ConfirmDiscardModal`, `requestClose()`). Não inventar terceiro padrão.
6. **Rota/consulta nova com `org_id`, `canAccessProject()`, `sameOrg()`**. O servidor é a fonte de verdade da autorização.
7. **Antes de remover/renomear chave de `S`, `grep`**: `style={undefined}` falha em silêncio.
8. **Mobile = chave nova `S.algoMobile`**; nunca sobrescrever a desktop nem media query sobre estilo inline.
9. **Toda tela nova injeta o `<style>` base** de `input/select/textarea` (tema) e declara **fonte Inter** na raiz (inclusive drawer/modal).
10. **Migração só aditiva** (`IF NOT EXISTS` em `initDb`), FK depois da referenciada, idempotente; trocar `CHECK` = derrubar a antiga antes de traduzir.
11. **Overlay global** e telas públicas: raiz React própria; `/quadro/:token` e `/reuniao/:token` nunca são reescritas por efeito de URL (os hooks de `App()` rodam antes do `return` que as desenha).
12. **Em `App()`, a ordem dos `if (...) return <Tela/>` importa**: só o primeiro gate que casar renderiza.
13. **IA com custo**: nada de chamada por usuário/visita (cache por dia/hash; "nada novo" = zero IA); falha degrada o cartão sem derrubar a tela; texto de IA rotulado.
14. **Datas**: dias de calendário no fuso local, nunca blocos de 24 h; "hoje" no servidor em `America/Sao_Paulo` (`todayInSp`), nunca o fuso do processo; testar data de borda antes de dizer "feito".
15. **Antes de dizer "feito"**: rastrear o dado até a tela, provar esperado × obtido; o que não foi testado (IA real, aparelho real, OAuth real) vai como "não testado" e na §15. Também: segredo só por hash/cifrado e nunca na URL; busca de URL do usuário passa pela validação de SSRF; arquivo de usuário com lista fechada de extensões.

---

# (C) Passo a passo: investigar um bug em produção

1. **Anotar a hora do relato em Brasília e converter para UTC (+3 h).** Ex.: "01:09" BRT = 04:09 UTC. Os logs do Railway e `date -u` estão em UTC. Relatar sempre "01:04 BRT (04:04 UTC)".
2. **Ler o log ANTES de qualquer novo deploy** (o deploy troca o container e os logs do antigo somem):
   ```bash
   node scripts/railway-logs.mjs "regex-do-erro" --limit 2000
   node scripts/railway-logs.mjs "Assistente|falh|erro" --deploy 0
   ```
   O script lê `RAILWAY_API_TOKEN` do `.env` (nunca imprimir o valor). O servidor **não loga requisições**: só boot, erros, `[erro REF]` e `[client-error]` (pilha traduzida para `src/…:linha` por `server/sourcemaps.js`). Procurar: `Unterminated string` (corte de IA), `[erro XXXXXX]`, `Pareceres: falha`, `Meu dia: falha`, reinício de boot no horário.
3. **Se a tela mostrou um código curto**, procurar `[erro <código>]` no log (vem de `apiErrorHandler`, `server/errorHandler.js`).
4. **Conferir se o relato bate com o código servido**: o bundle em `https://painel.pricetax.com.br/` (hash do `index-….js`) × o commit atual; lembrar do cache de aba antiga (classe 10).
5. **Ler o código** só da área (use `docs/PROJECT_MAP.md`, `docs/gerado/ROTAS.md`, `docs/gerado/BANCO.md`, `grep -n`; nunca abrir `src/App.jsx` inteiro).
6. **Reproduzir com teste descartável local**: servidor local e Postgres **local** (os scripts recusam banco remoto); usuários temporários; IA simulada com `ANTHROPIC_BASE_URL`; para concorrência usar duas abas/clientes reais; para arrasto/tela lenta, Chromium com `playwright-core` fora do projeto. Reproduzir o bug **antes** de corrigir.
7. **Corrigir a causa, não o sintoma** (retry não cura corte de `max_tokens`; try/catch não cura schema errado).
8. **Transformar a reprodução em teste fixo** em `scripts/` quando valer (padrão: `scripts/<tema>.test.mjs`, cabeçalho explicando o que prova), e conferir os testes vizinhos da classe (tabela de testes abaixo).
9. **Verificar**: `npm run build` limpo; `python3 scripts/scope-check.py`; `python3 scripts/ui-audit.py`; conferir no navegador e no Postgres (valor final, não só a tela).
10. **Documentar na mesma sessão**: nova seção em `PROJECT_CONTEXT.md` (sintoma, causa, correção, testado/**não testado**); atualizar `docs/PROJECT_MAP.md` se mudou arquivo; atualizar este catálogo se é classe nova; `npm run docs:gerar`.
11. **Deploy** (política vigente: commit + push sem pedir a cada vez): `git fetch` e checar divergência → `rsync -a --delete` (excluindo `.git`, `node_modules`, `dist`, `.sourcemaps`, `.env`, `.claude`) → `npm run build` → `git status --short` → `git add` **por caminho** → commit → `git push origin main`.
12. **Verificar em produção**: hash do bundle mudou; a rota nova responde 401/200 em JSON; log de boot limpo; repetir o cenário relatado (se precisar de dado real, dizer o que só o Rafael pode ver). Se o usuário já tinha a aba aberta, pedir para recarregar.
13. **Dizer honestamente** o que não pôde ser confirmado (ex.: IA real, aparelho real) e como o Rafael vai perceber se persistir (qual mensagem/log aparece).

---

## Testes por classe (onde estão e o que provam)

| Classe | Scripts (em `scripts/`) | O que NÃO provam |
|---|---|---|
| 1 Digitação | nenhum fixo (`scope-check.py` ajuda) | digitação real em Safari/Firefox |
| 2 Concorrência | `board-merge`, `board-conflict-http`, `save-retry`, `crm-board-move`, `crm-move-sim`, `gaps-http`, `project-versions-http`, `board-*-http`, `e2e/*` | dois usuários diferentes ao mesmo tempo; Safari; aparelho real |
| 3 IA | `parecer-study-truncation`, `connect-meetings-edit`, `knowledge-library`, `renata-limite-passos`, `renata-general-ids`, `error-messages`, `renata`, `renata-tools`, `chat-export` | a IA real (qualidade, custo, cabe em 16.000 tokens) |
| 4 Datas | `connect-meetings-edit` (`isISODay`) | `todayIso`, `todayInSp`, `calendarDaysSince`, `macro.js` (sem script) |
| 5 Permissões | `renata-parecer-orientacao`, `ops-intel-http`, `connect-scopes`, `connect-crm`, `views-dashboards`, `experience-http`, `project-versions-http` | todas as rotas (`docs/gerado/ROTAS.md` tem 317) |
| 6 Jobs órfãos | nenhum fixo | queda de deploy real |
| 7 Banco | `project-versions-http`, `piperun-migration`, `experience-http` | migração com dado antigo de produção |
| 8 Front/mobile | `scope-check.py`, `ui-audit.py`, `usage-metrics` (cálculos) | aparelho real, leitor de tela, zoom 200% |
| 9 Integrações | `crm-google-sync` (Google falso), `connect-transcripts` (IA falsa) | Google real, Receita real, Voyage real |
| 10 Deploy | nenhum | só se verifica em produção |
| 11 Documentação | `docs-gen.mjs` (gera `docs/gerado/`) | texto narrativo de `PROJECT_CONTEXT.md` |

Referência completa dos scripts: `docs/gerado/TESTES.md`.

---

## Receitas: "se o Rafael pedir X, faça Y"

| Pedido | Abrir (em ordem) | O que fazer / conferir |
|---|---|---|
| "O texto some quando escrevo" | classe 1; `src/App.jsx` `useDebouncedField` (l.234) e `reloadProjects` (l.1077) | achar o campo; se `onChange` chama `mutateProject` direto, usar o hook; se estiver em `.map()`, extrair a linha; testar digitando rápido e lendo o Postgres |
| "Uma tarefa sumiu / duas abas" | classe 2; `src/personal/boardMerge.js`, `server/routes.js` (`PATCH /api/personal-board`) | conferir `mergeable` + 409; rodar `board-conflict-http.test.mjs`; lembrar da aba antiga |
| "A RENATA deu erro de processamento" | classe 3; log do Railway; `server/assistantRetrieval.js` | ver `Unterminated string` → subir `max_tokens`/retry enxuto; senão chave/crédito; teste com IA falsa |
| "Quero um schema novo para a IA" | `server/meetingInbox.js` (exemplo achatado) | objeto achatado com `nullable()`, sem união; `max_tokens` folgado; repetir 1× se cortar; erro amigável |
| "A data está errada à noite" | classe 4; `server/widgetSummary.js` `todayInSp` | trocar `new Date()` local por `todayInSp()`; testar com instante fixo 02:21 UTC = 23:21 BRT |
| "Corrigir a Visão Geral à noite" | `server/macro.js` l.37 | usar `todayInSp` em `todayIso`/`rangeForQuery`; testar a virada |
| "Validar data no plano da API" | `server/connect.js` l.612, 643, 644, 657; `server/meetingEdit.js` `isISODay` | trocar pelo validador com ida-e-volta; teste de `2026-02-31` |
| "Cliente não pode ver X" | classe 5; a rota no servidor | filtrar no servidor (`org_id`, `canAccessProject`, `isStaff`) antes do prompt; escrever teste com 2 empresas |
| "Rodar algo longo em segundo plano" | classe 6; `server/meetingInbox.js` (modelo de status e recupero) | estado em tabela + `processed_at`, recupero de órfão, botão de nova tentativa |
| "Criar tabela/coluna nova" | classe 7; `server/db.js` (só se o pedido exigir) | `IF NOT EXISTS`, ordem das FKs, idempotente, testar com linha antiga, preencher em todos os caminhos |
| "Botão que não faz nada" | classe 8; `src/App.jsx` `CreateCompanyModal` (exemplo corrigido) | tirar `disabled` por validação; erro dentro do `submit()`; `ui-audit.py` |
| "Tela cortada no celular" | classe 8; `docs/RESPONSIVE_ARCHITECTURE.md`, `docs/AUDITORIA_MOBILE_FASE0.md` | medir 360/375/390; ver pai flex; `S.xMobile`; dizer que aparelho real não foi testado |
| "Fazer deploy" | classe 10; `PROJECT_CONTEXT.md` §3 | clone, `fetch`, `rsync`, build, `git status`, `git add` por caminho, push, verificar produção |
| "Encontrar o que quebrou agora" | seção (C) | hora BRT → UTC; `railway-logs.mjs`; antes do deploy |
| "Atualizar a documentação" | `CLAUDE.md` item 5; `docs/gerado/` | editar `PROJECT_CONTEXT.md`/`PROJECT_MAP.md`; `npm run docs:gerar`; corrigir a doc se o código mostrar outra coisa |

---

## Bugs e armadilhas conhecidos (índice rápido, sintoma → causa → onde → como não reintroduzir)

| Sintoma | Causa | Onde | Não reintroduzir |
|---|---|---|---|
| Drag entre colunas bloqueado fora de "Ordem manual" | `dragDisabled` desligava todo o arraste | §17 | `handleDragEnd` só ignora o drop com mesma coluna e `sortMode !== 'manual'` |
| Concluído com prioridade Urgente antes de ativo baixo | `sortCards()` ignorava `completed` | §17 | comparar `completed` primeiro |
| Concluir card não ia ao fim da coluna | `setCardStatus` só atualizava | §17 | remover e reinserir no fim na mesma mutação |
| Grupo criado sem nome | `createCompanyGroup` não desestruturava `groupName` | §17 | testar criando e olhando no `psql` |
| Seleção não reflete após criar grupo | `useState` lido só no mount | §17 | não sincronizar estado de tela montada |
| Comentário editado perdia quebras de linha | `<input>` em vez de `<textarea>` | §17 | edição usa o mesmo controle da criação |
| "Excluir atividade" cancelado não respeitado; subatividade excluída fora da Lixeira | wrappers sem soft-delete (do histórico de commits) | §17 | atenção ao fluxo de exclusão e à Lixeira |
| Tags do Tiptap sem `target`/`rel` | `allowedAttributes` do `sanitize-html` removia o que o `transformTags` forçava | §18 | testar XSS/atributos com curl |
| Contador "0 resultados" com texto destacado | contador incrementado durante o render | §26 | ler o contador em `useEffect` após o commit |
| Previsão do XFlow só no campo de data | gatilho cobria só a edição de data, não a atribuição depois | §21 | testar o fluxo mais comum, não só o literal do pedido |
| Fato editado continuava mostrando a versão antiga | `factId` do pai não atualizava com o id devolvido | §39 | `onFactChanged(newFactId)` |
| Data do Pareceres "18T01:08…/09/2026" | `fmtDate` em timestamp ISO | §48 | usar `fmtTs` para timestamp |
| Lightbox fechava o modal de baixo | faltou `stopPropagation` | §18 | overlay empilhado sempre para a propagação |
| Painel de Indicadores "Carregando…" para sempre | `apiGet` não põe `/api`; HTML com 200 | §65 | tratar resposta sem campo esperado como erro |
| Sessão `String(undefined)` passou na regex | validação fraca | §82 | validar `typeof` antes |
| Link público reescrito para `/` com usuário logado | efeito de URL rodando antes do `return` da tela pública | §74 | `/quadro/…` e `/reuniao/…` nunca tocados |
| Aba ativa do Quadro indistinta | contraste + `border` misturado com longhand | §53 | só propriedades longhand |
| Tela inicial "Hoje você já terminou" falsa | agenda vazia ≠ dia encerrado | §73 | só o fim do expediente decide |
| RENATA citava parecer de cliente em outra empresa | escopo não filtrado | §70 | `parecerUsableFor` antes do prompt |
| Item `pending` do lote órfão após reinício | recupero cobre só `processing` | §49 | limite conhecido; nova tentativa manual |
| Criar/revogar link público sem registro no Log | `companyShare.js` sem `addLog` (corrigido em 25/10) | §15 | gravar no Log sem o token |

---

## Não verificado / dúvidas
- Não rodei nenhum script de `scripts/` nesta redação (somente leitura): as descrições vêm do cabeçalho de `docs/gerado/TESTES.md` e de `PROJECT_CONTEXT.md`.
- Linhas citadas (`src/App.jsx` l.234, 494, 500, 1077, 1624, 1664; `server/routes.js` l.728; `server/connect.js` l.612; `server/macro.js` l.37; `server/db.js` l.916/950; `src/screens/PersonalBoard.jsx` l.575/622) foram conferidas em 2026-10-29; mudam rápido, prefira o nome da função.
- Algumas seções antigas de `PROJECT_CONTEXT.md` falam de `src/App.jsx` para código que hoje está em `src/screens/` (`SubactivityRow` em `src/screens/CompanyViews.jsx`; `PersonalColumn` em `src/screens/PersonalBoard.jsx`).
- A causa exata do "aparece e some" do §45 nunca foi 100% reproduzida (o texto do próprio §45 diz isso); a causa confirmada é a do §60.
- Causa exata do "não grava" da Eduarda (§119) no computador dela não foi confirmada; o que foi reproduzido e corrigido é lentidão + falta de retorno visual. Safari/Firefox não foram testados.
- Não verifiquei se a `RAILWAY_API_TOKEN` atual funciona (não executei o script).
- O estado atual de produção (se o estudo do parecer longo passou a funcionar depois do §116g; se `reuniao_ver` resolve a pergunta da KUHN) não foi visto: só o Rafael confirma.
