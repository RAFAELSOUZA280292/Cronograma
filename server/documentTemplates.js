// Modelos de documentos (2026-10-05, §78) — irmã da aba Pareceres: biblioteca de modelos para sócios e colaboradores. Um MODELO
// (título, categoria, para que serve, comentários) tem vários ANEXOS: o mesmo documento em Word, Excel, PDF, HTML, link…
// Mesma regra de acesso dos Pareceres (master/pricetax, nunca 'cliente') e effectiveOrgId. Arquivo: lista fechada de extensões,
// Content-Type decidido pelo servidor (nunca o do navegador). HTML é aceito, mas servido ISOLADO: CSP `sandbox` sem scripts e sem
// origem própria, então nem aberto direto na nossa origem consegue ler cookie ou chamar a API. SVG segue recusado. Link: server/linkPreview.js.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { fetchLinkPreview, normalizeUrl } from './linkPreview.js';
import { officePreviewText } from './officePreview.js';
import { cleanCommentExtras, notifyMentions } from './commentExtras.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_ITEMS = 12;

export const FILE_TYPES = {
  pdf: { mime: 'application/pdf', kind: 'pdf', inline: true },
  png: { mime: 'image/png', kind: 'image', inline: true },
  jpg: { mime: 'image/jpeg', kind: 'image', inline: true },
  jpeg: { mime: 'image/jpeg', kind: 'image', inline: true },
  gif: { mime: 'image/gif', kind: 'image', inline: true },
  webp: { mime: 'image/webp', kind: 'image', inline: true },
  txt: { mime: 'text/plain; charset=utf-8', kind: 'text', inline: true },
  html: { mime: 'text/html; charset=utf-8', kind: 'html', inline: true, sandbox: true },
  htm: { mime: 'text/html; charset=utf-8', kind: 'html', inline: true, sandbox: true },
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
  zip: { mime: 'application/zip', kind: 'zip', inline: false },
};

export function extOf(fileName) {
  const m = /\.([a-z0-9]+)$/i.exec(String(fileName || ''));
  return m ? m[1].toLowerCase() : '';
}

const SANDBOX_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; font-src data:; media-src 'none'; frame-ancestors 'self'";

const SELECT_TEMPLATE = `
  SELECT t.id, t.title, t.description, t.category, t.comments, t.created_by, t.created_by_name, t.created_at, t.updated_at,
    COALESCE((SELECT json_agg(json_build_object(
        'id', i.id, 'kind', i.kind, 'file_name', i.file_name, 'file_size', i.file_size, 'url', i.url,
        'link_meta', i.link_meta, 'preview_text', i.preview_text) ORDER BY i.position, i.created_at)
      FROM document_template_items i WHERE i.template_id = t.id), '[]'::json) AS items
  FROM document_templates t`;

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

const cleanCategory = (v) => String(v || '').trim().slice(0, 40);

