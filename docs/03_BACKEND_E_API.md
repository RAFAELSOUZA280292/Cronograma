# Backend e API (como o servidor é organizado e como as rotas funcionam)

> Atualizado em 2026-10-29. Catálogo exato das rotas: `docs/gerado/ROTAS.md` (317 rotas). Este texto explica o **jeito** de todas elas.

## Em uma frase
O servidor é um Express 5 em Node ESM com **um arquivo por assunto**; cada arquivo exporta um `Router()` que o `server/index.js` monta num prefixo (`/api/crm`, `/api/xflow`…); as regras ficam em funções que a tela, a RENATA e a API de conectividade **reaproveitam**.

## Para quem é / quando ler (gatilhos)
- "Vou criar uma rota nova", "como a rota valida permissão?", "que erro devolve?", "como grava sem pisar em outra pessoa?", "como é um endpoint que demora (IA)?".
- **Palavras-chave:** `Router`, `requireAuth`, `requireMaster`, `canAccessProject`, `FOR UPDATE`, `409`, `dryRun`, `ref` (idempotência), `bump`/`limited` (limite), `apiErrorHandler`, `describeError`, `status` do job, `pxk_`, `Bearer`.

## Mapa rápido (o que cada arquivo-chave faz)

| Arquivo | O que faz |
|---|---|
| `server/index.js` | Sobe tudo: parsers, roteadores, 404 JSON, tratador de erro, estáticos, SPA, boot e agendadores |
| `server/auth.js` | Senha (bcrypt), JWT, cookie, `requireAuth`, `requireMaster`, `requireMasterOrPricetax`, `requireSuperAdmin`, `requireXflowAccess`, `rowToUser` |
| `server/permissions.js`, `xflowPermissions.js`, `crm/permissions.js` | Regras de "quem pode o quê" (ver `docs/04_SEGURANCA_E_TRAVAS.md`) |
| `server/routes.js` | Núcleo: auth, usuários, projetos (empresas), quadro pessoal, notificações, organizações |
| `server/db.js` | Pool do Postgres, `initDb` (esquema aditivo), seeds e migrações de dados |
| `server/errorHandler.js` | `describeError` (traduz erros do banco e do Express para português) + `apiErrorHandler` |
| `server/projectAudit.js` | "Quem alterou" (ator e origem) usado no Log e na auditoria |
| `server/connect.js` | API Bearer (`/api/connect`) para outras IAs — mesma regra, outra porta |
| `server/renata/` | RENATA operacional: chama a própria API por loopback |
| Demais `server/*.js` | Um assunto por arquivo (lista com a 1ª frase de cada: `docs/gerado/ARQUIVOS.md`) |

## O formato padrão de uma rota
```js
router.post('/algo/:id', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    // 1. validar entrada (tipo, tamanho, valores permitidos) → 400 com mensagem em português
    // 2. carregar o registro filtrando por org_id → 404 se não achar (nunca 403 que revele existência)
    // 3. conferir permissão do registro (ex.: canAccessProject) → 403/404
    // 4. gravar (transação + FOR UPDATE quando o dado é um documento JSON compartilhado)
    // 5. efeitos: Log da empresa, notificação, reindexar memória da RENATA, auditoria
    res.json({ ok: true /* + o dado novo */ });
  } catch (e) { next(e); }   // sempre next(e): o apiErrorHandler traduz o erro
});
```
Regras do formato:
- **Sempre `try/catch` com `next(e)`** (o tratador final devolve JSON em português; nunca deixe a rota lançar erro solto).
- Mensagens de erro **em português**, dizendo o que houve e o que fazer.
- `req.user` (preenchido por `requireAuth`) tem `id`, `role`, `orgId`, `companiesAccess`, `personalAccess`, `xflowRole`, `crmRole`, `isSuperAdmin`…
- Nunca confie em `org_id`/`userId` vindos do corpo: use `req.user.orgId` / `req.user.id`.

## Tipos de API (quem chama, como lê, como responde)

