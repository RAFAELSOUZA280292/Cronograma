// Retentativa automática de gravação (2026-10-27, §118): quando o salvamento falha por causa de rede ou do servidor, a edição fica na
// tela e é reenviada sozinha; erro de permissão/validação (4xx) não adianta repetir e segue desfazendo. Funções puras, testáveis em Node.

const DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

// Rede fora (status 0), servidor reiniciando/ocupado (5xx), tempo esgotado (408) e excesso de requisições (429).
export function isTransientSaveError(e) {
  if (e && e.retryLater) return true; // quadro mudando sem parar em outro lugar (conflitos em sequência): espera e tenta de novo
  const s = e && typeof e.status === 'number' ? e.status : null;
  if (s === null) return !!(e && e.offline);
  return s === 0 || s === 408 || s === 429 || s >= 500;
}

// Espera antes da tentativa `attempt` (0 = primeira retentativa): 2s, 5s, 10s, 20s e depois 30s para sempre.
export function retryDelay(attempt) {
  return DELAYS_MS[Math.min(Math.max(attempt, 0), DELAYS_MS.length - 1)];
}
