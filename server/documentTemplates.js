// Modelos de documentos (2026-10-05, §78) — irmã da aba Pareceres: biblioteca de modelos (arquivos e links) para sócios e
// colaboradores. Mesma regra de acesso dos Pareceres (master/pricetax, nunca 'cliente') e do mesmo jeito: effectiveOrgId,
// arquivo em BYTEA, comentários em JSONB. Arquivo: lista fechada de extensões, Content-Type decidido pelo servidor (nunca
// o que o navegador mandou), nada de HTML/SVG (seria XSS servido da nossa origem). Link: prévia por server/linkPreview.js.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { fetchLinkPreview, normalizeUrl } from './linkPreview.js';
import { officePreviewText } from './officePreview.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export const FILE_TYPES = {
  pdf: { mime: 'application/pdf', kind: 'pdf', inline: true },
  png: { mime: 'image/png', kind: 'image', inline: true },
  jpg: { mime: 'image/jpeg', kind: 'image', inline: true },
  jpeg: { mime: 'image/jpeg', kind: 'image', inline: true },
  gif: { mime: 'image/gif', kind: 'image', inline: true },
  webp: { mime: 'image/webp', kind: 'image', inline: true },
  txt: { mime: 'text/plain; charset=utf-8', kind: 'text', inline: true },
  csv: { mime: 'text/csv; charset=utf-8', kind: 'excel', inline: false },
  doc: { mime: 'application/msword', kind: 'word', inline: false },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'word', inline: false },
  rtf: { mime: 'application/rtf', kind: 'word', inline: false },
  odt: { mime: 'application/vnd.oasis.opendocument.text', kind: 'word', inline: false },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'ppt', inline: false },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'ppt', inline: false },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', kind: 'ppt', inline: false },
  xls: { mime: 'application/vnd.ms-excel', kind: 'excel', inline: false },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'excel', inline: false },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'excel', inline: false },
};

export function extOf(fileName) {
  const m = /\.([a-z0-9]+)$/i.exec(String(fileName || ''));
  return m ? m[1].toLowerCase() : '';
}

const LIST_COLUMNS = 'id, kind, title, description, category, file_name, mime_type, file_size, url, link_meta, preview_text, comments, created_by, created_by_name, created_at, updated_at';

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

