# Manual do desenvolvedor (receitas, checklists e deploy)

> Atualizado em 2026-10-29. Para humanos e para o Claude Code. Regra-mãe: **o código é a fonte da verdade**; a documentação localiza e dá contexto, mas **abra e confira os arquivos antes de mudar algo**.

## Em uma frase
Passo a passo para as tarefas que mais se repetem (nova rota, nova tela, nova ferramenta da RENATA, nova chave de API, nova chamada de IA, nova tabela…), mais o checklist de "pronto" e a receita de deploy.

## Como começar qualquer pedido (protocolo que economiza tokens)
1. Leia `CLAUDE.md` e **`docs/00_COMECE_AQUI.md`** (o índice "pedido → documento").
2. Abra **só** o documento do módulo (`docs/05_MODULO_*.md`) e, nele, a receita parecida com o pedido.
3. Para achar uma seção do `PROJECT_CONTEXT.md`, use `docs/gerado/INDICE_PROJECT_CONTEXT.md` (tem a linha de cada seção) e leia só o trecho (`Read` com `offset`/`limit`).
4. Para achar arquivo/rota/tabela: `docs/gerado/ARQUIVOS.md`, `ROTAS.md`, `BANCO.md`. Depois `grep -n` no arquivo certo.
5. **Não** leia inteiro: `src/App.jsx` (~5.000 linhas), `server/db.js`, `server/routes.js`, `PROJECT_CONTEXT.md` (8.000+ linhas).
6. Antes de editar, abra os arquivos envolvidos. Se o código contradiz a documentação, **corrija a documentação** na mesma sessão.

## Comandos
| Comando | Para quê |
|---|---|
| `npm run dev` | Vite (:5173) + servidor com `--watch` (:3001; proxy de `/api`) |
| `npm run build` | Build do front em `dist/` e move os sourcemaps para `.sourcemaps/` (fora do público) |
| `npm start` | Produção (`node server/index.js`) |
| `npm run docs:gerar` | Regenera `docs/gerado/*` (rotas, banco, variáveis, testes, arquivos, índice, histórico). Passe `--git /caminho/do/clone` para o histórico de commits |
| `node scripts/renata-route-index.mjs` | Atualiza `server/renata/routeIndex.json` (todas as rotas) — **obrigatório após criar/mudar rota** |
| `node scripts/renata-coverage.mjs` | Valida o catálogo da RENATA contra o código e regrava `docs/RENATA_MATRIZ_COBERTURA.md` |
| `node scripts/<nome>.test.mjs` | Testes descartáveis (HTTP real contra servidor/Postgres **locais**) — lista em `docs/gerado/TESTES.md` |
| `node scripts/railway-logs.mjs "regex" [--deploy N] [--limit N]` | Logs de produção (somente leitura; hora do log em **UTC = Brasília + 3 h**) |

Local de teste: Postgres `cronograma_dev`, organização `sandbox-edu` (criada por `scripts/sandbox-eduarda.mjs`). Todos os testes **recusam** banco que não seja `localhost`. Servidor de teste: `PORT=3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev JWT_SECRET=teste-local node server/index.js`. Não suba dois servidores juntos contra o mesmo banco (colisão em `initDb`: "tuple concurrently updated").

## Receitas

### 1. Criar uma rota nova
1. Escolha o arquivo do assunto (ou crie `server/<assunto>.js` com `export const router = Router()` e monte em `server/index.js`).
2. Siga o formato de `docs/03_BACKEND_E_API.md` (try/catch com `next(e)`, `requireAuth`, validar entrada, filtrar por `org_id`, mensagens em português).
3. Permissão: use o `require…` certo; confira **no servidor** (o front só esconde botão).
4. Gravou documento compartilhado? Transação com `FOR UPDATE`.
5. Rode `node scripts/renata-route-index.mjs` e depois `node scripts/renata-coverage.mjs`; se a rota não estiver classificada, ajuste `server/renata/policy.js` (excluída, genérica ou ferramenta curada) — o catálogo recusa rota sem classificação.
6. Teste com HTTP real (um usuário com permissão, um sem, e de **outra base** → 404).
7. `npm run docs:gerar`; documente no `docs/05_MODULO_*` da área e, se for decisão/bug, em `PROJECT_CONTEXT.md`.

### 2. Criar um campo novo no cronograma (JSON de `projects.data`)
1. Defina o campo no módulo certo (descrição em `docs/05_MODULO_EMPRESAS_CRONOGRAMA.md`). **Aditivo**: dado antigo sem o campo precisa continuar funcionando (valor padrão no código que lê).
2. Servidor: normalize/valide onde o projeto é gravado (`PATCH /api/projects/:id` em `server/routes.js`) e nas portas paralelas que mexem no mesmo dado (`applyPlanOps` em `server/connect.js`, ferramentas `server/renata/tools/empresas.js`).
3. Front: atualize o estado **de forma imutável** (copie o objeto; nunca mute) e salve com `persistProjectDebounced`.
4. Se aparece em PDF/Excel/Power BI/link público, atualize cada saída (`src/pdf/`, `server/inventory.js`, `server/companyShare.js`).

