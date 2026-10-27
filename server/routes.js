import { notifyTodoChanges } from './todoNotifications.js';
import { Router } from 'express';
import { pool, blankProject, blankPersonalBoard } from './db.js';
import { instantiateStandard } from './standardTemplateStore.js';
import { isISODate } from './standardTemplate.js';
import {
  hashPassword, comparePassword, signToken, setAuthCookie, clearAuthCookie,
  rowToUser, findUserByUsername, findUserById, requireAuth, requireMaster, requireMasterOrPricetax, requireSuperAdmin, optionalAuth, toISODateSafe,
} from './auth.js';
import { lookupCnpj, cleanCnpj, formatCnpj } from './cnpjLookup.js';
import { createNotification, rowToNotification } from './notifications.js';
import { sanitizeBoardNotes } from './richNote.js';
import { readExtras, buildExtrasPatch } from './personalExtras.js';
import { allowReport, formatClientError } from './clientError.js';
import { symbolicate, MAPS_DIR } from './sourcemaps.js';
import { readMuted, publicCategories, loadMutedPatterns, NOTIFICATION_CATEGORIES, TODAY_SOURCES, readTodayHidden, publicTodaySources } from './notificationPrefs.js';
import { syncProjectMemoryFromDiff } from './memoryIngest.js';
import { CRM_ROLES } from './crm/permissions.js';
import { searchProjectMemory } from './memoryRetrieval.js';
import { recordAccess, noteVisit, noteFirstUse, accessSummary, recentAccess } from './accessLog.js';
import { recordUsage } from './usageLog.js';
import { usagePolicy } from './usagePolicy.js';
import { syncCardEvents, getActivityStats, getDayDetail, cardEventsOf } from './personalActivity.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function canAccessProject(user, project, orgId) {
  if (!user || !project) return false;
  if (user.isSuperAdmin) return true;
  if (user.orgId !== orgId) return false;
  if (!user.companiesAccess) return false;
  if (user.allCompaniesAccess) return true;
  const cnpj = project.company && project.company.cnpj;
  return !!cnpj && (user.allowedCnpjs || []).includes(cnpj);
}

// Central de Notificações — geração pro lado Empresas (2026-08). Ao
// contrário do XFlow (ações discretas), atividade é salva como o
// projeto INTEIRO de uma vez (autosave), então a única forma de saber
// "o que mudou de fato" é comparar o estado antes/depois aqui, no
// momento do PATCH. `responsible`/`participants` são nomes de texto
// livre (papel/departamento na empresa, ver PROJECT_CONTEXT.md §20) —
// só vira notificação quando o nome bate exatamente com o de algum
// usuário real da org (case-insensitive); não bate com nenhum usuário,
// não notifica ninguém (comportamento normal pra papéis como
// "Financeiro"/"Fiscal" que não são uma pessoa logada).
async function notifyActivityChanges(req, projectId, projectName, current, next_) {
  try {
    const currentById = new Map((current.activities || []).map((a) => [a.id, a]));
    const { rows: orgUsers } = await pool.query('SELECT id, name FROM users WHERE org_id=$1', [req.user.orgId]);
    if (!orgUsers.length) return;
    const byName = new Map(orgUsers.map((u) => [u.name.trim().toLowerCase(), u]));
    const actorName = req.user.name;
    for (const a of (next_.activities || [])) {
      if (a.deleted) continue;
      const before = currentById.get(a.id);
      const beforeCommentIds = new Set(((before && before.comments) || []).map((c) => c.id));
      for (const c of (a.comments || [])) {
        if (beforeCommentIds.has(c.id)) continue;
        for (const mentionedId of (c.mentions || [])) {
          if (!mentionedId || mentionedId === req.user.id) continue;
          await createNotification(pool, {
            orgId: req.user.orgId, userId: mentionedId, type: 'activity_mention',
            title: `${a.title} — ${projectName}`,
            body: `${actorName} mencionou você em um comentário: "${(c.text || '').length > 140 ? `${c.text.slice(0, 140)}…` : (c.text || '')}"`,
            actorName, target: { kind: 'activity', projectId, activityId: a.id },
          });
        }
      }
      if (!before) continue;
      if (a.responsible && a.responsible !== before.responsible) {
        const u = byName.get(a.responsible.trim().toLowerCase());
        if (u && u.id !== req.user.id) {
          await createNotification(pool, {
            orgId: req.user.orgId, userId: u.id, type: 'activity_assigned',
            title: `${a.title} — ${projectName}`,
            body: `${actorName} te definiu como responsável por esta atividade.`,
            actorName, target: { kind: 'activity', projectId, activityId: a.id },
          });
        }
      }
      const beforeParticipants = new Set((before.participants || []));
      for (const name of (a.participants || [])) {
        if (beforeParticipants.has(name)) continue;
        const u = byName.get((name || '').trim().toLowerCase());
        if (u && u.id !== req.user.id) {
          await createNotification(pool, {
            orgId: req.user.orgId, userId: u.id, type: 'activity_linked',
            title: `${a.title} — ${projectName}`,
            body: `${actorName} te vinculou a esta atividade.`,
            actorName, target: { kind: 'activity', projectId, activityId: a.id },
          });
        }
      }
    }
  } catch (e) {
    console.error('Falha ao gerar notificações de atividade', e);
  }
}

function sameOrg(req, targetOrgId) {
  return req.user.isSuperAdmin || req.user.orgId === targetOrgId;
}

// Super Admin pode "entrar" numa organização específica passando ?asOrg=<id>
// (só respeitado quando isSuperAdmin — qualquer outro usuário sempre usa a própria org).
// Exportada (Fase 8) pra server/knowledge.js resolver orgId do mesmo
// jeito que todo o resto do admin já resolve — nunca duplicar essa regra.
export function effectiveOrgId(req) {
  if (req.user.isSuperAdmin && req.query.asOrg) return req.query.asOrg;
  return req.user.orgId;
}

export const router = Router();

// ---------- Auth ----------

router.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Informe usuário e senha.' });
    }
    const row = await findUserByUsername(username);
    if (!row) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    if (!row.blocked && row.expires_at && toISODateSafe(row.expires_at) < todayISO()) {
      await pool.query(
        `UPDATE users SET blocked = true, block_reason = 'Acesso expirado', updated_at = now() WHERE id = $1`,
        [row.id]
      );
      return res.status(403).json({ message: 'Acesso expirado. Fale com um PRICETAX Master para renovar.' });
    }
    if (row.blocked) {
      return res.status(403).json({ message: row.block_reason || 'Acesso bloqueado. Fale com um PRICETAX Master.' });
    }

    const ok = await comparePassword(password, row.password_hash);
    if (!ok) {
      recordAccess(row.id, 'login_failed', req);
      return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
    }

    const token = signToken(row.id);
    setAuthCookie(res, token);
    recordAccess(row.id, 'login', req);
    res.json({ user: rowToUser(row) });
  } catch (e) { next(e); }
});

