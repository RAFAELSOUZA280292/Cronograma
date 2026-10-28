# Enviar a transcrição de uma reunião para o Painel PRICETAX (a RENATA processa)

> Documento para uma IA que tem acesso às reuniões gravadas do Rafael Souza (PRICETAX).
> Cole este texto inteiro na conversa dela. **Não leva a chave de acesso**: o Rafael entrega a chave à parte (ver "1. Pré-requisitos").

---

## 0. O seu papel (leia primeiro)

O Painel PRICETAX (`https://painel.pricetax.com.br`) tem, dentro de cada empresa cliente, a aba **Reuniões** e o botão **Enviar transcrição**. Uma pessoa cola ali a transcrição bruta de uma call, informa o dia e o horário e clica em enviar. A **RENATA** (a IA do próprio painel) lê o texto e **ela mesma** faz o trabalho: título, participantes, resumo, decisões, próximos passos (com responsável, lado PRICETAX × cliente, prazo e área), pendências, riscos, tópicos e trechos de destaque; registra a reunião na empresa, indexa na memória e sugere o vínculo de cada próximo passo com as atividades do cronograma (quem confirma é uma pessoa, na tela).

**Você faz exatamente o que a pessoa faz nessa janela, só que por API:**

1. escolhe a **empresa certa**;
2. entrega a **transcrição bruta e completa**;
3. informa **data e horário** da reunião;
4. **acompanha** até a RENATA terminar;
5. **confere** o que voltou e **relata** ao Rafael.

**Você NÃO faz o trabalho da RENATA.** Não resuma, não extraia participantes, não monte lista de tarefas, não traduza, não "melhore" o texto, não crie atividade em nenhuma outra rota. Se você mandar um resumo no lugar da transcrição, a RENATA trabalha em cima do seu resumo e a reunião fica pior do que a original.

---

## 1. Pré-requisitos

O Rafael gera a chave em **Meu perfil › Integrações (avançado) › "Enviar transcrições de reunião"** (a chave aparece uma única vez) e a entrega a você. Configure no terminal onde você roda os comandos:

```bash
export PRICETAX_URL="https://painel.pricetax.com.br"
export PRICETAX_TOKEN="<a chave pxk_… que o Rafael entregou — não escreva em arquivo, não imprima, não faça commit>"
```

- Toda chamada leva `-H "Authorization: Bearer $PRICETAX_TOKEN"`. **Nunca** ponha a chave na URL.
- A chave só enxerga **as empresas que o dono dela pode ver**. Ela não cria atividade solta, não mexe em cronograma e não opera o CRM (se tentar, recebe 403 — não procure contorno).
- Limites: 120 requisições por minuto e **30 transcrições por hora** por chave. Cada transcrição é uma chamada de IA paga: **só envie o que o Rafael pediu**, uma reunião por vez.

**Primeiro passo: confirmar a conexão.**

```bash
curl -s "$PRICETAX_URL/api/connect/me" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

Esperado: JSON com o nome do dono, `"scope":"transcripts"` e a validade. Se vier 401, a chave está errada, revogada ou vencida: **pare e avise o Rafael**.

---

## 2. Passo a passo

### Passo 1 — Achar a empresa (nunca adivinhe)

```bash
curl -s "$PRICETAX_URL/api/connect/companies?q=alcast" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

Devolve `companies[]` com `id`, `name`, `legalName`, `cnpj`, `status`, `meetings` (quantas reuniões já tem).

- Use o **nome da empresa que o Rafael citou** (ou o CNPJ, se ele deu). Pode haver mais de um resultado parecido (grupo com várias empresas, filial). **Se houver mais de um candidato razoável, ou nenhum, pergunte ao Rafael antes de enviar.** Enviar para a empresa errada coloca o conteúdo da reunião no cronograma de outro cliente.
- Guarde o `id` (ex.: `proj-pnk9q1k`). É o `{id}` das próximas chamadas.
- Reunião **interna** da PRICETAX, sem cliente cadastrado, **não vai para o painel por este caminho**. Pergunte ao Rafael.

### Passo 2 — Ver o que já está registrado (evita duplicar)

