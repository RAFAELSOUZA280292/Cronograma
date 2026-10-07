// Levantamento de atividades de TODAS as empresas (2026-10-07, Etapa 1 de docs/PLANO_RENATA_CONSULTAS_GERAIS.md; pedido do
// Felipe: "um levantamento de tudo que temos de atividades por área, para atualizar os cronogramas dos clientes").
// Uma consulta só, determinística (sem IA), reaproveitada pela tela (Visão Geral › Levantamento), pela planilha e pela
// RENATA geral — contagens e listas vêm daqui, a IA só redige. Só PRICETAX (master/pricetax) e só as empresas que a
// pessoa pode acessar (mesmo `canAccessProject` das telas). Só leitura.
import { Router } from 'express';
import XLSX from 'xlsx';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject, effectiveOrgId } from './routes.js';

export const OPEN_STATUSES = ['nao-iniciado', 'em-andamento'];
const ALL_STATUSES = ['nao-iniciado', 'em-andamento', 'pausado', 'concluido'];
const STATUS_LABEL = { 'nao-iniciado': 'Não iniciado', 'em-andamento': 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };
const PRIORITY_LABEL = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
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
        projectId: p.id, activityId: a.id, company: label, companyPaused: paused,
        title: a.title || '', desc: a.desc || '',
        phase: phaseName.trim(), phaseKey: norm(phaseName) || '_sem_fase',
        responsible: String(a.responsible || '').trim(), responsibleKey: norm(a.responsible) || '_sem_resp',
        status, priority: a.priority || '', date, endDate: a.endDate || date,
        overdue: !!date && date < today && status !== 'concluido' && status !== 'pausado',
        subTotal: subs.length, subDone: subs.filter((s) => s.done || s.completed).length,
      });
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
  return { companies: [...companies.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), phases: list(phaseNames), responsibles: list(respNames) };
}

export function parseFilters(q = {}) {
  const status = String(q.status || OPEN_STATUSES.join(',')).split(',').map((s) => s.trim()).filter((s) => ALL_STATUSES.includes(s));
  return {
    status: status.length ? status : OPEN_STATUSES,
    company: String(q.company || ''), phase: String(q.phase || ''), responsible: String(q.responsible || ''),
    overdue: q.overdue === '1' || q.overdue === 'true',
    hidePausedCompanies: q.hidePausedCompanies === '1' || q.hidePausedCompanies === 'true',
    groupBy: ['phase', 'responsible', 'phase_responsible', 'responsible_phase', 'company'].includes(q.groupBy) ? q.groupBy : 'phase_responsible',
  };
}

export function applyFilters(items, f) {
  return items.filter((it) => f.status.includes(it.status)
    && (!f.company || it.projectId === f.company)
    && (!f.phase || it.phaseKey === f.phase)
    && (!f.responsible || it.responsibleKey === f.responsible)
    && (!f.overdue || it.overdue)
    && (!f.hidePausedCompanies || !it.companyPaused));
}

const byDateThenCompany = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.company.localeCompare(b.company, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR');
const counts = (items) => ({ total: items.length, overdue: items.filter((i) => i.overdue).length, companies: new Set(items.map((i) => i.projectId)).size });

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

export async function loadInventoryItems(user, orgId, today, db = pool) {
  const { rows } = await db.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [orgId]);
  return buildItems(rows.filter((r) => canAccessProject(user, r.data, r.org_id)), today);
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// Texto compacto para a RENATA geral (só o que está em aberto): por fase e por responsável, com contagens.
export function inventoryContextText(items) {
  const open = items.filter((i) => OPEN_STATUSES.includes(i.status));
  if (!open.length) return 'LEVANTAMENTO DE ATIVIDADES: nenhuma atividade em aberto nas empresas acessíveis.';
  const lines = [`LEVANTAMENTO DE ATIVIDADES EM ABERTO (todas as empresas acessíveis; ${open.length} atividade(s) em ${new Set(open.map((i) => i.projectId)).size} empresa(s), ${open.filter((i) => i.overdue).length} atrasada(s)). Contagens exatas — use-as; a lista completa está em Visão Geral › Levantamento (com planilha):`];
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
  if (f.overdue) parts.push('só atrasadas');
  if (f.hidePausedCompanies) parts.push('sem empresas pausadas');
  return parts.join(' · ');
}

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

async function resolve(req) {
  const today = todayIso();
  const all = await loadInventoryItems(req.user, effectiveOrgId(req), today);
  const filters = parseFilters(req.query);
  return { today, all, filters, items: applyFilters(all, filters), universe: buildUniverse(all) };
}

router.get('/', async (req, res, next) => {
  try {
    const { today, filters, items, universe } = await resolve(req);
    res.json({ today, filters, universe, totals: counts(items), groups: buildGroups(items, filters.groupBy) });
  } catch (e) { next(e); }
});

router.get('/export.xlsx', async (req, res, next) => {
  try {
    const { today, filters, items, universe } = await resolve(req);
    const sorted = items.slice().sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.phase.localeCompare(b.phase, 'pt-BR') || byDateThenCompany(a, b));
    const rows = sorted.map((i) => ({
      Empresa: i.company, Fase: i.phase || NO_PHASE, 'Responsável': i.responsible || NO_RESP, 'Atividade': i.title,
      'Descrição': clip(i.desc, 1500), Status: STATUS_LABEL[i.status], Prioridade: PRIORITY_LABEL[i.priority] || '',
      'Início': brDate(i.date), 'Fim': brDate(i.endDate), Atrasada: i.overdue ? 'Sim' : '',
      'Subatividades': i.subTotal ? `${i.subDone}/${i.subTotal}` : '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: 'Nenhuma atividade com esses filtros.' }]);
    ws['!cols'] = [28, 22, 22, 50, 60, 14, 12, 12, 12, 10, 14].map((wch) => ({ wch }));
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
