// Rotas da Biblioteca de conhecimento (2026-10-27, §116) — só master/pricetax; ver server/knowledgeLibrary.js.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { cleanText, extractText, MAX_TEXT_CHARS, SUPPORTED } from './materialText.js';
import { MAX_FILE_BYTES, STALE_MS, clip, deps, processMaterial, running, searchMaterial, sha256, uid } from './knowledgeLibrary.js';

// ---------- rotas ----------
const LIST_COLS = `id, title, topic, tags, note, source_kind, file_name, mime_type, file_size, char_count, chunk_count, status, stage, progress, error, study_error,
  fact_id, created_by_name, created_at, updated_at, archived_at, (study IS NOT NULL) AS has_study`;
const publicRow = (r) => {
  const stale = r.status === 'processing' && !running.has(r.id) && Date.now() - new Date(r.updated_at).getTime() > 60_000;
  const stuck = r.status === 'processing' && Date.now() - new Date(r.updated_at).getTime() > STALE_MS;
  return {
    id: r.id, title: r.title, topic: r.topic, tags: r.tags || [], note: r.note, sourceKind: r.source_kind, fileName: r.file_name, fileSize: r.file_size,
    charCount: r.char_count, chunkCount: r.chunk_count, status: stale || stuck ? 'failed' : r.status, stage: r.stage, progress: r.progress || {},
    error: stale || stuck ? 'A leitura foi interrompida (o servidor reiniciou ou demorou demais). Use "Ler de novo".' : r.error,
    studyError: r.study_error, hasStudy: !!r.has_study, createdByName: r.created_by_name, createdAt: r.created_at, updatedAt: r.updated_at, archived: !!r.archived_at,
  };
};

const cleanTags = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12);

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

router.get('/', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const { rows } = await pool.query(`SELECT ${LIST_COLS} FROM knowledge_materials WHERE org_id=$1 ORDER BY (archived_at IS NOT NULL), created_at DESC`, [orgId]);
    res.json({ materials: rows.map(publicRow), embeddings: deps.embedOn(), supported: SUPPORTED, maxFileMb: MAX_FILE_BYTES / 1024 / 1024 });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [r] } = await pool.query(`SELECT ${LIST_COLS}, study FROM knowledge_materials WHERE id=$1 AND org_id=$2`, [req.params.id, effectiveOrgId(req)]);
    if (!r) return res.status(404).json({ message: 'Material não encontrado.' });
    res.json({ material: { ...publicRow(r), study: r.study || null } });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ message: 'Dê um título ao material.' });
    let text = ''; let fileName = ''; let mime = ''; let data = null;
    if (b.kind === 'text') {
      text = cleanText(b.text);
      if (text.length < 200) return res.status(400).json({ message: 'O texto está curto demais para virar conhecimento (mínimo 200 caracteres).' });
    } else {
      fileName = String(b.fileName || '').slice(0, 200); mime = String(b.mimeType || '').slice(0, 120);
      if (!fileName || !b.dataBase64) return res.status(400).json({ message: 'Escolha um arquivo.' });
      data = Buffer.from(String(b.dataBase64), 'base64');
      if (!data.length) return res.status(400).json({ message: 'O arquivo veio vazio.' });
      if (data.length > MAX_FILE_BYTES) return res.status(413).json({ message: `O arquivo passa de ${MAX_FILE_BYTES / 1024 / 1024} MB. Divida em partes menores ou cole o texto.` });
      try { text = await extractText({ buffer: data, fileName }); } catch (e) { return res.status(422).json({ message: e.message || 'Não consegui ler este arquivo.' }); }
      if (text.length < 200) return res.status(422).json({ message: 'O arquivo não tem texto suficiente para virar conhecimento.' });
    }
    const hash = sha256(text);
    const { rows: [dup] } = await pool.query('SELECT id, title FROM knowledge_materials WHERE org_id=$1 AND text_hash=$2 AND archived_at IS NULL', [orgId, hash]);
    if (dup) return res.status(409).json({ message: `Este conteúdo já está na biblioteca como "${dup.title}".`, id: dup.id });
    const id = uid('mat');
    await pool.query(
      `INSERT INTO knowledge_materials (id, org_id, title, topic, tags, note, source_kind, file_name, mime_type, file_size, file_data, full_text, text_hash, char_count, created_by, created_by_name, stage)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'indexar')`,
      [id, orgId, title, String(b.topic || '').trim().slice(0, 120), JSON.stringify(cleanTags(b.tags)), String(b.note || '').trim().slice(0, 1500), b.kind === 'text' ? 'text' : 'file', fileName, mime,
        data ? data.length : 0, data, text, hash, text.length, req.user.id, req.user.name || '']);
    processMaterial(id).catch(() => {});
    const { rows: [r] } = await pool.query(`SELECT ${LIST_COLS} FROM knowledge_materials WHERE id=$1`, [id]);
    res.status(202).json({ material: publicRow(r), truncated: text.length >= MAX_TEXT_CHARS });
  } catch (e) { next(e); }
});

