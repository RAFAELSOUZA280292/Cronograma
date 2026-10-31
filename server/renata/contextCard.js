// Ficha de contexto da RENATA (Onda 2, R1): quando a pessoa está com um negócio, uma empresa do CRM ou uma empresa do cronograma aberta, a RENATA
// recebe uma ficha curta desse registro, montada AQUI a partir dos dados do sistema (nunca de texto vindo do navegador).
// Acesso: o CRM é lido pelas mesmas rotas da tela, em nome da pessoa (callInternal); o cronograma passa por canAccessProject. Sem acesso, 404
// ou qualquer falha = sem ficha — a conversa segue normalmente (a ficha é só um ganho de contexto, nunca uma condição).
import { pool } from '../db.js';
import { canAccessProject } from '../routes.js';
import { callInternal } from './internalCall.js';
import { dealCard, crmCompanyCard, projectCard, renderCard } from './contextCardFormat.js';

export { HEADER } from './contextCardFormat.js';

const FETCH_MS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function crmGet(user, path) {
  const r = await callInternal({ userId: user.id, method: 'GET', path, timeoutMs: FETCH_MS });
  return r.status === 200 ? r.json : null;
}

// Devolve { type, title, lines, text } ou null (sem registro em foco, sem acesso, não encontrado ou falha).
export async function buildContextCard({ user, context, today }) {
  const e = context && context.entity;
  if (!user || user.role === 'cliente' || !e || !e.id) return null;
  const id = String(e.id);
  try {
    let card = null;
    if (e.type === 'negócio' && UUID.test(id)) {
      const detail = await crmGet(user, `/api/crm/deals/${encodeURIComponent(id)}`);
      card = detail && detail.deal ? dealCard(detail, today) : null;
    } else if (e.type === 'empresa do CRM' && UUID.test(id)) {
      const overview = await crmGet(user, `/api/crm/companies/${encodeURIComponent(id)}`);
      card = overview && overview.company && !overview.company.deletedAt ? crmCompanyCard(overview, today) : null;
    } else if (e.type === 'empresa') {
      const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id.slice(0, 80)]);
      card = rows[0] && canAccessProject(user, rows[0].data, rows[0].org_id) ? projectCard(rows[0].data, today) : null;
    }
    if (!card) return null;
    return { ...card, text: renderCard(card) };
  } catch (err) {
    console.error('RENATA ficha de contexto:', err && err.message);
    return null;
  }
}
