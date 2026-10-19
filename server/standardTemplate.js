// Cronograma padrão versionado (2026-10-19; pedido do Rafael): funções PURAS (sem banco) que montam as versões iniciais, sanitizam o que o cliente envia,
// comparam versões e transformam uma versão num cronograma de empresa nova (datas = kickoff da empresa + dias de cada atividade). O banco fica em
// server/standardTemplateStore.js. Forma de uma versão (`data`): { kickoffDate, phases, activities, team } — a mesma de um projeto, sem empresa/log/reuniões.
import { blankProject, nextPhaseColor } from './db.js';
import { CRONOGRAMA_PADRAO } from '../shared/cronogramaPadrao.js';
import { A_WINDOWS as V3_WINDOWS, ITEMS as V3_ITEMS, MAINS as V3_MAINS, MAINS_DESC as V3_DESC } from '../shared/cronogramaPadraoV3.js';

export const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const DAY = 86400000;
const isoOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const shiftISO = (iso, days) => (isoOk(iso) ? new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10) : '');
export const isISODate = isoOk;

// ---------- versões iniciais ----------

// 1.0 = o que as empresas novas recebiam até 19/10/2026 (12 atividades do modelo + Contábil, RH e Prontidão sem data, já com as melhorias de 15/10).
export function buildV1() {
  const bp = blankProject();
  const dates = bp.activities.map((a) => a.date).filter(Boolean).sort();
  return { kickoffDate: dates[0] || '', phases: bp.phases, activities: bp.activities, team: [...bp.team] };
}

const TEAM_WORDS = [['TI', 'TI'], ['Fiscal', 'Fiscal'], ['Compras', 'Compras'], ['Comercial', 'Comercial'], ['Vendas', 'Comercial'], ['Financeiro', 'Financeiro'], ['Contábil', 'Contábil'],
  ['Contabilidade', 'Contábil'], ['Jurídico', 'Jurídico'], ['Logística', 'Logística'], ['RH', 'RH'], ['Controladoria', 'Controladoria'], ['Diretoria', 'Diretoria']];
const FREQ_TXT = { 'Por versão': 'por versão', Semanal: 'semanal', Contínuo: 'contínuo' };
const PRIO = { Crítica: 'alta', Alta: 'alta', Média: 'media', Baixa: 'baixa' };
// Datas propostas (dias após o kickoff) para as etapas que não têm filhas no guia: não há base no guia, o Rafael ajusta.
const SEM_FILHAS = {
  'envio-dados': { fase: 1, dia: 3, fim: 10 },
  'analise-doc': { fase: 2, dia: 13, fim: 24 },
  'apresentacao-previa': { fase: 3, dia: 39, fim: 45 },
  'report-final': { fase: 3, dia: 60, fim: 66 },
  conselho: { fase: 4, dia: 72, fim: 72 },
  encerramento: { fase: 5, dia: 175, fim: 175 },
};
const D0 = CRONOGRAMA_PADRAO.dataBase;

function responsibleOf(k, mainResp) {
  const words = String(k.quem || '');
  for (const [w, name] of TEAM_WORDS) if (new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(words)) return name;
  if (k.exec === 'PriceTax') return 'PRICETAX';
  if (k.exec === 'ERP') return 'TI';
  return mainResp;
}

