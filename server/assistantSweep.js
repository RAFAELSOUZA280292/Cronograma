// Varredura de reuniões de VÁRIAS empresas para a RENATA geral (Etapa 3 do plano, 2026-10-08; pedido do Felipe: "a RENATA faz
// consultas genéricas ao banco de reuniões ou por cliente?"). Só equipe PRICETAX, só empresas que a pessoa pode acessar (o filtro vai
// no SQL antes de qualquer ranking). Fluxo: (1) um filtro barato decide se a pergunta é sobre reuniões; (2) a IA (ou, se falhar,
// uma regra simples) interpreta o assunto, as empresas e o período; (3) busca com limite por empresa + COBERTURA exata do banco;
// (4) devolve o texto de contexto para a RENATA redigir. Contagens e "quais empresas" vêm do banco, nunca da IA.
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { canAccessProject } from './routes.js';
import { searchMemoryAcross } from './memoryRetrieval.js';
import { norm } from './inventory.js';
import { logMetric } from './metrics.js';
import { STUDY_MODEL } from './parecerStudy.js';

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const pad = (n) => String(n).padStart(2, '0');
export function isoOf(d) {
  if (!d) return '';
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return String(d).slice(0, 10);
}
const brOf = (d) => { const i = isoOf(d); return i ? `${i.slice(8, 10)}/${i.slice(5, 7)}/${i.slice(0, 4)}` : 'sem data'; };

// Filtro barato: só gasta a chamada de interpretação se a pergunta parece ser sobre reuniões/o que foi falado entre clientes.
const SWEEP_HINT = /reuni[aã]o|reuni[õo]es|\bcalls?\b|transcri|\bata\b|\batas\b|falou|falaram|fal(ou|aram) sobre|disse|disseram|discut|decid|combin|acord|mencion|trataram|ficou (definido|combinado|decidido)|quais (clientes|empresas)|em quais (clientes|empresas)|algum cliente|qual cliente|decis[õo]es|pend[eê]ncias? d[ae]s? reuni/i;
export const needsSweep = (question) => SWEEP_HINT.test(String(question || ''));

const STOP = new Set(['quais', 'qual', 'quem', 'como', 'onde', 'quando', 'sobre', 'para', 'pelo', 'pela', 'esse', 'essa', 'isso', 'esta', 'este', 'foram', 'foi', 'tem', 'temos', 'tinha', 'falou', 'falaram', 'clientes', 'cliente', 'empresas', 'empresa', 'reuniao', 'reunioes', 'reuniões', 'reunião', 'todas', 'todos', 'alguma', 'algum', 'ultimas', 'últimas', 'ultima', 'última', 'mais', 'menos', 'ficou', 'foram', 'que', 'com', 'uma', 'nas', 'nos', 'das', 'dos', 'por', 'sido', 'tenho', 'preciso', 'queria', 'gostaria', 'levantamento']);

// Regra simples (rede de segurança se a IA falhar): palavras de assunto + empresas citadas pelo nome.
export function heuristicScope(question, companies) {
  const words = norm(question).split(' ').filter((w) => w.length > 3 && !STOP.has(w));
  const q = norm(question);
  const named = companies.filter((c) => {
    const label = norm(c.label);
    const first = label.split(' ')[0];
    return (label.length >= 4 && q.includes(label)) || (first.length >= 5 && new RegExp(`\\b${first}\\b`).test(q));
  }).map((c) => c.id);
  const mentionedNames = new Set(companies.filter((c) => named.includes(c.id)).flatMap((c) => norm(c.label).split(' ')));
  return { useMeetings: true, searchQuery: words.filter((w) => !mentionedNames.has(w)).slice(0, 8).join(' '), companyIds: named, dateFrom: '', dateTo: '', kind: '', ai: false };
}

