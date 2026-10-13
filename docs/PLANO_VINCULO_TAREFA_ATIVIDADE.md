# Plano — vincular cada tarefa de reunião à atividade do cronograma (e a RENATA aprender com as confirmações)

Criado em 2026-10-13. **Aprovado pelo Rafael (7 recomendações) em 2026-10-13. Fase 1 implementada e em produção; Fases 2-5 pendentes.** (Desvio na Fase 1: a rota só registra a decisão no livro-razão; o campo da tarefa vai pelo caminho normal do cliente — ver PROJECT_CONTEXT §65.) Pedido do Rafael: ao gerar tarefas a partir de uma transcrição, achar a
atividade da aba **Resumo/Gantt** (Kickoff, Envio de dados, Prévia AR, Prévia DR, Workshop, Compras, Análise, Validação documental,
Comitê da reforma…) a que cada tarefa pertence; o usuário **confirma** e a RENATA **aprende**.

## Onde estamos (conferido no código)

| Peça | Hoje |
|---|---|
| Tarefa de reunião | `project.data.meetings[].actionItems[]` — `title, responsible, owner (pricetax/cliente), dueDate, area, status, subtasks, comments…`. **Não existe campo que ligue a tarefa a uma atividade** (só `area`, lista fechada em `server/areas.js`). |
| Geração | `server/meetingInbox.js` (`extractMeetingFromTranscript` → `normalizeActionItems`), gravação direta no banco + `reindexMeetingMemory`. Mesma IA já devolve `area` por tarefa. |
| Atividade do cronograma | `project.data.activities[]` — `id` estável, `title`, `phase`, `month`, `status`, datas. São 12–16 por empresa (template em `server/db.js`) e podem ser editadas/excluídas por empresa. |
| Padrão de "sugerir e o humano confirma" | Já existe para **área** (`suggestAreas` em `server/inventoryEdit.js`, conciliação em lote no painel de qualidade) e para **lacunas** (`server/gaps.js`, similaridade por Jaccard de títulos, piso de 3 empresas). |
| Aprendizado da RENATA hoje | Aprendizados por projeto (`ai_project_insights`), memória em camadas, feedback 👍/👎 nas respostas. **Nada aprende com correção de tarefa.** |
| Busca por significado | Voyage (plano grátis = 3 pedidos/min); cai para palavras quando falha. |

## Princípios

1. **Conjunto fechado, pequeno.** A IA escolhe entre as atividades **daquela empresa** (≈12–30) ou diz "nenhuma". Nunca inventa atividade.
2. **Nunca confirma sozinha no começo.** Sugestão aparece pré-preenchida, o humano confirma com um clique. Auto-aplicar só depois de a
   taxa de acerto medida justificar (decisão 4).
3. **Toda confirmação/correção vira dado de aprendizado**, gravado de forma permanente (livro-razão), não sobrescreve nada.
4. **Aprender sem vazar cliente.** Dentro da mesma empresa, exemplos reais. Entre empresas, só **pesos agregados de palavras →
   tipo de atividade**, com piso de 3 empresas (mesma regra do `gaps.js`); nunca o texto da tarefa de um cliente aparece para outro.
5. **Número vem do código, texto vem da IA.** Contagens por atividade saem de consulta determinística.
6. **Uso interno PRICETAX.** Cliente não vê sugestão nem aprendizado.

## Modelo de dados (aditivo, sem quebrar o que existe)

**No JSON da tarefa** (`actionItems[]`, sem migração — tarefas antigas simplesmente não têm o campo):

```
activityId:   string | ''           // atividade do cronograma (id estável)
activityLink: {
  status: 'suggested' | 'confirmed' | 'none',   // none = "nenhuma dessas" (humano decidiu)
  suggestedId, confidence (0–1), reason (1 frase), source: 'aprendido' | 'ia' | 'regra',
  confirmedBy, confirmedAt
}
```

