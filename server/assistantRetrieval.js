// Assistente do Projeto (2026-09, Fase 2 do Assistente Inteligente de
// Projetos) — pipeline de 2 chamadas à IA em cima da memória já
// construída na Fase 1 (server/memoryRetrieval.js): (1) resolve a
// pergunta do usuário — puxando pronomes/referências do turno anterior
// ("esse assunto") — numa busca concreta; (2) recebe os trechos
// recuperados e produz a resposta final, só podendo citar como fonte um
// trecho que realmente foi recuperado (validado depois pelo backend,
// não só por instrução de prompt — ver `askProjectAssistant`). Mesmo
// padrão de saída estruturada garantida já usado em
// server/meetingInbox.js (`client.messages.parse` + Zod).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { searchProjectMemory } from './memoryRetrieval.js';

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

const SynthesizeAnswerSchema = z.object({
  answer: z.string().describe('A resposta final em português, clara e direta, para o usuário. Se hasEvidence for false, esta deve ser literalmente "Não encontrei evidência suficiente nas reuniões ou documentos deste projeto."'),
  citedChunkIds: z.array(z.string()).describe('IDs (campo "id" de cada trecho recebido) dos trechos que sustentam de fato a resposta — só inclua um id se ele realmente contém a informação usada na resposta. Vazio se hasEvidence for false.'),
  hasEvidence: z.boolean().describe('true se os trechos recebidos sustentam a resposta; false se não há evidência suficiente nos trechos pra responder com confiança — nesse caso NUNCA invente, admita explicitamente que não encontrou.'),
});

async function resolveQuery({ question, history, context }) {
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
      'Você prepara o processamento de uma mensagem enviada ao "Assistente do Projeto" da PRICETAX por um consultor interno.',
      'Primeiro classifique a intenção: se for só uma saudação, agradecimento, ou pergunta sobre o que você mesmo faz — não é uma pergunta sobre o projeto — marque intent="conversa_geral" e escreva você mesmo uma resposta curta e calorosa em directReply (pode mencionar que responde com base nas reuniões/decisões/atividades deste projeto, sempre citando a fonte).',
      'Se for uma pergunta real sobre o histórico do projeto, marque intent="pergunta_sobre_projeto" e reformule como uma busca autossuficiente, resolvendo qualquer referência ao que foi dito antes na conversa — nunca responda a pergunta em si nesse caso, isso é feito depois por outra etapa.',
    ].join(' '),
    messages: [{ role: 'user', content: `Contexto: ${contextText}\n\nConversa até agora:\n${historyText}\n\nNova mensagem do usuário: ${question}` }],
    output_config: { format: zodOutputFormat(ResolveQuerySchema) },
  });
  if (!response.parsed_output) throw new Error('Falha ao interpretar a pergunta.');
  return { output: response.parsed_output, usage: response.usage };
}

async function synthesizeAnswer({ question, chunks, history }) {
  const client = new Anthropic();
  const historyText = history.length
    ? history.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n')
    : '(sem turnos anteriores nesta conversa)';
  const chunksText = chunks.length
    ? chunks.map((c) => `[id=${c.id}] (${c.kind}, reunião "${c.meetingTitle}" em ${c.meetingDate || 'sem data'}${c.timeRef ? `, ${c.timeRef}` : ''})\n${c.content}`).join('\n\n---\n\n')
    : '(nenhum trecho relevante foi encontrado na memória deste projeto)';
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1500,
    system: [
      'Você é o "Assistente do Projeto" da PRICETAX — um especialista que acompanhou de perto todas as reuniões deste projeto de consultoria tributária, e responde consultores internos sobre o histórico dele.',
      'Regra absoluta: só responda com base nos trechos fornecidos abaixo. Nunca invente nome, data, decisão, compromisso ou fato que não esteja literalmente presente nos trechos.',
      'Se os trechos não sustentarem uma resposta com confiança, hasEvidence deve ser false e a resposta deve ser exatamente "Não encontrei evidência suficiente nas reuniões ou documentos deste projeto." — nunca tente adivinhar ou completar a lacuna.',
      'Quando responder com base nos trechos, seja direto e cite reunião e data quando isso ajudar o consultor a confiar na resposta (ex.: "Na reunião de 15/08, Rafael comentou que...").',
      'Só inclua em citedChunkIds os ids dos trechos que você realmente usou.',
    ].join(' '),
    messages: [{ role: 'user', content: `Conversa até agora:\n${historyText}\n\nPergunta do usuário: ${question}\n\nTrechos recuperados da memória do projeto:\n\n${chunksText}` }],
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

// Função pública — orquestra: carrega conversa → resolve a pergunta →
// busca na memória → sintetiza resposta → valida citações → grava tudo.
export async function askProjectAssistant({ pool, orgId, projectId, userId, question, context }) {
  const startedAt = Date.now();
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const history = await loadRecentHistory(pool, conversationId);

  await pool.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1,$2,'user',$3)`,
    [uid('aim'), conversationId, question],
  );

  let resolved, chunks = [], synthesized, errorMsg = null;
  try {
    resolved = await resolveQuery({ question, history, context: context || {} });
    // Saudação/conversa geral não passa pelo pipeline de busca+síntese —
    // não é uma pergunta que exige evidência do projeto pra responder.
    if (resolved.output.intent !== 'conversa_geral') {
      const scope = resolved.output;
      chunks = await searchProjectMemory(pool, {
        orgId, projectId,
        query: scope.standaloneQuery,
        participant: scope.participant || undefined,
        meetingId: scope.meetingScope === 'atual' ? (context && context.meetingId) : undefined,
        kind: scope.kind !== 'qualquer' ? scope.kind : undefined,
        limit: 12,
      });
      synthesized = await synthesizeAnswer({ question, chunks, history });
    }
  } catch (e) {
    errorMsg = e.message || 'Erro desconhecido';
  }

  const latencyMs = Date.now() - startedAt;
  let answerText, citedSources = [], hasEvidence = null, model = 'claude-opus-5';
  let tokensInput = 0, tokensOutput = 0;

  if (errorMsg) {
    answerText = 'Não consegui processar essa pergunta agora. Tente de novo em alguns instantes.';
    hasEvidence = false;
  } else if (resolved.output.intent === 'conversa_geral') {
    answerText = resolved.output.directReply || 'Olá! Pode perguntar qualquer coisa sobre o histórico deste projeto — reuniões, decisões, atividades — que eu respondo sempre citando a fonte.';
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
  }

  const assistantMessageId = uid('aim');
  await pool.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content, sources, has_evidence, scope, model, tokens_input, tokens_output, latency_ms, error)
     VALUES ($1,$2,'assistant',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      assistantMessageId, conversationId, answerText, JSON.stringify(citedSources), hasEvidence,
      JSON.stringify({ view: context && context.view, meetingId: context && context.meetingId, standaloneQuery: resolved && resolved.output.standaloneQuery }),
      model, tokensInput, tokensOutput, latencyMs, errorMsg,
    ],
  );
  await pool.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1', [conversationId]);

  return { id: assistantMessageId, role: 'assistant', content: answerText, sources: citedSources, hasEvidence, createdAt: new Date().toISOString() };
}

export async function getConversationMessages(pool, orgId, projectId, userId) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const { rows } = await pool.query(
    `SELECT id, role, content, sources, has_evidence, feedback, created_at FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at ASC`,
    [conversationId],
  );
  return rows.map((r) => ({
    id: r.id, role: r.role, content: r.content, sources: r.sources || [], hasEvidence: r.has_evidence, feedback: r.feedback, createdAt: r.created_at,
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
