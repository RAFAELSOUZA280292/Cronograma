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
| `users` | `id, username, password_hash, name, email, role(master/pricetax/cliente), cnpj, allowed_cnpjs JSONB, blocked, block_reason, expires_at, avatar, personal_only, org_id FK, is_super_admin, xflow_role('' / reporter / dev / gestao)` | |
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
- 3 papéis: `master` (admin completo, escopado à própria org), `pricetax`
  (vê CNPJs liberados via `allowedCnpjs`), `cliente` (só o próprio CNPJ).
  `is_super_admin`: só o usuário seed inicial, cross-org total.
- `canAccessProject()`/`sameOrg()` (`server/routes.js`) checam `org_id`
  **no SQL**, não só em JS — acesso cross-org por ID direto retorna 404/403
  mesmo sabendo o ID exato.
- **Expiração é preguiçosa (lazy)**: `expires_at` só é checado dentro de
  `POST /auth/login` — se vencido, o usuário é bloqueado (`blocked=true,
  block_reason='Acesso expirado'`) **naquele momento**, não antes. Um usuário
  vencido que não tenta logar continua aparecendo como "não bloqueado" na
  lista de usuários até a próxima tentativa de login dele.
- Guardas em `DELETE/PATCH /users/:id` e `POST /users/:id/block`: ninguém
  pode bloquear/excluir a si mesmo; excluir o último `role='master'` **da
  mesma org** é bloqueado (`COUNT(*) <= 1`). Super Admin ignora o filtro de
  org nesses updates via `sameOrg()` (retorna `true` se `isSuperAdmin`).
- `POST /projects` (criar empresa): se quem cria é `role='pricetax'`, o CNPJ
  da empresa criada é **automaticamente adicionado** ao `allowedCnpjs` de
  quem criou — não precisa de passo manual de liberação depois.
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

EXPORT Excel/PDF
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

## 13. Regras de negócio (resumo)

- Cliente só vê o projeto do próprio CNPJ; PRICETAX vê CNPJs liberados
  (`allowedCnpjs`); Master vê tudo (dentro da própria org).
- Cadastro de empresa exige tipo de cliente (Diagnóstico / Diagnóstico e
  Consultoria Contínua / POC-Demonstração) só na criação. Filtros por
  Tipo/Status/Regime Tributário na tela de seleção de empresas.
- Sem checagem de conflito de datas entre empresas (removida a pedido
  explícito) — datas de atividade são livres.
- Exclusão de atividade/subatividade/usuário-master-único tem guarda (frase
  de confirmação ou bloqueio de "não pode remover o último admin").
- `personalOnly=true` no usuário: pula seleção de módulo/empresa, entra
  direto no quadro pessoal, sem botão de voltar.
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
- **Descrição é rich text** (`RichTextEditor` em `XFlow.jsx`): negrito,
  itálico, sublinhado, fonte (padrão/serifada/monoespaçada), alinhamento,
  lista, citação — via `document.execCommand` num `contentEditable`
  (sem lib de editor; único campo do XFlow com essa tratativa, os outros
  continuam textarea plana via `ContentField`). `value` só resincroniza o
  `innerHTML` quando o campo **não está em foco** (`document.activeElement`),
  senão o cursor pula a cada tecla — truque padrão pra contentEditable
  controlado. Colar print/imagem no meio do texto insere inline **e**
  adiciona em Evidências ao mesmo tempo (mesmo limite de 8MB dos anexos
  normais). Guardamos HTML agora, não texto puro — **sanitização em duas
  camadas**, nenhuma confia só na outra: DOMPurify no frontend
  (`sanitizeRichText`, allow-list de tags/atributos, hook customizado
  garantindo que todo `<img>` sem `src` começando literalmente em
  `data:image/` é removido — o filtro de esquema do DOMPurify sozinho não
  pega uma URI sem `://`, tipo `src="x"`) e `sanitize-html` no backend
  (`sanitizeDescriptionHtml` em `server/xflow.js`, mesma allow-list +
  `exclusiveFilter` equivalente — aplicado tanto em `POST /tickets` quanto
  em `editar_campo`). Testado com payload malicioso real (`<script>`,
  `onerror`, `<iframe>`, `href="javascript:"`, `img` remoto) via curl —
  tudo removido, só a formatação e imagem `data:` legítimas sobrevivem.
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
  (`xflowRole`/`!personalOnly`) — nunca aparece um link pra um módulo que o
  usuário não pode entrar.
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
  cliente e Descrição — os 4 já eram os únicos campos visíveis fora do
  `<details>` colapsável, só faltava `clientType` entrar de fato no cálculo
  de `requiredOk` (as outras três já eram validadas desde a v2). Marcador
  visual (`*` vermelho) ao lado dos 4 labels.
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
- **Fora do escopo ainda** (não pedido/não decidido): calendário útil no
  SLA (hoje é tempo corrido), notificação de @menção via o sino do
  Cronograma (comentários do XFlow ainda não aparecem lá), BUGs
  recorrentes/reincidência por módulo, subtarefas, dependência estruturada
  entre tickets (duplicidade é só um id de texto livre, não bidirecional).

## 19. Onde procurar mais detalhe

| Preciso de... | Vá para |
|---|---|
| Localizar componente/função por linha em `App.jsx` | `docs/PROJECT_MAP.md` |
| Regras de padrão de código, arquivos que não mexer, comandos | `CLAUDE.md` |
| Detalhe de responsividade mobile por tela | `docs/RESPONSIVE_ARCHITECTURE.md` |
| Histórico de decisões de produto/por quê de uma feature | memória de sessão (fora do repo) ou pedir contexto ao usuário |
