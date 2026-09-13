# RENATA — Plano de Implementação: Qualidade de Evidência (P0/P1)

**Data:** 2026-09-13
**Tipo:** plano técnico — **nenhum código foi escrito para produzir este documento.**
**Baseline:** [`docs/RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md`](RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md), confirmado como diagnóstico técnico correto contra o código atual.
**Escopo confirmado pelo Rafael:** só os 11 itens abaixo (P0: 1-4, P1: 5-11). Memória episódica, Skills, Failure Memory, Lições Aprendidas, Knowledge Graph visual, Critic, Confidence UI e arquitetura multi-agente ficam explicitamente FORA — não aparecem em nenhuma parte deste plano.

Princípio que governa toda decisão de design abaixo, nas palavras do próprio Rafael: **antes de aumentar a quantidade de raciocínio da RENATA, melhorar a qualidade da evidência entregue ao modelo** — e sempre que lógica determinística/SQL/ranking resolver, ela vence sobre uma chamada de IA nova.

---

## 0. Validação item a item — "qual problema real isso resolve?"

Regra do próprio Rafael: se a resposta não for convincente, cortar. Nenhum dos 11 foi cortado — mas o motivo de cada um está registrado aqui, em termos do código atual, não em abstrato.

| # | Capacidade | Problema real de hoje (com evidência) |
|---|---|---|
| 1 | Eval Harness | Toda validação de IA até hoje foi manual (`_test_*.mjs` só testa lógica determinística — embeddings, SQL, versionamento — nunca "essa resposta está certa?"). Sem isso, qualquer um dos 10 itens abaixo é validado "de olho", exatamente o padrão que causou o incidente de `max_tokens` (só descoberto por reclamação real, não por teste). |
| 2 | Depth Routing | Hoje `askProjectAssistant` roda a MESMA busca tripla incondicional (`assistantRetrieval.js:367-378`) pra "qual o CNPJ do cliente?" e pra "por que atrasamos a entrega?" — não há classificação de esforço, então não há como aplicar mais investigação numa pergunta complexa sem also aplicá-la (cara) em toda pergunta simples. |
| 3 | Adaptive Context | `buildProjectSnapshot` tem cortes fixos idênticos pra qualquer pergunta (`assistantContext.js:177,198,214,249,255`) — uma pergunta sobre uma pessoa recebe as mesmas 12 atividades atrasadas que uma pergunta sobre prazo recebe. É tokens gastos em ruído e char budget desperdiçado que podia ir pra evidência relevante. |
| 4 | Reranking | A fusão de busca soma dois scores que não estão na mesma escala (`ts_rank_cd` sem teto claro + cosseno em [-1,1]) num `Map` (`memoryRetrieval.js:124-129`) — quem aparece nas duas pernas simplesmente tem os números somados, sem nenhuma normalização. O "top 12" que chega em `synthesizeAnswer` pode não ser de fato o mais relevante. |
| 5 | Iterative Retrieval | Hoje existe exatamente 1 rodada de busca (mais o fallback AND→OR, que é reformular o MODO, não o CONTEÚDO). Se a busca vier vazia/fraca por causa de uma palavra errada na reformulação do `resolveQuery`, a resposta vira "não encontrei evidência" mesmo quando a evidência existe no banco. |
| 6 | Entity-aware Retrieval | `ai_knowledge_entities`/`ai_knowledge_fact_entities` existem desde a Fase 8 e são populadas a cada `save_knowledge_fact`/`flag_knowledge_conflict` — mas **nenhuma linha de `assistantRetrieval.js` ou `memoryRetrieval.js` as consulta**. É trabalho de gravação sem nenhum consumidor, puro desperdício de estrutura já paga. |
| 7 | Source Authority | `ai_knowledge_facts.origin` e `project_memory_chunks.kind` já categorizam a proveniência de cada evidência, mas nenhum dos dois tem peso em nenhuma query (`knowledgeFacts.js`, `memoryRetrieval.js` — confirmado por leitura completa dos dois arquivos). Uma transcrição literal e uma hipótese não confirmada competem em pé de igualdade hoje. |
| 8 | Temporal Reasoning | `valid_from`/`valid_until` já existem e já são filtrados contra `CURRENT_DATE` (`findSimilarFact`, `loadRelevantFacts`) — mas SEMPRE contra hoje. Não existe nenhum caminho pra responder "o que valia em 01/09?" porque `resolveQuery` nunca extrai uma data-alvo da pergunta. |
| 9 | Conflict Engine 2.0 | `classifyRelation` (`knowledgeFacts.js:103-116`) decide conflito com 2 sinais só: similaridade de embedding ≥0.75 + um regex de negação (`NEGATION_PATTERN`). O próprio exemplo do Rafael ("5%" vs "10%" pro mesmo fornecedor) não tem negação textual nenhuma — passaria despercebido como `complement` hoje, um bug real de classificação. |
| 10 | Evidence Pack | Hoje `synthesizeAnswer` recebe 3 blocos de texto empilhados e desconectados (`chunksText`, `factsText`, `projectSnapshot` — `assistantRetrieval.js:161-166,213`) — cabe ao MODELO reconstruir sozinho qual evidência é mais forte, qual é mais recente, se duas se contradizem. Isso é exatamente o trabalho que os itens 4/7/8/9 acima produzem — sem um Evidence Pack, esse trabalho fica calculado mas não é aproveitado de forma estruturada pelo prompt. |
| 11 | Planner | Perguntas causais/multi-hop hoje dependem 100% do modelo de síntese juntar pistas soltas numa única passada, sem nenhuma decomposição prévia — o próprio exemplo do Rafael ("por que atrasamos a entrega?") pede 6-8 sub-investigações que hoje nunca acontecem, só uma busca genérica pela pergunta inteira. |

Nenhum item foi cortado. Nota de risco explícita (não é motivo de corte, mas precisa ficar registrada): o item 6 (Entity-aware Retrieval) tem um limite real de dado — `ai_knowledge_fact_entities` liga entidade a FATO, nunca a um CHUNK de reunião. Não existe hoje nenhum vínculo entidade↔chunk. A seção 6 abaixo entrega o que os dados de hoje sustentam sem fingir uma precisão que eles não têm.

---

## 1. Arquitetura final P0/P1

### 1.1 Validação da divisão de módulos proposta pelo Rafael contra o código real

A proposta original (`assistantRouting.js` / `retrievalRanking.js` / `entityRetrieval.js` / `evidencePack.js` / `assistantPlanner.js`) foi conferida arquivo por arquivo contra o código atual. Veredito: **mantida quase integralmente**, com 2 ajustes:

- **Depth Routing NÃO vira uma chamada de IA nova nem um módulo com lógica própria de classificação por LLM** — ele é uma extensão do `ResolveQuerySchema` já existente (mesma chamada de `resolveQuery`, mesmo custo, ver seção 6) mais uma camada determinística de OVERRIDE em `assistantRoutingRules.js` (nome ajustado de `assistantRouting.js` pra deixar claro que é regra, não uma segunda classificação por IA) — isso responde diretamente à instrução do Rafael "não quero uma chamada adicional cara obrigatória" e ao princípio de preferir lógica determinística.
- **Source Authority não ganha módulo próprio** — vira uma tabela de configuração (`ai_knowledge_authority_weights`) + uma função pura dentro de `evidencePack.js` (`applyAuthorityWeight`), porque é usada em UM lugar só (montagem do Evidence Pack) — criar um arquivo `knowledgeAuthority.js` só pra isso seria o tipo de fragmentação que o próprio Rafael pediu pra evitar ("evite microserviços... prefira módulos pequenos e testáveis", que corta os dois lados: nem grande demais, nem fragmentado demais).

