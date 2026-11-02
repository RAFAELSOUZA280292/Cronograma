// Lista de empresas mais leve (02/11/2026, §138): a transcrição das reuniões era 7,5 MB dos 17,9 MB de GET /api/projects
// (raio-X no log, 120 reuniões). Na lista e nas respostas de gravação ela vai fora, marcada `transcriptStripped` com o
// tamanho em `transcriptLen`; a tela busca o texto ao abrir a reunião (GET /api/projects/:id/meetings/:mid/transcript).
// Na gravação (PATCH da empresa inteira), reunião que volta marcada recebe de novo a transcrição guardada: nunca se apaga
// uma transcrição só porque ela não veio para a tela. Mesmo princípio de clientView.js (cliente nunca vê a transcrição).

export function slimProject(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.meetings)) return data;
  return {
    ...data,
    meetings: data.meetings.map((m) => {
      if (!m || typeof m !== 'object' || typeof m.transcript !== 'string' || !m.transcript) return m;
      const { transcript, ...rest } = m;
      return { ...rest, transcriptStripped: true, transcriptLen: transcript.length };
    }),
  };
}

// `incoming` vindo da tela: reunião marcada recupera a transcrição de `current`; as marcas nunca vão para o banco.
export function restoreStripped(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.meetings)) return incoming;
  const cur = new Map((current && Array.isArray(current.meetings) ? current.meetings : []).filter((m) => m && m.id).map((m) => [m.id, m]));
  return {
    ...incoming,
    meetings: incoming.meetings.map((m) => {
      if (!m || typeof m !== 'object' || !('transcriptStripped' in m || 'transcriptLen' in m)) return m;
      const { transcriptStripped, transcriptLen, ...rest } = m;
      if (transcriptStripped && typeof rest.transcript !== 'string') {
        const saved = cur.get(m.id);
        return { ...rest, transcript: (saved && typeof saved.transcript === 'string') ? saved.transcript : '' };
      }
      return rest;
    }),
  };
}

export function meetingTranscript(data, meetingId) {
  const m = data && Array.isArray(data.meetings) ? data.meetings.find((x) => x && x.id === meetingId) : null;
  return m ? (typeof m.transcript === 'string' ? m.transcript : '') : null;
}
