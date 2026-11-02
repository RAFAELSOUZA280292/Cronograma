// Transcrição da reunião sob demanda (§138): a lista de empresas vem sem ela (`transcriptStripped` + `transcriptLen`) e a reunião
// aberta busca o texto aqui. Guardado em memória por reunião e tamanho: reabrir a mesma reunião não baixa de novo.
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

const cache = new Map();

export function useMeetingTranscript(pid, meeting) {
  const id = meeting && meeting.id;
  const stripped = !!(meeting && meeting.transcriptStripped && typeof meeting.transcript !== 'string');
  const key = stripped ? `${pid}:${id}:${meeting.transcriptLen || 0}` : '';
  const [state, setState] = useState(() => (key && cache.has(key) ? { text: cache.get(key), loading: false, error: '' } : { text: null, loading: stripped, error: '' }));
  useEffect(() => {
    if (!key) { setState({ text: null, loading: false, error: '' }); return undefined; }
    if (cache.has(key)) { setState({ text: cache.get(key), loading: false, error: '' }); return undefined; }
    let alive = true;
    setState({ text: null, loading: true, error: '' });
    apiGet(`/api/projects/${encodeURIComponent(pid)}/meetings/${encodeURIComponent(id)}/transcript`)
      .then((r) => { cache.set(key, r.transcript || ''); if (alive) setState({ text: r.transcript || '', loading: false, error: '' }); })
      .catch((e) => { if (alive) setState({ text: null, loading: false, error: e.message || 'Não consegui carregar a transcrição.' }); });
    return () => { alive = false; };
  }, [key, pid, id]);
  // Reunião já com o texto (veio de uma gravação nova) usa o próprio; marcada usa o que chegou.
  const full = stripped && state.text != null ? { ...meeting, transcript: state.text } : meeting;
  return { meeting: full, loading: state.loading, error: state.error };
}
