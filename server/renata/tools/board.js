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

  // ---------- checklist, comentários, páginas e colunas
  registry.add({ ...base, name: 'quadro_checklist', summary: 'Mexe no checklist de um cartão: adicionar item, marcar/desmarcar (por itemId ou texto) ou remover.', risk: 'write',
    params: T.obj({ id: T.str('Id do cartão'), acao: T.enm('O que fazer: adicionar, marcar, desmarcar, remover, definir_prazo (altera/remove o prazo do item), mover_cima, mover_baixo (muda a ordem do item) ou atribuir_responsavel / remover_responsavel (pelo nome)', ['adicionar', 'marcar', 'desmarcar', 'remover', 'definir_prazo', 'mover_cima', 'mover_baixo', 'atribuir_responsavel', 'remover_responsavel']), nome: T.str('Nome do responsável (atribuir_responsavel / remover_responsavel)'), texto: T.str('Texto do item (novo, ou para localizar o item)'), itemId: T.str('Id do item'), prazo: T.date('Prazo do item (opcional) em adicionar; novo prazo em definir_prazo'), limparPrazo: T.bool('Remover o prazo do item (definir_prazo)') }, ['id', 'acao']),
    before: cardBefore, describe: (i, b) => `Checklist do cartão “${(b && b.title) || i.id}”: ${i.acao}${i.texto ? ` “${i.texto}”` : ''}.`,
    undo: (i, b, r) => {
      if (!r || !r.item) return null;
      if (i.acao === 'adicionar') return { tool: 'quadro_checklist', input: { id: i.id, acao: 'remover', itemId: r.item.id }, label: 'remover o item' };
      if (i.acao === 'marcar') return { tool: 'quadro_checklist', input: { id: i.id, acao: 'desmarcar', itemId: r.item.id }, label: 'desmarcar o item' };
      if (i.acao === 'desmarcar') return { tool: 'quadro_checklist', input: { id: i.id, acao: 'marcar', itemId: r.item.id }, label: 'marcar o item' };
      if (i.acao === 'mover_cima') return r.mudou ? { tool: 'quadro_checklist', input: { id: i.id, acao: 'mover_baixo', itemId: r.item.id }, label: 'devolver o item à posição anterior' } : null;
      if (i.acao === 'mover_baixo') return r.mudou ? { tool: 'quadro_checklist', input: { id: i.id, acao: 'mover_cima', itemId: r.item.id }, label: 'devolver o item à posição anterior' } : null;
      if (i.acao === 'atribuir_responsavel') return r.mudou ? { tool: 'quadro_checklist', input: { id: i.id, acao: 'remover_responsavel', itemId: r.item.id, nome: i.nome }, label: 'tirar o responsável do item' } : null;
      if (i.acao === 'remover_responsavel') return r.mudou ? { tool: 'quadro_checklist', input: { id: i.id, acao: 'atribuir_responsavel', itemId: r.item.id, nome: i.nome }, label: 'atribuir de novo' } : null;
      if (i.acao === 'definir_prazo') return r.anteriorPrazo ? { tool: 'quadro_checklist', input: { id: i.id, acao: 'definir_prazo', itemId: r.item.id, prazo: r.anteriorPrazo }, label: 'devolver o prazo anterior' } : { tool: 'quadro_checklist', input: { id: i.id, acao: 'definir_prazo', itemId: r.item.id, limparPrazo: true }, label: 'remover o prazo' };
      return null;
    },
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const f = findCard(boards, i.id);
      if (!f) return { status: 404, json: { message: 'Cartão não encontrado.' } };
      const list = [...(f.card.checklist || [])];
      let item; let anteriorPrazo = ''; let mudou = true;
      if (i.acao === 'adicionar') {
        if (!i.texto) return { status: 400, json: { message: 'Informe o texto do item.' } };
        item = { id: uid('chk'), text: i.texto, done: false, ...(i.prazo ? { dueDate: i.prazo } : {}) }; list.push(item);
      } else {
        const idx = i.itemId ? list.findIndex((x) => x.id === i.itemId) : list.findIndex((x) => same(x.text, i.texto));
        if (idx < 0) return { status: 404, json: { message: 'Item do checklist não encontrado. Itens: ' + (list.map((x) => `“${x.text}”`).join(', ') || '(nenhum)') } };
        item = list[idx];
        if (i.acao === 'remover') list.splice(idx, 1);
        else if (i.acao === 'mover_cima' || i.acao === 'mover_baixo') {
          const j = idx + (i.acao === 'mover_cima' ? -1 : 1);
          if (j < 0 || j >= list.length) mudou = false; else [list[idx], list[j]] = [list[j], list[idx]];
        } else if (i.acao === 'atribuir_responsavel' || i.acao === 'remover_responsavel') {
          const nome = String(i.nome || '').trim().slice(0, 60);
          if (!nome) return { status: 400, json: { message: 'Informe o nome do responsável.' } };
          const norm = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
          f.board.responsibles = f.board.responsibles || [];
          let resp = f.board.responsibles.find((x) => norm(x.name) === norm(nome));
          const ids = [...(item.responsibleIds || [])];
          if (i.acao === 'atribuir_responsavel') {
            if (!resp) { resp = { id: uid('resp'), name: nome }; f.board.responsibles.push(resp); }
            if (ids.includes(resp.id)) mudou = false; else ids.push(resp.id);
          } else {
            if (!resp || !ids.includes(resp.id)) return { status: 404, json: { message: `“${nome}” não é responsável por este item.` } };
            ids.splice(ids.indexOf(resp.id), 1);
          }
          list[idx] = { ...item, responsibleIds: ids };
        } else if (i.acao === 'definir_prazo') {
          if (!i.prazo && !i.limparPrazo) return { status: 400, json: { message: 'Informe o prazo (AAAA-MM-DD) ou limparPrazo=true.' } };
          anteriorPrazo = item.dueDate || '';
          const { dueDate, ...rest } = item;
          list[idx] = i.limparPrazo ? rest : { ...rest, dueDate: i.prazo };
        } else list[idx] = { ...item, done: i.acao === 'marcar' };
        if (i.acao !== 'remover') item = list.find((x) => x.id === item.id);
      }
      f.col.cards[f.idx] = withHistory({ ...f.card, checklist: list }, `Checklist alterado pela RENATA: ${i.acao}${item ? ` “${item.text}”` : ''}${i.nome && /responsavel/.test(i.acao) ? ` (${i.nome})` : ''}`, now, w);
      return { status: 200, json: { cartao: { id: f.card.id, title: f.card.title }, item: { id: item.id, text: item.text, done: !!item.done, prazo: item.dueDate || '', responsaveis: (item.responsibleIds || []).map((rid) => ((f.board.responsibles || []).find((x) => x.id === rid) || {}).name).filter(Boolean) }, mudou, anteriorPrazo, itens: list.length, feitos: list.filter((x) => x.done).length } };
    }), summarize: (i, r) => `Checklist de “${r.cartao.title}”: ${i.acao} “${r.item.text}” (${r.feitos}/${r.itens}).` });
  registry.add({ ...base, name: 'quadro_responsavel', summary: 'Atribui ou remove um responsável de um cartão do quadro pessoal (o responsável é criado na lista da página se ainda não existir).', risk: 'write',
    params: T.obj({ id: T.str('Id do cartão'), acao: T.enm('atribuir ou remover', ['atribuir', 'remover']), nome: T.str('Nome do responsável') }, ['id', 'acao', 'nome']),
    before: cardBefore, describe: (i, b) => `${i.acao === 'atribuir' ? 'Atribuir' : 'Remover'} o responsável “${i.nome}” no cartão “${(b && b.title) || i.id}”.`,
    undo: (i, b, r) => (r && r.mudou ? { tool: 'quadro_responsavel', input: { id: i.id, acao: i.acao === 'atribuir' ? 'remover' : 'atribuir', nome: i.nome }, label: i.acao === 'atribuir' ? 'remover o responsável' : 'atribuir de novo' } : null),
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const f = findCard(boards, i.id);
      if (!f) return { status: 404, json: { message: 'Cartão não encontrado.' } };
      const nome = String(i.nome || '').trim().slice(0, 60);
      if (!nome) return { status: 400, json: { message: 'Informe o nome do responsável.' } };
      const norm = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      f.board.responsibles = f.board.responsibles || [];
      let resp = f.board.responsibles.find((x) => norm(x.name) === norm(nome));
      const ids = f.card.responsibleIds || [];
      let mudou = false;
      if (i.acao === 'atribuir') {
        if (!resp) { resp = { id: uid('resp'), name: nome }; f.board.responsibles.push(resp); }
        if (!ids.includes(resp.id)) { ids.push(resp.id); mudou = true; }
      } else {
        if (!resp || !ids.includes(resp.id)) return { status: 404, json: { message: `“${nome}” não é responsável por este cartão. Responsáveis: ${ids.map((id) => (f.board.responsibles.find((x) => x.id === id) || {}).name).filter(Boolean).join(', ') || '(nenhum)'}.` } };
        ids.splice(ids.indexOf(resp.id), 1); mudou = true;
      }
      f.col.cards[f.idx] = withHistory({ ...f.card, responsibleIds: ids }, `Responsável ${i.acao === 'atribuir' ? 'atribuído' : 'removido'} pela RENATA: ${resp.name}`, now, w);
      return { status: 200, json: { cartao: { id: f.card.id, title: f.card.title }, responsavel: resp.name, mudou, responsaveis: ids.map((id) => (f.board.responsibles.find((x) => x.id === id) || {}).name).filter(Boolean) } };
    }), summarize: (i, r) => `${r.mudou ? (i.acao === 'atribuir' ? 'Responsável atribuído' : 'Responsável removido') : 'Sem mudança'}: ${r.responsavel} em “${r.cartao.title}”.` });
  registry.add({ ...base, name: 'quadro_comentar', summary: 'Adiciona um comentário a um cartão do quadro pessoal.', risk: 'write', creates: true, params: T.obj({ id: T.str('Id do cartão'), texto: T.str('Comentário', { minLength: 1, maxLength: 2000 }) }, ['id', 'texto']),
    before: cardBefore, describe: (i, b) => `Comentar no cartão “${(b && b.title) || i.id}”: “${i.texto.slice(0, 80)}”.`,
    run: (ctx, i) => withBoard(ctx, ({ boards, now, who: w }) => {
      const f = findCard(boards, i.id);
      if (!f) return { status: 404, json: { message: 'Cartão não encontrado.' } };
      const c = { id: uid('cm'), text: i.texto, ts: now, author: w, authorId: ctx.user.id };
      f.col.cards[f.idx] = withHistory({ ...f.card, comments: [...(f.card.comments || []), c] }, 'Comentário adicionado pela RENATA', now, w);
      return { status: 201, json: { cartao: { id: f.card.id, title: f.card.title }, comentario: { id: c.id } } };
    }), summarize: (i, r) => `Comentário adicionado ao cartão “${r.cartao.title}”.` });
  registry.add({ ...base, name: 'quadro_criar_coluna', summary: 'Cria uma coluna numa página do quadro pessoal.', risk: 'write', creates: true, params: T.obj({ board: T.str('Página (nome); padrão a primeira'), name: T.str('Nome da coluna', { maxLength: 80 }) }, ['name']),
    describe: (i) => `Criar a coluna “${i.name}”.`,
    run: (ctx, i) => withBoard(ctx, ({ boards }) => {
      const b = i.board ? boards.find((x) => x.id === i.board || same(x.name, i.board)) : boards[0];
      if (!b) return { status: 404, json: { message: `Página “${i.board}” não existe. Páginas: ${boards.map((x) => x.name).join(', ')}.` } };
      if (b.columns.some((c) => same(c.name, i.name))) return { status: 409, json: { message: `Já existe a coluna “${i.name}” em “${b.name}”.` } };
      const col = { id: uid('col'), name: i.name, cards: [] };
      b.columns.push(col);
      return { status: 201, json: { coluna: { id: col.id, name: col.name, pagina: b.name } } };
    }), summarize: (i, r) => `Coluna “${r.coluna.name}” criada em “${r.coluna.pagina}”.` });
  registry.add({ ...base, name: 'quadro_criar_pagina', summary: 'Cria uma página nova no quadro pessoal (com as colunas A fazer, Em andamento e Concluído).', risk: 'write', creates: true, params: T.obj({ name: T.str('Nome da página', { maxLength: 80 }) }, ['name']),
    describe: (i) => `Criar a página “${i.name}” no quadro.`,
    run: (ctx, i) => withBoard(ctx, ({ boards }) => {
      if (boards.some((b) => same(b.name, i.name))) return { status: 409, json: { message: `Já existe a página “${i.name}”.` } };
      const b = { id: uid('board'), name: i.name, visibility: 'private', shareToken: '', log: [], columns: ['A fazer', 'Em andamento', 'Concluído'].map((n) => ({ id: uid('col'), name: n, cards: [] })) };
      boards.push(b);
      return { status: 201, json: { pagina: { id: b.id, name: b.name } } };
    }), summarize: (i, r) => `Página “${r.pagina.name}” criada no quadro.` });
}
