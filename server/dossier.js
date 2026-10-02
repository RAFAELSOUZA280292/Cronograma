// Dossiê do cliente (2026-10-02, pedido da Amanda via Rafael: "um compilado de todas as reuniões
// da Tecumseh") — ver PROJECT_CONTEXT.md §63. O chat da RENATA responde pergunta a pergunta com
// só 12 trechos da memória; isto é outra coisa: lê TODAS as reuniões de uma empresa e devolve um
// documento. Duas etapas (map/reduce):
//   1) uma "ficha" por reunião, montada SEM IA a partir do que a reunião já tem (resumo, decisões,
//      tópicos, destaques, atividades); só quando a reunião não tem resumo mas tem transcrição, o
//      modelo barato (Sonnet) resume a transcrição — e isso fica em cache (project_meeting_digests);
//   2) o modelo grande (Opus) lê as fichas em ordem cronológica e devolve o dossiê estruturado.
// A lista de pendências e as estatísticas são montadas por CÓDIGO (dado do sistema, não da IA).
// Roda em segundo plano (Opus leva minutos): a rota só cria a linha e o front acompanha por polling.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { logMetric } from './metrics.js';
import { todayIso } from './assistantContext.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }
const sha1 = (s) => crypto.createHash('sha1').update(String(s || '')).digest('hex');

export const DIGEST_MODEL = 'claude-sonnet-5';
export const CONSOLIDATE_MODEL = 'claude-opus-5';
const MAX_TRANSCRIPT_CHARS = 120000;
const MAX_FICHA_CHARS = 14000;
export const BATCH_CHAR_BUDGET = 180000;
const DIGEST_CONCURRENCY = 3;
// Várias reuniões = vários blocos do Opus em sequência (minutos cada): 20 min marcaria como travado um job
// que ainda está rodando; 45 min só pega o job que morreu de verdade (ex.: container reiniciado).
export const STALE_JOB_MS = 45 * 60 * 1000;
const KEEP_DONE_VERSIONS = 5;

const TODO_STATUS_LABEL = {
  'nao-iniciado': 'não iniciado', urgente: 'urgente', 'em-andamento': 'em andamento', pausada: 'pausada', concluida: 'concluída', 'nao-relevante': 'não relevante',
};
const CLOSED_STATUSES = new Set(['concluida', 'nao-relevante']);

