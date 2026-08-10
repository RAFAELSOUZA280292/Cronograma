# CLAUDE.md — PRICETAX Cronograma

Regras permanentes de trabalho. Leia `docs/PROJECT_MAP.md` **antes** de explorar o
projeto — ele indica onde cada funcionalidade mora (com números de linha em
`App.jsx`). Só faça busca ampla (`grep`/Explore agent) se o mapa não cobrir o
que você precisa, e atualize o mapa se descobrir algo estrutural novo.

## Stack

- Frontend: React 18 + Vite, **um único arquivo** `src/App.jsx` (~5500 linhas,
  sem roteador, sem Redux — tudo em `useState`/`useEffect` dentro de `App()`).
- Backend: Express (`server/`), Node ESM (`"type": "module"`).
- Banco: Postgres via `pg` (`server/db.js`), sem ORM.
- Deploy: Railway, build automático a cada `git push` na `main`. Repo GitHub:
  `RAFAELSOUZA280292/Cronograma`. Working dir local **não é** um repo git —
  deploy é feito via clone/rsync/commit/push num diretório separado.
- Drag-and-drop: `@dnd-kit/*` (usado só na Gestão de Atividades pessoal).
- Excel export: `xlsx`. Ícones: `lucide-react`.

## Comandos

```bash
npm run dev       # vite + node --watch server/index.js (concurrently), porta 5173 (proxy /api -> :3001)
npm run build     # vite build -> dist/
npm run preview   # serve dist/ localmente
npm start         # node server/index.js (produção, serve dist/ + API)
```

- **Não há test runner nem linter configurado** (sem `test`/`lint` no
  `package.json`). Verificação de correção = `npm run build` limpo (Vite/esbuild
  acusa erro de sintaxe/import) + teste manual no browser.
