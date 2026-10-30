// Organização do quadro por API: lógica pura (server/boardPlan.js). Rodar: node scripts/board-plan.test.mjs
import assert from 'node:assert/strict';
import { describeBoard, planOperations } from '../server/boardPlan.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const ctx = { now: '2026-10-30T15:00:00.000Z', who: 'Rafael Souza (via API)', tokenName: 'Janela das reuniões', today: '2026-10-30' };
const mk = (id, title, o = {}) => ({ id, title, desc: '', status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [], responsibleIds: [], completed: false, comments: [], history: [], deleted: false, archived: false, ...o });
const base = () => ({
  boards: [
    { id: 'p1', name: 'PRICETAX', responsibles: [{ id: 'r1', name: 'Rafael' }, { id: 'r2', name: 'Felipe' }], columns: [
      { id: 'c1', name: 'TO_DO', cards: [
        mk('k1', 'ROMANHA', { tags: ['romanha'], responsibleIds: ['r2'], checklist: [{ id: 'i1', text: 'Planilha de preço', done: false, dueDate: '2026-11-09', responsibleIds: ['r2'] }] }),
        mk('k2', 'ROMANHA – planilha', { tags: ['preço'], priority: 'alta', checklist: [{ id: 'i2', text: 'planilha de preço', done: false }, { id: 'i3', text: 'Enviar ao cliente', done: false }], desc: 'duplicado' }),
        mk('k3', 'KUHN', {}),
        mk('k4', 'Concluído', { completed: true, status: 'concluida' }),
      ] },
      { id: 'c2', name: 'FELIPE', cards: [] },
    ] },
    { id: 'p2', name: 'OPERAÇÕES', responsibles: [{ id: 'q1', name: 'Maiara' }], columns: [{ id: 'd1', name: 'MAIARA', cards: [] }] },
  ],
});
const card = (data, id) => { for (const p of data.boards) for (const c of p.columns) { const k = c.cards.find((x) => x.id === id); if (k) return k; } return null; };
const colOf = (data, id) => { for (const p of data.boards) for (const c of p.columns) if (c.cards.some((x) => x.id === id)) return `${p.name}/${c.name}`; return null; };

ok('não altera o quadro original (trabalha numa cópia)', () => {
  const d = base(); const before = JSON.stringify(d);
  planOperations(d, [{ op: 'move_card', card: 'k1', column: 'FELIPE' }], ctx);
  assert.equal(JSON.stringify(d), before);
});

ok('mover cartão na mesma página: vai ao fim, registra histórico e carimbo', () => {
  const r = planOperations(base(), [{ op: 'move_card', card: 'k1', column: 'FELIPE' }], ctx);
  assert.equal(r.errors.length, 0);
  assert.equal(colOf(r.next, 'k1'), 'PRICETAX/FELIPE');
  const k = card(r.next, 'k1');
  assert.match(k.history[0].action, /Movida de PRICETAX › TO_DO para PRICETAX › FELIPE — Organizado pela API \(chave "Janela das reuniões"\)/);
  assert.equal(k.updatedBy, 'Rafael Souza (via API)');
  assert.equal(r.counts.move_card, 1);
});

ok('mover para outra página reaponta os responsáveis pelo NOME (cria o que falta)', () => {
  const r = planOperations(base(), [{ op: 'move_card', card: 'k1', page: 'OPERAÇÕES', column: 'MAIARA' }], ctx);
  assert.equal(r.errors.length, 0);
  const k = card(r.next, 'k1'); const p2 = r.next.boards[1];
  const felipe = p2.responsibles.find((x) => x.name === 'Felipe');
  assert.ok(felipe, 'Felipe foi cadastrado na página de destino');
  assert.deepEqual(k.responsibleIds, [felipe.id]);
  assert.deepEqual(k.checklist[0].responsibleIds, [felipe.id]);
});

ok('mover para a mesma coluna é no-op e não conta como mudança', () => {
  const r = planOperations(base(), [{ op: 'move_card', card: 'k1', column: 'TO_DO' }], ctx);
  assert.equal(r.changed, 0);
  assert.equal(r.changes[0].noop, true);
});

