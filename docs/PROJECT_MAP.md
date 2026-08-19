# PROJECT_MAP.md — Índice técnico (PRICETAX Cronograma)

Mapa de localização, não documentação completa. Números de linha são
aproximados no momento da escrita (2026-08) — se o arquivo tiver sido editado
depois, confirme com `grep -n "nome_da_função" src/App.jsx` antes de usar
`Read` com `offset`. Fonte da verdade é sempre o código.

## 1. Arquitetura geral

- **Frontend**: SPA React 18 (Vite), sem roteador — navegação é 100% estado
  em memória (`view`, `workspaceMode`, `openActivityId`, etc. em `App()`).
  Quase todo o app (telas, modais, estilos) está em `src/App.jsx`. Exceção:
  o módulo XFlow (`src/xflow/XFlow.jsx`, ver seção 2 e 4) — importa primitivas
  compartilhadas (`S`, `uid`, `fmtDate`, `fmtTs`, `useIsMobile`,
  `useIsCompact`, `BrandLogo`, `ThemeToggleBtn`) exportadas de `App.jsx`.
- **Backend**: Express (`server/`), API REST sob `/api/*`. Rotas de usuários/
  projetos/etc. em `server/routes.js`; rotas do XFlow num router próprio,
  `server/xflow.js`, montado em `/api/xflow`. Serve também os estáticos de
  `dist/` e faz fallback de SPA (`app.get('*', ...)`).
- **Banco**: Postgres, driver `pg` puro (sem ORM/query builder). 6 tabelas —
  ver seção 6. Multi-tenant desde 2026-08 (Fase 1): `users`/`projects`/
  `xflow_tickets` têm `org_id` (FK pra `organizations`), toda query filtra
  por ele — ver CLAUDE.md seção "Multi-tenant".
- **APIs**: só a própria API interna (`server/routes.js`) + 2 APIs públicas de
  terceiros para lookup de CNPJ (BrasilAPI, fallback ReceitaWS), com cache em
  `cnpj_cache`.
- **Autenticação**: JWT em cookie httpOnly, ver `server/auth.js`.
- **Armazenamento de arquivos**: não há storage externo (S3 etc.) — anexos de
  atividade são salvos como **base64 inline dentro do JSONB** do projeto
  (`activity.attachments[].dataUrl`), limitados a 8MB por arquivo
  (`MAX_ATTACHMENT_BYTES` em `App.jsx`). Isso não escala bem — ver §9.
- **Processamento assíncrono / filas**: não existe. Tudo é request/response
  síncrono. Debounce de autosave é client-side (`setTimeout`), não é uma fila
  real.
- **Integrações externas**: BrasilAPI e ReceitaWS (consulta de CNPJ, com
  retry + timeout + cache de 60 dias em `server/cnpjLookup.js`).
- **Infra/deploy**: Railway, auto-deploy on push para `main` do repo GitHub
  `RAFAELSOUZA280292/Cronograma`. `npm run build` gera `dist/`, `npm start`
  serve tudo num único processo Node.

## 2. Estrutura de diretórios

```
src/App.jsx        Frontend principal: componentes, telas, estilos (S), lógica de estado. Exporta primitivas usadas por xflow/.
src/xflow/XFlow.jsx     Módulo XFlow (gestão de BUGs) — telas, constantes de status/severidade/prioridade, helpers.
src/main.jsx        Bootstrap do React (ReactDOM.createRoot).
src/lib/api.js        Wrapper fetch (apiGet/apiPost/apiPatch/apiDelete), credentials:'include'.
src/assets/brand/       Logos PNG da PRICETAX (preto = tema claro, branco = tema escuro).

server/index.js       Bootstrap Express: initDb, seedIfEmpty, monta /api e /api/xflow, serve dist/.
server/db.js           Pool pg, criação de tabelas (initDb), seed inicial, defaults de projeto novo.
server/auth.js         JWT/bcrypt, cookie de sessão, middlewares requireAuth/requireMaster*/requireXflowAccess.
server/routes.js        Rotas REST de auth, users, projects, personal-board, cnpj, organizations.
server/xflow.js         Rotas REST do módulo XFlow (team, tickets, events) — router próprio montado em /api/xflow.
server/xflowPermissions.js  Papel efetivo (reporter/dev/gestao/admin) + canDo() — matriz de "quem pode o quê" do XFlow.
server/xflowTransitions.js  Matriz de transições de status do XFlow — de onde cada ação pode partir e pra onde vai.
server/cnpjLookup.js     Cliente BrasilAPI/ReceitaWS + normalização + cache.

index.html            Shell HTML, variáveis CSS de tema (light/dark) em :root.
vite.config.js         Proxy /api -> localhost:3001 em dev.
```

