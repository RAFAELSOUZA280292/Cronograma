import { Router } from 'express';
import { pool, blankXflowTicketData } from './db.js';
import { requireAuth, requireXflowAccess } from './auth.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

// Campos que vivem em colunas relacionais (filtráveis/contáveis) — tudo mais
// do objeto plano que o frontend manda/recebe vai pra dentro de `data` JSONB.
const RELATIONAL_FIELDS = ['id', 'number', 'orgId', 'title', 'status', 'severity', 'priority', 'product', 'reporterId', 'assigneeId', 'createdAt', 'updatedAt'];

function rowToTicket(row) {
  return {
    id: row.id,
    number: row.ticket_number,
    orgId: row.org_id,
    title: row.title,
    status: row.status,
    severity: row.severity,
    priority: row.priority,
    product: row.product,
    reporterId: row.reporter_id,
    assigneeId: row.assignee_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...row.data,
  };
}

function splitData(flatTicket) {
  const data = {};
  Object.keys(flatTicket || {}).forEach((k) => {
    if (!RELATIONAL_FIELDS.includes(k)) data[k] = flatTicket[k];
  });
  return data;
}

export const router = Router();

// Time do XFlow (pra exibir nomes de responsável/repórter e escolher atribuição) —
// rota própria porque GET /api/users exige requireMaster, e reporter/dev comuns
// não são master.
router.get('/team', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, username, xflow_role FROM users WHERE org_id=$1 AND xflow_role != '' ORDER BY name ASC`,
      [req.user.orgId]
    );
    res.json({ team: rows.map((r) => ({ id: r.id, name: r.name, username: r.username, xflowRole: r.xflow_role })) });
  } catch (e) { next(e); }
});

router.get('/tickets', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM xflow_tickets WHERE org_id=$1 ORDER BY created_at DESC', [req.user.orgId]);
    res.json({ tickets: rows.map(rowToTicket) });
  } catch (e) { next(e); }
});

router.post('/tickets', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = (body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Título é obrigatório.' });
    const id = uid('xtk');
    const data = { ...blankXflowTicketData(), ...splitData(body) };
    const { rows } = await pool.query(
      `INSERT INTO xflow_tickets (id, org_id, title, status, severity, priority, product, reporter_id, assignee_id, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, req.user.orgId, title, body.status || 'aberta', body.severity || '', body.priority || '', body.product || '', req.user.id, body.assigneeId || null, JSON.stringify(data)]
    );
    res.status(201).json({ ticket: rowToTicket(rows[0]) });
  } catch (e) { next(e); }
});

router.patch('/tickets/:id', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM xflow_tickets WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Ticket não encontrado.' });
    if (rows[0].org_id !== req.user.orgId) return res.status(403).json({ message: 'Sem acesso a este ticket.' });

    const t = req.body && req.body.ticket;
    if (!t || t.id !== id) return res.status(400).json({ message: 'Payload de ticket inválido.' });
    const data = splitData(t);
    const { rows: updated } = await pool.query(
      `UPDATE xflow_tickets SET title=$1, status=$2, severity=$3, priority=$4, product=$5, assignee_id=$6, data=$7, updated_at=now()
       WHERE id=$8 RETURNING *`,
      [t.title || rows[0].title, t.status || rows[0].status, t.severity || '', t.priority || '', t.product || '', t.assigneeId || null, JSON.stringify(data), id]
    );
    res.json({ ticket: rowToTicket(updated[0]) });
  } catch (e) { next(e); }
});
