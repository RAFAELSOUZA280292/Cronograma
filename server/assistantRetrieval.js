// RENATA — Assistente do Projeto (2026-09, Fase 2 do Assistente
// Inteligente de Projetos; identidade "RENATA" e princípios de atuação
// definidos 2026-09-10, ver PROJECT_CONTEXT.md §27) — pipeline de 2
// chamadas à IA em cima da memória já construída na Fase 1
// (server/memoryRetrieval.js): (1) resolve a pergunta do usuário —
// puxando pronomes/referências do turno anterior ("esse assunto") —
// numa busca concreta; (2) recebe os trechos recuperados e produz a
// resposta final, só podendo citar como fonte um trecho que realmente
// foi recuperado (validado depois pelo backend, não só por instrução de
// prompt — ver `askProjectAssistant`). Mesmo padrão de saída
// estruturada garantida já usado em server/meetingInbox.js
// (`client.messages.parse` + Zod).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { searchProjectMemory } from './memoryRetrieval.js';
import { buildProjectSnapshot } from './assistantContext.js';
import { executeProposedAction } from './assistantActions.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

const CHUNK_KINDS = ['transcript_segment', 'meeting_summary', 'meeting_decision', 'meeting_highlight', 'meeting_topic', 'activity', 'activity_comment'];

const ResolveQuerySchema = z.object({
  intent: z.enum(['pergunta_sobre_projeto', 'conversa_geral']).describe('"conversa_geral" pra saudações ("olá", "bom dia"), agradecimentos, perguntas sobre o que o assistente faz/como usar, ou qualquer mensagem que não pede um fato específico do histórico do projeto. "pergunta_sobre_projeto" pra qualquer pergunta real sobre reuniões, decisões, participantes, atividades, prazos, etc. deste projeto.'),
  directReply: z.string().nullable().describe('Preenchido SOMENTE quando intent="conversa_geral": uma resposta curta, calorosa e profissional em português (ex.: cumprimentar de volta e explicar em 1-2 frases que você pode responder perguntas sobre as reuniões/decisões/atividades deste projeto, sempre citando a fonte). null quando intent="pergunta_sobre_projeto".'),
  standaloneQuery: z.string().describe('Só relevante quando intent="pergunta_sobre_projeto": a pergunta do usuário reescrita como uma busca autossuficiente, resolvendo qualquer pronome ou referência ao turno anterior da conversa (ex.: "esse assunto", "ele", "isso") em texto concreto. Se a pergunta já for autossuficiente, repita-a como está. Se intent="conversa_geral", repita a pergunta original aqui mesmo sem uso.'),
  participant: z.string().nullable().describe('Nome de uma pessoa específica, se a pergunta for sobre o que ela falou/fez/prometeu — exatamente como aparece na conversa, null se a pergunta não for sobre uma pessoa específica'),
  meetingScope: z.enum(['atual', 'projeto_inteiro']).describe('"atual" se o usuário está claramente perguntando só sobre a reunião que está aberta na tela agora; "projeto_inteiro" no caso contrário, incluindo quando o usuário pedir explicitamente pra expandir pra reuniões anteriores'),
  kind: z.enum([...CHUNK_KINDS, 'qualquer']).describe('Tipo de conteúdo mais provável de responder — "qualquer" se não for possível restringir com confiança'),
});