```bash
curl -s "$PRICETAX_URL/api/connect/companies/{id}" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

Em `meetings[]` estão as reuniões já registradas (`date`, `title`). Se a reunião que você vai enviar já está ali (mesma data e assunto), **não envie de novo sem o Rafael confirmar**. (Reenviar o mesmo texto é seguro, o painel reconhece — ver "5. Duplicados" — mas um texto levemente diferente da mesma reunião viraria uma reunião duplicada.)

### Passo 3 — Montar a transcrição

Pegue na sua fonte de reuniões a **transcrição completa**, tal como foi gravada:

- **Texto bruto e inteiro**, do primeiro ao último minuto. Mantenha **quem fala** (nomes dos interlocutores) e as **marcações de tempo** (`00:12`, `[12:48]`…), se existirem. A RENATA usa os nomes para saber de que lado (PRICETAX ou cliente) vem cada compromisso, e os tempos para indexar os tópicos.
- **Não** resuma, não corte "papo furado", não reescreva, não traduza, não troque nomes. Se o texto estiver em partes, junte na ordem.
- Se a fonte só tem resumo/ata e não tem a transcrição: **avise o Rafael**, não envie o resumo como se fosse transcrição.
- Mínimo de 200 caracteres; máximo de **400.000** caracteres por envio (uma reunião por envio). Reunião maior que isso: avise o Rafael.
- Dados pessoais e sensíveis ficam como estão (a transcrição é o documento de origem do cliente). Não copie o texto para arquivos do repositório, logs ou issues; use um arquivo temporário e apague depois.

### Passo 4 — Data e horário da reunião

São os mesmos campos "dia" e "horário" da janela do painel.

- `date`: **AAAA-MM-DD**, a data em que a reunião **aconteceu**, no fuso de Brasília (America/Sao_Paulo). Ex.: `2026-10-28`.
- `time`: **HH:MM**, 24 h, o **horário de início**, no fuso de Brasília. Ex.: `10:00`. Se a sua fonte dá o horário em UTC, converta (Brasília = UTC−3).
- **O que você informar vale mais do que a RENATA extrair do texto.** Por isso só informe o que você **sabe** (metadado da gravação ou do convite). Se não sabe, **deixe o campo de fora**: a RENATA tenta tirar do texto e, se não estiver explícito, deixa em branco. Não chute, não deduza de "quarta-feira".

### Passo 5 — Enviar

Monte o corpo JSON **por programa** (nunca à mão: aspas e quebras de linha da transcrição quebram o `curl`). Exemplo com a transcrição salva num arquivo temporário:

```bash
ARQ=/tmp/transcricao.txt          # texto bruto completo da reunião
DATA="2026-10-28"                 # AAAA-MM-DD (ou deixe vazio)
HORA="10:00"                      # HH:MM (ou deixe vazio)
python3 - "$ARQ" "$DATA" "$HORA" > /tmp/corpo.json <<'PY'
import json, sys
arq, data, hora = sys.argv[1:4]
body = {"transcript": open(arq, encoding="utf-8").read()}
if data: body["date"] = data
if hora: body["time"] = hora
print(json.dumps(body, ensure_ascii=False))
PY
curl -s -X POST "$PRICETAX_URL/api/connect/companies/{id}/transcripts" \
  -H "Authorization: Bearer $PRICETAX_TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/corpo.json
```

Resposta de sucesso (**HTTP 202**):

```json
{ "submissionId": "msub-abc1234", "status": "pending", "duplicate": false, "meetingId": null,
  "next": "Consulte GET /api/connect/companies/{id}/transcripts/msub-abc1234 a cada ~5 s até status done (ou failed)." }
```

Guarde o `submissionId`. Depois de enviado, apague os arquivos temporários (`/tmp/transcricao.txt`, `/tmp/corpo.json`).

### Passo 6 — Acompanhar até terminar

Consulte a cada ~5 segundos (a extração leva de segundos a poucos minutos, conforme o tamanho):

```bash
curl -s "$PRICETAX_URL/api/connect/companies/{id}/transcripts/{submissionId}" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

`status` possíveis:

| status | Significa | O que fazer |
|---|---|---|
| `pending` | Na fila | Continue consultando |
| `processing` | A RENATA está lendo | Continue consultando |
| `done` | Reunião criada | Passo 7 |
| `failed` | Falhou (`errorMessage` explica, em português) | Ver "6. Erros" |

Pare de consultar depois de ~10 minutos sem sair de `pending`/`processing` e **avise o Rafael** (o painel marca sozinho como `failed` um envio que fica mais de 5 minutos travado em `processing`, ao listar).

### Passo 7 — Conferir o que a RENATA devolveu

Com `status: "done"` a resposta traz `meeting`:

```json
{ "submissionId": "msub-abc1234", "status": "done", "meetingId": "mtg-xyz",
  "meeting": { "id": "mtg-xyz", "title": "…", "date": "2026-10-28", "time": "10:00",
    "participants": ["…"], "summary": "…", "decisions": "…",
    "actionItems": [ { "id": "mai-…", "title": "…", "kind": "tarefa|decisao|risco|pendencia",
                       "owner": "pricetax|cliente", "responsible": "…", "area": "Financeiro", "dueDate": "2026-11-04", "status": "nao-iniciado" } ] } }
```

Confira, sem alterar nada: a **data e o horário** são os que você informou? A **empresa** é a certa? Há **participantes**, **resumo** e **próximos passos** (uma reunião longa sem nenhum próximo passo merece um aviso)? Se algo estiver errado, **não tente corrigir por outra rota**: relate ao Rafael, que ajusta na tela (aba Reuniões da empresa).

Se precisar ler a reunião completa de novo (por exemplo, com a transcrição):

