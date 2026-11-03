// Tarefas no painel lateral da Caixa de e-mail (2026-11-03, §151; Rafael: "onde tem tarefas, aí você destina para o nosso quadro").
// Duas rotas da PRÓPRIA pessoa, nunca de outra:
// - GET  /api/board-side       → páginas e colunas do quadro (para escolher onde cai) e os cartões abertos de hoje e atrasados;
// - POST /api/board-side/cards → acrescenta UM cartão. Não regrava o quadro vindo da tela: lê com FOR UPDATE, aplica a operação
//   create_card do mesmo motor da API (server/boardPlan.js), guarda cópia em personal_board_versions e grava com updated_at = createdAt
//   do cartão — assim uma aba do quadro aberta com a versão antiga NÃO apaga o cartão novo (mergeApiCards, server/routes.js).
import { Router } from 'express';
import { pool, blankPersonalBoard } from './db.js';
import { requireAuth } from './auth.js';
import { planOperations, isIsoDay } from './boardPlan.js';
import { sanitizeNoteHtml } from './richNote.js';
import { syncCardEvents } from './personalActivity.js';
import { todayInSp } from './widgetSummary.js';
import { baseUrlOf } from './connect.js';

export const router = Router();
router.use(requireAuth, (req, res, next) => (req.user && req.user.personalAccess ? next() : res.status(403).json({ message: 'Você não tem acesso à Gestão de Atividades.' })));

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const THREAD_RE = /^[A-Za-z0-9_-]{6,64}$/;

// Páginas/colunas e cartões abertos com prazo até hoje (Brasília). Puro, para teste.
export function sideView(data, today) {
  const pages = ((data && data.boards) || []).map((p) => ({ id: p.id, name: p.name || 'Sem nome', columns: (p.columns || []).map((c) => ({ id: c.id, name: c.name || 'Sem nome' })) }));
  const due = [];
  for (const p of (data && data.boards) || []) {
    for (const c of p.columns || []) {
      for (const k of c.cards || []) {
        if (!k || k.deleted || k.archived || k.completed || !isIsoDay(k.dueDate) || k.dueDate > today) continue;
        due.push({ id: k.id, title: clip(k.title, 200), dueDate: k.dueDate, overdue: k.dueDate < today, page: p.name || '', pageId: p.id, column: c.name || '', priority: k.priority || '' });
      }
    }
  }
  due.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'pt-BR'));
  return { today, pages, due: due.slice(0, 50), dueTotal: due.length };
}

// Descrição do cartão a partir do e-mail: quem mandou, o assunto e o link que reabre a conversa na Caixa do painel.
// `base` = endereço do painel (https://painel.pricetax.com.br): o editor do cartão só mantém link completo, não "/email…".
export function cardFromMail({ note, from, subject, threadId, base = '' }) {
  const parts = [];
  if (note) parts.push(`<p>${esc(clip(note, 2000)).replace(/\n/g, '<br>')}</p>`);
  const who = from && (from.name || from.email) ? `${esc(clip(from.name || from.email, 120))}${from.email && from.name ? ` (${esc(clip(from.email, 160))})` : ''}` : '';
  if (who || subject) parts.push(`<p>E-mail${who ? ` de <strong>${who}</strong>` : ''}${subject ? `: ${esc(clip(subject, 300))}` : ''}</p>`);
  if (threadId && THREAD_RE.test(threadId)) parts.push(`<p><a href="${base}/email#conversa=${threadId}">Abrir a conversa no e-mail</a></p>`);
  return sanitizeNoteHtml(parts.join(''));
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [req.user.id]);
    res.set('Cache-Control', 'no-store');
    res.json(sideView(rows[0] ? rows[0].data : blankPersonalBoard(), todayInSp()));
  } catch (e) { next(e); }
});

router.post('/cards', async (req, res, next) => {
  const b = req.body || {};
  const title = clip(b.title, 200).trim();
  if (!title) return res.status(400).json({ message: 'Dê um título à tarefa.' });
  if (b.dueDate && !isIsoDay(b.dueDate)) return res.status(400).json({ message: 'Prazo inválido.' });
  if (b.threadId && !THREAD_RE.test(String(b.threadId))) return res.status(400).json({ message: 'Conversa inválida.' });
  const desc = cardFromMail({ note: b.note, from: b.from, subject: b.subject, threadId: b.threadId, base: baseUrlOf(req) });
  const client = await pool.connect();
  let saved;
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT data FROM personal_boards WHERE user_id=$1 FOR UPDATE', [req.user.id]);
    const data = cur.rows[0] ? cur.rows[0].data : blankPersonalBoard();
    const page = (data.boards || []).find((p) => p.id === b.pageId) || (data.boards || [])[0];
    const col = page && ((page.columns || []).find((c) => c.id === b.columnId) || (page.columns || [])[0]);
    if (!page || !col) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ message: 'Seu quadro não tem coluna para receber a tarefa. Crie uma em Gestão de Atividades.' }); }
    const when = new Date();
    const who = req.user.name || req.user.username;
    const plan = planOperations(data, [{ op: 'create_card', page: page.id, column: col.id, title, dueDate: b.dueDate || '' }], { now: when.toISOString(), who, tokenName: 'e-mail', today: todayInSp() });
    if (plan.errors.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ message: plan.errors[0].message }); }
    const cardId = plan.touched[0];
    const card = plan.next.boards.find((p) => p.id === page.id).columns.find((c) => c.id === col.id).cards.find((k) => k.id === cardId);
    card.desc = desc;
    card.descFormat = desc ? 'html' : undefined;
    if (!desc) delete card.descFormat;
    card.history = [{ ts: card.createdAt, action: 'Tarefa criada pelo painel do e-mail', user: who }];
    if (b.threadId) card.mailThreadId = String(b.threadId);
    if (cur.rows[0]) await client.query('INSERT INTO personal_board_versions (user_id, data, reason) VALUES ($1,$2,$3)', [req.user.id, JSON.stringify(cur.rows[0].data), `antes da tarefa criada pelo e-mail: "${clip(title, 80)}"`]);
    // updated_at = createdAt do cartão: o PATCH de uma aba do quadro com a versão anterior reconhece e mantém o cartão (mergeApiCards).
    await client.query(
      'INSERT INTO personal_boards (user_id, data, updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET data=$2, updated_at=$3',
      [req.user.id, JSON.stringify(plan.next), when]);
    await client.query('COMMIT');
    saved = { next: plan.next, card: { id: card.id, title: card.title, dueDate: card.dueDate || '', page: page.name || '', column: col.name || '' } };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* já encerrada */ }
    client.release();
    return next(e);
  }
  client.release();
  try {
    await syncCardEvents(pool, req.user.id, saved.next);
    res.status(201).json({ card: saved.card });
  } catch (e) { next(e); }
});
