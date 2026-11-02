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
import { brInstant, parseEventForm, parseRange, proposalComment, withDeadline } from './agendaForm.js';
import { crmAgendaEvents } from './crm/agendaFeed.js';
import { linkedGoogleEventIds } from './crm/googleSync.js';
import {
  extraEvents, listAccounts, addIcalAccount, updateAccount, removeAccount, principalPrefs, savePrincipalPrefs, parseEventId,
  extraDetail, extraSave, extraRespond, extraReschedule, extraCancel, PRINCIPAL_COLOR, MAX_ACCOUNTS, ACCOUNT_COLORS,
} from './calendarAccounts.js';
import { googleExtConfigured } from './googleCalendar.js';
import { microsoftConfigured } from './microsoftGraph.js';

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'Informe start e end (datas ISO).' });
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    if (Number.isNaN(Date.parse(String(start))) || Number.isNaN(Date.parse(String(end)))) return res.status(400).json({ message: 'start e end precisam ser datas válidas (AAAA-MM-DD ou ISO).' });

    const warnings = [];
    let status = { connected: false };
    try { status = await withDeadline(getConnectionStatus(req.user.id), 10000, 'A conexão com o Google'); } catch (e) { console.error('Agenda: status do Google (ignorado):', e.message); warnings.push(e.message); }
    const events = [];
    const principal = await principalPrefs(req.user.id);

    if (status.connected && principal.calendarEnabled) {
      try {
        const googleEvents = await withDeadline(listEvents(req.user.id, start, end), 15000, 'O Google Calendar');
        // Atividade do CRM espelhada no Google aparece UMA vez: some o evento do Google, fica a atividade (que abre o CRM).
        const mirrored = await linkedGoogleEventIds(req.user.id);
        events.push(...googleEvents.filter((ev) => !mirrored.has(String(ev.id || '').replace(/^google-/, ''))).map((ev) => ({ ...ev, account: 'principal', color: principal.color })));
      } catch (e) {
        console.error('Agenda: falha ao ler o Google Calendar (ignorado):', e.message);
        warnings.push(/invalid_grant/i.test(String(e.message)) ? 'A conexão com o Google expirou: reconecte em Meu perfil › Agenda.' : e.deadline ? e.message : 'Não consegui ler o seu Google Calendar agora; o resto da agenda está aqui.');
      }
    }

    // Agendas extras da pessoa (§128): outra conta Google, Microsoft, link iCal. Só as dela; uma com problema não derruba a tela.
    let extra = { events: [], accounts: [] };
    try { extra = await extraEvents(req.user.id, start, end); } catch (e) { console.error('Agenda: falha ao ler agendas extras (ignorado):', e.message); }
    events.push(...extra.events);

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
    try { events.push(...await withDeadline(crmAgendaEvents(req.user, startDate, endDate), 10000, 'As atividades do CRM')); } catch (e) { console.error('Agenda: falha ao ler atividades do CRM (ignorado):', e.message); }

    const principalAccount = {
      id: 'principal', provider: 'google', providerLabel: 'Google', label: principal.label || 'Agenda principal (Google)', color: principal.color,
      calendarEnabled: principal.calendarEnabled, connected: status.connected, privacy: 'pricetax', readOnly: false, status: 'ok', error: '',
    };
    res.json({ connected: status.connected, events, accounts: [principalAccount, ...extra.accounts], warnings });
  } catch (e) { next(e); }
});

// ---------- Ações da Agenda (Onda 5, §81; agenda completa no painel em 2026-11-02) ----------
// Criar/editar com convidados, Meet e lembrete; detalhe com a resposta de cada participante; responder (com nota ou proposta de
// novo horário); aceitar o novo horário sugerido; cancelar. Tudo no Google Calendar da própria pessoa.
export { brInstant };

const GID = /^google-([A-Za-z0-9_@.-]{4,1024})$/;
function googleId(req, res) {
  const m = GID.exec(String(req.params.id || ''));
  if (!m) { res.status(400).json({ message: 'Só é possível abrir eventos do Google Calendar ou das suas agendas conectadas.' }); return null; }
  return m[1];
}
// Evento de agenda extra ("x:<conta>:<id>")? Então a ação vai para a conta dele (calendarAccounts.js), sempre do próprio usuário.
const extraOf = (req) => (String(req.params.id || '').length <= 2100 ? parseEventId(req.params.id) : null);
function failGoogle(res, next, e) {
  if (e && e.status) return res.status(e.status).json({ message: e.message });
  if (e && e.graphCode) return res.status(e.code === 404 ? 404 : e.code === 403 ? 403 : 502).json({ message: e.code === 404 ? 'Evento não encontrado nesta agenda.' : `A Microsoft recusou: ${String(e.message).slice(0, 200)}` });
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
    const accountId = String((req.body || {}).accountId || 'principal');
    if (accountId !== 'principal') return res.status(201).json({ event: await extraSave(req.user.id, accountId, null, fields) });
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
  if (extraOf(req)) { try { return res.json({ event: await extraDetail(req.user.id, req.params.id) }); } catch (e) { return failGoogle(res, next, e); } }
  const id = googleId(req, res); if (!id) return;
  try {
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await getEventDetail(req.user.id, id) });
  } catch (e) { failGoogle(res, next, e); }
});

