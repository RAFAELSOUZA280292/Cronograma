// CRM — atividades em aberto do usuário como eventos da Agenda existente
// (server/agenda.js). Função própria pra ser testável sem sessão e pra que a
// Agenda só dependa de UMA chamada isolada em try/catch.
import { pool } from '../db.js';
import { crmCan } from './permissions.js';

export async function crmAgendaEvents(user, startDate, endDate) {
  if (!crmCan(user, 'read')) return [];
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.description, to_char(a.due_date,'YYYY-MM-DD') AS due_date, a.due_time, c.legal_name AS company_name
     FROM crm_activities a JOIN crm_companies c ON c.id = a.company_id
     WHERE a.org_id=$1 AND a.owner_id=$2 AND a.status='open' AND a.deleted_at IS NULL AND c.deleted_at IS NULL AND a.due_date BETWEEN $3::date AND $4::date
     ORDER BY a.due_date, a.due_time`, [user.orgId, user.id, startDate, endDate]);
  return rows.map((a) => {
    const timed = /^\d{2}:\d{2}$/.test(a.due_time || '');
    const start = timed ? `${a.due_date}T${a.due_time}:00-03:00` : a.due_date;
    return {
      id: `crm-activity-${a.id}`, source: 'crm_activity', title: `${a.title} — ${a.company_name}`, description: a.description || 'Atividade do CRM.',
      start, end: timed ? new Date(new Date(start).getTime() + 30 * 60000).toISOString() : a.due_date, allDay: !timed, status: 'confirmed',
    };
  });
}
