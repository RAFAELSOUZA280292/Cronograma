// Agenda (2026-08) — junta, num só feed, o Google Calendar conectado do
// usuário com o que já é dele dentro do PRICETAX (TASK do XFlow que ele é
// responsável, atividade de empresa onde o nome dele bate em
// responsible/participants — mesma heurística de nome já usada pra
// notificações em routes.js). Só leitura, um endpoint só. Ver
// PROJECT_CONTEXT.md §22.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { getConnectionStatus, listEvents, createEvent, respondToEvent, googleConfigured } from './googleCalendar.js';
import { crmAgendaEvents } from './crm/agendaFeed.js';

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

    // CRM (Fase 3): atividades em aberto em que o usuário é o responsável. Isolado —
    // se o CRM falhar, a Agenda continua igual à de antes.
    try { events.push(...await crmAgendaEvents(req.user, startDate, endDate)); } catch (e) { console.error('Agenda: falha ao ler atividades do CRM (ignorado):', e.message); }

    res.json({ connected: status.connected, events });
  } catch (e) { next(e); }
});

// ---------- Ações da Agenda (Onda 5, §81): novo compromisso e responder convite ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Monta o instante a partir de data local de Brasília + hora (o Google guarda o fuso do evento no ISO).
export function brInstant(date, time) {
  return new Date(`${date}T${time}:00-03:00`);
}

router.post('/events', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Dê um título ao compromisso.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) return res.status(400).json({ message: 'Informe a data do compromisso.' });
    if (!/^\d{2}:\d{2}$/.test(String(b.startTime || ''))) return res.status(400).json({ message: 'Informe a hora de início.' });
    const minutes = Number(b.durationMinutes || 60);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 12 * 60) return res.status(400).json({ message: 'A duração precisa ficar entre 5 minutos e 12 horas.' });
    const start = brInstant(b.date, b.startTime);
    if (Number.isNaN(start.getTime())) return res.status(400).json({ message: 'Data ou hora inválida.' });
    const end = new Date(start.getTime() + minutes * 60000);
    const attendees = [...new Set((Array.isArray(b.attendees) ? b.attendees : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    const bad = attendees.find((e) => !EMAIL.test(e));
    if (bad) return res.status(400).json({ message: `"${bad}" não parece um e-mail válido.` });
    if (attendees.length > 30) return res.status(400).json({ message: 'No máximo 30 convidados.' });
    if (!googleConfigured()) return res.status(409).json({ message: 'A integração com o Google Calendar não está configurada neste ambiente.' });
    const status = await getConnectionStatus(req.user.id);
    if (!status.connected) return res.status(409).json({ message: 'Conecte o seu Google Calendar (Meu perfil › Agenda) para criar compromissos.' });
    const ev = await createEvent(req.user.id, { summary: title, description: String(b.description || '').slice(0, 4000), location: String(b.location || '').slice(0, 300), startISO: start.toISOString(), endISO: end.toISOString(), attendees });
    res.status(201).json({ event: { id: `google-${ev.id}`, htmlLink: ev.htmlLink } });
  } catch (e) { next(e); }
});

router.post('/events/:id/respond', requireAuth, async (req, res, next) => {
  try {
    const response = String((req.body || {}).response || '');
    if (!['accepted', 'declined', 'tentative'].includes(response)) return res.status(400).json({ message: 'Resposta inválida (aceitar, recusar ou talvez).' });
    const id = String(req.params.id || '');
    if (!id.startsWith('google-')) return res.status(400).json({ message: 'Só é possível responder convites de eventos do Google Calendar.' });
    res.json(await respondToEvent(req.user.id, id.slice('google-'.length), response));
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ message: e.message });
    if (e && e.code === 404) return res.status(404).json({ message: 'Evento não encontrado no seu Google Calendar.' });
    next(e);
  }
});