const cleanCategory = (v) => String(v || '').trim().slice(0, 40);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM document_templates WHERE org_id=$1 ORDER BY created_at DESC`, [effectiveOrgId(req)]);
    res.json({ templates: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const body = req.body || {};
    const kind = body.kind === 'link' ? 'link' : 'file';
    const category = cleanCategory(body.category);
    const description = String(body.description || '').trim().slice(0, 4000);
    const id = uid('modelo');
    let title = String(body.title || '').trim().slice(0, 200);

    if (kind === 'link') {
      const u = normalizeUrl(body.url);
      if (!u) return res.status(400).json({ message: 'Endereço do link inválido. Use um endereço que comece com http:// ou https://.' });
      const preview = await fetchLinkPreview(u.toString());
      if (!title) title = (preview.ok && preview.title) || u.hostname.replace(/^www\./, '');
      await pool.query(
        `INSERT INTO document_templates (id, org_id, kind, title, description, category, url, link_meta, created_by, created_by_name)
         VALUES ($1,$2,'link',$3,$4,$5,$6,$7,$8,$9)`,
        [id, orgId, title, description, category, u.toString(), JSON.stringify(preview), req.user.id, req.user.name || req.user.username],
      );
    } else {
      const fileName = String(body.fileName || '').trim().slice(0, 240);
      const ext = extOf(fileName);
      const type = FILE_TYPES[ext];
      if (!body.fileDataBase64 || !fileName) return res.status(400).json({ message: 'Selecione um arquivo.' });
      if (!type) return res.status(400).json({ message: 'Tipo de arquivo não aceito. Use PDF, Word, PowerPoint, Excel, texto ou imagem (PNG, JPG, GIF, WebP).' });
      const buffer = Buffer.from(body.fileDataBase64, 'base64');
      if (!buffer.length) return res.status(400).json({ message: 'Arquivo vazio ou inválido.' });
      if (buffer.length > MAX_FILE_BYTES) return res.status(400).json({ message: `Arquivo maior que ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB. Para arquivos maiores, adicione como link.` });
      if (!title) title = fileName.replace(/\.[^.]+$/, '').slice(0, 200) || fileName;
      await pool.query(
        `INSERT INTO document_templates (id, org_id, kind, title, description, category, file_name, mime_type, file_size, file_data, preview_text, created_by, created_by_name)
         VALUES ($1,$2,'file',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, orgId, title, description, category, fileName, type.mime, buffer.length, buffer, officePreviewText(ext, buffer), req.user.id, req.user.name || req.user.username],
      );
    }
    const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM document_templates WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { title, description, category, url } = req.body || {};
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ message: 'O título não pode ficar vazio.' });
    let newUrl = null;
    let preview = null;
    if (url !== undefined) {
      const u = normalizeUrl(url);
      if (!u) return res.status(400).json({ message: 'Endereço do link inválido.' });
      newUrl = u.toString();
      preview = JSON.stringify(await fetchLinkPreview(newUrl));
    }
    const { rows } = await pool.query(
      `UPDATE document_templates SET
         title=COALESCE($1,title), description=COALESCE($2,description), category=COALESCE($3,category),
         url=CASE WHEN $4::text IS NOT NULL AND kind='link' THEN $4 ELSE url END,
         link_meta=CASE WHEN $5::text IS NOT NULL AND kind='link' THEN $5::jsonb ELSE link_meta END,
         updated_at=now()
       WHERE id=$6 AND org_id=$7 RETURNING ${LIST_COLUMNS}`,
      [
        title !== undefined ? String(title).trim().slice(0, 200) : null,
        description !== undefined ? String(description).trim().slice(0, 4000) : null,
        category !== undefined ? cleanCategory(category) : null,
        newUrl, preview, req.params.id, orgId,
      ],
    );
    if (!rows.length) return res.status(404).json({ message: 'Modelo não encontrado.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/:id/refresh-preview', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { rows: cur } = await pool.query(`SELECT url, kind FROM document_templates WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!cur.length || cur[0].kind !== 'link') return res.status(404).json({ message: 'Link não encontrado.' });
    const preview = await fetchLinkPreview(cur[0].url);
    const { rows } = await pool.query(`UPDATE document_templates SET link_meta=$1, updated_at=now() WHERE id=$2 RETURNING ${LIST_COLUMNS}`, [JSON.stringify(preview), req.params.id]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM document_templates WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Modelo não encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT file_name, file_data FROM document_templates WHERE id=$1 AND org_id=$2 AND kind='file'`, [req.params.id, effectiveOrgId(req)]);
    if (!rows.length) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    const type = FILE_TYPES[extOf(rows[0].file_name)];
    if (!type) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    const inline = type.inline && req.query.download !== '1';
    res.setHeader('Content-Type', type.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rows[0].file_name).replace(/'/g, '%27')}`);
    res.send(rows[0].file_data);
  } catch (e) { next(e); }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ message: 'Escreva um comentário.' });
    const { rows } = await pool.query('SELECT comments FROM document_templates WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!rows.length) return res.status(404).json({ message: 'Modelo não encontrado.' });
    const comment = { id: uid('cmt'), text: text.slice(0, 4000), userId: req.user.id, userName: req.user.name || req.user.username, ts: new Date().toISOString() };
    await pool.query('UPDATE document_templates SET comments=$1, updated_at=now() WHERE id=$2', [JSON.stringify([...(rows[0].comments || []), comment]), req.params.id]);
    res.status(201).json({ comment });
  } catch (e) { next(e); }
});

router.delete('/:id/comments/:commentId', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT comments FROM document_templates WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!rows.length) return res.status(404).json({ message: 'Modelo não encontrado.' });
    const comment = (rows[0].comments || []).find((c) => c.id === req.params.commentId);
    if (comment && comment.userId !== req.user.id && req.user.role !== 'master') return res.status(403).json({ message: 'Você só pode excluir seus próprios comentários.' });
    await pool.query('UPDATE document_templates SET comments=$1 WHERE id=$2', [JSON.stringify((rows[0].comments || []).filter((c) => c.id !== req.params.commentId)), req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
