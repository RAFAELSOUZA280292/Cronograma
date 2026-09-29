// Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — repositório
// de PDFs pra compartilhar com sócios/colaboradores. Visibilidade restrita
// a master/pricetax (nunca 'cliente'), mesmo padrão de server/knowledge.js
// (requireMasterOrPricetax + effectiveOrgId, nunca uma regra paralela).
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { effectiveOrgId } from './routes.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — cabe com folga no limite de 15mb do body JSON (base64 tem overhead de ~37%)

const LIST_COLUMNS = 'id, title, description, file_name, mime_type, file_size, scope, company_project_id, company_name, comments, created_by, created_by_name, created_at, updated_at';
const SCOPES = ['geral', 'cliente'];

// scope/companyName vêm do corpo da requisição (criação ou edição); devolve { ok, scope,
// companyName, message } — nunca grava 'cliente' sem nome (a tag perderia o sentido).
function parseScope(body) {
  const scope = SCOPES.includes(body.scope) ? body.scope : 'geral';
  const companyName = scope === 'cliente' ? String(body.companyName || '').trim() : '';
  if (scope === 'cliente' && !companyName) return { ok: false, message: 'Informe o nome do cliente, ou marque como "Geral".' };
  return { ok: true, scope, companyName };
}

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

router.get('/', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { rows } = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM pareceres WHERE org_id=$1 ORDER BY created_at DESC`,
      [orgId],
    );
    res.json({ pareceres: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { title, description, fileName, mimeType, fileDataBase64, companyProjectId } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'Informe um título/identificação para o arquivo.' });
    if (!fileDataBase64 || !fileName) return res.status(400).json({ message: 'Selecione um arquivo PDF.' });
    if (mimeType && mimeType !== 'application/pdf') return res.status(400).json({ message: 'Só arquivos PDF são aceitos.' });
    const scopeResult = parseScope(req.body || {});
    if (!scopeResult.ok) return res.status(400).json({ message: scopeResult.message });
    const buffer = Buffer.from(fileDataBase64, 'base64');
    if (!buffer.length) return res.status(400).json({ message: 'Arquivo vazio ou inválido.' });
    if (buffer.length > MAX_FILE_BYTES) return res.status(400).json({ message: `Arquivo maior que ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB — não pode ser enviado.` });
    // Vínculo forte só quando o id realmente existe nessa org — se não, guarda só o nome (fallback
    // pra clientes que ainda nem viraram projeto no Cronograma).
    let linkedProjectId = null;
    if (scopeResult.scope === 'cliente' && companyProjectId) {
      const check = await pool.query('SELECT 1 FROM projects WHERE id=$1 AND org_id=$2', [companyProjectId, orgId]);
      if (check.rows.length) linkedProjectId = companyProjectId;
    }
    const id = uid('parecer');
    await pool.query(
      `INSERT INTO pareceres (id, org_id, title, description, file_name, mime_type, file_size, file_data, scope, company_project_id, company_name, created_by, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, orgId, title.trim(), (description || '').trim(), fileName, 'application/pdf', buffer.length, buffer, scopeResult.scope, linkedProjectId, scopeResult.companyName, req.user.id, req.user.name || req.user.username],
    );
    const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM pareceres WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { title, description, companyProjectId } = req.body || {};
    if (title !== undefined && !title.trim()) return res.status(400).json({ message: 'Título não pode ficar vazio.' });
    let scopeSet = null;
    if (req.body && req.body.scope !== undefined) {
      const scopeResult = parseScope(req.body);
      if (!scopeResult.ok) return res.status(400).json({ message: scopeResult.message });
      let linkedProjectId = null;
      if (scopeResult.scope === 'cliente' && companyProjectId) {
        const check = await pool.query('SELECT 1 FROM projects WHERE id=$1 AND org_id=$2', [companyProjectId, orgId]);
        if (check.rows.length) linkedProjectId = companyProjectId;
      }
      scopeSet = { scope: scopeResult.scope, companyName: scopeResult.companyName, companyProjectId: linkedProjectId };
    }
    // company_project_id precisa saber a diferença entre "não mexer" e "limpar pra null" (troca
    // pra 'geral', ou 'cliente' sem projeto vinculado) — por isso o CASE com flag, nunca COALESCE
    // (que trataria os dois casos como iguais).
    const { rows } = await pool.query(
      `UPDATE pareceres SET
         title=COALESCE($1,title), description=COALESCE($2,description),
         scope=COALESCE($3,scope), company_name=COALESCE($4,company_name),
         company_project_id = CASE WHEN $8 THEN $5 ELSE company_project_id END,
         updated_at=now()
       WHERE id=$6 AND org_id=$7 RETURNING ${LIST_COLUMNS}`,
      [
        title !== undefined ? title.trim() : null,
        description !== undefined ? description.trim() : null,
        scopeSet ? scopeSet.scope : null,
        scopeSet ? scopeSet.companyName : null,
        scopeSet ? scopeSet.companyProjectId : null,
        req.params.id, orgId,
        !!scopeSet,
      ],
    );
    if (!rows.length) return res.status(404).json({ message: 'Parecer não encontrado.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { rowCount } = await pool.query('DELETE FROM pareceres WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!rowCount) return res.status(404).json({ message: 'Parecer não encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { rows } = await pool.query('SELECT file_name, mime_type, file_data FROM pareceres WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!rows.length) return res.status(404).json({ message: 'Parecer não encontrado.' });
    const row = rows[0];
    res.setHeader('Content-Type', row.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name).replace(/'/g, '%27')}"`);
    res.send(row.file_data);
  } catch (e) { next(e); }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escreva um comentário.' });
    const { rows } = await pool.query('SELECT comments FROM pareceres WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!rows.length) return res.status(404).json({ message: 'Parecer não encontrado.' });
    const comment = { id: uid('cmt'), text: text.trim(), userId: req.user.id, userName: req.user.name || req.user.username, ts: new Date().toISOString() };
    const comments = [...(rows[0].comments || []), comment];
    await pool.query('UPDATE pareceres SET comments=$1, updated_at=now() WHERE id=$2', [JSON.stringify(comments), req.params.id]);
    res.status(201).json({ comment });
  } catch (e) { next(e); }
});

router.delete('/:id/comments/:commentId', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { rows } = await pool.query('SELECT comments FROM pareceres WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!rows.length) return res.status(404).json({ message: 'Parecer não encontrado.' });
    const comment = (rows[0].comments || []).find((c) => c.id === req.params.commentId);
    if (comment && comment.userId !== req.user.id && req.user.role !== 'master') {
      return res.status(403).json({ message: 'Você só pode excluir seus próprios comentários.' });
    }
    const comments = (rows[0].comments || []).filter((c) => c.id !== req.params.commentId);
    await pool.query('UPDATE pareceres SET comments=$1 WHERE id=$2', [JSON.stringify(comments), req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
