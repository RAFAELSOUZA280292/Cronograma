# Plano — RENATA para atender o Felipe (consultas entre clientes + levantamento de atividades)

Criado em 2026-10-07. **Plano, nada implementado.** Pedido do Felipe (07/10/2026):
1. "A RENATA faz consultas genéricas ao banco de dados de reuniões ou por cliente?"
2. "Queria fazer um levantamento de tudo que temos de atividades por área, para atualizar os cronogramas dos clientes."

## Onde estamos (conferido no código)

| Peça | Hoje |
|---|---|
| RENATA da empresa (`askProjectAssistant`) | Busca nas reuniões **só do projeto aberto** (`searchProjectMemory`, `project_id = $2`). |
| RENATA geral (`assistantGeneral.js`) | Vê quadro pessoal, resumo por empresa (totais, última/próxima reunião, o que está no nome da pessoa), agenda e conhecimento da organização. **Não lê reuniões nem lista as atividades de cada empresa.** |
| Visão Geral Empresas (`server/macro.js`) | Junta atividades de todas as empresas, só leitura, por faixa de data. Sem agrupamento por fase/área, sem exportar. |
| Permissão por empresa | `canAccessProject` e `listAccessibleProjectIds` (`server/permissions.js`) já existem. |
| Atividade | Campos: fase, responsável, prioridade, prazo, status. **Não existe "área".** "Área" só existe em pessoas da equipe e contatos do cliente. |
| Planilha | Biblioteca `xlsx` já está na stack. |

## Princípios (valem para todas as etapas)

1. **Permissão antes da busca.** Só entram empresas a que a pessoa tem acesso, filtradas no SQL antes de qualquer ranking. Mesmo padrão e mesma bateria de testes de isolamento das fases anteriores.
2. **Número e lista vêm de código, não da IA.** "Quantas", "quais" e "por área" saem de uma consulta determinística; a IA só interpreta a pergunta e redige. Assim o levantamento bate com o cronograma.
3. **Só leitura nesta fase.** Mudar cronograma continua pela RENATA da empresa, que propõe a ação e pede confirmação.
4. **Toda resposta cita origem:** empresa · reunião · data (clicável).
5. **Uso interno (PRICETAX).** Cliente nunca vê esta área.

## Etapa 0 — Decisões do Felipe (antes de codar)

1. **O que é "área"?** *(achado: nos cronogramas padrão, o "responsável" da fase "Mão na Massa por Área" já é a área — Comercial, Compras, Fiscal…)* (a) as fases do cronograma; (b) o responsável/time; (c) um tema (Fiscal, Compras, Financeiro, RH, TI, Jurídico…), que hoje não é um campo.
2. **Quais clientes?** Todos, só ativos, ou uma seleção? Incluir pausados?
3. **Formato do resultado:** tela filtrável, planilha, texto da RENATA, ou os três.
4. **Quem usa:** só ele e você, ou toda a equipe PRICETAX?

## Etapa 1 — Levantamento de atividades de todos os clientes (pedido 2) — sem IA, a mais rápida — ✅ FEITA em 2026-10-07 (agrupa por fase e responsável; ver PROJECT_CONTEXT §81)

- Rota nova que reúne as atividades de todas as empresas acessíveis, com filtros (empresa, fase, responsável, status, período, área quando existir) e agrupamento.
- Tela "Levantamento" dentro da Visão Geral Empresas (reaproveita a base), com **exportar para planilha**.
- A RENATA geral passa a chamar a mesma consulta para responder "quantas/quais atividades…" com a lista certa e o link da tela.
- **Testes:** usuário sem acesso à empresa B nunca a vê; contagem da tela = contagem dos cronogramas.
- **Tamanho:** pequeno/médio. Resolve o pedido 2 se "área" = fase ou responsável.

## Etapa 2 — Campo "Área" nas atividades (só se o Felipe quiser tema)

