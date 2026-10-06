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

Última consolidação desta documentação: **2026-10-05** (§79) — auditoria contra o código: §4–§9, §14–§17 estavam
parados em 2026-08 e foram refeitos; §76–§78 reescritos no estado final. Última validação funcional **completa** do
produto inteiro: 2026-08-18 (XFlow v2, §18); desde então cada módulo novo registra a sua verificação na própria seção.

## 0. O produto hoje, em uma página (2026-10-05)

O painel (painel.pricetax.com.br) virou o **ecossistema de trabalho da PRICETAX**: cada pessoa entra, vê o seu dia
(mensagem do dia, agenda, atividades) e abre o módulo de que precisa. Cada módulo tem endereço próprio (§74).

| Módulo | Endereço | Quem acessa (`canOpenMode`, `src/lib/routes.js`) | Seções | Código principal |
|---|---|---|---|---|
| Gestão de Atividades (quadro pessoal) | `/gestao-atividades` | `personal_access` | §13, §51–§53, §61–§62, §65–§66 | `src/App.jsx` (`PersonalBoardScreen`), `src/personal/` |
| Empresas (cronogramas, reuniões, atividades) | `/empresas` | `companies_access` | §11–§13, §24–§26, §28–§29, §43–§47 | `src/App.jsx`, `src/meetings/` |
| XFlow (BUGs/TASKs do time de DEV) | `/xflow` | `xflow_role` | §18, §64 | `src/xflow/`, `server/xflow*.js` |
| Agenda | `/agenda` | todo usuário logado | §21–§22, §59 | `src/agenda/`, `server/agenda.js` |
| Visão Geral Empresas | `/visao-geral` | `companies_access` + `all_companies_access` | §23 | `src/macro/`, `server/macro.js` |
| Conhecimento (memória da RENATA) | `/conhecimento` | master/pricetax | §37–§40 | `src/knowledge/`, `server/knowledge*.js` |
| Pareceres | `/pareceres` | master/pricetax | §48, §69–§70 | `src/pareceres/`, `server/pareceres.js` |
| **Modelos de documentos** | `/modelos` | master/pricetax | §78 | `src/modelos/`, `server/documentTemplates.js` |
| CRM | `/crm` | `crm_role` (master/super admin sempre) | §54–§58 | `src/crm/`, `server/crm/` |
| Gestão de Usuários | `/usuarios` | master | §7, §67–§68 | `src/App.jsx` (`UsersManagementScreen`) |

Transversais (não são "abas"): **RENATA** (assistente de IA: §27–§42, §50, §63, §70), **Meu perfil** em abas — Perfil · Meu dia ·
Agenda · iPhone — com **boas-vindas** na primeira entrada e a **Mensagem do dia** na tela inicial (§77), **Widget do iPhone** (§76),
Central de Notificações (§20), Google Calendar (§21), auditoria de acessos (§67), **API de conectividade** para outra janela do Claude Code (§80).

**Linha do tempo** (o "porquê" de cada coisa está na seção citada):
- **2026-08** — multi-tenant (§11), XFlow v1→v2 (§18), autoatendimento de conta (§19a), Notificações (§20), Google Calendar (§21), Agenda (§22), Visão Geral (§23), Grupo Empresarial (§12), 3 acessos independentes (§7).
- **2026-09 (até 14)** — Reuniões (§24), Atividades/Centro de Execução (§25), AI Meeting Workspace (§26), RENATA fases 1–8 (§27, §30–§42: memória, busca híbrida com embeddings, executora, custo, memória em camadas, Central de Conhecimento, eval harness, prompt cache), sincronização entre usuários (§28), pendências por pessoa (§29).
- **2026-09-16/20** — correções reais de autosave/transcrição (§43–§47), Pareceres (§48), transcrição em português (§49), RENATA na tela inicial (§50), quadro compartilhado como aba (§52), CRM fases 1–3 + importação do PipeRun (§54–§58), Agenda com aceito/recusado (§59).
- **2026-09-28 a 10-02** — Pareceres por cliente (§48), bug "digito e some" (§60), quadro pessoal (§61–§62), Dossiê do cliente (§63), imagens nas TASKs (§64).
- **2026-10-04** — Indicadores de atividades (§65), pausar → fim da coluna (§66), auditoria de acessos (§67), Usuários na tela inicial (§68), Pareceres redesenhado (§69), RENATA estuda os Pareceres (§70), fonte em todo o app (§71), peças visuais comuns + acessibilidade medida (§72).
- **2026-10-05** — tela inicial verdadeira (§73), endereço por módulo (§74), idade do cartão em dias de calendário (§75), Widget do iPhone com visões e um script por visão (§76), Meu dia + boas-vindas + Meu perfil em abas + Mensagem do dia (§77), Modelos de documentos com vários anexos (§78), consolidação da documentação (§79), API de conectividade com tokens (§80).

**Em aberto** (lista única e atual: §15). **Armadilhas que mais pegam** (regras fixas: §16 e §16.1).

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
- **⚠️ O diretório de trabalho local NÃO é um repo git.** Deploy é feito num clone à parte
  (hoje `/private/tmp/deploy-clone`; refazer com `git clone` se sumir): `git fetch` + conferir
  divergência → `rsync -a --delete` do working dir pra lá (excluindo `.git/node_modules/dist/.env/.claude`) →
  `npm run build` limpo → commit → `git push origin main` (Railway builda e publica sozinho).
  **Política vigente (Rafael, 2026-08-25, reafirmada):** commit + push **sem pedir confirmação a cada vez** — o que
  continua obrigatório é o `fetch`/checagem de divergência antes e a **verificação em produção depois** (o hash do bundle
  em `https://painel.pricetax.com.br/` muda e uma rota nova responde 401/200 em JSON em vez de cair no `index.html`; **não existe `/api/health`** — e, desde 2026-10-05, rota desconhecida sob `/api` responde **404 em JSON** (`{"message":"Rota não encontrada."}`); antes caía no fallback do SPA e devolvia o `index.html` com 200, o que enganava clientes da API. Fora de `/api`, o fallback do SPA segue valendo). O texto antigo
  "sempre confirmar antes do push" foi superado por essa instrução.
- **Logs de produção**: `RAILWAY_TOKEN` no `.env` local dá leitura dos logs do deploy atual (`railway logs`); é a primeira coisa a olhar
  num erro reportado em produção (§33).
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
| `ANTHROPIC_API_KEY` | Toda a IA: RENATA (§27+), estudo dos Pareceres (§70), Dossiê (§63), transcrições (§24/§49), horóscopo chinês e inspiração do Meu dia (§77). Sem ela cada função responde "IA não configurada" (503/cartão "Indisponível"); o resto do app segue | Não (mas sem ela não há IA) |
| `VOYAGE_API_KEY` | Embeddings da busca semântica (§31). Sem ela a busca cai para só lexical. Plano gratuito: 3 req/min | Não |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth do Google Calendar (§21). Sem eles a Agenda/Meu perfil mostram "integração não configurada" | Não |
| `APP_BASE_URL` | Endereço público para links gerados no servidor (retorno do OAuth do Google em `server/google.js`; link da TASK no evento do Calendar em `server/xflow.js`) | Não |
| `GIT_COMMIT` | Só rótulo do registro de execução do eval da RENATA (`server/evals/runFullEval.mjs`, §41) | Não |
| `RAILWAY_TOKEN` | **Só local** (`.env`): acesso de leitura aos logs de produção pela CLI — o app não lê | Não |

Local: `set -a && source .env && set +a` antes de rodar, ou script wrapper com
`export VAR="..."` (sandbox bloqueia `source .env` em alguns ambientes).

## 5. Banco de dados (Postgres, 45 tabelas, sem ORM)

`initDb()` roda `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT
EXISTS` a cada boot (idempotente, sem migration tool). `migrateToPricetaxOrg()`
roda logo depois, também todo boot.

| Tabela | Colunas-chave | Observação |
|---|---|---|
| `organizations` | `id, slug, name, display_name, logo_light/dark, favicon, primary_color, secondary_color, login_background, status(active/suspended/blocked), plan, max_users, max_companies, settings JSONB` | `status`/`plan`/limites existem no schema mas **não são aplicados** ainda (roadmap) |
| `users` | `id, username, password_hash, name, email, role(master/pricetax/cliente), cnpj, allowed_cnpjs JSONB, blocked, block_reason, expires_at, avatar, personal_only, org_id FK, is_super_admin, xflow_role('' / reporter / dev / gestao), companies_access, all_companies_access, personal_access`, `crm_role` (§54), `preferences` JSONB + `onboarding_done_at` (Meu dia/boas-vindas, §77), `widget_token_hash` / `widget_token_enc` / `widget_token_created_at` / `widget_last_used_at` / `widget_views` JSONB (Widget do iPhone, §76) | `cnpj`/`personal_only` mortas (não lidas/escritas) desde os "3 acessos independentes" (§13) — ver §7. Toda coluna nova de `users` é aditiva (`ADD COLUMN IF NOT EXISTS`) |
| `projects` | `id, data JSONB(company/phases/activities/team/log), org_id FK` | 1 linha = 1 empresa/cronograma inteiro; **schemaless** dentro de `data` |
| `cnpj_cache` | `cnpj PK, data JSONB, fetched_at` | Cache de 60 dias; **sem** `org_id` de propósito (dado público compartilhado) |
| `personal_boards` | `user_id PK/FK CASCADE, data JSONB(boards[].columns[].cards[], lastCompletedArchiveAt), updated_at` | 1 linha por usuário; **sem** `org_id` (sempre por `user_id`; scan de `shareToken` público é cross-org de propósito) |
| `xflow_tickets` | `id, ticket_number SERIAL, org_id FK, title, status, severity, priority, suggested_priority, product, reporter_id FK, assignee_id FK, data JSONB, created_at, updated_at, status_entered_at, time_breakdown JSONB, ball_holder_type/user_id, waiting_on_type, reopen_count, homolog_reject_count, sla_first_response_due_at/met_at, sla_resolution_due_at/met_at, sla_paused_at, sla_paused_seconds` | 1 linha = 1 BUG/ticket do módulo XFlow (§18); `status` **sem** `CHECK` de propósito (lista evolui sem migration) |
| `xflow_events` | `id, ticket_id FK CASCADE, org_id FK, type, field, old_value, new_value, note, user_id FK, created_at` | Log estruturado de toda ação do XFlow — fonte de verdade da timeline (§18), substitui o `data.history[]` de texto livre da v1 (mantido só como fallback de leitura pra tickets antigos) |

**As outras 38 tabelas** (criadas depois das 7 acima; descrição de cada uma em `docs/PROJECT_MAP.md` §6 e na seção citada):

| Grupo | Tabelas | Seção |
|---|---|---|
| RENATA / memória | `ai_conversations`, `ai_messages`, `ai_project_insights`, `ai_knowledge_facts`, `ai_knowledge_entities`, `ai_knowledge_fact_entities`, `ai_answer_cache`, `ai_metrics_events`, `ai_eval_runs`, `project_memory_chunks` | §27, §31, §37–§42 |
| Reuniões / Dossiê | `meeting_submissions`, `project_dossiers`, `project_meeting_digests` | §24, §49, §63 |
| Pareceres / Modelos | `pareceres`, `parecer_studies`, `meeting_parecer_advice`, **`document_templates`, `document_template_items`** | §48, §70, §78 |
| Notificações / Google | `notifications`, `google_calendar_connections` | §20, §21 |
| Auditoria / indicadores | `user_access_events`, `ip_geo_cache`, `personal_card_events` | §65, §67 |
| Meu dia | **`daily_content`** (cache diário das fontes, PK `kind,key,day`) | §77 |
| Conectividade | **`api_tokens`** (token por janela do Claude Code: hash, escopo, validade, revogação, último uso) | §80 |
| CRM (relacional, UUID, soft delete) | `crm_companies`, `crm_contacts`, `crm_notes`, `crm_company_projects`, `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`, `crm_deal_items`, `crm_deal_stage_history`, `crm_products`, `crm_activities`, `crm_timeline_events`, `crm_audit_logs` | §54–§58 |

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
| Anthropic (Claude) | IA de toda a RENATA, estudo dos Pareceres, Dossiê, transcrições, Meu dia | `@anthropic-ai/sdk`; modelos Sonnet/Opus nas funções de análise e **Haiku** no Meu dia; saída estruturada por `messages.parse` + `zod` (§27/§33: schema achatado, nunca `z.discriminatedUnion`; chamadas fora do `try/catch` do assistente derrubaram produção) |
| Voyage AI | Embeddings da busca semântica | `server/embeddings.js` (§31) |
| Google (OAuth + Calendar API) | Agenda, RENATA executora, previsão das TASKs, "próxima reunião" do widget | `server/google*.js`, `googleCalendar.js` (§21, §59) |
| Liturgia Diária (`liturgia.up.railway.app/v2`) | Evangelho do dia | comunitária, **não oficial da CNBB** (§77) |
| Midvash (`api.midvash.com`) | Versículo do dia e provérbio | Bíblia Livre CC BY 4.0 — crédito obrigatório junto do texto (§77) |
| AstroWay (`api.astroway.info`) | Horóscopo (`lang=pt`) | limite 30/h por IP; 12 chamadas/dia (§77) |
| Qualquer site (prévia de link dos Modelos) | Título/descrição/imagem da página | busca iniciada pelo usuário ⇒ **defesa contra SSRF** em `server/linkPreview.js` (§78) |
| Geolocalização por IP | Local do acesso na auditoria | `ip_geo_cache` (§67) |

Sem storage externo (S3 etc.): anexos de atividade são base64 inline em `activity.attachments[].dataUrl` (limite 8MB/arquivo, §14);
arquivos de Pareceres (≤10 MB) e de Modelos (≤30 MB cada) ficam em `BYTEA` no Postgres. `avatar` do usuário **não** é imagem — é 1 emoji de uma
lista fixa (`AVATAR_EMOJIS`, `src/App.jsx`), validado no backend como string ≤16 chars (`PATCH /auth/me`).

**Agendamento e trabalho em segundo plano.** Não há fila/worker externo. O que existe: (a) `server/crm/scheduler.js` — `setInterval` de 10 min no
processo do servidor que avisa, pela Central de Notificações, o responsável de cada atividade do CRM que venceu/vence hoje (não antes das 7h de Brasília; carimbo `due_notified_at` evita aviso em dobro, §56); (b) trabalhos assíncronos **dentro do processo** disparados por requisição — estudo dos
Pareceres (§70), Dossiê (§63), processamento de transcrição (§24), reindexação da memória (§31) — com estado em tabela (`running`/`done`/`failed`);
um deploy no meio mata o trabalho (no estudo dos Pareceres o registro "órfão" passa a falho depois de 1 minuto sem job vivo, §70; nos demais, refazer pelo botão de nova tentativa); (c) o único comportamento
agendado do cliente: o arquivamento semanal de cards concluídos da Gestão de Atividades roda num `useEffect` de `PersonalBoardScreen`
(compara `board.lastCompletedArchiveAt` com a segunda-feira mais recente) — **se ninguém abrir a tela, não roda**. Debounce de autosave é
`setTimeout` no cliente, não fila.

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
- **Duas autenticações além do cookie JWT** (2026-10-05): (1) `GET /api/widget/summary` é público e autentica só por `Authorization: Bearer pxw_…`
  (hash sha256 em `users.widget_token_hash`; token também guardado cifrado para o painel remontar os scripts; revogável; só leitura; limite 30/min/IP) — §76;
  (2) `GET /quadro/:token` e `/reuniao/:token` (links públicos) seguem como antes. Nenhuma rota nova aceita credencial na URL.
- `onboardingDone` (de `users.onboarding_done_at`) vem no objeto de usuário de `/auth/me`/login e dispara as boas-vindas (§77).
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

**8.1 Mapa completo dos roteadores** (montados em `server/index.js`; a tabela acima é só o núcleo de `routes.js`):

| Prefixo | Arquivo | Acesso | Para quê | Seção |
|---|---|---|---|---|
| `/api` | `routes.js` | misto | núcleo + `POST /auth/change-password[-login]`, `POST /activity/ping`, `GET /users/:id/access`, `GET /projects/versions` e `/projects/lite`, `GET /personal-board/version` (§80), `GET /personal-board/stats[/day]`, `POST /personal-board/linked`, `/notifications*`, `GET /public-meeting/:token` | §7, §20, §28, §52, §65, §67 |
| `/api/xflow` | `xflow.js` | `requireXflowAccess` | BUGs/TASKs (ação + transição validadas no servidor) | §18 |
| `/api/google` | `google.js` | cookie | `status`, `oauth/start`, `oauth/callback`, `disconnect` | §21 |
| `/api/agenda` | `agenda.js` | cookie | feed único (Google + XFlow + atividades + CRM) | §22 |
| `/api/macro` | `macro.js` | cookie | Visão Geral | §23 |
| `/api/meeting-inbox` | `meetingInbox.js` | cookie | caixa de transcrições (`POST /`, `GET /`, retry) | §24 |
| `/api/assistant` | `assistant.js` | cookie | RENATA: conversa, `ask`, feedback, ação, reindex, dossiê | §27, §63 |
| `/api/knowledge` | `knowledge.js` | master/pricetax | Central de Conhecimento | §39 |
| `/api/pareceres` | `pareceres.js` | master/pricetax | PDFs, comentários, estudo e sugestão da RENATA | §48, §70 |
| `/api/templates` | `documentTemplates.js` | master/pricetax | Modelos: modelo + anexos (`/:id/items…`), comentários | §78 |
| `/api/crm` | `crm/routes.js` (57 rotas) | `crm_role` | CRM completo | §54–§58 |
| `/api/widget` | `widget.js` | cookie (gestão) + Bearer (`/summary`) | token, visões, resumo do iPhone | §76 |
| `/api/daily` | `daily.js` | cookie | Meu dia: conteúdo, preferências, onboarding | §77 |
| `/api/connect` | `connect.js` | cookie (`/tokens`) + Bearer `pxk_…` (o resto) + índice público (`GET /`) | **API de conectividade** para outra janela do Claude Code: atividades (ler/criar), empresas, reuniões, agenda | §80 |

Limite de corpo JSON: 15 MB global; **`/api/templates` tem parser próprio de 45 MB montado antes do global** (arquivo de até 30 MB em base64).

`GET/POST /projects` e `/users` aceitam `?asOrg=<id>` — só respeitado se
`isSuperAdmin` (`effectiveOrgId()`), é como o Super Admin "entra" numa org.

## 9. Arquitetura do frontend (`src/App.jsx`, ~9.900 linhas + módulos em `src/*/`)

Um único componente `App()` (~2.800 linhas) com todo o estado
(`useState`/`useEffect`), sem Redux/Context/roteador — navegação é estado em
memória **espelhado na URL** por módulo (§74, `src/lib/routes.js`). Dezenas de
componentes de tela/modal no mesmo arquivo; módulos novos nascem fora dele
(`src/xflow`, `src/agenda`, `src/knowledge`, `src/pareceres`, `src/modelos`, `src/crm`, `src/daily`, `src/widget`, `src/ui`). **Mapa completo
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
  (`<input type="time">`) — puramente informativo, não valida contra
  nada, não é obrigatório pra salvar a atividade. Aparece formatado como
  "18/09/2026 às 14:30" na tabela "Próximas etapas" do relatório em PDF
  (abaixo) quando preenchido.
- **"Data confirmada com o cliente?" (2026-08)**: checkbox `activity.clientDateConfirmed`
  (booleano, JSONB — sem migração de schema), mesmo padrão visual do
  checkbox "Obrigatória". Aparece no **Resumo** da empresa (`ResumoTable`/
  `ResumoCard`) como um badge verde "✓ Confirmado c/ cliente" ao lado da
  data — junto com o horário da reunião, exatamente onde o Rafael pediu
  ("no quadro resumo... onde vemos o cronograma, horário da reunião e o
  ticket de confirmado com o cliente"). Sem indicador quando desmarcado —
  não é um "não confirmado" em vermelho, só ausência do badge verde
  (estado default, não é uma exceção que precise de destaque).
- **Os dois campos acima também ficam inline na Tabela (2026-08, ajuste
  pedido pelo Rafael)**: os dois foram lançados só dentro do
  `ActivityDetailModal` (aberto pelo ícone de tela cheia); o Rafael
  entrou em Resumo/Tabela e não achou nem o checkbox nem o horário, já
  que a Tabela edita a maioria dos campos **inline**, sem precisar abrir
  o modal (Fase/Responsável/Início/Prazo/Fim/Obrigatória/Status já são
  assim). Corrigido adicionando duas colunas novas em `TableView`
  (`server`-side não muda nada, é só UI): "Horário" (input time, 80px,
  logo depois de "Prazos") e "Confirm." (checkbox, 70px, logo depois de
  "Obrig.") — tanto na versão desktop (linha em grid) quanto mobile
  (cada campo com seu próprio rótulo, junto dos outros campos de
  Início/Fim/Prazo/Obrigatória). O `ActivityDetailModal` continua tendo
  os dois campos também — não foi removido de lá, só deixou de ser o
  único lugar.
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
- **Anexos em Comentários (2026-08)**: pedido do Rafael — comentário de
  atividade (`activity.comments[]`, `ActivityDetailModal`) ganhou
  `attachments[]` (imagem/PDF, mesmo formato/limite de
  `MAX_ATTACHMENT_BYTES`/8MB e mesma leitura via `FileReader` →
  `dataUrl` base64 inline no JSONB que já existia pros anexos da própria
  atividade) e `links[]` (mesmo formato `{id, label, url}` dos links da
  atividade). Composer de comentário ganhou dois ícones novos ao lado do
  Enviar: clipe (`<label>` + `<input type=file accept="image/*,application/pdf" multiple>`
  oculto, mesmo padrão de "Anexar arquivo" da atividade) e link
  (abre/fecha um mini-form label+URL, `showCommentLinkForm`). Anexo/link
  entram numa lista de rascunho (`commentAttachmentDrafts`/
  `commentLinkDrafts`) antes de enviar — dá pra anexar vários, remover
  antes de mandar, e **comentário só de anexo/link, sem texto nenhum, é
  válido** (útil pra só mandar um print ou um link sem escrever nada).
  `addComment()` ganhou 2 parâmetros novos (`attachments`, `links`) — só
  aditivo, não quebra nenhuma chamada existente. `hasDraft`/guard de
  descarte não-salvo passou a considerar esses rascunhos também, senão
  fechar o modal com um anexo pendente perderia ele silenciosamente.
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

- `src/App.jsx` é muito grande (~9.900 linhas, um componente `App()` de
  ~2.800 linhas) — leitura completa é cara em contexto; usar
  `docs/PROJECT_MAP.md` + `grep`/`Read offset` sempre.
- Anexos em base64 dentro do JSONB (`activity.attachments[].dataUrl`, até
  8MB/arquivo, sem limite total) — sem storage externo; payload de
  `PATCH /projects/:id` cresce com o projeto.
- Autosave reenvia o **objeto inteiro** (não diffs) tanto em `/projects/:id`
  quanto em `/personal-board` — custo cresce com o tamanho do dado.
- Sem testes automatizados no repositório, sem linter. A verificação de cada entrega é feita com scripts **descartáveis**
  (lógica pura em Node, HTTP real contra o Postgres local com JWT assinado com o segredo de dev, e conferência no browser); o
  resultado fica descrito na seção da entrega, não em arquivo de teste. Armadilhas do ambiente de teste: `node --watch` fica parado depois de
  um erro de sintaxe (`touch server/index.js` reinicia); o painel de preview não renderiza PDF; o cookie de sessão de teste some quando o dev
  server reinicia (logar de novo por `fetch('/api/auth/login')`).
- **Fontes externas de conteúdo mudam ou caem**: das 6 APIs de uma pesquisa de 2026-10-05, 3 estavam fora do ar e 1 devolvia outro idioma (§77).
  Testar cada API antes de depender dela e degradar para "Indisponível" sem derrubar a tela.
- `cnpjLookup.js` depende de 2 APIs externas instáveis — já tem retry/
  timeout/cache, mas é ponto único de falha do cadastro de empresa.

## 15. Pendências / roadmap conhecido

**Produto e infraestrutura**
- Enforcement de `organizations.status` (suspensa/bloqueada não bloqueia login/acesso ainda, é só rótulo).
- Planos/limites/cobrança (`plan`, `max_users`, `max_companies` no schema, nada lê/aplica) — "Fase 4" do multi-tenant.
- Banner "Super Admin — visualizando como X" não aparece em `CompanySelectorScreen` (só no topbar principal).
- Migrar CRM, Pareceres e Reuniões para as peças de `src/ui` (§72) — oferecido, não aprovado.
- Dossiê do cliente: Fases B e C só com aval do Rafael (§63).
- Favoritar uma **página** específica do quadro pessoal (hoje o endereço leva ao quadro, na aba padrão) (§74).
- Reindexação de memória das reuniões antigas (`server/scripts/reindexAllMeetings.js`, §31/§32): confirmar se já rodou em produção.

**Coisas entregues mas nunca vistas funcionando de verdade (precisam de um olhar em produção)**
- Estudo dos Pareceres pela IA (§70): primeira execução real (custo e erros) ainda não relatada.
- Meu dia: horóscopo chinês e inspiração (Haiku com saída estruturada, §77) — chamada real nunca testada; falha vira cartão "Indisponível" + log `Meu dia: falha em …`.
- Boas-vindas com o OAuth do Google real (§77).
- Modelos: abrir PDF real na gaveta, upload acima de ~10 MB pela tela, links de Drive/SharePoint reais (§78).
- Widget: confirmado no iPhone com uma visão (§76); vários scripts/visões e o limite de linhas do widget grande ainda sem confirmação no aparelho.
- Auditoria de acessos: IP real do Railway (`x-real-ip`) a confirmar com login real; forja de cabeçalho não verificada (§67).
- Acessibilidade: telas e modais fora de `src/ui` não foram auditados (§72).
- API de conectividade (§80): testada com `curl` simulando a outra janela e com o painel aberto, **não** com uma segunda janela real do Claude Code lendo o guia; `GET /agenda` não foi testado com Google real; produção ainda não vista com token real.

**Usabilidade**
- Plano de 7 ondas em `docs/PLANO_USABILIDADE.md` (§81): **Ondas 0 e 1 feitas** (2026-10-05/06, ver §81 — com a lista do que não foi testado: arrasto por toque em aparelho real, foco preso/leitor de tela, Esc em 3 níveis, gavetas do CRM por Voltar); Ondas 2-6 aguardam decisão do Rafael.

**Documentação**
- Este arquivo e `docs/PROJECT_MAP.md` foram reconciliados com o código em 2026-10-05 (§79). Reconferir a cada entrega grande.
- Assuntos que o Rafael **encerrou** (não reabrir): troca de senha obrigatória do Felipe após o reset; dono da tela de IBS/CBS da NFS-e.

**Estudos sem código**
- **Comunicação com o painel via Telegram (2026-09) — estudado, não
  implementado.** Rafael queria um jeito fácil (sem ferramenta oficial
  burocrática) de o time falar com o app — cogitou e-mail, WhatsApp e
  Telegram. Recomendação dada: e-mail primeiro (mais simples, sem app
  novo pro time instalar); Telegram documentado como alternativa mais "de
  chat" caso e-mail não baste. Estudo técnico completo (setup do bot,
  webhook vs polling, formato do payload, limites, problema de vincular
  `from.id`↔usuário/empresa, como encaixaria em `server/meetingInbox.js`)
  em `docs/TELEGRAM_BOT_ESTUDO.md` — nenhum código escrito, só pesquisa.

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

### 16.1 Padrões acrescentados em 2026-10 (valem para qualquer entrega nova)

- **Módulo novo** = (1) `MODE_PATHS` + `canOpenMode` em `src/lib/routes.js`; (2) em `App.jsx`: `hasX`, `availableModes`, tag em `locationTag`/`applyLocationTag`, card na `WorkspaceGateScreen`,
  ramo `effectiveMode === 'x'`; (3) fonte Inter na raiz do módulo, inclusive em drawer/modal (§71); (4) rota no `server/index.js` com o mesmo guard de acesso do front; (5) esta documentação (§0, §8.1, `PROJECT_MAP`).
- **Migração só aditiva**: `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` dentro de `initDb()`; tabela com FK vem **depois** da tabela referenciada (`parecer_studies` antes de `pareceres` derrubou boot em banco novo, §70);
  migração de dado idempotente (rodar `initDb` duas vezes tem que dar o mesmo resultado, como a dos anexos de Modelos, §78). Nunca `DROP`/`UPDATE` destrutivo sem copiar antes.
- **Rotas e telas públicas** (`/quadro/:token`, `/reuniao/:token`) nunca são reescritas por efeito de URL — os hooks do `App()` rodam antes do `return` que as desenha (§74).
- **Overlay global** (que precisa aparecer por cima de qualquer módulo, como as boas-vindas): raiz React própria (`src/daily/useWelcomeSetup.jsx`), não um `return` extra — o `App()` tem dezenas de retornos por módulo.
- **Busca no servidor a pedido do usuário (link, prévia, webhook)** passa pela validação de SSRF de `server/linkPreview.js` — nunca `fetch(url)` direto com endereço vindo do usuário.
- **Arquivo enviado por usuário**: lista fechada de extensões, `Content-Type` do servidor, `nosniff`; HTML só com CSP `sandbox`; SVG recusado. Tamanho validado no servidor e na tela.
- **Segredo de integração** (token de widget, chave): só o hash autentica; se precisar reexibir, guardar **cifrado** (AES-GCM) — nunca em claro; credencial em `Authorization`, **nunca na URL** (cai em log).
- **IA com custo**: nunca uma chamada por usuário/visita — cache por dia ou por hash do insumo, 1 chamada para N pessoas, "nada novo" = zero IA; falha de IA degrada o cartão ("Indisponível") sem derrubar a tela.
- **Conteúdo de terceiros**: testar a API antes (§77); mostrar o crédito da licença junto do texto; texto gerado por IA sempre rotulado; **frase de pessoa real só de base curada com fonte**, conferida na fonte oficial antes de ir para a tela (o que veio de pesquisa de terceiros e não foi conferido fica separado e com ressalva — §77, Senna).
- **Datas**: "dias" de calendário no fuso local, não blocos de 24 h (§75); "hoje" no servidor em `America/Sao_Paulo` (`widgetSummary.todayInSp`, §76–§77), nunca o fuso do processo (§36).
- **Texto "Nd" ou contagem exibida** precisa ter um teste com a data de borda (domingo→segunda, virada de mês) antes de dizer "feito" — o erro de §75 foi falta disso.
- **Antes de dizer "feito"**: rastrear o dado até a tela e provar valor esperado × obtido; o que não foi possível testar (IA real, aparelho real, OAuth real) entra na entrega como **"não testado"**, e na §15.

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

**Bugs de 2026-09/10 (o detalhe e a causa estão na seção citada)**
- Texto digitado some sozinho (poll de sincronização sobrescrevia a edição local) — §60. `reloadProjects` em segundo plano funde com `saveTimers`/`inFlightProjectSaves`.
- Fechar modal editando não salvava/confirmava — §43; transcrição presa em "Processando…" — §44; "escrevo e o texto some" — §45–§47 (`useDebouncedField`).
- Link público `/quadro/:token` reescrito para `/` com o usuário logado (efeito de URL) — §74.
- "Hoje você já terminou" dito numa segunda de manhã — §73; "0d" para o que foi aberto no domingo — §75.
- Tabela criada antes da tabela referenciada derrubaria o boot em banco novo (`parecer_studies`) — §70; estudo órfão "running" depois de deploy — §70.
- Widget: teto de 5 itens por bloco era do nosso script/servidor, não do Scriptable — §76; script antigo no iPhone não conhece visões — §76.

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

**Anexo/link em Comentário (2026-08, pedido do Rafael)**: mesma feature
já construída pra comentário de atividade de empresa (§13, "Anexos em
Comentários"), replicada aqui — Rafael reportou "não estou conseguindo
adicionar imagens no comentário" estando dentro de uma TASK do XFlow, e
o comentário do XFlow é um sistema **completamente separado** do de
atividade (ação `comentar` via PATCH, não um array mutado client-side),
então a feature de empresa não cobria XFlow automaticamente. `comment`
ganhou `attachments[]`/`links[]` (mesmo formato dos de empresa,
`MAX_EVIDENCE_BYTES`/8MB reaproveitado — já existia pra Evidências, não
criou uma constante nova). Composer ganhou os mesmos dois ícones (clipe/
link) ao lado de "Comentar"; anexo de imagem no comentário abre no
**mesmo lightbox** (`previewEvidence`) já usado pelas Evidências da
TASK — não duplicou componente de preview. Backend: `comentar` em
`server/xflow.js` aceita `payload.attachments`/`payload.links` e também
permite comentário só de anexo/link sem texto (mesmo critério de
empresa). `rowToTicket()` espalha `...row.data` sem whitelist de campo,
então `comments[].attachments/links` chegam ao client sem precisar de
nenhuma mudança adicional em `rowToTicket`.

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
  abas, `Hoje` (amarelo, `diffDays === 0`), `Amanhã` (laranja,
  `diffDays === 1` — separado de "Em breve" a pedido do Rafael, que já
  via "Hoje" funcionando mas queria "Amanhã" como categoria própria em
  vez de cair direto em "Em breve") ou `Em breve` (laranja, `diffDays > 1`,
  sem teto — dentro da aba Semana atual isso já fica naturalmente limitado
  ao resto da semana corrente), nunca pra atividade já concluída.
  Cabeçalho do dia também fica vermelho/amarelo quando o dia inteiro é
  passado/hoje.
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

## 24. Reuniões (2026-09)

Pedido do Rafael: uma central de acompanhamento de reuniões **por
empresa**, dentro do workspace de Empresas — nome, data/horário (passada
ou futura), participantes, transcrição completa, resumo, decisões
tomadas, e uma lista de atividades/próximos passos com responsável,
prazo e status próprios. Ele avisou que ia mandar 3 reuniões reais pra
cadastrar depois — a tela foi construída genérica desde o início, sem
nada hardcoded pras 3 (nenhuma seed/fixture específica).

### Dado

`project.meetings[]` — array novo em `projects.data`, irmão de
`activities`/`phases`/`team`/`log`, **não** é atividade do cronograma
(não conta em nenhuma métrica/filtro de atividade, não aparece em
Resumo/Tabela/Gantt/Fases/Quadro). Adicionado só no `blankProject()` de
`server/db.js` (JSONB, sem migração de schema, sem coluna relacional
nova) — projeto já existente no banco não tem essa chave até a primeira
reunião ser criada nele; todo lugar que lê usa `project.meetings || []`.

Cada reunião:
```js
{
  id, title, date, time,           // data/horário — time é opcional
  participants: [],                // string[] — nomes de project.team OU texto livre (ex.: contato externo do cliente)
  transcript: '', summary: '', decisions: '',
  actionItems: [
    { id, title, responsible, dueDate, status, deleted }  // status = mesmo enum de STATUS_META (não um enum novo)
  ],
  createdAt, deleted, deletedAt, deletedBy,
}
```

### Mutação (App.jsx) — mesmo padrão de `mutateProject`/soft-delete já usado pras atividades

- `addMeeting(pid)` — cria em branco (data = hoje) e **já abre direto pra
  edição** (`openMeetingDetail`), mesma lógica recém-padronizada pra
  atividade (§13, "nova atividade abre direto") — sem isso a reunião
  nasceria no fim do array e ficaria "perdida".
- `updateMeeting`/`deleteMeeting` (soft-delete, com o mesmo prompt de
  confirmação por frase — `DELETE_CONFIRM_PHRASE` — que `deleteActivity`
  já usa) /`restoreMeeting`.
- `toggleMeetingParticipant` (chip de `project.team`) +
  `addMeetingParticipantFreeText` (participante que não está no `team` —
  reunião real quase sempre tem gente de fora, tipo o próprio cliente).
- `addMeetingActionItem`/`updateMeetingActionItem`/`deleteMeetingActionItem`
  — o item de ação é soft-delete (`deleted: true`, filtrado na UI) igual
  subatividade de atividade, **não** hard-delete como link/anexo/
  comentário (a diferença: item de ação tem seu próprio ciclo de vida —
  responsável, prazo, status — então é conceitualmente mais parecido com
  subatividade do que com um anexo solto).
- Navegação por histórico do browser: `openMeetingDetail`/
  `closeMeetingDetail` empilham/desempilham `detailMeeting` no
  `window.history.state`, exatamente como `detailActivity` já faz pra
  atividade — voltar com o botão Voltar do navegador fecha o modal em
  vez de sair da tela (mesmo popstate handler, só mais uma chave lida).

### UI

Aba "Reuniões" nova na barra de tabs do workspace de Empresas (Resumo /
**Reuniões** / Gantt / Tabela / Fases / Quadro), logo depois de Resumo,
só em `!isMulti` (reunião é por empresa, não faz sentido numa visão
agregada de várias empresas ao mesmo tempo).

`src/meetings/Meetings.jsx` (arquivo próprio, mesmo padrão de módulo
dedicado do XFlow/Agenda/Visão Macro) exporta dois componentes:

- **`MeetingsView`** — lista da aba. Duas seções, sempre nessa ordem:
  **Programadas** (`date > hoje`, ordenado crescente — a mais próxima
  primeiro) e **Realizadas** (`date <= hoje` ou sem data, ordenado
  decrescente — a mais recente primeiro). Card mostra título, badge
  Programada (azul) / Realizada (verde), data+horário, participantes,
  contagem "N/M concluída(s)" das atividades da reunião, e uma prévia do
  resumo. Clique no card abre o modal de edição de verdade (mesmo
  `MeetingDetailModal`, não uma cópia read-only). Botão "Lixeira" com
  contagem abre um `SidePanel` (componente compartilhado, exportado de
  `App.jsx` pra esse reuso) com restaurar por reunião.
- **`MeetingDetailModal`** — segue o padrão de **autosave por campo**
  (não o de rascunho com botão Salvar) — cada `onChange`/`onBlur` já
  chama `updateMeeting` na hora, igual `ActivityDetailModal`. Usa
  `useAutosaveTimestamp(meeting)` + `savedStatusLabel()` pro indicador
  "Salvo automaticamente às HH:MM" / "Alterações não salvas". O único
  rascunho que precisa da guarda de "sair sem salvar"
  (`ConfirmDiscardModal`) é o campo de adicionar participante externo
  ainda não confirmado — não tem comentário nem link nessa tela, então é
  bem mais simples que o guard do `ActivityDetailModal`.
  - Participantes: chips de `project.team` (toggle) + input de texto
    livre com botão "+" pra adicionar alguém de fora do team. **Contatos
    externos reutilizáveis (2026-09)**: ao adicionar um participante
    externo (ex.: contato do cliente) com e-mail, ele é salvo em
    `project.externalContacts[]` (`{id, name, email, createdAt}`, JSONB
    novo — mesmo padrão de `team`/`meetings`, sem tabela relacional nova,
    já que é sempre escopado a UMA empresa). Nas próximas reuniões dessa
    mesma empresa, o nome aparece como sugestão (`<datalist>`) no campo de
    texto, e selecionar/repetir o nome já preenche o e-mail salvo sozinho
    — só precisa digitar e-mail na primeira vez que aquela pessoa
    participa. Participantes externos (fora do `team`) também aparecem
    como chip removível (reusa `toggleParticipant`, que já era genérico o
    bastante pra qualquer nome, não só os do team) — antes ficavam
    "invisíveis" na tela depois de adicionados, só apareciam na listagem
    da aba Reuniões.
  - Transcrição/Resumo/Decisões: 3 textareas separadas (não uma só) —
    pedido explícito do Rafael foi que a transcrição "facilite organizar"
    essas informações à parte, não que elas fiquem misturadas num campo
    só.
  - Atividades e próximos passos (rótulo na tela: **"TO_DO"**, renomeado
    2026-09 a pedido do Rafael — a chave de dados continua `actionItems`,
    só o texto exibido mudou): lista de cards à direita (mesmo layout
    de duas colunas do `ActivityDetailModal`, `S.detailGrid`), cada um
    com título, responsável, prazo (date), status e **de qual lado é a
    entrega** (PRICETAX × cliente). **Status próprio do TO_DO (2026-09)**
    — `TODO_STATUS_META`/`TODO_STATUS_ORDER` (exportados de
    `Meetings.jsx`, reusados por `TodoBoard.jsx` — fonte única), **não**
    reaproveita mais o `STATUS_META` de atividade: `nao-iniciado` /
    `urgente` / `em-andamento` / `pausada` / `concluida` /
    `nao-relevante` — pedido explícito do Rafael, porque mistura urgência
    com andamento de um jeito que não faz sentido no ciclo de vida de
    atividade normal (que não tem "urgente" nem "não é relevante" como
    status). **Novo item sempre nasce com `nao-iniciado`** (manual ou
    extraído por IA em `server/meetingInbox.js`) — chegou a nascer
    `em-andamento` por um dia (2026-09), corrigido a pedido do Rafael:
    "a atividade precisa nascer com status não iniciado". Fallback visual
    pra status desconhecido/legado também é `nao-iniciado`
    (`todoStatusMeta()`), sem migração silenciosa do dado gravado.
    **Responsável (2026-09) — texto livre, não mais `<select>` de
    `project.team`**: o responsável real de um item de reunião é quase
    sempre uma pessoa do lado do CLIENTE (ex.: "Evanio Santinon",
    "Rogeria Guerra"), não uma área da PRICETAX — um dropdown fixo de
    `project.team` nunca ia conter esses nomes. Vira `<input
    list="mtg-todo-responsaveis">` com `<datalist>` juntando
    `project.team` + `project.externalContacts` (§ acima) + os
    participantes da própria reunião (`m.participants`) — sugestão, não
    trava em nenhuma lista fechada.
    **`owner` (novo campo, 2026-09)** — `'pricetax' | 'cliente'`, exibido
    como dois botões-toggle acima do campo responsável (PRICETAX em
    amarelo / nome real da empresa em azul, `project.company.name`).
    Ao digitar/escolher um responsável que já bate com um nome conhecido
    (`team` ou `externalContacts`), o `owner` é deduzido sozinho
    (`handleResponsibleChange` em `Meetings.jsx` — dedução por
    correspondência exata de nome, não é IA) — o usuário sempre pode
    corrigir clicando no outro botão manualmente. Item novo nasce com
    `owner: 'pricetax'`.
    **Extração por IA (`server/meetingInbox.js`) também aprendeu isso**:
    o schema Zod de `actionItems` ganhou `owner` (mesmo enum) e o prompt
    recebe o nome real da empresa cliente (`project.data.company.name`,
    já conhecido pelo sistema — não precisa a IA adivinhar/inferir o
    nome) como contexto explícito, pra classificar cada item corretamente
    sem confundir quem fala na transcrição. `responsible` também passou a
    pedir explicitamente o nome da PESSOA física como ela é chamada na
    fala, não mais um campo genérico — inclui instrução pra dois
    responsáveis juntos (ex.: "Gustavo, com a Francine") caberem numa
    string só, sem inventar campo multi-valor pra isso.
- `SidePanel` precisou ganhar `export` em `App.jsx`
  (só `STATUS_META`/`ConfirmDiscardModal`/etc. já eram exportados antes)
  pra esse novo módulo poder importar, mesmo padrão de reuso que XFlow/
  Agenda/Macro já usam pra `S`/`fmtDate`/etc.
- Bloco `<style>` próprio (`MEETINGS_CSS`) com as regras base de
  `input`/`select`/`textarea` — obrigatório pra tema claro/escuro
  funcionar (§16), mesma exigência de toda tela nova.

### Fora do escopo (não pedido, não construído)

Anexo de arquivo na reunião (imagem/PDF) — o pedido do Rafael listou
transcrição/resumo/decisões/atividades, não anexo; a Tabela/comentário de
atividade já tem esse recurso à parte se algum dia precisar aqui também.
Vínculo automático reunião↔atividade do cronograma (ex.: uma "atividade e
próximo passo" da reunião virar uma atividade de verdade na Tabela) —
os dois sistemas ficam propositalmente desacoplados por enquanto.

### 24.1 Caixa de transcrições (2026-09)

Pedido do Rafael, evolução direta de §24: "eu e meus sócios e
funcionários vão mandar as transcrições, e o painel faz o input pra
nós" — ou seja, **não** uma API externa (Zapier/Make) pra automação de
terceiros, e sim um lugar dentro do próprio painel onde qualquer usuário
com acesso à empresa cola a transcrição bruta e o **painel** (não uma
sessão do Claude Code) estrutura e cria a reunião sozinho, na hora,
chamando a Claude API server-side.

**Por que a empresa/projeto não é adivinhada por IA/CNPJ**: a primeira
ideia (CNPJ como chave de correspondência) foi descartada — transcrição
real de reunião quase nunca cita CNPJ, e nome de empresa sozinho não é
confiável o bastante pra bater automaticamente. Em vez disso, quem envia
já está dentro da aba Reuniões daquela empresa especificamente — o
`projectId` vem do contexto, sem seletor/dropdown de empresa na tela de
envio.

**Modelo de dados** — tabela relacional nova `meeting_submissions`
(`server/db.js`, dentro de `initDb()`), **fora** do JSONB do projeto de
propósito: o ciclo de vida do envio (`pending` → `processing` →
`done`/`failed`) precisa sobreviver independente do resultado do
processamento, inclusive falha de IA. Colunas: `id`, `org_id`,
`project_id`, `submitted_by`, `transcript`, `manual_date`/`manual_time`
(opcionais, preenchidos por quem envia se já souber), `status` (CHECK
`pending|processing|done|failed`), `error_message`, `meeting_id` (id da
reunião criada, preenchido só quando `done`), `created_at`,
`processed_at`.

**Backend** (`server/meetingInbox.js`, montado em
`/api/meeting-inbox` por `server/index.js`):
- `POST /` — valida `ANTHROPIC_API_KEY` configurada (503 se não),
  `projectId`+`transcript` (400), `canAccessProject` (403 — função
  exportada de `server/routes.js` pra ser reusada aqui sem duplicar
  lógica de autorização). Insere a linha com `status='pending'`,
  responde `202` **imediatamente**, e dispara `processSubmission(id)`
  **sem `await`** (fire-and-forget, mesmo padrão do sync do Google
  Calendar — §21 — uma chamada de IA pode levar dezenas de segundos e
  não pode segurar a resposta HTTP).
- `processSubmission(id)` — marca `processing`, chama
  `extractMeetingFromTranscript()` (Claude API,
  `client.messages.parse` com `output_config: { format:
  zodOutputFormat(MeetingExtractionSchema) }` — saída já validada/
  tipada via Zod, sem parsing manual de JSON string), monta o objeto de
  reunião **no mesmo formato exato** de `project.meetings[]` (§24) e
  faz `append` direto via `UPDATE projects SET data=...` — aparece na
  aba Reuniões igual a uma reunião criada manualmente, sem
  tratamento especial na UI. **Data/horário manual, se informado,
  sempre vence o extraído pela IA** (`sub.manual_date || extracted.date
  || ''`) — o prompt também instrui a IA a só preencher data/horário
  quando explícito no texto, nunca deduzir de um dia da semana solto
  ("quarta-feira"), pra reduzir alucinação. Erro em qualquer etapa cai
  no `catch`, marca `status='failed'` com `error_message` (truncada a
  500 chars) — nunca perde a submissão silenciosamente.
- `GET /?projectId=` — lista as últimas 50 submissões da empresa
  (`canAccessProject` de novo).
- `POST /:id/retry` — reseta pra `pending` e dispara o processamento de
  novo (mesmo fire-and-forget); exige `ANTHROPIC_API_KEY` igual o
  create.
- **Custo real**: cada transcrição processada é uma chamada de IA paga
  (poucos centavos por reunião) — decisão explícita do Rafael, ciente
  do custo, em troca de não precisar processar manualmente depois.
  **Rafael precisa criar uma chave em console.anthropic.com e
  configurar `ANTHROPIC_API_KEY` nas variáveis de ambiente do Railway**
  — sem acesso ao dashboard do Railway, esse passo é manual dele (mesmo
  padrão do setup do Google OAuth, §21).

**Frontend** (`src/meetings/Meetings.jsx`, mesmo arquivo de §24):
- Botão "Enviar transcrição" (ícone `Sparkles`) ao lado de "Nova
  reunião" na aba Reuniões, abre `TranscriptSubmitModal` (textarea da
  transcrição + data/horário opcionais).
- Seção "Transcrições enviadas" no topo da aba (só aparece se houver
  pelo menos uma), com badge de status (`SUBMISSION_STATUS_META` —
  Na fila/Processando/Concluída/Falhou), quem enviou, quando, e — se
  falhou — a mensagem de erro + botão de retry.
- `MeetingsView` faz polling (`setTimeout` recursivo a cada 4s, não
  `setInterval`, pra nunca sobrepor requisição) enquanto existir alguma
  submissão `pending`/`processing`. Quando uma submissão transiciona
  pra `done` (detectado comparando o status anterior salvo num
  `useRef` contra o novo), chama `onReloadProjects()` — só então o
  cliente aprende sobre a reunião nova, porque ela foi criada
  diretamente no Postgres pelo backend, fora do fluxo normal de
  `mutateProject`/autosave do cliente.
- `onReloadProjects` — prop nova de `MeetingsView`, ligada em
  `App.jsx` à função `reloadProjects()` (extraída do `useEffect` de
  carregamento de projetos que já existia, agora reusável).

**Testado localmente** (sem `ANTHROPIC_API_KEY` disponível no ambiente
de dev): criação de submissão retorna 503 corretamente sem gravar linha
órfã, listagem/retry funcionam, badge de status e mensagem de erro
renderizam certo na UI. **Extração de IA de ponta a ponta não foi
testada localmente** — depende da chave real do Rafael; validar em
produção depois que ele configurar `ANTHROPIC_API_KEY` no Railway.
**Atualização 2026-09-10**: chave configurada no Railway, testado em
produção — submissão real foi de "Na fila" a "Concluída" e criou uma
reunião de verdade (conteúdo da Tecumseh, data extraída corretamente do
texto). Ainda não confirmado explicitamente pelo Rafael se a extração
(resumo/decisões/participantes) saiu no nível de qualidade esperado —
só a mecânica de ponta a ponta (envio → processamento → reunião criada)
foi validada.

**Bug grave corrigido (2026-09-10) — reunião criada por transcrição
nunca entrava na memória do Assistente/RENATA**: `processSubmission()`
grava a reunião extraída via `UPDATE projects SET data=...` direto no
banco — fora do fluxo normal de `PATCH /api/projects/:id`
(`server/routes.js`), que é o único lugar que disparava
`syncProjectMemoryFromDiff` (reindexação, §27). Sintoma real observado
pelo Rafael em produção: perguntar "resuma a última reunião" pro
Assistente devolvia corretamente título/data/participantes (vêm do
PERFIL DO PROJETO, direto do cadastro) mas dizia não ter encontrado
nenhum trecho de conteúdo — porque a transcrição/resumo/decisões
daquela reunião de fato nunca tinham sido indexadas em
`project_memory_chunks`. **Fix**: `processSubmission` agora chama
`reindexMeetingMemory` (`server/memoryIngest.js`) logo depois de gravar
a reunião, mesmo padrão já usado no agente executor
(`server/assistantActions.js`). **Conferido que não há mais nenhum
outro `UPDATE projects SET data=...` direto no código sem reindexação
correspondente** (só existem 4 no repo: este agora corrigido, os dois
do agente executor — um já reindexava, o outro é reagendamento de
atividade de cronograma que não precisa — e o `PATCH` principal, que já
reindexava desde a Fase 1). **Pendente**: toda reunião criada por
transcrição **antes** deste fix continua sem memória indexada — precisa
rodar `server/scripts/reindexAllMeetings.js` contra produção pra
corrigir o histórico já existente (backfill, script já existia desde a
Fase 1 mas nunca foi confirmado como executado — ver `PROJECT_CONTEXT.md`
§27, script pendente há mais de uma sessão).

**Bug corrigido (2026-09-10)**: a lista "Transcrições enviadas" mostrava
pra sempre toda submissão já feita (até 50, `GET /api/meeting-inbox`),
inclusive as concluídas com sucesso há muito tempo, mesmo que a reunião
gerada por elas já tivesse sido apagada pelo usuário. **Fix**: no
frontend (`MeetingsView`, `src/meetings/Meetings.jsx`), a lista
renderizada agora filtra `status !== 'done'` — uma submissão concluída
some da tela assim que a reunião de verdade já existe na lista abaixo,
já que ela deixou de ter utilidade informativa. O backend continua
devolvendo o histórico completo (usado pela lógica de polling que
detecta a transição pra `'done'` e recarrega os projetos) — só a
renderização foi filtrada, não o dado.

**Bug corrigido (2026-09-10)**: reuniões "Realizadas" eram ordenadas
por data decrescente (mais recente primeiro) — o Rafael pediu ordem
cronológica **crescente** (mais antiga primeiro) pras reuniões e pras
atividades, pra registrar hoje uma reunião de uma data passada não
"aparecer fora de ordem" na leitura da tela (o dado já era ordenado
pela data real, não pela ordem de cadastro — só a direção do sort
mudou). Ajustado em dois lugares: `past` em `MeetingsView`
(`src/meetings/Meetings.jsx`) e o agrupamento "Agrupar por Reunião" em
`TodoBoard.jsx` (§25). **Não** alterado: "Programadas" (já era
crescente) e o `<select>` de escolher reunião ao criar uma nova
atividade (`meetingsForPicker`, `TodoBoard.jsx`) — esse continua
decrescente de propósito, porque define o valor padrão do formulário
(mais lógico pré-selecionar a reunião mais recente que uma antiga).

### 24.2 Cobertura de log — Reuniões e Atividades (2026-09-10)

O Rafael tentou enviar uma transcrição 3 vezes ("aparece em tela, mas
não permanece") e perguntou se isso fica registrado no log — a
resposta era **não, parcialmente**: `processSubmission()`
(`server/meetingInbox.js`) só grava em `project.log` quando o
processamento **dá certo** e vira reunião; criar o envio e qualquer
falha no meio do caminho não deixavam rastro nenhum. Auditei toda a
superfície de Reuniões/Atividades pra fechar essa e outras lacunas
parecidas (agente `general-purpose`, sem sub-agentes):

- **`server/meetingInbox.js`** — novo helper `appendProjectLog(projectId,
  action, user)` (log-only, mesmo padrão read-modify-write já usado em
  todo o resto do sistema). Agora loga: (1) `POST /` — "[usuário] enviou
  uma transcrição de reunião pra processamento por IA", assim que a
  submissão é criada; (2) `processSubmission()` catch — "Falha ao
  processar transcrição enviada: [erro]", só quando o projeto já foi
  carregado (se a falha for antes disso — ex.: submissão não encontrada
  — não tem onde logar); (3) `POST /:id/retry` — "[usuário] tentou
  reprocessar uma transcrição de reunião que tinha falhado". O sucesso
  já era logado antes (dentro da mesma `UPDATE projects` que cria a
  reunião, não mudou).
- **`server/assistant.js`** — `POST /reindex` (botão "Reindexar
  memória", §27) agora loga "[usuário] reindexou manualmente a memória
  da RENATA (N reunião(ões), M trecho(s))" — mesmo helper duplicado
  localmente (4 linhas, não compensa um módulo compartilhado só pra
  isso).
- **`src/App.jsx`** — três funções de TO_DO mutavam sem log, inconsistente
  com as `add*` equivalentes que sempre logaram: `deleteTodoSubtask`,
  `deleteTodoComment`, `deleteTodoAttachment`. Corrigidas pra seguir o
  mesmo padrão (`describeActionItemChange`/`findActionItem` já
  existentes) — agora aparecem no Histórico do item, igual toda outra
  mutação.

**Testado**: os três casos de App.jsx confirmados via UI real (deletar
subtarefa/comentário de um item de teste, histórico mostra "removeu a
subtarefa..."/"removeu um comentário" corretamente). O padrão de
`appendProjectLog` (idêntico nos dois arquivos de servidor) testado
isoladamente contra o projeto de teste real — grava, ordena
mais-recente-primeiro, corta em 300 entradas, tudo certo. **Não
testado**: o caminho HTTP real de criação/falha de submissão (`POST /`,
`processSubmission`) — segue a mesma limitação de sempre, o
`ANTHROPIC_API_KEY` não existe localmente e a rota retorna 503 antes de
chegar no código novo; a lógica em si (helper + onde é chamada) foi
revisada linha a linha e o padrão SQL idêntico já foi validado.

## 25. Atividades — "Centro de Execução" (2026-09)

Pedido original (2026-09, primeira versão): uma aba **"TO DO"** trazendo
todos os itens de TO_DO de todas as reuniões da empresa num lugar só.
Redesign completo (2026-09, segunda rodada, com print de referência
estilo Linear/Notion/Asana): renomear pra **"Atividades"**, com
"Seu centro de execução" como subtítulo, e evoluir de uma lista de
inputs sempre abertos pra uma experiência de linha+checkbox+painel
lateral (drawer), com subtarefas, comentários, anexos e histórico por
item. Rafael decidiu explicitamente **não** criar uma visão cruzando
todas as empresas (o agrupamento "TECUMSEH/PRICETAX" do print de
referência não existe aqui — cada empresa só vê os itens dela) e **não**
implementar seleção em massa, paleta de comando (Cmd+K), drag-and-drop
manual de posição, nem virtualização de lista — isso fica pra uma
eventual 2ª entrega.

### Onde mora o dado (sem tabela nova, sem migration)

`src/meetings/TodoBoard.jsx` exporta `TodoBoardView` — continua **sem
duplicar dado nenhum**, o item de TO_DO segue fisicamente só em
`meeting.actionItems[]` (§24); a tela só achata (`collectTodoRows`)
todas as reuniões não excluídas da empresa numa lista só. Editar um item
aqui chama as mesmas funções de `App.jsx` que a aba Reuniões usa — é o
mesmo item, editável dos dois lugares. `src/meetings/TodoDrawer.jsx`
(arquivo novo) é o painel lateral de detalhe, pra `TodoBoard.jsx` não
virar um componente gigante. `src/meetings/todoUtils.js` (arquivo novo)
tem utilitários puros sem estado (`initials`/`avatarColor` — iniciais e
cor determinística a partir do nome, sem precisar de nenhum campo de
avatar no backend; `daysOverdue`/`isItemOverdue`/`todayIso`/
`greetingPeriod`), compartilhados entre os dois.

O item de TO_DO ganhou campos novos, todos com default vazio pra não
quebrar item antigo (sem migração de dado gravado, mesma convenção já
usada quando o enum de status ganhou `nao-iniciado`):
```js
{ id, title, responsible, owner, dueDate, status, deleted,
  subtitle, notes, subtasks: [{id, title, done}], comments: [{id, text, ts, user, userId}],
  attachments: [{id, name, size, type, dataUrl, addedBy, addedAt}],
  createdBy, createdAt }
```
`subtitle` é o contexto curto de uma linha (mostrado embaixo do título,
na linha e no topo do drawer); `notes` é a descrição mais longa (seção
"Descrição" do drawer). Ambos são **texto simples por enquanto** — não
tem rich text (negrito/lista/link) nem @menção com notificação; o editor
rico do XFlow (`RichTextEditor`, `src/xflow/XFlow.jsx`) não é exportado
e depende de sanitização dupla cliente+servidor mantida à mão, então
replicar agora seria desproporcional ao pedido central. Anexos
reaproveitam literalmente o mesmo padrão do XFlow — base64 dentro do
próprio JSONB (`dataUrl`), limite de 8MB por arquivo checado só no
cliente — porque não existe storage de arquivo de verdade em lugar
nenhum do projeto (nem lá).

**Histórico reaproveita o mecanismo que já existia pras atividades de
cronograma** — `project.log` (`{ts, action, user, activityId}`) filtrado
por `activityId === item.id` (mesmo código que `ActivityDetailModal` já
usa, `App.jsx`). Os itens de TO_DO nunca passavam `activityId` antes
disso; agora `updateMeetingActionItem` monta uma frase legível a partir
do diff do patch (`describeActionItemChange`, `App.jsx`) e passa o id do
item — sem tabela nova, sem campo novo no item, sem endpoint novo.
Toda mutação (subtarefa, comentário, anexo, duplicar) segue o mesmo
padrão: uma função em `App.jsx` que chama `mutateProject` com uma
mensagem de log + `activityId = item.id`.

`TODO_STATUS_META`/`TODO_STATUS_ORDER`/`todoStatusMeta`/`MEETINGS_CSS`
continuam exportados de `Meetings.jsx` — fonte única de status/estilo.

### UI (por que cada decisão)

- **Cards de indicador dinâmicos e clicáveis** (pendentes / atrasadas /
  minhas / **Cliente / Pricetax** (2026-09-10) / reuniões) — clicar em
  "pendentes"/"atrasadas" aplica o filtro rápido correspondente;
  "minhas" ativa "Minha fila"; "Cliente"/"Pricetax" alternam o filtro
  de lado (`ownerFilter`, o mesmo já usado no popover Filtros); "reuniões" é
  só informativo (contagem de reuniões da empresa), sem filtro
  associado. Contagem de "Cliente"/"Pricetax" é só de pendências ativas
  (mesmo critério de "pendentes"), igual às outras — pedido do Rafael
  pra ver de cara quanto está com cada lado.
  **Fix 2026-09-10**: os 5 cards eram dois `useState` independentes
  (`quickFilter` e `ownerFilter`) que nunca se resetavam entre si — clicar
  em "minhas" e depois em "Pricetax" combinava os dois filtros (AND) em
  vez de trocar, mesmo o visual mostrando só um card "ativo" por vez.
  Além disso `quickFilter === 'atrasadas'` nunca era checado dentro do
  `filteredRows` — o card contava certo mas não filtrava a lista.
  Corrigido com um único helper `selectStat(quickValue, ownerValue)`
  que sempre define os dois estados juntos (clicar no card já ativo
  desliga tudo, voltando pra `('todos','todos')` = "pendentes"), e
  adicionando o check de `atrasadas` que faltava em `filteredRows`
  (mesmo critério do `stats.atrasadas`: pendente + `dueDate < hoje`).
  Rótulos "cliente"/"pricetax" também corrigidos pra "Cliente"/"Pricetax"
  (Rafael reclamou da minúscula). Testado localmente no browser com
  dados reais (2 tarefas, uma atrasada/Pricetax, uma futura/Cliente/minha):
  os 5 cards agora são mutuamente exclusivos e cada um filtra a lista
  corretamente. Ver [TodoBoard.jsx](src/meetings/TodoBoard.jsx).
- **"Minha fila" é a visão padrão ao abrir a aba** — filtra por
  `responsible` batendo (case-insensitive, substring — cobre responsável
  combinado tipo "Gustavo, com a Francine") com o nome do usuário logado.
  Mostra uma mensagem contextual ("Boa tarde, Nome. Você tem N
  atividade(s)...") calculada de dado real, ou "Nenhuma atividade exige
  sua atenção agora." quando a fila está vazia — nunca fica em branco.
  Chips: Minha fila / Todos / Hoje / Próximos 7 dias.
- **Popover Filtros** (status multi-select, lado PRICETAX/cliente,
  reunião, sem prazo, com subtarefas, criadas por mim) e **popover
  Ordenar** (prioridade inteligente — atrasada > urgente > prazo — mais
  recente/antiga, prazo próximo/distante, responsável, status; escolha
  persiste em `localStorage`). Um único `openPopover` (`'add' | 'filters'
  | 'sort' | 'more' | null`) garante que só um popover fica aberto por
  vez.
- **Agrupamento com seletor** — Status (default, mesmo comportamento de
  antes: Concluída/Não é relevante colapsados por padrão) / Responsável
  (alfabético, "Sem responsável" por último) / Reunião (mais recente
  primeiro).
- **Linha vira card, não formulário**: checkbox conclui em 1 clique
  (mostra toast "Atividade concluída · Desfazer" — reaproveita
  `useToasts()`/`pushUndoToast`, já existente pro quadro pessoal;
  desmarcar volta pro status `nao-iniciado`, não guarda o status
  anterior). Título é `<textarea>` que cresce sozinho (nunca corta texto
  — bug relatado pelo Rafael numa rodada anterior, com um título de ~140
  caracteres cortado no meio da palavra); `subtitle` aparece embaixo,
  cinza, truncado com `title=` (tooltip nativo) se for muito longo.
  Responsável mostra avatar com iniciais + cor (gerada a partir do nome,
  sem cadastro) e vira campo editável só ao clicar (`editingField` no
  `TodoBoard.jsx`, um único estado tipo `"${rowId}:responsible"` —
  evita ter um input sempre aberto por linha). Prazo mostra um chip
  ("Sem prazo" / data / "Vencida há N dias" em vermelho), mesma lógica
  de clique-pra-editar. Hover revela ações rápidas (Comentar — abre o
  drawer já com foco no campo de comentário via prop `focusComment` —
  Duplicar, Excluir) com opacidade 0→1 em ~140ms.
- **Clicar na linha abre o painel lateral** (`TodoDrawer.jsx`, ~460px,
  desliza da direita, overlay semi-transparente mantém a lista visível
  atrás) em vez de navegar pra outra tela. Todo elemento interativo da
  linha (`select`, inputs, botões) chama `e.stopPropagation()` pra não
  abrir o drawer sem querer.
- **Drawer**: status (chip/`<select>` no topo) → título/subtítulo →
  Empresa/Lado/Responsável/Prazo → **Origem** (card clicável com nome +
  data da reunião, chama `onOpenMeeting`) → **Descrição** (`notes`) →
  **Subtarefas** (checklist simples `{id, title, done}`, progresso "N de
  M", adicionar com Enter) → **Comentários** (lista + campo com
  Cmd/Ctrl+Enter pra enviar, só autor ou `role==='master'` pode excluir)
  → **Arquivos** (upload via `<input type=file>`, baixar via
  `<a download>`, remover) → **Histórico** (ver acima). Indicador
  "Salvando.../Salvo" reaproveita `useAutosaveTimestamp`/
  `savedStatusLabel`, já genéricos no `App.jsx`.
- **Rastreabilidade bidirecional com a reunião de origem**: o modal da
  reunião (`MeetingDetailModal`, `Meetings.jsx`) mostra um badge
  clicável "Gerou N atividades · X concluídas · Y pendentes" (calculado
  direto de `meeting.actionItems`, sem duplicar dado) que chama
  `onViewActivities(meetingId)` — troca pra aba Atividades, muda o
  filtro rápido pra "Todos" e aplica o filtro de Reunião daquele id
  (`focusMeetingId`/`onClearFocusMeeting`, estado em `App.jsx`,
  consumido uma vez via `useEffect` em `TodoBoardView`).
- **"+ Nova tarefa"** virou um popover rápido (Título, Responsável,
  Prazo, Reunião — default a mais recente) em vez de criar um item em
  branco genérico e precisar renomear depois; ao criar, o item recém-
  criado abre automaticamente no drawer (`pendingOpenId`, um `useRef`
  que espera o item aparecer em `allRows` depois do próximo render).
- **Exportar Excel** moveu pro menu "..." (popover `'more'`) — mesma
  lógica de exportação de antes (todos os itens, não só os filtrados),
  colunas Reunião/Data/Título/Lado/Responsável/Status/Prazo.
- **Melhoria transversal pequena**: `persistProjectDebounced` (`App.jsx`)
  ganhou um toast de erro (reaproveitando `useToasts()`, chamado uma vez
  no nível do `App()`) quando o PATCH do projeto falha — antes esse erro
  só ia pro `console.error` e o usuário nunca ficava sabendo que uma
  edição não salvou. Isso beneficia qualquer edição de projeto, não só
  Atividades.

### Fora do escopo desta entrega (não pedido pra agora / adiado
conscientemente — não assumir que existe)

- Tela cruzando todas as empresas ("Minha fila" pessoal e global, fora
  do escopo de uma única empresa) — Rafael escolheu explicitamente não
  construir isso agora.
- Seleção em massa de itens, paleta de comando (Cmd+K), drag-and-drop
  manual de posição dentro de um grupo, virtualização de lista (sem
  necessidade com o volume atual de itens).
- Rich text de verdade (negrito/lista/link) e @menção com notificação
  nos comentários — `subtitle`/`notes`/comentários são texto simples.
- Storage de arquivo de verdade — anexos são base64 no JSONB, mesmo
  limite/mesma limitação do XFlow (sem verificação de tamanho no
  servidor, só no cliente).
- Reorganização da navegação das outras abas (Resumo/Gantt/Tabela/Fases/
  Quadro) em algo tipo "Visão Geral/Cronograma" — só a aba TO
  DO→Atividades mudou; as outras seguem como estavam.

## 26. Reunião — "AI Meeting Workspace" (2026-09)

Redesign completo da tela de detalhe de reunião (antigo `MeetingDetailModal`,
formulário denso de `<textarea>`s) — motivado por feedback direto do
Rafael de que a tela competia visualmente, cortava título, e não passava
sensação de "a IA já organizou isso pra mim". Referência de UX: Linear/
Notion/Granola, mesma linguagem visual da aba Atividades (§25) — os dois
módulos precisavam "parecer parte do mesmo produto".

### Onde mora o dado (sem migration)

Continua tudo dentro de `meeting` (JSONB, `project.data.meetings[]`) —
nada mudou de lugar. Campos novos, default vazio, sem afetar reunião
antiga:
```js
{ ...campos atuais,
  topics: [{ title, startTime }],       // índice leve de tópicos, NÃO reproduz a fala
  highlights: [{ type, time, quote }],  // até 10, citação literal curta
  shareToken: '', shareVisibility: 'private' }
```
`topics`/`highlights` só existem em reuniões processadas pela IA
**depois** deste deploy — reunião antiga cai no fallback (ver Transcrição
abaixo), sem reprocessamento automático (decisão explícita do Rafael:
"gerar atividades"/reprocessar reunião existente com IA ficou fora do
escopo desta entrega).

### Arquivos novos

- `src/meetings/MeetingDetail.jsx` — `MeetingDetailModal` (tela
  principal, substituiu o que antes vivia em `Meetings.jsx`),
  `MeetingShareModal`, `MeetingPrintReport`, `PublicMeetingScreen`.
- `src/meetings/TranscriptView.jsx` — card de transcrição com os 3 modos.
- `src/meetings/ActivityRow.jsx` — linha de atividade extraída de
  `TodoBoard.jsx` (era uma função interna `renderRow`) pra ser
  **literalmente o mesmo componente visual** usado na aba Atividades e
  na coluna de atividades da Reunião — inclui `ACTIVITY_ROW_CSS`
  exportado (cada tela que renderiza `<ActivityRow>` precisa incluir
  esse `<style>` uma vez; `TODO_BOARD_CSS` em `TodoBoard.jsx` só tem mais
  o CSS de entorno — filtros/stat cards/popovers — não da linha em si).
- `src/meetings/meetingUtils.js` — `parseTranscript` (regex best-effort),
  `sliceEntriesByTopics`, `buildMeetingText` (exportação .txt),
  `downloadTextFile`, `HIGHLIGHT_TYPE_META`.
- Reaproveitado sem mudança: `TodoDrawer.jsx` (aberto direto a partir da
  coluna de atividades da reunião — mesmo componente, `onOpenMeeting`
  vira no-op porque já se está dentro da reunião de origem).

### Transcrição em 3 modos — por que o design é assim

O schema de extração da IA (`server/meetingInbox.js`) ganhou `topics` e
`highlights`, mas **deliberadamente não pede pra IA reproduzir a
transcrição** — só título+timestamp de cada tópico e citações curtas nos
highlights. Reproduzir a call inteira de volta infla `max_tokens`
proporcionalmente ao tamanho da reunião (risco real com reuniões longas)
e cria risco de a IA reescrever a fonte, o que o pedido original proibia
explicitamente ("nunca alterar a transcrição original").

Em vez disso, `parseTranscript()` (client-side, `meetingUtils.js`)
reconhece por regex o padrão real observado nas transcrições do Rafael
(linha de horário tipo `00:00` ou `00:00 – 00:01`, linha de nome, texto)
e monta as "bolhas de fala" — isso roda em **qualquer** reunião, inclusive
as antigas, sem depender de IA nova. `sliceEntriesByTopics()` só corta
essas entradas já parseadas usando o `startTime` que a IA identificou.
Fallbacks em cascata, sempre honestos (nunca finge estrutura que não
existe):
- Sem `topics` (reunião antiga, ou nunca processada por IA): aba "Por
  temas" mostra aviso, não esconde a aba.
- `parseTranscript` não reconhece padrão suficiente (transcrição colada
  num formato diferente): aba "Completa" cai pra parágrafo simples (nunca
  textarea); "Por temas" mostra só o título de cada tópico, sem conteúdo.
- Sem `highlights`: aba mostra aviso, mesma lógica.
- Busca (`Buscar na transcrição...`) funciona nos 3 modos, com contador e
  navegação ↑/↓ — a contagem de resultados só é lida de volta num
  `useEffect` depois do commit do React (o contador incrementa como
  efeito colateral durante o render do highlight, não pode ser lido no
  corpo da função — bug real encontrado e corrigido durante o teste local:
  mostrava sempre "0 resultados" mesmo com o texto destacado certo).
- Sem virtualização de verdade (nenhuma lib no projeto) — só renderização
  incremental ("Carregar mais", 150 por página), suficiente pro volume
  real de uma transcrição de reunião.

### Compartilhar (link público, só-leitura)

Mesmo padrão de token do quadro pessoal (`genShareToken()`, gerado no
cliente — não é criptograficamente forte, risco aceito historicamente,
registrado aqui porque reunião pode ter conteúdo mais sensível que uma
lista de tarefas pessoal), mas com uma diferença deliberada: **sem rota
PATCH pública**. `findMeetingByShareToken` (`server/routes.js`) escaneia
todos os projetos (mesmo trade-off aceito do `findBoardByShareToken` —
poucas empresas hoje) procurando `data.meetings[].shareToken`. `GET
/api/public-meeting/:token` (`optionalAuth`) devolve só `{meeting,
companyName}` — nunca o resto do projeto (equipe, outras reuniões,
cronograma). Rota ativada por
`window.location.pathname.match(/^\/reuniao\/([A-Za-z0-9_-]+)/)` em
`App.jsx` (mesmo esquema hardcoded do `/quadro/:token`), renderizando
`PublicMeetingScreen` — reaproveita a mesma UI de leitura, sem nenhum
controle de edição.

### Exportar

PDF via `MeetingPrintReport` (mesmo padrão `display:none` → `@media
print{display:block}` do `PrintReport` existente, mas layout de 1
reunião só) — ativado por `exportMeetingPdf()` (`App.jsx`), que monta o
componente num estado `meetingToPrint`, chama `window.print()` e desmonta
em seguida. Texto via `buildMeetingText()` + `downloadTextFile()` (Blob +
`<a download>`, sem lib nova).

### Fora do escopo desta entrega

- Reprocessar/gerar atividades via IA numa reunião já existente (decisão
  do Rafael) — criar atividade continua manual.
- Reorganização da navegação superior (Resumo/Gantt/Tabela/Fases/Quadro
  → "Visão Geral/Cronograma") — decisão do Rafael, mesma da aba
  Atividades (§25).
- Speaker mapping manual ("Speaker 1 → escolher participante") — as
  transcrições reais já vêm com nome de verdade na fala.
- Word/ata formatada, playback de áudio, "pergunte à IA sobre a
  reunião", follow-up automático — nenhum suporte hoje.
- Rota PATCH no link público — é só-leitura por decisão explícita.

## 27. Assistente Inteligente de Projetos — Fases 1 e 2 (2026-09)

Rafael pediu um "Assistente Inteligente de Projetos" de verdade —
conversar com o histórico real do projeto (reuniões, transcrições,
decisões, atividades), com fonte obrigatória e zero alucinação
apresentada como fato. O pedido descreve 6 fases (fundação → chat →
base de conhecimento corporativa → inteligência cross-projeto →
proativo → ações executáveis). **Esta seção documenta só a Fase 1**
(fundação de memória) — decidido com o Rafael entregar em etapas
seguras; chat, base de conhecimento, proatividade e ações **não
existem ainda**, ficam como roteiro nas seções abaixo.

### Identidade — RENATA (2026-09-10)

O Rafael deu um nome e uma identidade completa pro assistente:
**RENATA** — Reforma, Execução, Negócios, Agilidade, Tecnologia e Ação.
Ela é descrita como irmã da **IVANA** (a persona/metodologia de IA
tributária da PRICETAX, ver memória de sessão
`ivana-metodologia-reforma-tributaria` — não é um produto/API separado
dentro deste repositório, é uma forma de atuar que o Claude adota em
sessões de consultoria tributária): a IVANA interpreta legislação,
Reforma Tributária, IBS/CBS e regras fiscais; a RENATA transforma
reuniões e decisões em execução real — atividades, responsáveis,
prazos, riscos, próximos passos. Princípio central dado pelo Rafael:
"toda informação relevante precisa virar conhecimento, todo
conhecimento relevante precisa virar decisão, toda decisão relevante
precisa virar ação."

O pedido original é um "character brief" extenso (personalidade,
missão, papel combinando Scrum Master + PM + PMO + Business Analyst +
Assistente Executiva + IA de Conhecimento Corporativo, dezenas de
exemplos de pergunta/resposta e de sinalização proativa) — **o que foi
efetivamente implementado nesta rodada é a fatia que cabe na
arquitetura já construída** (prompt de `resolveQuery`/`synthesizeAnswer`,
`server/assistantRetrieval.js`), não o brief inteiro:

- **Nome e identidade**: UI renomeada de "Assistente do Projeto" pra
  **RENATA** (botão flutuante, cabeçalho do painel,
  `src/assistant/ProjectAssistant.jsx`); o prompt instrui a IA a se
  apresentar como RENATA quando perguntarem quem ela é, e a mencionar a
  IVANA quando o assunto for tributário técnico demais pra concluir
  sozinha ("sinalize que esse ponto merece uma análise tributária
  dedicada, o tipo de trabalho que a IVANA faz" — não é uma integração
  de verdade entre dois sistemas, é uma instrução de prompt pra
  reconhecer o limite e indicar o caminho certo).
- **Fato vs. interpretação, reforçado**: já existia a regra de nunca
  inventar; agora o prompt pede explicitamente pra sinalizar quando algo
  parece uma atividade mas falta responsável/prazo nos trechos ("Identifiquei
  isso como uma possível atividade, mas a reunião não deixou explícito
  quem é responsável nem o prazo") em vez de completar a lacuna.
- **Interpretação de intenção, não só palavra literal**: instrução nova
  no prompt de síntese pra reconhecer padrões de fala como compromisso
  ("vou verificar"), dependência ("depende do fornecedor"), impedimento
  ("não conseguimos fechar porque faltou X") e marco ("vamos implementar
  em [data]") ao interpretar trechos de reunião.
- **Tom executivo**: instrução pra preferir resposta curta e direta
  quando resolver, priorizando clareza/ação/contexto/prioridade.

**Deliberadamente NÃO implementado nesta rodada** — o brief descreve
muita coisa que já estava no roteiro de Fases 3-5 (ver "Roteiro das
próximas fases" no fim desta seção) e continua não construída,
só ficou mais detalhada como visão:
- **Memória cross-projeto** ("esse tema já apareceu em outro projeto
  X") — precisa da Base de Conhecimento Corporativa (Fase 3/4,
  `scope='org_knowledge'`), que não existe. A busca hoje (`searchProjectMemory`)
  é sempre escopada a `org_id`+`project_id` — isso é bom pra segregação
  de confidencialidade entre clientes (que o brief também pede), mas
  significa que a RENATA estruturalmente não vê outros projetos ainda.
- **Alertas proativos sem o usuário abrir o chat** ("ao abrir o
  projeto, ela já avisa: 4 atividades vencidas...") — a única
  superfície proativa hoje é responder-e-aproveitar-a-resposta-pra-levantar-um-ponto
  (participante sem identificação, pendência criada por ela mesma ainda
  aberta); não existe nenhum gatilho que dispara sem o usuário mandar
  mensagem.
- **Detecção de contradição entre decisões de reuniões diferentes**,
  **detecção de scope creep**, **geração de briefing pré-reunião como
  entregável estruturado** — o prompt tem instrução geral pra "buscar
  padrões" quando relevante durante uma resposta normal, mas não há
  lógica dedicada pra nenhum desses três; a RENATA só percebe isso se o
  contexto retornado pela busca lexical realmente trouxer os trechos
  contraditórios/repetidos juntos numa mesma pergunta.
- **Vocabulário de Scrum formal** (backlog, sprint, milestone,
  entregável como conceitos explícitos de dado) — não virou campo novo
  no banco nem UI nova; continua usando o modelo de dado já existente
  (`meeting.actionItems`, `project.activities`) sem introduzir essas
  abstrações.

### Decisões tomadas nesta rodada

1. **Sem embeddings/pgvector agora** — busca lexical (full-text search
   nativo do Postgres) em vez de busca semântica de verdade. Evita
   depender de um provedor de embeddings novo (Anthropic não tem API de
   embeddings própria — precisaria de Voyage AI ou OpenAI) e evita
   depender de confirmar/habilitar a extensão `pgvector` no Postgres do
   Railway. Upgrade para embeddings fica documentado como próximo passo
   técnico, não construído agora.
2. **Só Fase 1** — sem painel de chat visível pro usuário ainda. O que
   existe é a fundação (dado indexado + uma função de recuperação
   testável via rota interna), que a Fase 2 vai consumir.

### Onde mora a memória (`project_memory_chunks`, `server/db.js`)

Uma tabela relacional nova — **não** duplica a transcrição/reunião
original (que continua vivendo só em `projects.data.meetings[]`, fonte
de verdade). É um índice DERIVADO e recriável: apagar e reindexar nunca
perde dado de verdade, porque tudo vem de novo a partir do JSONB do
projeto. Um chunk é um trecho pesquisável de: segmento de transcrição,
resumo, decisão (uma por linha), highlight, tópico, item de ação ou
comentário de item de ação — cada um com `participants` (nomes
relevantes, pra filtro por pessoa), `meeting_date`/`meeting_title`
(denormalizado, evita reabrir o projeto só pra exibir a fonte),
`time_ref` (timestamp literal da transcrição quando existir), e
`source_ref` (JSON com `meetingId`/`activityId`/`commentId` — o
suficiente pra uma futura UI abrir a fonte exata). Campo `scope`
(default `'project'`) já existe pensando na Fase 3 (Base de
Conhecimento Corporativa, valor futuro `'org_knowledge'`), mas não é
usado ainda.

Full-text search em português (`to_tsvector('portuguese', ...)`), com
**tratamento de acento via a extensão `unaccent`** (padrão do Postgres,
não é algo exótico tipo pgvector) — sem isso, "débito" e "debito" (uma
transcrição colada nem sempre vem com acentuação correta) contariam
como palavras diferentes pra busca, um problema real encontrado e
corrigido durante o teste local desta fase. Como `unaccent()` não é
`IMMUTABLE` por padrão (não pode entrar direto numa coluna gerada), há
um wrapper `immutable_unaccent()` — padrão documentado da própria
comunidade Postgres pra esse caso exato.

### Ingestão (`server/memoryIngest.js`)

`reindexMeetingMemory(pool, orgId, projectId, meeting)` apaga e recria
do zero os chunks de UMA reunião (idempotente — pode rodar quantas
vezes for preciso sem duplicar). `reindexProjectMemory` roda isso pra
toda reunião não excluída de um projeto (usado no backfill).
`syncProjectMemoryFromDiff(pool, orgId, projectId, current, next_)` é
chamado **dentro do `PATCH /api/projects/:id`** (`server/routes.js`),
depois de responder o HTTP (fire-and-forget, mesmo padrão de todo
efeito colateral assíncrono já usado no resto do sistema) — compara
`meetings[]` antes/depois (mesmo espírito do diff que
`notifyActivityChanges` já faz pra notificações) e só reindexa as
reuniões que realmente mudaram de conteúdo; reunião apagada
(soft-delete) tem os chunks removidos, não reindexados. Como não há
chamada de IA nesse caminho (embeddings ficaram de fora desta fase), o
custo é só SQL local — testado ao vivo editando uma reunião pela UI
normal e confirmando via `psql` que a reindexação rodou sozinha sem
atrasar nem quebrar o autosave já existente.

**Backfill**: `server/scripts/reindexAllMeetings.js` — script manual
(`node server/scripts/reindexAllMeetings.js`) que reindexa TODAS as
reuniões de TODOS os projetos já existentes (necessário pra memória
cobrir o histórico que já existia antes desta fase — não só reuniões
novas daqui pra frente). Rodado localmente durante o desenvolvimento;
em produção precisa ser rodado manualmente uma vez depois do deploy
(operação revisada com o Rafael antes, por escrever em massa numa
tabela nova).

`parseTranscript`/`sliceEntriesByTopics`/`splitDecisionLines`, que
antes viviam só em `src/meetings/meetingUtils.js` (frontend), foram
extraídas pra `shared/transcriptParser.js` (raiz do repo, sem
dependência de React nem de Express) — importadas tanto pelo frontend
(reexportadas de `meetingUtils.js`, zero mudança de comportamento na
tela de Reunião) quanto por `server/memoryIngest.js`, pra nunca ter duas
implementações do mesmo reconhecimento de padrão de transcrição
divergindo com o tempo.

### Recuperação (`server/memoryRetrieval.js`)

`searchProjectMemory(pool, {orgId, projectId, query, participant,
meetingId, dateFrom, dateTo, kind, limit})` — sempre filtra por
`org_id`+`project_id` (isolamento de tenant/projeto, mesmo par que
`canAccessProject` já valida na camada de rota), com filtros opcionais
por participante (`participants @> [...]::jsonb`), reunião, tipo de
chunk e intervalo de data. Ranking combina relevância textual
(`ts_rank_cd`) com um leve bônus de recência (reunião mais recente
ganha até +0.2 no score, decaindo em ~180 dias) — busca híbrida no
sentido lexical+temporal+metadado, sem semântica de verdade ainda.

**Rota interna de verificação** (não é o chat): `POST
/api/_internal/memory-search`, atrás de `requireAuth` +
`canAccessProject` — usada só pra provar que a Fase 1 funciona de ponta
a ponta antes da Fase 2 existir (testado via `curl` nesta sessão:
busca por palavra-chave com/sem acento, filtro por participante,
rejeição de projeto inacessível). Nenhuma tela consome isso ainda.

### Fase 2 — Chat do Projeto (implementado)

Painel **"Assistente do Projeto"** — botão flutuante + painel lateral
(`src/assistant/ProjectAssistant.jsx`), visível só nas abas Reuniões e
Atividades (`!isMulti && (view==='meetings' || view==='todo')`,
`App.jsx`). Uma conversa contínua por usuário+empresa (não múltiplas
conversas nomeadas) — índice único `(project_id, user_id)` em
`ai_conversations` garante isso no banco. Cada mensagem grava fontes
(`sources` JSONB), se houve evidência suficiente (`has_evidence`), o
contexto usado (`scope`) e observabilidade básica (modelo/tokens/
latência) — tudo isso já nasce junto pra não precisar de uma segunda
migration depois.

**Pipeline de 2 chamadas à IA** (`server/assistantRetrieval.js`), o
mesmo padrão de saída estruturada garantida (`client.messages.parse` +
Zod) já usado em `meetingInbox.js`:
1. `resolveQuery()` — recebe a pergunta + os últimos turnos da conversa
   + contexto (aba atual, reunião aberta se houver) e devolve uma busca
   autossuficiente, resolvendo pronomes/referências do turno anterior
   ("esse assunto" → "nota de débito"). Barata e rápida (max 500 tokens).
2. `searchProjectMemory()` (Fase 1, reaproveitada sem mudança) busca na
   memória do projeto com esse resultado.
3. `synthesizeAnswer()` — recebe a pergunta + os trechos recuperados +
   histórico, devolve a resposta final + `citedChunkIds` + `hasEvidence`.
   Prompt explícito: nunca inventar, e se `hasEvidence=false` a resposta
   deve ser literalmente "Não encontrei evidência suficiente nas
   reuniões ou documentos deste projeto."

**Anti-alucinação por validação, não só por instrução de prompt**: todo
`chunkId` que a IA cita em `citedChunkIds` é conferido contra o conjunto
de chunks que foi de fato recuperado naquela pergunta
(`askProjectAssistant`, `server/assistantRetrieval.js`) — qualquer id
que não bater é descartado da lista de fontes (sem derrubar a resposta)
e a anomalia fica registrada via `console.error`, pra poder ser
monitorada.

**Decisão deliberada de não religar "atividade aberta no `TodoDrawer`"
pra consciência automática do assistente nesta fase** — esse estado
hoje é local a dois componentes (`TodoBoardView` e
`MeetingDetailModal`), religar só pra isso seria uma refatoração à
parte; o assistente continua respondendo bem sobre atividades
específicas via busca (`kind='activity'`), só não fica "grudado"
automaticamente numa atividade aberta. O contexto de "reunião aberta"
funciona normalmente, porque `openMeetingId` já era estado global em
`App.jsx`.

**Rotas** (`server/assistant.js`, montado em `/api/assistant`): `GET
/conversation?projectId=` (carrega ou cria a conversa), `POST /ask`
(pergunta — 503 explícito se `ANTHROPIC_API_KEY` não estiver
configurada, mesmo padrão do `meetingInbox.js`), `POST
/conversation/clear?projectId=` ("Limpar conversa" do painel), `POST
/messages/:id/feedback` (👍/👎). Mesma autorização de toda rota de
projeto (`canAccessProject`), sem tabela de permissão nova.

**Detalhe de UI encontrado e corrigido durante o teste local**: o
painel do assistente precisou de um z-index maior que o dos modais de
Reunião/Atividade (60) — inicialmente usava 55/56 e ficava escondido
atrás do modal quando aberto por cima de uma reunião; corrigido pra 90
(abaixo só do `ConfirmDiscardModal`, que é 200 e deve continuar sendo o
mais alto de todos).

**Bug de intenção corrigido após o deploy inicial**: o pipeline tratava
toda mensagem, inclusive saudação ("olá"), como pergunta factual —
`synthesizeAnswer` forçava a resposta canônica "Não encontrei evidência
suficiente..." sempre que os trechos recuperados não sustentavam uma
resposta, sem exceção pra conversa social. Corrigido adicionando
`intent` (`'pergunta_sobre_projeto'` | `'conversa_geral'`) e
`directReply` ao schema/prompt de `resolveQuery()` — mensagens de
`conversa_geral` recebem uma resposta calorosa gerada na própria
primeira chamada e **pulam** `searchProjectMemory`/`synthesizeAnswer`
inteiramente (`askProjectAssistant`, `server/assistantRetrieval.js`);
`hasEvidence` fica `null` (não `false`) nesse caso, pra não acionar o
estilo visual de "sem evidência" no painel pra uma simples saudação.

**Bug corrigido (2026-09-10) — assistente não sabia responder identidade
do cliente**: o Rafael reportou que perguntar "qual o nome do cliente?
qual o regime tributário?" retornava "Não encontrei evidência
suficiente..." — **causa raiz**: o pipeline só buscava na memória de
reuniões (`project_memory_chunks`), e nome/CNPJ/regime tributário nunca
vêm de transcrição nenhuma, vêm do cadastro (`project.company`). O
mesmo valia pra cronograma: perguntas sobre atividades/fases/prazos do
Cronograma (abas Resumo/Gantt/Tabela/Fases/Quadro) também não eram
respondíveis, porque essa base (`project.activities`/`project.phases`)
nunca foi indexada como memória de reunião.

**Fix — PERFIL DO PROJETO (`server/assistantContext.js`,
`buildProjectSnapshot(project)`)**: função pura que monta um resumo
compacto e sempre atualizado, direto do JSONB do projeto (sem busca,
sem IA, cabe inteiro em todo pedido — diferente da memória de reuniões,
que é grande e por isso precisa de busca lexical): identidade do
cliente (razão social, nome fantasia, CNPJ, regime tributário, tipo de
projeto, status), equipe/contatos externos, fases, contagem de
atividades por status, **atividades atrasadas** (prazo vencido e não
concluídas, mais antiga primeiro) e próxima atividade agendada,
resumo de reuniões (total/última realizada/próxima programada) e
**pendências de reunião (TO_DO) em aberto** com uma seção separada de
**alertas críticos** (status `urgente` ou prazo vencido) sempre antes
da lista cronológica. `askProjectAssistant` (`server/assistantRetrieval.js`)
carrega `project.data` (já vinha carregado pela rota, `server/assistant.js`
— só passou a ser repassado, não gerou query nova) e injeta esse perfil
tanto em `resolveQuery` (ajuda a resolver "o cliente"/"a empresa" pelo
nome real) quanto em `synthesizeAnswer`, que agora tem **duas fontes de
verdade**: o PERFIL DO PROJETO (responde direto, sem citação de chunk)
e os trechos de reunião recuperados (citação obrigatória, como antes).
`hasEvidence` passa a considerar as duas fontes — só vira `false`
quando nem uma nem outra respondem.

**Aprendizado persistente (2026-09-10, pedido do Rafael: "gere
aprendizado... memorize isso, não jogue no lixo")**: nova tabela
`ai_project_insights` (`id`, `org_id`, `project_id`, `content`,
`created_at`) — **fora** de `ai_messages` de propósito, porque um fato
aprendido sobre o projeto não deve ser perdido quando o usuário clica
"Limpar conversa" (que só apaga `ai_messages`). `SynthesizeAnswerSchema`
ganhou um campo `learnedFact` (nullable) — preenchido pela IA só quando
a troca revela algo durável e reutilizável (ex.: uma preferência do
cliente, um padrão recorrente); quando presente, é gravado na tabela
via `saveInsight()` (fire-and-forget, erro não derruba a resposta já
pronta). `askProjectAssistant` carrega os últimos 50 aprendizados
(`loadInsights`, ordem cronológica) e injeta em todo `synthesizeAnswer`
como "Aprendizados acumulados em conversas anteriores sobre este
projeto" — persistem entre conversas, entre sessões, e não são
resetados por projeto.

**Comportamento cronológico + alertas (2026-09-10, pedido explícito do
Rafael)**: o prompt de `synthesizeAnswer` agora instrui explicitamente
que, ao listar várias reuniões/atividades, a resposta deve vir sempre
da mais antiga pra mais atual (nunca por ordem de cadastro), mas
começando pelos pontos mais críticos/urgentes/atrasados antes de entrar
na lista cronológica — mesmo critério já aplicado à UI (Reuniões
Realizadas, Agrupar por Reunião em Atividades, ver seção "Reuniões
(2026-09)" acima) agora também rege como o assistente **fala** sobre
esses dados, não só como a tela os exibe.

**Testado localmente sem `ANTHROPIC_API_KEY`** (mesma limitação de
sempre — não há chave local, e a regra do projeto é nunca pedir a
chave ao Rafael): `buildProjectSnapshot()` testado isoladamente (função
pura, sem IA) com dados realistas e com projeto vazio/incompleto, sem
erro; `loadInsights`/`saveInsight` testados direto contra o Postgres
local (grava, lê em ordem, limpa); `initDb()` roda limpo e cria
`ai_project_insights` corretamente; `node --check` limpo nos 3 arquivos
tocados (`assistantContext.js` novo, `assistantRetrieval.js`,
`assistant.js`). **Não testado**: a qualidade real da resposta da IA
usando o perfil do projeto (depende da chave real em produção) — pedir
ao Rafael pra testar "qual o nome do cliente?"/"qual o regime
tributário?"/"quais atividades estão atrasadas?" ao vivo.

### Fase 6 v1/v2 — Agente executor (2026-09-10, adiantada a pedido do Rafael)

O Rafael pediu explicitamente pra adiantar a capacidade de execução
("ele precisa ser um agente executor também... sempre trazendo pro
usuário validar e confirmar tudo") antes das Fases 3-5. **v1** entregou
o primeiro tipo de ação (criar pendência de reunião) pra validar o
padrão end-to-end com o menor risco possível. **v2** (mesmo dia, depois
de assistir a gravação de um teste real do Rafael e da Amanda usando o
assistente com a empresa Te Cansa) ampliou o escopo com o que ficou
explícito na prática — inclusive um segundo tipo de ação, reagendar
atividade do cronograma.

- **Dois tipos de ação suportados**:
  - `create_meeting_todo` — criar uma pendência (TO_DO) numa reunião.
    **v2**: deixou de exigir que a reunião esteja aberta na tela — o
    Rafael/Amanda pediram explicitamente poder criar um "próximo passo"
    sem estar dentro de uma reunião específica ("estou trabalhando
    nisso agora, já tem atividade? não, então crie"). Agora a IA pode
    vincular a QUALQUER reunião real do projeto (lista completa com id
    exposta no PERFIL DO PROJETO, `server/assistantContext.js`), com a
    reunião aberta (se houver) só como sugestão mais provável — ainda
    valida contra o projeto de verdade antes de deixar confirmar.
  - `reschedule_activity` (novo, v2) — mudar a data de uma atividade do
    cronograma oficial (Gantt/Tabela/Fases/Quadro, `project.activities`).
    Pedido explícito do Rafael com um exemplo concreto de UX ditado por
    ele mesmo durante o teste: usuário pede "postergue a atividade X pro
    final do cronograma", a IA responde citando o título exato que
    entendeu + a data nova antes de propor, o usuário confirma, só
    então executa. Só muda `date`/`endDate` (mesmo valor pros dois) —
    deliberadamente simples, não recalcula duração nem mexe em `month`
    (só um rótulo de exibição).
  - Esquema polimórfico via `z.discriminatedUnion('type', [...])`
    (`ProposedActionSchema`, `server/assistantRetrieval.js`) — cada
    ação nova entra como mais uma opção da união, sem duplicar toda a
    lógica de proposta/confirmação/execução.
- **A IA só propõe, nunca executa sozinha.** Instruída a **perguntar
  antes de propor** quando não tiver certeza do alvo (qual reunião,
  qual atividade) — ex.: "Você está falando da atividade 'Split payment
  e demais operações financeiras'?" — só propondo de fato no turno
  seguinte, depois de confirmado por texto. Isso implementa literalmente
  o fluxo que o Rafael descreveu durante o teste: "ele te devolve: você
  está falando da atividade tal? Aí você confirma. Aí ele altera."
- **Defesa em profundidade igual à das citações de chunk** — mas agora
  mais forte que a v1: em vez de exigir que o id bata com
  `context.meetingId` (só a reunião aberta), o backend
  (`askProjectAssistant`) valida o id proposto contra a lista de
  verdade em `projectData.meetings`/`projectData.activities` — qualquer
  reunião/atividade real do projeto é um alvo válido, qualquer id
  inventado ou de item apagado é descartado e vai pro log do servidor.
  De quebra, os títulos exibidos no card de confirmação
  (`meetingTitle`/`activityTitle`/`currentDate`) são **preenchidos pelo
  servidor** a partir do dado real, nunca aceitos do que a IA disse —
  ela não consegue "inventar" um nome bonito pra um id que não bate.
- **Execução de verdade** (`server/assistantActions.js`,
  `executeProposedAction`, um `case` por tipo) só roda depois de `POST
  /api/assistant/messages/:id/action` com `decision:'confirm'`
  (`server/assistant.js`) — clique explícito do usuário no painel.
  `create_meeting_todo` grava no mesmo formato exato de
  `meeting.actionItems[]` e reindexa a memória da reunião
  (`reindexMeetingMemory`); `reschedule_activity` não precisa reindexar
  (atividades de cronograma não fazem parte de `project_memory_chunks`,
  só dado de reunião é indexado). Os dois registram em `project.log`
  com o nome de quem confirmou.
- **Colunas em `ai_messages`**: `proposed_action` (JSONB) e
  `action_status` (`pending`/`executed`/`rejected`) — uma mensagem sem
  ação proposta tem os dois `null`. Rejeitar não muda nada no projeto,
  só marca `action_status='rejected'`; confirmar duas vezes (ex.: duas
  abas abertas) é bloqueado — `decideProposedAction` recusa qualquer
  decisão sobre uma ação que não esteja mais `pending`.
- **UI** (`src/assistant/ProjectAssistant.jsx`, `actionCardMeta()`):
  card amarelo com o resumo da ação (texto muda por tipo — pendência
  mostra título/reunião/responsável/prazo, reagendamento mostra
  data antiga → nova) + botões "Confirmar"/"Cancelar"; depois de
  decidido vira um selo neutro, os botões somem. Confirmar dispara
  `onReloadProjects` (mesmo mecanismo da caixa de transcrições, §24.1)
  pra a mudança aparecer sem precisar sair da tela.
- **Aprendizado sobre pendências criadas pelo próprio assistente**: o
  PERFIL DO PROJETO agora marca quais pendências em aberto foram
  criadas pelo Assistente (`createdBy` contém "Assistente") e instrui a
  IA a perguntar proativamente se já foram resolvidas quando fizer
  sentido no contexto — pedido do Rafael ("quando você voltar, eu
  quero que ele te pergunte: você terminou essa atividade?").

**Testado localmente de ponta a ponta pros dois tipos de ação** (sem
precisar da API key — manufaturei mensagens com `proposed_action`
pendente direto no Postgres local): cards renderizam certo pros dois
tipos, "Confirmar" executa e grava certinho (pendência no formato certo
+ reindexação; atividade com `date`/`endDate` trocados + log com data
antiga/nova), "Cancelar" não muda nada, decidir a mesma ação duas vezes
é recusado. Testei também isoladamente a lógica de validação ampliada
(aceitar reunião/atividade real mesmo sem estar aberta na tela, recusar
id de item apagado ou inexistente). **Não testado**: a IA de verdade
decidindo propor uma ação e formulando a pergunta de esclarecimento a
partir de um pedido em português (depende da chave real em produção) —
peça pro Rafael testar com um pedido tipo "cria uma pendência pro João
confirmar o XML" (sem reunião aberta) e "posterga o split payment pro
final do cronograma".

**Incidente em produção (2026-09-10, corrigido no mesmo dia) — toda
pergunta ao assistente parou de responder no cliente Tecumseh**, com a
mensagem genérica do frontend "Não consegui responder agora" (não a
mensagem "processar" do fallback interno de `askProjectAssistant` — essa
diferença de texto foi a pista de que o erro era um 500 não tratado, não
um erro capturado dentro do pipeline). Duas causas, corrigidas em
sequência:
1. **`z.discriminatedUnion` no `ProposedActionSchema`** gerava um JSON
   schema com `anyOf` aninhado (union dentro de nullable) que a saída
   estruturada da Anthropic API não suporta bem — e como esse campo faz
   parte de `SynthesizeAnswerSchema`, usado por TODA resposta (não só
   as de ação), qualquer pergunta parou de funcionar. **Lição:** nunca
   usar `z.discriminatedUnion`/`z.union` em schema passado pra
   `zodOutputFormat` — sempre objeto achatado com campos nullable por
   variante (o padrão já usado em todo o resto do sistema, nunca
   quebrado até essa exceção).
2. **`buildProjectSnapshot()` era chamado fora do `try/catch`** de
   `askProjectAssistant` — uma exceção ali (nome de contato externo ou
   participante de reunião num formato que meus testes locais com dado
   sintético não cobriram) subia sem tratamento até o handler global do
   Express e virava 500. Corrigido chamando dentro de um `try/catch` com
   fallback seguro, e blindados os dois pontos que assumiam string sem
   checar (`team`/`externalContacts.name`) com `String(x || '')` antes
   de `toLowerCase()`. **Lição:** qualquer função nova que processa
   `project.data` de um cliente real precisa ser exercitada mentalmente
   contra dado "sujo" (campo ausente, tipo inesperado), não só contra
   fixture sintético limpo — e helpers chamados no meio de um pipeline
   maior precisam estar DENTRO do bloco que já trata erro, nunca antes.

### Contexto de atividade via transcrição de origem (2026-09-10)

Pedido do Rafael a partir de um exemplo real de atividade cujo título
sozinho não explica nada ("Solicitar nova apresentação atualizada do
sistema de apuração ao fornecedor") — quando o usuário pede contexto
sobre uma atividade assim, buscar só o chunk `kind='activity'` (que só
tem título/responsável/status/prazo) não ajuda; é preciso ler de
verdade a transcrição da reunião de onde ela nasceu.

**Por que busca por relevância não resolve sozinha aqui**: o título da
atividade é uma paráfrase gerada pela IA a partir da fala — pode não
ter as mesmas palavras que apareceram na conversa original, então uma
busca lexical (`ts_rank_cd`) pelo título pode não achar o trecho certo
da transcrição (que só teria alta relevância textual se usasse
literalmente as mesmas palavras).

**Fix**: `getMeetingTranscriptChunks(pool, orgId, projectId, meetingId)`
(`server/memoryRetrieval.js`, novo) — busca TODOS os segmentos de
transcrição de UMA reunião específica, sem ranking nenhum (não é busca
por relevância, é "me dê tudo dessa reunião" — o LLM é quem lê e acha a
parte certa). Em `askProjectAssistant`, quando `resolveQuery` classifica
`kind="activity"` (descrição do campo reforçada pra reconhecer esse
padrão de pedido) e a busca inicial retorna um chunk de atividade, o
`meetingId` dele é extraído e a transcrição inteira daquela reunião é
buscada e mesclada nos chunks antes de `synthesizeAnswer` — sem
depender de correspondência textual entre o título e a fala original.
Prompt de síntese instruído a ler essa transcrição de verdade e
explicar com as próprias palavras o que estava sendo discutido, não só
repetir os campos da atividade.

**Testado localmente**: reunião de teste com uma atividade cujo título
não repete as palavras da transcrição — confirmado que a busca inicial
por `kind='activity'` acha o chunk certo, o `meetingId` é extraído
corretamente, e `getMeetingTranscriptChunks` retorna os segmentos de
transcrição daquela reunião específica (sem depender de relevância
textual nenhuma). **Não testado**: a IA de verdade lendo esse contexto
enriquecido e produzindo uma explicação em português a partir dele
(depende da chave real em produção).

### Botão "Reindexar memória do projeto" (2026-09-10)

O Rafael reportou em produção que uma reunião continuava "sem
evidência" mesmo depois do fix da reindexação automática (§27, acima)
— porque essa reunião foi criada **antes** do fix, e o backfill
(`server/scripts/reindexAllMeetings.js`) nunca foi rodado (precisa de
acesso direto ao Postgres de produção, que só o Rafael tem, e ele não
tem o script configurado). Em vez de depender de alguém rodar um
script contra o banco, adicionei um botão de autoatendimento **dentro
do próprio painel da RENATA**: ícone de reindexar (`RefreshCw`) no
cabeçalho, ao lado de "Limpar conversa" — chama `POST
/api/assistant/reindex` (`server/assistant.js`), que roda
`reindexProjectMemory` (`server/memoryIngest.js`, já existia, usado só
pelo script de backfill até agora) pra TODAS as reuniões não excluídas
daquela empresa, e devolve `{meetingsIndexed, chunksCreated}` — a
RENATA mostra o resultado como uma mensagem no chat ("Memória
reindexada: N reunião(ões), M trecho(s) atualizados"). Idempotente
(mesma reindexação de sempre, apaga e recria) — clicar de novo nunca
duplica nem piora nada, então é seguro deixar como um botão que
qualquer usuário com acesso à empresa pode clicar sempre que a RENATA
disser que não encontrou conteúdo de uma reunião que claramente existe.

Isso também torna o script de linha de comando (`reindexAllMeetings.js`)
menos crítico como único caminho de correção — continua existindo pra
rodar em TODOS os projetos de uma vez (útil pra um backfill geral), mas
agora corrigir UMA empresa específica não depende mais de acesso ao
Railway/Postgres.

**Testado localmente**: reunião inserida direto no JSONB do projeto
sem passar pela indexação (simulando exatamente o estado de uma
reunião pré-fix) — confirmado 0 chunks antes, clique no botão real na
UI, resposta "Memória reindexada: 1 reunião(ões), 2 trecho(s)
atualizados", e os chunks (`transcript_segment`, `meeting_summary`)
conferidos direto no banco depois.

**Atualização (mesmo dia)**: o botão só dentro do painel da RENATA se
mostrou pouco descobrível — o Rafael não achou ("KD a porra do botão
reindexar?"), porque ele nem tinha aberto o chat ainda, só a tela de
Reuniões. Adicionado o mesmo botão **direto na tela de Reuniões**
(`MeetingsView`, `src/meetings/Meetings.jsx`), na barra de ações ao
lado de "Lixeira"/"Enviar transcrição"/"Nova reunião" — mesma chamada
(`POST /api/assistant/reindex`), resultado mostrado como um texto
inline (verde se OK, vermelho se erro) que some sozinho depois de
alguns segundos, sem precisar abrir o chat pra ver o resultado. O botão
dentro do painel da RENATA continua existindo (não foi removido) — só
deixou de ser o único lugar. Reconfirmado via UI real (reunião de teste
sem chunk nenhum → clique no botão da tela de Reuniões → "Memória
reindexada: 1 reunião(ões), 2 trecho(s)." → chunks conferidos no
banco).

### Bug grave corrigido — "resuma a última reunião" nunca achava o conteúdo, mesmo com memória indexada (2026-09-10)

Depois de reindexar a memória do Tecumseh via botão (acima), o Rafael
ainda reportou: "resuma a última reunião" continuava dizendo que não
tinha trecho de transcrição nenhum — mesmo a reindexação tendo criado
632 trechos. **Causa raiz, mais profunda do que o caso da atividade
(acima)**: a busca lexical usa `plainto_tsquery('portuguese', ...)`
(`server/memoryRetrieval.js`), que faz **E lógico entre todas as
palavras da busca** — se a IA reformula "resuma a última reunião" como
uma query tipo "resumo da reunião mais recente sobre X", e nenhum
trecho contém literalmente TODAS essas palavras juntas (o que é o caso
normal, já que "resumo"/"reunião"/"recente" são palavras da PERGUNTA,
não do CONTEÚDO discutido), a busca sempre volta vazia — não é falta
de sorte no ranking, é uma busca que não pode dar resultado por
construção. Confirmado isoladamente: uma busca de teste com essas
palavras contra os 632 trechos reais (simulados localmente) retornou
zero resultados, incluindo pro `meeting_summary` que continha as
palavras "validação" e "ferramenta" (mas não "resumo"/"recente"/
"reunião" juntas).

**Fix**: `ResolveQuerySchema` ganhou `targetMeetingId` — a IA resolve
qual reunião específica o usuário quer dizer (usando a lista "REUNIÕES
DISPONÍVEIS" no perfil do projeto, que já tinha id+título+data de
todas) sempre que a pergunta se referir a UMA reunião (a última, uma
data, um assunto/título) mesmo sem estar aberta na tela — antes só
existia esse tipo de resolução pra reunião ABERTA (`context.meetingId`,
via `meetingScope='atual'`). Quando presente, `targetMeetingId`: (1)
vira o filtro `meetingId` da busca inicial (mais preciso que buscar o
projeto inteiro); (2) aciona a mesma busca de "transcrição inteira sem
ranking" (`getMeetingTranscriptChunks`) já construída pro caso de
atividade — as duas situações (reunião específica identificada
diretamente, ou identificada indiretamente via o chunk de uma
atividade) agora convergem pro mesmo bloco de enriquecimento, evitando
duplicar a lógica. Mesma defesa em profundidade de sempre: o id
proposto pela IA é validado contra `projectData.meetings` antes de
confiar nele.

**Limitação arquitetural conhecida na época, corrigida em 2026-09-10 (ver
§30 abaixo)**: `plainto_tsquery` com semântica E-lógico-entre-tudo fazia
OUTRAS perguntas de busca ampla falharem do mesmo jeito, não só "resuma
a reunião X" — qualquer pergunta cuja reformulação misturasse várias
palavras que não aparecem todas juntas no mesmo trecho (ex.: "como
funciona o seguro de vida na Tecumseh?"). Resolvido com um fallback OR
(`websearch_to_tsquery`) em `searchProjectMemory` quando a busca E não
acha nada — ver §30.

**Testado localmente**: reproduzido o bug exato (busca genérica com as
palavras da pergunta contra chunks reais não retorna nada, mesmo o
`meeting_summary` tendo palavras em comum) e confirmado que
`targetMeetingId` + `getMeetingTranscriptChunks` recupera o conteúdo
certo independente do resultado da busca por relevância. **Não
testado**: a IA de verdade resolvendo `targetMeetingId` corretamente a
partir de "resuma a última reunião" (depende da chave real em
produção) — pedir pro Rafael reindexar de novo (não precisa, os 632
trechos continuam lá) e testar essa pergunta específica.

### Roteiro das próximas fases (não construído, documentado pra não
ser assumido como existente)

- **Fase 3 — Base de Conhecimento Corporativa**: documentos/legislação,
  temas estruturados, `scope='org_knowledge'`, promoção explícita de
  conhecimento privado → global (nunca automática), governança de quem
  pode promover/editar.
- **Fase 4 — Inteligência cross-projeto**: usar a Base de Conhecimento
  pra responder com contexto de outros projetos, sem nunca vazar
  transcrição/dado privado de um cliente pra outro.
- **Fase 5 — Proativo**: hoje o assistente só levanta pontos
  proativamente (participante sem identificação, pendência criada por
  ele mesmo ainda em aberto) quando o usuário já está conversando (ver
  PERFIL DO PROJETO acima) — nunca sozinho, sem o painel estar aberto.
  Pedidos explícitos do Rafael durante o teste de 2026-09-10, ainda
  **não construídos**, ficam documentados aqui pra não se perderem:
  - Briefing diário **por empresa** ("o que posso priorizar hoje?") —
    decisão explícita dele de construir por empresa primeiro, visão
    cross-empresa (Visão Geral/macro) fica pra depois, de propósito
    ("vamos construir pra essa empresa, aí a gente faz funcionar pras
    outras").
  - Análise de **logs de navegação do usuário** (onde ele clicou, há
    quanto tempo não entra numa atividade atrasada) pra sugerir foco —
    exige uma infraestrutura de tracking que **não existe hoje**
    (`project.log` registra mutação de dado, não navegação/cliques);
    não é só um ajuste de prompt, é um recurso novo de rastreamento.
  - Notificação/pergunta que aparece sozinha quando o usuário abre o
    painel (não só como resposta a uma pergunta) — hoje só existe o
    padrão reativo (usuário pergunta, assistente responde e pode
    aproveitar pra levantar um ponto proativo dentro da resposta).
- **Fase 6 (continuação) — mais tipos de ação executável**: criar
  atividade nova no cronograma oficial (só reagendar uma já existente
  foi construído, v2), criar reunião, alterar status de atividade — cada
  um exige pensar o próprio risco/confirmação, não é só copiar o padrão
  já existente.

## 28. Sincronização entre usuários — "BIP" (2026-09-10)

Rafael reportou: ele e a Amanda com a mesma reunião aberta ao mesmo
tempo, em computadores diferentes — ela concluiu uma atividade lá, e a
tela dele não atualizava (precisava recarregar a página manualmente
pra ver). Pediu algo "tipo um BIP": usuário X altera, usuário Y vê
rápido, "faça algo seguro e funcional".

**Decisão de arquitetura**: **sem WebSocket/servidor de pub-sub**, de
propósito — mesma filosofia já aplicada em outras decisões desta sessão
(busca lexical em vez de pgvector, §27) de não introduzir infraestrutura
nova quando uma solução mais simples resolve. Implementado como
**polling barato + reload condicional**, reaproveitando `reloadProjects()`
que já existia (`src/App.jsx`) — a novidade é só *quando* chamá-lo.

- **`GET /api/projects/versions`** (`server/routes.js`, novo) — mesma
  lógica de autorização de `GET /api/projects` (já existente), mas
  devolve só `{id, updatedAt}` de cada empresa acessível, nunca o JSONB
  inteiro. Faz o mesmo `SELECT ... WHERE org_id=...` e filtro
  `canAccessProject` de sempre — a economia real é não serializar/
  transferir o `data` pela rede numa chamada que roda a cada poucos
  segundos.
- **`src/App.jsx`** — novo `useEffect` (ao lado do que já fazia a carga
  inicial de projetos) que faz polling desse endpoint a cada 6s
  enquanto o usuário está logado, guardando o último `updatedAt`
  conhecido de cada empresa num `useRef` (não dispara re-render por si
  só). Se alguma empresa mudou desde a última checagem, chama
  `reloadProjects()` — a mesma função já usada pela caixa de
  transcrições e pelo agente executor pra atualizar a tela depois de
  uma mudança feita no servidor. Falha de rede no poll é silenciosa
  (é só um heartbeat, não deve virar erro visível).
- **Por que é seguro pra quem está editando algo no meio do caminho**:
  todo campo de texto editável no app já segue o padrão "rascunho local
  + salva no blur" (`EditableTextCard` em `MeetingDetail.jsx`, e o
  equivalente em outros lugares) — o valor mostrado no campo vem de um
  `useState` inicializado UMA vez ao entrar em modo de edição, não
  ligado direto à prop que muda quando os projetos recarregam. Um
  reload em segundo plano não interrompe quem está digitando; se outro
  usuário mudou um campo DIFERENTE do mesmo item enquanto isso, as duas
  mudanças coexistem (patches são por campo, não sobrescrevem o objeto
  inteiro). Editar o MESMO campo ao mesmo tempo em duas telas ainda seria
  "o último a salvar vence" — não resolvido aqui, e não foi o problema
  reportado (o caso real é concluir uma atividade, uma ação atômica de
  1 clique, não edição de texto concorrente).

**Testado localmente com um cenário de dois usuários simulado**: reunião
de teste com uma atividade não iniciada, tela do "Rafael" aberta na aba
Atividades; sem tocar nessa aba, atualizei a atividade pra "concluída"
direto no banco (simulando a "Amanda", incluindo o `updated_at` que o
`PATCH /api/projects/:id` real também sempre atualiza) — em até 8
segundos, sem nenhum reload manual, a tela do "Rafael" moveu a
atividade sozinha pro grupo "Concluída" e os contadores (pendentes/
cliente/pricetax) atualizaram. Não precisou WebSocket, não precisou
recarregar a página.

## 29. Pendências por pessoa, com apelido/nome parcial (2026-09-10)

Rafael mostrou uma tela com 43 pendências "NÃO INICIADO" de várias
pessoas diferentes (Evanio Santinon, Rogeria Guerra, Marchiori Joao
Vitor...) e pediu que a RENATA respondesse "quais atividades pendentes
temos no nome do Evanio?", "quais as pendências do Evanio Santinon?",
"o que o Evanio está nos devendo?" — reconhecendo que as pessoas vão
escrever nome parcial ou apelido ("Rafa" em vez de "Rafael Souza").

**Duas lacunas reais encontradas ao investigar**: (1) o campo
`participant` já existia em `ResolveQuerySchema`, mas o filtro de
`searchProjectMemory` exige igualdade exata contra o array
`participants` de cada chunk — "Evanio" nunca bateria com "Evanio
Santinon"; (2) o PERFIL DO PROJETO só lista uma amostra (até 12) das
pendências mais próximas do prazo, de TODO o projeto — com 43 pendências
de gente diferente, as de uma pessoa específica podiam nem estar na
amostra.

**Fix** (`server/assistantContext.js`):
- `findResponsibleMatches(project, rawName)` — resolve apelido/nome
  parcial pro nome completo exato como está gravado em
  `actionItem.responsible`, varrendo TODAS as pendências de reunião
  (não uma amostra) pra montar o universo de nomes conhecidos.
  Normaliza acento/maiúscula, tenta igualdade exata primeiro, senão
  compara palavra por palavra com `startsWith` nos dois sentidos
  (cobre "Evanio" → "Evanio Santinon" e "Rafa"/"Rafael" → "Rafael
  Souza", os dois exemplos que o Rafael deu). Devolve uma lista — 1
  nome é o caso normal, mais de 1 é ambíguo, 0 é "não achei".
- `buildPersonLookupText(project, rawName)` — usa a resolução acima e
  monta um bloco "PENDÊNCIAS POR PESSOA" com a varredura COMPLETA das
  pendências dela (não uma amostra): total, uma seção de críticas
  (urgente ou prazo vencido) e a lista completa em aberto, mais antiga
  primeiro (mesmo critério cronológico de sempre). Também devolve o
  nome resolvido, reaproveitado pra corrigir o filtro de
  `searchProjectMemory` (que também exigia igualdade exata) — as duas
  lacunas resolvidas com a mesma resolução de nome.
- `server/assistantRetrieval.js` — `askProjectAssistant` chama isso
  sempre que `resolveQuery` extrai um `participant` da pergunta,
  injeta o bloco no contexto de `synthesizeAnswer`, e o prompt foi
  instruído a responder com confiança total a partir dele (é varredura
  completa, não busca por relevância), perguntar qual pessoa quando
  ambíguo, e admitir claramente quando não encontrar ninguém.

**Testado localmente**: `findResponsibleMatches`/`buildPersonLookupText`
contra dados sintéticos reproduzindo o cenário exato do Rafael (Evanio
Santinon com uma pendência urgente e uma sem prazo, outra pessoa com
pendência própria) — "Evanio" resolve certo, monta a seção de crítica e
a lista completa; nome inexistente ("Zezinho") devolve a mensagem
correta de "não encontrei" em vez de inventar. **Não testado**: a IA de
verdade reconhecendo a intenção "pendências de uma pessoa" a partir de
frases livres em português e formatando a resposta final (depende da
chave real em produção).

## 30. Busca com fallback OR + retry/log nas chamadas à IA (2026-09-10)

Rafael reportou dois bugs em produção na mesma sessão, no projeto
Tecumseh: (1) "Como funciona o Seguro de Vida na Tecumseh?" →  "Não
encontrei evidência suficiente..." mesmo com "várias reuniões falando
de Seguro de Vida" indexadas; (2) clicar na própria sugestão de
pergunta que a RENATA oferece na tela ("O que cobrar na próxima
reunião?") → "Não consegui processar essa pergunta agora."

**Causa raiz do (1)**: exatamente a limitação já documentada e adiada
em §27/§29 — `plainto_tsquery` exige que TODA palavra da busca
reformulada apareça junto no mesmo trecho. "Como funciona o seguro de
vida na Tecumseh" quase certamente não aparece daquele jeito literal
em nenhuma fala de reunião (as pessoas falam sobre o benefício, não
sobre "como ele funciona na Tecumseh"). Reproduzido localmente: um
chunk de teste com o texto real sobre seguro de vida não batia com a
pergunta genérica via `plainto_tsquery`, mas batia com sucesso pela
mesma busca em modo OR.

**Fix**: `searchProjectMemory` (`server/memoryRetrieval.js`) agora
tenta a busca normal (E lógico, `plainto_tsquery`, mais precisa) e, só
se ela voltar **zero linhas** e havia texto de busca, tenta de novo com
`websearch_to_tsquery` sobre as mesmas palavras separadas por `OR`
(qualquer uma delas basta pra achar o trecho; `ts_rank_cd` ranqueia
quem bate mais palavras primeiro). Não é o `websearch_to_tsquery`
sozinho que resolve — por padrão ele também trata texto simples como E
lógico, igual o `plainto_tsquery` — o fix real é forçar `OR` entre as
palavras nessa segunda tentativa. É estritamente aditivo: a busca E
continua sendo a primeira tentativa (mesma precisão de sempre quando
acha algo), o fallback só entra quando ela não acha nada — não muda
ranking nem comportamento de nenhuma busca que já funcionava.

**Causa do (2), sem acesso a log de produção**: não há acesso direto ao
Postgres/Railway de produção (só o Rafael tem, ver §27), e o erro real
de exceções na pipeline da RENATA (`askProjectAssistant`,
`server/assistantRetrieval.js`) era só guardado na coluna `error` de
`ai_messages` — nunca logado no console do servidor nem exposto em
nenhuma tela. Sem conseguir reproduzir a pergunta específica
("próxima reunião" não é uma reunião que existe na lista "REUNIÕES
DISPONÍVEIS", então pode ser a IA tropeçando nisso, ou simplesmente uma
falha transitória de rede/rate limit da API da Anthropic — não dá pra
saber ao certo sem o log). Tratado com duas mudanças de robustez, não
um fix cirúrgico de causa raiz:
- `console.error` no catch principal de `askProjectAssistant` (antes
  vazio) — próxima vez que isso acontecer, aparece no log do Railway.
- `withRetry`: as duas chamadas à IA (`resolveQuery`/`synthesizeAnswer`)
  agora tentam de novo uma vez (meio segundo de espera) antes de
  desistir — cobre falha transitória sem mascarar um erro persistente
  (a segunda tentativa falhando sobe o erro normal).

**Testado localmente**: fallback OR reproduzido e confirmado via script
direto contra `searchProjectMemory` com um chunk real de teste inserido
no Postgres local (empresa de teste, apagado depois) — a pergunta
genérica que falharia só em modo E encontrou o chunk certo em modo OR.
**Não testado**: o bug (2) específico, por falta de log de produção —
se acontecer de novo depois deste deploy, o log novo do Railway deve
mostrar a mensagem de erro real.

## 31. Busca semântica híbrida com embeddings — Fase 3 da RENATA (2026-09-10)

Mesmo com o fallback OR (§30), a busca da RENATA continuava sendo 100%
lexical — compara palavra literal, não significado. Perguntado
diretamente qual seria a recomendação pra RENATA "ficar realmente
funcional" (depois dos bugs reportados na mesma sessão), a resposta foi
migrar a base da busca pra embeddings; o Rafael concordou em seguir.
Plano completo negociado em modo de planejamento antes de implementar
— ver histórico da sessão se precisar do racional completo; aqui vai o
que foi decidido e o que mudou de fato.

**Decisões de arquitetura:**
- **Provedor: Voyage AI** (`voyage-3`), o parceiro de embeddings
  recomendado pela própria Anthropic — chamado via `fetch` nativo do
  Node direto na API REST (`server/embeddings.js`), sem SDK novo, sem
  dependência nova no `package.json`.
- **Sem pgvector, de propósito**: embedding guardado como `JSONB`
  (array de números) na própria `project_memory_chunks`, e a
  similaridade de cosseno é calculada em JavaScript, não em SQL. Não é
  uma limitação, é uma escolha: eu não tenho acesso direto ao Postgres
  de produção pra confirmar se a extensão pgvector estaria disponível
  no Railway (só o Rafael tem, §27), e depender dela repetiria o mesmo
  risco de infraestrutura nova que já foi evitado de propósito na Fase
  1. Na escala de dados de hoje (baixos milhares de chunks por
  projeto), calcular cosseno em JS pra todos os chunks de um projeto é
  rápido o bastante — sem precisar de índice vetorial. Migrar pra
  pgvector no futuro, se o volume crescer muito, vira só uma otimização
  de performance por trás da mesma função pública
  (`searchProjectMemory`), sem mudar nada fora dela.
- **Híbrido, não substituição**: a busca lexical (E, depois OR — §30)
  continua rodando do jeito que está — ela já é boa pra número exato,
  CNPJ, nome digitado igual ao original, coisas que embeddings às vezes
  borram. A perna semântica entra em paralelo: embeda a
  `standaloneQuery`, busca todos os chunks do projeto com os mesmos
  filtros de sempre (participante/reunião/tipo/data) que já tenham
  embedding, ranqueia por similaridade de cosseno. Os dois conjuntos são
  combinados por `id` do chunk — quem aparece nos dois tem as
  pontuações somadas (reforço de confiança), quem aparece em só um
  mantém a pontuação isolada — ordenado e cortado no `limit` de sempre.
- **Embedding calculado na ingestão, não a cada pergunta**: só a
  pergunta em si é embedada em tempo real (1 chamada rápida por
  pergunta, `input_type='query'`); os chunks de uma reunião inteira são
  embedados numa ÚNICA chamada em lote (`input_type='document'`) antes
  do insert — evita N chamadas de rede pra N chunks.
- **Backfill sem script novo**: como a reindexação já é
  apaga-e-recria (idempotente), ensinar a criação de chunk a também
  gerar o embedding é suficiente — o botão "Reindexar memória" que já
  existe na tela e o `reindexAllMeetings.js` preenchem os embeddings de
  todo o histórico automaticamente, sem nenhuma ferramenta de backfill
  nova.
- **Degradação graciosa, mesmo padrão de `ANTHROPIC_API_KEY`**: sem
  `VOYAGE_API_KEY` configurada, a busca semântica é pulada
  silenciosamente e o sistema segue 100% igual a antes (só busca
  lexical) — nunca quebra por falta da chave nova. Uma falha pontual na
  chamada à Voyage (rede, rate limit) também não derruba a busca: cai
  pro resultado lexical sozinho, com log do erro.

**O que mudou:**
- `server/db.js`: coluna `embedding JSONB` (nullable) em
  `project_memory_chunks`, mesmo padrão de sempre de `ALTER TABLE ADD
  COLUMN IF NOT EXISTS` no boot do servidor (`initDb()`) — aplica em
  produção sozinho no próximo deploy, sem eu precisar de acesso ao
  banco.
- `server/embeddings.js` (novo): `voyageConfigured()`, `embedTexts(texts,
  inputType)` (em lotes de até 100 textos por chamada), `cosineSimilarity(a, b)`.
- `server/memoryIngest.js`: `reindexMeetingMemory` embeda todos os
  chunks de uma reunião em lote (fora da transação do Postgres, de
  propósito — não faz sentido segurar uma conexão esperando a API
  externa responder) antes do insert; falha na chamada loga e insere
  os chunks sem embedding, não derruba a reindexação.
- `server/memoryRetrieval.js`: `searchProjectMemory` ganhou a perna
  semântica (busca todos os chunks com embedding do projeto/filtros,
  limitado a 1000 candidatos como válvula de segurança, ranqueia por
  cosseno em JS) e a combinação de pontuação com a perna lexical.
  Assinatura pública não mudou — zero impacto em
  `server/assistantRetrieval.js`.

**Pré-requisito cumprido no mesmo dia**: Rafael criou a conta na
Voyage, gerou a `VOYAGE_API_KEY` e configurou tanto no Railway (produção)
quanto no `.env` local — permitiu teste real, não só de plumbing.

**Testado localmente, sem `VOYAGE_API_KEY`** (confirma zero regressão
pra quem ainda não configurou a chave): reunião de teste indexada
normalmente, chunk criado com `embedding=null`, busca segue 100%
lexical (fallback OR) e encontra o conteúdo certo — igual ao
comportamento de antes desta mudança.

**Testado localmente, COM `VOYAGE_API_KEY` de verdade**: reunião de
teste com transcrição real sobre "apólice de vida em grupo" (sem as
palavras "seguro"/"como"/"funciona"/"Tecumseh" no conteúdo) —
reindexação gerou embedding pros 2 chunks; a pergunta "Como funciona o
Seguro de Vida na Tecumseh?" encontrou os dois, com a perna lexical
(OR) E a semântica concordando (pontuação somada subiu de ~0.27-0.47
pra ~0.89-1.10) — a combinação por id de chunk funciona como desenhado.
Chunk de teste apagado depois.

**Achado importante, não estava no plano original**: a conta da Voyage
sem forma de pagamento cadastrada tem limite de **3 requisições por
minuto** (RPM) e 10K tokens/minuto — bem abaixo do que uma reindexação
de um projeto com várias reuniões precisa (uma chamada por reunião) ou
do que uso real simultâneo da RENATA exigiria (uma chamada por
pergunta). Confirmado na prática: uma chamada de embedding retornou
`429` nesse limite durante o teste. Isso não quebra nada — o
`try/catch` em `searchProjectMemory` cai pro resultado lexical sozinho
— mas na prática, sem forma de pagamento cadastrada na Voyage, a perna
semântica vai falhar silenciosamente com frequência sob uso real, e
"Reindexar memória" num projeto com muitas reuniões (ex.: Tecumseh, 7
reuniões) pode deixar as últimas reuniões da fila sem embedding no
mesmo clique (não é fatal — rodar reindexar de novo tenta de novo, é
idempotente — mas não é backfill completo garantido de primeira).
**Recomendação pendente pro Rafael**: cadastrar forma de pagamento na
página de billing da Voyage pra destravar o rate limit padrão — custo
esperado é irrisório nessa escala de uso.

**Atualização (mesmo dia)**: Rafael cadastrou o cartão. Confirmado via
teste local (5 chamadas de embedding seguidas, todas OK sem 429) que o
rate limit padrão já está valendo — a perna semântica deixou de ser o
gargalo.

## 32. RENATA executora completa — pendências, cronograma e Google Calendar (2026-09-10)

Rafael pediu a RENATA "100% funcional": criar/excluir atividades, abrir
o calendário, e atualizar a própria memória sozinha ao entrar numa
empresa (não só pelo botão manual). Perguntas de escopo resolvidas antes
de implementar: calendário = navegação **e** criar evento de verdade no
Google Calendar; atividades = pendências de reunião **e** atividades do
cronograma oficial (Gantt/Fases), ambas criar e excluir; mapear mais
áreas do painel = só Agenda por enquanto (XFlow fica de fora).

**Seis tipos de ação executável agora** (antes eram dois) — mesmo padrão
de sempre: a IA só PROPÕE (`ProposedActionSchema`, objeto achatado com
campos nullable, `server/assistantRetrieval.js`), nunca executa sozinha;
o usuário confirma no painel; só então `server/assistantActions.js`
muta `projects.data` de verdade.
- `create_meeting_todo` / `reschedule_activity` — já existiam.
- `delete_meeting_todo` (novo) — soft-delete de uma pendência de
  reunião, mesma mutação de `deleteMeetingActionItem` (`src/App.jsx`).
- `create_schedule_activity` (novo) — cria atividade no cronograma
  oficial; fase resolvida por NOME (nunca id inventado pela IA — mesmo
  princípio de defesa em profundidade de sempre), cai na última fase se
  não bater com nenhuma (mesmo default de `addActivity`).
- `delete_schedule_activity` (novo) — soft-delete de atividade do
  cronograma, com `deletedAt`/`deletedBy` (mesma auditoria de
  `deleteActivity`). Tratada como mais sensível (afeta prazo visível pro
  cliente): o card de confirmação no painel usa estilo de aviso mais
  forte (vermelho — `.asst-action-card.danger`,
  `src/assistant/ProjectAssistant.jsx`). Não replica o "digite a frase
  pra confirmar" que a tela normal exige (não dá pra fazer bem dentro do
  chat) — mitigado só com o visual mais forte, o clique de "Confirmar"
  continua sendo a mesma barreira de sempre.
- `create_calendar_event` (novo) — cria evento de verdade no Google
  Calendar do usuário que confirmou (OAuth por usuário, não por projeto
  — `server/googleCalendar.js`, `createEvent()` nova, generaliza o
  `calendar.events.insert` que antes só existia dentro de
  `syncTicketEvent`, específico do XFlow). Só é proposta pela IA se o
  usuário já tiver conectado — `askProjectAssistant` busca
  `getConnectionStatus(userId)` e injeta isso no prompt; mesmo assim o
  backend revalida (`googleConnected` + `dueDate` presentes) antes de
  aceitar a proposta, nunca confia cegamente na IA.

**Agenda virou fonte de contexto (leitura)**: `askProjectAssistant`
busca (em paralelo com a busca de memória de sempre) os próximos 14
dias de eventos do Google Calendar do usuário via `listEvents()` — já
existia, usado até agora só pela tela Agenda — e injeta como "PRÓXIMOS
EVENTOS NA AGENDA" no prompt de síntese. Silencioso se não conectado ou
se a chamada falhar, nunca derruba a resposta principal (mesmo espírito
de `personLookupText`).

**"Abrir a Agenda" é navegação simples, não uma ação da IA** — em vez de
depender do prompt lembrar de oferecer isso, o painel ganhou um botão
fixo no cabeçalho (`CalendarDays`, ao lado de "Reindexar"/"Limpar
conversa") que chama `onOpenAgenda` → `goToWorkspace('agenda')`
(`src/App.jsx`) — sempre disponível, sem depender de acerto de prompt.

**Auto-reindex ao entrar numa empresa**: novo `useEffect` em `src/App.jsx`
observando `selectedProjectIds` — quando vira UMA empresa só (entrar no
workspace dela, não a visão geral com várias selecionadas), chama `POST
/api/assistant/reindex` (já existia, botão manual) silenciosamente, sem
mensagem no chat. Throttlado por sessão de navegador (`Set` em
`useRef`, mesmo espírito do "BIP" de sincronização) — não dispara de
novo trocando de aba dentro da mesma empresa, só ao entrar numa empresa
diferente. Erro só loga no console do navegador, nunca vira alerta pro
usuário (é manutenção de bastidor).

**Testado localmente**: as 4 funções `executeX` novas
(`delete_meeting_todo`/`create_schedule_activity`/
`delete_schedule_activity`/`create_calendar_event`) chamadas direto via
script contra dados de teste no Postgres local — soft-delete e criação
corretos, fase default resolvida certo, `create_calendar_event` falhou
com mensagem clara quando não havia conexão Google (esperado). No
browser: auto-reindex confirmado via `read_network_requests` (dispara 1x
ao entrar na empresa, não dispara de novo trocando de aba); botão
"Abrir a Agenda" navega certo pra tela Agenda. **Não testado**: a IA de
verdade propondo cada uma das ações novas, e `create_calendar_event`
criando um evento real (precisa de alguém com Google Calendar conectado
de verdade em produção).

## 33. Bug real de "Não consegui processar essa pergunta agora" — max_tokens baixo demais (2026-09-10)

Depois de configurar acesso aos logs do Railway (`RAILWAY_TOKEN`, ver
abaixo — primeira vez nesta sessão com acesso real de leitura à
produção), o Rafael reportou de novo "Como funciona o Seguro de Vida na
Tecumseh?" → "Não consegui processar essa pergunta agora." mesmo já
tendo reindexado. Rodando `railway logs --service Cronograma --lines
300 | grep -i "assistente\|falh"` achei a causa raiz de verdade pela
primeira vez, sem precisar adivinhar:

```
Assistente do Projeto: synthesizeAnswer falhou na 1ª tentativa (Failed to parse structured output: Error: Failed to parse structured output as JSON: Unterminated string in JSON at position 2324...) — tentando de novo.
Assistente do Projeto: pergunta falhou (projectId=proj-2ilkveg): Failed to parse structured output: ... Unterminated string in JSON at position 1970...
```

**Causa raiz**: `synthesizeAnswer` (`server/assistantRetrieval.js`) tinha
`max_tokens: 1500`. Perguntas que sintetizam VÁRIAS reuniões (exatamente
o caso de "Seguro de Vida na Tecumseh", discutido em várias reuniões)
geram uma resposta longa o bastante pra a Anthropic CORTAR o JSON
estruturado no meio de uma string — o parser (`client.messages.parse` +
Zod) falha porque o JSON ficou incompleto, não porque o schema esteja
errado. Isso explica por que o retry (§30) não ajudava: a segunda
tentativa gera uma resposta do mesmo tamanho pro mesmo prompt, corta no
mesmo lugar — é uma falha **determinística** de limite de tokens, não
uma falha transitória de rede/rate-limit, que é o único tipo de falha
que o retry realmente resolve.

**Fix**: `max_tokens` de `synthesizeAnswer` subiu de 1500 pra 4000 —
folga de sobra pra qualquer resposta, mesmo sintetizando várias
reuniões inteiras, nunca mais cortar o JSON no meio. `resolveQuery`
(500 tokens, saída bem menor) não precisou de ajuste.

**Isso só foi possível de diagnosticar com precisão porque o Rafael
configurou `RAILWAY_TOKEN` nesta mesma sessão** (ver instruções de
acesso combinadas na conversa) — antes disso, esse tipo de bug era pura
adivinhação (rate limit? schema? erro de rede?). Primeira vez usando
`railway logs` de verdade pra achar uma causa raiz real.

**Confirmado em produção**: Rafael re-perguntou a mesma coisa depois do
deploy e recebeu uma resposta completa, com fonte — inclusive a RENATA
identificou e sinalizou uma contradição real dentro da própria reunião
(alguém se corrigindo ao vivo sobre 90%/10%) em vez de repetir um número
errado.

## 34. Redesign visual completo + resposta estruturada — Fase 5 (2026-09-10)

Rafael mandou um print de um app de chat (mobile) como referência visual
e pediu pra RENATA parar de responder em texto corrido com markdown cru
(`**assim**` aparecendo literal) e virar uma UI "executiva": blocos
tipados (ponto de atenção, fatos, impacto, recomendação, linha do
tempo), insights clicáveis, cabeçalho com tooltip, pills de sugestão com
ícone. O pedido original era bem mais amplo (mini-card de pessoa, base
de conhecimento cross-projeto, anexo/áudio no rodapé) — perguntado sobre
anexo/áudio, Rafael respondeu pra não incluir agora; o resto ficou
documentado como fora de escopo (ver plano da sessão).

**Resposta estruturada, campos FLAT (nunca `z.discriminatedUnion`,
mesmo cuidado de sempre)**: `SynthesizeAnswerSchema`
(`server/assistantRetrieval.js`) trocou o campo único `answer: string`
por `introduction` (abertura curta) + `sections` (array de objetos
`{type, title, content, items}` — MESMO formato pra todo `type`, nunca
um union) + `insights` (até 4 rótulos clicáveis). `type` pode ser
`warning`/`facts`/`impact`/`recommendation`/`timeline`. "Informação
conflitante" não virou um 6º tipo — é uma seção `warning` com as versões
divergentes em `items` (menos schema, mesmo efeito). Caso sem evidência:
`introduction` recebe a frase fixa de sempre, `sections`/`insights`
ficam vazios — mesma garantia de anti-alucinação de sempre.

**Nova coluna `ai_messages.structured JSONB`** (nullable, `server/db.js`)
guarda `{introduction, sections, insights}`. `content` (coluna já
existente) continua um texto plano achatado (`flattenStructuredAnswer`,
novo helper em `assistantRetrieval.js`) — é o que alimenta o histórico
da conversa pro prompt da IA (sempre foi texto, nunca precisou ser
estruturado) e serve de fallback: mensagem antiga ou de `conversa_geral`
(saudação, que nunca passou por esse schema) tem `structured=null` e o
front renderiza um balão de texto simples, sem quebrar nada.

**Insights clicáveis sem mecanismo novo**: clicar um rótulo (ex.:
"Validar com RH") reenvia o próprio texto como próxima pergunta — o
histórico da conversa já dá contexto suficiente pro `resolveQuery`
interpretar certo, sem precisar de um mapeamento espécie por espécie.

**Redesign completo de `src/assistant/ProjectAssistant.jsx`**:
cabeçalho com nome do projeto + subtítulo fixo + 4 ícones com tooltip
nativo (`title=`) — Agenda ("Abrir a Agenda"), Reindexar ("Atualizar
contexto da RENATA"), Limpar ("Limpar esta conversa"), Fechar ("Fechar
assistente"); balão do usuário com horário + check de "enviada" (não
existe conceito de "lido" no sistema, não finge que existe); resposta da
RENATA vira cabeçalho (ícone+nome+horário) + cards por seção (ícone e
cor suave por `type`: vermelho/azul/verde/roxo/cinza, usando as MESMAS
variáveis de tema de sempre — funciona em claro e escuro, não fixa cor
crua) — `timeline` desenha uma linha vertical conectando os itens
(formato "data — descrição" por item, com fallback pra bullet simples);
`renderInlineBold()` (helper novo, regex simples, sem lib de markdown)
interpreta `**negrito**` em qualquer `content`/`items`, nunca mostra a
sintaxe crua; chips de "Insights rápidos"; pills de sugestão ganharam
ícone (lucide) e a lista (`baseSuggestions`) foi ampliada com as opções
que o Rafael pediu ("Pendências em aberto", "O que mudou desde a
reunião anterior?", "Legislação relacionada", etc.), continua mostrando
só 4 por contexto. Fontes citáveis, card de ação proposta e feedback
(👍/👎) mantidos exatamente como já funcionavam, só reencaixados dentro
do novo layout.

**Fora do escopo desta entrega** (documentado, não construído):
anexo de documento/ditação por áudio no rodapé (pedido explícito do
Rafael pra não incluir agora); mini-card de pessoa ao clicar/mencionar
alguém; Base de Conhecimento Corporativa/cross-projeto (já vinha sendo
adiada desde a Fase 2); "modo de busca" dedicado com contagem tipo
"encontrei 4 menções em 3 reuniões" (o prompt pode mencionar isso em
texto, não virou componente).

**Testado localmente**: migração aplicada (`initDb()`); inserida uma
mensagem com `structured` mockado direto no Postgres (mesmo truque de
sempre pra testar UI sem precisar de IA real) reproduzindo o caso real
do Seguro de Vida (aviso + fatos com negrito + impacto + linha do tempo
+ recomendação + insights) — tudo renderizou certo no browser, nos dois
temas (claro e escuro) e também no viewport mobile; clique num insight
reenviou a pergunta certa; caso "sem evidência" renderizou no estilo
tracejado/itálico esperado; mensagem sem `structured` (simulando erro de
rede) caiu certinho no balão de texto simples de fallback. Dados de
teste apagados depois. **Não testado**: a IA de verdade preenchendo o
schema estruturado em produção (depende da chave real, mesma limitação
de sempre) — mas a mesma pergunta real do Seguro de Vida já tinha sido
confirmada funcionando em produção antes deste redesign (§33), então o
conteúdo que a IA gera para esse caso é conhecido; o que muda aqui é só
a estrutura/formato, testada com esse conteúdo real via mock.

## 35. Redução de custo de token da RENATA — Fase 6 (2026-09-10)

Rafael perguntou direto qual a estratégia pra economizar token.
Revisando o pipeline, achei 3 desperdícios reais — um deles (o
auto-reindex da Fase 4) foi introduzido nesta própria sessão.

**1. `resolveQuery` mudou de `claude-opus-5` pra `claude-sonnet-5`**
(`server/assistantRetrieval.js`) — essa chamada só classifica intenção e
reformula a busca (roteamento), não precisa do modelo mais caro.
`synthesizeAnswer` (resposta final) continua em Opus, sem mudança — é a
etapa de qualidade, não é onde cortar.

**2. Cache de prompt (`cache_control: {type:'ephemeral'}`) nas duas
chamadas** — o `system` de cada função é praticamente idêntico entre
chamadas (mesmo texto de instrução, qualquer projeto/usuário; em
`synthesizeAnswer` só a frase do Google Calendar varia com
`googleConnected`, estável pra um mesmo usuário). Formato trocado de
`system: [...].join(' ')` (string) pra `system: [{type:'text', text:
[...].join(' '), cache_control:{type:'ephemeral'}}]` (array de blocos,
padrão da API) nas duas funções. Reduz o custo de reenviar esse texto
longo em toda pergunta, sem mudar nenhuma resposta.

**3. Auto-reindex (Fase 4) só reindexa de verdade quando falta algo** —
antes, entrar numa empresa reprocessava embedding de TODOS os chunks de
TODAS as reuniões, mesmo sem nada ter mudado desde a última vez (dado
que `syncProjectMemoryFromDiff` já mantém a memória sincronizada em
tempo real a cada edição salva — reindexação completa só era necessária
pra um caso histórico específico, não uma necessidade recorrente).
Novo endpoint `GET /api/assistant/reindex-needed` (`server/assistant.js`)
— só leitura no Postgres, sem custo de IA — checa (a) algum chunk desta
empresa com `embedding IS NULL`, ou (b) alguma reunião sem NENHUM chunk
correspondente. `src/App.jsx` chama esse endpoint barato antes de
decidir chamar `/reindex` de verdade — só reindexa (com custo de
embedding) quando `needed=true`. O botão manual "Reindexar memória"
continua chamando `/reindex` direto, sem essa checagem — é sempre um
clique intencional do usuário, não precisa de economia aí.

**4. `loadInsights` reduzido de 50 pra 20** — cada pergunta manda os
aprendizados acumulados por inteiro; aprendizados antigos além disso
raramente ainda são relevantes.

**Testado localmente**: `reindex-needed` testado end-to-end (script
direto contra o Postgres local, reproduzindo os 4 estados: reunião sem
chunk → `needed=true`; depois de reindexar com embedding → `false`;
embedding zerado manualmente → `true` de novo; reindexado de novo →
`false`) — durante o teste achei e limpei DOIS resíduos de dados de
teste órfãos de sessões anteriores (`mtg-x4w0271`/"Reunião teste
filtros" e um chunk solto de `mtg-log-ui-test`) que estavam poluindo a
checagem. Confirmado no browser via `read_network_requests` que entrar
numa empresa já indexada dispara só o `/reindex-needed` (barato), sem
chamar o `/reindex` completo. **Não testado**: o cache de prompt
funcionando de fato em produção (só aparece nos campos de uso da
resposta da API/console da Anthropic — não dá pra confirmar sem a chave
real) e a queda de custo real (só visível observando o console da
Anthropic/Voyage ao longo de alguns dias de uso).

## 36. Bug real — RENATA "se perdia" na data (fuso do servidor) (2026-09-10)

Rafael perguntou "o que preciso fazer amanhã" às 23h21 (horário de
Brasília) do dia 10/09 — a RENATA respondeu "Hoje é 11/09 (sexta)",
um dia adiantada, e a partir disso calculou errado o resto (tratou a
reunião de 10/09, que era HOJE, como "de ontem").

**Causa raiz, dupla**:
1. `todayIso()` (`server/assistantContext.js`) calculava a data via
   `getFullYear()/getMonth()/getDate()` — métodos que usam o fuso do
   **processo**, não o do usuário. O Railway roda em UTC, sem `TZ`
   configurado. Entre ~21h e meia-noite no horário de Brasília
   (UTC-3), o servidor já está no dia seguinte em UTC — reproduzido
   isoladamente com um instante fixo (23h21 de 10/09 em Brasília =
   02h21 de 11/09 UTC): `getUTCDate()` dava 11, o resultado correto é
   10.
2. **Mais grave**: em nenhum lugar do prompt da RENATA a data de hoje
   era informada explicitamente pra IA. A IA não tem relógio nem noção
   de data real — só sabe o que está no texto que recebe. Sem uma
   âncora de data, "hoje"/"amanhã"/"ontem" eram uma **adivinhação da
   IA**, não um fato — o bug do fuso só tornou isso visível, mas mesmo
   corrigindo só o fuso, a IA continuaria sem uma fonte de verdade
   confiável pra esse tipo de cálculo.

**Fix**:
- `todayIso()` agora usa `toLocaleDateString('en-CA', {timeZone:
  'America/Sao_Paulo'})` — funciona certo independente do fuso do
  processo. Todos os clientes são brasileiros, fuso fixo é suficiente.
- `buildProjectSnapshot()` (mesmo arquivo) agora começa com uma linha
  explícita `DATA DE HOJE: DD/MM/AAAA (dia da semana) — use isso como
  referência real e única...` — como esse perfil já é injetado tanto
  em `resolveQuery` quanto em `synthesizeAnswer`
  (`server/assistantRetrieval.js`), a âncora de data chega às duas
  chamadas automaticamente, sem precisar duplicar em nenhum outro
  lugar.

**Testado localmente**: reproduzido o bug isoladamente com um instante
UTC fixo equivalente a 23h21 de 10/09 em Brasília — `getUTCDate()`
(equivalente ao bug antigo) devolvia 11; `toLocaleDateString` com
`America/Sao_Paulo` (fix novo) devolve `2026-09-10`, correto.
Confirmada também a primeira linha do perfil do projeto com a data e
dia da semana certos. **Não testado**: a IA de verdade respondendo
"amanhã"/"hoje" corretamente em produção (depende da chave real).

**Achado relacionado, fora do escopo deste fix**: `server/macro.js`
(Visão Macro, cálculo de "semana atual/próxima") usa o mesmo padrão
(`new Date()` + getters locais, linha ~37) — mesma classe de bug, tem
a mesma janela de risco (~21h-meia-noite em Brasília). Não corrigido
agora (feature diferente, fora do que foi reportado) — sinalizado
como tarefa separada.

## 37. Memória em camadas + cache semântico de perguntas — Fase 7 (2026-09-11)

**Nota (Fase 7.1, mesma data, ver §38):** o vocabulário de `status`
(`unvalidated|conflicting|rejected`) e o enum de `scope`
(`project|org`) descritos abaixo foram migrados/estendidos na Fase
7.1 — `unvalidated→active`, `conflicting→disputed`, `rejected→archived`
(`superseded` não mudou de nome), e `scope` ganhou `conversation` e
`global`. O resto desta seção (arquitetura, cálculo de similaridade,
limiares, cache) continua valendo como está — só o vocabulário de
status/scope está desatualizado aqui; §38 é a versão corrente.

Rafael pediu uma auditoria honesta de como a RENATA usa memória hoje.
A resposta revelou 3 lacunas reais: (1) nenhum cache de pergunta/
resposta — a mesma pergunta, ou uma equivalente, rodava o pipeline
completo de novo toda vez; (2) nenhuma memória organizacional — um
fato tipo "Felipe é o CEO da PRICETAX" ficava preso ao projeto onde foi
dito; (3) "aprendizados" (`ai_project_insights`) eram uma lista plana,
sem quem disse, sem confiança, sem detecção de conflito, **gravados
automaticamente** (sem confirmação nenhuma) sempre que
`synthesizeAnswer` preenchia `learnedFact` — exatamente o "virar
verdade global sozinho" que o Rafael não queria.

Decisões de escopo confirmadas com o Rafael antes de implementar: cache
semântico no modo SEGURO (compara depois de `resolveQuery` já ter
resolvido a pergunta, não o texto cru — só a chamada mais cara,
`synthesizeAnswer`/Opus, é pulada num acerto); sem tela de gestão nova
(fatos/conflitos acessados pelo próprio chat); qualquer usuário pode
propor um fato organizacional (a barreira é a confirmação explícita,
não o cargo de quem fala).

### `ai_knowledge_facts` (nova tabela, `server/db.js`)

Substitui `ai_project_insights` como destino de escrita (tabela antiga
não é apagada, fica histórica — conteúdo migrado uma vez via
`migrateInsightsToKnowledgeFacts()`, chamada no boot do servidor).
Campos: `id, org_id, project_id (null quando scope='org'), scope
('project'|'org'), subject, content, status
('unvalidated'|'conflicting'|'superseded'|'rejected'), superseded_by
(self-FK, reservado pro futuro fluxo de resolução), source_user_id,
source_conversation_id, embedding (do CONTEÚDO, ver abaixo por quê),
created_at, updated_at`.

Um fato só é gravado depois de confirmação explícita — vira o **7º
tipo de ação proposta** da RENATA (`save_knowledge_fact`, mesmo
`ProposedActionSchema`/card de Confirmar-Cancelar das outras 6 já
existentes, `server/assistantRetrieval.js`/
`src/assistant/ProjectAssistant.jsx`). `status` começa sempre
`'unvalidated'` — não existe promoção automática pra `'validated'`
nesta fase (documentado como próximo passo); a RENATA usa e cita fatos
`unvalidated` normalmente, sempre atribuindo ("segundo o que [pessoa]
informou em [data]"), nunca como verdade anônima.

### Detecção de conflito — achado importante durante o teste

O plano original comparava embedding do `subject` (rótulo curto, ex.:
"cargo do Felipe"). **Testado com embeddings reais antes de shippar**:
frases curtas de 2-4 palavras NÃO discriminam bem entre si — "cargo do
Felipe" vs. "prazo do workshop" (assuntos SEM relação nenhuma) deu
0.57 de similaridade, mais alto que "cargo do Felipe" vs. "quem é o
CEO" (mesmo assunto, deu 0.56) — os dois ficam no mesmo patamar,
impossível separar com um limiar. Comparar o **conteúdo completo**
funciona muito melhor: "Felipe é o CEO" vs. "Felipe não é mais CEO"
(mesmo tópico, afirmação contrária) deu 0.87; frases sem relação deram
0.48; paráfrases quase idênticas deram 0.97+. `findConflictingFact`/
`saveKnowledgeFact` (`server/knowledgeFacts.js`) foram redesenhados
pra embedar e comparar `content`, não `subject` — `subject` continua
existindo só como rótulo legível no texto injetado no prompt. Dois
limiares calibrados com esses dados reais:
`DUPLICATE_SIMILARITY_THRESHOLD=0.93` (não duplica, mesma frase
parafraseada) e `CONFLICT_SIMILARITY_THRESHOLD=0.75` (marca os DOIS
fatos como `'conflicting'`, nunca sobrescreve, nunca apaga).

`loadRelevantFacts(pool, orgId, projectId)` monta o texto "CONHECIMENTO
ACUMULADO" injetado em `synthesizeAnswer` — fatos do projeto atual +
fatos `scope='org'` (válidos pra PRICETAX inteira, aparecem em
qualquer projeto), excluindo `rejected`/`superseded`, com quem
informou e quando. Fatos `'conflicting'` aparecem com uma marca
`[CONFLITANTE]`; o prompt é instruído a nunca escolher uma versão
sozinha nesse caso — sempre expor a divergência e perguntar.

### `ai_answer_cache` (nova tabela) — cache semântico, modo seguro

Chave = a pergunta já **resolvida** por `resolveQuery`
(`standalone_query`+embedding, `participant`, `meeting_id`, `kind`) —
não o texto cru do usuário. Isso é o que garante não reaproveitar
resposta certa pra pergunta parecida com intenção diferente (ex.:
pendências do Evanio vs. do Rafael nunca colidem, porque `participant`
resolvido é diferente).

`data_fingerprint` (`server/answerCache.js`,
`computeFingerprint(projectUpdatedAt, todayIso())`) invalida TUDO do
projeto de uma vez quando `projects.updated_at` muda (qualquer edição)
ou quando o dia muda — resolve de quebra o caso de pergunta sensível a
data ("o que preciso fazer hoje") ficar presa num cache de ontem.
Grosseiro (não rastreia o que exatamente mudou) mas seguro, mesmo
espírito do `reindex-needed` (Fase 6).

**Nunca grava** quando a resposta tinha `proposedAction` não-nulo —
reaproveitar uma ação proposta fora de contexto é perigoso (podia
recriar pendência duplicada, referenciar id já apagado).

Limiar de acerto calibrado com embeddings reais (`input_type='query'`,
diferente do usado nos fatos): duas perguntas parafraseadas com a
mesma intenção ficaram em ~0.90 de similaridade; perguntas realmente
diferentes ficaram abaixo de 0.2 — margem enorme. `0.85`
(`CACHE_SIMILARITY_THRESHOLD`) tem folga confortável dos dois lados.

Fluxo em `askProjectAssistant`: depois de `resolveQuery`, calcula o
fingerprint + embeda a pergunta resolvida + consulta o cache
(`lookupCachedAnswer`) — só entre candidatos do MESMO projeto, MESMO
fingerprint, MESMOS `participant`/`meetingId`/`kind` (igualdade exata,
`IS NOT DISTINCT FROM`, null-safe); a similaridade de cosseno só decide
ENTRE esses candidatos, nunca sozinha. Num acerto, pula
`searchProjectMemory` + `synthesizeAnswer` inteiros — só `resolveQuery`
(já mais barato desde a Fase 6) roda sempre. Num erro/miss, segue o
fluxo normal e, se a resposta não tiver `proposedAction`, grava no
cache (`saveCachedAnswer`) pra próxima vez.

### O que muda nos arquivos existentes

- `server/db.js` — tabelas `ai_knowledge_facts`/`ai_answer_cache`;
  `migrateInsightsToKnowledgeFacts()` (one-shot, idempotente).
- `server/index.js` — chama a migração no boot.
- `server/knowledgeFacts.js` (novo) — `findConflictingFact`,
  `saveKnowledgeFact`, `loadRelevantFacts`.
- `server/answerCache.js` (novo) — `computeFingerprint`,
  `lookupCachedAnswer`, `saveCachedAnswer`.
- `server/assistantActions.js` — `executeSaveKnowledgeFact` (7º tipo).
- `server/assistantRetrieval.js` — `ProposedActionSchema` ganha
  `save_knowledge_fact` (+ campos `subject`/`content`/`scope`);
  `SynthesizeAnswerSchema` PERDE `learnedFact` (removido, não só
  desativado); `loadInsights`/`saveInsight` apagados, substituídos por
  `loadRelevantFacts`; lógica de cache integrada em
  `askProjectAssistant` (busca antes de `searchProjectMemory`, grava
  depois de uma resposta nova sem ação proposta); prompt ganha
  instruções de quando propor um fato e como tratar conflito.
- `server/assistant.js` — `loadAuthorizedProject` passa a selecionar
  `updated_at` também (usado no fingerprint).
- `src/assistant/ProjectAssistant.jsx` — card de `save_knowledge_fact`
  ("Ação proposta: lembrar este fato" + escopo).

### Fora do escopo desta entrega

- Tela de gestão de fatos/conflitos — Rafael pediu só chat por
  enquanto.
- Processo formal de validação (`unvalidated` → `validated`) — status
  existe no schema, fluxo de promoção não foi construído.
- Base de conhecimento global cross-org (legislação, IVANA) — já
  adiada desde a Fase 2.
- Cache "agressivo" (comparar pergunta crua, pulando as duas chamadas)
  — Rafael escolheu o modo seguro.

### Testado localmente, com embeddings reais (não depende de Claude)

- `saveKnowledgeFact`: 4 cenários rodados contra o Postgres local —
  fato novo (unvalidated, sem conflito); mesmo fato parafraseado
  (`duplicate`, não duplicou); afirmação contrária sobre o mesmo tópico
  (os DOIS viraram `conflicting`); fato sem relação nenhuma
  (unvalidated, sem falso positivo). Esse teste foi o que revelou o
  problema de comparar só o `subject` (ver acima) — corrigido antes de
  considerar pronto.
- `lookupCachedAnswer`/`saveCachedAnswer`: 5 cenários — pergunta
  parafraseada (ACERTO), pergunta diferente (MISS), fingerprint mudou
  (MISS, segurança preservada), mesma pergunta com participante
  resolvido diferente (MISS, segurança preservada). Todos os 5 bateram
  o esperado depois de calibrar o limiar com os dados reais.
- Dados de teste sempre limpos depois; build/`node --check` limpos;
  boot local do servidor confirmado sem erro novo (migração aplicada
  sozinha).

**Não testado**: a IA de verdade decidindo propor `save_knowledge_fact`
(org vs. project) e citando CONHECIMENTO ACUMULADO/conflito em produção
— depende da chave real. Pedido pro Rafael: ensinar um fato, confirmar,
perguntar de novo sobre ele, depois contradizer pra ver o conflito
sendo sinalizado; e perguntar a mesma coisa duas vezes seguidas pra
sentir a resposta do cache vindo mais rápido.

## 38. Endurecimento da memória em camadas — Fase 7.1 (2026-09-11)

Depois de confirmar que a arquitetura da Fase 7 estava no caminho
certo, Rafael pediu um endurecimento em 8 frentes antes de avançar pra
telas: escopo editável na confirmação, tipos de conhecimento
estruturados, vigência temporal, 4 categorias de relação entre fatos
(não só duplicata/conflito), cache invalidado por dependência real (não
só um fingerprint grosseiro), garantia testada de isolamento entre
projetos, uma camada pronta pra uma futura base compartilhada com a
IVANA, e métricas mensuráveis. Pedido explícito: **evoluir, não
reescrever** — tudo abaixo é `ALTER TABLE`/extensão sobre o que já
existia, nenhuma tabela foi recriada, nenhum dado de produção foi
migrado com perda.

### Incidente real em produção durante este deploy (2026-09-11)

O primeiro deploy desta fase (`ca3bb4b`) derrubou o serviço inteiro em
produção por ~12 minutos (08:54–09:06, horário de Brasília — 3
tentativas de deploy até resolver de verdade). Causa raiz: a migração
de `status` (`server/db.js`) traduzia os valores antigos
(`unvalidated→active` etc.) **antes** de derrubar a constraint antiga
— mas a constraint antiga só aceitava o vocabulário velho, então o
próprio `UPDATE ... SET status='active'` já violava ela mesma assim
que encontrava uma linha real com `status='unvalidated'` (um fato
ensinado à RENATA em produção ainda durante a Fase 7 — "Evanio
Santinon é da área de RH da Tecumseh"). Nunca estourou localmente
porque o Postgres de dev não tinha nenhuma linha antiga de verdade pra
disparar a tradução. Um primeiro hotfix (`68f55b4`, uma rede de
segurança genérica) não resolveu por mirar a hipótese errada
(condição de corrida); o segundo (`4ee60a2`) corrigiu a ordem de
verdade — derrubar a constraint antiga primeiro, traduzir depois,
recriar a constraint nova por último — e foi **reproduzido e
confirmado localmente antes de subir** (constraint antiga recriada +
linha real com `status='unvalidated'` inserida de propósito,
simulando o estado exato de produção). Serviço confirmado saudável
depois via `curl` (200 em `/` e `/api/health`) e log de boot limpo.
Lição registrada: `ALTER TABLE ... ADD CONSTRAINT` sempre valida a
tabela inteira contra o schema ATUAL no momento em que roda — qualquer
migração que troca o vocabulário de um `CHECK` precisa derrubar a
constraint antiga **antes** de escrever qualquer valor do vocabulário
novo, nunca depois.

### 1. O que precisou ser alterado

| Arquivo | O que mudou |
|---|---|
| `server/db.js` | `ai_knowledge_facts` ganha `knowledge_type`, `valid_from`, `valid_until`, `origin`, `reference`, `source_date`, `ingested_at`; `status`/`scope` migrados pro vocabulário novo (dado existente traduzido antes da troca de `CHECK`, nunca perdido); `ai_answer_cache` ganha `dependency_meeting_ids`, `dependency_fact_ids`, `tokens_input`, `tokens_output`; tabela nova `ai_metrics_events`. |
| `server/knowledgeFacts.js` | `classifyRelation` (4 categorias, nova); `saveKnowledgeFact` reescrito por cima dela (preenche `superseded_by`/`valid_until` de verdade — existiam desde a Fase 7 mas nunca eram usados); `loadRelevantFacts` ganha filtro por conversa e retorna `{text, factIds}` (os ids viram dependência de cache). |
| `server/answerCache.js` | `isStillFresh` (nova) — checa dependências reais antes de aceitar um candidato; `lookupCachedAnswer` passa a chamá-la e sinaliza `{staleCandidate:true}` quando rejeita por isso (só pra métrica, nunca vira resposta); `saveCachedAnswer` grava as dependências + tokens. |
| `server/metrics.js` (novo) | `logMetric` — fire-and-forget, nunca dá `await`/derruba uma resposta real por falha ao gravar métrica. |
| `server/assistantRetrieval.js` | `ProposedActionSchema.scope` vira enum de 3 valores; ganha `knowledgeType`/`validFrom`; `askProjectAssistant` coleta dependências e chama `logMetric` nos pontos combinados; `decideProposedAction` aceita `overrides`. |
| `server/assistant.js` | `POST /messages/:id/action` aceita `overrides` opcional no corpo. |
| `server/assistantActions.js` | `executeSaveKnowledgeFact` passa `knowledgeType`/`validFrom` adiante e aceita `scope='conversation'`; loga `fact_confirmed`. |
| `src/assistant/ProjectAssistant.jsx` | Card de `save_knowledge_fact` ganha seletor de escopo editável (3 pills) + chip de `knowledgeType`. |

### 2. Modelo das tabelas envolvidas

`ai_knowledge_facts` (colunas novas/alteradas — o resto é igual à Fase
7, ver §37):

```
knowledge_type  TEXT NOT NULL DEFAULT 'FACT'
                CHECK IN ('FACT','DECISION','PREFERENCE','RULE',
                          'HYPOTHESIS','PROCEDURE','DEFINITION')
valid_from      DATE            -- desde quando o fato vale (null = sempre valeu)
valid_until     DATE            -- até quando valeu (preenchido quando é substituído)
origin          TEXT NOT NULL DEFAULT 'conversation'
                CHECK IN ('conversation','legislation','internal_document',
                          'methodology','best_practice','other')
reference       TEXT            -- citação/documento (ex.: "LC 214/2025, art. 10")
source_date     DATE            -- data do documento/norma em si
ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
scope           TEXT NOT NULL CHECK IN ('conversation','project','org','global')
status          TEXT NOT NULL DEFAULT 'active'
                CHECK IN ('active','disputed','superseded','pending_validation','archived')
superseded_by   TEXT REFERENCES ai_knowledge_facts(id)  -- agora É preenchido de verdade
```

`ai_answer_cache` (colunas novas):

```
dependency_meeting_ids  JSONB NOT NULL DEFAULT '[]'  -- meetingIds citados nesta resposta
dependency_fact_ids     JSONB NOT NULL DEFAULT '[]'  -- fatos injetados no CONHECIMENTO ACUMULADO
tokens_input            INT NOT NULL DEFAULT 0        -- custo da resposta original (synthesizeAnswer)
tokens_output           INT NOT NULL DEFAULT 0
```

`ai_metrics_events` (tabela nova, genérica — um evento por linha):

```
id, org_id, project_id (nullable), event_type, metadata JSONB, created_at
```

### 3. Fluxo completo de criação e recuperação de conhecimento

**Criação:** usuário conta um fato → `synthesizeAnswer` sugere
`proposedAction.type='save_knowledge_fact'` com `subject`, `content`,
`knowledgeType`, `scope` (sugestão) e `validFrom` (se houver data
explícita) → card de confirmação mostra o fato + o tipo + 3 pills de
escopo (Só esta conversa / Este projeto / Toda a PRICETAX,
pré-selecionado no valor sugerido pela IA, editável) → usuário confirma
(ou troca o escopo antes) → `POST /messages/:id/action` com
`overrides:{scope}` → `decideProposedAction` aplica o override (só
nesse campo, só nesse tipo de ação, só se o valor for um dos 3
válidos) → `executeSaveKnowledgeFact` → `saveKnowledgeFact`: embeda o
`content`, busca o fato mais parecido no MESMO escopo (`findSimilarFact`,
SQL filtra org/projeto/conversa ANTES de qualquer similaridade),
classifica a relação (`classifyRelation`, ver item 5) e grava —
loga `fact_proposed` (quando a IA sugere), `fact_confirmed` ou
`fact_rejected` (na decisão), e `duplicate_detected`/
`conflict_detected`/`temporal_update_detected`/`complement_detected`
(no resultado da classificação).

**Recuperação:** toda pergunta chama `loadRelevantFacts(pool, orgId,
projectId, conversationId)` — monta o texto "CONHECIMENTO ACUMULADO"
com os fatos do projeto + os `scope='org'` (globais à PRICETAX) + os
`scope='conversation'` DESTA conversa, excluindo `archived`/
`superseded`, retornando também os ids usados (`factIds` — viram
`dependency_fact_ids` no cache). Cada fato aparece com tipo, vigência
(se houver) e uma marca `[DIVERGENTE]` (status `disputed`) ou
`[HIPÓTESE]` (`pending_validation`) — o prompt nunca escolhe uma
versão divergente sozinho.

### 4. Política de escopo e permissões

- **A IA nunca decide escopo sozinha** — só sugere; o usuário vê e
  pode trocar entre os 3 valores no card antes de confirmar (pedido
  explícito do Rafael: "conhecimento organizacional precisa de
  confirmação explícita"). O backend nunca confia no `overrides` cego:
  só aplica se o tipo da ação for `save_knowledge_fact` e o valor
  estiver no enum de 3 (`OVERRIDABLE_SCOPES`, `assistantRetrieval.js`).
- **`conversation`** — memória de trabalho explícita e persistente
  enquanto a conversa não for limpa (diferente do histórico implícito
  de 8 mensagens, que sempre existiu). Só é lida de volta filtrando
  pela MESMA `source_conversation_id` — nunca vaza pra outra conversa,
  nem do mesmo usuário.
- **`project`** — específico do cliente/projeto (maioria dos casos).
- **`org`** — vale pra qualquer projeto da PRICETAX. Continua sem
  exigir nenhum cargo especial pra propor (decisão da Fase 7, mantida:
  "qualquer usuário pode propor, a barreira é a confirmação") — o
  endurecimento pedido não foi "quem pode propor org", foi "o usuário
  vê e decide o escopo antes de confirmar", que é o que foi construído.
- **`global`** existe no schema (reservado pra Fase 8/IVANA, ver item
  7 abaixo) mas nada grava nele ainda.
- **Isolamento entre projetos — testado, não só assumido** (item 6 do
  pedido original: "segurança e escopo antes de similaridade"):
  `findSimilarFact`/`loadRelevantFacts`/`lookupCachedAnswer` sempre
  filtram por `org_id`/`project_id`/`scope` no `WHERE` SQL ANTES de
  qualquer cálculo de similaridade em JS — não existe caminho de código
  onde um fato ou uma resposta cacheada de um projeto vira candidato
  pra outro projeto só por parecer semanticamente igual. Confirmado com
  um teste automatizado: um fato do projeto A com conteúdo quase
  idêntico ao de uma busca no projeto B nunca aparece como candidato em
  B, mesmo usando o MESMO embedding nos dois lados.

### 5. Política de conflito e vigência

`classifyRelation` (`server/knowledgeFacts.js`) decide entre 4
categorias, nesta ordem, sempre a partir da similaridade de **conteúdo**
(não do assunto — calibração da própria Fase 7, ver §37) do fato novo
contra o candidato mais parecido no mesmo escopo:

1. **Duplicata** — similaridade ≥ 0.93 (mesmo limiar da Fase 7,
   recalibrado com paráfrase real: "Felipe é o CEO da PRICETAX." vs.
   "O Felipe é CEO da PRICETAX." mediu 0.9762). Não grava de novo,
   devolve o id do fato existente.
2. **Atualização temporal** — o fato novo trouxe um `validFrom`
   explícito POSTERIOR ao `valid_from`/`created_at` do fato existente
   (exemplo do próprio Rafael: "Felipe é CEO" → depois "Felipe deixou
   de ser CEO em 01/10/2026" com `validFrom="2026-10-01"`). O fato
   antigo vira `status='superseded'`, `superseded_by=<novo id>`,
   `valid_until=<validFrom do novo>` — preservado no histórico, só não
   é mais "o vigente". NUNCA vira `disputed` — é sucessão no tempo, não
   incompatibilidade. Medido com dados reais: 0.86 de similaridade
   (mesma faixa "mesmo tópico" da Fase 7).
3. **Conflito** — sem data de mudança, mas com assimetria de
   negação/cessação (regex sobre "não"/"nunca"/"deixou"/"ex-"/"foi
   substituíd[oa]" presente em só um dos dois textos). Marca os DOIS
   fatos como `status='disputed'` — nunca escolhe uma versão sozinha,
   nunca apaga. Medido: 0.88 de similaridade (mesma faixa).
4. **Complemento** (default da faixa 0.75–0.93 quando nem 2 nem 3 se
   aplicam) — os dois ficam `active`, independentes, sem relação
   registrada. Medido: 0.89 de similaridade.

**Limitação conhecida, documentada, não escondida** (ver item 8 —
riscos): a classificação é heurística (regex + data explícita), não
NLP. Um conflito sem palavra de negação nenhuma (ex.: "a reunião é
terça" vs. "a reunião é quinta") vira `complemento` por engano; uma
atualização sem data explícita vira `conflito`. Resolver isso de
verdade exigiria uma chamada à IA a mais por fato salvo — decisão
consciente de não fazer agora, pra não contradizer a economia de custo
da Fase 6.

### 6. Política de cache e invalidação

Além do `data_fingerprint` (Fase 7 — invalida tudo do projeto quando
`projects.updated_at` muda ou o dia vira), o cache agora rastreia
**dependências reais** por resposta: `dependency_meeting_ids` (as
reuniões citadas em `citedSources`) e `dependency_fact_ids` (todos os
fatos que entraram no CONHECIMENTO ACUMULADO daquela pergunta).
`isStillFresh(pool, entry)` (`server/answerCache.js`) checa, antes de
aceitar um candidato:

1. Nenhuma reunião dependente foi reindexada depois do cache
   (`MAX(created_at)` dos chunks daquela reunião ≤ `created_at` do
   cache) — uma edição numa reunião QUE NÃO é dependência não afeta o
   cache (testado: cache sobrevive).
2. Nenhum fato dependente foi editado/arquivado depois do cache
   (`MAX(updated_at)` dos fatos ≤ `created_at` do cache, e nenhum foi
   `archived`/`superseded`) — testado: editar um fato dependente
   invalida só quem depende dele.
3. Nenhum fato NOVO apareceu no escopo relevante (org ou projeto) desde
   o cache — testado: criar um fato novo invalida.

Qualquer uma falhando = cache inelegível, mesmo com fingerprint e
similaridade batendo; `lookupCachedAnswer` sinaliza isso como
`cache_rejected_stale` (métrica, ver item 8) e segue pro fluxo normal,
que recalcula e grava um cache novo. É estritamente mais preciso que a
Fase 7 (nunca mais permissivo que o correto — só menos derrubador:
antes, QUALQUER edição no projeto invalidava TUDO; agora só invalida
quem realmente depende do que mudou).

"Tokens economizados pelo cache": todo cache grava `tokens_input`/
`tokens_output` da resposta original; um `cache_hit` loga
`tokensSavedInput`/`tokensSavedOutput` com esses valores — é quanto
"teria custado de novo" baseado em custo real medido, não uma
estimativa inventada.

### 7. Terreno preparado pra base compartilhada com a IVANA (schema only)

Em vez de uma tabela paralela (risco que o Rafael pediu explicitamente
pra evitar — "não quero criar outra estrutura incompatível"),
`ai_knowledge_facts` ganhou o vocabulário de proveniência que uma base
de conhecimento validada precisaria: `origin` (de onde veio —
legislação, documento interno, metodologia, boa prática, ou
`conversation`, o default de tudo que já existe), `reference`
(citação/documento), `source_date` (data do documento em si, diferente
de `created_at`/`ingested_at`, que são de quando entrou no sistema), e
`scope='global'` já aceito pelo schema. **Nenhuma ingestão nova usa
isso ainda** — é só schema pronto; integrar a IVANA de fato (ingestão
de legislação, cross-org de verdade) fica pra Fase 8 ou além (ver item
9).

### 8. Testes implementados

Script Node local (`_test_fase71_*.mjs`, descartável, apagado depois
— mesma disciplina da Fase 7: medir similaridade real antes de fixar
qualquer expectativa), rodado contra o Postgres local com
`VOYAGE_API_KEY` real. **20 verificações, todas passando**:

- **4 categorias de `classifyRelation`**, uma por categoria, com a
  similaridade real medida e registrada (não assumida): duplicata
  (0.9762), atualização temporal (0.86, com verificação de
  `superseded_by`/`valid_until`/`status` no fato antigo), conflito
  (0.88, com verificação de `disputed` nos DOIS fatos), complemento
  (0.89, com verificação de que o fato antigo continua `active`).
- **Isolamento entre projetos**: fato do projeto A com conteúdo quase
  idêntico a uma busca no projeto B — confirmado que nunca aparece
  como candidato nem no texto de `loadRelevantFacts` de B, mesmo
  usando o MESMO embedding nos dois lados.
- **Cache por dependência**, 3 cenários isolados: (A) cache sobrevive a
  edição numa reunião que NÃO é dependência, invalida quando a
  DEPENDENTE é reindexada, e devolve os tokens gravados; (B) cache
  invalida quando um fato dependente é editado depois de cacheado; (C)
  cache sem dependências sobrevive até surgir um fato novo no escopo,
  quando invalida.
- Migração (`initDb()`) aplicada contra o Postgres local e confirmada
  sem erro contra dados já existentes; `node --check` em todos os
  arquivos tocados; `npm run build` limpo.
- **UI testada manualmente no browser** (mesmo truque da Fase 5:
  org/projeto/usuário/mensagem temporários inseridos direto no
  Postgres local, sem depender de IA real) — seletor de 3 pills
  renderiza com o valor sugerido pela IA pré-selecionado, troca de
  seleção funciona, e confirmar com um escopo DIFERENTE do sugerido
  (`org`→`project`) grava o valor escolhido pelo usuário no banco
  (confirmado via SQL) e loga `fact_confirmed` corretamente. Dados de
  teste (org/usuário/projeto temporários) limpos depois.

**Não testado** (mesma limitação da Fase 7): a IA de verdade sugerindo
`knowledgeType`/`validFrom`/`scope` corretamente em produção — depende
da chave real do Claude, indisponível localmente.

### 9. Riscos que ainda permanecem

- **Heurística de conflito/atualização é regex, não NLP** (ver item
  5): um conflito sem palavra de negação vira complemento por engano;
  uma atualização sem data explícita vira conflito. Aceitável pro
  volume atual de fatos ensinados manualmente, mas não escala pra
  ingestão em massa.
- **Sem tela de gestão de fatos/conflitos/métricas** — tudo é
  acessível só via chat ou SQL direto; um `disputed` fica visível pra
  RENATA mas não há lugar pra "resolver" ele fora de ensinar um novo
  fato que o supere.
- **`global` existe mas está vazio** — o dia que a IVANA precisar
  ingerir legislação de verdade, ainda falta decidir COMO (lote?
  aprovação manual? quem pode?) — só o campo está pronto, o processo
  não.
- **Cache ainda depende de `data_fingerprint` pra dado sem timestamp
  granular** (cronograma/atividades/equipe) — uma edição em QUALQUER
  atividade do projeto ainda invalida cache de perguntas sobre
  reuniões que não têm nada a ver com atividades. Resolver isso exigiria
  rastrear dependência por atividade também, não só por reunião/fato.
- **`knowledgeType`/`validFrom` são só sugestão da IA, sem edição no
  card** (diferente do `scope`, que ganhou o seletor pedido) — se a IA
  errar o tipo ou não pegar uma data explícita, o usuário só pode
  confirmar como está ou cancelar, não corrigir campo a campo. Rafael
  não pediu isso explicitamente desta vez, mas é uma lacuna real.

### 10. Recomendação para a Fase 8

Nesta ordem de prioridade: **(1)** uma tela mínima de gestão de
conhecimento (listar fatos por status, permitir arquivar/resolver um
`disputed` manualmente) — hoje isso só existe implicitamente pelo chat,
e conforme o volume de fatos cresce isso vira o gargalo real; **(2)**
rastrear dependência de cache por atividade do cronograma (não só
reunião/fato), fechando o risco de invalidação grosseira que ainda
resta; **(3)** só depois disso, considerar a integração de fato com a
IVANA (ingestão de legislação em `origin='legislation'`,
`scope='global'`) — o schema já está pronto, mas o processo de
ingestão/validação merece ser desenhado com calma, não encaixado como
extensão de outra fase.

## 39. Central de Conhecimento e Memória Viva — Fase 8 (2026-09-11)

As Fases 7/7.1 construíram o MOTOR de memória da RENATA (fatos com
escopo/tipo/vigência/status, 4 categorias de relação, cache semântico
por dependência) — mas isso só existia "por baixo do capô", sem
nenhuma tela pra ver/auditar/administrar. O Rafael pediu uma área
administrativa completa — "Conhecimento" — respondendo "o que a RENATA
sabe hoje?" de forma visível, com governança (nem todo usuário edita
conhecimento organizacional) e sem NUNCA destruir histórico. Escopo
confirmado com ele antes de implementar: visibilidade só PRICETAX
(master/pricetax — 'cliente' nunca vê esta área); Pessoas/Empresas como
lista+detalhe (sem grafo/rede); painel "Como a RENATA chegou nisso?" no
chat fica pra depois (só os dados ficam prontos); "Fontes" não é aba
própria, é filtro dentro de Memórias. 6 abas: Visão Geral / Memórias /
Conflitos / Pessoas / Empresas / Métricas.

**Princípio seguido à risca**: nada do motor de memória (`classifyRelation`,
`findSimilarFact`, cache por dependência) foi reescrito — só estendido
aditivamente, com a camada de administração construída em cima.

### Achados corrigidos durante o levantamento (bugs reais, não só features novas)

1. **Conflito sem elo rastreável** — `saveKnowledgeFact` marcava o fato
   existente como `disputed` mas nunca gravava QUAL fato causou o
   conflito. Corrigido com `conflicts_with` (self-FK), preenchido nos
   dois lados no momento da detecção.
2. **`valid_until` nunca era checado** — `findSimilarFact` e
   `loadRelevantFacts` só excluíam `archived`/`superseded`; um fato
   `active` com `valid_until` no passado continuava sendo tratado como
   verdade vigente. Corrigido (`AND (valid_until IS NULL OR valid_until
   >= CURRENT_DATE)`) em toda query de "verdade atual" — motor de
   memória E Central de Conhecimento.
3. **Fatos `scope='conversation'` não guardavam `project_id`** —
   `saveKnowledgeFact` só setava `project_id` quando `scope==='project'`.
   Corrigido pra também setar em `'conversation'` (só `'org'`/`'global'`
   continuam `NULL`) — mudança aditiva comprovada sem efeito nas buscas
   existentes (que filtram por `source_conversation_id`, não
   `project_id`, nesse escopo).
4. **`fact_confirmed`/`fact_proposed` não guardavam o id do fato** — os
   4 eventos automáticos (`duplicate_detected` etc.) já tinham `newId`/
   `existingId`/`oldId` em `metadata`, mas o evento de confirmação não
   tinha nenhum id — impossível montar a timeline "Histórico" de um
   fato sem isso. Corrigido: `fact_confirmed` agora grava `factId`.

### Modelo de tabelas

`ai_knowledge_facts` ganhou (todas colunas novas aditivas, nenhuma
constraint de vocabulário mudou nesta fase — sem risco de repetir o
incidente do §38):

```
conflicts_with        TEXT REFERENCES ai_knowledge_facts(id)   -- elo dos 2 lados de um conflito
disputed_reviewed_at  TIMESTAMPTZ                              -- "revisado, sem decisão" (não muda status)
disputed_reviewed_by  TEXT REFERENCES users(id)
supersede_reason      TEXT                                     -- motivo, gravado na linha NOVA
source_meeting_id     TEXT                                     -- sem FK (reuniões vivem no JSONB do projeto)
content_tsv           tsvector GENERATED (busca lexical, mesmo padrão de project_memory_chunks)
```

`ai_answer_cache` e `ai_messages` ganharam `cited_fact_ids JSONB DEFAULT
'[]'` — o subconjunto ESTREITO que a IA realmente citou (distinto de
`dependency_fact_ids`, o conjunto LARGO injetado no prompt, que só
serve pra invalidação de cache — Fase 7.1). `ai_messages` ganhou também
`from_cache BOOLEAN` + índice GIN em `cited_fact_ids`
(`jsonb_path_ops`).

Duas tabelas novas — grafo de entidades relacional (não um array JSONB
solto: precisa de find-or-create deduplicado por nome normalizado E
lookup reverso indexável "quais fatos mencionam esta entidade"):

```sql
ai_knowledge_entities (id, org_id, type CHECK IN (PERSON,COMPANY,PROJECT,LAW,PRODUCT,TOPIC),
  name, normalized_name, linked_user_id, linked_project_id, mention_count, created_at, updated_at)
  -- UNIQUE(org_id, type, normalized_name)

ai_knowledge_fact_entities (id, fact_id FK CASCADE, entity_id FK CASCADE, created_at)
  -- UNIQUE(fact_id, entity_id)
```

### Fluxo completo de criação e recuperação

**Criação**: usuário conta um fato → `synthesizeAnswer` sugere
`save_knowledge_fact` com `entityMentions` (pessoas/empresas/temas
identificados) além dos campos já existentes → usuário confirma
(podendo trocar escopo, Fase 7.1) → `saveKnowledgeFact` grava
`source_meeting_id` (reunião aberta na tela, se houver) e chama
`linkFactEntities` (find-or-create por nome normalizado, nunca bloqueia
o save se falhar). No admin, uma entidade também pode ser
adicionada/removida manualmente no drawer (`POST`/`DELETE
/api/knowledge/facts/:id/entities`) — útil enquanto a sugestão da IA
ainda não é 100% confiável.

**Recuperação/busca (Memórias)**: `searchKnowledgeFacts`
(`server/knowledgeCenter.js`) — busca híbrida, MESMO padrão de
`searchProjectMemory` (`server/memoryRetrieval.js`): lexical
(`content_tsv`, fallback AND→OR) + semântica (`embedTexts`/cosseno,
só dentro do conjunto já filtrado por SQL) + filtros em chip (tipo,
escopo, status, projeto, origem — "Fontes" vira aqui, não aba própria).
Default exclui `archived`/`superseded` e `valid_until` vencido (achado
2) — "verdade atual", não histórico completo.

**Edição (nunca destrutiva)**: `editFactVersioned` NUNCA faz `UPDATE`
de conteúdo — sempre cria uma linha NOVA (`source_user_id`=quem editou,
`supersede_reason`=motivo obrigatório, entidades da linha antiga
copiadas pra nova) e marca a antiga `superseded`+`superseded_by`+
`valid_until`. É a generalização manual do mesmo padrão que
`classifyRelation` já usa pra atualização automática (Fase 7.1) — a
mesma invariante "a linha nunca muda seu conteúdo depois de criada, só
seu status e `superseded_by`" continua valendo.

### Política de escopo e permissões

Nenhuma role/tabela nova — reusa exatamente o que já existe:
- **Visibilidade da área inteira**: `requireMasterOrPricetax`
  (`server/auth.js`, já existente) em TODA rota de `/api/knowledge/*`
  — 'cliente' nunca acessa, mesmo tendo acesso a empresas.
- **"Usuário comum"** (ensinar/propor): já era assim desde a Fase 7,
  sem mudança — qualquer usuário com `canAccessProject` pode propor um
  fato de `project`/`conversation`.
- **"Gestor"** (validar/corrigir/resolver conflitos DE PROJETO):
  `role IN (master, pricetax)` E o projeto do fato estar em
  `accessibleProjectIds` — checado por
  `checkFactMutationPermission(user, fact, accessibleProjectIds)`
  (`server/knowledgeCenter.js`).
- **"Administrador"** (editar conhecimento organizacional, resolver
  conflitos globais): `role === 'master'` — mesma checagem, só que fato
  `scope IN (org, global)` sempre exige `master`, nunca `pricetax`.
- **Isolamento entre projetos**: `listAccessibleProjectIds(pool, user,
  orgId)` (`server/permissions.js`, novo) — construído reusando
  LITERALMENTE `canAccessProject` (`server/routes.js`) linha a linha em
  vez de reimplementar a regra em SQL, então nunca diverge dela. Toda
  função de `knowledgeCenter.js` recebe esse conjunto já calculado e
  filtra `org_id` + `(scope='org' OR project_id = ANY(...))` no SQL
  ANTES de qualquer similaridade em JS — mesmo funil PERMISSÃO → ESCOPO
  → BUSCA SEMÂNTICA já usado desde a Fase 7.1, agora também pra buscas
  cross-projeto (um usuário PRICETAX pode ter acesso a várias empresas
  ao mesmo tempo, diferente do chat da RENATA, que sempre opera dentro
  de UM projeto).

### Política de conflito e vigência (6 desfechos, `resolveConflict`)

Todos só usam `UPDATE` sobre `status`/`superseded_by`/`conflicts_with`/
`disputed_reviewed_at` já existentes — NUNCA `DELETE`:

| Resolução | Efeito |
|---|---|
| `keep_a` / `keep_b` | descartado vira `archived`, `superseded_by=<mantido>`; mantido vira `active` |
| `temporal_update` | mais antigo vira `superseded`+`superseded_by`+`valid_until`; mais novo vira `active` — literalmente o ramo `'update'` de `classifyRelation` acionado à mão |
| `complement` | ambos ficam `active`, sem `conflicts_with` |
| `archive_both` | ambos ficam `archived` |
| `mark_reviewed` | ÚNICO que não muda `status` (continuam `disputed` — a RENATA continua tratando como divergente no prompt) — só grava `disputed_reviewed_at`/`by`, pra sair da lista de "nunca visto" |

### Política de utilização/explicabilidade (itens 9/10)

Comparado duas abordagens: tabela de junção nova (`ai_message_facts`)
vs. coluna JSONB+GIN em `ai_messages` — escolhida a segunda: é 1:N
barato que já nasce dentro da linha que seria inserida de qualquer
jeito (sem write extra), e `cited_fact_ids @> '["id"]'` com
`jsonb_path_ops` responde rápido nos dois sentidos ("quais fatos esta
resposta usou" e "quais respostas usaram este fato"), sem o custo de
manter mais uma tabela. `SynthesizeAnswerSchema` ganhou `citedFactIds`
— MESMO padrão de `citedChunkIds` (a RENATA declara quais fatos
realmente citou, validado server-side contra `dependencyFactIds` antes
de confiar, nunca aceito cego). `ai_messages.from_cache` registra se a
resposta veio de um acerto de cache — dado pronto pro futuro painel
"Como a RENATA chegou nisso?" (deferido nesta fase).

### Telas

Visão Geral (KPIs + "aprendeu recentemente" + "precisa de atenção" +
"mais utilizados"), Memórias (busca híbrida + filtros em chip),
Conflitos (pares lado a lado + 6 botões com confirmação antes de
aplicar), Pessoas/Empresas (`EntitiesTab` — um componente único reusado
pros dois via prop `types`, lista+detalhe sem grafo), Métricas (cards +
tabelas simples, sem lib de gráfico nova). Área nova em `src/knowledge/`
(mesmo padrão de módulo autocontido de `src/xflow/`), montada como novo
`workspaceMode` em `src/App.jsx` — card "Conhecimento" no
`WorkspaceGateScreen`, visível só quando `role` é `master`/`pricetax`.

### Testes implementados

Scripts `_test_fase8_*.mjs` (descartáveis, apagados depois — mesma
disciplina das Fases 7/7.1), rodados contra Postgres local +
`VOYAGE_API_KEY` real. **34 verificações, todas passando**:
isolamento entre projetos (lexical e semântico); fato `scope='org'`
visível em todos os projetos autorizados; edição gera nova versão
preservando a antiga intacta (com cópia de entidades); as 6 resoluções
de conflito, cada uma com o estado final correto; `saveKnowledgeFact`
grava `conflicts_with` nos dois lados (achado 1); entidade dedup por
nome normalizado + resolução de `linked_user_id`; captura e agregação
de `cited_fact_ids` (sem depender de IA real); validação server-side de
`citedFactIds` descarta id inventado; fato `superseded` e fato
`active` com `valid_until` vencido excluídos de toda "verdade atual".
UI verificada manualmente no browser (dados semeados direto no
Postgres local): as 6 abas, drawer com histórico/relações/utilização,
edição versionada ponta a ponta (achado um bug real neste processo —
ver abaixo), resolução de conflito, navegação "origem → reunião" real
entre módulos.

**Bug real encontrado e corrigido durante a verificação manual**: após
editar um fato, o drawer continuava mostrando a versão ANTIGA (agora
`superseded`) em vez de seguir pra nova — o `factId` no componente pai
nunca era atualizado com o id devolvido por `editFactVersioned`.
Corrigido (`onFactChanged(newFactId)` troca o `drawerFactId`); também
corrigida a rotulagem "Versão atual" na timeline, que comparava contra
o `factId` aberto (errado) em vez de "quem não tem `superseded_by`"
(correto).

**Não testado**: a IA de verdade sugerindo `entityMentions`/
`citedFactIds` em produção — depende da chave real do Claude,
indisponível localmente (mesma limitação de sempre). Busca semântica
da Central de Conhecimento não foi exercitada via browser (o dev server
local não repassa `VOYAGE_API_KEY` pro processo do Vite/Express —
tentativa de contornar isso esbarrou numa restrição de sandbox do
ambiente de desenvolvimento; a lógica em si já está coberta pelos
testes automatizados com embeddings reais).

### Riscos que permanecem

- Heurística de conflito continua regex-based (risco já documentado no
  §38) — a Central de Conhecimento torna isso mais visível, não mais
  preciso.
- Deduplicação de entidades é heurística (`normalizeName`) — "Rafael"
  e "Rafa" viram entidades diferentes; sem mesclagem manual nesta fase.
- `conflicts_with` só suporta pares 1:1 — um fato em conflito com dois
  outros simultaneamente só mantém o vínculo mais recente rastreável.
- Painel de explicabilidade no chat, visualização em grafo de
  entidades, e mesclagem de entidades duplicadas ficaram fora do
  escopo desta entrega (itens adiados, confirmados com o Rafael).

### Recomendação para a Fase 9

Nesta ordem: **(1)** o painel "Como a RENATA chegou nisso?" dentro do
próprio chat — os dados (`cited_fact_ids`, `from_cache`, `cited_sources`)
já estão prontos, falta só a UI; **(2)** uma ação de mesclar entidades
duplicadas manualmente (a heurística de nome normalizado não pega
apelidos diferentes); **(3)** só depois disso, a visualização em
grafo/rede de entidades — a base relacional já suporta, mas o
investimento de UI só se justifica com volume real de dados usando a
versão lista+detalhe primeiro.

## 40. RENATA registra sozinha os conflitos que ela detecta ao responder (2026-09-12)

**Caso real que motivou isso**: o Rafael perguntou sobre os benefícios da
Tecumseh, a RENATA respondeu citando a reunião de 09/09 e sinalizou
corretamente (numa seção "warning") uma divergência real entre o
resumo da reunião e a fala literal do RH sobre o rateio do seguro de
vida. O Rafael foi conferir na Central de Conhecimento e não achou
nada — porque, de fato, nada tinha sido salvo: essa "warning" existia
só naquela resposta e sumiria assim que a conversa fosse limpa.

**Causa**: `save_knowledge_fact` (Fase 7) só é proposto quando o
USUÁRIO ensina um fato novo na conversa — nunca quando a própria
RENATA percebe uma divergência entre fontes já existentes (dois
trechos de reunião, ou um trecho contra o PERFIL DO PROJETO) ao
responder uma pergunta. Esse tipo de conflito nunca tinha um caminho
pra virar um registro rastreável.

**Solução**: novo tipo de ação proposta, `flag_knowledge_conflict` —
mesmo padrão de confirmação das outras 8 ações (nunca grava sozinha).
Sempre que a RENATA monta uma seção "warning" de informação
conflitante, ela também pode propor registrar as DUAS versões como
fatos, já ligados entre si. `ProposedActionSchema` ganha `content`
(versão A, reaproveitado) + `conflictingContent` (versão B) —
`subject`/`scope`/`knowledgeType`/`entityMentions` são os mesmos
campos de `save_knowledge_fact`, com o mesmo seletor de escopo (3
pills) reaproveitado no card de confirmação.

`saveConflictPair` (`server/knowledgeFacts.js`, novo) — diferente de
`saveKnowledgeFact`, NÃO roda `classifyRelation` pra descobrir se há
conflito (a IA já afirmou isso explicitamente): as duas linhas nascem
`disputed` direto, ligadas via `conflicts_with` nos dois sentidos —
mesmo estado final que o caminho automático chegaria, só que sem
depender da heurística de similaridade/negação pra ESSE caso
específico. Zero migração de schema — reaproveita 100% das colunas já
criadas na Fase 8 (`conflicts_with`, `status='disputed'`). Aparece na
aba Conflitos exatamente como um conflito detectado automaticamente
(mesmo `eventType='conflict_detected'`, com `metadata.source:
'answer_synthesis'` pra distinguir a origem).

**Testado**: script local com embeddings reais confirmando as duas
linhas nascendo `disputed`+`conflicts_with` cruzado, aparecendo em
`listConflicts`, e o evento com a origem certa — e verificação manual
completa no browser (card de confirmação com as duas versões visíveis,
seletor de escopo funcionando, confirmação persistindo corretamente e
aparecendo na aba Conflitos).

**Risco aceito conscientemente**: a IA agora pode propor mais ações do
que antes (qualquer resposta com uma divergência real vira candidata) —
mitigado pela mesma regra de sempre: nunca mais de uma proposedAction
por resposta, e o usuário sempre confirma antes de qualquer coisa ser
gravada.

## 41. RENATA Eval Harness — Fase 1 do plano P0/P1 (2026-09-13)

**Contexto**: depois do diagnóstico completo em
`docs/RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md` (RENATA como "sistema
cognitivo", 20 itens de gap) e do plano de implementação reduzido a 11
capacidades P0/P1 em `docs/RENATA_P0_P1_IMPLEMENTATION_PLAN.md`, o Rafael
pediu pra implementar SÓ a primeira fase — um harness de avaliação — antes
de tocar em qualquer lógica de raciocínio (Depth Routing, Adaptive Context,
Reranking, Planner etc. ficam pra depois). Regra central: **medir o
comportamento atual exatamente como ele é hoje, nunca ajustar
resolveQuery/searchProjectMemory/buildProjectSnapshot/loadRelevantFacts/
synthesizeAnswer/ranking/thresholds/prompts/models pra fazer um caso de
teste passar.**

**O que foi construído** (`server/evals/`, novo módulo):
- `fixtures.js` — projeto sintético "Fixture Corp" (fictício, inspirado em
  padrões reais já documentados — ex. o conflito de rateio de seguro de
  vida do §40, decisão atualizada no tempo, atividade atrasada por
  dependência), seedado usando CÓDIGO REAL de produção
  (`reindexProjectMemory`/`saveKnowledgeFact`, nunca reimplementado).
- `evidenceKeys.js` — como os ids aleatórios de chunk/fato viram chaves
  estáveis (`chunk:<meetingId>#<kind>#<índice>`, `fact:<subject>#v<n>`) pra
  os casos de teste referenciarem evidência de forma legível e reprodutível
  entre reseeds.
- `evalCases.js` — 23 casos cobrindo as 12 categorias pedidas (FACTUAL,
  PERSON, MEETING, ACTIVITY, DECISION, TEMPORAL, CONFLICT, CAUSAL,
  EXECUTIVE, NO_EVIDENCE, AMBIGUOUS_REFERENCE, MULTI_HOP).
- `evalMetrics.js` — funções puras (recall@K, precision@K, MRR, citation
  validity, cobertura de fatos esperados, veredito de no-evidence/conflito
  como TP/FP/FN/TN).
- `evalRunner.js` — chama `askProjectAssistant` de verdade (com o novo
  parâmetro opcional `trace`, ver abaixo) e avalia contra `expected`.
- `evalReport.js` — relatório agregado + FAILURE TRACE completo por caso
  que falhar (resolveQuery/chunks/fatos/contexto/resposta/citações — nunca
  só "caso X falhou").
- `runUnitEval.mjs` (`npm run eval:unit`) — modo determinístico, ZERO
  chamada de rede, roda em qualquer ambiente.
- `runFullEval.mjs` (`npm run eval:full -- --baseline`) — modo real, exige
  `ANTHROPIC_API_KEY`, nunca roda em build/CI automático, só por comando
  explícito.

**Única mudança em arquivo do "cérebro"**: `askProjectAssistant`
(`server/assistantRetrieval.js`) ganhou um parâmetro opcional `trace` —
aditivo, sem nenhuma mudança de comportamento pra quem não o passa
(`server/assistant.js`, o chamador de produção, nunca passa). É só um ponto
de observação pra capturar os valores intermediários já calculados
(resolveQuery, chunks, fatos, synthesizeAnswer, latência por etapa) sem
duplicar a orquestração numa segunda implementação. `classifyRelation`
(`server/knowledgeFacts.js`) ganhou a palavra `export` (mesma função, zero
mudança de corpo) pra ser testável diretamente no modo unitário.

**Schema**: uma tabela nova, aditiva, fora do caminho crítico de produção —
`ai_eval_runs` (histórico de execuções do benchmark, nunca lida por
nenhuma rota de usuário final).

**Testado**: `npm run eval:unit` rodado de verdade — 34/34 passou,
incluindo um teste que documenta (não corrige) o ponto cego já previsto no
gap analysis (`classifyRelation` classifica dois valores numéricos
diferentes sem negação como `'complement'`, deveria ser `'conflict'`).
A seed da fixture (código real + Voyage real, sem Anthropic) revelou DOIS
achados não previstos, registrados em `docs/RENATA_EVAL_BASELINE.md`: (1)
duas frases que diferem só numa data saíram como `duplicate` — o segundo
fato foi descartado silenciosamente, não só mal classificado; (2) trocar o
nome da pessoa responsável (Felipe→Camila) baixa a similaridade a ponto de
`findSimilarFact` nunca achar o candidato — os dois fatos ficam `active`
lado a lado, sem nenhum vínculo de sucessão temporal.

**Pendência real, não escondida**: `ANTHROPIC_API_KEY` não está configurada
no ambiente local desta sessão — o FULL EVAL (que exercita
`resolveQuery`/`synthesizeAnswer` de verdade) está pronto pra rodar mas
ainda não foi executado. `docs/RENATA_EVAL_BASELINE.md` documenta isso
explicitamente e traz o comando exato (`node server/evals/runFullEval.mjs
--baseline`) pra gerar o baseline real assim que a chave estiver
disponível — nenhum número foi inventado pra preencher essa lacuna.

**Próxima fase**: só depois do FULL EVAL rodar de verdade e o baseline
ficar registrado, o Rafael decide se avança pro resto do plano P0/P1
(Depth Routing, Adaptive Context, Reranking, ... — ver
`docs/RENATA_P0_P1_IMPLEMENTATION_PLAN.md`, seção 2).

## 42. Auditoria de Prompt Cache nativo da Anthropic (2026-09-14)

**Contexto**: a Anthropic sinalizou taxa de acerto de cache de prompt
baixa na conta. Auditoria completa das 3 chamadas reais à API (não
existe nenhuma outra — `resolveQuery`/`synthesizeAnswer` em
`server/assistantRetrieval.js`, `extractMeetingFromTranscript` em
`server/meetingInbox.js`; IVANA não tem integração de código própria
neste repo, é só uma persona citada no texto da RENATA). Relatório
completo entregue ao Rafael em chat (achados quantificados com
estimativa de tokens por char-count, já que não havia instrumentação
prévia pra medir de verdade — corrigido nesta mesma entrega).

**Achados reais corrigidos**:
1. **`googleConnected` (dado por usuário) estava DENTRO do bloco de
   system marcado `cache_control` de `synthesizeAnswer`** — clássico
   "erro A" (conteúdo dinâmico dentro de bloco estático), fragmentava o
   cache em 2 variantes por org sem necessidade. Corrigido: instrução
   agora é genérica e sempre idêntica; o estado real vira uma linha
   dinâmica (`STATUS DO GOOGLE CALENDAR: conectado/não conectado`) no
   `messages`, onde já era recalculado a cada chamada mesmo.
2. **`cache_control` sem `ttl` (default 5min) nas 3 chamadas** — o
   padrão real de uso da RENATA (perguntas esporádicas por
   usuário/projeto) provavelmente cai na faixa de 5-60min entre
   perguntas, onde o TTL de 5min nunca é lido a tempo. Trocado pra
   `ttl: '1h'` nas 3 chamadas (GA no SDK 0.124.0, sem beta header).
3. **`resolveQuery` (claude-sonnet-5) tem system block estimado em
   ~400-470 tokens** — abaixo do mínimo de 1024 tokens exigido pra
   caching nesse modelo (Claude Sonnet 5, ver tabela de mínimos por
   modelo). É PROVÁVEL que o `cache_control` ali nunca tenha
   funcionado, mesmo antes desta auditoria — mantido (não custa nada) e
   agora instrumentado pra confirmar com dado real.
4. **`extractMeetingFromTranscript` tinha `system` como STRING solta**
   — impossível de anexar `cache_control` nesse formato. Convertido pra
   array de bloco de texto. Aviso honesto: essa chamada é dominada pela
   transcrição (dinâmica), a economia esperada aqui é próxima de zero.
5. **Zero observabilidade de cache antes desta entrega** —
   `cache_read_input_tokens`/`cache_creation_input_tokens` do `usage`
   nunca eram lidos nem logados. Novo: `logAnthropicUsage()`
   (`assistantRetrieval.js`) loga um evento `anthropic_api_call` em
   `ai_metrics_events` por CHAMADA individual (feature/model/tokens),
   nunca confundido com os eventos `cache_hit`/`cache_miss` já
   existentes (que são do CACHE SEMÂNTICO DE RESPOSTAS caseiro,
   `ai_answer_cache`, Fase 7 — camada diferente). `ai_messages` ganha
   `prompt_cache_read_tokens`/`prompt_cache_creation_tokens` (soma
   resolveQuery+synthesizeAnswer, mesmo padrão de tokens_input/output).
   `getMetrics()` (`knowledgeCenter.js`) ganha `promptCache` (taxa de
   acerto pela fórmula `cache_read / (cache_read + cache_creation +
   input)`, breakdown por feature+modelo); `MetricsTab.jsx` ganha um
   card novo, claramente rotulado "Cache de prompt (Anthropic) —
   diferente do cache semântico acima" pra nunca confundir as duas
   camadas na UI.

**Confirmado como JÁ correto, sem necessidade de mudança**: histórico
de conversa já é limitado a 8 mensagens (`loadRecentHistory`, nunca
cresce sem limite); busca de memória já é por trecho relevante com
`limit=12` (nunca documento inteiro, exceto o caso deliberado de
transcrição completa pra contexto de atividade/reunião específica);
ordem do prompt (estático→dinâmico→pergunta) já estava correta nas 3
chamadas antes desta auditoria.

**Achado não corrigido nesta fase, registrado como oportunidade P1/P2
futura**: `output_config.format` (schema JSON de `SynthesizeAnswerSchema`,
gerado por `zodOutputFormat`) mede ~3450-3950 tokens estimados — maior
que o próprio system prompt — e a interface `JSONOutputFormat` do SDK
não tem campo `cache_control` (confirmado no `.d.ts`), então não há
como cachear esse bloco isoladamente hoje; se ele conta ou não pro
mesmo prefixo cacheável do `system` é uma pergunta em aberto, não
documentada, que só a métrica nova (`anthropic_api_call`) consegue
responder com dado real ao longo do tempo. Também ficou como
oportunidade futura (não implementada, maior risco/complexidade):
separar o "Perfil do projeto" (`projectSnapshot`) em seu próprio bloco
com `cache_control` dentro de `messages`, já que ele se repete
idêntico entre `resolveQuery` e `synthesizeAnswer` na mesma pergunta e
entre turnos da mesma conversa.

**Testado**: `npm run eval:unit` (34/34, sem regressão), `npm run
build` limpo, migração aplicada localmente antes do deploy.

## 43. Correção real: fechar modal editando não confirmava nem sempre salvava de fato (2026-09-16)

**Bug relatado pelo Rafael, reproduzido ao vivo antes de corrigir** (print
da `ActivityDetailModal`, mas confirmado que o mesmo padrão existia
também em `MeetingDetailModal`): editar um campo (título/descrição/
observações/transcrição, ou resumo/decisões de reunião) e clicar fora do
modal (ou no X) fechava a tela **em silêncio, sem nenhuma confirmação** —
apesar do app já ter um padrão pronto pra isso (`useDirtyForm`/
`useAutosaveTimestamp`/`ConfirmDiscardModal`, usado em 6+ outros
modais). Causa raiz real, confirmada lendo o código: `hasDraft` nesses
dois modais só olhava rascunho de comentário/link — nunca os campos que
de fato autosalvam por tecla — então o guard nunca disparava pra eles.
Em `MeetingDetailModal` havia um segundo problema: Resumo/Decisões usam
`EditableTextCard` (edição sob demanda, só commita no blur) — fechar com
o card em modo edição podia descartar o texto sem nunca chamar
`onSave`.

**Corrigido, não só documentado como limitação** (diferente da correção
anterior de Prompt Cache, que era sobre custo — esta é sobre
confiabilidade de dado do usuário):
- `ActivityDetailModal`/`MeetingDetailModal`: `hasDraft` agora inclui um
  `fieldsDirty` via `useDirtyForm` sobre os campos autosave (título/
  descrição/observações/transcrição na atividade; título/data/horário/
  resumo/decisões na reunião) — reaproveita o hook já existente, ganha de
  graça o aviso de `beforeunload` (fechar a aba/recarregar durante o
  debounce de 500ms do salvamento também passa a avisar).
- `EditableTextCard` (`src/meetings/MeetingDetail.jsx`) virou
  `forwardRef` com `flush()`/`isDirty()` — a modal força o commit de
  qualquer edição em andamento antes de decidir se mostra o guard.
- Novo `flushProjectSave(pid)` (`src/App.jsx`, ao lado de
  `persistProjectDebounced`) — força o PATCH pendente a sair AGORA em vez
  de esperar os 500ms de debounce; chamado por "Salvar e sair" antes de
  fechar de fato, garantindo que a última tecla digitada realmente chegou
  no servidor.
- "Sair sem salvar" agora REVERTE de verdade os campos autosave pro valor
  de quando o modal foi aberto (`initialFieldsRef`, capturado uma vez no
  primeiro render) — antes desta correção "descartar" não fazia sentido
  pra esses campos porque eles já tinham sido aplicados ao estado
  compartilhado; agora reverter de fato desfaz.

**Testado ao vivo no browser** (não só `npm run build`) — reproduzido o
bug original primeiro (editar Descrição de uma atividade real, clicar
fora, ver o fechamento silencioso), depois confirmado que a mesma ação
agora mostra "Você tem alterações não salvas" com as 3 opções
funcionando: "Continuar editando" mantém a edição; "Sair sem salvar"
reverte o campo pro valor anterior (conferido no banco); "Salvar e sair"
persiste de verdade no Postgres (conferido com query direta, não só na
tela). Repetido o mesmo teste em `MeetingDetailModal` (editar Resumo
executivo via `EditableTextCard`, fechar) com o mesmo resultado.

**Fora do escopo desta correção, sinalizado como pendência conhecida**:
`PersonalCardDetailModal` (Gestão de Atividades pessoal) tem o mesmo
padrão de `hasDraft` estreito (só rascunho de comentário/checklist) — usa
um mecanismo de persistência diferente (`personalBoardSaveTimer`, não
`persistProjectDebounced`), não investigado nem corrigido nesta sessão.

## 44. Correção real: transcrição travava em "Processando..." pra sempre (2026-09-16)

**Bug relatado pelo Rafael** (print de uma transcrição parada em
"Processando..." havia minutos, sem nenhuma forma de limpar pelo
painel). Causa raiz: `processSubmission` (`server/meetingInbox.js`) roda
fire-and-forget (não segura a resposta HTTP numa chamada de IA que pode
levar dezenas de segundos) — se o servidor reinicia no meio (ex.: um
deploy, que aconteceu duas vezes nesta mesma sessão antes deste bug ser
reportado) o processo em memória simplesmente morre, e como nada mais
toca aquela linha do banco, ela fica em `status='processing'` pra
sempre. O botão "Tentar novamente" da tela só aparecia pra
`status='failed'` — uma submissão travada em `processing` não tinha
NENHUM jeito de ser recuperada pelo painel, só com um `UPDATE` manual
direto no banco de produção (que nem é publicamente acessível).

**Corrigido em duas camadas, sem precisar de acesso ao banco de
produção**:
- `GET /api/meeting-inbox` (`server/meetingInbox.js`) agora recupera
  sozinho: antes de listar, roda um `UPDATE` que vira `failed` qualquer
  `processing` com mais de 5 minutos daquele projeto (nenhuma extração
  real deveria legitimamente levar tanto) — reaproveita o botão "Tentar
  novamente" que já existe pra `failed`, sem tela/rota nova.
- `src/meetings/Meetings.jsx`: a tela também oferece "Tentar novamente"
  sozinha quando uma submissão está `processing` há mais de 90 segundos
  (mais rápido que esperar os 5min do servidor), com o aviso "Isso está
  demorando mais que o normal".

**Risco considerado e aceito**: reprocessar uma submissão que ESTIVESSE
mesmo assim ainda rodando (não órfã de verdade) poderia gerar reunião
duplicada — julgado desprezível porque nenhuma extração real chega perto
de 90s/5min, e o cenário real que motivou isto (reinício de servidor) já
mata o processo antigo de qualquer forma.

## 45. Investigação real: "escrevo e o texto some" ao criar/editar atividade (2026-09-17)

**Bug relatado pelo Rafael**: criar uma atividade nova (ou editar uma
existente) e digitar no título/descrição fazia o texto parecer sumir
depois de poucas letras.

**Investigação** — reproduzido localmente com bastante cuidado (query
direta ao DOM via JS, não só screenshot, porque a própria ferramenta de
screenshot deste ambiente de teste mostrou um atraso de captura
independente do estado real do app — um viés que quase me fez chegar a
uma conclusão errada). Achado real e honesto: o VALOR digitado nunca
esteve incorreto — confirmado por leitura direta do DOM em todo teste — o
que existe é uma arquitetura onde CADA tecla nos campos de
título/descrição/observações/transcrição de `ActivityDetailModal`
disparava `updateActivity` → `mutateProject` → `setProjects` no
componente `App` inteiro (~9000 linhas, sem memoização), refazendo o
render de toda a árvore (inclusive a tabela por baixo do modal) a cada
tecla — uma ineficiência real e mensurável (confirmada pela quantidade de
linhas de log/PATCH gerada: uma string de 37 caracteres gerava até 37
atualizações de estado global antes da correção). Isso é uma explicação
plausível e corrigida do sintoma, mas **não consegui reproduzir de forma
100% definitiva o exato "aparece e some"** que o Rafael descreveu — fica
registrado com essa honestidade, não inflado como "causa raiz 100%
confirmada".

**Corrigido**: novo `useDebouncedField(externalValue, commit, delayMs)`
(ao lado de `useDirtyForm`/`useAutosaveTimestamp`, mesmo arquivo) — o
campo de texto fica com estado 100% LOCAL (responsivo, zero custo do
re-render pesado do app) e só propaga o valor pro resto do sistema
(`updateActivity`, e daí pro autosave de verdade) 300ms depois da última
tecla, não a cada tecla. Resincroniza sozinho se o valor mudar por outro
motivo (sincronização de atividade de grupo, outra pessoa editando).
Aplicado aos 4 campos autosave de `ActivityDetailModal`
(título/descrição/observações/transcrição); `fieldsDirty`/"Sair sem
salvar"/"Salvar e sair" (correção de 2026-09-16, §43) foram atualizados
pra trabalhar em cima do rascunho local em vez do valor já commitado.

**Testado**: reproduzido as 3 flows de fechamento (continuar editando,
sair sem salvar — reverte de verdade, conferido no banco —, salvar e
sair — persiste de verdade, conferido no banco) com o novo mecanismo;
confirmado que uma rajada de digitação agora gera só 1-2 commits de
histórico em vez de um por tecla.

**Não corrigido nesta entrega, sinalizado como pendência relacionada**:
o título editável DIRETO na linha da aba Tabela (`TableView`) tem o
mesmo padrão de update por tecla — não dá pra aplicar o mesmo hook ali
sem antes extrair cada linha pra seu próprio componente (hooks não podem
ser chamados dentro de `.map()`), um refactor maior que não foi feito
aqui por segurança/tempo.

## 46. Auditoria "onde mais isso?" — mesmo bug de digitação em outros 2 lugares (2026-09-17)

Depois da correção do §45, o Rafael pediu explicitamente uma varredura
completa do código pra achar todo outro lugar com o mesmo padrão (campo
de texto cujo `onChange` chama `mutateProject`/equivalente direto a
cada tecla). Levantamento por `grep` em `src/App.jsx` e `src/meetings/*`
(a única área ainda não auditada de fato).

**Confirmado e corrigido nesta entrega** (mesmo hook `useDebouncedField`
do §45, contexto de componente único — sem o problema de `.map()`):

- **`TodoDrawer.jsx`** (painel de detalhe de Item de Ação, usado tanto
  em Reuniões quanto no Quadro/TodoBoard) — título, subtítulo,
  responsável e descrição chamavam `updateActionItem` (→
  `updateMeetingActionItem` em `App.jsx` → `mutateProject`) a cada
  tecla. Era o caso mais grave encontrado — estruturalmente idêntico ao
  bug do §45, só que em Itens de Ação em vez de Atividades.
- **`PersonalCardDetailModal`** (`App.jsx`, cards do Quadro Pessoal) —
  título e descrição do card tinham o mesmo padrão (`onChange={(e) =>
  onUpdate({...})}` direto). O `onBlur` que só registrava log
  ("Título atualizado"/"Descrição atualizada") foi absorvido pelo
  `commit` do próprio `useDebouncedField`.

Ambos testados localmente digitando rápido nos 6 campos no total e
conferindo o valor final persistido caractere a caractere direto no
Postgres (não só na tela) — sem nenhuma letra perdida, sem regressão no
fluxo de "Sair sem salvar"/`ConfirmDiscardModal` existente (que continua
tratando só rascunho de comentário/checklist, já que título/descrição
agora sempre autosalvam via debounce).

**Confirmado como risco real, mas NÃO corrigido nesta entrega** — mesmo
padrão, porém dentro de um `.map()` (exige extrair a linha num
componente próprio antes, igual à pendência do `TableView` no §45):

- Subatividade dentro de `ActivityDetailModal` (`updateSub`, título da
  subatividade) — não foi coberto pelo fix do §45, que só tratou os
  4 campos do nível principal da atividade.
- Tela "Configurações da Empresa" → Áreas e responsáveis
  (`updateAreaRow`: campo área/nome/e-mail).
- Tela "Configurações de Fases" (`updatePhase`: nome/descrição da
  fase).

**Verificado e descartado como falso positivo** (usa `useState` local,
só propaga pro estado persistido num submit explícito, não por tecla):
filtros/busca de XFlow, formulário de criação do TodoBoard,
busca/filtros de Meetings/TranscriptView/MacroOverview/
ProjectAssistant/Central de Conhecimento, campo de status em
`ActivityRow` (é `<select>`, não dispara por tecla).

## 47. Fechando a auditoria do §46: os 3 casos dentro de `.map()` (2026-09-17)

Extraídos os 3 `.map()` sinalizados como pendência no §46 em componentes
próprios — único jeito de usar `useDebouncedField` (um hook) por linha
sem violar Rules of Hooks:

- **`SubactivityRow`** (perto de `ActivityDetailModal`, `App.jsx`) —
  título da subatividade. `dragSubId`/`setDragSubId` continuam como
  estado do `ActivityDetailModal` pai, só passados como prop — a lógica
  de arrastar pra reordenar não mudou, só onde a JSX mora.
- **`AreaRow`** (perto de `App()`, `App.jsx`) — área/nome/e-mail da tela
  "Empresa e equipe" → Áreas e responsáveis.
- **`PhaseRow`** (perto de `App()`, `App.jsx`) — nome/descrição da tela
  "Fases". `dragPhaseId`/`setDragPhaseId` também continuam no pai.

**Bug de corrida real encontrado e corrigido durante a extração** (não
existia antes, teria sido introduzido pelo debounce se eu não tivesse
ajustado): `commitAreaRow(id)` e o `onBlur` de nome/descrição de fase
liam o valor "de verdade" do `activeProject`/da prop pra decidir uma
ação (auto-cadastrar o responsável na equipe; escrever a mensagem de
log) — só que com o campo agora debounced, o valor mais recente ainda
podia estar só no rascunho local, não propagado, no exato momento do
blur (o padrão antigo assumia commit síncrono por tecla). Corrigido
passando o valor do rascunho direto pro chamador (`commitAreaRow(id,
overrides)` e `addLog(..., \`Fase renomeada: "${nameField.draft}"\`)`)
em vez de reler o estado.

**Testado**: os 3 fluxos digitando rápido e conferindo o valor final
direto no Postgres — subatividade (título), área (área/nome/e-mail,
incluindo o auto-cadastro do responsável na equipe testado
especificamente por causa do bug de corrida acima) e fase
(nome/descrição, log com o nome correto, não o antigo). Drag-and-drop
não foi testado via automação (ferramenta de browser deste ambiente não
simula bem HTML5 drag-and-drop nativo) — revisão de código confirma que
o mecanismo (estado do componente pai + `draggable`/`onDragStart`/
`onDragOver`/`onDrop`) não mudou, só a JSX foi movida pra dentro do
componente extraído.

Com isso, a auditoria "onde mais isso?" do §46 está encerrada — os 5
pontos confirmados (2 do §46 + 3 aqui) foram todos corrigidos. Restou
só o `TableView` (título/descrição/subatividade/notas inline na aba
Tabela, §45) como pendência aberta, já rastreada.

## 48. Pareceres PRICETAX — repositório de PDFs (2026-09-17)

> Aba irmã: **Modelos de documentos** (§78) reaproveita o mesmo esqueleto, a mesma regra de acesso e os comentários.

**Pedido do Rafael**: um novo menu na tela inicial (junto de
Empresas/Gestão de Atividades/Agenda/Visão Geral/Conhecimento) pra
subir pareceres técnicos em PDF, com identificação do arquivo e
comentários, pra compartilhar com "sócios e colaboradores".

**Decisões de permissão confirmadas com o Rafael antes de implementar**
(via `AskUserQuestion`, ambíguo demais pra adivinhar com segurança —
são documentos internos da PRICETAX):
- **Visibilidade**: só master/pricetax — usuário `cliente` nunca vê
  esta área, mesmo tendo acesso a empresas. Mesma regra exata da
  Central de Conhecimento (§39), reaproveitando
  `requireMasterOrPricetax` — nenhuma role nova.
- **Upload/edição/exclusão**: master e pricetax (qualquer um da
  equipe interna, não só o admin).
- **Comentários**: qualquer um que já enxerga a área (mesmo conjunto
  master/pricetax).

**Arquitetura**:
- Tabela nova `pareceres` (`server/db.js`) — PDF guardado como
  `BYTEA` numa tabela própria, **não** dentro de `projects.data`
  (JSONB do projeto): é dado organizacional, não de
  projeto/empresa, e embutir um PDF ali infuncionaria o payload de
  `GET /api/projects`, que já é buscado inteiro em toda tela.
  `comments` em JSONB (mesmo padrão de comentário usado em Itens de
  Ação/atividades — `{id, text, userId, userName, ts}`).
- `server/pareceres.js` (novo router, `/api/pareceres`, mesmo padrão
  de `server/knowledge.js`): `GET /` (lista, sem o binário — só
  metadados), `POST /` (upload — recebe `fileDataBase64` no corpo
  JSON, decodifica com `Buffer.from(..., 'base64')`, valida
  `mime_type==='application/pdf'` e tamanho ≤10MB ANTES de gravar),
  `PATCH /:id` (título/descrição), `DELETE /:id`, `GET /:id/file`
  (serve o PDF com `Content-Type`/`Content-Disposition: inline`
  corretos, pra abrir direto no navegador), `POST/DELETE
  /:id/comments`. Todas as rotas atrás de `requireAuth,
  requireMasterOrPricetax` + `effectiveOrgId` (nunca uma regra de
  permissão paralela).
- **Upload sem `multipart`/`multer`**: mesmo padrão já usado em
  anexos de reunião (`TodoDrawer`) e do Quadro Pessoal —
  `FileReader.readAsDataURL` no browser, extrai a parte base64,
  manda como string dentro do JSON. Limite de 10MB por arquivo
  escolhido pra caber com folga no limite de 15mb do body parser
  (`express.json({limit:'15mb'})`, `server/index.js`) já existente —
  base64 tem ~37% de overhead, então não dava pra usar o limite
  inteiro.
- `src/pareceres/Pareceres.jsx` (novo módulo autocontido, mesmo
  padrão de `src/knowledge/`) — grid de cards, modal de upload
  (`UploadParecerModal`, dropzone client-side valida tipo/tamanho
  antes de nem tentar mandar), drawer de detalhe (`ParecerDrawer`,
  reaproveita `SidePanel` do `App.jsx`) com título/descrição
  editáveis via **`useDebouncedField`** (mesmo hook do §45) — decisão
  deliberada de já nascer sem o bug de digitação que motivou toda a
  auditoria dos §45-47, em vez de escrever `onChange` direto de novo.
  CSS próprio em `pareceresMeta.js` (prefixo `.par-`, nunca colide
  com `.knw-` do outro módulo — achei e corrigi esse exato erro de
  copiar-colar durante o teste local, antes do primeiro commit).
- `src/App.jsx` — novo `workspaceMode='pareceres'`, `hasPareceres`
  (mesma condição de `hasKnowledge`), card na `WorkspaceGateScreen`.

**Bug real encontrado e corrigido durante o teste local** (não
prod, pego antes do primeiro deploy): usei `fmtDate` (que só entende
`"YYYY-MM-DD"`, faz `iso.split('-')`) pra formatar `created_at`, que
volta do Postgres como timestamp ISO completo
(`"2026-09-18T01:08:33.423Z"`) — o `split('-')` saía errado
(`"18T01:08:33.423Z/09/2026"`). Trocado por `fmtTs` (faz `new
Date(iso)` de verdade) nos dois lugares (card da lista e cabeçalho do
drawer).

**Testado localmente** (dev local, projeto/organização de teste,
nada em produção): upload de um PDF real de ponta a ponta —
conferido byte a byte (`Buffer.compare`) que o arquivo saiu do
Postgres idêntico ao que foi enviado; edição de título com digitação
rápida (padrão dos §45-47) conferida direto no banco; comentário
adicionado e exibido; exclusão validada diretamente via `fetch` (o
`window.confirm` do botão "Excluir" é bloqueado por padrão em
automação de browser — comportamento correto, não um bug); as 3
validações de segurança do backend — sem cookie de sessão → 401,
`mime_type` diferente de PDF → 400, arquivo >10MB → 400, nenhuma
delas grava linha no banco (conferido com `COUNT(*)`).

**Verificado em produção pós-deploy**: `/`, `/api/health` (200) e
`/api/pareceres` sem sessão (401, confirma que o router está montado
e a autenticação está de fato bloqueando, não caindo no catch-all da
SPA — o primeiro teste, ~30s depois do push, ainda pegou o container
antigo e voltou 200/HTML; esperar o rollout terminar resolveu). O
`initDb()` rodar sem erro no boot (health 200) já prova que a
`CREATE TABLE pareceres` nova rodou certo contra o Postgres de
produção — um erro de SQL ali teria derrubado o boot inteiro.

**Não implementado nesta entrega** (não foi pedido, não inventar
escopo): busca full-text no conteúdo do PDF, versionamento de um
mesmo Parecer (reenviar substitui — cada upload novo é um Parecer
novo), notificação quando um Parecer novo é publicado.

**Ajuste de layout (2026-09-28)**: o Rafael reportou a tela "feia e ruim para uso" com print — o
defeito real era `.par-body` sem `max-width`: numa tela larga a busca/botão esticavam de ponta a
ponta e, com poucos Pareceres, o cartão ficava perdido num mar de vazio. Corrigido com `.par-inner`
(`max-width:960px`, centralizado); busca ganhou ícone (`Search`) e teto de 420px; ícone do cartão
trocado de vermelho (`#e2574c`, cor de conflito/alerta do resto do app, sem relação com o conteúdo)
pra dourado (`rgba(245,196,0,.16)`/`#F5C400`, mesma combinação do avatar da RENATA); linha de resumo
nova acima do grid ("N pareceres" + "M encontrados" durante busca). **Bug pré-existente achado no
mesmo teste** (não introduzido agora): nenhum input/textarea do módulo tinha `background`/`border`/
`color` themed — ficavam brancos mesmo no tema escuro (busca, título/descrição do drawer, campo de
comentário, formulário de upload). Corrigido replicando o padrão já usado no resto do app
(`background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1)` + foco dourado).
Verificado em harness local (dados simulados, mesmo Parecer do print) nos dois temas: busca, grid,
modal de upload e drawer completo (editar título, editar descrição, comentário).

**Voltar + tag de escopo (2026-09-28)**: dois pedidos do Rafael sobre a mesma tela.

- **Botão "Voltar"**: o topbar já tinha `onExit` (só ícone `X` + tooltip, condicionado a
  `availableModes.length > 1`), mas sem rótulo visível não lia como navegação — o Rafael não o
  reconheceu. Trocado por `<ArrowLeft/> Voltar` com texto, movido pra esquerda do topbar (ao lado do
  título, convenção universal de "voltar"), separado das ações da direita (tema/Sair). Mesmo bug
  existe em `src/knowledge/KnowledgeCenter.jsx` (não mexido — fora do pedido, mas fica registrado
  como possível melhoria futura).
- **Tag de escopo (Geral × Cliente específico)**: cada Parecer agora é `scope='geral'` (padrão, todos
  os clientes) ou `scope='cliente'` — nesse caso `company_name` é **sempre** preenchido (denormalizado,
  sobrevive à exclusão do projeto) e `company_project_id` é o vínculo forte **opcional**, só gravado
  quando o nome digitado bate com um projeto existente da mesma org (permite cliente que ainda nem é
  projeto no Cronograma). Colunas aditivas em `pareceres` (`server/db.js`): `scope TEXT DEFAULT
  'geral'` (sem `CHECK` — validado em JS pra não repetir o incidente de CHECK do §38), `company_name
  TEXT`, `company_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`. Endpoint novo e leve
  `GET /api/projects/lite` (`server/routes.js`, `requireAuth`) devolve só `{id, name}` por projeto —
  nunca o `/api/projects` inteiro, que é pesado (mesma preocupação documentada acima sobre não inflar
  payload). `POST/PATCH /api/pareceres` (`server/pareceres.js`) validam com `parseScope()`: 'cliente'
  sem nome → 400; `companyProjectId` que não existe na org é silenciosamente ignorado (vira `null`,
  mantém o nome); trocar de escopo precisa limpar `company_project_id` quando for pra 'geral' — feito
  com `CASE WHEN $flag THEN $valor ELSE company_project_id END` no `UPDATE` (não dá pra usar
  `COALESCE`, que trataria "não mexer" e "limpar pra null" como a mesma coisa). Frontend: `ScopePicker`
  (toggle Geral/Cliente + `<input list>` com `<datalist>` dos projetos pra sugestão/autocomplete,
  reaproveitado no upload e na edição do drawer) e `ScopeTag` (selo azul "Geral" / verde com nome do
  cliente, no cartão e no drawer); filtro novo na barra de busca (`<select>`: Todos / Geral / cada
  cliente distinto que já aparece na lista).
  **Testado**: direto contra o Postgres/API local (login real, sem mock) — criar geral, criar cliente
  com projeto vinculado, criar cliente sem projeto (nome livre), criar cliente sem nome (400), trocar
  geral→cliente, cliente→geral (confirma que `company_project_id` zera), PATCH só de título (confirma
  que não mexe no escopo), `companyProjectId` de projeto inexistente (cai pra `null`, mantém o nome).
  UI conferida em harness (dados simulados) nos dois temas: toggle, autocomplete resolvendo o id certo,
  filtro, salvar edição de escopo no drawer.

## 49. Transcrições: erro de IA em português + "tentar novamente" em lote (2026-09-18)

**Gatilho**: o Rafael subiu um lote de reuniões e a transcrição falhou com o
JSON cru da Anthropic na tela (`400 {"type":"error",...,"Your credit balance
is too low..."}`) — a conta dona da `ANTHROPIC_API_KEY` do Railway estava sem
crédito. Não era bug de código; a correção foi de UX + um bug relacionado.

- **`friendlyAiError(raw)`** (`server/meetingInbox.js`, função pura): traduz
  saldo baixo, chave inválida/revogada (401), rate limit (429), IA
  sobrecarregada (529/503) e falha de conexão pra mensagens acionáveis em
  português; qualquer outra coisa passa crua. Aplicada na GRAVAÇÃO
  (`processSubmission`, novas falhas) e na LEITURA (`GET /`, pra falhas antigas
  já gravadas cruas no banco — não precisou migrar dado). O erro cru continua
  em `console.error` no servidor.
- **`POST /api/meeting-inbox/retry-failed`** `{projectId}`: marca todas as
  `failed` da empresa como `pending` e processa **uma por vez, em sequência**
  (em paralelo estouraria o rate limit justamente num lote grande). Mesmo
  controle de acesso da rota unitária (`canAccessProject`). Botão "Tentar
  novamente todas (N)" em `Meetings.jsx`, só aparece com 2+ falhas.
- **Bug achado no caminho** (já existia no "tentar novamente" unitário): o
  recupero de órfãs (`GET /`, §44) e o aviso "demorando" da tela mediam desde
  `created_at`. Uma transcrição antiga reenviada virava `failed` de novo no
  primeiro poll. Agora `processSubmission` grava `processed_at=now()` ao entrar
  em `processing` (= "início desta tentativa") e ambos medem a partir dele
  (`COALESCE(processed_at, created_at)`).

**Testado local** (chave inválida forçada, API real da Anthropic respondeu
401): mensagem traduzida na gravação; erro de crédito cru inserido à mão no
banco lido já traduzido; lote de 3 → `pending/processing/pending` e depois todas
processadas em sequência; sem `projectId` → 400, sem sessão → 401; recupero:
criada há 2h com tentativa iniciada agora continua `processing`, tentativa
iniciada há 6min vira `failed`. **Não verificado visualmente**: o botão de lote
na tela (sessão do navegador de teste expirou; não digitei a senha no login) —
só build limpo e leitura do código.

**Limitação conhecida**: um item `pending` que estava esperando na fila do lote
quando o servidor reinicia fica órfão (o recupero só cobre `processing`) e a
tela não oferece retry pra `pending`.

## 50. RENATA na tela inicial: agenda de hoje/semana ou convite pra conectar (2026-09-20)

> Ordem atual da tela inicial (§73, §77): Olá → **Mensagem do dia** → RENATA (agenda e quadro) → "Onde você quer trabalhar agora?" → módulos.

**Pedido do Rafael**: ao logar, quem já conectou a agenda vê na hora as
reuniões do dia e da semana (olhando sempre o dia e horário atuais); quem
não conectou recebe da RENATA um "Olá, fulano, vamos conectar sua agenda?" com
o botão à mão.

- **`src/agenda/RenataAgendaBriefing.jsx`** (novo), montado em
  `WorkspaceGateScreen` (`App.jsx`, a tela "Olá, Nome" logo após o login) acima
  dos cartões de workspace. **Não chama IA** — lê `GET /api/agenda` (a mesma
  da tela Agenda: Google + TASKs do XFlow + atividades do usuário) e monta o
  texto localmente; custo em tokens zero. Decisão deliberada, logo depois da
  conversa sobre custo da RENATA (§ chat de 18/09).
- **Conectado**: saudação por hora (Bom dia/Boa tarde/Boa noite), resumo
  ("Agora: X (até 12:35)" / "Próximo: Y às 14:00"), lista de hoje (passado
  riscado, em andamento com selo "Agora", cancelados ocultos, dia inteiro no
  fim) e o resto da semana agrupado por dia (rolagem interna de 300px pra não
  empurrar os cartões pra fora da tela). "Agora" vem do relógio do navegador,
  reavaliado a cada 30s; a agenda é recarregada a cada 5min.
- **Sáb/dom**: não existe "resto da semana", então mostra a semana que vem
  (seg→dom). Dia útil: de amanhã até domingo.
- **Não conectado**: convite com botão "Conectar minha agenda"
  (`/api/google/oauth/start`, mesmo fluxo do Meu Perfil e da Agenda) e
  "Agora não", que dispensa até fechar a aba (`sessionStorage`). Se o servidor
  não tem Google configurado (`/api/google/status` → `configured:false`) o
  painel some — não convida a conectar algo impossível.
- **Erro** ao ler a agenda (ex.: token revogado): mensagem + "Tentar de novo"
  e "Reconectar".
- Detalhe de data que já existia e foi respeitado: Google devolve o fim de
  evento de dia inteiro como EXCLUSIVO (21→23 ocupa 21 e 22); atividade
  PRICETAX/TASK do XFlow tem fim inclusivo.

**Testado**: lógica pura (janela da semana p/ seg-dom, dia inteiro exclusivo/
inclusivo, evento que termina 00:00 não invade o dia seguinte, ordenação) com
19 asserções; renderização dos 5 estados (conectado, desconectado, sem Google
configurado, erro, agenda vazia) numa página descartável com respostas
simuladas de `/api/agenda`, incluindo dispensar o convite. **Não verificado**:
login real + conta Google real (sem sessão/credencial no ambiente de teste;
não digitei senha) e o dia útil (só o domingo estava disponível na data do
teste, o caso de dia útil é coberto pelos testes unitários da janela).

## 51. Renomear coluna do Quadro travava e mostrava "fantasma" (2026-09-20)

**Bug relatado pelo Rafael**: no Quadro de Gestão de Atividades, ao editar o
nome da coluna "AteSegunda" pra "Até Segunda" (acento + espaço), aparecia um
cartão-fantasma da coluna e o texto travava.

**Causa real**: em `PersonalColumn` (`App.jsx`) o cabeçalho inteiro recebe
`{...attributes, ...listeners}` do `useSortable` (é a alça de arrastar da
coluna) e o `<input>` do nome está DENTRO dele. O `KeyboardSensor` do dnd-kit
ativa o arrastar com **Espaço/Enter** e, como não há `setActivatorNodeRef`,
não confere se a tecla veio do próprio cabeçalho — então o espaço digitado no
campo bloqueava a digitação (`preventDefault`) e iniciava um arrasto por
teclado; o `DragOverlay` de coluna é o "fantasma" do print. O `PointerSensor`
tem o mesmo problema: selecionar texto com o mouse (mover >4px) arrastava a
coluna.

**Correção**: `onKeyDown`/`onPointerDown` com `stopPropagation` no campo, e
`onKeyDown` no wrapper do botão "..." (Enter/Espaço no botão também iniciava o
arrasto em vez de clicar). Aproveitado pra trocar o `onChange` direto do campo
por `useDebouncedField` (o mesmo padrão de digitação por tecla do §45-47, que a
auditoria daquela vez não pegou por ser um input no Quadro Pessoal).

**Verificado**: reproduzi o mecanismo numa página descartável com o mesmo
dnd-kit e os mesmos sensores — Espaço (evento com `code:'Space'`) no campo
atual: `defaultPrevented=true` + `dragstart`; mouse: `dragstart` ao mover 30px
com o botão pressionado. Com `stopPropagation`: nenhum dos dois. **Não
verificado no componente real** (sem login no ambiente de teste; não digitei
senha) — só o build limpo e a leitura do código.

**Ainda sujeitos à mesma classe** (botão/controle DENTRO de área com
`listeners`, Enter/Espaço no teclado inicia arrasto em vez de clicar): os
botões dos cartões do Quadro Pessoal (`PersonalCard`, `listeners` no cartão
inteiro). Não é o caso relatado (não há campo de texto ali) e não foi mexido.

## 52. Fixar o quadro compartilhado de outra pessoa como aba (2026-09-20)

**Pedido do Rafael**: recebeu o link público de um quadro do Felipe
(`/quadro/:token`), gostou e quer que fique **fixo** como aba no próprio
Gestão de Atividades (estando logado), em vez de depender do link.

- **Não copia nada**: o quadro do Felipe continua sendo do Felipe. A aba guarda
  só `{token, name, ownerName, addedAt}` em `personal_boards.data.linkedBoards`
  do usuário; o conteúdo é sempre lido do dono pelo mesmo link público.
  Consequência: se o dono deixar de compartilhar (`visibility` ≠ public) ou
  regenerar o link, a aba mostra "não está mais compartilhado" com
  "Remover da minha lista". Remover só tira da lista — nunca apaga o quadro dele.
- **Servidor** (`server/routes.js`): `POST /api/personal-board/linked {token}`
  (exige `personalAccess`; 404 se privado/inexistente, 400 se for o próprio
  quadro, idempotente se já fixado) via `addLinkedBoard()` exportada;
  `GET /api/public-board/:token` passou a devolver `isOwner` e `alreadyLinked`.
- **Página do link** (`PublicBoardScreen`, `App.jsx`): logado, não-dono e com
  acesso à Gestão → botão **"Adicionar ao meu quadro"** (ou "Abrir no meu
  quadro" se já fixado). Ao adicionar, deixa `sessionStorage['pb-open-linked']`
  e volta pra `/`; o App abre a Gestão de Atividades direto e
  `PersonalBoardScreen` abre a aba (e apaga o marcador).
- **Aba** (`PersonalBoardScreen`): aba com ícone de link, "Nome · Primeiro nome
  do dono", X = remover da lista; renderiza `PublicBoardScreen embedded`
  (sem topbar/abas próprias, com faixa "Quadro de X" e o estado de salvamento).
  Recarrega o quadro a cada 45s se não houver edição pendente/em voo. O nome em
  cache da aba se atualiza quando o dono renomeia.
- **Edição**: quem tem acesso edita o quadro do dono (PATCH `/api/public-board`,
  o mesmo mecanismo que o link já dava a qualquer logado); o histórico do dono
  registra o nome de quem mexeu. **Quadro/Lista e ordenação ficam locais**
  (`localViewPrefs`) e nunca vão no PATCH — antes, trocar a visão num quadro
  compartilhado mudava a tela do dono; agora isso vale também na página pública.
- **Limitação conhecida (já existia no link público)**: o PATCH substitui o
  quadro inteiro; se o dono e outra pessoa editarem ao mesmo tempo, vale a
  última gravação. O recarregamento de 45s reduz a janela, não elimina.

**Testado**: lógica do servidor direto no banco local (9 casos: adiciona,
idempotência, privado/inexistente/próprio, preserva campos existentes, entrada
sobrevive se o dono privar); tela com o `App` real e a API simulada (login
simulado, sem senha): aba abre sozinha após adicionar, edição chega ao dono com
o log em nome de quem editou e sem alterar as `viewPrefs` dele, Lista fica
local, trocar de aba, "não compartilhado" + remover (sem tocar no quadro do
dono), botão na página pública nos 3 casos (novo, já fixado, dono). **Não
verificado**: contra o servidor/login reais.

## 53. Aba ativa do Quadro não era evidente (2026-09-20)

**Relato do Rafael** (print do Quadro com PRICETAX / Pessoal / aba do Felipe):
"não está evidente e claro qual dos quadros estou usando".

**Causa**: `S.personalTab` (inativa) e `S.personalTabActive` tinham quase o mesmo
fundo (`--bg-2` vs `--bg-1`, ambos brancos no tema claro) — a única marca era um
fio amarelo de 1px no topo. Além disso, o estilo misturava o atalho `border`
com `borderBottomColor`, o que gerava o aviso do React "Removing borderBottomColor
border" e deixava resíduo de estilo ao trocar de aba.

**Correção** (`S.personalTab*` em `App.jsx`, só propriedades longhand): a
inativa fica "afundada" (sem fundo, sem borda, texto `--text-5`); a ativa "sobe"
(fundo de cartão, borda, texto `--text-1` em negrito, **barra amarela de 3px** no
topo). O nome da aba herda cor/peso da aba (`color: inherit`). Vale pras abas
próprias, pra aba de quadro compartilhado (§52) e pra aba única da página
pública. Conferido nos dois temas com a paleta real do `index.html`.

## 54. CRM PRICETAX — Fase 1: Fundação + Empresas/Contatos/Ficha 360 (2026-09-20)

**Pedido do Rafael**: nova aba de workspace "CRM" (PRD de 76 itens, dividido em
6 fases). Regra dura: **somente agregar, nada do que já funciona é
substituído**. A EMPRESA é o centro; Lead vira cliente e cliente de outro
projeto pode virar Lead de upsell (o "status de relacionamento" é separado do
Lead — Lead é o 1º estágio de um Negócio, que chega na Fase 2).

### Plano de fases (acordado)
F1 Fundação (esta) · F2 Negócios+Pipeline+Produtos (+ "Criar oportunidade de
upsell", mesmo Kanban) · F3 Atividades/Agenda/Reuniões/Notificações ·
F4 Inteligência (KPIs, saúde, lead score/ICP, forecast, metas, perdas) ·
F5 Propostas/Contratos/Renovações/Upsell + automações · F6 IA/integrações/
relatórios/permissões finas.

### O que a Fase 1 entrega
Aba **CRM** no seletor de workspace (`WorkspaceGateScreen`, ícone Briefcase,
`mode==='crm'`, lazy) com 3 submenus: **Visão geral** (6 KPIs), **Empresas**
(lista, filtros, busca, criar/editar/excluir/restaurar, importar, bootstrap) e
**Contatos**; **Ficha 360** em drawer (Visão geral com completude, Contatos
com mapa de stakeholders, Histórico = notas + linha do tempo, Projetos
vinculados, Auditoria só pra quem tem `remove`); **busca global**; **importação
xlsx/csv** com mapeamento automático e prévia; **bootstrap** dos clientes que
já estão no painel.

### Banco (`server/db.js`, final de `initDb()`, tudo aditivo)
`users.crm_role`; tabelas relacionais `crm_companies`, `crm_company_projects`,
`crm_contacts`, `crm_notes`, `crm_timeline_events`, `crm_audit_logs` — todas com
`org_id`, UUID (`crypto.randomUUID()`), soft delete (`deleted_at/by`) e
created/updated by/at. `crm_companies`: índice único parcial `(org_id, cnpj)
WHERE cnpj<>'' AND deleted_at IS NULL`. `crm_company_projects.project_id` é
UNIQUE (um projeto pertence a uma empresa CRM; uma empresa CRM pode ter vários
projetos). **`crm_timeline_events` e `crm_audit_logs` são append-only por
trigger Postgres** (`crm_block_history_mutation` bloqueia UPDATE/DELETE) —
limpeza de teste exige `ALTER TABLE ... DISABLE TRIGGER USER` e religar.

### Regras (server/crm/)
- **Camada de serviço** (`service.js`): toda escrita = dado + auditoria campo a
  campo + evento de timeline **na mesma transação**. Rotas nunca escrevem direto.
- **Permissões** (`permissions.js`): `users.crm_role` ∈ admin/diretor/gestor/
  vendedor/consultor/financeiro/visualizacao. master e super admin = admin
  automático; role `cliente` nunca acessa; demais precisam de `crm_role`.
  Capacidades read/write/remove/import/admin. **Vendedor edita, não remove nem
  importa.** `rowToUser` devolve `crmRole` e `crmAccess`; atribuição em
  Usuários → "Acesso ao CRM" (`PATCH /users/:id` aceita `crmRole`).
- **Duplicidade** (`duplicates.js`): CNPJ igual = bloqueio (409 sem `force`);
  nome ≥85% similar (JS sobre as empresas da org, sem pg_trgm), e-mail ou
  telefone (últimos 9 dígitos) de contato = aviso (409 com confirmação
  "Salvar mesmo assim" → `force`). CNPJ validado por dígito verificador.
- **Vínculo empresa↔projeto**: vincular promove prospect/ex-cliente → cliente e
  preenche `clientSince`. O CRM **só LÊ** `projects.data` (verificado: hash da
  tabela `projects` idêntico antes/depois do bootstrap).
- **Última interação** (F1) = maior data entre nota e reunião passada dos
  projetos vinculados. **Completude** = 8 itens de peso igual (CNPJ, segmento,
  regime, ERP, decisor, contato principal, faturamento, interação). 1º contato
  vira principal automaticamente.
- **Importação**: arquivo lido no navegador (xlsx.mini em chunk lazy), linhas
  mapeadas vão pra `/import/preview` e `/import/commit` (servidor reclassifica;
  máx. 2000 linhas). **Bootstrap** (`bootstrap.js`) agrupa projetos existentes
  por CNPJ, revisável antes de gravar, contatos opcionais vindos de `areas`.
- `createCrmRouter({ auth })` recebe a autenticação por injeção (testes com
  auth falsa, sem forjar sessão).

### Frontend (`src/crm/`, carregado com `React.lazy`)
`CrmScreen` (default export), `CompaniesPage`, `ContactsPage`, `OverviewPage`,
`CompanyDrawer`, `CompanyForm`, `ContactForm`, `ImportWizard`,
`BootstrapDialog`, `GlobalSearch`, `ui.jsx`, `crmMeta.js` (rótulos + bloco CSS
`.crm-*`), `crmApi.js`. Formulários com estado local e "Salvar" explícito;
modais renderizados fora do overlay do drawer. Bundle principal praticamente
igual ao pré-CRM (1.519 KB vs 1.516 KB); CRM = chunk de 76 KB + xlsx.mini
(231 KB) só ao clicar/importar. `lib/api.js` agora anexa `err.data` (corpo
completo do erro — necessário pra ler a lista de duplicados).

### Decisões que eu tomei (Rafael só disse "Começa")
Submenu chama-se "Empresas"; clientes já existentes no painel entram como
"Cliente" via bootstrap revisável; modelo de pipeline único (preparado pra
vários) na F2.

### Verificação e LIMITES (honesto)
Testado: serviço (99 asserções), HTTP com auth falsa por papel (44: 401/403/
409/400/404, matriz de papéis, isolamento por org), triggers append-only, UI
completa em harness com login/fetch simulados (lista, ficha 360, mapa de
stakeholders, nota→timeline, bloqueio de CNPJ duplicado, aviso de nome
parecido, import xlsx, bootstrap, visibilidade por papel, cartão do CRM
aparece/some e chunk só carrega ao clicar). **NÃO testado**: login real / banco
de produção, o select "Acesso ao CRM" no EditUserModal (só compila),
layout mobile e tema escuro do CRM.

### Pendências / próximas fases
F2 (Negócios/Pipeline/Produtos/upsell) feita em 2026-09-20 — ver §55. Descoberta lateral não
mexida: navTags 'knowledge'/'pareceres' caem em 'company' no `locationTag`.

## 55. CRM PRICETAX — Fase 2: Negócios, Pipeline e Produtos (2026-09-20)

**Pedido do Rafael** (na mesma conversa da Fase 1): um Lead pode virar cliente
e um cliente de outro projeto pode virar Lead de upsell; mesmo Kanban pros dois.
Continua valendo a regra "só agregar" — nada da Fase 1 nem do painel foi
substituído.

### Modelo
- **Negócio pertence sempre a uma empresa** (`crm_deals.company_id`). **Lead = a
  1ª etapa do negócio**, não um estado da empresa; `relationship` da empresa
  segue sendo só a relação com a PRICETAX. Uma empresa pode ter vários negócios.
- **Upsell = `deal_type='upsell'`**, só criável em empresa que já é **cliente**
  (regra checada na criação e ao mudar o tipo; upsell já existente continua
  editável se a empresa deixar de ser cliente depois — bug pego em teste).
- **Ganhar promove** prospect/ex-cliente → **cliente** (com `client_since`=hoje),
  gravando auditoria + timeline `relationship_changed` com `automatic:true`. Parceiro
  não é promovido. Perder não mexe na empresa. Reabrir (voltar a etapa aberta) limpa
  motivo e `closed_at`.
- **Pipeline**: um funil padrão por org, criado sob demanda por
  `ensureDefaultPipeline` (índice único parcial garante 1 mesmo com chamadas
  simultâneas — testado com 5 em paralelo). Etapas: Lead 10% · Qualificação 20% ·
  Diagnóstico 35% · Proposta 55% · Negociação 75% · Ganho (won) · Perdido (lost).
  `pipeline_id` já está em todo negócio, então vários funis não exigem migração.
- **Valor/probabilidade**: com produtos, `value` = Σ(qtd × preço) calculado no
  servidor (o campo manual é ignorado); sem produtos vale o manual. Probabilidade
  efetiva = manual ?? da etapa; ganho=100, perdido=0. Ponderado = valor × prob.
- **Produtos** (`crm_products`): catálogo com preço de tabela e cobrança
  (pontual/recorrente). Item do negócio guarda **retrato do nome e do preço** —
  produto excluído/alterado depois não muda negócio antigo. Produto inativo some
  da escolha mas segue nos negócios que já o usam.
- **Motivo de perda obrigatório** (9 motivos fixos em `pipeline.js`; "Outro"
  exige descrição) — base da análise de perdas da Fase 4.
- **Histórico de etapas** (`crm_deal_stage_history`): 1 linha por movimento, com
  dias na etapa anterior; **append-only por trigger** como timeline/auditoria.
  É a matéria-prima de aging e conversão por etapa (Fase 4).

### Banco (`server/db.js`, aditivo, após os triggers da Fase 1)
`crm_products`, `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`,
`crm_deal_items`, `crm_deal_stage_history`. Nenhuma tabela existente alterada.
Notas (`crm_notes`) passaram a aceitar `entity_type='deal'`.

### Backend (`server/crm/`)
`pipeline.js` (constantes + funil padrão) · `deals.js` (createDeal/updateDeal/
moveDeal/deleteDeal — mesma regra de transação única: dado + auditoria +
timeline + histórico de etapa) · `dealQueries.js` (listDeals, getBoard,
getDealDetail, dealsForCompany, dealsOverview, searchDeals) · `products.js`.
`service.js` só ganhou `export` em utilitários internos + tipo `longtext` + nota
de negócio. `queries.js` passou a devolver `deals` na ficha da empresa, no
`overview`, na `search` e produtos/motivos em `options`.
Rotas novas: `GET /pipeline`, `/board`, `/deals`, `/deals/:id`, `/deals/:id/audit`;
`POST /deals`, `/deals/:id/move`; `PATCH/DELETE /deals/:id`; `/products` CRUD.

### Permissões
Negócio: **write** cria/edita/move/ganha/perde (vendedor incluso); **remove**
(gestor+) exclui, vê auditoria e **é o único que edita negócio já fechado**
(vendedor recebe 403). Catálogo: nova capacidade **`catalog`** (admin/diretor/
gestor); todos leem, só `catalog` vê inativos e escreve. `crmCapabilities` agora
devolve `catalog`.

### Frontend (`src/crm/`, ainda tudo no chunk lazy `CrmScreen`)
`DealsPage` (quadro Kanban + lista; filtros tipo/responsável/busca; visão
lembrada em localStorage), `DealDrawer` (Resumo/Histórico/Auditoria; select de
etapa cobre teclado e celular), `DealForm` (produtos com soma ao vivo, contato,
previsão, prob. manual), `CloseDealDialog` (ganho avisa da promoção da empresa;
perda pede motivo), `ProductsPage`. Integrações: Ficha 360 ganhou aba **Negócios**,
botões **"Criar oportunidade de upsell"** (só cliente) e **"Negócio"**, e nota
"sobre o negócio X"; Visão geral ganhou o bloco **Funil comercial** (aberto,
ponderado, upsell, ganho no mês, conversão 90 dias, vencidos/parados + 2 listas);
busca global acha negócios; nav ganhou Negócios e Produtos. Cartão do Kanban é
`div` (Firefox não arrasta `<button>`).

### Verificação
Serviço: 105 asserções (regras, promoção, motivo de perda, reabrir, itens/soma,
isolamento entre orgs, concorrência do pipeline, soft delete, triggers). Rotas
com auth falsa por papel: 53. UI no app real (login/fetch simulados): arrastar
entre etapas, soltar em Perdido abre diálogo com confirmar travado, "Outro" exige
descrição, ganhar promove empresa e libera o botão de upsell, criação de upsell
com soma de produtos, lista/filtros/busca, KPIs conferidos à mão, matriz
visualização/vendedor/gestor, tema claro e escuro, largura estreita.

### Limites conhecidos (honestos)
- **Não testado com login real nem no banco de produção** (mesma ressalva da F1).
- Arrastar é HTML5 nativo: **não funciona em toque/celular** (usa o select de
  etapa na ficha). Sem reordenar cartões dentro da coluna (só mover entre etapas).
- **Etapas e probabilidades são fixas** (sem tela para editar funil); um só
  funil na prática. Sem restaurar negócio excluído pela UI (é soft delete, dá
  pra restaurar no banco).
- `fmtMoney` arredonda pra reais na tela (9.500,50 aparece R$ 9.501); o dado
  guarda os centavos.
- Sem forecast por período, metas, propostas, contratos — Fases 4/5.

## 56. CRM PRICETAX — Fase 3: Atividades, Agenda e lembretes (2026-09-20)

**Pedido**: "Faça" à Fase 3 (Atividades/Agenda/Notificações), com a minha recomendação
aceita implicitamente: as atividades do CRM entram nas **Notificações e na Agenda que
já existem**, de forma aditiva. O CRM ganhou o "próximo passo" — antes só registrava
o passado.

### Modelo
- **`crm_activities`** (relacional, UUID, soft delete, created/updated by/at): sempre presa a
  uma **empresa**; **negócio** e **contato** opcionais e obrigatoriamente DA MESMA empresa
  (validado na criação e na edição). Tipos: tarefa, ligação, e-mail, reunião, WhatsApp,
  visita, follow-up. Data obrigatória, horário opcional, prioridade, responsável (padrão =
  quem criou), situação open/done/cancelled, resultado (`outcome`) ao concluir.
- **Última interação** (Fase 1 só contava nota + reunião do projeto) agora inclui atividade
  **concluída** de tipo ligação/e-mail/reunião/WhatsApp/visita. **Tarefa e follow-up NÃO
  contam** (são trabalho interno, não contato com o cliente).
- **"Sem próximo passo"** = negócio em aberto sem nenhuma atividade em aberto. Aparece como
  etiqueta no cartão/lista, alerta na ficha do negócio (com "Agendar agora") e contador +
  lista na Visão geral. Concluir uma atividade de negócio oferece "Agendar o próximo passo
  agora" (marcado por padrão) e abre o formulário já preenchido (follow-up, mesmo negócio).
- **Registrar interação já realizada**: criar direto como concluída, com data ≤ hoje e resultado
  (cobre "liguei ontem"). É o "pós-reunião" da Fase 3; IA da reunião e pré-reunião ficam
  para a Fase 6.
- Editar só atividade **em aberto** (concluída/cancelada: reabrir antes). Cancelar/reabrir
  guardados em auditoria + timeline. Excluir (soft) exige `remove` (gestor+).

### Notificações (Central existente, sem mexer no servidor delas)
- **`crm_activity_assigned`**: ao atribuir/reatribuir a OUTRA pessoa (na mesma transação).
  Atribuir a si mesmo não notifica.
- **`crm_activity_due`**: lembrete do agendador (abaixo): "para hoje" ou "atrasada".
- `target = {kind:'crm_activity', companyId, dealId, activityId}`. Em `App.jsx`,
  `goToNotificationTarget` ganhou o ramo `crm_activity`: marca como lida (rota genérica
  `mark-read-for-target` já existente), guarda `pendingCrmOpen` e vai ao workspace CRM, que
  abre o negócio (se houver) ou a aba Atividades da empresa. Funciona vindo de outro workspace
  (testado a partir da Agenda). O CRM passou a ter o sino de notificações no topo.

### Agendador (o primeiro do servidor)
`server/crm/scheduler.js`, iniciado em `server/index.js` após o `listen`: a cada **10 min**
avisa o responsável de cada atividade aberta com data ≤ hoje ainda não avisada. O carimbo
`due_notified_at` é gravado NA MESMA instrução que escolhe a atividade (`UPDATE ... RETURNING`),
então **duas execuções simultâneas avisam uma vez só** (testado) — vale também para várias
instâncias. Regras: **não avisa antes das 7h de Brasília**; pula responsável bloqueado ou
`cliente`, atividade cancelada/concluída/futura e empresa excluída. Atividade criada já
vencida/de hoje nasce como "avisada" (quem criou sabe); mudar a data para o futuro libera novo
lembrete; reabrir uma vencida não gera lembrete duplicado.

### Agenda existente
`server/agenda.js` chama `crmAgendaEvents` (`server/crm/agendaFeed.js`), em `try/catch`
isolado — se o CRM falhar, a Agenda fica igual à de antes. Só as atividades **em aberto do
próprio usuário** e só se ele tem acesso ao CRM. Com horário viram evento de 30 min
(`-03:00`, sem horário de verão desde 2019); sem horário, dia inteiro. `Agenda.jsx` e
`RenataAgendaBriefing.jsx` ganharam a fonte `crm_activity` (rótulo/cor).

### Backend (`server/crm/`)
`activities.js` (create/update/complete/cancel/reopen/delete) · `activityQueries.js`
(`listActivities` com contadores por faixa, `activitiesForCompany/Deal`, `activitiesOverview`) ·
`scheduler.js` · `agendaFeed.js`. Toques: `db.js` (tabela + índices, aditivo), `service.js`
(tipo `time` no sanitizador), `deals.js` (`openActivities`, `nextActivityDate`, `noNextStep`),
`queries.js` (última interação, `activities` na ficha e no `overview(orgId, userId)`),
`dealQueries.js` (`activities` no detalhe), `routes.js`.
Rotas: `GET/POST /activities`, `PATCH/DELETE /activities/:id`, `POST /activities/:id/complete|cancel|reopen`;
`ownerId=me` vira o usuário logado. Permissões: **write** cria/edita/conclui/cancela/reabre
(vendedor incluso); **remove** exclui.

### Frontend (`src/crm/`)
`AgendaPage` (novo item **Agenda**: contadores clicáveis Atrasadas/Hoje/7 dias/Mais adiante/
Concluídas; filtros responsável ("Minhas" por padrão)/tipo/situação/busca), `ActivityList`
(lista reutilizável; agrupa por faixa numa única instância pra os diálogos não sumirem quando
uma faixa esvazia), `ActivityForm`, botão "+ Atividade" no topo, aba **Atividades** na Ficha 360,
"Próximos passos" na ficha do negócio, bloco "Próximos passos" na Visão geral.

### Verificação
Serviço: 89 asserções (regras, vínculos da mesma empresa, notificações, última interação por
tipo, faixas, filtros, agendador com concorrência/idempotência/horário, feed da Agenda,
isolamento entre orgs, soft delete). Rotas por papel: 28. UI no app real (login/fetch
simulados): Visão geral, Agenda, concluir com e sem negócio, próximo passo pré-preenchido,
alerta "sem próximo passo" e "Agendar agora", clique em notificação (com e sem negócio, e vindo de
outra área), papéis visualização/vendedor, tema claro. **As suítes da Fase 2 não foram
reexecutadas** (foram descartadas ao fim da Fase 2); a regressão foi coberta pela suíte nova
(que exercita negócios, quadro e visão geral) e pela UI.

### Limites conhecidos (honestos)
- **Não testado com login real nem em produção.** O agendador em produção só será visto de fato
  quando houver atividades reais vencendo.
- Sem repetição/recorrência de atividade, sem convite por e-mail, sem sincronizar com Google
  Calendar (só aparece na Agenda interna). Sem "pré-reunião" nem IA da reunião (Fase 6).
- Lembrete só em "hoje/atrasada"; sem aviso antecipado (ex.: 1 dia antes) e sem reenvio diário
  de atrasadas — avisa uma vez por atividade.
- Vendedor edita/conclui atividade de qualquer pessoa (mesma regra aberta de empresas/negócios).
- Agenda do CRM mostra até 300 atividades por consulta.

## 57. CRM PRICETAX — Dados de contato/endereço da empresa + importação do PipeRun (2026-09-20)

**Contexto**: o Rafael exportou do PipeRun (CRM que a PRICETAX usava) oportunidades, empresas,
pessoas, atividades e chamadas para alimentar o CRM. Plano em 3 passos, todos aprovados
("sim para tudo"): (1) ampliar campos de empresa + importar as 142 empresas; (2) vários funis +
importador de negócios; (3) atividades, quando ele reexportar (atividades/pessoas/chamadas vieram
**só com o cabeçalho, 0 linhas**). Este item é o **passo 1**.

### O que os arquivos revelaram (perfil dos dados)
- **Empresas (142)**: 117 CNPJs, todos com dígito verificador válido, nenhum repetido; traz razão
  social, CNAE principal/secundários, endereço completo, telefones, fundação, capital social e
  "Cliente desde" (12). As 109 empresas com CNPJ que aparecem nas oportunidades estão todas aqui.
- **12 linhas com o nome "Nome não informado"** (sem CNPJ/UF/telefone): registros-fantasma do
  PipeRun. A linha 18 é um "cliente" (Cliente desde 17/08/26) sem identificação nenhuma. **São
  recusadas** (ver abaixo) → 130 empresas válidas, **11 clientes**.
- **Oportunidades (274)**: idênticas ao 1º export; sem motivo de perda; só 155 de 305 (somando o
  arquivo de congeladas/lixeira) têm empresa. → Passo 2.
- Datas chegam como texto com **ano de 2 dígitos** ("17/08/26", "05/03/91"); telefones com DDI 55
  colado e às vezes dois números ("559189195382, 5591989195382"); CEP como número (perde o zero).

### Banco (`server/db.js`, aditivo — só `ADD COLUMN IF NOT EXISTS`, padrão vazio)
`crm_companies`: `phone`, `contact_email`, `zip_code`, `street`, `street_number`, `complement`,
`district`, `founded_at` (DATE), `share_capital` (NUMERIC 16,2), `cnae_secondary`. Autorizado pelo
Rafael (o `CLAUDE.md` marca `db.js` como sensível). Nada existente foi alterado.

### Backend (`server/crm/`)
- `service.js`: 10 campos novos em `COMPANY_SPEC`/`COMPANY_SELECT` (auditoria e timeline por campo
  já cobrem); tipo `zip` no sanitizador (8 dígitos, senão 400).
- `text.js`: normalizadores de planilha — `parseDateBR` (ISO, dd/mm/aaaa e dd/mm/aa; **ano de 2
  dígitos = século que não cai no futuro**: 26→2026, 91→1991), `formatPhonesBR` (tira o 55, formata
  `(31) 2519-0606`, vários números viram `a / b`, sem repetir), `normalizeZip` (repõe o zero),
  `splitCnae` (código × descrição), `firstEmail`.
- `importer.js`: campos novos + **"Cliente desde" preenchido e relação não informada = cliente, com a
  data original** (antes seria "hoje"); CNAE vira código e, se o segmento estiver vazio, a descrição
  vira o segmento; campos de apoio (data, CEP, e-mail, telefone) com valor ruim **viram aviso e o campo
  é ignorado — não derrubam a linha**. **Nomes-coringa** ("Nome não informado", "sem nome", "n/a"…) não
  criam empresa: a linha é recusada na prévia com o motivo; se a linha tem outro nome válido, usa-o.
- `cnpjSuggestion.js`: o cadastro rápido por CNPJ (Receita) agora também traz telefone, CEP,
  endereço, fundação e capital.

### Frontend (`src/crm/`)
`importMapping.js` (novo, puro): reconhecimento automático das colunas extraído do assistente para
ser testável com o arquivo real; sinônimos do PipeRun ("Endereço - CEP", "Cliente desde",
"Telefones"…). **Correção de risco**: o "contém" agora só vale para cabeçalho curto (≤5 palavras) e por
palavra inteira — antes "Relação" era ligada a uma pergunta longa que só continha "relação".
`CompanyForm` (grupos Contato e endereço, fundação, capital, CNAEs secundários; a busca por CNPJ
preenche os novos), `CompanyDrawer` (bloco "Contato e endereço", fundação, capital, CNAEs
secundários), `crmMeta.fmtCep`.

### Verificação
Arquivo REAL de empresas pelo mesmo caminho do assistente (leitura `raw:false`, reconhecimento de
colunas, prévia, gravação) num banco local descartável: 67 asserções — 18 colunas reconhecidas certo,
130 novas + 12 recusadas, 11 clientes com data original, telefones/CEP/CNAE/fundação/capital
convertidos, responsável casado por e-mail, auditoria+timeline por empresa, **reimportar o mesmo
arquivo não cria nada**, edição manual dos campos novos, formulário com campos vazios. UI (ambiente
simulado): ficha com o bloco novo, assistente lendo o arquivo real até a tela de conferência.

### Limites / a fazer
- **A importação em produção é feita pelo Rafael** (Empresas → Importar planilha → arquivo de empresas
  → conferir a prévia). Nada foi gravado em produção pela IA.
- As 12 linhas sem nome (incl. o cliente da linha 18) precisam ser corrigidas no PipeRun.
- Origem e Porte não vêm no export de empresas (ficam em branco). "Forma de Tributação" e as
  perguntas de porte/faturamento/funcionários vieram vazias.
- Passo 2 (vários funis + importador de negócios) feito em §58. Passo 3 (atividades) aguarda reexport.

## 58. CRM PRICETAX — Vários funis + importador de negócios do PipeRun (2026-09-20)

**Passo 2 do plano de migração do PipeRun** (§57). Aprovado ("sim para tudo", "ok, faça"): manter os 6
funis separados; negócio sem empresa fica de fora e volta em lista; Lixeira descartada; Congelada entra
como "em aberto, parada".

### Vários funis (`server/crm/funnels.js`, `pipeline.js`)
- Antes: 1 funil fixo por org. Agora: **N funis** por org, com **etapas editáveis**. `crm_deals.pipeline_id`
  já existia — nada de migração de dado. Um funil é o **padrão** (recebe negócio novo e abre primeiro);
  índice único parcial garante 1 padrão por org.
- Regras: cada funil tem ≥1 etapa aberta + **Ganho** e **Perdido** (sempre no fim, fixos, nomes
  reservados); **etapa com negócio não pode ser removida** (409); etapa removida é **arquivada**
  (`deleted_at`), nunca apagada — `crm_deal_stage_history` aponta pra ela; funil com negócios não
  arquiva (409) e o padrão não arquiva (409). Nome de funil/etapa único. Tudo auditado (`entity_type='pipeline'`).
- Etapas de funil criado pela importação: ordem **estimada** por uma lista de nomes conhecidos (o export
  não traz a ordem) e probabilidade espalhada de 10% a 80%; o Rafael reordena na tela.
- Permissão nova **`funnel`** (admin/diretor/gestor); todos leem. `crmCapabilities` devolve `funnel`.
- Rotas: `GET/POST /pipelines`, `PATCH/DELETE /pipelines/:id`, `POST /pipelines/:id/stages`
  (POST porque `lib/api.js` não tem PUT). `board`, `deals` e `pipeline` aceitam `pipelineId`
  (funil inexistente/arquivado cai no padrão). `createDeal` aceita `pipelineId`. `options` traz `pipelines`.
- **Sem mudança de CHECK constraint**: "Congelada" não virou status novo (evita a classe de incidente do §38).
- Motivo de perda novo **"Não informado (importado)"** (`nao_informado`): só existe para perdidos
  importados; fica **fora das listas de escolha** e o `moveDeal` recusa usá-lo manualmente.

### Importador de negócios (`server/crm/dealImporter.js`)
`POST /import/deals/preview|commit` (permissão `import`, gestor+). Mesmo desenho do importador de
empresas: prévia não grava; a gravação **reclassifica** no servidor. Linha por linha:
- **Lixeira** → descartada. **Sem empresa** (sem CNPJ e sem nome, ou nome-coringa "Nome não informado") →
  fica de fora. **Empresa que não está no CRM** → fica de fora (importar as empresas antes; casa por
  CNPJ, senão por nome exato). **Já importado** (ID repetido) → ignorado. **Inválida** → situação/ID/
  título/funil/etapa ausentes.
- Situação: Aberta/Congelada → aberto (a Congelada ganha uma linha na descrição); Ganha → ganho; Perdida → perdido.
- **Datas originais preservadas**: `created_at` = data de cadastro; `closed_at` = data de fechamento (ganhos/
  perdidos); `stage_entered_at` = hoje − "Lead-Timing da etapa" (dias) — por isso o card mostra "283 dias
  parado". Ano de 2 dígitos tratado (§57). Data/valor ruim vira aviso, não derruba a linha.
- **Idempotente**: `crm_deals.external_source='piperun'` + `external_id` (=Hash) com índice único parcial
  `(org_id, external_source, external_id)`; reimportar o mesmo arquivo não cria nada.
- Funil/etapa inexistentes são **criados** (funil com etapas ordenadas; etapa nova em funil existente entra
  no fim das abertas). Ganho/perdido ficam nas etapas de fechamento; o histórico guarda a **última etapa**
  (`Contrato → Ganho`). Histórico de etapas é parcial (o export não dá o caminho todo).
- **Dono** casa por e-mail (senão por nome) com usuário da org; não encontrado → o assistente pede a
  escolha (`ownerMap`), validada contra a org (usuário de outra org é recusado → sem dono).
- **Pessoa** vira contato da empresa (dedupe por e-mail/nome) e **contato principal do negócio**;
  **Observações** viram nota do negócio; **Tags** e origem ficam na descrição/`source`.
- **Ganho promove** prospect/ex-cliente a cliente com `client_since` = **data do fechamento** (não hoje).
- Auditoria + timeline (`deal_created` com `imported:true`) por negócio.

### Frontend
`FunnelsAdmin` (botão **Funis**: criar, renomear, padrão, arquivar, reordenar/renomear/probabilidade/
adicionar/remover etapa; remover trava se houver negócio); `DealsPage` ganhou **seletor de funil**
(lembrado no navegador; na lista há "Todos os funis") e o botão **Importar negócios**;
`DealImportWizard` (arquivo → colunas → conferir [funis a criar, donos, promoções, tabela com filtro] →
resultado) com **CSV da lista dos que ficaram de fora** (`;`, BOM, cabeçalhos em português);
`DealForm` escolhe o funil; `importMapping.js` ganhou os sinônimos de negócios.

### O que o arquivo real mostrou (importante para o Rafael)
Das 305 oportunidades: **13 Lixeira, 156 sem empresa** (143 sem CNPJ/nome + 13 "Nome não informado"),
**136 importáveis** (89 abertas, 34 perdidas, 11 ganhas, 2 congeladas). Ficam de fora **13 das 24 ganhas e
36 das 70 perdidas** (sem empresa) — o histórico de receita do PipeRun fica **muito incompleto**. 75 dos
156 sem empresa têm pelo menos uma pessoa de contato (possível "empresa provisória por pessoa" —
decisão do Rafael, não implementada). As 11 ganhas importáveis são de empresas que já eram clientes
(0 promoções). Como todo negócio importado nasce sem atividade, a Visão geral lista ~134 "sem próximo passo".

### Verificação
Arquivos REAIS (empresas → 2 arquivos de oportunidades) em org descartável: 116 asserções (cada regra
contra um cálculo independente na planilha: datas, situação, fechamento, dias na etapa, valor, dono,
contato, nota, promoção, histórico, reimportação, quadro/lista por funil, mover/reabrir) + parte sintética
(ganho promove com a data do fechamento, funil/etapa novos, data/valor ruins, ID repetido, sem situação,
empresa inexistente). Rotas por papel: 26. UI (simulada): assistente com o arquivo real (19 colunas
reconhecidas, 134 novas, donos, CSV de 140 linhas), seletor de funil, "Funis" (reordenar/renomear/salvar,
remover travado com negócios). Bugs achados pelos testes e corrigidos: SQL com parâmetro não usado,
mesmo parâmetro como texto e data, "Nome não informado" tratado como empresa "não encontrada".

### Limites / a fazer
- **A importação em produção é do Rafael** (empresas primeiro, depois Negócios → Importar negócios).
- Depois de importar, o funil **padrão** ("Funil comercial") fica vazio: definir outro como padrão em
  Funis (o vazio pode então ser arquivado).
- Ordem/probabilidade das etapas dos funis criados é estimativa — revisar em Funis.
- Sem mover negócio entre funis; sem editar cor da etapa; sem restaurar funil/etapa arquivados pela tela.
- Histórico de etapas anterior à importação e motivo de perda não existem no export.
- **Passo 3 (atividades/pessoas/chamadas)** aguarda reexport com dados.

## 59. Agenda: mostrar o que foi aceito, o que está sem resposta e o que foi recusado (2026-09-20)

**Relato do Rafael** (dois prints: Google Calendar × tela inicial da RENATA): "vários compromissos eu não
aceitei" apareciam na RENATA **como se fossem compromissos**. Pediu deixar claro **aceito / não aceito /
pendente**, as **durações** e o **espaço de descanso** do dia.

### Causa
`listEvents` (`server/googleCalendar.js`) lia o evento mas **ignorava a resposta do usuário** ao convite
(`attendees[]` com `self:true` → `responseStatus`). O campo `status` que a tela usava é o do EVENTO
(confirmed/cancelled), não o do participante. Por isso convite recusado ou sem resposta valia como
reunião confirmada — na tela inicial, na Agenda e no chat da RENATA.

### Servidor
`mapGoogleEvent`/`myResponseOf` (exportados, testados): `myResponse` = `accepted | declined | tentative | needsAction`
(sua resposta), `organizer` (evento sem convidados ou criado por você) ou `unknown` (Google omitiu a lista);
mais `transparent` (evento marcado como "Livre"), `guests`, `organizer` (nome de quem convidou) e `eventType`.
Nenhum campo antigo mudou. **Sem novo escopo do Google**: `calendar.events` já devolve os convidados,
ninguém precisa reautorizar. O chat da RENATA (`assistantRetrieval.js`) agora etiqueta cada evento
(`[SEM RESPOSTA]`, `[TALVEZ]`, `[RECUSADO — não é compromisso]`), põe os recusados por último e ignora os
marcados como "Livre".

### Regras (`src/agenda/dayLoad.js`, módulo puro)
- Só **aceito** (ou seu) ocupa o seu tempo. **Sem resposta e talvez = pendente**: aparecem, mas não contam;
  o resumo mostra também quanto sobra "se aceitar tudo". **Recusado** e "Livre" não ocupam tempo. Dia inteiro
  não entra na conta de horas. TASK do XFlow, atividades e atividades do CRM são sempre "aceitas".
- **Expediente: padrão 08:00–18:00** e **almoço: padrão 12:00–13:00**, ambos **configuráveis por pessoa** (botão
  "Expediente 08:00–18:00 · Almoço 12:00–13:00" no rodapé do painel da RENATA; "Voltar ao padrão"; salvo **neste
  navegador** — `agendaPrefs.js`, localStorage, formato `{workStart,workEnd,lunchStart,lunchEnd}` em minutos, migra o
  formato antigo só-almoço; sem banco). Limites: expediente entre 04:00 e 23:00, 2 a 16 h; almoço 15 min a 3 h e
  dentro do expediente. **"Livre" = tempo sem reunião aceita DENTRO do expediente** (reunião fora dele conta em
  "ocupadas" mas não tira tempo livre), por isso o painel escreve "5h30 livres das 08:00 às 18:00" e a Agenda completa usa
  o mesmo expediente configurado (tooltip com a janela). A barra do dia (`DayBar`) cobre só o expediente: cada
  bloco leva o título (até 2 linhas, tooltip com horário), o almoço aparece como selo flutuante centrado no
  horário (verde livre / vermelho ocupado, com "12:00 – 13:00" na 2ª linha), régua de hora em hora e faixa livre
  com borda tracejada; reunião fora do expediente não entra na barra, mas continua na lista "Reuniões de hoje"
  (a régua nunca estica por causa dela). O almoço só conta como **livre com a janela INTEIRA** sem compromisso
  aceito (sem mínimo inventado); o aviso diz qual reunião pega o almoço ("Reunião no seu almoço (12:00–13:00):
  “Workshop” 10:00–12:30 e mais 1"); convite sem resposta que pega o almoço é avisado à parte; a linha do tempo
  marca o almoço (verde livre / vermelho ocupado). Antes era 12–14h com mínimo de 45 min — estipulação minha, removida. Pausa = intervalo livre ≥ 15 min. "Emendada" = reunião aceita que começa a
  menos de 5 min da anterior. "Sem parar" = sequência ≥ 3h (pausa < 10 min não conta como pausa). Conflito =
  dois aceitos que se sobrepõem (tempo ocupado sem contar em dobro).
- Dado antigo sem `myResponse` conta como aceito (nada some).

### Telas
- **RENATA (tela inicial) — REDESENHADA duas vezes no mesmo dia (2026-09-20) e recomposta em cartões
  (2026-09-22, sobre mockup aprovado pelo Rafael).** A 1ª versão (uma pílula/etiqueta por dado, 3 a 5 por linha,
  parede de resumos) era um relatório e o Rafael a rejeitou ("nível Jarvis, não isso"). Princípio: **uma
  resposta, um gráfico, no máximo 3 avisos; cor só para o que pede ação** (laranja = responder, vermelho =
  choque). Hoje é uma sequência de cartões (`rab-panel`, sombra suave, cada um com seu título), não mais um só
  bloco:
  1. **Visão geral**: frase-resposta do dia que interessa ("Amanhã está cheio" — leve <2h, tranquilo <4h,
     cheio <6h, pesado ≥6h, só o tempo ACEITO) + **chips com ícone** ("6 reuniões" / "7h ocupadas" / "4h livres
     das 08:00 às 18:00", tooltip explicando "livre") + banner "Agora/Próximo: X" (ou "Hoje você já terminou"
     quando o painel escolhe sozinho o próximo dia); ao lado, separado por um traço vertical, um **painel de
     veredito** (`sidePanelFor`) com ícone + título curto + explicação de 1 linha — verde para dia livre/leve/
     tranquilo, laranja ("Dia cheio"/"Dia com alta ocupação") para os pesados; empilha embaixo em telas
     estreitas.
  2. **Trilho da semana** (hoje + janela, fora do cartão de visão geral, cada dia com sua própria borda): medidor
     de horas, ponto vermelho se há choque e ponto laranja se há convite sem resposta — clicar troca o dia em
     foco.
  3. **Cartão "Agenda de X"**: legenda fixa (aceito azul / sem resposta laranja / choca vermelho / horário livre
     verde) + linha do tempo do expediente (blocos por horário, texto em até 2 linhas; aceito cheio, sem
     resposta tracejado, recusado apagado, choque com contorno vermelho; faixa tracejada verde nas pausas de
     1h+; selo de almoço flutuante; régua de hora em hora; cursor amarelo do "agora").
  4. **Cartão "Atenção hoje"** (ou "Hoje vai bem" num dia tranquilo): ícone grande à esquerda, tom (vermelho/
     laranja/verde) = o aviso mais grave presente; até 3 avisos em palavras dentro (choque entre aceitos,
     convites aguardando resposta, sem janela de almoço OU muitas horas seguidas, melhor janela livre).
  5. **Cartão "Reuniões de X"**: título com contador (nº de aceitos) e coluna "Duração"; lista limpa (hora,
     título, duração; marcador cheio/vazado; ⚠ só onde há choque) com "Ver todos"/"Mostrar N recusados" (seta
     que gira ao expandir), legenda mini de novo no rodapé e o botão de configurar expediente/almoço.
  Dia em foco automático: hoje enquanto houver reunião aceita pela frente, senão o próximo dia com algo.
  "Passou" agora é só apagado (antes era riscado — confundia com recusado).
- **Agenda (grade)**: convite pendente com **contorno tracejado e "?"** e recusado **riscado e apagado** (como no
  Google), dica ao passar o mouse com a resposta e quem convidou, legenda, botão **Ocultar recusados**, e
  resumo curto no cabeçalho de cada dia. O recusado vira faixa apagada **ao fundo** (fora da divisão em
  colunas — antes um recusado de 10h espremia todos os compromissos reais).

### Verificação
54 asserções em Node (respostas do Google em todas as combinações; a segunda-feira 21/09 do print
reconstruída, com os números calculados à mão: 7 aceitos = 5h, 3 pendentes = 3h, livre 5h30, "5h15 se aceitar
tudo", pausas, almoço, 4 emendadas; casos de borda: dia vazio, Livre, dia inteiro, almoço curto, maratona,
meia-noite, expediente configurável). UI com agenda simulada (a semana do print do Rafael): RENATA (manhã e noite, dia escolhido no trilho, tema claro e escuro) e Agenda. Bugs achados na conferência e corrigidos: "hoje já terminou" aparecendo de manhã ao clicar noutro dia; rótulo "Próximo dia" em dia escolhido.

### Limites
- **Não testado com o Google Calendar real** do Rafael (só com dados simulados a partir do print); o formato
  de `attendees[].self` é o documentado pela API. Vale conferir com a agenda dele.
- Expediente e almoço configurados ficam **só neste navegador** (não acompanha a pessoa em outro
  computador; sincronizar exigiria um campo de preferências no usuário em `db.js`). Não considera fuso diferente do
  navegador nem calendários além do principal.
- Convite de evento recorrente: a resposta vem por ocorrência (comportamento do Google).

## 60. Bug real: digitar e o texto sumir sozinho — corrida entre autosave e o poll de sincronização (2026-09-29)

**Relato da Amanda** (via Rafael): criar uma atividade numa reunião, escrever o nome, e ~2 segundos
depois o texto digitado desaparecia sozinho — sem ela apertar nada.

### Causa raiz
Duas peças do app, cada uma correta isoladamente, colidem: (1) toda edição de projeto (`mutateProject`)
salva com debounce de 500ms (`persistProjectDebounced`) — cada campo autosave (ex.: título da
atividade) tem também o próprio debounce de 300ms (`useDebouncedField`), então uma tecla digitada
leva até ~800ms pra realmente sair como PATCH; (2) o "BIP" de sincronização entre usuários (poll a
cada 6s em `GET /api/projects/versions`, §28) recarrega a lista inteira de projetos
(`reloadProjects`) sempre que percebe que ALGUM projeto mudou — inclusive quando quem mudou foi o
PRÓPRIO usuário (criar a atividade já conta como "mudou"). `reloadProjects` fazia
`setProjects(res.projects...)` **sem nenhuma proteção** — se esse poll disparasse enquanto uma
edição local ainda não tinha chegado no servidor (aguardando o debounce, OU já enviada mas sem
resposta ainda), a resposta do servidor era uma FOTO DE ANTES, e essa foto substituía o `projects`
inteiro na tela — apagando o texto que a pessoa via, mesmo que ela já tivesse "commitado"
localmente. Criar uma atividade e renomear ela na sequência é o cenário mais exposto: são dois
saves próximos um do outro, bem na janela em que o poll (rodando numa agenda própria, independente
do que o usuário está fazendo) tem mais chance de cair no meio.

Esse exato padrão de proteção **já existia** em `PublicBoardScreen` (poll de 45s do quadro público:
`if (document.hidden || saveTimer.current || savingRef.current) return;`) — só não tinha sido
aplicado ao poll principal de `projects`, que é o que cobre atividades/reuniões/cronograma.

### Correção (`src/App.jsx`)
`reloadProjects(opts)` ganha `opts.background` (só `true` quando quem chama é o poll, nunca no
carregamento inicial) e, nesse caso, funde a resposta do servidor com o estado local em vez de
substituir tudo: qualquer projeto com edição **agendada, ainda não enviada**
(`saveTimers.current[pid]`, já existia) OU **enviada, ainda sem resposta**
(`inFlightProjectSaves.current[pid]`, novo — incrementado/decrementado por `trackInFlightSave()`,
usado tanto por `persistProjectDebounced` quanto por `flushProjectSave`) mantém a versão local —
só os projetos SEM edição pendente são substituídos pela foto do servidor. Isso preserva o
propósito original do poll (Amanda vê o que outra pessoa mudou) sem nunca apagar uma edição que o
servidor ainda não sabe que existe. Efeito colateral corrigido junto: o `catch` de `reloadProjects`
fazia `setProjects([])` em QUALQUER falha — um poll de fundo que desse timeout apagaria a tela
inteira; agora só o carregamento inicial (sem dado nenhum ainda) cai pra lista vazia.

### Verificação
Build limpo. Reproduzido e corrigido ao vivo no dev local (login real, não simulado): criada uma
atividade numa reunião de teste, digitado o título — (a) com a correção ativa, o texto sobreviveu a
vários ciclos reais do poll (confirmado no log de rede: `GET /api/projects` intercalado com
`PATCH /api/projects/:id` sem perda) e foi lido de volta do Postgres exatamente como digitado;
(b) forçado o pior caso possível — PATCH artificialmente atrasado 7s (cobrindo um ciclo inteiro do
poll de 6s) via `window.fetch` interceptado — o texto ainda sobreviveu e persistiu corretamente,
provando que a proteção cobre também a janela "enviado, sem resposta ainda", não só a "agendado,
ainda não enviado". Dados de teste removidos do Postgres local depois.

### Onde mais isso poderia doer (investigado, sem achado)
- **Gestão de Atividades (Quadro Pessoal)**: `personalBoard` tem o próprio debounce
  (`persistPersonalBoardDebounced`) mas **nenhum poll periódico** recarrega ele sozinho — carregado
  uma vez no login, sem re-fetch de fundo. Não é vulnerável a esse padrão (nada existe pra
  sobrescrever o estado local no meio de uma edição).
- **Quadro público compartilhado** (`PublicBoardScreen`): já tinha a proteção (é de onde copiei o
  padrão), confirmado lendo o código, não só por analogia.
- **Notificações** (poll de 45s): só lê/substitui a lista de notificações, não tem edição de texto
  do usuário em voo — sem risco equivalente.

### Continuação (mesmo dia): a Amanda testou de novo e "não deu certo"

A correção acima estava (e está) correta e confirmada em produção — mas isso sozinho **não bastava**
pra Amanda ver o efeito. Causa real: esse é um SPA — **um deploy nunca atualiza sozinho uma aba já
aberta**. Se a aba dela já estava carregada (ou tinha ficado aberta) de ANTES do deploy dessa
correção, ela continuou rodando o JS antigo (com o bug) indefinidamente, na memória do navegador,
mesmo com o servidor já 100% atualizado — nenhuma quantidade de deploy no Railway alcança uma sessão
já em execução. Não tinha como verificar isso remotamente (o servidor não loga requisição por
requisição, só a linha de boot), e é exatamente o tipo de "fantasma" que gera "eu corrigi mas
continua igual" — o código novo nunca chegou a rodar na tela dela.

**Correção real desse gap** (`src/App.jsx`, `useEffect` perto do poll de sincronização): a cada 4
minutos (e uma vez já na entrada), busca `/` sem cache e compara o `<script type="module" src="...">`
retornado com o que está carregado agora; se mudou, mostra um toast **persistente** (`ttlMs: 0`) —
"Uma nova versão do Cronograma está disponível." + botão "Atualizar agora" (`window.location.reload()`).
Isso fecha a classe inteira de "corrigi e não fez efeito" daqui pra frente, não só esse caso.
**Testado de ponta a ponta** rodando `dist/` de verdade num servidor local: login real, troquei o
`index.html` servido pra simular um deploy novo (JS com nome fictício), o toast apareceu na tela
certa (dentro do workspace de Empresas, onde `ToastStack` já é renderizado) e "Atualizar agora"
recarregou a página com sucesso (restaurei o `index.html` real antes de clicar, pra não confirmar só
metade do fluxo). Limite conhecido: o toast só aparece nas telas que já renderizam `<ToastStack
appToasts>` (o workspace de Empresas — onde reuniões/atividades vivem, exatamente onde o bug da
Amanda acontece); não aparece na tela de login nem no seletor de organização do Super Admin — não
crítico, ninguém fica parado ali por muito tempo.

## 61. Quadro Pessoal: mover de coluna por dentro da atividade (2026-10-01)

**Pedido do Rafael** (com print do detalhe de uma atividade "FLP - CEREJ"): dar pra trocar a
atividade de coluna sem precisar fechar o detalhe e usar o menu "⋯" do card na lista.

Essa ação **já existia** — `PersonalCardMenu` (o menu "⋯" de cada card) tem "Mover para..." desde
sempre, chamando `moveCardToIndex(cardId, fromColId, toColId, null)` (já existente, com log no
histórico e toast de desfazer) — só não estava acessível de dentro do `PersonalCardDetailModal`
(a tela de detalhe que abre ao clicar no card). Adicionado ali, reusando a mesma função, sem
duplicar lógica: o breadcrumb "{board} / {coluna}" no topo do modal virou um `<select>` quando há
outras colunas (`otherColumns`, mesmo array já usado por `ReassignCardsModal`) — trocar a opção
chama `onMoveTo(novaColId)`, que roda `moveCardToIndex` e atualiza `openCard` pra apontar pra nova
coluna (o modal continua aberto, mostrando a nova coluna, em vez de fechar sozinho porque o card
some da coluna antiga). Em modo só-leitura (link público) continua mostrando só o nome, sem o
`<select>` — mesma regra do resto do modal.

**Testado** localmente (login real): criada a atividade "FLP - CEREJ" em "A fazer", trocado pelo
`<select>` do modal pra "Em andamento" — o rótulo do breadcrumb atualizou, "Salvo automaticamente"
confirmou, o quadro (atrás do modal) já mostrava o card na coluna nova, e o Histórico registrou
"Movida de "A fazer" para "Em andamento"" com timestamp e usuário certos. Dado de teste removido do
Postgres local depois.

## 62. Quadro Pessoal: texto do item de checklist editável (2026-10-01)

**Pedido do Rafael** (com print): item de checklist "DOCUMENTAÇÃO 3 ANSO - SPED" (typo) não podia
ser corrigido — só existia marcar como feito (checkbox) e excluir (X), nunca editar o texto.

`updateChecklistItem(colId, cardId, itemId, text)` novo (`PersonalBoardScreen`), mesmo padrão de
`addChecklistItem`/`toggleChecklistItem`/`removeChecklistItem` (valida texto não-vazio, atualiza
`updatedAt`/`updatedBy`). No `PersonalCardDetailModal`: clicar no texto do item OU no ícone de
lápis novo vira um `<input>` editável (mesmo visual de edição de comentário já existente); Enter
ou clicar fora salva; Escape cancela sem salvar. Modo só-leitura (link público) não mostra o lápis
nem deixa clicar no texto.

**Bug achado e corrigido durante o próprio teste** (não hipotético): o primeiro código escrito
salvava o texto errado ao cancelar com Escape — `setEditingChecklistId(null)` tira o foco do
`<input>`, o que dispara o `onBlur` *depois* do Escape, e o `onBlur` chamava
`onUpdateChecklistItem` incondicionalmente, salvando o texto "cancelado" por cima. Corrigido com
`cancelingChecklistRef` (um `useRef`): Escape e o botão "cancelar" marcam a flag antes de tirar o
foco, o `onBlur` confere a flag e não salva nesse caso — só reseta e sai. Mesmo princípio já usado
em `useDebouncedField.reset()` (nunca commitar quando a saída é uma desistência explícita).

**Efeito colateral conhecido, não corrigido** (pré-existente, não é regressão): o Escape também
fecha o modal inteiro (o `window.addEventListener('keydown', ...)` do modal ouve Escape
globalmente e não tem como saber que já foi tratado dentro do campo) — mesmo comportamento que já
acontecia ao cancelar a edição de um comentário com Escape. Testado e aceito como consistente com o
que já existia, não exclusivo do checklist.

**Testado** localmente (login real): criado o item com o mesmo typo do print, editado pelo lápis e
pelo clique direto no texto, confirmado no Postgres que o texto corrigido persistiu; reproduzido o
bug do Escape salvando errado, corrigido, e confirmado de novo no Postgres que cancelar não altera
nada. Dado de teste removido depois.

## 63. Dossiê do cliente — compilado de todas as reuniões (2026-10-02)

**Pedido** (Amanda, via Rafael): "estou com todas as reuniões da Tecumseh aqui, eu queria que a
Renata fizesse um compilado… um resumo, um cronograma, um mapeamento pra gente entender como um todo."
Entregue a **Fase A** (o compilado). Fase B (a RENATA propor um plano/atividades a partir dele, com
aprovação antes de criar) e Fase C (atualização incremental, decisões viram fatos da Central de
Conhecimento) ficam para depois, só com aval do Rafael.

**Por que o chat não servia**: cada pergunta busca só 12 trechos da memória (`limit: 12` em
`assistantRetrieval.js`) e a resposta é capada em 4.000 tokens — serve pra perguntas, não pra ler
tudo. Mas cada reunião já tem resumo, decisões, tópicos, destaques e atividades estruturados.

**Arquitetura** (`server/dossier.js`, map/reduce):
1. **Ficha por reunião, SEM IA** (`buildFicha`): título, data, participantes, resumo, decisões,
   tópicos, destaques e atividades que a reunião já tem. Só quando a reunião NÃO tem resumo (<80
   chars) mas tem transcrição (≥200), o Sonnet resume a transcrição (`digestTranscript`, cap 120k
   caracteres: começo + fim); isso fica em cache (`project_meeting_digests`, chave = hash de
   título+data+transcrição — mexer em status de atividade não invalida).
2. **Consolidação**: o Opus lê as fichas em ordem cronológica e devolve um JSON estruturado
   (`DossierSchema`, zod **achatado**, sem `discriminatedUnion` — incidente de produção de 2026-09-10, ver §27/§34; instâncias novas de `ids()`
   por campo, sem reuso de objeto zod): resumo executivo, linha do tempo, frentes de trabalho,
   decisões (com `state`: vigente/alterada/revogada/incerta + nota do que mudou), pessoas, riscos,
   lacunas. Cada item cita `meetingIds`; ids inventados são descartados (`sanitizeConsolidation`).
   Acima de ~180k caracteres de fichas: um dossiê parcial por bloco + uma chamada final de união.
3. **Por código, não pela IA**: pendências em aberto (atividades de reunião não concluídas, separadas
   por lado PRICETAX/cliente, vencidas primeiro) e estatísticas (nº de reuniões, período, atividades
   abertas/vencidas, participantes). Dado do sistema nunca passa pelo modelo.
4. **Segundo plano**: o Opus leva minutos. `POST /api/assistant/dossier` cria a linha `generating`
   e responde 202; `runDossierJob` roda sem ser aguardado e atualiza `progress`; o front faz polling
   a cada 3s. Já tem geração rodando → devolve ela (não paga 2x). Job `generating` há >45min vira
   `error` (`failStaleJobs`; container reiniciado mataria o job e travaria o botão). Mantém as 5
   últimas versões `done`.
5. **Desatualização**: `sources` guarda o hash de cada reunião usada; `computeStaleness` compara
   com o estado atual e a tela avisa "N nova(s), N alterada(s), N removida(s) desde este dossiê".
6. **Erros claros** (`friendlyError`): 401/403 → "chave da IA não aceita"; 429 → limite; sem crédito;
   JSON cortado → 1 retry mais conciso (`COMPACT_SUFFIX`; `max_tokens: 16000`, abaixo do teto de
   10 min do SDK, ver o incidente do JSON truncado no §33). 401 não retenta e, na etapa das fichas,
   aborta antes de gastar Opus. Falha ao resumir UMA transcrição não derruba o dossiê (vai no
   aviso da tela).

**Acesso**: só master/pricetax/superadmin (`canUseDossier`) — o usuário `cliente` leva 403 mesmo
vendo a empresa (é compilação interna). Mesmo `canAccessProject` das outras rotas do assistente.
O botão "Dossiê do cliente" só aparece pra esses papéis e quando há reuniões. Gerar registra no log
do projeto ("gerou o dossiê do cliente").

**Front** (`src/meetings/DossierPanel.jsx` + `dossierExport.js`): documento com tiles de resumo,
seções, fontes clicáveis (abrem a reunião de origem), aviso de reuniões sem conteúdo, e exportação —
Copiar/Baixar **Markdown** (a Amanda quer "jogar no cloud": o .md serve pra levar pro Claude/Drive) e
**PDF/Imprimir** (janela própria com HTML escapado, independente do tema). Regra de produto: o
documento sempre diz que é gerado por IA e manda conferir nas fontes.

**Banco** (`server/db.js`, aditivo, sem CHECK — §38): `project_dossiers` e `project_meeting_digests`
(ver `docs/PROJECT_MAP.md`).

**Testado**: (a) `server/dossier.js` com cliente de IA SIMULADO contra o Postgres local — 28
verificações: ordem cronológica e reunião apagada fora, ficha vazia sinalizada, pendências por
código, ids inventados descartados, cache da ficha (2ª geração não chama o Sonnet; transcrição
alterada refaz só ela), desatualização nova/alterada/removida, lotes + união, retry de JSON
cortado, 401 sem retentar, max_tokens persistente, falha numa ficha não derruba, job travado vira
erro, geração já em andamento não duplica, poda de versões, CASCADE; (b) exportadores Markdown/HTML
(escape, sem undefined/null, conteúdo vazio); (c) tela no navegador com dossiê gerado pelo próprio
job: documento completo, fonte clicável abre a reunião, "gerando" com progresso e atualização por
polling, aviso de desatualizado, erro tratado mantendo o dossiê anterior, download do .md, impressão;
(d) rotas com sessões reais: cliente 403, sem sessão 401, projeto inexistente 404, sem projectId 400,
e o caminho HTTP completo até a chamada de IA (chave local inválida → erro 401 tratado na tela).
**NÃO testado com IA real**: não há `ANTHROPIC_API_KEY` válida local; a primeira geração real será
em produção. Risco principal: a saída estruturada do Opus (schema só com tipos já provados em
produção: string/array/object/enum/nullable). Se falhar, o erro aparece na própria tela e no log do
Railway (`Dossiê: falha na geração — …`).

**Limites conhecidos**: qualidade depende do que as reuniões têm (reunião sem resumo nem transcrição
fica de fora e é listada); reunião só com transcrição curta (<200 chars) e sem resumo conta como sem
conteúdo; gerar de novo reprocessa tudo (as fichas de transcrição ficam em cache, a consolidação
não); sem versão anterior navegável na tela (o banco guarda as 5 últimas, a tela mostra a mais
recente); layout em celular só conferido por CSS, não visualmente.

## 64. XFlow: colar print e adicionar imagens nas TASKs do time de DEV (2026-10-02)

**Pedido do Rafael**: "dentro das TASKS para time de DEV permita colar PRINT e permita adicionar imagens".

**O que já existia**: colar print na **Descrição** (editor Tiptap, vira imagem inline + anexo) e o botão
**Anexar** em Evidências; o **comentário** aceitava imagem só pelo clipe. O que NÃO funcionava era o Ctrl+V
em todo o resto — comentário e os campos de texto simples (Resultado esperado, Passo a passo, **Solução
aplicada** e **O que testar**, os que o dev mais usa): o navegador simplesmente ignorava a imagem.

**Agora** (`src/xflow/XFlow.jsx`, sem mudança de servidor — mesmos `comentar`/`anexar`, mesmos limites de 8 MB
por arquivo e mesma sanitização):
- **Comentário**: Ctrl+V de um print vira rascunho de anexo (com miniatura) e vai junto ao clicar em
  Comentar; também dá pra **arrastar** imagem pra dentro da caixa.
- **Campos de texto simples** (Resultado esperado, Passo a passo, Solução aplicada, O que testar — no
  detalhe e na "Nova TASK"): o print colado é **anexado em Evidências** (esses campos são texto puro e não
  guardam imagem) e aparece um aviso "Anexado em Evidências: print-….png". Colar texto continua normal.
- **Ctrl+V com a TASK aberta e nada em foco** (nenhum campo de texto): anexa em Evidências. Se um campo
  está em foco, ele trata o próprio paste (por isso o listener de documento ignora `INPUT/TEXTAREA/SELECT/
  contenteditable` e eventos já tratados — sem anexo duplicado).
- Print colado chega do navegador como `image.png`; vira `print-AAAAMMDD-HHMMSS.png` (vários: `-1`, `-2`…).
  Arquivo copiado do Finder/Explorer mantém o nome. Evidências do "Nova TASK" agora mostram miniatura.
- Respeita a permissão `attach_evidence` (solicitante só na própria TASK; dev/triagem/gestão/admin sempre):
  sem permissão, o Ctrl+V nos campos não é interceptado.
- Dica fixa na seção Evidências ensinando o Ctrl+V.

**Testado** (dev local, login real, simulando o evento de colar com PNG real gerado no navegador): Nova TASK
(print em "Resultado esperado" → miniatura + aviso, texto preservado), detalhe (comentário com print →
rascunho → comentário enviado; "Resultado esperado"; sem foco; texto puro não interceptado; Descrição sem
regressão) e **persistência no Postgres** (2 evidências + comentário com anexo `image/png`). Não testado com
um print real do SO (Cmd+Shift+4 → Cmd+V) — o evento simulado carrega o mesmo `File` que o navegador entrega.

## 65. Gestão de Atividades: indicadores de abertura/encerramento (2026-10-04)

Pedido do Rafael: "memorizar todas as atividades abertas e encerradas" e mostrar a cada pessoa (Rafael,
sócios, Amanda…) **o próprio** dia da semana e dia do mês em que mais abre e mais encerra — motivação
individual, ninguém vê o indicador de outro. Botão **Indicadores** no topo da Gestão de Atividades
(`PersonalBoardScreen`, ao lado de Concluídas; some no quadro público/somente leitura).

**Por que tabela nova e não só ler o card**: o card guarda só o ESTADO atual (`createdAt`, `completedAt`).
Reabrir apaga `completedAt`; "Excluir definitivamente" apaga o card inteiro (e as datas); `history`
é capado em 200 e `board.log` em 300. Por isso `personal_card_events` (`server/db.js`, aditiva, SEM CHECK
— lição do §38): PK `(user_id, card_id, kind, occurred_at)`, `kind` = `opened`|`closed`, sem FK pro card.

**Como grava**: `server/personalActivity.js` → `cardEventsOf(data)` deriva os eventos de cada card
(`createdAt` → opened; `completed` + `completedAt` → closed) e `syncCardEvents` insere com
`ON CONFLICT DO NOTHING`. É idempotente de propósito: usa o timestamp do PRÓPRIO card (não `now()`),
então rodar N vezes não duplica e o backfill dos cards antigos cai no mesmo caminho. Chamado em
`PATCH /personal-board`, `PATCH /public-board/:token` (atribui ao DONO do quadro) e no próprio
`GET /personal-board/stats` (é aí que as atividades antigas entram, retroativamente, na 1ª abertura).
Nunca derruba o save (try/catch interno só loga).

**Regras de contagem**: reabrir NÃO remove a conclusão já registrada; reconcluir em outro momento conta
OUTRA conclusão (inflação aceita e avisada na tela). Card sem `createdAt`, ou concluído sem `completedAt`,
não entra — a rota devolve `withoutOpenDate`/`closedWithoutDate` e a tela avisa quantas ficaram de fora.
Fuso fixo `America/Sao_Paulo` (SQL `AT TIME ZONE`), não UTC: 05/10 02:30Z é domingo 23:30 em Brasília.

**Rota**: `GET /api/personal-board/stats?days=30|90|(vazio=tudo)` (só `requireAuth`, sempre do `req.user`)
→ `{opened, closed, weekday:{opened[7],closed[7]} (0=dom), monthDay:{opened[31],closed[31]},
firstEventAt, days, withoutOpenDate, closedWithoutDate}`. Frontend: `src/personal/PersonalStats.jsx`
(frase-resumo com os picos, KPIs, velocímetro SVG = encerradas ÷ abertas, barras por dia da semana e do
mês). `SidePanel` ganhou prop opcional `width`.

**Verificação**: 11 checagens em Node contra o Postgres local (idempotência com 3 syncs, fuso, reabrir,
reconcluir, exclusão definitiva, filtro de período, cobertura) + painel no browser + PATCH ao vivo
gravando `opened`/`closed`. Bug achado SÓ rodando: `apiGet` não põe `/api` sozinho (o Vite devolveu o
HTML com 200 e a tela ficou em "Carregando…") — o painel agora trata resposta sem `weekday` como erro.
**Não testado em produção**: não sei quantas atividades antigas têm `createdAt`/`completedAt`; o aviso na
tela mostra o número real na primeira abertura. O que for concluído/criado ANTES do deploy só entra se o
card ainda existir; o que foi excluído definitivamente antes é irrecuperável.

**Visão dia a dia e médias (2026-10-04, pedido do Rafael após ver o painel em produção: "filtrar e caminhar
por dia, ver a métrica por dia e a média por dia")**. `GET /api/personal-board/stats` ganha `today`,
`fromDay`, `totalDays` (dias corridos do período, em Brasília), `weekdayDays[7]`/`monthDayDays[31]`
(quantas vezes cada dia da semana/do mês ocorre no período — o divisor da média). Nova
`GET /api/personal-board/stats/day?date=YYYY-MM-DD` (valida data real, 400 se inválida) →
`{date, window[30] (30 dias terminando no dia, com zeros), events[{cardId,kind,at,title|null}]}`; o título vem
do card ATUAL do quadro, e `null` = atividade excluída definitivamente (a tela mostra "Atividade excluída"
em itálico; o evento continua contando). Na tela: KPIs com "média de X por dia" (total ÷ dias corridos do
período, não ÷ dias com evento), card **Dia a dia** (‹ data › + "Hoje", faixa clicável de 30 dias, lista de
abertas/encerradas com hora), e alternador **Total | Média por dia** que vale pros dois gráficos (média =
total ÷ ocorrências daquele dia da semana/mês no período; a frase-resumo segue o modo escolhido).
Verificado: 13 checagens em Node (faixa do período, ocorrências, janela, título nulo após exclusão, virada
à meia-noite de Brasília: 02:59Z = dia anterior, 03:00Z = dia seguinte) + navegação no browser conferida
contra SQL (dias 02, 03 e 04/10 e média 91÷41 = 2,2).

**Recuperação do passado (2026-10-04, pedido do Rafael: "funcionar pro passado também, usando o LOG")**.
`cardEventsOf` agora lê, além de `createdAt`/`completedAt`, o `card.history` de cada atividade e o
`board.log` de cada página. Fontes e limites REAIS (conferidos no código e no git, não assumidos):
- **`card.history`** (cap 200/card, vive junto com o card, inclusive Lixeira e Concluídas arquivadas) é a
  fonte principal. Recupera conclusões que o `completedAt` perdeu (reabriu e concluiu de novo; ainda aberta
  mas já concluída antes) e a abertura de card sem `createdAt`. A mensagem de conclusão mudou 3 vezes desde
  que o quadro nasceu (09/08/2026): `Marcada como concluída` → `Status alterado: Concluída` →
  `Status alterado: X → Concluída` — o regex (`CLOSE_TEXT`) reconhece as 3. Abertura = `Tarefa criada` |
  `Tarefa duplicada`. Reabrir/mover/comentar/excluir não viram evento.
- **`board.log`** SÓ é gravado quando a página está `visibility==='public'` (`mutateBoardTree`) e é capado
  em 300 entradas por página — logo só ajuda pra atividade EXCLUÍDA DEFINITIVAMENTE em quadro que foi
  compartilhado, dentro das últimas 300 ocorrências. Entra com `card_id` sintético `log:<ts>:o|c`.
- **Deduplicação por proximidade (±3 s), não só pela PK**: `completedAt` e o `ts` do histórico saem do mesmo
  `now` na versão atual, mas na v1 de 09/08 (`updateCard` calculava o próprio `now`) e no `ts` do log
  diferem por milissegundos. Regra: um evento só entra se não houver outro do mesmo `kind` e do mesmo
  `card_id` em ±3 s (`loose` = qualquer `card_id`, usado só pro log, que não tem id de card). Primeiro
  colapsa dentro do lote em JS (`collapse`), depois o `NOT EXISTS` do INSERT protege contra o que já está
  gravado — por isso é seguro rodar de novo e por isso o log não duplica um card que foi excluído depois.
- Eventos de OUTRA pessoa em quadro compartilhado (editor) continuam atribuídos ao DONO do quadro.
- Quando um sync insere ≥5 eventos, loga `Indicadores: N evento(s) novo(s) registrados para <user>` —
  é como dá pra ver no `railway logs` quanto passado foi recuperado na primeira abertura do painel.
- **Irrecuperável**: atividade excluída definitivamente FORA da janela do log (ou de quadro nunca público),
  qualquer coisa anterior a 09/08/2026, e histórico além dos 200 últimos eventos de um card.
Verificado com 12 checagens novas (reaberta, formatos 1/2/3, sem `createdAt`, skew de 120 ms, ruído,
evento já gravado antes, log de card apagado, log não duplica card vivo nem card excluído depois, dia
da semana certo) + as 24 anteriores sem regressão.

## 66. Quadro Pessoal: pausar manda a atividade pro fim da coluna (2026-10-04)

Pedido do Rafael (com print de um card "Parceria JOY", Pausada/Alta, no meio da coluna): "ao pausar uma
atividade, lembre de colocar ela no final da coluna" — mesmo comportamento que concluir já tinha (§ memória
`cronograma_personal_board_completion_archive`). Dois pontos em `src/App.jsx`:
- `setCardStatus`: o ramo que faz `splice` pro fim da coluna (antes só `willComplete && !wasCompleted`) agora
  também dispara em `status === 'pausada'` vindo de outro status (`goesToEnd`). Pausar um card que já está
  pausado não move. Todos os caminhos de mudar status do quadro pessoal (menu do card, StatusPicker do modal,
  lista) passam por `setCardStatus`, então um ponto só cobre todos.
- `sortCards` modo `'priority'`: o desempate deixou de ser `(concluída, prioridade)` e virou 3 faixas —
  ativa (0) < pausada (1) < concluída (2) — e só depois prioridade. Sem isso, no modo Prioridade (o que o
  Rafael usa) uma pausada "Urgente" continuava no topo apesar de estar fisicamente no fim.
**Limites conscientes**: nos outros modos de ordenação (Prazo, Criação, Atualização, Nome) a ordem é calculada
pelo campo, então "fim da coluna" só vale no modo Manual e no Prioridade — igual a concluída sempre foi. No
modo Manual a pausada fica depois das concluídas que já estejam na coluna (fim literal), enquanto no
Prioridade a ordem é ativas → pausadas → concluídas.
Verificado no browser local: coluna com 4 cards, pausar o 1º em modo Manual (foi pro fim) e depois em modo
Prioridade pausando um card Urgente (ficou depois dos ativos, antes não ficava), conferido na tela e no JSON
salvo. Não é evento dos Indicadores (§65) — pausar não conta como abertura nem encerramento.

## 67. Auditoria de acessos dos usuários (2026-10-04)

Pedido do Rafael (Gestão de Usuários): registrar quantas vezes cada usuário acessou, o último acesso e o
local pelo IP, "etc." — ele achava que "já existia um auditor". **Não existia**: o login não gravava nada
(nenhum `last_login`, IP ou contagem em `users`). Construído do zero e aditivo.

**Tabelas** (`server/db.js`, sem CHECK — lição do §38): `user_access_events` (`user_id` FK CASCADE, `kind`
`login`|`visit`|`login_failed`, `at`, `ip`, `forwarded_for` bruto, `city/region/country`, `user_agent`) e
`ip_geo_cache` (1 linha por IP — cada IP é consultado UMA vez).

**Captura** (`server/accessLog.js`, tudo fire-and-forget: nunca atrasa nem derruba login):
- `login`: `POST /auth/login` e `/auth/change-password-login` (que também emite sessão).
- `login_failed`: senha errada de usuário EXISTENTE (usuário inexistente não grava — evita lixo).
- `visit`: o cookie dura 7 dias, então contar só logins dá número irreal pra quem usa todo dia. `GET
  /auth/me` (chamado a cada carga de página) chama `noteVisit`: se o último `login`/`visit` do usuário tem
  mais de 30 min, grava `visit` ("voltou à sessão"). Dedupe em memória (`lastRecorded`) + checagem no banco
  na 1ª vez após reinício. "Acessos" = `login` + `visit` (falha não conta).
- IP (`clientIp`): `x-real-ip` → 1º do `x-forwarded-for` → `socket.remoteAddress`, tira `::ffff:`.
  **Confirmado em produção (2026-10-04)**: o 1º login real do Rafael mostrou "Curitiba, PR · Safari · macOS"
  — o Railway entrega o IP real do visitante. NÃO verificado: se o proxy sobrescreve um `x-real-ip` forjado pelo
  cliente (`forwarded_for` bruto fica no banco pra auditar).
- Local: serviço externo **ipwho.is** (HTTPS, sem chave, timeout 3 s), resultado em `ip_geo_cache`; falha →
  não grava local e só tenta de novo daquele IP após 10 min (`geoMiss`). IP privado/loopback nem consulta.
  Trade-off aceito: o IP de cada usuário (inclusive de cliente) é enviado a um terceiro uma vez; alternativa
  100% offline = pacote `geoip-lite`/`fast-geoip` (115–164 MB, só cidade com a base cheia) ou
  `geoip-country` (8 MB, só país). Trocar é mexer só em `lookupGeo`.
- Dispositivo = `deviceLabel(user_agent)` calculado na leitura ("Chrome · macOS").

**Leitura (só master, mesma org)**: `GET /users` agora devolve também `access` (`{userId:{count, failed30d,
last{at,ip,city,region,country,device}}}` via `accessSummary`); `GET /users/:id/access` → últimos 25 eventos.
Frontend: `UsersManagementScreen` ganha colunas "Último acesso" (data/hora + cidade/UF + dispositivo) e
"Acessos" (com "N falhas" em vermelho nos últimos 30 dias), linha equivalente no mobile, e `UserAccessHistory`
no `EditUserModal`. `access` vem num estado separado (`userAccess`) porque as ações de editar/bloquear
substituem o usuário por `res.user`, que não carrega o resumo.
**Não retroativo**: não há log anterior — o contador começa do zero no deploy. 
Verificado: 20 checagens em Node (prioridade de cabeçalho, geolocalização real, cache, IP privado, janela de
30 min incl. reinício, falha não conta) + login/senha errada pelas rotas reais + tela e modal no browser.

## 68. Gestão de Usuários na tela inicial (2026-10-04)

Pedido do Rafael (print da `WorkspaceGateScreen`): "coloque a Gestão de usuários nessa tela, atualmente ele tá
escondido no EMPRESAS". Novo card **Gestão de Usuários** (ícone `UserCog`) na tela inicial, só pra
`role === 'master'` (mesma regra do atalho dentro de Empresas, que continua existindo — `goToUsers`/`showUsers`
não mudaram). Implementado como workspace mode próprio `'users'`, **fora** de `availableModes` de propósito:
entrar em `availableModes` mudaria o auto-select de quem só tem 1 módulo e o `goHome`. Peças em `App.jsx`:
`locationTag('users')` → tag `'users'`, `applyLocationTag('users')` (Voltar/Avançar do navegador funcionam),
`loadUsers` também dispara em `workspaceMode==='users'`, e o ramo de `UsersManagementScreen` aceita
`showUsers || effectiveMode==='users'`; nesse caminho o botão vira "Voltar ao início" (`closeLabel`, prop nova)
e leva ao gate (`goToWorkspace(null)`).
**Super Admin**: o interceptador do seletor de organização (`canPickCompanies && isSuperAdmin && !actingOrg`)
vem antes e continua valendo — ele escolhe a organização primeiro. `enterOrganization` agora lembra a
intenção: se `workspaceMode==='users'` segue pra tela de usuários daquela organização (antes iria sempre pro
seletor de empresas).
**Quirk preexistente, NÃO mexi**: `locationTag`/`applyLocationTag` não conhecem `knowledge` nem `pareceres`
(caem em `'company'`), então Voltar do navegador a partir deles não restaura o módulo certo.
Verificado no browser local: card visível, clique abre a tela de usuários (4 usuários), via Super Admin →
organização → usuários, "Voltar ao início" volta ao gate, Voltar/Avançar do navegador alternam certo.
Não testado: usuário master NÃO super admin em produção (caminho sem seletor de organização, mais simples).

**Primeiro uso do dia (2026-10-04, pedido do Rafael: "não só quando entra, mas no primeiro clique/uso do dia,
inclusive o lugar")** — `kind='first_use'`. Por que existe: o cookie dura 7 dias e uma aba pode ficar aberta
de um dia pro outro sem recarregar, então nem `login` nem `visit` (que dependem de carga de página) pegam o
uso daquele dia. Peças:
- **Cliente** (`App.jsx`, `useEffect` por `currentUser.id`): listeners em captura de `pointerdown` e `keydown`
  (cobre mouse, toque e teclado). Só `pointerdown`/`keydown` — o poll de 6 s e os de notificação NÃO contam como
  uso. Na 1ª interação de cada dia de Brasília (`Intl` `America/Sao_Paulo`, comparado com `doneDay` em
  memória + `localStorage` `ptx-first-use:<userId>`) faz `POST /api/activity/ping`; falha tenta de novo só
  após 60 s (`retryAt`), nunca a cada clique. localStorage indisponível → pinga 1x por carga de página.
- **Servidor** (`noteFirstUse` em `accessLog.js`, rota `POST /activity/ping`): grava `first_use` **só se o
  usuário não tem `login`/`visit`/`first_use` no dia (Brasília)**. Ou seja, "primeiro uso do dia" é
  exatamente 1 evento por dia, de quem vier primeiro — login às 8h já é o uso do dia e o clique seguinte
  não duplica. `login_failed` não conta como presença. Dedupe em memória (`firstUseDay`) + checagem no banco.
  `recordAccess` de qualquer presença marca `firstUseDay`/`lastRecorded`, então depois de um `first_use`
  recarregar a página em <30 min também não vira `visit`.
- **Números**: "Acessos" agora = `login` + `visit` + `first_use` (`PRESENCE`); "Último acesso" = o mais recente
  desses três (antes ignorava o uso de hoje se o login fosse de dias atrás); novo `activeDays` = dias distintos
  (Brasília) com presença, mostrado sob o número de acessos ("N dias"). Histórico mostra "Primeiro uso do dia".
Verificado: 11 checagens novas em Node (acesso ontem 23:30 Brasília não bloqueia hoje; login hoje 00:10
bloqueia; falha não conta; 3 chamadas = 1 evento) + browser: 1º clique = 1 ping, clique/tecla seguintes = 0,
virada do dia simulada (Date adiantado) = 1 ping novo; 1 linha no banco, com User-Agent.
Bug achado pelo teste, não por leitura: `TZ` usado em `accessLog.js` sem estar declarado nesse arquivo.

## 69. Pareceres PRICETAX: redesenho da listagem (2026-10-04)

Pedido do Rafael (print): a tela "está legal, mas horrível de feia, parece uma Biblioteca antiga dos anos 1980".
**Causa-raiz da aparência**: o módulo não declarava `font-family` — as outras telas herdam Inter de `S.page`
(`App.jsx`), mas `.par-shell` não, então tudo caía na serifa padrão do navegador (Times). Pior: o `SidePanel` do
drawer é renderizado fora do `.par-shell`, então também ficava serifado. Correção estrutural: o módulo inteiro
(listagem + drawer + modal de upload) agora vive dentro de `<div className="par-root">` com Inter —
**qualquer módulo novo que renderize `SidePanel` precisa de um ancestral com a fonte**.
Mudanças (só `Pareceres.jsx` listagem + `pareceresMeta.js`; o drawer e o upload não foram refeitos, só herdam
a fonte): fundo `--bg-page` (igual ao resto do app, antes `--bg-1`); container 960→1240 px; cabeçalho com título
"Pareceres" 30 px + subtítulo e o botão "Novo Parecer"; busca maior; **filtro virou pílulas** (Todos / Geral /
cada cliente, com contagem) no lugar do `<select>`; cartões 16 px, sombra suave, hover que sobe, foco por
teclado (`role=button`, Enter/Espaço); linha de topo com tag de escopo + "PDF · tamanho", **nome do arquivo saiu
do cartão** (fica no tooltip e no drawer), rodapé com avatar de iniciais + autor + data e contador de
comentários só quando > 0; título com `overflow-wrap:anywhere` e 3 linhas (corrige o título que estourava o cartão,
ex. "ACURÁCIA DE FORNECEDORES | TECU…"); descrição que é só uma URL vira chip com o domínio (`urlHost`).
**Heurística de exibição** (`splitParecerTitle`): título no padrão `PARECER | Nº 27/2026 | Assunto` vira kicker
"PARECER Nº 27/2026" + título "Assunto" no cartão; qualquer outro formato aparece intacto. O dado salvo NÃO muda —
o drawer mostra o título completo original.
Verificado no browser local com 7 pareceres semeados parecidos com os do print: claro e escuro, filtro por
cliente, busca, gaveta (Inter confirmada por `getComputedStyle`), mobile 375 px (sem rolagem lateral).
Não testado com os PDFs/dados reais de produção.

## 70. RENATA estuda os Pareceres PRICETAX e sugere caminhos nas reuniões (2026-10-04)

Pedido do Rafael: botão **Estudar Pareceres** na RENATA; ela estuda os pareceres da PRICETAX, aprende, e depois
de uma reunião processada cita numa caixa "existe o Parecer X sobre o tema; conforme o estudo da RENATA,
aconselhe o cliente a ..."; deve **registrar o que estudou e não gastar crédito de novo**: sem parecer novo, o
botão não pode chamar a IA. Módulo `server/parecerStudy.js`, tudo atrás de `requireMasterOrPricetax`.

**Regra de custo (o ponto central)**: `parecer_studies` guarda, por parecer, o hash SHA-256 do arquivo
(`encode(sha256(file_data),'hex')` calculado em SQL) e o estudo. Estado por parecer: `new` (sem linha),
`done` (hash igual), `changed` (arquivo trocado), `failed`, `running`. `startStudy` primeiro lê o estado só em
SQL: sem `new/changed/failed` devolve `{upToDate:true}` e **não precisa nem de chave de IA** — é por isso que o
botão pode ser apertado à vontade. Falha reaparece como pendente (próximo clique refaz SÓ ela); erro fatal
(sem crédito/chave inválida) interrompe o lote em vez de insistir nos demais.
**O estudo**: o PDF vai direto ao modelo como bloco `document` base64 (sem lib de PDF, lê layout e imagens;
10 MB cabem) com `claude-sonnet-5`, `messages.parse` + zod achatado (`ParecerStudySchema`: número, assunto,
resumo, conclusões, orientações {situação, conselho, ressalva}, temas, `appliesTo`, `usageTriggers`, base legal,
limites). Prompt manda usar SÓ o que está no documento e deixar vazio o que não estiver. Job em segundo plano,
um por organização (`running` Set), marcação `running` >30 min vira `failed` (`STALE_STUDY_MS`).
**Memória**: cada estudo vira UM fato de conhecimento `scope='org'`, `origin='internal_document'`,
`knowledge_type='RULE'`, assunto "Parecer PRICETAX Nº X" (resumo + "Usar quando" + orientações + temas) —
registrado por INSERT direto (`registerFact`), **de propósito sem `saveKnowledgeFact`**: ele detecta
conflito/duplicata por embedding+negação e pareceres sobre temas vizinhos gerariam "conflitos" falsos na
Central de Conhecimento. Re-estudo (arquivo trocado) deixa o fato antigo `superseded` (histórico preservado);
excluir o parecer arquiva o fato (`archiveParecerFacts`) e o estudo cai por cascade. Como o chat já injeta fatos
da org, ganhou uma linha no prompt de `synthesizeAnswer` mandando citar o parecer pelo número e o caminho que ele
indica (usando só o que o fato registra).
**Sugestão na reunião**: tabela `meeting_parecer_advice` (PK projeto+reunião) **fora do JSON do projeto**, de
propósito — o JSON da reunião é lido por clientes e reescrito inteiro por PATCH; guardado lá, vazaria o conselho
pro cliente ou seria apagado quando ele salvasse. Após `processSubmission` registrar a reunião,
`generateMeetingAdvice` (fire-and-forget, nunca derruba o registro) manda resumo+decisões+atividades+tópicos e o
índice dos estudos ao Sonnet; devolve 0–3 itens {parecerId, tema, por quê, 2–4 caminhos, ressalva}; ids
inventados e itens sem passo são descartados; sem nenhum estudo **não chama a IA**. Resultado vazio também é
gravado (não paga de novo). `signature` = hash dos estudos vigentes → `stale:true` quando a RENATA estudou
parecer novo depois ("Atualizar sugestões"). `generatingAdvice` Set evita clique duplicado durante a geração.
**Rotas** (`/api/pareceres`): `GET /study` (estado + o que foi aprendido), `POST /study` (202 iniciou / 200
em dia / 503 sem chave), `GET /advice` e `POST /advice` (`projectId`, `meetingId`; checa `canAccessProject`;
409 se não há estudo, 502 com mensagem em português se a IA falhar).
**Frontend**: botão `BookOpen` no cabeçalho do painel da RENATA (`ProjectAssistant`, prop `canStudyPareceres`
= superAdmin/master/pricetax) abre `ParecerStudyModal` (contagem "N de M estudados", botão "Estudar N parecer(es)
novo(s)" ou "Tudo estudado" desabilitado com a nota "sem custo", polling de 4 s enquanto roda, cada parecer
expansível com resumo, conclusões, "o que aconselhar ao cliente", "onde isso pode ser usado" e temas).
`ParecerAdviceBox` fica na coluna lateral do `MeetingDetailModal`, logo abaixo das atividades, só pra staff.
**Verificado**: 35 checagens em Node com cliente de IA simulado (zero chamadas no 2º clique, só o novo é
estudado, falha isolada, erro fatal pára o lote, arquivo trocado versiona o fato, sugestão descarta id inventado,
vazio é gravado, parecer excluído some da caixa, sem estudo = zero chamadas) + browser (caixa na reunião, modal,
expansão, clique sem chave = mensagem clara, "Tudo estudado" + `POST /study` = 200 em dia).
**NÃO verificado — e é o risco real**: a chamada à IA de verdade. Sem `ANTHROPIC_API_KEY` local, o PDF como
bloco `document` + `messages.parse` com `zodOutputFormat` NUNCA rodou contra a API. A 1ª execução real será em
produção; se falhar, a mensagem aparece no próprio modal e em `railway logs` ("Pareceres: falha ao estudar
parecer"). Também não medi o custo por parecer (PDF de ~15 páginas, Sonnet) — conferir o uso depois do 1º estudo.
Pendência: o botão só existe dentro do painel da RENATA (que só aparece nas abas Reuniões/Atividades de uma
empresa); não há atalho na tela de Pareceres.

**Custo no chat — correção (2026-10-04, mesmo dia, depois da pergunta do Rafael "vamos economizar token?")**:
a 1ª versão deixava os fatos de parecer entrarem em TODA pergunta (`loadRelevantFacts` carrega os fatos da org por
data, limite 30) — ~200–290 tokens por parecer, crescendo a cada parecer novo, e ainda ocupando vagas das 30.
Agora `loadRelevantFacts(..., limit, {query})` tira os fatos de parecer (`origin='internal_document'` e
`reference LIKE 'Parecer PRICETAX:%'`) da consulta geral e `pickRelevantPareceres` (função pura em
`knowledgeFacts.js`) escolhe **no máximo 3** que a pergunta toca, comparando radicais de 6 letras sem acento entre
a pergunta (`scope.standaloneQuery`, já reformulada) e assunto+conteúdo do fato. Ignora palavras genéricas
(`GENERIC_WORDS`) e as que aparecem em ≥60% dos pareceres; entra o parecer com 2+ batidas ou 1 batida em palavra
RARA (≤34% dos pareceres). Sem batida → nenhum parecer, custo zero. Sem `query` também nenhum. Só lexical, de
propósito: sem chamada de embedding extra (Voyage free = 3 req/min). Os fatos continuam na Central de
Conhecimento; só deixam de ir pro prompt à toa. Medido com 7 pareceres realistas: carregar todos custaria ~700+
tokens/pergunta (mais com resumos longos de verdade); agora 0 a ~150 por pergunta típica. Limite conhecido: o
casamento é por palavra, então pergunta em outras palavras que o parecer não usa ("aquele parecer do crédito da
folha") pode não trazer o parecer — nesse caso a RENATA responde sem ele, nunca com ele errado.
Verificado: 16 checagens (split→26/2026, CBS 2027→25/2026, "resuma a última reunião"/"quem participou"/pendências
→ nenhum, teto de 3, 30 gerais intactos + só o parecer relevante no banco).

**Fonte (mesma causa do §69, achada em mais 2 módulos)**: `body` do app é `Times` (a Inter vem de `S.page` em cada
tela). Central de Conhecimento (`knw-shell`, drawer fora do shell) e CRM (`crm-shell`, só `font-family:inherit`)
renderizavam em serifa. Corrigido com `.knw-root`/`.crm-root` (+ `font-family` no shell, loading e erro do CRM)
e o fundo do Conhecimento passou de `--bg-1` para `--bg-page`, igual ao resto. Verificado por `getComputedStyle`
nos dois. **Regra**: todo módulo novo precisa de um ancestral com a fonte, inclusive pro que renderiza `SidePanel`.

**Isolamento por cliente (2026-10-04, pedido do Rafael ao ver um parecer da TECUMSEH dentro da empresa DAJU:
"permita estudar, mas não deixe vazar informação de um cliente para o outro")**. Regra em
`server/parecerScope.js` (`parecerUsableFor`): parecer **Geral** vale em qualquer empresa; **Cliente específico**
só na empresa a que pertence — por `company_project_id` (vínculo forte; se existir, é ele que decide, mesmo que o
nome seja igual ao de outra empresa) ou, sem vínculo, por nome (`companyTokens`: sem acento/caixa, sem LTDA/SA/
"do Brasil"; vale se o conjunto de palavras de um contém o do outro). **Regra fechada**: sem nome, sem vínculo ou
sem empresa de referência → não vale fora de casa. O escopo é lido do parecer NA HORA (não copiado pro fato), então
editar a tag vale imediatamente. A RENATA continua ESTUDANDO tudo (`startStudy` enxerga todos via
`computeStudyState`); o que muda é onde o resultado pode aparecer:
- **Janela de estudo** (`GET /study?projectId=`): só os pareceres usáveis naquela empresa, com título e conteúdo;
  os de outros clientes viram uma contagem anônima (`others.count`) e um aviso com cadeado — título, nome do cliente,
  id e conteúdo NÃO saem do servidor (verificado no JSON bruto). Sem `projectId`, só o Geral. A rota confere
  `canAccessProject`.
- **Sugestão na reunião**: `loadDoneStudies` filtra por empresa ANTES de montar o prompt — o modelo nunca recebe o
  parecer de outro cliente. `getMeetingAdvice` filtra de novo na leitura (defesa em profundidade: sugestão antiga,
  tag editada depois).
- **Chat da RENATA**: `loadRelevantFacts` agora recebe `isStaff` (`canUseDossier(req.user)` em `assistant.js`) e só
  considera fatos de parecer pra equipe PRICETAX (usuário `cliente` nunca recebe parecer, nem o da própria empresa),
  ligando fato→parecer por `parecer_studies.fact_id` e aplicando `parecerUsableFor`; fato sem vínculo verificável
  não entra. A frequência de palavras do filtro de relevância passou a ser medida sobre TODOS os pareceres da org
  (`corpus`, só estatística) e o corte de "palavra genérica" só vale com ≥5 pareceres — achado pelo teste: com 3
  pareceres visíveis, uma palavra comum a todos ("split") era descartada justamente quando era o assunto.
- **Fatos de parecer fora da detecção de conflito** (`findSimilarFact`) e fora da checagem de "fato novo" do cache
  de respostas (`answerCache.js`): um fato ensinado numa conversa não é comparado nem marcado "divergente" contra o
  parecer de outro cliente, e estudar parecer novo deixou de invalidar o cache de todos os projetos. O cache em si
  já era por projeto.
- **Central de Conhecimento** continua mostrando todos os fatos de parecer (área só da equipe, visão global) — é de
  propósito; o isolamento vale onde a RENATA conversa ou sugere dentro de uma empresa.
Verificado: 27 checagens de isolamento em Node (2 empresas + 4 pareceres: geral, por nome, vinculado por id, da outra
empresa; lista, prompt da reunião, sugestão gravada à mão com item proibido, chat equipe/não equipe, tag editada,
fatos fora da detecção de conflito) + browser: dentro de uma empresa só aparecem o Geral e o dela, sem a palavra
"Tecumseh" na tela nem no JSON. **Limite conhecido**: o casamento por nome é conservador — se o nome digitado no
parecer não bater com o nome da empresa e não houver vínculo, o parecer específico NÃO será usado nem na empresa
certa (prefere calar a vazar); a saída é escolher a empresa da lista ao enviar o parecer (grava o vínculo).

**Deploy no meio do estudo (2026-10-04)**: o job de estudo é em memória; um deploy/reinício mata o job e deixava as
linhas `running` por até 30 min (botão preso em "Estudando…"). Agora `computeStudyState` marca como `failed`
("o servidor reiniciou durante o estudo — o que já foi estudado não é refeito") toda linha `running` há mais de
1 min quando **este processo** não tem job vivo (`running` Set); o 1 min cobre a janela entre marcar `running` e o
job entrar no Set. Pareceres já estudados ficam salvos e não são refeitos; só os interrompidos voltam a ser
pendentes. Verificado em Node (órfão vira falho na hora; recém-iniciado continua "estudando").

## 71. Auditoria de fonte do app inteiro + regra global (2026-10-04)

Pergunta do Rafael: "tem alguma aba com cara de anos 1980 ainda?". Em vez de opinar, auditei no browser: um script
percorre cada tela (início, Gestão de Atividades, Agenda, Visão Geral, Conhecimento e as 6 abas, CRM e 6 abas,
Pareceres, Usuários, Super Admin, seletor de empresas, as 7 abas de uma empresa, RENATA, modal de atividade,
notificações, Indicadores) e mede, por elemento de texto, a `font-family` computada (`getComputedStyle`).
**Achado**: as telas centrais já eram 100% Inter (cada uma declara `input, select, textarea, button
{font-family:'Inter'}` num `<style>` local). O que sobrava eram só `BUTTON` em **Arial** (default do navegador:
botão não herda fonte) nas telas mais novas — abas do Conhecimento, abas do CRM, Agenda, Visão Geral — e o `body`
em Times (o que causou o visual "biblioteca" nos Pareceres, §69).
**Correção na raiz** (`index.html`): `body { font-family:'Inter', -apple-system, 'Segoe UI', sans-serif }` e
`button, input, select, textarea { font-family:inherit }`. Seletores de elemento (especificidade mínima): qualquer
`font-family` de classe, inline ou de relatório impresso (`.print-report`, `.mtg-print-report` = Arial de propósito)
continua mandando. Módulo novo não precisa mais lembrar da fonte (o `.par-root`/`.knw-root`/`.crm-root` dos §69/§70
ficam, são inofensivos).
**Medido antes/depois nas mesmas 10 telas**: textos fora da Inter 6–10 por tela → 0; altura do documento e dos
botões iguais (Agenda +1 px); nenhuma rolagem lateral nova.
**Segundo achado**: os 4 filtros da Visão Geral Empresas (`macro/MacroOverview.jsx`) eram `<select>` nativos sem
estilo (quadrados, sem padding) — os únicos do app inteiro (medido: 0 nas demais telas). Estilo local
`.macro-filters select` (mesmo padrão de campo do resto: fundo `--bg-4`, borda `--border-3`, raio 8 px, foco amarelo).
Não auditado: tela de login, XFlow (conta de teste sem acesso), páginas públicas `/quadro` e `/reuniao`, telas em
tema escuro, mobile.

## 72. Peças visuais comuns, estados vazios/carregando e auditoria de acessibilidade (2026-10-04)

Pedido do Rafael ("faça 1, 2 e 3 em ordem"): (1) um conjunto único de peças visuais, (2) telas vazias/carregando
decentes, (3) auditoria MEDIDA de contraste, toque e teclado. Resultado completo e o que ainda reprova:
`docs/AUDITORIA_VISUAL.md`.

**(1) `src/ui/`** — `ui.css` (importado por `index.jsx`, vai no CSS global do build) + componentes: `Card`, `Button`
(`primary`/`danger`/`sm`), `Chip`/`ChipRow` (filtro com contagem, `aria-pressed`, cor própria via `--chip-accent`),
`Segmented`, `Tabs` (`role=tablist/tab`, `aria-selected`), `Select`, `Kpi`/`KpiGrid` (`featured`, `tone`), `Section`,
`EmptyState`, `Skeleton`/`SkeletonCards`/`SkeletonKpis`, `Callout`, `BusyBar`, `activate()`/`activateRow()` (tornam um
`div`/`tr` clicável acessível por teclado: `role`, `tabIndex`, Enter/Espaço, sem mudar o que o clique faz). Só
apresentação — quem usa continua dono do estado e dos handlers. Tokens semânticos **adaptativos ao tema**:
`--ui-ok/-warn/-danger/-info/-info2/-accent-text` (claro escuro, escuro claro). Migrados nesta rodada, sem tocar em
lógica: **Conhecimento** (abas, Visão Geral, Memórias, Conflitos, Pessoas/Empresas, Métricas, drawer),
**Visão Geral Empresas** (períodos viram `Chip`, 4 filtros viram `Select`, linhas viram acessíveis) e **Agenda**
(`Segmented`, `Callout` de "conectar Google", `BusyBar`). **NÃO migrados** (seguem com CSS próprio): CRM, Pareceres,
Reuniões, XFlow, Atividades, Usuários. Próximo passo natural: migrar um por vez.

**(2) Estados** — Conhecimento: de 10 cartões "0" iguais para 3 destaques (Conhecimento ativo, Aprendidos em 7 dias,
Precisam de atenção — esse é clicável e vermelho se > 0) + grupos "Como está a memória" e "Economia da RENATA" (os 10
números continuam, nada sumiu). `EmptyState` com orientação do que fazer em cada vazio (Visão Geral, Memórias com
"Limpar busca e filtros", Conflitos, Pessoas/Empresas, Métricas); `SkeletonCards/Kpis` no lugar de "Carregando…";
Visão Geral: vazio por período (ok/informativo) com "Limpar filtros" quando há filtro; Agenda: aviso quando o período
não tem compromisso e barra de progresso enquanto carrega.

**(3) Medição e correções** (detalhe e números em `docs/AUDITORIA_VISUAL.md`):
- Contraste: 249/441 → 1/465 (claro), 73/273 → 1/294 (escuro). Causas: (a) cinzas `--text-3…7` de `index.html`
  reajustados nos dois temas; (b) cores de status "neon" como texto no tema claro (verde 1,6:1, azul 2,6:1,
  amarelo 1,5:1) — 52 regras de CSS de módulo trocadas por `var(--ui-*)` e, para o que vem INLINE de JS
  (`STATUS_META` etc.), override global `html[data-theme="light"] [style^="color: rgb(…)"] {color:… !important}`
  em `index.html` (casa só `color:`, não `border-color`/`background`).
- Foco: nenhum botão removia o anel padrão; 18 regras de CAMPO removiam `outline` e trocavam só a cor da borda →
  halo global `input/select/textarea:focus-visible {box-shadow}`. O teste de foco por `.focus()` não funciona neste
  browser (documento sem foco) — por isso foi auditado pelas regras.
- Teclado: cartão "Próxima atividade", linhas da tabela do Resumo e do quadro em lista, cartões de reunião e os 5
  filtros-cartão de Atividades passaram a ser focáveis (`activate`/`activateRow`).
- Toque (só `@media (max-width:767px)`): `button[title]` ≥ 36 px e os de início/tema/sair/notificações ≥ 40 px
  (eram 23×23 em todas as telas).
**Limite honesto**: a medição de contraste ignora imagens/gradientes e trata `opacity` como multiplicador; 6 textos
esmaecidos DE PROPÓSITO (empresa pausada, "Recusado") ainda reprovam. Login, XFlow, páginas públicas e a maioria dos
modais não foram medidos. Screenshots só funcionaram parte do tempo (painel oculto), então parte da conferência
visual foi por DOM/estilos computados.

## 73. Tela inicial: "Hoje você já terminou" era falso (2026-10-05)

O Rafael (segunda-feira, com 2 h de reunião já encerradas) viu na RENATA da tela inicial "Hoje você já terminou. O resto do
dia é seu." e apontou o erro: sem reunião aceita não significa que o dia acabou — ele estava em trabalho manual e
estudos internos. A linha (`RenataAgendaBriefing.jsx`) só aparece quando o painel escolheu sozinho o próximo dia porque
as reuniões ACEITAS de hoje acabaram. Agora usa `afterMeetingsMessage(nowMin, workEnd)` (função pura em `dayLoad.js`):
antes do fim do expediente (`prefs.workEnd`, o do próprio usuário) → "Suas reuniões de hoje já acabaram. Aproveite o resto
do dia para responder e-mails e colocar suas atividades em dia."; depois → "Suas reuniões e o seu expediente de hoje já
acabaram. Aproveite para deixar amanhã organizado." Só o fim do expediente muda o tom — a agenda vazia nunca declara o
dia encerrado. Testado em Node nos 2 lados do limite e com expediente personalizado; NÃO testado na tela com agenda real
(depende de eventos do Google Calendar).

**Sugestão concreta com o quadro pessoal (2026-10-05, "sim, faça isso")**: a RENATA da tela inicial agora lê o quadro de
Gestão de Atividades do próprio usuário (`personalBoard` do estado de `App()`, passado `WorkspaceGateScreen` →
`RenataAgendaBriefing`; sem rota nova, sem leitura extra). `src/personal/boardAttention.js` (função pura): conta cartões
ABERTOS (fora concluídos, lixeira e arquivados) com `dueDate` < hoje (atrasadas) e = hoje (vencem hoje) em TODAS as páginas
do quadro, e acha a mais antiga ("há N dias"). Dois efeitos: (1) a frase de "reuniões acabaram" fica específica
(`afterMeetingsMessage(nowMin, workEnd, att)`: "Bom momento para atacar as 3 atividades atrasadas do seu quadro" /
"fechar as 2 que vencem hoje" / depois do expediente "Deixe amanhã organizado: seu quadro tem N atrasadas"; sem urgência
volta à genérica de e-mails); (2) uma linha **"Seu quadro: 2 atrasadas · 1 vence hoje — a mais antiga é "…" (há 8 dias)" +
botão "Abrir quadro"** aparece SEMPRE que há algo atrasado/vencendo hoje, independente das reuniões — é o caso do Rafael com
agenda vazia. Só no estado `ready` da agenda (Google conectado); quadro vazio/nulo não mostra nada. Verificado: 15
checagens em Node (várias páginas, singular/plural, lixeira/arquivadas/concluídas fora, nulo) + browser com agenda e
cartões simulados (faixa + linha + "Abrir quadro" abre o quadro; com agenda vazia só a linha). Limite: a contagem usa o
quadro carregado no login — cartão alterado em outra aba só aparece ao recarregar.

## 74. Endereço próprio por módulo (favoritar) (2026-10-05)

Pedido do Rafael: "o link é sempre painel.pricetax.com.br, não consigo favoritar direto a Gestão de Atividades —
por que não `/gestaoatividades/rafael`?". O app não tem roteador (§9) e todo módulo vivia na mesma URL. Agora cada
módulo tem endereço (`src/lib/routes.js`, módulo puro): `/gestao-atividades`, `/empresas`, `/xflow`, `/agenda`,
`/visao-geral`, `/conhecimento`, `/pareceres`, `/modelos` (§78), `/crm`, `/usuarios`; tela inicial = `/`. Variantes aceitas e
normalizadas pro oficial (`/gestaoatividades`, maiúsculas, acento, barra final). **Sem `/rafael` no endereço, de
propósito**: a Gestão de Atividades já é sempre a do usuário logado (`GET /personal-board` por `req.user`), então um
segmento de pessoa seria cosmético — ou ignorado (enganoso) ou exigiria permissão de ver o quadro de outro.
Como funciona (continua sem roteador; só ganhou URL):
- `pushLocation(tag)` agora faz `pushState({navTag}, '', pathForTag(tag))` (antes mantinha a URL). `company:select`,
  `company:users`, `company:orgadmin` = `/empresas`. Os outros `pushState(..., window.location.href)` (subnavegação,
  modais) seguem preservando o endereço atual, e o Voltar/Avançar restauram a URL de cada entrada sozinhos.
- **Abertura direta** (favorito/link): efeito `initialPathDone` em `App()`, uma vez, depois que o usuário existe e DEPOIS
  do efeito que zera `workspaceMode` na troca de usuário: `modeForPath` → `canOpenMode` (mesmas regras de acesso da tela
  inicial) → `setWorkspaceMode` + `replaceState` (não empilha histórico). Sem acesso ao módulo → volta pra `/`. Endereço
  desconhecido → `/`. Deslogado: o login aparece com a URL guardada e, depois de entrar, cai direto no módulo (testado).
  Logout limpa a URL pra `/`. Hash do XFlow (`/#30`) segue tratado pelo efeito próprio (este sai cedo se há hash numérico).
- `popstate` sem `navTag` (entrada aberta por favorito) deduz o módulo pela URL.
- Brinde: `knowledge` e `pareceres` ganharam tag própria em `locationTag`/`applyLocationTag` — antes caíam em
  `company` e o Voltar do navegador a partir deles ia pra tela errada (quirk anotado no §68, agora corrigido).
- Servidor: nada a mudar — `app.get('*')` já devolve o `index.html` pra qualquer caminho fora de `/api`.
**Regressão que o teste pegou (corrigida antes do deploy)**: a 1ª versão limpava pra `/` todo endereço desconhecido, e
os hooks rodam ANTES do `return` que desenha `/quadro/:token` e `/reuniao/:token`; com o usuário logado o link público
era reescrito e abria a tela inicial. Agora `/quadro/…` e `/reuniao/…` nunca são tocados (conferido nos dois, logado).
Verificado: 17 checagens em Node (`routes.js`) + browser: card → URL muda, Voltar/Avançar, recarregar em
`/gestao-atividades`, `/gestaoatividades` → normaliza, `/conhecimento`, `/agenda`, casinha e Sair → `/`, Voltar de
Pareceres, login com link guardado, endereço inventado → `/`, links públicos preservados. NÃO testado: usuário sem
acesso batendo no endereço (regra coberta só em Node), XFlow por URL (conta de teste sem acesso), produção.
Pendência possível: favoritar uma PÁGINA específica do quadro (hoje o endereço leva ao quadro, na aba padrão).

## 75. "0d" numa segunda-feira para algo aberto no domingo (2026-10-05)

O Rafael abriu 4 atividades no domingo e na segunda-feira o selo do cartão (`⏱ Nd`, "Sem movimentação há N dias") dizia
`0d`; esperava 1. **Causa**: `daysSinceCardMovement` (App.jsx) fazia `floor((agora − momento) / 86400000)` — conta blocos de
24 h, não dias. Aberto domingo 18h, só virava "1d" na segunda 18h. **Correção**: `calendarDaysSince(iso)` em
`src/lib/dates.js` (módulo puro) reduz cada data ao número do dia no fuso LOCAL (`Date.UTC(ano, mês, dia)` locais) e
subtrai — domingo → segunda = 1 dia a qualquer hora; 23:50 → 00:10 = 1; futuro nunca negativo; vazio/inválido = `null`
(o cartão trata como 0). Usado também em `XFlow.jsx` `daysSince` (idade do bug e faixas de envelhecimento — mesmo erro, não
pedido mas idêntico; as faixas de filtro "aging" podem mudar de bucket 1 dia mais cedo, é o comportamento correto).
Efeito colateral intencional: o tom do selo (`staleTone`: ≥3 aviso, ≥7 crítico) agora também conta dias de calendário.
Auditado (`grep 86400000`): os demais contadores (`parseDate` diff, atrasadas, Visão Geral, `todoUtils`) já comparam
DATAS "YYYY-MM-DD", não instantes — não tinham o erro. O Rafael também pediu pra checar o log do horário exato de abertura:
em produção, `card.createdAt`; não precisei consultar. Verificado: 11 checagens em Node com `TZ=America/Sao_Paulo`
(inclui a conta antiga dando 0 no caso dele, virada de mês e de ano) + browser com cartões criados ontem 20h (→ 1d),
hoje 00:05 (→ 0d), anteontem 23h (→ 2d) e há 8 dias (→ 8d). Limite: depende do fuso do navegador de quem vê.

## 76. Widget do iPhone (Scriptable) (2026-10-05)

Pedido do Rafael: ver, ao pegar o iPhone, o que importa do painel, **sem autenticar**. PWA no iOS não faz widget; o caminho curto é o
app gratuito **Scriptable** + um endpoint só de leitura protegido por **token secreto**. Tocar no widget abre `/gestao-atividades`.
**Confirmado no iPhone real do Rafael** em 2026-10-05 (widget médio com atrasadas, hoje e reunião "Agora" do Google Calendar de produção).

**Estado final (como funciona hoje)**
- **Token** (`server/widget.js`, `/api/widget`): `POST /token` (cookie) gera `pxw_` + 32 bytes base64url; autentica pelo **sha256** em `users.widget_token_hash`
  (índice único parcial) e fica **também cifrado** (AES-256-GCM, chave derivada do `JWT_SECRET`, `users.widget_token_enc`) para o painel remontar scripts
  sem gerar código novo — `GET /token` (cookie, `no-store`) o devolve. Gerar outro invalida o anterior; `DELETE /token` revoga; `GET /status` informa
  `active`, `recoverable`, criado em, último uso. Trocar `JWT_SECRET` invalida os tokens cifrados (gera-se outro). Token antigo (só hash) não é recuperável:
  o painel avisa e pede um código novo uma vez.
- **`GET /summary`** é público e autenticado só por `Authorization: Bearer <token>` (nunca na URL; `?token=` dá 401). Bloqueado/expirado → 403. 30 consultas/min por IP
  (memória; 429). `no-store`. Só títulos e horários — sem descrição, convidados, local ou link. "Hoje" no fuso America/Sao_Paulo.
- **Visões** (`users.widget_views`, `GET/PUT /api/widget/views`, validação em `sanitizeViews`): até 6, nome de até 24 caracteres sem repetir (ignora maiúsculas), 1 a 5 blocos de:
  Atrasadas · Vencem hoje · **Urgentes** (cartões abertos com prioridade `urgente`, com ou sem data) · Próxima reunião · **Agenda de hoje e amanhã**. A 1ª é a padrão;
  `?view=nome` escolhe outra (nome desconhecido → `viewFound:false` + a 1ª). `/summary` continua devolvendo `overdue`/`dueToday`/`nextMeeting` (compatível com scripts antigos).
- **Resumo** (`server/widgetSummary.js`, funções puras): aberto = não concluído/excluído/arquivado; até 12 itens por lista e 14 na agenda; reunião = mesma regra da RENATA/Agenda
  (só accepted/organizer/unknown; fora dia inteiro, cancelado, "livre", recusado/pendente/talvez; em andamento = "Agora"). Agenda do Google lida de `listEvents` (−6 h a +3 dias), cache de 5 min por usuário;
  falha do Google não derruba o resumo.
- **Script** (`src/widget/scriptableScript.js`, gerado com endereço, token e **o nome da visão embutido** — um script por visão; o Parameter do widget, se preenchido, tem prioridade):
  pequeno/médio/grande; reparte um orçamento de linhas (médio 6, grande 16) entre os blocos com itens; cache por visão no iPhone ("offline" se a rede falhar); token revogado mostra mensagem clara;
  sem template literal dentro do script. O iOS decide a atualização (pedimos 15 min; na prática 15–30, não é tempo real).
- **Tela** (`src/widget/WidgetSection.jsx`, aba **iPhone** de Meu perfil): gerar/renovar/revogar código, lista de visões (editar blocos, adicionar, remover, salvar), **"Copiar script desta visão"**
  (desabilitado com alterações não salvas; nome sugerido "PRICETAX <visão>"; plano B em texto selecionável), passo a passo.
- **O que exige colar de novo**: criar visão nova, trocar o nome de uma, ou mudança no próprio script (ex.: o teto de linhas). Mudar os blocos de uma visão **não** exige.

**Como chegou aqui (decisões, em ordem)**: 1 script e 1 endpoint → visões escolhidas pelo Parameter → "um link por visão" (o Rafael via um só script, desatualizado, mesmo após criar visões) → token recuperável
para montar scripts a qualquer hora → teto de 5 itens por bloco era **nosso**, não do Scriptable (subiu para 12/14) → botão "Meu perfil" visível na tela inicial.

**Verificado**: lógica pura (Node); HTTP real (sem token, inválido, `?token=`, gerar, hash ≠ token, cifra ≠ token, recuperar, token antigo não recuperável, novo invalida o antigo, bloqueado, revogado, 429, `no-store`, visões);
script com globais simuladas (3 tamanhos, offline com/sem cache, 401, visão embutida × Parameter, nome com `$&` e aspas); tela no browser. **Não confirmado no aparelho**: vários scripts/visões e o limite de linhas do grande.

## 77. Meu dia, boas-vindas e Meu perfil em abas (2026-10-05)

Pedido do Rafael: transformar o painel num ecossistema para ele, os sócios e todo colaborador; na primeira entrada a pessoa
deve ser levada a **configurar a agenda e o que quer receber**, e poder **escolher conteúdos diários** (católico, cristão,
horóscopo, horóscopo chinês, sabedoria, inspiração) — visível, não escondido; e o Meu perfil deve ser "extremamente funcional".

- **Meu perfil em abas** (`MyProfileModal`, App.jsx): Perfil (avatar + senha), **Meu dia**, Agenda (Google Calendar), iPhone
  (widget, §76). Abre direto na aba certa (`openProfile(tab)`). O botão **"Meu perfil"** (avatar + texto) fica no cabeçalho da **tela inicial** — antes o perfil só abria de dentro da lista de
  Empresas e ninguém achava; os outros módulos (Agenda, Atividades…) seguem sem o atalho.
- **Boas-vindas** (`src/daily/WelcomeSetup.jsx`, montada por `useWelcomeSetup` numa raiz React própria, porque o App tem dezenas de
  retornos por módulo): 3 passos (conectar Google · montar o dia · pronto) por cima de qualquer tela, para quem tem
  `onboarding_done_at` nulo — **inclui todos os usuários já existentes, uma vez**. "Agora não" também marca como feito (não insiste);
  tudo continua em Meu perfil. Voltando do OAuth do Google com onboarding pendente, a aba Agenda só abre quando já concluiu.
- **Tela inicial** (redesenhada duas vezes no mesmo dia; versão atual inspirada num mockup que o Rafael trouxe): logo abaixo do "Olá, <nome>" vem uma **saudação do conteúdo escolhido** ("Que a Palavra de Deus ilumine o seu dia." no
  evangelho; uma frase própria para cada tipo) com um traço dourado, e o card único **"Mensagem do dia"** (`src/daily/DailyCards.jsx`, 760 px; a grade de módulos também foi para 760): cabeçalho com ícone redondo + descrição do conteúdo + "Personalizar";
  abas com **ícone** (Evangelho, Versículo, Sabedoria, Horóscopo, Chinês, Inspiração; a ativa em dourado e rolada para o centro no celular; lembra a última em `localStorage` `pt-daily-sel`); corpo com título grande, **selo "cor verde"** da liturgia,
  referência em dourado e texto em 4 linhas (a Inspiração mostra a frase em destaque + "— autor · tema"); botão **"Ler completo"** (modal com o texto inteiro, leituras, crédito/fonte; Esc fecha) e **Compartilhar** (`navigator.share`, senão copia o texto);
  à direita um **painel ilustrado** (gradiente dourado com o ícone do conteúdo; some abaixo de 720 px; tema escuro tem versão própria). Cores do app (ouro `#F5C400` com texto escuro, não branco sobre ouro, por contraste). Ordem da tela: Olá → saudação → Mensagem do dia → RENATA
  (agenda) → "Onde você quer trabalhar agora?" → módulos. Sem nenhum item escolhido: convite "Monte o seu dia"; "Personalizar" abre Meu perfil > Meu dia; "Ver o conteúdo do dia" desligado = some.
  **Do mockup que NÃO foi feito**: a foto (Bíblia e cruz) — não há imagem própria, o painel é gradiente + ícone —, e o botão **salvar/favoritar** (seria meia-funcionalidade sem um lugar para ver o que foi salvo; precisa de decisão do Rafael).
- **Dados** (aditivos em `db.js`): `users.preferences` JSONB `{enabled, cards[], birthDate}`, `users.onboarding_done_at`,
  tabela `daily_content(kind,key,day)` = cache. `rowToUser` ganhou `onboardingDone`. Rotas `/api/daily`: `GET /` (cartões do usuário,
  `no-store`), `GET/PUT /preferences` (valida cartões e data: AAAA-MM-DD real, 1900..hoje; ordem canônica), `POST /onboarding-complete`.
  A data de nascimento é do próprio usuário (só ele lê/grava) e serve só para signo e animal.
- **Fontes** (`server/dailyContent.js`; cada uma buscada UMA vez por dia, não por usuário; timeout 8 s; falha → cartão "Indisponível",
  nova tentativa só após 10 min): **Evangelho** = Liturgia Diária (`liturgia.up.railway.app/v2`, comunitária, NÃO oficial da CNBB — o cartão avisa);
  **Versículo** = Midvash `/v1/votd?language=pt-br`; **Sabedoria** = Provérbios (lista de 30 passagens rotativa por dia do ano) via Midvash,
  Bíblia Livre CC BY 4.0 — **o crédito aparece junto do texto (obrigatório)**; **Horóscopo** = AstroWay `lang=pt` (12 signos, 12 chamadas/dia,
  limite 30/h por IP); **Horóscopo chinês** = texto **gerado por IA** (`claude-haiku-4-5`, UMA chamada por dia com os 12
  animais, `messages.parse`), sempre marcado como IA/entretenimento. **Inspiração** = **frase do dia de Ayrton Senna**, NÃO IA: base curada em `server/inspirationQuotes.js` (ver "Frases do Senna" abaixo).
  Signo ocidental e animal chinês calculados no servidor (animal pelo calendário chinês do próprio runtime via `Intl`, que acerta quem nasceu
  em jan/fev antes do Ano-Novo Lunar; conferido em 12 datas).
- **Fontes que a pesquisa recomendou e NÃO usei** (testadas em 2026-10-05): ABíbliaDigital (HTTP 503), Ferramentas da Web de frases
  (sem resposta), Ditado API (deploy removido), DivineAPI (exige chave, 14 dias de teste). Frases de autores famosos ficaram de fora até o Rafael trazer uma lista própria (Senna, ver abaixo): não há API
  confiável e o risco é a atribuição falsa.
- **Frases do Senna (2026-10-05)** — pedido do Rafael: "aprenda essas frases do Senna, imputa na memória da RENATA" e usar em *Mensagem do dia › Inspiração*. A lista veio de uma pesquisa colada por ele; **antes de usar, conferi na fonte**:
  a página oficial `senna.com` ("Confira dez frases motivacionais de Ayrton Senna", 23/06/2022) traz 10 frases. **Quatro** das 12 da pesquisa batem palavra por palavra (Vencer é o que importa…; O segundo… dos perdedores; O medo me fascina; Nas adversidades…); a página tem **outras seis** que a pesquisa
  não trazia e que entraram (dedicação total; "Seja você quem for…"; "Não sei dirigir de outra maneira…"; empenho/"meio termo"; "O medo faz parte da vida da gente…"; "Vencer sem correr riscos…"). As **8 restantes** da pesquisa (TAG Heuer, Suzuka 1988, McLaren Senna 2017, Jackie Stewart 1990, Roda Viva 1986 ×2, acervo, Folha 1994) **não consegui conferir**;
  a do TAG Heuer ("Quando chego ao meu limite, descubro que tenho força para ir além") tem redação **diferente** da oficial — marcada como provável paráfrase.
  Duas camadas que nunca se misturam (`verification` em `server/inspirationQuotes.js`): `oficial` (10 do Senna + 12 do Ford) → vai para a Mensagem do dia (uma por dia, `quoteOfDay`, determinística por data, rotaciona as 10; cartão mostra a frase, "— Ayrton Senna · tema", fonte e link) e para a RENATA; `pesquisa` (8) → **só na memória da RENATA, com a ressalva escrita no fato** ("NÃO conferida — diga isso ao citar").
  **Memória da RENATA** (Senna: 19; com o Ford são 33 fatos `akf-quote-*`): fatos org da organização PRICETAX em `ai_knowledge_facts` (1 regra "Como citar Ayrton Senna" + 18 frases; ids fixos `akf-quote-*`, `origin='other'`), semeados no boot (`seedQuoteFacts`, idempotente, `ON CONFLICT DO NOTHING` — edição feita depois na Central de Conhecimento não é sobrescrita; embeddings em melhor esforço, `embedQuoteFacts`).
  **Cuidado com a janela de contexto**: `loadRelevantFacts` pega os 30 fatos de org mais recentes para TODA pergunta; 19 fatos novos de uma vez a inundariam. Por isso os `akf-quote-*` ficam **fora** da janela geral e só entram quando a pergunta casa `QUOTE_TRIGGER` (senna/ayrton/frase/citação/inspiração/motivação).
  **Henry Ford (2026-10-05, mesmo método)**: o Rafael colou outra pesquisa (12 frases + 3 "famosas que exigem cuidado"). Conferi **todas as 12** na lista oficial completa do Benson Ford Research Center / The Henry Ford (PDF "Long Version", 57 páginas, e a página `thehenryford.org/…/henry-ford-quotes`):
  cada uma está lá, com a fonte e a data que a pesquisa trouxe (Ford News 1922–1926, NYT 11/04/1915, New Orleans Times-Picayune 22/07/1934, Cincinnati Times-Star 11/11/1937, N.Y. World-Telegram 26/07/1933); **o texto em inglês de cada uma foi conferido por teste automático contra o texto extraído do PDF** (uma delas, a #3, quebra entre colunas do PDF e foi conferida em duas metades). Todas entram como `oficial` e são **traduções livres**: o original em inglês fica guardado ao lado e aparece em "Ler completo" com o aviso "Tradução livre"
  (a #12 usei tradução própria, mais fiel ao original que a da pesquisa). A frase do dia **alterna Senna e Ford** (22 frases oficiais, intercaladas por autor). Na memória da RENATA: 12 fatos `akf-quote-ford-N`, a regra "Como citar Henry Ford" e um fato de **aviso** com as 3 frases que NÃO constam da lista autenticada — "faster horses" (o próprio museu diz que nunca foi rastreada até Ford), "se você pensa que pode ou que não pode…" e "o fracasso é apenas a oportunidade de começar de novo…" (esta última: não consta da lista; a origem não foi verificada por mim) — para a RENATA avisar em vez de citar como dele. `QUOTE_TRIGGER` ganhou "henry ford", "cavalos mais rápidos", "pensa que pode", "começar de novo" (de propósito sem "ford" solto, para um cliente chamado Ford não carregar as 33 frases).
  A IA deixou de escrever a inspiração (o campo saiu do schema do Haiku). **Não testado**: a RENATA respondendo de fato (sem `ANTHROPIC_API_KEY` local — conferido só o que entra no contexto); embeddings locais falharam (chave Voyage inválida aqui), seguem só com busca por palavras.
- **Verificado**: fontes reais (liturgia, versículo, sabedoria, horóscopo) e cache; IA com cliente simulado (uma chamada para 3 pedidos
  simultâneos, falha degrada sem derrubar); validação da API; fluxo completo no browser (boas-vindas → 3 passos → cartões → Personalizar → salvar)
  em desktop e celular. **Não testado**: a chamada real à IA (Haiku com saída estruturada) — sem `ANTHROPIC_API_KEY` local; se falhar em
  produção, os dois cartões de IA mostram "Indisponível" e o log traz `Meu dia: falha em ...`. Também não testado: Google OAuth real no
  fluxo de boas-vindas. "Receber mensagens" foi entendido como ver o conteúdo do dia; não há e-mail/WhatsApp/push no painel.

## 78. Modelos de documentos (2026-10-05)

Pedido do Rafael: uma aba **irmã dos Pareceres** para **modelos de documentos**, com **links com pré-visualização** e arquivos (PDF, Word, PowerPoint, Excel, HTML…), e **mais de um tipo de
documento por título** (o mesmo modelo em Word, Excel, PDF…). Módulo `modelos` (`/modelos`, card "Modelos de documentos" na tela inicial), **só master/pricetax** (mesma regra dos Pareceres:
`requireMasterOrPricetax` + `effectiveOrgId`; `canOpenMode`/`hasModelos`).

**Modelo e anexos**
- Um **modelo** (`document_templates`: título, categoria livre com sugestões, "para que serve", comentários) tem até **12 anexos** (`document_template_items`, cascade): arquivo (BYTEA) e/ou link
  (`url` + `link_meta` JSONB), com `preview_text` para Office. As colunas de arquivo/link de `document_templates` são **legado**: `initDb` migra cada linha antiga para 1 anexo (idempotente, conferido rodando 2×)
  e zera o `file_data` antigo para não duplicar.
- **API** (`server/documentTemplates.js`, `/api/templates`): `GET /` (modelos com a lista de anexos, sem o conteúdo), `POST /` (cria o modelo já com o 1º anexo), `POST /:id/items` (soma um anexo por requisição),
  `PATCH /:id` (título/categoria/descrição), `PATCH /:id/items/:itemId` (troca o endereço e/ou refaz a prévia de um link), `DELETE /:id/items/:itemId` (não remove o último), `DELETE /:id`,
  `GET /:id/items/:itemId/file` (`?download=1` força baixar; `GET /:id/file` antigo devolve o 1º arquivo), comentários como nos Pareceres. Corpo JSON de `/api/templates`: parser próprio de **45 MB**
  montado antes do global de 15 MB (`index.js`); arquivo de até **30 MB**; acima disso a tela manda usar link.

**Arquivos e segurança**
- Lista fechada de extensões: pdf, doc/docx/rtf/odt, ppt/pptx/odp, xls/xlsx/ods/csv, txt, **html/htm**, png/jpg/gif/webp. SVG, JS, executáveis e qualquer outra são recusados (servidor e, já ao escolher, a tela).
  `Content-Type` decidido pelo servidor pela extensão (nunca o do navegador), `nosniff`, `no-store`; só PDF, imagem, txt e HTML abrem inline, o resto baixa.
- **HTML aceito, mas isolado**: servido com `Content-Security-Policy: sandbox; default-src 'none'; …` — sem `allow-scripts` e sem `allow-same-origin`: não executa script, não lê cookie, não chama a API,
  **nem aberto direto numa aba** (conferido no browser: o `<script>` do arquivo não rodou e `document.cookie` deu SecurityError). Na gaveta a prévia é um `<iframe sandbox>`.

**Pré-visualização**
- PDF, imagem, HTML e txt abrem na própria gaveta. **docx/pptx/xlsx** mostram o começo do conteúdo (`server/officePreview.js`: leitor de ZIP com o `zlib` do Node, sem dependência nova, teto de 6 MB por entrada contra zip bomb;
  docx = primeiros parágrafos, pptx = nº de slides + títulos, xlsx = nomes das planilhas). `.doc/.ppt/.xls` antigos só mostram ícone + baixar. **Não há miniatura de PDF/Office** (exigiria converter no servidor).
- **Links** (`server/linkPreview.js`): o servidor busca a página e lê `og:title/description/image` (fallback `<title>`/`description`). **Defesa contra SSRF**: só http/https, sem usuário/senha; DNS validado **na conexão**
  (`lookup` próprio, sem janela de rebinding), recusa endereço privado, loopback, link-local/metadados (169.254.x), CGNAT, multicast e IPv6 equivalentes; redirecionamentos refeitos e revalidados (máx. 3); corpo ≤ 300 KB, só text/html, 6 s.
  Falha ou endereço bloqueado **não** impede salvar (`link_meta.ok=false`). Páginas com login (Drive, SharePoint) só dão o domínio. A imagem da prévia vem direto do site de origem (`referrerPolicy=no-referrer`).

**Tela** (`src/modelos/`, esqueleto `par-*` dos Pareceres + `mdl-*`): cartões com capa (imagem do link, imagem pequena ou ícone por tipo), um selo por tipo presente e "N anexos"; busca (olha todos os anexos) e filtros por categoria e por tipo;
gaveta com os anexos como botões (cada um com a sua prévia), adicionar/remover anexo, editar título/categoria/descrição (autosave `useDebouncedField`) e o endereço de um link, atualizar prévia, comentários, excluir o modelo.
Novo modelo: vários arquivos de uma vez (arrastar e soltar) + links; se um anexo do meio falha, o modelo fica criado e a tela avisa quais não subiram.

**Verificado**: extração de docx/pptx/xlsx reais (corrompido → vazio); 15 endereços privados e 6 URLs hostis bloqueados; prévia real de example.com, github.com e gov.br; API (401/403, isolamento por organização, extensões proibidas,
31 MB recusado e 29 MB aceito, limite de 12 anexos, headers de arquivo e do HTML, SSRF, migração de linhas legadas, cascade); tela no browser (vários anexos, HTML isolado, adicionar/remover, filtros, mobile).
**Não testado**: abrir PDF real na gaveta (o painel de teste não renderiza PDF; o cabeçalho inline foi conferido por HTTP), upload acima de ~10 MB pela tela, links de Drive/SharePoint reais.

## 79. Consolidação da documentação (2026-10-05)

O Rafael pediu para consolidar "tudo que foi feito hoje e nos dias anteriores" e perguntou se a documentação estava atualizada. **Não estava por inteiro.** Auditoria feita contra o código:

| Achado | Correção |
|---|---|
| Cabeçalho dizia "última validação 2026-08-18" e não havia visão do conjunto | §0 novo: mapa dos módulos (endereço, acesso, seções, código) + linha do tempo |
| §4 listava 7 variáveis; o código usa também `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GOOGLE_*`, `APP_BASE_URL`, `GIT_COMMIT` (+ `RAILWAY_TOKEN` local) | tabela refeita |
| §5 dizia "7 tabelas"; `initDb()` cria **44** e `users` ganhou 8 colunas novas (`crm_role`, `preferences`, `onboarding_done_at`, 5 do widget) | contagem, coluna de `users` e tabela de grupos das outras 37 |
| §6 dizia "nenhuma outra API externa" e "sem jobs"; há Anthropic, Voyage, Google, 3 fontes de conteúdo, prévia de link, geolocalização, o agendador do CRM e trabalhos em processo | §6 refeito |
| §8 só tinha o núcleo de `routes.js`; faltavam 12 roteadores | §8.1 com o mapa completo |
| §9/§14: "App.jsx ~6970 linhas" (hoje ~9.900) e "README desatualizado" | contagens; README reescrito |
| §3 mandava "sempre confirmar antes do push", contrariando a instrução vigente do Rafael (commit+push direto; 2026-08-25) | §3 alinhado e com a verificação pós-deploy; `CLAUDE.md` também |
| §15 não refletia o que está em aberto nem o que foi entregue sem ser visto funcionando | §15 reescrito em 4 grupos |
| §16/§17 não tinham os padrões e bugs de 2026-10 | §16.1 e lista em §17 |
| §76–§78 tinham sido escritos por acréscimo e se contradiziam (ex.: "script mostrado uma vez", "HTML recusado", "aba Arquivo/Link") | reescritos no estado final, com as decisões em ordem |
| `docs/PROJECT_MAP.md`: índice de componentes com linhas de 2026-08, §7 só com as primeiras rotas, tabelas e arquivos novos sem linha | índice regenerado do código; §6/§7 completados; arquivos novos incluídos |

**Como manter**: ao fechar uma entrega, atualizar no mesmo dia (1) a seção dela, (2) o §0 se um módulo nasceu/mudou de acesso, (3) o §15 (o que ficou sem teste real), (4) o `PROJECT_MAP`. Quando houver dúvida, o **código manda** — conferir antes de confiar no texto.

## 80. API de conectividade — outra janela do Claude Code usa o painel (2026-10-05)

Pedido do Rafael: "criar uma API ou um documento de conectividade" para ele se conectar à ferramenta **de outra janela do Claude Code**. Escolhas dele: permissão **ler e criar atividades**
e formato **token + guia pronto** (não servidor MCP). Documento de referência: `docs/CONECTIVIDADE_CLAUDE_CODE.md`.

**Como o usuário usa** — Meu perfil › aba **Conectar** (`src/connect/ConnectSection.jsx`): nome, permissão (**Ler e criar atividades** | **Só ler**) e validade (30/90/180/365 dias) → **Gerar token** `pxk_…`
(mostrado uma vez) → dois botões: *1. Copiar comando do token* (`export PRICETAX_URL=… PRICETAX_TOKEN=…`) e *2. Copiar guia para o Claude Code* (`src/connect/guide.js`, **sem** o token). Lista de tokens ativos com último uso e revogação.
Um token por janela; até 10 ativos por pessoa.

**API** (`server/connect.js`, `/api/connect`; credencial só em `Authorization: Bearer`, nunca na URL; 120 req/min por token; criação limitada a 60/h):
`GET /` (índice público, sem segredo) · `GET /me` · `GET /activities?status=open|overdue|today|urgent|done|all&q=&limit=` · `POST /activities` (escopo `read_create`: `title`, `desc`, `dueDate`, `priority`, `board`, `column`, `ref`) ·
`GET /companies?q=` · `GET /companies/:id` · `GET /companies/:id/meetings/:meetingId[?transcript=1]` · `GET /agenda?days=` (só Google do dono, compromissos aceitos/próprios). Gestão dos tokens: `GET/POST/DELETE /tokens` (cookie).

**Segurança (decisões)**
- Só o **sha256** do token fica em `api_tokens` (não recuperável); revogação/validade/bloqueio do usuário valem na hora (401/403).
- **API estreita e estável, não a sessão do usuário**: o token só abre `/api/connect/*` — não serve em `/api/users`, organizações, widget, notificações nem em rota interna; o cookie de sessão não vale na API de conectividade.
- Respeita o acesso de quem gerou: empresas por `canAccessProject` + mesma organização (empresa de outra organização → 404, testado); atividades só do quadro pessoal dele; agenda só a dele.
- Escrita mínima: criar atividade no quadro pessoal (cartão com `createdVia:'api'`, autor "<nome> (via API)", histórico com o nome do token). Não edita nem apaga. `ref` = idempotência (repetir devolve a mesma, `created:false`).
- Fora da API de propósito: editar/apagar atividades, Pareceres, Modelos, CRM, XFlow, perguntas à RENATA, usuários/administração — cada um pede decisão de escopo.

**Problema real resolvido junto: o painel aberto apagaria a atividade criada pela API.** O painel salva o quadro **inteiro** (§16) e só carregava o quadro uma vez, então o próximo autosave removeria cartões que ele não conhecia. Duas camadas:
1. **Atualização do painel**: `GET /personal-board/version` (só o carimbo `updated_at`); a cada ~12 s (e ao voltar para a aba) o `App()` compara com `personalBoardVersionRef` e recarrega o quadro **somente se não há edição local pendente** (`personalBoardBusyRef`). Pausa com a aba oculta.
2. **Rede de segurança no servidor** (`mergeApiCards`, `server/routes.js`): `PATCH /personal-board` agora recebe `baseUpdatedAt` (última versão que o painel conheceu) e, dentro de transação com `FOR UPDATE`, devolve ao quadro os cartões `createdVia:'api'` criados **depois** dessa versão que o painel não tem (ele não pode tê-los apagado). A resposta traz `merged` e o painel adota o quadro devolvido (com edição pendente, mantém a versão antiga para mesclar de novo). A API grava `updated_at` = o mesmo instante de `card.createdAt`, que é o que torna a comparação exata. Cartão apagado de propósito **depois** de aparecer não volta.

**404 em JSON para rota inexistente** (`server/index.js`): apontado pelo teste de outro Claude contra produção — `/api/health` devolvia HTML com 200. Corrigido; rotas reais e caminhos do SPA (`/`, `/pareceres`, `/quadro/…`) conferidos sem mudança.

**Verificado**: HTTP real (criar/listar/revogar token; 401 sem/errado/`?token=`/cookie; 403 escopo e usuário bloqueado; token vencido; limites de 10 tokens, 120/min e 60 criações/h; validações de título/data/prioridade; coluna por nome com mensagem listando as colunas; `ref` idempotente; abertura registrada nos Indicadores;
isolamento entre usuários e entre organizações; os três cenários da rede de segurança), a aba no browser e o fluxo completo com **`curl` simulando a outra janela** com o painel aberto — a atividade apareceu sozinha em ~4,5 s e, numa corrida real (API cria enquanto o painel edita), os dois cartões sobreviveram.
`docs/testar-conectividade.sh` roda os testes de leitura e de segurança contra qualquer endereço (validado contra o servidor local; ainda não rodado em produção com token real).
**Não testado**: uma segunda janela real do Claude Code lendo o guia; `GET /agenda` com Google real; produção com token real.

## 81. Plano de usabilidade e front (2026-10-05) — Ondas 0 e 1 IMPLEMENTADAS, Ondas 2-6 só plano

Pedido do Rafael: um portal em que o usuário queira ficar (e cobrar melhorias), com varredura de Voltar, atalhos entre módulos, redundâncias, "fantasmas" e botões de salvar/editar/comentar/link/print.
Resultado: `docs/PLANO_USABILIDADE.md` — diagnóstico em números (667 botões, 15+ famílias visuais, 58 `confirm/alert/prompt`, só ~6 telas com Esc, colar print só no XFlow, 3 modelos mentais de salvar), tabela de Voltar/atalhos por tela,
lista de perda de dado/cliques mortos, redundâncias e **7 ondas**: 0 parar a perda de dado · 1 casca única (`ModuleShell`, busca Ctrl+K, Esc/Voltar do navegador) · 2 design system de ações (`ConfirmDialog`, `Toast` com Desfazer, `Button`) · 3 `ComposeBox` (comentar/@/print/link/arquivos em todo módulo) ·
4 salvar sem pensar (`SaveStatus`) · 5 "Hoje" acionável, navegação cruzada, notificações que navegam · 6 visual/linguagem/mobile.
Método: 5 auditorias de leitura em paralelo + contagens próprias; os achados mais graves foram **conferidos no código** (marcados [C] no plano): remover usuário sem confirmação, XFlow limpando o rascunho antes do servidor responder, Esc/X do CRM sem guarda,
ficha da empresa do CRM sem `key`, "Nova atividade" gravada antes de digitar, "Ir para Empresas" que leva ao Início. O restante vem dos relatórios ([R]) e deve ser conferido ao implementar. Defeito meu achado: o token da aba **Conectar** some ao trocar de aba (Onda 0).

### Onda 0 — implementada (2026-10-05): parar a perda de dado e a UI que mente
Primitivas novas: `ConfirmDialog` em `src/ui/index.jsx` (props `title/message/confirmLabel/danger/requireText/onConfirm/onCancel/busy/error`; Esc cancela, foco em Cancelar ou no campo de confirmação, `role=alertdialog`) e o padrão **excluir = toast com Desfazer** (`pushAppUndoToast` no `App`, `pushUndoToast` do `useToasts` nas telas). Regra: exclusão destrutiva pede o nome digitado (empresa, página do quadro com cartões, usuário); exclusão pequena e reversível vira toast "Desfazer".
- **Usuários**: excluir exige digitar o login; bloquear pede confirmação e o ícone de bloquear é cadeado (não mais lixeira vermelha); `deleteUser`/`addUser` devolvem o erro e o "Novo usuário" mostra o erro **dentro** do modal (só fecha no sucesso).
- **Empresas**: excluir exige digitar o nome (`CompanySelectorScreen`); pausar projeto tem toast Desfazer (o `ToastStack` do `App` também é renderizado na tela do seletor — telas que retornam cedo no `App` precisam do seu próprio `ToastStack`).
- **"Nova atividade/reunião"** em empresa: o registro nasce ao abrir o modal (o modal precisa dele) mas é **removido ao fechar se nada foi tocado** (`isUntouchedNewActivity/Meeting`, effects em `openActivityId/openMeetingId`); não vai para a Lixeira.
- **Guarda honesta de saída**: atividade e reunião só consideram "sujo" o que **não foi persistido** (`fieldsPending`/`hasDraft`); descartar não reverte o que já foi salvo; a transcrição colada (`TranscriptSubmitModal`) pede confirmação ao fechar.
- **Aba Conectar** (Meu perfil): sempre montada (token não some ao trocar de aba) e fechar com token novo não copiado pergunta antes (`onAtRiskChange`).
- **Quadro pessoal**: chips de filtro ativo + "Limpar tudo", "N oculta(s) por filtro · limpar" por coluna, "Ir para Empresas" vai para Empresas (antes caía no Início), excluir página/coluna com confirmação + Desfazer, desfazer de comentário/checklist/anexo/link/subatividade/tarefa de reunião; `NoAccessScreen` ganhou "Voltar ao início"; sensores `MouseSensor`+`TouchSensor`(250 ms)+Keyboard no quadro pessoal, XFlow e CRM (sem `touchAction:none`).
- **XFlow**: rascunho só é limpo após sucesso (`runAction` devolve boolean), erro de carga com "Tentar de novo".
- **CRM**: guarda de alterações não salvas em todos os formulários (`Modal dirty/locked`, `useDraftGuard`), `key` na ficha da empresa/negócio, assistente de importação não fecha enquanto importa.
- **Pareceres/Modelos**: nenhum `catch` engole erro — carga com falha mostra aviso + "Tentar de novo"; salvar mostra estado; exclusões com `ConfirmDialog`.
**Testado de verdade** (browser local, 2026-10-05): quadro (chips/ocultas/limpar), excluir página (campo de nome bloqueia o botão), "Ir para Empresas", pausar+Desfazer, excluir empresa (diálogo), bloquear usuário (diálogo), criar usuário duplicado (erro inline e modal aberto), "Nova atividade" fechada vazia (volta a 11 cartões, Lixeira 0), CRM (guarda Continuar editando/Descartar), Pareceres e Modelos com API falhando (aviso + tentar de novo), XFlow com criação falhando (erro no formulário e rascunho mantido), mobile 375 px do quadro, aba Conectar (token persiste entre abas; fechar sem copiar pergunta). **Achado no teste**: o diálogo de excluir empresa tinha ido para o componente errado (`App`, onde `deleteTarget` não existe) e quebraria a tela da empresa — corrigido; o build não pega isso, por isso rodei `no-undef` do ESLint em `src/` e conferi componentes JSX.
**Não testado**: arrasto por toque em aparelho real (iPhone/Android); desfazer de anexo/link/comentário/checklist/subatividade/tarefa de reunião e exclusão de coluna/página até o fim (só o diálogo); guardas das reuniões/transcrição no browser; caminhos de falha do XFlow além da criação; fluxos do CRM além do formulário de empresa. Limites conhecidos (já existiam): `addItems` do XFlow com falha parcial duplica ao repetir; `useDebouncedField` pode sobrescrever o que foi digitado se a resposta do servidor chegar tarde; trocar o drawer do CRM por `pendingOpen` não passa pela guarda.

### Onda 1 — implementada (2026-10-06): uma casca só
**Arquitetura.** `export default App` agora é uma raiz fina (`App.jsx`, fim do arquivo): renderiza `<ShellHost>` (a barra) + `<AppScreensMemo>` (o antigo `App`, renomeado `AppScreens`, com todas as telas). Cada render de `AppScreens` publica em `shellRef.current` o que a barra precisa (`sig`, usuário, módulos, notificações, callbacks, `profileNode`); um `useEffect` sem deps compara `sig` e chama `bump()` só quando muda; os callbacks são lidos na hora do clique (`call('onGo')`), então nunca ficam velhos. Telas públicas, login, carregando e `NoAccessScreen` setam `shellRef.current = null` (sem barra). `MyProfileModal` agora é renderizado **uma vez** pelo `ShellHost` (antes só em 3 telas).
- **`src/shell/ModuleShell.jsx`**: barra sticky de 48 px — `← Início` (texto), seletor de módulos (os que a pessoa pode abrir + Usuários p/ master), busca, sino (`NotificationBell`), menu da conta (Meu perfil / tema / Sair). **`CommandPalette.jsx`** (Ctrl/Cmd+K): módulos, empresas, atividades, reuniões e cartões do quadro pessoal já carregados no cliente (`buildSearchItems` no `AppScreens`; cartão pessoal abre via `pendingPersonalOpen`). **Não** busca no servidor (tickets do XFlow, CRM têm a própria busca).
- **Cabeçalhos de módulo** perderam tudo que a barra faz (Início, Sair do X, tema, sair, sino, perfil, atalhos "Ir para…"): Gestão de Atividades, Empresas (workspace e seletor), XFlow, Agenda, Visão Geral, Conhecimento, Pareceres, Modelos, CRM, Usuários, Super Admin. Onde existe um "voltar" **interno** (Usuários/Org dentro do fluxo de empresas) ele virou "← Voltar" com texto. `.page-root` desconta os 48 px (`min-height: calc(100dvh - var(--shell-h))`).
- **`src/lib/nav.js`**: `useEscClose` (Esc fecha o item de cima — pilha global; ignora `defaultPrevented`, então campos que tratam Esc com `preventDefault` não fecham o modal), `useBackLayer` (empilha uma entrada no histórico; Voltar fecha em vez de sair do módulo; se a guarda segurar, repõe a entrada; tolera StrictMode), `useDialog` (role/aria-modal, foco preso e devolvido, Esc, Voltar), `useHistoryValue`/`readHistoryValue` (aba/visão interna empilha e o Voltar restaura), `withoutLayer` (ao empilhar uma NAVEGAÇÃO — abrir atividade/reunião/cartão — tirar `backLayer` do state, senão a camada ao desmontar dá `history.back()` e desfaz a navegação). **`src/ui/dialog.jsx`**: `DialogOverlay` (use no lugar do `<div onClick=fechar>` do overlay; `history={false}` p/ quem já empilha o próprio histórico: ActivityDetail, MeetingDetail, PersonalCardDetail, ConfirmDiscard, ticket do XFlow). Aplicado aos 13 modais/gavetas do `App.jsx`, `SidePanel`, sino, e a todos os modais de XFlow/CRM/Conhecimento/Pareceres/Modelos/Reuniões/RENATA/Daily. `src/pareceres/ModulePanel.jsx` é uma réplica do `SidePanel` sobre `DialogOverlay` (o SidePanel do App já usa `DialogOverlay`: dá para trocar e apagar o ModulePanel).
- **Voltar do navegador em sub-estados**: aba do Conhecimento, página do CRM, visão da Agenda, período da Visão Geral, aba da empresa (`companyView`); gavetas/modais fecham com Voltar. XFlow manteve o próprio histórico (`xflowSub`, `detailTicket`); o Voltar com rascunho de comentário/ação agora pergunta antes (`backGuardRef`).
- Bugs achados no caminho e corrigidos: `NewTicketModal` do XFlow considerava um formulário **intocado** como alterado (o editor rico devolve `<p></p>`; existia antes) — normalizado; clicar no fundo do modal de compartilhar/gaveta TO_DO fechava a reunião inteira (propagação).
**Testado no browser local (2026-10-06):** barra em todos os módulos (sem botões duplicados, sem rolagem extra além do `margin` de 8 px do `body` que já existia), trocar de módulo pelo seletor, Ctrl+K (módulos, atividade da empresa abre o modal, cartão pessoal abre), Esc e Voltar no modal do perfil / "+ Empresa" do CRM (inclusive sujo: Voltar abre "Descartar?" e repõe a camada) / "Novo modelo" / "Nova TASK" (Esc→guarda, Esc→continua, Voltar→guarda), Voltar entre abas do Conhecimento e da empresa, entradas de histórico sem sobra depois de fechar, mobile 375 px (barra compacta).
**Não testado:** foco preso com Tab em cada modal; Esc em pilha com 3 níveis (reunião > gaveta TO_DO > compartilhar); Voltar na gaveta de empresa/negócio do CRM e na troca entre elas; fluxo XFlow criar TASK → abrir ticket → Voltar; leitor de tela; busca com muitos dados (a lista é montada no clique, em memória); `ModulePanel` em mobile. Limites: filtros (chips) de Pareceres/Modelos não empilham histórico de propósito; `FactDrawer` do Conhecimento continua sem guarda de alterações; popovers do `TodoBoard` e `window.confirm` de Connect/Widget ficaram como estavam (Onda 2).

| Preciso de... | Vá para |
|---|---|
| Localizar componente/função por linha em `App.jsx` | `docs/PROJECT_MAP.md` |
| Regras de padrão de código, arquivos que não mexer, comandos | `CLAUDE.md` |
| Detalhe de responsividade mobile por tela | `docs/RESPONSIVE_ARCHITECTURE.md` |
| Estudo de integração via Telegram Bot (não implementado) | `docs/TELEGRAM_BOT_ESTUDO.md` |
| Brief original completo da identidade/princípios da RENATA | `docs/RENATA_BRIEF.md` (resumo do que foi implementado em `PROJECT_CONTEXT.md` §27) |
| Histórico de decisões de produto/por quê de uma feature | memória de sessão (fora do repo) ou pedir contexto ao usuário |