// Trocar senha direto na tela de login (2026-08, pedido do Rafael) — pra
// quando o usuário só quer trocar a senha antiga sem precisar entrar
// primeiro e depois abrir "Meu perfil". Mesma checagem de bloqueio/
// expiração do login normal antes de aceitar a troca.
router.post('/auth/change-password-login', async (req, res, next) => {
  try {
    const { username, currentPassword, newPassword } = req.body || {};
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Preencha usuário, senha atual e nova senha.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ message: 'A nova senha precisa ter pelo menos 4 caracteres.' });
    }
    const row = await findUserByUsername(username);
    if (!row) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    if (!row.blocked && row.expires_at && toISODateSafe(row.expires_at) < todayISO()) {
      await pool.query(
        `UPDATE users SET blocked = true, block_reason = 'Acesso expirado', updated_at = now() WHERE id = $1`,
        [row.id]
      );
      return res.status(403).json({ message: 'Acesso expirado. Fale com um PRICETAX Master para renovar.' });
    }
    if (row.blocked) {
      return res.status(403).json({ message: row.block_reason || 'Acesso bloqueado. Fale com um PRICETAX Master.' });
    }

    const ok = await comparePassword(currentPassword, row.password_hash);
    if (!ok) return res.status(401).json({ message: 'Senha atual incorreta.' });

    const hash = await hashPassword(newPassword);
    const { rows } = await pool.query(
      `UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2 RETURNING *`,
      [hash, row.id]
    );
    const token = signToken(row.id);
    setAuthCookie(res, token);
    recordAccess(row.id, 'login', req);
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({});
});

router.get('/auth/me', requireAuth, (req, res) => {
  noteVisit(req.user.id, req);
  res.json({ user: req.user });
});

router.post('/activity/ping', requireAuth, (req, res) => {
  noteFirstUse(req.user.id, req);
  res.json({ ok: true });
});

// Rastreador de uso (Central de Inteligência Operacional): fatias de tempo e ações pontuais, só da equipe. Nunca guarda conteúdo.
router.post('/activity/usage', requireAuth, async (req, res, next) => {
  try {
    const r = await recordUsage(req.user, req.body || {});
    res.json({ ok: true, stored: r.stored });
  } catch (e) { next(e); }
});

// Transparência: toda a equipe pode ler como o uso é medido.
router.get('/activity/policy', requireAuth, (req, res) => res.json({ policy: usagePolicy() }));

router.patch('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const { avatar } = req.body || {};
    if (typeof avatar !== 'string' || avatar.length > 16) {
      return res.status(400).json({ message: 'Avatar inválido.' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET avatar=$1, updated_at=now() WHERE id=$2 RETURNING *`,
      [avatar, req.user.id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/auth/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'A nova senha precisa ter pelo menos 4 caracteres.' });
    }
    const row = await findUserById(req.user.id);
    const ok = await comparePassword(currentPassword || '', row.password_hash);
    if (!ok) return res.status(401).json({ message: 'Senha atual incorreta.' });
    const hash = await hashPassword(newPassword);
    await pool.query(`UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`, [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Pessoas que podem ser @mencionadas em comentários (Onda 3): só a equipe PRICETAX da org da pessoa; cliente não enxerga a equipe.
router.get('/mentions/users', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'master' && req.user.role !== 'pricetax') return res.json({ users: [] });
    const orgId = effectiveOrgId(req) || req.user.orgId;
    const { rows } = await pool.query(
      `SELECT id, name FROM users WHERE org_id=$1 AND role IN ('master','pricetax') AND blocked = false AND (expires_at IS NULL OR expires_at > now()) ORDER BY name ASC`, [orgId]);
    res.json({ users: rows.map((r) => ({ id: r.id, name: r.name })) });
  } catch (e) { next(e); }
});

// ---------- Users (master only) ----------

router.get('/users', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const sql = req.user.isSuperAdmin && !orgId
      ? 'SELECT * FROM users ORDER BY created_at ASC'
      : 'SELECT * FROM users WHERE org_id=$1 ORDER BY created_at ASC';
    const params = req.user.isSuperAdmin && !orgId ? [] : [orgId];
    const { rows } = await pool.query(sql, params);
    res.json({ users: rows.map(rowToUser), access: await accessSummary(rows.map((r) => r.id)) });
  } catch (e) { next(e); }
});

router.get('/users/:id/access', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const target = await findUserById(req.params.id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json({ events: await recentAccess(target.id) });
  } catch (e) { next(e); }
});

router.post('/users', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { username, password, name, email, role, cnpj, allowedCnpjs, avatar, personalOnly, xflowRole, companiesAccess, allCompaniesAccess, personalAccess } = req.body || {};
    if (!username || !password || !name || !role) {
      return res.status(400).json({ message: 'Usuário, senha, nome e papel são obrigatórios.' });
    }
    const existing = await findUserByUsername(username);
    if (existing) return res.status(409).json({ message: 'Usuário já existe.' });

    const hash = await hashPassword(password);
    const id = uid('user');
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, password_hash, name, email, role, cnpj, allowed_cnpjs, avatar, personal_only, org_id, xflow_role, companies_access, all_companies_access, personal_access)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, username, hash, name, email || '', role, cnpj || '', JSON.stringify(allowedCnpjs || []), avatar || '', !!personalOnly, effectiveOrgId(req), xflowRole || '', !!companiesAccess, !!allCompaniesAccess, personalAccess !== undefined ? !!personalAccess : true]
    );
    res.status(201).json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.patch('/users/:id', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });

    if (patch.username && patch.username !== target.username) {
      const dup = await findUserByUsername(patch.username);
      if (dup) return res.status(409).json({ message: 'Usuário já existe.' });
    }

    const next_ = {
      username: patch.username ?? target.username,
      name: patch.name ?? target.name,
      email: patch.email ?? target.email,
      role: patch.role ?? target.role,
      cnpj: patch.cnpj ?? target.cnpj,
      allowed_cnpjs: JSON.stringify(patch.allowedCnpjs !== undefined ? patch.allowedCnpjs : (target.allowed_cnpjs || [])),
      expires_at: patch.expiresAt !== undefined ? (patch.expiresAt || null) : target.expires_at,
      avatar: patch.avatar !== undefined ? patch.avatar : target.avatar,
      personal_only: patch.personalOnly !== undefined ? !!patch.personalOnly : target.personal_only,
      xflow_role: patch.xflowRole !== undefined ? (patch.xflowRole || '') : target.xflow_role,
      companies_access: patch.companiesAccess !== undefined ? !!patch.companiesAccess : target.companies_access,
      all_companies_access: patch.allCompaniesAccess !== undefined ? !!patch.allCompaniesAccess : target.all_companies_access,
      personal_access: patch.personalAccess !== undefined ? !!patch.personalAccess : target.personal_access,
      crm_role: patch.crmRole !== undefined ? (CRM_ROLES.includes(patch.crmRole) ? patch.crmRole : '') : (target.crm_role || ''),
    };
    const { rows } = await pool.query(
      `UPDATE users SET username=$1, name=$2, email=$3, role=$4, cnpj=$5, allowed_cnpjs=$6, expires_at=$7, avatar=$8, personal_only=$9, xflow_role=$10, companies_access=$11, all_companies_access=$12, personal_access=$13, crm_role=$14, updated_at=now()
       WHERE id=$15 RETURNING *`,
      [next_.username, next_.name, next_.email, next_.role, next_.cnpj, next_.allowed_cnpjs, next_.expires_at, next_.avatar, next_.personal_only, next_.xflow_role, next_.companies_access, next_.all_companies_access, next_.personal_access, next_.crm_role, id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/block', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { blocked, blockReason } = req.body || {};
    if (id === req.user.id && blocked) {
      return res.status(400).json({ message: 'Você não pode bloquear a si mesmo.' });
    }
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const { rows } = await pool.query(
      `UPDATE users SET blocked=$1, block_reason=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [!!blocked, blocked ? (blockReason || 'Bloqueado manualmente') : '', id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/renew', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const days = Number(req.body && req.body.days) || 30;
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const iso = newDate.toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `UPDATE users SET expires_at=$1, blocked=false, block_reason='', updated_at=now() WHERE id=$2 RETURNING *`,
      [iso, id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/reset-password', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'Senha muito curta.' });
    }
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const hash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`,
      [hash, id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/users/:id', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ message: 'Você não pode remover a si mesmo.' });

    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });

    if (target.role === 'master') {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role='master' AND org_id=$1`, [target.org_id]);
      if (rows[0].n <= 1) return res.status(400).json({ message: 'Deixe pelo menos um administrador.' });
    }
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Projects ----------

router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const sql = req.user.isSuperAdmin && !orgId
      ? 'SELECT data, org_id FROM projects ORDER BY created_at ASC'
      : 'SELECT data, org_id FROM projects WHERE org_id=$1 ORDER BY created_at ASC';
    const params = req.user.isSuperAdmin && !orgId ? [] : [orgId];
    const { rows } = await pool.query(sql, params);
    const visible = rows.filter((r) => canAccessProject(req.user, r.data, r.org_id)).map((r) => r.data);
    res.json({ projects: visible });
  } catch (e) { next(e); }
});

