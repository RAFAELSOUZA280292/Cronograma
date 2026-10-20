// "Reservar na agenda" (2026-10-19): bloco de agenda por atividade do cronograma, convidando só os e-mails que a equipe digita (equipe PRICETAX; cliente nunca é convidado).
// O organizador é a conta do Google conectada por quem clica (ex.: a conta @pricetax). Mapa atividade → evento fica em `company_calendar_events`, FORA do JSON do projeto
// (o painel regrava o projeto inteiro e uma gravação do servidor poderia ser sobrescrita). Só master e PRICETAX. Pure helpers em companyCalendarPlan.js.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { canAccessProject } from './routes.js';
import { todayInSp } from './widgetSummary.js';
import * as realGcal from './googleCalendar.js';
import {
  DEFAULT_DURATION, DEFAULT_TIME, DURATIONS, MAX_EMAILS, MAX_ITEMS, buildEventBody, candidateActivities, fingerprint, isTime, obsoleteMappings, parseEmails, rowStatus,
} from './companyCalendarPlan.js';

const companyName = (data) => { const c = (data && data.company) || {}; return String(c.nomeFantasia || c.name || 'Empresa').slice(0, 80); };

// Mensagem em português para o erro mais comum: a conexão com o Google venceu ou foi revogada (token expirado/`invalid_grant`).
export function friendlyGoogleError(e) {
  const m = String((e && e.message) || '');
  if (/invalid_grant|invalid authentication credentials|invalid credentials|unauthorized|login required|401/i.test(m) || (e && (e.code === 401 || e.status === 401))) {
    return 'O Google recusou a conexão desta conta (venceu ou foi revogada). Reconecte o Google Calendar em Meu perfil e tente de novo.';
  }
  if (e && (e.code === 403 || /forbidden|insufficient/i.test(m))) return 'O Google não permitiu criar este evento com esta conta (permissão insuficiente).';
  return m || 'Falha no Google Calendar.';
}

