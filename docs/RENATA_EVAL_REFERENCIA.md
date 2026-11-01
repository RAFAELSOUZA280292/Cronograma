# RENATA — referência do eval com repetição (31/10/2026)

**O que é:** a referência para comparar mudanças no pipeline da RENATA de consulta (E6, prompts, busca). Gerada por `node server/evals/runFullEval.mjs --repeat=3` (23 casos × 3 execuções, IA real, banco local com a fixture, sem cache). A referência anterior (`RENATA_EVAL_BASELINE.md`) é de **antes** da correção da busca e de uma rodada por caso; esta é a que vale daqui para frente.

| Medida | Valor |
|---|---|
| Execuções / acertos | 69 / 65 (**94%**) |
| Casos estáveis (3 de 3) | **21 de 23** |
| Intermitentes | 1 (`factual-01-easy`, 2 de 3) |
| Falham sempre | 1 (`multi-hop-01-hard`, 0 de 3) |
| Recall@1 / @3 / @5 (evidência) | 47% / 74% / 88% |
| Latência p50 / p95 (por caso) | 20,7 s / 34,0 s |
| Tokens / tempo | 494.121 / 24 min (com `caffeinate`) |

**Por categoria (acertos de 3 por caso):** todas 100% (FACTUAL 5/6; MULTI_HOP 0/3; as demais, inclusive TEMPORAL, CAUSAL e CONFLICT, passam todas).

## As 4 execuções que falharam — o que eu li nas respostas
- **`multi-hop-01-hard` (0/3):** reprova só por "recall@5 de evidência 0%": os dois trechos de decisão esperados aparecem **depois** da 5ª posição (a lista tem 13 trechos). A **resposta está correta nas 3 execuções** (cita a atividade "Revisão de Markup Linha B" e a evolução de 8% para 12%). É limite do critério de posição, não de conteúdo.
- **`factual-01-easy` (1 de 3 falhou):** a interpretação da pergunta respondeu direto pelo perfil do projeto (`intent: conversa_geral`, com o CNPJ certo) e o caso esperava o caminho de busca. **A resposta está correta;** o medidor chama isso de "intent errado" e "falso negativo".
- **Conclusão:** nas 4 falhas o conteúdo da resposta está certo; o que o medidor reprova é o caminho (rótulo de intenção, posição da evidência). **Não afrouxei o medidor** para não esconder uma regressão futura; se incomodar, o ajuste é aceitar resposta direta pelo perfil quando traz o fato esperado.

## Como usar
- Antes de comparar duas versões, rode `--repeat=3` nas duas e compare **a taxa por caso**, não um sim/não. Uma rodada única oscila ±2 casos (medido: 18, 18, 21 e 23 de 23 sem mudar de versão do medidor).
- Uma diferença de 1 execução em 69 é ruído. Mudou a lista de casos estáveis ou caiu a taxa de uma categoria inteira? Aí vale investigar.
- Mantenha o Mac acordado (`caffeinate -i …`): uma rodada anterior levou 2 h 20 min (p95 de 19 min por caso) sem isso; esta levou 24 min com ele.
- Custo: ~500 mil tokens por referência de 3 repetições.

## Segunda medição, com o SDK 1.3.0 (E6, 31/10/2026)

62 de 69 (90%), 19 de 23 casos estáveis; os números acima (65/69, 21/23) são do SDK 0.135. **Trate 90–94% como a faixa de ruído** desta referência: um A/B com o mesmo SDK, trocando só a versão da API (`2023-06-01` × `2026-10-21`), deu resultado idêntico nos 3 casos sensíveis, e as 3 respostas de `temporal-03` que reprovaram estavam certas (estilo de uma frase só, que o medidor de manchete não entende). Comparar duas versões do pipeline só vale com diferença maior que isso, ou com mudança na lista de casos estáveis explicada por leitura das respostas.
