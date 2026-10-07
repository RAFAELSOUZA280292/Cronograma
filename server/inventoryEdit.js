// Passo 3 do caminho combinado (2026-10-07): organizar o que já existe a partir do Levantamento — padronizar o nome do
// responsável (ex.: "Rafa" → "Rafael Souza"), definir a Área e pedir sugestão de área à RENATA. Tudo com revisão humana:
// a prévia (`dryRun`) diz quantos itens mudam ANTES de gravar. Mexe só no campo pedido, por projeto e em transação; guarda o
// valor original (`responsibleOriginal`), registra no log do projeto e NÃO dispara notificações ("você foi definido como
// responsável") — é arrumação de histórico, não atribuição nova. Só master/pricetax; só empresas acessíveis.
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject, effectiveOrgId } from './routes.js';
import { norm, loadInventory } from './inventory.js';
import { AREAS, canonicalArea } from './areas.js';
import { syncProjectMemoryFromDiff } from './memoryIngest.js';
import { STUDY_MODEL } from './parecerStudy.js';

const MAX_REFS = 800;
const MAX_SUGGEST = 40;

// ---------- Mutações puras (testáveis) ----------
const mapTasks = (data, fn) => {
  let changed = 0;
  const meetings = (data.meetings || []).map((m) => {
    if (!m || m.deleted) return m;
    let touched = false;
    const actionItems = (m.actionItems || []).map((it) => {
      if (!it || it.deleted) return it;
      const r = fn(it, m);
      if (!r) return it;
      touched = true; changed += 1;
      return r;
    });
    return touched ? { ...m, actionItems } : m;
  });
  return { meetings, changed };
};
const mapActs = (data, fn) => {
  let changed = 0;
  const activities = (data.activities || []).map((a) => {
    if (!a || a.deleted) return a;
    const r = fn(a);
    if (!r) return a;
    changed += 1;
    return r;
  });
  return { activities, changed };
};

// Mesmo escopo que o painel de qualidade mede: cronograma + tarefas de reunião do lado PRICETAX.
export function applyRename(data, fromKey, to, keep) {
  const fix = (x) => {
    if (norm(x.responsible) !== fromKey) return null;
    if (keep) return x.responsibleConfirmed ? null : { ...x, responsibleConfirmed: true };
    if (x.responsible === to) return null;
    const { responsibleConfirmed, ...rest } = x; // eslint-disable-line no-unused-vars
    return { ...rest, responsible: to, responsibleOriginal: x.responsibleOriginal || x.responsible };
  };
  const a = mapActs(data, fix);
  const t = mapTasks(data, (it) => (it.owner === 'cliente' ? null : fix(it)));
  return { data: { ...data, activities: a.activities, meetings: t.meetings }, changed: a.changed + t.changed };
}

// refs = ids do levantamento deste projeto: `cronograma|<proj>|<atividade>` ou `reuniao|<proj>|<reunião>|<tarefa>`.
export function applyArea(data, projectId, refs, area) {
  const set = (x) => {
    if ((x.area || '') === area) return null;
    if (!area) { const { area: _drop, ...rest } = x; return rest; } // eslint-disable-line no-unused-vars
    return { ...x, area };
  };
  const acts = new Set(refs.filter((r) => r[0] === 'cronograma' && r[1] === projectId).map((r) => r[2]));
  const tasks = new Set(refs.filter((r) => r[0] === 'reuniao' && r[1] === projectId).map((r) => `${r[2]}|${r[3]}`));
  const a = mapActs(data, (x) => (acts.has(x.id) ? set(x) : null));
  const t = mapTasks(data, (it, m) => (tasks.has(`${m.id}|${it.id}`) ? set(it) : null));
  return { data: { ...data, activities: a.activities, meetings: t.meetings }, changed: a.changed + t.changed };
}

// ---------- Aplicação por projeto (transação + log + memória) ----------
async function mutateProjects({ user, orgId, only, mutate, logText, dryRun }) {
  const { rows } = await pool.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [orgId]);
  const mine = rows.filter((r) => canAccessProject(user, r.data, r.org_id) && (!only || only.has(r.id)));
  let changed = 0; const projects = []; const companies = [];
  for (const row of mine) {
    const label = (row.data && row.data.company && (row.data.company.nomeFantasia || row.data.company.name)) || 'Empresa';
    if (dryRun) {
      const r = mutate(row.data || {}, row.id);
      if (r.changed) { changed += r.changed; projects.push(row.id); companies.push(label); }
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT data FROM projects WHERE id=$1 FOR UPDATE', [row.id]);
      const before = cur.rows[0] && cur.rows[0].data;
      const r = before ? mutate(before, row.id) : { changed: 0 };
      if (!r.changed) { await client.query('ROLLBACK'); continue; }
      const next = { ...r.data, log: [{ ts: new Date().toISOString(), action: logText(r.changed), user: user.name || user.username || '', activityId: null }, ...(before.log || [])].slice(0, 300) };
      await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(next), row.id]);
      await client.query('COMMIT');
      changed += r.changed; projects.push(row.id); companies.push(label);
      syncProjectMemoryFromDiff(pool, orgId, row.id, before, next).catch((e) => console.error('Levantamento: falha ao reindexar memória', e.message));
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ }
      throw e;
    } finally { client.release(); }
  }
  return { changed, projects: projects.length, companies };
}

