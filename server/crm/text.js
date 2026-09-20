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

// ---- normalizadores de planilha (export do PipeRun e afins) ----

// Data de planilha -> 'YYYY-MM-DD'. Aceita ISO, dd/mm/aaaa e dd/mm/aa (o Excel exporta
// "17/08/26"). Ano de 2 dígitos = o século que NÃO cai no futuro: 26 -> 2026, 91 -> 1991.
// '' quando vazio; null quando não dá pra entender (o chamador decide se avisa).
export function parseDateBR(v, now = new Date()) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let y; let m; let d;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; } else if (br) {
    d = +br[1]; m = +br[2]; y = +br[3];
    if (br[3].length === 2) { const thisYear = now.getFullYear(); y += 2000; if (y > thisYear) y -= 100; }
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatOnePhone(raw) {
  let d = onlyDigits(raw);
  if (!d) return '';
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return String(raw).trim();
}

// "559189195382, 5591989195382" -> "(91) 8919-5382 / (91) 98919-5382" (sem +55, sem repetir).
export function formatPhonesBR(v) {
  const parts = String(v == null ? '' : v).split(/[;,/|\n]+/).map(formatOnePhone).filter(Boolean);
  return [...new Set(parts)].join(' / ');
}

// CEP como número perde o zero à esquerda (1310100 -> 01310100). '' quando não dá.
export function normalizeZip(v) {
  let d = onlyDigits(v);
  if (!d) return '';
  if (d.length === 7) d = `0${d}`;
  return d.length === 8 ? d : '';
}

// "69.20-6-01 - Atividades de contabilidade" -> { code: '69.20-6-01', description: 'Atividades de contabilidade' }
export function splitCnae(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^([\d.\-/]{4,})\s+[-–]\s+(.+)$/);
  return m ? { code: m[1].trim(), description: m[2].trim() } : { code: s, description: '' };
}

export const firstEmail = (v) => (String(v == null ? '' : v).split(/[;,\s]+/).find((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) || '').toLowerCase();
