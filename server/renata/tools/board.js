// Ferramentas da Gestão de Atividades (quadro pessoal) — §101. O quadro é um documento por usuário: a RENATA só mexe no quadro de QUEM PEDIU, na mesma estrutura
// que a tela grava (histórico do cartão com "RENATA (IA, a pedido de …)"). A tela recarrega sozinha em até ~12 s (poll de versão); edição local ainda não salva
// vence a da RENATA (limite conhecido, documentado em §101).
import crypto from 'node:crypto';
import { T } from '../validate.js';
import { pool, blankPersonalBoard } from '../../db.js';
import { flattenCards, filterCards } from '../../connect.js';
import { todayInSp } from '../../widgetSummary.js';
import { syncCardEvents } from '../../personalActivity.js';

const uid = (p) => `${p}-${crypto.randomBytes(5).toString('base64url')}`;
const PRI = ['urgente', 'alta', 'media', 'baixa'];
const STATUS = ['nao-iniciada', 'em-andamento', 'pausada', 'concluida'];
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const who = (ctx) => `RENATA (IA, a pedido de ${ctx.user.name || ctx.user.username})`;
const visible = (u) => !!u.personalAccess;
const denied = (m) => ({ status: 403, json: { message: m } });

async function withBoard(ctx, mutate) {
  if (!ctx.user.personalAccess) return denied('Você não tem acesso à Gestão de Atividades.');
  const client = await pool.connect();
  let out; let nextData;
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT data FROM personal_boards WHERE user_id=$1 FOR UPDATE', [ctx.user.id]);
    const data = cur.rows[0] ? cur.rows[0].data : blankPersonalBoard();
    const boards = (data.boards || []).map((b) => ({ ...b, columns: (b.columns || []).map((c) => ({ ...c, cards: [...(c.cards || [])] })) }));
    const stamp = new Date();
    out = mutate({ boards, now: stamp.toISOString(), who: who(ctx) });
    if (out.status && out.status >= 400) { await client.query('ROLLBACK'); return out; }
    nextData = { ...data, boards };
    await client.query(`INSERT INTO personal_boards (user_id, data, updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET data=$2, updated_at=$3`, [ctx.user.id, JSON.stringify(nextData), stamp]);
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* já encerrada */ } throw e; } finally { client.release(); }
  await syncCardEvents(pool, ctx.user.id, nextData).catch(() => {});
  return out;
}

function findCard(boards, id) {
  for (const b of boards) for (const c of b.columns) { const i = c.cards.findIndex((k) => k.id === id && !k.deleted); if (i >= 0) return { board: b, col: c, idx: i, card: c.cards[i] }; }
  return null;
}
const publicCard = (f) => ({ id: f.card.id, title: f.card.title, board: f.board.name, column: f.col.name, priority: f.card.priority || '', dueDate: f.card.dueDate || '', status: f.card.status || (f.card.completed ? 'concluida' : 'nao-iniciada'), completed: !!f.card.completed });
const withHistory = (card, msg, now, w) => ({ ...card, history: [{ ts: now, action: msg, user: w }, ...(card.history || [])].slice(0, 200), updatedAt: now, updatedBy: w });

// Estado atual do cartão (para a confirmação mostrar o NOME do cartão, e não só o id).
async function cardBefore(ctx, input) {
  if (!ctx.user.personalAccess) return undefined;
  const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [ctx.user.id]);
  if (!rows[0]) return undefined;
  const f = findCard(rows[0].data.boards || [], input.id);
  return f ? { title: f.card.title, coluna: f.col.name, prazo: f.card.dueDate || '', prioridade: f.card.priority || '', concluido: !!f.card.completed } : undefined;
}

