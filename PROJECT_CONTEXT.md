# PROJECT_CONTEXT.md — Memória técnica oficial (PRICETAX Cronograma)

> **Leia este arquivo primeiro, antes de qualquer exploração.** Ele existe pra
> evitar reanalisar o projeto do zero a cada sessão. Para localizar código por
> linha, use `docs/PROJECT_MAP.md`. Para regras de trabalho/padrões de código,
> use `CLAUDE.md`. Este arquivo é o resumo executivo — arquitetura, infra,
> banco, regras de negócio, decisões e pendências, num só lugar.
>
> **Mantenha atualizado**: toda alteração relevante (nova tabela/coluna, nova
> integração, mudança de regra de negócio, decisão técnica, item resolvido do
> roadmap) deve ser refletida aqui na mesma sessão.

Última validação completa: 2026-08-18 (XFlow v2 — auditoria funcional do v1
encontrou que toda regra de negócio vivia só na interface; v2 adicionou
autorização real e matriz de transições no backend, tempo por status, SLA
com pausa, log de eventos estruturado e as três Homes por papel — planejado
e testado ao vivo em Postgres local + `curl` direto na API nesta sessão;
2 bugs reais encontrados e corrigidos durante os testes — ver §18).

## 1. O que é

App de gestão de cronograma de reforma tributária para clientes da PRICETAX
(views Tabela/Fases/Quadro/Gantt por empresa) + módulo separado "Gestão de
Atividades" (quadro Kanban pessoal, não vinculado a nenhuma empresa).
Multi-tenant desde 2026-08: várias organizações («bases») no mesmo app/banco/
domínio, isolamento lógico por `org_id`.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite, SPA sem roteador. **Um único arquivo** `src/App.jsx` (~6970 linhas) |
| Backend | Express (Node ESM, `"type": "module"`), API REST em `/api/*` |
| Banco | Postgres via `pg` puro, **sem ORM**, sem migrations formais |
| Auth | JWT em cookie httpOnly + bcrypt |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` (só na Gestão de Atividades) |
| Export | `xlsx` (Excel), `window.print()` (PDF, sem lib) |
| Ícones | `lucide-react` |
| Rich text (só XFlow → Descrição) | `contentEditable` + `execCommand` (sem lib de editor); sanitização com `dompurify` (frontend) + `sanitize-html` (backend) |
| Deploy | Railway, auto-build/deploy a cada push em `main` |

Sem test runner, sem linter configurado (`package.json` não tem `test`/`lint`).
Verificação = `npm run build` limpo + teste manual no browser.

## 3. Repositório e deploy

- **GitHub**: `RAFAELSOUZA280292/Cronograma` (público), branch padrão `main`.
- **⚠️ O diretório de trabalho local NÃO é um repo git.** Deploy é feito
  clonando o repo num diretório temporário (scratchpad), fazendo `rsync` do
  working dir pra lá (excluindo `.git/node_modules/dist/.env/.claude`),
  `npm run build` limpo, commit, e **só então** `git push origin main` —
  sempre com confirmação explícita do usuário antes do push (Railway builda e
  publica automaticamente). Depois, apagar o clone temporário.
- **Railway**: sem `railway.json`/`Procfile`/`nixpacks.toml` — detecção
  automática via `package.json` (`npm install` → `npm run build` → `npm start`,
  que serve `dist/` + API no mesmo processo Node, porta via `$PORT`).
- **Comandos locais**:
  ```bash
  npm run dev       # vite + node --watch server/index.js, :5173 (proxy /api -> :3001)
  npm run build     # vite build -> dist/
  npm run preview   # serve dist/ localmente
  npm start         # produção: node server/index.js
  ```

## 4. Variáveis de ambiente

Fonte da verdade: `.env` local (não commitado, `.gitignore`) + Railway env vars.

| Variável | Uso | Obrigatória |
|---|---|---|
| `DATABASE_URL` | Conexão Postgres (`server/db.js`). SSL desativado só se contém `localhost` | Sim |
| `JWT_SECRET` | Assinatura do token de sessão (`server/auth.js`) | Sim (lança erro se ausente) |
| `SEED_ADMIN_USERNAME` | Username do admin inicial + vira `is_super_admin=true` (`migrateToPricetaxOrg`) | Sim (senão nenhum admin é criado) |
| `SEED_ADMIN_PASSWORD` | Senha do admin inicial (só no primeiro boot, banco vazio) | Sim (idem) |
| `SEED_ADMIN_NAME` | Nome de exibição do admin seed | Não (default "Administrador PRICETAX") |
| `PORT` | Porta do Express | Não (default 3001) |
| `NODE_ENV` | Só usado para `cookie.secure` (`=== 'production'`) | Não |

Local: `set -a && source .env && set +a` antes de rodar, ou script wrapper com
`export VAR="..."` (sandbox bloqueia `source .env` em alguns ambientes).

## 5. Banco de dados (Postgres, 7 tabelas, sem ORM)

`initDb()` roda `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT
EXISTS` a cada boot (idempotente, sem migration tool). `migrateToPricetaxOrg()`
roda logo depois, também todo boot.

| Tabela | Colunas-chave | Observação |
|---|---|---|
| `organizations` | `id, slug, name, display_name, logo_light/dark, favicon, primary_color, secondary_color, login_background, status(active/suspended/blocked), plan, max_users, max_companies, settings JSONB` | `status`/`plan`/limites existem no schema mas **não são aplicados** ainda (roadmap) |
| `users` | `id, username, password_hash, name, email, role(master/pricetax/cliente), cnpj, allowed_cnpjs JSONB, blocked, block_reason, expires_at, avatar, personal_only, org_id FK, is_super_admin, xflow_role('' / reporter / dev / gestao), companies_access, all_companies_access, personal_access` | `cnpj`/`personal_only` mortas (não lidas/escritas) desde os "3 acessos independentes" (§13) — ver §7 |
| `projects` | `id, data JSONB(company/phases/activities/team/log), org_id FK` | 1 linha = 1 empresa/cronograma inteiro; **schemaless** dentro de `data` |
| `cnpj_cache` | `cnpj PK, data JSONB, fetched_at` | Cache de 60 dias; **sem** `org_id` de propósito (dado público compartilhado) |
| `personal_boards` | `user_id PK/FK CASCADE, data JSONB(boards[].columns[].cards[], lastCompletedArchiveAt), updated_at` | 1 linha por usuário; **sem** `org_id` (sempre por `user_id`; scan de `shareToken` público é cross-org de propósito) |
| `xflow_tickets` | `id, ticket_number SERIAL, org_id FK, title, status, severity, priority, suggested_priority, product, reporter_id FK, assignee_id FK, data JSONB, created_at, updated_at, status_entered_at, time_breakdown JSONB, ball_holder_type/user_id, waiting_on_type, reopen_count, homolog_reject_count, sla_first_response_due_at/met_at, sla_resolution_due_at/met_at, sla_paused_at, sla_paused_seconds` | 1 linha = 1 BUG/ticket do módulo XFlow (§18); `status` **sem** `CHECK` de propósito (lista evolui sem migration) |
| `xflow_events` | `id, ticket_id FK CASCADE, org_id FK, type, field, old_value, new_value, note, user_id FK, created_at` | Log estruturado de toda ação do XFlow — fonte de verdade da timeline (§18), substitui o `data.history[]` de texto livre da v1 (mantido só como fallback de leitura pra tickets antigos) |

**Regra de ouro**: `projects.data` e `personal_boards.data` são JSONB sem
whitelist no backend (`PATCH` aceita o objeto inteiro) → **campo novo em uma
feature = só editar o frontend**, nunca precisa migration. Sempre acessar com
fallback (`campo || default`). Mudança de **schema relacional** (coluna nova
fora do JSONB) é rara/sensível — só fazer se pedido explicitamente.

## 6. Integrações externas

| Serviço | Uso | Detalhes |
|---|---|---|
| BrasilAPI (`brasilapi.com.br/api/cnpj/v1/`) | Lookup de CNPJ (fonte primária) | timeout 15s, `server/cnpjLookup.js` |
| ReceitaWS (`receitaws.com.br/v1/cnpj/`) | Fallback se BrasilAPI falhar | timeout 15s |
| — | Cache local | `cnpj_cache`, 60 dias, evita round-trip repetido |

Nenhuma outra API externa. Sem storage externo (S3 etc.) — anexos de
atividade são base64 inline em `activity.attachments[].dataUrl` (limite 8MB/
arquivo, ver §14). `avatar` do usuário **não** é imagem — é 1 emoji de uma
lista fixa (`AVATAR_EMOJIS`, `src/App.jsx`), validado no backend como string
≤16 chars (`PATCH /auth/me`).

**Sem workers/jobs/filas — nenhum agendador real existe no servidor.** O
único comportamento "agendado" do sistema é 100% client-side: o
arquivamento semanal de cards concluídos na Gestão de Atividades roda dentro
de um `useEffect` de `PersonalBoardScreen`, disparado quando a tela carrega
(compara `board.lastCompletedArchiveAt` contra a segunda-feira mais recente).
**Se o usuário nunca abrir essa tela, o arquivamento nunca roda** — não há
cron/worker no backend garantindo isso. Debounce de autosave também é
`setTimeout` no cliente, não fila real.

Link público de quadro (`shareToken`) é resolvido varrendo **todas** as
linhas de `personal_boards` a cada request (`findBoardByShareToken` em
`server/routes.js`) — decisão consciente, documentada no próprio código:
não escala para milhares de usuários, mas evita criar índice/rota dedicada
para um caso de uso raro (poucas dezenas de usuários hoje).

## 7. Autenticação e autorização

- JWT em cookie httpOnly (`cronograma_token`, 7 dias) + bcrypt. JWT carrega só
  `sub` (id do usuário) — `role`/`orgId`/`isSuperAdmin` são sempre lidos
  frescos do banco a cada request (nunca ficam "presos" no token).
- Middlewares (`server/auth.js`): `requireAuth`, `optionalAuth` (usado na rota
  pública de board), `requireMaster`, `requireMasterOrPricetax`,
  `requireSuperAdmin`.
- 3 papéis: `master` (admin completo, escopado à própria org), `pricetax`,
  `cliente`. **Desde os "3 acessos independentes" (2026-08, ver §13)**, o
  papel só decide permissão administrativa (quem gerencia usuários,
  cadastra empresa nova, vê Fases/Log/Lixeira — `requireMaster`/
  `requireMasterOrPricetax` e os `role==='master'||role==='pricetax'`
  espalhados em `App.jsx`, tudo inalterado). **Não decide mais
  visibilidade de empresa** — isso vem 100% de `companies_access`/
  `all_companies_access`/`allowed_cnpjs`, independente do papel.
  `is_super_admin`: só o usuário seed inicial, cross-org total.
- `canAccessProject()`/`sameOrg()` (`server/routes.js`) checam `org_id`
  **no SQL**, não só em JS — acesso cross-org por ID direto retorna 404/403
  mesmo sabendo o ID exato. `canAccessProject()` não olha mais `role`:
  `!companiesAccess` → nada; `allCompaniesAccess` → tudo da org; senão,
  `allowedCnpjs.includes(cnpj)`.
- **Expiração é preguiçosa (lazy)**: `expires_at` só é checado dentro de
  `POST /auth/login` — se vencido, o usuário é bloqueado (`blocked=true,
  block_reason='Acesso expirado'`) **naquele momento**, não antes. Um usuário
  vencido que não tenta logar continua aparecendo como "não bloqueado" na
  lista de usuários até a próxima tentativa de login dele.
- Guardas em `DELETE/PATCH /users/:id` e `POST /users/:id/block`: ninguém
  pode bloquear/excluir a si mesmo; excluir o último `role='master'` **da
  mesma org** é bloqueado (`COUNT(*) <= 1`). Super Admin ignora o filtro de
  org nesses updates via `sameOrg()` (retorna `true` se `isSuperAdmin`).
- `POST /projects` (criar empresa): se quem cria tem `companiesAccess` mas
  não `allCompaniesAccess` (lista específica, não papel), o CNPJ da empresa
  criada é **automaticamente adicionado** ao `allowedCnpjs` de quem criou —
  não precisa de passo manual de liberação depois.
- `GET /users`/`GET /projects` quando `isSuperAdmin && !?asOrg` (nenhuma org
  selecionada): retornam **todos os registros de todas as organizações sem
  filtro nenhum**. Isso só é seguro porque só o `SuperAdminScreen` (tela de
  "Organizações") chama essas rotas nesse estado — qualquer nova tela que
  reusar essas rotas precisa lembrar dessa exceção.

## 8. Superfície de API (`/api/*`, `server/routes.js`)

| Rota | Auth | Notas |
|---|---|---|
| POST/GET/DELETE `/auth/login,me,logout` | login público / demais `requireAuth` | `PATCH /auth/me` troca avatar |
| GET/POST/PATCH/DELETE `/users`, `/users/:id/block,renew,reset-password` | `requireMaster` | guarda contra remover último admin |
| GET/POST/PATCH/DELETE `/projects` | `requireAuth` + `canAccessProject` | `PATCH` recebe o projeto **inteiro** (autosave) |
| GET `/projects/:id/team-candidates` | `requireAuth` | usuários elegíveis como responsável |
| POST `/cnpj/lookup` | `requireMasterOrPricetax` | cache → BrasilAPI → ReceitaWS |
| GET/PATCH `/personal-board` | `requireAuth` | quadro pessoal do usuário logado |
| GET `/public-board/:token` | `optionalAuth` | única rota sem auth obrigatória do app |
| PATCH `/public-board/:token` | `requireAuth` | qualquer logado — token é a autorização, sem checar dono |
| GET/POST/PATCH `/organizations`, `/organizations/:id` | `requireSuperAdmin` | painel Super Admin |
| GET `/xflow/team` | `requireXflowAccess` | lista usuários da org com `xflow_role` não vazio (nomes p/ atribuir/mencionar) |
| GET `/xflow/tickets` | `requireXflowAccess` | reporter só recebe os próprios (`WHERE reporter_id=$user`); dev/gestão/admin recebem todos os da org |
| GET `/xflow/tickets/:id/events` | `requireXflowAccess` | log estruturado de um ticket (timeline) |
| POST `/xflow/tickets` | `requireXflowAccess` | `reporter_id` sempre `req.user.id`; status sempre `aberta`, ignora o que o cliente mandar |
| PATCH `/xflow/tickets/:id` | `requireXflowAccess` + `xflowPermissions.canDo()` + `xflowTransitions.checkTransition()` | router próprio `server/xflow.js`, montado em `/api/xflow`; recebe `{action, payload}` (não mais o ticket inteiro) — toda ação valida papel e transição de status antes de gravar, 403/400 reais |

`GET/POST /projects` e `/users` aceitam `?asOrg=<id>` — só respeitado se
`isSuperAdmin` (`effectiveOrgId()`), é como o Super Admin "entra" numa org.

## 9. Arquitetura do frontend (`src/App.jsx`, ~6970 linhas)

Um único componente `App()` (~1450 linhas) com todo o estado
(`useState`/`useEffect`), sem Redux/Context/roteador — navegação é 100% estado
em memória. ~30 componentes de tela/modal no mesmo arquivo. **Mapa completo
com números de linha**: `docs/PROJECT_MAP.md` (não duplicar aqui — linhas
mudam a cada edição, o mapa lá é a fonte viva).

Decisões estruturais fixas:
- **CSS via objeto `S`** (~380 linhas, inline styles); hover/focus via
  `className` + `<style>` scoped quando não dá pra fazer inline.
- **Tema claro/escuro**: variáveis CSS em `index.html` `:root`, trocadas via
  `data-theme` no `<html>`. Toda tela nova precisa injetar seu próprio
  `<style>` base pra `input/select/textarea` (senão fica sem estilo).
- **Mobile**: hooks `useIsMobile()` (<768px) / `useIsCompact()` (<1024px) +
  chaves `S.algoMobile` condicionais — nunca media query sobrescrevendo
  inline. Detalhes: `docs/RESPONSIVE_ARCHITECTURE.md`.
- **Mutação de estado sempre via função central**: `mutateProject(pid,
  updater, logMsg, activityId)` para tudo de empresa/atividade;
  `mutatePersonalBoard(updater)` para o quadro pessoal. Ambas já fazem
  debounce + persistência + rollback em falha de rede. Nunca `setProjects`/
  `setPersonalBoard` direto pra editar dado existente.
- **Uma única fonte de verdade por dado derivado** (ex.: `cardStatusOf()`
  deriva status de `card.completed` — nunca escrever dois campos que
  representam a mesma coisa de forma independente).
- **Soft delete + Lixeira**: nada é `DELETE` real a nível de item (atividade,
  subatividade, card pessoal) — flags `deleted/deletedAt/deletedBy`, filtradas
  nas views, restauráveis. Exceção: linhas de tabela SQL (projetos, usuários)
  têm `DELETE` real.
- **Rota pública sem roteador de verdade**: `/quadro/:token` é detectada por
  regex direto em `window.location.pathname`
  (`/^\/quadro\/([A-Za-z0-9_-]+)/`) **dentro do corpo de `App()`, antes de
  qualquer gate de sessão** (`sessionChecked`/`currentUser`) — por isso
  funciona sem login. Não existe React Router nem qualquer lib de rota; é a
  única exceção a "navegação 100% por estado em memória".
- **Exceção ao arquivo único**: `src/xflow/XFlow.jsx` (módulo XFlow, §18) é o
  primeiro pedaço de frontend fora de `App.jsx` — decisão deliberada porque
  XFlow não compartilha lógica de mutação com Empresas/Gestão de Atividades.
  `App.jsx` exporta primitivas compartilhadas (`S`, `uid`, `fmtDate`, `fmtTs`,
  `useIsMobile`, `useIsCompact`, `BrandLogo`, `ThemeToggleBtn`) que
  `XFlow.jsx` importa de volta — import circular entre os dois arquivos,
  seguro porque nenhum dos dois lê essas bindings no top-level do módulo
  (só dentro de corpos de função/componente, depois de ambos carregados).

## 10. Fluxos principais

```
LOGIN
LoginGate → POST /auth/login (bcrypt + JWT) → cookie → GET /auth/me → WorkspaceGateScreen

CRIAÇÃO DE EMPRESA
CreateCompanyModal → POST /cnpj/lookup (cache→BrasilAPI→ReceitaWS) → POST /projects → CompanySelectorScreen

AUTOSAVE (empresa)
Edita campo → mutateProject() (estado local + debounce) → PATCH /projects/:id (payload = projeto INTEIRO)

AUTOSAVE (quadro pessoal, com rollback)
Edita/arrasta card → mutatePersonalBoard() (update otimista) → PATCH /personal-board (payload INTEIRO)
  → falha? reverte pro último estado bom + toast de erro

LIXEIRA
delete*() seta deleted/deletedAt/deletedBy → some da view → SidePanel "Lixeira" → restore*() limpa flags
(exceção: projeto/usuário = DELETE SQL real)

EXPORT Excel (planilha de trabalho) / PDF (relatório executivo — ver §13)
100% client-side (lib xlsx / window.print()), sem round-trip ao backend

QUADRO PÚBLICO (link compartilhável)
/quadro/:shareToken → única rota sem requireAuth → visitante sem sessão só visualiza;
logado (dono ou não) colabora via PATCH /public-board/:token (token = autorização)
```

## 11. Multi-tenant (2026-08, Fases 1-3 concluídas)

Isolamento lógico por `org_id` no mesmo banco (não bancos físicos separados —
decisão explícita). **Sem** roteamento/URL/branding por organização — tudo
dentro do login único da PRICETAX, marca nunca ocultada (decisão explícita,
rejeitada a ideia de white-label `/o/:slug/login`).

- **Fase 1**: `org_id` em `users`/`projects`, migração automática pro tenant
  `pricetax` no boot (idempotente), toda query filtrada por `org_id` no SQL.
- **Fase 2**: `SuperAdminScreen` (lista/cria/status de orgs), `enterOrganization()`
  seta `actingOrg` → chamadas passam `?asOrg=`.
- **Fase 3**: seletor "Organização (base)" direto em `NewUserModal`/
  `CreateCompanyModal` (cobre criar E clonar empresa) — Super Admin atribui
  org sem precisar "Entrar" nela antes; recurso cross-org não entra no estado
  local (evitaria inconsistência de lista filtrada), `window.alert()` avisa
  onde caiu.
- **Fluxo de entrada Super Admin**: "Empresas" no `WorkspaceGateScreen` passa
  primeiro por `SuperAdminScreen` (seletor de org obrigatório) antes de
  `CompanySelectorScreen`. Usuário comum não é afetado.
- **Não implementado** (roadmap): enforcement de `status` suspensa/bloqueada,
  planos/limites/cobrança — colunas de schema já existem, nada lê/aplica.

## 12. Grupo Empresarial (2026-08)

Segunda camada de estrutura, **dentro** de uma organização: um CNPJ Master +
várias empresas filhas do mesmo grupo econômico, com visão consolidada no
Master. Reaproveita 100% a infraestrutura de multi-seleção que já existia
(`selectedProjectIds`, `isMulti`, `multiActivities` — ver §9/§10) — nenhuma
tabela nova, nenhuma rota nova.

**Modelo de dados (tudo em `company`/`activity`, JSONB, zero migration)**:
- `company.structureType`: `'individual' | 'grupo'` (fallback `|| 'individual'`).
- `company.isGroupMaster: boolean` — só `true` no projeto Master.
- `company.groupId: string` — só nas **filhas**, aponta pro `id` do projeto
  Master. O Master **não** tem `groupId` setado nele mesmo (evita round-trip
  de PATCH pra auto-referenciar um id que só existe depois do INSERT).
  Helper `groupRootId(company, ownId)` (topo do `App.jsx`) resolve a raiz do
  grupo pra qualquer membro (Master ou filha) de forma uniforme;
  `groupMembers(projects, rootId)` retorna todos os membros.
- `company.groupName: string` — nome de exibição do grupo, só no Master.
- `activity.groupActivityId: string` (`uid('gact')`) — presente só quando a
  atividade nasceu vinculada a várias/todas as empresas do grupo. Mesmo
  valor em todas as cópias irmãs.
- `activity.groupScopeType: 'multi' | 'all'` — gravado uma vez na criação,
  usado só pro selo "Grupo inteiro"/"Várias empresas" (não recalculado).

**Atividade de grupo = cópia por empresa, não entidade compartilhada.**
Criar uma atividade "Várias empresas"/"Todas as empresas do grupo"
(`addGroupActivity()`) gera uma cópia independente em cada projeto-alvo,
todas com o mesmo `groupActivityId`. Ao editar `title/desc/date/endDate/
durationDays/phase/required` de uma cópia, `updateActivity()` propaga o
mesmo patch pras cópias irmãs (busca por `groupActivityId` nos projetos que
compartilham o mesmo grupo). `status/responsible/participants/priority/
subactivities/comments/attachments/links/histórico` **não** propagam — cada
empresa mantém esses dados 100% independentes, por decisão explícita
(reflete "cada empresa mantém seus próprios dados e análises").

**Fluxos principais**:
- Criar grupo do zero: `CreateCompanyModal` ganha passo "Tipo de estrutura"
  (Individual/Grupo) + sub-formulário de filhas (CNPJ + lookup cada uma);
  `createCompanyGroup()` em `App()` chama `createCompany()` em loop (Master
  primeiro, filhas depois com `groupId=masterId`) — não duplica a lógica de
  POST. Ao criar um grupo pela tela de seleção de empresas (`CompanySelectorScreen`),
  `handleCreateCompanyPayload()` também chama `setCompanySelectionConfirmed(true)`
  explicitamente — necessário porque o `Set` local de seleção da tela **não
  resincroniza sozinho** depois do mount (ver bug em §17).
- Converter depois: `EditCompanyModal` ganha seção "Estrutura" — empresa
  individual pode "Transformar em Grupo (Master)" ou "Vincular como filial
  de um grupo existente"; filha pode "Desvincular do grupo". Crescimento do
  grupo depois de criado acontece só por essa conversão (sem tela dedicada
  de "adicionar membro" no Master).
- Vincular a grupo já na criação (2026-08): `CreateCompanyModal` ganha um
  seletor "Vincular a um grupo existente (opcional)" — só aparece pra
  cadastro de empresa individual avulsa (`!isGroup && !cloneSource`), e só
  quando não há um `orgId` alternativo selecionado (super admin mirando
  outra org veria uma lista de grupos que não pertence a essa org, já que
  `projects` só reflete a org atualmente ativa). Lista os `projects` com
  `company.isGroupMaster`; ao escolher um, o `submit()` do modal seta
  `payload.groupId = <id do master>` diretamente — **nunca**
  `payload.structureType = 'grupo'` nesse caminho, porque essa string é o
  flag reservado que `handleCreateCompanyPayload()` usa pra rotear pro
  `createCompanyGroup()` (que espera `{master, children, groupName}` e
  quebraria aqui). Mesmo mecanismo que `createCompanyGroup()` já usa pras
  filhas (`createCompany({...child, groupId: masterId})`) — zero mudança
  de schema/backend, `createCompany()`/`POST /api/projects` já repassa
  qualquer campo extra do payload. Elimina o passo de criar avulsa e depois
  editar pra vincular.
- Entrar no grupo: `CompanySelectorScreen` mostra selo "Grupo · N empresas"
  no Master; clicar o checkbox do Master ou dar duplo-clique nele
  auto-seleciona todos os membros (`toggle()` estendido) e leva direto pra
  visão consolidada (`isMulti`).
- Visão consolidada: **sem mudança em `TableView`/`PhasesView`/`KanbanView`/
  `TimelineView`** além de um filtro novo "Empresa" (Tabela/Quadro, só
  quando `multiMode`) e o selo "Grupo inteiro"/"Várias empresas" nos cards/
  linhas com `groupActivityId`. Fases/Gantt continuam empilhados por
  empresa (decisão explícita — fundir de verdade fica pra uma v2, não
  pedido agora).
- Nova atividade com escolha de empresas: só aparece quando `isGroupView`
  (todas as empresas selecionadas compartilham o mesmo `groupRootId`) —
  `GroupActivityScopeModal` oferece Uma empresa / Várias / Todas. Seleção
  ad-hoc de empresas não relacionadas mantém o dropdown antigo, intocado.

**Fora do escopo desta versão** (documentado, não esquecer): Fases/Gantt
fundidos entre empresas; tela de gerenciar membros no Master; backfill
retroativo de atividades "gerais do grupo" pra empresa que entra depois no
grupo (só ativa daí pra frente); `cliente` nunca vê a visão consolidada
(só `master`/`pricetax` — comportamento correto por design, `canAccessProject`
não muda).

### 12.1 "Empresas envolvidas" por atividade (v2, 2026-08)

Evolução pedida pelo Rafael: uma atividade de grupo deixa de ser tratada
como cópia por empresa (mecanismo v1 acima, mantido intacto pras cópias já
existentes) e passa a ser **um registro único, mutável**, com um campo que
lista quais empresas-filhas do grupo ela envolve — editável depois, com a
alteração registrada no histórico. Só faz sentido como registro único
porque o pedido era "alterar posteriormente quais empresas estão
vinculadas, mantendo o histórico dessa alteração" — cópias não suportam
isso sem ambiguidade (qual cópia editar?).

**Modelo de dados**: `activity.involvedCompanyIds: string[]` — ids de
projetos-filhas do mesmo grupo. Vive **só no projeto do CNPJ Master**
(nunca duplicado). Array vazio ou campo ausente = **"Geral do Grupo"**
(demanda do grupo como um todo, sem empresa específica) — por isso as
atividades que o Master já tinha antes de virar grupo continuam
exatamente como estavam e já caem em "Geral do Grupo" sem precisar de
nenhum backfill.

**Onde vive cada coisa**: criado só a partir da visão consolidada do
Grupo (`isGroupView`) via `GroupActivityCompaniesModal` → `addGroupWideActivity(masterPid,
involvedCompanyIds)` — substituiu o antigo `GroupActivityScopeModal`/
`addGroupActivity` (mecanismo "Uma empresa/Várias/Todas" que copiava a
atividade). Editar `involvedCompanyIds` depois de criada: seção "Empresas
envolvidas" no `ActivityDetailModal` (só aparece quando `pid` é um Master
com filhas — prop `groupChildren`), grava via `updateActivity(pid, id,
{ involvedCompanyIds }, logMsg)` — histórico vem de graça do mecanismo já
existente de log por atividade.

**Filtro na visão consolidada**: `TableView`/`KanbanView` ganharam prop
`groupInfo = { masterId, children }` (só passada quando `isGroupView`);
substitui o dropdown simples "Empresa" (por `_companyName`, mecanismo v1)
por um filtro **Todas as atividades | Geral do Grupo | <empresa-filha>**
quando presente — filtra por id: atividade de uma filha = nativa dela
(`_pid === filha.id`) OU do Master com `involvedCompanyIds` incluindo seu
id; "Geral do Grupo" = do Master com `involvedCompanyIds` vazio/ausente.
Sem `groupInfo` (seleção ad-hoc de empresas não relacionadas), dropdown
antigo continua intocado. Selo visual novo (`involvedCompaniesLabel()`)
ao lado do selo legado "Grupo inteiro"/"Várias empresas" nos 3 pontos que
já mostravam esse selo.

**Desvincular empresa do grupo bloqueado se houver pendência**:
`EditCompanyModal.unlinkFromGroup()` varre as atividades do Master por
alguma não `deleted`/não `concluido` que marque a empresa em
`involvedCompanyIds`; se achar, `alert()` com os títulos e aborta — sem
perda silenciosa de referência (decisão explícita do Rafael, preferiu
bloquear a limpar automaticamente ou remover a atividade).

**Decisão explícita**: atividades de grupo (com `involvedCompanyIds`)
só aparecem na visão consolidada do Grupo — abrir uma empresa-filha
sozinha (fora do multi-select) mostra só as atividades nativas dela,
nunca as do Master. Igual à v1, Fases/Gantt continuam por empresa sem
fusão. Cópias antigas (`groupActivityId`) não são migradas — convivem
lado a lado com o novo modelo, cada uma renderizada pelo próprio
mecanismo.

## 13. Regras de negócio (resumo)

- **3 acessos independentes (2026-08)** — Empresas / Gestão de Atividades /
  XFlow, cada um ligado/desligado por conta própria em
  `NewUserModal`/`EditUserModal` (`App.jsx`), **substituindo** o modelo
  anterior de acesso a empresa implícito no papel (Master via todas,
  PRICETAX via `allowedCnpjs`, Cliente via `cnpj` único) e o checkbox único
  "Acesso apenas à Gestão de Atividades". Campos: `companiesAccess`
  (liga o módulo Empresas) + `allCompaniesAccess` (todas da org, ignora a
  lista) + reaproveita `allowedCnpjs` como lista de empresas específicas
  pra **qualquer papel** agora (não só PRICETAX); `personalAccess` liga
  Gestão de Atividades — **hoje é opcional de verdade** (antes, todo mundo
  tinha por padrão, sem exceção). `xflowRole` sem mudança. Migração
  (`migrateAccessModel()` em `server/db.js`, idempotente, roda todo boot)
  preservou exatamente o acesso efetivo que cada usuário já tinha: Master →
  `allCompaniesAccess=true`; PRICETAX → mesma lista; Cliente → `cnpj` único
  migrado pra dentro de `allowedCnpjs`; quem tinha `personalOnly=true` →
  só `personalAccess=true`. Colunas antigas (`cnpj`, `personal_only`)
  ficam no banco sem uso, não removidas.
- `App()` calcula `availableModes` (quais dos 3 o usuário tem) a cada
  render: 0 → `NoAccessScreen` (mensagem genérica agora, cobre "nenhum dos
  3" além do caso antigo "nenhuma empresa liberada"); 1 → pula
  `WorkspaceGateScreen`, entra direto nesse módulo, sem botão de voltar;
  2+ → `WorkspaceGateScreen` só com os cards disponíveis (os cards de
  Empresas/Atividades, antes incondicionais, agora só renderizam se a prop
  existir — mesmo padrão que o card do XFlow já usava). Dentro de
  Empresas, `canPickCompanies` (mostra a tela de escolha múltipla vs. entra
  direto numa única) virou `companiesAccess && projects.length > 1` — não
  depende mais de papel; o efeito que auto-seleciona e pula a tela (antes
  só pra `role==='cliente'`) generalizou pra qualquer usuário com 0-1
  empresa visível.
- Cadastro de empresa exige tipo de cliente (Diagnóstico / Diagnóstico e
  Consultoria Contínua / POC-Demonstração) só na criação. Filtros por
  Tipo/Status/Regime Tributário na tela de seleção de empresas.
- Sem checagem de conflito de datas entre empresas (removida a pedido
  explícito) — datas de atividade são livres.
- Exclusão de atividade/subatividade/usuário-master-único tem guarda (frase
  de confirmação ou bloqueio de "não pode remover o último admin").
- Quadro pessoal tem `visibility` (`private`|`public`) + `shareToken` por
  página; ação vira entrada em `board.log`.
- **Gestão de Atividades (2026-08)**: concluir um card move ele pro final da
  coluna imediatamente (mesmo em ordem manual); sort por prioridade sempre
  joga `completed` pro final; toda segunda-feira (com catch-up se perdida)
  cards concluídos são auto-arquivados pra painel "Concluídas" (irmão da
  Lixeira, só restaurar); mover card entre colunas funciona via menu "Mover
  para..." (sempre) e via arraste (**sempre entre colunas diferentes**,
  mesmo fora de "Ordem manual" — só reordenar *dentro* da mesma coluna via
  arraste é bloqueado fora do modo manual).
- Pausar empresa cascateia `status='pausado'` em atividades não excluídas/
  concluídas, guardando `statusBeforePause` pra restaurar exato ao religar;
  atividades já pausadas manualmente ou já concluídas ficam fora do cascade.
- **Horário da reunião (2026-08)**: campo opcional `activity.meetingTime`
  (`<input type="time">`, `ActivityDetailModal`, logo abaixo de "Início") —
  puramente informativo, não valida contra nada, não é obrigatório pra
  salvar a atividade. Aparece formatado como "18/09/2026 às 14:30" na
  tabela "Próximas etapas" do relatório em PDF (abaixo) quando preenchido.
- **Relatório em PDF (2026-08)** — deixou de ser "o que está na tela agora"
  impresso via CSS. `exportPdf()` continua chamando `window.print()` (sem
  lib nova), mas agora existe um componente dedicado (`PrintReport` +
  `PrintActivityTable`, `App.jsx`, antes de `TableView`) com layout
  próprio — cabeçalho (empresa/CNPJ/tipo de cliente), KPIs (total/
  concluídas/em andamento/em atraso), progresso geral, progresso por fase
  e tabela "Próximas etapas" (+ "Em atraso" em destaque quando existe
  alguma) — pensado pra ser entregue ao gestor do cliente, não pra uso
  interno tipo planilha. Fica `display:none` na tela o tempo todo, só
  aparece dentro de `@media print` (`PRINT_REPORT_CSS`, injetado no
  próprio componente) enquanto `.no-print` esconde a UI normal — inclusive
  o `<main>`, que antes não tinha essa classe (era por isso que a
  exportação em PDF antiga imprimia a view crua da tela, Tabela/Fases/
  Quadro/Gantt, sem nenhum layout dedicado). `@page { size: landscape }`
  força paisagem. Cores do relatório são **literais** (`PRINT_STATUS_META`/
  `PRINT_COUNTDOWN_TONE_META` próprias, não reaproveitam `STATUS_META`/
  `COUNTDOWN_TONE_META` da tela) — nunca `var(--...)`. Funciona tanto pra
  uma empresa quanto pra "visão geral" (`isMulti`): uma página por empresa
  (`.pr-page`, `page-break-after`). **Bug pré-existente corrigido junto**:
  a regra `@media print { body, .page-root {...} }` já existia antes, mas
  `.page-root` nunca bateu em nada — o `<div style={S.page}>` raiz de toda
  tela não tinha essa `className` (só o nome da chave do objeto de estilo
  coincidia). Corrigido adicionando `className="page-root"` a esse `<div>`
  em todas as telas que o usam.
  - **Identidade visual PRICETAX (2026-08, v2)**: Rafael mandou o deck
    oficial da PRICETAX (`.pptx`) como referência e o relatório foi
    redesenhado pra bater com a marca de verdade — **fundo navy escuro**
    (`#0B0E1A` página / `#161B2E` cards / `#1D2338` linha de cabeçalho de
    tabela), **amarelo da marca `#FEDC04`** (não é o `#F5C400` usado no
    resto do app — extraído pixel a pixel dos PNGs oficiais em
    `src/assets/brand/`, é o hex correto de verdade), texto branco/cinza
    claro (`#B8BCC8`), verde `#3DDC84` (positivo/concluído), coral
    `#FF6B6B` (atraso/negativo) — paleta extraída diretamente das cores
    `srgbClr` usadas nos 14 slides do deck (`ppt/slides/slideN.xml`), não
    do tema OOXML (que só tinha o azul/vermelho genérico padrão do
    Office, nunca customizado). Fonte trocada pra `Arial` (primeira da
    pilha, com `Inter` como fallback) — é a fonte real usada no deck.
    Cantos passaram de 10-12px pra 4px (o deck usa retângulos praticamente
    sem arredondar). Logo `PriceTax` branca (`pricetaxLogoBranco`, mesmo
    import de `BrandLogo`) agora aparece no canto superior direito do
    relatório — antes só tinha o texto "PRICETAX" como eyebrow. Logo da
    **empresa cliente** (`company.logo`, cor arbitrária, pode ser qualquer
    coisa que o usuário fez upload) ganhou um chip de fundo branco
    (`.pr-header-logo-chip`) atrás pra garantir contraste em qualquer
    logo, já que o fundo do relatório agora é escuro. **Crítico pro fundo
    escuro funcionar de verdade na impressão**: navegadores por padrão
    **omitem cor de fundo ao imprimir** pra economizar tinta — adicionado
    `-webkit-print-color-adjust:exact` / `print-color-adjust:exact` no
    `@media print` (no `<style>` topo de `App()`, fora do componente) sem
    isso o relatório sairia com fundo branco e texto branco invisível.
    `PrintActivityTable` ganhou a coluna **Contagem** (reaproveita
    `resumoCountdown()`/`resumoDateLabel()` já criados pra aba RESUMO,
    ver abaixo — mesmo "D-N/Amanhã/Hoje/Atrasado N dias" da tela, cores
    próprias em `PRINT_COUNTDOWN_TONE_META`) e a ordem de colunas virou
    igual à do RESUMO (Atividade/Responsável/Fase/Data/Contagem/Status) —
    pedido explícito de consistência entre a aba e o PDF exportado dela.
  - **Ordem = mesma da Tabela (2026-08)**: `overdue`/`upcoming` em
    `PrintReport` passaram a chamar `sortActivities()` diretamente (a
    mesma função que gera `activitiesSorted` em `App()`, fonte da ordem
    da Tabela) em vez de um `.sort()` ad-hoc por `a.date` — a versão
    ad-hoc tratava atividade sem data como `''` no `localeCompare`, o
    que jogava ela pro **início** da lista; `sortActivities()` já trata
    esse caso corretamente (sem data sempre por último). Atrasadas +
    próximas, nessa ordem, reproduzem a mesma sequência cronológica que
    a Tabela mostra (ver também "Ordenação padrão" da aba RESUMO acima,
    mesmo pedido do Rafael, mesma correção).
- **Aba RESUMO (2026-08)** — quinta aba do workspace de Empresas
  (`ResumoView`, `App.jsx`, antes de `TableView`; ícone `Gauge`), só em
  `!isMulti` (mesma restrição de `PhasesView`/`KanbanView` — visão de uma
  empresa por vez, não da "visão geral"). É **consulta/acompanhamento, não
  edição** — clicar numa linha/card abre o mesmo `ActivityDetailModal` de
  sempre via `openDetail()`, sem nenhuma edição própria na tela. Não criou
  campo nem tabela nova; deriva tudo de `activity.{title,desc,phase,
  responsible,date,endDate,status,subactivities}` já existentes.
  - **KPIs** (total/concluídas/em andamento/não iniciadas/pausadas/
    atrasadas/próx. 7 dias) + card "Próxima atividade" (clicável) +
    barra de progresso geral — mesma lógica de `projectProgress()`/
    `isOverdue` já usada em `PhasesView`/`PrintReport`, sem duplicar
    cálculo novo.
  - **Coluna Contagem** (`resumoCountdown()`): rótulo sempre relativo a
    hoje — `D-N` (>1 dia), `Amanhã` (1 dia), `Hoje`, `Atrasado N dia(s)`
    (passou do prazo) ou `Concluído`. Cor em semáforo própria
    (`COUNTDOWN_TONE_META`, cores literais tipo `STATUS_META`) — **não**
    existe status "Atrasado" gravado; é sempre condição derivada de data
    x hoje, igual ao `isOverdue()` do resto do app (pedido explícito do
    Rafael pra não criar um 5º status manual).
  - **Status continua sendo só os 4 que já existem**
    (`STATUS_ORDER`/`STATUS_META`: não iniciado/em andamento/pausado/
    concluído) — a lista maior de status sugerida no pedido original
    (Agendado/Aguardando cliente/Bloqueado/Cancelado etc.) **não foi
    implementada de propósito**: exigiria mexer no modelo de dados e em
    todo lugar que lê `status` (Quadro, Gantt, filtros, `cycleStatus`),
    contra a instrução explícita de não alterar a lógica existente de
    atividades. O "atraso" cobre o mesmo caso de uso como indicador
    automático, sem tocar no campo.
  - **Filtros combináveis**: chips rápidos (Todas/Atrasadas/Hoje/Próx. 7
    e 30 dias/Em andamento/Não iniciadas/Concluídas) + selects de
    Responsável/Fase/Status/Mês, todos com AND entre si. "Agrupar por
    mês" é colapsável por mês (`collapsedMonths`, mesmo padrão de
    `PhasesView`/`XflowBoardColumn`).
  - **Ordenação padrão = ordem da Tabela (2026-08, pedido explícito)**:
    o modo "Ordenar: como na Tabela" (`sortMode === 'auto'`, default)
    **não reordena nada** — só filtra (`.filter()` preserva ordem
    relativa) em cima do array `activities` que já chega pronto de
    `App()` como `activitiesSorted` (`sortActivities()`, a mesma fonte
    que a aba Tabela usa pra numerar `#1, #2, #3...`). Uma primeira
    versão tinha uma ordenação "inteligente" própria
    (`resumoBucketRank()`: atrasada → hoje → próx. 7 dias → demais
    futuras → concluída) que **empurrava concluídas pro final** — Rafael
    pediu explicitamente pra respeitar a mesma ordem da Tabela em vez
    disso (uma atividade concluída fica na posição cronológica dela, não
    no fim), então essa função foi removida. Os outros modos
    (Data/Atividade/Responsável/Fase/Status) continuam como override
    manual explícito do usuário, sem mudança.
  - **Responsivo sem media query**: `.rs-kpis` usa
    `grid-template-columns: repeat(auto-fit, minmax(112px,1fr))` (reflui
    sozinho, sem breakpoint); tabela vs. cards (`ResumoTable`/
    `ResumoCard`) trocam via `useIsMobile()`, mesmo padrão já
    estabelecido no resto do app.
  - Todo o estado de filtro/ordenação/agrupamento é local
    (`useState` dentro de `ResumoView`) — reseta ao trocar de aba, mesmo
    espírito de `sortMode` no Quadro do XFlow/quadro pessoal.

## 14. Problemas técnicos conhecidos

- `src/App.jsx` é muito grande (~6970 linhas, um componente `App()` de
  ~1450 linhas) — leitura completa é cara em contexto; usar
  `docs/PROJECT_MAP.md` + `grep`/`Read offset` sempre.
- Anexos em base64 dentro do JSONB (`activity.attachments[].dataUrl`, até
  8MB/arquivo, sem limite total) — sem storage externo; payload de
  `PATCH /projects/:id` cresce com o projeto.
- Autosave reenvia o **objeto inteiro** (não diffs) tanto em `/projects/:id`
  quanto em `/personal-board` — custo cresce com o tamanho do dado.
- `README.md` desatualizado (ainda descreve versão antiga localStorage,
  sem backend real) — não reflete a arquitetura atual.
- Sem testes automatizados, sem linter configurado.
- `cnpjLookup.js` depende de 2 APIs externas instáveis — já tem retry/
  timeout/cache, mas é ponto único de falha do cadastro de empresa.

## 15. Pendências / roadmap conhecido

- Enforcement de `organizations.status` (suspensa/bloqueada não bloqueia
  login/acesso ainda, é só rótulo).
- Planos/limites/cobrança (`plan`, `max_users`, `max_companies` no schema,
  nada lê/aplica).
- Banner "Super Admin — visualizando como X" não aparece ainda em
  `CompanySelectorScreen` (só no topbar principal) — limitação conhecida.
- `README.md` não atualizado (fora de escopo até pedido explícito).

## 16. Padrões obrigatórios ao desenvolver novas funcionalidades

- Nunca `setProjects`/`setPersonalBoard` direto pra editar dado existente —
  sempre `mutateProject(pid, updater, logMsg, activityId)` ou
  `mutatePersonalBoard(updater)` (debounce + persistência + log/rollback já
  embutidos).
- Campo novo em `projects.data`/`personal_boards.data` = só editar o
  frontend, sempre com fallback (`campo || default`) pra não quebrar
  registros antigos. Coluna relacional nova (fora do JSONB) só se a tarefa
  pedir explicitamente — schema é `server/db.js`, sensível, afeta produção.
- Uma única fonte de verdade por dado derivado — nunca escrever dois campos
  que representam o mesmo estado de forma independente (ex.: `cardStatusOf()`
  deriva status de `card.completed`, não o contrário).
- Exclusão de item (atividade/subatividade/card) é **sempre** soft-delete
  (`deleted/deletedAt/deletedBy`) + filtro nas views + Lixeira/restore.
  Exceção: linhas de tabela SQL (projeto, usuário) usam `DELETE` real.
  Padrão de campo de arquivamento (`archived/archivedAt/...`, painel
  "Concluídas") segue a mesma lógica — nunca remover o item de verdade do
  array, só marcar e filtrar.
- Toda tela nova precisa injetar seu próprio bloco `<style>` com as regras
  base de `input/select/textarea` (tema light/dark depende disso — sem isso
  os campos ficam sem estilo).
- Toda variante mobile é uma chave **nova** `S.algoMobile` aplicada
  condicionalmente — nunca sobrescrever a chave desktop, nunca media query
  por cima de inline style.
- Nova rota/query em `users`/`projects` precisa do mesmo filtro `org_id` /
  `canAccessProject()` / `sameOrg()` que as rotas existentes já usam — nunca
  confiar só em checagem de `role` no frontend (backend é a fonte de
  verdade de autorização).
- Ação de mutação relevante deve virar entrada de log/histórico seguindo o
  padrão já existente (`project.log`, `card.history`, `board.log`).
- Antes de remover/renomear uma chave do objeto `S` (~380 linhas, usado por
  todos os componentes), `grep` o nome no arquivo inteiro — React ignora
  `style={undefined}` silenciosamente, quebra sem erro visível no console.
- Sem abstração/dependência/camada nova "pra generalizar" sem pedido
  explícito — o arquivo já é grande, prefira repetir 3 linhas parecidas a
  criar um helper novo pra um caso só.
- **Todo modal que edita dado do usuário precisa da guarda de "alterações
  não salvas"** (2026-08, pedido explícito do Rafael, padronizado em
  Empresas/Gestão de Atividades/XFlow) — nunca deixar clicar fora ou no X
  descartar informação em silêncio. Dois hooks + um componente
  compartilhados em `src/App.jsx` (exportados, `XFlow.jsx` importa de
  `../App.jsx` no mesmo padrão já usado pra `S`/`fmtDate`/etc.):
  - `useDirtyForm(currentValue)` — pra modal "rascunho" (guarda tudo em
    `useState(form)` local, só grava no submit: `CreateCompanyModal`,
    `EditCompanyModal`, `NewUserModal`, `MyProfileModal`,
    `GroupActivityCompaniesModal`, `NewTicketModal` do XFlow). Compara
    `JSON.stringify` contra o snapshot do primeiro render; também registra
    `beforeunload` enquanto sujo (cobre fechar/atualizar a aba).
  - `useAutosaveTimestamp(record)` — pra modal onde cada campo já grava
    sozinho no `onChange`/`onBlur` (`ActivityDetailModal`,
    `PersonalCardDetailModal`, `TicketDetailModal` do XFlow). Observa a
    prop que already muda quando um autosave acontece (`activity`/`card`/
    `ticket`) e cronometra — não precisa instrumentar cada handler.
    Nesses modais o que falta salvar são só os "rascunhos menores" com
    submit próprio (comentário não enviado, formulário de link/checklist
    não adicionado, edição de comentário em andamento, ação com formulário
    parcial no XFlow) — o `hasDraft` desses modais é o OR desses estados
    específicos, não do dado inteiro.
  - `ConfirmDiscardModal({ onSaveAndExit, onDiscard, onCancel, saving })`
    — "Salvar e sair" / "Sair sem salvar" / "Continuar editando".
    `onSaveAndExit` é **opcional**: omitir quando não existe uma ação de
    salvar parcial válida pro rascunho pendente (ex.: `TicketDetailModal`
    com só um formulário de bloqueio/redirecionamento preenchido, sem
    comentário — nesse caso só "Sair sem salvar"/"Continuar editando").
  - Todo modal: overlay (`onClick`) e botão X chamam uma função local
    `requestClose()` (não `onClose` direto) que decide entre fechar na
    hora ou abrir o `ConfirmDiscardModal`. Indicador de texto perto do
    título: "Alterações não salvas" (laranja) / "Salvo automaticamente às
    HH:MM" / "Todas as alterações estão salvas" via helper
    `savedStatusLabel(hasDraft, lastSavedAt)`.
  - Novo modal de edição = seguir um dos dois padrões acima, nunca inventar
    um terceiro.

## 17. Bugs já resolvidos — não reintroduzir

Confirmados nesta sessão (causa raiz verificada e corrigida ao vivo):

- **Drag-and-drop bloqueado entre colunas fora de "Ordem manual"**
  (Gestão de Atividades): `dragDisabled` desativava **todo** o arraste
  (inclusive mudar de coluna) sempre que `sortMode !== 'manual'`, não só a
  reordenação dentro da coluna. Corrigido: `dragDisabled` fixo em `false`;
  `handleDragEnd` só ignora o drop quando `fromColId === toColId` **e**
  `sortMode !== 'manual'` (reordenar dentro da coluna nesse modo é um
  no-op, já que a posição é recalculada pelo critério de ordenação).
- **`sortCards()` modo `'priority'` não considerava `completed`**: card
  concluído com prioridade Urgente aparecia antes de um card ativo de
  prioridade baixa. Corrigido: sort agora compara `completed` primeiro,
  prioridade só como desempate.
- **Concluir um card não movia ele pro fim da coluna**: `setCardStatus()`
  só fazia `updateCard()` (mantém posição no array). Corrigido: ao marcar
  `completed`, o card é removido e reinserido no fim do array `cards` na
  mesma mutação.
- **Fluxo de entrada do Super Admin**: clicar "Empresas" ia direto pra
  `CompanySelectorScreen` misturando empresas de **todas** as organizações
  numa lista só (sem indicar de qual org era cada uma) — `SuperAdminScreen`
  só existia atrás de um botão no topbar, dentro de um workspace que já
  exigia ter escolhido uma empresa. Corrigido movendo o gate de
  `SuperAdminScreen` pra **antes** do gate de `CompanySelectorScreen` em
  `App()` (só afeta `isSuperAdmin`).
- **Gate `showUsers` sem efeito antes de escolher empresa**: o bloco
  `if (showUsers...) return <UsersManagementScreen/>` estava posicionado
  **depois** do gate de `CompanySelectorScreen` em `App()` — setar
  `showUsers=true` de dentro do seletor de empresas não fazia nada, porque
  o gate anterior já tinha "vencido" o `return`. Corrigido movendo o bloco
  pra antes (gate único, não duplicado). **Lição estrutural**: em `App()`,
  a ordem dos `if (...) return <Tela/>` sequenciais importa — só o primeiro
  que casar renderiza; setar um state novo não adianta se um gate anterior
  ainda intercepta.
- **Org picker escondido no modo "Clonar empresa"**: `CreateCompanyModal`
  já tinha o seletor "Organização (base)", mas só aparecia em modo criação
  (`!cloneSource`). Corrigido removendo essa restrição — mesmo seletor
  funciona nos dois modos.
- **Risco de vazamento de estado cross-org**: ao criar/clonar recurso numa
  organização diferente da que está sendo visualizada, o retorno não pode
  entrar em `users`/`projects` do estado local (esses arrays são
  implicitamente assumidos como escopados à org atual pelo resto da UI).
  Padrão adotado: `createCompany()`/`cloneCompany()` retornam `{id,
  crossOrg, orgName}`; chamador só faz `setState` local quando `!crossOrg`,
  e mostra `window.alert()` avisando em qual org o recurso caiu.
- **`createCompanyGroup()` descartava `groupName` silenciosamente**: a
  função desestruturava só `{ master, children }` do payload, nunca
  `groupName` — o Master era criado sem nome de grupo (campo vazio no
  banco), sem erro nenhum visível na tela. Corrigido incluindo `groupName`
  na desestruturação e passando pra `createCompany({ ...master,
  isGroupMaster: true, groupName })`. **Lição**: quando uma função recebe
  um objeto e só usa parte dele, sobra fácil de passar despercebido — testar
  criando o dado de verdade e checando no banco (`psql`), não só olhando o
  código, pegou isso que uma leitura visual não pegaria.
- **`CompanySelectorScreen` não reflete `selectedProjectIds` após criar
  empresa/grupo**: o `Set` local de seleção da tela (`useState(() => new
  Set(initialSelected))`) só lê `initialSelected` **uma vez, no mount** —
  atualizar `selectedProjectIds` no `App()` depois que a tela já está
  montada (ex.: criar um grupo pela tela de seleção) não reflete nos
  checkboxes nem no botão "Continuar" (que usa o `Set` local, não a prop).
  Isso já existia antes pra criação de empresa individual (nunca foi
  perceptível porque ninguém contava com auto-seleção ali); virou bug
  visível quando o Grupo Empresarial prometeu "cair direto na visão
  consolidada". Corrigido **sem** mexer no componente compartilhado (evita
  risco de quebrar o fluxo de empresa individual): `handleCreateCompanyPayload()`
  chama `setCompanySelectionConfirmed(true)` diretamente depois de criar um
  grupo, pulando a tela de seleção por completo em vez de tentar sincronizar
  o estado dela.

- **Editar comentário de atividade perdia as quebras de linha** (Empresas >
  Atividades e Gestão de Atividades): o modo de edição usava `<input
  type="text">` (linha única, `Enter` submetia o comentário) enquanto a
  exibição (`S.commentText`, `white-space: pre-wrap`) e a caixa de criar
  comentário sempre foram `<textarea>` — texto com `\n` virava um textão
  corrido ao entrar em modo de edição, sem forma de reinserir as quebras.
  Corrigido nos dois lugares (`ActivityDetailModal` e
  `PersonalCardDetailModal`): edição agora usa `<textarea rows={3}
  style={S.notesArea}>` igual à composição; `Enter` volta a ser quebra de
  linha normal (só `Escape` cancela — salvar é só pelo botão ✓, igual à
  criação).

- **Botão "Gestão de Atividades" aparecia sem `personalAccess`** (topbar
  do workspace de Empresas + item do menu "Mais" no mobile): desde o
  commit dos "3 acessos independentes" (`f6d6e7c`), os outros pontos de
  gate (checkboxes, `availableModes`, cards do `WorkspaceGateScreen`)
  ganharam a checagem de `currentUser.personalAccess`, mas esses dois
  ficaram sem — renderizavam pra **qualquer** usuário não-mobile, mesmo
  com o acesso desmarcado no cadastro. Descoberto ao vivo em produção
  (usuário cliente Alcast via `alcast@pricetax.com.br`) comparando o
  bundle JS publicado com o código-fonte local: o fix já existia no
  working dir (não commitado) mas nunca tinha sido de fato publicado —
  o deploy anterior (`259b567`, ordenação do Quadro) foi um `rsync`
  completo e ainda assim não carregou essa correção porque ela só foi
  escrita depois daquele deploy. Corrigido e publicado (`1d09d6d`).
  **Lição**: quando um bug relatado em produção não bate com a leitura
  do código-fonte local, comparar o bundle JS realmente servido
  (`fetch` do `.js` + busca de string) contra o commit atual do
  repositório antes de assumir que é dado/configuração — pode ser
  simplesmente um deploy que ficou pra trás.

Do histórico do projeto (título do commit é a única fonte disponível —
confiança menor, mas mantido como sinal de "área sensível"):

- Wrapper de exclusão em `ActivityDetailModal` não respeitava corretamente
  um delete cancelado/bloqueado (frase de confirmação) — atenção redobrada
  ao mexer no fluxo de exclusão de atividade.
- Subatividades excluídas não apareciam na Lixeira (soft-delete não estava
  sendo aplicado a elas) — atenção ao adicionar novo tipo de item excluível
  pra garantir que ele segue o mesmo padrão de `deleted/deletedAt/deletedBy`
  + filtro de view + entrada na Lixeira.

## 18. XFlow — módulo de gestão de BUGs (2026-08, v2)

Módulo de acesso restrito para rastrear BUGs dos produtos internos PRICETAX
(X da Questão, XClass, XPED — não é sobre clientes do Cronograma). Filosofia:
BUG tem ciclo de vida próprio, não é uma TASK comum. **v1** entregou o ciclo
de vida básico (tela); uma auditoria funcional encontrou que toda regra de
negócio vivia só na interface, sem proteção real no backend. **v2** (este
texto) corrigiu isso e adicionou tempo/SLA/dashboards — ver
`/Users/rafaelsouza/.claude/plans/clever-soaring-kitten.md` para o desenho
completo (arquitetura de dados, matriz de permissões, matriz de transições).

- **Acesso**: campo `users.xflow_role` (`''` = sem acesso; `reporter`/`dev`/
  `gestao` = tem acesso com aquele papel). Papel **efetivo** calculado em
  `effectiveXflowRole()` (`server/xflowPermissions.js` no backend,
  duplicado no frontend em `src/xflow/XFlow.jsx` — mudou num lado, muda no
  outro): `admin` é um upgrade automático de quem já tem `xflow_role` E é
  `role='master'`/`isSuperAdmin` no Cronograma — não dá acesso a quem nunca
  teve `xflow_role`. Card "XFlow" no `WorkspaceGateScreen` e gate em `App()`
  (`workspaceMode === 'xflow'`, antes do gate de `CompanySelectorScreen`,
  lição do §17) inalterados da v1.
- **Escopo**: por organização (`xflow_tickets.org_id`). `GET /xflow/tickets`
  restringe `reporter` aos próprios tickets no **backend** (não só na tela)
  — mudança da v2, fechou uma exposição real entre solicitantes diferentes.
- **Autorização real no backend** (o núcleo da v2): `PATCH
  /xflow/tickets/:id` não aceita mais o ticket inteiro solto — exige
  `{action, payload}`. Toda ação passa por `checkTransition()`
  (`server/xflowTransitions.js`, valida status de origem) e `canDo()`
  (`server/xflowPermissions.js`, valida papel — reporter/dev/gestão/admin,
  com casos "dono do ticket" e "responsável do ticket" tratados à parte).
  Uma ação proibida ou uma transição inválida nunca chega a gravar — 403/400
  reais, testados via `curl` direto, não só ausência de botão na tela.
- **Fluxo de estados v2**: principal `aberta → atribuida →
  em_desenvolvimento → em_revisao → pronta_para_teste → em_homologacao →
  pronta_para_publicacao → publicada → aguardando_validacao_solicitante →
  concluida` (concluída é terminal mas **reabrível** — `reabrir`, qualquer
  terminal, incrementa `reopen_count`, registra motivo/quem/quando,
  preserva histórico). `triagem`/`validada_como_bug`/`priorizada` da v1
  eram inatingíveis (nenhuma ação os produzia) — removidos. Homologação e
  Publicação viraram **dois passos** (`homolog_aprovar`/`homolog_reprovar`
  → `publicar`, com campos opcionais de versão/build/release), permitindo
  registrar a publicação num momento diferente da aprovação técnica.
  `aguardando_informacoes`/`aguardando_usuario`/`aguardando_terceiro` da v1
  nunca foram, na prática, distintos — consolidados num único
  `aguardando_terceiro` + sub-campo `waiting_on_type`
  (`solicitante`/`cliente`/`terceiro`). `aguardando_gerencia` preserva o
  `assignee_id` (não zera mais) e tem ação própria de retorno
  (`resolver_gerencia`, só gestão/admin) — o dev nunca perde a atribuição
  só por uma pergunta ter sido escalada.
- **Severidade × Prioridade**: campos independentes; `suggested_priority`
  guarda a sugestão original do solicitante (imutável), `priority` é o
  campo de trabalho que só dev/gestão/admin altera — reporter nunca altera
  severidade nem prioridade (v1 permitia, v2 corrigiu).
- **Tempo por status**: `xflow_tickets.time_breakdown` (JSONB, segundos por
  bucket: `dev`, `aguardando_usuario`, `aguardando_gestao`, `bloqueado`,
  `pausado`, `homologacao`, `aguardando_validacao`) — incrementado a cada
  troca de status, na mesma transação da ação (`server/xflow.js`, mapa
  `STATUS_TO_BUCKET`). Suporta múltiplas entradas/saídas do mesmo status
  (soma cada passagem). `status_entered_at` guarda quando entrou no status
  atual. "Tempo total" é sempre `now() - created_at`, calculado ao vivo,
  nunca armazenado.
- **SLA**: dois relógios — primeira resposta (alvo por prioridade) e
  resolução (alvo por severidade), config em `organizations.settings.
  xflowSla` com fallback pro default embutido em `server/xflow.js`
  (`DEFAULT_SLA`). SLA de resolução **pausa** enquanto o ticket está em
  `aguardando_terceiro`/`aguardando_gerencia`/`pausada`/`bloqueada`
  (`sla_paused_at`/`sla_paused_seconds`) — o tempo de espera não conta
  contra o dev. Estado computado (`vencido`/`proximo_vencer`/
  `dentro_prazo`/`cumprido`) exposto em `ticket.slaResolutionState`,
  calculado na leitura (`computeSlaState()`), não armazenado.
- **Log de eventos estruturado**: tabela `xflow_events` (não mais texto
  livre em `data.history[]` — esse campo continua existindo só pra
  continuidade visual de tickets pré-v2, lido como fallback). Toda ação
  grava uma linha (`type`, `field`, `old_value`, `new_value`, `note`,
  `user_id`, `created_at`) — é a fonte de verdade pra timeline
  (`GET /xflow/tickets/:id/events`) e pra qualquer métrica futura que
  precise agregar em SQL.
- **"Quem está com a bola"**: agora **calculado e armazenado** no backend
  (`ball_holder_type`/`ball_holder_user_id`, via `computeBallHolder()` em
  `server/xflow.js`) a cada ação — não é mais só derivado no frontend.
  `aberta` sem responsável mostra "Fila de triagem", nunca "ninguém".
- **Telas**: tudo em `src/xflow/XFlow.jsx` (exceção ao arquivo único, ver
  §9). Três Homes por papel (`ReporterHome`/`DevHome`/`GestorHome`) em vez
  de abas genéricas — reporter tem cards clicáveis que filtram a lista
  (Abertos/Em análise/Em desenvolvimento/Dependem de você/Em validação/
  Concluídos); dev tem seções fixas ordenadas (SLA vencido → urgente/crítico
  → severidade → mais próximo de vencer → data, `smartDevSort()`), não uma
  lista genérica por `created_at`; gestão tem dashboard com 10 cards
  clicáveis + gargalos (tempo acumulado por bucket) + por produto/módulo
  (drill-down) + por DEV (carga = tickets ativos + tempo só do bucket
  `dev`, nunca soma espera de terceiros). `FilterBar` (busca + status/
  produto/severidade/prioridade/responsável/SLA/aging) reaproveitada nas
  três Homes e no `ArchivedView`. Arquivamento tem aba própria
  (`ArchivedView`) com busca e desarquivar — v1 arquivava mas não tinha
  como ver de novo pela tela.
- **Formulário de abertura** (`NewTicketModal`): só 4 obrigatórios (título/
  produto/descrição/ambiente), resto fica num `<details>` colapsável
  opcional. Título usa input maior (destaque visual). `product` é um dos
  três produtos internos reais (`XFLOW_PRODUCTS`: "X da Questão", "XClass",
  "XPED") + "Outro" — não confundir com `clientType` (novo campo,
  `XFLOW_CLIENT_TYPES`: PRICETAX/TINTAX), que é o cliente PRICETAX afetado
  pelo BUG, não o produto. Ambos os campos ficam em `data` JSONB (não são
  coluna relacional — não precisam ser filtráveis em SQL hoje).
  `occurredAt` (data da ocorrência) é **só data**, sem hora.
- **Exclusão (soft-delete) + Lixeira**: nenhum BUG é apagado de verdade por
  quem não é admin. `excluir` (colunas `deleted`/`deleted_at`/`deleted_by`
  em `xflow_tickets`) tira o ticket de `GET /xflow/tickets` na hora — dono
  (reporter) pode excluir o próprio, dev/gestão/admin excluem qualquer um.
  `GET /xflow/tickets?trash=1` (só gestão/admin — `LixeiraView` no
  frontend) lista os excluídos, com todo o histórico (`xflow_events`)
  preservado; `restaurar` (gestão/admin) devolve pro fluxo normal.
  `purgar` é **a única exclusão de verdade** — `DELETE /xflow/tickets/:id`,
  hard delete (cascade em `xflow_events`), restrito a `role === 'admin'`
  (master/superAdmin do Cronograma com `xflow_role`) e só a partir de um
  ticket que já está na Lixeira; no frontend exige digitar
  `XFLOW_PURGE_CONFIRM_PHRASE` (`window.prompt`, mesmo padrão do hard-delete
  de card do quadro pessoal em `App.jsx`). PATCH em qualquer ticket já
  excluído é bloqueado no backend (só aceita `restaurar`) — proteção real,
  não só ausência de botão na tela.
- **Descrição é rich text — editor Tiptap (2026-08)**: `RichTextEditor`
  em `XFlow.jsx` era um `contentEditable` caseiro via `document.execCommand`
  (API depreciada, comportamento inconsistente entre navegadores, "rígido"
  na palavra do Rafael) — trocado por um editor real usando Tiptap
  (`@tiptap/react` + `@tiptap/starter-kit` + extensões pequenas —
  `underline`/`text-style`/`font-family`/`text-align`/`link`/`placeholder`/
  `image`, MIT, headless — mesma filosofia do `@dnd-kit/*` que o projeto
  já usa, traz sua própria UI). Contrato externo do componente
  (`value`/`onChange`/`onCommit`/`onPasteImage`/`disabled`/`placeholder`)
  não mudou — `NewTicketModal`/`TicketDetailModal` continuam chamando
  `<RichTextEditor .../>` sem alteração. Toolbar em grupos: desfazer/
  refazer, título/subtítulo (H2/H3), negrito/itálico/sublinhado/tachado,
  fonte+tamanho, alinhamento (esq./centro/dir./justificado), lista com
  marcadores/numerada + recuo (aumentar/diminuir, só por botão — não
  amarra Tab/Shift+Tab pra não brigar com o sink/lift nativo de listas do
  StarterKit), citação/bloco de código/linha horizontal, link (via
  `window.prompt`, mesmo padrão leve já usado em outros pontos do app) e
  emoji (popover simples de unicode, sem lib nova). Atalhos de teclado
  (Ctrl+B/I/U, Ctrl+Z/Shift+Z, `- `→lista, `> `→citação, `` ``` ``→código)
  e desfazer/refazer real vêm de graça do StarterKit (ProseMirror por
  baixo). Duas extensões pequenas escritas na mão (padrão documentado
  pelo próprio Tiptap, não é reinventar o editor): `FontSize` (mark sobre
  `textStyle`, já que Tiptap não empacota tamanho de fonte oficialmente) e
  `Indent` (recuo via `margin-left` em parágrafo/título). Sincronização
  controlada (`useEffect` só chama `editor.commands.setContent(value)`
  quando o editor **não está em foco** e o HTML mudou de verdade) e
  callbacks (`onChange`/`onCommit`/`onPasteImage`) guardados em `useRef` —
  as opções do `useEditor` só são lidas na criação do editor, sem os refs
  um callback novo a cada render (comum quando o pai passa arrow function
  inline) ficaria "congelado" na primeira versão. Colar print/imagem no
  meio do texto continua inserindo inline **e** adicionando em Evidências
  ao mesmo tempo (mesmo limite de 8MB dos anexos normais), agora via
  `editorProps.handlePaste`. Conteúdo legado (`<font face>` de antes da
  troca) não tem regra de parse dedicada no Tiptap — degrada de forma
  segura (perde só a fonte customizada, texto/formatação continuam
  100% intactos), decisão consciente pra não adicionar uma extensão
  frágil só por causa de um detalhe cosmético de tickets antigos.
  Guardamos HTML, não texto puro — **sanitização em duas camadas**,
  nenhuma confia só na outra: DOMPurify no frontend (`sanitizeRichText`,
  allow-list ampliada — `h2`/`h3`/`s`/`a`/`hr`/`pre`/`code` além do que já
  existia — hook customizado garantindo que todo `<img>` sem `src`
  começando literalmente em `data:image/` é removido, e que todo `<a>`
  só sobrevive com esquema `http`/`https`/`mailto`, sempre com
  `target`/`rel` seguros forçados) e `sanitize-html` no backend
  (`sanitizeDescriptionHtml` em `server/xflow.js`, mesma allow-list
  ampliada + `allowedStyles` ganhando `font-size`/`margin-left` com regex
  numérico + `transformTags` forçando `target="_blank" rel="noopener
  noreferrer nofollow"` em todo `<a>` que sobrevive — **nunca confia no
  rel/target que veio do client**). Testado com payload malicioso real via
  curl direto no `PATCH /xflow/tickets/:id` (`<script>`, `onmouseover`,
  `href="javascript:"`, `img` remoto, link legítimo misturado) — tudo
  malicioso removido, o link legítimo sobrevive com `target`/`rel`
  forçados corretamente. **Bug real encontrado e corrigido nesse teste**:
  o `transformTags` adicionava `target`/`rel` mas o `allowedAttributes`
  do `sanitize-html` só listava `a: ['href']` — o próprio filtro de
  atributos removia de volta o que o `transformTags` acabara de forçar
  (a ordem de execução do `sanitize-html` é `transformTags` primeiro,
  filtro de atributos depois); corrigido incluindo `target`/`rel` em
  `allowedAttributes.a` também. **Segundo bug encontrado e corrigido**:
  os `<select>` de fonte/tamanho tinham `onMouseDown={(e) =>
  e.preventDefault()}` copiado do padrão dos botões da toolbar (que existe
  pra manter o foco/seleção no editor ao clicar um botão de formatação) —
  em um `<select>` isso não faz sentido (o `<select>` precisa do
  mousedown padrão pra abrir/focar) e impedia o `onChange` de disparar de
  forma confiável; removido dos 2 selects (mantido nos botões, onde é
  necessário).
- **Campos complementares preenchíveis depois**: `EDITABLE_CONTENT_FIELDS`
  em `server/xflow.js` inclui `module`/`affectedUser`/`affectedCompany`/
  `impact`/`frequency`/`occurredAt`/`clientType` (além dos já existentes) —
  qualquer um pode ser adicionado num ticket que não tinha, via a mesma
  ação genérica `editar_campo`, cada mudança vira um evento na timeline
  automaticamente (nenhum código novo de log precisou ser escrito, é o
  mecanismo genérico já existente). Renderizado como bloco editável
  "Dados capturados" no `TicketDetailModal` (era só texto read-only antes).
  `suggestedPriority` é o único caso especial: ação própria
  (`definir_prioridade_sugerida`) que só aceita gravar se o campo ainda
  está vazio — depois de definida (na criação ou depois), fica travada pra
  sempre (o backend rejeita com 400; o `<select>` fica desabilitado no
  frontend) — preserva a regra original de "sugestão do solicitante é
  imutável" mesmo permitindo preencher tardiamente. Evidências ganharam
  `remover_anexo` (mesma permissão de `anexar`) — antes só dava pra
  adicionar anexo num ticket existente, nunca remover.
- **Navegação entre os três módulos**: de qualquer um dos três
  (Empresas/Gestão de Atividades/XFlow), dá pra ir direto pros outros dois
  sem passar pelo `WorkspaceGateScreen` — botões nos respectivos topbars
  (`onGoCompany`/`onGoPersonal` novos em `XFlowScreen`, `onGoXFlow` novo em
  `PersonalBoardScreen`, botão "XFlow" novo no topbar de Empresas em
  `App.jsx`), sempre condicionados ao acesso real do usuário
  (`hasXflow`/`hasCompanies`/`hasPersonal`, ver §13) — nunca aparece um link pra um módulo que o
  usuário não pode entrar. **Atalho na tela de seleção de empresas**
  (2026-08): `CompanySelectorScreen` (tela "Quais empresas você quer
  acompanhar?", antes de qualquer empresa escolhida) ganhou um terceiro
  atalho "XFlow" ao lado de "Gestão de Atividades"/"Gestão de Usuários"
  (`onGoXFlow` novo nessa tela, mesmo gate `currentUser.xflowRole` dos
  outros pontos de entrada) — antes só dava pra chegar no XFlow depois de
  já estar dentro do workspace de uma empresa.
- **Tipo de TASK (BUG/Melhoria)**: `data.type` já existia desde a v1
  (default `'bug'`, `createSpinoff` já usava `'melhoria'`) mas nunca era
  perguntado — sempre `'bug'` silencioso. Agora é a primeira pergunta do
  `NewTicketModal` (dois cartões clicáveis, BUG selecionado por padrão),
  e os textos ao redor (título/descrição/botão de enviar) se adaptam ao
  tipo escolhido. Botão do topbar "Novo BUG" → "Nova TASK" (só o rótulo do
  botão — não é um rename geral de "BUG" pra "TASK" na tela toda, isso
  continua fora do escopo).
- **Bug de CSS corrigido**: `XFlowScreen` nunca injetava o `<style>` base
  de `input[type=text]/select/textarea` (background/borda/`width:100%`) —
  esse bloco só existe dentro do render principal de `App()` (padrão do
  projeto: cada tela top-level solta da árvore de `App()`, tipo
  `PersonalBoardScreen`, injeta sua própria cópia — `XFlowScreen` tinha
  ficado sem a dela desde a v1). Na prática, todo `<input type="text">`
  puro do XFlow (Título do BUG, Módulo, Usuário/Empresa afetados, etc.)
  renderizava no tamanho/estilo padrão do navegador — foi isso que causou
  a reclamação de "título com largura curta", não um problema de layout
  do modal. Corrigido injetando o mesmo bloco de CSS (copiado de
  `App.jsx`) no topo do `XFlowScreen`. `NewTicketModal` também ficou mais
  largo (`min(1100px, 94vw)`, era `min(660px, 100%)`) a pedido do Rafael.
- **Campos obrigatórios na abertura**: Título, Produto/Plataforma, Tipo de
  cliente, Data da ocorrência e Descrição — os 2 primeiros já eram os
  únicos campos visíveis fora do `<details>` colapsável, só faltava
  `clientType` entrar de fato no cálculo de `requiredOk` (as outras já
  eram validadas desde a v2). Marcador visual (`*` vermelho) ao lado dos
  labels.
- **Reordenação do formulário (2026-08)**: a pedido do Rafael, "Data da
  ocorrência", "Previsão de conclusão" e "Prioridade sugerida" saíram de
  dentro do `<details>` opcional e subiram pro corpo principal do
  formulário — mesma linha de 3 colunas, logo abaixo de Produto/Tipo de
  cliente/Ambiente, antes da Descrição. "Data da ocorrência" virou
  obrigatória (antes era só um campo opcional dentro do `<details>`) e
  passou a vir pré-preenchida com a data de hoje
  (`blankTicketForm()`) — o usuário só mexe se a ocorrência foi em outro
  dia. "Previsão de conclusão" e "Prioridade sugerida" continuam
  opcionais, só mudaram de lugar (mais visíveis, sem exigir abrir o
  `<details>`). O texto de dica abaixo da Descrição ("o resto pode ser
  preenchido depois") foi ajustado pra não citar mais esses dois campos
  como pendentes, já que agora aparecem sempre. Resto do `<details>`
  (Módulo/Tela, Usuário/Empresa afetados, Resultado esperado, Passo a
  passo, Impacto, Frequência, Evidência) sem mudança.
- **Autocomplete de Empresa/Cliente afetado**: sem tabela nova — o "banco"
  de clientes é literalmente o histórico de `xflow_tickets.data->>
  'affectedCompany'` da própria org (`GET /xflow/affected-companies`,
  `GROUP BY` + `COUNT` pra ordenar por uso, `LIMIT 300`). Buscado uma vez
  no mount do `XFlowScreen` (mesmo padrão do `team`), atualizado
  localmente (sem novo fetch) toda vez que um nome novo é usado —
  `registerAffectedCompany()`, chamado em `createTicket` e em
  `performAction` quando a ação é `editar_campo` no campo
  `affectedCompany`. Componente `AffectedCompanyField` (usado em
  `NewTicketModal` e no bloco "Dados capturados" do `TicketDetailModal`):
  busca por substring normalizado (sem acento, minúsculo) em qualquer
  posição do nome — não só prefixo, cobre "Raf"/"Sou"/"Rafael S" igual —
  nunca bloqueia digitar um nome novo, sugestão é só atalho. Aviso de
  possível duplicidade (Levenshtein, distância ≤ 30% do tamanho da menor
  string) aparece como texto informativo com um botão "Usar esse", nunca
  impede submeter o nome digitado. Commit só no blur (`onBlur={(e) =>
  commit(e.target.value)}` — lendo direto do DOM, não do estado React, pra
  não correr risco de closure desatualizada) — mesmo espírito do
  `ContentField`, evita PATCH a cada tecla no caso do `TicketDetailModal`.
- **Clareza visual do painel (Tipo/Data de abertura/Previsão de conclusão)**:
  `data.type` (`bug`/`melhoria`) já existia desde a v1 mas nunca era exibido
  em lugar nenhum — só influenciava textos do formulário. Adicionado
  `XFLOW_TYPE_META` (mesmo padrão de `XFLOW_STATUS_META`/`tone()`) e um
  badge de Tipo tanto em `TicketRow` (toda listagem — Home do reporter/dev/
  gestor, Arquivados, Lixeira) quanto no topo do `TicketDetailModal`. Data
  de abertura (`createdAt`, timestamptz — por isso usa `fmtDateFromTs()`,
  não o `fmtDate()` de `App.jsx`, que espera string `YYYY-MM-DD` pura) agora
  aparece direto embaixo do título no modal e em toda linha do painel, sem
  precisar abrir o ticket. Campo novo **Previsão de conclusão**
  (`data.expectedCompletionAt`, formato `YYYY-MM-DD`) é distinto do já
  existente **Prazo** (`dueDate`): `dueDate` é um compromisso operacional
  editável só por dev responsável/gestão (`editar_prazo_proxima_acao`,
  reporter não mexe); Previsão de conclusão é a estimativa de quem abriu o
  ticket, por isso reaproveita a permissão `edit_content` (reporter edita
  enquanto o ticket está aberto/aguardando terceiro; dev/gestão editam
  sempre) — vai em `EDITABLE_CONTENT_FIELDS` no backend, sem coluna SQL
  nova (heurística do CLAUDE.md: só vira coluna relacional se precisar de
  filtro/agregação em SQL, o que não é o caso aqui). Editável em
  `NewTicketModal` (dentro do `<details>` opcional, ao lado de "Data da
  ocorrência") e em `TicketDetailModal` (ao lado de "Prazo", com o hint
  "Estimativa de quem abriu a TASK — visível para solicitante, dev e
  gestão."); exibido no painel só quando preenchido.
- **Fora do escopo ainda** (não pedido/não decidido): calendário útil no
  SLA (hoje é tempo corrido), notificação de @menção via o sino do
  Cronograma (comentários do XFlow ainda não aparecem lá), BUGs
  recorrentes/reincidência por módulo, subtarefas, dependência estruturada
  entre tickets (duplicidade é só um id de texto livre, não bidirecional).

### 18.1 Quadro (Kanban) + Lista (2026-08)

Rafael pediu uma segunda visão pro XFlow, no espírito do quadro Kanban já
existente na Gestão de Atividades Individual (`PersonalBoardScreen`,
dnd-kit): "Quadro" vira a visão principal (abre por padrão ao entrar no
XFlow), "Lista" é a visão antiga (dashboards por papel +
`TicketList`, renomeada, conteúdo 100% intocado). Alternar entre as duas
não perde filtro/busca — `filters` continua um único estado em
`XFlowScreen`, compartilhado pelas duas visões.

**Diferença central do quadro pessoal**: lá o drag seta `card.status`
livre. No XFlow isso não existe — toda mudança de status passa por uma
ação nomeada com regra de origem/permissão/campo obrigatório real
(`server/xflowTransitions.js`/`xflowPermissions.js`, ver §18). Arrastar
um card no Quadro tinha que respeitar isso, então o mecanismo mapeia
drag → ação nomeada, nunca escreve status direto.

**Colunas** (`XFLOW_BOARD_COLUMNS`, fixas — sem reordenar/customizar,
diferente do quadro pessoal): uma por status real do fluxo principal
(Aberta → ... → Concluída, 10), mais as 4 laterais (Pausada/Bloqueada/
Aguardando Terceiro/Aguardando Gerência), mais uma última "Encerrada" que
agrega os 4 encerramentos antecipados (`duplicada`/`nao_reproduzida`/
`nao_e_bug`/`descartada` — só existem via ação com justificativa
obrigatória, por isso viram uma coluna só, sem drag pra dentro dela;
motivo real aparece como badge extra no card). Decisões confirmadas com o
Rafael antes de implementar: 1 coluna por status real (não um board
reduzido/agrupado); Encerrada como coluna única; mesmo board pros 3
perfis (reporter só vê os próprios tickets, isso já é travado no
backend — sem filtro padrão diferente por papel).

**Arrastar-e-soltar — 3 níveis**, mapeados a partir de
`XFLOW_TRANSITIONS` (curadoria em `XFLOW_BOARD_DRAG_RULES`/
`XFLOW_BOARD_RESUME_RULES`, mesmo espírito de "espelha o server" que
`XFLOW_RULES` já usa pra permissões — mudou lá, considerar mudar aqui):
- **Nível 1 — instantâneo**: ação sem campo obrigatório e permitida pro
  papel (`canDoClient`) → PATCH direto (`aceitar`, `iniciar_dev_direto`,
  `iniciar_desenvolvimento`, `enviar_revisao`, `marcar_pronta_teste`,
  `enviar_homologacao`, `homolog_aprovar`, `publicar`, `enviar_validacao`,
  `aprovar_validacao`, `reprovar_validacao`, `escalar_gerencia`,
  `pedir_infos`, `pausar`).
- **Nível 2 — confirmação rápida**: ação exige 1 campo → soltar abre
  `DragFieldPromptModal` (select ou textarea) pedindo só esse campo antes
  de confirmar — `bloquear` (motivo do bloqueio) e `homolog_reprovar`
  (nota da reprovação).
- **Nível 3 — retomada, alvo dinâmico**: arrastar um card **pra fora**
  de Pausada/Bloqueada/Aguardando Terceiro chama `retomar`/`desbloquear`
  (sem campo) **ignorando a coluna onde foi solto** — o servidor decide o
  status real (`statusBeforeBlock`) e o card se recoloca sozinho lá assim
  que a resposta chega. Pra fora de Aguardando Gerência chama
  `resolver_gerencia`, que exige nota (nível 2). Verificado ao vivo:
  pausar um ticket em "Em Desenvolvimento", arrastar pra fora da coluna
  Pausada soltando **em cima de Bloqueada** → não fica em Bloqueada
  (`bloquear` nem aceita partir de `pausada`), chama `retomar` e o card
  volta certinho pra "Em Desenvolvimento".
- **Bloqueado, sem drag**: entrar em Encerrada (sempre exige motivo —
  usa o fluxo já existente dentro do ticket); sair de Concluída/Encerrada
  (`reabrir` exige justificativa — `useDraggable` vem com `disabled: true`
  pra essas duas colunas, nem inicia o drag); qualquer par origem/destino
  sem ação correspondente (`resolveDrag()` retorna `{blocked:true,
  reason}`, mostra toast, nenhum PATCH é enviado).

**Sem otimismo local, e por quê isso é mais simples aqui**: a coluna de
cada card é 100% derivada do `status` real (prop `tickets`, atualizado só
pela resposta do servidor via `performAction`/`onAction`) — diferente do
quadro pessoal, não existe um "estado local de coluna" separado pra
reverter se der erro. Uma ação que falhar simplesmente não move nada;
`XflowBoardView` só mostra o toast com a mensagem do backend
(`err.message`, vindo de `apiPatch`). Verificado ao vivo com
`marcar_pronta_teste` (que exige `solution`/`whatToTest` já preenchidos,
regra só no backend — `server/xflow.js`, não duplicada no client): arrastar
sem preencher esses campos recusa com o toast `Preencha "Solução
aplicada" e "O que testar" antes.`, card intocado; preenchendo os campos
e repetindo o drag, move normal.

**Onde vive** (`src/xflow/XFlow.jsx`, sem mudança de backend/schema):
`XFLOW_BOARD_COLUMNS`/`XFLOW_STATUS_TO_COLUMN`/`XFLOW_NON_TERMINAL_ACTIVE`/
`XFLOW_BOARD_DRAG_RULES`/`XFLOW_BOARD_RESUME_RULES`/`resolveDrag()`
(dados + regra), `DragFieldPromptModal` (nível 2), `XflowBoardCard`/
`XflowBoardColumn` (mesmos campos do `TicketRow` já existente, layout
vertical; reaproveita `S.personalCol*`/`S.kanbanCount` de `App.jsx`),
`XflowBoardView` (`DndContext` com os mesmos sensores do quadro pessoal —
`PointerSensor distance:4` + `KeyboardSensor` — `useDraggable`/
`useDroppable`, sem `useSortable`/`SortableContext` porque não há
reordenação dentro da coluna). `XFlowScreen` ganhou `viewMode`
(`useState('quadro')`) e o toggle Quadro/Lista no topbar (reaproveita
`S.pbGhostBtn`/`S.pbGhostBtnActive`, mesmo estilo dos botões Arquivados/
Lixeira).

**Cor por coluna (2026-08)**: a pedido do Rafael, o Quadro do XFlow ganhou
a mesma linguagem visual do quadro pessoal (Gestão de Atividades) —
cada coluna com uma cor pastel de fundo + uma etiqueta colorida no
cabeçalho, cards brancos/`--bg-1` "encaixados" por cima (antes, todas as
colunas eram um cinza plano igual, sem separação visual real entre
colunas — exatamente o "tudo emendado numa folha só" que ele reportou).
Reaproveita a paleta já existente do quadro pessoal
(`COLUMN_COLOR_META`/`App.jsx`, 9 cores Notion-like, agora **exportado**
pra `XFlow.jsx` importar) — mas, diferente do quadro pessoal, a cor de
cada coluna do XFlow é **fixa por status** (`color` em cada entrada de
`XFLOW_BOARD_COLUMNS`), não editável pelo usuário, escolhida só pra
nenhuma coluna vizinha repetir cor (não é codificação de severidade).
As variáveis CSS `--pcol-*` (definidas hoje só dentro do `<style>` do
`PersonalBoardScreen`, então inexistentes fora dele) foram **duplicadas**
no `<style>` do próprio `XFlowScreen` — mesmo padrão já documentado
acima ("Bug de CSS corrigido") de cada tela top-level levar sua própria
cópia do CSS base que precisa.

**Ordenação + reordenação manual (2026-08)**: cada coluna do Quadro tem
um seletor "Ordenar por" (`XFLOW_SORT_OPTIONS`/`sortXflowTickets()` em
`XFlow.jsx`) com 5 modos — Prioridade (padrão, reaproveita
`smartDevSort()` já existente), Mais antiga (`createdAt` crescente),
Responsável (`whoHasTheBall()` alfabético), Produto/Plataforma
(alfabético) e Ordem manual. `sortMode` é estado local da sessão/aba
(não persiste no servidor, cada usuário escolhe o dele, mesmo espírito
dos `filters`). Só o modo **Ordem manual** lê/escreve o campo
`board_order` (novo, `DOUBLE PRECISION` em `xflow_tickets` — número
fracionário estilo Trello/Linear, recalculado no **client** a cada
arraste como o ponto médio entre os dois vizinhos, servidor só grava via
a nova ação `reordenar`, `{from:null, to:null, permission:'reorder'}` em
`xflowTransitions.js` + `reorder: () => true` em `xflowPermissions.js`
— mesmo espírito liberal de `comentar`, qualquer um que vê o quadro pode
reorganizar o que já vê). Migração `migrateXflowBoardOrder()`
(`server/db.js`, idempotente) dá a ordem inicial = ordem de criação pros
tickets que nunca foram tocados; ticket novo sempre nasce com
`board_order` = maior valor da org + 1 (fim da fila). **Arquitetura do
drag**: `XflowBoardCard` virou `useSortable` (era `useDraggable`) e cada
coluna ganhou `<SortableContext>` ao redor dos cards — mesmo padrão de
`PersonalColumn`/`App.jsx`. `XflowBoardView.handleDragEnd` resolve a
coluna de destino do mesmo jeito que o quadro pessoal já faz
(`over.data.current?.type === 'card' ? columnId do card : over.id`, já
que agora um card também pode ser alvo de soltura, não só a coluna) e
ramifica: **mesma coluna + modo manual** → calcula o `board_order` novo
e chama `reordenar`; **mesma coluna + outro modo** → não faz nada (sem
toast, mesmo silêncio que o quadro pessoal já tem pro caso idêntico);
**coluna diferente** → comportamento de mudança de status **inalterado**
(`resolveDrag`/tiers 1-3, ver acima) — arrastar entre colunas continua
funcionando igual em qualquer modo de ordenação, é uma lógica
inteiramente à parte.

## 19. Onde procurar mais detalhe

| Preciso de... | Vá para |
|---|---|
| Localizar componente/função por linha em `App.jsx` | `docs/PROJECT_MAP.md` |
| Regras de padrão de código, arquivos que não mexer, comandos | `CLAUDE.md` |
| Detalhe de responsividade mobile por tela | `docs/RESPONSIVE_ARCHITECTURE.md` |
| Histórico de decisões de produto/por quê de uma feature | memória de sessão (fora do repo) ou pedir contexto ao usuário |
