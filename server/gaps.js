// Lacunas entre cronogramas (Etapa 4 do plano, 2026-10-08; pedido do Felipe: "levantamento de tudo que temos de atividades ... para
// atualizar os cronogramas dos clientes"). Compara as atividades do cronograma de TODAS as empresas acessíveis, acha as "atividades-padrão"
// (as que várias empresas têm) e aponta o que falta no cronograma de uma empresa. Determinístico, sem IA. Criar é sempre ação do usuário,
// depois de ver a lista (nada é criado sozinho).
//
// CONFIDENCIALIDADE entre clientes (regra do plano): uma atividade só vira "padrão" se pelo menos MIN_FLOOR (3) empresas diferentes a têm
// — nunca se revela de qual empresa ela veio — e só se copia o TÍTULO genérico, a fase e a área mais comuns entre as empresas que a têm:
// nunca descrição, responsável, datas, anexos, comentários nem nome de cliente.
import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject, effectiveOrgId } from './routes.js';
import { norm } from './inventory.js';
import { canonicalArea } from './areas.js';
import { syncProjectMemoryFromDiff } from './memoryIngest.js';
import { heuristicScope } from './assistantSweep.js';

export const MIN_FLOOR = 3;
const MERGE_JACCARD = 0.7; // dois títulos do mesmo "tipo" de atividade
const HAS_JACCARD = 0.6;   // a empresa já tem algo equivalente
const SIMILAR_JACCARD = 0.34; // parecido o bastante para avisar ("já existe algo parecido"), sem contar como tendo
const MAX_CREATE = 40;

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'com', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'por', 'ao', 'aos', 'que', 'se', 'ou']);
export function titleTokens(title) {
  return new Set(norm(title).replace(/[^a-z0-9 ]/g, ' ').split(' ')
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)));
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}
const keyOf = (tokens) => [...tokens].sort().join(' ');
const mostCommon = (arr) => { const m = new Map(); arr.filter(Boolean).forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };

// Linhas {pid, title, tokens, phase, area} das atividades do cronograma (não excluídas, com título).
export function collectActivities(projectRows) {
  const out = [];
  for (const p of projectRows) {
    const d = p.data || {};
    const phases = d.phases || [];
    for (const a of d.activities || []) {
      if (!a || a.deleted || !String(a.title || '').trim()) continue;
      const tokens = titleTokens(a.title);
      if (!tokens.size) continue;
      out.push({ pid: p.id, title: String(a.title).trim(), tokens, phase: ((phases.find((ph) => ph.id === a.phase) || {}).name || '').trim(), area: canonicalArea(a.area) || canonicalArea(a.responsible) });
    }
  }
  return out;
}

// Agrupa títulos iguais (após normalizar) e funde os quase iguais (Jaccard ≥ 0,7) em "tipos de atividade".
export function buildClusters(acts) {
  const exact = new Map();
  for (const a of acts) {
    const k = keyOf(a.tokens);
    const g = exact.get(k) || { key: k, tokens: a.tokens, members: [], pids: new Set() };
    g.members.push(a); g.pids.add(a.pid); exact.set(k, g);
  }
  const groups = [...exact.values()].sort((x, y) => y.pids.size - x.pids.size || x.key.localeCompare(y.key)).slice(0, 4000);
  const clusters = [];
  for (const g of groups) {
    const host = clusters.find((c) => jaccard(c.tokens, g.tokens) >= MERGE_JACCARD);
    if (host) { host.members.push(...g.members); g.pids.forEach((p) => host.pids.add(p)); host.keys.add(g.key); }
    else clusters.push({ key: g.key, keys: new Set([g.key]), tokens: g.tokens, members: [...g.members], pids: new Set(g.pids) });
  }
  return clusters.map((c) => ({
    key: c.key, keys: c.keys, tokens: c.tokens, pids: c.pids,
    title: mostCommon(c.members.map((m) => m.title)), phase: mostCommon(c.members.map((m) => m.phase)), area: mostCommon(c.members.map((m) => m.area)),
  }));
}

// Mínimo de empresas para uma atividade ser "padrão": 25% das empresas, nunca menos que o piso de 3 (anonimato).
export const defaultMin = (totalCompanies) => Math.max(MIN_FLOOR, Math.ceil(totalCompanies * 0.25));
export const clampMin = (v, total) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.max(MIN_FLOOR, n) : defaultMin(total); };

