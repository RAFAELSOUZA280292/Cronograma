import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { pool, blankXflowTicketData } from './db.js';
import { requireAuth, requireXflowAccess } from './auth.js';
import { effectiveXflowRole, canDo } from './xflowPermissions.js';
import { checkTransition, XFLOW_TERMINAL_STATUSES } from './xflowTransitions.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

// Descrição do BUG agora é rich text (editor no frontend) — guardamos HTML,
// não texto puro. Segunda camada de sanitização (a primeira é no frontend,
// DOMPurify) — nunca confia só no cliente pra isso, é o mesmo espírito de
// "autorização real no backend" do resto do XFlow v2. Allow-list restrita:
// só formatação básica + imagem colada em data: URI (nunca URL remota —
// evita vazamento tipo tracking pixel e a superfície de ataque de src
// externo).
function sanitizeDescriptionHtml(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'font', 'p', 'div', 'br', 'ul', 'ol', 'li', 'blockquote', 'span', 'img'],
    allowedAttributes: { font: ['face'], span: ['style'], img: ['src', 'alt', 'style'], '*': [] },
    allowedStyles: {
      '*': {
        'text-align': [/^left$|^center$|^right$/],
        'font-family': [/^[\w\s,'"-]+$/],
        'font-weight': [/^bold$|^normal$/],
        'font-style': [/^italic$|^normal$/],
        'text-decoration': [/^underline$|^none$/],
      },
    },
    allowedSchemesByTag: { img: ['data'] },
    // allowedSchemesByTag só barra src com esquema reconhecido explícito
    // (ex.: "https://..."); um src sem "://" (ex.: "x", "/algo") passa reto.
    // ExclusiveFilter fecha essa brecha de vez — qualquer <img> cujo src não
    // comece literalmente com "data:image/" é descartado, sem exceção.
    exclusiveFilter: (frame) => frame.tag === 'img' && !(frame.attribs && frame.attribs.src && frame.attribs.src.startsWith('data:image/')),
  });
}

// Buckets de tempo reportáveis (dashboard/gargalos) — cada status ativo
// mapeia pro bucket que ele representa; status fora do mapa não acumulam
// (ex.: 'aberta', que ainda não tem um "tipo de espera" definido).
const STATUS_TO_BUCKET = {
  em_desenvolvimento: 'dev', em_revisao: 'dev', pronta_para_teste: 'dev',
  aguardando_terceiro: 'aguardando_usuario',
  aguardando_gerencia: 'aguardando_gestao',
  bloqueada: 'bloqueado',
  pausada: 'pausado',
  em_homologacao: 'homologacao', pronta_para_publicacao: 'homologacao',
  aguardando_validacao_solicitante: 'aguardando_validacao',
};

// SLA default (usado se a organização não tiver `settings.xflowSla` próprio).
// Resolução é dirigida por severidade (tamanho técnico do problema); primeira
// resposta é dirigida por prioridade (urgência de atenção) — perguntas
// diferentes, cada uma alimentada pelo campo que já responde essa pergunta.
const DEFAULT_SLA = {
  bySeverity: {
    s1: { resolutionMinutes: 480 }, s2: { resolutionMinutes: 1440 },
    s3: { resolutionMinutes: 4320 }, s4: { resolutionMinutes: 10080 },
  },
  byPriority: {
    urgente: { firstResponseMinutes: 30 }, alta: { firstResponseMinutes: 120 },
    normal: { firstResponseMinutes: 480 }, baixa: { firstResponseMinutes: 1440 },
  },
};

async function getSlaConfig(queryable, orgId) {
  const { rows } = await queryable.query('SELECT settings FROM organizations WHERE id=$1', [orgId]);
  const custom = (rows[0] && rows[0].settings && rows[0].settings.xflowSla) || {};
  return {
    bySeverity: { ...DEFAULT_SLA.bySeverity, ...(custom.bySeverity || {}) },
    byPriority: { ...DEFAULT_SLA.byPriority, ...(custom.byPriority || {}) },
  };
}

