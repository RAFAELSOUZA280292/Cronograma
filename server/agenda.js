// Agenda (2026-08) — junta, num só feed, o Google Calendar conectado do
// usuário com o que já é dele dentro do PRICETAX (TASK do XFlow que ele é
// responsável, atividade de empresa onde o nome dele bate em
// responsible/participants — mesma heurística de nome já usada pra
// notificações em routes.js). Só leitura, um endpoint só. Ver
// PROJECT_CONTEXT.md §22.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { canAccessProject } from './routes.js';
import { pool } from './db.js';
import { getConnectionStatus, listEvents, respondToEvent, googleConfigured, getEventDetail, findEventByICalUID, savePanelEvent, respondWithNote, rescheduleEvent, cancelPanelEvent } from './googleCalendar.js';
import { brInstant, parseEventForm, parseRange, proposalComment } from './agendaForm.js';
import { crmAgendaEvents } from './crm/agendaFeed.js';
import { linkedGoogleEventIds } from './crm/googleSync.js';

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'Informe start e end (datas ISO).' });
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    if (Number.isNaN(Date.parse(String(start))) || Number.isNaN(Date.parse(String(end)))) return res.status(400).json({ message: 'start e end precisam ser datas válidas (AAAA-MM-DD ou ISO).' });

    const status = await getConnectionStatus(req.user.id);
    const events = [];

    if (status.connected) {
      const googleEvents = await listEvents(req.user.id, start, end);
      // Atividade do CRM espelhada no Google aparece UMA vez: some o evento do Google, fica a atividade (que abre o CRM).
      const mirrored = await linkedGoogleEventIds(req.user.id);
      events.push(...googleEvents.filter((ev) => !mirrored.has(String(ev.id || '').replace(/^google-/, ''))));
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
      const { rows: projectRows } = await pool.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [req.user.orgId]);
      for (const p of projectRows) {
        if (!canAccessProject(req.user, p.data, p.org_id)) continue; // só as empresas que a pessoa pode abrir (cliente por CNPJ, equipe sem acesso a Empresas não vê)
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

// ---------- Ações da Agenda (Onda 5, §81; agenda completa no painel em 2026-11-02) ----------
// Criar/editar com convidados, Meet e lembrete; detalhe com a resposta de cada participante; responder (com nota ou proposta de
// novo horário); aceitar o novo horário sugerido; cancelar. Tudo no Google Calendar da própria pessoa.
export { brInstant };

const GID = /^google-([A-Za-z0-9_@.-]{4,1024})$/;
function googleId(req, res) {
  const m = GID.exec(String(req.params.id || ''));
  if (!m) { res.status(400).json({ message: 'Só é possível abrir eventos do Google Calendar.' }); return null; }
  return m[1];
}
function failGoogle(res, next, e) {
  if (e && e.status) return res.status(e.status).json({ message: e.message });
  const code = e && (e.code || (e.response && e.response.status));
  if (code === 404 || code === 410) return res.status(404).json({ message: 'Evento não encontrado no seu Google Calendar.' });
  if (code === 403) return res.status(403).json({ message: 'O Google não permitiu esta alteração neste evento.' });
  if (/invalid_grant/i.test(String(e && e.message))) return res.status(409).json({ message: 'A conexão com o Google expirou. Reconecte em Meu perfil › Agenda.' });
  return next(e);
}
async function ensureGoogle(req, res) {
  if (!googleConfigured()) { res.status(409).json({ message: 'A integração com o Google Calendar não está configurada neste ambiente.' }); return false; }
  const status = await getConnectionStatus(req.user.id);
  if (!status.connected) { res.status(409).json({ message: 'Conecte o seu Google Calendar (Meu perfil › Agenda) para criar compromissos.' }); return false; }
  return true;
}

router.post('/events', requireAuth, async (req, res, next) => {
  try {
    const { error, fields } = parseEventForm(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!await ensureGoogle(req, res)) return;
    const ev = await savePanelEvent(req.user.id, null, fields);
    res.status(201).json({ event: ev });
  } catch (e) { failGoogle(res, next, e); }
});

// Convite de um e-mail: acha o evento na sua agenda pelo UID do arquivo .ics.
router.get('/by-uid', requireAuth, async (req, res, next) => {
  try {
    const uid = String(req.query.uid || '').trim();
    if (!uid || uid.length > 1024) return res.status(400).json({ message: 'Convite sem identificador.' });
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await findEventByICalUID(req.user.id, uid) });
  } catch (e) { failGoogle(res, next, e); }
});

router.get('/events/:id', requireAuth, async (req, res, next) => {
  const id = googleId(req, res); if (!id) return;
  try {
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await getEventDetail(req.user.id, id) });
  } catch (e) { failGoogle(res, next, e); }
});

router.patch('/events/:id', requireAuth, async (req, res, next) => {
  const id = googleId(req, res); if (!id) return;
  try {
    const { error, fields } = parseEventForm(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await savePanelEvent(req.user.id, id, fields) });
  } catch (e) { failGoogle(res, next, e); }
});

router.delete('/events/:id', requireAuth, async (req, res, next) => {
  const id = googleId(req, res); if (!id) return;
  try {
    if (!await ensureGoogle(req, res)) return;
    await cancelPanelEvent(req.user.id, id);
    res.json({ ok: true });
  } catch (e) { failGoogle(res, next, e); }
});

// Sim / Talvez / Não, com nota opcional; `propose: {start, end}` manda a proposta de novo horário na nota (resposta "Talvez" se nada vier).
router.post('/events/:id/respond', requireAuth, async (req, res, next) => {
  const id = googleId(req, res); if (!id) return;
  try {
    const b = req.body || {};
    let response = String(b.response || '');
    let comment = b.comment === undefined ? undefined : String(b.comment).slice(0, 500);
    if (b.propose) {
      const r = parseRange(b.propose);
      if (r.error) return res.status(400).json({ message: r.error });
      if (!response) response = 'tentative';
      comment = proposalComment(r.startISO, r.endISO, b.comment);
    }
    if (!['accepted', 'declined', 'tentative'].includes(response)) return res.status(400).json({ message: 'Resposta inválida (aceitar, recusar ou talvez).' });
    if (comment === undefined) {
      const out = await respondToEvent(req.user.id, id, response);
      return res.json(out);
    }
    const ev = await respondWithNote(req.user.id, id, response, comment);
    res.json({ id: ev.id, myResponse: ev.myResponse, event: ev });
  } catch (e) { failGoogle(res, next, e); }
});

// Aceitar o novo horário sugerido por um convidado (ou mudar o horário direto): só o organizador.
router.post('/events/:id/reschedule', requireAuth, async (req, res, next) => {
  const id = googleId(req, res); if (!id) return;
  try {
    const r = parseRange(req.body);
    if (r.error) return res.status(400).json({ message: r.error });
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await rescheduleEvent(req.user.id, id, r.startISO, r.endISO) });
  } catch (e) { failGoogle(res, next, e); }
});