Fora isso, a divisão do Rafael bate exatamente com as responsabilidades reais do código hoje:

| Módulo proposto | Existe hoje? | Decisão |
|---|---|---|
| `assistantRetrieval.js` — orquestração | Já existe, é o arquivo central (`askProjectAssistant`) | Mantém como orquestrador, ganha as novas chamadas na ordem do pipeline-alvo |
| `assistantRoutingRules.js` (renomeado) | Não existe | Novo — pequeno, puramente determinístico |
| `memoryRetrieval.js` — candidate generation + iterative retrieval | Já existe (só candidate generation hoje) | Estende com `searchProjectMemoryIterative` (wrapper) |
| `retrievalRanking.js` — normalização + fusão + reranking | Não existe (fusão hoje está dentro de `memoryRetrieval.js`) | Novo — a fusão por soma de score SAI de `memoryRetrieval.js` e entra aqui |
| `entityRetrieval.js` — entity-aware search | Não existe | Novo — consome `knowledgeEntities.js` (já existe, nunca foi consumido por retrieval) |
| `evidencePack.js` — normalização, autoridade, tempo, conflitos | Não existe | Novo — ponto de montagem final antes de `synthesizeAnswer` |
| `assistantPlanner.js` — só investigação DEEP | Não existe | Novo — só chamado quando Depth Router decide DEEP (ou NORMAL+multi-hop) |

### 1.2 Pipeline alvo com módulo responsável por estágio

```
USUÁRIO
  │
  ▼
resolveQuery()                          [assistantRetrieval.js, JÁ EXISTE — schema estendido]
  │  + depth, reasoningType, requiredCapabilities, asOfDate, entityMentions (novos campos, MESMA chamada)
  ▼
applyRoutingOverrides()                 [assistantRoutingRules.js, NOVO — determinístico, sem IA]
  │  ajusta depth se a heurística de palavra-chave discordar da IA (rede de segurança barata)
  ▼
CACHE SEMÂNTICO (ai_answer_cache)       [answerCache.js, JÁ EXISTE — sem mudança de contrato]
  │  HIT encerra aqui, igual hoje
  ▼ (MISS)
[SE depth === 'DEEP' ou multi-hop]
  buildInvestigationPlan()              [assistantPlanner.js, NOVO — 1 chamada de IA pequena, só aqui]
  ▼
selectContextProfile()                  [assistantContext.js, ESTENDIDO — determinístico]
  │  escolhe DEFAULT/PERSON/TIMELINE/ACTIVITY/DECISION/EXECUTIVE_CONTEXT
  ▼
RETRIEVAL (paralelo):
  ├─ searchProjectMemoryIterative()     [memoryRetrieval.js, ESTENDIDO]
  ├─ searchByEntity()                   [entityRetrieval.js, NOVO]
  └─ loadRelevantFacts()                [knowledgeFacts.js, ESTENDIDO — asOfDate]
  ▼
fuseCandidates() + rerank()             [retrievalRanking.js, NOVO — determinístico]
  │  [SE evidência ainda fraca, até 2 rodadas — decidido aqui, não em memoryRetrieval.js]
  ▼
buildEvidencePack()                     [evidencePack.js, NOVO]
  │  aplica authority weight + resolve linha do tempo + roda conflict analysis estruturada
  │  (classifyRelationStructured — knowledgeFacts.js, ESTENDIDO)
  ▼
synthesizeAnswer()                      [assistantRetrieval.js, JÁ EXISTE — recebe EvidencePack, não 3 blocos soltos]
  ▼
RESPOSTA (+ ações propostas, cache, ai_messages — tudo igual a hoje)
```

Nada entre "RESPOSTA" e o resto do fluxo (confirmação humana, `executeProposedAction`, `ai_metrics_events`) muda — está fora do escopo confirmado.

---

## 2. Sequência exata de implementação

Ordem escolhida por dependência real (não por número da lista do Rafael) — cada fase é testável e revertível isoladamente antes da próxima começar.

| Fase | Item(ns) | Por que nesta posição |
|---|---|---|
| **0** | Preparação (migrations aditivas de toda a lista, de uma vez) | Uma única leva de `ALTER`/`CREATE` evita repetir o ciclo de deploy de schema a cada fase — todas são aditivas e não têm ordem de dependência entre si |
| **1** | #1 Eval Harness (esqueleto + eval set inicial) | Sem isso, nenhuma fase seguinte tem como provar que melhorou algo — mesmo rodando só contra o pipeline ATUAL primeiro, pra estabelecer o baseline real (ver seção 13) |
| **2** | #2 Depth Routing | Não depende de nada; é pré-requisito econômico de #11 (Planner) e de qualquer expansão de contexto |
| **3** | #4 Reranking (feature-based, determinístico) | Não depende de #2; maior ganho de qualidade por esforço de implementação de toda a lista |
| **4** | #7 Source Authority | Depende só de #4 existir (o reranker é onde autoridade entra como sinal) |
| **5** | #8 Temporal Reasoning (`asOfDate`) | Independente tecnicamente, mas testado melhor depois de #4 (reranking) já estabilizado, pra não confundir causa de mudança de resultado no eval |
| **6** | #6 Entity-aware Retrieval | Usa `entityMentions` que já sai de `resolveQuery` desde a Fase 2 (Depth Routing amplia o mesmo schema) |
| **7** | #9 Conflict Engine 2.0 (parte estrutural) | Se beneficia de #6 (mesma entidade) e #8 (mesmo intervalo de tempo) já disponíveis como sinais |
| **8** | #3 Adaptive Context | Depende de #2 (Depth Router já classifica o TIPO de pergunta, reaproveitado pra escolher o profile) |
| **9** | #10 Evidence Pack | É a MONTAGEM de tudo que #4/#6/#7/#8/#9 já calculam — só faz sentido depois deles existirem, senão é uma caixa vazia |
| **10** | #5 Iterative Retrieval | Precisa de #4 (reranking) já dar um score confiável pra definir objetivamente "fraco" |
| **11** | #11 Planner | Por último de propósito: só DEEP o aciona, e Depth Routing (#2) + Evidence Pack (#10) precisam estar prontos pra um plano de investigação ter onde aterrissar |

Cada fase termina com: `npm run build` limpo, testes unitários da fase, rodada do eval set comparando contra o baseline da fase anterior, deploy com feature flag desligada por padrão, ativação gradual (ver seção 9).

---

## 3. Migrations necessárias

Todas aditivas (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`), aplicadas de uma vez na Fase 0, seguindo o padrão exato já usado em `server/db.js`:

```sql
-- #6 Entity-aware Retrieval — aliases confirmados manualmente (nunca
-- merge automático por similaridade, conforme instrução explícita do Rafael)
ALTER TABLE ai_knowledge_entities ADD COLUMN IF NOT EXISTS aliases JSONB NOT NULL DEFAULT '[]';

-- #7 Source Authority — configuração central, não hardcode espalhado
CREATE TABLE IF NOT EXISTS ai_knowledge_authority_weights (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  source_kind TEXT NOT NULL,   -- valores possíveis: ver seção 6.4 (mistura de origin + kind)
  weight      NUMERIC NOT NULL DEFAULT 1.0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_authority_weights_uidx ON ai_knowledge_authority_weights(org_id, source_kind);

-- #8 Temporal Reasoning — distinguir claramente occurred_at (quando o
-- fato do MUNDO aconteceu) de recorded_at (quando entrou no banco,
-- já coberto por created_at) — valid_from/valid_until já existem.
ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS occurred_at DATE;