export function registerBoard(registry) {
  const base = { module: 'Gestão de Atividades', visible };
  registry.add({ ...base, name: 'quadro_listar', summary: 'Lista os cartões do quadro pessoal de quem pediu (status: open, overdue, today, urgent, done, all).', risk: 'read',
    params: T.obj({ status: T.enm('Filtro', ['open', 'overdue', 'today', 'urgent', 'done', 'all']), q: T.str('Texto'), limit: T.int('Máximo (até 100)', { minimum: 1, maximum: 100 }) }),
    run: async (ctx, i) => {
      if (!ctx.user.personalAccess) return denied('Você não tem acesso à Gestão de Atividades.');
      const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [ctx.user.id]);
      const today = todayInSp();
      const list = filterCards(flattenCards(rows[0] ? rows[0].data : blankPersonalBoard(), today), i.status || 'open', i.q).sort((a, b) => (b.overdue - a.overdue) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
      return { status: 200, json: { hoje: today, total: list.length, cartoes: list.slice(0, i.limit || 40) } };
    } });
  registry.add({ ...base, name: 'quadro_criar_atividade', summary: 'Cria um cartão no quadro pessoal de quem pediu (a Gestão de Atividades). Para atividade de CRM use crm_criar_atividade; para tarefa de reunião use tarefa_reuniao_criar.', risk: 'write', creates: true,
    params: T.obj({ title: T.str('Título', { maxLength: 200 }), desc: T.str('Descrição'), dueDate: T.date('Prazo'), priority: T.enm('Prioridade', PRI), board: T.str('Página do quadro (nome)'), column: T.str('Coluna (nome)') }, ['title']),
    describe: (i) => `Criar o cartão “${i.title}”${i.dueDate ? ` com prazo ${i.dueDate}` : ''}.`,
    undo: (i, b, r) => (r && r.cartao ? { tool: 'quadro_excluir_atividade', input: { id: r.cartao.id }, label: 'excluir o cartão criado' } : null),
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const board = i.board ? boards.find((b) => b.id === i.board || same(b.name, i.board)) : boards[0];
      if (!board) return { status: 404, json: { message: i.board ? `Página “${i.board}” não existe no quadro. Páginas: ${boards.map((b) => b.name).join(', ')}.` : 'O quadro ainda não tem páginas.' } };
      const col = i.column ? board.columns.find((c) => c.id === i.column || same(c.name, i.column)) : board.columns[0];
      if (!col) return { status: 404, json: { message: `Coluna “${i.column}” não existe em “${board.name}”. Colunas: ${board.columns.map((c) => c.name).join(', ')}.` } };
      const card = {
        id: uid('card'), title: i.title, desc: i.desc || '', status: 'nao-iniciada', priority: i.priority || '', dueDate: i.dueDate || '', tags: [], checklist: [], completed: false, completedAt: '', completedBy: '', comments: [],
        history: [{ ts: now, action: 'Cartão criado pela RENATA', user: w }], deleted: false, deletedAt: '', deletedBy: '', deletedFromColumnId: '', deletedFromColumnName: '', deletedFromBoardId: '', deletedFromBoardName: '',
        archived: false, archivedAt: '', archivedFromColumnId: '', archivedFromColumnName: '', archivedFromBoardId: '', archivedFromBoardName: '', createdAt: now, createdBy: w, updatedAt: now, updatedBy: w, createdVia: 'api',
      };
      col.cards.push(card);
      return { status: 201, json: { cartao: { id: card.id, title: card.title, board: board.name, column: col.name, dueDate: card.dueDate, priority: card.priority } } };
    }) });
  registry.add({ ...base, name: 'quadro_atualizar_atividade', summary: 'Altera um cartão do quadro pessoal: título, descrição, prazo, prioridade, status, coluna. limparPrazo=true remove o prazo.', risk: 'write',
    params: T.obj({ id: T.str('Id do cartão (use quadro_listar)'), title: T.str('Título'), desc: T.str('Descrição'), dueDate: T.date('Novo prazo'), limparPrazo: T.bool('Remover o prazo'), priority: T.enm('Prioridade', PRI), status: T.enm('Status', STATUS), column: T.str('Mover para a coluna (nome)') }, ['id']),
    before: cardBefore, describe: (i, b) => `Alterar o cartão “${(b && b.title) || i.id}”: ${Object.keys(i).filter((k) => k !== 'id').join(', ')}.`,
    undo: (i, b, r) => {
      const a = r && r.anterior; if (!a) return null;
      const input = { id: i.id };
      if (i.title !== undefined) input.title = a.title;
      if (i.priority !== undefined) input.priority = a.priority || 'media';
      if (i.status !== undefined) input.status = a.status;
      if (i.dueDate !== undefined || i.limparPrazo) { if (a.dueDate) input.dueDate = a.dueDate; else input.limparPrazo = true; }
      if (i.column !== undefined) input.column = a.column;
      return Object.keys(input).length > 1 ? { tool: 'quadro_atualizar_atividade', input, label: 'devolver os valores anteriores do cartão' } : null;
    },
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const f = findCard(boards, i.id);
      if (!f) return { status: 404, json: { message: 'Cartão não encontrado (ele pode ter sido excluído).' } };
      const prev = publicCard(f);
      let card = { ...f.card };
      const changes = [];
      if (i.title !== undefined) { card.title = i.title; changes.push('título'); }
      if (i.desc !== undefined) { card.desc = i.desc; card.descFormat = ''; changes.push('descrição'); }
      if (i.limparPrazo) { card.dueDate = ''; changes.push('prazo removido'); } else if (i.dueDate !== undefined) { card.dueDate = i.dueDate; changes.push(`prazo ${i.dueDate}`); }
      if (i.priority !== undefined) { card.priority = i.priority; changes.push(`prioridade ${i.priority}`); }
      if (i.status !== undefined) {
        const done = i.status === 'concluida';
        card = { ...card, status: i.status, completed: done, completedAt: done ? (card.completed ? card.completedAt : now) : '', completedBy: done ? (card.completed ? card.completedBy : w) : '' };
        changes.push(`status ${i.status}`);
      }
      card = withHistory(card, `Alterado pela RENATA: ${changes.join(', ') || 'sem mudanças'}`, now, w);
      let destName = f.col.name;
      if (i.column && !same(i.column, f.col.name)) {
        const dest = f.board.columns.find((c) => c.id === i.column || same(c.name, i.column));
        if (!dest) return { status: 404, json: { message: `Coluna “${i.column}” não existe. Colunas: ${f.board.columns.map((c) => c.name).join(', ')}.` } };
        f.col.cards.splice(f.idx, 1); dest.cards.push(card); destName = dest.name;
        changes.push(`coluna ${dest.name}`);
      } else f.col.cards[f.idx] = card;
      return { status: 200, json: { anterior: prev, cartao: { id: card.id, title: card.title, board: f.board.name, column: destName, dueDate: card.dueDate, priority: card.priority || '', status: card.status || prev.status, completed: !!card.completed }, alteracoes: changes } };
    }),
    summarize: (i, r) => `Cartão “${r.cartao.title}” atualizado (${r.alteracoes.join(', ')}).` });
  registry.add({ ...base, name: 'quadro_concluir_atividade', summary: 'Conclui um cartão do quadro pessoal.', risk: 'write', params: T.obj({ id: T.str('Id do cartão') }, ['id']), before: cardBefore, describe: (i, b) => `Concluir o cartão “${(b && b.title) || i.id}”.`,
    undo: (i) => ({ tool: 'quadro_atualizar_atividade', input: { id: i.id, status: 'nao-iniciada' }, label: 'reabrir o cartão' }),
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const f = findCard(boards, i.id);
      if (!f) return { status: 404, json: { message: 'Cartão não encontrado.' } };
      if (f.card.completed) return { status: 200, json: { cartao: publicCard(f), jaConcluido: true } };
      const card = withHistory({ ...f.card, status: 'concluida', completed: true, completedAt: now, completedBy: w }, 'Concluído pela RENATA', now, w);
      f.col.cards.splice(f.idx, 1); f.col.cards.push(card);
      return { status: 200, json: { cartao: { ...publicCard({ ...f, card }), completed: true } } };
    }), summarize: (i, r) => (r.jaConcluido ? 'O cartão já estava concluído.' : `Cartão “${r.cartao.title}” concluído.`) });
  registry.add({ ...base, name: 'quadro_excluir_atividade', summary: 'Exclui um cartão do quadro pessoal (vai para a lixeira do quadro).', risk: 'critical', params: T.obj({ id: T.str('Id do cartão') }, ['id']), before: cardBefore, describe: (i, b) => `EXCLUIR o cartão “${(b && b.title) || i.id}” do quadro pessoal.`,
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const f = findCard(boards, i.id);
      if (!f) return { status: 404, json: { message: 'Cartão não encontrado.' } };
      f.col.cards[f.idx] = withHistory({ ...f.card, deleted: true, deletedAt: now, deletedBy: w, deletedFromColumnId: f.col.id, deletedFromColumnName: f.col.name, deletedFromBoardId: f.board.id, deletedFromBoardName: f.board.name }, 'Excluído pela RENATA', now, w);
      return { status: 200, json: { excluido: { id: f.card.id, title: f.card.title } } };
    }) });
}
