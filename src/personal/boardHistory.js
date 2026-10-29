// Histórico do quadro pessoal (2026-10-29): compara uma foto antiga do quadro com o quadro de hoje e recoloca cartões. Funções puras,
// sem React nem DOM — testáveis em Node (scripts/board-history.test.mjs).

const pagesOf = (b) => (b && Array.isArray(b.boards) ? b.boards : []);
const colsOf = (p) => (p && Array.isArray(p.columns) ? p.columns : []);
const cardsOf = (c) => (c && Array.isArray(c.cards) ? c.cards : []);

export function countCards(b) {
  let n = 0;
  for (const p of pagesOf(b)) for (const c of colsOf(p)) n += cardsOf(c).filter((cd) => !cd.deleted).length;
  return n;
}

// Ids de TODOS os cartões do quadro de hoje, inclusive os da lixeira e das concluídas: quem está lá não "sumiu", tem tela própria.
function idsEverywhere(b) {
  const ids = new Set();
  for (const p of pagesOf(b)) for (const c of colsOf(p)) for (const cd of cardsOf(c)) if (cd && cd.id) ids.add(cd.id);
  return ids;
}

// Cartões que existem na versão e não existem mais no quadro de hoje (nem na lixeira). `pages` são as páginas da versão que o quadro de hoje não tem.
export function compareWithCurrent(version, current) {
  const here = idsEverywhere(current);
  const nowPages = new Set(pagesOf(current).map((p) => p.id));
  const missing = [];
  const lostPages = [];
  for (const p of pagesOf(version)) {
    if (!nowPages.has(p.id)) lostPages.push({ id: p.id, name: p.name || 'Sem nome' });
    for (const c of colsOf(p)) {
      for (const cd of cardsOf(c)) {
        if (!cd || !cd.id || cd.deleted || here.has(cd.id)) continue;
        missing.push({ card: cd, boardId: p.id, boardName: p.name || 'Sem nome', columnId: c.id, columnName: c.name || 'Sem nome' });
      }
    }
  }
  return { missing, lostPages, versionCards: countCards(version), currentCards: countCards(current) };
}

// Onde um cartão recuperado volta: a mesma coluna; senão a coluna de mesmo nome na mesma página; senão a 1ª coluna da mesma página;
// senão a 1ª coluna da 1ª página que tiver coluna. Sem nenhuma coluna no quadro, devolve null.
export function placeFor(current, item) {
  const pages = pagesOf(current);
  const page = pages.find((p) => p.id === item.boardId);
  if (page) {
    const cols = colsOf(page);
    const col = cols.find((c) => c.id === item.columnId) || cols.find((c) => c.name === item.columnName) || cols[0];
    if (col) return { boardId: page.id, columnId: col.id, exact: col.id === item.columnId };
  }
  for (const p of pages) { const col = colsOf(p)[0]; if (col) return { boardId: p.id, columnId: col.id, exact: false }; }
  return null;
}

// Devolve um quadro novo com os cartões `items` recolocados (sem repetir um id que já esteja lá). `moved` diz quantos entraram e `lost` quantos não tinham onde entrar.
export function recoverCards(current, items, nowIso, userName) {
  let board = current;
  let moved = 0; let lost = 0;
  for (const item of items) {
    if (idsEverywhere(board).has(item.card.id)) continue;
    const at = placeFor(board, item);
    if (!at) { lost += 1; continue; }
    const card = {
      ...item.card, deleted: false, deletedAt: '', deletedBy: '', updatedAt: nowIso, updatedBy: userName || item.card.updatedBy || '',
      history: [...(Array.isArray(item.card.history) ? item.card.history : []), { ts: nowIso, action: 'Recuperada do histórico do quadro', user: userName || '' }].slice(-200),
    };
    board = { ...board, boards: pagesOf(board).map((p) => (p.id !== at.boardId ? p : { ...p, columns: colsOf(p).map((c) => (c.id !== at.columnId ? c : { ...c, cards: [...cardsOf(c), card] })) })) };
    moved += 1;
  }
  return { board, moved, lost };
}