ok('update_card: campos, etiquetas, responsáveis (por nome) e aguardando', () => {
  const r = planOperations(base(), [{ op: 'update_card', card: 'k3', set: { title: 'KUHN – Compras', priority: 'urgente', dueDate: '2026-11-03', status: 'em-andamento', addTags: ['kuhn', 'compras'], responsibles: ['Maiara', 'Rafael'], waiting: { who: 'cliente' } } }], ctx);
  assert.equal(r.errors.length, 0);
  const k = card(r.next, 'k3'); const p1 = r.next.boards[0];
  assert.equal(k.title, 'KUHN – Compras'); assert.equal(k.priority, 'urgente'); assert.equal(k.dueDate, '2026-11-03'); assert.equal(k.status, 'em-andamento');
  assert.deepEqual(k.tags, ['kuhn', 'compras']);
  assert.deepEqual(k.responsibleIds.map((id) => p1.responsibles.find((x) => x.id === id).name).sort(), ['Maiara', 'Rafael']);
  assert.equal(k.waiting.who, 'cliente'); assert.equal(k.waiting.since, '2026-10-30');
  const off = planOperations(r.next, [{ op: 'update_card', card: 'k3', set: { waiting: null } }], ctx);
  assert.equal(card(off.next, 'k3').waiting, undefined);
});

ok('update_card recusa campo fora da lista, data inválida e cartão concluído', () => {
  assert.match(planOperations(base(), [{ op: 'update_card', card: 'k3', set: { completed: true } }], ctx).errors[0].message, /não permitido/);
  assert.match(planOperations(base(), [{ op: 'update_card', card: 'k3', set: { dueDate: '31/12/2026' } }], ctx).errors[0].message, /dueDate/);
  assert.match(planOperations(base(), [{ op: 'update_card', card: 'k3', set: { status: 'concluida' } }], ctx).errors[0].message, /status inválido/);
  assert.match(planOperations(base(), [{ op: 'update_card', card: 'k4', set: { title: 'x' } }], ctx).errors[0].message, /concluído/);
});

ok('add_checklist ignora passo repetido (sem diferenciar maiúscula) e ajusta o prazo da atividade', () => {
  const r = planOperations(base(), [{ op: 'add_checklist', card: 'k2', items: ['Planilha de preço', { text: 'Reapurar com CBS', dueDate: '2026-11-12', responsibles: ['Maiara'] }] }], ctx);
  assert.equal(r.errors.length, 0);
  const k = card(r.next, 'k2');
  assert.equal(k.checklist.length, 3);
  assert.equal(k.dueDate, '2026-11-12');
  assert.match(k.history[0].action, /Prazo ajustado automaticamente|passo adicionado/);
  assert.ok(k.checklist[2].responsibleIds.length === 1);
  const again = planOperations(r.next, [{ op: 'add_checklist', card: 'k2', items: ['reapurar com cbs'] }], ctx);
  assert.equal(again.changed, 0);
});

ok('merge_cards: junta passos, etiquetas, responsáveis e prioridade; o original vai para a Lixeira', () => {
  const r = planOperations(base(), [{ op: 'merge_cards', into: 'k1', from: ['k2'] }], ctx);
  assert.equal(r.errors.length, 0);
  const into = card(r.next, 'k1'); const src = card(r.next, 'k2');
  assert.deepEqual(into.checklist.map((i) => i.text), ['Planilha de preço', 'Enviar ao cliente']);
  assert.deepEqual(into.tags.sort(), ['preço', 'romanha']);
  assert.equal(into.priority, 'alta');
  assert.match(into.desc, /duplicado/);
  assert.equal(src.deleted, true); assert.equal(src.deletedFromColumnName, 'TO_DO'); assert.equal(src.deletedFromBoardId, 'p1');
  assert.ok(colOf(r.next, 'k2'), 'o cartão continua no quadro (Lixeira), não some');
});

ok('merge_cards recusa juntar cartão concluído, inexistente ou o próprio destino', () => {
  assert.match(planOperations(base(), [{ op: 'merge_cards', into: 'k1', from: ['k4'] }], ctx).errors[0].message, /concluído/);
  assert.match(planOperations(base(), [{ op: 'merge_cards', into: 'k1', from: ['nao-existe'] }], ctx).errors[0].message, /não encontrado/);
  assert.match(planOperations(base(), [{ op: 'merge_cards', into: 'k1', from: ['k1'] }], ctx).errors[0].message, /from/);
});