Não há `server/routes/`, `server/models/`, `src/components/` — tudo é flat.

## 3. Índice de componentes (`src/App.jsx`)

Helpers/constantes de topo: linhas 1–307 (formatação de data, `STATUS_META`,
`PRIORITY_META`, `CARD_*_META`, `S` fica no fim do arquivo, ~L5121).

`App()` — componente raiz, **linha 307 a ~1759**. Contém todo o estado global
e todas as funções de mutação (ver §7 e §8 para os fluxos). Sub-blocos
principais dentro de `App()`:
- L307–360: estado (useState/useRef) — auth, projects, workspace, personal board, UI toggles.
- L360–470: efeitos de bootstrap (sessão, fetch de projetos/board, atalhos de teclado).
- ~L470–520: `handleLogin/handleLogout/updateMyAvatar`, persistência de board pessoal.
- ~L520–730: mutações de atividade/subatividade/comentário/link (`updateActivity` … `toggleParticipant`).
- ~L730–900: equipe, fases, upload de logo, empresa (create/clone/delete/update).
- ~L900–990: usuários (CRUD admin).
- ~L1090–1160: export Excel/PDF.
- ~L1290+: `return (...)` com o roteamento por estado (login → workspace gate → seleção de empresa → workspace).

Componentes de tela/modal (nome → linha → responsabilidade):

| Linha | Componente | Responsabilidade |
|---|---|---|
| 25 | `BrandLogo` | Logo PRICETAX, troca PNG conforme tema |
| 29 | `ThemeToggleBtn` | Botão sol/lua |
| 1760 | `LoadingScreen` | Tela de carregamento inicial |
| 1773 | `LoginGate` | Formulário de login |
| 2124 | `UsersManagementScreen` | Painel admin de usuários (master) |
| 2330/2380 | `NewUserModal` / `EditUserModal` | Criar/editar usuário — `NewUserModal` tem seletor "Organização (base)" visível só pra `isSuperAdmin` (2026-08, Fase 3) |
| 2501 | `MyProfileModal` | Avatar do usuário logado |
| 2531 | `CreateCompanyModal` | Cadastro de empresa (CNPJ lookup, clientType, clone) — mesmo seletor de organização visível só pra `isSuperAdmin` (2026-08, Fase 3) |
| 2792 | `EditCompanyModal` | Edição de empresa já criada |
| **2878** | **`CompanySelectorScreen`** | Tela "Quais empresas você quer acompanhar" — busca, seleção múltipla, filtros por Tipo/Status/Regime (2026-08), atalho p/ Gestão de Atividades |
| 2779 | `WorkspaceGateScreen` | Pós-login: escolher Empresas vs Gestão de Atividades |
| 2915–3577 | **Gestão de Atividades pessoal** (Kanban) | `ColorSwatchGrid`, `PriorityPicker`, `StatusPicker`, `TagEditor`, `PersonalColumnMenu`, `PersonalCardMenu`, `PersonalCard`, `PersonalColumn`, `PersonalCardDetailModal`, `PersonalListView`, `ReassignCardsModal`, `PersonalTrashPanel` |
| 3549 | `BoardShareModal` | Modal de visibilidade da página (Privado/Público por link, copiar/gerar link) |
| 3603 | `BoardActivityLogModal` | Painel de histórico do quadro — agrega `board.log` + `card.history` de todas as colunas |
| **3626** | **`PersonalBoardScreen`** | Tela raiz do quadro pessoal (tabs de páginas, dnd-kit, filtros, `publicMode`/`readOnly` props) |
| **4386** | **`PublicBoardScreen`** | Embed de UMA página via `/quadro/:token` — busca sessão opcional + `GET /api/public-board/:token`, decide `readOnly` por `canEdit` |
| 4480 | `SidePanel` | Painel lateral genérico (Log, Lixeira, Menções) |
| **4515** | **`ActivityDetailModal`** | Modal fullscreen de uma atividade (empresa) — descrição, subatividades, comentários, histórico |
| **4773** | **`TableView`** | View "Tabela" das atividades de empresa (drag reorder, quick-expand de subatividades) |
| 5251 | `PhasesView` | View "Fases" |
| 5381 | `KanbanView` | View "Quadro" (empresa, diferente do Kanban pessoal) |
| 5436 | `TimelineView` | View "Gantt" |
| 5589 | `const S = {...}` | Objeto de estilos inline (~380 linhas) |

