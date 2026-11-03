// Agenda (2026-08) — junta, num só feed, o Google Calendar conectado do
// usuário com o que já é dele dentro do PRICETAX (TASK do XFlow que ele é
// responsável, atividade de empresa onde o nome dele bate em
// responsible/participants — mesma heurística de nome já usada pra
// notificações em routes.js). Só leitura, um endpoint só. Ver
// PROJECT_CONTEXT.md §22.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { canAccessProject } from './routes.js';
import { isClientUser } from './clientView.js';
import { pool } from './db.js';
import { getConnectionStatus, getAuthedClientForUser, listEvents, respondToEvent, googleConfigured, getEventDetail, findEventByICalUID, savePanelEvent, respondWithNote, rescheduleEvent, cancelPanelEvent } from './googleCalendar.js';
import { brInstant, parseEventForm, parseRange, proposalComment, withDeadline } from './agendaForm.js';
import { crmAgendaEvents } from './crm/agendaFeed.js';
import { linkedGoogleEventIds } from './crm/googleSync.js';
import {
  extraEvents, listAccounts, addIcalAccount, updateAccount, removeAccount, principalPrefs, savePrincipalPrefs, parseEventId,
  extraDetail, extraSave, extraRespond, extraReschedule, extraCancel, PRINCIPAL_COLOR, MAX_ACCOUNTS, ACCOUNT_COLORS,
} from './calendarAccounts.js';
import { googleExtConfigured } from './googleCalendar.js';
import { microsoftConfigured } from './microsoftGraph.js';
import { tidyAnsweredInvites } from './inviteTidy.js';
import {
  teamEvents, listSubscriptions, saveSubscriptions, teamPeople, searchEvents, listTasks, createTask, setTaskDone, deleteTask, createOutOfOffice,
  eventColorOf, cleanSubscriptions, GOOGLE_EVENT_COLORS, TEAM_COLORS, MAX_PEOPLE, normEmail,
} from './agendaTeam.js';

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'Informe start e end (datas ISO).' });
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    if (Number.isNaN(Date.parse(String(start))) || Number.isNaN(Date.parse(String(end)))) return res.status(400).json({ message: 'start e end precisam ser datas válidas (AAAA-MM-DD ou ISO).' });

    const warnings = [];
    const [status, principal, subscriptions] = await Promise.all([
      withDeadline(getConnectionStatus(req.user.id), 10000, 'A conexão com o Google').catch((e) => { console.error('Agenda: status do Google (ignorado):', e.message); warnings.push(e.message); return { connected: false }; }),
      principalPrefs(req.user.id),
      listSubscriptions(req.user.id).catch((e) => { console.error('Agenda: agendas da equipe (ignorado):', e.message); return null; }),
    ]);
    // Um cliente do Google só por requisição (eram três: agenda, tarefas e equipe; token vencido virava três renovações).
    let client = null;
    if (status.connected) {
      try { client = await getAuthedClientForUser(req.user.id); } catch (e) { console.error('Agenda: cliente do Google (ignorado):', e.message); }
    }

    // Blocos independentes ao mesmo tempo (eram em fila: a soma dos prazos chegava a ~1 min); a ordem da lista final é a de antes.
    const googleBlock = async () => {
      if (!status.connected || !principal.calendarEnabled) return [];
      try {
        const [googleEvents, mirrored] = await Promise.all([
          withDeadline(listEvents(req.user.id, start, end, client), 15000, 'O Google Calendar'),
          linkedGoogleEventIds(req.user.id),
        ]);
        // Atividade do CRM espelhada no Google aparece UMA vez: some o evento do Google, fica a atividade (que abre o CRM).
        return googleEvents.filter((ev) => !mirrored.has(String(ev.id || '').replace(/^google-/, ''))).map((ev) => ({ ...ev, account: 'principal', color: eventColorOf(ev.colorId) || principal.color, ...(ev.colorId ? { calendarColor: principal.color } : {}) }));
      } catch (e) {
        console.error('Agenda: falha ao ler o Google Calendar (ignorado):', e.message);
        return { warning: /invalid_grant/i.test(String(e.message)) ? 'A conexão com o Google expirou: reconecte em Meu perfil › Agenda.' : e.deadline ? e.message : 'Não consegui ler o seu Google Calendar agora; o resto da agenda está aqui.' };
      }
    };

    // Agendas extras da pessoa (§128): outra conta Google, Microsoft, link iCal. Só as dela; uma com problema não derruba a tela.
    const extraBlock = () => extraEvents(req.user.id, start, end).catch((e) => { console.error('Agenda: falha ao ler agendas extras (ignorado):', e.message); return { events: [], accounts: [] }; });

    const ticketBlock = async () => {
      const { rows: ticketRows } = await pool.query(
        `SELECT ticket_number, title, data->>'expectedCompletionAt' AS expected FROM xflow_tickets WHERE org_id=$1 AND assignee_id=$2 AND deleted=false`,
        [req.user.orgId, req.user.id]
      );
      return ticketRows.filter((r) => r.expected && r.expected >= startDate && r.expected <= endDate).map((r) => ({
        id: `xflow-completion-${r.ticket_number}`,
        source: 'xflow_ticket',
        title: `TASK #${r.ticket_number} — ${r.title}`,
        description: 'Previsão de conclusão definida no XFlow.',
        start: r.expected,
        end: r.expected,
        allDay: true,
        status: 'confirmed',
        link: `#${r.ticket_number}`,
      }));
    };

    const myName = (req.user.name || '').trim().toLowerCase();
    const activityBlock = async () => {
      if (!myName) return [];
      // Só a empresa e as atividades: o documento inteiro (reuniões, histórico…) passa de 10 MB em produção.
      const { rows: projectRows } = await pool.query("SELECT id, jsonb_build_object('company', data->'company', 'activities', data->'activities') AS data, org_id FROM projects WHERE org_id=$1", [req.user.orgId]);
      const out = [];
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
          out.push({
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
      return out;
    };

    // CRM (Fase 3): atividades em aberto em que o usuário é o responsável. Isolado —
    // se o CRM falhar, a Agenda continua igual à de antes.
    const crmBlock = () => withDeadline(crmAgendaEvents(req.user, startDate, endDate), 10000, 'As atividades do CRM').catch((e) => { console.error('Agenda: falha ao ler atividades do CRM (ignorado):', e.message); return []; });

    // Tarefas do Google com prazo no período (§138). Sem a API ligada ou sem o escopo, simplesmente não aparecem.
    const tasksBlock = () => (status.connected
      ? withDeadline(listTasks(req.user.id, startDate, endDate, client), 8000, 'As Tarefas do Google').catch((e) => { console.error('Agenda: tarefas (ignorado):', e.message); return []; })
      : []);

    // Agendas da equipe assinadas (Outras agendas, §138): só o que o Google libera para a própria pessoa (detalhes ou livre/ocupado).
    const teamBlock = async () => {
      const team = { subscriptions: subscriptions || [], calendars: [] };
      if (!subscriptions) return { team, events: [], warning: 'Não consegui ler as agendas da equipe agora.' };
      try {
        if (status.connected && subscriptions.some((x) => x.show)) {
          const t = await withDeadline(teamEvents(req.user.id, subscriptions, start, end, client), 15000, 'As agendas da equipe');
          team.calendars = t.calendars;
          return { team, events: t.events };
        }
      } catch (e) { console.error('Agenda: agendas da equipe (ignorado):', e.message); return { team, events: [], warning: e.deadline ? e.message : 'Não consegui ler as agendas da equipe agora.' }; }
      return { team, events: [] };
    };

    const [googleRes, extra, ticketEvents, activityEvents, crmEvents, taskEvents, teamRes] = await Promise.all([
      googleBlock(), extraBlock(), ticketBlock(), activityBlock(), crmBlock(), tasksBlock(), teamBlock(),
    ]);
    const events = [];
    if (Array.isArray(googleRes)) events.push(...googleRes); else warnings.push(googleRes.warning);
    events.push(...extra.events, ...ticketEvents, ...activityEvents, ...crmEvents, ...taskEvents, ...teamRes.events);
    if (teamRes.warning) warnings.push(teamRes.warning);
    const { team } = teamRes;

    const principalAccount = {
      id: 'principal', provider: 'google', providerLabel: 'Google', label: principal.label || 'Agenda principal (Google)', color: principal.color,
      calendarEnabled: principal.calendarEnabled, connected: status.connected, privacy: 'pricetax', readOnly: false, status: 'ok', error: '',
    };
    res.json({ connected: status.connected, events, accounts: [principalAccount, ...extra.accounts], team, warnings });
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
// Erro da agenda Microsoft (Fase 3 da varredura, 2026-11-03): em português e com o que fazer; o texto original (inglês) só no log.
function microsoftFail(res, e) {
  const code = e.code;
  const fix = 'Abra Agenda › Minhas agendas, toque em Desconectar na conta Microsoft e conecte de novo.';
  console.warn('[agenda] Microsoft recusou:', code, e.graphCode, String(e.message).slice(0, 300));
  if (code === 404) return res.status(404).json({ message: 'Evento não encontrado nesta agenda. Ele pode ter sido apagado no Outlook; atualize a Agenda.' });
  if (code === 401 || /InvalidAuthenticationToken|TokenExpired/i.test(e.graphCode)) return res.status(409).json({ message: `A conexão com a conta Microsoft expirou. ${fix}` });
  if (code === 403) return res.status(403).json({ message: 'A Microsoft não permitiu esta alteração: só quem criou o compromisso pode mudá-lo, ou a conta não deu permissão de edição. Peça ao organizador ou reconecte a conta em Agenda › Minhas agendas.' });
  if (code === 429 || code === 503) return res.status(503).json({ message: 'A Microsoft pediu para esperar um pouco. Tente de novo em um minuto.' });
  if (code === 400) return res.status(400).json({ message: 'A Microsoft não aceitou os dados do compromisso. Confira data, horário e convidados e tente de novo.' });
  return res.status(502).json({ message: `A Microsoft não respondeu como esperado. Tente de novo em instantes; se continuar, ${fix.charAt(0).toLowerCase()}${fix.slice(1)}` });
}
function failGoogle(res, next, e) {
  if (e && e.status) return res.status(e.status).json({ message: e.message });
  if (e && e.graphCode) return microsoftFail(res, e);
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
    // Respondeu pela Agenda: o e-mail do convite sai da Caixa de entrada também (depois da resposta, sem segurar a tela).
    const tidy = () => tidyAnsweredInvites(req.user.id, { force: true }).catch(() => {});
    if (comment === undefined) {
      const out = await respondToEvent(req.user.id, id, response);
      res.json(out); tidy(); return;
    }
    const ev = await respondWithNote(req.user.id, id, response, comment);
    res.json({ id: ev.id, myResponse: ev.myResponse, event: ev }); tidy();
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
    if (isClientUser(req.user)) return res.status(403).json({ message: 'Agendas extras são só para a equipe PRICETAX.' });
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

// ---------- Agenda como a do Google, parte 2 (§138): equipe, Reunião com…, busca, Tarefas e Ausente ----------
const ISO_OK = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

router.get('/colors', requireAuth, (req, res) => {
  res.json({ event: Object.entries(GOOGLE_EVENT_COLORS).map(([id, [hex, name]]) => ({ id, hex, name })), team: TEAM_COLORS });
});

router.get('/people', requireAuth, async (req, res, next) => {
  try { res.json({ people: await teamPeople(req.user, String(req.query.q || '').slice(0, 80)) }); } catch (e) { next(e); }
});

// "Reunião com…": agenda de até 6 pessoas no período, sem assinar (some ao fechar).
router.get('/with', requireAuth, async (req, res, next) => {
  try {
    const emails = [...new Set(String(req.query.emails || '').split(',').map(normEmail).filter(Boolean))].slice(0, MAX_PEOPLE);
    if (!emails.length) return res.status(400).json({ message: 'Escolha com quem.' });
    if (!ISO_OK(req.query.start) || !ISO_OK(req.query.end)) return res.status(400).json({ message: 'Informe start e end (datas ISO).' });
    if (!await ensureGoogle(req, res)) return;
    const subs = cleanSubscriptions(emails.map((email, i) => ({ email, color: TEAM_COLORS[(i + 3) % TEAM_COLORS.length] })), '');
    res.json(await withDeadline(teamEvents(req.user.id, subs, req.query.start, req.query.end), 15000, 'As agendas dessas pessoas'));
  } catch (e) { if (e && e.deadline) return res.status(504).json({ message: e.message }); failGoogle(res, next, e); }
});

router.get('/team', requireAuth, async (req, res, next) => {
  try { res.json({ subscriptions: await listSubscriptions(req.user.id) }); } catch (e) { next(e); }
});
router.put('/team', requireAuth, async (req, res, next) => {
  try {
    const list = (req.body || {}).subscriptions;
    if (!Array.isArray(list)) return res.status(400).json({ message: 'Envie a lista de agendas.' });
    res.json({ subscriptions: await saveSubscriptions(req.user.id, list) });
  } catch (e) { next(e); }
});

// Busca nos seus compromissos do Google (um ano para trás e um para frente, como a lupa do Google Agenda).
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ message: 'Digite pelo menos 2 letras.' });
    if (!await ensureGoogle(req, res)) return;
    res.json({ events: await withDeadline(searchEvents(req.user.id, q), 15000, 'A busca no Google') });
  } catch (e) { if (e && e.deadline) return res.status(504).json({ message: e.message }); failGoogle(res, next, e); }
});

