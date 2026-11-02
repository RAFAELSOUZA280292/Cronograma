// Instruções que a pessoa cola na IA dela (Claude Code, ChatGPT, Gemini, Base44…) depois de gerar a chave (§80; reescrito em 2026-11-02, §129).
// Curto de propósito: a lista viva e completa do que a chave pode fazer vem de GET /api/connect (shared/connectCatalog.js), nunca daqui.
// Com `token`, o texto já leva a chave (botão "Copiar tudo para a IA"); sem `token`, leva só o lugar dela.
import { ERRORS, RULES } from '../../shared/connectCatalog.js';

const bash = (lines) => ['```bash', ...lines, '```'].join('\n');
const H = '-H "Authorization: Bearer $PRICETAX_TOKEN"';

export function buildGuide({ baseUrl, token = '', scopeLabel = '', canCreate = false, canWrite = false, canCrm = false, canTranscripts = false, canMeetingsEdit = false, readAll = false, canBoard = false, canTeam = false }) {
  const writes = canCreate || canWrite || canCrm || canTranscripts || canMeetingsEdit || canBoard;
  const crmReadable = canCrm || readAll;
  const key = token || '<a chave pxk_… que você recebeu junto com este texto>';

  const examples = [
    ['Quais atividades estão atrasadas?', [`curl -s "$PRICETAX_URL/api/connect/activities?status=overdue&limit=50" ${H}`], 'Responda com título, prazo e coluna de cada uma.'],
    ['O que ficou decidido na última reunião da empresa X?', [
      `curl -s "$PRICETAX_URL/api/connect/companies?q=X" ${H}`,
      `curl -s "$PRICETAX_URL/api/connect/companies/{id}" ${H}`,
      `curl -s "$PRICETAX_URL/api/connect/companies/{id}/meetings/{meetingId}" ${H}`,
    ], 'O `id` vem da 1ª resposta e o `meetingId` da lista `meetings` da 2ª (a mais recente vem primeiro).'],
  ];
  if (canCreate) {
    examples.push(['Crie a atividade "Enviar proposta revisada" para 06/11/2026, prioridade alta.', [
      `curl -s -X POST "$PRICETAX_URL/api/connect/activities" ${H} -H "Content-Type: application/json" -d '{"title":"Enviar proposta revisada","dueDate":"2026-11-06","priority":"alta","ref":"proposta-revisada-2026-11"}'`,
      `curl -s "$PRICETAX_URL/api/connect/activities?q=proposta%20revisada" ${H}`,
    ], 'Sempre mande `ref` (uma chave estável sua): repetir a chamada não duplica. A segunda chamada confirma que a atividade foi criada.'] );
  } else if (canCrm) {
    examples.push(['Registre no CRM uma nota formal sobre a reunião com a empresa X.', [
      `curl -s "$PRICETAX_URL/api/connect/crm/search?q=X" ${H}`,
      `curl -s -X POST "$PRICETAX_URL/api/connect/crm/notes" ${H} -H "Content-Type: application/json" -d '{"entityType":"company","entityId":"<id da empresa>","body":"Reunião realizada em 03/11/2026. …"}'`,
    ], 'Confirme o texto com a pessoa antes de gravar e, depois, leia a empresa de volta (`GET /api/connect/crm/companies/{id}`).'] );
  } else if (crmReadable) {
    examples.push(['Liste os negócios em aberto no CRM.', [
      `curl -s "$PRICETAX_URL/api/connect/crm/deals?status=open&limit=50&offset=0" ${H}`,
      `curl -s "$PRICETAX_URL/api/connect/crm/deals?status=open&limit=50&offset=50" ${H}`,
    ], '`total` diz quantos existem; avance o `offset` de 50 em 50 até cobrir o total.'] );
  } else {
    examples.push(['Quais são os meus compromissos da semana?', [`curl -s "$PRICETAX_URL/api/connect/agenda?days=7" ${H}`], 'Se vier `connected:false`, o Google Calendar do dono da chave não está conectado.'] );
  }

  const prevs = [
    canWrite && '`POST …/companies/{id}/plan` (cronograma): `dryRun` é true por padrão; só mande `dryRun:false` depois do OK.',
    canMeetingsEdit && '`PATCH …/meetings/{meetingId}` (corrigir reunião): primeiro com `"dryRun":true`.',
    canBoard && '`POST …/board/plan` (organizar o quadro): sem `apply` é só a prévia; para gravar repita com `apply:true`, `confirm:true` e o `digest`.',
    canTranscripts && '`POST …/companies/{id}/transcripts`: cada envio custa uma chamada de IA; uma reunião por vez e só quando pedirem.',
    canTeam && '`GET …/team-day` traz dado de pessoas da equipe: use só para o que pedirem; cada leitura fica registrada.',
  ].filter(Boolean);

  return `# Painel PRICETAX — acesso por API (instruções para a IA)

Você vai usar a API do painel da PRICETAX (consultoria tributária). É HTTP com respostas em JSON, em português. Siga estas instruções à risca.

## Início rápido
- **URL base:** \`${baseUrl}\`
- **Chave:** \`${key}\`
- **Cabeçalho em toda chamada:** \`Authorization: Bearer <chave>\` (nunca na URL)
- **Permissão desta chave:** ${scopeLabel || (writes ? 'ler e editar' : 'ler')} — ${writes ? 'leitura e escrita' : '**só leitura**: qualquer gravação devolve 403'}
- **Primeiro, sempre:** \`GET /api/connect\`

${bash([`export PRICETAX_URL="${baseUrl}"`, `export PRICETAX_TOKEN="${key}"`, `curl -s "$PRICETAX_URL/api/connect" ${H}`])}

Essa primeira resposta já traz tudo: quem é a chave (\`token\`, \`user\`, \`organization\`), as regras, os limites, os erros e, em \`resources[].actions\`, **todas as ações que esta chave pode usar** — cada uma com método, caminho, parâmetros, corpo de exemplo, resposta de exemplo e o \`curl\` pronto. O que não está lá esta chave não pode fazer.

- **OpenAPI 3.1** (ChatGPT Actions, Gemini e afins): \`${baseUrl}/api/connect/openapi.json\` — com o cabeçalho da chave, vem só o que ela pode usar.
- **Guia legível:** \`${baseUrl}/api/connect/docs\`

## Em cada ferramenta
- **Claude Code ou terminal:** rode as três linhas acima e siga pela descoberta. Não grave a chave em arquivo nem em commit.
- **ChatGPT:** num GPT personalizado, em Configurar › Ações, importe o OpenAPI pela URL acima; em Autenticação escolha "Chave de API", tipo "Bearer", e cole a chave. Numa conversa comum, sem Ação, o ChatGPT não chama esta API sozinho.
- **Gemini:** use o OpenAPI como declaração de funções (Gemini API, Vertex AI ou Agent Builder) e mande o cabeçalho Bearer pelo seu código. O app de conversa do Gemini não chama APIs externas por conta própria.
- **Base44:** chame a API numa função de back-end e guarde a chave como segredo (variável de ambiente), nunca no código da página: no navegador ela fica visível para quem abrir a página.

## Regras
${RULES.map((r) => `- ${r}`).join('\n')}
${writes ? '' : '- **Esta chave é só de leitura.** Não tente criar, editar nem apagar nada.\n'}${prevs.length ? `\n### Gravações com prévia (esta chave pode)\n${prevs.map((r) => `- ${r}`).join('\n')}\n` : ''}
## Três tarefas de exemplo
${examples.map(([ask, cmds, tip], i) => `${i + 1}. **Pedido:** "${ask}"\n\n${bash(cmds)}\n\n   ${tip}`).join('\n\n')}

## Erros (sempre JSON: \`{ "error", "message" }\`)
${Object.entries(ERRORS).map(([k, v]) => `- **${k}** ${v}`).join('\n')}

Em caso de dúvida, chame \`GET /api/connect\` de novo e use só o que estiver lá. Se a chave parar de funcionar (401), avise a pessoa: ela gera outra no painel, em Meu perfil › Integrações.
`;
}