// "BIP" de sincronização entre usuários (2026-09-10, pedido do Rafael:
// "amanda concluindo lá, conclui aqui também") — sem WebSocket/infra
// nova de propósito (mesma filosofia de "não introduzir infra
// desnecessária" já usada pra decisão de busca lexical em vez de
// pgvector, §27). O frontend faz polling barato disso (só id+timestamp,
// nunca o JSONB inteiro) e só busca a lista completa de novo
// (`GET /projects`, já existente) quando alguma empresa mudou desde a
// última checagem — dá sincronização "quase em tempo real" (poucos
// segundos) sem servidor de WebSocket, sem pub/sub, sem dependência
// nova.
router.get('/projects/versions', requireAuth, async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const sql = req.user.isSuperAdmin && !orgId
      ? 'SELECT id, data, org_id, updated_at FROM projects'
      : 'SELECT id, data, org_id, updated_at FROM projects WHERE org_id=$1';
    const params = req.user.isSuperAdmin && !orgId ? [] : [orgId];
    const { rows } = await pool.query(sql, params);
    const visible = rows.filter((r) => canAccessProject(req.user, r.data, r.org_id));
    res.json({ versions: visible.map((r) => ({ id: r.id, updatedAt: r.updated_at })) });
  } catch (e) { next(e); }
});

// Lista leve (id + nome) pra picker de cliente (ex.: tag de escopo dos Pareceres) — nunca o JSONB
// inteiro de cada projeto, que já é pesado (é por isso que Pareceres guarda o PDF numa tabela
// própria em vez de embutir em `projects.data`, ver PROJECT_CONTEXT.md §48).
router.get('/projects/lite', requireAuth, async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const sql = req.user.isSuperAdmin && !orgId
      ? 'SELECT id, data, org_id FROM projects ORDER BY created_at ASC'
      : 'SELECT id, data, org_id FROM projects WHERE org_id=$1 ORDER BY created_at ASC';
    const params = req.user.isSuperAdmin && !orgId ? [] : [orgId];
    const { rows } = await pool.query(sql, params);
    const visible = rows.filter((r) => canAccessProject(req.user, r.data, r.org_id));
    res.json({ projects: visible.map((r) => ({ id: r.id, name: (r.data.company && (r.data.company.nomeFantasia || r.data.company.name)) || 'Sem nome' })) });
  } catch (e) { next(e); }
});

router.post('/projects', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const project = blankProject();
    const company = (req.body && req.body.company) || {};
    if (company.cnpj) {
      const digits = cleanCnpj(company.cnpj);
      company.cnpj = digits.length === 14 ? formatCnpj(digits) : company.cnpj;
    }
    project.company = { ...project.company, ...company };

    // Empresa nova segue a versão MAIS RECENTE do cronograma padrão da organização (datas = kickoff + dias de cada atividade). Clonar manda as
    // atividades prontas e não passa por aqui. Se algo falhar, nasce com o modelo de sempre (blankProject) em vez de impedir o cadastro.
    let standardSummary = null;
    if (!Array.isArray(req.body.activities)) {
      try {
        const kick = isISODate(req.body.kickoffDate) ? req.body.kickoffDate : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        const std = await instantiateStandard(effectiveOrgId(req), kick);
        if (std) {
          project.activities = std.activities; project.phases = std.phases; project.team = std.team; project.standardVersion = std.version; standardSummary = std.summary;
          const sm = std.summary;
          const partes = [sm.compressed && `${sm.compressed} com prazo comprimido (passava do limite da norma)`, sm.lateAtBirth && `${sm.lateAtBirth} já nascem vencidas`, sm.orderConflicts && `${sm.orderConflicts} com predecessora vencendo depois`].filter(Boolean);
          project.log = [{ ts: new Date().toISOString(), action: `Cronograma criado pelo padrão ${std.version}.0 (kickoff ${kick.split('-').reverse().join('/')}): ${sm.total} subatividades${partes.length ? `; ${partes.join('; ')}` : ''}`, user: req.user.name || '' }, ...(project.log || [])];
        }
      } catch (e) { console.error('Cronograma padrão indisponível, usando o modelo de sempre:', e.message); }
    }

    if (Array.isArray(req.body.activities)) project.activities = req.body.activities;
    if (Array.isArray(req.body.phases)) project.phases = req.body.phases;
    if (Array.isArray(req.body.team)) project.team = req.body.team;
    if (Array.isArray(req.body.log)) project.log = req.body.log;

    await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1, $2, $3)', [project.id, JSON.stringify(project), effectiveOrgId(req)]);

    if (req.user.companiesAccess && !req.user.allCompaniesAccess && project.company.cnpj) {
      const cnpj = project.company.cnpj;
      const { rows } = await pool.query('SELECT allowed_cnpjs FROM users WHERE id=$1', [req.user.id]);
      const current = (rows[0] && rows[0].allowed_cnpjs) || [];
      if (!current.includes(cnpj)) {
        await pool.query('UPDATE users SET allowed_cnpjs=$1, updated_at=now() WHERE id=$2', [JSON.stringify([...current, cnpj]), req.user.id]);
      }
    }

    res.status(201).json({ project, standardSummary });
  } catch (e) { next(e); }
});

