// Levantamento de atividades de TODAS as empresas (2026-10-07, Etapa 1 de docs/PLANO_RENATA_CONSULTAS_GERAIS.md; pedido do
// Felipe: "um levantamento de tudo que temos de atividades por área, para atualizar os cronogramas dos clientes").
// Uma consulta só, determinística (sem IA), reaproveitada pela tela (Visão Geral › Levantamento), pela planilha e pela
// RENATA geral — contagens e listas vêm daqui, a IA só redige. Só PRICETAX (master/pricetax) e só as empresas que a
// pessoa pode acessar (mesmo `canAccessProject` das telas). Só leitura.
// Passos 1 e 2 do caminho combinado (2026-10-07): inclui as TAREFAS DE REUNIÃO (origem 'reuniao', além das atividades do
// cronograma, origem 'cronograma') e mede a qualidade dos dados (`/quality`) antes de decidir como organizá-los.
import { Router } from 'express';
import XLSX from 'xlsx';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject, effectiveOrgId } from './routes.js';

export const OPEN_STATUSES = ['nao-iniciado', 'em-andamento'];
const ALL_STATUSES = ['nao-iniciado', 'em-andamento', 'pausado', 'concluido'];
const STATUS_LABEL = { 'nao-iniciado': 'Não iniciado', 'em-andamento': 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };
const PRIORITY_LABEL = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const ORIGINS = ['cronograma', 'reuniao'];
// Status das tarefas de reunião → os 4 status do levantamento. 'nao-relevante' não é atividade e fica de fora; 'urgente' vira prioridade.
const TODO_STATUS = { 'nao-iniciado': 'nao-iniciado', urgente: 'nao-iniciado', 'em-andamento': 'em-andamento', pausada: 'pausado', concluida: 'concluido' };
const NO_PHASE = 'Sem fase';
const NO_RESP = 'Sem responsável';