router.patch('/events/:id', requireAuth, async (req, res, next) => {
  const x = extraOf(req);
  const id = x ? x.rawId : googleId(req, res); if (!id) return;
  try {
    const { error, fields } = parseEventForm(req.body);
    if (error) return res.status(400).json({ message: error });
    if (x) return res.json({ event: await extraSave(req.user.id, x.accountId, x.rawId, fields) });
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await savePanelEvent(req.user.id, id, fields) });
  } catch (e) { failGoogle(res, next, e); }
});

router.delete('/events/:id', requireAuth, async (req, res, next) => {
  if (extraOf(req)) { try { await extraCancel(req.user.id, req.params.id); return res.json({ ok: true }); } catch (e) { return failGoogle(res, next, e); } }
  const id = googleId(req, res); if (!id) return;
  try {
    if (!await ensureGoogle(req, res)) return;
    await cancelPanelEvent(req.user.id, id);
    res.json({ ok: true });
  } catch (e) { failGoogle(res, next, e); }
});

// Sim / Talvez / Não, com nota opcional; `propose: {start, end}` manda a proposta de novo horário na nota (resposta "Talvez" se nada vier).
router.post('/events/:id/respond', requireAuth, async (req, res, next) => {
  const x = extraOf(req);
  const id = x ? req.params.id : googleId(req, res); if (!id) return;
  try {
    const b = req.body || {};
    let response = String(b.response || '');
    let comment = b.comment === undefined ? undefined : String(b.comment).slice(0, 500);
    let propose = null;
    if (b.propose) {
      const r = parseRange(b.propose);
      if (r.error) return res.status(400).json({ message: r.error });
      if (!response) response = 'tentative';
      propose = r;
      comment = proposalComment(r.startISO, r.endISO, b.comment);
    }
    if (!['accepted', 'declined', 'tentative'].includes(response)) return res.status(400).json({ message: 'Resposta inválida (aceitar, recusar ou talvez).' });
    if (x) {
      const ev = await extraRespond(req.user.id, id, response, comment, propose);
      return res.json({ id, myResponse: (ev && ev.myResponse) || response, event: ev && ev.title ? ev : undefined });
    }
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
  const x = extraOf(req);
  const id = x ? req.params.id : googleId(req, res); if (!id) return;
  try {
    const r = parseRange(req.body);
    if (r.error) return res.status(400).json({ message: r.error });
    if (x) return res.json({ event: await extraReschedule(req.user.id, id, r.startISO, r.endISO) });
    if (!await ensureGoogle(req, res)) return;
    res.json({ event: await rescheduleEvent(req.user.id, id, r.startISO, r.endISO) });
  } catch (e) { failGoogle(res, next, e); }
});

// ---------- Minhas agendas (§128): contas extras da própria pessoa. Ninguém mais lista, lê ou altera as agendas de outra pessoa. ----------

router.get('/accounts', requireAuth, async (req, res, next) => {
  try {
    const [principal, status, accounts] = await Promise.all([principalPrefs(req.user.id), getConnectionStatus(req.user.id), listAccounts(req.user.id)]);
    res.json({
      principal: { ...principal, label: principal.label || 'Agenda principal (Google)', connected: status.connected, defaultColor: PRINCIPAL_COLOR },
      accounts,
      colors: ACCOUNT_COLORS,
      max: MAX_ACCOUNTS,
      can: { google: googleConfigured(), googleExternal: googleExtConfigured(), microsoft: microsoftConfigured(), ical: true },
    });
  } catch (e) { next(e); }
});

router.patch('/accounts/principal', requireAuth, async (req, res, next) => {
  try { res.json({ principal: await savePrincipalPrefs(req.user.id, req.body || {}) }); } catch (e) { failGoogle(res, next, e); }
});

router.post('/accounts/ical', requireAuth, async (req, res, next) => {
  try {
    const out = await addIcalAccount(req.user.id, req.body || {});
    res.status(201).json({ ...out, accounts: await listAccounts(req.user.id) });
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ message: e.message });
    res.status(400).json({ message: e && e.code === 'PRIVATE_ADDRESS' ? 'Endereço interno recusado.' : `Não consegui ler a agenda nesse endereço: ${String((e && e.message) || '').slice(0, 160)}` });
  }
});

router.patch('/accounts/:id', requireAuth, async (req, res, next) => {
  try { res.json({ account: await updateAccount(req.user.id, String(req.params.id), req.body || {}) }); } catch (e) { failGoogle(res, next, e); }
});

router.delete('/accounts/:id', requireAuth, async (req, res, next) => {
  try { await removeAccount(req.user.id, String(req.params.id)); res.json({ ok: true }); } catch (e) { failGoogle(res, next, e); }
});
