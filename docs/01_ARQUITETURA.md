# Arquitetura do sistema (visão geral)

> Atualizado em 2026-10-29. Fonte da verdade: o código; este texto é o mapa. Detalhe de cada área: `docs/05_MODULO_*.md`. Rotas, tabelas e variáveis exatas: `docs/gerado/`.

## Em uma frase
Um único programa Node (Express) serve **a API e o site** (React) no mesmo endereço, guarda tudo num **Postgres**, chama a **IA da Anthropic** para a RENATA e outras tarefas, e roda sozinho no **Railway** a cada `git push` na `main`.

## Para quem é / quando ler
- Você (humano ou robô) precisa entender **como as peças se ligam** antes de mexer.
- Pedidos típicos que mandam para cá: "como funciona o login?", "onde roda a IA?", "o que acontece quando o servidor reinicia?", "o que é um módulo novo precisa para entrar no sistema?".
- **Palavras-chave:** arquitetura, camadas, boot, `server/index.js`, Railway, deploy, módulo, SPA, JWT, cookie, base (org), jobs, scheduler, Anthropic, Voyage, Postgres, `projects.data`.

## O sistema em uma figura

```
 NAVEGADOR (React 19, PWA)                OUTRAS ENTRADAS
 ┌───────────────────────────┐            ┌─────────────────────────────────────────────┐
 │ src/App.jsx + src/*/      │            │ Outra janela do Claude Code / IA externa    │
 │ (sem roteador de páginas: │            │   → /api/connect   (Bearer pxk_…)           │
 │  "modo" + pushState)      │            │ Widget do iPhone (Scriptable)               │
 │ service worker (src/sw.js)│            │   → /api/widget    (token pxw_… no header)  │
 └─────────────┬─────────────┘            │ Link público de acompanhamento (sem login)  │
               │ fetch + cookie           │   → /a/…  /acompanhamento/…  /d/…           │
               │ (src/lib/api.js)         │ RENATA operacional (chama a PRÓPRIA API)    │
               ▼                          │   → 127.0.0.1 com segredo do processo       │
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ RAILWAY — UM contêiner Node 22 (server/index.js, Express 5)                         │
 │  1. parsers (JSON 15 MB; /api/templates 45 MB) + cookies                            │
 │  2. /api/*  → ~30 roteadores (um arquivo por assunto)  → regras → SQL com `pg`      │
 │  3. 404 JSON para /api desconhecido · apiErrorHandler (erros em português)          │
 │  4. arquivos estáticos de dist/ (assets com cache de 1 ano) + fallback da SPA       │
 │  5. tarefas internas: CRM scheduler · lembretes de tarefa (30 min) · retenção       │
 │     de uso e de versões (24 h) · jobs assíncronos (estudo, dossiê, transcrição)     │
 └──────────────┬───────────────────────────────┬──────────────────────────────────────┘
                │ SQL (pg, sem ORM)             │ HTTPS
                ▼                               ▼
        ┌───────────────┐        Anthropic (IA: RENATA, estudo de pareceres, dossiê, transcrição)
        │ POSTGRES      │        Voyage (embeddings da busca semântica)
        │ 71 tabelas    │        Google (Calendar/OAuth) · Receita/CNPJ · Web Push (VAPID)
        └───────────────┘
```

## Camadas (do usuário para o banco)

| Camada | O que é | Onde mora | Regra de ouro |
|---|---|---|---|
| Tela | React 19, estilos em objeto `S` + CSS variables (tema claro/escuro) | `src/` (176 arquivos) | O front **esconde** botões; quem **decide** permissão é sempre o servidor. |
| Cliente de API | `apiGet/apiPost/apiPatch/apiPut/apiDelete`; traduz erros para português; marca "Salvando/Salvo" | `src/lib/api.js` | Toda chamada leva o cookie (`credentials: 'include'`). 401 = sessão expirada. |
| Roteadores | Um arquivo por assunto, cada um um `Router()` do Express | `server/*.js` e `server/crm/`, `server/renata/` | Montados em `server/index.js` (lista exata em `docs/gerado/ROTAS.md`). |
| Regras | Funções puras e testáveis (ex.: `applyPlanOps`, `applyMeetingEdit`, `parecerUsableFor`) | ao lado dos roteadores | Regra de negócio fica no servidor, **uma vez só**, e as demais portas (RENATA, API) reaproveitam. |
| Banco | Postgres, **sem ORM**, SQL direto com `pg`; esquema **só aditivo** | `server/db.js` + módulos de esquema | Toda tabela de dados tem `org_id` (a "base"); toda consulta filtra por ele. |
| Jobs | Dentro do mesmo processo (sem Redis) | `start…()` em `server/index.js` | Estado de trabalho longo vai para o banco (`running/failed`) e se recupera no boot. |
| IA | SDK `@anthropic-ai/sdk` + Zod (saída estruturada) | `server/assistant*.js`, `server/renata/`, `parecerStudy.js`, `meetingInbox.js`… | Toda chamada tem `max_tokens`, tratamento de corte e erro amigável (ver `docs/05_MODULO_RENATA_E_IA.md`). |

