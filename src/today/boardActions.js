// Ações do "Hoje" sobre o quadro pessoal (Onda 5, §81). Funções PURAS: recebem o JSON do quadro e devolvem o novo JSON,
// para o App aplicar com mutatePersonalBoard (mesmo caminho de gravação do PersonalBoardScreen).
// A conclusão replica `setCardStatus` do PersonalBoardScreen: concluir (ou pausar) manda o cartão para o FIM da coluna,
// grava completed/completedAt/completedBy e o histórico "Status alterado: X → Y"; o arquivamento semanal de concluídos
// continua sendo feito pelo próprio quadro ao abrir (não é duplicado aqui).

function mapCard(board, loc, fn) {
  return {
    ...board,
    boards: (board.boards || []).map((b) => (b.id !== loc.boardId ? b : {
      ...b,
      columns: (b.columns || []).map((c) => (c.id !== loc.colId ? c : fn(c, b))),
    })),
  };
}

function withPublicLog(board, loc, msg, userName, nowIso) {
  return {
    ...board,
    boards: board.boards.map((b) => (b.id !== loc.boardId || b.visibility !== 'public' ? b
      : { ...b, log: [{ ts: nowIso, action: msg, user: userName }, ...(b.log || [])].slice(0, 300) })),
  };
}

export function findCard(board, loc) {
  const b = board && (board.boards || []).find((x) => x.id === loc.boardId);
  const c = b && (b.columns || []).find((x) => x.id === loc.colId);
  const card = c && (c.cards || []).find((x) => x.id === loc.cardId);
  return card && !card.deleted ? { card, column: c, board: b } : null;
}

// status: 'concluida' | outro status do cartão ('em-andamento', 'nao-iniciada', 'pausada').
export function setCardStatusInBoard(board, loc, status, { userName, nowIso, labelOf }) {
  const found = findCard(board, loc);
  if (!found) return board;
  const { card } = found;
  const wasCompleted = !!card.completed;
  const willComplete = status === 'concluida';
  const prevStatus = card.status || (card.completed ? 'concluida' : 'nao-iniciada');
  const msg = `Status alterado: ${labelOf(prevStatus)} → ${labelOf(status)}`;
  const patch = {
    status,
    completed: willComplete,
    completedAt: willComplete ? (wasCompleted ? card.completedAt : nowIso) : '',
    completedBy: willComplete ? (wasCompleted ? card.completedBy : userName) : '',
  };
  const goesToEnd = (willComplete && !wasCompleted) || (status === 'pausada' && prevStatus !== 'pausada');
  const next = mapCard(board, loc, (c) => {
    const updated = { ...card, ...patch, updatedAt: nowIso, updatedBy: userName, history: [{ ts: nowIso, action: msg, user: userName }, ...(card.history || [])].slice(0, 200) };
    if (goesToEnd) return { ...c, cards: [...c.cards.filter((x) => x.id !== card.id), updated] };
    return { ...c, cards: c.cards.map((x) => (x.id === card.id ? updated : x)) };
  });
  return withPublicLog(next, loc, `"${card.title}" — ${msg}`, userName, nowIso);
}

export function setCardDueDateInBoard(board, loc, dueDate, { userName, nowIso, fmt }) {
  const found = findCard(board, loc);
  if (!found) return board;
  const { card } = found;
  const msg = dueDate ? `Prazo alterado: ${fmt(dueDate)}` : 'Prazo removido';
  const next = mapCard(board, loc, (c) => ({
    ...c,
    cards: c.cards.map((x) => (x.id !== card.id ? x : {
      ...x, dueDate, updatedAt: nowIso, updatedBy: userName,
      history: [{ ts: nowIso, action: msg, user: userName }, ...(x.history || [])].slice(0, 200),
    })),
  }));
  return withPublicLog(next, loc, `"${card.title}" — ${msg}`, userName, nowIso);
}