| Tipo | Exemplos | Como é a entrada | Como é a saída |
|---|---|---|---|
| **Leitura de lista** | `GET /api/projects`, `/api/crm/deals`, `/api/knowledge/...` | Filtros na query (`q`, `status`, `limit`, `offset`) | `{ lista, total }` ou array; o CRM pagina (`limit` ≤ 200 + `offset`) |
| **Leitura leve / "carimbo"** | `GET /api/projects/lite`, `/api/projects/versions`, `/api/personal-board/version` | Nada | Só ids e `updatedAt`: o front **pergunta de tempos em tempos** se algo mudou (poll de ~6 s; não há WebSocket) |
| **Leitura de detalhe** | `GET /api/crm/deals/:id`, `GET /api/pareceres/:id/file` | id na URL | Registro completo (o cronograma de uma empresa vem na **lista** `GET /api/projects`; não existe `GET /api/projects/:id`) |
| **Gravação de documento inteiro** | `PATCH /api/projects/:id`, `PATCH /api/personal-board` | O documento (ou parte) com carimbo de versão | Documento salvo ou **409** (conflito) — o front faz fusão de 3 vias no quadro |
| **Gravação por operações** | `POST /api/projects/:id/plan`, `PATCH …/meetings/:id` (conectividade) | Lista de operações (`ops`) | Resultado por operação + `undo` (como desfazer); `dryRun` mostra sem gravar; **tudo ou nada** |
| **Gravação em lote** | `crm_lote_*` (RENATA), importadores | Vários registros | Resumo; em massa grande: prévia primeiro |
| **Ação com estado** | transições do XFlow, ganhar/perder negócio, completar atividade | Nome da ação + dados | Registro atualizado + linha do tempo |
| **Trabalho demorado (assíncrono)** | `POST /api/meeting-inbox` (responde 202 + `submissionId`), `POST /api/pareceres/study`, `POST /api/assistant/dossier` | Dispara e responde **202** na hora | A tela **consulta o status** (`pending → processing → done/failed`) a cada alguns segundos |
| **Arquivo para baixar/abrir** | `…/export.xlsx` do CRM, PDF de parecer, anexos de Modelos/Biblioteca, levantamento `.xlsx` | Filtros | Binário com `Content-Disposition` (anexo ou inline) |
| **Público (sem login)** | `/api/public-company/:token`, `/d/…` | O segredo está na URL | Só o que foi publicado; `X-Robots-Tag: noindex` nas páginas |
| **Interna (RENATA)** | as mesmas rotas, por `127.0.0.1` com segredo do processo | Igual à tela | Igual à tela |

## Convenções de resposta e de erro

| Situação | Status | Corpo |
|---|---|---|
| Sucesso | 200 (ou 201 criado, 202 aceito para trabalho em segundo plano) | JSON |
| Dado inválido | 400 | `{ "message": "…" }` (`errors: [...]` quando são várias) |
| Sem login / sessão vencida | 401 | `Sessão inválida. Faça login novamente.` |
| Sem permissão | 403 | `{ "message": "…" }` |
| Não existe **ou não é da sua base** | 404 | `{ "message": "…" }` |
| Conflito (duplicado, outra pessoa editou, vínculo) | 409 | `{ "message": "…" }` (o CRM devolve a lista de duplicados em `data`) |
| Corpo grande demais | 413 | `O conteúdo enviado é grande demais…` |
| Limite de uso | 429 | `Muitas requisições…` |
| IA não configurada / banco indisponível | 503 | mensagem + o que fazer |
| Erro inesperado | 500 | `{ "message": "… (código XXXXXX)", "ref": "XXXXXX" }` — o mesmo código está no log do servidor |
| Rota `/api/...` que não existe | 404 | `{ "message": "Rota não encontrada." }` |

`describeError` (`server/errorHandler.js`) já traduz: `entity.too.large`→413, JSON quebrado→400, `23505` (duplicado)→409, `23503` (vínculo)→409, `23502` (campo obrigatório)→400, `22P02`/datas inválidas→400, timeout de consulta `57014`→503, banco fora→503. **Só 5xx entra no log** (`[erro REF] MÉTODO caminho user=… → status`).

## Como o servidor evita perder ou pisar em dados
1. **Transação com `FOR UPDATE`** quando vários usuários mexem no mesmo documento (`projects.data`, quadro, funis, itens do CRM, XFlow). Existem em: `routes.js`, `connect.js`, `xflow.js`, `crm/*`, `standardPlanApi.js`, `taskLinkBackfill.js`, `inventoryEdit.js`, `gaps.js`, `projectVersions.js`, `companyShare.js`, `renata/tools/*`.
2. **Carimbo de versão e 409** no quadro pessoal (duas abas): a última gravação não apaga a outra; o front funde.
3. **Exclusão lógica**: dentro dos JSONs, `deleted: true`; nas tabelas, colunas `deleted_at`. Quase nada some de verdade (as exceções são explícitas, como "excluir empresa de vez", que exige digitar o nome).
4. **Versionamento do cronograma**: gatilho do banco grava `project_versions` a cada mudança de atividades/fases/equipe (não cobre reuniões; reuniões corrigidas por API têm `meeting_edits`).
5. **Idempotência**: criações por API aceitam `ref` (repetir devolve o mesmo registro) e envios de transcrição repetidos (mesmo texto) não são processados duas vezes.
6. **Tudo ou nada**: operações em lote validam todas antes de gravar; qualquer erro → nada gravado.