-- #9 Conflict Engine 2.0 — resultado estruturado da comparação, não só
-- o par conflicts_with (que já existe) — guarda POR QUE foi classificado
-- assim, pra auditoria/eval (métrica "conflict detection accuracy").
ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS conflict_analysis JSONB;

-- #2 Depth Routing + #11 Planner — auditoria/eval (não afeta produção,
-- só rastreabilidade)
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS depth_mode TEXT CHECK (depth_mode IN ('FAST','NORMAL','DEEP'));
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS reasoning_type JSONB NOT NULL DEFAULT '[]';
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS investigation_plan JSONB;

-- #10 Evidence Pack — snapshot compacto do pack realmente usado, só pra
-- o Eval Harness conseguir medir citation correctness/unsupported claim
-- rate sem precisar re-executar o pipeline inteiro. NÃO é fonte de
-- verdade de nada em produção — é debug/auditoria, coluna nullable.
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS evidence_pack_summary JSONB;

-- #1 Eval Harness — histórico de execuções do benchmark, fora do
-- caminho crítico de produção
CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  git_commit       TEXT,
  eval_set_version TEXT NOT NULL,
  results          JSONB NOT NULL,
  summary_metrics  JSONB NOT NULL
);
```

Nenhuma migration exige `DROP CONSTRAINT`/mudança de enum em coluna existente — evita por completo a classe de incidente já documentada (ordem de migração de CHECK constraint, §38 do PROJECT_CONTEXT.md).

---

## 4. Novos arquivos

| Arquivo | Responsabilidade | Chamado por |
|---|---|---|
| `server/assistantRoutingRules.js` | `applyRoutingOverrides(resolvedOutput, question)` — regras determinísticas de palavra-chave/estrutura que podem ESCALAR (nunca rebaixar) a classificação de depth da IA; `selectRequiredCapabilities` (hoje só `['meetings','knowledge']`, é o gancho pronto pra quando #20 Tool Architecture — fora de escopo — existir) | `assistantRetrieval.js` |
| `server/retrievalRanking.js` | `normalizeScores(candidates)`, `fuseCandidates(lexical, semantic, entityBased)`, `rerank(candidates, features)` — pipeline determinístico de reranking (seção 6.3) | `assistantRetrieval.js` |
| `server/entityRetrieval.js` | `resolveEntityMentions(mentions, orgId)` (match por nome normalizado + `aliases`), `searchByEntity(pool, {orgId, projectId, entityIds})` (fatos via `ai_knowledge_fact_entities`, chunks via `participants`) | `assistantRetrieval.js` |
| `server/evidencePack.js` | `buildEvidencePack({candidates, facts, entities, asOfDate, question})` — monta a estrutura final (seção 6.5), incluindo `applyAuthorityWeight`, `resolveTimeline`, `analyzeConflicts` | `assistantRetrieval.js` |
| `server/assistantPlanner.js` | `buildInvestigationPlan({question, projectSnapshot})` — 1 chamada de IA pequena (Sonnet), só quando `depth==='DEEP'` | `assistantRetrieval.js` |
| `eval/renata_eval_set.json` | Casos de teste versionados (seção 12) | `eval/run_eval.mjs` |
| `eval/run_eval.mjs` | Runner do harness — roda `askProjectAssistant` contra cada caso, calcula métricas, grava em `ai_eval_runs` | Executado manualmente (`node eval/run_eval.mjs`) |
| `eval/metrics.mjs` | Funções puras de cálculo de métrica (recall@K, MRR, etc. — seção 6.6) | `eval/run_eval.mjs`, testável isoladamente |

---

## 5. Arquivos alterados

| Arquivo | Mudança | Fase |
|---|---|---|
| `server/db.js` | Migrations da seção 3 | 0 |
| `server/assistantRetrieval.js` | `ResolveQuerySchema` ganha `depth`/`reasoningType`/`requiredCapabilities`/`asOfDate`/`entityMentions`; `askProjectAssistant` reorganizado pro pipeline-alvo (pseudocódigo seção 7); `synthesizeAnswer` passa a receber `evidencePack` em vez de `chunksText`+`factsText` soltos | 2, 6, 8, 9, 10, 11 |
| `server/memoryRetrieval.js` | Fusão por soma de score SAI daqui (vai pra `retrievalRanking.js`) — `searchProjectMemory` volta a ser só candidate generation (lexical + semântico, cada perna com seu score bruto, sem combinar); nova `searchProjectMemoryIterative` (wrapper com critério de insuficiência, seção 6.2) | 3, 10 |
| `server/knowledgeFacts.js` | `findSimilarFact`/`loadRelevantFacts` ganham parâmetro `asOfDate` opcional (default hoje, comportamento idêntico ao atual quando omitido); `classifyRelation` vira `classifyRelationStructured` com os 8 sinais estruturados do Rafael (seção 6.4), mantendo os 4 valores de retorno já existentes (`duplicate/update/conflict/complement`) — **contrato de saída preservado**, só a lógica interna fica mais rica | 5, 7 |
| `server/knowledgeEntities.js` | `findOrCreateEntity` passa a checar `aliases` além de `normalized_name` na busca (nunca na criação — alias é sempre curadoria manual); nova `resolveEntityByAlias` | 6 |
| `server/assistantContext.js` | `buildProjectSnapshot` refatorado em blocos reutilizáveis (`buildIdentityBlock`, `buildParticipantsBlock`, `buildScheduleBlock`, `buildMeetingsBlock`, `buildTodosBlock`) + nova `buildContextProfile(project, profileType)` que compõe os blocos por perfil — `buildProjectSnapshot` continua existindo como alias de `buildContextProfile(project, 'DEFAULT')`, **nunca removida** (compatibilidade) | 8 |
| `package.json` | Novo script `"eval": "node eval/run_eval.mjs"` | 1 |

Nenhum arquivo de frontend (`src/`) precisa mudar nesta fase — todo o trabalho é server-side, invisível pro usuário exceto na QUALIDADE da resposta (mesmo formato de `structured`/`sources`/`proposedAction` que o front já sabe renderizar).

---

## 6. Interfaces e schemas

### 6.1 `ResolveQuerySchema` estendido

```js
const ResolveQuerySchema = z.object({
  // ... campos já existentes (intent, directReply, standaloneQuery,
  // participant, meetingScope, kind, targetMeetingId) — SEM MUDANÇA

  depth: z.enum(['FAST', 'NORMAL', 'DEEP']).describe(
    'FAST = pergunta factual simples, resposta provavelmente direta no PERFIL DO PROJETO ou em 1 trecho óbvio (ex.: "qual o CNPJ do cliente?", "quando é a próxima reunião?"). ' +
    'NORMAL = precisa cruzar 2-3 fontes ou um pouco de contexto (ex.: "o que ficou decidido sobre X na última reunião?"). ' +
    'DEEP = pergunta causal, temporal complexa, executiva, histórica, contraditória ou multi-hop (ex.: "por que atrasamos a entrega?", "como evoluiu a negociação com o fornecedor?", "monte um panorama executivo do projeto").'
  ),
  reasoningType: z.array(z.enum(['FACTUAL', 'TEMPORAL', 'CAUSAL', 'COMPARATIVE', 'EXECUTIVE'])).describe(
    'Um ou mais tipos de raciocínio que a pergunta exige — usado pra escolher o Context Profile e decidir se aciona o Planner. Vazio nunca é válido: toda pergunta real tem ao menos FACTUAL.'
  ),
  requiredCapabilities: z.array(z.enum(['meetings', 'activities', 'knowledge'])).describe(
    'Quais fontes de dado esta pergunta provavelmente precisa — hoje sempre um subconjunto de {meetings, activities, knowledge} (o escopo atual da RENATA); é o gancho já preparado pra quando novas fontes existirem no futuro, sem mudar o schema de novo.'
  ),
  asOfDate: z.string().nullable().describe(
    'Preencha em YYYY-MM-DD SOMENTE quando a pergunta pedir explicitamente o estado do conhecimento EM UMA DATA PASSADA (ex.: "o que sabíamos em 01/09?", "qual era a posição antes da reunião de sexta?" — resolva a data da reunião pelo PERFIL DO PROJETO). null na grande maioria das perguntas (implica "vigente hoje", igual ao comportamento atual).'
  ),
  entityMentions: z.array(z.object({
    name: z.string(),
    type: z.enum(['PERSON', 'COMPANY', 'PROJECT', 'LAW', 'PRODUCT', 'TOPIC']),
  })).describe(
    'Pessoas/empresas/temas que a PERGUNTA (não a resposta) menciona explicitamente — mesmo shape já usado em proposedAction.entityMentions, reaproveitado aqui pra retrieval em vez de gravação. Vazio se a pergunta não citar nenhuma entidade nomeada.'
  ),
});
```

Nenhum campo existente muda de nome/tipo — é extensão pura, **retrocompatível por construção** (código antigo que só lê os campos antigos continua funcionando).

### 6.2 Iterative Retrieval — critério objetivo de "insuficiente"

```js
// server/memoryRetrieval.js
export async function searchProjectMemoryIterative(pool, params, { maxRounds = 2 } = {}) {
  let round = 0;
  let result = await searchProjectMemory(pool, params); // já com candidate generation puro (sem fusão, ver 6.3)
  while (round < maxRounds - 1 && isInsufficient(result, params)) {
    round += 1;
    params = reformulateQuery(params, result); // determinístico: remove termo raro sem match, tenta sinônimo de dicionário fixo (não LLM)
    result = await searchProjectMemory(pool, params);
  }
  return { ...result, roundsUsed: round + 1 };
}

