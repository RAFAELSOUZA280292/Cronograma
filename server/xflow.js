import { Router } from 'express';
import { pool, blankXflowTicketData } from './db.js';
import { requireAuth, requireXflowAccess } from './auth.js';
import { effectiveXflowRole, canDo } from './xflowPermissions.js';
import { checkTransition, XFLOW_TERMINAL_STATUSES } from './xflowTransitions.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

// Buckets de tempo reportáveis (dashboard/gargalos) — cada status ativo
// mapeia pro bucket que ele representa; status fora do mapa não acumulam
// (ex.: 'aberta', que ainda não tem um "tipo de espera" definido).
const STATUS_TO_BUCKET = {
  em_desenvolvimento: 'dev', em_revisao: 'dev', pronta_para_teste: 'dev',
  aguardando_informacoes: 'aguardando_usuario', aguardando_usuario: 'aguardando_usuario', aguardando_terceiro: 'aguardando_usuario',
  aguardando_gerencia: 'aguardando_gestao',
  bloqueada: 'bloqueado',
  pausada: 'pausado',
  em_homologacao: 'homologacao',
  aguardando_validacao_solicitante: 'aguardando_validacao',
};

function computeBallHolder(status, ticket) {
  if (XFLOW_TERMINAL_STATUSES.includes(status)) return { type: 'none', userId: null };
  if (status === 'bloqueada' || status === 'pausada') return { type: 'none', userId: null };
  if (status === 'aguardando_informacoes' || status === 'aguardando_usuario') return { type: 'reporter', userId: ticket.reporter_id };
  if (status === 'aguardando_terceiro') return { type: 'terceiro', userId: null };
  if (status === 'aguardando_gerencia') return { type: 'gestao', userId: null };
  if (status === 'aguardando_validacao_solicitante') return { type: 'reporter', userId: ticket.reporter_id };
  return ticket.assignee_id ? { type: 'dev', userId: ticket.assignee_id } : { type: 'triage_queue', userId: null };
}