router.post('/tasks', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ message: 'Dê um título à tarefa.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) return res.status(400).json({ message: 'Informe o prazo da tarefa.' });
    if (!await ensureGoogle(req, res)) return;
    res.status(201).json({ task: await createTask(req.user.id, { title, date: b.date, notes: String(b.notes || '').slice(0, 4000) }) });
  } catch (e) { if (e && e.code && e.status) return res.status(e.status).json({ message: e.message, code: e.code }); failGoogle(res, next, e); }
});
const TASK_ID = /^gtask-([A-Za-z0-9_-]{1,200})$/;
router.patch('/tasks/:id', requireAuth, async (req, res, next) => {
  const m = TASK_ID.exec(String(req.params.id || '')); if (!m) return res.status(400).json({ message: 'Tarefa inválida.' });
  try { res.json({ task: await setTaskDone(req.user.id, m[1], !!(req.body || {}).done) }); } catch (e) { if (e && e.code && e.status) return res.status(e.status).json({ message: e.message, code: e.code }); failGoogle(res, next, e); }
});
router.delete('/tasks/:id', requireAuth, async (req, res, next) => {
  const m = TASK_ID.exec(String(req.params.id || '')); if (!m) return res.status(400).json({ message: 'Tarefa inválida.' });
  try { await deleteTask(req.user.id, m[1]); res.json({ ok: true }); } catch (e) { if (e && e.code && e.status) return res.status(e.status).json({ message: e.message, code: e.code }); failGoogle(res, next, e); }
});

// Ausente: bloco "Fora do escritório" do Google, que recusa sozinho os convites no período (com a mensagem, se pedir).
router.post('/out-of-office', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const r = parseRange({ start: b.start, end: b.end });
    if (r.error && !/12 horas/.test(r.error)) return res.status(400).json({ message: r.error });
    const s = Date.parse(b.start); const e = Date.parse(b.end);
    if (!(e > s)) return res.status(400).json({ message: 'O fim precisa ser depois do início.' });
    if (e - s > 60 * 86400000) return res.status(400).json({ message: 'No máximo 60 dias de ausência de uma vez.' });
    if (!await ensureGoogle(req, res)) return;
    const ev = await createOutOfOffice(req.user.id, { startISO: new Date(s).toISOString(), endISO: new Date(e).toISOString(), autoDecline: b.autoDecline !== false, message: String(b.message || ''), title: String(b.title || '').trim().slice(0, 120) });
    res.status(201).json({ event: ev });
  } catch (e) { failGoogle(res, next, e); }
});