// ---------- Sugestão de área pela IA (revisão humana antes de gravar) ----------
const SuggestSchema = z.object({
  suggestions: z.array(z.object({
    id: z.string().describe('O id exatamente como recebido.'),
    area: z.enum(AREAS).nullable().describe('A área mais provável da lista — ou null se o texto não permite decidir com segurança.'),
  })),
});

export async function suggestAreas(items, client) {
  const lines = items.map((i) => `id=${i.ref} | empresa: ${i.company} | ${i.title}${i.desc ? ` — ${String(i.desc).slice(0, 220)}` : ''}${i.responsible ? ` | responsável: ${i.responsible}` : ''}`).join('\n');
  const res = await client.messages.parse({
    model: STUDY_MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: `Você classifica atividades de projetos de consultoria tributária (Reforma Tributária) na ÁREA do cliente que é impactada. Áreas válidas: ${AREAS.join(', ')}. Escolha uma só por atividade, pelo assunto do título/descrição. Se não der para decidir com segurança, devolva null — nunca chute. Devolva todos os ids recebidos.` }],
    messages: [{ role: 'user', content: `Classifique:\n${lines}` }],
    output_config: { format: zodOutputFormat(SuggestSchema) },
  });
  const out = res.parsed_output;
  if (!out) throw new Error('A IA não devolveu sugestões.');
  const asked = new Set(items.map((i) => i.ref));
  return out.suggestions.filter((s) => asked.has(s.id) && s.area).map((s) => ({ ref: s.id, area: s.area }));
}

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

router.get('/areas', (req, res) => res.json({ areas: AREAS }));

router.post('/responsible', async (req, res, next) => {
  try {
    const { from, to, keep, dryRun } = req.body || {};
    const fromKey = norm(from);
    if (!fromKey) return res.status(400).json({ message: 'Informe o nome a padronizar.' });
    const orgId = effectiveOrgId(req);
    let target = '';
    if (!keep) {
      const { rows: users } = await pool.query("SELECT name FROM users WHERE org_id=$1 AND blocked=false AND role <> 'cliente'", [orgId]);
      const { rows: projs } = await pool.query('SELECT data, org_id FROM projects WHERE org_id=$1', [orgId]);
      const ok = new Map();
      users.forEach((u) => u.name && ok.set(norm(u.name), u.name));
      projs.filter((p) => canAccessProject(req.user, p.data, p.org_id)).forEach((p) => ((p.data && p.data.team) || []).forEach((t) => t && t.name && ok.set(norm(t.name), t.name)));
      target = ok.get(norm(to)) || '';
      if (!target) return res.status(400).json({ message: 'Escolha uma pessoa da equipe (lista de usuários ou da equipe da empresa).' });
    }
    const out = await mutateProjects({
      user: req.user, orgId, dryRun: !!dryRun,
      mutate: (data) => applyRename(data, fromKey, target, !!keep),
      logText: (n) => (keep ? `Nome "${from}" confirmado como está em ${n} item(ns) — Levantamento` : `Responsável "${from}" padronizado para "${target}" em ${n} item(ns) — Levantamento`),
    });
    res.json({ ...out, dryRun: !!dryRun });
  } catch (e) { next(e); }
});

const parseRef = (r) => String(r || '').split('|');

router.post('/area', async (req, res, next) => {
  try {
    const { refs, area, dryRun } = req.body || {};
    const val = area === '' || area == null ? '' : canonicalArea(area);
    if (area && !val) return res.status(400).json({ message: 'Área fora da lista.' });
    if (!Array.isArray(refs) || !refs.length) return res.status(400).json({ message: 'Nenhuma atividade selecionada.' });
    if (refs.length > MAX_REFS) return res.status(400).json({ message: `Selecione no máximo ${MAX_REFS} atividades por vez — filtre mais para aplicar em lotes.` });
    const parsed = refs.map(parseRef).filter((r) => (r[0] === 'cronograma' && r.length === 3) || (r[0] === 'reuniao' && r.length === 4));
    const out = await mutateProjects({
      user: req.user, orgId: effectiveOrgId(req), dryRun: !!dryRun, only: new Set(parsed.map((r) => r[1])),
      mutate: (data, pid) => applyArea(data, pid, parsed, val),
      logText: (n) => (val ? `Área definida como "${val}" em ${n} item(ns) — Levantamento` : `Área removida de ${n} item(ns) — Levantamento`),
    });
    res.json({ ...out, dryRun: !!dryRun });
  } catch (e) { next(e); }
});

router.post('/suggest-areas', async (req, res, next) => {
  try {
    const refs = Array.isArray(req.body && req.body.refs) ? req.body.refs.slice(0, MAX_SUGGEST) : [];
    if (!refs.length) return res.status(400).json({ message: 'Nenhuma atividade para sugerir.' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ message: 'A IA não está configurada neste ambiente.' });
    const { items } = await loadInventory(req.user, effectiveOrgId(req), new Date().toISOString().slice(0, 10));
    const want = new Set(refs);
    const picked = items.filter((i) => want.has(i.ref));
    const suggestions = await suggestAreas(picked, new Anthropic());
    res.json({ suggestions, asked: picked.length });
  } catch (e) { next(e); }
});