export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const brDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Linhas do levantamento a partir dos projetos já filtrados por permissão. Função pura.
export function buildItems(projectRows, today) {
  const items = [];
  for (const p of projectRows) {
    const data = p.data || {};
    const company = data.company || {};
    const label = company.nomeFantasia || company.name || 'Empresa sem nome';
    const paused = company.status === 'pausado';
    const phases = data.phases || [];
    for (const a of data.activities || []) {
      if (!a || a.deleted) continue;
      const phaseName = (phases.find((ph) => ph.id === a.phase) || {}).name || '';
      const status = ALL_STATUSES.includes(a.status) ? a.status : 'nao-iniciado';
      const date = a.date || '';
      const subs = (a.subactivities || []).filter((s) => s && !s.deleted);
      items.push({
        origin: 'cronograma', projectId: p.id, activityId: a.id, company: label, companyPaused: paused,
        title: a.title || '', desc: a.desc || '',
        phase: phaseName.trim(), phaseKey: norm(phaseName) || '_sem_fase',
        responsible: String(a.responsible || '').trim(), responsibleKey: norm(a.responsible) || '_sem_resp',
        status, priority: a.priority || '', date, endDate: a.endDate || date,
        overdue: !!date && date < today && status !== 'concluido' && status !== 'pausado',
        subTotal: subs.length, subDone: subs.filter((s) => s.done || s.completed).length,
      });
    }
    // Tarefas que saíram das reuniões (transcrição ou lançadas à mão): ficam dentro de `meetings[].actionItems`.
    for (const m of data.meetings || []) {
      if (!m || m.deleted) continue;
      for (const it of m.actionItems || []) {
        if (!it || it.deleted || it.status === 'nao-relevante') continue;
        const status = TODO_STATUS[it.status] || 'nao-iniciado';
        const date = it.dueDate || '';
        const subs = (it.subtasks || []).filter((s) => s && !s.deleted);
        items.push({
          origin: 'reuniao', projectId: p.id, activityId: '', taskId: it.id, meetingId: m.id, meetingTitle: m.title || '', meetingDate: m.date || '',
          owner: it.owner === 'cliente' ? 'cliente' : 'pricetax', company: label, companyPaused: paused,
          title: it.title || '', desc: it.notes || it.subtitle || '',
          phase: '', phaseKey: '_sem_fase',
          responsible: String(it.responsible || '').trim(), responsibleKey: norm(it.responsible) || '_sem_resp',
          status, priority: it.status === 'urgente' ? 'urgente' : '', date, endDate: date,
          overdue: !!date && date < today && status !== 'concluido' && status !== 'pausado',
          subTotal: subs.length, subDone: subs.filter((s) => s.done || s.completed || s.status === 'concluida').length,
        });
      }
    }
  }
  // Cada empresa nomeia a sua fase/responsável: mostra a grafia mais usada no conjunto todo ("Diagnóstico", não "diagnostico").
  const canon = (keyOf, nameOf, set) => {
    const votes = new Map();
    for (const it of items) { const k = keyOf(it); const m = votes.get(k) || votes.set(k, new Map()).get(k); m.set(nameOf(it), (m.get(nameOf(it)) || 0) + 1); }
    const best = new Map([...votes].map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
    for (const it of items) set(it, best.get(keyOf(it)));
  };
  canon((i) => i.phaseKey, (i) => i.phase, (i, v) => { i.phase = v; });
  canon((i) => i.responsibleKey, (i) => i.responsible, (i, v) => { i.responsible = v; });
  return items;
}

// Universo para os filtros (independe do que está filtrado agora).
export function buildUniverse(items) {
  const companies = new Map();
  const phaseNames = new Map();
  const respNames = new Map();
  const bump = (m, key, label) => { const e = m.get(key) || { key, names: new Map(), count: 0 }; e.count += 1; e.names.set(label, (e.names.get(label) || 0) + 1); m.set(key, e); };
  for (const it of items) {
    companies.set(it.projectId, { id: it.projectId, label: it.company, paused: it.companyPaused });
    bump(phaseNames, it.phaseKey, it.phase || NO_PHASE);
    bump(respNames, it.responsibleKey, it.responsible || NO_RESP);
  }
  const pick = (e) => [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const list = (m) => [...m.values()].map((e) => ({ key: e.key, label: pick(e), count: e.count })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return {
    companies: [...companies.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), phases: list(phaseNames), responsibles: list(respNames),
    origins: { cronograma: items.filter((i) => i.origin === 'cronograma').length, reuniao: items.filter((i) => i.origin === 'reuniao').length },
  };
}

export function parseFilters(q = {}) {
  const status = String(q.status || OPEN_STATUSES.join(',')).split(',').map((s) => s.trim()).filter((s) => ALL_STATUSES.includes(s));
  return {
    status: status.length ? status : OPEN_STATUSES,
    company: String(q.company || ''), phase: String(q.phase || ''), responsible: String(q.responsible || ''),
    origin: (() => { const o = String(q.origin || ORIGINS.join(',')).split(',').map((x) => x.trim()).filter((x) => ORIGINS.includes(x)); return o.length ? o : ORIGINS; })(),
    overdue: q.overdue === '1' || q.overdue === 'true',
    hidePausedCompanies: q.hidePausedCompanies === '1' || q.hidePausedCompanies === 'true',
    groupBy: ['phase', 'responsible', 'phase_responsible', 'responsible_phase', 'company'].includes(q.groupBy) ? q.groupBy : 'phase_responsible',
  };
}

export function applyFilters(items, f) {
  return items.filter((it) => f.status.includes(it.status) && f.origin.includes(it.origin)
    && (!f.company || it.projectId === f.company)
    && (!f.phase || it.phaseKey === f.phase)
    && (!f.responsible || it.responsibleKey === f.responsible)
    && (!f.overdue || it.overdue)
    && (!f.hidePausedCompanies || !it.companyPaused));
}

const byDateThenCompany = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.company.localeCompare(b.company, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR');
const counts = (items) => ({
  total: items.length, overdue: items.filter((i) => i.overdue).length, companies: new Set(items.map((i) => i.projectId)).size,
  cronograma: items.filter((i) => i.origin === 'cronograma').length, reuniao: items.filter((i) => i.origin === 'reuniao').length,
});

const DIMENSIONS = {
  phase: { key: (i) => i.phaseKey, label: (i) => i.phase || NO_PHASE, last: '_sem_fase' },
  responsible: { key: (i) => i.responsibleKey, label: (i) => i.responsible || NO_RESP, last: '_sem_resp' },
  company: { key: (i) => i.projectId, label: (i) => i.company, last: null },
};

function groupBy(items, dims) {
  const [first, ...rest] = dims;
  const dim = DIMENSIONS[first];
  const buckets = new Map();
  for (const it of items) { const k = dim.key(it); (buckets.get(k) || buckets.set(k, []).get(k)).push(it); }
  // O nome mostrado é a grafia mais usada entre os clientes (cada empresa nomeia a sua fase).
  const labelOf = (list) => { const c = new Map(); list.forEach((i) => c.set(dim.label(i), (c.get(dim.label(i)) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
  const groups = [...buckets.entries()].map(([key, list]) => ({
    key, label: labelOf(list), counts: counts(list),
    ...(rest.length ? { children: groupBy(list, rest) } : { items: list.slice().sort(byDateThenCompany) }),
  }));
  groups.sort((a, b) => (a.key === dim.last) - (b.key === dim.last) || b.counts.total - a.counts.total || a.label.localeCompare(b.label, 'pt-BR'));
  return groups;
}

export function buildGroups(items, groupByKey) {
  const dims = { phase: ['phase'], responsible: ['responsible'], phase_responsible: ['phase', 'responsible'], responsible_phase: ['responsible', 'phase'], company: ['company'] }[groupByKey] || ['phase', 'responsible'];
  return groupBy(items, dims);
}

export async function loadInventory(user, orgId, today, db = pool) {
  const { rows } = await db.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [orgId]);
  const mine = rows.filter((r) => canAccessProject(user, r.data, r.org_id));
  return { rows: mine, items: buildItems(mine, today) };
}
export async function loadInventoryItems(user, orgId, today, db = pool) {
  return (await loadInventory(user, orgId, today, db)).items;
}

// ---------- Qualidade dos dados (Passo 1) ----------
// Mede o que atrapalharia uma varredura "organizadinha": tarefa sem responsável/prazo, responsável que não é ninguém da equipe,
// o mesmo nome escrito de formas diferentes e a mesma coisa lançada no cronograma e numa reunião. Só mede — não altera nada.
const tokensOf = (s) => norm(s).split(' ').filter(Boolean);
const tokMatch = (a, b) => a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b));

export function matchPerson(name, candidates) {
  const n = norm(name);
  if (!n) return { kind: 'empty' };
  if (n === 'pricetax') return { kind: 'exact' };
  const cands = [...new Map(candidates.filter(Boolean).map((c) => [norm(c), c])).values()];
  if (cands.some((c) => norm(c) === n)) return { kind: 'exact' };
  const nt = tokensOf(name);
  const near = cands.filter((c) => {
    const ct = tokensOf(c);
    return nt.every((t) => ct.some((x) => tokMatch(t, x))) || ct.every((x) => nt.some((t) => tokMatch(t, x)));
  });
  if (near.length === 1) return { kind: 'partial', suggestion: near[0] };
  if (near.length > 1) return { kind: 'ambiguous', suggestion: near.slice(0, 3).join(' ou ') };
  return { kind: 'unknown' };
}

export function buildQuality(projectRows, items, userNames, today) {
  const open = items.filter((i) => i.status !== 'concluido');
  const teamOf = new Map(projectRows.map((p) => [p.id, (((p.data || {}).team) || []).map((t) => t && t.name).filter(Boolean)]));
  const by = (arr, o) => arr.filter((i) => i.origin === o).length;
  const gaps = {
    noResponsible: { cronograma: by(open.filter((i) => !i.responsible), 'cronograma'), reuniao: by(open.filter((i) => !i.responsible), 'reuniao') },
    noDate: { cronograma: by(open.filter((i) => !i.date), 'cronograma'), reuniao: by(open.filter((i) => !i.date), 'reuniao') },
  };
  // Quem é avaliado: atividades do cronograma e tarefas de reunião do lado PRICETAX (o lado do cliente tem gente de fora da equipe).
  const people = { evaluated: 0, recognized: 0, partial: 0, ambiguous: 0, unknown: 0, clientSide: open.filter((i) => i.origin === 'reuniao' && i.owner === 'cliente').length };
  const unknown = new Map();
  for (const it of open) {
    if (!it.responsible || (it.origin === 'reuniao' && it.owner === 'cliente')) continue;
    people.evaluated += 1;
    const m = matchPerson(it.responsible, [...(teamOf.get(it.projectId) || []), ...userNames]);
    if (m.kind === 'exact') { people.recognized += 1; continue; }
    people[m.kind] += 1;
    const e = unknown.get(it.responsibleKey) || { name: it.responsible, count: 0, companies: new Set(), kind: m.kind, suggestion: m.suggestion || '' };
    e.count += 1; e.companies.add(it.company); unknown.set(it.responsibleKey, e);
  }
  const unknownNames = [...unknown.values()].sort((a, b) => b.count - a.count).slice(0, 20)
    .map((e) => ({ name: e.name, count: e.count, kind: e.kind, suggestion: e.suggestion, companies: [...e.companies].slice(0, 4) }));

  // Mesmo primeiro nome com grafias diferentes ("Rafael", "Rafael Souza", "Rafa").
  const byFirst = new Map();
  for (const it of open) {
    if (!it.responsible) continue;
    const f = tokensOf(it.responsible)[0];
    if (!f || f.length < 3 || f === 'pricetax') continue;
    const key = [...byFirst.keys()].find((k) => tokMatch(k, f)) || f;
    const g = byFirst.get(key) || new Map();
    const cur = g.get(it.responsibleKey) || { name: it.responsible, count: 0 };
    cur.count += 1; g.set(it.responsibleKey, cur); byFirst.set(key, g);
  }
  const clusters = [...byFirst.entries()].filter(([, g]) => g.size > 1)
    .map(([first, g]) => ({ first, variants: [...g.values()].sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.variants.reduce((x, v) => x + v.count, 0) - a.variants.reduce((x, v) => x + v.count, 0)).slice(0, 15);

  // Mesma coisa no cronograma e numa reunião (título igual, mesma empresa).
  const seen = new Map();
  for (const it of open) {
    const k = `${it.projectId}|${norm(it.title)}`;
    if (!norm(it.title)) continue;
    const e = seen.get(k) || { company: it.company, title: it.title, origins: new Set(), meeting: '' };
    e.origins.add(it.origin); if (it.origin === 'reuniao') e.meeting = it.meetingTitle; seen.set(k, e);
  }
  const dups = [...seen.values()].filter((e) => e.origins.size > 1);

  let meetings = 0, noDate = 0, noTasks = 0;
  for (const p of projectRows) {
    for (const m of ((p.data || {}).meetings) || []) {
      if (!m || m.deleted) continue;
      meetings += 1;
      if (!m.date) noDate += 1;
      if (!(m.actionItems || []).some((it) => it && !it.deleted)) noTasks += 1;
    }
  }
  return {
    today,
    scope: { open: open.length, cronograma: by(open, 'cronograma'), reuniao: by(open, 'reuniao'), companies: new Set(open.map((i) => i.projectId)).size, meetings: { total: meetings, noDate, noTasks } },
    gaps, people, unknownNames, clusters,
    duplicates: { count: dups.length, examples: dups.slice(0, 8).map((e) => ({ company: e.company, title: e.title, meeting: e.meeting })) },
  };
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// Texto compacto para a RENATA geral (só o que está em aberto): por fase e por responsável, com contagens.
export function inventoryContextText(items) {
  const open = items.filter((i) => OPEN_STATUSES.includes(i.status));
  if (!open.length) return 'LEVANTAMENTO DE ATIVIDADES: nenhuma atividade em aberto nas empresas acessíveis.';
  const nCron = open.filter((i) => i.origin === 'cronograma').length;
  const lines = [`LEVANTAMENTO DE ATIVIDADES EM ABERTO (todas as empresas acessíveis; ${open.length} atividade(s) em ${new Set(open.map((i) => i.projectId)).size} empresa(s), ${open.filter((i) => i.overdue).length} atrasada(s); ${nCron} do cronograma + ${open.length - nCron} tarefas que saíram de reuniões, sem fase). Contagens exatas — use-as; a lista completa está em Visão Geral › Levantamento (com planilha):`];
  lines.push('Por fase:');
  for (const g of buildGroups(open, 'phase_responsible').slice(0, 25)) {
    const resp = (g.children || []).slice(0, 8).map((c) => `${c.label} ${c.counts.total}`).join(', ');
    lines.push(`- ${g.label}: ${g.counts.total} em ${g.counts.companies} empresa(s), ${g.counts.overdue} atrasada(s) — ${resp}`);
  }
  lines.push('Por responsável:');
  for (const g of buildGroups(open, 'responsible').slice(0, 20)) lines.push(`- ${g.label}: ${g.counts.total} em ${g.counts.companies} empresa(s), ${g.counts.overdue} atrasada(s)`);
  return lines.join('\n');
}

function describeFilters(f, universe) {
  const parts = [`status: ${f.status.map((s) => STATUS_LABEL[s]).join(', ')}`];
  if (f.company) parts.push(`empresa: ${(universe.companies.find((c) => c.id === f.company) || {}).label || f.company}`);
  if (f.phase) parts.push(`fase: ${(universe.phases.find((p) => p.key === f.phase) || {}).label || f.phase}`);
  if (f.responsible) parts.push(`responsável: ${(universe.responsibles.find((r) => r.key === f.responsible) || {}).label || f.responsible}`);
  if (f.origin.length < ORIGINS.length) parts.push(`origem: ${f.origin.map((o) => (o === 'reuniao' ? 'tarefas de reunião' : 'cronograma')).join(', ')}`);
  if (f.overdue) parts.push('só atrasadas');
  if (f.hidePausedCompanies) parts.push('sem empresas pausadas');
  return parts.join(' · ');
}

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

async function resolve(req, query = req.query) {
  const today = todayIso();
  const { rows, items: all } = await loadInventory(req.user, effectiveOrgId(req), today);
  const filters = parseFilters(query);
  return { today, rows, all, filters, items: applyFilters(all, filters), universe: buildUniverse(all) };
}

router.get('/', async (req, res, next) => {
  try {
    const { today, filters, items, universe } = await resolve(req);
    res.json({ today, filters, universe, totals: counts(items), groups: buildGroups(items, filters.groupBy) });
  } catch (e) { next(e); }
});

router.get('/quality', async (req, res, next) => {
  try {
    const { today, rows, all } = await resolve(req, {});
    const { rows: users } = await pool.query("SELECT name FROM users WHERE org_id=$1 AND blocked=false AND role <> 'cliente'", [effectiveOrgId(req)]);
    res.json(buildQuality(rows, all, users.map((u) => u.name).filter(Boolean), today));
  } catch (e) { next(e); }
});

router.get('/export.xlsx', async (req, res, next) => {
  try {
    const { today, filters, items, universe } = await resolve(req);
    const sorted = items.slice().sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.phase.localeCompare(b.phase, 'pt-BR') || byDateThenCompany(a, b));
    const rows = sorted.map((i) => ({
      Empresa: i.company, Origem: i.origin === 'reuniao' ? 'Reunião' : 'Cronograma',
      Reunião: i.origin === 'reuniao' ? `${i.meetingTitle}${i.meetingDate ? ` (${brDate(i.meetingDate)})` : ''}` : '',
      Lado: i.origin === 'reuniao' ? (i.owner === 'cliente' ? 'Cliente' : 'PRICETAX') : '',
      Fase: i.phase || NO_PHASE, 'Responsável': i.responsible || NO_RESP, 'Atividade': i.title,
      'Descrição': clip(i.desc, 1500), Status: STATUS_LABEL[i.status], Prioridade: PRIORITY_LABEL[i.priority] || '',
      'Início': brDate(i.date), 'Fim': brDate(i.endDate), Atrasada: i.overdue ? 'Sim' : '',
      'Subatividades': i.subTotal ? `${i.subDone}/${i.subTotal}` : '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: 'Nenhuma atividade com esses filtros.' }]);
    ws['!cols'] = [28, 12, 36, 10, 22, 22, 50, 60, 14, 12, 12, 12, 10, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Atividades');
    // Fase × Responsável (contagem) — a mesma agregação da tela.
    const pivot = [];
    for (const g of buildGroups(items, 'phase_responsible')) {
      for (const c of g.children) pivot.push({ Fase: g.label, 'Responsável': c.label, Atividades: c.counts.total, Atrasadas: c.counts.overdue, Empresas: c.counts.companies });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pivot.length ? pivot : [{ Aviso: 'Sem dados.' }]), 'Fase x Responsável');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Levantamento de atividades — PRICETAX'], ['Gerado em', brDate(today)], ['Filtros', describeFilters(filters, universe)], ['Atividades', items.length],
    ]), 'Sobre');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="levantamento-atividades-${today}.xlsx"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  } catch (e) { next(e); }
});