## Limites de uso que existem hoje (conferidos no código)
| Onde | Limite | Arquivo |
|---|---|---|
| Qualquer chave `pxk_` | 120 requisições/min por chave | `server/connect.js` (`MAX_PER_WINDOW`) |
| Criar atividade por chave | 60/hora; transcrições 30/hora; correções de reunião 200/hora | `server/connect.js` |
| RENATA operacional | 40 pedidos a cada 10 min por pessoa; no máx. 10 passos de ferramenta por pedido | `server/renata/routes.js`, `agent.js` |
| Widget do iPhone | 30/min por IP | `server/widget.js` |
| Link público | 90/min por IP | `server/companyShare.js` |
| Corpo JSON | 15 MB (45 MB em `/api/templates`) | `server/index.js` |
| Login | **não há limite de tentativas** no código lido (só registro `login_failed` em `accessLog`) — ver achados em `docs/04_SEGURANCA_E_TRAVAS.md` | `server/routes.js` |

## Esquema do banco e migrações
- `initDb()` roda **a cada subida**; só usa `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. **Nunca** apagar/renomear coluna em produção sem decisão explícita do Rafael.
- Módulos com esquema próprio: `server/crm/bootstrap.js`, `server/renata/schema.js`, `server/meetingEditsSchema.js`, `server/projectVersionsSchema.js`.
- Campo novo **relacional** (que precisa de filtro/índice) = coluna nova (exige pedido explícito: `server/db.js` é sensível). Campo novo **flexível** = dentro do JSON (`projects.data`, `context`, `preferences`).
- Tabelas, colunas, travas (FK/único/CHECK), índices e gatilhos: `docs/gerado/BANCO.md`.

## Efeitos colaterais comuns de uma gravação (gatilhos)
| Quando… | …acontece |
|---|---|
| Altera atividades/fases/equipe de uma empresa | versão automática em `project_versions` (gatilho no banco) |
| Altera reunião ou tarefa de reunião | Log da empresa; `memoryIngest` reindexa a memória da RENATA (`syncProjectMemoryFromDiff`); notificações de tarefa (`todoNotifications`) |
| Processa transcrição | cria reunião → memória → sugestão de pareceres (`generateMeetingAdvice`) → vínculo tarefa→atividade sugerido |
| Move negócio no CRM | histórico de etapa + linha do tempo + auditoria; cadência cria atividades |
| Usa chave de API para gravar | linha em `api_token_actions` e ator "Claude Code (por …)" |
| RENATA executa ferramenta | linha em `renata_actions` (antes/depois, desfazer) |

## Como testar uma rota
- Local: servidor próprio (`PORT=3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev JWT_SECRET=teste-local node server/index.js`) + Postgres local; usuários temporários na organização `sandbox-edu`; `fetch` real. Exemplos prontos: `scripts/connect-*.test.mjs`, `scripts/renata*.test.mjs` (lista em `docs/gerado/TESTES.md`).
- Regra do projeto: **sem test runner**; a prova é `npm run build` limpo + teste descartável com HTTP real. O que não deu para testar (IA real, aparelho real, OAuth real) deve ser dito como **não testado** e entrar em `PROJECT_CONTEXT.md` §15.

## Receitas rápidas
| Pedido | Faça |
|---|---|
| "Nova rota para X" | `docs/06_MANUAL_DO_DESENVOLVEDOR.md` receita 1 |
| "Essa rota precisa de permissão Y" | escolha o `require…` certo; se for regra nova, funções em `server/permissions.js`; teste com usuário sem a permissão |
| "A rota demora" | trabalho de IA ou pesado → 202 + status; nunca segure a requisição por minutos |
| "Preciso mudar a mensagem de erro" | no `throw`/`res.status().json()` da rota; erros do banco: `describeError` |
| "Preciso gravar sem perder o que outra pessoa fez" | transação + `FOR UPDATE` (copie o padrão de `server/connect.js` rota `/plan`) |

## Não verificado / dúvidas
- Não percorri rota por rota: a coluna "Proteção" de `docs/gerado/ROTAS.md` mostra só o que está na linha da rota; proteção em `router.use` está no título do grupo. Para uma rota crítica, **abra o arquivo**.
- Comentários da coluna "Para que serve" podem estar cortados (são lidos das linhas acima da rota).