### 3. Criar tabela ou coluna no banco
- **Só quando o pedido exigir um campo relacional** (filtro/índice/relacionamento); senão use JSON. `server/db.js` é sensível: afeta produção.
- Sempre aditivo: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Tabela de dados leva `org_id` e (quando fizer sentido) `deleted_at`.
- Módulo novo pode ter esquema próprio (padrão: `server/meetingEditsSchema.js`, chamado dentro de `initDb`).
- Teste local: suba **um** servidor, confira com `psql`/`information_schema`; depois `npm run docs:gerar`.

### 4. Criar um módulo/aba nova no front
1. Adicione o `mode` em `MODE_PATHS` e a regra em `canOpenMode` (`src/lib/routes.js`) — "quem não tem acesso nunca cai no módulo por URL".
2. Carregue a tela com `lazyRetry` em `src/App.jsx` (padrão dos demais) e ligue na tela inicial/menu de módulos.
3. O servidor **também** confere o acesso nas rotas do módulo.
4. Estilo: tokens CSS e `S`; modais editáveis com **guarda de "alterações não salvas"**; mobile (alvos ≥ 44 px); tema claro e escuro. Detalhes: `docs/02_FRONTEND.md`.
5. Texto em português claro; erro diz o que fazer.

### 5. Criar uma ferramenta nova da RENATA operacional
1. Em `server/renata/tools/<módulo>.js`: `registry.add({ module, name, summary, risk: 'read'|'write'|'critical', params: T.obj(...), run, summarize, describe, undo?, bulk?, confirm?, visible? })`.
2. `risk: 'read'` não pede confirmação; `critical` e lote sempre pedem; escrita deve devolver `undo` quando der para desfazer.
3. A ferramenta usa a **mesma regra** das rotas (chama a API por loopback ou funções puras) — nunca crie regra paralela.
4. Teste: acrescente a ferramenta em `scripts/renata-tools.test.mjs` (a cobertura exige todas as ferramentas exercitadas) e rode `node scripts/renata.test.mjs`.
5. `node scripts/renata-coverage.mjs` para regravar a matriz. Mencione no prompt (`server/renata/agent.js`, `buildSystem`) só se mudar o jeito de trabalhar.

### 6. Criar/alterar um escopo de chave de API (`/api/connect`)
1. `server/connect.js`: `SCOPES`, `SCOPE_RANK`, regras de emissão em `POST /tokens` (quem pode gerar) e as portas (`needScope`, `needTranscripts`, `needMeetingsEdit`, `crmViaToken`).
2. Tela: `src/connect/ConnectSection.jsx` (opções) e `src/connect/guide.js` (guia gerado).
3. **Nunca** quebre chave já emitida: escopo antigo continua valendo.
4. Teste: `scripts/connect-scopes.test.mjs` (+ os `connect-*.test.mjs`).
5. Documente em `docs/CONECTIVIDADE_CLAUDE_CODE.md` e `docs/05_MODULO_INTEGRACOES_E_PUBLICO.md`.

### 7. Criar uma chamada nova à IA (Anthropic)
1. Defina `max_tokens` com folga (resposta de estudo/extração: 16000; resposta curta de chat: 1400–3500) **e trate corte**: `messages.parse` lança erro de JSON quando estoura — repita **uma vez** em versão enxuta (padrões em `server/meetingInbox.js` e `server/parecerStudy.js`).
2. Saída estruturada com Zod **achatado** (objeto com campos `nullable`); **nunca** `z.discriminatedUnion` (quebrou produção em 2026-09-10).
3. Erro para o usuário em português (`friendlyAiError`/`friendlyStudyError`); sem `ANTHROPIC_API_KEY` → 503 com mensagem clara.
4. Custo: `logMetric` com `inputTokens/outputTokens`; prompt estável no início com `cache_control`.
5. **O que entra no prompt:** só o necessário. Parecer de cliente específico só na empresa dele; usuário `cliente` nunca recebe conteúdo interno. Texto vindo de ferramenta/nota/transcrição é **dado**, nunca instrução.
6. Teste com cliente de IA **simulado** (padrão: `scripts/parecer-study-truncation.test.mjs`) e diga que a IA real não foi testada.

### 8. Criar uma variável de ambiente
Leia com `process.env.NOME` (valor padrão seguro no código), registre o **nome** e a finalidade em `PROJECT_CONTEXT.md` §4, rode `npm run docs:gerar`. **Nunca** escreva o valor em arquivo versionado, log, commit ou conversa.