- Lista de áreas configurável por organização + seletor na atividade + filtro/agrupamento no levantamento.
- **Classificação em lote assistida:** a RENATA sugere a área de cada atividade existente (título + descrição + fase); **nada é gravado sem revisão humana**, empresa por empresa.
- Modelos de cronograma novos já nascem com a área.
- **Tamanho:** médio. Toca o formato da atividade (dado no JSON do projeto) — exige cuidado com compatibilidade.

## Etapa 3 — RENATA geral consulta reuniões de vários clientes (pedido 1)

- Estender `searchProjectMemory` para aceitar uma **lista** de empresas (hoje é uma só), sempre limitada às acessíveis.
- Etapa de interpretação da pergunta no modo geral: quais empresas (citadas ou todas), assunto, período.
- **Diversificar:** pegar os melhores trechos **por empresa** e só então mesclar, para uma empresa com muita reunião não ocupar tudo.
- Resposta com contagem ("pesquisei N empresas, M trechos") e citações empresa · reunião · data, **validadas contra os trechos recebidos** (como a RENATA da empresa já faz).
- Perguntas-alvo: "quais clientes falaram de X?", "o que ficou combinado sobre Y nas últimas reuniões?".
- **Dependência:** busca por significado usa a Voyage, que no plano gratuito aceita 3 pedidos/min; sem pagamento cai para a busca por palavras.
- **Tamanho:** médio/grande (custo de IA e qualidade dependem de teste com perguntas reais).

## Etapa 4 — Usar o levantamento para atualizar os cronogramas dos clientes

- Comparar o conjunto de atividades por área entre clientes e apontar **lacunas** ("o cliente X não tem Y, que 8 dos outros têm").
- A RENATA **da empresa** propõe criar as atividades (ação já existente, com confirmação do usuário). Nada é criado em lote sem revisão.
- **Cuidado de confidencialidade:** ao copiar atividades de um cliente para outro, usar só títulos genéricos; nunca detalhe, nome ou dado do cliente de origem.

## Etapa 5 — Qualidade e liberação

- Conjunto de ~10 perguntas reais do Felipe com resposta conferida à mão; só liberar passando nelas.
- Testes de isolamento entre empresas e entre organizações.
- Liberar primeiro só para o Felipe e acompanhar custo/erros pelo log.
- Atualizar `PROJECT_CONTEXT.md`, `docs/PROJECT_MAP.md` e memória.

## Ordem recomendada

1. Etapa 0 (conversa de 10 min com o Felipe) →
2. **Etapa 1** (entrega o levantamento sem depender de IA) →
3. Etapa 2, se "área" for tema →
4. Etapa 3 (consulta entre clientes) →
5. Etapa 4.

## Riscos

- **IA real não testada localmente** (sem chave de IA no ambiente de desenvolvimento): as etapas 2 (classificação) e 3 só são validadas de verdade em produção.
- **Custo e latência** crescem com o número de empresas pesquisadas; mitigação: limite por empresa e por resposta.
- **Qualidade:** em perguntas muito amplas a RENATA pode devolver um recorte; a resposta deve avisar quando o recorte for parcial.
- **Confidencialidade entre clientes** (ver Etapa 4).

## Caminho combinado em 2026-10-07 (depois da Etapa 1)

1. **Medir a qualidade dos dados** — ✅ feito (painel "Qualidade dos dados" no Levantamento).
2. **Incluir tarefas de reunião no Levantamento** — ✅ feito (coluna Origem).
3. **Organizar na entrada** — ✅ feito em 2026-10-07: responsável amarrado à equipe ao transcrever (ou "a confirmar"), campo Área (lista fechada em `server/areas.js`, sugestão da RENATA com revisão) e conciliação em lote do passado no painel de qualidade. Pendente de validar com IA real em produção (extração com equipe/área e sugestão de área).
4. RENATA varrendo as reuniões de todos os clientes (Etapa 3 acima).
5. Lacunas entre cronogramas (Etapa 4 acima).
