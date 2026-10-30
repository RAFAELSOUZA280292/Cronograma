# Organizar o quadro da Gestão de Atividades por API (guia para outra janela do Claude Code)

Criado em 2026-10-30 (PROJECT_CONTEXT §116y). Serve para uma IA externa reorganizar o quadro pessoal do dono da chave: mover, editar, juntar duplicados,
criar colunas e cartões, com **prévia antes de gravar** e **cópia automática do quadro**. Código: `server/boardPlan.js` (regras) e `server/connect.js`
(rotas). Testes: `scripts/board-plan.test.mjs` (lógica) e `scripts/board-plan-http.test.mjs` (HTTP contra o banco local).

## Acesso
- Chave `pxk_…` **Ler e editar tudo** (`write_all`) de um administrador, gerada em **Meu perfil › Integrações**. Só ela organiza o quadro; `read_all` só lê (`GET /board`).
- Cabeçalho `Authorization: Bearer <chave>`. A chave fica no `.env` (`PRICETAX_WRITE_TOKEN`), nunca na conversa, em commit ou em log.
- O dono da chave precisa ter a Gestão de Atividades. Limite: 60 chamadas de organização por hora por chave, até 300 operações por chamada.

## 1. Ler o quadro (com ids)
```bash
curl -s "$PRICETAX_URL/api/connect/board?checklist=1" -H "Authorization: Bearer $PRICETAX_WRITE_TOKEN"
```
Devolve `updatedAt` e `pages[]` → `columns[]` → `cards[]` com `id`, `title`, `status`, `priority`, `dueDate`, `tags`, `responsibles` (nomes), `waiting`,
`checklist {open,done}` e, com `checklist=1`, os passos (`items`). Cartões da Lixeira e de Concluídas não vêm. Use os **ids** nas operações.

## 2. Montar o lote e ver a prévia
```bash
curl -s -X POST "$PRICETAX_URL/api/connect/board/plan" -H "Authorization: Bearer $PRICETAX_WRITE_TOKEN" -H "Content-Type: application/json" -d '{
  "operations": [
    {"op":"create_column","page":"EQUIPE","name":"AGUARDANDO","after":"MAIARA"},
    {"op":"update_card","card":"card-abc123","set":{"title":"[ROMANHA] Planilha de preço com CBS","dueDate":"2026-11-09","addTags":["romanha"],"responsibles":["Felipe"]}},
    {"op":"move_card","card":"card-abc123","column":"FELIPE"}
  ]
}'
```
Sem `apply`, **nada é gravado**. A resposta traz `changes[]` (uma linha por operação: o que muda, antes → depois), `counts`, `errors[]` (com o índice da operação) e o `digest`.

## 3. Gravar (só depois de mostrar a prévia ao Rafael)
Repita **o mesmo corpo** acrescentando `"apply": true, "confirm": true, "digest": "<digest da prévia>"`.
- O `digest` amarra a prévia ao estado do quadro naquele instante. Se o quadro mudou (o Rafael mexeu, a Amanda editou) ou as operações são outras: **409** — refaça a prévia.
- **Tudo ou nada:** qualquer operação com erro recusa o lote inteiro (**422**), sem gravar nada.
- Antes de gravar, o servidor guarda uma **cópia do quadro** em Gestão de Atividades › **Versões** ("antes de organização via API…"). É por ali que o Rafael desfaz (recupera cartões ou restaura tudo). Não existe "desfazer" por API.
- Cada cartão alterado ganha uma linha no histórico ("… — Organizado pela API (chave "X")") e a gravação entra em `api_token_actions`.

## Operações
| `op` | Campos | Observações |
|---|---|---|
| `create_column` | `page`, `name`, `after?`, `color?` | Já existe uma coluna com o nome → não faz nada. Cores: gray, blue, green, yellow, orange, red, pink, purple, brown |
| `rename_column` | `page`, `column`, `name` | |
| `create_card` | `page?`, `column`, `title`, `desc?`, `priority?`, `dueDate?`, `status?`, `tags?`, `responsibles?`, `checklist?`, `waiting?`, `ref?` | `ref` torna idempotente (mesma `ref` = não cria de novo). Use sempre |
| `move_card` | `card`, `column`, `page?`, `position?` ("start") | Entre páginas, os responsáveis são religados **pelo nome** (cadastra o que faltar) |
| `update_card` | `card`, `set` | `set`: `title`, `desc`, `priority`, `dueDate`, `status` (nao-iniciada, em-andamento, pausada), `tags`, `addTags`, `removeTags`, `responsibles`, `addResponsibles`, `waiting` (`{who,since}` ou `null`). Cartão **concluído** não é alterado |
| `add_checklist` | `card`, `items` (texto ou `{text,dueDate,responsibles}`) | Passo repetido (mesmo texto) é ignorado. O prazo da atividade acompanha o passo mais distante, como na tela |
| `merge_cards` | `into`, `from` (lista de ids), `note?` | Traz passos, etiquetas, responsáveis, prioridade e descrição; os originais vão para a **Lixeira** |
| `trash_card` | `card`, `reason?` | Lixeira (recuperável na tela) |
| `archive_card` | `card` | Vai para **Concluídas** (use só para o que já foi feito) |

Não existem: apagar de vez, concluir cartão, mexer em cartão da Lixeira, alterar página/compartilhamento.

## Para o Foco, a Daily e os filtros por pessoa funcionarem
- **Pessoa = campo `responsibles`**, não a coluna onde o cartão está. Mover para a coluna da Maiara **não** a torna responsável: preencha `responsibles`.
- O **Foco de hoje** só mostra o que está **em andamento** ou tem **prazo** (do cartão ou de um passo): as tarefas novas precisam de `dueDate` ou `status`.
- Para "aguardando cliente" prefira `waiting: {"who":"cliente"}` (alimenta a coluna **Atenção** do Foco, com os dias de espera) em vez de uma coluna só para isso.
- Um cartão = uma coluna e uma etiqueta de cliente (`tags`). Filtrar por etiqueta mostra tudo de um cliente.

## Boas práticas
1. Leia o quadro, planeje, rode a **prévia**, mostre ao Rafael (resuma `counts` e as `changes` mais relevantes) e só então grave.
2. Lotes pequenos e temáticos (por exemplo: primeiro as colunas, depois os duplicados, depois as tarefas novas). Se der 409, refaça a prévia.
3. Com as 126 tarefas novas: `create_card` com `ref` estável (`reuniao-AAAAMMDD-cliente-n`), `responsibles`, `dueDate` e etiqueta do cliente.
4. Antes de tirar algo da frente (atrasadas), pergunte: feito, nova data ou descartar. Descartar = `trash_card` com `reason`.