async function logEvent(client, ticketId, orgId, type, field, oldValue, newValue, userId, note) {
  await client.query(
    `INSERT INTO xflow_events (id, ticket_id, org_id, type, field, old_value, new_value, note, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid('xev'), ticketId, orgId, type, field || null, oldValue != null ? String(oldValue) : null, newValue != null ? String(newValue) : null, note || null, userId]
  );
}

// Campos que vivem em colunas relacionais — tudo mais do objeto plano que o
// frontend recebe vai pra dentro de `data` JSONB.
const RELATIONAL_FIELDS = [
  'id', 'number', 'orgId', 'title', 'status', 'severity', 'priority', 'suggestedPriority',
  'product', 'reporterId', 'assigneeId', 'createdAt', 'updatedAt',
  'statusEnteredAt', 'timeBreakdown', 'ballHolderType', 'ballHolderUserId', 'waitingOnType',
  'reopenCount', 'homologRejectCount',
  'slaFirstResponseDueAt', 'slaFirstResponseMetAt', 'slaResolutionDueAt', 'slaResolutionMetAt',
  'slaPausedAt', 'slaPausedSeconds',
];

function rowToTicket(row) {
  return {
    id: row.id,
    number: row.ticket_number,
    orgId: row.org_id,
    title: row.title,
    status: row.status,
    severity: row.severity,
    priority: row.priority,
    suggestedPriority: row.suggested_priority,
    product: row.product,
    reporterId: row.reporter_id,
    assigneeId: row.assignee_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusEnteredAt: row.status_entered_at,
    timeBreakdown: row.time_breakdown || {},
    ballHolderType: row.ball_holder_type,
    ballHolderUserId: row.ball_holder_user_id,
    waitingOnType: row.waiting_on_type,
    reopenCount: row.reopen_count,
    homologRejectCount: row.homolog_reject_count,
    slaFirstResponseDueAt: row.sla_first_response_due_at,
    slaFirstResponseMetAt: row.sla_first_response_met_at,
    slaResolutionDueAt: row.sla_resolution_due_at,
    slaResolutionMetAt: row.sla_resolution_met_at,
    slaPausedAt: row.sla_paused_at,
    slaPausedSeconds: row.sla_paused_seconds,
    ...row.data,
  };
}

function rowToEvent(row) {
  return {
    id: row.id, ticketId: row.ticket_id, type: row.type, field: row.field,
    oldValue: row.old_value, newValue: row.new_value, note: row.note,
    userId: row.user_id, createdAt: row.created_at,
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
    const role = effectiveXflowRole(req.user);
    const params = [req.user.orgId];
    let sql = 'SELECT * FROM xflow_tickets WHERE org_id=$1';
    if (role === 'reporter') {
      sql += ' AND reporter_id=$2';
      params.push(req.user.id);
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json({ tickets: rows.map(rowToTicket) });
  } catch (e) { next(e); }
});

router.get('/tickets/:id/events', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: ticketRows } = await pool.query('SELECT org_id, reporter_id FROM xflow_tickets WHERE id=$1', [id]);
    if (!ticketRows[0]) return res.status(404).json({ message: 'Ticket não encontrado.' });
    if (ticketRows[0].org_id !== req.user.orgId) return res.status(403).json({ message: 'Sem acesso a este ticket.' });
    const role = effectiveXflowRole(req.user);
    if (role === 'reporter' && ticketRows[0].reporter_id !== req.user.id) {
      return res.status(403).json({ message: 'Sem acesso a este ticket.' });
    }
    const { rows } = await pool.query('SELECT * FROM xflow_events WHERE ticket_id=$1 ORDER BY created_at ASC', [id]);
    res.json({ events: rows.map(rowToEvent) });
  } catch (e) { next(e); }
});

router.post('/tickets', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = (body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Título é obrigatório.' });
    const id = uid('xtk');
    const data = { ...blankXflowTicketData(), ...splitData(body) };
    const priority = body.priority || '';
    const { rows } = await pool.query(
      `INSERT INTO xflow_tickets (id, org_id, title, status, severity, priority, suggested_priority, product, reporter_id, assignee_id, data)
       VALUES ($1,$2,$3,'aberta',$4,$5,$6,$7,$8,NULL,$9) RETURNING *`,
      [id, req.user.orgId, title, '', priority, priority, body.product || '', req.user.id, JSON.stringify(data)]
    );
    await logEvent(pool, id, req.user.orgId, 'status_change', 'status', null, 'aberta', req.user.id, `${req.user.name} abriu o BUG`);
    res.status(201).json({ ticket: rowToTicket(rows[0]) });
  } catch (e) { next(e); }
});

const EDITABLE_CONTENT_FIELDS = ['title', 'description', 'expectedResult', 'reproSteps', 'module', 'affectedUser', 'affectedCompany', 'environment', 'solution', 'whatToTest'];

router.patch('/tickets/:id', requireAuth, requireXflowAccess, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, payload } = req.body || {};
    if (!action) return res.status(400).json({ message: 'Ação não informada.' });

    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM xflow_tickets WHERE id=$1 FOR UPDATE', [id]);
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Ticket não encontrado.' }); }
    const row = rows[0];
    if (row.org_id !== req.user.orgId) { await client.query('ROLLBACK'); return res.status(403).json({ message: 'Sem acesso a este ticket.' }); }

    const role = effectiveXflowRole(req.user);
    if (role === 'reporter' && row.reporter_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Sem acesso a este ticket.' });
    }

    const transition = checkTransition(action, row.status, payload || {});
    if (!transition.ok) { await client.query('ROLLBACK'); return res.status(400).json({ message: transition.reason }); }

    const ticketForPermCheck = rowToTicket(row);
    if (!canDo(transition.def.permission, req.user, ticketForPermCheck, payload)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Você não tem permissão para fazer isso.' });
    }
    if (action === 'fechar_sem_desenvolver' && payload.closureReason === 'descartado_gestao' && !canDo('fechar_motivo_gestao', req.user, ticketForPermCheck)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Só gestão/admin pode descartar um BUG com esse motivo.' });
    }

    const data = { ...row.data };
    const rel = {};
    let historyNote = null;
    const userName = req.user.name;

    switch (action) {
      case 'aceitar':
        rel.assignee_id = req.user.id;
        historyNote = `${userName} aceitou o BUG`;
        break;
      case 'pedir_infos':
        data.statusBeforeBlock = row.status;
        historyNote = 'Solicitadas mais informações ao solicitante';
        break;
      case 'nao_reproduziu':
        data.closureJustification = payload.closureJustification;
        historyNote = 'Marcado como não reproduzido';
        break;
      case 'marcar_duplicado':
        data.duplicateOfTicketId = payload.duplicateOfTicketId;
        data.closureReason = 'duplicado';
        historyNote = `Marcado como duplicado do BUG #${payload.duplicateOfTicketId}`;
        break;
      case 'classificar_nao_bug':
        data.closureReason = 'comportamento_esperado';
        historyNote = 'Classificado como não sendo BUG';
        break;
      case 'escalar_gerencia':
        rel.assignee_id = null;
        historyNote = 'Escalado para gerência/PO';
        break;
      case 'redirecionar': {
        const changes = [];
        if (payload.product && payload.product !== row.product) { rel.product = payload.product; changes.push(`produto → ${payload.product}`); }
        if (payload.module !== undefined && payload.module !== data.module) { data.module = payload.module; changes.push(`módulo → ${payload.module}`); }
        if (payload.assigneeId !== undefined && payload.assigneeId !== row.assignee_id) { rel.assignee_id = payload.assigneeId || null; changes.push('responsável alterado'); }
        if (!changes.length) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Informe ao menos um campo para redirecionar (produto, módulo ou responsável).' }); }
        historyNote = `Redirecionado — ${changes.join(', ')}`;
        break;
      }
      case 'iniciar_dev_direto':
        rel.assignee_id = req.user.id;
        historyNote = 'Desenvolvimento iniciado direto pela triagem';
        break;
      case 'iniciar_desenvolvimento':
        historyNote = 'Desenvolvimento iniciado';
        break;
      case 'enviar_revisao':
        historyNote = 'Enviado para revisão';
        break;
      case 'marcar_pronta_teste':
        if (!row.data.solution || !row.data.whatToTest) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Preencha "Solução aplicada" e "O que testar" antes.' });
        }
        historyNote = 'Marcado pronto para teste';
        break;
      case 'enviar_homologacao':
        historyNote = 'Enviado para homologação';
        break;
      case 'publicar':
        historyNote = 'Publicado';
        break;
      case 'enviar_validacao':
        historyNote = 'Enviado para validação do solicitante';
        break;
      case 'aprovar_validacao':
        historyNote = `${userName} aprovou a solução`;
        break;
      case 'reprovar_validacao':
        historyNote = `${userName} reprovou a solução — voltou para desenvolvimento`;
        break;
      case 'reabrir':
        data.reopenReason = payload.note;
        rel.reopen_count = (row.reopen_count || 0) + 1;
        historyNote = `${userName} reabriu o BUG — ${payload.note}`;
        break;
      case 'bloquear':
        data.statusBeforeBlock = row.status;
        data.blockedReason = payload.blockedReason;
        historyNote = `Bloqueado — ${payload.blockedReason}`;
        break;
      case 'desbloquear':
        historyNote = 'Desbloqueado';
        break;
      case 'pausar':
        data.statusBeforeBlock = row.status;
        historyNote = 'Pausado';
        break;
      case 'retomar':
        historyNote = 'Retomado';
        break;
      case 'fechar_sem_desenvolver':
        data.closureReason = payload.closureReason;
        data.closureJustification = payload.closureJustification;
        if (payload.closureReason === 'duplicado') data.duplicateOfTicketId = payload.duplicateOfTicketId;
        historyNote = `Encerrado sem desenvolvimento — ${payload.closureReason}`;
        break;
      case 'arquivar':
        data.archived = true;
        historyNote = 'Arquivado';
        break;
      case 'desarquivar':
        data.archived = false;
        historyNote = 'Desarquivado';
        break;
      case 'editar_campo': {
        const field = payload && payload.field;
        if (!EDITABLE_CONTENT_FIELDS.includes(field) || payload.value === undefined) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Campo inválido para edição.' });
        }
        if (field === 'title') { rel.title = payload.value; } else { data[field] = payload.value; }
        historyNote = field === 'title' ? `Título alterado: "${payload.value}"` : `Campo "${field}" atualizado`;
        break;
      }
      case 'mudar_severidade':
        rel.severity = payload.severity || '';
        historyNote = `Severidade alterada para ${payload.severity || 'sem severidade'}`;
        break;
      case 'mudar_prioridade':
        rel.priority = payload.priority || '';
        historyNote = `Prioridade alterada para ${payload.priority || 'sem prioridade'}`;
        break;
      case 'reatribuir':
        rel.assignee_id = payload.assigneeId || null;
        historyNote = 'Responsável alterado';
        break;
      case 'editar_prazo_proxima_acao':
        if (payload.dueDate !== undefined) data.dueDate = payload.dueDate;
        if (payload.nextAction !== undefined) data.nextAction = payload.nextAction;
        historyNote = 'Prazo/próxima ação atualizados';
        break;
      case 'comentar': {
        if (!payload || !payload.text || !payload.text.trim()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Comentário vazio.' });
        }
        const comment = { id: uid('xc'), text: payload.text.trim(), ts: new Date().toISOString(), author: userName, authorId: req.user.id, mentions: payload.mentions || [] };
        data.comments = [comment, ...(data.comments || [])];
        historyNote = payload.text.trim();
        break;
      }
      case 'anexar': {
        if (!payload || !payload.evidence) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Anexo inválido.' });
        }
        data.evidence = [...(data.evidence || []), payload.evidence];
        historyNote = `Anexo adicionado: "${payload.evidence.name}"`;
        break;
      }
      default:
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Ação inválida.' });
    }

    let finalStatus = row.status;
    if (action === 'desbloquear') {
      finalStatus = data.statusBeforeBlock || 'em_desenvolvimento';
      data.statusBeforeBlock = '';
      data.blockedReason = '';
    } else if (action === 'retomar') {
      finalStatus = data.statusBeforeBlock || 'aberta';
      data.statusBeforeBlock = '';
    } else if (transition.toStatus) {
      finalStatus = transition.toStatus;
    }

    const statusChanged = finalStatus !== row.status;
    const assigneeChanged = rel.assignee_id !== undefined;

    if (statusChanged) {
      const elapsedMs = Date.now() - new Date(row.status_entered_at).getTime();
      const bucket = STATUS_TO_BUCKET[row.status];
      const nextBreakdown = { ...(row.time_breakdown || {}) };
      if (bucket) nextBreakdown[bucket] = (nextBreakdown[bucket] || 0) + Math.max(0, Math.round(elapsedMs / 1000));
      rel.time_breakdown = nextBreakdown;
      rel.status_entered_at = new Date();
      rel.status = finalStatus;
    }
    if (statusChanged || assigneeChanged) {
      const effectiveAssignee = assigneeChanged ? rel.assignee_id : row.assignee_id;
      const ball = computeBallHolder(finalStatus, { reporter_id: row.reporter_id, assignee_id: effectiveAssignee });
      rel.ball_holder_type = ball.type;
      rel.ball_holder_user_id = ball.userId;
    }

    const setParts = ['data=$1', 'updated_at=now()'];
    const values = [JSON.stringify(data)];
    let pi = 2;
    for (const k of Object.keys(rel)) {
      setParts.push(`${k}=$${pi}`);
      values.push(k === 'time_breakdown' ? JSON.stringify(rel[k]) : rel[k]);
      pi += 1;
    }
    values.push(id);
    const { rows: updated } = await client.query(
      `UPDATE xflow_tickets SET ${setParts.join(', ')} WHERE id=$${pi} RETURNING *`,
      values
    );

    const eventType = statusChanged ? 'status_change' : (action === 'comentar' ? 'comment' : (action === 'anexar' ? 'attachment_added' : 'field_change'));
    await logEvent(client, id, req.user.orgId, eventType, statusChanged ? 'status' : action, statusChanged ? row.status : null, statusChanged ? finalStatus : null, req.user.id, historyNote);

    await client.query('COMMIT');
    res.json({ ticket: rowToTicket(updated[0]) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});
