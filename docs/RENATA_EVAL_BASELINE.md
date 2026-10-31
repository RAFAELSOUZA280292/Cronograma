# RENATA EVAL REPORT

**BASELINE — BEFORE P0/P1 BRAIN IMPROVEMENTS** (nenhuma mudança arquitetural aplicada ainda — este número é o que se compara depois de cada fase).

_BASELINE — BEFORE P0/P1 BRAIN IMPROVEMENTS (Fase 1, nenhuma mudança arquitetural aplicada)_

## Overall
- Cases: 23
- Passed: 18
- Failed: 5
- Pass rate: 78%

## Retrieval
- Cases com evidência esperada definida: 12/23
- Recall@1: 42%
- Recall@3: 63%
- Recall@5: 67%
- Precision@5: 17%
- MRR: 0.62
- Evidência esperada NUNCA recuperada (cortada antes de chegar a synthesizeAnswer): 2 caso(s) — causal-01-medium, multi-hop-01-hard

## Understanding (Query Understanding)
- Intent accuracy: 100% (23 caso(s) avaliado(s))
- Entity resolution: 100% (1 caso(s))
- Meeting resolution: 100% (5 caso(s))
- Reference resolution: 100% (1 caso(s))

## Evidence
- Expected fact coverage: 88%
- Cases com fato esperado faltando: 3
  - temporal-03-hard (faltou: 8%)
  - conflict-02-hard (faltou: 8%; 12%)
  - multi-hop-01-hard (faltou: 8%; 12%)

## Answer
- Forbidden claims violados: 0 caso(s)
- No-evidence accuracy: 95% (21 caso(s))
  - Falsos positivos (concluiu sem evidência): 0
  - Falsos negativos (disse "sem evidência" existindo): 1 — conflict-02-hard

## Citation
- Citation id validity (chunks): 100%
- Citation relevance/support (heurística léxica, NÃO julgamento semântico — ver limitações): 80%
  - Avaliação de suporte semântico de verdade ("a fonte sustenta a afirmação?") fica marcada como avaliação OFFLINE/opcional nesta fase — não implementada dentro do pipeline de produção.

## Conflict
- Casos avaliados: 2 — TP: 1, FP: 0, FN: 0, TN: 1

## Performance
- Avg tokens (input+output): 6260.83
- P50 latency (total): 16403ms
- P95 latency (total): 37325ms
- Avg resolve latency: 16340ms
- Avg retrieval latency: 438ms
- Avg synthesis latency: 13223ms
- Cache hits: 0/23
- Avg chunks considered: 6.22
- Avg facts considered: 3.00

## Breakdown por categoria
- FACTUAL: 2/2 passou
- PERSON: 2/2 passou
- MEETING: 2/2 passou
- ACTIVITY: 2/2 passou
- DECISION: 2/2 passou
- TEMPORAL: 1/3 passou
- CONFLICT: 1/2 passou
- CAUSAL: 1/2 passou
- EXECUTIVE: 2/2 passou
- NO_EVIDENCE: 2/2 passou
- AMBIGUOUS_REFERENCE: 1/1 passou
- MULTI_HOP: 0/1 passou

## Piores casos
- **conflict-02-hard** (CONFLICT, 2 motivo(s)): FALSO NEGATIVO: disse "sem evidência" mas ela existia no corpus | cobertura de fatos esperados baixa (0%) — faltou: 8%; 12%
- **multi-hop-01-hard** (MULTI_HOP, 2 motivo(s)): cobertura de fatos esperados baixa (33%) — faltou: 8%; 12% | recall@5 de evidência baixo (0%)
- **temporal-01-medium** (TEMPORAL, 1 motivo(s)): recall@5 de evidência baixo (0%)
- **temporal-03-hard** (TEMPORAL, 1 motivo(s)): cobertura de fatos esperados baixa (0%) — faltou: 8%
- **causal-01-medium** (CAUSAL, 1 motivo(s)): recall@5 de evidência baixo (0%)