Uma tarefa → **uma** atividade principal (decisão 1).

**Tabela nova (única mudança em `server/db.js`, aditiva, SEM CHECK — lição do §38)** `task_activity_links`, append-only:
`id, org_id, project_id, task_id, task_text (normalizado), task_area, owner_side, suggested_activity_key, chosen_activity_key,
decision ('confirmou' | 'corrigiu' | 'nenhuma'), source, user_id, created_at`. A *chave da atividade* (`activity_key`) é o título
normalizado (tokens de `gaps.js`), porque o `id` muda de empresa para empresa e o aprendizado precisa valer entre empresas.
**Precisa de aval do Rafael para mexer em `db.js`** (CLAUDE.md: arquivo sensível).

## Como a sugestão é feita (3 camadas, da mais barata à mais cara)

1. **Aprendido (determinístico).** Pontua cada atividade da empresa com: (a) tarefas **da mesma empresa** já confirmadas, por
   similaridade (embeddings Voyage; sem Voyage, Jaccard de tokens); (b) pesos agregados palavra→atividade-tipo de **todas as
   empresas** (piso 3); (c) `area` da tarefa e `owner` (cliente/PRICETAX) como sinais. Se o melhor passa de um limiar com margem sobre o
   2º, vira sugestão `source: 'aprendido'` sem gastar IA.
2. **IA (RENATA).** Uma **chamada separada** depois da extração (não mexe no schema da extração; falha não derruba o registro da
   reunião): entra a lista de atividades da empresa (id, título, fase, área, status), as tarefas da reunião (num lote só) e até ~8
   exemplos confirmados da mesma empresa mais parecidos. Saída: `activityId` (validado em código contra a lista) ou `null`, confiança
   e motivo em uma frase. Modelo mais barato (`STUDY_MODEL`). Cuidados já aprendidos: `max_tokens` com folga e **sem**
   `z.discriminatedUnion` no schema.
3. **Regra de reserva** (IA indisponível): `area` → atividade da fase "Mão na Massa por Área" daquela área; senão maior sobreposição
   de palavras; senão "sem sugestão".

Confiança baixa ou empate → **não sugere** (mostra "escolher atividade"), em vez de chutar.

## Tela

- **Aba Tarefas (reunião e lista):** nova coluna/etiqueta **"Atividade"**. Sugerida = etiqueta tracejada "Sugerido: Compras · 87%"
  com **✓ Confirmar**, **✎ Trocar** (busca, agrupada por fase) e **✕ Nenhuma dessas**. Cima da reunião: **"Confirmar todas as
  sugestões de confiança alta"** (revisão em bloco). Filtro **"Sem atividade"**.
- **Aba Resumo/Gantt:** cada atividade mostra **"N tarefas · M abertas"** e abre a lista das vinculadas. O status da atividade **não**
  muda sozinho (decisão 5).
- **Levantamento / Inventário:** coluna Atividade nas tarefas de reunião.
- **Painel "O que a RENATA aprendeu"** (Conhecimento): taxa de acerto por semana (confirmou ÷ sugeriu), padrões mais fortes, e
  **desfazer** um aprendizado ruim (admin).
- **RENATA (chat):** passa a ver o vínculo — "o que está pendente em Compras no cliente X?" responde pela atividade.
- **Tarefas antigas:** botão **"Vincular pendentes"** por empresa gera sugestões em lote e **só grava depois da revisão**.
- Tarefa criada à mão ou pela RENATA (`assistantActions.js`) também recebe sugestão (fase 3).

## Gravação e segurança

- Confirmar/trocar vai por **uma rota única** (`POST /api/projects/:id/task-links`) que, na mesma transação, atualiza a tarefa
  (`FOR UPDATE`, log, `syncProjectMemoryFromDiff`, sem notificação — padrão do §81) e insere a linha do livro-razão.
