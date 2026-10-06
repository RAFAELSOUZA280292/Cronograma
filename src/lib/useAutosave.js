// Autosave de um valor inteiro (Onda 4, §81): preferências, visões, avatar… Regra única do app: campo sempre editável, grava
// sozinho, selo de estado, falha nunca apaga o que foi digitado.
//
//   const as = useAutosave({ value, armed: loaded, validate: (v) => (ok ? '' : 'motivo'), save: async (v) => { await apiPut(...); } });
//   <SaveStatus state={as.state} savedAt={as.savedAt} onRetry={as.retry} />   as.flush() → Promise (use antes de fechar/sair)
//
// `flush()` devolve true se está tudo gravado e false se falhou/está inválido (não feche a tela nesse caso).
// `armed`: só passa a observar quando o valor inicial já carregou (o primeiro valor vira a linha de base, não uma alteração).
// `validate` devolve um texto (motivo) para NÃO gravar ainda — o estado fica 'draft' e `as.reason` explica.
import { useCallback, useEffect, useRef, useState } from 'react';

const hhmm = (d) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export function useAutosave({ value, armed = true, delay = 700, validate, save }) {
  const [state, setState] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [reason, setReason] = useState('');
  const base = useRef(null); // JSON do último valor gravado (ou carregado)
  const timer = useRef(null);
  const saving = useRef(null); // promise em voo
  const latest = useRef({ value, save, validate });
  latest.current = { value, save, validate };
  const json = JSON.stringify(value);

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    if (saving.current) { await saving.current; }
    const { value: v, save: doSave, validate: check } = latest.current;
    const j = JSON.stringify(v);
    if (j === base.current) { setState((s) => (s === 'draft' ? 'idle' : s)); return true; }
    const why = check ? check(v) : '';
    if (why) { setReason(why); setState('draft'); return false; }
    setReason('');
    setState('saving');
    const p = (async () => { await doSave(v); })();
    saving.current = p;
    try {
      await p;
      base.current = j;
      setSavedAt(new Date());
      // se mudou de novo enquanto gravava, agenda outra rodada; senão fica "Salvo"
      if (JSON.stringify(latest.current.value) !== j) { setState('draft'); timer.current = setTimeout(run, 150); } else setState('saved');
      return true;
    } catch (e) {
      setState('error');
      return false;
    } finally { saving.current = null; }
  }, []);

  useEffect(() => {
    if (!armed) return undefined;
    if (base.current === null) { base.current = json; return undefined; }
    if (json === base.current) return undefined;
    const why = validate ? validate(value) : '';
    setReason(why || '');
    setState((s) => (s === 'saving' ? s : 'draft'));
    clearTimeout(timer.current);
    if (!why) timer.current = setTimeout(run, delay);
    return () => clearTimeout(timer.current);
  }, [json, armed]);

  // ao sair da tela com gravação pendente, tenta gravar (sem esperar)
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); run(); } }, []);

  const flush = useCallback(() => run(), [run]);
  return { state, savedAt: hhmm(savedAt), reason, retry: flush, flush, dirty: state === 'draft' || state === 'error' || state === 'saving' };
}