// Dois tipos de ação executável por enquanto (ver server/assistantActions.js)
// — a IA só PROPÕE, nunca executa sozinha: fica pendente até o usuário
// confirmar pelo painel (server/assistant.js, POST /messages/:id/action).
// Objeto único e achatado (não `z.discriminatedUnion`) de propósito: um
// union quebrou a saída estruturada da Anthropic API em produção
// (2026-09-10) — toda pergunta passou a falhar, não só as de ação, porque
// `proposedAction` está dentro de `SynthesizeAnswerSchema`, usado por
// TODA resposta. O padrão comprovado no resto do sistema (aqui e em
// meetingInbox.js) sempre foi objeto achatado com campos nullable — cada
// tipo de ação usa só os campos que fazem sentido, os outros ficam null.
const ProposedActionSchema = z.object({
  type: z.enum(['create_meeting_todo', 'reschedule_activity']).describe('Qual ação está sendo proposta.'),
  meetingId: z.string().nullable().describe('SÓ pra type="create_meeting_todo": id de uma reunião real, exatamente como listado em "REUNIÕES DISPONÍVEIS" no perfil do projeto — nunca invente um id. Se o usuário não deixar claro qual reunião e nenhuma estiver aberta na tela, NÃO proponha ainda: pergunte antes qual reunião vincular (ou sugira a mais recente). null pra reschedule_activity.'),
  title: z.string().nullable().describe('SÓ pra type="create_meeting_todo": título curto e claro da pendência a ser criada. null pra reschedule_activity.'),
  responsible: z.string().nullable().describe('SÓ pra type="create_meeting_todo": nome da pessoa responsável, se mencionado pelo usuário; null se não especificado ou se for reschedule_activity.'),
  owner: z.enum(['pricetax', 'cliente']).nullable().describe('SÓ pra type="create_meeting_todo": de qual lado é essa entrega. null pra reschedule_activity.'),
  dueDate: z.string().nullable().describe('SÓ pra type="create_meeting_todo": prazo em YYYY-MM-DD, se mencionado. null se não especificado ou se for reschedule_activity.'),
  activityId: z.string().nullable().describe('SÓ pra type="reschedule_activity": id de uma atividade real, exatamente como listado em "ATIVIDADES DO CRONOGRAMA" no perfil do projeto — nunca invente um id. Se não estiver claro qual atividade o usuário quer dizer, NÃO proponha ainda: pergunte antes, citando o título exato que você acha que é, pra confirmar. null pra create_meeting_todo.'),
  newDate: z.string().nullable().describe('SÓ pra type="reschedule_activity": nova data em YYYY-MM-DD. Se o pedido for relativo (ex.: "postergar pro final do cronograma"), calcule uma data depois da atividade mais distante já agendada. null pra create_meeting_todo.'),
}).nullable();

const SynthesizeAnswerSchema = z.object({
  answer: z.string().describe('A resposta final em português, clara e direta, para o usuário. Se hasEvidence for false, esta deve ser literalmente "Não encontrei evidência suficiente nas reuniões ou documentos deste projeto." Se você preencheu proposedAction, a resposta deve descrever a ação proposta e pedir confirmação explícita — nunca afirme que já foi feita.'),
  citedChunkIds: z.array(z.string()).describe('IDs (campo "id" de cada trecho recebido) dos trechos que sustentam de fato a resposta — só inclua um id se ele realmente contém a informação usada na resposta. Vazio se a resposta veio do PERFIL DO PROJETO em vez de um trecho, ou se hasEvidence for false.'),
  hasEvidence: z.boolean().describe('true se os trechos OU o PERFIL DO PROJETO sustentam a resposta; false só quando nem os trechos recuperados nem o perfil do projeto respondem a pergunta com confiança — nesse caso NUNCA invente, admita explicitamente que não encontrou.'),
  learnedFact: z.string().nullable().describe('Preencha SOMENTE quando esta troca revelou um fato durável e específico sobre ESTE projeto que vale a pena lembrar em conversas futuras (ex.: um padrão recorrente, uma preferência do cliente, um contexto importante que não estava registrado) — seja específico e curto (1 frase). null na grande maioria das respostas — não force um aprendizado onde não há nada novo/reutilizável.'),
  proposedAction: ProposedActionSchema.describe('Preencha SOMENTE quando o usuário pedir explicitamente pra criar uma pendência ou reagendar uma atividade do cronograma. Você NUNCA executa a ação — só propõe; o usuário confirma ou rejeita pelo painel depois. Se faltar informação pra ter certeza do alvo (qual reunião, qual atividade), NÃO proponha ainda — pergunte antes na própria resposta, com proposedAction=null, e proponha só no próximo turno depois que o usuário esclarecer. null na grande maioria das respostas.'),
});