- `canAccessProject` antes de qualquer coisa; só equipe PRICETAX; testes de isolamento entre empresas e organizações.
- Sugestão calculada **antes** da gravação da reunião, na mesma escrita (sem janela em que a tarefa existe sem sugestão), mas
  **nunca** bloqueia: se der erro, a tarefa nasce sem sugestão.

## Fases

| Fase | Entrega | Depende de IA? | Tamanho |
|---|---|---|---|
| **0** | Decisões do Rafael (abaixo) | — | 10 min |
| **1** | Campo + seletor manual + contagem por atividade + filtro "Sem atividade". Já resolve "qual atividade é essa tarefa". | Não | pequeno/médio |
| **2** | Sugestão na hora da transcrição (camadas 2 e 3), etiqueta Confirmar/Trocar/Nenhuma, livro-razão gravando cada decisão. | Sim | médio |
| **3** | Aprendizado: camada 1 (mesma empresa + pesos agregados), exemplos na chamada da IA, "Vincular pendentes" em lote, sugestão em tarefa manual. | Sim | médio/grande |
| **4** | Painel "o que aprendeu" + taxa de acerto, RENATA/Levantamento enxergando o vínculo, decisão sobre auto-aplicar. | Não | médio |
| **5** | Qualidade: conjunto de ~30 tarefas reais com atividade correta conferida à mão (usa o harness do §41); só liberar passando; liberar primeiro para Rafael e Felipe. | Sim | pequeno |

Ordem recomendada: 0 → 1 → 2 → 3 → 4 → 5. A fase 1 entrega valor sozinha e já produz as primeiras confirmações manuais.

## Decisões para o Rafael (Etapa 0) — com recomendação

1. **Uma ou várias atividades por tarefa?** *Recomendo uma* (a principal); mais de uma complica contagem e aprendizado.
2. **Quem confirma?** *Recomendo qualquer pessoa da equipe PRICETAX* (rápido); correção de aprendizado ruim só admin.
3. **Escopo do aprendizado:** só por empresa, ou também entre empresas? *Recomendo ambos*: exemplos reais na mesma empresa; entre
   empresas só pesos agregados com piso de 3.
4. **Auto-aplicar quando a RENATA estiver muito segura?** *Recomendo não no início*; reavaliar após ~4 semanas se a taxa de acerto
   passar de ~90% em, no mínimo, ~100 sugestões — e só para os padrões mais fortes.
5. **Vincular muda o status/progresso da atividade?** *Recomendo que não* (só informativo); depois, opcional "todas as tarefas desta
   atividade estão concluídas — concluir a atividade?" como pergunta, nunca automático.
6. **Tarefas já existentes:** vincular em lote com revisão? *Recomendo sim*, empresa por empresa.
7. **Aval para criar a tabela `task_activity_links` em `server/db.js`** (aditiva).

## Riscos e o que não dá para testar localmente

- **IA real não testada localmente** (sem chave no desenvolvimento): camada 2 e a qualidade das sugestões só se validam de verdade
  em produção — por isso a fase 5 e o lançamento só para Rafael/Felipe.
- **Cronogramas muito editados** (atividade renomeada, excluída, empresa sem a atividade certa): tarefa fica "sem sugestão" ou
  aponta "atividade excluída" e volta para a fila; o link com **Lacunas** permite criar a atividade que falta.
- **Ruído de aprendizado:** um clique errado ensina errado. Mitigação: só confirmações explícitas contam; "Trocar" pesa mais;
  desfazer no painel; peso agregado só com piso de 3 empresas.
- **Voyage 3 pedidos/min:** a camada 1 cai para palavras; não bloqueia.
- **Custo:** 1 chamada barata por transcrição (≤ ~20 tarefas × ≤ ~30 atividades) — pequeno perto da extração (Opus).
- **Documentação:** ao implementar, atualizar `PROJECT_CONTEXT.md`, `docs/PROJECT_MAP.md` e a memória na mesma sessão.