- Variáveis de ambiente (`.env`, não commitado): `DATABASE_URL`, `JWT_SECRET`,
  `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `PORT`.
  Exporte com `set -a && source .env && set +a` antes de rodar local.

## Arquitetura — regras importantes

- **Schemaless por design**: `projects.data` e `personal_boards.data` são
  colunas `JSONB` sem whitelist no backend (`PATCH` aceita o objeto inteiro).
  Isso significa: **campo novo em uma feature = só editar o frontend**, nunca
  precisa de migration. Sempre acesse campos novos com fallback (`campo ||
  default`) para não quebrar registros antigos.
- **Uma única fonte de verdade por dado**: quando dois campos podem
  representar a mesma coisa (ex.: checkbox de conclusão vs. campo de status),
  um deve derivar do outro via uma função central — nunca escrever os dois
  lugares de forma independente.
- **Soft delete + Lixeira**: nada é `DELETE` de verdade a nível de item (ativi-
  dade, subatividade, card pessoal) — marca `deleted/deletedAt/deletedBy` e
  filtra nas views. Restaurar = limpar as flags. Projetos e usuários (linhas
  de tabela SQL) são a exceção — esses têm `DELETE` de verdade.
- **Tema claro/escuro**: variáveis CSS (`--bg-*`, `--text-*`, `--border-*`)
  definidas em `index.html`, trocadas via `data-theme` no `<html>`. Cada tela
  injeta seu próprio `<style>` com as regras base de `input/select/textarea`
  — se uma tela nova não incluir esse bloco, os campos ficam sem estilo.
- **CSS via objeto `S`**: estilos inline em `src/App.jsx` (`const S = {...}`,
  ~380 linhas). Estados de `:hover`/`:focus` que não dá pra fazer inline usam
  uma `className` + um `<style>` scoped no próprio componente (ver
  `SUB_ROW_CSS` como padrão a seguir).
- **Responsivo mobile**: hooks `useIsMobile()`/`useIsCompact()` (breakpoints
  768/1024) + chaves `S.algoMobile` espalhadas condicionalmente — nunca
  media query sobrescrevendo estilo inline. Detalhes em
  `docs/RESPONSIVE_ARCHITECTURE.md`.

## Padrões de código

- Toda mutação de atividade/projeto passa por `mutateProject(pid, updater,
  logMsg, activityId)` — ele já persiste (debounce) e loga. Não faça `setProjects`
  direto para editar um projeto.
- Toda mutação do quadro pessoal passa por `mutatePersonalBoard(updater)` —
  mesma lógica de debounce + rollback em caso de falha de rede.
- Sem comentários de código desnecessários; sem abstração prematura — o
  arquivo já é grande, não adicione camadas novas "pra generalizar" sem pedido
  explícito.

## Arquivos que NÃO devem ser mexidos sem necessidade explícita

- `package-lock.json` — não editar manualmente.
- `dist/` — gerado, nunca editar à mão nem commitar mudanças manuais nele.
- `.env` — segredos locais, nunca commitar.
- `server/db.js` (schema) — mudanças de schema SQL são raras e sensíveis
  (afetam produção); só mexa se a tarefa pedir explicitamente um novo campo
  relacional (não JSONB).

## Banco de dados

Postgres, 5 tabelas: `organizations`, `users`, `projects` (JSONB), `cnpj_cache`,
`personal_boards` (JSONB). Detalhes em `docs/PROJECT_MAP.md`.

## Multi-tenant (2026-08, Fase 1 — fundação)

A aplicação está em migração pra multi-tenant/white-label (múltiplas
organizações usando a mesma app, dados isolados). **Fase 1 concluída**: toda
`user`/`project` tem `org_id` (coluna relacional, não JSONB); todo dado
existente foi migrado automaticamente pra organização `pricetax`
(`server/db.js` `migrateToPricetaxOrg()`, roda toda vez que o servidor sobe,
idempotente). Um único usuário (`SEED_ADMIN_USERNAME`) virou
`is_super_admin=true` — vê todas as organizações sem filtro; os demais
usuários `master` continuam administradores completos, só que agora
escopados à própria organização (não veem outras). Toda rota de
`users`/`projects` filtra por `org_id` **no SQL**, não só em JS
(`canAccessProject()`/`sameOrg()` em `server/routes.js`) — tentar acessar
um recurso de outra organização por ID direto retorna 404/403, mesmo pra
quem sabe o ID exato. `cnpj_cache` e o scan de `shareToken` de
`personal_boards` (`/api/public-board/:token`) **não** são escopados por
organização de propósito — são dado compartilhado/publicamente
acessível por design, não vazamento.

Ainda **não implementado** (fases seguintes, roadmap): painel de Super
Admin, criação de organização pela UI, roteamento/branding por organização
(`/o/:slug/login`), planos/limites/cobrança. Colunas de schema pra isso já
existem (`organizations.plan/max_users/max_companies/settings`) mas nada
lê ou aplica ainda.

## Autenticação

JWT em cookie httpOnly (`cronograma_token`, 7 dias), bcrypt para senha.
Middleware `requireAuth`/`requireMaster`/`requireMasterOrPricetax`/
`requireSuperAdmin` em `server/auth.js`. 3 papéis: `master`, `pricetax`,
`cliente` — regra de acesso a projeto em `canAccessProject()`
(`server/routes.js`), agora também checando `org_id` (ver seção
Multi-tenant acima). JWT carrega só o id do usuário; `role`/`orgId`/
`isSuperAdmin` são sempre lidos frescos do banco a cada request.

## Principais regras de negócio

- Cliente só vê o projeto do próprio CNPJ; PRICETAX só vê CNPJs liberados
  (`allowedCnpjs`); Master vê tudo.
- Cadastro de empresa exige escolher tipo de cliente (Diagnóstico /
  Diagnóstico e Consultoria Contínua) — obrigatório só na criação.
- Sem checagem de conflito de datas entre empresas — removida a pedido
  explícito (2026-08); datas de atividades são livres, sem aviso nenhum.
- Exclusão de atividade/subatividade/usuário-master-único tem guarda (frase de
  confirmação ou bloqueio de "não pode remover o último admin").
- Usuário pode ter `personalOnly=true` (checkbox "Acesso apenas à Gestão de
  Atividades"): ao logar, pula a tela de escolha de módulo e a de empresas,
  entra direto no quadro pessoal, sem botão para voltar a Empresas.
- Cada página da Gestão de Atividades tem `visibility` (`private`|`public`) +
  `shareToken` (2026-08). Pública: `/quadro/:shareToken` é a única rota sem
  `requireAuth` do app — visitante sem sessão só visualiza (nenhum botão de
  mutação renderiza); visitante logado (dono ou não) colabora normalmente via
  `PATCH /api/public-board/:token` (`requireAuth`, sem checar dono — o token é
  a autorização). Alternar pra Privado invalida o link na hora só pela
  checagem `visibility==='public'` no backend (não apaga nem regenera o
  token). Toda ação vira entrada em `board.log` (mistura eventos estruturais
  do board com `card.history` agregado) — ver `BoardActivityLogModal`.
- Pausar uma empresa (`company.status='pausado'`, em `updateCompanyFields`,
  2026-08) põe em cascata `status='pausado'` em toda atividade não excluída
  e não concluída, guardando o status anterior em `activity.statusBeforePause`
  pra restaurar exatamente ao religar (`status='ativo'`). Atividade que já
  estava `pausado` manualmente antes da empresa pausar (sem
  `statusBeforePause`) fica intocada nos dois sentidos — não é considerada
  parte do cascade. Atividades concluídas nunca são pausadas pelo cascade
  (preserva `projectProgress()`). Refletido como selo "⏸ Pausado" na
  `CompanySelectorScreen` e no topbar da empresa.

Antes de alterar qualquer funcionalidade, **abra e confira os arquivos
envolvidos** — o `PROJECT_MAP.md` serve para localizar, não substitui ler o
código antes de mudar algo.