const ScopeSchema = z.object({
  useMeetings: z.boolean().describe('true se a pergunta pede algo que está NAS REUNIÕES (o que foi falado/decidido/combinado, quais clientes mencionaram um assunto). false se é sobre prazos, atividades, agenda ou reforma tributária em geral.'),
  searchQuery: z.string().describe('Palavras-chave do ASSUNTO procurado (2 a 8 palavras, sem "quais clientes falaram"). Vazio se não há assunto específico (ex.: "o que foi tratado nas últimas reuniões").'),
  companies: z.array(z.string()).describe('Nomes EXATAMENTE como aparecem na lista de empresas, somente se a pergunta restringe a empresas específicas. Vazio = todas.'),
  dateFrom: z.string().nullable().describe('Data inicial YYYY-MM-DD se a pergunta delimita o período (ex.: "em outubro", "nas últimas duas semanas"); senão null.'),
  dateTo: z.string().nullable().describe('Data final YYYY-MM-DD se delimitado; senão null.'),
  kind: z.enum(['qualquer', 'meeting_summary', 'meeting_decision', 'meeting_highlight', 'activity']).describe('"meeting_decision" para perguntas sobre decisões; "activity" para tarefas/pendências saídas das reuniões; "meeting_summary" para "o que foi tratado"; "qualquer" na dúvida.'),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export async function resolveSweepScope({ client, question, history, companies, today }) {
  const fallback = heuristicScope(question, companies);
  if (!client) return fallback;
  try {
    const hist = (history || []).slice(-4).map((m) => `${m.role === 'user' ? 'Usuário' : 'RENATA'}: ${clip(m.content, 400)}`).join('\n');
    const res = await client.messages.parse({
      model: STUDY_MODEL,
      // Folga grande de propósito: 500 cortava o JSON no meio em produção (ver RENATA resolveQuery, 2026-10-06).
      max_tokens: 2000,
      system: [{ type: 'text', text: 'Você prepara a busca da RENATA (assistente da PRICETAX) nas reuniões de vários clientes. Interprete a pergunta e devolva só o JSON pedido. Nunca invente nomes de empresas fora da lista.' }],
      messages: [{ role: 'user', content: `Hoje: ${today}.\nEmpresas disponíveis: ${companies.map((c) => c.label).join('; ')}.\n${hist ? `Conversa recente:\n${hist}\n` : ''}Pergunta: ${question}` }],
      output_config: { format: zodOutputFormat(ScopeSchema) },
    });
    const o = res.parsed_output;
    if (!o) return fallback;
    const byNorm = new Map(companies.map((c) => [norm(c.label), c.id]));
    const ids = (o.companies || []).map((n) => byNorm.get(norm(n))).filter(Boolean);
    return {
      useMeetings: o.useMeetings, searchQuery: String(o.searchQuery || '').trim(), companyIds: [...new Set(ids)],
      dateFrom: DATE_RE.test(o.dateFrom || '') ? o.dateFrom : '', dateTo: DATE_RE.test(o.dateTo || '') ? o.dateTo : '',
      kind: o.kind && o.kind !== 'qualquer' ? o.kind : '', ai: true,
    };
  } catch (e) {
    console.error('RENATA geral: interpretação da busca em reuniões falhou — usando a regra simples.', e.message);
    return fallback;
  }
}

// Texto de contexto + fontes. Função pura (testável): recebe o que a busca devolveu.
export function sweepContext({ scope, search, labelOf, searched, total }) {
  const cov = search.coverage;
  const lines = [`BUSCA NAS REUNIÕES (pesquisei ${searched} de ${total} empresa(s) acessíveis${scope.companyIds.length ? ' — restrita às citadas' : ''}; assunto: ${scope.searchQuery ? `"${scope.searchQuery}"` : 'sem assunto específico (resumos mais recentes)'}${scope.dateFrom || scope.dateTo ? `; período: ${scope.dateFrom || '…'} a ${scope.dateTo || '…'}` : ''}).`];
  if (!search.chunks.length) {
    lines.push('Nenhum trecho de reunião encontrado com esses critérios. Diga isso com franqueza; não suponha.');
    return { text: lines.join('\n'), sources: [] };
  }
  lines.push(`COBERTURA EXATA (contagem do banco — use para responder "quais clientes"): ${cov.length} empresa(s) com menção.`);
  for (const c of cov.slice(0, 30)) lines.push(`- ${labelOf(c.projectId)}: ${c.mentions} trecho(s) em ${c.meetings} reunião(ões); mais recente: "${clip(c.lastTitle, 70)}" (${brOf(c.lastDate)})`);
  if (cov.length > 30) lines.push(`- … e mais ${cov.length - 30} empresa(s)`);
  lines.push(`TRECHOS (os mais relevantes; no máx. ${3} por empresa — é uma AMOSTRA, não tudo o que existe):`);
  for (const ch of search.chunks) lines.push(`[id=${ch.id}] ${labelOf(ch.projectId)} · "${clip(ch.meetingTitle, 60)}" · ${brOf(ch.meetingDate)} · ${ch.kind}\n${clip(ch.content, 650)}`);
  const sources = cov.slice(0, 10).map((c) => ({ company: labelOf(c.projectId), mentions: c.mentions, meetings: c.meetings, lastTitle: c.lastTitle || '', lastDate: isoOf(c.lastDate) }));
  return { text: lines.join('\n'), sources };
}

// Rodapé determinístico (do banco) anexado à resposta: o usuário confere onde olhar sem depender do que a IA citou.
export function sweepFooter(sources, stats) {
  if (!sources.length) return '';
  const rows = sources.map((s) => `- ${s.company}: ${s.mentions} trecho(s) em ${s.meetings} reunião(ões)${s.lastDate ? `; última: “${clip(s.lastTitle, 50)}” (${brOf(s.lastDate)})` : ''}`);
  return `\n\n**Reuniões consultadas** — ${stats.withHits} de ${stats.searched} empresa(s) com menção${stats.withHits > sources.length ? ` (mostrando as ${sources.length} com mais trechos)` : ''}:\n${rows.join('\n')}`;
}

export async function runSweep({ pool, user, orgId, question, history, client, now = new Date(), search = searchMemoryAcross }) {
  const t0 = Date.now();
  const today = isoOf(now);
  const { rows } = await pool.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [orgId]);
  const mine = rows.filter((r) => canAccessProject(user, r.data, r.org_id));
  const companies = mine.map((r) => ({ id: r.id, label: (r.data && r.data.company && (r.data.company.nomeFantasia || r.data.company.name)) || 'Empresa' }));
  if (!companies.length) return null;
  const scope = await resolveSweepScope({ client, question, history, companies, today });
  if (!scope.useMeetings) return null;
  const ids = scope.companyIds.length ? scope.companyIds : companies.map((c) => c.id);
  const result = await search(pool, { orgId, projectIds: ids, query: scope.searchQuery, kind: scope.kind || undefined, dateFrom: scope.dateFrom || undefined, dateTo: scope.dateTo || undefined, perProject: 3, limit: 24 });
  const labels = new Map(companies.map((c) => [c.id, c.label]));
  const labelOf = (id) => labels.get(id) || 'Empresa';
  const built = sweepContext({ scope, search: result, labelOf, searched: ids.length, total: companies.length });
  const stats = { searched: ids.length, withHits: result.coverage.length, chunks: result.chunks.length, mode: result.mode, usedAI: scope.ai, ms: Date.now() - t0 };
  logMetric(pool, { orgId, projectId: null, eventType: 'meeting_sweep', metadata: { ...stats, hasQuery: !!scope.searchQuery } }).catch(() => {});
  return { text: built.text, sources: built.sources, footer: sweepFooter(built.sources, stats), stats, scope };
}
