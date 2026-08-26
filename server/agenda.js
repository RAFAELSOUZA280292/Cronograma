// Agenda (2026-08) — junta, num só feed, o Google Calendar conectado do
// usuário com o que já é dele dentro do PRICETAX (TASK do XFlow que ele é
// responsável, atividade de empresa onde o nome dele bate em
// responsible/participants — mesma heurística de nome já usada pra
// notificações em routes.js). Só leitura, um endpoint só. Ver
// PROJECT_CONTEXT.md §22.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { getConnectionStatus, listEvents } from './googleCalendar.js';

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'Informe start e end (datas ISO).' });
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);

    const status = await getConnectionStatus(req.user.id);
    const events = [];

    if (status.connected) {
      const googleEvents = await listEvents(req.user.id, start, end);
      events.push(...googleEvents);
    }

    const { rows: ticketRows } = await pool.query(
      `SELECT ticket_number, title, data FROM xflow_tickets WHERE org_id=$1 AND assignee_id=$2 AND deleted=false`,
      [req.user.orgId, req.user.id]
    );
    for (const r of ticketRows) {
      const d = r.data || {};
      if (d.expectedCompletionAt && d.expectedCompletionAt >= startDate && d.expectedCompletionAt <= endDate) {
        events.push({
          id: `xflow-completion-${r.ticket_number}`,
          source: 'xflow_ticket',
          title: `TASK #${r.ticket_number} — ${r.title}`,
          description: 'Previsão de conclusão definida no XFlow.',
          start: d.expectedCompletionAt,
          end: d.expectedCompletionAt,
          allDay: true,
          status: 'confirmed',
          link: `#${r.ticket_number}`,
        });
      }
    }

    const myName = (req.user.name || '').trim().toLowerCase();
    if (myName) {
      const { rows: projectRows } = await pool.query('SELECT id, data FROM projects WHERE org_id=$1', [req.user.orgId]);
      for (const p of projectRows) {
        const activities = (p.data && p.data.activities) || [];
        const companyLabel = (p.data.company && (p.data.company.nomeFantasia || p.data.company.name)) || 'Empresa';
        for (const a of activities) {
          if (a.deleted) continue;
          const isMine = (a.responsible || '').trim().toLowerCase() === myName
            || (a.participants || []).some((n) => (n || '').trim().toLowerCase() === myName);
          if (!isMine || !a.date) continue;
          if (a.date < startDate || a.date > endDate) continue;
          events.push({
            id: `activity-${p.id}-${a.id}`,
            source: 'activity',
            title: `${a.title} — ${companyLabel}`,
            description: a.desc || '',
            start: a.date,
            end: a.endDate || a.date,
            allDay: true,
            status: 'confirmed',
            projectId: p.id,
            activityId: a.id,
          });
        }
      }
    }

    res.json({ connected: status.connected, events });
  } catch (e) { next(e); }
});