async function loadTemplate(id, orgId) {
  const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE t.id=$1 AND t.org_id=$2`, [id, orgId]);
  return rows[0] || null;
}

// Valida um anexo vindo do corpo da requisição e devolve as colunas a gravar (ou { error }).
async function parseItem(body) {
  const kind = body.kind === 'link' ? 'link' : 'file';
  if (kind === 'link') {
    const u = normalizeUrl(body.url);
    if (!u) return { error: 'Endereço do link inválido. Use um endereço que comece com http:// ou https://.' };
    const preview = await fetchLinkPreview(u.toString());
    return { kind, url: u.toString(), linkMeta: preview, suggestedTitle: (preview.ok && preview.title) || u.hostname.replace(/^www\./, '') };
  }
  const fileName = String(body.fileName || '').trim().slice(0, 240);
  const ext = extOf(fileName);
  const type = FILE_TYPES[ext];
  if (!body.fileDataBase64 || !fileName) return { error: 'Selecione um arquivo.' };
  if (!type) return { error: 'Tipo de arquivo não aceito. Use PDF, Word, PowerPoint, Excel, HTML, texto, imagem (PNG, JPG, GIF, WebP) ou ZIP.' };
  const buffer = Buffer.from(body.fileDataBase64, 'base64');
  if (!buffer.length) return { error: 'Arquivo vazio ou inválido.' };
  if (buffer.length > MAX_FILE_BYTES) return { error: `Arquivo maior que ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB. Para arquivos maiores, adicione como link.` };
  return { kind, fileName, mime: type.mime, size: buffer.length, buffer, preview: officePreviewText(ext, buffer), suggestedTitle: fileName.replace(/\.[^.]+$/, '').slice(0, 200) || fileName };
}

async function insertItem(templateId, item, position) {
  const id = uid('item');
  await pool.query(
    `INSERT INTO document_template_items (id, template_id, kind, file_name, mime_type, file_size, file_data, url, link_meta, preview_text, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, templateId, item.kind, item.fileName || null, item.mime || null, item.size || null, item.buffer || null, item.url || null, item.linkMeta ? JSON.stringify(item.linkMeta) : null, item.preview || '', position],
  );
  return id;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE t.org_id=$1 ORDER BY t.created_at DESC`, [effectiveOrgId(req)]);
    res.json({ templates: rows });
  } catch (e) { next(e); }
});

// Cria o modelo já com o 1º anexo (arquivo ou link). Os demais entram em POST /:id/items, um por requisição
// (cada arquivo pode ter até 30 MB; juntar todos num corpo só estouraria o limite).
router.post('/', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const body = req.body || {};
    const item = await parseItem(body);
    if (item.error) return res.status(400).json({ message: item.error });
    const id = uid('modelo');
    const title = String(body.title || '').trim().slice(0, 200) || item.suggestedTitle;
    await pool.query(
      `INSERT INTO document_templates (id, org_id, kind, title, description, category, created_by, created_by_name) VALUES ($1,$2,'multi',$3,$4,$5,$6,$7)`,
      [id, orgId, title, String(body.description || '').trim().slice(0, 4000), cleanCategory(body.category), req.user.id, req.user.name || req.user.username],
    );
    await insertItem(id, item, 0);
    res.status(201).json(await loadTemplate(id, orgId));
  } catch (e) { next(e); }
});

router.post('/:id/items', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const cur = await loadTemplate(req.params.id, orgId);
    if (!cur) return res.status(404).json({ message: 'Modelo não encontrado.' });
    if (cur.items.length >= MAX_ITEMS) return res.status(400).json({ message: `Um modelo aceita até ${MAX_ITEMS} anexos.` });
    const item = await parseItem(req.body || {});
    if (item.error) return res.status(400).json({ message: item.error });
    await insertItem(cur.id, item, cur.items.length);
    await pool.query('UPDATE document_templates SET updated_at=now() WHERE id=$1', [cur.id]);
    res.status(201).json(await loadTemplate(cur.id, orgId));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { title, description, category } = req.body || {};
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ message: 'O título não pode ficar vazio.' });
    const { rowCount } = await pool.query(
      `UPDATE document_templates SET title=COALESCE($1,title), description=COALESCE($2,description), category=COALESCE($3,category), updated_at=now() WHERE id=$4 AND org_id=$5`,
      [title !== undefined ? String(title).trim().slice(0, 200) : null, description !== undefined ? String(description).trim().slice(0, 4000) : null, category !== undefined ? cleanCategory(category) : null, req.params.id, orgId],
    );
    if (!rowCount) return res.status(404).json({ message: 'Modelo não encontrado.' });
    res.json(await loadTemplate(req.params.id, orgId));
  } catch (e) { next(e); }
});

// Troca o endereço de um link e refaz a prévia (url ausente = só refaz a prévia do endereço atual).
router.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const cur = await loadTemplate(req.params.id, orgId);
    const item = cur && cur.items.find((i) => i.id === req.params.itemId);
    if (!item || item.kind !== 'link') return res.status(404).json({ message: 'Link não encontrado.' });
    let url = item.url;
    if (req.body && req.body.url !== undefined) {
      const u = normalizeUrl(req.body.url);
      if (!u) return res.status(400).json({ message: 'Endereço do link inválido.' });
      url = u.toString();
    }
    const preview = await fetchLinkPreview(url);
    await pool.query('UPDATE document_template_items SET url=$1, link_meta=$2 WHERE id=$3', [url, JSON.stringify(preview), item.id]);
    await pool.query('UPDATE document_templates SET updated_at=now() WHERE id=$1', [cur.id]);
    res.json(await loadTemplate(cur.id, orgId));
  } catch (e) { next(e); }
});

router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const cur = await loadTemplate(req.params.id, orgId);
    if (!cur || !cur.items.some((i) => i.id === req.params.itemId)) return res.status(404).json({ message: 'Anexo não encontrado.' });
    if (cur.items.length <= 1) return res.status(400).json({ message: 'Este é o único anexo do modelo. Para remover tudo, exclua o modelo.' });
    await pool.query('DELETE FROM document_template_items WHERE id=$1', [req.params.itemId]);
    await pool.query('UPDATE document_templates SET updated_at=now() WHERE id=$1', [cur.id]);
    res.json(await loadTemplate(cur.id, orgId));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM document_templates WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Modelo não encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function sendItemFile(req, res, next, itemId) {
  try {
    const { rows } = await pool.query(
      `SELECT i.file_name, i.file_data FROM document_template_items i JOIN document_templates t ON t.id=i.template_id
       WHERE t.id=$1 AND t.org_id=$2 AND i.kind='file' AND ($3::text IS NULL OR i.id=$3) ORDER BY i.position LIMIT 1`,
      [req.params.id, effectiveOrgId(req), itemId],
    );
    const type = rows.length && FILE_TYPES[extOf(rows[0].file_name)];
    if (!type || !rows[0].file_data) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    const inline = type.inline && req.query.download !== '1';
    res.setHeader('Content-Type', type.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    if (type.sandbox) res.setHeader('Content-Security-Policy', SANDBOX_CSP);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rows[0].file_name).replace(/'/g, '%27')}`);
    res.send(rows[0].file_data);
  } catch (e) { next(e); }
}