function isInsufficient({ lexicalRows, semanticRows }, params) {
  const totalCandidates = lexicalRows.length + semanticRows.length;
  if (totalCandidates === 0) return true;                                   // zero candidatos
  const topScore = Math.max(0, ...lexicalRows.map(r=>r.score), ...semanticRows.map(r=>r.score));
  if (topScore < MIN_ACCEPTABLE_TOP_SCORE) return true;                     // top score muito baixo (calibrado no eval, seção 13)
  if (params.expectedEntityIds && !candidatesContainEntity(...)) return true; // ausência de entidade esperada (vem do Planner/entityMentions)
  return false;
}
```

Máximo 2 rodadas, nunca loop aberto — exatamente como pedido. `reformulateQuery` é determinístico (stopword/sinônimo fixo), não uma chamada de IA — mantém o princípio "lógica determinística antes de LLM".

### 6.3 Reranking — pipeline determinístico (`retrievalRanking.js`)

```js
// Separação real de candidate generation (memoryRetrieval.js/entityRetrieval.js)
// e ranking (aqui) — a fusão por soma de score SAI de memoryRetrieval.js.

const FEATURE_WEIGHTS = { // calibrado no eval, não um chute — ver seção 13
  semanticSimilarity: 0.30,
  lexicalScoreNorm:   0.20,
  entityMatch:        0.15,
  participantMatch:   0.10,
  meetingMatch:       0.05,
  kindMatch:          0.05,
  recency:            0.10,
  exactTermMatch:     0.05,
};

export function normalizeScores(rows, method = 'minmax') {
  // min-max por PERNA (lexical separado de semântico) antes de combinar —
  // resolve o problema real descrito no item 4: ts_rank_cd e cosseno não
  // estão na mesma escala, normalizar cada um pro intervalo [0,1] ANTES
  // de qualquer soma torna a soma finalmente comparável.
}

export function fuseCandidates(lexicalRows, semanticRows, entityRows) {
  // dedup por chunk id / fact id, mantém MÚLTIPLAS origens por candidato
  // (ex.: { id, sources: ['lexical','semantic'], rawScores: {...} })
  // em vez de já somar cegamente — a soma vira só UMA feature entre
  // várias no passo de rerank, não a decisão final.
}

export function extractFeatures(candidate, { query, entityIds, participant, meetingId, kind }) {
  return {
    semanticSimilarity: candidate.rawScores.semantic ?? 0,
    lexicalScoreNorm: candidate.rawScores.lexicalNorm ?? 0,
    entityMatch: entityIds.some(id => candidate.entityIds?.includes(id)) ? 1 : 0,
    participantMatch: participant && candidate.participants?.includes(participant) ? 1 : 0,
    meetingMatch: meetingId && candidate.meetingId === meetingId ? 1 : 0,
    kindMatch: kind && candidate.kind === kind ? 1 : 0,
    recency: candidate.recencyBonus ?? 0,
    exactTermMatch: containsExactTerm(candidate.content, query) ? 1 : 0,
  };
}

