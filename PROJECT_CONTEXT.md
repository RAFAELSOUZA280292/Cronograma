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
| GET `/xflow/tickets` | `requireXflowAccess` | todos os papéis recebem todos os tickets da org (2026-08 — visibilidade não é mais por dono, ver §18) |
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
  única exceção onde a **URL** importa pra navegação.
- **Histórico do navegador sem roteador (2026-08, Níveis 1, 2 e 3 —
  completo)**: o botão Voltar do navegador simplesmente saía do site
  (nenhuma navegação dentro do app virava entrada de histórico) —
  reportado pelo Rafael. Corrigido sem introduzir rota nenhuma:
  `history.pushState({navTag}, '', mesma URL)` a cada navegação
  "reconhecível" — a URL **nunca muda** (só o `state` da entrada), então
  não colide com a rota pública `/quadro/:token` acima. **De propósito
  não cobre** troca de aba (Resumo/Gantt/Tabela/Fases/Quadro), filtros, ou
  modais de edição (Editar empresa, Novo usuário etc.) — só os pontos
  listados abaixo.
  - **Nível 1 — troca de módulo** (`App.jsx`): Empresas/Gestão de
    Atividades/XFlow + telas de admin (Usuários/Organizações), via 3
    helpers (`goToWorkspace(mode)`, `goToUsers(open)`, `goToOrgAdmin(open)`)
    que substituem **todo** call site que antes chamava
    `setWorkspaceMode`/`setShowUsers`/`setShowOrgAdmin` direto (exceção:
    `handleLogout()` e o reset automático de `workspaceMode` no
    `useEffect` de troca de `currentUser`/`actingOrg` — ambos são resets
    automáticos, não navegação de usuário). Um `popstate` listener
    (`applyLocationTag()`) refaz o estado ao navegar pelo histórico.
  - **Nível 2 — sub-navegação dentro do módulo**: cada módulo tem seu
    próprio esquema, todos seguindo o mesmo padrão (tag + `pushState` +
    `popstate` local, sem interferir no listener de Nível 1 porque a tag
    de módulo — `navTag` — nunca muda dentro do mesmo `pushState`, só o
    campo extra):
    - **Empresas**: `locationTag()` ganhou um 4º parâmetro (`selected`,
      = `companySelectionConfirmed`) — `'company:select'` (seletor de
      empresas) vs `'company'` (workspace confirmado). Helpers
      `goToCompanySelector()`/`confirmCompanySelection(ids)` substituem os
      `setCompanySelectionConfirmed` diretos nos botões "Trocar empresas"
      e "Continuar"; `enterOrganization()`/`exitOrganization()` (Super
      Admin) e a criação de Grupo Empresarial (que auto-confirma a seleção)
      também empurram a tag certa. O efeito que auto-confirma pra quem tem
      0-1 empresa **não** empurra nada (nunca existiu seletor pra
      "desfazer").
    - **XFlow** (`XFlow.jsx`, local a `XFlowScreen`): um segundo campo no
      mesmo `state`, `xflowSub` (`'quadro'`/`'lista'`/`'archived'`/
      `'trash'`), somado ao `navTag:'xflow'` que o Nível 1 já põe.
      `goToXflowView(mode)`/`toggleXflowArchived()`/`toggleXflowTrash()`
      substituem os `setViewMode`/`setShowArchived`/`setShowTrash` diretos.
      Estado inicial é lido direto de `window.history.state` no mount (não
      dá pra confiar só no `popstate` — se `XFlowScreen` **monta** por
      causa de um Voltar/Avançar que troca de módulo, o listener dela
      ainda nem existia quando o evento disparou).
    - **Gestão de Atividades** (`App.jsx`, local a `PersonalBoardScreen`):
      mesmo padrão, campo `personalSub` = id da página/board ativa.
      `goToBoardPage(boardId)` substitui os `setActiveBoardId` diretos (aba
      clicada e `addBoard()`). **Nunca ativo em `publicMode`** (a tela
      pública de `/quadro/:token` reaproveita este mesmo componente, mas
      não deve tocar em `window.history` — é a exceção de URL real).
    - Todos os três seguem a mesma regra de ouro do Nível 1: o `popstate`
      handler de cada um só reage se `state.navTag` for o dele
      (`'xflow'`/`'personal'`) — se for outro módulo, quem cuida é o
      listener do Nível 1 em `App.jsx` (o componente filho já vai
      desmontar).
  - **Nível 3 — abrir/fechar modal de detalhe** (empilha em cima do
    `state` atual, sem trocar `navTag` nem os campos de Nível 2 — só soma
    um campo novo): `ActivityDetailModal` (`detailActivity: {pid, id}`,
    `App.jsx`), `TicketDetailModal` (`detailTicket: id`, `XFlow.jsx`,
    local a `XFlowScreen`) e `PersonalCardDetailModal` (`detailCard:
    {colId, cardId}`, `App.jsx`, local a `PersonalBoardScreen` — nunca
    ativo em `publicMode`, mesma exceção do Nível 2). Cada um tem um par
    `open*Detail()`/`close*Detail()`: abrir sempre faz `pushState` com o
    `state` atual espalhado (`{...cur, detailX: ...}`) — preserva
    `navTag`/`xflowSub`/`personalSub` de quem quer que seja o módulo
    atual; fechar (`close*Detail()`) chama `history.back()` **em vez de**
    limpar o estado direto (só cai pro `setX(null)` direto se por algum
    motivo não tinha `detailX` no `state`, ex.: modal aberto antes desse
    código existir) — assim o botão X, clicar fora e apertar Voltar
    físico chegam todos no mesmo resultado, e Avançar continua
    funcionando pra reabrir. O `popstate` listener de cada módulo (o
    mesmo do Nível 2, sem listener novo) ganhou mais uma linha lendo o
    campo `detailX` do `state` recebido. **Todo** call site de abrir
    (inclusive criar atividade/TASK/card e já abrir o detalhe, e o clique
    a partir de Menções) passa pelos helpers; exclusão bem-sucedida
    também fecha via `close*Detail()` (não `set*(null)` direto), pra não
    deixar uma entrada de histórico apontando pra um item que acabou de
    ser excluído. **Limitação conhecida e aceita**: apertar o botão
    físico Voltar do navegador com edição não salva no modal **não**
    dispara o `ConfirmDiscardModal` (o `popstate` já aconteceu quando o
    código roda, não dá pra interceptar antes) — só fechar pelo X/clicar
    fora passa pela guarda de rascunho, porque só nesses casos o
    `requestClose()` de cada modal roda antes do `history.back()`.
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
- **"Data confirmada com o cliente?" (2026-08)**: checkbox `activity.clientDateConfirmed`
  (booleano, JSONB — sem migração de schema), logo abaixo de "Horário da
  reunião" no `ActivityDetailModal`, mesmo padrão visual do checkbox
  "Obrigatória". Aparece no **Resumo** da empresa (`ResumoTable`/
  `ResumoCard`) como um badge verde "✓ Confirmado c/ cliente" ao lado da
  data — junto com o horário da reunião, exatamente onde o Rafael pediu
  ("no quadro resumo... onde vemos o cronograma, horário da reunião e o
  ticket de confirmado com o cliente"). Sem indicador quando desmarcado —
  não é um "não confirmado" em vermelho, só ausência do badge verde
  (estado default, não é uma exceção que precise de destaque).
- **Nova atividade abre direto pra edição (2026-08)**: `addActivity()`/
  `addGroupWideActivity()` chamam `openActivityDetail(pid, na.id)` logo
  depois de criar — antes a atividade nascia no final do array e ficava
  "perdida" na lista (ordenada por data, uma atividade recém-criada sem
  data nenhuma podia acabar em qualquer posição), sem indicação nenhuma
  de que tinha sido criada. Cobre os 3 pontos de entrada que já passavam
  por `addActivity` (toolbar da Tabela, "+ Nova atividade em X" da visão
  multi-empresa, Kanban do Quadro) e o de `addGroupWideActivity` (modal
  de atividade de grupo).
- **Bug encontrado nesse mesmo teste**: `S.tab`/`S.tabActive` (abas
  Resumo/Gantt/Tabela/Fases/Quadro no topo da empresa) misturavam
  `border` (shorthand) com `borderColor`/`borderBottomColor` (longhand)
  ao trocar de aba — mesma classe de bug já corrigida em Agenda/XFlow/
  Visão Macro nesta sessão. `S.tab` passou a usar
  `borderWidth`/`borderStyle`/`borderColor` em vez do shorthand `border`.
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
- **"Clonar empresa"/"Cadastrar empresa" travava sem nenhum aviso**
  (`CreateCompanyModal`, `App.jsx`): o botão de submit tinha
  `disabled={saving || !form.name.trim() || !form.clientType}` — sem
  `clientType` selecionado (ou `name` vazio), o botão de HTML fica
  desabilitado e o clique **nem chega a disparar o evento**, sem nenhum
  toast/erro. Havia uma dica discreta abaixo dos chips de tipo de
  cliente, mas era fácil rolar a tela e não perceber por que o clique
  "não fazia nada". Corrigido: botão só desabilita durante `saving`
  (evita duplo-clique); a validação virou parte de `submit()`, que
  agora sempre mostra uma mensagem de erro clara (`setError(...)`, a
  mesma caixa vermelha já usada pra erro de rede) explicando
  exatamente o que falta preencher. **Lição**: `disabled` baseado em
  validação de formulário é sempre um risco de "clique morto" — prefira
  deixar o botão clicável e mostrar o erro dentro do próprio handler.

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
- **Escopo**: por organização (`xflow_tickets.org_id`) — dentro da mesma
  org, **todo mundo vê todas as TASKs**, `reporter` incluído (2026-08,
  pedido explícito do Rafael: "as TASKS do XFLOW precisa aparecer para
  todos usuários"). A v2 original tinha ido na direção oposta (reporter só
  via os próprios tickets, tanto em `GET /xflow/tickets` quanto em
  `GET /xflow/tickets/:id/events` e no `PATCH /xflow/tickets/:id`) — essa
  restrição de **visibilidade** foi removida dos três pontos; o que
  continua de pé é a autorização de **ação** (linha abaixo) — `canDo()` já
  usava `isOwner()` pros casos onde só o dono-reporter pode agir (editar
  conteúdo enquanto aberta, aprovar/reprovar validação, reabrir, fechar sem
  desenvolver, excluir), então tirar o filtro de visibilidade não abriu
  brecha de ação nenhuma: um reporter agora vê e comenta (`comentar` já
  era `() => true` pra todo mundo) em TASK de outro solicitante, mas as
  ações restritas ao dono continuam invisíveis/bloqueadas pra ele. Testado
  localmente com 2 usuários `reporter` disponíveis (`xtest-rep-a`/`b`,
  descartados depois do teste): A cria, B vê no Quadro e na Lista, B
  comenta com sucesso, B não vê "Fechar sem desenvolver"/"Excluir" (ações
  de dono) no ticket de A.
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

**Filtro + contagem por "Responsável atual" (2026-08)**: pedido do Rafael
pra ele e outras pessoas verem "quais atividades estão com quem" e
"quantas cada um tem". **Não é o mesmo que `assigneeId`** (atribuição
fixa a um dev, já existia como filtro "Atribuído a", renomeado do antigo
"Todo responsável" pra não confundir os dois) — é o **ball holder**
(`ballHolderType`/`ballHolderUserId`, quem precisa agir *agora*, muda
sozinho conforme o ticket anda no fluxo, ver `whoHasTheBall()`). Nova
função `ballHolderKey(t)` (`XFlow.jsx`) normaliza isso numa chave estável
pra filtro/contagem — `dev:<userId>` pra um dev específico, ou um balde
fixo (`gestao`/`reporter`/`terceiro`/`triage_queue`) pros outros tipos;
existe separada de `whoHasTheBall()` porque o rótulo de exibição pra
`reporter` varia com `waitingOnType` (fragmentaria a contagem em vários
grupos minúsculos se fosse usado como chave). `FilterBar` ganhou o select
"Responsável atual" (novo prop `teamById`, hoje passado em **todos** os 6
pontos que renderizam `FilterBar` — Quadro, as três Homes, Arquivados e
Lixeira — antes só `GestorHome` recebia `team` pro filtro de atribuição);
opções são os devs (`xflowRole==='dev'` em `teamById`) + os 4 baldes
fixos. `GestorHome` ganhou um painel "Por responsável atual" ao lado do
já existente "Por DEV (carga ativa)" — mesma contagem mas cobrindo todo
mundo (não só dev) e refletindo o estado atual, não a atribuição fixa;
cada linha é clicável e aplica/limpa o filtro (toggle), sem precisar
abrir o select.

**Ajuste (2026-08, mesmo dia, pedido explícito do Rafael)**: a lista do
select **não é mais "todo mundo com papel de dev"** — vira exatamente
quem aparece hoje no campo "Quem está com a bola" de algum ticket. Um
dev sem nenhum ticket na mão (usuário ativo que só abre TASK, ex. dado
no pedido: "Eduarda") não deve aparecer. Implementado com
`presentBallHolders = new Set(tickets.map(ballHolderKey))` dentro do
próprio `FilterBar` (novo prop `tickets`, passado nos mesmos 6 pontos
que já passam `teamById`) — filtra tanto a lista de devs quanto os 4
baldes fixos (`gestao`/`reporter`/`terceiro`/`triage_queue`), todos só
aparecem se tiverem pelo menos 1 ticket agora. Testado localmente com
`psql` direto (criar/apagar ticket de teste com `ball_holder_user_id`
apontando pro dev) — confirmado que o nome só aparece/some junto com o
ticket.

**Ajuste (2026-08, pedido do Rafael): nomes dentro da "Fila de
triagem"**. O balde `triage_queue` sozinho não dizia de quem era a task
parada — agora o select também lista, por baixo de "Fila de triagem:
todos", um item por solicitante (`reporterId`) que tem pelo menos 1
ticket parado em `triage_queue` no momento (`triageReporters` em
`FilterBar`, mesmo `Map`-por-id + sort alfabético que os devs já usam).
Valor do filtro é `triageReporter:<userId>`; `matchesFilters()` trata
como caso especial (exige `ballHolderKey(t)==='triage_queue'` **e**
`t.reporterId` igual ao escolhido) porque não é uma chave estável de
`ballHolderKey()` como as outras — é um recorte dentro do balde
`triage_queue`, não um balde novo.

### 18.2 Vínculo entre TASKs, citação automática e link permanente (2026-08)

Pedido do Rafael: uma TASK precisa poder referenciar/se vincular a outra,
cada TASK precisa de URL própria e permanente, e citar "#30" em qualquer
texto precisa virar link clicável.

- **Vínculo genérico bidirecional**: novo campo `linkedTicketIds` (array
  de ids, dentro do `data` JSONB — não é campo relacional, `db.js` só
  ganhou uma entrada nova em `blankXflowTicketData()`). Duas ações novas
  (`vincular_ticket`/`desvincular_ticket`, permissão `link_tickets: () =>
  true`, mesmo espírito liberal de `comentar`/`reordenar` — não é dono
  de conteúdo, é metadado organizacional). `server/xflow.js` grava dos
  **dois lados** dentro da mesma transação (`SELECT ... FOR UPDATE` do
  ticket alvo, atualiza o `data` dele também, loga evento nos dois) —
  resposta do PATCH inclui `relatedTicket` além de `ticket`, e
  `performAction()` (`XFlow.jsx`) mescla os dois no estado local, sem
  precisar recarregar a lista inteira. UI: seção "TASKs vinculadas" no
  `TicketDetailModal` — lista as já vinculadas (nome + status + botão de
  remover) e um campo de busca por número/título/palavra-chave (filtra o
  `allTickets` já carregado em memória — visibilidade já é org-wide desde
  §18.1, então a busca sempre acha qualquer TASK da org). Clicar numa
  vinculada chama `onOpenTicket(id)` (mesmo `openTicketDetail` do Nível 3
  de histórico) — empilha no histórico, Voltar retorna pra TASK anterior.
- **Citação automática "#30" → link clicável**: em **comentários**,
  `renderCommentText()` (já tratava `@menção`) ganhou um segundo padrão
  `#\d+` no mesmo passe de tokenização — só vira `<a>` se o número
  existir em `ticketsByNumber` (mapa por número montado a partir de
  `allTickets`), senão fica texto puro (não cria link morto). Na
  **Descrição** (Tiptap), como o HTML salvo não pode ganhar marcação
  extra a cada render (senão o "#30" digitado vira permanentemente um
  link fixo no documento, e uma citação a um número que passa a existir
  depois nunca seria reconhecida), a solução foi uma
  **Decoration do ProseMirror** (`TicketRefExtension`, novo pacote
  `@tiptap/pm` adicionado): decorations são só de exibição, nunca tocam o
  documento armazenado. O extension lê o mapa de tickets válidos e o
  callback de abrir via uma função `getState()` passada em
  `.configure()` que sempre lê de um `ref` atualizado por `useEffect`
  (mesmo motivo do `onChangeRef`/`onCommitRef` já usados no
  `RichTextEditor` — `useEditor` só lê `extensions` na criação, então sem
  ref o clique sempre veria o primeiro conjunto de tickets). Testado:
  digitar "#46" já sublinha ao vivo (antes mesmo do blur/save), e o clique
  abre a TASK certa.
- **Link permanente por TASK**: `openTicketDetail()` (`XFlow.jsx`) agora
  soma `#<número>` na URL dentro do mesmo `pushState` que já empilha o
  Nível 3 — Voltar desfaz os dois juntos, de graça. Botão "Copiar link"
  (ícone ao lado do X, no topo do `TicketDetailModal`) monta
  `origin+pathname+search+#numero` e usa `navigator.clipboard`. Pra abrir
  um link desses num carregamento novo (não só navegando dentro do app já
  aberto): `App.jsx` ganhou um efeito (`hashXflowNavDone`, roda uma vez
  quando `currentUser` aparece) que salta pro workspace XFlow se a URL já
  chega com `#<dígitos>` — **precisa estar declarado depois** do efeito
  que zera `workspaceMode` a cada troca de `currentUser` (ordem de
  `useEffect` importa: dois efeitos com a mesma dependência rodam na
  ordem em que aparecem no componente; declarado antes, o reset ganhava e
  desfazia o salto — bug real encontrado e corrigido durante o teste).
  Dentro do `XFlowScreen`, outro efeito (`hashOpenDone`, roda uma vez
  quando `loaded` vira `true`) acha a TASK pelo número e chama
  `openTicketDetail` — número que não existe na org mostra toast "TASK
  não encontrada" em vez de falhar silenciosamente. Testado numa aba nova
  (carregamento real, não troca de hash dentro do app já montado — isso
  não dispara o efeito por dependência de `currentUser`/`loaded`, só uma
  montagem nova do zero): `.../#46` loga automaticamente, entra direto no
  XFlow e abre o BUG #46.

**Dois bugs reais corrigidos durante esse trabalho (não pedidos
originalmente nesse texto, mas achados investigando os itens acima e o
pedido de reatribuição/calendário abaixo):**

- **Responsável "voltando" pra quem não devia** (pedido do Rafael: "quando
  a Amanda ou alguém trocar o responsável... não fique retornando"):
  reproduzido via API — `redirecionar` atribuía a TASK a um dev enquanto
  ainda `aberta`; a ação `aceitar` (disparada também ao **arrastar** o
  card de "Aberta" pra "Atribuída" no Quadro, e alcançável por
  dev/gestão) sobrescrevia incondicionalmente `assignee_id` pra quem
  clicou/arrastou, mesmo já havendo um responsável definido. Corrigido em
  `server/xflow.js` (`aceitar`/`iniciar_dev_direto`): só auto-atribui pra
  quem agiu quando **ninguém** estava atribuído ainda
  (`row.assignee_id || req.user.id`); se já tinha responsável, preserva.
- **Calendário "bugado" (ano virando 0026 em vez de 2026)**: reproduzido
  digitando ano dígito a dígito nos campos Prazo/Previsão de
  conclusão/Data da ocorrência do `TicketDetailModal` — eram
  `<input type="date">` controlados direto por `onChange`, disparando
  `PATCH` a **cada tecla**; a resposta do servidor re-renderizava o
  `value` do input nativo **enquanto o usuário ainda digitava o ano**,
  resetando o estado interno do campo (o navegador então preenchia o ano
  parcial com zero à esquerda, e podia até apagar dia/mês já digitados).
  Corrigido trocando os três `<input type="date">` por
  `<ContentField as="input" type="date" .../>` — mesmo componente que já
  existia pra outros campos, com rascunho local e `onCommit` só no
  `blur` (só salva quando o usuário termina de digitar e sai do campo,
  nunca no meio). Não foi construído um calendário customizado (widget de
  navegação por mês/ano) — o defeito relatado era a corrupção do valor,
  já resolvida; o calendário nativo do navegador (ícone 📅) segue sendo o
  mesmo, agora sem nada interrompendo ele no meio da digitação.

**Mais dois bugs corrigidos (2026-08, reportados pelo Rafael com
screenshot de uma TASK real em "Em desenvolvimento")**:

- **"Responsável atual" escondia gente real**: a lista de devs em
  `FilterBar` (§18.1) exigia `m.xflowRole === 'dev'` além de estar em
  `presentBallHolders` — mas `ballHolderKey()` gera `dev:<id>` pra
  **qualquer** ticket com `assignee_id` setado, seja lá qual for o papel
  de quem foi atribuído (gestão/admin também viram responsável de uma
  TASK via `reatribuir`, que permite atribuir a qualquer um, não só a
  quem tem papel de dev). Um gestor definido como responsável de uma TASK
  em desenvolvimento simplesmente não aparecia no filtro, apesar de
  aparecer certinho como "QUEM ESTÁ COM A BOLA" dentro da própria TASK.
  Corrigido removendo a exigência de papel — a lista agora é exatamente
  "quem tem `dev:<id>` em algum ticket agora", sem filtro de cargo,
  batendo com o que o comentário do código já dizia ser a intenção
  original.
- **Produto/Plataforma não dava pra editar depois de aberta**: só existia
  como texto fixo em "Dados capturados" (`Produto: {ticket.product}`) —
  a única forma de mudar era a ação "Redirecionar" (triagem), que só
  existe nos status `aberta`/`atribuida`; uma TASK já em desenvolvimento
  (ou mais adiante) não tinha nenhum jeito de corrigir ou preencher esse
  campo. Virou um `<select>` editável de verdade (mesmo padrão de "Tipo
  de cliente" ao lado) chamando `editar_campo` com `field: 'product'`.
  Detalhe da implementação: `product` é coluna relacional
  (`xflow_tickets.product`), não uma chave do `data` JSONB — precisou de
  um caso especial dentro do handler de `editar_campo` (igual `title`/
  `description` já tinham) pra gravar em `rel.product` em vez de
  `data.product`; gravar do jeito genérico (`data[field] = value`) teria
  parecido funcionar na hora mas não teria efeito nenhum de verdade,
  porque `rowToTicket()` lê a coluna relacional, não essa chave do
  `data`. Testado localmente: TASK criada com um produto, movida até "Em
  desenvolvimento", produto trocado por lá — persistiu na coluna certa e
  registrou `Campo "product" atualizado` na timeline.

**Contador da Previsão de conclusão (2026-08, pedido do Rafael: "deixe
claro em exibição... adicione um contador")**: `expectedCompletionBadge(dateStr)`
(`XFlow.jsx`, perto de `daysSince()`) — monta a data em horário local
(`new Date(y, m-1, d)`, não `new Date(iso)` direto, que cairia em UTC
meia-noite e podia virar o dia errado dependendo do fuso) e compara com
hoje: `Atrasada Xd` (vermelho, atrasada), `Entrega hoje` (laranja),
`Falta 1 dia` (laranja), `Faltam X dias` (azul, 2+ dias). Aparece nos 3
lugares onde a Previsão já era mostrada — card do Quadro
(`XflowBoardCard`), linha da Lista (`TicketRow`) e cabeçalho do
`TicketDetailModal` — sempre ao lado da data por extenso, nunca no lugar
dela. Testado localmente nos 3 estados (faltando dias, hoje, atrasada) e
nos 3 lugares.

**Diferença entre Prazo e Previsão de conclusão explicada na tela
(2026-08, pedido do Rafael)**: os dois campos são datas parecidas mas com
dono e sentido diferentes, e isso não estava claro pra quem abre a TASK.
`fieldHint` abaixo de cada um dentro do `TicketDetailModal`: Prazo —
"Prazo esperado de quem abriu a TASK, com base na urgência do cliente e
do time interno — não é a entrega combinada pelo dev."; Previsão de
conclusão — "Data que o dev define como a entrega correta — visível para
solicitante, dev e gestão." (esse segundo texto substituiu um hint antigo
que dizia o oposto — "Estimativa de quem abriu a TASK" — que já estava
desatualizado). Só texto explicativo, **não mudou permissão de quem edita
cada campo** — `editar_prazo_proxima_acao` (Prazo/Próxima ação) continua
restrita a dev-responsável/gestão/admin, `edit_content` (Previsão de
conclusão) continua liberada também pro solicitante-dono em status
iniciais, exatamente como já era antes (ver §18 pra matriz completa).

**Preview de imagem em Evidências, sem precisar baixar (2026-08, pedido
do Rafael)**: antes, clicar em qualquer anexo (nome ou miniatura) sempre
disparava download direto, mesmo pra imagem. Agora, quando
`ev.type` começa com `image/`, clicar na miniatura ou no nome abre um
lightbox em tela cheia (`previewEvidence`, estado local do
`TicketDetailModal`) com a imagem ampliada, nome do arquivo e um botão
"Baixar" explícito ao lado do fechar — o download continua disponível,
só deixou de ser a única ação possível. Anexos que não são imagem
continuam exatamente como antes (clique = download direto, sem preview,
porque não faria sentido abrir "em tela" um PDF/zip/etc. do mesmo jeito).
**Bug corrigido durante o teste**: o overlay do lightbox, ao fechar
clicando fora da imagem, não chamava `stopPropagation()` — o clique
"vazava" pro overlay do `TicketDetailModal` por trás (que fecha ao
clicar fora dele), fechando os dois de uma vez em vez de só o lightbox.
Testado localmente: abrir preview pela miniatura e pelo nome, baixar
pelo botão dentro do lightbox, fechar clicando fora (só fecha o preview,
TASK continua aberta) e pelo X.

## 19a. Autoatendimento de conta (2026-08)

`MyProfileModal` (`App.jsx`, aberto pelo avatar no topo — "Meu perfil")
já existia pra trocar o emoji de avatar (`PATCH /api/auth/me`); ganhou
uma seção "Trocar senha" logo abaixo do botão Salvar do avatar, com 3
campos (senha atual, nova, confirmar) e botão próprio — ação imediata,
não passa pelo guard de "descartar alterações" do avatar (`isDirty` só
rastreia o avatar, senha nunca fica em rascunho). Novo endpoint
`POST /api/auth/change-password` (`server/routes.js`, `requireAuth`,
qualquer usuário logado — não é rota de master) confere `currentPassword`
com `comparePassword()` contra o próprio hash antes de gravar o novo
(`bcrypt`, mesma validação de tamanho mínimo — 4 caracteres — do reset
de senha do admin). Erros ("Senha atual incorreta", senha curta,
confirmação não confere) aparecem inline no modal; sucesso mostra
"Senha alterada com sucesso." e limpa os campos. Testado localmente: senha
atual errada barra corretamente, senha certa troca e permite login
imediato com a nova senha.

**Trocar senha direto na tela de login (2026-08, pedido do Rafael)**:
`LoginGate` ganhou um segundo modo (link "Trocar senha" abaixo do botão
Entrar) — pra quem só tem a senha antiga em mãos, sem precisar logar
primeiro e depois abrir "Meu perfil". Formulário pede usuário + senha
atual + nova senha (2x); ao confirmar, troca a senha **e já loga**, sem
etapa extra. Endpoint próprio `POST /api/auth/change-password-login`
(`server/routes.js`, sem `requireAuth` — ainda não existe sessão nesse
ponto) espelha exatamente a validação de `/auth/login` (usuário
existe, não bloqueado, não expirado) antes de conferir a senha atual
com `comparePassword()`; se tudo bate, grava o hash novo, assina o JWT
e seta o cookie igual ao login normal — front só troca `setCurrentUser`,
não tem uma segunda chamada de login depois. Mensagens deliberadamente
assimétricas com o login normal (usuário inexistente → "Usuário ou
senha inválidos.", senha atual errada → "Senha atual incorreta.") —
mesmo padrão já usado no `POST /api/auth/change-password` autenticado.
Testado localmente: senha atual errada barra com a mensagem certa;
senha certa troca e entra direto no workspace, sem precisar digitar a
senha nova de novo numa tela de login separada.

## 20. Central de Notificações (2026-08)

Pedido do Rafael: sino 🔔 global (mesmo contador/lista nas 3 telas —
Empresas, Gestão de Atividades, XFlow), notificação sempre que o usuário
for citado/mencionado/vinculado em qualquer ponto do sistema, painel
clicável que leva direto pro lugar exato, marcar lida/não lida/todas
lidas, contador dinâmico, e log de "quem visualizou" em cada TASK do
XFlow. Substituiu por completo o mecanismo antigo de "Menções" (bell só
em Empresas, cutoff `mentionsSeenAt` salvo em `localStorage`, sem estado
por notificação — abrir o painel já marcava tudo como visto).

### Schema e leitura

Tabela nova `notifications` (`server/db.js`) — relacional porque precisa
de leitura/escrita por linha (marcar uma de cada vez) e índice por
usuário+lida, o que um blob JSONB não faria bem:
`id, org_id, user_id, type, title, body, actor_name, target (JSONB), read, created_at`.
`target` carrega o suficiente pra navegar direto pro lugar exato (não tem
router real, ver §9) — dois formatos hoje: `{kind:'xflow_ticket',
ticketId}` e `{kind:'activity', projectId, activityId}`. Helper de escrita
compartilhado em `server/notifications.js` (`createNotification()`,
usado tanto por `xflow.js` quanto por `routes.js`). Rotas de leitura/
estado em `server/routes.js`: `GET /notifications` (últimas 200, mais
recente primeiro), `PATCH /notifications/:id` `{read}`,
`POST /notifications/read-all`, e `POST /notifications/mark-read-for-target`
(usada quando o usuário **acessa** a ocorrência, não só quando marca
manualmente — ver regra abaixo).

### Geração — XFlow (`server/xflow.js`)

Dentro do mesmo `PATCH /tickets/:id` que já processa a ação (uma lista
`notificationsToCreate` é preenchida durante o `switch` e inserida no fim,
antes do `COMMIT`, mesma transação):
- `comentar`: pra cada `mentions[]` do comentário, exceto o próprio autor
  — `type: 'xflow_mention'`.
- `reatribuir` / `redirecionar` (quando muda `assigneeId` pra alguém
  diferente de quem já estava e diferente de quem agiu): `type:
  'xflow_assigned'`. `aceitar`/`iniciar_dev_direto` (auto-atribuição) não
  geram nada — não faz sentido notificar alguém de uma ação que ele
  mesmo tomou.

### Geração — Empresas (`server/routes.js`, `notifyActivityChanges()`)

Diferente do XFlow (ações discretas), atividade é salva como o **projeto
inteiro** de uma vez (autosave, `PATCH /projects/:id` recebe o blob
completo). A única forma de saber o que mudou de fato é comparar
antes/depois — a rota já tinha `current` (lido do banco antes do UPDATE)
e `next_` (payload recebido), então o diff acontece ali mesmo, na mesma
requisição, antes de responder:
- **Comentário novo com menção**: por atividade, `id` de comentário que
  existe em `next_` mas não em `current` → `mentions[]` dele vira
  `type: 'activity_mention'`.
- **Responsável definido**: `a.responsible` mudou → se o novo valor bate
  (case-insensitive, comparado contra `users.name` da org) com um
  usuário real → `type: 'activity_assigned'`.
- **Vinculado a atividade**: nome novo em `a.participants` (que não
  estava lá antes) que bate com um usuário real → `type:
  'activity_linked'`.
- Em todos os casos: nunca notifica o próprio ator, e atividade nova
  (sem `before`) só passa pelo caminho de menção em comentário (não tem
  "antes" pra comparar responsible/participants contra).

**Limitação conhecida e aceita**: `responsible`/`participants` de uma
atividade são **texto livre** (nome de papel/departamento dentro de
`project.team`, ex. "Financeiro", "Fiscal" — não uma referência a
`users.id`, ver `defaultTeam()` em `db.js`). A notificação só dispara
quando esse texto **bate exatamente** (case-insensitive) com o nome de
algum usuário real logado da mesma org — um "Financeiro" que não
corresponde a ninguém logado simplesmente não notifica ninguém (esperado,
não é bug). Não foi criado um campo novo de vínculo usuário↔papel pra
isso — mapear por nome já cobre o caso descrito pelo Rafael sem mudar o
modelo de dados de Empresas.

### Registro de leitura da TASK ("quem abriu, quando")

`POST /xflow/tickets/:id/view` (`server/xflow.js`) — chamado pelo cliente
toda vez que o `TicketDetailModal` abre (`useEffect` em `[ticket.id]`,
não em `ticket.updatedAt` — senão bateria a cada ação, não só ao abrir).
Grava um evento `type: 'view'` em `xflow_events` com nota
`"<Nome> visualizou esta TASK"` — aparece na timeline igual qualquer
outro evento, de graça (a timeline já renderiza qualquer `type !==
'comment'` genericamente). **Dedup**: não grava de novo se o MESMO
usuário já tem um `view` pra essa TASK nos últimos 5 minutos — evita
spam de abrir/fechar repetido. A mesma chamada também marca como lida
qualquer notificação pendente apontando pra essa TASK (`target->>'kind'=
'xflow_ticket' AND target->>'ticketId'=id`) — é o "acessar a ocorrência"
da regra abaixo.

### Regra de leitura (explícita do Rafael)

Abrir o **painel** do sino NUNCA marca nada como lido sozinho — só três
coisas tiram uma notificação da contagem: (1) botão "Marcar lida" no
item, (2) botão "Marcar todas como lidas" no topo do painel, ou (3) o
usuário **acessar de fato** a ocorrência (abrir a TASK ou a atividade
referida — clicar na notificação já faz isso, mas abrir o mesmo item por
qualquer outro caminho, ex. um link `#N` direto, também conta). "Marcar
não lida" existe e funciona ao contrário — testado manualmente.

### Frontend — componente compartilhado

`NotificationBell` (`App.jsx`, exportado, importado em `XFlow.jsx` do
mesmo jeito que `S`/`uid`/`fmtDate` já eram) — um só componente, mesma
lista/contador, renderizado em 3 lugares: barra da Tabela de Empresas
(`App()`), header do `PersonalBoardScreen` (só quando `!publicMode` — o
quadro compartilhado por link não tem sino, é anônimo), e header do
`XflowScreen`. Estado (`notifications`, polling a cada 45s — sem
websocket na stack) mora em `App()` porque é o único componente que fica
montado o tempo todo, sobrevivendo à troca de `workspaceMode` — as 3
telas recebem os mesmos dados/callbacks via props, não têm estado
próprio de notificação.

**Navegação entre abas ao clicar numa notificação** (`goToNotificationTarget()`
em `App.jsx`): se o alvo é uma TASK do XFlow, seta `pendingXflowOpen` +
troca pro workspace `xflow` — dentro do `XflowScreen`, um efeito
(`pendingOpenTicketId`) espera os tickets carregarem e só então chama
`openTicketDetail()`, limpando o pendente depois (mesmo padrão do
`hashOpenDone` do link permanente por TASK, §18.2). Se o alvo é uma
atividade, é mais direto — `App()` já tem `projects`/`openActivityDetail()`
na mão — troca pro workspace `company`, chama `confirmCompanySelection([projectId])`
(seleciona só aquela empresa, mesmo se o usuário estivesse vendo outra) e
abre a atividade. Empilha 2-3 entradas de histórico de uma vez (Nível
1+2+3 juntos) — aceitável, é uma navegação deliberada de "me leva lá".

**Não incluído** (fora do que foi pedido/coberto pelo modelo de dados
atual): sino no `WorkspaceGateScreen` (tela "Olá, Nome" entre os 3
módulos) e no `CompanySelectorScreen` ("Quais empresas você quer
acompanhar") — são telas de trânsito, não uma das "3 abas"; e em
`UsersManagementScreen`/`SuperAdminScreen` (painéis administrativos, fora
do fluxo normal de trabalho).

Testado localmente com 5 usuários de teste (papéis XFlow + 2 usuários
"Empresas" com nome batendo em `responsible`/`participants`, todos
descartados depois): menção em comentário do XFlow, atribuição de
responsável no XFlow, menção em comentário de atividade, atividade
"responsável" e "vinculado" por nome — todos os 4 tipos geraram
notificação corretamente; clique em cada um navegou pro lugar certo
(inclusive trocando de empresa selecionada automaticamente); "marcar
lida"/"marcar não lida"/"marcar todas lidas" e o contador dinâmico do
sino funcionaram; abrir o painel sozinho não mexeu na contagem; abrir a
TASK/atividade referida marcou só aquela notificação como lida; visualizar
uma TASK duas vezes em seguida não duplicou o registro na timeline.

## 21. Sincronização com Google Calendar (2026-08)

Pedido do Rafael: Previsão de conclusão de uma TASK do XFlow vira evento
no Google Calendar do responsável. Essa sincronização em si é
**unidirecional** (PRICETAX escreve o evento, nunca lê ele de volta) e
**por usuário** (cada um conecta a própria conta — não existe "conexão
única pra org toda"). O escopo `calendar.events` autorizado já cobre
leitura também, usada depois pela Agenda (§22) pra montar a
disponibilidade — a integração como um todo deixou de ser só-escrita
nesse momento, mas o fluxo de sincronização de TASK descrito aqui
continua sendo one-way.

### Setup no Google Cloud (feito manualmente pelo Rafael, uma vez)

Projeto "My First Project" no [console.cloud.google.com](https://console.cloud.google.com),
Calendar API ativada, tela de consentimento OAuth criada (nome "Cronograma
PRICETAX"), escopo `https://www.googleapis.com/auth/calendar.events`, um
cliente OAuth "Aplicativo da Web" com dois redirect URIs autorizados (prod
+ localhost, pra dar pra testar local antes de cada deploy):
```
https://painel.pricetax.com.br/api/google/oauth/callback
http://localhost:5173/api/google/oauth/callback
```
Client ID/Secret gerados ali viram variável de ambiente — **nunca
commitados**, só em `.env` local (gitignored) e nas env vars do Railway
em produção:
```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=<callback específico de cada ambiente>
APP_BASE_URL=<origem do app específica de cada ambiente>
```

### Schema

`google_calendar_connections` (`server/db.js`, relacional — um usuário só
pode ter uma conexão, por isso `user_id` é a própria PK):
`user_id, access_token, refresh_token, token_expiry, calendar_id, connected_at`.
Qual evento do Google corresponde a qual TASK fica em
`data.googleEventId` dentro do próprio `xflow_tickets` (1:1 por ticket,
não precisa de tabela própria — mesmo raciocínio do `linkedTicketIds`).

### Backend

`server/googleCalendar.js` — helper puro (sem rotas), usa o pacote
`googleapis`: `getAuthUrl()`, `exchangeCodeForTokens()`,
`saveConnection()`, `disconnectUser()`, `getConnectionStatus()`,
`syncTicketEvent(userId, ticket, appBaseUrl)` (cria ou atualiza o evento —
todo-dia, `start.date`/`end.date` com `end` sendo o dia seguinte, formato
exigido pela API do Google pra evento de dia inteiro) e
`deleteTicketEvent()`. O client OAuth2 do `googleapis` renova o
`access_token` sozinho quando expira (usa o `refresh_token`); um listener
`client.on('tokens', ...)` persiste o novo `access_token` de volta no
banco pra não precisar renovar nas próximas.

`server/google.js` — router montado em `/api/google`
(`server/index.js`): `GET /status`, `GET /oauth/start` (redirect direto
pro consentimento do Google, não é fetch — o botão no frontend é um
`<a href>`, não `onClick`), `GET /oauth/callback` (troca `code` por
tokens, salva, redireciona de volta pro app com um hash marcador —
`#google-calendar-connected` ou `#google-calendar-error`) e
`POST /disconnect`. O cookie de sessão (`sameSite: 'lax'`) sobrevive à
ida-e-volta pro domínio do Google numa navegação de topo (GET), então
`req.user` já está disponível direto no callback — não precisou de
`state` carregando id de usuário.

**Gatilho de sincronização**: dentro do mesmo `PATCH /tickets/:id`,
chama `syncTicketEvent()` **depois** do `COMMIT` e do `res.json(...)`
(fire-and-forget, `.then()/.catch()` sem `await` bloqueando a resposta —
é uma chamada de rede externa, não pode segurar a linha do banco nem
atrasar a resposta pro usuário se o Google estiver lento ou o token
tiver expirado) em **dois casos**, não só um: `field==='expectedCompletionAt'`
sendo editado (`editar_campo`) **ou** o responsável mudando
(`assigneeChanged`, cobre `reatribuir`/`redirecionar`/`aceitar`/
`iniciar_dev_direto`) — em ambos os casos, só dispara se a TASK **já**
tiver responsável e Previsão de conclusão no momento. **Bug real
encontrado e corrigido** (reportado pelo Rafael testando ao vivo): a
versão original só cobria a edição do campo de data — mas o fluxo mais
comum na prática é abrir a TASK já com a Previsão preenchida (direto na
criação, `NewTicketModal` já tem esse campo) e só **depois** atribuir
alguém; como atribuir não mexe no campo de data, esse caminho — o mais
comum, não uma exceção — nunca sincronizava nada. Corrigido cobrindo os
dois gatilhos. Se `syncTicketEvent()` devolver um `googleEventId` novo,
uma segunda query (também fora da transação principal) grava ele em
`data.googleEventId`. Silencioso (não gera erro pro usuário) se o
responsável nunca conectou a própria conta — é o estado normal de quem
não usa a integração. Se o Google rejeitar (token revogado,
`invalid_grant`, etc.), só loga no console do servidor, não afeta a TASK
nem o usuário vê nada quebrar — testado localmente forçando um
refresh_token inválido, nos dois gatilhos (edição de data com
responsável já definido, e atribuição com data já definida).

Ao apagar de vez uma TASK (`DELETE /tickets/:id`, admin-only), se ela
tinha `googleEventId`, apaga o evento correspondente também (mesmo
padrão fire-and-forget, depois da resposta).

**Mandar pra Lixeira também apaga o evento** (`excluir`, 2026-08,
reportado pelo Rafael: mandou uma TASK pra Lixeira e o evento continuou
na agenda) — a TASK não está mais ativa no quadro, não faz sentido o
compromisso continuar lá. `data.googleEventId` é zerado na própria
transação do `excluir` (evita um `googleEventId` órfão apontando pra um
evento que não existe mais); o apagar de fato no Google usa o valor
**original** (lido antes do reset) no fire-and-forget de depois da
resposta. Restaurar da Lixeira **não** recria o evento sozinho — só
volta a sincronizar se alguém tocar de novo na Previsão de conclusão ou
no responsável depois de restaurada (mesmo gatilho normal, nada
especial pra isso).

**Segundo bug de observabilidade encontrado no mesmo teste**:
`deleteTicketEvent()` engolia **qualquer** erro do Google num
`try/catch` vazio (comentário dizia "já pode não existir mais", mas na
prática escondia erro de token/auth também) — o `.catch()` de quem
chama nunca via nada, porque a função nunca rejeitava de verdade.
Corrigido pra só engolir 404/410 (evento já não existe, esperado) e
deixar qualquer outro erro subir pro log — foi assim que a falha do
teste (token falso) apareceu no console pela primeira vez.

### Frontend

Seção "Google Calendar" dentro de `MyProfileModal` (`App.jsx`, mesmo
modal da troca de senha) — busca `GET /google/status` ao abrir; mostra
"Conectar Google Calendar" (link `<a href="/api/google/oauth/start">`,
não botão com `onClick` + `fetch`, porque OAuth precisa de uma navegação
de página inteira de verdade) ou, se já conectado, "Conectado desde
DD/MM/YYYY HH:mm" + botão "Desconectar". Como a ida-e-volta pro Google
descarrega a página inteira (perde todo estado React, inclusive
`showMyProfile`), o resultado da autorização só pode ser mostrado
reabrindo o modal sozinho quando a URL já chega com o hash marcador —
efeito `hashGoogleDone` em `App.jsx` (mesmo padrão do `hashXflowNavDone`
do link permanente por TASK, §18.2): detecta
`#google-calendar-connected`/`#google-calendar-error`, abre "Meu perfil"
com um banner de sucesso/erro, e limpa o hash da URL.

### Limitações conhecidas e aceitas

- **Só sincroniza a Previsão de conclusão**, não o Prazo — são conceitos
  diferentes (§18, "Diferença entre Prazo e Previsão de conclusão") e só
  a Previsão tem sentido como "isso vai pro meu calendário".
- **Reatribuição não move o evento**: se a TASK muda de responsável
  depois que o evento já foi criado no calendário do responsável
  anterior, o evento antigo fica parado lá (só é atualizado/apagado se
  alguém tocar de novo na Previsão de conclusão OU a TASK for apagada de
  vez). Não foi implementado mover o evento entre calendários na
  reatribuição — escopo deixado de fora deliberadamente, pode ser pedido
  como ajuste futuro se virar um problema real no uso.
- Sem responsável definido, não sincroniza nada (sem "calendário de
  quem" óbvio pra usar).

## 22. Agenda (2026-08)

4ª workspace, junto de Empresas/Gestão de Atividades/XFlow, disponível
pra **todo** usuário logado (`hasAgenda = true` incondicional, ao
contrário das outras três que dependem de acesso concedido). Pedido do
Rafael: consultar/apresentar a própria disponibilidade sem precisar abrir
o Google Calendar de verdade — útil numa call com cliente pra combinar
horário sem expor nome/assunto de outros compromissos.

**Só leitura, um feed só, três fontes mescladas**: eventos do Google
Calendar do usuário (se conectado — reaproveita a mesma conexão OAuth do
§21, escopo `calendar.events` já cobre leitura), TASKs do XFlow onde o
usuário é `assignee_id` com Previsão de conclusão no período, e
atividades de empresa onde o nome dele bate (case-insensitive) em
`responsible`/`participants` — mesma heurística de nome-livre já usada em
`notifyActivityChanges()` (`routes.js`), sem checagem adicional de
`canAccessProject`/CNPJ.

### Backend

`server/agenda.js` — único endpoint, `GET /api/agenda?start=...&end=...`
(`requireAuth`, datas ISO obrigatórias). Monta o array de eventos
misturando as três fontes acima, cada evento com um formato comum:
`{id, source, title, description, start, end, allDay, status, ...}`
(`source` é `'google'` | `'xflow_ticket'` | `'activity'`). Devolve também
`connected` (bool) pro frontend saber se deve mostrar o aviso de conectar
o Google.

`listEvents(userId, timeMinISO, timeMaxISO)` (novo, em
`server/googleCalendar.js`) — lista os eventos do calendário `primary` no
período via `calendar.events.list` (`singleEvents: true` expande
recorrências em instâncias individuais; cancelados vêm incluídos de
propósito, `status: 'cancelled'`, pra Agenda poder mostrar riscado em vez
de simplesmente sumir).

Mapeamento porta em `server/index.js`: `app.use('/api/agenda',
agendaRouter)`.

### Frontend

`src/agenda/Agenda.jsx` (arquivo próprio, mesmo padrão do
`src/xflow/XFlow.jsx` — bloco de UI grande e autocontido, importa
primitivas compartilhadas de `App.jsx`: `S`, `fmtDate`, `BrandLogo`,
`ThemeToggleBtn`, `NotificationBell`). `AgendaScreen` é montada em
`App.jsx` como uma 5ª peer branch (`effectiveMode === 'agenda'`), com o
mesmo contrato de props de notificação que `XFlowScreen`/
`PersonalBoardScreen` já usam.

- **Toggle de privacidade** ("Mostrar detalhes" / "Ocultar detalhes"),
  bem visível no topo. Client-side só — quando ativo, todo evento de
  qualquer fonte mostra só "Ocupado" (ou "Ocupado (cancelado)"), nunca um
  rótulo diferente por evento (decisão deliberada: título único e
  consistente, não uma frase aleatória por exemplo dado pelo Rafael).
- **3 modos de visão**: Dia, Semana (padrão) e Mês. Semana/Dia usam a
  mesma grade horária (06h–21h, 48px/hora), eventos com horário
  posicionados absolutamente com um empacotamento guloso simples de
  colunas pra sobreposição (`packTimedEvents` — não maximiza a largura
  por cluster isolado, só garante que nada fica em cima do outro; aceito
  como simplificação suficiente pro uso real). Eventos de dia inteiro
  (toda TASK/atividade da Agenda são desse tipo — só têm data, não
  horário) ficam numa faixa própria no topo de cada dia. Mês é uma grade
  6×7 com até 3 chips por dia + "+N mais"; clicar num dia muda pra visão
  Dia daquela data.
- **Cor por fonte**: Google = azul, TASK do XFlow = roxo, atividade de
  empresa = verde (mesma paleta conceitual do resto do app, valores
  específicos só em `SOURCE_META` dentro do próprio arquivo). Cancelado =
  riscado + opacidade reduzida, nunca escondido.
- **Atualização**: sem webhook do Google (exigiria endpoint público
  registrado + renovação do canal a cada 7 dias — infra a mais não pedida
  agora); em vez disso, poll simples a cada 60s enquanto a tela estiver
  aberta, mais refetch imediato ao trocar de visão ou navegar
  dia/semana/mês. Suficiente pro caso de uso real (Agenda aberta durante
  uma call).
- Quando não conectado ao Google, mostra um aviso com link "Conectar
  Google Calendar" (mesmo `<a href="/api/google/oauth/start">` do §21) —
  as TASKs/atividades do próprio PRICETAX aparecem normalmente mesmo
  sem conexão, só os eventos do Google é que ficam de fora.

### Fora do escopo (decisão deliberada, não pedido agora)

Criar reunião nova clicando num horário livre e sincronizar com o Google
(dito explicitamente pelo Rafael como algo pra deixar a arquitetura
**preparada**, não construído agora) — `googleCalendar.js` já expõe
`syncTicketEvent`/`listEvents` de forma genérica o bastante pra um botão
"Nova reunião" no futuro reaproveitar sem precisar refatorar; não existe
nenhum código morto de UI pra isso ainda.

## 23. Visão Macro / "Visão Geral Empresas" (2026-08)

Pedido do Rafael: "quadro de cronograma geral pra controle interno dos
projetos" — em vez de entrar empresa por empresa pra saber o que está
previsto, uma tela só que junta as atividades de **todas** as empresas da
org, organizadas por dia, com destaque visual pro que está atrasado, é
hoje, ou está próximo do vencimento.

### Acesso

Tile "Visão Geral Empresas" no `WorkspaceGateScreen`, 5º workspace, só
aparece se `currentUser.companiesAccess && currentUser.allCompaniesAccess`
— **não** é universal como a Agenda. Faz sentido: essa tela mostra
atividade de toda empresa da org de uma vez, então só quem já enxerga
todas (`allCompaniesAccess`, o mesmo flag do radio "Todas as empresas" vs
"Empresas específicas" na tela de usuário) pode ver — um usuário
restrito a um CNPJ (`allowedCnpjs`) nunca deveria ver atividade de outro
cliente, e essa tela ignoraria esse allowlist de propósito (por design,
não é um esquecimento) se não tivesse esse gate. Backend confere de novo
(`403` se `!companiesAccess || !allCompaniesAccess`) — o front escondendo
o tile não é a única barreira.

### Backend

`server/macro.js` — rota única, `GET /api/macro?range=overdue|current_week|next_week|next_30`.
Varre `SELECT id, data FROM projects WHERE org_id=$1` (todas as empresas
da org, sem filtro de CNPJ) e achata `data.activities[]` de cada uma,
igual a Tabela/Agenda já fazem. Pra cada atividade que casa com o filtro,
resolve o nome da fase via `phases.find(ph => ph.id === a.phase)` (mesma
relação numérica id↔phase que a Tabela usa) e monta um item com
`projectId`+`activityId` (separados — necessário pra reabrir a atividade
de verdade pra edição, ver abaixo), `company`, `date`, `endDate`, `time`
(= `a.meetingTime`, campo que **já existia** na atividade — "Horário da
reunião (opcional)" no `ActivityDetailModal`, só não estava sendo puxado
pra cá antes), `title` (funciona como "tipo de entrega/encontro" — não
existe campo separado, o título da atividade já cobre isso), `phase`,
`responsible`, `status` (usa o enum real de `STATUS_META`:
`nao-iniciado`/`em-andamento`/`pausado`/`concluido` — não inventa
"confirmado"/"previsto" como estados novos).

**6 abas, recortes mutuamente exclusivos** (2026-08, revisão): `paused`
(**checado primeiro, tem prioridade sobre tudo** — `status === 'pausado'`,
tenha `date` ou não; pedido explícito do Rafael: "exiba ali toda as
atividades com status pausadas e não as exiba em outras abas" — uma
atividade pausada nunca conta pra `overdueCount`/aparece em Atrasadas nem
em nenhuma outra aba, mesmo que a data dela já tenha passado ou que ela
não tenha data nenhuma), `overdue` (`date < hoje` e `status !== 'concluido'`,
sem limite de quão antigo — pausada já foi excluída antes de chegar
aqui), `current_week`/`next_week`/`next_30` (dentro da janela de data
correspondente, excluindo `overdue` e `paused`), e `no_date` (atividade
sem `date` cadastrada e **não pausada** — pedido à parte do Rafael,
"esqueci, inclua uma aba sem datas": sem essa aba, uma atividade criada
sem data nunca aparecia em lugar nenhum, porque todo outro filtro de
período compara contra `a.date`, e uma comparação com string vazia nunca
bate). Isso substituiu o comportamento anterior (só um "carry-forward" de
atrasado dentro das outras abas) depois que o Rafael pediu uma aba
dedicada pra atrasado — mais claro que duplicar o mesmo item em dois
lugares. `overdueCount`/`noDateCount`/`pausedCount` vêm sempre no payload
(independente da aba pedida) — é o que alimenta os badges de contagem
mesmo enquanto o usuário está vendo outra aba, sem precisar de uma
segunda chamada. Ordenação: por data, depois por `time` (quem tem
horário vem primeiro e em ordem cronológica — bate com o exemplo do
Rafael, 10:30 antes de 14:00), depois por empresa (na aba `no_date`,
como não tem data, ordena só por empresa; uma atividade pausada **com**
data ordena junto com as outras normalmente dentro da própria aba
Pausadas).

### Frontend

`src/macro/MacroOverview.jsx` (mesmo padrão de arquivo próprio do
XFlow/Agenda) — `MacroOverviewScreen` montada em `App.jsx` como
`effectiveMode === 'macro'`.

- **"Hoje" sempre visível**, calculado no client (`new Date()`), fixo no
  topo da tela — não depende de ter ou não atividade nesse dia (antes só
  aparecia um badge "HOJE" pequeno e só se por acaso tivesse algo
  agendado pra hoje; agora é uma linha própria, sempre lá).
- **6 abas** com visual redesenhado (2026-08, pedido do Rafael — o toggle
  original era "anêmico" na palavra dele): **Atrasadas** / Semana atual
  (padrão) / Próxima semana / Próximos 30 dias / **Sem data** / **Pausadas**,
  cada uma com ícone, padding maior, cor de fundo cheia (não só borda)
  quando ativa, e um badge de contagem nas abas Atrasadas/Sem data/
  Pausadas quando `overdueCount`/`noDateCount`/`pausedCount > 0`. A aba
  "Sem data" não agrupa por dia (não tem `date` pra agrupar) — mostra uma
  lista única sob o cabeçalho "Sem data definida". A aba "Pausadas" pode
  ter uma mistura de itens com e sem data (uma atividade pausada não
  passa pela aba Sem data), então agrupa por dia normalmente mas com um
  bucket "Sem data definida" à parte pros que não têm — mesmo padrão de
  agrupamento generalizado pra qualquer aba, não só um caso especial da
  Sem data. Nem "Sem data" nem "Pausadas" mostram badge de urgência
  (Atrasado/Hoje/Em breve) ou pintam cabeçalho de dia em
  vermelho/amarelo — não faz sentido calcular urgência de data pra uma
  atividade sem data, e pausada é intencionalmente "fora do jogo",
  mostrar como se estivesse atrasada confundiria.
- **4 filtros** (2026-08, pedido do Rafael): Empresa, Responsável,
  Status, Prioridade — mesmo padrão de "Filtros rápidos" que a Tabela já
  tem (`filterSelect`/`STATUS_META`/`PRIORITY_META`/`PRIORITY_ORDER`,
  esses dois últimos agora exportados de `App.jsx` pra reuso), só que
  aqui empresa entra no lugar de fase (fase não faz sentido cruzando
  empresas com fases diferentes). Filtram **no client**, sobre o que já
  foi buscado pra aba/período atual — mesma convenção do resto do app
  (Tabela/Quadro pessoal/XFlow também filtram client-side, não fazem uma
  chamada por combinação de filtro). Opções de Empresa/Responsável vêm
  do backend já com o universo completo da org (`companies`/
  `responsibles` no payload de `/api/macro`, calculado a partir de
  **todas** as atividades, não só as da aba atual — senão uma empresa
  sem nada atrasado nunca apareceria como opção enquanto o usuário
  estivesse na aba Atrasadas). "Limpar filtros" aparece só quando algum
  filtro está ativo; mensagem de vazio distingue "sem filtro, período
  genuinamente vazio" de "tem item na aba mas nenhum bate com o filtro"
  (`Nenhum resultado com esses filtros.`). Bolinha colorida de prioridade
  (mesmo padrão visual da Tabela) aparece na linha quando a atividade tem
  prioridade definida.
- Lista agrupada por dia (`Terça-feira — 25/08`), cada linha mostra
  empresa (ponto colorido na cor da empresa), horário (se houver, em
  destaque antes do título) — título, fase (colorida), responsável,
  badge de status real (`STATUS_META`). Badge de urgência muda por aba:
  na aba Atrasadas, mostra "Há N dias" (mais informativo que repetir
  "Atrasado" em toda linha, já que a aba inteira já é isso); nas outras
  abas, `Hoje` (amarelo) ou `Em breve` (laranja, 1-2 dias à frente),
  nunca pra atividade já concluída. Cabeçalho do dia também fica
  vermelho/amarelo quando o dia inteiro é passado/hoje.
- **Clique na linha abre a atividade de verdade pra editar** (2026-08,
  pedido do Rafael) — reaproveita o `ActivityDetailModal` já usado pela
  Tabela, não uma cópia read-only. `App.jsx` extraiu o render desse modal
  pra uma função (`renderActivityDetailModal()`, chamada tanto no branch
  da Tabela quanto no da Visão Macro) pra não duplicar ~30 linhas de JSX;
  `openActivityDetail(pid, id)` — a mesma função que a Tabela já usa —
  é passada como `onOpenActivity`. Editar ali salva pelo mesmo
  `updateActivity`/PATCH `/projects/:id` de sempre, então reflete em
  qualquer outra tela que leia o mesmo `projects` (é o mesmo estado
  React, não uma cópia). A única coisa que precisa de esforço extra é o
  próprio snapshot da Visão Macro, que veio de um `GET /api/macro`
  separado e não se atualiza sozinho quando o modal edita algo — por
  isso a tela observa a prop `activityModalOpen` (`!!openActivityId`) e
  recarrega (`load()`) assim que ela passa de `true` pra `false`
  (modal fechou).
- Sem polling automático (ao contrário da Agenda) — botão de atualizar
  manual (ícone de refresh) + refetch ao trocar de aba de período + o
  refetch pós-edição descrito acima. Esse quadro muda com a cadência de
  quem edita atividade, não com a de um calendário externo sincronizando
  sozinho — não precisa do mesmo refresh agressivo.

### Bug encontrado e corrigido

`server/macro.js` usava `id: `${p.id}-${a.id}`` (concatenado) como único
identificador, sem expor `projectId`/`activityId` separados — parsear de
volta pra abrir a atividade pra edição seria ambíguo/quebrado, porque
tanto o id do projeto (`proj-r3lphpf`) quanto o da atividade
(`m-omet704`, por exemplo) podem ter hífen no meio. Corrigido expondo
`projectId` e `activityId` como campos próprios desde o início — nunca
chegou a quebrar em produção porque o parsing ambíguo nunca foi
implementado (só percebido ao planejar o clique-pra-editar).

## 19. Onde procurar mais detalhe

| Preciso de... | Vá para |
|---|---|
| Localizar componente/função por linha em `App.jsx` | `docs/PROJECT_MAP.md` |
| Regras de padrão de código, arquivos que não mexer, comandos | `CLAUDE.md` |
| Detalhe de responsividade mobile por tela | `docs/RESPONSIVE_ARCHITECTURE.md` |
| Histórico de decisões de produto/por quê de uma feature | memória de sessão (fora do repo) ou pedir contexto ao usuário |