// 2.0 = proposta: as 87 ações do guia como subatividades de 20 atividades principais, em 5 fases, com prazos em dias após o kickoff.
export function buildV2() {
  const P = CRONOGRAMA_PADRAO;
  const phases = P.fases.filter((f) => f.id > 0).map((f, i) => ({ id: f.id, name: f.nome, sub: f.marco, color: nextPhaseColor(i) }));
  const team = ['PRICETAX', 'Cliente', 'Compras', 'Comercial', 'Financeiro', 'Fiscal', 'Jurídico', 'Logística', 'Controladoria', 'Contábil', 'RH', 'TI', 'Diretoria', 'Todas'];
  const activities = P.atividades.map((m, i) => {
    const dated = m.filhas.filter((k) => k.dia !== null && k.dia !== undefined);
    const fixed = SEM_FILHAS[m.key];
    const fases = m.filhas.map((k) => k.fase).filter((f) => f > 0);
    const phase = fases.length ? Math.min(...fases) : (fixed ? fixed.fase : 1);
    const ini = m.key === 'kickoff' ? 0 : dated.length ? Math.min(...dated.map((k) => k.dia)) : (fixed ? fixed.dia : null);
    const fim = dated.length ? Math.max(...dated.map((k) => k.dia)) : (fixed ? fixed.fim : null);
    const prios = m.filhas.map((k) => PRIO[k.prio]).filter(Boolean);
    const priority = prios.includes('alta') ? 'alta' : prios.includes('media') ? 'media' : prios.length ? 'baixa' : '';
    return {
      id: `m${i + 1}`, month: i + 1, phase, title: m.titulo, desc: m.descricao, responsible: m.responsavel, priority, participants: [],
      date: ini === null ? '' : shiftISO(D0, ini), endDate: fim === null ? '' : shiftISO(D0, fim), durationDays: '', status: 'nao-iniciado',
      required: m.key !== 'conselho', stdKey: m.modeloKey || m.key,
      subactivities: m.filhas.map((k) => ({
        id: uid('s'), done: false, responsible: responsibleOf(k, m.responsavel), date: k.dia === null || k.dia === undefined ? '' : shiftISO(D0, k.dia),
        title: k.recorrencia ? `${k.titulo} (${FREQ_TXT[k.recorrencia] || k.recorrencia.toLowerCase()})` : k.titulo,
      })),
      notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
    };
  });
  return { kickoffDate: D0, phases, activities, team };
}

export const V1_NOTE = 'Modelo que as empresas novas recebiam até 19/10/2026: 12 atividades do modelo, mais Contábil, RH/Folha/DP e Prontidão da virada (sem data), com as melhorias de 15/10.';
export const V2_NOTE_ORIGINAL = 'Proposta inicial: as 87 ações do guia da Reforma Tributária como subatividades de 20 atividades principais, em 5 fases, com prazos em dias após o kickoff. As datas de Envio dos dados, Análise e validação documental, Apresentação prévia, Report final e workshop, Reunião do Conselho e Encerramento foram propostas sem base no guia: ajuste.';
export const V2_NOTE = `Versão provisória: será substituída pela 3.0 depois da validação. ${V2_NOTE_ORIGINAL}`;


// ---------- proposta v3 (carregada no rascunho pelo botão "Proposta v3" do histórico de versões; só vira versão quando alguém salva) ----------
const V3_KICKOFF = '2026-10-07'; const V3_VIRADA = '2027-01-01';
const V3_PRIO = { P1: 'alta', P2: 'media', P3: 'baixa' };
const V3_TEAM = ['PRICETAX', 'Cliente', 'Compras', 'Comercial', 'Financeiro', 'Fiscal', 'Jurídico', 'Logística', 'Controladoria', 'Contábil', 'RH', 'TI', 'Diretoria', 'Todas'];
const V3_MAIN_RESP = { A1: 'PRICETAX', A2: 'Cliente', A3: 'PRICETAX', A4: 'PRICETAX', A5: 'PRICETAX', A6: 'PRICETAX', A7: 'PRICETAX', B1: 'Diretoria', B2: 'TI', B3: 'TI', B4: 'Fiscal', B5: 'Fiscal', B6: 'Compras', B7: 'Comercial', B8: 'Financeiro', B9: 'Contábil', B10: 'Jurídico', B11: 'RH', B12: 'Logística', B13: 'Todas', B14: 'TI', B15: 'Todas' };
const V3_PHASES = [
  { id: 1, name: 'Mobilização', sub: '24/10: ambiente de homologação e cronograma do ERP recebidos', ini: '2026-10-07', fim: '2026-10-18' },
  { id: 2, name: 'Desenho e parametrização', sub: '14/11: regras fiscais aprovadas; notas técnicas e DANFE entregues pelo ERP', ini: '2026-10-19', fim: '2026-11-15' },
  { id: 3, name: 'Homologação integrada', sub: '12/12: testes aprovados por Fiscal, Contábil e Financeiro', ini: '2026-11-16', fim: '2026-12-13' },
  { id: 4, name: 'Virada', sub: '22/12: ata de prontidão; 01/01/2027: a reforma entra', ini: '2026-12-14', fim: '2026-12-31' },
  { id: 5, name: 'Operação assistida', sub: 'Fevereiro/2027: primeira apuração de CBS e IBS', ini: '2027-01-01', fim: '9999-12-31' },
];
const v3PhaseOf = (iso) => (iso ? (V3_PHASES.find((p) => iso <= p.fim) || V3_PHASES[4]).id : 1);

