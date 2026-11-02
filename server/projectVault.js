// Cofre do projeto (§124, pedido do Rafael em 02/11/2026): acessos (login e senha), certificado digital A1, arquivos, links e notas de UMA empresa.
// Só a equipe (master/PRICETAX) com acesso à empresa; o link do cliente, a chave de API e a RENATA (loopback) nunca chegam aqui.
// Senha cifrada com secretBox (texto) e arquivo cifrado com sealBytes; a listagem devolve só "tem senha"/"tem arquivo".
// Mostrar/copiar a senha e baixar arquivo são POST/GET próprios, sem cache, e cada uso entra no Log da empresa (sem o valor).
import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { canAccessProject } from './routes.js';
import { todayInSp } from './widgetSummary.js';
import { open, openBytes } from './secretBox.js';
import { MAX_ITEMS_PER_PROJECT, extOf, parseVaultInput, publicItem, vaultLogText } from './projectVaultCore.js';

export async function ensureProjectVaultSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS project_vault_items (
      id               TEXT PRIMARY KEY,
      org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind             TEXT NOT NULL CHECK (kind IN ('credential','certificate','file','link','note')),
      title            TEXT NOT NULL,
      folder           TEXT NOT NULL DEFAULT '',
      tags             TEXT[] NOT NULL DEFAULT '{}',
      notes            TEXT NOT NULL DEFAULT '',
      url              TEXT NOT NULL DEFAULT '',
      username         TEXT NOT NULL DEFAULT '',
      secret_enc       TEXT,
      cert_holder      TEXT NOT NULL DEFAULT '',
      cert_valid_until DATE,
      file_name        TEXT,
      file_size        INTEGER,
      file_enc         BYTEA,
      created_by       TEXT NOT NULL DEFAULT '',
      created_by_name  TEXT NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by_name  TEXT NOT NULL DEFAULT '',
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at       TIMESTAMPTZ
    )`);
  await db.query('CREATE INDEX IF NOT EXISTS project_vault_items_project_idx ON project_vault_items(project_id, deleted_at, created_at DESC)');
}

export const router = Router();
const COLS = 'id, org_id, project_id, kind, title, folder, tags, notes, url, username, secret_enc, cert_holder, cert_valid_until, file_name, file_size, created_by_name, created_at, updated_by_name, updated_at';
const staff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');
const who = (u) => String(u.name || u.username || '').slice(0, 80);
const noStore = (res) => res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });

router.use(requireAuth, (req, res, next) => {
  if (req.renataCommandId) return res.status(403).json({ message: 'O cofre do projeto é aberto só pela pessoa, na aba Cofre.' });
  if (!staff(req.user)) return res.status(403).json({ message: 'O cofre do projeto é só da equipe PRICETAX.' });
  noStore(res);
  next();
});

async function loadProject(req, res) {
  const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [req.params.projectId]);
  const r = rows[0];
  if (!r || !canAccessProject(req.user, r.data, r.org_id)) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
  return r;
}

async function loadItem(projectId, itemId, extra = '') {
  const { rows } = await pool.query(`SELECT ${COLS}${extra} FROM project_vault_items WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL`, [itemId, projectId]);
  return rows[0] || null;
}

// Mesmo jeito do link do cliente (companyShare.js): trava a linha e põe a entrada no topo do Log (até 300). O navegador funde pelo carimbo de versão.
async function logVault(projectId, user, text) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT data FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
    if (cur.rows[0]) {
      const data = cur.rows[0].data;
      data.log = [{ ts: new Date().toISOString(), action: text, user: who(user), activityId: null }, ...(Array.isArray(data.log) ? data.log : [])].slice(0, 300);
      await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(data), projectId]);
    }
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ } throw e; } finally { client.release(); }
}

router.get('/:projectId', async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const { rows } = await pool.query(`SELECT ${COLS} FROM project_vault_items WHERE project_id=$1 AND deleted_at IS NULL ORDER BY folder, title`, [p.id]);
    const today = todayInSp();
    res.json({ items: rows.map((r) => publicItem(r, today)) });
  } catch (e) { next(e); }
});

router.post('/:projectId', async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM project_vault_items WHERE project_id=$1 AND deleted_at IS NULL', [p.id]);
    if (n >= MAX_ITEMS_PER_PROJECT) return res.status(400).json({ message: `O cofre desta empresa já tem ${MAX_ITEMS_PER_PROJECT} itens.` });
    const v = parseVaultInput(req.body, { isNew: true });
    if (v.error) return res.status(400).json({ message: v.error });
    const id = `vlt-${crypto.randomBytes(6).toString('base64url')}`;
    const cols = { id, org_id: p.org_id, project_id: p.id, ...v, created_by: req.user.id, created_by_name: who(req.user), updated_by_name: who(req.user) };
    const keys = Object.keys(cols);
    await pool.query(`INSERT INTO project_vault_items (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => cols[k]));
    const item = await loadItem(p.id, id);
    await logVault(p.id, req.user, vaultLogText('create', item));
    res.status(201).json({ item: publicItem(item, todayInSp()) });
  } catch (e) { next(e); }
});