async function resolveQuery({ question, history, context, projectSnapshot }) {
  const client = new Anthropic();
  const historyText = history.length
    ? history.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n')
    : '(sem turnos anteriores nesta conversa)';
  const contextText = context.meetingTitle
    ? `O usuário está com a reunião "${context.meetingTitle}" (${context.meetingDate || 'sem data'}) aberta na tela agora.`
    : `O usuário está na aba "${context.view === 'todo' ? 'Atividades' : 'Reuniões'}", sem nenhuma reunião específica aberta.`;
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 500,
    system: [
      'Você é a RENATA — a Inteligência de Execução e Gestão de Projetos da PRICETAX (o nome representa Reforma, Execução, Negócios, Agilidade, Tecnologia e Ação). Você prepara o processamento de uma mensagem enviada por um consultor interno.',
      'Primeiro classifique a intenção: se for só uma saudação, agradecimento, ou pergunta sobre o que você mesmo faz/quem você é — não é uma pergunta sobre o projeto — marque intent="conversa_geral" e escreva você mesmo uma resposta curta e calorosa em directReply. Se perguntarem seu nome/quem você é, apresente-se como RENATA, a assistente de execução e gestão de projetos da PRICETAX, irmã da IVANA (a IA tributária da PRICETAX — a IVANA interpreta legislação e Reforma Tributária, você transforma isso em execução real dentro dos projetos).',
      'Se for uma pergunta real sobre o histórico do projeto, marque intent="pergunta_sobre_projeto" e reformule como uma busca autossuficiente, resolvendo qualquer referência ao que foi dito antes na conversa (inclusive "o cliente"/"a empresa", que pode ser resolvido pelo nome real no perfil do projeto abaixo) — nunca responda a pergunta em si nesse caso, isso é feito depois por outra etapa.',
    ].join(' '),
    messages: [{ role: 'user', content: `Perfil do projeto:\n${projectSnapshot}\n\nContexto: ${contextText}\n\nConversa até agora:\n${historyText}\n\nNova mensagem do usuário: ${question}` }],
    output_config: { format: zodOutputFormat(ResolveQuerySchema) },
  });
  if (!response.parsed_output) throw new Error('Falha ao interpretar a pergunta.');
  return { output: response.parsed_output, usage: response.usage };
}