router.get('/:id/items/:itemId/file', (req, res, next) => sendItemFile(req, res, next, req.params.itemId));
router.get('/:id/file', (req, res, next) => sendItemFile(req, res, next, null)); // compatibilidade: 1º arquivo do modelo

router.post('/:id/comments', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { attachments, links, mentions } = req.body || {};
    const text = String((req.body || {}).text || '').trim();
    const extras = cleanCommentExtras(attachments, links, { maxAttachments: 3, maxFileChars: 3 * 1024 * 1024 });
    if (!text && !extras.attachments.length && !extras.links.length) return res.status(400).json({ message: 'Escreva um comentário.' });
    const { rows } = await pool.query('SELECT title, comments FROM document_templates WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!rows.length) return res.status(404).json({ message: 'Modelo não encontrado.' });
    const comment = { id: uid('cmt'), text: text.slice(0, 4000), userId: req.user.id, userName: req.user.name || req.user.username, ts: new Date().toISOString(), attachments: extras.attachments, links: extras.links, mentions: Array.isArray(mentions) ? mentions.map(String).slice(0, 20) : [] };
    await pool.query('UPDATE document_templates SET comments=$1, updated_at=now() WHERE id=$2', [JSON.stringify([...(rows[0].comments || []), comment]), req.params.id]);
    await notifyMentions(pool, { orgId, actor: req.user, mentions, type: 'modelo_mention', title: `Modelo: ${rows[0].title}`,
      body: `${req.user.name || req.user.username} mencionou você em um comentário: "${text.slice(0, 140)}"`, target: { kind: 'modelo', id: req.params.id } });
    res.status(201).json({ comment });
  } catch (e) { next(e); }
});

router.patch('/:id/comments/:commentId', async (req, res, next) => {
  try {
    const text = String((req.body || {}).text || '').trim().slice(0, 4000);
    const { rows } = await pool.query('SELECT comments FROM document_templates WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!rows.length) return res.status(404).json({ message: 'Modelo não encontrado.' });
    const comment = (rows[0].comments || []).find((c) => c.id === req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comentário não encontrado.' });
    if (comment.userId !== req.user.id) return res.status(403).json({ message: 'Você só pode editar o seu próprio comentário.' });
    if (!text && !(comment.attachments || []).length && !(comment.links || []).length) return res.status(400).json({ message: 'O comentário não pode ficar vazio. Para apagar, use Excluir.' });
    const comments = rows[0].comments.map((c) => (c.id === comment.id ? { ...c, text, editedAt: new Date().toISOString() } : c));
    await pool.query('UPDATE document_templates SET comments=$1, updated_at=now() WHERE id=$2', [JSON.stringify(comments), req.params.id]);
    res.json({ comment: comments.find((c) => c.id === comment.id) });
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
