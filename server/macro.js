// Visão Macro (2026-08) — quadro de cronograma geral pra controle interno:
// junta as atividades de TODAS as empresas da org num só feed, organizado
// por data, pra dar pra ver o que está previsto na semana sem precisar
// entrar empresa por empresa. Só leitura. Ver PROJECT_CONTEXT.md §23.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';

export const router = Router();

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; return addDays(x, diff); }

function rangeForQuery(range, today) {
  if (range === 'next_week') {
    const start = addDays(startOfWeek(today), 7);
    return { start: isoDate(start), end: isoDate(addDays(start, 7)) };
  }
  if (range === 'next_30') {
    return { start: isoDate(today), end: isoDate(addDays(today, 30)) };
  }
  const start = startOfWeek(today);
  return { start: isoDate(start), end: isoDate(addDays(start, 7)) };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.companiesAccess || !req.user.allCompaniesAccess) {
      return res.status(403).json({ message: 'Sem acesso à Visão Geral de Empresas.' });
    }
    const range = ['current_week', 'next_week', 'next_30'].includes(req.query.range) ? req.query.range : 'current_week';
    const today = new Date();
    const todayIso = isoDate(today);
    const { start, end } = rangeForQuery(range, today);

    const { rows } = await pool.query('SELECT id, data FROM projects WHERE org_id=$1', [req.user.orgId]);
    const items = [];
    for (const p of rows) {
      const company = (p.data && p.data.company) || {};
      const companyLabel = company.nomeFantasia || company.name || 'Empresa sem nome';
      const phases = (p.data && p.data.phases) || [];
      const activities = (p.data && p.data.activities) || [];
      for (const a of activities) {
        if (a.deleted || !a.date) continue;
        const inWindow = a.date >= start && a.date < end;
        // Atrasado de antes da janela também entra (exceto olhando pra
        // "Próxima semana", que é uma janela futura específica, não teria
        // sentido puxar atraso de meses atrás pra lá) — pra nada "sumir"
        // só porque a semana dele já passou (pedido do Rafael: não deixar
        // passar despercebido o que está atrasado).
        const overdueCarry = range !== 'next_week' && a.date < todayIso && a.status !== 'concluido';
        if (!inWindow && !overdueCarry) continue;
        const phaseObj = phases.find((ph) => ph.id === a.phase);
        items.push({
          id: `${p.id}-${a.id}`,
          projectId: p.id,
          company: companyLabel,
          companyColor: company.color || '#F5C400',
          date: a.date,
          endDate: a.endDate || a.date,
          title: a.title || '',
          phase: phaseObj ? phaseObj.name : '',
          phaseColor: phaseObj ? phaseObj.color : '',
          responsible: a.responsible || '',
          status: a.status || 'nao-iniciado',
        });
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company));

    res.json({ range, start, end, today: todayIso, items });
  } catch (e) { next(e); }
});
