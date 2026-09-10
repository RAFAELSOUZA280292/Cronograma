// Funções puras de parsing de texto de reunião — SEM import de React,
// SEM import de Express, SEM acesso a DOM/banco. Compartilhado entre o
// frontend (src/meetings/meetingUtils.js, usado na tela de Reunião) e o
// backend (server/memoryIngest.js, usado na indexação da memória do
// projeto) — fonte única, pra nunca ter duas implementações do mesmo
// reconhecimento de padrão divergindo com o tempo (ver PROJECT_CONTEXT.md,
// seção do Assistente Inteligente de Projetos).

// Reconhece o padrão mais comum visto nas transcrições reais coladas
// pelo Rafael: uma linha de horário ("00:00" ou "00:00 – 00:01"),
// seguida (na mesma linha ou na próxima não-vazia) do nome de quem fala,
// seguida do texto até a próxima marca de horário. É best-effort — se o
// texto não render um número mínimo de entradas reconhecidas, devolve
// null e quem chamar deve cair pra tratar o texto como parágrafos
// simples (nunca fingir estrutura que não existe).
const TIME_LINE_RE = /^(\d{1,2}:\d{2})(?:\s*[-–—]\s*\d{1,2}:\d{2})?\s*$/;
const MIN_RECOGNIZED_ENTRIES = 3;

export function parseTranscript(rawText) {
  const text = (rawText || '').trim();
  if (!text) return null;
  const lines = text.split('\n');
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(TIME_LINE_RE);
    if (m) {
      const time = m[1];
      i++;
      while (i < lines.length && !lines[i].trim()) i++;
      const speaker = i < lines.length ? lines[i].trim() : '';
      i++;
      while (i < lines.length && !lines[i].trim()) i++;
      const textLines = [];
      while (i < lines.length && !TIME_LINE_RE.test(lines[i].trim())) {
        textLines.push(lines[i]);
        i++;
      }
      const body = textLines.join('\n').trim();
      if (speaker && body) entries.push({ time, speaker, text: body });
    } else {
      i++;
    }
  }
  if (entries.length < MIN_RECOGNIZED_ENTRIES) return null;
  return entries;
}

// Corta as entradas já parseadas em seções por tópico, usando o
// startTime que a IA identificou (texto literal do timestamp). Se o
// timestamp de um tópico não bater com nenhuma entrada reconhecida
// (formato diferente, tópico sem hora), esse tópico fica sem entradas —
// quem exibir deve mostrar só o título nesse caso, sem inventar conteúdo.
export function sliceEntriesByTopics(entries, topics) {
  if (!entries || !topics || topics.length === 0) return [];
  const starts = topics.map((t) => {
    if (!t.startTime) return -1;
    return entries.findIndex((e) => e.time === t.startTime);
  });
  return topics.map((t, idx) => {
    const start = starts[idx];
    if (start === -1) return { ...t, entries: [] };
    let end = entries.length;
    for (let j = idx + 1; j < starts.length; j++) {
      if (starts[j] !== -1) { end = starts[j]; break; }
    }
    return { ...t, entries: entries.slice(start, end) };
  });
}

// Separa o campo `decisions` (string livre, geralmente numerada à mão
// pela IA ou pelo usuário, "1) ... 2) ...") em itens individuais,
// removendo a numeração original pra não duplicar quando for renderizada
// de novo com numeração própria. Usado tanto pela leitura da tela de
// Reunião (lista numerada) quanto pela indexação da memória (um chunk
// por decisão).
export function splitDecisionLines(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[).]\s*/, '').trim())
    .filter(Boolean);
}