### 3.1 Responsividade / mobile

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
- Tela: `LoginGate` (L1773). Fluxo completo em §7.
- API: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`.
- Modelo: tabela `users`.

### Empresas (Cronograma de Reforma Tributária)
- Telas: `CompanySelectorScreen` (L2488), `CreateCompanyModal` (L2155),
  `EditCompanyModal` (L2403), workspace principal dentro de `App()` (views
  Tabela/Fases/Quadro/Gantt).
- Componentes principais: `TableView`, `PhasesView`, `KanbanView`,
  `TimelineView`, `ActivityDetailModal`, `UsersManagementScreen`.
- APIs: `GET/POST/PATCH/DELETE /projects`, `GET /projects/:id/team-candidates`,
  `POST /cnpj/lookup`.
- Services: `server/cnpjLookup.js`.
- Modelo: tabela `projects` (JSONB) — `company`, `phases`, `activities`,
  `team`, `log`.
- Dependências: `xlsx` (export Excel), `window.print` (export PDF, sem lib).

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
  `XFLOW_BOARD_RESUME_RULES` (nunca seta status livre). Detalhe completo em
  `PROJECT_CONTEXT.md` §18.
- Acesso: card "XFlow" no `WorkspaceGateScreen`, visível só se
  `currentUser.xflowRole` (reporter/dev/gestao) — controlado em
  `NewUserModal`/`EditUserModal`. Papel efetivo (inclui `admin`) calculado em
  `effectiveXflowRole()`, duplicado em `server/xflowPermissions.js` e
  `src/xflow/XFlow.jsx`.
- APIs: `server/xflow.js` — `GET /xflow/team`, `GET /xflow/tickets`,
  `GET /xflow/tickets/:id/events`, `POST /xflow/tickets`,
  `PATCH /xflow/tickets/:id` (recebe `{action, payload}`, validado por
  `server/xflowPermissions.js` + `server/xflowTransitions.js` — não aceita
  mais o ticket inteiro solto). Montadas em `/api/xflow`, atrás de
  `requireXflowAccess`.
- Modelo: tabelas `xflow_tickets` + `xflow_events` (log estruturado da
  timeline). Detalhe completo do fluxo de estados, matriz de permissões/
  transições, tempo por status, SLA e "quem está com a bola" em
  `PROJECT_CONTEXT.md` §18.

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

EXPORTAÇÃO PDF
Usuário → botão "PDF" → exportPdf() em App() → window.print() com CSS @media print (classe .no-print oculta UI) → sem backend envolvido.

QUADRO PESSOAL — AUTOSAVE COM ROLLBACK
Usuário arrasta/edita card → mutatePersonalBoard() (update otimista) → persistPersonalBoardDebounced() → PATCH /personal-board → se falhar, reverte para lastGoodPersonalBoardRef e mostra "Falha ao salvar".
```

Não há upload de arquivo para storage externo, nem job assíncrono, nem fila —
anexos são base64 inline no PATCH do projeto (ver §9, ponto de atenção).

## 6. Banco de dados

| Tabela | Finalidade | Relacionamentos |
|---|---|---|
| `organizations` | Tenant/organização (2026-08). Colunas: `slug`, `name`, `display_name`, `logo_light/dark`, `favicon`, `primary_color`, `secondary_color`, `login_background`, `status` (active/suspended/blocked), `plan`, `max_users`, `max_companies`, `settings` JSONB | `users.org_id`/`projects.org_id` referenciam `organizations.id` |
| `users` | Conta de login, papel (master/pricetax/cliente), CNPJs liberados, `org_id`, `is_super_admin` | `personal_boards.user_id` referencia `users.id` (CASCADE); `org_id → organizations.id` |
| `projects` | 1 linha = 1 empresa/cronograma inteiro, tudo em `data JSONB` (company, phases, activities, team, log) + coluna relacional `org_id` | Vínculo com `users` é lógico via `company.cnpj` / `allowed_cnpjs`, não FK; `org_id → organizations.id` |
| `cnpj_cache` | Cache de 60 dias das respostas de lookup de CNPJ — **não** tem `org_id`, é compartilhado entre organizações de propósito | Nenhum |
| `personal_boards` | 1 linha por usuário, `data JSONB` = quadro Kanban pessoal — **não** tem `org_id` (sempre buscado por `user_id`; o scan de `shareToken` público é cross-org de propósito) | FK `user_id → users.id` |

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

- **Arquivo excessivamente grande**: `src/App.jsx` (5500 linhas, um único
  componente `App()` com ~50 funções internas e ~30 componentes no mesmo
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
- **README.md desatualizado**: ainda descreve a versão antiga (localStorage,
  sem backend/login real) — não reflete a arquitetura atual com Postgres/JWT
  descrita aqui. Não fixado nesta rodada (fora do escopo, é só documentação).
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
