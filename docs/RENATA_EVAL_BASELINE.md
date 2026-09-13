# RENATA Eval Harness — Status e Baseline

**Data:** 2026-09-13
**Fase:** 1 (Evaluation Harness) — [docs/RENATA_P0_P1_IMPLEMENTATION_PLAN.md](RENATA_P0_P1_IMPLEMENTATION_PLAN.md)

Este documento é atualizado automaticamente (sobrescrito) toda vez que
`node server/evals/runFullEval.mjs --baseline` roda com sucesso. **A versão
abaixo NÃO é um FULL EVAL real** — é o status desta implementação, honesto
sobre o que já foi medido e o que ainda está pendente. Nenhum número de
"baseline" foi inventado pra preencher esta seção.

## O que já está pronto e funcionando

- Infraestrutura completa do harness (`server/evals/`): fixtures, casos,
  runner, métricas, relatório, dois modos de execução (UNIT/DETERMINISTIC e
  FULL EVAL).
- Instrumentação opcional (`trace`) em `askProjectAssistant`
  (`server/assistantRetrieval.js`) — aditiva, sem nenhuma mudança de
  comportamento pra chamadores existentes (ver comentário no próprio código).
- 23 casos de eval cobrindo as 12 categorias pedidas (FACTUAL, PERSON,
  MEETING, ACTIVITY, DECISION, TEMPORAL, CONFLICT, CAUSAL, EXECUTIVE,
  NO_EVIDENCE, AMBIGUOUS_REFERENCE, MULTI_HOP), fáceis/médios/difíceis,
  contra uma fixture única (`server/evals/fixtures.js`) inspirada em padrões
  reais já documentados nesta base (o caso do rateio de seguro de vida em
  PROJECT_CONTEXT.md §40, decisão atualizada no tempo, atividade atrasada
  por dependência) — nomes/números fictícios de propósito.
- Migration aditiva aplicada localmente (`ai_eval_runs`, histórico de
  execuções do benchmark).

## UNIT/DETERMINISTIC — já executado, resultado real

```
$ npm run eval:unit

RENATA Eval Harness — UNIT/DETERMINISTIC
Passou: 34  Falhou: 0
```

34 asserções determinísticas (sem nenhuma chamada de rede) cobrindo: as
funções de métrica do próprio harness (`recallAtK`, `precisionAtK`, `mrr`,
`citationIdValidity`, `evaluateExpectedFacts`, `noEvidenceVerdict`,
`conflictVerdict`, etc.) e peças já existentes e já puras do "cérebro" da
RENATA (`classifyRelation`, `normalizeName`, `cosineSimilarity`,
`DUPLICATE_SIMILARITY_THRESHOLD=0.93`, `CONFLICT_SIMILARITY_THRESHOLD=0.75`).

**Achado de baseline já confirmado (determinístico, documentado por design)**:
`classifyRelation` classifica dois fatos com valores numéricos DIFERENTES
sobre o mesmo assunto ("prazo é 25/08" vs "prazo é 10/09"), sem nenhuma
negação textual, como `'complement'` — não `'conflict'`. É exatamente o
ponto cego já previsto em
[RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md](RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md)
(item 9, Conflict Engine 2.0), agora confirmado por teste automatizado, não
só por leitura de código.

## Achado real e inesperado durante a seed da fixture (Voyage real, sem Anthropic)

A seed (`seedFixtures`, que chama `saveKnowledgeFact` de verdade — código de
produção, não reimplementado) usa embeddings REAIS da Voyage (`VOYAGE_API_KEY`
está configurada neste ambiente). Dois resultados não previstos no desenho
do caso de teste, e por isso mais valiosos que um resultado esperado:

1. **"Prazo 25/08" vs "prazo 10/09" (mesmo assunto, valor diferente, sem
   negação) saiu como `duplicate`, não `complement`.** A similaridade de
   embedding real entre as duas frases (que diferem só na data) ficou
   ACIMA de `DUPLICATE_SIMILARITY_THRESHOLD=0.93` — o segundo fato foi
   **descartado silenciosamente** (`saveKnowledgeFact` retorna cedo em
   `relation==='duplicate'`, nunca insere a linha nova). Isso é uma variante
   AINDA MAIS séria do gap do Conflict Engine 2.0 do que o previsto: não é
   só "classificado errado como complemento", é "perdido por completo,
   tratado como se fosse a mesma informação". Achado real, registrado aqui
   como baseline — **não corrigido nesta fase**, por instrução explícita.