async function synthesizeAnswer({ question, chunks, history, projectSnapshot, insightsText, context }) {
  const client = new Anthropic();
  const historyText = history.length
    ? history.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n')
    : '(sem turnos anteriores nesta conversa)';
  const chunksText = chunks.length
    ? chunks.map((c) => `[id=${c.id}] (${c.kind}, reunião "${c.meetingTitle}" em ${c.meetingDate || 'sem data'}${c.timeRef ? `, ${c.timeRef}` : ''})\n${c.content}`).join('\n\n---\n\n')
    : '(nenhum trecho relevante foi encontrado na memória de reuniões deste projeto — mas confira o PERFIL DO PROJETO abaixo antes de concluir que não há evidência: perguntas de identidade/cronograma são respondidas por ele, não por trecho de reunião)';
  const meetingContextText = context && context.meetingId
    ? `Reunião aberta agora na tela: id="${context.meetingId}", título="${context.meetingTitle || ''}" — se o usuário pedir pra criar uma pendência sem dizer qual reunião, essa é a escolha mais provável.`
    : 'Nenhuma reunião está aberta na tela agora — se o usuário pedir pra criar uma pendência, escolha a reunião certa entre as listadas em "REUNIÕES DISPONÍVEIS" no perfil do projeto (ex.: pelo que ele descrever, ou a mais recente se ele não especificar e isso fizer sentido) — só pergunte se realmente não der pra decidir com confiança.';
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1500,
    system: [
      'Você é a RENATA — a Inteligência de Execução e Gestão de Projetos da PRICETAX (Reforma, Execução, Negócios, Agilidade, Tecnologia e Ação). Você é irmã da IVANA, a IA tributária da PRICETAX: a IVANA interpreta legislação, Reforma Tributária, IBS/CBS e regras fiscais; você transforma reuniões e decisões em execução real — atividades, responsáveis, prazos, riscos, próximos passos. Seu princípio central: informação relevante vira conhecimento, conhecimento relevante vira decisão, decisão relevante vira ação.',
      'Você tem DUAS fontes de verdade, ambas confiáveis: (1) o PERFIL DO PROJETO — dado estruturado direto do cadastro/cronograma (identidade do cliente, participantes, fases, atividades, reuniões, pendências), sempre atual, pode responder direto com base nele sem citar chunkId; (2) os TRECHOS RECUPERADOS DA MEMÓRIA — texto literal de reuniões, só pode citar como fonte (citedChunkIds) um id que está realmente na lista recebida.',
      'Regra absoluta: nunca invente nome, data, decisão, compromisso, responsável ou fato que não esteja literalmente no PERFIL DO PROJETO ou nos trechos. Se nenhum dos dois sustentar uma resposta com confiança, hasEvidence deve ser false e a resposta deve ser exatamente "Não encontrei evidência suficiente nas reuniões ou documentos deste projeto." — nunca tente adivinhar ou completar a lacuna. Sempre separe fato de interpretação: se algo parece uma atividade mas falta responsável ou prazo explícito nos trechos, diga isso diretamente (ex.: "Identifiquei isso como uma possível atividade, mas a reunião não deixou explícito quem é responsável nem o prazo") em vez de supor um valor.',
      'Interprete a intenção por trás da fala, não só a letra — dentro dos trechos de reunião, frases como "vou verificar" costumam indicar um compromisso assumido, "depende do fornecedor/cliente" indica uma dependência, "não conseguimos fechar porque faltou X" indica um impedimento, "vamos implementar em [data]" pode indicar um marco do projeto. Ao responder, ajude a distinguir isso — não trate toda menção como se fosse uma tarefa formal.',
      'Quando a resposta envolver várias reuniões ou atividades, apresente sempre da mais antiga pra mais atual (nunca por ordem de cadastro) — mas comece a resposta destacando os pontos mais críticos/urgentes/atrasados antes de entrar na lista cronológica, não deixe eles perdidos no meio do texto.',
      'Quando responder com base num trecho de reunião, cite reunião e data pra ajudar o consultor a confiar na resposta (ex.: "Na reunião de 15/08, Rafael comentou que..."). Só inclua em citedChunkIds os ids dos trechos que você realmente usou — nunca cite um trecho pra sustentar um fato que na verdade veio do PERFIL DO PROJETO ou dos APRENDIZADOS ACUMULADOS.',
      'Se o assunto tocar uma questão tributária técnica que exige aprofundamento em legislação/base legal (ex.: interpretação de norma de IBS/CBS, fundamento jurídico), não tente concluir sozinha — sinalize que esse ponto merece uma análise tributária dedicada, o tipo de trabalho que a IVANA faz.',
      'Se o PERFIL DO PROJETO listar participantes "SEM IDENTIFICAÇÃO CLARA" e isso for relevante ou natural no contexto da conversa, aproveite pra perguntar ao usuário quem é essa pessoa (lado PRICETAX ou cliente, e qual área) — no máximo uma pergunta desse tipo por resposta, nunca repita uma pergunta sobre a mesma pessoa se ela já foi respondida antes (confira os APRENDIZADOS ACUMULADOS e a conversa) — quando o usuário responder, registre em learnedFact.',
      'Você também pode propor ações (proposedAction): criar uma pendência numa reunião, ou reagendar uma atividade do cronograma — mas NUNCA executa sozinho, e NUNCA finge que já executou. Sempre descreva a ação proposta na resposta citando o título exato do alvo (reunião ou atividade) e peça confirmação. Se não tiver certeza de qual reunião/atividade o usuário quer dizer, NÃO proponha ainda — faça a pergunta de esclarecimento primeiro (ex.: "Você está falando da atividade \'Split payment e demais operações financeiras\'?"), e só proponha de fato no turno seguinte, depois de confirmado.',
      'Ao reagendar (reschedule_activity), sempre diga na resposta a data antiga e a nova, pra o usuário conseguir validar a mudança de verdade antes de confirmar.',
      'Seja objetiva e executiva: prefira uma resposta curta e direta quando ela resolver, priorizando clareza, ação, contexto e prioridade — evite textão quando não for necessário.',
    ].join(' '),
    messages: [{ role: 'user', content: `Perfil do projeto:\n${projectSnapshot}\n\nAprendizados acumulados em conversas anteriores sobre este projeto:\n${insightsText}\n\n${meetingContextText}\n\nConversa até agora:\n${historyText}\n\nPergunta do usuário: ${question}\n\nTrechos recuperados da memória de reuniões:\n\n${chunksText}` }],
    output_config: { format: zodOutputFormat(SynthesizeAnswerSchema) },
  });
  if (!response.parsed_output) throw new Error('Falha ao gerar a resposta.');
  return { output: response.parsed_output, usage: response.usage };
}