router.post('/cnpj/lookup', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { cnpj } = req.body || {};
    const result = await lookupCnpj(cnpj);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete('/projects/:id', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    if (!canAccessProject(req.user, rows[0].data, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a este projeto.' });
    }
    await pool.query('DELETE FROM projects WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/projects/:id/team-candidates', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    const project = rows[0].data;
    if (!canAccessProject(req.user, project, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a este projeto.' });
    }
    const cnpj = (project.company && project.company.cnpj) || '';
    const { rows: userRows } = await pool.query(
      `SELECT id, name, role, username FROM users WHERE org_id=$1 AND (role IN ('master','pricetax') OR (role='cliente' AND cnpj=$2)) ORDER BY name ASC`,
      [rows[0].org_id, cnpj]
    );
    res.json({ users: userRows });
  } catch (e) { next(e); }
});

router.patch('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    const current = rows[0].data;
    if (!canAccessProject(req.user, current, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a este projeto.' });
    }
    const next_ = req.body && req.body.project;
    if (!next_ || next_.id !== id) {
      return res.status(400).json({ message: 'Payload de projeto inválido.' });
    }
    await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(next_), id]);
    const projectName = (next_.company && (next_.company.nomeFantasia || next_.company.name)) || 'Empresa';
    await notifyActivityChanges(req, id, projectName, current, next_);
    await notifyTodoChanges(req, id, projectName, current, next_);
    res.json({ project: next_ });
    // Reindexação da memória do projeto (Assistente Inteligente de
    // Projetos, Fase 1) — só SQL local (sem chamada de IA nesta fase),
    // fire-and-forget depois da resposta, mesmo padrão de todo efeito
    // colateral assíncrono já usado no resto do sistema.
    syncProjectMemoryFromDiff(pool, rows[0].org_id, id, current, next_)
      .catch((e) => console.error('Falha ao reindexar memória do projeto', e.message));
  } catch (e) { next(e); }
});

// Registrar uma reunião inteira de uma vez (2026-10-26): título, data, participantes, transcrição, resumo, decisões e tarefas. Faz o mesmo que preencher a aba
// Reuniões à mão, mas numa transação travada (não pisa em quem está editando) e sem limite de tamanho prático no texto. Só equipe PRICETAX. Idempotente: mesma
// data + mesmo título já registrados → 409 (a menos que `force`). O responsável de cada tarefa precisa ser da equipe da empresa (senão fica vazio).
router.post('/projects/:id/meetings', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  const clipS = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const b = req.body || {};
  const title = clipS(b.title, 200);
  const date = String(b.date || '');
  if (!title) return res.status(400).json({ message: 'Informe o título da reunião.' });
  if (!isISODate(date)) return res.status(400).json({ message: 'Informe a data da reunião (AAAA-MM-DD).' });
  const time = /^\d{2}:\d{2}$/.test(String(b.time || '')) ? b.time : '';
  const participants = [...new Set((Array.isArray(b.participants) ? b.participants : []).map((x) => clipS(x, 120)).filter(Boolean))].slice(0, 40);
  const items = (Array.isArray(b.actionItems) ? b.actionItems : []).slice(0, 60);
  const via = clipS(b.via, 40);
  const who = `${req.user.name || req.user.username}${via ? ` (via ${via})` : ''}`;
  const client = await pool.connect();
  let before; let after; let row; let created;
  try {
    await client.query('BEGIN');
    const q = await client.query('SELECT id, org_id, data FROM projects WHERE id=$1 FOR UPDATE', [req.params.id]);
    row = q.rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Projeto não encontrado.' }); }
    if (!canAccessProject(req.user, row.data, row.org_id)) { await client.query('ROLLBACK'); return res.status(403).json({ message: 'Sem acesso a este projeto.' }); }
    before = row.data;
    const data = structuredClone(row.data);
    const dup = (data.meetings || []).find((m) => !m.deleted && m.date === date && String(m.title).trim().toLowerCase() === title.toLowerCase());
    if (dup && !b.force) { await client.query('ROLLBACK'); return res.status(409).json({ message: `Já existe a reunião "${dup.title}" em ${date}.`, meetingId: dup.id }); }
    const now = new Date().toISOString();
    const team = new Map((data.team || []).map((t) => [String(t.name || '').trim().toLowerCase(), t.name]));
    const id = `mtg-${Math.random().toString(36).slice(2, 9)}`;
    const actionItems = items.map((it) => ({
      id: `mai-${Math.random().toString(36).slice(2, 9)}`, title: clipS(it.title, 300), responsible: team.get(String(it.responsible || '').trim().toLowerCase()) || '',
      owner: it.owner === 'cliente' ? 'cliente' : 'pricetax', dueDate: isISODate(it.dueDate) ? it.dueDate : '', status: 'nao-iniciado', deleted: false, subtitle: '',
      notes: clipS(it.notes, 2000), subtasks: [], comments: [], attachments: [], createdBy: who, createdAt: now,
    })).filter((it) => it.title);
    created = { id, title, date, time, participants, transcript: String(b.transcript || '').slice(0, 400000), summary: clipS(b.summary, 20000), decisions: clipS(b.decisions, 20000), actionItems, createdAt: now, deleted: false, deletedAt: '', deletedBy: '' };
    data.meetings = [...(data.meetings || []), created];
    // Participantes novos viram contato externo reutilizável (sugestão nas próximas reuniões), sem repetir quem já existe.
    const known = new Set((data.externalContacts || []).map((c) => String(c.name || '').trim().toLowerCase()));
    const teamNames = new Set([...team.keys()]);
    data.externalContacts = [...(data.externalContacts || []), ...participants.filter((n) => !known.has(n.toLowerCase()) && !teamNames.has(n.toLowerCase())).map((name) => ({ name, email: '' }))];
    data.log = [{ ts: now, action: `Reunião registrada: "${title}" (${date}) com ${actionItems.length} tarefa(s) — ${who}`, user: who, activityId: null }, ...(Array.isArray(data.log) ? data.log : [])].slice(0, 300);
    after = data;
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(after), req.params.id]);
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* já encerrada */ } client.release(); return next(e); }
  client.release();
  const projectName = (after.company && (after.company.nomeFantasia || after.company.name)) || 'Empresa';
  notifyTodoChanges(req, req.params.id, projectName, before, after).catch(() => {});
  syncProjectMemoryFromDiff(pool, row.org_id, req.params.id, before, after).catch((e) => console.error('Falha ao reindexar memória do projeto', e.message));
  res.status(201).json({ meeting: { id: created.id, title: created.title, date: created.date, participants: created.participants, actionItems: created.actionItems.map((a) => ({ id: a.id, title: a.title, responsible: a.responsible, dueDate: a.dueDate })) } });
});