router.post('/search', async (req, res, next) => {
  try {
    const out = await searchMaterial({ orgId: effectiveOrgId(req), query: String((req.body || {}).query || ''), limit: 8 });
    res.json({ ...out, embeddings: deps.embedOn() });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req); const b = req.body || {};
    const { rows: [m] } = await pool.query('SELECT * FROM knowledge_materials WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
    if (!m) return res.status(404).json({ message: 'Material não encontrado.' });
    const title = b.title !== undefined ? String(b.title).trim().slice(0, 200) : m.title;
    if (!title) return res.status(400).json({ message: 'O título não pode ficar vazio.' });
    await pool.query('UPDATE knowledge_materials SET title=$2, topic=$3, tags=$4::jsonb, note=$5, updated_at=now() WHERE id=$1',
      [m.id, title, b.topic !== undefined ? String(b.topic).trim().slice(0, 120) : m.topic, JSON.stringify(b.tags !== undefined ? cleanTags(b.tags) : m.tags), b.note !== undefined ? String(b.note).trim().slice(0, 1500) : m.note]);
    if (m.fact_id && title !== m.title) await pool.query('UPDATE ai_knowledge_facts SET subject=$2, updated_at=now() WHERE id=$1', [m.fact_id, `Material PRICETAX: ${clip(title, 140)}`]);
    const { rows: [r] } = await pool.query(`SELECT ${LIST_COLS} FROM knowledge_materials WHERE id=$1`, [m.id]);
    res.json({ material: publicRow(r) });
  } catch (e) { next(e); }
});

// Ler de novo (refaz trechos e estudo) ou só estudar de novo (`?only=study`, mantém os trechos).
router.post('/:id/reprocess', async (req, res, next) => {
  try {
    const { rows: [m] } = await pool.query('SELECT id, status, chunk_count FROM knowledge_materials WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!m) return res.status(404).json({ message: 'Material não encontrado.' });
    if (running.has(m.id)) return res.status(409).json({ message: 'Este material já está sendo lido.' });
    processMaterial(m.id, { skipIndex: req.query.only === 'study' && m.chunk_count > 0 }).catch(() => {});
    res.status(202).json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [m] } = await pool.query('SELECT id, fact_id FROM knowledge_materials WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!m) return res.status(404).json({ message: 'Material não encontrado.' });
    await pool.query('UPDATE knowledge_materials SET archived_at=now(), updated_at=now() WHERE id=$1', [m.id]);
    if (m.fact_id) await pool.query(`UPDATE ai_knowledge_facts SET status='archived', updated_at=now() WHERE id=$1`, [m.fact_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const { rows: [m] } = await pool.query('SELECT id, fact_id FROM knowledge_materials WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!m) return res.status(404).json({ message: 'Material não encontrado.' });
    await pool.query('UPDATE knowledge_materials SET archived_at=NULL, updated_at=now() WHERE id=$1', [m.id]);
    if (m.fact_id) await pool.query(`UPDATE ai_knowledge_facts SET status='active', updated_at=now() WHERE id=$1 AND status='archived'`, [m.fact_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const { rows: [m] } = await pool.query('SELECT file_name, mime_type, file_data, full_text, title, source_kind FROM knowledge_materials WHERE id=$1 AND org_id=$2', [req.params.id, effectiveOrgId(req)]);
    if (!m) return res.status(404).json({ message: 'Material não encontrado.' });
    const asText = m.source_kind === 'text' || !m.file_data;
    const name = asText ? `${String(m.title).replace(/[^\w.-]+/g, '_').slice(0, 80)}.txt` : m.file_name;
    res.setHeader('Content-Type', asText ? 'text/plain; charset=utf-8' : (m.mime_type || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(asText ? Buffer.from(m.full_text, 'utf8') : m.file_data);
  } catch (e) { next(e); }
});
