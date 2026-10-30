import { noteToText } from './richNote.js';

// Organização do quadro pessoal por API (2026-10-30, pedido do Rafael para a outra janela do Claude Code): uma lista de operações aplicada
// em memória sobre o quadro, com prévia (o que mudaria, cartão por cartão) e gravação só com confirmação. Funções puras, sem banco —
// a rota (server/connect.js, POST /board/plan) cuida da transação, da cópia de segurança e do registro.
// Regras: tudo ou nada (um erro em qualquer operação recusa o lote); nada é apagado de vez (descartar = Lixeira; arquivar = Concluídas);
// concluir cartão não faz parte da organização; cada cartão alterado ganha uma linha no histórico.

export const MAX_OPS = 300;
const PRIORITIES = ['urgente', 'alta', 'media', 'baixa'];
const STATUSES = ['nao-iniciada', 'em-andamento', 'pausada'];
const COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'brown'];
const OPS = ['create_column', 'rename_column', 'create_card', 'move_card', 'update_card', 'add_checklist', 'merge_cards', 'archive_card', 'trash_card'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const same = (a, b) => norm(a) === norm(b);
export const isIsoDay = (s) => typeof s === 'string' && ISO.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

// ---------------------------------------------------------------- leitura (para quem vai planejar)
export function describeBoard(data, { checklist = false } = {}) {
  return {
    pages: ((data && data.boards) || []).map((p) => ({
      id: p.id, name: p.name || '', visibility: p.visibility || 'private',
      responsibles: (p.responsibles || []).map((r) => ({ id: r.id, name: r.name })),
      columns: (p.columns || []).map((c) => ({
        id: c.id, name: c.name || '', color: c.color || '',
        cards: (c.cards || []).filter((k) => k && !k.deleted && !k.archived).map((k) => ({
          id: k.id, title: clip(k.title, 200), status: k.status || (k.completed ? 'concluida' : 'nao-iniciada'), completed: !!k.completed,
          priority: k.priority || '', dueDate: k.dueDate || '', tags: Array.isArray(k.tags) ? k.tags : [],
          responsibles: (k.responsibleIds || []).map((id) => (p.responsibles || []).find((r) => r.id === id)).filter(Boolean).map((r) => r.name),
          waiting: k.waiting && k.waiting.since ? { since: k.waiting.since, who: k.waiting.who || '' } : null,
          checklist: { open: (k.checklist || []).filter((i) => !i.done).length, done: (k.checklist || []).filter((i) => i.done).length },
          ...(checklist ? { items: (k.checklist || []).map((i) => ({ id: i.id, text: clip(i.text, 200), done: !!i.done, dueDate: i.dueDate || '', responsibles: (i.responsibleIds || []).map((id) => ((p.responsibles || []).find((r) => r.id === id) || {}).name).filter(Boolean) })) } : {}),
          desc: clip(noteToText(k.desc, k.descFormat), 300), createdVia: k.createdVia || '', updatedAt: k.updatedAt || '',
        })),
      })),
    })),
  };
}

// ---------------------------------------------------------------- aplicação
// ctx: { now: ISO, who: 'Fulano (via API)', tokenName, today: AAAA-MM-DD }. Devolve { next, changes, errors, counts, touched }. Não altera `data`.
export function planOperations(data, operations, ctx) {
  const next = clone(data && Array.isArray(data.boards) ? data : { boards: [] });
  const changes = []; const errors = []; const touched = new Set();
  const note = `Organizado pela API (chave "${clip(ctx.tokenName, 40)}")`;

  const findPage = (ref) => (ref ? next.boards.find((b) => b.id === ref || same(b.name, ref)) : next.boards[0]) || null;
  const findCol = (page, ref) => (page ? (page.columns || []).find((c) => c.id === ref || same(c.name, ref)) || null : null);
  const locate = (id) => {
    for (const page of next.boards) for (const col of page.columns || []) {
      const i = (col.cards || []).findIndex((k) => k && k.id === id);
      if (i >= 0) return { page, col, card: col.cards[i], i };
    }
    return null;
  };
  const ensureResp = (page, name) => {
    const v = clip(name, 60).trim();
    if (!v) return null;
    page.responsibles = page.responsibles || [];
    const hit = page.responsibles.find((r) => same(r.name, v));
    if (hit) return hit.id;
    const r = { id: uid('resp'), name: v };
    page.responsibles.push(r);
    return r.id;
  };
  const stamp = (card, action) => {
    card.updatedAt = ctx.now; card.updatedBy = ctx.who;
    card.history = [{ ts: ctx.now, action: `${action} — ${note}`, user: ctx.who }, ...(card.history || [])].slice(0, 200);
    touched.add(card.id);
  };
  const autoDue = (card) => {
    const latest = (card.checklist || []).map((i) => i.dueDate).filter(isIsoDay).sort().pop() || '';
    if (!latest || card.dueDate === latest) return;
    card.dueDate = latest;
    card.history = [{ ts: ctx.now, action: `Prazo ajustado automaticamente: ${latest.split('-').reverse().join('/')} (subatividade mais distante)`, user: ctx.who }, ...(card.history || [])].slice(0, 200);
  };
  const remap = (card, from, to) => {
    if (from === to) return;
    const mapIds = (ids) => [...new Set((ids || []).map((id) => { const r = (from.responsibles || []).find((x) => x.id === id); return r ? ensureResp(to, r.name) : null; }).filter(Boolean))];
    card.responsibleIds = mapIds(card.responsibleIds);
    card.checklist = (card.checklist || []).map((i) => (i.responsibleIds && i.responsibleIds.length ? { ...i, responsibleIds: mapIds(i.responsibleIds) } : i));
  };
  const textOf = (c) => `"${clip(c.title, 60)}"`;
  const where = (page, col) => `${page.name || '?'} › ${col.name || '?'}`;
  const trashFlags = (page, col) => ({ deletedFromColumnId: col.id, deletedFromColumnName: col.name, deletedFromBoardId: page.id, deletedFromBoardName: page.name });

  const ops = Array.isArray(operations) ? operations : [];
  ops.forEach((o, i) => {
    const bad = (m) => errors.push({ index: i, op: o && o.op, message: m });
    const log = (kind, card, summary, extra) => changes.push({ index: i, op: kind, card: card ? { id: card.id, title: clip(card.title, 120) } : null, summary, ...(extra || {}) });
    if (!isObj(o) || !OPS.includes(o.op)) return bad(`Operação desconhecida. Use: ${OPS.join(', ')}.`);

    if (o.op === 'create_column') {
      const page = findPage(o.page); if (!page) return bad(`Página "${o.page || ''}" não encontrada.`);
      const name = clip(o.name, 60).trim(); if (!name) return bad('Informe o nome da coluna (name).');
      if (findCol(page, name)) return log('create_column', null, `Coluna "${name}" já existe em "${page.name}" (nada a fazer).`, { noop: true });
      if (o.color && !COLORS.includes(o.color)) return bad(`Cor inválida. Use: ${COLORS.join(', ')}.`);
      const col = { id: uid('col'), name, color: o.color || '', hideCompleted: false, cards: [] };
      page.columns = page.columns || [];
      const at = o.after ? page.columns.findIndex((c) => c.id === o.after || same(c.name, o.after)) : -1;
      if (o.after && at < 0) return bad(`Coluna "${o.after}" (after) não encontrada.`);
      page.columns.splice(at >= 0 ? at + 1 : page.columns.length, 0, col);
      return log('create_column', null, `Coluna criada: "${name}" em "${page.name}".`);
    }

    if (o.op === 'rename_column') {
      const page = findPage(o.page); const col = findCol(page, o.column);
      if (!col) return bad(`Coluna "${o.column || ''}" não encontrada${page ? ` em "${page.name}"` : ''}.`);
      const name = clip(o.name, 60).trim(); if (!name) return bad('Informe o novo nome (name).');
      if (col.name === name) return log('rename_column', null, 'Mesmo nome (nada a fazer).', { noop: true });
      if (findCol(page, name) && !same(col.name, name)) return bad(`Já existe uma coluna "${name}" em "${page.name}".`);
      const before = col.name; col.name = name;
      return log('rename_column', null, `Coluna renomeada: "${before}" → "${name}".`);
    }

    if (o.op === 'create_card') {
      const page = findPage(o.page); if (!page) return bad(`Página "${o.page || ''}" não encontrada.`);
      const col = findCol(page, o.column); if (!col) return bad(`Coluna "${o.column || ''}" não encontrada em "${page.name}".`);
      const title = clip(o.title, 200).trim(); if (!title) return bad('Informe o título (title).');
      const ref = clip(o.ref, 80).trim();
      if (ref) {
        for (const p of next.boards) for (const c of p.columns || []) { const hit = (c.cards || []).find((k) => k.apiRef === ref && !k.deleted); if (hit) return log('create_card', hit, `Já existe (ref "${ref}"): nada a fazer.`, { noop: true }); }
      }
      if (o.priority && !PRIORITIES.includes(o.priority)) return bad(`priority inválida. Use: ${PRIORITIES.join(', ')}.`);
      if (o.dueDate && !isIsoDay(o.dueDate)) return bad('dueDate inválida. Use AAAA-MM-DD.');
      if (o.status && !STATUSES.includes(o.status)) return bad(`status inválido. Use: ${STATUSES.join(', ')}.`);
      const tags = Array.isArray(o.tags) ? [...new Set(o.tags.map((t) => clip(t, 40).trim()).filter(Boolean))].slice(0, 20) : [];
      const respIds = Array.isArray(o.responsibles) ? [...new Set(o.responsibles.map((n) => ensureResp(page, n)).filter(Boolean))] : [];
      const items = [];
      for (const it of (Array.isArray(o.checklist) ? o.checklist : []).slice(0, 50)) {
        const text = clip(isObj(it) ? it.text : it, 200).trim(); if (!text) continue;
        if (isObj(it) && it.dueDate && !isIsoDay(it.dueDate)) return bad(`dueDate inválida no item "${text}".`);
        items.push({ id: uid('chk'), text, done: false, ...(isObj(it) && it.dueDate ? { dueDate: it.dueDate } : {}), ...(isObj(it) && Array.isArray(it.responsibles) && it.responsibles.length ? { responsibleIds: [...new Set(it.responsibles.map((n) => ensureResp(page, n)).filter(Boolean))] } : {}) });
      }
      const card = {
        id: uid('card'), title, desc: clip(o.desc, 4000).trim(), status: o.status || 'nao-iniciada', priority: o.priority || '', dueDate: o.dueDate || '', tags, checklist: items,
        responsibleIds: respIds, completed: false, completedAt: '', completedBy: '', comments: [],
        history: [{ ts: ctx.now, action: `Tarefa criada pela API de conectividade (token "${clip(ctx.tokenName, 40)}")`, user: ctx.who }],
        deleted: false, deletedAt: '', deletedBy: '', deletedFromColumnId: '', deletedFromColumnName: '', deletedFromBoardId: '', deletedFromBoardName: '',
        archived: false, archivedAt: '', archivedFromColumnId: '', archivedFromColumnName: '', archivedFromBoardId: '', archivedFromBoardName: '',
        createdAt: ctx.now, createdBy: ctx.who, updatedAt: ctx.now, updatedBy: ctx.who, createdVia: 'api', ...(ref ? { apiRef: ref } : {}),
        ...(o.waiting ? { waiting: { who: clip(o.waiting.who, 80), since: isIsoDay(o.waiting.since) ? o.waiting.since : ctx.today } } : {}),
      };
      autoDue(card);
      col.cards = col.cards || []; col.cards.push(card); touched.add(card.id);
      return log('create_card', card, `Criada em ${where(page, col)}: ${textOf(card)}${tags.length ? ` [${tags.join(', ')}]` : ''}.`);
    }

    // ---- operações sobre cartão existente
    const loc = o.card ? locate(String(o.card)) : null;
    if (o.op !== 'merge_cards' && !loc) return bad(`Cartão "${o.card || ''}" não encontrado (use o id do cartão).`);
    if (loc && loc.card.deleted && o.op !== 'trash_card') return bad(`${textOf(loc.card)} está na Lixeira; restaure-o na tela antes de organizar.`);

    if (o.op === 'move_card') {
      const target = o.page ? findPage(o.page) : loc.page; if (!target) return bad(`Página "${o.page}" não encontrada.`);
      const col = findCol(target, o.column); if (!col) return bad(`Coluna "${o.column || ''}" não encontrada em "${target.name}".`);
      if (loc.col === col && !o.position) return log('move_card', loc.card, `${textOf(loc.card)} já está em ${where(target, col)} (nada a fazer).`, { noop: true });
      const [card] = loc.col.cards.splice(loc.i, 1);
      remap(card, loc.page, target);
      col.cards = col.cards || [];
      if (o.position === 'start') col.cards.unshift(card); else col.cards.push(card);
      stamp(card, `Movida de ${where(loc.page, loc.col)} para ${where(target, col)}`);
      return log('move_card', card, `${textOf(card)}: ${where(loc.page, loc.col)} → ${where(target, col)}.`);
    }

    if (o.op === 'update_card') {
      const set = isObj(o.set) ? o.set : null; if (!set) return bad('Informe o que mudar em set.');
      const c = loc.card; const page = loc.page; const parts = [];
      if (c.completed) return bad(`${textOf(c)} está concluído; a organização não altera cartão concluído.`);
      const fields = ['title', 'desc', 'priority', 'dueDate', 'status', 'tags', 'addTags', 'removeTags', 'responsibles', 'addResponsibles', 'waiting'];
      const unknown = Object.keys(set).filter((k) => !fields.includes(k));
      if (unknown.length) return bad(`Campo(s) não permitido(s) em set: ${unknown.join(', ')}.`);
      if ('title' in set) { const v = clip(set.title, 200).trim(); if (!v) return bad('title não pode ficar vazio.'); if (v !== c.title) { parts.push(`título: "${clip(c.title, 50)}" → "${clip(v, 50)}"`); c.title = v; } }
      if ('desc' in set) { const v = clip(set.desc, 4000).trim(); const cur = noteToText(c.desc, c.descFormat); if (v !== cur) { parts.push('descrição alterada'); c.desc = v; delete c.descFormat; } }
      if ('priority' in set) { const v = set.priority || ''; if (v && !PRIORITIES.includes(v)) return bad(`priority inválida. Use: ${PRIORITIES.join(', ')}.`); if (v !== (c.priority || '')) { parts.push(`prioridade: ${c.priority || '—'} → ${v || '—'}`); c.priority = v; } }
      if ('dueDate' in set) { const v = set.dueDate || ''; if (v && !isIsoDay(v)) return bad('dueDate inválida. Use AAAA-MM-DD.'); if (v !== (c.dueDate || '')) { parts.push(`prazo: ${c.dueDate || '—'} → ${v || '—'}`); c.dueDate = v; } }
      if ('status' in set) { if (!STATUSES.includes(set.status)) return bad(`status inválido. Use: ${STATUSES.join(', ')}.`); const cur = c.status || 'nao-iniciada'; if (set.status !== cur) { parts.push(`status: ${cur} → ${set.status}`); c.status = set.status; } }
      const cleanTags = (a) => (Array.isArray(a) ? [...new Set(a.map((t) => clip(t, 40).trim()).filter(Boolean))] : null);
      let tags = Array.isArray(c.tags) ? [...c.tags] : [];
      if ('tags' in set) { const t = cleanTags(set.tags); if (!t) return bad('tags deve ser uma lista.'); tags = t; }
      if ('addTags' in set) { const t = cleanTags(set.addTags); if (!t) return bad('addTags deve ser uma lista.'); tags = [...new Set([...tags, ...t])]; }
      if ('removeTags' in set) { const t = cleanTags(set.removeTags); if (!t) return bad('removeTags deve ser uma lista.'); tags = tags.filter((x) => !t.some((y) => same(x, y))); }
      tags = tags.slice(0, 20);
      if (JSON.stringify(tags) !== JSON.stringify(c.tags || [])) { parts.push(`etiquetas: [${(c.tags || []).join(', ')}] → [${tags.join(', ')}]`); c.tags = tags; }
      if ('responsibles' in set || 'addResponsibles' in set) {
        const nm = (a) => (Array.isArray(a) ? a.map((n) => clip(n, 60).trim()).filter(Boolean) : null);
        let ids = [...(c.responsibleIds || [])];
        if ('responsibles' in set) { const n = nm(set.responsibles); if (!n) return bad('responsibles deve ser uma lista de nomes.'); ids = n.map((x) => ensureResp(page, x)); }
        if ('addResponsibles' in set) { const n = nm(set.addResponsibles); if (!n) return bad('addResponsibles deve ser uma lista de nomes.'); ids = [...ids, ...n.map((x) => ensureResp(page, x))]; }
        ids = [...new Set(ids.filter(Boolean))];
        if (JSON.stringify(ids) !== JSON.stringify(c.responsibleIds || [])) {
          const names = (l) => l.map((id) => ((page.responsibles || []).find((r) => r.id === id) || {}).name).filter(Boolean).join(', ') || '—';
          parts.push(`responsáveis: ${names(c.responsibleIds || [])} → ${names(ids)}`); c.responsibleIds = ids;
        }
      }
      if ('waiting' in set) {
        if (set.waiting === null || set.waiting === false) { if (c.waiting) { parts.push('aguardando encerrado'); delete c.waiting; } }
        else if (isObj(set.waiting)) {
          if (set.waiting.since && !isIsoDay(set.waiting.since)) return bad('waiting.since inválida. Use AAAA-MM-DD.');
          const w = { who: clip(set.waiting.who, 80), since: set.waiting.since || (c.waiting && c.waiting.since) || ctx.today };
          if (!c.waiting || c.waiting.who !== w.who || c.waiting.since !== w.since) { parts.push(`aguardando${w.who ? ` ${w.who}` : ''} desde ${w.since}`); c.waiting = w; }
        } else return bad('waiting deve ser { who, since } ou null.');
      }
      if (!parts.length) return log('update_card', c, `${textOf(c)}: nada a alterar.`, { noop: true });
      stamp(c, `Atualizada: ${parts.join('; ')}`);
      return log('update_card', c, `${textOf(c)}: ${parts.join('; ')}.`);
    }

    if (o.op === 'add_checklist') {
      const c = loc.card; const page = loc.page;
      if (c.completed) return bad(`${textOf(c)} está concluído; a organização não altera cartão concluído.`);
      const list = Array.isArray(o.items) ? o.items.slice(0, 50) : null; if (!list || !list.length) return bad('Informe items (lista de passos).');
      const added = [];
      for (const it of list) {
        const text = clip(isObj(it) ? it.text : it, 200).trim(); if (!text) continue;
        if (isObj(it) && it.dueDate && !isIsoDay(it.dueDate)) return bad(`dueDate inválida no passo "${text}".`);
        if ((c.checklist || []).some((x) => same(x.text, text)) || added.some((x) => same(x.text, text))) continue;
        added.push({ id: uid('chk'), text, done: false, ...(isObj(it) && it.dueDate ? { dueDate: it.dueDate } : {}), ...(isObj(it) && Array.isArray(it.responsibles) && it.responsibles.length ? { responsibleIds: [...new Set(it.responsibles.map((n) => ensureResp(page, n)).filter(Boolean))] } : {}) });
      }
      if (!added.length) return log('add_checklist', c, `${textOf(c)}: todos os passos já existem (nada a fazer).`, { noop: true });
      c.checklist = [...(c.checklist || []), ...added]; autoDue(c);
      stamp(c, `${added.length} ${added.length === 1 ? 'passo adicionado' : 'passos adicionados'} ao checklist`);
      return log('add_checklist', c, `${textOf(c)}: + ${added.length} ${added.length === 1 ? 'passo' : 'passos'} (${added.map((x) => `"${clip(x.text, 40)}"`).join(', ')}).`);
    }

    if (o.op === 'merge_cards') {
      const into = o.into ? locate(String(o.into)) : null; if (!into) return bad(`Cartão de destino "${o.into || ''}" não encontrado (into).`);
      const froms = Array.isArray(o.from) ? [...new Set(o.from.map(String))].filter((id) => id !== into.card.id) : [];
      if (!froms.length) return bad('Informe from (lista de ids de cartões a juntar).');
      if (into.card.deleted) return bad(`${textOf(into.card)} está na Lixeira.`);
      if (into.card.completed) return bad(`${textOf(into.card)} está concluído; a organização não altera cartão concluído.`);
      for (const id of froms) {
        const f = locate(id); if (!f) return bad(`Cartão "${id}" (from) não encontrado.`);
        if (f.card.completed) return bad(`${textOf(f.card)} está concluído; não entra numa junção.`);
        if (f.card.deleted) return bad(`${textOf(f.card)} está na Lixeira; não entra numa junção.`);
      }
      const c = into.card; const names = [];
      for (const id of froms) {
        const f = locate(id); const src = f.card;
        const myPage = into.page;
        const srcTmp = clone(src); remap(srcTmp, f.page, myPage);
        const addItems = (srcTmp.checklist || []).filter((x) => !(c.checklist || []).some((y) => same(y.text, x.text))).map((x) => ({ ...x, id: uid('chk') }));
        c.checklist = [...(c.checklist || []), ...addItems];
        c.tags = [...new Set([...(c.tags || []), ...(src.tags || [])])].slice(0, 20);
        c.responsibleIds = [...new Set([...(c.responsibleIds || []), ...(srcTmp.responsibleIds || [])])];
        const rank = (p) => { const k = PRIORITIES.indexOf(p); return k < 0 ? 9 : k; };
        if (rank(src.priority) < rank(c.priority)) c.priority = src.priority;
        if (!c.dueDate && src.dueDate) c.dueDate = src.dueDate;
        const sd = noteToText(src.desc, src.descFormat).trim(); const cd = noteToText(c.desc, c.descFormat).trim();
        if (sd && !cd.includes(sd)) { c.desc = clip(`${cd}${cd ? '\n\n' : ''}(De "${clip(src.title, 60)}") ${sd}`, 4000); delete c.descFormat; }
        const sf = { ...src, deleted: true, deletedAt: ctx.now, deletedBy: ctx.who, ...trashFlags(f.page, f.col) };
        Object.assign(src, sf); stamp(src, `Juntada em ${textOf(c)} e enviada à Lixeira`);
        names.push(textOf(src));
      }
      autoDue(c);
      stamp(c, `Juntou ${names.length} ${names.length === 1 ? 'cartão' : 'cartões'} (${names.join(', ')})${o.note ? `: ${clip(o.note, 120)}` : ''}`);
      return log('merge_cards', c, `${textOf(c)} recebeu ${names.join(', ')}; os originais foram para a Lixeira.`);
    }

    if (o.op === 'archive_card') {
      const c = loc.card;
      if (c.archived) return log('archive_card', c, `${textOf(c)} já está arquivado.`, { noop: true });
      Object.assign(c, { archived: true, archivedAt: ctx.now, archivedFromColumnId: loc.col.id, archivedFromColumnName: loc.col.name, archivedFromBoardId: loc.page.id, archivedFromBoardName: loc.page.name });
      stamp(c, 'Arquivada (Concluídas)');
      return log('archive_card', c, `${textOf(c)} arquivado (aparece em Concluídas).`);
    }

    if (o.op === 'trash_card') {
      const c = loc.card;
      if (c.deleted) return log('trash_card', c, `${textOf(c)} já está na Lixeira.`, { noop: true });
      Object.assign(c, { deleted: true, deletedAt: ctx.now, deletedBy: ctx.who, ...trashFlags(loc.page, loc.col) });
      stamp(c, `Enviada à Lixeira${o.reason ? `: ${clip(o.reason, 120)}` : ''}`);
      return log('trash_card', c, `${textOf(c)} enviado à Lixeira (dá para restaurar).`);
    }
    return undefined;
  });

  const real = changes.filter((c) => !c.noop);
  const counts = {};
  for (const c of real) counts[c.op] = (counts[c.op] || 0) + 1;
  return { next, changes, errors, counts, touched: [...touched], changed: real.length };
}