export function createCalendarRouter(gcal = realGcal, now = () => todayInSp()) {
  const router = Router();
  router.use(requireAuth, requireMasterOrPricetax);

  async function loadProject(req, res) {
    const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [req.params.projectId]);
    const r = rows[0];
    if (!r || !canAccessProject(req.user, r.data, r.org_id)) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
    return r;
  }
  const loadMappings = async (projectId) => (await pool.query('SELECT * FROM company_calendar_events WHERE project_id=$1', [projectId])).rows;
  const appUrl = () => process.env.APP_BASE_URL || '';

  router.get('/:projectId', async (req, res, next) => {
    try {
      const p = await loadProject(req, res); if (!p) return;
      const today = now();
      const name = companyName(p.data);
      const maps = await loadMappings(p.id);
      const byAct = new Map(maps.map((m) => [m.activity_id, m]));
      const { rows, past } = candidateActivities(p.data, today);
      const ctx = { projectId: p.id, appUrl: appUrl() };
      const out = rows.map((r) => {
        const m = byAct.get(r.activityId);
        return { ...r, status: rowStatus(r, m, name, ctx), time: m ? m.start_time : DEFAULT_TIME, reservedAt: m ? m.updated_at : null };
      });
      const lastEmails = maps.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
      const connected = gcal.googleConfigured() ? (await gcal.getConnectionStatus(req.user.id)).connected : false;
      res.set('Cache-Control', 'no-store');
      res.json({
        google: { configured: gcal.googleConfigured(), connected },
        emails: lastEmails ? lastEmails.emails : [], durationMin: lastEmails ? lastEmails.duration_min : DEFAULT_DURATION, defaultTime: DEFAULT_TIME,
        rows: out, pastCount: past, reservedCount: maps.length, reservedIds: maps.map((m) => m.activity_id),
        obsolete: obsoleteMappings(p.data, maps).map((m) => ({ activityId: m.activity_id, date: m.start_date })),
      });
    } catch (e) { next(e); }
  });

  // Cria ou atualiza os blocos escolhidos e cancela os marcados. Convites e cancelamentos saem por e-mail do Google: só roda com `confirm: true`.
  router.post('/:projectId/apply', async (req, res, next) => {
    try {
      const p = await loadProject(req, res); if (!p) return;
      const b = req.body || {};
      if (b.confirm !== true) return res.status(400).json({ message: 'Confirme o envio dos convites.' });
      const { emails, invalid } = parseEmails(Array.isArray(b.emails) ? b.emails.join(' ') : b.emails);
      const items = Array.isArray(b.items) ? b.items : [];
      const cancel = Array.isArray(b.cancel) ? b.cancel.filter((x) => typeof x === 'string') : [];
      if (invalid.length) return res.status(400).json({ message: `E-mail inválido: ${invalid.slice(0, 3).join(', ')}.` });
      if (items.length && !emails.length) return res.status(400).json({ message: 'Digite ao menos um e-mail da equipe para convidar.' });
      if (emails.length > MAX_EMAILS) return res.status(400).json({ message: `No máximo ${MAX_EMAILS} e-mails por reserva.` });
      if (items.length > MAX_ITEMS) return res.status(400).json({ message: `No máximo ${MAX_ITEMS} atividades por vez.` });
      const durationMin = DURATIONS.includes(Number(b.durationMin)) ? Number(b.durationMin) : DEFAULT_DURATION;
      if (!items.length && !cancel.length) return res.status(400).json({ message: 'Nada selecionado.' });
      if (items.length && gcal.googleConfigured() && !(await gcal.getConnectionStatus(req.user.id)).connected) {
        return res.status(409).json({ message: 'Conecte o Google Calendar (da conta que vai organizar os blocos) em Meu perfil antes de reservar.' });
      }
      const name = companyName(p.data);
      const today = now();
      const cand = new Map(candidateActivities(p.data, today).rows.map((r) => [r.activityId, r]));
      const maps = new Map((await loadMappings(p.id)).map((m) => [m.activity_id, m]));
      const ctx = { projectId: p.id, appUrl: appUrl() };
      const results = [];
      for (const it of items) {
        const row = cand.get(it && it.activityId);
        if (!row) { results.push({ activityId: it && it.activityId, ok: false, error: 'Atividade não está mais disponível para reservar (concluída, passada ou excluída).' }); continue; }
        const time = isTime(it.time) ? it.time : DEFAULT_TIME;
        const body = buildEventBody(row, name, { ...ctx, time, durationMin, emails });
        const fp = fingerprint(body);
        const m = maps.get(row.activityId);
        if (m && m.fingerprint === fp) { results.push({ activityId: row.activityId, title: row.title, ok: true, action: 'igual' }); continue; }
        const organizer = m ? m.organizer_user_id : req.user.id;
        try {
          const ev = await gcal.upsertBlockEvent(organizer, m ? m.google_event_id : null, body);
          await pool.query(
            `INSERT INTO company_calendar_events (project_id, activity_id, organizer_user_id, google_event_id, start_date, start_time, duration_min, emails, fingerprint)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
             ON CONFLICT (project_id, activity_id) DO UPDATE SET google_event_id=$4, start_date=$5, start_time=$6, duration_min=$7, emails=$8::jsonb, fingerprint=$9, updated_at=now()`,
            [p.id, row.activityId, organizer, ev.id, row.date, time, durationMin, JSON.stringify(emails), fp]);
          results.push({ activityId: row.activityId, title: row.title, ok: true, action: m && !ev.created ? 'atualizada' : 'criada', link: ev.htmlLink });
        } catch (e) { results.push({ activityId: row.activityId, title: row.title, ok: false, error: friendlyGoogleError(e) }); }
      }
      for (const id of cancel) {
        const m = maps.get(id);
        if (!m) continue;
        try {
          await gcal.removeBlockEvent(m.organizer_user_id, m.google_event_id);
          await pool.query('DELETE FROM company_calendar_events WHERE project_id=$1 AND activity_id=$2', [p.id, id]);
          results.push({ activityId: id, ok: true, action: 'cancelada' });
        } catch (e) { results.push({ activityId: id, ok: false, error: friendlyGoogleError(e) }); }
      }
      res.json({ results });
    } catch (e) { next(e); }
  });

  return router;
}

export const router = createCalendarRouter();
