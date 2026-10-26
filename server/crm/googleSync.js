// Atividade do CRM ↔ Google Calendar do RESPONSÁVEL (2026-10-26, pedido do Rafael: "quando a Eduarda criar uma atividade para ela, já adicione na
// agenda dela, linkada"). Quem conectou o Google em Agenda ganha o evento sozinho; quem não conectou segue como antes (nada acontece, sem erro).
// - criar/editar/reagendar → cria ou atualiza O MESMO evento (id guardado em crm_activity_google);
// - concluir → título ganha "✔" (o evento fica como registro); cancelar/excluir → o evento é apagado;
// - trocar o responsável → apaga da agenda de quem saiu e cria na de quem entrou.
// Nunca derruba a ação do CRM: qualquer falha do Google só vai para o log. O convite NÃO leva convidados (ninguém recebe e-mail).
import { pool } from '../db.js';
import * as gcal from '../googleCalendar.js';
import { ACTIVITY_SELECT, ACTIVITY_FROM, ACTIVITY_TYPES, activityHooks } from './activities.js';

export async function ensureCrmGoogleSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_activity_google (
      activity_id     UUID PRIMARY KEY REFERENCES crm_activities(id),
      user_id         TEXT NOT NULL,
      google_event_id TEXT NOT NULL,
      html_link       TEXT NOT NULL DEFAULT '',
      synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

// Troca em teste; em produção são as funções reais de googleCalendar.js.
export const deps = {
  upsert: (userId, eventId, body) => gcal.upsertBlockEvent(userId, eventId, body),
  remove: (userId, eventId) => gcal.removeBlockEvent(userId, eventId),
  configured: () => gcal.googleConfigured(),
  baseUrl: () => process.env.APP_BASE_URL || 'https://painel.pricetax.com.br',
};

const PRIORITY = { low: 'baixa', normal: 'normal', high: 'alta' };
const addDay = (d) => new Date(new Date(`${d}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
function plusMinutes(date, time, min) {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + min;
  const dayShift = Math.floor(t / 1440);
  const r = ((t % 1440) + 1440) % 1440;
  const d = dayShift ? new Date(new Date(`${date}T12:00:00Z`).getTime() + dayShift * 86400000).toISOString().slice(0, 10) : date;
  return `${d}T${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}:00-03:00`;
}

export function buildEventBody(a, baseUrl) {
  const type = ACTIVITY_TYPES[a.activity_type] || 'Atividade';
  const done = a.status === 'done';
  const link = `${String(baseUrl).replace(/\/$/, '')}/crm?${a.deal_id ? `negocio=${a.deal_id}` : `empresa=${a.company_id}`}`;
  const lines = [
    `Atividade do CRM PRICETAX · ${type} · prioridade ${PRIORITY[a.priority] || a.priority}${done ? ' · CONCLUÍDA' : ''}`,
    `Empresa: ${a.company_name}`,
    a.deal_title ? `Negócio: ${a.deal_title}` : '',
    a.contact_name ? `Contato: ${a.contact_name}${a.contact_phone || a.contact_whatsapp ? ` · ${a.contact_whatsapp || a.contact_phone}` : ''}${a.contact_email ? ` · ${a.contact_email}` : ''}` : '',
    a.description ? `\n${a.description}` : '',
    done && a.outcome ? `\nResultado: ${a.outcome}` : '',
    `\nAbrir no CRM: ${link}`,
  ].filter(Boolean);
  const date = a.due_date;
  const timed = /^\d{2}:\d{2}$/.test(a.due_time || '');
  return {
    summary: `${done ? '✔ ' : ''}${a.title} — ${a.company_name}`.slice(0, 250),
    description: lines.join('\n'),
    source: { title: 'CRM PRICETAX', url: link },
    colorId: done ? '8' : '5',
    extendedProperties: { private: { crmActivityId: a.id } },
    ...(timed
      ? { start: { dateTime: `${date}T${a.due_time}:00-03:00`, timeZone: 'America/Sao_Paulo' }, end: { dateTime: plusMinutes(date, a.due_time, 30), timeZone: 'America/Sao_Paulo' } }
      : { start: { date }, end: { date: addDay(date) } }),
  };
}

async function dropLink(activityId) { await pool.query('DELETE FROM crm_activity_google WHERE activity_id=$1', [activityId]); }

// Ponto único: chamado depois de criar/editar/concluir/cancelar/reabrir/excluir. `opts.skip` (ex.: transferência em lote silenciosa) não mexe na agenda.
export async function syncActivity(orgId, activityId, opts = {}) {
  if (opts.skip || !deps.configured()) return { status: 'off' };
  try {
    const { rows } = await pool.query(`SELECT ${ACTIVITY_SELECT} FROM ${ACTIVITY_FROM} WHERE a.id=$1 AND a.org_id=$2`, [activityId, orgId]);
    const a = rows[0];
    const { rows: links } = await pool.query('SELECT * FROM crm_activity_google WHERE activity_id=$1', [activityId]);
    const link = links[0];
    const gone = !a || a.deleted_at || a.status === 'cancelled';
    if (gone || !a.owner_id) {
      if (link) { try { await deps.remove(link.user_id, link.google_event_id); } catch (e) { if (e.status !== 409) console.error('CRM→Google (remover):', e.message); } await dropLink(activityId); return { status: 'removed' }; }
      return { status: 'none' };
    }
    if (link && link.user_id !== a.owner_id) {
      try { await deps.remove(link.user_id, link.google_event_id); } catch (e) { if (e.status !== 409) console.error('CRM→Google (trocar dono):', e.message); }
      await dropLink(activityId);
    }
    const cur = link && link.user_id === a.owner_id ? link : null;
    let res;
    try { res = await deps.upsert(a.owner_id, cur ? cur.google_event_id : null, buildEventBody(a, deps.baseUrl())); } catch (e) {
      if (e.status === 409) return { status: 'not-connected' };      // dono não conectou o Google: normal, silencioso
      throw e;
    }
    await pool.query(
      `INSERT INTO crm_activity_google (activity_id, user_id, google_event_id, html_link) VALUES ($1,$2,$3,$4)
       ON CONFLICT (activity_id) DO UPDATE SET user_id=EXCLUDED.user_id, google_event_id=EXCLUDED.google_event_id, html_link=EXCLUDED.html_link, synced_at=now()`,
      [activityId, a.owner_id, res.id, res.htmlLink || '']);
    return { status: res.created === false ? 'updated' : 'created', eventId: res.id };
  } catch (e) {
    console.error('CRM→Google Calendar:', e.message);
    return { status: 'error', error: e.message };
  }
}

// Ids de eventos do Google que são atividades do CRM deste usuário — a Agenda interna esconde o evento do Google e mostra a atividade (que tem o link do CRM).
export async function linkedGoogleEventIds(userId) {
  try {
    const { rows } = await pool.query('SELECT google_event_id FROM crm_activity_google WHERE user_id=$1', [userId]);
    return new Set(rows.map((r) => r.google_event_id));
  } catch { return new Set(); }
}

// Registro no gancho. `actor.skipGoogle` (chave de API / Claude Code, transferência silenciosa) não mexe na agenda de ninguém; RENATA e a tela mexem.
activityHooks.after = (orgId, id, actor) => syncActivity(orgId, id, { skip: !!(actor && (actor.skipGoogle || actor.silentNotify)) });
