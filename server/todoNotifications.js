// Notificações das TAREFAS DE REUNIÃO (Onda 5, §81): atribuída, comentada e vencida. As tarefas vivem dentro do JSON do
// projeto (meetings[].actionItems[]), então "quem é o responsável" é um NOME — mesma heurística de nome usada nas
// atividades de empresa (server/routes.js notifyActivityChanges): bate com um usuário da org (sem diferenciar maiúsculas),
// senão não notifica ninguém. Toda notificação leva `target { kind: 'todo', projectId, meetingId, itemId }` e abre a tarefa.
import { pool } from './db.js';
import { createNotification } from './notifications.js';

const DONE = new Set(['concluida', 'nao-relevante']);
const key = (s) => String(s || '').trim().toLowerCase();
const clip = (s, n = 140) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));

export function todayInSp(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function* liveItems(data) {
  for (const m of (data && data.meetings) || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) if (it && !it.deleted) yield { meeting: m, item: it };
  }
}

// Diferença entre o projeto antes e depois de um PATCH: o que merece aviso. Função pura (testável): devolve a lista de
// { kind: 'assigned'|'comment', item, meeting, comment? } — quem notifica resolve nomes e evita avisar o próprio autor.
export function diffTodoEvents(current, next) {
  const before = new Map();
  for (const { item } of liveItems(current)) before.set(item.id, item);
  const events = [];
  for (const { meeting, item } of liveItems(next)) {
    const prev = before.get(item.id);
    const responsibleChanged = !prev ? !!item.responsible : key(prev.responsible) !== key(item.responsible);
    if (responsibleChanged && item.responsible) events.push({ kind: 'assigned', item, meeting });
    const prevComments = new Set(((prev && prev.comments) || []).map((c) => c.id));
    for (const c of item.comments || []) if (!prevComments.has(c.id)) events.push({ kind: 'comment', item, meeting, comment: c });
  }
  return events;
}

export async function notifyTodoChanges(req, projectId, projectName, current, next) {
  try {
    const events = diffTodoEvents(current, next);
    if (!events.length) return;
    const { rows: orgUsers } = await pool.query('SELECT id, name FROM users WHERE org_id=$1', [req.user.orgId]);
    const byName = new Map(orgUsers.map((u) => [key(u.name), u]));
    const actorName = req.user.name;
    for (const ev of events) {
      const target = { kind: 'todo', projectId, meetingId: ev.meeting.id, itemId: ev.item.id };
      const title = `${ev.item.title || 'Tarefa'} — ${projectName}`;
      const resp = byName.get(key(ev.item.responsible));
      if (ev.kind === 'assigned') {
        if (resp && resp.id !== req.user.id) {
          await createNotification(pool, { orgId: req.user.orgId, userId: resp.id, type: 'todo_assigned', title, actorName,
            body: `${actorName} te definiu como responsável por esta tarefa da reunião "${ev.meeting.title || ''}".`, target });
        }
      } else if (resp && resp.id !== req.user.id) {
        await createNotification(pool, { orgId: req.user.orgId, userId: resp.id, type: 'todo_comment', title, actorName,
          body: `${actorName} comentou na sua tarefa: "${clip(ev.comment.text)}"`, target });
      }
    }
  } catch (e) {
    console.error('Falha ao gerar notificações de tarefa de reunião', e);
  }
}

// Tarefa vencida e ainda aberta → aviso ÚNICO por tarefa (a verificação no próprio banco impede repetir, mesmo com duas
// instâncias). Antes das 7h (Brasília) não avisa. Retorna quantos avisos criou.
export async function runTodoReminders({ now = new Date(), minHour = 7 } = {}) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(now)) % 24;
  if (hour < minHour) return 0;
  const today = todayInSp(now);
  const { rows: projects } = await pool.query('SELECT id, org_id, data FROM projects');
  let created = 0;
  const usersByOrg = new Map();
  for (const p of projects) {
    for (const { meeting, item } of liveItems(p.data)) {
      if (!item.dueDate || item.dueDate >= today || DONE.has(item.status) || !item.responsible) continue;
      if (!usersByOrg.has(p.org_id)) {
        const { rows } = await pool.query(`SELECT id, name FROM users WHERE org_id=$1 AND blocked=false AND role <> 'cliente'`, [p.org_id]);
        usersByOrg.set(p.org_id, new Map(rows.map((u) => [key(u.name), u])));
      }
      const u = usersByOrg.get(p.org_id).get(key(item.responsible));
      if (!u) continue;
      const { rows: seen } = await pool.query(
        `SELECT 1 FROM notifications WHERE user_id=$1 AND type='todo_overdue' AND target->>'itemId'=$2 LIMIT 1`, [u.id, item.id]);
      if (seen.length) continue;
      const [y, m, d] = item.dueDate.split('-');
      await createNotification(pool, {
        orgId: p.org_id, userId: u.id, type: 'todo_overdue', actorName: '',
        title: `${item.title || 'Tarefa'} — ${(p.data && p.data.company && (p.data.company.nomeFantasia || p.data.company.name)) || 'Projeto'}`,
        body: `Tarefa da reunião "${meeting.title || ''}" venceu em ${d}/${m}/${y} e ainda está aberta.`,
        target: { kind: 'todo', projectId: p.id, meetingId: meeting.id, itemId: item.id },
      });
      created += 1;
    }
  }
  return created;
}

let timer = null;
export function startTodoScheduler() {
  if (timer) return;
  const tick = () => runTodoReminders().then((n) => { if (n) console.log(`[todo] ${n} aviso(s) de tarefa vencida enviados`); }).catch((e) => console.error('[todo] lembretes falharam:', e.message));
  timer = setInterval(tick, 30 * 60 * 1000);
  timer.unref();
  setTimeout(tick, 45 * 1000).unref();
}