ok('trash_card e archive_card usam os mesmos campos da tela e são recuperáveis', () => {
  const r = planOperations(base(), [{ op: 'trash_card', card: 'k3', reason: 'duplicado' }, { op: 'archive_card', card: 'k2' }], ctx);
  const t = card(r.next, 'k3'); const a = card(r.next, 'k2');
  assert.equal(t.deleted, true); assert.equal(t.deletedFromColumnName, 'TO_DO'); assert.equal(t.deletedBy, 'Rafael Souza (via API)');
  assert.equal(a.archived, true); assert.equal(a.archivedFromBoardName, 'PRICETAX');
  assert.match(planOperations(r.next, [{ op: 'move_card', card: 'k3', column: 'FELIPE' }], ctx).errors[0].message, /Lixeira/);
});

ok('colunas: criar (idempotente, com posição) e renomear', () => {
  const r = planOperations(base(), [{ op: 'create_column', page: 'PRICETAX', name: 'AGUARDANDO', after: 'TO_DO', color: 'purple' }, { op: 'create_column', page: 'PRICETAX', name: 'felipe' }, { op: 'rename_column', page: 'PRICETAX', column: 'FELIPE', name: 'FELIPE (dev)' }], ctx);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.next.boards[0].columns.map((c) => c.name), ['TO_DO', 'AGUARDANDO', 'FELIPE (dev)']);
  assert.equal(r.changes[1].noop, true);
  assert.match(planOperations(base(), [{ op: 'create_column', page: 'PRICETAX', name: 'X', color: 'rosa-choque' }], ctx).errors[0].message, /Cor inválida/);
});

ok('create_card: responsáveis cadastrados na página, passos, prazo automático e ref idempotente', () => {
  const op = { op: 'create_card', page: 'OPERAÇÕES', column: 'MAIARA', title: '[CLAC] Reapurar com CBS 11,2468%', ref: 'reuniao-1030-clac-1', tags: ['clac'], responsibles: ['Maiara'], priority: 'alta', status: 'em-andamento', checklist: [{ text: 'Reapurar', dueDate: '2026-11-05' }, 'Enviar'] };
  const r = planOperations(base(), [op], ctx);
  assert.equal(r.errors.length, 0);
  const k = r.next.boards[1].columns[0].cards[0];
  assert.deepEqual(k.responsibleIds, ['q1']);
  assert.equal(k.dueDate, '2026-11-05'); assert.equal(k.createdVia, 'api'); assert.equal(k.createdAt, ctx.now); assert.equal(k.checklist.length, 2);
  const again = planOperations(r.next, [op], ctx);
  assert.equal(again.changed, 0); assert.equal(again.changes[0].noop, true);
  assert.equal(again.next.boards[1].columns[0].cards.length, 1);
});

ok('tudo ou nada: um erro no lote é reportado com o índice da operação', () => {
  const r = planOperations(base(), [{ op: 'move_card', card: 'k1', column: 'FELIPE' }, { op: 'move_card', card: 'k1', column: 'NAO-EXISTE' }, { op: 'faz_magica' }], ctx);
  assert.equal(r.errors.length, 2);
  assert.deepEqual(r.errors.map((e) => e.index), [1, 2]);
});

ok('lote vazio ou malformado não quebra', () => {
  assert.equal(planOperations(base(), [], ctx).changed, 0);
  assert.equal(planOperations(base(), null, ctx).changed, 0);
  assert.equal(planOperations(null, [{ op: 'create_column', name: 'X' }], ctx).errors.length, 1);
  assert.equal(planOperations(base(), [null, 5, 'x'], ctx).errors.length, 3);
});

ok('describeBoard lista ids, responsáveis por nome e contagem de passos, sem cartões da Lixeira', () => {
  const d = base(); d.boards[0].columns[0].cards[2].deleted = true;
  const out = describeBoard(d, { checklist: true });
  const col = out.pages[0].columns[0];
  assert.equal(col.cards.length, 3);
  const k1 = col.cards.find((c) => c.id === 'k1');
  assert.deepEqual(k1.responsibles, ['Felipe']);
  assert.deepEqual(k1.checklist, { open: 1, done: 0 });
  assert.equal(k1.items[0].responsibles[0], 'Felipe');
  assert.equal(out.pages[0].responsibles.length, 2);
});

console.log(`\n${n} verificações ok`);