// Ajustar o cronograma de uma empresa por operações (mesmo motor do /api/connect/companies/:id/plan, mas pela sessão — 2026-10-26): activity.set/add, sub.set/add/move/delete…
// Padrão é SIMULAR (dryRun); só grava com `dryRun:false`. Transação travada; só administrador (master). Registra no Log da empresa e devolve as operações de desfazer.
router.post('/projects/:id/plan', requireAuth, requireMaster, async (req, res, next) => {
  const ops = req.body && req.body.ops;
  if (!Array.isArray(ops) || !ops.length || ops.length > 100) return res.status(400).json({ message: 'Envie de 1 a 100 operações em "ops".' });
  const dryRun = !(req.body && req.body.dryRun === false);
  const note = String((req.body && req.body.note) || '').trim().slice(0, 300);
  const via = String((req.body && req.body.via) || '').trim().slice(0, 40);
  const { applyPlanOps } = await import('./connect.js');
  const client = await pool.connect();
  let r; let out;
  try {
    await client.query('BEGIN');
    r = (await client.query('SELECT id, org_id, data FROM projects WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!r) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Projeto não encontrado.' }); }
    if (!canAccessProject(req.user, r.data, r.org_id)) { await client.query('ROLLBACK'); return res.status(403).json({ message: 'Sem acesso a este projeto.' }); }
    const who = `${req.user.name || req.user.username}${via ? ` (via ${via})` : ''}`;
    out = applyPlanOps(r.data, ops, who);
    if (out.errors.length) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Nada foi gravado: há operações inválidas.', errors: out.errors }); }
    if (dryRun) { await client.query('ROLLBACK'); return res.json({ dryRun: true, applied: 0, wouldApply: out.results.length, results: out.results }); }
    out.next.log = [{ ts: new Date().toISOString(), action: `Cronograma ajustado: ${out.results.length} alteração(ões) — ${who}${note ? `. ${note}` : ''}`, user: who, activityId: null }, ...(Array.isArray(out.next.log) ? out.next.log : [])].slice(0, 300);
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(out.next), r.id]);
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* já encerrada */ } client.release(); return next(e); }
  client.release();
  res.json({ dryRun: false, applied: out.results.length, results: out.results, created: out.created, undo: out.undo });
  syncProjectMemoryFromDiff(pool, r.org_id, r.id, r.data, out.next).catch((e) => console.error('Falha ao reindexar memória após ajuste do cronograma', e.message));
});

// Rota interna de verificação da Fase 1 do Assistente Inteligente de
// Projetos — NÃO é o chat (que ainda não existe, ver PROJECT_CONTEXT.md).
// Só permite provar que a memória do projeto está sendo indexada e
// recuperada corretamente, com o mesmo isolamento de acesso de qualquer
// outra rota de projeto.
router.post('/_internal/memory-search', requireAuth, async (req, res, next) => {
  try {
    const { projectId, query, participant, meetingId, dateFrom, dateTo, kind, limit } = req.body || {};
    if (!projectId) return res.status(400).json({ message: 'Informe projectId.' });
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [projectId]);
    if (!rows[0]) return res.status(404).json({ message: 'Empresa não encontrada.' });
    if (!canAccessProject(req.user, rows[0].data, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a essa empresa.' });
    }
    const results = await searchProjectMemory(pool, {
      orgId: rows[0].org_id, projectId, query, participant, meetingId, dateFrom, dateTo, kind, limit,
    });
    res.json({ results });
  } catch (e) { next(e); }
});

// ---------- Personal board (per-user, not tied to any company) ----------

router.get('/personal-board', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT data, updated_at FROM personal_boards WHERE user_id=$1', [req.user.id]);
    if (rows[0]) return res.json({ board: rows[0].data, updatedAt: rows[0].updated_at });
    const board = blankPersonalBoard();
    const ins = await pool.query('INSERT INTO personal_boards (user_id, data) VALUES ($1,$2) RETURNING updated_at', [req.user.id, JSON.stringify(board)]);
    res.json({ board, updatedAt: ins.rows[0].updated_at });
  } catch (e) { next(e); }
});

// Versão barata do quadro (só o carimbo): o cliente consulta de tempos em tempos para saber se OUTRA origem (a API de conectividade,
// §80, ou o quadro público) alterou o quadro, e recarrega quando não há edição local pendente.
router.get('/personal-board/version', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT updated_at FROM personal_boards WHERE user_id=$1', [req.user.id]);
    res.json({ updatedAt: rows[0] ? rows[0].updated_at : null });
  } catch (e) { next(e); }
});

// Rede de segurança contra perda silenciosa: o painel salva o quadro INTEIRO. Se uma atividade foi criada pela API depois da última
// versão que este cliente conheceu (`baseUpdatedAt`), ela não pode ter sido apagada por ele — então é devolvida ao quadro antes de gravar.
export function mergeApiCards(stored, incoming, baseUpdatedAt) {
  if (!stored || !Array.isArray(stored.boards) || !incoming || !Array.isArray(incoming.boards) || !baseUpdatedAt) return { board: incoming, merged: 0 };
  const known = new Set();
  for (const b of incoming.boards) for (const c of b.columns || []) for (const k of c.cards || []) known.add(k.id);
  let merged = 0;
  const boards = incoming.boards.map((b) => ({ ...b, columns: (b.columns || []).map((c) => ({ ...c, cards: [...(c.cards || [])] })) }));
  for (const sb of stored.boards) {
    for (const sc of sb.columns || []) {
      for (const card of sc.cards || []) {
        if (card.createdVia !== 'api' || known.has(card.id) || !card.createdAt || card.createdAt <= baseUpdatedAt) continue;
        const board = boards.find((b) => b.id === sb.id) || boards[0];
        if (!board || !board.columns.length) continue;
        const col = board.columns.find((c) => c.id === sc.id) || board.columns[0];
        col.cards.push(card);
        known.add(card.id);
        merged += 1;
      }
    }
  }
  return { board: merged ? { ...incoming, boards } : incoming, merged };
}