---

# FAILURE TRACES

## temporal-01-medium (TEMPORAL)
**QUESTION**: Quem é o responsável fiscal da Fixture Corp hoje?
**EXPECTED**: `{"intent":"pergunta_sobre_projeto","shouldHaveEvidence":true,"answerFacts":["Camila Souza"],"evidence":{"factKeys":["fact:responsável fiscal da Fixture Corp#v2"]}}`
**WHY FAILED**: recall@5 de evidência baixo (0%)
**RESOLVE QUERY RESULT**: `{"intent":"pergunta_sobre_projeto","directReply":null,"standaloneQuery":"Quem é o responsável fiscal da Fixture Indústria e Comércio LTDA (Fixture Corp) atualmente?","participant":null,"meetingScope":"projeto_inteiro","kind":"qualquer","targetMeetingId":null}`
**RETRIEVED CHUNKS** (12):
  - [chunk:m1#transcript_segment#0] score=0.91 kind=transcript_segment meeting=m1 — "Ana Martins (00:00): Bom dia Felipe, vamos alinhar o início do diagnóstico tributário da Fixture Corp.
Felipe Dal Santo (00:01): Bom dia Ana. Vou revisar o markup dos produtos importados com a equipe ..."
  - [chunk:m6#activity#0] score=0.68 kind=activity meeting=m6 — "Enviar estrutura societária para a PRICETAX
Responsável: Camila Souza (lado do cliente)
Status: em-andamento
Prazo: 2026-08-29..."
  - [chunk:m6#meeting_summary#0] score=0.67 kind=meeting_summary meeting=m6 — "A entrega do diagnóstico fiscal está atrasada porque o documento de estrutura societária não chegou. Camila assumiu a pendência de resolver isso com o jurídico...."
  - [chunk:m6#transcript_segment#0] score=0.67 kind=transcript_segment meeting=m6 — "00:00
Bruno Ferreira
A entrega do diagnóstico fiscal atrasou porque o documento de estrutura societária não chegou do cliente.

00:02
Camila Souza
Vou verificar com o jurídico e assumo essa pendência...."
  - [chunk:m1#activity#0] score=0.55 kind=activity meeting=m1 — "Revisar markup dos produtos importados
Responsável: Felipe Dal Santo (lado do cliente)
Status: concluida
Prazo: 2026-07-15..."
  - [chunk:m4#transcript_segment#0] score=0.31 kind=transcript_segment meeting=m4 — "10:18
Bruno Ferreira
Camila, confirma pra mim o rateio do seguro de vida?

10:20
Camila Souza
Na verdade a maior parte é paga pelo funcionário. Acho que é o contrário do que foi registrado antes...."
  - [chunk:m2#meeting_summary#0] score=0.30 kind=meeting_summary meeting=m2 — "Definido o markup de 8% para os produtos da linha B, a pedido do Felipe...."
  - [chunk:m5#transcript_segment#0] score=0.29 kind=transcript_segment meeting=m5 — "00:00
Felipe Dal Santo
Precisamos revisar o markup da linha B por causa do aumento de custo de importação.

00:02
Ana Martins
Concordo. Vamos revisar o markup da linha B para 12%...."
  - [chunk:m3#meeting_summary#0] score=0.29 kind=meeting_summary meeting=m3 — "Revisão dos benefícios de RH. O resumo registra o rateio do seguro de vida como empresa 90% e funcionário 10%...."
  - [chunk:m5#meeting_summary#0] score=0.28 kind=meeting_summary meeting=m5 — "Revisado o markup da linha B para 12%, por causa do aumento de custo de importação...."
  - [chunk:m7#meeting_decision#0] score=0.28 kind=meeting_decision meeting=m7 — "Valor de venda dos produtos importados foi majorado...."
  - [chunk:m5#meeting_decision#0] score=0.28 kind=meeting_decision meeting=m5 — "Markup da linha B revisado para 12%...."
**RETRIEVED FACT IDS**: ["akf-2rmd9en","akf-50hhjl8","akf-umd98nn"]
**CONTEXT SENT TO SYNTHESIS (facts)**: - [id=akf-2rmd9en] [FACT] [prazo de entrega do diagnóstico fiscal] O prazo de entrega do diagnóstico fiscal é 25/08/2026. (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-50hhjl8] [FACT] [responsável fiscal da Fixture Corp] Camila Souza passou a ser a responsável fiscal da Fixture Corp a partir de 01/09/2026. — vigente desde 01/09/2026 (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-umd98nn] [FACT] [resp
**ANSWER**: Hoje (31/10/2026), a responsável fiscal da Fixture Corp é **Camila Souza**.

Linha do tempo do cargo:
- 01/07/2026 — **Felipe Dal Santo** registrado como responsável fiscal da Fixture Corp
- 01/09/2026 — **Camila Souza** assume como responsável fiscal (vigente até hoje)

Como está registrado:
- Os dois registros não são conflitantes: são **vigências diferentes** no tempo — Felipe a partir de 01/07/2026 e Camila a partir de 01/09/2026.
- Felipe Dal Santo e Camila Souza seguem ambos como **contatos externos cadastrados** no projeto (lado cliente), então Felipe continua participando das reuniões — a última em 05/09/2026, tratando da revisão do markup da linha B.
- Coerente com isso, a pendência fiscal em aberto hoje está com Camila: **"Enviar estrutura societária para a PRICETAX"**, prazo 29/08/2026, em andamento e vencida.

Por que isso importa no projeto:
- Cobranças e validações fiscais do diagnóstico devem ser direcionadas à **Camila Souza**, não ao Felipe.
- A entrega do **Diagnóstico Fiscal** (prazo 25/08/2026, em andamento) está travada justamente pela estrutura societária sob responsabilidade da Camila — é o ponto de pressão atual.
**CITATIONS**: chunks=["chunk:m6#activity#0","chunk:m6#meeting_summary#0"] facts=["fact:responsável fiscal da Fixture Corp#v2","fact:responsável fiscal da Fixture Corp"]

## temporal-03-hard (TEMPORAL)
**QUESTION**: Qual era o markup da linha B antes da reunião de revisão de preços de 05/09?
**EXPECTED**: `{"intent":"pergunta_sobre_projeto","forbiddenClaims":["12%"],"forbiddenScope":"headline","answerFacts":["8%"]}`
**WHY FAILED**: cobertura de fatos esperados baixa (0%) — faltou: 8%
**RESOLVE QUERY RESULT**: `{"intent":"pergunta_sobre_projeto","directReply":null,"standaloneQuery":"Qual era o markup da Linha B antes da Reunião de Revisão de Preços de 05/09/2026?","participant":null,"meetingScope":"projeto_inteiro","kind":"transcript_segment","targetMeetingId":"m5"}`
**RETRIEVED CHUNKS** (1):
  - [chunk:m5#transcript_segment#0] score=1.54 kind=transcript_segment meeting=m5 — "00:00
Felipe Dal Santo
Precisamos revisar o markup da linha B por causa do aumento de custo de importação.

00:02
Ana Martins
Concordo. Vamos revisar o markup da linha B para 12%...."
**RETRIEVED FACT IDS**: ["akf-2rmd9en","akf-50hhjl8","akf-umd98nn"]
**CONTEXT SENT TO SYNTHESIS (facts)**: - [id=akf-2rmd9en] [FACT] [prazo de entrega do diagnóstico fiscal] O prazo de entrega do diagnóstico fiscal é 25/08/2026. (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-50hhjl8] [FACT] [responsável fiscal da Fixture Corp] Camila Souza passou a ser a responsável fiscal da Fixture Corp a partir de 01/09/2026. — vigente desde 01/09/2026 (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-umd98nn] [FACT] [resp
**ANSWER**: Não encontrei evidência suficiente nas reuniões ou documentos deste projeto.
**CITATIONS**: chunks=[] facts=[]

## conflict-02-hard (CONFLICT)
**QUESTION**: O markup da linha B mudou de valor em algum momento?
**EXPECTED**: `{"intent":"pergunta_sobre_projeto","shouldHaveEvidence":true,"expectConflictDetected":false,"answerFacts":["8%","12%"]}`
**WHY FAILED**: FALSO NEGATIVO: disse "sem evidência" mas ela existia no corpus | cobertura de fatos esperados baixa (0%) — faltou: 8%; 12%
**RESOLVE QUERY RESULT**: `{"intent":"pergunta_sobre_projeto","directReply":null,"standaloneQuery":"O valor do markup da Linha B mudou em algum momento ao longo das reuniões do projeto?","participant":null,"meetingScope":"projeto_inteiro","kind":"meeting_topic","targetMeetingId":null}`
**RETRIEVED CHUNKS** (0):
**RETRIEVED FACT IDS**: ["akf-2rmd9en","akf-50hhjl8","akf-umd98nn"]
**CONTEXT SENT TO SYNTHESIS (facts)**: - [id=akf-2rmd9en] [FACT] [prazo de entrega do diagnóstico fiscal] O prazo de entrega do diagnóstico fiscal é 25/08/2026. (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-50hhjl8] [FACT] [responsável fiscal da Fixture Corp] Camila Souza passou a ser a responsável fiscal da Fixture Corp a partir de 01/09/2026. — vigente desde 01/09/2026 (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-umd98nn] [FACT] [resp
**ANSWER**: Não encontrei evidência suficiente nas reuniões ou documentos deste projeto.
**CITATIONS**: chunks=[] facts=[]

## causal-01-medium (CAUSAL)
**QUESTION**: Por que a entrega do diagnóstico fiscal atrasou?
**EXPECTED**: `{"intent":"pergunta_sobre_projeto","shouldHaveEvidence":true,"answerFacts":["documento de estrutura societária","não chegou"],"evidence":{"chunkKeys":["chunk:m6#meeting_summary#0"]}}`
**WHY FAILED**: recall@5 de evidência baixo (0%)
**RESOLVE QUERY RESULT**: `{"intent":"pergunta_sobre_projeto","directReply":null,"standaloneQuery":"Por que a atividade 'Entrega do Diagnóstico Fiscal' atrasou?","participant":null,"meetingScope":"projeto_inteiro","kind":"activity","targetMeetingId":null}`
**RETRIEVED CHUNKS** (4):
  - [chunk:m6#activity#0] score=0.40 kind=activity meeting=m6 — "Enviar estrutura societária para a PRICETAX
Responsável: Camila Souza (lado do cliente)
Status: em-andamento
Prazo: 2026-08-29..."
  - [chunk:m1#activity#0] score=0.32 kind=activity meeting=m1 — "Revisar markup dos produtos importados
Responsável: Felipe Dal Santo (lado do cliente)
Status: concluida
Prazo: 2026-07-15..."
  - [chunk:m6#transcript_segment#0] score=0.00 kind=transcript_segment meeting=m6 — "00:00
Bruno Ferreira
A entrega do diagnóstico fiscal atrasou porque o documento de estrutura societária não chegou do cliente.

00:02
Camila Souza
Vou verificar com o jurídico e assumo essa pendência...."
  - [chunk:m1#transcript_segment#0] score=0.00 kind=transcript_segment meeting=m1 — "Ana Martins (00:00): Bom dia Felipe, vamos alinhar o início do diagnóstico tributário da Fixture Corp.
Felipe Dal Santo (00:01): Bom dia Ana. Vou revisar o markup dos produtos importados com a equipe ..."
**RETRIEVED FACT IDS**: ["akf-2rmd9en","akf-50hhjl8","akf-umd98nn"]
**CONTEXT SENT TO SYNTHESIS (facts)**: - [id=akf-2rmd9en] [FACT] [prazo de entrega do diagnóstico fiscal] O prazo de entrega do diagnóstico fiscal é 25/08/2026. (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-50hhjl8] [FACT] [responsável fiscal da Fixture Corp] Camila Souza passou a ser a responsável fiscal da Fixture Corp a partir de 01/09/2026. — vigente desde 01/09/2026 (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-umd98nn] [FACT] [resp
**ANSWER**: O atraso está explicado diretamente na Reunião de Status do Diagnóstico, de 22/08/2026: faltou um documento que depende do cliente.

Como está registrado:
- Na **Reunião de Status do Diagnóstico (22/08/2026)**, **Bruno Ferreira** afirmou que a entrega do diagnóstico fiscal atrasou **porque o documento de estrutura societária não chegou do cliente**.
- Na mesma reunião, **Camila Souza** disse que iria verificar com o jurídico e **assumiu essa pendência** — ela virou a tarefa "Enviar estrutura societária para a PRICETAX", prazo **29/08/2026**, lado cliente.
- No cronograma, a atividade **"Entrega do Diagnóstico Fiscal"** (responsável **Bruno Ferreira**) tinha prazo **25/08/2026** e segue **em andamento** — ou seja, atrasada até hoje, 31/10/2026.

Ponto de atenção:
A causa-raiz **continua aberta**: a pendência da estrutura societária venceu em **29/08/2026** e ainda está "em andamento" — mais de dois meses de atraso. Enquanto esse documento não chegar, o diagnóstico fiscal não destrava, e a "Revisão de Markup Linha B" (prazo 20/09/2026, não iniciada) tende a escorregar junto.

Recomendação:
Cobrar a **Camila Souza** o envio da estrutura societária com um novo prazo acordado e, em paralelo, repactuar a data da atividade **"Entrega do Diagnóstico Fiscal"** no cronograma — hoje ela carrega uma data (25/08) que já não reflete a realidade. Se quiser, posso propor o reagendamento para uma data que você definir.
**CITATIONS**: chunks=["chunk:m6#transcript_segment#0","chunk:m6#activity#0"] facts=["fact:prazo de entrega do diagnóstico fiscal"]

## multi-hop-01-hard (MULTI_HOP)
**QUESTION**: Qual a atividade do cronograma relacionada à revisão de markup, e como o valor do markup evoluiu até agora?
**EXPECTED**: `{"intent":"pergunta_sobre_projeto","shouldHaveEvidence":true,"answerFacts":["Revisão de Markup Linha B","8%","12%"],"evidence":{"chunkKeys":["chunk:m2#meeting_decision#0","chunk:m5#meeting_decision#0"]}}`
**WHY FAILED**: cobertura de fatos esperados baixa (33%) — faltou: 8%; 12% | recall@5 de evidência baixo (0%)
**RESOLVE QUERY RESULT**: `{"intent":"pergunta_sobre_projeto","directReply":null,"standaloneQuery":"Qual é a atividade do cronograma relacionada à revisão de markup (Revisão de Markup Linha B) e como o valor do markup evoluiu ao longo das reuniões do projeto Fixture Corp?","participant":null,"meetingScope":"projeto_inteiro","kind":"activity","targetMeetingId":null}`
**RETRIEVED CHUNKS** (4):
  - [chunk:m1#activity#0] score=0.64 kind=activity meeting=m1 — "Revisar markup dos produtos importados
Responsável: Felipe Dal Santo (lado do cliente)
Status: concluida
Prazo: 2026-07-15..."
  - [chunk:m6#activity#0] score=0.36 kind=activity meeting=m6 — "Enviar estrutura societária para a PRICETAX
Responsável: Camila Souza (lado do cliente)
Status: em-andamento
Prazo: 2026-08-29..."
  - [chunk:m1#transcript_segment#0] score=0.00 kind=transcript_segment meeting=m1 — "Ana Martins (00:00): Bom dia Felipe, vamos alinhar o início do diagnóstico tributário da Fixture Corp.
Felipe Dal Santo (00:01): Bom dia Ana. Vou revisar o markup dos produtos importados com a equipe ..."
  - [chunk:m6#transcript_segment#0] score=0.00 kind=transcript_segment meeting=m6 — "00:00
Bruno Ferreira
A entrega do diagnóstico fiscal atrasou porque o documento de estrutura societária não chegou do cliente.

00:02
Camila Souza
Vou verificar com o jurídico e assumo essa pendência...."
**RETRIEVED FACT IDS**: ["akf-2rmd9en","akf-50hhjl8","akf-umd98nn"]
**CONTEXT SENT TO SYNTHESIS (facts)**: - [id=akf-2rmd9en] [FACT] [prazo de entrega do diagnóstico fiscal] O prazo de entrega do diagnóstico fiscal é 25/08/2026. (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-50hhjl8] [FACT] [responsável fiscal da Fixture Corp] Camila Souza passou a ser a responsável fiscal da Fixture Corp a partir de 01/09/2026. — vigente desde 01/09/2026 (específico deste projeto, informado por Usuário de Avaliação RENATA, em 13/09/2026)
- [id=akf-umd98nn] [FACT] [resp
**ANSWER**: A atividade do cronograma é **[act-2] "Revisão de Markup Linha B"** (fase Execução, responsável **Ana Martins**, prazo **20/09/2026**, status **não iniciado**). Sobre a evolução do *valor* do markup, não há número registrado em nenhum trecho recuperado — só o histórico das tratativas.

Ponto de atenção:
A "Revisão de Markup Linha B" está **atrasada desde 20/09/2026** e segue **não iniciada** — são mais de 40 dias de prazo vencido, sem nenhuma movimentação registrada. É a segunda atividade atrasada do projeto, junto com a "Entrega do Diagnóstico Fiscal" (prazo 25/08/2026).

Como está registrado:
- Cronograma oficial: **[act-2] "Revisão de Markup Linha B"** — responsável **Ana Martins**, prazo **20/09/2026**, fase Execução, status não iniciado.
- Existe também uma tarefa de reunião correlata, mas distinta: **"Revisar markup dos produtos importados"**, da Reunião de Abertura (01/07/2026), responsável **Felipe Dal Santo** (lado cliente), prazo 15/07/2026, status **concluída**.
- **Nenhum valor, percentual ou faixa de markup aparece nos trechos recuperados.** Os registros falam do compromisso de revisar o markup, não do número em si — então não dá pra afirmar como o valor evoluiu.

Linha do tempo do assunto markup:
- 01/07/2026 — Na Reunião de Abertura, Felipe Dal Santo se compromete: "vou revisar o markup dos produtos importados com a equipe fiscal antes da próxima reunião".
- 15/07/2026 — Prazo da tarefa "Revisar markup dos produtos importados", registrada como **concluída** (sem resultado numérico registrado).
- 20/09/2026 — Prazo da atividade de cronograma "Revisão de Markup Linha B", que permanece **não iniciada** até hoje (31/10/2026).

Recomendação:
Dois caminhos: (1) confirmar com **Felipe Dal Santo** qual foi o resultado da revisão do markup dos importados concluída em julho — esse número nunca entrou nos registros; e (2) definir com **Ana Martins** uma nova data para a "Revisão de Markup Linha B", já que o prazo venceu há mais de um mês. Se quiser, me diga a nova data que eu proponho o reagendamento da atividade pra você confirmar.
**CITATIONS**: chunks=["chunk:m1#activity#0","chunk:m1#transcript_segment#0"] facts=[]
