// Briefing diário (Onda 3, R3): junta o que merece atenção da pessoa hoje (regras em briefingRules.js), mostra na tela inicial (GET /api/briefing)
// e manda UM aviso por dia pelo sino/push quando há algo a dizer. Sem IA: as regras escolhem e o texto é de modelo fixo, então o custo é zero e
// cada linha diz o porquê. O CRM é lido só se a pessoa tem acesso a ele (negócios dela); empresas/reuniões, só as dela (responsável / ownerIds).
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, rowToUser } from './auth.js';
import { createNotification } from './notifications.js';
import { crmCan } from './crm/permissions.js';
import { openDeals } from './crm/dashboards.js';
import { todayBR } from './crm/service.js';
import {
  BRIEFING_RULES, COLD_DAYS, readBriefingOff, composeBriefing, overdueDeliveries, meetingsWithoutTasks, stalledFromDeals, daysBetween,
} from './briefingRules.js';

const MIN_HOUR_SP = 8;
const INTERVAL_MS = 15 * 60 * 1000;
const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

// Clientes (empresas do CRM) com negócio aberto da pessoa, sem atividade concluída nem nota há mais de COLD_DAYS e sem atividade futura agendada.
export async function coldClients(orgId, userId, today) {
  const { rows } = await pool.query(
    `SELECT c.id, COALESCE(NULLIF(c.trade_name,''), c.legal_name) AS name,
            to_char(last.at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS last_date
     FROM crm_companies c
     LEFT JOIN LATERAL (
       SELECT max(t) AS at FROM (
         SELECT max(a.completed_at) AS t FROM crm_activities a WHERE a.company_id = c.id AND a.status = 'done' AND a.deleted_at IS NULL
         UNION ALL
         SELECT max(n.created_at) FROM crm_notes n WHERE n.company_id = c.id AND n.deleted_at IS NULL
       ) x
     ) last ON true
     WHERE c.org_id = $1 AND c.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM crm_deals d WHERE d.company_id = c.id AND d.owner_id = $2 AND d.status = 'open' AND d.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM crm_activities a WHERE a.company_id = c.id AND a.status = 'open' AND a.deleted_at IS NULL AND a.due_date >= $3::date)
       AND COALESCE(last.at, c.created_at) < ($3::date - ($4::int * interval '1 day'))
     ORDER BY COALESCE(last.at, c.created_at) ASC LIMIT 50`,
    [orgId, userId, today, COLD_DAYS]);
  return rows.map((r) => ({
    kind: 'company', companyId: r.id, company: r.name, lastDate: r.last_date, days: r.last_date ? daysBetween(r.last_date, today) : 0,
  }));
}

// Coleta o briefing de UMA pessoa (user = objeto de rowToUser). `projects` pode vir pronto (o agendador carrega uma vez por base).
export async function collectBriefing(user, { today = todayBR(), projects = null, off = null } = {}) {
  const orgId = user.orgId;
  const offRules = off || readBriefingOff(user.preferences);
  const rows = projects || (await pool.query('SELECT id, data FROM projects WHERE org_id=$1', [orgId])).rows;
  const hasCrm = crmCan(user, 'read');
  const byRule = {};
  const run = async (key, fn) => { if (!offRules.includes(key)) byRule[key] = await fn(); };
  await run('overdue_deliveries', async () => overdueDeliveries(rows, user.name, today));
  await run('meetings_no_tasks', async () => meetingsWithoutTasks(rows, user.id, today));
  if (hasCrm) {
    await run('stalled_deals', async () => stalledFromDeals(await openDeals(orgId, user.id)));
    await run('cold_clients', async () => coldClients(orgId, user.id, today));
  }
  return composeBriefing({ byRule, off: offRules, fmtMoney: money });
}

// Um aviso por pessoa por dia: a linha em briefing_runs é gravada ANTES (ON CONFLICT DO NOTHING), então duas instâncias nunca mandam duas vezes.
// Só depois das 8h de Brasília; sem nada a dizer, não manda nada (mas também não repete a consulta no mesmo dia).
export async function runDailyBriefings({ now = new Date(), minHour = MIN_HOUR_SP } = {}) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(now)) % 24;
  if (hour < minHour) return 0;
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const { rows: users } = await pool.query(
    `SELECT u.* FROM users u WHERE u.blocked = false AND u.role <> 'cliente' AND (u.expires_at IS NULL OR u.expires_at >= now())
       AND NOT EXISTS (SELECT 1 FROM briefing_runs b WHERE b.user_id = u.id AND b.day = $1::date)`, [today]);
  const projectsByOrg = new Map();
  let sent = 0;
  for (const row of users) {
    const user = { ...rowToUser(row), preferences: row.preferences };
    if (!user.orgId) continue;
    const claimed = await pool.query('INSERT INTO briefing_runs (user_id, day) VALUES ($1, $2::date) ON CONFLICT DO NOTHING RETURNING user_id', [user.id, today]);
    if (!claimed.rowCount) continue;
    try {
      if (!projectsByOrg.has(user.orgId)) projectsByOrg.set(user.orgId, (await pool.query('SELECT id, data FROM projects WHERE org_id=$1', [user.orgId])).rows);
      const b = await collectBriefing(user, { today, projects: projectsByOrg.get(user.orgId) });
      await pool.query('UPDATE briefing_runs SET total=$3 WHERE user_id=$1 AND day=$2::date', [user.id, today, b.total]);
      if (!b.total) continue;
      await createNotification(pool, { orgId: user.orgId, userId: user.id, type: 'renata_briefing', actorName: 'RENATA', title: b.title, body: b.body, target: { kind: 'briefing', day: today } });
      sent += 1;
    } catch (e) {
      console.error(`[briefing] falhou para ${user.id}:`, e.message);
    }
  }
  return sent;
}

let timer = null;
export function startBriefingScheduler() {
  if (timer) return;
  const tick = () => runDailyBriefings().then((n) => { if (n) console.log(`[briefing] ${n} briefing(s) diário(s) enviados`); }).catch((e) => console.error('[briefing] agendador falhou:', e.message));
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  setTimeout(tick, 60 * 1000).unref();
}

export const router = Router();
router.use(requireAuth);

// O briefing de agora (calculado na hora) para a tela inicial. Cliente (conta externa) não tem briefing.
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role === 'cliente' || !req.user.orgId) return res.json({ total: 0, sections: [], title: '', body: '', rules: [] });
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.id]);
    const prefs = rows[0] && rows[0].preferences;
    const off = readBriefingOff(prefs);
    const b = await collectBriefing({ ...req.user, preferences: prefs }, { off });
    res.json({ ...b, rules: BRIEFING_RULES.map((r) => ({ key: r.key, label: r.label, off: off.includes(r.key) })) });
  } catch (e) { next(e); }
});
