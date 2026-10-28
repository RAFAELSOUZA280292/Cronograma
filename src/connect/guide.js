// Guia que o usuário cola na OUTRA janela do Claude Code (2026-10-05, §80). Não leva o token: ele vai pela variável de ambiente
// PRICETAX_TOKEN, para não ficar em arquivo nem em histórico de conversa. Mantido em sincronia com `ENDPOINTS` de server/connect.js.
export function buildGuide({ baseUrl, canCreate, canWrite = false, canCrm = false, canTranscripts = false }) {
  const transcripts = canTranscripts
    ? `
### Enviar transcrição de reunião para a RENATA (esta chave pode)
\`\`\`bash
curl -s -X POST "$PRICETAX_URL/api/connect/companies/{id}/transcripts" -H "Authorization: Bearer $PRICETAX_TOKEN" -H "Content-Type: application/json" \\
  -d '{"transcript":"<texto bruto COMPLETO da reunião>","date":"2026-10-28","time":"10:00"}'
curl -s "$PRICETAX_URL/api/connect/companies/{id}/transcripts/{submissionId}" -H "Authorization: Bearer $PRICETAX_TOKEN"
\`\`\`
- É o mesmo caminho do botão **Enviar transcrição** da aba Reuniões: a **RENATA do painel** extrai título, participantes, resumo, decisões e atividades e registra a reunião na empresa. **Você só entrega o texto e acompanha**; não resuma, não extraia, não crie atividades por outra rota.
- \`transcript\` = texto bruto completo (com quem fala e marcações de tempo, se houver; mínimo 200 caracteres). \`date\` (AAAA-MM-DD) e \`time\` (HH:MM) são os da reunião; o que você informar vale mais que o extraído do texto.
- Responde 202 com \`submissionId\`; consulte a cada ~5 s até \`status\` = \`done\` (traz a reunião criada) ou \`failed\` (\`errorMessage\`; dá para \`POST …/transcripts/{submissionId}/retry\`). O mesmo texto na mesma empresa não é processado duas vezes (\`duplicate:true\`). Limite: 30 envios por hora.
- Cada envio é uma chamada de IA paga: **só envie quando o Rafael pedir** e uma reunião por vez.
`
    : '';
  const crm = canCrm
    ? `
### Operar o CRM (esta chave pode; só administrador)
\`\`\`bash
curl -s "$PRICETAX_URL/api/connect/crm/pipelines" -H "Authorization: Bearer $PRICETAX_TOKEN"
curl -s -X POST "$PRICETAX_URL/api/connect/crm/cadences" -H "Authorization: Bearer $PRICETAX_TOKEN" -H "Content-Type: application/json" -d '{"pipelineId":"…","stageId":"…","steps":[{"title":"1º Follow Up","type":"followup","days":1}]}'
\`\`\`
- São as MESMAS rotas e regras de \`/api/crm\` da tela (empresas, contatos, negócios, atividades, notas, produtos, funis, cadências): mesma validação, auditoria e linha do tempo; só o prefixo muda para \`/api/connect/crm\`.
- Tudo que você grava fica registrado como **"Claude Code (por <dono da chave>)"** e entra no registro de ações (Meu perfil > Conectar). Excluir é exclusão lógica, como na tela.
- **Extrair para Excel:** \`curl -s "$PRICETAX_URL/api/connect/crm/deals/export.xlsx?tag=NOME&status=open" -H "Authorization: Bearer $PRICETAX_TOKEN" -o negocios.xlsx\` — mesmos filtros da lista (\`q\`, \`tag\` (várias com \`|\`), \`ownerId\`, \`source\`, \`type\`, \`attention\`, \`status\`=open|won|lost|all, \`pipelineId\`); vem com e-mail, telefone e link do WhatsApp; o cabeçalho \`X-Export-Count\` diz quantos negócios. Para ler dados em JSON use \`GET /api/connect/crm/deals\` (até 200 por página, \`offset\` para a próxima) e \`/companies\`, \`/contacts\`.
- Não opera a migração do PipeRun (escrita). Faça só o que o Rafael pediu; depois de gravar, confira lendo de volta e diga o que mudou.
`
    : '';
  const write = canWrite
    ? `
### Ajustar o cronograma de uma empresa (este token pode; só administrador)
\`\`\`bash
curl -s -X POST "$PRICETAX_URL/api/connect/companies/{id}/plan" \\
  -H "Authorization: Bearer $PRICETAX_TOKEN" -H "Content-Type: application/json" \\
  -d '{"dryRun":true,"note":"por quê","ops":[{"op":"sub.set","activity":{"id":"…"},"sub":{"id":"…"},"set":{"done":true}}]}'
\`\`\`
- **\`dryRun\` é \`true\` por padrão**: só mostra o que faria. Mande \`"dryRun":false\` para gravar, e só depois de eu aprovar o que o dry-run mostrou.
- Tudo ou nada (até 200 operações): se uma falhar, nada é gravado. Fica registrado no Log da empresa.
- Operações: \`activity.set\`, \`sub.set\`, \`sub.add\` (\`position\` top|end, \`kind\`, \`guide\`, \`pautaDe\`), \`sub.move\`, \`activity.add\`, \`pauta.link\`, \`activity.delete\` / \`sub.delete\` (vão para a lixeira; \`activity.restore\` / \`sub.restore\` desfazem). A lista exata e os campos aceitos estão em \`$PRICETAX_URL/api/connect\`.
- A resposta de uma gravação traz \`undo\`: mande esse array de volta como \`ops\` para desfazer.
`
    : '';
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
${create}${write}${crm}${transcripts}
## Regras
- Os dados são do Rafael e de clientes dele: **não copie para arquivos do repositório, logs ou issues** mais do que o necessário para a tarefa.
- Erros: 401 token inválido/revogado/expirado · 403 sem permissão (escopo ou acesso) · 404 não achou · 429 limite (120/min) · 400 dado inválido (a mensagem diz o quê).
- Não faça varredura em massa nem laço sem fim; peça só o que precisa.
- Se o token parar de funcionar, avise o Rafael: ele gera outro em *Meu perfil › Integrações (avançado)*.
`;
}
