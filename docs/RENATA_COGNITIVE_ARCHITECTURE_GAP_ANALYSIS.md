# RENATA — Diagnóstico: de RAG chatbot a Sistema Cognitivo de Gestão de Projetos

**Data:** 2026-09-13
**Tipo:** diagnóstico técnico puro — **nenhum código foi alterado para produzir este documento.**
**Pedido por:** Rafael, em resposta ao caso real Tecumseh (RENATA detectou um conflito de fonte sozinha ao responder, mas nada foi gravado em Conhecimento — resolvido depois com `flag_knowledge_conflict`, PROJECT_CONTEXT.md §40). Esse episódio expôs que a RENATA de hoje reage bem quando o motor de memória já foi acionado, mas não tem nenhuma camada que decide *como investigar* uma pergunta antes de responder — daí o pedido de tratá-la como sistema cognitivo, não como wrapper de RAG.

Este documento não repete o inventário de telas/permissões/entidades já levantado em [`docs/RENATA_COVERAGE_MAP.md`](RENATA_COVERAGE_MAP.md) — ele assume esse mapa como pré-requisito lido e foca só na arquitetura de raciocínio da RENATA (o pipeline entre a pergunta chegar e a resposta sair).

---

## A. MAPA DO CÉREBRO ATUAL

Pipeline real, hoje, ponta a ponta (todo o corpo em [`server/assistantRetrieval.js`](../server/assistantRetrieval.js), função `askProjectAssistant`):

```
USUÁRIO
  │
  ▼
resolveQuery()  ── claude-sonnet-5, zodOutputFormat(ResolveQuerySchema)
  │   resolve: standaloneQuery, participant?, meetingId?, kind?
  │   (assistantRetrieval.js:44-59)
  ▼
CACHE SEMÂNTICO (ai_answer_cache)
  │   lookupCachedAnswer() por embedding cosine + isStillFresh()
  │   (answerCache.js:51-137) — HIT encerra o pipeline aqui, pula tudo abaixo
  ▼  (MISS)
BUSCA — 3 chamadas em paralelo, SEMPRE as 3, incondicionalmente:
  ├─ buildProjectSnapshot()        — snapshot FIXO do projeto (assistantContext.js)
  ├─ searchProjectMemory()         — híbrido lexical+semântico (memoryRetrieval.js)
  └─ loadRelevantFacts()           — ai_knowledge_facts do projeto+org (knowledgeFacts.js:310)
  ▼
synthesizeAnswer()  ── claude-opus-5, max_tokens:4000, zodOutputFormat(SynthesizeAnswerSchema)
  │   recebe TUDO que as 3 buscas trouxeram, decide sozinho o que usar
  │   produz: answer (seções), citedChunkIds, citedFactIds, proposedAction?
  ▼
RESPOSTA AO USUÁRIO (+ ação proposta, se houver — nunca executada sem confirmação)
  │
  ▼ (se usuário confirma)
executeXxxAction() (assistantActions.js) → grava/agenda/marca
  │
  ▼
ai_metrics_events (fire-and-forget, .catch(()=>{}))
```

Características estruturais confirmadas por leitura direta do código:

- **Uma única chamada de "entendimento"** (`resolveQuery`) e uma única chamada de "síntese" (`synthesizeAnswer`) — não há iteração entre elas. Se a busca vier fraca, `synthesizeAnswer` recebe pouco e responde com `hasEvidence:false` ou uma seção de aviso — nunca há uma segunda rodada de busca.
- **Nenhum uso nativo de `tools`/`tool_use` da Anthropic em todo o `server/`** — confirmado por grep em todo o diretório: o único padrão de chamada à IA é `client.messages.parse(..., { output_config: { format: zodOutputFormat(Schema) } })`, usado idêntico em `assistantRetrieval.js` (2x) e `server/meetingInbox.js` (`extractMeetingFromTranscript`). Ou seja: **toda "capacidade" da RENATA é uma função JS chamada incondicionalmente antes do prompt, nunca uma ferramenta que o modelo escolhe invocar.**
- **O contexto injetado no prompt é o mesmo para qualquer pergunta** — `buildProjectSnapshot` sempre roda os mesmos cortes (`assistantContext.js:177,198,214,249,255`: `.slice(0,8/12/40/10/12)`), `searchProjectMemory` sempre busca lexical+semântico sobre a mesma pergunta reformulada uma vez, `loadRelevantFacts` sempre traz até 30 fatos (`knowledgeFacts.js:310`, `limit=30`). Uma pergunta factual simples ("quem é o responsável pela atividade X?") e uma pergunta executiva complexa ("por que atrasamos a entrega?") disparam exatamente o mesmo custo e o mesmo shape de contexto.
- **Fusão de busca híbrida é soma de score, não reranking** — `memoryRetrieval.js:121-129`: `lexicalRows` e `semanticRows` são combinados num `Map` por `id`, somando score quando o mesmo chunk aparece nas duas buscas (`byId.set(r.id, {...r, score: prev.score + r.score})`), depois ordenado e cortado em `limitClamped`. Não existe nenhum modelo/heurística de reranking pós-fusão — o corte final é só "quem tem mais score bruto".
- **Conflitos são detectados por 2 mecanismos paralelos e desconectados**: (1) `classifyRelation` (knowledgeFacts.js, privado) roda só quando um NOVO fato é salvo via `save_knowledge_fact`, comparando contra o `findSimilarFact` mais próximo por embedding cosine (`CONFLICT_SIMILARITY_THRESHOLD=0.75`) + heurística de negação por regex (`NEGATION_PATTERN`, knowledgeFacts.js:47); (2) `flag_knowledge_conflict` (novo, Fase 8.1) é a própria IA afirmando textualmente duas versões conflitantes dentro da síntese, sem nenhuma verificação estrutural adicional — a IA já decidiu que é conflito, o backend só grava (`saveConflictPair`, knowledgeFacts.js:228, bypassa `classifyRelation` de propósito).
- **Autoridade de fonte não existe como conceito** — não há nenhuma tabela/coluna/lógica que hierarquize "decisão formal" vs "transcrição literal" vs "inferência da IA". A única sinalização de força é o par (similaridade de embedding, recência via `RECENCY_BONUS_SQL`, um decaimento linear de 180 dias idêntico pras duas pernas da busca).
- **Nenhuma coluna de confiança existe** — schema completo de `ai_messages` confirmado (`db.js:424-481`): `id, conversation_id, role, content, sources, has_evidence, scope, feedback, model, tokens_input, tokens_output, latency_ms, error, created_at` + Fase 7/8: `proposed_action, action_status, structured, cited_fact_ids, from_cache`. `has_evidence` é booleano — não há categoria de confiança, só "tem evidência ou não".
- **Nenhum verificador pós-síntese** — a saída de `synthesizeAnswer` vai direto pro usuário (só duas validações mecânicas existem: `citedChunkIds`/`citedFactIds` são filtrados contra os ids que realmente foram injetados no prompt — `assistantRetrieval.js:480-494` — uma defesa contra alucinação de *id*, não contra alucinação de *conteúdo*).
- **Feedback (👍/👎) é armazenado (`ai_messages.feedback`) e nunca lido de volta por nada** — confirmado por grep: não existe nenhuma query `SELECT ... WHERE feedback` em todo `server/` fora da rota que grava o campo.
- **16 tipos de evento em `ai_metrics_events`** (todo call site de `logMetric` no codebase, `server/metrics.js:9`): `question_asked`, `cache_hit`, `cache_miss`, `cache_rejected_stale`, `fact_proposed`, `fact_confirmed`, `fact_rejected`, `duplicate_detected`, `temporal_update_detected`, `conflict_detected` (2 origens: `classifyRelation` e `answer_synthesis`), `complement_detected`, `fact_edited`, `conflict_resolved`, `conflict_flagged_from_answer`, `conflict_flag_confirmed`, `conflict_flag_rejected`. É pura telemetria de contagem — nenhum desses eventos é consumido para mudar comportamento (não há "loop" de aprendizado, só um log).
- **Entidades existem mas não são usadas no raciocínio** — `ai_knowledge_entities`/`ai_knowledge_fact_entities` (db.js:716-745) guardam PERSON/COMPANY/PROJECT/LAW/PRODUCT/TOPIC com dedup por `normalized_name`, mas nada em `assistantRetrieval.js` consulta essas tabelas durante `askProjectAssistant` — elas só alimentam a Central de Conhecimento (UI de governança), não o pipeline de resposta.
- **Isolamento por projeto é estrutural, não uma checagem opcional** — `ai_conversations` é chaveada em `(project_id, user_id)` — a RENATA não tem, hoje, NENHUM caminho de código para responder cruzando dois projetos de clientes diferentes, exceto fatos `scope='org'` (intencional, sobre a própria PRICETAX). Isso é uma restrição sólida que qualquer evolução tem que preservar exatamente como está.

---

## B. GAP ANALYSIS (20 itens)

Convenção usada abaixo: **Existe** (funciona hoje, evidência com file:line) / **Parcial** (existe uma peça, mas incompleta ou desconectada) / **Falta** (não existe nenhuma peça).