## As 5 portas de entrada da API (quem chama e como prova quem é)

| # | Porta | Quem usa | Como se identifica | Onde é conferido |
|---|---|---|---|---|
| 1 | Sessão (cookie) | A equipe e os clientes no navegador | Cookie `cronograma_token` = JWT de 7 dias, `httpOnly`, `sameSite=lax`, `secure` em produção | `requireAuth` em `server/auth.js` |
| 2 | Chave de conectividade | Outra janela do Claude Code, IA externa | `Authorization: Bearer pxk_…` (só o hash fica no banco), escopos `read_all`/`write_all` + 6 antigos | `bearer()` em `server/connect.js` |
| 3 | Token do widget | iPhone (Scriptable) | `pxw_…` no cabeçalho `Authorization`, só leitura, limite por IP | `server/widget.js` |
| 4 | Público | Cliente da empresa (link de acompanhamento) | Sem login: o próprio link/segredo na URL; só mostra o que foi publicado | `server/companyShare.js` |
| 5 | Interna (RENATA) | A RENATA operacional chamando a API do próprio servidor | Cabeçalho `x-renata-internal` com segredo gerado a cada subida **e** conexão vinda de 127.0.0.1 | `readInternal` em `server/renata/internalAuth.js`, usado por `requireAuth` |

Consequência importante: **a RENATA e a API de conectividade não têm "poderes especiais"** — passam pelas mesmas regras e permissões da tela (a RENATA age "como a pessoa que pediu").

## Como o servidor sobe (boot, em ordem — `server/index.js`)
1. Importa tudo; cria o Express; liga os parsers (`/api/templates` aceita 45 MB; o resto 15 MB) e `cookie-parser`.
2. Monta os roteadores (`/api`, `/api/xflow`, `/api/crm`, …). Rota `/api/...` desconhecida → **404 em JSON**.
3. `start()`:
   1. `initDb()` cria/atualiza tabelas (`CREATE TABLE IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS`);
   2. `seedIfEmpty()` e migrações de dados (`migrateToPricetaxOrg`, `migrateAccessModel`, `migrateXflowBoardOrder`, `migrateInsightsToKnowledgeFacts`);
   3. limpezas de "órfãos" (`failOrphanedDossiers`: dossiê que estava gerando quando o servidor reiniciou vira erro);
   4. frases de inspiração viram fatos de memória da RENATA (não fatal);
   5. `app.listen(PORT)` e liga os agendadores: `startCrmScheduler`, `startTodoScheduler`, `startRetentionJob`, `startVersionRetentionJob`.
4. Falha em `initDb` derruba o processo (`process.exit(1)`); falhas "não fatais" só registram no log.

> **Cuidado conhecido:** dois processos subindo ao mesmo tempo contra o mesmo banco podem colidir em `initDb` ("tuple concurrently updated"). Em teste local, suba um por vez.

## Como uma requisição típica anda (exemplo: editar uma atividade do cronograma)
1. A pessoa edita na tela → o front guarda no estado e **grava com atraso (debounce)** com `PATCH /api/projects/:id` (`persistProjectDebounced` em `src/App.jsx`; o aviso "Salvando/Salvo" vem de `src/lib/saveState.js`).
2. O servidor passa por `requireAuth` (lê o cookie, carrega o usuário, confere bloqueio/expiração) e confere `canAccessProject` (mesma base + vínculo com a empresa).
3. A regra grava no Postgres; deixa linha no **Log da empresa** e dispara efeitos (notificações, reindexar a memória da RENATA, versionamento por gatilho do banco).
4. A resposta volta em JSON; erro vira `{ "message": "…em português…" }` (5xx também traz `ref`, um código curto que está no log do servidor).
5. Outras pessoas abertas na mesma empresa recebem a mudança pelo **poll de versões** (`GET /api/projects/versions`, a cada ~6 s, o "BIP" — não há WebSocket).

## Onde vivem os dados (resumo)
- **Cronograma de cada empresa** = **um JSON grande** em `projects.data` (equipe, fases, atividades, subatividades, reuniões, tarefas de reunião, log). Por isso existem travas de gravação (transação com `FOR UPDATE`, 409/fusão). Estrutura campo a campo: `docs/05_MODULO_EMPRESAS_CRONOGRAMA.md`.
- **Quadro pessoal** = JSON em `personal_boards.data`.
- **CRM, XFlow, memória da RENATA, pareceres, usuários, chaves de API, auditoria** = tabelas relacionais (lista completa e travas: `docs/gerado/BANCO.md`).
- **Arquivos** (PDF de parecer ≤ 10 MB, modelos ≤ 30 MB, materiais) ficam em `BYTEA` no próprio Postgres — não há bucket externo.

