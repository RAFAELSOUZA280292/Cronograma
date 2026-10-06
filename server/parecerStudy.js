// RENATA estuda os Pareceres PRICETAX (2026-10-04, pedido do Rafael) — ver PROJECT_CONTEXT.md §70.
// Três peças:
//   1) ESTUDO: cada parecer (PDF) é lido UMA vez pelo modelo, que devolve um estudo estruturado
//      (resumo, conclusões, orientações ao cliente, onde usar). Guardado em `parecer_studies` com o
//      hash do arquivo — parecer já estudado e sem mudança NUNCA volta a chamar a IA. É por isso que
//      apertar o botão sem parecer novo não gasta nada (a checagem é só SQL).
//   2) MEMÓRIA: cada estudo vira UM fato de conhecimento da organização (`ai_knowledge_facts`, origem
//      'internal_document') — é assim que o chat da RENATA passa a usar o que foi aprendido, que a
//      Central de Conhecimento mostra e que "onde isso pode ser usado" fica registrado.
//   3) SUGESTÃO NA REUNIÃO: depois que uma reunião é registrada, a RENATA cruza o que foi tratado
//      com os estudos e mostra, numa caixa, "existe o Parecer X sobre esse tema; aconselhe o cliente
//      a ...". Sem nenhum estudo, não chama a IA.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { embedTexts } from './embeddings.js';
import { logMetric } from './metrics.js';
import { parecerUsableFor, loadProjectIdentity } from './parecerScope.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }
const sha1 = (s) => crypto.createHash('sha1').update(String(s || '')).digest('hex');
const clip = (s, n) => {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const STUDY_MODEL = 'claude-sonnet-5';
export const ADVICE_MODEL = 'claude-sonnet-5';
export const STALE_STUDY_MS = 30 * 60 * 1000;
const running = new Set();
const generatingAdvice = new Set();

export const ParecerStudySchema = z.object({
  number: z.string().describe('Número do parecer como aparece no documento (ex.: "26/2026"); "" se o documento não tiver número.'),
  subject: z.string().describe('Assunto central do parecer em até 12 palavras.'),
  executiveSummary: z.string().describe('Resumo em 3 a 5 frases: a pergunta que o parecer responde, a conclusão e por que importa para o cliente. Só o que o documento afirma.'),
  keyConclusions: z.array(z.string()).describe('De 3 a 8 conclusões do parecer, cada uma uma frase clara e autossuficiente.'),
  recommendations: z.array(z.object({
    situation: z.string().describe('Em que situação do cliente esta orientação vale (ex.: "Quando o cliente paga fornecedores por split payment").'),
    advice: z.string().describe('O que a PRICETAX aconselha o cliente a fazer, concreto e acionável, conforme o parecer.'),
    caveat: z.string().describe('Condição, ressalva ou risco apontado pelo parecer para essa orientação; "" se não houver.'),
  })).describe('De 2 a 8 orientações práticas que o parecer permite dar a um cliente. Só orientações que o documento sustenta.'),
  themes: z.array(z.string()).describe('De 5 a 12 temas/palavras-chave (tributos, institutos, normas, setores) pelos quais este parecer deve ser encontrado.'),
  appliesTo: z.string().describe('Perfil de cliente e situações em que este parecer deve ser usado, em 1 a 3 frases.'),
  usageTriggers: z.array(z.string()).describe('De 3 a 8 sinais que, numa reunião ou conversa, indicam que este parecer é relevante (ex.: "cliente menciona pagamento por split", "dúvida sobre alíquota de referência da CBS").'),
  legalBasis: z.array(z.string()).describe('Normas e artigos que o parecer cita como base (ex.: "LC 214/2025, art. 47"); lista vazia se não citar.'),
  limits: z.string().describe('O que o parecer NÃO cobre, premissas em que se apoia e o que pode mudar; "" se o documento não disser.'),
});

const STUDY_SYSTEM = [
  'Você é a RENATA, assistente da consultoria PRICETAX, estudando um parecer técnico de reforma tributária escrito pela própria PRICETAX.',
  'Leia o documento inteiro e extraia o conhecimento para uso futuro: o que o parecer conclui, o que aconselhar a um cliente e em que situações usá-lo.',
  'Regras: (1) use SOMENTE o que está no documento — não complete com conhecimento próprio, não invente artigos, números ou prazos; (2) se o documento não indica algo, deixe o campo vazio em vez de supor; (3) orientações precisam ser acionáveis (o que o cliente deve fazer), não resumo do texto; (4) escreva em português do Brasil, direto, sem rodeios.',
].join('\n');

const AdviceSchema = z.object({
  items: z.array(z.object({
    parecerId: z.string().describe('O id exato do parecer, como aparece em "id=..." na lista.'),
    topic: z.string().describe('O tema da reunião ao qual o parecer se aplica, curto (ex.: "Split Payment").'),
    relevance: z.string().describe('1 a 2 frases: por que esta reunião toca o parecer, apontando o ponto da reunião.'),
    steps: z.array(z.string()).describe('De 2 a 4 caminhos concretos para seguir com o cliente, baseados SOMENTE no que o estudo do parecer registra.'),
    caution: z.string().describe('Ressalva importante do parecer para esse caso; "" se não houver.'),
  })).describe('De 0 a 3 itens. Vazio quando nenhum parecer for claramente relevante para esta reunião — não force.'),
});

const ADVICE_SYSTEM = [
  'Você é a RENATA, assistente da consultoria PRICETAX. Acabou de registrar uma reunião e vai ajudar o consultor a decidir os próximos passos com o cliente usando os pareceres que a própria PRICETAX já escreveu e que você estudou.',
  'Receba o resumo da reunião e a lista de pareceres estudados. Indique um parecer só quando a reunião realmente trata do tema dele; se nenhum se aplica, devolva a lista vazia.',
  'Para cada parecer indicado, diga os caminhos a seguir com o cliente usando APENAS as orientações e conclusões registradas no estudo — nunca crie orientação nova, nunca cite norma que não esteja no estudo. Seja concreto e curto.',
].join('\n');

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      if (!/overloaded|rate_limit|^429\b|^(529|503|502)\b|timed? ?out|ECONNRESET|ETIMEDOUT|fetch failed|Connection error/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function friendlyStudyError(raw) {
  const msg = String(raw || '');
  if (/credit balance is too low/i.test(msg)) return 'Sem créditos na conta da Anthropic — recarregue em Plans & Billing (console.anthropic.com) e tente de novo.';
  if (/invalid x-api-key|authentication_error|^401\b/i.test(msg)) return 'A chave da API da Anthropic (ANTHROPIC_API_KEY) é inválida ou foi revogada — confira no Railway.';
  if (/rate_limit|^429\b/i.test(msg)) return 'Limite de uso da API da Anthropic atingido agora — aguarde um minuto e tente de novo.';
  if (/overloaded|^(529|503)\b/i.test(msg)) return 'A IA está sobrecarregada no momento — tente de novo em alguns minutos.';
  if (/max_tokens|Unterminated|cortada/i.test(msg)) return 'A IA não conseguiu terminar o estudo deste parecer (resposta cortada). Tente de novo.';
  if (/could not process pdf|invalid pdf|pdf/i.test(msg)) return 'A IA não conseguiu ler este PDF (pode estar protegido ou corrompido).';
  return clip(msg, 300) || 'Falha desconhecida ao estudar o parecer.';
}

const isFatalForBatch = (msg) => /credit balance is too low|invalid x-api-key|authentication_error|^401\b/i.test(String(msg || ''));

export async function studyOne(client, parecer, buffer) {
  const response = await withRetry(() => client.messages.parse({
    model: STUDY_MODEL,
    max_tokens: 6000,
    system: [{ type: 'text', text: STUDY_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: `Estude este parecer. Identificação dele no sistema: "${parecer.title}". Devolva o estudo estruturado.` },
      ],
    }],
    output_config: { format: zodOutputFormat(ParecerStudySchema) },
  }));
  if (response.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho (max_tokens).');
  if (!response.parsed_output) throw new Error('A IA não conseguiu estruturar o estudo deste parecer.');
  return { study: response.parsed_output, usage: response.usage };
}

function labelOf(parecer, study) {
  const number = study && study.number ? `Nº ${study.number}` : '';
  return number || parecer.title;
}

export function factContentOf(parecer, study) {
  const recs = (study.recommendations || []).slice(0, 3)
    .map((r) => `${r.situation ? `${clip(r.situation, 140)} → ` : ''}${clip(r.advice, 220)}`).join(' | ');
  const parts = [
    `Parecer PRICETAX ${labelOf(parecer, study)} — "${clip(study.subject || parecer.title, 120)}". ${clip(study.executiveSummary, 520)}`,
    study.appliesTo ? `Usar quando: ${clip(study.appliesTo, 260)}` : '',
    recs ? `Orientação ao cliente: ${recs}` : '',
    (study.themes || []).length ? `Temas: ${study.themes.slice(0, 10).join(', ')}.` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

async function registerFact(pool, { orgId, userId, parecer, study, previousFactId }) {
  const content = factContentOf(parecer, study);
  let embedding = null;
  try { [embedding] = await embedTexts([content], 'document'); } catch (e) {
    console.error('Pareceres: falha ao embedar o fato do parecer — seguindo sem embedding.', e.message);
  }
  const id = uid('akf');
  await pool.query(
    `INSERT INTO ai_knowledge_facts
      (id, org_id, project_id, scope, subject, content, status, knowledge_type, source_user_id, embedding, origin, reference, source_date)
     VALUES ($1,$2,NULL,'org',$3,$4,'active','RULE',$5,$6,'internal_document',$7,$8)`,
    [
      id, orgId, `Parecer PRICETAX ${labelOf(parecer, study)}`, content, userId || null,
      embedding ? JSON.stringify(embedding) : null, `Parecer PRICETAX: ${parecer.title}`.slice(0, 300),
      parecer.created_at ? new Date(parecer.created_at).toISOString().slice(0, 10) : null,
    ],
  );
  if (previousFactId) {
    await pool.query(
      `UPDATE ai_knowledge_facts SET status='superseded', superseded_by=$1, valid_until=CURRENT_DATE, updated_at=now() WHERE id=$2 AND status NOT IN ('archived','superseded')`,
      [id, previousFactId],
    );
  }
  return id;
}

export async function archiveParecerFacts(pool, parecerId) {
  await pool.query(
    `UPDATE ai_knowledge_facts SET status='archived', updated_at=now()
     WHERE id IN (SELECT fact_id FROM parecer_studies WHERE parecer_id=$1 AND fact_id IS NOT NULL) AND status <> 'archived'`,
    [parecerId],
  );
}

const HASH_SQL = `encode(sha256(p.file_data), 'hex')`;

async function computeStudyState(pool, orgId, identity) {
  // Estudo "em andamento" sem job vivo neste processo = órfão (o servidor reiniciou/deploy no meio): vira falha
  // em 1 min em vez de prender o botão por 30. O 1 min cobre a janela entre marcar `running` e o job entrar em
  // `running` (Set). Mesmo com job vivo, passar de 30 min é travado.
  await pool.query(
    `UPDATE parecer_studies SET status='failed', error='Estudo interrompido (o servidor reiniciou durante o estudo). Aperte o botão de novo — o que já foi estudado não é refeito.'
     WHERE org_id=$1 AND status='running' AND NOT $2::boolean AND started_at < now() - interval '1 minute'`,
    [orgId, running.has(orgId)],
  );
  await pool.query(
    `UPDATE parecer_studies SET status='failed', error='Estudo interrompido (demorou demais). Tente de novo.'
     WHERE org_id=$1 AND status='running' AND started_at < now() - ($2::int * interval '1 millisecond')`,
    [orgId, STALE_STUDY_MS],
  );
  const { rows } = await pool.query(
    `SELECT p.id, p.title, p.scope, p.company_name, p.company_project_id, p.created_at, ${HASH_SQL} AS hash,
            s.status AS study_status, s.file_hash AS study_hash, s.study, s.error, s.studied_at
     FROM pareceres p LEFT JOIN parecer_studies s ON s.parecer_id = p.id
     WHERE p.org_id = $1 ORDER BY p.created_at DESC`,
    [orgId],
  );
  const all = rows.map((r) => {
    const current = r.study_status === 'done' && r.study_hash === r.hash;
    const state = r.study_status === 'running' ? 'running'
      : current ? 'done'
        : r.study_status === 'failed' ? 'failed'
          : r.study_status === 'done' ? 'changed' : 'new';
    return {
      usableHere: parecerUsableFor(r, identity),
      id: r.id, title: r.title, scope: r.scope, companyName: r.company_name, state,
      error: state === 'failed' ? r.error : '', studiedAt: r.studied_at ? r.studied_at.toISOString() : null,
      study: r.study && (state === 'done' || state === 'changed') ? {
        number: r.study.number, subject: r.study.subject, summary: r.study.executiveSummary, appliesTo: r.study.appliesTo,
        themes: r.study.themes || [], triggers: r.study.usageTriggers || [], conclusions: r.study.keyConclusions || [],
        recommendations: r.study.recommendations || [], legalBasis: r.study.legalBasis || [], limits: r.study.limits || '',
      } : null,
    };
  });
  const count = (st) => all.filter((i) => i.state === st).length;
  // Parecer de OUTRO cliente: o estudo continua valendo (a RENATA estuda tudo), mas nada dele — título,
  // cliente, conteúdo — chega à tela de quem está em outra empresa; só entra uma contagem.
  const items = all.filter((i) => i.usableHere);
  const hidden = all.filter((i) => !i.usableHere);
  return {
    total: all.length, studied: count('done'),
    pending: all.filter((i) => ['new', 'changed', 'failed'].includes(i.state)).length,
    running: count('running'), jobRunning: running.has(orgId),
    items: items.map(({ usableHere, ...rest }) => rest),
    others: { count: hidden.length, studied: hidden.filter((i) => i.state === 'done').length },
    allItems: all,
  };
}

// Visão por empresa — é o que a API devolve; `allItems` (com os pareceres de outros clientes) nunca sai daqui.
export async function getStudyState(pool, orgId, projectId) {
  const identity = await loadProjectIdentity(pool, projectId);
  const { allItems, ...visible } = await computeStudyState(pool, orgId, identity);
  return visible;
}

async function runStudyJob({ pool, client, orgId, userId, ids }) {
  running.add(orgId);
  try {
    for (const id of ids) {
      const { rows } = await pool.query(
        `SELECT p.id, p.title, p.file_data, p.created_at, ${HASH_SQL} AS hash, s.fact_id AS previous_fact_id
         FROM pareceres p LEFT JOIN parecer_studies s ON s.parecer_id = p.id WHERE p.id=$1 AND p.org_id=$2`,
        [id, orgId],
      );
      const parecer = rows[0];
      if (!parecer) continue;
      try {
        const { study, usage } = await studyOne(client, parecer, parecer.file_data);
        const factId = await registerFact(pool, { orgId, userId, parecer, study, previousFactId: parecer.previous_fact_id });
        await pool.query(
          `UPDATE parecer_studies SET status='done', study=$2, fact_id=$3, model=$4, error='', file_hash=$5, studied_at=now() WHERE parecer_id=$1`,
          [id, JSON.stringify(study), factId, STUDY_MODEL, parecer.hash],
        );
        logMetric(pool, {
          orgId, projectId: null, eventType: 'anthropic_api_call',
          metadata: {
            feature: 'parecer_study', model: STUDY_MODEL,
            inputTokens: (usage && usage.input_tokens) || 0, outputTokens: (usage && usage.output_tokens) || 0,
            cacheReadTokens: (usage && usage.cache_read_input_tokens) || 0, cacheCreationTokens: (usage && usage.cache_creation_input_tokens) || 0,
          },
        }).catch(() => {});
      } catch (e) {
        console.error('Pareceres: falha ao estudar parecer', id, e.message);
        await pool.query(`UPDATE parecer_studies SET status='failed', error=$2 WHERE parecer_id=$1`, [id, friendlyStudyError(e.message)]).catch(() => {});
        if (isFatalForBatch(e.message)) {
          await pool.query(
            `UPDATE parecer_studies SET status='failed', error=$2 WHERE org_id=$1 AND status='running'`,
            [orgId, friendlyStudyError(e.message)],
          ).catch(() => {});
          break;
        }
      }
    }
  } finally {
    running.delete(orgId);
    // Parecer enviado enquanto este estudo rodava: pega agora, sem esperar alguém clicar.
    if (autoFollowUp.delete(orgId)) autoStudy({ pool, orgId, userId, client }).catch(() => {});
  }
}

const autoFollowUp = new Set();

// Estudo automático ao enviar um parecer (2026-10-06, decisão do Rafael: a memória da RENATA tem que estar sempre em dia).
// Roda em segundo plano, nunca atrasa nem derruba o envio do PDF; sem chave de IA, não faz nada (o aviso na tela de Pareceres
// continua mostrando o parecer como "aguardando"). Se já há um estudo em andamento, marca para repetir quando ele terminar.
export async function autoStudy({ pool, orgId, userId, client }) {
  if (!client && !process.env.ANTHROPIC_API_KEY) return { skipped: 'sem chave de IA' };
  const r = await startStudy({ pool, orgId, userId, client, states: ['new', 'changed'] });
  if (r.running) autoFollowUp.add(orgId);
  return r;
}

// `states`: quais situações entram no estudo (padrão: novos, alterados e os que falharam — o botão manual). O disparo automático
// ao enviar um PDF usa só 'new'/'changed' (não reprocessa em loop um parecer que já falhou).
export async function startStudy({ pool, orgId, userId, client, awaitJob = false, states = ['new', 'changed', 'failed'] }) {
  const state = await computeStudyState(pool, orgId, null);
  if (state.jobRunning || state.running > 0) return { running: true, ...summaryOf(state) };
  const todo = state.allItems.filter((i) => states.includes(i.state));
  if (!todo.length) return { upToDate: true, ...summaryOf(state) };
  const aiClient = client || (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null);
  if (!aiClient) return { noKey: true, ...summaryOf(state) };
  for (const it of todo) {
    await pool.query(
      `INSERT INTO parecer_studies (parecer_id, org_id, status, started_at, error)
       VALUES ($1,$2,'running', now(), '')
       ON CONFLICT (parecer_id) DO UPDATE SET status='running', started_at=now(), error=''`,
      [it.id, orgId],
    );
  }
  const job = runStudyJob({ pool, client: aiClient, orgId, userId, ids: todo.map((i) => i.id) })
    .catch((e) => console.error('Pareceres: job de estudo abortou', e));
  if (awaitJob) await job;
  return { started: true, count: todo.length, ...summaryOf(state) };
}

function summaryOf(state) {
  return { total: state.total, studied: state.studied, pending: state.pending };
}

// ---------------------------------------------------------------------------------------------
// Sugestão na reunião
// ---------------------------------------------------------------------------------------------

async function loadDoneStudies(pool, orgId, identity) {
  const { rows } = await pool.query(
    `SELECT p.id, p.title, p.scope, p.company_name, p.company_project_id, s.study, s.file_hash
     FROM parecer_studies s JOIN pareceres p ON p.id = s.parecer_id
     WHERE s.org_id=$1 AND s.status='done' AND s.study IS NOT NULL ORDER BY p.created_at DESC`,
    [orgId],
  );
  return rows.filter((r) => parecerUsableFor(r, identity));
}

const signatureOf = (studies) => sha1(studies.map((s) => `${s.id}:${s.file_hash}`).sort().join('|'));

function meetingDigest(meeting) {
  const items = (meeting.actionItems || []).filter((a) => !a.deleted)
    .map((a) => `- ${clip(a.title, 200)}${a.responsible ? ` (${a.responsible})` : ''}`).join('\n');
  const topics = (meeting.topics || []).map((t) => t.title).filter(Boolean).join('; ');
  return [
    `Reunião: ${meeting.title || 'sem título'}`,
    topics ? `Tópicos: ${clip(topics, 600)}` : '',
    meeting.summary ? `Resumo:\n${clip(meeting.summary, 4000)}` : '',
    meeting.decisions ? `Decisões:\n${clip(meeting.decisions, 2000)}` : '',
    items ? `Próximos passos / atividades:\n${clip(items, 2500)}` : '',
  ].filter(Boolean).join('\n\n');
}

function studyIndexLine(s) {
  const st = s.study;
  const recs = (st.recommendations || []).slice(0, 5)
    .map((r) => `${clip(r.situation, 120)} => ${clip(r.advice, 200)}${r.caveat ? ` (ressalva: ${clip(r.caveat, 120)})` : ''}`).join(' || ');
  return [
    `[id=${s.id}] ${s.title}`,
    `  assunto: ${clip(st.subject, 140)} | temas: ${(st.themes || []).slice(0, 10).join(', ')}`,
    `  usar quando: ${clip(st.appliesTo, 240)} | sinais: ${(st.usageTriggers || []).slice(0, 6).join('; ')}`,
    `  conclusões: ${(st.keyConclusions || []).slice(0, 4).map((c) => clip(c, 200)).join(' | ')}`,
    `  orientações: ${recs}`,
  ].join('\n');
}

export async function generateMeetingAdvice({ pool, orgId, projectId, meeting, client }) {
  const key = `${projectId}:${meeting.id}`;
  if (generatingAdvice.has(key)) return null;
  const identity = await loadProjectIdentity(pool, projectId);
  const studies = await loadDoneStudies(pool, orgId, identity);
  if (!studies.length) return null;
  const aiClient = client || (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null);
  if (!aiClient) return null;
  generatingAdvice.add(key);
  try {
    return await buildAdvice({ pool, orgId, projectId, meeting, studies, aiClient });
  } finally {
    generatingAdvice.delete(key);
  }
}

async function buildAdvice({ pool, orgId, projectId, meeting, studies, aiClient }) {
  const response = await withRetry(() => aiClient.messages.parse({
    model: ADVICE_MODEL,
    max_tokens: 3500,
    system: [{ type: 'text', text: ADVICE_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: `PARECERES ESTUDADOS:\n${studies.map(studyIndexLine).join('\n\n')}\n\n---\n\n${meetingDigest(meeting)}\n\nIndique, se houver, os pareceres que se aplicam a esta reunião e os caminhos a seguir com o cliente.` }],
    output_config: { format: zodOutputFormat(AdviceSchema) },
  }));
  if (response.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho (max_tokens).');
  if (!response.parsed_output) throw new Error('A IA não conseguiu estruturar as sugestões.');
  const byId = new Map(studies.map((s) => [s.id, s]));
  const items = (response.parsed_output.items || [])
    .filter((it) => byId.has(it.parecerId) && Array.isArray(it.steps) && it.steps.some((x) => String(x).trim()))
    .slice(0, 3)
    .map((it) => {
      const s = byId.get(it.parecerId);
      return {
        parecerId: it.parecerId, parecerTitle: s.title, number: s.study.number || '',
        topic: clip(it.topic, 120), relevance: clip(it.relevance, 400),
        steps: it.steps.map((x) => clip(x, 400)).filter(Boolean).slice(0, 4), caution: clip(it.caution, 400),
      };
    });
  const signature = signatureOf(studies);
  await pool.query(
    `INSERT INTO meeting_parecer_advice (project_id, meeting_id, org_id, advice, signature, generated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (project_id, meeting_id) DO UPDATE SET advice=$4, signature=$5, generated_at=now(), org_id=$3`,
    [projectId, meeting.id, orgId, JSON.stringify({ items }), signature],
  );
  logMetric(pool, {
    orgId, projectId, eventType: 'anthropic_api_call',
    metadata: {
      feature: 'parecer_advice', model: ADVICE_MODEL,
      inputTokens: (response.usage && response.usage.input_tokens) || 0, outputTokens: (response.usage && response.usage.output_tokens) || 0,
      cacheReadTokens: (response.usage && response.usage.cache_read_input_tokens) || 0, cacheCreationTokens: (response.usage && response.usage.cache_creation_input_tokens) || 0,
    },
  }).catch(() => {});
  return { items, signature };
}

export async function getMeetingAdvice(pool, orgId, projectId, meetingId) {
  const identity = await loadProjectIdentity(pool, projectId);
  const studies = await loadDoneStudies(pool, orgId, identity);
  const { rows } = await pool.query(
    'SELECT advice, signature, generated_at FROM meeting_parecer_advice WHERE project_id=$1 AND meeting_id=$2',
    [projectId, meetingId],
  );
  const row = rows[0];
  const generating = generatingAdvice.has(`${projectId}:${meetingId}`);
  if (!row) return { hasStudies: studies.length > 0, advice: null, stale: false, generating };
  // Defesa em profundidade: mesmo que uma sugestão antiga tenha sido gravada com um parecer que hoje não pode
  // ser usado nesta empresa (tag editada depois), ele não sai daqui.
  const alive = new Set(
    (await pool.query('SELECT id, scope, company_name, company_project_id FROM pareceres WHERE org_id=$1', [orgId])).rows
      .filter((r) => parecerUsableFor(r, identity)).map((r) => r.id),
  );
  const items = ((row.advice && row.advice.items) || []).filter((it) => alive.has(it.parecerId));
  return {
    hasStudies: studies.length > 0,
    advice: { items, generatedAt: row.generated_at.toISOString() },
    stale: studies.length > 0 && row.signature !== signatureOf(studies),
    generating,
  };
}