// O carimbo viaja como ISO com milissegundos; o banco guarda microssegundos. Compara no milissegundo.
export function sameStamp(a, b) {
  const x = new Date(a).getTime(); const y = new Date(b).getTime();
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

router.patch('/personal-board', requireAuth, async (req, res, next) => {
  const incoming = req.body && req.body.board;
  if (!incoming) return res.status(400).json({ message: 'Payload inválido.' });
  sanitizeBoardNotes(incoming);
  const base = typeof req.body.baseUpdatedAt === 'string' ? req.body.baseUpdatedAt : '';
  // `mergeable` (2026-10-27, §117): o painel novo sabe juntar o quadro quando outra aba/pessoa gravou antes. Nesse caso uma gravação feita
  // em cima de versão antiga NÃO sobrescreve: o servidor devolve 409 com o quadro atual e o painel funde e reenvia. Painéis antigos
  // (sem a flag) seguem como antes.
  const mergeable = req.body.mergeable === true;
  let saved;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT data, updated_at FROM personal_boards WHERE user_id=$1 FOR UPDATE', [req.user.id]);
    if (mergeable && base && cur.rows[0] && !sameStamp(cur.rows[0].updated_at, base)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ message: 'O quadro foi alterado em outro lugar.', conflict: true, board: cur.rows[0].data, updatedAt: cur.rows[0].updated_at });
    }
    const { board, merged } = cur.rows[0] ? mergeApiCards(cur.rows[0].data, incoming, base) : { board: incoming, merged: 0 };
    const up = await client.query(
      `INSERT INTO personal_boards (user_id, data) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET data=$2, updated_at=now() RETURNING updated_at`,
      [req.user.id, JSON.stringify(board)]
    );
    await client.query('COMMIT');
    saved = { board, updatedAt: up.rows[0].updated_at, merged: merged > 0 };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ }
    client.release();
    return next(e);
  }
  client.release();
  try {
    await syncCardEvents(pool, req.user.id, saved.board);
    res.json(saved);
  } catch (e) { next(e); }
});

router.get('/personal-board/stats', requireAuth, async (req, res, next) => {
  try {
    const d = parseInt(req.query.days, 10);
    const days = Number.isInteger(d) && d > 0 && d <= 3650 ? d : null;
    const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [req.user.id]);
    const data = rows[0] ? rows[0].data : blankPersonalBoard();
    await syncCardEvents(pool, req.user.id, data);
    const { withoutOpenDate, closedWithoutDate } = cardEventsOf(data);
    const stats = await getActivityStats(pool, req.user.id, days);
    res.json({ ...stats, days, withoutOpenDate, closedWithoutDate });
  } catch (e) { next(e); }
});

router.get('/personal-board/stats/day', requireAuth, async (req, res, next) => {
  try {
    const date = String(req.query.date || '');
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
    if (!valid) return res.status(400).json({ message: 'Data inválida.' });
    const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [req.user.id]);
    const data = rows[0] ? rows[0].data : blankPersonalBoard();
    await syncCardEvents(pool, req.user.id, data);
    res.json(await getDayDetail(pool, req.user.id, date, data));
  } catch (e) { next(e); }
});

// ---------- Notificações (2026-08) ----------
// Central global — mesma lista/contador nas 3 telas (Empresas, Gestão de
// Atividades, XFlow), ver PROJECT_CONTEXT.md §20. Geração acontece perto
// de cada evento (server/xflow.js pra TASK, notifyActivityChanges() acima
// pra atividade de empresa); aqui só é leitura/estado (lida/não lida).

router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const muted = await loadMutedPatterns(pool, req.user.id);
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 AND NOT (type LIKE ANY($2::text[])) ORDER BY created_at DESC LIMIT 200',
      [req.user.id, muted]
    );
    res.json({ notifications: rows.map(rowToNotification) });
  } catch (e) { next(e); }
});

// Quais categorias o usuário quer ver — por usuário, fica salvo até ele mudar (users.preferences.notifications).
router.get('/notifications/preferences', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.id]);
    const prefs = rows[0] && rows[0].preferences;
    res.json({ categories: publicCategories(readMuted(prefs)), todaySources: publicTodaySources(readTodayHidden(prefs)) });
  } catch (e) { next(e); }
});

router.put('/notifications/preferences', requireAuth, async (req, res, next) => {
  try {
    const { muted, todayHidden } = req.body || {};
    const validCat = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));
    const validSrc = new Set(TODAY_SOURCES.map((x) => x.source));
    const patch = {};
    if (muted !== undefined) {
      if (!Array.isArray(muted) || muted.some((k) => !validCat.has(k))) return res.status(400).json({ message: 'Categoria de notificação desconhecida.' });
      patch.muted = [...new Set(muted)];
    }
    if (todayHidden !== undefined) {
      if (!Array.isArray(todayHidden) || todayHidden.some((k) => !validSrc.has(k))) return res.status(400).json({ message: 'Origem do painel Hoje desconhecida.' });
      patch.todayHidden = [...new Set(todayHidden)];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ message: 'Nada para salvar.' });
    // Mescla dentro de preferences.notifications (muted e todayHidden são independentes) e preserva o resto de preferences.
    const { rows } = await pool.query(
      `UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{notifications}',
         COALESCE(preferences->'notifications', '{}'::jsonb) || $1::jsonb, true) WHERE id=$2 RETURNING preferences`,
      [JSON.stringify(patch), req.user.id]
    );
    const prefs = rows[0] && rows[0].preferences;
    res.json({ categories: publicCategories(readMuted(prefs)), todaySources: publicTodaySources(readTodayHidden(prefs)) });
  } catch (e) { next(e); }
});

// Anotações rápidas e atalhos da pessoa (users.preferences.personalExtras) — fora do quadro porque o quadro pode ter link público.
router.get('/personal-extras', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.id]);
    res.json(readExtras(rows[0] && rows[0].preferences));
  } catch (e) { next(e); }
});