2. **"Felipe é o responsável fiscal" vs "Camila passou a ser a responsável
   fiscal a partir de 01/09" saiu como `new` (dois fatos independentes),
   não `update`.** A troca do nome da pessoa (Felipe→Camila) aparentemente
   reduz a similaridade de embedding abaixo de `CONFLICT_SIMILARITY_THRESHOLD
   =0.75`, então `findSimilarFact` nunca encontra o candidato — o mecanismo
   de sucessão temporal (`valid_until`/`superseded_by`) nunca é acionado.
   Resultado: os DOIS fatos ficam `active` simultaneamente, sem nenhum
   vínculo entre si — um contraste real e nunca antes documentado com a
   suposição de que "o mesmo assunto com dado atualizado" é sempre
   detectável por similaridade de conteúdo.

Ambos os achados reforçam, com evidência de execução real (não só leitura de
código), a prioridade dada a **#9 Conflict Engine 2.0** no plano P0/P1 — e
sugerem que o item precisa lidar não só com "conflito classificado como
complemento", mas também com dois modos de falha adicionais: perda
silenciosa por excesso de similaridade, e ausência total de vínculo por
similaridade insuficiente quando a entidade nomeada muda.

## FULL EVAL — PENDENTE (bloqueador real, não simulado)

`node server/evals/runFullEval.mjs` precisa de `ANTHROPIC_API_KEY` — a
mesma chave que `askProjectAssistant` usa em produção pra `resolveQuery`/
`synthesizeAnswer`. **Esta chave não está configurada no ambiente local
desta sessão** (confirmado: ausente em `.env` e em todas as variáveis de
ambiente acessíveis). Sem ela, rodar o FULL EVAL produziria só erros de
autenticação em todo caso, não um baseline real — e inventar um número aqui
violaria diretamente o princípio desta fase ("mesmo que a RENATA atual erre,
registre o erro como baseline" pressupõe medir de verdade, não simular).

**O harness está pronto pra rodar assim que a chave estiver disponível**:

```bash
# Roda todos os 23 casos, cache desligado (padrão — evita resposta antiga
# mascarando o comportamento atual), grava o baseline oficial:
node server/evals/runFullEval.mjs --baseline

# Roda só uma categoria, sem gravar baseline (exploração pontual):
node server/evals/runFullEval.mjs --category=CONFLICT

# Roda um caso específico:
node server/evals/runFullEval.mjs --case=temporal-02-hard

# Remove a fixture do Postgres local ao final:
node server/evals/runFullEval.mjs --baseline --teardown
```

Ao rodar com `--baseline`, este arquivo é sobrescrito com o relatório real
(seção `RENATA EVAL REPORT`, rotulada `BASELINE — BEFORE P0/P1 BRAIN
IMPROVEMENTS`) seguido do `FAILURE TRACES` completo de cada caso que falhar,
e uma linha é gravada em `ai_eval_runs` pra comparação histórica entre fases.

## Estimativa de custo do FULL EVAL (antes de rodar de verdade)

23 casos × 2 chamadas de IA cada (Sonnet em `resolveQuery`, Opus em
`synthesizeAnswer`, quando não é `conversa_geral`) — nenhum caso desta
fixture é saudação, então são ~46 chamadas de IA no total por execução
completa. O prompt de sistema de `synthesizeAnswer` é longo (cacheado via
`cache_control: ephemeral`, mas só entre chamadas próximas no tempo) e o
contexto por pergunta é pequeno (fixture com só 7 reuniões) — a ordem de
grandeza esperada, SEM medição real ainda, é de baixos milhares de tokens
totais (input+output somados) para a suíte inteira, um custo baixo em
dólares (Sonnet + Opus nesse volume). **Este é um cálculo estimado a partir
do desenho da fixture, não uma medição** — o número real (`Tokens totais
consumidos nesta execução`) é impresso e registrado automaticamente na
primeira execução do FULL EVAL.

## Limitações conhecidas desta Fase 1 (documentadas, não escondidas)

- **Citation support (julgamento semântico de "a fonte realmente sustenta a
  afirmação?")** é aproximado por overlap léxico determinístico
  (`lexicalSupportScore`, `server/evals/evalMetrics.js`), não por julgamento
  de modelo — conforme instrução explícita ("implemente essa parte
  inicialmente como avaliação opcional/offline, nunca dentro do pipeline de
  produção"). Uma citação semanticamente correta mas com pouco overlap de
  palavras (paráfrase forte) pode ser subestimada por essa heurística; isso
  é uma limitação conhecida do harness, não da RENATA.
- **Reranking/ranking determinístico não é testável isoladamente nesta
  fase** — a fusão de score (`searchProjectMemory`,
  `server/memoryRetrieval.js`) está inline na função de busca, não extraída
  como peça própria; extrair isso é exatamente o trabalho do item #4
  (Reranking) do plano P0/P1, ainda não implementado por instrução
  explícita desta tarefa.
- **23 casos é o mínimo pra cobrir as 12 categorias pedidas, não um
  benchmark estatisticamente robusto** — a expectativa (registrada também
  no plano P0/P1) é crescer o eval set com perguntas reais feitas à RENATA
  em produção, com curadoria manual, ao longo das próximas fases.