router.patch('/:projectId/:itemId', async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const cur = await loadItem(p.id, req.params.itemId);
    if (!cur) return res.status(404).json({ message: 'Item não encontrado no cofre.' });
    const v = parseVaultInput(req.body, { isNew: false, kind: cur.kind });
    if (v.error) return res.status(400).json({ message: v.error });
    delete v.kind;
    const cols = { ...v, updated_by_name: who(req.user) };
    const keys = Object.keys(cols);
    await pool.query(`UPDATE project_vault_items SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(', ')}, updated_at=now() WHERE id=$1 AND project_id=$2`, [cur.id, p.id, ...keys.map((k) => cols[k])]);
    const item = await loadItem(p.id, cur.id);
    await logVault(p.id, req.user, vaultLogText('update', item));
    res.json({ item: publicItem(item, todayInSp()) });
  } catch (e) { next(e); }
});

router.delete('/:projectId/:itemId', async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const cur = await loadItem(p.id, req.params.itemId);
    if (!cur) return res.status(404).json({ message: 'Item não encontrado no cofre.' });
    await pool.query('UPDATE project_vault_items SET deleted_at=now(), updated_by_name=$3 WHERE id=$1 AND project_id=$2', [cur.id, p.id, who(req.user)]);
    await logVault(p.id, req.user, vaultLogText('delete', cur));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Mostrar ou copiar a senha: POST (nada na URL), sem cache, registrado no Log. Só aqui a senha sai decifrada.
router.post('/:projectId/:itemId/reveal', async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const cur = await loadItem(p.id, req.params.itemId);
    if (!cur || !cur.secret_enc) return res.status(404).json({ message: 'Este item não tem senha guardada.' });
    const secret = open(cur.secret_enc);
    if (secret === null) return res.status(409).json({ message: 'Não foi possível abrir esta senha (a chave do servidor mudou). Cadastre a senha de novo.' });
    await logVault(p.id, req.user, vaultLogText(req.body && req.body.purpose === 'copy' ? 'copy' : 'show', cur));
    res.json({ secret });
  } catch (e) { next(e); }
});

router.get('/:projectId/:itemId/file', async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const cur = await loadItem(p.id, req.params.itemId, ', file_enc');
    if (!cur || !cur.file_enc) return res.status(404).json({ message: 'Este item não tem arquivo.' });
    const buf = openBytes(cur.file_enc);
    if (!buf) return res.status(409).json({ message: 'Não foi possível abrir este arquivo (a chave do servidor mudou). Envie o arquivo de novo.' });
    await logVault(p.id, req.user, vaultLogText('download', cur));
    const ascii = String(cur.file_name || 'arquivo').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.set({
      'Content-Type': extOf(cur.file_name) === 'pdf' ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cur.file_name || 'arquivo')}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(buf);
  } catch (e) { next(e); }
});