// Lacunas de UMA empresa: tipos de atividade-padrão que ela não tem (nem algo equivalente).
export function gapsForCompany(clusters, targetActs, min, totalCompanies) {
  const have = targetActs;
  const gaps = [];
  for (const c of clusters) {
    if (c.pids.size < min) continue;
    const present = have.some((a) => c.keys.has(keyOf(a.tokens)) || jaccard(a.tokens, c.tokens) >= HAS_JACCARD);
    if (present) continue;
    // "Parecido" (só aviso, não conta como ter): sobreposição de palavras OU um título contido no outro ("Compras" × "Compras — revisão").
    const contains = (x, y) => [...x].every((t) => y.has(t));
    let best = null; let bestJ = 0;
    for (const a of have) {
      const j = Math.max(jaccard(a.tokens, c.tokens), (contains(c.tokens, a.tokens) || contains(a.tokens, c.tokens)) ? 0.5 : 0);
      if (j > bestJ) { bestJ = j; best = a; }
    }
    gaps.push({
      key: c.key, title: c.title, phase: c.phase, area: c.area, count: c.pids.size, total: totalCompanies,
      pct: totalCompanies ? Math.round((c.pids.size / totalCompanies) * 100) : 0,
      similar: best && bestJ >= SIMILAR_JACCARD ? best.title : '',
    });
  }
  gaps.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'pt-BR'));
  return gaps;
}

const labelOf = (p) => (p.data && p.data.company && (p.data.company.nomeFantasia || p.data.company.name)) || 'Empresa sem nome';

export function analyze(projectRows, min) {
  const acts = collectActivities(projectRows);
  const withActs = new Set(acts.map((a) => a.pid));
  const total = withActs.size;
  const useMin = clampMin(min, total);
  const clusters = buildClusters(acts);
  const standard = clusters.filter((c) => c.pids.size >= useMin);
  const byPid = new Map();
  acts.forEach((a) => { (byPid.get(a.pid) || byPid.set(a.pid, []).get(a.pid)).push(a); });
  const companies = projectRows.filter((p) => withActs.has(p.id)).map((p) => {
    const mine = byPid.get(p.id) || [];
    const gaps = gapsForCompany(clusters, mine, useMin, total);
    return { id: p.id, label: labelOf(p), paused: !!(p.data && p.data.company && p.data.company.status === 'pausado'), activities: mine.length, gaps: gaps.length, standard: standard.length, coverage: standard.length ? Math.round(((standard.length - gaps.length) / standard.length) * 100) : 100 };
  }).sort((a, b) => b.gaps - a.gaps || a.label.localeCompare(b.label, 'pt-BR'));
  return { min: useMin, floor: MIN_FLOOR, total, standardCount: standard.length, companies, clusters, byPid };
}

// Texto compacto para a RENATA geral: o que falta no cronograma de UMA empresa (só títulos genéricos e contagens agregadas).
export function gapsContextText(label, gaps, a) {
  if (!gaps.length) return `LACUNAS DE CRONOGRAMA — ${label}: nenhuma atividade-padrão faltando (padrão = atividade que pelo menos ${a.min} das ${a.total} empresas têm).`;
  return [`LACUNAS DE CRONOGRAMA — ${label} não tem ${gaps.length} atividade(s)-padrão (padrão = pelo menos ${a.min} das ${a.total} empresas têm). Só títulos genéricos; a lista com seleção e criação está em Visão Geral › Lacunas:`,
    ...gaps.slice(0, 25).map((g) => `- ${g.title}${g.phase ? ` (fase ${g.phase})` : ''}${g.area ? ` [${g.area}]` : ''} — ${g.count} de ${g.total} empresas têm${g.similar ? `; já existe algo parecido: "${g.similar}"` : ''}`),
    ...(gaps.length > 25 ? [`- … e mais ${gaps.length - 25}`] : [])].join('\n');
}

export async function loadAccessible(user, orgId, db = pool) {
  const { rows } = await db.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [orgId]);
  return rows.filter((r) => canAccessProject(user, r.data, r.org_id));
}

// Atividade nova no formato do cronograma (mesmos campos de `addActivity` e da ação da RENATA).
export function newActivityFrom(gap, project, month) {
  const phases = project.phases || [];
  const matched = gap.phase ? phases.find((ph) => norm(ph.name) === norm(gap.phase)) : null;
  const phaseId = matched ? matched.id : (phases.length ? phases[phases.length - 1].id : 1);
  return {
    id: `act-${Math.random().toString(36).slice(2, 9)}`, month, phase: phaseId, title: gap.title, desc: '',
    responsible: (project.team && project.team[0] && project.team[0].name) || 'PRICETAX', priority: '', participants: [],
    date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [],
    notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
    ...(gap.area ? { area: gap.area } : {}), createdFromGaps: true,
  };
}

