// Visão Macro (2026-08) — quadro de cronograma geral pra controle interno:
// junta as atividades de TODAS as empresas da org num só feed, organizado
// por data, pra dar pra ver o que está previsto na semana sem precisar
// entrar empresa por empresa. Só leitura. Ver PROJECT_CONTEXT.md §23.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';

export const router = Router();

const RANGES = ['overdue', 'current_week', 'next_week', 'next_30'];

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
    const range = RANGES.includes(req.query.range) ? req.query.range : 'current_week';
    const today = new Date();
    const todayIso = isoDate(today);
    const { start, end } = rangeForQuery(range, today);

    const { rows } = await pool.query('SELECT id, data FROM projects WHERE org_id=$1', [req.user.orgId]);
    const items = [];
    let overdueCount = 0;
    for (const p of rows) {
      const company = (p.data && p.data.company) || {};
      const companyLabel = company.nomeFantasia || company.name || 'Empresa sem nome';
      const phases = (p.data && p.data.phases) || [];
      const activities = (p.data && p.data.activities) || [];
      for (const a of activities) {
        if (a.deleted || !a.date) continue;
        const isOverdue = a.date < todayIso && a.status !== 'concluido';
        if (isOverdue) overdueCount += 1;

        // Cada aba mostra um recorte exclusivo — atrasado só aparece na
        // aba Atrasadas, não duplicado também na semana atual, pra não
        // ter o mesmo item contado duas vezes em lugares diferentes.
        const matches = range === 'overdue'
          ? isOverdue
          : (a.date >= start && a.date < end && !isOverdue);
        if (!matches) continue;

        const phaseObj = phases.find((ph) => ph.id === a.phase);
        items.push({
          id: `${p.id}-${a.id}`,
          projectId: p.id,
          activityId: a.id,
          company: companyLabel,
          companyColor: company.color || '#F5C400',
          date: a.date,
          endDate: a.endDate || a.date,
          time: a.meetingTime || '',
          title: a.title || '',
          phase: phaseObj ? phaseObj.name : '',
          phaseColor: phaseObj ? phaseObj.color : '',
          responsible: a.responsible || '',
          status: a.status || 'nao-iniciado',
        });
      }
    }
    // Dentro do mesmo dia, com horário definido vem primeiro e em ordem
    // cronológica (igual o exemplo do Rafael: 10:30 antes de 14:00); sem
    // horário fica depois, ordenado por empresa.
    items.sort((a, b) => a.date.localeCompare(b.date)
      || (a.time && b.time ? a.time.localeCompare(b.time) : (a.time ? -1 : b.time ? 1 : 0))
      || a.company.localeCompare(b.company));

    res.json({ range, start, end, today: todayIso, items, overdueCount });
  } catch (e) { next(e); }
});