export function buildV3() {
  const dateOf = (it) => (it.anc === 'kickoff' ? shiftISO(V3_KICKOFF, it.n) : it.anc === 'virada' ? shiftISO(V3_VIRADA, -it.n) : (it.lim && it.lim.d) || '');
  const idOf = new Map(V3_ITEMS.map((it) => [it.id, uid('s')]));
  const respOf = (it, main) => (it.ar || []).find((a) => V3_TEAM.includes(a)) || (it.ex === 'PriceTax' ? 'PRICETAX' : it.ex === 'ERP' ? 'TI' : V3_MAIN_RESP[main]);
  // O Diagnóstico PRICETAX é a primeira fase (pedido do Rafael); as demais mantêm a cor de sempre.
  const phases = [{ id: 6, name: 'Diagnóstico PRICETAX', sub: 'Entregas da PRICETAX a partir do kickoff', color: nextPhaseColor(5) }, ...V3_PHASES.map((f, i) => ({ id: f.id, name: f.name, sub: f.sub, color: nextPhaseColor(i) }))];
  const activities = V3_MAINS.map(([mid, trilha, nome], i) => {
    const its = V3_ITEMS.filter((it) => it.main === mid);
    const subs = its.map((it) => {
      const sub = {
        id: idOf.get(it.id), title: it.t, done: false, responsible: respOf(it, mid), date: dateOf(it), priority: V3_PRIO[it.p] || '', executor: it.ex, areas: it.ar, anchor: it.anc, code: it.id,
      };
      if (it.apl) sub.applicability = it.apl;
      if (it.rec) sub.recurrence = it.rec;
      if (it.lim) sub.limit = { date: it.lim.d || '', type: it.lim.tipo, source: it.lim.fonte, conf: it.lim.conf, checked: '' };
      if (it.pred && it.pred.length) sub.predecessors = it.pred.map((c) => idOf.get(c)).filter(Boolean);
      return sub;
    });
    const dates = subs.map((x) => x.date).filter(Boolean).sort();
    const prios = subs.map((x) => x.priority);
    return {
      id: `m-${mid}`, month: i + 1, phase: trilha === 'A' ? 6 : v3PhaseOf(dates[0]), title: nome, desc: V3_DESC[mid] || '', responsible: V3_MAIN_RESP[mid], priority: prios.includes('alta') ? 'alta' : prios.includes('media') ? 'media' : prios.includes('baixa') ? 'baixa' : '',
      participants: [], date: V3_WINDOWS[mid] ? shiftISO(V3_KICKOFF, V3_WINDOWS[mid][0]) : dates[0] || '', endDate: V3_WINDOWS[mid] ? shiftISO(V3_KICKOFF, V3_WINDOWS[mid][1]) : dates[dates.length - 1] || '', durationDays: '', status: 'nao-iniciado', required: true, stdKey: mid,
      subactivities: subs, notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
    };
  });
  return { kickoffDate: V3_KICKOFF, phases, activities, team: [...V3_TEAM] };
}

// ---------- o que o cliente envia ----------

const str = (x) => (typeof x === 'string' ? x : '');
export const MAX_TEMPLATE_BYTES = 3_000_000;

// Sanitiza o projeto que a tela envia (autosave do rascunho). Fica só o que compõe uma versão; equipe vira lista de nomes; anexos e log não entram.
export function templateFromProject(p) {
  const src = p && typeof p === 'object' ? p : {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  const phases = arr(src.phases).filter((f) => f && f.id !== undefined && f.id !== null).map((f) => ({ id: f.id, name: str(f.name), sub: str(f.sub), color: str(f.color) }));
  const activities = arr(src.activities).filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && a.id).map((a) => ({ ...a, attachments: [] }));
  const team = [...new Set(arr(src.team).map((m) => (typeof m === 'string' ? m : m && m.name)).filter((n) => typeof n === 'string' && n.trim()))];
  return { kickoffDate: isoOk(src.kickoffDate) ? src.kickoffDate : '', phases, activities, team };
}

export function templateValid(t) {
  if (!t.phases.length) return 'O cronograma precisa de pelo menos uma fase.';
  if (!t.activities.length) return 'O cronograma precisa de pelo menos uma atividade.';
  if (Buffer.byteLength(JSON.stringify(t)) > MAX_TEMPLATE_BYTES) return 'O cronograma ficou grande demais para salvar.';
  return '';
}