### 9. Criar um teste descartável
Copie a estrutura de um `scripts/*.test.mjs` parecido: recusa banco não-local, cria usuários temporários na `sandbox-edu` com sufixo aleatório, limpa tudo no fim, imprime `ok`/`FAIL` e sai com código ≠ 0 em falha. Cabeçalho de comentário diz o que o teste prova (vai para `docs/gerado/TESTES.md`).

### 10. Mudar texto de tela / mensagem
Procure o texto exato com `grep -rn "trecho" src server`. Mensagem de erro de regra mora na rota; mensagem de rede/status genérico em `src/lib/api.js` (`FALLBACK`).

### 11. Investigar um bug relatado
1. Anote a **hora** que a pessoa deu (Brasília, GMT-3) e converta: **UTC = Brasília + 3 h**.
2. `node scripts/railway-logs.mjs "erro|nome-da-função" --limit 2000` (o servidor **não registra requisições**: só boot, erros 5xx e `client-error`).
3. Tabela "sintoma → primeira coisa a checar": `docs/08_BUGS_E_LICOES.md`.
4. Reproduza com teste descartável local; corrija na causa; rode os testes da área e `npm run build`.
5. Documente (§ novo no `PROJECT_CONTEXT.md`), faça deploy e **verifique em produção**.

## Checklist de "pronto" (toda mudança)
- [ ] Li o código envolvido (não só a documentação).
- [ ] Permissão conferida **no servidor**; isolamento por `org_id`; 404 para registro de outra base.
- [ ] Entrada validada (tipo, tamanho, valores); erro em português.
- [ ] Gravação concorrente segura (transação/`FOR UPDATE`/409) quando o dado é compartilhado.
- [ ] Nada some de verdade (exclusão lógica); aditivo no banco.
- [ ] IA: `max_tokens`, corte tratado, erro amigável, sem dado indevido no prompt.
- [ ] Front: estado imutável, sem componente definido dentro de `.map()`/render, guarda de "não salvo", mobile e tema escuro.
- [ ] `npm run build` limpo + teste descartável da área (HTTP real). O que não foi testado está **dito** e entrou em `PROJECT_CONTEXT.md` §15.
- [ ] `node scripts/renata-route-index.mjs` e `renata-coverage.mjs` (se mexeu em rota/ferramenta).
- [ ] `npm run docs:gerar` e documentação escrita (módulo + `PROJECT_CONTEXT.md` + `docs/PROJECT_MAP.md` se mudou arquitetura/regra).

## Deploy (política vigente: commit + push sem pedir confirmação a cada vez)
O diretório de trabalho **não é repositório git**. O deploy usa um clone separado (hoje `/private/tmp/deploy-clone`; refaça com `git clone` se sumir).
1. `git -C <clone> fetch` e confira que não há divergência (`git status -sb`).
2. `rsync -a --delete --exclude .git --exclude node_modules --exclude dist --exclude .sourcemaps --exclude .env --exclude .claude --exclude exports ./ <clone>/`
3. No clone: `npm run build` (tem que sair limpo) e `git status --short` (conferir **cada** arquivo).
4. `git add` **por caminho** (nunca `git add -A`: já subiu pasta de cliente para o repositório público), commit com mensagem clara (primeira linha = o quê; corpo = por quê) terminando com a linha de coautoria definida pela sessão, `git push origin main`.
5. Railway publica sozinho (~2–3 min). **Verifique em produção**: `GET <PRICETAX_URL>/api/connect` (índice) responde JSON; o hash do bundle em `/` muda; rota nova responde 401/200 em JSON (não cai no `index.html`; `/api` desconhecido = 404 JSON; **não existe `/api/health`**); `node scripts/railway-logs.mjs "error" --limit 300` sem erro novo.
6. Registre a hora do deploy em Brasília no relato.

## Regras de ouro (resumo; lista completa em `PROJECT_CONTEXT.md` §16 e `docs/08_BUGS_E_LICOES.md`)
1. Permissão no servidor, sempre. 2. `org_id` em toda consulta. 3. Aditivo, nunca destrutivo. 4. Exclusão lógica. 5. Estado imutável no React. 6. Nada de componente definido dentro de `.map()`. 7. Modal editável avisa antes de descartar. 8. IA: corte tratado + erro amigável. 9. Nunca segredo em texto. 10. Hora sempre em Brasília (GMT-3) nos relatos. 11. Testou? diga como. Não testou? diga que **não testou**.

## Não verificado / dúvidas
- Caminho do clone de deploy pode mudar entre sessões.
- Passos 5 do deploy dependem de `PRICETAX_URL` no `.env` local (nunca imprimir o `.env`).