router.put('/personal-extras', requireAuth, async (req, res, next) => {
  try {
    const { patch, error } = buildExtrasPatch(req.body);
    if (error) return res.status(400).json({ message: error });
    const { rows } = await pool.query(
      `UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{personalExtras}',
         COALESCE(preferences->'personalExtras', '{}'::jsonb) || $1::jsonb, true) WHERE id=$2 RETURNING preferences`,
      [JSON.stringify(patch), req.user.id]
    );
    res.json(readExtras(rows[0] && rows[0].preferences));
  } catch (e) { next(e); }
});

// Erro de tela capturado por um limite de erro do navegador → uma linha no log do servidor. Só com login, com limite por pessoa.
router.post('/client-error', requireAuth, (req, res) => {
  res.status(204).end(); // responde já; a tradução da pilha e o log acontecem depois, sem fazer o navegador esperar
  if (!allowReport(req.user.id, req.body && req.body.kind)) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  Promise.all([symbolicate(body.stack, MAPS_DIR), symbolicate(body.componentStack, MAPS_DIR)])
    .then(([stack, componentStack]) => console.error('[client-error]', formatClientError(req.user, { ...body, stack, componentStack })))
    .catch(() => console.error('[client-error]', formatClientError(req.user, body)));
});

router.patch('/notifications/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { read } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE notifications SET read=$1 WHERE id=$2 AND user_id=$3 RETURNING *',
      [!!read, id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Notificação não encontrada.' });
    res.json({ notification: rowToNotification(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/notifications/read-all', requireAuth, async (req, res, next) => {
  try {
    const muted = await loadMutedPatterns(pool, req.user.id);
    await pool.query('UPDATE notifications SET read=true WHERE user_id=$1 AND read=false AND NOT (type LIKE ANY($2::text[]))', [req.user.id, muted]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Chamado quando o usuário efetivamente acessa a ocorrência (abre a
// atividade) — regra do Rafael: só sai do contador quando lida OU quando
// acessada, nunca só por abrir o painel do sino.
router.post('/notifications/mark-read-for-target', requireAuth, async (req, res, next) => {
  try {
    const { kind, ticketId, projectId, activityId } = req.body || {};
    if (!kind) return res.status(400).json({ message: 'kind é obrigatório.' });
    const conds = ['user_id=$1', 'read=false', "target->>'kind'=$2"];
    const params = [req.user.id, kind];
    if (ticketId) { params.push(ticketId); conds.push(`target->>'ticketId'=$${params.length}`); }
    if (projectId) { params.push(projectId); conds.push(`target->>'projectId'=$${params.length}`); }
    if (activityId) { params.push(activityId); conds.push(`target->>'activityId'=$${params.length}`); }
    await pool.query(`UPDATE notifications SET read=true WHERE ${conds.join(' AND ')}`, params);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Public board sharing (per-board link; anonymous = read-only, logged-in = full edit) ----------
// Nenhuma tabela nova: cada board dentro do JSONB carrega seu próprio shareToken/visibility.
// A busca abaixo varre todas as linhas de personal_boards (poucas dezenas de usuários hoje) —
// não escala pra milhares de usuários, mas evita criar um índice relacional só pra isso.

async function findBoardByShareToken(token) {
  const { rows } = await pool.query('SELECT user_id, data, updated_at FROM personal_boards');
  for (const row of rows) {
    const boards = (row.data && row.data.boards) || [];
    const idx = boards.findIndex((b) => b.shareToken && b.shareToken === token);
    if (idx !== -1) return { ownerId: row.user_id, ownerData: row.data, boardIndex: idx, board: boards[idx], updatedAt: row.updated_at };
  }
  return null;
}

router.get('/public-board/:token', optionalAuth, async (req, res, next) => {
  try {
    const found = await findBoardByShareToken(req.params.token);
    if (!found || found.board.visibility !== 'public') {
      return res.status(404).json({ message: 'Link inválido ou o quadro não é mais público.' });
    }
    let ownerName = '';
    if (req.user && req.user.id === found.ownerId) {
      ownerName = req.user.name;
    } else {
      const ownerRow = await findUserById(found.ownerId);
      ownerName = ownerRow ? ownerRow.name : '';
    }
    // isOwner/alreadyLinked (2026-09-20): a página do link mostra "Adicionar ao
    // meu quadro" só pra quem está logado, não é o dono e ainda não fixou.
    let alreadyLinked = false;
    if (req.user && req.user.id !== found.ownerId) {
      const { rows: mine } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [req.user.id]);
      alreadyLinked = !!(mine[0] && ((mine[0].data && mine[0].data.linkedBoards) || []).some((l) => l.token === req.params.token));
    }
    res.json({ board: found.board, updatedAt: found.updatedAt, canEdit: !!req.user, ownerName, isOwner: !!req.user && req.user.id === found.ownerId, alreadyLinked });
  } catch (e) { next(e); }
});

// Fixa o quadro compartilhado de outra pessoa como uma aba no Gestão de
// Atividades do usuário logado (2026-09-20, pedido do Rafael). Nada é copiado:
// guarda só {token, nome em cache, dono}; o conteúdo é sempre o do dono, lido
// pelo mesmo link público — então perde o acesso se o dono deixar de
// compartilhar ou regenerar o link (a aba avisa e deixa remover). Exportada
// pra ser testável sem sessão HTTP.
export async function addLinkedBoard(user, token) {
  const found = await findBoardByShareToken(token);
  if (!found || found.board.visibility !== 'public') return { status: 404, message: 'Link inválido ou o quadro não é mais público.' };
  if (found.ownerId === user.id) return { status: 400, message: 'Esse quadro já é seu.' };
  const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [user.id]);
  const data = rows[0] ? rows[0].data : blankPersonalBoard();
  const linked = data.linkedBoards || [];
  const existing = linked.find((l) => l.token === token);
  if (existing) return { status: 200, entry: existing, already: true };
  const ownerRow = await findUserById(found.ownerId);
  const entry = { token, name: found.board.name || 'Quadro compartilhado', ownerName: ownerRow ? ownerRow.name : '', addedAt: new Date().toISOString() };
  await pool.query(
    `INSERT INTO personal_boards (user_id, data) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET data=$2, updated_at=now()`,
    [user.id, JSON.stringify({ ...data, linkedBoards: [...linked, entry] })],
  );
  return { status: 201, entry, already: false };
}

router.post('/personal-board/linked', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.personalAccess) return res.status(403).json({ message: 'Você não tem acesso à Gestão de Atividades.' });
    const token = req.body && req.body.token;
    if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Informe o link do quadro.' });
    const result = await addLinkedBoard(req.user, token);
    if (result.message) return res.status(result.status).json({ message: result.message });
    res.status(result.status).json({ entry: result.entry, already: result.already });
  } catch (e) { next(e); }
});

router.patch('/public-board/:token', requireAuth, async (req, res, next) => {
  try {
    const patchedBoard = req.body && req.body.board;
    if (!patchedBoard) return res.status(400).json({ message: 'Payload inválido.' });
    sanitizeBoardNotes(patchedBoard);
    const found = await findBoardByShareToken(req.params.token);
    if (!found || found.board.visibility !== 'public') {
      return res.status(404).json({ message: 'Link inválido ou o quadro não é mais público.' });
    }
    if (patchedBoard.id !== found.board.id) {
      return res.status(400).json({ message: 'Quadro inválido.' });
    }
    const base = typeof req.body.baseUpdatedAt === 'string' ? req.body.baseUpdatedAt : '';
    const mergeable = req.body.mergeable === true;
    let nextData; let updatedAt;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Relê o quadro do dono TRAVADO: o dono (ou outra pessoa) pode ter gravado entre a busca acima e agora.
      const cur = await client.query('SELECT data, updated_at FROM personal_boards WHERE user_id=$1 FOR UPDATE', [found.ownerId]);
      const ownerData = cur.rows[0] && cur.rows[0].data;
      const idx = ownerData && Array.isArray(ownerData.boards) ? ownerData.boards.findIndex((b) => b.id === patchedBoard.id && b.shareToken === req.params.token) : -1;
      if (idx === -1) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ message: 'Link inválido ou o quadro não é mais público.' }); }
      if (mergeable && base && !sameStamp(cur.rows[0].updated_at, base)) {
        await client.query('ROLLBACK'); client.release();
        return res.status(409).json({ message: 'O quadro foi alterado em outro lugar.', conflict: true, board: ownerData.boards[idx], updatedAt: cur.rows[0].updated_at });
      }
      nextData = { ...ownerData, boards: ownerData.boards.map((b, i) => (i === idx ? patchedBoard : b)) };
      const up = await client.query('UPDATE personal_boards SET data=$1, updated_at=now() WHERE user_id=$2 RETURNING updated_at', [JSON.stringify(nextData), found.ownerId]);
      updatedAt = up.rows[0].updated_at;
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ }
      client.release();
      throw e;
    }
    client.release();
    await syncCardEvents(pool, found.ownerId, nextData);
    res.json({ board: patchedBoard, updatedAt });
  } catch (e) { next(e); }
});

// ---------- Public meeting sharing (per-meeting link, SÓ LEITURA) ----------
// Mesmo espírito do public-board acima (token dentro do próprio JSONB,
// scan de todos os projetos — poucas dezenas de empresas hoje), mas sem
// rota PATCH: quem recebe o link nunca edita nada, só visualiza resumo/
// decisões/transcrição/atividades da reunião.

async function findMeetingByShareToken(token) {
  const { rows } = await pool.query('SELECT id, data FROM projects');
  for (const row of rows) {
    const meetings = (row.data && row.data.meetings) || [];
    const meeting = meetings.find((m) => m.shareToken && m.shareToken === token && !m.deleted);
    if (meeting) return { projectId: row.id, companyName: (row.data.company && row.data.company.name) || '', meeting };
  }
  return null;
}

router.get('/public-meeting/:token', optionalAuth, async (req, res, next) => {
  try {
    const found = await findMeetingByShareToken(req.params.token);
    if (!found || found.meeting.shareVisibility !== 'public') {
      return res.status(404).json({ message: 'Link inválido ou a reunião não é mais pública.' });
    }
    res.json({ meeting: found.meeting, companyName: found.companyName });
  } catch (e) { next(e); }
});

// ---------- Organizations (Super Admin only) ----------

function rowToOrg(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    displayName: row.display_name,
    logoLight: row.logo_light,
    logoDark: row.logo_dark,
    favicon: row.favicon,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    loginBackground: row.login_background,
    status: row.status,
    plan: row.plan,
    maxUsers: row.max_users,
    maxCompanies: row.max_companies,
    createdAt: row.created_at,
  };
}