async function getOrCreateConversation(pool, orgId, projectId, userId) {
  await pool.query(
    `INSERT INTO ai_conversations (id, org_id, project_id, user_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [uid('aic'), orgId, projectId, userId],
  );
  const { rows } = await pool.query('SELECT id FROM ai_conversations WHERE project_id=$1 AND user_id=$2', [projectId, userId]);
  return rows[0].id;
}

async function loadRecentHistory(pool, conversationId, limit = 8) {
  const { rows } = await pool.query(
    `SELECT role, content FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit],
  );
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

async function loadInsights(pool, projectId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT content FROM ai_project_insights WHERE project_id=$1 ORDER BY created_at ASC LIMIT $2`,
    [projectId, limit],
  );
  return rows.length ? rows.map((r) => `- ${r.content}`).join('\n') : '(nenhum aprendizado registrado ainda)';
}

async function saveInsight(pool, orgId, projectId, content) {
  const text = (content || '').trim();
  if (!text) return;
  await pool.query(
    `INSERT INTO ai_project_insights (id, org_id, project_id, content) VALUES ($1,$2,$3,$4)`,
    [uid('aii'), orgId, projectId, text.slice(0, 500)],
  );
}

// Função pública — orquestra: carrega conversa → resolve a pergunta →
// busca na memória → sintetiza resposta → valida citações → grava tudo.
// `projectData` é o JSONB completo do projeto (já carregado pela rota, ver
// server/assistant.js) — usado pra montar o PERFIL DO PROJETO
// (server/assistantContext.js), que dá ao assistente acesso direto à
// identidade do cliente e ao cronograma (Resumo/Gantt/Tabela/Fases/
// Quadro são a mesma base de dados), sem depender da memória de reuniões
// pra perguntas que não vêm de reunião nenhuma.
export async function askProjectAssistant({ pool, orgId, projectId, userId, question, context, projectData }) {
  const startedAt = Date.now();
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const history = await loadRecentHistory(pool, conversationId);
  // Nunca deixar um formato de dado inesperado no projeto derrubar a
  // pergunta inteira com um 500 — sem perfil, o assistente ainda responde
  // com base na memória de reuniões, só perde a parte de identidade/
  // cronograma nesta pergunta específica.
  let projectSnapshot;
  try {
    projectSnapshot = buildProjectSnapshot(projectData || {});
  } catch (e) {
    console.error('Assistente do Projeto: falha ao montar o perfil do projeto', e.message);
    projectSnapshot = '(perfil do projeto indisponível no momento)';
  }

  await pool.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1,$2,'user',$3)`,
    [uid('aim'), conversationId, question],
  );

  let resolved, chunks = [], synthesized, errorMsg = null;
  try {
    resolved = await resolveQuery({ question, history, context: context || {}, projectSnapshot });
    // Saudação/conversa geral não passa pelo pipeline de busca+síntese —
    // não é uma pergunta que exige evidência do projeto pra responder.
    if (resolved.output.intent !== 'conversa_geral') {
      const scope = resolved.output;
      const [chunksResult, insightsText] = await Promise.all([
        searchProjectMemory(pool, {
          orgId, projectId,
          query: scope.standaloneQuery,
          participant: scope.participant || undefined,
          meetingId: scope.meetingScope === 'atual' ? (context && context.meetingId) : undefined,
          kind: scope.kind !== 'qualquer' ? scope.kind : undefined,
          limit: 12,
        }),
        loadInsights(pool, projectId),
      ]);
      chunks = chunksResult;
      synthesized = await synthesizeAnswer({ question, chunks, history, projectSnapshot, insightsText, context: context || {} });
      if (synthesized.output.learnedFact) {
        // Falha ao gravar aprendizado não pode derrubar a resposta já
        // pronta pro usuário — só registra o erro, não interrompe o fluxo.
        saveInsight(pool, orgId, projectId, synthesized.output.learnedFact)
          .catch((e) => console.error('Assistente do Projeto: falha ao gravar aprendizado', e.message));
      }
    }
  } catch (e) {
    errorMsg = e.message || 'Erro desconhecido';
  }

  const latencyMs = Date.now() - startedAt;
  let answerText, citedSources = [], hasEvidence = null, model = 'claude-opus-5', proposedAction = null;
  let tokensInput = 0, tokensOutput = 0;

  if (errorMsg) {
    answerText = 'Não consegui processar essa pergunta agora. Tente de novo em alguns instantes.';
    hasEvidence = false;
  } else if (resolved.output.intent === 'conversa_geral') {
    answerText = resolved.output.directReply || 'Olá! Sou a RENATA, a assistente de execução e gestão de projetos da PRICETAX. Pode perguntar qualquer coisa sobre o histórico deste projeto — reuniões, decisões, atividades — que eu respondo sempre citando a fonte.';
    tokensInput = (resolved.usage && resolved.usage.input_tokens) || 0;
    tokensOutput = (resolved.usage && resolved.usage.output_tokens) || 0;
  } else {
    const validIds = new Set(chunks.map((c) => c.id));
    // Anti-alucinação por validação, não só por instrução de prompt:
    // qualquer id citado que não estava de fato entre os trechos
    // recuperados nesta pergunta é descartado (sem derrubar a
    // resposta) e a anomalia fica registrada no log do servidor.
    const cited = (synthesized.output.citedChunkIds || []).filter((id) => {
      const ok = validIds.has(id);
      if (!ok) console.error(`Assistente do Projeto: citou chunkId inexistente na recuperação (${id}) — descartado.`);
      return ok;
    });
    const byId = new Map(chunks.map((c) => [c.id, c]));
    citedSources = cited.map((id) => {
      const c = byId.get(id);
      return { chunkId: c.id, meetingId: c.meetingId, meetingTitle: c.meetingTitle, meetingDate: c.meetingDate, timeRef: c.timeRef, kind: c.kind, sourceRef: c.sourceRef };
    });
    answerText = synthesized.output.answer;
    hasEvidence = !!synthesized.output.hasEvidence;
    tokensInput = (resolved.usage && resolved.usage.input_tokens || 0) + (synthesized.usage && synthesized.usage.input_tokens || 0);
    tokensOutput = (resolved.usage && resolved.usage.output_tokens || 0) + (synthesized.usage && synthesized.usage.output_tokens || 0);

    // Agente executor — mesma defesa em profundidade das citações: a IA só
    // PROPÕE, e mesmo a proposta é revalidada aqui contra o projeto de
    // verdade (nunca confiar cegamente no id que ela devolveu) antes de
    // deixar o usuário confirmar. De quebra, os títulos exibidos no card de
    // confirmação (meetingTitle/activityTitle/currentDate) vêm do servidor,
    // não do que a IA disse — não dá pra ela "inventar" um nome bonito pra
    // um id que não bate com o alvo de verdade.
    const rawAction = synthesized.output.proposedAction;
    if (rawAction && rawAction.type === 'create_meeting_todo') {
      const targetMeeting = (projectData && projectData.meetings || []).find((m) => m.id === rawAction.meetingId && !m.deleted);
      if (targetMeeting) {
        proposedAction = { ...rawAction, meetingTitle: targetMeeting.title || 'Reunião sem título' };
      } else {
        console.error('Assistente do Projeto: propôs create_meeting_todo com meetingId inexistente — descartada.', rawAction);
      }
    } else if (rawAction && rawAction.type === 'reschedule_activity') {
      const targetActivity = (projectData && projectData.activities || []).find((a) => a.id === rawAction.activityId && !a.deleted);
      if (targetActivity) {
        proposedAction = { ...rawAction, activityTitle: targetActivity.title || 'Atividade sem título', currentDate: targetActivity.date || '' };
      } else {
        console.error('Assistente do Projeto: propôs reschedule_activity com activityId inexistente — descartada.', rawAction);
      }
    }
  }

  const assistantMessageId = uid('aim');
  await pool.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content, sources, has_evidence, scope, model, tokens_input, tokens_output, latency_ms, error, proposed_action, action_status)
     VALUES ($1,$2,'assistant',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      assistantMessageId, conversationId, answerText, JSON.stringify(citedSources), hasEvidence,
      JSON.stringify({ view: context && context.view, meetingId: context && context.meetingId, standaloneQuery: resolved && resolved.output.standaloneQuery }),
      model, tokensInput, tokensOutput, latencyMs, errorMsg,
      proposedAction ? JSON.stringify(proposedAction) : null, proposedAction ? 'pending' : null,
    ],
  );
  await pool.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1', [conversationId]);

  return {
    id: assistantMessageId, role: 'assistant', content: answerText, sources: citedSources, hasEvidence,
    proposedAction, actionStatus: proposedAction ? 'pending' : null, createdAt: new Date().toISOString(),
  };
}

