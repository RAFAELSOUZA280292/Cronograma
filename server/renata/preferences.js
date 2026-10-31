// Memória de preferências da RENATA (Onda 3, R2): leitura/escrita em users.preferences.renataMemory, sempre só da PRÓPRIA pessoa (id vem da sessão).
// A escrita é uma transação com a linha do usuário travada (FOR UPDATE): duas abas ou a RENATA e a tela juntas não perdem item uma da outra.
import { pool } from '../db.js';
import { readList, addTo, editIn, removeFrom } from './preferencesFormat.js';

export async function loadList(userId) {
  const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [userId]);
  return readList(rows[0] && rows[0].preferences);
}

export async function mutate(userId, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query('SELECT preferences FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!rows[0]) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
    const out = fn(readList(rows[0].preferences));
    await c.query(`UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{renataMemory}', $2::jsonb, true) WHERE id=$1`, [userId, JSON.stringify(out.list)]);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

export const add = (userId, text, source) => mutate(userId, (list) => addTo(list, text, { source }));
export const edit = (userId, id, text) => mutate(userId, (list) => editIn(list, id, text));
export const remove = (userId, id) => mutate(userId, (list) => ({ list: removeFrom(list, id) }));
