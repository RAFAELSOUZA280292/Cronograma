// Normalizações de texto compartilhadas pelo CRM (busca, duplicidade, import).
export function onlyDigits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

export function stripAccents(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const COMPANY_SUFFIXES = new Set(['ltda', 'sa', 's', 'a', 'eireli', 'me', 'epp', 'ss', 'cia', 'companhia', 'do', 'da', 'de', 'dos', 'das', 'e', 'brasil']);

// Chave de comparação de nome de empresa: sem acento, minúscula, sem
// pontuação e sem sufixos societários ("KUHN do Brasil S/A" -> "kuhn").
export function companyNameKey(v) {
  const words = stripAccents(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const kept = words.filter((w) => !COMPANY_SUFFIXES.has(w));
  return (kept.length ? kept : words).join(' ');
}

export function personNameKey(v) {
  return stripAccents(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 5 && long.includes(short)) return 0.9;
  const ta = new Set(a.split(' ')), tb = new Set(b.split(' '));
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter += 1; });
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}