// Confirma ou rejeita uma ação proposta pela IA numa mensagem específica.
// Só executa de verdade em `decision==='confirm'` — chamado a partir de
// POST /api/assistant/messages/:id/action (server/assistant.js), sempre
// depois de um clique explícito do usuário no painel.
export async function decideProposedAction(pool, orgId, projectId, userId, messageId, decision, actingUserName) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const { rows } = await pool.query(
    'SELECT proposed_action, action_status FROM ai_messages WHERE id=$1 AND conversation_id=$2',
    [messageId, conversationId],
  );
  if (!rows[0]) throw new Error('Mensagem não encontrada.');
  if (rows[0].action_status !== 'pending') throw new Error('Essa ação já foi decidida antes.');

  if (decision === 'reject') {
    await pool.query(`UPDATE ai_messages SET action_status='rejected' WHERE id=$1`, [messageId]);
    return { actionStatus: 'rejected' };
  }
  const result = await executeProposedAction(pool, orgId, projectId, rows[0].proposed_action, actingUserName);
  await pool.query(`UPDATE ai_messages SET action_status='executed' WHERE id=$1`, [messageId]);
  return { actionStatus: 'executed', result };
}

export async function getConversationMessages(pool, orgId, projectId, userId) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const { rows } = await pool.query(
    `SELECT id, role, content, sources, has_evidence, feedback, proposed_action, action_status, created_at FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at ASC`,
    [conversationId],
  );
  return rows.map((r) => ({
    id: r.id, role: r.role, content: r.content, sources: r.sources || [], hasEvidence: r.has_evidence, feedback: r.feedback,
    proposedAction: r.proposed_action || null, actionStatus: r.action_status, createdAt: r.created_at,
  }));
}

export async function clearConversation(pool, orgId, projectId, userId) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  await pool.query('DELETE FROM ai_messages WHERE conversation_id=$1', [conversationId]);
}

export async function setMessageFeedback(pool, orgId, projectId, userId, messageId, feedback) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  await pool.query('UPDATE ai_messages SET feedback=$1 WHERE id=$2 AND conversation_id=$3', [feedback, messageId, conversationId]);
}