export function rerank(candidates, context) {
  return candidates
    .map(c => ({ ...c, features: extractFeatures(c, context), rerankScore: weightedSum(extractFeatures(c, context), FEATURE_WEIGHTS) }))
    .sort((a, b) => b.rerankScore - a.rerankScore);
}
```

Nenhuma chamada de IA neste módulo inteiro — 100% determinístico, testável com dados sintéticos sem `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY`. Um reranker por modelo especializado só entra em cogitação SE o eval (item 1) mostrar que este pipeline determinístico não é suficiente — não antes, conforme instrução explícita do Rafael.

### 6.4 Conflict Engine 2.0 — comparação estruturada (`classifyRelationStructured`)

```js
// server/knowledgeFacts.js — substitui o corpo de classifyRelation,
// MANTÉM os mesmos 4 valores de retorno (duplicate/update/conflict/complement)
function classifyRelationStructured({ newFact, existingFact, newEntityIds, existingEntityIds }) {
  const signals = {
    same_entity: newEntityIds.some(id => existingEntityIds.includes(id)),               // via ai_knowledge_fact_entities (item 6)
    same_subject: normalizeName(newFact.subject) === normalizeName(existingFact.subject),
    same_time_scope: timeScopesOverlap(newFact, existingFact),                          // via occurred_at/valid_from/valid_until (item 8)
    negation: hasNegationMarker(newFact.content) !== hasNegationMarker(existingFact.content),
    value_difference: extractComparableValue(newFact.content) !== null
      && extractComparableValue(existingFact.content) !== null
      && extractComparableValue(newFact.content) !== extractComparableValue(existingFact.content),
  };

  let relation;
  if (existingFact.similarity >= DUPLICATE_SIMILARITY_THRESHOLD) relation = 'duplicate';
  else if (signals.same_subject && newFact.validFrom && new Date(newFact.validFrom) > new Date(existingFact.valid_from || existingFact.created_at)) relation = 'update';
  else if (signals.same_subject && signals.same_time_scope && (signals.negation || signals.value_difference)) relation = 'conflict';
  else relation = 'complement';

  return { relation, signals }; // `signals` grava em ai_knowledge_facts.conflict_analysis, pra auditoria/eval
}
```

`extractComparableValue` é uma extração determinística de padrões numéricos/percentuais comuns em português (regex de número + `%`/`R$`/dias — não um parser genérico, cobre o caso concreto do exemplo do Rafael: "5%" vs "10%"). **Fallback explícito**: se nenhum valor comparável for extraído dos dois lados E não houver negação, cai em `complement` como hoje — não força um falso conflito por falta de dado. O embedding continua sendo só o CANDIDATE GENERATOR (encontra o par mais parecido), nunca decide a relação sozinho — exatamente como pedido.

### 6.5 Evidence Pack — estrutura final (`evidencePack.js`)

```ts
interface EvidencePack {
  query: string;
  depth: 'FAST' | 'NORMAL' | 'DEEP';
  entities: Array<{ id: string; name: string; type: string }>;
  timeContext: { asOfDate: string | null; isHistorical: boolean };
  plan: InvestigationPlan | null; // só quando depth==='DEEP', ver 6.7
  evidence: Array<{
    id: string;                    // chunk id OU fact id — MESMO id usado em citedChunkIds/citedFactIds hoje, rastreabilidade preservada
    type: 'chunk' | 'fact';
    content: string;
    sourceType: string;            // chunk.kind OU fact.knowledge_type
    sourceAuthority: number;       // 0-1, de ai_knowledge_authority_weights
    semanticScore: number | null;
    lexicalScore: number | null;
    rerankScore: number;
    occurredAt: string | null;
    validFrom: string | null;
    validUntil: string | null;
    entities: string[];            // ids de ai_knowledge_entities ligadas
  }>;
  timeline: Array<{ date: string; description: string; evidenceIds: string[] }>;
  conflicts: Array<{ factIdA: string; factIdB: string; signals: object }>;
  missingEvidence: string[];       // sub-perguntas do Planner sem nenhuma evidência encontrada — nunca escondido, vira parte da resposta ("não encontrei evidência sobre X especificamente")
}
```

`synthesizeAnswer` passa a receber `evidencePackText` (uma serialização legível do pack, não o JSON cru — o modelo lê texto, igual hoje) em vez dos 3 blocos soltos atuais. **IDs originais preservados exatamente como hoje** (`[id=akf-...]` pra fatos, `[id=...]` pra chunks) — `citedChunkIds`/`citedFactIds` continuam funcionando sem nenhuma mudança de contrato no schema de saída.

### 6.6 Métricas do Eval Harness (`eval/metrics.mjs`, funções puras)

```js
export function recallAtK(retrievedIds, expectedIds, k) { /* |retrieved ∩ expected| / |expected|, cortado em k */ }
export function precisionAtK(retrievedIds, expectedIds, k) { /* |retrieved ∩ expected| / k */ }
export function meanReciprocalRank(retrievedIds, expectedIds) { /* 1/posição do primeiro relevante */ }
export function sourceCorrectness(citedSources, expectedSources) { /* % de fontes citadas que batem com o esperado */ }
export function citationCorrectness(answer, citedIds, evidencePack) { /* cada frase da resposta tem um id citado que a sustenta? checagem por overlap léxico frase↔evidência, não IA */ }
export function unsupportedClaimRate(answer, evidencePack) { /* % de afirmações sem nenhuma evidência correspondente */ }
export function conflictDetectionAccuracy(detected, expected) { /* comparação direta contra o caso plantado */ }
export function temporalCorrectness(answerAsOf, expectedAsOf) { /* a resposta refletiu o estado correto NA data pedida? */ }
export function entityResolutionAccuracy(resolvedEntities, expectedEntities) { /* comparação direta */ }
```

`citationCorrectness`/`unsupportedClaimRate` usam heurística de overlap léxico (determinística) como primeira versão — **não uma segunda chamada de IA pra "julgar" a resposta** (isso seria reintroduzir o Critic, explicitamente fora de escopo). Se a heurística léxica se mostrar insuficiente no uso real, fica registrado como limitação conhecida pro eval, não uma justificativa pra adicionar IA aqui agora.

### 6.7 Planner — schema da chamada (única, condicional)

```js
const InvestigationPlanSchema = z.object({
  subtasks: z.array(z.object({
    description: z.string(),
    searchQuery: z.string(),        // reformulação pra alimentar a busca desta subtarefa
    expectedEntityTypes: z.array(z.enum(['PERSON','COMPANY','PROJECT','LAW','PRODUCT','TOPIC'])).nullable(),
  })).describe('3-8 subtarefas de investigação, na ordem em que devem ser respondidas — cada uma vira uma busca própria, cujos resultados se acumulam no Evidence Pack antes da síntese final.'),
});
```

O Planner **nunca responde** — só devolve `subtasks`, que viram N chamadas de `searchProjectMemoryIterative`/`searchByEntity` (paralelas onde não há dependência entre subtarefas, sequenciais só quando uma claramente depende do resultado da anterior — decidido por heurística simples de posição na lista, não uma segunda IA de dependência). Model: `claude-sonnet-5` (mesmo modelo de `resolveQuery`, não o Opus caro de `synthesizeAnswer`).

---

## 7. Pseudocódigo do `askProjectAssistant` pós-evolução

```js
export async function askProjectAssistant({ pool, orgId, projectId, userId, question, context, projectData, projectUpdatedAt }) {
  const conversationId = await getOrCreateConversation(...);
  const history = await loadRecentHistory(...);
  let projectSnapshot = buildContextProfile(projectData, 'DEFAULT'); // fallback seguro, igual hoje

  // 1. resolveQuery — MESMA chamada de hoje, schema estendido (6.1)
  const resolved = await withRetry(() => resolveQuery({ question, history, context, projectSnapshot }));
  if (resolved.output.intent === 'conversa_geral') { /* ... idêntico a hoje ... */ }

  const scope = resolved.output;

  // 2. Depth Routing — determinístico, sem chamada extra
  const routing = applyRoutingOverrides(scope, question); // pode ESCALAR FAST->NORMAL->DEEP, nunca rebaixar a IA
  logMetric(pool, { eventType: 'question_asked', metadata: { depth: routing.depth, reasoningType: routing.reasoningType } });

  // 3. resolução de participante/entidades (já existia pra participant; agora inclui entityMentions genérico)
  const resolvedEntities = await resolveEntityMentions(scope.entityMentions, orgId); // entityRetrieval.js — determinístico (normalized_name + aliases)

  // 4. Cache semântico — MESMO PONTO de hoje, MESMA lógica (isStillFresh, fingerprint) — inalterado
  const cachedAnswer = await tryLookupCache(...);
  if (cachedAnswer) { /* devolve igual a hoje, sem rodar nada abaixo */ }

  // 5. Planner — SÓ quando DEEP (ou NORMAL com multi-hop sinalizado por reasoningType)
  let plan = null;
  if (routing.depth === 'DEEP' || routing.reasoningType.includes('CAUSAL')) {
    plan = await buildInvestigationPlan({ question, projectSnapshot });
  }

  // 6. Context Profile — determinístico, baseado em reasoningType/scope.kind
  const profileType = selectContextProfile(routing.reasoningType, scope.kind); // 'PERSON'|'TIMELINE'|'ACTIVITY'|'DECISION'|'EXECUTIVE'|'DEFAULT'
  projectSnapshot = buildContextProfile(projectData, profileType);

  // 7. Retrieval — plano de subtarefas (se houver) OU só a pergunta principal
  const searchTasks = plan ? plan.subtasks.map(s => s.searchQuery) : [scope.standaloneQuery];
  const retrievalResults = await Promise.all(searchTasks.map(q =>
    Promise.all([
      searchProjectMemoryIterative(pool, { orgId, projectId, query: q, participant: resolvedParticipant, meetingId: searchMeetingId, kind: scope.kind, asOfDate: scope.asOfDate }),
      searchByEntity(pool, { orgId, projectId, entityIds: resolvedEntities.map(e => e.id) }),
    ])
  ));

  // 8. Fusão + Reranking — determinístico, retrievalRanking.js
  const rankedCandidates = rerank(
    fuseCandidates(...retrievalResults.flat()),
    { query: scope.standaloneQuery, entityIds: resolvedEntities.map(e=>e.id), participant: resolvedParticipant, meetingId: searchMeetingId, kind: scope.kind },
  );

  // 9. Fatos de conhecimento — MESMA chamada de hoje, + asOfDate
  const factsResult = await loadRelevantFacts(pool, orgId, projectId, conversationId, 30, scope.asOfDate);

  // 10. Evidence Pack — junta tudo, aplica autoridade/tempo/conflito
  const evidencePack = await buildEvidencePack({
    candidates: rankedCandidates, facts: factsResult, entities: resolvedEntities,
    asOfDate: scope.asOfDate, question, plan, orgId,
  });

  // 11. Síntese — MESMA chamada de hoje, recebe evidencePackText em vez de chunksText+factsText soltos
  const synthesized = await withRetry(() => synthesizeAnswer({ question, evidencePackText: serializeEvidencePack(evidencePack), history, projectSnapshot, context, personLookupText, calendarContextText, googleConnected }));

  // 12. Validação de citações, proposedAction, gravação em ai_messages/ai_answer_cache —
  //     TUDO IDÊNTICO ao fluxo atual (linhas 475-620 de assistantRetrieval.js hoje),
  //     só acrescentando depth_mode/reasoning_type/investigation_plan/evidence_pack_summary
  //     nas colunas novas de ai_messages (seção 3).
  ...
}
```

Os únicos pontos de saída antecipada (`conversa_geral`, cache hit) continuam idênticos a hoje — o pipeline novo só entra em jogo quando uma pergunta real precisa de busca de verdade, exatamente como o fluxo atual.

---

## 8. Estratégia de backwards compatibility

- **Nenhuma função pública muda de assinatura de forma quebradiça** — todo parâmetro novo é opcional com default que reproduz o comportamento atual (`asOfDate` ausente = hoje, igual a hoje; `depth` ausente/erro de parse = tratado como `NORMAL`, o meio-termo seguro).
- **`buildProjectSnapshot` nunca é removida** — vira um alias de `buildContextProfile(project, 'DEFAULT')`, então qualquer código futuro (ou de teste) que ainda a chame diretamente continua funcionando.
- **`classifyRelation` mantém o nome e os 4 valores de retorno possíveis** — só o corpo interno ganha os sinais estruturados nomeados na seção 6.4; nenhum chamador precisa mudar.
- **`findConflictingFact` (alias antigo de `findSimilarFact`, Fase 7) continua exportado** — nenhum código de fases anteriores quebra.
- **Todas as colunas novas são nullable ou têm default** — uma linha antiga de `ai_messages`/`ai_knowledge_facts` sem os campos novos continua sendo lida normalmente por qualquer query existente (`SELECT *` nunca falha, `WHERE depth_mode = 'DEEP'` simplesmente não bate em linhas antigas, o que é o comportamento correto).
- **O contrato de saída de `askProjectAssistant` pro frontend não muda** — `structured`/`sources`/`proposedAction`/`hasEvidence` continuam exatamente no mesmo shape; nenhuma tela em `src/assistant/ProjectAssistant.jsx` precisa saber que o pipeline interno mudou.

---

## 9. Estratégia de feature flags

Seguindo o padrão já usado no código (`if (!process.env.ANTHROPIC_API_KEY) ...`, `if (!process.env.VOYAGE_API_KEY) ...` — checagem de env var direta, sem biblioteca de feature flag nova, consistente com "evite complexidade/dependência nova quando não precisa"):

| Env var | Controla | Default se ausente |
|---|---|---|
| `RENATA_DEPTH_ROUTING` | Fase 2 — se `'off'`, `routing.depth` é sempre forçado pra `'NORMAL'` (pipeline atual efetivamente, sem Planner nunca acionado) | ligado (`'on'`) depois de validado na Fase 2; começa `'off'` em produção até o eval aprovar |
| `RENATA_RERANKING` | Fase 3 — se `'off'`, `retrievalRanking.js` faz só a soma de score atual (comportamento idêntico a hoje, código antigo mantido lado a lado até a flag ser removida) | `'off'` até eval aprovar |
| `RENATA_SOURCE_AUTHORITY` | Fase 4 — se `'off'`, `applyAuthorityWeight` devolve peso 1.0 pra tudo (neutro) | `'off'` até eval aprovar |
| `RENATA_ADAPTIVE_CONTEXT` | Fase 8 — se `'off'`, `selectContextProfile` sempre devolve `'DEFAULT'` | `'off'` até eval aprovar |
| `RENATA_ITERATIVE_RETRIEVAL` | Fase 10 — se `'off'`, `maxRounds=1` (comportamento atual) | `'off'` até eval aprovar |
| `RENATA_PLANNER` | Fase 11 — se `'off'`, Planner nunca é chamado mesmo em DEEP | `'off'` até eval aprovar |

Cada flag é ativada em produção só depois do eval da fase correspondente mostrar melhora sem regressão (critérios objetivos, seção 14) — nunca todas de uma vez. `#6` (Entity-aware) e `#9` (Conflict Engine 2.0) não precisam de flag própria porque são aditivos por natureza (uma entidade a mais resolvida, ou um sinal estrutural a mais na classificação, nunca REMOVEM um caminho que já funcionava) — o risco de regressão é baixo o bastante pra não justificar uma flag dedicada, mas o rollout ainda é gradual (Fase 6/7 isoladas no cronograma, com eval antes de seguir).

