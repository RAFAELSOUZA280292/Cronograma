// Guia que o usuário cola na OUTRA janela do Claude Code (2026-10-05, §80). Não leva o token: ele vai pela variável de ambiente
// PRICETAX_TOKEN, para não ficar em arquivo nem em histórico de conversa. Mantido em sincronia com `ENDPOINTS` de server/connect.js.
export function buildGuide({ baseUrl, canCreate }) {
  const create = canCreate
    ? `
### Criar atividade (este token pode)
\`\`\`bash
curl -s -X POST "$PRICETAX_URL/api/connect/activities" \\
  -H "Authorization: Bearer $PRICETAX_TOKEN" -H "Content-Type: application/json" \\
  -d '{"title":"Revisar parecer 12/2026","desc":"contexto…","dueDate":"2026-10-20","priority":"alta","column":"A fazer","ref":"parecer-12-2026"}'
\`\`\`
- Só \`title\` é obrigatório. \`priority\`: urgente | alta | media | baixa. \`dueDate\`: AAAA-MM-DD. \`board\`/\`column\`: nome ou id (padrão: 1ª página, 1ª coluna).
- **Sempre mande \`ref\`** (uma chave estável sua): repetir a chamada devolve a mesma atividade em vez de duplicar.
- A atividade aparece no quadro do Rafael em até ~12 s, marcada "via API". **Só crie quando eu pedir.**
`
    : `
> Este token é **só de leitura**: criar atividade devolve 403. Peça ao Rafael um token "Ler e criar atividades" se precisar.
`;
  return `# Painel PRICETAX — como se conectar (API de conectividade)

Você (Claude Code) tem acesso ao painel da PRICETAX do Rafael por uma API HTTP. Use \`curl\` (ou \`fetch\`); a resposta é JSON.

## Configuração (uma vez por terminal)
\`\`\`bash
export PRICETAX_URL="${baseUrl}"
export PRICETAX_TOKEN="<o token que o Rafael gerou — não escreva em arquivo, não imprima, não faça commit>"
\`\`\`
Toda chamada leva o cabeçalho \`Authorization: Bearer $PRICETAX_TOKEN\`. **Nunca** ponha o token na URL.

## Primeiro passo: confirmar
\`\`\`bash
curl -s "$PRICETAX_URL/api/connect/me" -H "Authorization: Bearer $PRICETAX_TOKEN"
\`\`\`
Mostra de quem é o token, o escopo, a validade e a data de hoje (America/Sao_Paulo). A lista viva de rotas está em \`$PRICETAX_URL/api/connect\` (sem token).

## O que dá para ler
| Rota | Para quê |
|---|---|
| \`GET /api/connect/activities?status=open\\|overdue\\|today\\|urgent\\|done\\|all&q=texto&limit=50\` | atividades do quadro pessoal do Rafael (atrasadas primeiro) |
| \`GET /api/connect/companies?q=texto\` | empresas/cronogramas que ele pode ver |
| \`GET /api/connect/companies/{id}\` | equipe, fases, atividades e lista de reuniões da empresa |
| \`GET /api/connect/companies/{id}/meetings/{meetingId}?transcript=1\` | resumo, decisões, itens de ação (e transcrição, se pedir) |
| \`GET /api/connect/agenda?days=7\` | compromissos aceitos do Google Calendar dele |

Exemplo:
\`\`\`bash
curl -s "$PRICETAX_URL/api/connect/activities?status=overdue" -H "Authorization: Bearer $PRICETAX_TOKEN"
\`\`\`
${create}
## Regras
- Os dados são do Rafael e de clientes dele: **não copie para arquivos do repositório, logs ou issues** mais do que o necessário para a tarefa.
- Erros: 401 token inválido/revogado/expirado · 403 sem permissão (escopo ou acesso) · 404 não achou · 429 limite (120/min) · 400 dado inválido (a mensagem diz o quê).
- Não faça varredura em massa nem laço sem fim; peça só o que precisa.
- Se o token parar de funcionar, avise o Rafael: ele gera outro em *Meu perfil › Integrações (avançado)*.
`;
}