// Sem apagados: versões salvas não carregam o que foi para a lixeira.
export function purgeDeleted(t) {
  return { ...t, activities: t.activities.filter((a) => !a.deleted).map((a) => ({ ...a, subactivities: (a.subactivities || []).filter((s) => !s.deleted) })) };
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
export const canonical = (v) => JSON.stringify(sortKeys(v));
// Igualdade de conteúdo ignorando itens na lixeira.
export const sameTemplate = (a, b) => canonical(purgeDeleted(a)) === canonical(purgeDeleted(b));

// ---------- comparação entre versões ----------

const ACT_FIELDS = [['title', 'título'], ['desc', 'descrição'], ['responsible', 'responsável'], ['priority', 'prioridade'], ['phase', 'fase'], ['date', 'data'], ['endDate', 'data final'], ['required', 'obrigatória'], ['dateLocked', 'data travada']];
const SUB_FIELDS = [['title', 'título'], ['responsible', 'responsável'], ['date', 'data'], ['priority', 'prioridade'], ['executor', 'executor'], ['areas', 'áreas'], ['applicability', 'aplicabilidade'], ['recurrence', 'recorrência'], ['anchor', 'âncora do prazo'], ['limit', 'limite'], ['predecessors', 'predecessoras'], ['code', 'código'], ['dateLocked', 'data travada']];
const live = (t) => (t && Array.isArray(t.activities) ? t.activities.filter((a) => !a.deleted) : []);
const liveSubs = (a) => (Array.isArray(a.subactivities) ? a.subactivities.filter((s) => !s.deleted) : []);
const norm0 = (x) => (x === undefined || x === null || (Array.isArray(x) && !x.length) ? '' : typeof x === 'object' ? canonical(x) : x);
const differ = (x, y) => norm0(x) !== norm0(y);

export function countTemplate(t) {
  const acts = live(t);
  return { activities: acts.length, subs: acts.reduce((n, a) => n + liveSubs(a).length, 0) };
}

export function diffTemplates(prev, next) {
  const out = { activities: { added: 0, removed: 0, changed: 0 }, subs: { added: 0, removed: 0, changed: 0 }, lines: [] };
  const line = (s) => { if (out.lines.length < 40) out.lines.push(s); };
  const pm = new Map(live(prev).map((a) => [a.id, a])); const nm = new Map(live(next).map((a) => [a.id, a]));
  for (const [id, a] of nm) {
    const o = pm.get(id);
    if (!o) { out.activities.added += 1; out.subs.added += liveSubs(a).length; line(`Atividade criada: "${a.title}"`); continue; }
    const f = ACT_FIELDS.filter(([k]) => differ(o[k], a[k])).map(([, l]) => l);
    if (f.length) { out.activities.changed += 1; line(`Atividade alterada: "${a.title}" (${f.join(', ')})`); }
    const os = new Map(liveSubs(o).map((s) => [s.id, s])); const ns = new Map(liveSubs(a).map((s) => [s.id, s]));
    for (const [sid, s] of ns) {
      const so = os.get(sid);
      if (!so) { out.subs.added += 1; line(`Subatividade criada em "${a.title}": "${s.title}"`); continue; }
      const sf = SUB_FIELDS.filter(([k]) => differ(so[k], s[k])).map(([, l]) => l);
      if (sf.length) { out.subs.changed += 1; line(`Subatividade alterada em "${a.title}": "${s.title}" (${sf.join(', ')})`); }
    }
    for (const [sid, s] of os) if (!ns.has(sid)) { out.subs.removed += 1; line(`Subatividade removida de "${a.title}": "${s.title}"`); }
  }
  for (const [id, a] of pm) if (!nm.has(id)) { out.activities.removed += 1; out.subs.removed += liveSubs(a).length; line(`Atividade removida: "${a.title}"`); }
  if (canonical((prev.phases || []).map(({ id, name, sub }) => ({ id, name, sub }))) !== canonical((next.phases || []).map(({ id, name, sub }) => ({ id, name, sub })))) line('Fases alteradas');
  if (differ(prev.kickoffDate, next.kickoffDate)) line('Kickoff de referência alterado');
  if (canonical(prev.team || []) !== canonical(next.team || [])) line('Equipe alterada');
  return out;
}

// ---------- empresa nova ----------

export const todaySP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

// Cronograma de uma empresa nova a partir de uma versão. Datas: subatividade "kickoff" (ou de padrão antigo, sem âncora) = kickoff da empresa + os dias do padrão;
// "virada" e "fixa" mantêm a data absoluta. REGRA DO LIMITE (decidida pelo Rafael em 2026-10-19): se a data passa do limite da norma, vale o limite e a
// subatividade nasce com `compressed` (e `compressedFrom` = a data que o padrão daria). Devolve também um resumo de avisos: prazos comprimidos, atividades que já
// nascem vencidas (data antes de hoje) e predecessoras que vencem depois da sucessora.
export function instantiateTemplate(t, kickoffISO, opts = {}) {
  const today = isoOk(opts.today) ? opts.today : todaySP();
  const base = isoOk(t.kickoffDate) ? t.kickoffDate : '';
  const delta = base && isoOk(kickoffISO) ? daysBetween(base, kickoffISO) : 0;
  const shift = (iso) => (iso && delta ? shiftISO(iso, delta) : iso || '');
  const clean = purgeDeleted(t);
  // Predecessoras apontam para ids de subatividade: como os ids são recriados, remapeia (some a que não existe mais).
  const subIds = new Map(clean.activities.flatMap((a) => (a.subactivities || []).map((s) => [s.id, uid('s')])));
  const activities = clean.activities.map((a) => ({
    ...a, id: uid('m'), date: shift(a.date), endDate: shift(a.endDate), status: 'nao-iniciado', notes: '', attachments: [], comments: [], links: [], transcript: '',
    clientDateConfirmed: false,
    subactivities: (a.subactivities || []).map((s) => {
      const fixed = s.anchor === 'virada' || s.anchor === 'fixa';
      const out = { ...s, id: subIds.get(s.id), done: false, date: fixed ? (s.date || '') : shift(s.date) };
      delete out.compressed; delete out.compressedFrom; delete out.skipped; delete out.skipReason; delete out.doneAt; delete out.doneBy;
      const limit = s.limit && isoOk(s.limit.date) ? s.limit.date : '';
      if (limit && out.date && out.date > limit) { out.compressedFrom = out.date; out.date = limit; out.compressed = true; }
      if (Array.isArray(s.predecessors)) out.predecessors = s.predecessors.map((id) => subIds.get(id)).filter(Boolean);
      return out;
    }),
  }));
  // Atividade principal com subatividades de data fixa/virada ou comprimidas: o intervalo vem das datas das subatividades. Quando TODAS andam com o kickoff (ex.: o Diagnóstico),
  // vale o intervalo da própria atividade, que anda com o kickoff como sempre (2026-10-19: antes ele era sobrescrito pelo das subatividades).
  for (const a of activities) {
    if (!a.subactivities.some((s) => s.anchor === 'virada' || s.anchor === 'fixa' || s.compressed)) continue;
    const ds = a.subactivities.map((s) => s.date).filter(Boolean).sort();
    if (ds.length) { a.date = ds[0]; a.endDate = ds[ds.length - 1]; }
  }
  // Avisos
  const all = activities.flatMap((a) => a.subactivities.map((s) => ({ s, main: a.title })));
  const byId = new Map(all.map((x) => [x.s.id, x.s]));
  const items = [];
  const push = (kind, x, extra) => { if (items.length < 80) items.push({ kind, code: x.s.code || '', title: x.s.title, main: x.main, date: x.s.date || '', ...extra }); };
  let compressed = 0; let late = 0; let order = 0;
  for (const x of all) {
    if (x.s.compressed) { compressed += 1; push('comprimido', x, { from: x.s.compressedFrom, limit: x.s.limit.date }); }
    if (x.s.date && x.s.date < today) { late += 1; push('vencida', x, {}); }
    for (const pid of x.s.predecessors || []) { const p = byId.get(pid); if (p && p.date && x.s.date && p.date > x.s.date) { order += 1; push('ordem', x, { pred: p.title, predDate: p.date }); } }
  }
  return {
    phases: clean.phases.map((f) => ({ ...f })), activities, team: [...clean.team],
    summary: { total: all.length, compressed, lateAtBirth: late, orderConflicts: order, today, items },
  };
}