// Status em que o ticket não está sob controle direto do dev — o relógio de
// SLA de resolução fica pausado enquanto o ticket estiver em qualquer um
// destes (consolidação vem no bloco de fluxo revisado — ver PROJECT_CONTEXT).
const PAUSING_STATUSES = ['aguardando_terceiro', 'aguardando_gerencia', 'pausada', 'bloqueada'];

function computeSlaState(createdAt, dueAt, metAt, pausedSeconds, pausedAt) {
  if (!dueAt) return null;
  if (metAt) return 'cumprido';
  const now = Date.now();
  const totalPausedMs = (pausedSeconds || 0) * 1000 + (pausedAt ? Math.max(0, now - new Date(pausedAt).getTime()) : 0);
  const effectiveDueMs = new Date(dueAt).getTime() + totalPausedMs;
  const remainingMs = effectiveDueMs - now;
  if (remainingMs < 0) return 'vencido';
  const originalWindowMs = new Date(dueAt).getTime() - new Date(createdAt).getTime();
  const thresholdMs = Math.max(originalWindowMs * 0.25, 2 * 60 * 60 * 1000);
  if (remainingMs < thresholdMs) return 'proximo_vencer';
  return 'dentro_prazo';
}

function computeBallHolder(status, ticket) {
  if (XFLOW_TERMINAL_STATUSES.includes(status)) return { type: 'none', userId: null };
  if (status === 'bloqueada' || status === 'pausada') return { type: 'none', userId: null };
  if (status === 'aguardando_terceiro') {
    if (ticket.waiting_on_type === 'cliente' || ticket.waiting_on_type === 'terceiro') return { type: 'terceiro', userId: null };
    return { type: 'reporter', userId: ticket.reporter_id };
  }
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
  'slaPausedAt', 'slaPausedSeconds', 'deleted', 'deletedAt', 'deletedBy',
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
    deleted: row.deleted,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    slaFirstResponseState: computeSlaState(row.created_at, row.sla_first_response_due_at, row.sla_first_response_met_at, 0, null),
    slaResolutionState: computeSlaState(row.created_at, row.sla_resolution_due_at, row.sla_resolution_met_at, row.sla_paused_seconds, row.sla_paused_at),
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
    const wantsTrash = req.query.trash === '1';
    if (wantsTrash && !canDo('restaurar', req.user, null)) {
      return res.status(403).json({ message: 'Só gestão/admin pode ver a Lixeira.' });
    }
    const params = [req.user.orgId];
    let sql = `SELECT * FROM xflow_tickets WHERE org_id=$1 AND deleted=${wantsTrash ? 'true' : 'false'}`;
    if (role === 'reporter') {
      sql += ' AND reporter_id=$2';
      params.push(req.user.id);
    }
    sql += wantsTrash ? ' ORDER BY deleted_at DESC' : ' ORDER BY created_at DESC';
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
    if (data.description) data.description = sanitizeDescriptionHtml(data.description);
    const priority = body.priority || '';
    const slaConfig = await getSlaConfig(pool, req.user.orgId);
    const firstResponseTarget = priority && slaConfig.byPriority[priority];
    const firstResponseDueAt = firstResponseTarget ? new Date(Date.now() + firstResponseTarget.firstResponseMinutes * 60000) : null;
    const { rows } = await pool.query(
      `INSERT INTO xflow_tickets (id, org_id, title, status, severity, priority, suggested_priority, product, reporter_id, assignee_id, data, sla_first_response_due_at)
       VALUES ($1,$2,$3,'aberta',$4,$5,$6,$7,$8,NULL,$9,$10) RETURNING *`,
      [id, req.user.orgId, title, '', priority, priority, body.product || '', req.user.id, JSON.stringify(data), firstResponseDueAt]
    );
    await logEvent(pool, id, req.user.orgId, 'status_change', 'status', null, 'aberta', req.user.id, `${req.user.name} abriu o BUG`);
    res.status(201).json({ ticket: rowToTicket(rows[0]) });
  } catch (e) { next(e); }
});