```bash
curl -s "$PRICETAX_URL/api/connect/companies/{id}/meetings/{meetingId}?transcript=1" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

### Passo 8 — Relatar ao Rafael

Uma linha por reunião, curta e verificável. Exemplo:

> ✅ **ALCAST** — "Alinhamento fluxo de caixa" · 28/10/2026 10:00 · 4 participantes · 7 próximos passos (2 pendências, 1 risco) · registrada na aba Reuniões. Os vínculos com as atividades do cronograma ficam para você confirmar na tela.

Diga também o que **não** deu certo e por quê. Onde o Rafael vê: **Empresas › [empresa] › Reuniões**.

---

## 3. Várias reuniões de uma vez (lote)

- **Uma por vez, em sequência**: envie, espere `done`, só então a próxima. Em paralelo estoura o limite de uso da IA.
- Máximo de 30 por hora (o painel responde 429 depois disso; espere e continue de onde parou).
- Antes de começar, mostre ao Rafael a **lista do que pretende enviar** (empresa, data, título) e espere o "pode ir". Ao final, entregue uma **tabela** com: reunião, empresa, status, `submissionId`, observações.
- Se uma falhar, **não trave o lote**: registre e siga; ao final, trate as falhas.

## 4. Segue o mesmo caminho da tela (como conferir sem a API)

O que você faz por API é o equivalente a: Painel › Empresas › (empresa) › **Reuniões** › **Enviar transcrição** › colar o texto › preencher data e horário › enviar. A lista "Transcrições enviadas" no topo da aba mostra Na fila → Processando → Concluída (ou Falhou, com o motivo e "Tentar novamente"). Os envios feitos por você aparecem lá, em nome do dono da chave, e o log da empresa registra "… enviou uma transcrição … (via chave de API)".

## 5. Duplicados

- O **mesmo texto** na mesma empresa (em fila, processando ou concluído) **não é processado duas vezes**: a resposta é **HTTP 200** com `"duplicate": true` e o `submissionId`/`meetingId` do envio original. Pode reenviar sem medo depois de uma falha de rede.
- Um texto **diferente** (mesmo trecho com uma linha a mais, outra exportação) **conta como outra reunião**. Por isso o Passo 2.
- Envio que **falhou** não conta como duplicado: dá para reenviar ou pedir nova tentativa.

## 6. Erros e o que fazer

| Código | Significado | O que fazer |
|---|---|---|
| 401 | Chave ausente, errada, revogada ou vencida | Pare e avise o Rafael |
| 403 | A chave não envia transcrição / o dono não acessa Empresas | Pare e avise o Rafael |
| 404 | Empresa não encontrada **ou fora do acesso do dono** | Releia a lista de empresas; pergunte ao Rafael |
| 400 | Dado inválido (a mensagem diz o quê: `date`, `time`, texto curto…) | Corrija e reenvie |
| 413 | Transcrição acima de 400.000 caracteres | Avise o Rafael; não corte por conta própria |
| 429 | Limite (120/min ou 30 transcrições/hora) | Espere e continue |
| 503 | A IA do painel não está configurada | Avise o Rafael |
| `failed` (`errorMessage`) | A RENATA não conseguiu processar | Se for "Sem créditos", "Limite de uso", "sobrecarregada" ou "conexão": espere e use `POST …/transcripts/{submissionId}/retry` (até 2 vezes). Se persistir ou for outro erro: avise o Rafael |

Nova tentativa de um envio que falhou:

```bash
curl -s -X POST "$PRICETAX_URL/api/connect/companies/{id}/transcripts/{submissionId}/retry" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

(Responde 202; só vale para envio em `failed`. Volte ao Passo 6.)

Para ver todos os envios recentes de uma empresa (últimos 50):

```bash
curl -s "$PRICETAX_URL/api/connect/companies/{id}/transcripts" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

## 7. O que você NÃO deve fazer

- Não resumir, traduzir, limpar ou "completar" a transcrição.
- Não inventar data, horário, empresa, participantes ou responsáveis.
- Não enviar para a empresa errada "porque parecia a mais próxima".
- Não enviar reunião que o Rafael não pediu; não varrer todas as reuniões "por conta própria".
- Não criar atividades, reuniões ou notas por outras rotas para "ajudar" a RENATA.
- Não expor a chave (conversa, arquivo, log, URL, commit).
- Não copiar dados dos clientes para fora do necessário para a tarefa.
- Não fazer laço sem fim nem consultas em rajada (consulte a cada ~5 s).

## 8. Checklist antes de cada envio

- [ ] O Rafael pediu esta reunião, para esta empresa.
- [ ] Empresa confirmada (nome/CNPJ) e `id` anotado.
- [ ] A reunião ainda não está em `meetings[]` da empresa.
- [ ] Texto = transcrição **bruta e completa** (com falantes e tempos), não resumo.
- [ ] `date` (AAAA-MM-DD) e `time` (HH:MM, Brasília) conhecidos — ou deixados de fora.
- [ ] Corpo montado por programa (JSON), arquivos temporários apagados depois.

## 9. Pedido típico do Rafael (exemplo)

> "Pegue a reunião de hoje às 10h com a ALCAST (Financeiro) e suba a transcrição no painel para a RENATA processar."

Você: acha a transcrição na sua fonte → confirma a empresa (`GET /companies?q=alcast`) → confere que ainda não está registrada → envia com `date` e `time` do convite → acompanha até `done` → confere → responde com a linha do Passo 8.