### 1. Planner — **Falta**
- O que existe: nada decompõe uma pergunta em subtarefas. `resolveQuery` só extrai `standaloneQuery`/`participant`/`meetingId`/`kind` (assistantRetrieval.js:44-59) — é normalização de query, não planejamento.
- Arquivos impactados: `server/assistantRetrieval.js` (novo passo entre `resolveQuery` e a busca).
- Schema: nenhuma mudança obrigatória (o plano pode viver só na chamada, sem persistir) — opcionalmente uma coluna `plan JSONB` em `ai_messages` para auditoria/debug.
- Riscos: é uma 3ª chamada de IA na cadeia — some do latência a cada pergunta, mesmo nas simples, se aplicado sem discriminação (por isso depende de #16, Depth Routing).
- Custo/latência: uma chamada extra (~1-2s, modelo pequeno) SÓ deveria disparar quando o roteador (#16) classificar a pergunta como NORMAL/DEEP.
- Prioridade: **P1** — alto valor pra perguntas causais/executivas, mas caro se aplicado universalmente; depende de #16 pra não virar overhead universal.
- Dependências: precisa de #16 (Depth Routing) decidir quando vale a pena; alimenta #2 (Iterative Retrieval) com as subtarefas.
- Como testar: `RENATA_EVAL_SET` (#19) com perguntas causais/multi-hop reais, comparando decomposição do plano contra o esperado.
- Melhora inteligência real? Sim, mas só pro subconjunto de perguntas onde decompor importa — aplicado a perguntas factuais simples é puro custo.

### 2. Iterative Retrieval — **Falta**
- O que existe: exatamente uma rodada de busca. Único fallback existente hoje é textual, não semântico: `searchProjectMemory` reformula de `AND` pra `OR` quando a busca lexical AND vem vazia (`memoryRetrieval.js:88-89`, já documentado como o fix do bug `plainto_tsquery`) — isso é retry de MODO de query, não reformulação de CONTEÚDO baseada em qualidade fraca de resultado.
- Arquivos impactados: `server/memoryRetrieval.js`, `server/assistantRetrieval.js` (precisa de um critério de "resultado fraco" pra decidir se itera).
- Schema: nenhuma mudança.
- Riscos: sem um critério objetivo de "fraco" (ex.: score abaixo de threshold, zero candidatos após fusão), pode iterar sempre e dobrar custo por padrão.
- Custo/latência: dobra o custo de busca (não de IA) só quando aciona — busca em Postgres é barata, mas cada rodada extra ainda adiciona round-trip.
- Prioridade: **P1** — resolve diretamente a classe de erro "não achei evidência" que hoje vira resposta fraca em vez de nova tentativa.
- Dependências: se combinado com #1 (Planner), a reformulação pode usar as subtarefas já geradas em vez de reformular às cegas.
- Como testar: casos no eval set onde a primeira busca é sabidamente fraca (pergunta com sinônimo raro) — medir se a segunda rodada recupera evidência que a primeira perdeu.
- Melhora inteligência real? Sim — ataca diretamente falsos-negativos de "sem evidência" quando a evidência existe mas a query inicial não a alcançou.

### 3. Contextual Chunks — **Parcial**
- O que existe: `project_memory_chunks` já carrega bastante contexto por linha — schema completo confirmado (`db.js:354-372`): `meeting_id, kind (7 valores: transcript_segment/meeting_summary/meeting_decision/meeting_highlight/meeting_topic/activity/activity_comment), content, participants JSONB, meeting_date, meeting_title, time_ref, source_ref JSONB, scope, chunk_order`. Isso já é mais do que um chunk "cru" — tem cliente/projeto implícito por `project_id`, data, participantes e tipo.
- O que falta: não guarda um **resumo do próprio chunk** nem o **assunto** de forma extraível sem reprocessar `content` inteiro — se um chunk isolado for citado fora do fluxo normal (ex.: um tool futuro do item #20 que busca só chunks sem o resto do pipeline), o consumidor só tem `meeting_title`+`time_ref`+`content` pra entender do que se trata, sem um campo curto tipo "resumo de uma linha".
- Arquivos impactados: `server/db.js` (nova coluna opcional), `server/meetingInbox.js` (quem gera os chunks na ingestão).
- Schema: `ALTER TABLE project_memory_chunks ADD COLUMN IF NOT EXISTS gist TEXT` — um resumo curto gerado no momento da extração (já existe uma chamada de IA em `extractMeetingFromTranscript`, o resumo pode sair de lá sem custo adicional).
- Riscos: baixo — é aditivo, não muda leitura existente.
- Custo/latência: zero incremental se o resumo for extraído na MESMA chamada de `extractMeetingFromTranscript` que já roda hoje.
- Prioridade: **P2** — o schema já é bom o suficiente pro pipeline atual; só vale a pena se algo passar a consumir chunks isoladamente (ex.: um tool de #20).
- Dependências: nenhuma bloqueante; ajuda #4 (Reranking) e #20 (Tool Architecture) a operarem sobre chunks sem re-buscar contexto.
- Como testar: verificar que um chunk antigo (sem `gist`) continua funcionando (coluna nullable, fallback pro `content` truncado).
- Melhora inteligência real? Marginal isoladamente — é infraestrutura de suporte pra outros itens, não uma capacidade nova por si só.

### 4. Reranking — **Falta**
- O que existe: fusão por soma de score confirmada linha a linha (`memoryRetrieval.js:121-129`) — sem nenhum modelo/heurística de reranking pós-fusão.
- Arquivos impactados: `server/memoryRetrieval.js` (novo passo após a fusão, antes do corte final).
- Schema: nenhuma mudança de tabela.
- Riscos: um reranker por LLM adiciona uma chamada de IA a mais por pergunta (custo+latência); um reranker por heurística (ex.: penalizar overlap de termos genéricos, boost por correspondência exata de nome próprio) é grátis mas mais fraco.
- Custo/latência: se via LLM, +1 chamada pequena por pergunta; se heurístico, ~0.
- Prioridade: **P1** — é a peça mais barata de implementar (puramente algorítmica) com maior impacto direto em qualidade de evidência, e é pré-requisito de fato pro #14 (Confidence Engine) ter um sinal de "força do retrieval" que hoje não existe.
- Dependências: nenhuma — pode ser implementado isolado. Alimenta #14 (Confidence Engine) e #15 (Critic).
- Como testar: eval set com perguntas onde o top-1 por score bruto é sabidamente menos relevante que um candidato mais abaixo — medir se o reranker promove o certo.
- Melhora inteligência real? Sim, diretamente — hoje a "força" de uma evidência é só a soma de dois scores heterogêneos (tsvector rank + cosine similarity), que não são comparáveis na mesma escala; reranking calibra isso.

### 5. Adaptive Context — **Falta**
- O que existe: `buildProjectSnapshot` é chamado sempre com os mesmos cortes fixos, confirmados por linha: `unresolvedParticipants.slice(0,8)` (assistantContext.js:177), `overdueActivities.slice(0,12)` (:198), `activitiesById.slice(0,40)` (:214), `criticalTodos.slice(0,10)` (:249), `pendingTodos.slice(0,12)` (:255) — mesmo shape pra "quem é o Felipe?" e pra "monte um panorama executivo do projeto".
- Arquivos impactados: `server/assistantContext.js` (parametrizar os cortes por "tipo de pergunta"), `server/assistantRetrieval.js` (decidir o tipo antes de chamar).
- Schema: nenhuma mudança de tabela.
- Riscos: se o classificador de "tipo de pergunta" errar, pode CORTAR contexto que seria relevante (ex.: tratar uma pergunta como "sobre pessoa" quando também tem componente de cronograma) — precisa de fallback pro snapshot completo em caso de dúvida, nunca reduzir de forma que possa causar "sem evidência" falso.
- Custo/latência: pode REDUZIR custo em perguntas simples (menos tokens injetados) e aumentar precisão em perguntas complexas (contexto mais focado) — item raro que corta custo e melhora qualidade ao mesmo tempo, se bem implementado.
- Prioridade: **P1** — depende só de #16 (Depth Routing) já ter classificado a pergunta; implementação é reorganizar código existente, não escrever motor novo.
- Dependências: usa a classificação de #16; pode reusar as subtarefas de #1 se ambos existirem.
- Como testar: eval set comparando qualidade de resposta com snapshot adaptativo vs. fixo, pra mesma pergunta, controlando tokens usados.
- Melhora inteligência real? Sim — hoje uma pergunta sobre uma pessoa recebe as mesmas 12 atividades atrasadas que uma pergunta sobre prazo recebe, o que é desperdício de contexto (tokens) e ruído (o modelo tem que filtrar sozinho o que é relevante).

### 6. Memória Episódica — **Falta**
- O que existe: `project_memory_chunks` guarda eventos individuais (reunião, decisão, atividade) com `chunk_order` e `meeting_date`, mas nada os conecta numa SEQUÊNCIA causal explícita (contexto→acontecimento→decisão→consequência→resultado). Recuperar uma "história" hoje depende inteiramente do modelo juntar chunks soltos na síntese, sem estrutura que garanta ordem/causalidade.
- Arquivos impactados: novo módulo (`server/knowledgeEpisodes.js`, sugestão), `server/db.js` (nova tabela).
- Schema: uma tabela nova é justificável aqui (não é um caso de "JSONB resolve"): `ai_knowledge_episodes (id, org_id, project_id, subject, chunk_ids JSONB, fact_ids JSONB, narrative TEXT, started_at, ended_at, created_at)` — mas só constrói episódios que JÁ existem no dado, nunca infere uma sequência que não está nos chunks/fatos originais.
- Riscos: alto de virar "feature bonita mas não usada" se não houver um gatilho claro de QUANDO materializar um episódio — recomenda-se disparar só sob demanda (quando o usuário pergunta algo temporal/histórico sobre um assunto específico), nunca como job de fundo que tenta detectar todos os episódios do projeto.
- Custo/latência: se construído sob demanda via LLM lendo os chunks relevantes já filtrados, é uma chamada a mais só quando a pergunta pedir "conte a história de X".
- Prioridade: **P2** — valor real mas específico (perguntas tipo "como chegamos nessa decisão sobre o fornecedor X ao longo do tempo?"), não é o gargalo mais comum hoje.
- Dependências: se apoia em #9 (Temporal Reasoning) pra ordenar corretamente, e em #10 (Source Authority) pra saber qual versão prevalece em cada ponto da linha do tempo.
- Como testar: eval set com perguntas explicitamente históricas/sequenciais.
- Melhora inteligência real? Sim, mas para uma fatia estreita de perguntas — não é fundação, é uma capacidade adicional em cima de fundações mais urgentes (#9, #10, #11).

### 7. Memória Procedural / Skills — **Falta**
- O que existe: nada. Não há registro de "como fazer" nada — cada resposta é gerada do zero a partir de fatos/chunks, sem nenhum "procedimento reutilizável" nomeado.
- Arquivos impactados: novo módulo (`server/knowledgeSkills.js`), rota nova em `server/knowledge.js`, aba nova ou extensão de `EntitiesTab`-like na Central de Conhecimento.
- Schema: nova tabela `ai_knowledge_skills (id, org_id, name, objective, trigger_description, preconditions JSONB, steps JSONB, tools_used JSONB, completion_criteria TEXT, known_failures JSONB, examples JSONB, version INT, scope, source_fact_ids JSONB, created_at, updated_at)` — modelo relacional simples, sem necessidade de grafo.
- Riscos: sem um fluxo humano de aprovação (mesmo princípio de `save_knowledge_fact`), uma Skill mal generalizada de um caso único vira "regra falsa" aplicada em contextos errados — **toda Skill nasce como PROPOSTA, nunca é ativa sem confirmação humana**, mesmo padrão de #18 (Lições Aprendidas), aliás são o mesmo mecanismo de fundo: uma Skill é uma Lição Aprendida com uma estrutura mais rígida (passos, pré-condições, critérios) em vez de texto livre.
- Custo/latência: baixo — Skills são lidas, não geradas a cada pergunta; a geração é rara (proposta manual ou após um padrão repetido).
- Prioridade: **P3** — é a capacidade mais avançada da lista e a que mais depende de todas as outras já existirem (sem Failure Memory #8 e Lições Aprendidas #18 maduras, não há material de onde generalizar uma Skill).
- Dependências: depende fortemente de #8 e #18 já estarem rodando por um tempo e produzindo padrões reais, não hipotéticos.
- Como testar: não é testável isoladamente de forma significativa antes de #8/#18 existirem — o teste real é "essa Skill proposta reflete um padrão que de fato se repetiu no histórico?", que exige dado histórico acumulado.
- Melhora inteligência real? Potencialmente sim, mas é o item mais especulativo da lista — risco real de virar complexidade sem uso se implementado cedo demais.

### 8. Failure Memory — **Falta**
- O que existe: `fact_rejected` e `conflict_flag_rejected` são logados em `ai_metrics_events` (assistantRetrieval.js:656,658) quando o usuário rejeita uma proposta — mas isso é só uma contagem, não uma "memória de falha" pesquisável (`metadata` guarda só `subject`, não o motivo da rejeição nem o que a IA deveria ter feito diferente).
- Arquivos impactados: `server/assistantActions.js` (capturar motivo opcional na rejeição), `server/knowledgeFacts.js` ou novo `server/knowledgeFailures.js`.
- Schema: nova tabela pequena `ai_knowledge_failures (id, org_id, project_id, kind TEXT, description TEXT, related_fact_id, related_message_id, corrected_by TEXT, created_at)` — ou, mais simples e suficiente: reaproveitar `ai_knowledge_facts` com `knowledge_type='HYPOTHESIS'` invertida por uma flag, mas isso mistura conceitos; a tabela dedicada é mais limpa dado que "falha" tem campos próprios (o que foi tentado, por que falhou, o que corrigiu).
- Riscos: se a captura do motivo de rejeição depender de o usuário digitar algo toda vez, a adesão será baixa — o UI precisa oferecer um campo opcional de "por quê?" no botão de rejeitar sem bloquear a rejeição rápida.
- Custo/latência: zero — é só gravação, sem IA envolvida na captura.
- Prioridade: **P2** — dado já existe parcialmente (`fact_rejected`/`conflict_flag_rejected`), só falta capturar o "porquê" e torná-lo pesquisável; baixo esforço, mas o valor só aparece depois de volume acumulado.
- Dependências: alimenta #17 (Learning Loop) e #7 (Skills).
- Como testar: seed direto de casos de rejeição com motivo, verificar que aparecem agregados corretamente numa consulta futura de "erros conhecidos sobre X".
- Melhora inteligência real? Sim a médio prazo, mas é acumulativo — não muda uma resposta individual no dia 1, só depois de haver histórico suficiente pra um Critic (#15) ou Planner (#1) consultarem "já erramos nisso antes?".

### 9. Temporal Reasoning — **Parcial**
- O que existe: infraestrutura temporal real já existe — `valid_from`/`valid_until` em `ai_knowledge_facts` (db.js:576-577), cadeia de `superseded_by` (edição versionada, nunca UPDATE destrutivo, `knowledgeCenter.js` função `editFactVersioned`), `meeting_date`/`chunk_order` em `project_memory_chunks`, decaimento de recência (`RECENCY_BONUS_SQL`) em ambas as pernas de busca.
- O que falta: nenhuma pergunta do TIPO "o que sabíamos em 01/09?" ou "quando essa decisão mudou?" é tratada de forma diferente de uma pergunta factual comum — `resolveQuery` não extrai uma data-alvo/janela temporal como parâmetro estruturado (só extrai `standaloneQuery`/`participant`/`meetingId`/`kind`), então a busca não consegue filtrar "vigente EM UMA DATA PASSADA" — ela só sabe filtrar "vigente AGORA" (o filtro de `valid_until` recém-adicionado na Fase 8 compara contra `CURRENT_DATE`, não contra uma data arbitrária da pergunta).
- Arquivos impactados: `server/assistantRetrieval.js` (`ResolveQuerySchema` ganha um campo `asOfDate` opcional), `server/knowledgeFacts.js`/`server/memoryRetrieval.js` (queries aceitam uma data de referência em vez de `CURRENT_DATE` fixo).
- Schema: nenhuma mudança de tabela — os campos temporais já existem, falta só USÁ-LOS parametrizados por uma data que não seja sempre "hoje".
- Riscos: baixo — é uma extensão do filtro que já existe, não uma reescrita.
- Custo/latência: zero incremental — mesma query, parâmetro diferente.
- Prioridade: **P1** — infraestrutura já pronta em ~80%, o gap é só não expor esse eixo pro `resolveQuery` capturar; é uma das relações custo/benefício mais altas da lista inteira.
- Dependências: nenhuma bloqueante; melhora diretamente #6 (Memória Episódica) e #11 (Conflict Engine 2.0, que precisa saber se dois fatos "coexistiram" ou um sucedeu o outro).
- Como testar: eval set com perguntas literais tipo as do pedido do Rafael ("o que sabíamos em [data]?"), verificando que o fato certo (vigente NAQUELA data, não hoje) é retornado.
- Melhora inteligência real? Sim, diretamente e com baixo custo de implementação — é o gap de maior alavancagem da lista inteira junto com #4 (Reranking).

### 10. Source Authority — **Falta**
- O que existe: nenhuma hierarquia de fonte. `origin` (`ai_knowledge_facts.origin`, CHECK IN `conversation/legislation/internal_document/methodology/best_practice/other`, db.js:585-586) categoriza a PROVENIÊNCIA mas não tem peso algum em nenhuma query — não é usado em `findSimilarFact`, `loadRelevantFacts` nem em nenhum ranking. `project_memory_chunks.kind` (7 valores) também categoriza sem peso algum na fusão de busca.
- Arquivos impactados: `server/memoryRetrieval.js` (fusão passa a aplicar peso por `kind`), `server/knowledgeFacts.js` (`findSimilarFact`/`loadRelevantFacts` passam a aplicar peso por `origin`+`knowledge_type`), possivelmente `server/knowledgeCenter.js` (permitir configurar a hierarquia, não fixar em código — o Rafael pediu "hierarquia configurável").
- Schema: uma tabela pequena de configuração é justificável aqui (não hardcode em JS) — `ai_knowledge_authority_weights (org_id, source_kind TEXT, weight NUMERIC, updated_at)` com um seed default refletindo a ordem dada pelo Rafael (decisão formal aprovada > conhecimento curado > documento oficial > atividade formal > resumo de reunião > transcrição > inferência da IA).
- Riscos: se mal calibrado, pode SUPRIMIR uma transcrição literal correta em favor de um "resumo" desatualizado — a hierarquia deve ser um BOOST no ranking, nunca um filtro que exclui a fonte de menor autoridade (ela ainda deve aparecer, só com menos peso).
- Custo/latência: zero incremental — é multiplicador aplicado no mesmo SQL/JS que já calcula score.
- Prioridade: **P1** — combina diretamente com #4 (Reranking) e é pré-requisito real de #11 (Conflict Engine 2.0) e #14 (Confidence Engine) terem um sinal de "qual fonte pesa mais" quando duas divergem.
- Dependências: alimenta #11, #14; pode ser implementado independentemente de #4, mas os dois juntos formam o "reranker" completo que o Rafael descreveu no pipeline-alvo.
- Como testar: casos sintéticos com 2 fontes conflitantes de autoridade diferente conhecida, verificar que o ranking final reflete a hierarquia configurada.
- Melhora inteligência real? Sim — hoje "qual fonte é mais confiável" não tem NENHUM sinal estrutural, só recência e similaridade de embedding, que não capturam autoridade.

### 11. Conflict Engine 2.0 — **Parcial**
- O que existe: dois mecanismos reais e testados em produção — `classifyRelation` (embedding cosine ≥0.75 + regex de negação `NEGATION_PATTERN`, knowledgeFacts.js:47) e `flag_knowledge_conflict` (a própria IA afirma o conflito em texto livre na síntese, sem verificação estrutural adicional). Ambos gravam via `conflicts_with` (self-FK) e status `disputed`.
- O que falta: nenhuma das 7 perguntas estruturais que o Rafael listou é respondida explicitamente hoje — "mesma entidade? mesmo assunto? mesmo atributo/predicado? datas compatíveis? um substitui o outro? um nega o outro? são complementares?" são hoje reduzidas a UM sinal (similaridade de embedding acima de threshold) + UMA heurística de negação por regex. Não há checagem de entidade (mesmo que `ai_knowledge_entities` já exista, `classifyRelation` não a consulta), nem checagem de compatibilidade de data (mesmo que `valid_from`/`valid_until` já existam).
- Arquivos impactados: `server/knowledgeFacts.js` (`classifyRelation` ganha os checks estruturais antes/depois do embedding), possivelmente uma 4ª categoria de relação além de duplicate/update/conflict/complement (`temporal_coexistence`, pra "os dois são verdade, só em janelas de tempo diferentes" — hoje isso provavelmente cai em `conflict` por engano, já que não há checagem de data).
- Schema: nenhuma tabela nova — usa `ai_knowledge_fact_entities` (já existe) pra checar "mesma entidade" e `valid_from`/`valid_until` (já existem) pra checar "datas compatíveis".
- Riscos: adicionar mais critérios estruturais ANTES do embedding pode acidentalmente EXCLUIR conflitos reais que hoje são pegos só por similaridade textual — a extensão deve ser aditiva (o embedding continua sendo o primeiro filtro/candidato, os critérios estruturais REFINAM a classificação de relação, não substituem a detecção).
- Custo/latência: zero incremental de IA — os checks estruturais são SQL/JS puro sobre dado que já existe.
- Prioridade: **P0** — é diretamente o ponto fraco que gerou o pedido de reformulação inteira da RENATA (o caso Tecumseh só foi pego porque a IA disse explicitamente "isso conflita", não porque o motor estrutural detectou); reforçar essa detecção estrutural fecha o próprio gap que motivou este documento.
- Dependências: se beneficia de #9 (Temporal Reasoning) pra "datas compatíveis" e de #10 (Source Authority) pra decidir qual lado prevalece quando resolvido.
- Como testar: os mesmos 6 cenários de resolução de conflito já testados na Fase 8 (`keep_a/keep_b/temporal_update/complement/archive_both/mark_reviewed`), mais casos novos onde a similaridade de embedding é baixa mas o conflito é estrutural (mesma entidade+atributo, valores diferentes, datas sobrepostas) — hoje esses casos passam despercebidos.
- Melhora inteligência real? Sim, diretamente — é a evolução mais alinhada ao incidente real que originou este pedido inteiro.

### 12. Relações entre entidades — **Parcial**
- O que existe: `ai_knowledge_fact_entities` já é literalmente uma tabela de relação binária (fato ↔ entidade), sem tipo de relação. `ai_knowledge_entities.linked_user_id`/`linked_project_id` são relações resolvidas mas de tipo fixo (PERSON→user, COMPANY/PROJECT→project).
- O que falta: não há um TIPO de relação nomeado entre duas ENTIDADES (Pessoa PARTICIPOU_DE Reunião, Decisão ALTEROU Atividade, etc.) — hoje a única relação registrada é "este fato menciona esta entidade", sem predicado.
- Arquivos impactados: `server/db.js` (nova tabela), `server/knowledgeEntities.js` (popular a relação a partir do que já se sabe: participantes de reunião já vêm em `project_memory_chunks.participants`, decisões que alteram atividades já existem como fatos com `knowledge_type='DECISION'`).
- Schema: `ai_knowledge_entity_relations (id, org_id, subject_entity_id, predicate TEXT, object_entity_id, source_fact_id, source_meeting_id, created_at)` com `predicate` sendo um enum fechado (os 8 exemplos dados pelo Rafael: PARTICIPOU_DE, GEROU, ALTEROU, DEPENDE_DE, SUPORTA, SUBSTITUI, CONTRADIZ, CAUSOU) — modelo relacional simples, **explicitamente não um grafo dedicado** (é uma tabela Postgres com 2 FKs, consultável com JOIN comum; "relação sem grafo visual" foi o próprio requisito confirmado na Fase 8).
- Riscos: popular essa tabela retroativamente (pra todo o histórico já existente) é trabalho de migração real, não só uma ALTER — recomenda-se popular só PRA FRENTE (nas próximas extrações/fatos) e deixar o histórico antigo sem essas relações, em vez de rodar um backfill custoso e propenso a erro de inferência sobre dado antigo.
- Custo/latência: zero incremental se populado no momento em que o fato/entidade já está sendo processado (mesmo momento de `linkFactEntities`).
- Prioridade: **P2** — valor real pra #13 (Causal Reasoning), mas sem consumidor imediato até #13 existir; não é uma tela nova pro usuário, é infraestrutura de raciocínio.
- Dependências: pré-requisito direto de #13 (Causal Reasoning) — CONTRADIZ/CAUSOU são literalmente o material bruto de perguntas causais.
- Como testar: verificar que uma DECISION conhecida (ex.: "decidimos não levar a Unimed ao acordo coletivo") gera a relação `Decisão ALTEROU [algo]` corretamente ligada às entidades certas.
- Melhora inteligência real? Só em conjunto com #13 — isoladamente é só uma tabela populada sem consumidor.

### 13. Causal Reasoning — **Falta**
- O que existe: nada estruturalmente — perguntas causais ("por que atrasamos?") hoje dependem 100% do modelo de síntese juntar pistas soltas nos chunks/fatos recebidos, sem nenhum sinal explícito de causa→efeito.
- Arquivos impactados: `server/assistantRetrieval.js` (prompt de síntese passa a receber as relações de #12 quando existirem, formatadas como pistas causais explícitas).
- Schema: depende de #12 existir primeiro (CAUSOU/CONTRADIZ são os predicados que sustentam causalidade).
- Riscos: o maior risco da lista inteira em termos de alucinação — é fácil para um LLM inventar uma relação causal plausível mas falsa quando pressionado a explicar "por quê". Mitigação: a resposta causal só pode se apoiar em relações CAUSOU/DEPENDE_DE que estão EXPLICITAMENTE registradas na tabela de #12 (rastreável até a evidência, regra inegociável do Rafael) — se não há relação registrada, a resposta deve dizer "não há causa registrada, só correlação temporal" em vez de inventar uma explicação.
- Custo/latência: nenhuma chamada de IA adicional necessária além da síntese já existente — é sobre O QUE é injetado no prompt, não uma nova chamada.
- Prioridade: **P2** — alto valor mas bloqueado por #12 não existir ainda; implementar antes de #12 significaria alucinação disfarçada de "raciocínio causal".
- Dependências: bloqueado por #12.
- Como testar: eval set com perguntas causais reais onde a causa VERDADEIRA está registrada como relação — medir se a resposta cita a relação certa e nunca inventa uma não registrada (métrica de "causal correctness" do item #19).
- Melhora inteligência real? Sim, mas só depois de #12 dar a ele material real pra se apoiar — implementado sem #12, na prática vira só "deixar o LLM chutar melhor", que é risco, não ganho.

### 14. Confidence Engine — **Falta**
- O que existe: só `has_evidence` (booleano) em `ai_messages` — confirmado, não há nenhuma coluna de confiança/categoria na tabela (schema completo listado na seção A). O prompt de síntese não pede nem uma auto-avaliação de confiança.
- Arquivos impactados: `server/assistantRetrieval.js` (`SynthesizeAnswerSchema` ganha um campo `confidenceCategory`), `server/db.js` (nova coluna em `ai_messages`).
- Schema: `ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS confidence_category TEXT CHECK (confidence_category IN ('alta','evidencia_parcial','evidencia_conflitante','sem_evidencia'))` — as 4 categorias exatas pedidas pelo Rafael, nunca uma porcentagem.
- Riscos: se a categoria vier só de auto-relato do próprio modelo de síntese (sem sinal externo), é tão confiável quanto o modelo "achar que sabe" — o valor real só aparece quando a categoria é DERIVADA de sinais objetivos já calculados: força do reranking (#4), autoridade da fonte (#10), há conflito não resolvido tocando o mesmo assunto (#11), quantidade de fontes independentes corroborando. Implementar isso como só um campo que o modelo preenche livremente é a versão fraca; a versão forte calcula a categoria em CÓDIGO a partir desses sinais e só pede ao modelo pra descrever o porquê.
- Custo/latência: zero incremental se calculado em JS a partir de sinais que #4/#10/#11 já produzem — vira caro e não-confiável se depender de uma chamada extra de IA só pra "julgar confiança".
- Prioridade: **P1** — mas ORDEM importa: implementar antes de #4/#10 dá uma categoria fraca (auto-relato); implementar depois de #4/#10 já existirem dá uma categoria real (derivada). Recomenda-se sequenciar depois de #4/#9/#10/#11.
- Dependências: qualidade real depende de #4 (Reranking) e #10 (Source Authority) já existirem — sem eles, é confiança auto-declarada, exatamente o que o Rafael pediu para NÃO ser ("não uma porcentagem falsa").
- Como testar: eval set com casos de cada categoria conhecida a priori (evidência forte/parcial/conflitante/nula), verificar que a categoria calculada bate.
- Melhora inteligência real? Sim, mas só na versão "derivada de sinais reais" — a versão "auto-relato do modelo" é teatro de confiança, não confiança de verdade.

### 15. Critic / Verificador — **Falta**
- O que existe: só a validação mecânica de ids citados (`assistantRetrieval.js:480-494`, filtra `citedChunkIds`/`citedFactIds` contra o que foi realmente injetado) — isso previne "citar um id inventado", não previne "extrapolar o conteúdo de uma fonte real", "ignorar uma contradição", "confundir data/projeto" ou nenhuma das outras falhas que o Rafael listou.
- Arquivos impactados: `server/assistantRetrieval.js` (novo passo entre `synthesizeAnswer` e a resposta final).
- Schema: opcionalmente uma coluna de auditoria (`ai_messages.critic_verdict JSONB`) pra registrar o que o Critic encontrou, mesmo quando aprova.
- Riscos: é uma 3ª chamada de IA na cadeia mais crítica (toda resposta passaria por ela) — custo e latência dobram se aplicado sempre; e um Critic mal calibrado pode rejeitar respostas corretas (falso positivo), piorando a experiência sem ganho real.
- Custo/latência: alto se aplicado universalmente (+1 chamada de IA por pergunta, todo o tempo) — o próprio Rafael limitou o escopo ("pode devolver UMA vez pra nova síntese"), o que ajuda a limitar o pior caso a 2x o custo de síntese, não ilimitado.
- Prioridade: **P1** — mas deve ser condicionado por #16 (Depth Routing): só rodar Critic em modo NORMAL/DEEP, nunca em FAST, senão o custo/latência sobe pra TODA pergunta simples também.
- Dependências: depende de #16 pra não ser universal; se beneficia de #14 (Confidence Engine) já ter calculado uma categoria fraca, que o Critic pode usar como ponto de partida em vez de reavaliar do zero.
- Como testar: eval set com respostas SABIDAMENTE com erro plantado (extrapolação, contradição ignorada) — medir taxa de captura do Critic, e também taxa de falso-positivo (rejeitar resposta correta).
- Melhora inteligência real? Sim, é o item de maior impacto em CONFIABILIDADE da lista — mas caro, por isso depende tanto de #16 pra ser aplicado seletivamente.

### 16. Depth Routing — **Falta**
- O que existe: nenhuma classificação de complexidade existe hoje — toda pergunta roda exatamente o mesmo pipeline (`resolveQuery` → busca tripla incondicional → `synthesizeAnswer`), independente de ser "quem é o responsável pela atividade X" ou "faça uma análise executiva completa do projeto".
- Arquivos impactados: `server/assistantRetrieval.js` (novo passo logo após `resolveQuery`, decide o modo antes de disparar a busca).
- Schema: `ai_messages.depth_mode TEXT CHECK (depth_mode IN ('fast','normal','deep'))` pra auditoria/métricas.
- Riscos: a classificação errada tem custo assimétrico — classificar DEEP como FAST perde qualidade (pior); classificar FAST como DEEP só desperdiça custo (menos grave). Calibrar o classificador pra errar do lado caro, não do lado raso, quando em dúvida.
- Custo/latência: bem implementado, REDUZ custo médio (a maioria das perguntas reais tende a ser factual simples) enquanto habilita #1/#2/#5/#15 seletivamente nos casos que realmente precisam.
- Prioridade: **P0** — é o item que torna TODOS os outros itens caros (#1, #2, #5, #15) economicamente viáveis; sem ele, qualquer um desses vira "sempre ligado" (caro demais) ou "nunca ligado" (sem valor). É a peça que destrava o resto do orçamento de complexidade.
- Dependências: é pré-requisito prático de #1, #2, #5, #15 — não bloqueia tecnicamente nenhum deles, mas sem ele nenhum é sustentável em custo.
- Como testar: eval set rotulado manualmente por modo esperado (FAST/NORMAL/DEEP), medir acurácia da classificação.
- Melhora inteligência real? Indiretamente sim — não adiciona capacidade nova sozinho, mas é o que torna as capacidades caras da lista viáveis sem explodir custo médio por pergunta.

### 17. Learning Loop — **Falta**
- O que existe: `ai_messages.feedback` é gravado (👍/👎) mas nunca lido de volta por nenhuma query em todo `server/` (confirmado por grep) — é puramente decorativo hoje.
- Arquivos impactados: novo processo/rota que lê feedback periodicamente (não em tempo real, dado o próprio requisito do Rafael de "um único feedback nunca deve alterar comportamento global sozinho" — isso pede agregação, não reação individual).
- Schema: nenhuma tabela nova obrigatória — pode agregar sobre `ai_messages.feedback` + `ai_metrics_events` existentes; se quiser rastrear "essa correção específica gerou uma Failure Memory", usa a tabela de #8.
- Riscos: o maior risco é justamente violar a regra do próprio Rafael — qualquer implementação que deixe UM 👎 mudar uma resposta futura (ex.: um cache stale de "essa fonte é ruim") quebra o requisito explícito. A agregação deve exigir um MÍNIMO de ocorrências repetidas do mesmo padrão antes de qualquer efeito, e mesmo assim o efeito deve ser uma PROPOSTA (nova entrada em Failure Memory #8 ou Lição Aprendida #18), nunca uma mudança automática de comportamento.
- Custo/latência: baixo — é um job periódico de agregação (SQL), não uma chamada de IA por evento.
- Prioridade: **P2** — o dado bruto (feedback) já existe, mas o valor só aparece depois de volume suficiente acumulado, e a implementação segura (respeitando "nunca sozinho") é mais delicada que parece.
- Dependências: alimenta #8 (Failure Memory) via 👎+correção, e indiretamente #18 (Lições Aprendidas) via 👍 repetido no mesmo padrão de skill/fonte.
- Como testar: seed de múltiplos 👎 no mesmo padrão, verificar que só a partir de um limiar configurável algo é proposto (nunca no primeiro).
- Melhora inteligência real? Sim a longo prazo, mas é o item mais fácil de implementar errado (violando "nunca sozinho") — exige disciplina de agregação, não só ligar o cano do feedback.

### 18. Lições Aprendidas — **Falta**
- O que existe: nada — não há nenhum mecanismo de RENATA propor generalização cross-projeto. O único cruzamento cross-projeto que já existe é `scope='org'` em `ai_knowledge_facts` (fatos sobre a própria PRICETAX, não lições extraídas de um projeto de cliente).
- Arquivos impactados: `server/assistantRetrieval.js` (novo tipo de `proposedAction`, ex. `propose_lesson_learned`, mesmo padrão flat de `ProposedActionSchema` — sem discriminated union, reforçando o padrão já estabelecido), `server/knowledgeFacts.js` ou novo módulo (grava como fato `scope='org'` após confirmação, reusando a infraestrutura que já existe).
- Schema: nenhuma tabela nova necessariamente — uma lição aprendida confirmada É um fato `scope='org'` como já existe; a única adição é o próprio `proposedAction` novo pra propô-la a partir de um evento de projeto específico, com um campo `source_project_id`/`source_fact_ids` pra rastreabilidade de onde a lição veio.
- Riscos: exatamente o mesmo risco já mitigado em `save_knowledge_fact`/`flag_knowledge_conflict` — nunca vira conhecimento PRICETAX sem confirmação humana explícita (o Rafael já reafirmou essa regra pra este item especificamente). Risco adicional aqui: uma "lição" de um projeto pode não generalizar (o que funcionou pro cliente A pode ser específico do contexto dele) — por isso a proposta deve sempre mostrar a origem (projeto+evidência) pro humano avaliar se generaliza antes de confirmar.
- Custo/latência: mesmo custo marginal que qualquer `proposedAction` já tem hoje — é aditivo ao prompt de síntese, sem chamada de IA extra.
- Prioridade: **P2** — reusa quase toda a infraestrutura já existente (proposedAction + fatos `scope='org'`), esforço de implementação é baixo, mas o valor depende de RENATA identificar bem QUANDO algo é "reutilizável" (risco de propor lições triviais/ruidosas com frequência).
- Dependências: nenhuma bloqueante técnica — é essencialmente uma extensão de `save_knowledge_fact` com `scope` fixo em `'org'` e proveniência explícita.
- Como testar: casos reais onde um evento de projeto claramente generaliza (ex.: um padrão fiscal que se repete entre clientes) vs. casos que claramente não generalizam — verificar que RENATA só propõe no primeiro tipo.
- Melhora inteligência real? Sim, e é um dos itens de MENOR esforço de implementação relativo ao valor, já que reusa quase tudo que a Fase 8 já construiu.

### 19. Evaluation Harness — **Falta**
- O que existe: nada — não existe `RENATA_EVAL_SET` nem qualquer suíte de avaliação. Toda validação até hoje (Fases 2-8) foi manual: scripts `_test_*.mjs` descartáveis testando LÓGICA determinística (embeddings, SQL, versionamento) e verificação manual no browser — nunca uma medição sistemática de QUALIDADE de resposta da IA (não existe `ANTHROPIC_API_KEY` local, confirmado nesta sessão e em sessões anteriores, o que é PARTE do motivo de nunca ter existido um harness real: testar comportamento de IA localmente sempre foi limitado).
- Arquivos impactados: novo diretório `eval/` (fora de `server/`, não é código de produção), um script runner novo, possivelmente uma rota admin read-only pra visualizar resultados históricos.
- Schema: uma tabela é justificável aqui pra HISTÓRICO de execuções do eval set (não pra perguntas individuais, que podem viver num arquivo JSON versionado em `eval/renata_eval_set.json`): `ai_eval_runs (id, org_id, run_at, git_commit, results JSONB, summary_metrics JSONB)` — permite comparar execuções ao longo do tempo sem reprocessar tudo manualmente.
- Riscos: exige `ANTHROPIC_API_KEY` de verdade pra rodar contra o pipeline real (custo real por execução) — precisa rodar sob demanda (antes de mudanças relevantes no pipeline), não em CI automático a cada commit, dado o custo.
- Custo/latência: custo direto em tokens toda vez que roda (proporcional ao tamanho do eval set) — não afeta produção, só o processo de desenvolvimento.
- Prioridade: **P0** — é uma dependência TRANSVERSAL: praticamente todo item acima (#1, #2, #4, #5, #9, #10, #11, #13, #14, #15, #16) pede "como testar" apontando pro eval set — sem ele, qualquer mudança nesses itens é validada só "olhando respostas manualmente", exatamente o que o Rafael pediu para NUNCA fazer de novo.
- Dependências: é pré-requisito de facto pra validar #1, #2, #4, #5, #9, #10, #11, #13, #14, #15, #16 com rigor — deveria ser um dos PRIMEIROS itens implementados, não um dos últimos, mesmo com poucos casos inicialmente (pode crescer incrementalmente).
- Como testar: o harness se testa contra si mesmo — rodar 2x sem mudança nenhuma no pipeline e confirmar que os resultados são estáveis (não há flakiness na própria avaliação).
- Melhora inteligência real? Não melhora a RENATA diretamente — é o que torna toda melhoria futura MENSURÁVEL em vez de "parece melhor". Prioridade P0 não porque é urgente sozinho, mas porque destrava a validação segura de tudo mais.

### 20. Tool Architecture — **Falta**
- O que existe: confirmado por grep completo do `server/`: ZERO uso de `tools`/`tool_use` nativos da Anthropic em qualquer lugar do código — o único padrão de chamada é `messages.parse` + `zodOutputFormat`, usado em `assistantRetrieval.js` (2x) e `meetingInbox.js` (1x). Toda "capacidade" hoje é uma função JS chamada incondicionalmente ANTES do prompt (`buildProjectSnapshot`, `searchProjectMemory`, `loadRelevantFacts`, a chamada opcional ao Google Calendar) — não existe nenhuma abstração onde o MODELO decide quais dados buscar.
- Arquivos impactados: `server/assistantRetrieval.js` (reestruturação do miolo de `askProjectAssistant` pra suportar um loop de tool-calling), novo módulo `server/assistantTools.js` (definição de cada tool + seu handler).
- Schema: nenhuma mudança de tabela — as tools operariam sobre dado que já existe; a única adição indireta é se novas tools abrirem acesso a áreas hoje fora do escopo da RENATA (ex. `searchXflowTickets()`, `getProjectFinancials()` do próprio pedido do Rafael) — nesse caso, cada tool nova herda EXATAMENTE a checagem de permissão já usada por aquela área (reusar `canAccessProject`/`requireXflowAccess`/etc., nunca criar uma checagem paralela) — mesmo princípio já seguido por `listAccessibleProjectIds` (permissions.js).
- Riscos: é a mudança de MAIOR risco arquitetural da lista inteira — muda o padrão de chamada à Anthropic pela primeira vez desde o início do projeto (de `parse`+`zodOutputFormat` puro para um loop com `tool_use`), então precisa de teste extenso antes de ir pra produção; e cada tool nova que cruza pra uma área hoje fora do escopo da RENATA (XFlow, Macro, Agenda) precisa reafirmar isolamento de permissão ANTES do retrieval, não depois (regra inegociável do Rafael) — uma tool mal implementada pode vazar dado de um projeto/empresa pra outro se a checagem de `accessibleProjectIds` não for aplicada dentro do HANDLER da tool, e não só na rota HTTP externa.
- Custo/latência: pode REDUZIR custo se bem feito — hoje TODAS as 3 fontes de contexto são buscadas sempre, mesmo quando a pergunta só precisa de uma; com tools, o modelo escolhe. Mas adiciona overhead de protocolo (idas e voltas de tool_use/tool_result) que pode aumentar latência por pergunta mesmo reduzindo tokens.
- Prioridade: **P1** — [`docs/RENATA_COVERAGE_MAP.md`](RENATA_COVERAGE_MAP.md) já mapeou candidatas reais de tool (busca de tickets XFlow, visão cross-empresa do Macro, feed mesclado de Agenda) que hoje são simplesmente INACESSÍVEIS à RENATA por não haver mecanismo de seleção de capacidade — mas é uma mudança estrutural grande o bastante pra não ser P0: o ganho imediato de #9/#10/#11/#16 é maior por esforço menor.
- Dependências: não bloqueia nenhum outro item, mas se BENEFICIA de #16 (Depth Routing) já existir — perguntas FAST provavelmente nem precisam do loop de tools, só perguntas NORMAL/DEEP justificam o overhead de protocolo.
- Como testar: eval set precisa de casos que exigem especificamente uma tool nova (ex.: "quais tickets abertos do XFlow estão vinculados a este projeto?") pra medir se o modelo seleciona a tool certa, com os parâmetros certos, respeitando permissão — as 3 métricas de "Actions" do item #19 (correção de proposta/parâmetro/permissão) se aplicam aqui também, não só a `proposedAction`.
- Melhora inteligência real? Sim, é o item que mais diretamente amplia o que a RENATA consegue VER (hoje estruturalmente single-project, sem XFlow/Macro/Agenda) — mas é também o item onde "parece arquiteturalmente elegante" mais tenta seduzir pra mais complexidade do que o necessário; a versão certa começa com 2-3 tools concretas e comprovadamente úteis, não um framework genérico de tool-calling especulativo.

---

## C. ARQUITETURA ALVO

Pipeline alvo, anotado com o que cada estágio mapeia nos itens 1-20 e o que já existe hoje sob outro nome:

```
USUÁRIO
  │
  ▼
ROUTER / QUERY UNDERSTANDING   ── EXISTE (resolveQuery) + estende com #16 (Depth Routing) e #9 (extrair janela temporal)
  │
  ▼
PLANNER                         ── #1, NOVO — só roda em modo NORMAL/DEEP (decidido pelo Router)
  │
  ▼
SELEÇÃO DE MEMÓRIAS E TOOLS     ── #20, NOVO — hoje é busca incondicional das 3 fontes; alvo é seleção pelo modelo
  │
  ▼
RETRIEVAL HÍBRIDO               ── EXISTE (searchProjectMemory) + #2 (Iterative Retrieval) quando fraco
  │
  ▼
RERANKER                        ── #4 + #10 (Source Authority), NOVOS — hoje é só soma de score
  │
  ▼
EVIDENCE PACK                   ── EXISTE parcialmente (o que é injetado no prompt) + #5 (Adaptive Context) pra moldar por tipo de pergunta
  │
  ▼
REASONER                        ── EXISTE (synthesizeAnswer) + #11 (Conflict Engine 2.0), #13 (Causal Reasoning) alimentando o prompt com sinais estruturados
  │
  ▼
CRITIC / VERIFICADOR            ── #15, NOVO — só roda em modo NORMAL/DEEP, pode devolver 1x pra nova síntese
  │
  ▼
RESPOSTA (+ #14 Confidence Category)
  │
  ▼
AÇÕES PROPOSTAS                 ── EXISTE (proposedAction: save_knowledge_fact, flag_knowledge_conflict, + #18 propose_lesson_learned NOVO)
  │
  ▼
CONFIRMAÇÃO HUMANA              ── EXISTE, inegociável, preservado sem mudança
  │
  ▼
EXECUÇÃO                        ── EXISTE (assistantActions.js)
  │
  ▼
LEARNING LOOP                   ── #17 + #8 (Failure Memory) + #19 (Eval Harness mede o efeito), NOVOS
```

O que muda estruturalmente vs. hoje: (1) o Router passa a ter uma decisão real de PROFUNDIDADE, não só de reformulação de query; (2) entre Router e Retrieval entram dois estágios totalmente novos (Planner, Seleção de Tools) que hoje não existem — a busca deixa de ser incondicional; (3) entre Retrieval e Reasoner entra um estágio de Reranking que hoje não existe — a fusão deixa de ser só soma de score; (4) entre Reasoner e Resposta entra um Critic que hoje não existe; (5) o Learning Loop deixa de ser um log morto e passa a alimentar (via agregação, nunca reação individual) Failure Memory e Lições Aprendidas.

---

## D. O QUE NÃO DEVEMOS MUDAR

- **`ai_conversations` chaveado em `(project_id, user_id)`** — o isolamento estrutural entre projetos de clientes diferentes não deve ser relaxado por nenhum item desta lista; #20 (Tool Architecture) é o único item que toca esse limite, e só pra tools que EXPLICITAMENTE precisam ser cross-projeto (ex. `compareProjects`), sempre reafirmando `accessibleProjectIds` dentro do handler.
- **`classifyRelation`/`findSimilarFact`/o cache por dependência (`ai_answer_cache`)** — motor validado nas Fases 7/7.1, sob carga real; #11 (Conflict Engine 2.0) e #4 (Reranking) devem ESTENDER esse motor com critérios adicionais, nunca reescrevê-lo do zero.
- **Edição sempre versionada, nunca `UPDATE` destrutivo** (`editFactVersioned`, `saveConflictPair`) — princípio já em produção, nenhum item da lista o contradiz; #7 (Skills) e #18 (Lições) devem seguir o mesmo padrão (nova versão, nunca sobrescrita).
- **`z.discriminatedUnion` continua banido de todo schema `zodOutputFormat`** — lição de incidente real (Fase 7); todo novo campo de schema (Planner, Confidence Category, Lições Aprendidas) deve seguir o padrão flat já estabelecido em `ProposedActionSchema`/`SynthesizeAnswerSchema`.
- **`requireMasterOrPricetax` na Central de Conhecimento** — visibilidade PRICETAX-only já confirmada na Fase 8; nenhum item desta lista propõe expor Skills/Lições/Failure Memory ao cliente final.
- **Confirmação humana antes de qualquer gravação permanente** — regra inegociável reafirmada pelo próprio Rafael; #7, #17 e #18 são os itens que mais tentam essa linha (generalizar automaticamente) e são os que mais precisam preservá-la explicitamente.
- **PostgreSQL sem extensão de grafo/pgvector ANN** — decisão já tomada desde a Fase 3, reafirmada pelo Rafael nesta mesma mensagem ("não introduza banco de grafo só pra dizer que temos Knowledge Graph"); #12 (Relações entre entidades) é deliberadamente uma tabela relacional simples, não uma mudança de banco.

---

## E. MELHORIAS P0

1. **#16 Depth Routing** — pré-requisito econômico de #1, #2, #5, #15; sem ele nenhum item caro é sustentável.
2. **#19 Evaluation Harness** — pré-requisito de validação de praticamente tudo mais; começar pequeno (10-20 perguntas reais já vividas nesta sessão, incluindo o caso Tecumseh) e crescer incrementalmente.
3. **#11 Conflict Engine 2.0 (parte estrutural)** — fecha diretamente o gap que originou este pedido inteiro; adiciona checks de entidade/data/atributo ao `classifyRelation` já existente, sem reescrevê-lo.

## F. MELHORIAS P1

4. **#4 Reranking** — barato, algorítmico, maior impacto direto em qualidade de evidência por esforço.
5. **#9 Temporal Reasoning (expor `asOfDate`)** — infraestrutura ~80% pronta, só falta parametrizar.
6. **#10 Source Authority** — hierarquia configurável, boost de ranking, sem filtro destrutivo.
7. **#5 Adaptive Context** — reorganização de código existente, não motor novo; depende de #16.
8. **#1 Planner** — condicionado por #16 pra não virar overhead universal.
9. **#2 Iterative Retrieval** — resolve a classe "sem evidência" quando evidência existe mas a query inicial não alcançou.
10. **#14 Confidence Engine** — implementar DEPOIS de #4/#10 pra ser derivado de sinais reais, não auto-relato.
11. **#15 Critic** — condicionado por #16; limitar a 1 devolução por resposta, como o Rafael especificou.
12. **#20 Tool Architecture (2-3 tools concretas, não framework genérico)** — maior mudança estrutural da lista; começar pequeno e comprovado.

## G. MELHORIAS P2/P3

- **P2**: #3 Contextual Chunks (campo `gist`), #6 Memória Episódica, #8 Failure Memory, #12 Relações entre entidades, #13 Causal Reasoning (bloqueado por #12), #17 Learning Loop (implementar com disciplina de agregação mínima), #18 Lições Aprendidas (baixo esforço, reusa infraestrutura existente).
- **P3**: #7 Memória Procedural/Skills — depende de #8 e #18 já terem produzido histórico real; implementar antes disso é generalizar sem material suficiente.

---

## H. ALTERAÇÕES DE BANCO

Todas aditivas (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`), seguindo o padrão já usado em toda a Fase 7/8 — nenhuma remove ou renomeia coluna existente:

| Item | Mudança |
|---|---|
| #3 | `project_memory_chunks.gist TEXT` (nullable) |
| #7 | `ai_knowledge_skills` (nova tabela) |
| #8 | `ai_knowledge_failures` (nova tabela) |
| #10 | `ai_knowledge_authority_weights` (nova tabela, config) |
| #12 | `ai_knowledge_entity_relations` (nova tabela) |
| #14 | `ai_messages.confidence_category TEXT CHECK (...)` |
| #16 | `ai_messages.depth_mode TEXT CHECK (...)` |
| #19 | `ai_eval_runs` (nova tabela, fora do caminho crítico de produção) |
| #6 (P2, só se avançar) | `ai_knowledge_episodes` (nova tabela) |

Nenhum item exige `DROP CONSTRAINT`/mudança de enum em coluna existente — todas as novas categorias (confidence, depth_mode) são enums NOVOS em colunas novas, evitando por completo a classe de incidente já documentada em §38 (ordem de migração de CHECK constraint).

## I. ALTERAÇÕES DE BACKEND

- `server/assistantRetrieval.js` — ganha o maior volume de mudança: passo de Depth Routing logo após `resolveQuery`; Planner condicional; loop de seleção de tools (#20) substituindo a busca tripla incondicional; chamada ao Reranker entre busca e síntese; passo de Critic entre síntese e resposta; novo tipo `propose_lesson_learned` em `ProposedActionSchema`.
- `server/memoryRetrieval.js` — fusão por soma de score evolui para reranking real (#4) + peso por autoridade (#10).
- `server/knowledgeFacts.js` — `classifyRelation` ganha checks estruturais de entidade/data (#11); `findSimilarFact`/`loadRelevantFacts` passam a aceitar `asOfDate` (#9).
- `server/assistantContext.js` — `buildProjectSnapshot` ganha variantes por tipo de pergunta (#5).
- Novos módulos: `server/assistantTools.js` (#20), `server/knowledgeSkills.js` (#7, P3), `server/knowledgeFailures.js` (#8), `server/knowledgeEntityRelations.js` (#12).
- `server/knowledgeCenter.js`/`server/knowledge.js` — extensões de UI/API pra expor Skills, Failure Memory, Lições Aprendidas propostas, hierarquia de autoridade configurável — todas atrás de `requireMasterOrPricetax`, mesmo padrão da Fase 8.

## J. ALTERAÇÕES DE PROMPTS

- `ResolveQuerySchema` ganha `asOfDate` (nullable) e uma classificação de profundidade (ou essa classificação fica em código, fora do schema — decisão de implementação, não de diagnóstico).
- `SynthesizeAnswerSchema` ganha `confidenceCategory` (enum das 4 categorias) — mas calculado preferencialmente em CÓDIGO a partir de sinais de #4/#10/#11, com o campo do schema servindo só pra o modelo explicar o "porquê" em texto, não decidir a categoria sozinho.
- Novo prompt de Critic (chamada separada, não uma seção do prompt de síntese) — recebe a resposta+evidência e devolve aprovação ou uma lista de problemas específicos, reaproveitando o mesmo padrão `messages.parse`+`zodOutputFormat`.
- `ProposedActionSchema` ganha `propose_lesson_learned` como 3º valor do enum `type`, com campos análogos a `save_knowledge_fact` (subject, content) + `sourceProjectId` — mantendo o padrão flat, nunca discriminated union.

## K. ALTERAÇÕES DE FRONT

- `src/knowledge/` (módulo já existente da Fase 8) ganha, incrementalmente conforme cada item avança: uma visualização de Skills propostas (extensão do padrão já usado por `FactDrawer`/confirmação de proposta), uma listagem de Failure Memory (read-only, dado que não tem fluxo de confirmação próprio, é só histórico consultável), um painel de configuração de hierarquia de autoridade (`ai_knowledge_authority_weights`) — tela simples de pesos por tipo de fonte.
- `src/assistant/ProjectAssistant.jsx` — quando #14 (Confidence Category) existir, a resposta já renderizada ganha um indicador visual das 4 categorias (reusando o padrão de pill/chip já estabelecido); quando #18 (Lições Aprendidas) existir, um novo tipo de proposedAction card análogo ao de `save_knowledge_fact`.
- Nenhuma tela nova de grafo/rede — reafirmando a decisão já tomada na Fase 8 e o requisito explícito desta mensagem do Rafael.

## L. ESTRATÉGIA DE EVALS

`RENATA_EVAL_SET` como arquivo JSON versionado (`eval/renata_eval_set.json`), começando pequeno (15-25 perguntas reais, incluindo literalmente o caso Tecumseh e outras perguntas já feitas de verdade nesta sessão/produção) e crescendo com o tempo — nunca sintético/inventado como base principal, dado real é o que garante que o eval mede o que importa. Métricas separadas exatamente como o Rafael especificou:

- **Query Understanding**: intent accuracy (o `standaloneQuery`/`participant`/`meetingId`/`asOfDate` resolvido bate com o esperado), entity resolution, temporal resolution, reference resolution.
- **Retrieval**: recall@K e precision@K sobre chunks/fatos esperados, source correctness (a fonte certa foi usada, não só uma parecida), stale-source rate (usou um fato `superseded`/vencido por engano).
- **Reasoning**: factual correctness, temporal correctness, conflict detection (comparado contra os casos plantados de #11), causal correctness (#13, só quando implementado).
- **Response**: citation correctness (todo `citedFactIds`/`citedChunkIds` realmente sustenta a afirmação), unsupported claim rate, hallucination rate.
- **Actions**: action proposal correctness, parameter correctness, permission correctness — inclui `propose_lesson_learned` e qualquer tool nova de #20.

Execução sob demanda (custo real de tokens), não em CI automático a cada commit — antes de qualquer mudança relevante no pipeline de raciocínio, comparando a execução nova contra a execução anterior salva em `ai_eval_runs`.

## M. IMPACTO DE CUSTO/LATÊNCIA

| Item | Direção | Magnitude |
|---|---|---|
| #16 Depth Routing | ↓ líquido | reduz custo médio ao evitar overhead em perguntas simples |
| #4 Reranking (heurístico) | ~0 | puro JS/SQL, sem chamada de IA |
| #10 Source Authority | ~0 | multiplicador em query já existente |
| #9 Temporal Reasoning | ~0 | mesmo filtro, parâmetro diferente |
| #5 Adaptive Context | ↓ em perguntas simples | contexto menor injetado quando não precisa do snapshot completo |
| #1 Planner | ↑ só em NORMAL/DEEP | +1 chamada de IA pequena, condicional |
| #2 Iterative Retrieval | ↑ só quando aciona | +1 busca (SQL, barata), não +1 chamada de IA |
| #11 Conflict Engine 2.0 (estrutural) | ~0 | checks em JS/SQL sobre dado já carregado |
| #14 Confidence Engine (derivado) | ~0 | cálculo em código a partir de sinais já existentes |
| #15 Critic | ↑ só em NORMAL/DEEP | +1 chamada de IA por resposta nesses modos, cap de 1 retry |
| #20 Tool Architecture | variável | pode reduzir tokens de contexto (busca seletiva) mas aumenta round-trips de protocolo |
| #7 Skills, #17 Learning Loop, #18 Lições | ~0 em produção | geração rara/sob demanda, não por pergunta |
| #19 Eval Harness | custo isolado, fora de produção | só quando executado manualmente pelo time |

Líquido esperado, se #16 for implementado primeiro e items caros forem condicionados por ele: custo médio por pergunta deve CAIR (a maioria das perguntas reais é FAST e passa a evitar overhead que hoje é universal), enquanto perguntas complexas ficam mais caras mas também mais confiáveis — o oposto do "aumentar custo em tudo" que aconteceria se qualquer item caro fosse implementado sem Depth Routing.

## N. RISCOS

- **Maior risco arquitetural: #20 (Tool Architecture)** — é a única mudança que altera o padrão de chamada à Anthropic usado uniformemente desde o início do projeto; exige teste extenso e reforço explícito de permissão dentro de cada handler de tool antes de qualquer produção.
- **Maior risco de alucinação disfarçada: #13 (Causal Reasoning) implementado antes de #12** — sem relações estruturadas registradas, "explicar por quê" vira o LLM inventando uma narrativa plausível; a ordem de dependência precisa ser respeitada rigidamente.
- **Maior risco de violar regra explícita do Rafael: #17 (Learning Loop) e #7 (Skills)** — ambos tocam diretamente "um único feedback nunca deve alterar comportamento global sozinho" e "toda mudança de estado exige confirmação humana"; a implementação errada (reagir a um evento isolado) é mais fácil de escrever do que a certa (agregação com limiar).
- **Risco de custo descontrolado se #16 não vier primeiro** — qualquer item caro (#1, #15, #20) implementado sem Depth Routing vira custo universal por pergunta, inclusive nas perguntas mais simples e frequentes.
- **Risco de over-engineering nos itens P3** — #7 (Skills) em particular é o item mais "arquiteturalmente elegante" e mais fácil de justificar erroneamente antes de haver material real (#8, #18) de onde generalizar — risco direto contra a regra do próprio Rafael de não adicionar complexidade sem ganho mensurável.
- **Risco de regressão no que já funciona** — qualquer mudança em `classifyRelation`/`searchProjectMemory`/`buildProjectSnapshot` precisa rodar contra os testes já existentes das Fases 7/7.1/8 antes de deploy, não só os testes novos dos itens desta lista.

## O. ORDEM EXATA DE IMPLEMENTAÇÃO

Sequência que respeita todas as dependências identificadas na seção B, minimizando trabalho descartável:

1. **#19 Evaluation Harness** (mesmo pequeno) — sem ele, nada abaixo é validável com rigor.
2. **#16 Depth Routing** — destrava o orçamento de custo pra tudo que vem depois.
3. **#9 Temporal Reasoning** (expor `asOfDate`) — infraestrutura já pronta, ganho imediato, zero dependência.
4. **#4 Reranking** + **#10 Source Authority** (podem andar juntos, ambos alimentam o mesmo "reranker" do pipeline-alvo).
5. **#11 Conflict Engine 2.0 (parte estrutural)** — fecha o gap que originou o pedido, agora com #9/#10 disponíveis pra usar como sinais.
6. **#5 Adaptive Context** — usa a classificação de #16 já disponível.
7. **#14 Confidence Engine** — agora derivável de sinais reais de #4/#10/#11.
8. **#1 Planner** + **#2 Iterative Retrieval** — condicionados por #16, se beneficiam de #9 já existir.
9. **#15 Critic** — condicionado por #16, se beneficia de #14 já existir como ponto de partida.
10. **#12 Relações entre entidades** — infraestrutura pra #13.
11. **#13 Causal Reasoning** — só depois de #12 ter dado material real.
12. **#8 Failure Memory** + **#18 Lições Aprendidas** — baixo esforço, reusam infraestrutura já existente, podem andar em paralelo com os itens acima a partir daqui.
13. **#17 Learning Loop** — agrega sobre #8 já populado.
14. **#3 Contextual Chunks** (`gist`) — aditivo, sem urgência, encaixa quando `meetingInbox.js` for tocado por outro motivo.
15. **#6 Memória Episódica** — usa #9/#10 já maduros.
16. **#20 Tool Architecture** — deliberadamente por último entre os itens de maior valor: é a mudança estrutural mais arriscada, e o restante do pipeline (Router com profundidade, Reranker, Critic) deve estar validado e estável antes de introduzir um novo padrão de chamada à Anthropic por cima dele.
17. **#7 Memória Procedural/Skills** — último, por design: só faz sentido depois de #8/#18 terem produzido histórico real de onde generalizar.
