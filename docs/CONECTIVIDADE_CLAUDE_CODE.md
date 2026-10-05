# Conectividade — usar o painel PRICETAX a partir de outra janela do Claude Code

> Documento de referência (2026-10-05, `PROJECT_CONTEXT.md` §80). O bloco **"Guia para colar no Claude Code"** abaixo é o mesmo texto que o painel entrega em *Meu perfil › Conectar*; aqui ele aparece com o endereço de produção e a variante "ler e criar".

## Visão rápida

1. No painel: **Meu perfil › Conectar › Gerar token** (nome, permissão, validade). O token `pxk_…` aparece **uma vez**.
2. Na outra janela do Claude Code: colar o comando `export PRICETAX_TOKEN=…` no terminal e colar o guia na conversa.
3. Pedir ao Claude Code para rodar `GET /api/connect/me`. Se responder com o seu nome, está conectado.

| | |
|---|---|
| Endereço base | `https://painel.pricetax.com.br/api/connect` |
| Autenticação | `Authorization: Bearer pxk_…` (nunca na URL) |
| Índice vivo e público | `GET /api/connect` (lista as rotas, sem segredo) |
| Escopos | **Só leitura** (`read`) · **Ler e criar atividades** (`read_create`) |
| Validade | 30, 90, 180 (padrão) ou 365 dias; no máximo 10 tokens ativos por pessoa |
| Limites | 120 requisições/min por token · 60 atividades criadas/hora por token |

## Modelo de segurança

- **Um token por janela.** Revogar um não afeta os outros (Meu perfil › Conectar › lixeira). Só o **hash** (sha256) fica no banco; o token não é recuperável.
- **API estreita, não a sessão do usuário.** O token só chama as rotas `/api/connect/*`; ele **não** vale em `/api/users`, organizações, widget, notificações nem em qualquer rota interna do app, e o cookie de sessão não vale na API de conectividade.
- **Respeita o acesso de quem gerou.** Empresas: só as que a pessoa já vê (`canAccessProject`, mesma organização). Atividades: só o quadro pessoal dela. Agenda: só o Google Calendar dela, compromissos aceitos ou próprios.
- **Escrita mínima.** Com `read_create` só dá para **criar** atividade no quadro pessoal (cartão marcado "via API", com o nome do token no histórico). Não edita nem apaga nada existente. `ref` evita duplicar em nova tentativa.
- **Usuário bloqueado ou com acesso vencido** perde o token na hora (403).
- **Dados de cliente**: o guia manda o Claude Code não copiar dados para repositórios/logs além do necessário.

## O que NÃO está na API (de propósito, por ora)

Editar ou apagar atividades; Pareceres, Modelos, CRM, XFlow, RENATA (perguntas), Conhecimento; usuários e administração. Dizer ao Rafael se precisar de alguma dessas rotas: cada uma exige decisão de escopo.

## Atividade criada pela API e o painel aberto

O painel salva o quadro inteiro. Para uma atividade criada pela API **não ser apagada** por um painel que já estava aberto: (1) o painel consulta a versão do quadro a cada ~12 s e recarrega quando mudou (sem edição pendente); (2) se ele salvar antes disso, o servidor devolve ao quadro as atividades da API criadas depois da última versão que aquele painel conheceu (`mergeApiCards` em `server/routes.js`). Quem apaga uma atividade da API deliberadamente (depois de ela aparecer) não a vê voltar.

## Guia para colar no Claude Code

````markdown
# Painel PRICETAX — como se conectar (API de conectividade)

Você (Claude Code) tem acesso ao painel da PRICETAX do Rafael por uma API HTTP. Use `curl` (ou `fetch`); a resposta é JSON.

## Configuração (uma vez por terminal)
```bash
export PRICETAX_URL="https://painel.pricetax.com.br"
export PRICETAX_TOKEN="<o token que o Rafael gerou — não escreva em arquivo, não imprima, não faça commit>"
```
Toda chamada leva o cabeçalho `Authorization: Bearer $PRICETAX_TOKEN`. **Nunca** ponha o token na URL.

## Primeiro passo: confirmar
```bash
curl -s "$PRICETAX_URL/api/connect/me" -H "Authorization: Bearer $PRICETAX_TOKEN"
```
Mostra de quem é o token, o escopo, a validade e a data de hoje (America/Sao_Paulo). A lista viva de rotas está em `$PRICETAX_URL/api/connect` (sem token).

## O que dá para ler
| Rota | Para quê |
|---|---|
| `GET /api/connect/activities?status=open\|overdue\|today\|urgent\|done\|all&q=texto&limit=50` | atividades do quadro pessoal do Rafael (atrasadas primeiro) |
| `GET /api/connect/companies?q=texto` | empresas/cronogramas que ele pode ver |
| `GET /api/connect/companies/{id}` | equipe, fases, atividades e lista de reuniões da empresa |
| `GET /api/connect/companies/{id}/meetings/{meetingId}?transcript=1` | resumo, decisões, itens de ação (e transcrição, se pedir) |
| `GET /api/connect/agenda?days=7` | compromissos aceitos do Google Calendar dele |

Exemplo:
```bash
curl -s "$PRICETAX_URL/api/connect/activities?status=overdue" -H "Authorization: Bearer $PRICETAX_TOKEN"
```

### Criar atividade (este token pode)
```bash
curl -s -X POST "$PRICETAX_URL/api/connect/activities" \
  -H "Authorization: Bearer $PRICETAX_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Revisar parecer 12/2026","desc":"contexto…","dueDate":"2026-10-20","priority":"alta","column":"A fazer","ref":"parecer-12-2026"}'
```
- Só `title` é obrigatório. `priority`: urgente | alta | media | baixa. `dueDate`: AAAA-MM-DD. `board`/`column`: nome ou id (padrão: 1ª página, 1ª coluna).
- **Sempre mande `ref`** (uma chave estável sua): repetir a chamada devolve a mesma atividade em vez de duplicar.
- A atividade aparece no quadro do Rafael em até ~12 s, marcada "via API". **Só crie quando eu pedir.**

## Regras
- Os dados são do Rafael e de clientes dele: **não copie para arquivos do repositório, logs ou issues** mais do que o necessário para a tarefa.
- Erros: 401 token inválido/revogado/expirado · 403 sem permissão (escopo ou acesso) · 404 não achou · 429 limite (120/min) · 400 dado inválido (a mensagem diz o quê).
- Não faça varredura em massa nem laço sem fim; peça só o que precisa.
- Se o token parar de funcionar, avise o Rafael: ele gera outro em *Meu perfil › Conectar*.

````