// Para a RENATA geral: "o que falta no cronograma da X?" — uma empresa citada → as lacunas dela; nenhuma → as empresas com mais lacunas.
export const GAPS_HINT = /lacuna|faltam?\b|faltando|faltou|incomplet|atividades[- ]padr|cronograma (est[aá]|d[aeo]s? )/i;
export async function gapsContextFor({ user, orgId, question, db = pool }) {
  const rows = await loadAccessible(user, orgId, db);
  if (!rows.length) return null;
  const a = analyze(rows, undefined);
  const companies = rows.map((r) => ({ id: r.id, label: labelOf(r) }));
  const named = heuristicScope(question, companies).companyIds;
  if (named.length === 1) {
    const t = rows.find((r) => r.id === named[0]);
    return gapsContextText(labelOf(t), gapsForCompany(a.clusters, a.byPid.get(t.id) || [], a.min, a.total), a);
  }
  const top = a.companies.filter((c) => c.gaps > 0).slice(0, 12);
  return top.length
    ? `LACUNAS DE CRONOGRAMA (atividade-padrão = pelo menos ${a.min} das ${a.total} empresas têm; ${a.standardCount} atividades-padrão). Empresas com mais lacunas:\n${top.map((c) => `- ${c.label}: faltam ${c.gaps} de ${a.standardCount} (${c.coverage}% do padrão)`).join('\n')}\nPara ver e criar, indique Visão Geral › Lacunas.`
    : `LACUNAS DE CRONOGRAMA: nenhuma empresa tem atividade-padrão faltando (padrão = pelo menos ${a.min} das ${a.total} empresas têm).`;
}

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

router.get('/overview', async (req, res, next) => {
  try {
    const rows = await loadAccessible(req.user, effectiveOrgId(req));
    const a = analyze(rows, req.query.min);
    res.json({ min: a.min, floor: a.floor, defaultMin: defaultMin(a.total), total: a.total, standardCount: a.standardCount, companies: a.companies });
  } catch (e) { next(e); }
});

router.get('/company/:id', async (req, res, next) => {
  try {
    const rows = await loadAccessible(req.user, effectiveOrgId(req));
    const target = rows.find((r) => r.id === req.params.id);
    if (!target) return res.status(404).json({ message: 'Empresa não encontrada ou sem acesso.' });
    const a = analyze(rows, req.query.min);
    res.json({ company: { id: target.id, label: labelOf(target) }, min: a.min, floor: a.floor, total: a.total, standardCount: a.standardCount, gaps: gapsForCompany(a.clusters, a.byPid.get(target.id) || [], a.min, a.total) });
  } catch (e) { next(e); }
});

// Cria as atividades escolhidas no cronograma da empresa. O servidor RECALCULA as lacunas e só cria o que ainda é lacuna (o título vem
// do cálculo, não do navegador); transação com trava; log do projeto; sem notificações.
router.post('/create', async (req, res, next) => {
  const { projectId, keys, min } = req.body || {};
  if (!projectId || !Array.isArray(keys) || !keys.length) return res.status(400).json({ message: 'Escolha ao menos uma atividade.' });
  if (keys.length > MAX_CREATE) return res.status(400).json({ message: `Crie no máximo ${MAX_CREATE} atividades por vez.` });
  const orgId = effectiveOrgId(req);
  const client = await pool.connect();
  try {
    const rows = await loadAccessible(req.user, orgId);
    const target = rows.find((r) => r.id === projectId);
    if (!target) { client.release(); return res.status(404).json({ message: 'Empresa não encontrada ou sem acesso.' }); }
    const a = analyze(rows, min);
    const want = new Set(keys);
    const gaps = gapsForCompany(a.clusters, a.byPid.get(projectId) || [], a.min, a.total).filter((g) => want.has(g.key));
    if (!gaps.length) { client.release(); return res.status(409).json({ message: 'Essas atividades já não são lacunas (o cronograma mudou). Atualize a lista.' }); }
    await client.query('BEGIN');
    const cur = await client.query('SELECT data FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
    const before = cur.rows[0].data;
    const month = (before.activities || []).length ? Math.max(...before.activities.map((x) => x.month || 1)) + 1 : 1;
    const created = gaps.map((g) => newActivityFrom(g, before, month));
    const who = req.user.name || req.user.username || '';
    const next = {
      ...before, activities: [...(before.activities || []), ...created],
      log: [{ ts: new Date().toISOString(), action: `${created.length} atividade(s) adicionada(s) ao cronograma a partir das lacunas entre clientes (Levantamento), confirmado por ${who}: ${created.map((x) => `"${x.title}"`).slice(0, 6).join(', ')}${created.length > 6 ? '…' : ''}`, user: who, activityId: null }, ...(before.log || [])].slice(0, 300),
    };
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(next), projectId]);
    await client.query('COMMIT');
    client.release();
    syncProjectMemoryFromDiff(pool, orgId, projectId, before, next).catch((e) => console.error('Lacunas: falha ao reindexar memória', e.message));
    res.status(201).json({ created: created.length, titles: created.map((x) => x.title) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ }
    client.release();
    next(e);
  }
});