const EDITABLE_CONTENT_FIELDS = [
  'title', 'description', 'expectedResult', 'reproSteps', 'module', 'affectedUser', 'affectedCompany',
  'environment', 'solution', 'whatToTest', 'impact', 'frequency', 'occurredAt', 'clientType',
];

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
    if (row.deleted && action !== 'restaurar') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Este BUG está na Lixeira — restaure antes de agir sobre ele.' });
    }
    if (!row.deleted && action === 'restaurar') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Este BUG não está na Lixeira.' });
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
      case 'pedir_infos': {
        data.statusBeforeBlock = row.status;
        const waitingOn = ['solicitante', 'cliente', 'terceiro'].includes(payload && payload.waitingOnType) ? payload.waitingOnType : 'solicitante';
        rel.waiting_on_type = waitingOn;
        const waitingLabel = { solicitante: 'solicitante', cliente: 'cliente', terceiro: 'terceiro' }[waitingOn];
        historyNote = `Aguardando resposta de ${waitingLabel}${payload && payload.note ? ` — ${payload.note}` : ''}`;
        break;
      }
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
        data.statusBeforeBlock = row.status;
        historyNote = 'Escalado para gerência/PO';
        break;
      case 'resolver_gerencia':
        data.gerenciaDecision = payload.note;
        historyNote = `Decisão da gerência: ${payload.note}`;
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
        data.flaggedReturned = false;
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
      case 'homolog_aprovar':
        historyNote = 'Homologação aprovada — pronta para publicação';
        break;
      case 'homolog_reprovar':
        rel.homolog_reject_count = (row.homolog_reject_count || 0) + 1;
        data.flaggedReturned = true;
        data.homologRejectReason = payload.note;
        historyNote = `Homologação reprovada — ${payload.note}`;
        break;
      case 'publicar': {
        const parts = [];
        if (payload && payload.version) { data.publishVersion = payload.version; parts.push(`versão ${payload.version}`); }
        if (payload && payload.build) { data.publishBuild = payload.build; parts.push(`build ${payload.build}`); }
        if (payload && payload.release) { data.publishRelease = payload.release; parts.push(`release ${payload.release}`); }
        data.publishedAt = new Date().toISOString();
        historyNote = `Publicado${parts.length ? ` — ${parts.join(', ')}` : ''}`;
        break;
      }
      case 'enviar_validacao':
        historyNote = 'Enviado para validação do solicitante';
        break;
      case 'aprovar_validacao':
        historyNote = `${userName} aprovou a solução`;
        break;
      case 'reprovar_validacao':
        data.flaggedReturned = true;
        historyNote = `${userName} reprovou a solução — voltou para desenvolvimento`;
        break;
      case 'reabrir':
        data.reopenReason = payload.note;
        rel.reopen_count = (row.reopen_count || 0) + 1;
        rel.sla_resolution_met_at = null;
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
        rel.waiting_on_type = '';
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
      case 'excluir':
        rel.deleted = true;
        rel.deleted_at = new Date();
        rel.deleted_by = req.user.id;
        historyNote = `${userName} moveu o BUG para a Lixeira`;
        break;
      case 'restaurar':
        rel.deleted = false;
        rel.deleted_at = null;
        rel.deleted_by = null;
        historyNote = `${userName} restaurou o BUG da Lixeira`;
        break;
      case 'editar_campo': {
        const field = payload && payload.field;
        if (!EDITABLE_CONTENT_FIELDS.includes(field) || payload.value === undefined) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Campo inválido para edição.' });
        }
        if (field === 'title') {
          rel.title = payload.value;
        } else if (field === 'description') {
          data.description = sanitizeDescriptionHtml(payload.value);
        } else {
          data[field] = payload.value;
        }
        historyNote = field === 'title' ? `Título alterado: "${payload.value}"` : `Campo "${field}" atualizado`;
        break;
      }
      case 'mudar_severidade': {
        rel.severity = payload.severity || '';
        historyNote = `Severidade alterada para ${payload.severity || 'sem severidade'}`;
        const slaConfig = await getSlaConfig(client, row.org_id);
        const target = rel.severity && slaConfig.bySeverity[rel.severity];
        rel.sla_resolution_due_at = target ? new Date(new Date(row.created_at).getTime() + target.resolutionMinutes * 60000) : null;
        break;
      }
      case 'mudar_prioridade': {
        rel.priority = payload.priority || '';
        historyNote = `Prioridade alterada para ${payload.priority || 'sem prioridade'}`;
        if (!row.sla_first_response_met_at) {
          const slaConfig = await getSlaConfig(client, row.org_id);
          const target = rel.priority && slaConfig.byPriority[rel.priority];
          rel.sla_first_response_due_at = target ? new Date(new Date(row.created_at).getTime() + target.firstResponseMinutes * 60000) : null;
        }
        break;
      }
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
      case 'remover_anexo': {
        const evId = payload && payload.evidenceId;
        const found = (data.evidence || []).find((e) => e.id === evId);
        if (!found) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Anexo não encontrado.' });
        }
        data.evidence = (data.evidence || []).filter((e) => e.id !== evId);
        historyNote = `Anexo removido: "${found.name}"`;
        break;
      }
      case 'definir_prioridade_sugerida': {
        if (row.suggested_priority) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'A prioridade sugerida já foi definida e não pode ser alterada.' });
        }
        rel.suggested_priority = payload.value || '';
        historyNote = `Prioridade sugerida definida: ${payload.value || 'sem prioridade'}`;
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
    } else if (action === 'resolver_gerencia') {
      finalStatus = data.statusBeforeBlock || 'em_desenvolvimento';
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

      if (row.status === 'aberta' && !row.sla_first_response_met_at) {
        rel.sla_first_response_met_at = new Date();
      }
      if (finalStatus === 'concluida' && rel.sla_resolution_met_at === undefined && !row.sla_resolution_met_at) {
        rel.sla_resolution_met_at = new Date();
      }

      const wasPausing = PAUSING_STATUSES.includes(row.status);
      const willPause = PAUSING_STATUSES.includes(finalStatus);
      if (willPause && !wasPausing && !row.sla_paused_at) {
        rel.sla_paused_at = new Date();
      } else if (!willPause && wasPausing && row.sla_paused_at) {
        const pausedMs = Date.now() - new Date(row.sla_paused_at).getTime();
        rel.sla_paused_seconds = (row.sla_paused_seconds || 0) + Math.max(0, Math.round(pausedMs / 1000));
        rel.sla_paused_at = null;
      }
    }
    if (statusChanged || assigneeChanged) {
      const effectiveAssignee = assigneeChanged ? rel.assignee_id : row.assignee_id;
      const effectiveWaitingOn = rel.waiting_on_type !== undefined ? rel.waiting_on_type : row.waiting_on_type;
      const ball = computeBallHolder(finalStatus, { reporter_id: row.reporter_id, assignee_id: effectiveAssignee, waiting_on_type: effectiveWaitingOn });
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

// Apagar de vez — sem volta, sem log (o próprio ticket deixa de existir).
// Só quem já está na Lixeira pode ser purgado (força passar por excluir
// antes), e só admin (master/superAdmin do Cronograma com xflow_role) pode
// fazer isso — ver xflowPermissions.js.
router.delete('/tickets/:id', requireAuth, requireXflowAccess, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM xflow_tickets WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Ticket não encontrado.' });
    const row = rows[0];
    if (row.org_id !== req.user.orgId) return res.status(403).json({ message: 'Sem acesso a este ticket.' });
    if (!row.deleted) return res.status(400).json({ message: 'Só é possível apagar de vez um BUG que já está na Lixeira.' });
    if (!canDo('purgar', req.user, rowToTicket(row))) {
      return res.status(403).json({ message: 'Só o admin pode apagar um BUG de vez.' });
    }
    await pool.query('DELETE FROM xflow_tickets WHERE id=$1', [id]);
    res.status(204).end();
  } catch (e) { next(e); }
});