function slugify(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

router.get('/organizations', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*,
        (SELECT COUNT(*)::int FROM users WHERE org_id = o.id) AS user_count,
        (SELECT COUNT(*)::int FROM projects WHERE org_id = o.id) AS project_count
      FROM organizations o ORDER BY created_at ASC
    `);
    res.json({ organizations: rows.map((r) => ({ ...rowToOrg(r), userCount: r.user_count, projectCount: r.project_count })) });
  } catch (e) { next(e); }
});

router.post('/organizations', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, slug } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'Nome da organização é obrigatório.' });
    const finalSlug = slugify(slug || name);
    if (!finalSlug) return res.status(400).json({ message: 'Não foi possível gerar um identificador (slug) válido.' });
    const { rows: dup } = await pool.query('SELECT id FROM organizations WHERE slug=$1', [finalSlug]);
    if (dup[0]) return res.status(409).json({ message: 'Já existe uma organização com esse identificador.' });
    const { rows } = await pool.query(
      `INSERT INTO organizations (id, slug, name, display_name) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uid('org'), finalSlug, name.trim(), name.trim()]
    );
    res.status(201).json({ organization: rowToOrg(rows[0]) });
  } catch (e) { next(e); }
});

router.patch('/organizations/:id', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query('SELECT * FROM organizations WHERE id=$1', [id]);
    const target = existingRows[0];
    if (!target) return res.status(404).json({ message: 'Organização não encontrada.' });
    const patch = req.body || {};
    const next_ = {
      name: patch.name !== undefined ? patch.name : target.name,
      display_name: patch.displayName !== undefined ? patch.displayName : target.display_name,
      logo_light: patch.logoLight !== undefined ? patch.logoLight : target.logo_light,
      logo_dark: patch.logoDark !== undefined ? patch.logoDark : target.logo_dark,
      favicon: patch.favicon !== undefined ? patch.favicon : target.favicon,
      primary_color: patch.primaryColor !== undefined ? patch.primaryColor : target.primary_color,
      secondary_color: patch.secondaryColor !== undefined ? patch.secondaryColor : target.secondary_color,
      login_background: patch.loginBackground !== undefined ? patch.loginBackground : target.login_background,
      status: patch.status !== undefined ? patch.status : target.status,
    };
    if (!['active', 'suspended', 'blocked'].includes(next_.status)) {
      return res.status(400).json({ message: 'Status inválido.' });
    }
    const { rows } = await pool.query(
      `UPDATE organizations SET name=$1, display_name=$2, logo_light=$3, logo_dark=$4, favicon=$5,
        primary_color=$6, secondary_color=$7, login_background=$8, status=$9, updated_at=now()
       WHERE id=$10 RETURNING *`,
      [next_.name, next_.display_name, next_.logo_light, next_.logo_dark, next_.favicon,
        next_.primary_color, next_.secondary_color, next_.login_background, next_.status, id]
    );
    res.json({ organization: rowToOrg(rows[0]) });
  } catch (e) { next(e); }
});