---

## 10. Testes unitários

100% determinísticos, sem `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` — rodam em qualquer ambiente, inclusive CI se algum dia existir:

- `retrievalRanking.test`: `normalizeScores` com scores sintéticos conhecidos; `fuseCandidates` com overlap parcial entre lexical/semântico/entidade; `rerank` com pesos fixos e candidatos sintéticos, verificando ordem final esperada.
- `assistantRoutingRules.test`: casos onde a heurística determinística ESCALA `FAST→DEEP` (pergunta com "por que"/"causou") e casos onde não mexe na classificação da IA.
- `knowledgeFacts.classifyRelationStructured.test`: os 8 sinais individualmente (mesma entidade sim/não, mesmo assunto sim/não, etc.) + o caso concreto do Rafael ("5%" vs "10%") — deve classificar `conflict` mesmo sem negação textual.
- `entityRetrieval.resolveEntityMentions.test`: match exato, match por alias, ausência de match (nunca cria entidade nova a partir de retrieval — só `findOrCreateEntity`, chamado só no caminho de gravação, faz isso).
- `evidencePack.buildEvidencePack.test`: monta um pack sintético e verifica shape completo, incluindo `missingEvidence` populado quando uma subtarefa do plano não acha nada.
- `assistantContext.buildContextProfile.test`: cada um dos 6 profiles com um `projectData` fixo, verificando que os blocos certos aparecem/somem — nunca zero linhas (regra "amplie contexto em caso de dúvida" verificada aqui: um profile nunca deve gerar um snapshot vazio).
- `memoryRetrieval.isInsufficient.test`: os 4 critérios objetivos (zero candidatos, score baixo, entidade ausente, sem resultado de subtarefa) isolados.