const clip = (s, n) => {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n)} […]` : t;
};
const fmtBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'sem data';
};

// ---------- reuniões: ordem, hash, ficha ----------

export function liveMeetings(projectData) {
  const key = (m) => String(m.date || (m.createdAt || '').slice(0, 10) || '9999-99-99');
  return ((projectData && projectData.meetings) || [])
    .filter((m) => m && !m.deleted)
    .sort((a, b) => key(a).localeCompare(key(b)) || String(a.time || '').localeCompare(String(b.time || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function liveItems(m) { return (m.actionItems || []).filter((it) => it && !it.deleted); }

// Hash de tudo que entra no dossiê — mudou algo da reunião (inclusive status de atividade), o
// dossiê gerado antes fica "desatualizado" (aviso na tela).
export function meetingSourceHash(m) {
  return sha1(JSON.stringify({
    t: m.title, d: m.date, tm: m.time, p: m.participants || [], s: m.summary || '', dc: m.decisions || '',
    tp: (m.topics || []).map((x) => x.title), hl: (m.highlights || []).map((h) => [h.type, h.quote]),
    ai: liveItems(m).map((it) => [it.id, it.title, it.subtitle, it.status, it.responsible, it.owner, it.dueDate, it.notes]),
    tr: sha1(m.transcript || ''),
  }));
}

// Chave do cache da ficha gerada da transcrição: só depende do que a IA lê (não dos status das
// atividades), pra mexer numa atividade não custar uma nova chamada.
export function digestKeyOf(m) { return sha1(`${m.title}|${m.date}|${m.transcript || ''}`); }

export function needsDigest(m) {
  return String(m.summary || '').trim().length < 80 && String(m.transcript || '').trim().length >= 200;
}

export function buildFicha(m, digest) {
  const lines = [`=== [id=${m.id}] ${fmtBR(m.date)}${m.time ? ` ${m.time}` : ''} — ${m.title || 'Reunião sem título'} ===`];
  if ((m.participants || []).length) lines.push(`Participantes: ${m.participants.join(', ')}`);
  const summary = String(m.summary || '').trim();
  let hasContent = false;
  if (summary) { lines.push(`RESUMO: ${clip(summary, 6000)}`); hasContent = true; }
  else if (digest) { lines.push(`RESUMO (gerado da transcrição): ${clip(digest, 6000)}`); hasContent = true; }
  if (String(m.decisions || '').trim()) { lines.push(`DECISÕES: ${clip(m.decisions, 3000)}`); hasContent = true; }
  const topics = (m.topics || []).map((t) => t.title).filter(Boolean);
  if (topics.length) { lines.push(`TÓPICOS: ${topics.join('; ')}`); hasContent = true; }
  const highlights = (m.highlights || []).map((h) => `[${h.type}] ${h.quote}`).filter(Boolean);
  if (highlights.length) { lines.push(`DESTAQUES:\n${highlights.slice(0, 12).map((h) => `- ${clip(h, 300)}`).join('\n')}`); hasContent = true; }
  const items = liveItems(m);
  if (items.length) {
    lines.push(`ATIVIDADES NASCIDAS DESTA REUNIÃO:\n${items.slice(0, 40).map((it) => {
      const side = it.owner === 'cliente' ? 'cliente' : 'PRICETAX';
      const st = TODO_STATUS_LABEL[it.status] || it.status || 'não iniciado';
      return `- ${it.title}${it.subtitle ? ` — ${it.subtitle}` : ''} | resp.: ${it.responsible || 'sem responsável'} (${side}) | ${st} | prazo: ${it.dueDate ? fmtBR(it.dueDate) : '—'}${it.notes ? ` | notas: ${clip(it.notes, 300)}` : ''}`;
    }).join('\n')}`);
    hasContent = true;
  }
  if (!hasContent) lines.push('(Reunião sem resumo, decisões, atividades nem transcrição registrados.)');
  const text = lines.join('\n');
  return { id: m.id, hasContent, fromTranscript: !summary && !!digest, text: text.length > MAX_FICHA_CHARS ? `${text.slice(0, MAX_FICHA_CHARS)} […]` : text };
}

// ---------- seções montadas por código (dado do sistema, nunca da IA) ----------

export function buildOpenItems(meetings, today) {
  const out = [];
  meetings.forEach((m) => liveItems(m).forEach((it) => {
    if (CLOSED_STATUSES.has(it.status)) return;
    out.push({
      title: it.title || '(sem título)', subtitle: it.subtitle || '', responsible: it.responsible || '',
      side: it.owner === 'cliente' ? 'cliente' : 'pricetax', status: it.status || 'nao-iniciado',
      dueDate: it.dueDate || '', overdue: !!(it.dueDate && it.dueDate < today),
      meetingId: m.id, meetingTitle: m.title || '', meetingDate: m.date || '',
    });
  }));
  return out.sort((a, b) => (b.overdue - a.overdue) || ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : 0) || String(a.meetingDate).localeCompare(String(b.meetingDate)));
}

export function buildStats(meetings, fichas, today) {
  const counts = new Map();
  meetings.forEach((m) => (m.participants || []).forEach((p) => { const k = String(p).trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); }));
  const dates = meetings.map((m) => m.date).filter(Boolean).sort();
  const all = meetings.flatMap(liveItems);
  const open = all.filter((it) => !CLOSED_STATUSES.has(it.status));
  return {
    meetingsTotal: meetings.length,
    meetingsWithContent: fichas.filter((f) => f.hasContent).length,
    meetingsFromTranscript: fichas.filter((f) => f.fromTranscript).length,
    period: { from: dates[0] || '', to: dates[dates.length - 1] || '' },
    participants: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40).map(([name, meetingsCount]) => ({ name, meetings: meetingsCount })),
    activities: {
      total: all.length, open: open.length, done: all.filter((it) => it.status === 'concluida').length,
      overdue: open.filter((it) => it.dueDate && it.dueDate < today).length,
    },
  };
}

// ---------- IA ----------

// Instâncias NOVAS a cada campo (não reusar o mesmo objeto zod: evita $ref no JSON schema).
const ids = () => z.array(z.string()).describe('IDs das reuniões (o valor de "id=" no cabeçalho da ficha, ex.: "mtg-abc123") que sustentam este item. Nunca invente um id; array vazio se não houver reunião específica.');

export const DossierSchema = z.object({
  executiveSummary: z.string().describe('Resumo executivo do relacionamento/projeto em 2 a 4 parágrafos curtos separados por "\\n\\n": quem é o cliente neste contexto, o que está sendo feito, em que pé está. Só fatos das fichas.'),
  timeline: z.array(z.object({
    date: z.string().describe('Data no formato YYYY-MM-DD; "" se não souber.'),
    title: z.string().describe('Título curto do marco.'),
    summary: z.string().describe('1 a 3 frases do que aconteceu/foi tratado.'),
    meetingIds: ids(),
  })).describe('Linha do tempo em ordem cronológica, no máximo 30 itens (agrupe reuniões consecutivas do mesmo assunto se precisar).'),
  workstreams: z.array(z.object({
    name: z.string().describe('Nome da frente/assunto recorrente (ex.: "Seguro de Vida", "Benefícios").'),
    description: z.string().describe('O que é essa frente, em 1 a 2 frases.'),
    status: z.enum(['em_andamento', 'pendente', 'concluida', 'indefinida']).describe('Situação mais recente da frente segundo as reuniões; "indefinida" se as fichas não permitem afirmar.'),
    keyPoints: z.array(z.string()).describe('Pontos-chave em ordem cronológica, cada um começando pela data quando souber (ex.: "12/05 — definido que ...").'),
    meetingIds: ids(),
  })).describe('Frentes de trabalho/assuntos que atravessam várias reuniões, no máximo 12.'),
  decisions: z.array(z.object({
    decision: z.string().describe('A decisão, como frase clara e autossuficiente.'),
    date: z.string().describe('YYYY-MM-DD da reunião em que foi tomada; "" se não souber.'),
    state: z.enum(['vigente', 'alterada', 'revogada', 'incerta']).describe('"alterada"/"revogada" quando uma reunião POSTERIOR mudou ou desfez; "incerta" se há versões conflitantes sem resolução.'),
    note: z.string().nullable().describe('Se state != "vigente": o que mudou, de quê para quê e em qual reunião (com data). null se vigente.'),
    meetingIds: ids(),
  })).describe('Decisões consolidadas, no máximo 40, da mais antiga para a mais recente.'),
  people: z.array(z.object({
    name: z.string(),
    role: z.string().nullable().describe('Cargo/papel SOMENTE se estiver nas fichas; senão null.'),
    organization: z.string().nullable().describe('"PRICETAX", nome do cliente ou outra organização — SOMENTE se estiver claro nas fichas; senão null.'),
    notes: z.string().nullable().describe('Em que frentes atua / o que costuma tratar; null se nada a dizer.'),
  })).describe('Pessoas relevantes citadas, no máximo 25.'),
  risks: z.array(z.object({
    risk: z.string(), why: z.string().describe('Por que é um risco, com base no que as reuniões dizem.'), meetingIds: ids(),
  })).describe('Riscos, impedimentos e dependências que aparecem nas reuniões, no máximo 15.'),
  gaps: z.array(z.object({
    question: z.string().describe('Pergunta que as reuniões deixam sem resposta, ou informação conflitante entre reuniões.'),
    why: z.string(), meetingIds: ids(),
  })).describe('Lacunas e pontos a esclarecer, no máximo 15.'),
});

const CONSOLIDATE_SYSTEM = [
  'Você é a RENATA — a Inteligência de Execução e Gestão de Projetos da PRICETAX. Sua tarefa agora é compilar o DOSSIÊ de um cliente a partir das fichas de TODAS as reuniões dele, para que um consultor que nunca participou de nenhuma reunião entenda o projeto como um todo.',
  'Regra absoluta: use SOMENTE o que está nas fichas. Nunca invente nome, cargo, data, valor, decisão, compromisso ou responsável. Se algo não está nas fichas, não escreva — e, quando a falta for relevante, registre em "gaps". Separe fato de interpretação: se está inferindo, diga que é uma inferência.',
  'Cada item deve citar em meetingIds os ids das reuniões que o sustentam, copiados exatamente do cabeçalho "id=..." das fichas — nunca invente um id.',
  'Trate o tempo com cuidado: as fichas estão em ordem cronológica. Quando uma reunião posterior muda ou desfaz algo decidido antes (prazo, valor, responsável, escopo), marque a decisão antiga como "alterada" (ou "revogada") e descreva a mudança em "note" com as datas. Se duas reuniões se contradizem sem resolução, use "incerta" e registre também em "gaps".',
  'Reuniões marcadas como "sem resumo, decisões, atividades nem transcrição" não têm conteúdo: não faça suposições sobre elas.',
  'NÃO produza lista de pendências: o sistema monta a lista de atividades abertas à parte, direto dos dados. Foque em síntese, linha do tempo, frentes, decisões, pessoas, riscos e lacunas.',
  'Escreva em português do Brasil, em tom profissional e direto. Respeite os limites de quantidade de cada campo (seja conciso: o JSON inteiro precisa caber na resposta).',
].join(' ');

const MERGE_SYSTEM = [
  'Você é a RENATA, da PRICETAX. Você recebe DOSSIÊS PARCIAIS (JSON), cada um cobrindo um bloco cronológico das reuniões de um MESMO cliente, em ordem. Una tudo em UM único dossiê coerente, no mesmo formato.',
  'Regras: não perca decisões, riscos nem lacunas relevantes; elimine duplicatas; unifique frentes de trabalho que são o mesmo assunto em blocos diferentes; quando um bloco posterior altera ou desfaz uma decisão de um bloco anterior, ajuste "state" e "note" com as datas; mantenha os meetingIds de origem de cada item, sem inventar ids. Use SOMENTE o que está nos parciais — nenhum fato novo.',
  'NÃO produza lista de pendências (o sistema monta à parte). Escreva em português do Brasil. Respeite os limites de quantidade dos campos e seja conciso.',
].join(' ');

const COMPACT_SUFFIX = '\n\nIMPORTANTE: a tentativa anterior foi longa demais e foi cortada. Seja BEM mais conciso: no máximo 15 itens na linha do tempo, 8 frentes, 25 decisões, 15 pessoas, 8 riscos e 8 lacunas, frases curtas.';

function usageOf(u) {
  return {
    inputTokens: (u && u.input_tokens) || 0, outputTokens: (u && u.output_tokens) || 0,
    cacheReadTokens: (u && u.cache_read_input_tokens) || 0, cacheCreationTokens: (u && u.cache_creation_input_tokens) || 0,
  };
}
function logUsage(pool, orgId, projectId, feature, model, usage) {
  logMetric(pool, { orgId, projectId, eventType: 'anthropic_api_call', metadata: { feature, model, ...usageOf(usage) } }).catch(() => {});
}

async function digestTranscript(client, m) {
  let t = String(m.transcript || '');
  if (t.length > MAX_TRANSCRIPT_CHARS) {
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    t = `${t.slice(0, half)}\n\n[... trecho do meio omitido por tamanho ...]\n\n${t.slice(-half)}`;
  }
  const response = await client.messages.create({
    model: DIGEST_MODEL,
    max_tokens: 1800,
    system: 'Você resume transcrições de reuniões de consultoria tributária (PRICETAX) em português, com fidelidade total: use só o que foi dito, nunca invente nomes, valores, datas ou compromissos. Estrutura (omita o que não houver): Contexto; Pontos discutidos; Decisões; Compromissos (quem, o quê, prazo se dito); Dúvidas em aberto. Seja denso e objetivo, no máximo ~400 palavras.',
    messages: [{ role: 'user', content: `Reunião: ${m.title || 'sem título'} (${fmtBR(m.date)})\nParticipantes: ${(m.participants || []).join(', ') || 'não informados'}\n\nTRANSCRIÇÃO:\n${t}` }],
  });
  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) throw new Error('Resumo da transcrição veio vazio.');
  return { text, usage: response.usage };
}

async function consolidateOnce(client, { system, userText }) {
  const response = await client.messages.parse({
    model: CONSOLIDATE_MODEL,
    // O dossiê inteiro vai num JSON só: max_tokens baixo CORTA o JSON no meio ("Unterminated string",
    // incidente real da RENATA em 2026-09-10). 16000 cobre com folga os limites do prompt e fica abaixo
    // do teto em que o SDK exige streaming.
    max_tokens: 16000,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: userText }],
    output_config: { format: zodOutputFormat(DossierSchema) },
  });
  if (response.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho (max_tokens).');
  if (!response.parsed_output) throw new Error('A IA não devolveu um dossiê válido.');
  return { output: response.parsed_output, usage: response.usage };
}

// Uma segunda tentativa, mais concisa, só pra falha que pode ser de tamanho/formato — nunca pra erro
// de credencial (retentar não adianta e só atrasa o aviso).
async function consolidateWithRetry(client, { system, userText }, label) {
  try {
    return await consolidateOnce(client, { system, userText });
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) throw e;
    console.error(`Dossiê: ${label} falhou na 1ª tentativa (${e.message}) — tentando de novo, mais conciso.`);
    return await consolidateOnce(client, { system, userText: userText + COMPACT_SUFFIX });
  }
}

export function batchFichas(fichas, budget = BATCH_CHAR_BUDGET) {
  const batches = [];
  let cur = []; let len = 0;
  fichas.forEach((f) => {
    if (cur.length && len + f.text.length > budget) { batches.push(cur); cur = []; len = 0; }
    cur.push(f); len += f.text.length + 2;
  });
  if (cur.length) batches.push(cur);
  return batches;
}

// Garante o formato e descarta citações a reuniões que não existem (a IA pode errar um id).
export function sanitizeConsolidation(raw, validIds) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  const cleanIds = (x) => [...new Set(arr(x).filter((id) => validIds.has(id)))];
  const s = (x) => (typeof x === 'string' ? x : '');
  const ns = (x) => (typeof x === 'string' && x.trim() ? x : null);
  const r = raw || {};
  return {
    executiveSummary: s(r.executiveSummary),
    timeline: arr(r.timeline).map((t) => ({ date: s(t.date), title: s(t.title), summary: s(t.summary), meetingIds: cleanIds(t.meetingIds) })),
    workstreams: arr(r.workstreams).map((w) => ({ name: s(w.name), description: s(w.description), status: ['em_andamento', 'pendente', 'concluida', 'indefinida'].includes(w.status) ? w.status : 'indefinida', keyPoints: arr(w.keyPoints).map(s).filter(Boolean), meetingIds: cleanIds(w.meetingIds) })),
    decisions: arr(r.decisions).map((d) => ({ decision: s(d.decision), date: s(d.date), state: ['vigente', 'alterada', 'revogada', 'incerta'].includes(d.state) ? d.state : 'incerta', note: ns(d.note), meetingIds: cleanIds(d.meetingIds) })),
    people: arr(r.people).map((p) => ({ name: s(p.name), role: ns(p.role), organization: ns(p.organization), notes: ns(p.notes) })).filter((p) => p.name),
    risks: arr(r.risks).map((x) => ({ risk: s(x.risk), why: s(x.why), meetingIds: cleanIds(x.meetingIds) })).filter((x) => x.risk),
    gaps: arr(r.gaps).map((g) => ({ question: s(g.question), why: s(g.why), meetingIds: cleanIds(g.meetingIds) })).filter((g) => g.question),
  };
}

function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  if (e && (e.status === 401 || e.status === 403)) return 'A chave da IA (ANTHROPIC_API_KEY) não foi aceita neste ambiente.';
  if (e && e.status === 429) return 'Limite de uso da IA atingido agora. Tente de novo em alguns minutos.';
  if (/credit balance|billing/i.test(msg)) return 'A conta da Anthropic está sem saldo/crédito.';
  if (/max_tokens|Unterminated|cortada/i.test(msg)) return 'O dossiê ficou grande demais para a IA devolver de uma vez. Tente de novo; se persistir, avise o suporte.';
  return `Não consegui gerar o dossiê agora (${msg.slice(0, 160)}).`;
}

// ---------- job ----------

async function setProgress(pool, dossierId, progress) {
  await pool.query('UPDATE project_dossiers SET progress=$2 WHERE id=$1', [dossierId, JSON.stringify(progress)]).catch(() => {});
}

export async function runDossierJob({ pool, client, dossierId, orgId, projectId, projectData, batchBudget = BATCH_CHAR_BUDGET }) {
  try {
    const meetings = liveMeetings(projectData);
    const today = todayIso();
    const { rows: cachedRows } = await pool.query('SELECT meeting_id, digest_key, digest FROM project_meeting_digests WHERE project_id=$1', [projectId]);
    const cache = new Map(cachedRows.map((r) => [r.meeting_id, r]));
    const digests = new Map();
    const toDigest = [];
    meetings.forEach((m) => {
      if (!needsDigest(m)) return;
      const hit = cache.get(m.id);
      if (hit && hit.digest_key === digestKeyOf(m)) digests.set(m.id, hit.digest); else toDigest.push(m);
    });

    let done = 0; let digestFailures = 0;
    await setProgress(pool, dossierId, { stage: 'digest', done, total: toDigest.length, meetings: meetings.length });
    let cursor = 0;
    async function worker() {
      while (cursor < toDigest.length) {
        const m = toDigest[cursor]; cursor += 1;
        try {
          const { text, usage } = await digestTranscript(client, m);
          logUsage(pool, orgId, projectId, 'dossier_digest', DIGEST_MODEL, usage);
          digests.set(m.id, text);
          await pool.query(
            `INSERT INTO project_meeting_digests (project_id, meeting_id, digest_key, digest, model) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (project_id, meeting_id) DO UPDATE SET digest_key=EXCLUDED.digest_key, digest=EXCLUDED.digest, model=EXCLUDED.model, created_at=now()`,
            [projectId, m.id, digestKeyOf(m), text, DIGEST_MODEL],
          );
        } catch (e) {
          if (e && (e.status === 401 || e.status === 403)) throw e; // sem credencial não adianta seguir
          digestFailures += 1;
          console.error(`Dossiê: falha ao resumir a transcrição de ${m.id} (${e.message}) — segue sem o resumo dela.`);
        }
        done += 1;
        await setProgress(pool, dossierId, { stage: 'digest', done, total: toDigest.length, meetings: meetings.length });
      }
    }
    await Promise.all(Array.from({ length: Math.min(DIGEST_CONCURRENCY, toDigest.length) }, worker));

    const fichas = meetings.map((m) => buildFicha(m, digests.get(m.id)));
    const validIds = new Set(meetings.map((m) => m.id));
    const company = (projectData && projectData.company) || {};
    const header = [
      `CLIENTE: ${company.name || 'não informado'}${company.nomeFantasia ? ` (${company.nomeFantasia})` : ''}${company.cnpj ? ` — CNPJ ${company.cnpj}` : ''}${company.regimeTributario ? ` — regime ${company.regimeTributario}` : ''}`,
      `HOJE: ${fmtBR(today)}`,
    ].join('\n');

    const batches = batchFichas(fichas, batchBudget);
    let consolidated;
    if (batches.length === 1) {
      await setProgress(pool, dossierId, { stage: 'consolidate', done: 0, total: 1, meetings: meetings.length });
      const userText = `${header}\nTOTAL DE REUNIÕES: ${meetings.length}\n\nFICHAS EM ORDEM CRONOLÓGICA:\n\n${batches[0].map((f) => f.text).join('\n\n')}`;
      const r = await consolidateWithRetry(client, { system: CONSOLIDATE_SYSTEM, userText }, 'consolidação');
      logUsage(pool, orgId, projectId, 'dossier_consolidate', CONSOLIDATE_MODEL, r.usage);
      consolidated = r.output;
    } else {
      const partials = [];
      for (let i = 0; i < batches.length; i += 1) {
        await setProgress(pool, dossierId, { stage: 'consolidate', done: i, total: batches.length + 1, meetings: meetings.length });
        const userText = `${header}\nBLOCO ${i + 1} DE ${batches.length} (reuniões em ordem cronológica):\n\n${batches[i].map((f) => f.text).join('\n\n')}`;
        const r = await consolidateWithRetry(client, { system: CONSOLIDATE_SYSTEM, userText }, `bloco ${i + 1}`);
        logUsage(pool, orgId, projectId, 'dossier_consolidate', CONSOLIDATE_MODEL, r.usage);
        partials.push(r.output);
      }
      await setProgress(pool, dossierId, { stage: 'consolidate', done: batches.length, total: batches.length + 1, meetings: meetings.length });
      const userText = `${header}\nDOSSIÊS PARCIAIS (JSON), em ordem cronológica:\n\n${partials.map((p, i) => `--- BLOCO ${i + 1} ---\n${JSON.stringify(p)}`).join('\n\n')}`;
      const r = await consolidateWithRetry(client, { system: MERGE_SYSTEM, userText }, 'união dos blocos');
      logUsage(pool, orgId, projectId, 'dossier_consolidate', CONSOLIDATE_MODEL, r.usage);
      consolidated = r.output;
    }

    const content = {
      generatedAt: new Date().toISOString(),
      company: company.nomeFantasia || company.name || '',
      stats: buildStats(meetings, fichas, today),
      meetings: meetings.map((m, i) => ({ id: m.id, title: m.title || '', date: m.date || '', hasContent: fichas[i].hasContent, fromTranscript: fichas[i].fromTranscript })),
      ...sanitizeConsolidation(consolidated, validIds),
      openItems: buildOpenItems(meetings, today),
      notes: { digestFailures, meetingsWithoutContent: fichas.filter((f) => !f.hasContent).map((f) => f.id) },
    };
    const sources = meetings.map((m) => ({ id: m.id, hash: meetingSourceHash(m) }));
    await pool.query(
      `UPDATE project_dossiers SET status='done', content=$2, sources=$3, progress='{}', error='', finished_at=now() WHERE id=$1`,
      [dossierId, JSON.stringify(content), JSON.stringify(sources)],
    );
    await pool.query(
      `DELETE FROM project_dossiers WHERE project_id=$1 AND (
         (status='done' AND id NOT IN (SELECT id FROM project_dossiers WHERE project_id=$1 AND status='done' ORDER BY created_at DESC LIMIT ${KEEP_DONE_VERSIONS}))
         OR (status='error' AND created_at < now() - interval '7 days'))`,
      [projectId],
    ).catch(() => {});
  } catch (e) {
    console.error('Dossiê: falha na geração —', e && e.stack ? e.stack : e);
    await pool.query(`UPDATE project_dossiers SET status='error', error=$2, progress='{}', finished_at=now() WHERE id=$1`, [dossierId, friendlyError(e)]).catch(() => {});
  }
}

// Cria a linha 'generating' e dispara o job SEM esperar (Opus leva minutos). Se já há uma geração em
// andamento pra esse projeto (e não está "travada"), devolve ela em vez de criar outra (evita pagar 2x).
export async function startDossier(pool, { orgId, projectId, projectData, user, client }) {
  await failStaleJobs(pool, projectId);
  const running = await pool.query(`SELECT id FROM project_dossiers WHERE project_id=$1 AND status='generating' ORDER BY created_at DESC LIMIT 1`, [projectId]);
  if (running.rows[0]) return { id: running.rows[0].id, alreadyRunning: true };
  const id = uid('dossie');
  await pool.query(
    `INSERT INTO project_dossiers (id, org_id, project_id, status, progress, created_by, created_by_name) VALUES ($1,$2,$3,'generating',$4,$5,$6)`,
    [id, orgId, projectId, JSON.stringify({ stage: 'digest', done: 0, total: 0 }), user.id, user.name || user.username || ''],
  );
  runDossierJob({ pool, client: client || new Anthropic(), dossierId: id, orgId, projectId, projectData }).catch((e) => console.error('Dossiê: job abortou', e));
  return { id, alreadyRunning: false };
}

// Container reiniciado/job morto no meio: a linha ficaria 'generating' pra sempre e travaria o botão.
async function failStaleJobs(pool, projectId) {
  await pool.query(
    `UPDATE project_dossiers SET status='error', error='A geração foi interrompida (o servidor reiniciou ou demorou demais). Gere de novo.', progress='{}', finished_at=now()
     WHERE project_id=$1 AND status='generating' AND created_at < now() - ($2 || ' milliseconds')::interval`,
    [projectId, String(STALE_JOB_MS)],
  );
}

export function computeStaleness(projectData, sources) {
  const current = new Map(liveMeetings(projectData).map((m) => [m.id, meetingSourceHash(m)]));
  const old = new Map((sources || []).map((s) => [s.id, s.hash]));
  let added = 0; let changed = 0; let removed = 0;
  current.forEach((h, id) => { if (!old.has(id)) added += 1; else if (old.get(id) !== h) changed += 1; });
  old.forEach((_h, id) => { if (!current.has(id)) removed += 1; });
  return { new: added, changed, removed };
}

const metaOf = (r) => r && ({ id: r.id, status: r.status, progress: r.progress || {}, error: r.error || '', createdAt: r.created_at, finishedAt: r.finished_at, createdByName: r.created_by_name || '' });

export async function getDossierState(pool, { projectId, projectData }) {
  await failStaleJobs(pool, projectId);
  const [latest, lastDone] = await Promise.all([
    pool.query(`SELECT id, status, progress, error, created_by_name, created_at, finished_at FROM project_dossiers WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1`, [projectId]),
    pool.query(`SELECT id, status, progress, error, created_by_name, created_at, finished_at, content, sources FROM project_dossiers WHERE project_id=$1 AND status='done' ORDER BY created_at DESC LIMIT 1`, [projectId]),
  ]);
  const done = lastDone.rows[0] || null;
  return {
    current: metaOf(latest.rows[0] || null),
    dossier: done ? { ...metaOf(done), content: done.content } : null,
    staleness: done ? computeStaleness(projectData, done.sources) : null,
    meetingsNow: liveMeetings(projectData).length,
  };
}