## IA no sistema (mapa curto; detalhe em `docs/05_MODULO_RENATA_E_IA.md`)
- **RENATA de consulta** (assistente por empresa e geral): busca híbrida (texto + embeddings do Voyage), memória de fatos, cache de respostas.
- **RENATA operacional** (executa no sistema): laço de ferramentas (~101), confirmação de ações críticas, auditoria, desfazer.
- **Tarefas de IA em segundo plano:** extração de reunião a partir da transcrição, estudo dos pareceres, dossiê do cliente, estudo de materiais, conteúdo do "Meu dia".
- Sem `ANTHROPIC_API_KEY`, cada função responde "IA não configurada" (503) em vez de quebrar.

## Deploy e ambientes
- **Produção:** Railway, projeto `Painel`, serviço `Cronograma`; `npm install` → `npm run build` → `npm start` (detecção automática; não há `railway.json`). Domínio `painel.pricetax.com.br`. Cada `git push` na `main` publica sozinho.
- **O diretório de trabalho local NÃO é repositório git.** O deploy usa um clone à parte: `git fetch` → conferir divergência → `rsync` do diretório de trabalho (sem `.git`, `node_modules`, `dist`, `.sourcemaps`, `.env`, `.claude`, `exports`) → `npm run build` limpo → `git add` **por caminho** (nunca `add -A`) → commit → `push` → **verificar em produção** (receita completa em `docs/06_MANUAL_DO_DESENVOLVEDOR.md`).
- **Local:** `npm run dev` (Vite na :5173 com proxy de `/api` para a :3001) + Postgres local `cronograma_dev`; organização de testes `sandbox-edu`.
- **Segredos:** só em variáveis de ambiente (Railway / `.env` local ignorado pelo git). Nomes em `docs/gerado/VARIAVEIS_DE_AMBIENTE.md`.
- **Fuso:** o servidor roda em **UTC**; o painel e as regras de data usam **Brasília (GMT-3)** (`todayInSp`). Log do Railway = Brasília + 3 h.

## Módulos do produto (onde cada um mora)
Tabela completa (endereço, quem acessa, código): `PROJECT_CONTEXT.md` §0 e `docs/gerado/ENDERECOS_DO_FRONT.md`. Documentos por módulo:

| Módulo | Documento |
|---|---|
| Empresas (cronogramas, reuniões, padrão, versões, levantamento, lacunas, Visão Geral) | `docs/05_MODULO_EMPRESAS_CRONOGRAMA.md` |
| Gestão de Atividades, Agenda/Google, XFlow, Notificações/Push/Meu dia | `docs/05_MODULO_ATIVIDADES_AGENDA_XFLOW.md` |
| CRM | `docs/05_MODULO_CRM.md` |
| RENATA e IA | `docs/05_MODULO_RENATA_E_IA.md` |
| Reuniões (transcrição), Pareceres, Biblioteca de conhecimento | `docs/05_MODULO_REUNIOES_PARECERES_BIBLIOTECA.md` |
| API de conectividade, widget, link público, Modelos, Inteligência Operacional, infra | `docs/05_MODULO_INTEGRACOES_E_PUBLICO.md` |

## Decisões de arquitetura que explicam o "jeito" do código
| Decisão | Por quê | Efeito prático |
|---|---|---|
| Sem ORM, SQL direto | Controle e simplicidade | Esquema só aditivo; toda mudança de tabela é manual e revisada |
| Um JSON por empresa (`projects.data`) | Nasceu como app de cronograma; o JSON é o documento | Gravação do documento inteiro → travas de concorrência e versionamento |
| Sem fila externa / WebSocket | Menos peças para manter | Jobs no processo; sincronização por poll; reinício interrompe jobs (por isso estados no banco) |
| Multi-tenant por `org_id` | Várias bases no mesmo app | Toda consulta filtra por `org_id`; checagem em `canAccessProject` |
| Permissão no servidor, nunca só no front | Segurança | O front só esconde; teste de permissão = teste da rota |
| Regras uma vez, várias portas | RENATA e API não podem contornar a tela | RENATA chama a própria API por loopback; a conectividade reaproveita funções puras |
| Esquema e docs "aditivos" | Não quebrar produção | Nada é apagado de verdade (lixeira/exclusão lógica) |

## Não verificado / dúvidas
- Contagem exata de tabelas varia com o tempo: use `docs/gerado/BANCO.md` (gerado do banco local).
- Tamanho do *pool* de conexões do Postgres e limites de memória do Railway: não verificados aqui.