---

## 11. Testes de integração

Contra Postgres local (dados seedados diretamente via SQL, mesma disciplina de sempre — nunca dependendo de IA real pra montar o cenário):

1. **Depth Routing fim a fim**: seed de um projeto com histórico rico; pergunta FAST conhecida não aciona Planner nem itera retrieval; pergunta DEEP conhecida aciona os dois.
2. **Entity-aware retrieval**: seed de uma entidade PERSON com 2 aliases + fatos ligados a ela; pergunta usando o alias resolve pro mesmo id e traz os fatos certos.
3. **Source Authority não decide sozinha**: dois candidatos, um de alta autoridade mas baixa relevância léxica/semântica, outro o oposto — o ranking final deve refletir a COMBINAÇÃO (nunca autoridade sozinha vencendo relevância zero).
4. **Temporal Reasoning**: fato com `valid_from`/`valid_until` conhecidos; pergunta com `asOfDate` dentro da janela retorna o fato; fora da janela não retorna (ou retorna a versão anterior via `superseded_by`, se existir).
5. **Conflict Engine 2.0 — caso do fornecedor**: dois fatos "concederá 5%"/"concederá 10%" sobre o mesmo fornecedor/assunto, sem nenhuma negação textual — deve classificar `conflict`, não `complement` (é literalmente o bug que motivou o item).
6. **Iterative retrieval — nunca loop aberto**: cenário sintético onde a busca É pobre nas 2 rodadas — confirma que para em `maxRounds=2` e devolve o melhor resultado disponível, nunca trava.
7. **Regressão das Fases 7/7.1/8**: os 9 cenários já documentados no plano da Fase 8 (isolamento entre projetos, fato `scope='org'`, edição versionada, as 6 resoluções de conflito, dedup de entidade, `cited_fact_ids`, busca semântica cross-projeto nunca vazando, exclusão de `superseded`/`valid_until` vencido) — **rodados de novo, sem nenhuma mudança de resultado esperada**, antes de qualquer deploy desta lista.

---

## 12. Eval set inicial (`eval/renata_eval_set.json`)

Schema de cada caso:

```json
{
  "id": "eval-001",
  "category": "FACTUAL | TEMPORAL | PERSON | MEETING | ACTIVITY | DECISION | CONFLICT | CAUSAL | EXECUTIVE | NO_EVIDENCE",
  "question": "...",
  "projectFixture": "id ou nome do projeto de teste (dado seedado, nunca produção real)",
  "expectedEvidence": { "chunkIds": [], "factIds": [] },
  "expectedEntities": [{ "name": "...", "type": "PERSON" }],
  "expectedAnswerFacts": ["afirmação atômica 1", "afirmação atômica 2"],
  "expectedNoAnswerCondition": null,
  "expectedDepth": "FAST | NORMAL | DEEP",
  "expectedSources": ["meeting_summary", "activity"]
}
```

10 casos-semente (1 por categoria, a maioria ancorada em casos REAIS já vividos nesta sessão/produção — os que dependem de dado de produção específico estão marcados `[PENDENTE]` até serem confirmados/populados com o `projectFixture` real pelo Rafael, nunca inventados):

| id | category | question (exemplo real ou modelo) | nota |
|---|---|---|---|
| eval-001 | FACTUAL | "Qual o CNPJ do cliente?" | Resolvido só pelo PERFIL DO PROJETO, sem busca — expectedDepth=FAST |
| eval-002 | TEMPORAL | "O que sabíamos sobre o rateio do seguro de vida antes da reunião de [data]?" | `[PENDENTE]` — precisa de `asOfDate` real do caso Tecumseh já documentado (PROJECT_CONTEXT.md §40) |
| eval-003 | PERSON | "O que Felipe falou sobre markup?" | Exemplo do próprio Rafael — `[PENDENTE]` popular com projeto/reunião real onde isso foi discutido |
| eval-004 | MEETING | "Resuma a última reunião." | Testa `targetMeetingId` + busca de transcrição completa (`getMeetingTranscriptChunks`) |
| eval-005 | ACTIVITY | "Não estou entendendo essa atividade pelo título, me dá mais contexto." | Testa o caminho `kind='activity'` + transcrição completa da reunião de origem |
| eval-006 | DECISION | "O que foi decidido sobre [assunto]?" | `[PENDENTE]` — popular com uma DECISION real já registrada em `ai_knowledge_facts` |
| eval-007 | CONFLICT | "Qual o rateio do seguro de vida na Tecumseh?" | **Caso real já documentado** (PROJECT_CONTEXT.md §40) — deve detectar o conflito 90/10 vs. "funcionário é maioria" estruturalmente, não só por afirmação da IA |
| eval-008 | CAUSAL | "Por que atrasamos a entrega de [atividade]?" | `[PENDENTE]` — popular com um caso real de atraso já registrado no cronograma de algum projeto |
| eval-009 | EXECUTIVE | "Monte um panorama executivo do projeto." | Testa `EXECUTIVE_CONTEXT` + `depth=DEEP` |
| eval-010 | NO_EVIDENCE | "Qual a cor do logo do fornecedor X?" (algo garantidamente fora do escopo de qualquer reunião/fato) | Deve devolver `hasEvidence=false` explicitamente, nunca inventar |

**Honestidade sobre o tamanho inicial**: 10 casos é o mínimo pra cobrir as 10 categorias pedidas, não um benchmark estatisticamente robusto — a expectativa é crescer pra 30-50 casos reais ao longo das primeiras fases, priorizando sempre perguntas REALMENTE feitas à RENATA (capturáveis via `ai_messages.content` em produção, com curadoria manual das melhores/piores) em vez de casos sintéticos inventados.

`eval/run_eval.mjs` roda cada caso, chama `askProjectAssistant` de verdade (custo real de tokens — por isso é `node eval/run_eval.mjs` manual, nunca automático), calcula as 11 métricas da seção 6.6, grava em `ai_eval_runs` com o commit atual pra comparação histórica.

---

## 13. Métricas baseline atuais

**Honestidade explícita, não uma tabela de números inventados**: hoje NÃO existe nenhuma medição de recall/precision/MRR/citation correctness/hallucination rate — confirmado por leitura completa de `assistantRetrieval.js`, `memoryRetrieval.js`, `metrics.js`. O que existe hoje, e serve de baseline PARCIAL (proxies, não as métricas de verdade):

| Métrica proxy disponível hoje | Fonte |
|---|---|
| Volume de perguntas | `ai_metrics_events` (`question_asked`) |
| Taxa de cache hit | `cache_hit` vs `cache_miss` |
| Taxa de rejeição de fato proposto | `fact_rejected` / `fact_proposed` |
| Taxa de conflito detectado (só pelos 2 mecanismos atuais) | `conflict_detected` (2 origens) |
| `hasEvidence=false` (proxy grosseiro de "sem evidência") | `ai_messages.has_evidence` |
| Tokens/latência por pergunta | `ai_messages.tokens_input/output/latency_ms` |

**O baseline de verdade (recall@K, precision@K, MRR, citation correctness, unsupported claim rate, conflict detection accuracy, temporal correctness, entity resolution accuracy) só passa a existir depois da primeira execução do Eval Harness (Fase 1) contra o pipeline ATUAL, sem nenhuma das mudanças deste plano ainda aplicadas.** Essa primeira rodada — não um número deste documento — é o baseline contra o qual toda fase seguinte é comparada. Qualquer número de "baseline" escrito antes dessa execução real seria inventado, o que o próprio princípio deste plano proíbe.

