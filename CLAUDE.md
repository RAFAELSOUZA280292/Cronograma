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

Postgres, 4 tabelas: `users`, `projects` (JSONB), `cnpj_cache`, `personal_boards`
(JSONB). Detalhes em `docs/PROJECT_MAP.md`.

## Autenticação

JWT em cookie httpOnly (`cronograma_token`, 7 dias), bcrypt para senha.
Middleware `requireAuth`/`requireMaster`/`requireMasterOrPricetax` em
`server/auth.js`. 3 papéis: `master`, `pricetax`, `cliente` — regra de acesso a
projeto em `canAccessProject()` (`server/routes.js`).

## Principais regras de negócio

- Cliente só vê o projeto do próprio CNPJ; PRICETAX só vê CNPJs liberados
  (`allowedCnpjs`); Master vê tudo.
- Cadastro de empresa exige escolher tipo de cliente (Diagnóstico /
  Diagnóstico e Consultoria Contínua) — obrigatório só na criação.
- Conflito de datas: alerta (não bloqueia) quando um membro da equipe PRICETAX
  já tem atividade em outra empresa na mesma data.
- Exclusão de atividade/subatividade/usuário-master-único tem guarda (frase de
  confirmação ou bloqueio de "não pode remover o último admin").

Antes de alterar qualquer funcionalidade, **abra e confira os arquivos
envolvidos** — o `PROJECT_MAP.md` serve para localizar, não substitui ler o
código antes de mudar algo.
