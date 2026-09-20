// CRM — agendador de lembretes (Fase 3, 2026-09-20, PROJECT_CONTEXT.md §56).
// O servidor não tinha nenhum agendador; este é o primeiro e é minúsculo: a cada
// 10 min avisa (pela Central de Notificações existente) o responsável de cada
// atividade que venceu/vence hoje e ainda não foi avisada. O carimbo
// `due_notified_at` é gravado NA MESMA instrução que escolhe a atividade
// (UPDATE ... RETURNING), então mesmo com duas instâncias rodando ninguém recebe
// duas vezes. Antes das 7h (Brasília) não avisa — ninguém quer notificação de madrugada.
import { pool } from '../db.js';
import { createNotification } from '../notifications.js';
import { todayBR } from './service.js';
import { ACTIVITY_TYPES } from './activities.js';

const INTERVAL_MS = 10 * 60 * 1000;
const MIN_HOUR_SP = 7;

function hourSP(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(now)) % 24;
}
const brDate = (d) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}`;

export async function runReminders({ now = new Date(), minHour = MIN_HOUR_SP } = {}) {
  if (hourSP(now) < minHour) return 0;
  const today = todayBR();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      `UPDATE crm_activities a SET due_notified_at = now()
       FROM crm_companies co, users u
       WHERE co.id = a.company_id AND co.deleted_at IS NULL AND u.id = a.owner_id AND u.blocked = false AND u.role <> 'cliente'
         AND a.status = 'open' AND a.deleted_at IS NULL AND a.due_notified_at IS NULL AND a.due_date <= $1::date
       RETURNING a.id, a.org_id, a.owner_id, a.title, a.company_id, a.deal_id, a.activity_type, a.due_time, to_char(a.due_date,'YYYY-MM-DD') AS due, co.legal_name AS company_name`, [today]);
    for (const r of rows) {
      const late = r.due < today;
      await createNotification(c, {
        orgId: r.org_id, userId: r.owner_id, type: 'crm_activity_due', actorName: '',
        title: late ? 'Atividade do CRM atrasada' : 'Atividade do CRM para hoje',
        body: `${ACTIVITY_TYPES[r.activity_type] || 'Atividade'}: "${r.title}" — ${r.company_name}${late ? ` (venceu em ${brDate(r.due)})` : (r.due_time ? ` às ${r.due_time}` : '')}.`,
        target: { kind: 'crm_activity', companyId: r.company_id, dealId: r.deal_id || null, activityId: r.id },
      });
    }
    await c.query('COMMIT');
    return rows.length;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

let timer = null;
export function startCrmScheduler() {
  if (timer) return;
  const tick = () => runReminders().then((n) => { if (n) console.log(`[crm] ${n} lembrete(s) de atividade enviados`); }).catch((e) => console.error('[crm] falha no agendador de lembretes:', e.message));
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
}