---

## 14. Critérios objetivos de sucesso por fase

| Fase | Critério de sucesso (comparado ao baseline da fase anterior, nunca "parece melhor") |
|---|---|
| 1 — Eval Harness | Harness roda 2x seguidas sem mudança de resultado (não-flaky); baseline registrado em `ai_eval_runs` |
| 2 — Depth Routing | ≥90% de acerto na classificação FAST/NORMAL/DEEP contra o rótulo esperado do eval set; latência média de perguntas FAST cai ou se mantém (nunca aumenta) |
| 3 — Reranking | `precision@5` sobe no eval set sem `recall@10` cair; nenhuma regressão nos 9 cenários da Fase 8 |
| 4 — Source Authority | Nos casos de eval com fonte de autoridade conhecida, o ranking final reflete a hierarquia configurada; nenhum caso de baixa relevância com alta autoridade vence um caso de alta relevância — verificado caso a caso, não só em média |
| 5 — Temporal Reasoning | 100% dos casos `TEMPORAL` do eval retornam o fato vigente NA data pedida (não a versão atual) |
| 6 — Entity-aware Retrieval | Casos `PERSON` do eval resolvem alias corretamente; `entityResolutionAccuracy` ≥ o que for medido no baseline (não pode piorar, já que hoje é 0 estrutural) |
| 7 — Conflict Engine 2.0 | Caso do fornecedor (5% vs 10%) classificado `conflict`; `conflictDetectionAccuracy` sobe no eval sem introduzir falso-positivo nos casos `complement` conhecidos |
| 8 — Adaptive Context | Redução mensurável de tokens de entrada em perguntas FAST/PERSON sem queda de `hasEvidence`/qualidade nos casos do eval |
| 9 — Evidence Pack | `citationCorrectness` sobe, `unsupportedClaimRate` cai — é a métrica mais diretamente ligada a essa peça |
| 10 — Iterative Retrieval | Casos onde a 1ª rodada é sabidamente fraca (plantados no eval) recuperam evidência na 2ª rodada, sem exceder 2 rodadas nunca |
| 11 — Planner | Casos `CAUSAL`/`EXECUTIVE` do eval mostram decomposição condizente com o esperado; latência/custo de DEEP sobe (esperado, seção 15/16) mas qualidade (`unsupportedClaimRate`, `sourceCorrectness`) sobe proporcionalmente mais |

Nenhuma fase avança pra produção (flag ligada) sem cumprir o critério da própria fase — se não cumprir, a fase é revisada antes de seguir pra próxima (nunca acumula dívida silenciosa).

---

## 15. Custo de tokens esperado

| Item | Direção | Detalhe |
|---|---|---|
| #2 Depth Routing | ~0 | Mesma chamada de `resolveQuery`, só schema maior (few dezenas de tokens de output a mais) |
| #4 Reranking | 0 | Puro JS, sem chamada de IA |
| #7 Source Authority | 0 | Multiplicador em memória/SQL |
| #8 Temporal Reasoning | 0 | Mesmo filtro, parâmetro a mais |
| #6 Entity-aware Retrieval | 0 | Resolução determinística + JOIN SQL |
| #9 Conflict Engine 2.0 | 0 | Checks em JS sobre dado já carregado |
| #10 Evidence Pack | ligeira ↓ possível | Substitui 3 blocos de texto às vezes redundantes por um pack mais denso — tende a ser neutro ou levemente menor em tokens de entrada |
| #3 Adaptive Context | ↓ em perguntas FAST/PERSON | Contexto menor injetado quando o profile não precisa do snapshot completo |
| #5 Iterative Retrieval | ↑ só quando aciona (raro, por critério objetivo) | +1 busca SQL (não IA) — custo de tokens zero, custo de tempo de banco pequeno |
| #1 Eval Harness | custo isolado, fora de produção | Só quando executado manualmente (`node eval/run_eval.mjs`), proporcional ao tamanho do eval set |
| #11 Planner | ↑ só em DEEP | +1 chamada Sonnet pequena (mesmo custo por token de `resolveQuery`), MAS pode gerar N sub-buscas em vez de 1 → mais candidatos processados no reranking (JS, não IA) antes de `synthesizeAnswer` |

**Líquido esperado**: custo médio por pergunta deve CAIR ou ficar neutro (a maioria das perguntas reais tende a ser FAST/NORMAL, que ficam mais baratas com Adaptive Context) — o aumento de custo concentra-se exclusivamente em perguntas DEEP, que são also as que mais se beneficiam em qualidade.

---

## 16. Impacto de latência

| Item | Impacto |
|---|---|
| FAST (maioria das perguntas, estimativa a confirmar no eval) | Igual ou mais rápido que hoje — sem Planner, contexto menor, reranking é JS puro (milissegundos) |
| NORMAL | Ligeiro aumento (reranking + entity resolution, ambos JS/SQL rápidos — não chamada de IA) |
| DEEP | Aumento real e esperado: +1 chamada de IA (Planner) + N buscas em paralelo (Promise.all, não serializado) em vez de 1 — mitigado por rodar as subtarefas em paralelo sempre que não há dependência declarada entre elas |
| Iterative Retrieval (quando aciona) | +1 round-trip de SQL (baixos milissegundos em Postgres, não comparável ao custo de uma chamada de IA) |

Nenhum item introduz uma chamada de IA SÍNCRONA a mais no caminho de perguntas FAST/NORMAL — a única chamada de IA nova (Planner) é estritamente condicional a DEEP, preservando a latência das perguntas mais comuns.

---

## 17. Rollback strategy

- **Todo schema é aditivo** — reverter uma fase nunca exige `DROP COLUMN`/perda de dado; uma coluna nova simplesmente para de ser escrita se o código for revertido.
- **Toda capacidade nova (exceto #6/#9, aditivas por natureza) tem feature flag própria (seção 9)** — rollback de produção é `RENATA_<FLAG>=off` (deploy de config, não de código) — reversível em minutos, sem precisar reverter um commit.
- **Rollback de código**: como cada fase é um commit/deploy isolado (seguindo o fluxo já estabelecido: rsync → build → commit → push → verificação HTTP), reverter é `git revert` do commit daquela fase especificamente — nunca precisa reverter fases anteriores já validadas, porque cada uma é aditiva e independente das seguintes (a ordem de dependência da seção 2 é sobre o que cada fase PRECISA já existir, não sobre acoplamento de código que quebra se removido).
- **Dado gerado durante o rollback não é perdido**: `conflict_analysis`/`evidence_pack_summary`/`investigation_plan` são colunas de auditoria, nunca lidas por nenhum caminho de produção crítico — desligar a feature simplesmente para de popular colunas que já eram opcionais.
- **Pior cenário (bug em produção não pego pelo eval nem pelos testes de integração)**: a mesma disciplina já usada no incidente real de `max_tokens` (Fase 5) — log detalhado (`console.error`, visível via `railway logs`) em cada novo módulo, e o padrão já existente de nunca deixar uma falha de peça secundária derrubar `askProjectAssistant` inteiro (todo módulo novo — Planner, Entity Retrieval, Evidence Pack — precisa de um `try/catch` que degrada pro comportamento ANTERIOR daquela peça especificamente, nunca propaga erro pra fora, exatamente como `buildProjectSnapshot`/Google Calendar/`linkFactEntities` já fazem hoje).
