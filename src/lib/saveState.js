// Estado global de gravação (Onda 4, §81): "Salvando… / Salvo / Não foi possível salvar — tentar de novo" em UM lugar só.
// Toda requisição PATCH/PUT (as gravações automáticas do app: projeto, quadro pessoal, XFlow, CRM, Pareceres, Modelos,
// preferências…) passa por aqui via src/lib/api.js. A barra do topo (ModuleShell) mostra o estado; cada tela de registro
// usa <RecordSaveStatus> (src/ui) que lê o mesmo estado.
//
// Regra do "tentar de novo": só refaz uma gravação que falhou se NENHUMA outra gravação do mesmo endereço começou depois
// dela (senão reenviaria um corpo velho por cima de um mais novo). Uma gravação posterior bem-sucedida no mesmo endereço
// "cura" a falha antiga sozinha.
import { useSyncExternalStore } from 'react';

let seq = 0;
let inflight = 0;
const lastStarted = new Map(); // chave → seq da última gravação iniciada
const failed = new Map(); // chave → { seq, message, retry }
let savedAt = null;
let showSaved = false;
let savedTimer = null;
let snap = { status: 'idle', savedAt: null, message: '', failedCount: 0 };
const listeners = new Set();

function recompute() {
  const status = inflight > 0 ? 'saving' : failed.size ? 'error' : showSaved ? 'saved' : 'idle';
  const first = failed.size ? [...failed.values()][0] : null;
  snap = { status, savedAt, message: first ? first.message : '', failedCount: failed.size, retryable: failed.size > 0 && [...failed.values()].every((f) => f.retry) };
  listeners.forEach((l) => l());
}

export function beginSave(key, retry) {
  const id = ++seq;
  lastStarted.set(key, id);
  inflight += 1;
  recompute();
  return {
    ok() {
      inflight -= 1;
      failed.delete(key); // gravação bem-sucedida cura falha anterior no mesmo endereço
      savedAt = new Date();
      showSaved = true;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { showSaved = false; recompute(); }, 6000);
      recompute();
    },
    // Recusa de validação (4xx): quem chamou mostra o próprio erro; não é "falha de gravação" nem merece "tentar de novo".
    rejected() { inflight -= 1; recompute(); },
    fail(err) {
      inflight -= 1;
      if (lastStarted.get(key) === id) {
        const entry = { seq: id, message: (err && err.message) || 'Erro inesperado.', retry };
        failed.set(key, entry);
        // Sem "tentar de novo" global, o erro é um aviso: some sozinho (quem chamou mostra o próprio erro/retry).
        if (!retry) setTimeout(() => { if (failed.get(key) === entry) { failed.delete(key); recompute(); } }, 15000);
      }
      recompute();
    },
  };
}

export function retryFailedSaves() {
  const items = [...failed.values()].filter((f) => f.retry);
  items.forEach((f) => { for (const [k, v] of failed) if (v === f) failed.delete(k); });
  recompute();
  items.forEach((f) => { try { Promise.resolve(f.retry()).catch(() => {}); } catch (e) { /* reentra em beginSave */ } });
}

export function dismissSaveError() { failed.clear(); recompute(); }

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export function useSaveState() {
  return useSyncExternalStore(subscribe, () => snap);
}
