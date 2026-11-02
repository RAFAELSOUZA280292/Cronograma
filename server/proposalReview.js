// Revisão de proposta (2026-11-02, §131): checagens DETERMINÍSTICAS sobre o texto de um documento anexado ao CRM — valor em número × valor
// por extenso, soma dos itens × total, parcelas e descontos, datas, citações legais (lista de referência; nunca inventa norma), nome e CNPJ
// do cliente e palavras repetidas. Puro: sem banco, sem IA. A IA (prompt da RENATA ou proposalAi.js) só complementa com linguagem.

// ---------- número → extenso (pt-BR) ----------
const UNI = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const SCALES = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões']];

function trio(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100); const r = n % 100;
  const parts = [];
  if (c) parts.push(CEN[c]);
  if (r) parts.push(r < 20 ? UNI[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNI[r % 10]}` : ''));
  return parts.join(' e ');
}

// Inteiro → extenso. Entre grupos: "e" antes do último grupo quando ele é < 100 ou centena redonda ("mil e cem", "dois mil e cinquenta");
// vírgula nos demais casos ("quarenta e nove mil, quinhentos e quinze"). "mil" sem "um".
export function intToWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zero';
  const groups = [];
  for (let i = 0; n > 0; i += 1, n = Math.floor(n / 1000)) groups.push({ v: n % 1000, i });
  const nz = groups.filter((g) => g.v).reverse();
  return nz.map((g, k) => {
    const words = g.i === 1 && g.v === 1 ? 'mil' : `${trio(g.v)}${g.i ? ` ${SCALES[g.i][g.v === 1 ? 0 : 1]}` : ''}`;
    if (k === 0) return words;
    const last = k === nz.length - 1;
    return `${last && (g.v < 100 || g.v % 100 === 0) ? ' e ' : ', '}${words}`;
  }).join('');
}

// Valor em reais (número, centavos arredondados) → extenso: "um real", "um milhão de reais", "cinquenta centavos", "dez reais e um centavo".
export function moneyToWords(value) {
  const cents = Math.round(Math.abs(Number(value) || 0) * 100);
  const int = Math.floor(cents / 100); const c = cents % 100;
  const parts = [];
  if (int) {
    const w = intToWords(int);
    const de = int >= 1_000_000 && int % 1_000_000 === 0 ? ' de' : '';
    parts.push(`${w}${de} ${int === 1 ? 'real' : 'reais'}`);
  }
  if (c) parts.push(`${intToWords(c)} ${c === 1 ? 'centavo' : 'centavos'}`);
  return parts.length ? parts.join(' e ') : 'zero real';
}

// ---------- extenso → número ----------
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const WORD_VAL = new Map();
UNI.forEach((w, i) => WORD_VAL.set(fold(w), i));
WORD_VAL.set('catorze', 14); WORD_VAL.set('uma', 1); WORD_VAL.set('duas', 2);
DEZ.forEach((w, i) => { if (w) WORD_VAL.set(w, i * 10); });
CEN.forEach((w, i) => { if (w) WORD_VAL.set(fold(w), i * 100); });
WORD_VAL.set('cem', 100);
['duzentas', 'trezentas', 'quatrocentas', 'quinhentas', 'seiscentas', 'setecentas', 'oitocentas', 'novecentas'].forEach((w, i) => WORD_VAL.set(w, (i + 2) * 100));
const SCALE_VAL = new Map([['mil', 1e3], ['milhao', 1e6], ['milhoes', 1e6], ['bilhao', 1e9], ['bilhoes', 1e9], ['trilhao', 1e12], ['trilhoes', 1e12]]);
const GLUE = new Set(['e', 'de', ',']);
const CUR_INT = new Set(['real', 'reais']);
const CUR_CENT = new Set(['centavo', 'centavos']);

function wordsInt(tokens) {
  let total = 0; let cur = 0; let any = false;
  for (const t of tokens) {
    if (GLUE.has(t)) continue;
    if (WORD_VAL.has(t)) { cur += WORD_VAL.get(t); any = true; continue; }
    if (SCALE_VAL.has(t)) { total += (cur || 1) * SCALE_VAL.get(t); cur = 0; any = true; continue; }
    return null;
  }
  return any ? total + cur : null;
}

// "quarenta e nove mil, quinhentos e quinze reais e cinquenta centavos" → 49515.5 (null se não for um valor por extenso).
export function wordsToMoney(text) {
  const tokens = fold(text).replace(/,/g, ' , ').split(/[\s()]+/).filter(Boolean);
  const iCur = tokens.findIndex((t) => CUR_INT.has(t));
  const iCent = tokens.findIndex((t) => CUR_CENT.has(t));
  if (iCur < 0 && iCent < 0) return null;
  let reais = 0; let cents = 0;
  if (iCur >= 0) { const v = wordsInt(tokens.slice(0, iCur)); if (v === null) return null; reais = v; }
  if (iCent >= 0) { const v = wordsInt(tokens.slice(iCur >= 0 ? iCur + 1 : 0, iCent)); if (v === null || v > 99) return null; cents = v; }
  return Math.round(reais * 100 + cents) / 100;
}

// ---------- utilitários de texto ----------
export const parseBRL = (s) => { const v = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
export const fmtBRL = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (v) => Math.round(Number(v) * 100);
const one = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function pageAt(text, pos) {
  let page = null; const re = /\[Página (\d+)\]/g; let m;
  while ((m = re.exec(text)) && m.index <= pos) page = Number(m[1]);
  return page;
}
// Rótulo curto do que vem antes de uma posição (a linha anterior / o item), para dizer "onde" está o problema.
function labelBefore(text, pos, max = 70) {
  const before = text.slice(Math.max(0, pos - 220), pos).replace(/\[Página \d+\]/g, ' ');
  const lines = before.split(/\n+/).map(one).filter(Boolean);
  let lab = lines.length ? lines[lines.length - 1] : '';
  lab = lab.replace(/[\s:–-]*(?:R\$)?\s*$/, '');
  if (lines.length > 1 && lab.length > 25 && !/\n\s*$/.test(before)) lab = lines[lines.length - 2].replace(/[\s:–-]+$/, ''); // no meio de uma frase: o título da seção diz mais
  if (lines.length > 1 && (lab.replace(/R\$|[\d.,:\s-]/g, '').length < 3 || /^(investimento|valor|pre[çc]o|honor[aá]rios|custo|total)\b[^\n]{0,15}$/i.test(lab))) lab = `${lines[lines.length - 2].replace(/[\s:–-]+$/, '')} — ${lab}`;
  return lab.length > max ? `…${lab.slice(-max)}` : lab;
}
const where = (text, pos) => { const p = pageAt(text, pos); const l = labelBefore(text, pos); return [l, p ? `página ${p}` : ''].filter(Boolean).join(' — '); };

const AMOUNT_RE = /R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/g;
export function findAmounts(text) {
  const out = []; let m;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(text))) out.push({ value: parseBRL(m[1]), raw: m[0], start: m.index, end: m.index + m[0].length });
  return out.filter((a) => a.value !== null);
}

// Trechos por extenso que terminam em reais/centavos, com posição.
const TOKEN_RE = /[A-Za-zÀ-ÿ]+|,/g;
export function findWordAmounts(text) {
  const toks = []; let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) toks.push({ w: fold(m[0]), raw: m[0], start: m.index, end: m.index + m[0].length });
  const kind = (w) => (WORD_VAL.has(w) || SCALE_VAL.has(w) ? 'num' : GLUE.has(w) ? 'glue' : CUR_INT.has(w) || CUR_CENT.has(w) ? 'cur' : '');
  const runs = []; let run = [];
  const close = () => {
    while (run.length && kind(run[0].w) !== 'num') run.shift();
    while (run.length && kind(run[run.length - 1].w) !== 'cur') run.pop();
    if (run.some((t) => kind(t.w) === 'num') && run.some((t) => kind(t.w) === 'cur')) {
      const start = run[0].start; const end = run[run.length - 1].end;
      const phrase = text.slice(start, end);
      const value = wordsToMoney(phrase);
      if (value !== null) runs.push({ value, phrase: one(phrase), start, end });
    }
    run = [];
  };
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (!kind(t.w)) { close(); continue; }
    if (run.length && !/^\s*$/.test(text.slice(run[run.length - 1].end, t.start))) close();
    run.push(t);
    if (CUR_CENT.has(t.w)) close();
  }
  close();
  // "um" sozinho antes de "real"? só vale se houver número de verdade: "um real" é aceito; "reais" sem número já foi descartado.
  return runs;
}

// ---------- 1. número × extenso ----------
export function checkWrittenAmounts(text) {
  const amounts = findAmounts(text);
  const words = findWordAmounts(text);
  const erros = []; let conferidos = 0;
  for (const w of words) {
    const prev = [...amounts].reverse().find((a) => a.end <= w.start);
    const next = amounts.find((a) => a.start >= w.end);
    let a = null;
    if (prev && w.start - prev.end <= 80 && !amounts.some((x) => x.start > prev.end && x.start < w.start)) a = prev;
    else if (next && next.start - w.end <= 12) a = next;
    if (!a) continue;
    conferidos += 1;
    if (cents(a.value) === cents(w.value)) continue;
    erros.push({ tipo: 'Valor por extenso', onde: where(text, a.start),
      escrito: `${fmtBRL(a.value)} (${w.phrase})`,
      deveria: `${fmtBRL(a.value)} (${moneyToWords(a.value)}) — o extenso escrito equivale a ${fmtBRL(w.value)}; corrija o número ou o extenso, o que estiver errado` });
  }
  return { erros, conferidos };
}

// ---------- 2. soma, parcelas e descontos ----------
const TOTAL_RE = /\b(sub-?total|valor\s+total|total\s+geral|investimento\s+total|total)\b[^\n]{0,40}?R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/gi;
const PARCEL_RE = /\b(\d{1,2}|[a-zà-ú]+)\s*(?:x|vezes|parcelas?(?:\s+(?:mensais|iguais|fixas|sucessivas))*)\s+(?:mensais\s+)?(?:de|no\s+valor\s+de)\s+R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/gi;
const DISC_PCT_RE = /desconto\s+(?:especial\s+)?de\s+(\d{1,2}(?:,\d+)?)\s*%/gi;

export function checkSums(text) {
  const amounts = findAmounts(text);
  const verificar = []; let conferidos = 0;
  const inParcel = new Set();
  let m;
  PARCEL_RE.lastIndex = 0;
  const parcels = [];
  while ((m = PARCEL_RE.exec(text))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : wordsInt([fold(m[1])]);
    if (!n || n < 2 || n > 60) continue;
    const valStart = m.index + m[0].lastIndexOf('R$');
    const a = amounts.find((x) => x.start === valStart);
    if (a) inParcel.add(a.start);
    parcels.push({ n, value: parseBRL(m[2]), start: m.index, raw: one(m[0]) });
  }
  // total: soma dos itens desde o total anterior
  TOTAL_RE.lastIndex = 0;
  let from = 0;
  while ((m = TOTAL_RE.exec(text))) {
    const totalStart = m.index + m[0].lastIndexOf('R$');
    const total = parseBRL(m[2]);
    const seg = text.slice(from, m.index);
    const items = amounts.filter((a) => a.start >= from && a.end <= m.index && !inParcel.has(a.start));
    from = m.index + m[0].length;
    if (items.length < 2) continue;
    const disc = items.filter((a) => /desconto|abatimento|cr[eé]dito/i.test(text.slice(Math.max(0, a.start - 40), a.start)));
    const plus = items.filter((a) => !disc.includes(a));
    const sum = plus.reduce((s, a) => s + cents(a.value), 0) - disc.reduce((s, a) => s + cents(a.value), 0);
    conferidos += 1;
    if (sum === cents(total) || plus.some((a) => cents(a.value) === cents(total))) continue;
    if (!/\n|\[Página/.test(seg) && items.length < 2) continue;
    verificar.push({ tipo: 'Soma dos itens × total', onde: where(text, totalStart),
      escrito: `${one(m[0])}`,
      deveria: `a soma dos ${plus.length} valor(es) antes do total${disc.length ? `, menos ${disc.length} desconto(s)` : ''}, dá ${fmtBRL(sum / 100)}; confira se o total ou algum item está errado (ou se os itens são opções alternativas)` });
  }
  // parcelas: n × valor tem de aparecer como valor do documento
  for (const p of parcels) {
    conferidos += 1;
    const tot = cents(p.value) * p.n;
    if (amounts.some((a) => Math.abs(cents(a.value) - tot) <= p.n)) continue;
    verificar.push({ tipo: 'Parcelas', onde: where(text, p.start), escrito: p.raw,
      deveria: `${p.n} × ${fmtBRL(p.value)} = ${fmtBRL(tot / 100)}, valor que não aparece no documento; confira o número de parcelas, o valor da parcela ou o total` });
  }
  // desconto percentual: algum par de valores próximos deve bater com o percentual
  DISC_PCT_RE.lastIndex = 0;
  while ((m = DISC_PCT_RE.exec(text))) {
    const p = Number(m[1].replace(',', '.'));
    const near = amounts.filter((a) => Math.abs(a.start - m.index) <= 400);
    if (near.length < 2) continue;
    conferidos += 1;
    const okPair = near.some((a) => near.some((b) => b !== a && Math.abs(Math.round(cents(a.value) * (1 - p / 100)) - cents(b.value)) <= 1)
      || near.some((b) => b !== a && Math.abs(Math.round(cents(a.value) * (p / 100)) - cents(b.value)) <= 1));
    if (okPair) continue;
    verificar.push({ tipo: 'Desconto', onde: where(text, m.index), escrito: one(text.slice(m.index, m.index + 80)),
      deveria: `nenhum par de valores próximos corresponde a ${m[1]}% de desconto (${near.map((a) => fmtBRL(a.value)).join(', ')}); confira o cálculo` });
  }
  return { verificar, conferidos };
}

// ---------- 3. datas ----------
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DATE_NUM_RE = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
const DATE_TXT_RE = /\b(\d{1,2})º?\s+de\s+([A-Za-zçÇ]+)\s+de\s+(\d{4})\b/g;
const validYmd = (y, mo, d) => { const dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d; };

export function findDates(text) {
  const out = []; let m;
  DATE_NUM_RE.lastIndex = 0;
  while ((m = DATE_NUM_RE.exec(text))) out.push({ d: +m[1], mo: +m[2], y: +m[3], raw: m[0], start: m.index, end: m.index + m[0].length });
  DATE_TXT_RE.lastIndex = 0;
  while ((m = DATE_TXT_RE.exec(text))) { const mo = MESES.indexOf(fold(m[2])) + 1; if (mo) out.push({ d: +m[1], mo, y: +m[3], raw: m[0], start: m.index, end: m.index + m[0].length }); }
  return out.sort((a, b) => a.start - b.start).map((x) => ({ ...x, valid: validYmd(x.y, x.mo, x.d), iso: `${x.y}-${String(x.mo).padStart(2, '0')}-${String(x.d).padStart(2, '0')}` }));
}

export function checkDates(text, { today } = {}) {
  const dates = findDates(text);
  const erros = []; const verificar = [];
  const ty = Number(String(today || new Date().toISOString()).slice(0, 4));
  const fmt = (x) => `${String(x.d).padStart(2, '0')}/${String(x.mo).padStart(2, '0')}/${x.y}`;
  for (const x of dates) {
    if (!x.valid) { erros.push({ tipo: 'Data inexistente', onde: where(text, x.start), escrito: x.raw, deveria: 'uma data que exista no calendário' }); continue; }
    const before = fold(text.slice(Math.max(0, x.start - 22), x.start));
    const wm = /(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?[\s,(–-]*(?:dia\s+)?$/.exec(before);
    if (wm) {
      const real = new Date(Date.UTC(x.y, x.mo - 1, x.d)).getUTCDay();
      if (DIAS[real] !== wm[1]) erros.push({ tipo: 'Dia da semana', onde: where(text, x.start), escrito: one(text.slice(x.start - wm[0].length, x.end)), deveria: `${fmt(x)} cai em ${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][real]}` });
    }
    if (ty && (x.y < ty - 1 || x.y > ty + 5) && !/\b(lei|lc|ec|decreto|emenda|complementar|resolucao|res|portaria|instrucao|in|publicad[ao]|dou)\b/.test(fold(text.slice(Math.max(0, x.start - 40), x.start)))) {
      verificar.push({ tipo: 'Ano fora do esperado', onde: where(text, x.start), escrito: x.raw, deveria: `confira o ano (hoje é ${ty})` });
    }
  }
  // intervalo invertido: "de D1 a D2", "D1 a D2", "D1 até D2"
  for (let i = 0; i + 1 < dates.length; i += 1) {
    const a = dates[i]; const b = dates[i + 1];
    if (!a.valid || !b.valid) continue;
    if (!/^\s*(a|até|ate|à|-|–)\s*$/i.test(text.slice(a.end, b.start))) continue;
    if (b.iso < a.iso) erros.push({ tipo: 'Período invertido', onde: where(text, a.start), escrito: one(text.slice(a.start, b.end)), deveria: 'a data final depois da inicial' });
  }
  // validade anterior à data de emissão (primeira data do documento que não é a própria validade)
  const vm = /v[aá]lid[ao]\s+at[eé]\s*:?\s*/gi; let m;
  while ((m = vm.exec(text))) {
    const v = dates.find((x) => x.start >= m.index + m[0].length - 1 && x.start <= m.index + m[0].length + 2);
    const emit = dates.find((x) => x !== v && x.valid && x.start < m.index);
    if (v && v.valid && emit && v.iso < emit.iso) erros.push({ tipo: 'Validade da proposta', onde: where(text, v.start), escrito: one(text.slice(m.index, v.end)), deveria: `validade posterior à data do documento (${fmt(emit)})` });
  }
  return { erros, verificar, conferidos: dates.length };
}

// ---------- 4. citações legais ----------
// Lista de referência (número/ano) das normas que aparecem nas propostas. Fonte: catálogo de normas do Checklist GAP ERP (REFORMA_GAP_ERP/dados_normas.py,
// 07/10/2026) + leis tributárias clássicas. Fora da lista = "não conferida" (a revisão não opina), nunca "errada".
export const NORMAS_REFERENCIA = [
  ['EC', '132', 2023, 'Emenda Constitucional da Reforma Tributária'], ['EC', '87', 2015, 'DIFAL do ICMS'],
  ['LC', '214', 2025, 'IBS, CBS e Imposto Seletivo'], ['LC', '227', 2026, 'Comitê Gestor do IBS e alterações da LC 214'], ['LC', '235', 2026, 'altera a LC 214/2025'],
  ['LC', '87', 1996, 'Lei Kandir (ICMS)'], ['LC', '116', 2003, 'ISS'], ['LC', '123', 2006, 'Simples Nacional'], ['LC', '24', 1975, 'convênios do ICMS'],
  ['LC', '160', 2017, 'convalidação de benefícios do ICMS'], ['LC', '190', 2022, 'DIFAL do ICMS'], ['LC', '192', 2022, 'ICMS monofásico de combustíveis'],
  ['LC', '194', 2022, 'essencialidade de combustíveis e energia'],
  ['LEI', '5.172', 1966, 'Código Tributário Nacional'], ['LEI', '5.764', 1971, 'cooperativas'], ['LEI', '6.404', 1976, 'Sociedades por Ações'],
  ['LEI', '9.249', 1995, 'IRPJ e CSLL'], ['LEI', '9.250', 1995, 'IRPF'], ['LEI', '9.430', 1996, 'legislação tributária federal'], ['LEI', '9.718', 1998, 'PIS e Cofins cumulativos'],
  ['LEI', '10.406', 2002, 'Código Civil'], ['LEI', '10.637', 2002, 'PIS não cumulativo'], ['LEI', '10.833', 2003, 'Cofins não cumulativa'],
  ['LEI', '12.973', 2014, 'IRPJ e normas contábeis'], ['LEI', '13.709', 2018, 'LGPD'], ['LEI', '14.789', 2023, 'subvenções para investimento'],
  ['DECRETO', '12.955', 2026, 'Regulamento da CBS'], ['DECRETO', '13.075', 2026, 'altera o Regulamento da CBS'], ['DECRETO', '9.580', 2018, 'Regulamento do Imposto de Renda'],
  ['RES-CGIBS', '6', 2026, 'Regulamento do IBS'], ['RES-CGSN', '194', 2026, 'Simples Nacional'], ['RES-TCU', '388', 2026, 'alíquotas de referência'],
  ['IN-RFB', '2.229', 2024, 'CNPJ alfanumérico'], ['IN-RFB', '2.275', 2025, 'CIB e Sinter'], ['PORT-RFB', '549', 2025, 'piloto da CBS'], ['PORT-RFB', '501', 2024, 'Reforma Tributária (RFB)'],
];
const KIND_LABEL = { EC: 'EC', LC: 'LC', LEI: 'Lei', DECRETO: 'Decreto', 'RES-CGIBS': 'Resolução CGIBS', 'RES-CGSN': 'Resolução CGSN', 'RES-TCU': 'Resolução TCU', 'IN-RFB': 'IN RFB', 'PORT-RFB': 'Portaria RFB' };
const normNum = (n) => String(n).replace(/\./g, '').replace(/^0+/, '');
const REF = new Map(NORMAS_REFERENCIA.map(([k, n, y, nome]) => [`${k}:${normNum(n)}`, { kind: k, num: n, year: y, nome }]));

const KIND_RE = '(Lei\\s+Complementar|LC|Emenda\\s+Constitucional|EC|Lei|Decreto|Instru[çc][ãa]o\\s+Normativa\\s+(?:RFB|SRF)|IN\\s+(?:RFB|SRF)|Resolu[çc][ãa]o\\s+(?:CGIBS|CGSN|TCU)|Res\\.\\s*(?:CGIBS|CGSN|TCU)|Portaria\\s+RFB)';
const NUM_RE = '(?:n[º°o.]*\\s*)?(\\d{1,2}(?:\\.\\d{3})+|\\d{1,5})';
const CITE_SLASH = new RegExp(`\\b${KIND_RE}\\s*${NUM_RE}\\s*/\\s*(\\d{4}|\\d{2})\\b`, 'gi');
const CITE_DE = new RegExp(`\\b${KIND_RE}\\s*${NUM_RE}\\s*,\\s*de\\s+\\d{1,2}º?\\s+de\\s+[A-Za-zçÇ]+\\s+de\\s+(\\d{4})\\b`, 'gi');
function kindOf(raw) {
  const k = fold(raw).replace(/\s+/g, ' ');
  if (/^(lei complementar|lc)$/.test(k)) return 'LC';
  if (/^(emenda constitucional|ec)$/.test(k)) return 'EC';
  if (k === 'lei') return 'LEI';
  if (k === 'decreto') return 'DECRETO';
  if (/(instrucao normativa|^in )/.test(k)) return 'IN-RFB';
  if (/cgibs/.test(k)) return 'RES-CGIBS';
  if (/cgsn/.test(k)) return 'RES-CGSN';
  if (/tcu/.test(k)) return 'RES-TCU';
  if (/portaria/.test(k)) return 'PORT-RFB';
  return '';
}

export function findCitations(text) {
  const out = [];
  for (const re of [CITE_SLASH, CITE_DE]) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      let y = Number(m[3]); if (y < 100) y += y < 50 ? 2000 : 1900;
      out.push({ kind: kindOf(m[1]), num: m[2], year: y, raw: one(m[0]), start: m.index });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function checkCitations(text) {
  const erros = []; const verificar = []; const naoConferidas = []; let conferidos = 0;
  for (const c of findCitations(text)) {
    const ref = REF.get(`${c.kind}:${normNum(c.num)}`);
    if (ref) {
      conferidos += 1;
      if (ref.year !== c.year) erros.push({ tipo: 'Citação legal', onde: where(text, c.start), escrito: c.raw, deveria: `${KIND_LABEL[ref.kind]} ${ref.num}/${ref.year} (${ref.nome})` });
      continue;
    }
    // "Lei 214/2025" quando a norma conhecida é a Lei Complementar
    const lc = c.kind === 'LEI' && REF.get(`LC:${normNum(c.num)}`);
    if (lc && lc.year === c.year) { conferidos += 1; verificar.push({ tipo: 'Citação legal', onde: where(text, c.start), escrito: c.raw, deveria: `LC ${lc.num}/${lc.year} (é Lei Complementar: ${lc.nome})` }); continue; }
    naoConferidas.push(c.raw);
  }
  return { erros, verificar, naoConferidas: [...new Set(naoConferidas)].slice(0, 15), conferidos };
}

// ---------- 5. nome e CNPJ do cliente ----------
const CNPJ_RE = /\b([0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2})\b/g;
const cnpjKey = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
// Dígitos verificadores, inclusive do CNPJ alfanumérico (IN RFB 2.229/2024: valor do caractere = código ASCII − 48).
export function cnpjDvOk(raw) {
  const c = cnpjKey(raw);
  if (c.length !== 14 || !/^\d{2}$/.test(c.slice(12)) || /^(\d)\1+$/.test(c)) return false;
  const dv = (len) => { let s = 0; let w = len - 7; for (let i = 0; i < len; i += 1) { s += (c.charCodeAt(i) - 48) * w; w -= 1; if (w < 2) w = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
const fmtCnpj = (k) => `${k.slice(0, 2)}.${k.slice(2, 5)}.${k.slice(5, 8)}/${k.slice(8, 12)}-${k.slice(12)}`;
const NAME_SUFFIX = new Set(['ltda', 'sa', 's', 'a', 'eireli', 'me', 'epp', 'ss', 'cia', 'do', 'da', 'de', 'dos', 'das', 'e', 'brasil', 'industria', 'comercio', 'servicos']);
const nameWords = (v) => fold(v).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !NAME_SUFFIX.has(w));

export function checkClient(text, company = {}) {
  const erros = []; const verificar = []; let conferidos = 0;
  const found = []; let m;
  CNPJ_RE.lastIndex = 0;
  while ((m = CNPJ_RE.exec(text))) { const k = cnpjKey(m[1]); if (/\d/.test(k.slice(0, 2)) && /[./-]/.test(m[1]) || /^\d{14}$/.test(k)) found.push({ k, raw: m[1], start: m.index }); }
  for (const f of found) {
    conferidos += 1;
    if (!cnpjDvOk(f.k)) erros.push({ tipo: 'CNPJ inválido', onde: where(text, f.start), escrito: f.raw, deveria: 'um CNPJ com dígitos verificadores corretos (confira a digitação)' });
  }
  const crmCnpj = cnpjKey(company.cnpj);
  if (crmCnpj.length === 14 && found.length && !found.some((f) => f.k === crmCnpj)) {
    verificar.push({ tipo: 'CNPJ do cliente', onde: 'documento × CRM', escrito: [...new Set(found.map((f) => fmtCnpj(f.k)))].join(', '), deveria: `${fmtCnpj(crmCnpj)} (CNPJ da empresa no CRM). Se um dos CNPJs do documento for o da PRICETAX, confira se o do cliente está presente` });
  }
  const names = [company.legalName, company.tradeName].filter(Boolean);
  if (names.length) {
    conferidos += 1;
    const doc = ` ${nameWords(text).join(' ')} `;
    const hit = names.some((n) => { const w = nameWords(n); return w.length && doc.includes(` ${w.join(' ')} `); })
      || names.some((n) => { const w = nameWords(n); return w.length && w[0].length >= 4 && doc.includes(` ${w[0]} `); });
    if (!hit) verificar.push({ tipo: 'Nome do cliente', onde: 'documento × CRM', escrito: '(o nome da empresa do CRM não aparece no texto)', deveria: names.join(' / ') });
  }
  return { erros, verificar, conferidos };
}

// ---------- 6. palavras repetidas e frases que terminam no meio ----------
const REPEAT_OK = new Set(['ha', 'so', 'pouco', 'bem', 'corre', 'quero', 'tim', 'bye']);
export function checkWording(text) {
  const erros = []; const verificar = []; let m;
  const rep = /(^|[^\p{L}])(\p{L}{2,})[ \t]+\2(?![\p{L}])/giu;
  while ((m = rep.exec(text))) {
    if (REPEAT_OK.has(fold(m[2]))) continue;
    const at = m.index + m[1].length;
    erros.push({ tipo: 'Palavra repetida', onde: where(text, at), escrito: one(text.slice(Math.max(0, at - 25), at + m[0].length + 20)), deveria: `"${m[2]}" uma vez só` });
    rep.lastIndex = at + m[2].length;
  }
  const cut = /(?:^|[.!?]\s+|\n)([^.!?\n]{6,140}?\s(?:de|da|do|das|dos|para|com|em|ao|aos|na|no|nas|nos|pela|pelo|por|que|e|ou|a|o|as|os|um|uma))\s*([.;:])(?=\s|$)/giu;
  while ((m = cut.exec(text))) {
    verificar.push({ tipo: 'Frase que parece cortada', onde: where(text, m.index), escrito: one(m[1]) + m[2], deveria: 'completar a frase (termina em preposição, artigo ou conjunção)' });
  }
  return { erros: erros.slice(0, 15), verificar: verificar.slice(0, 10) };
}

// ---------- revisão completa ----------
export function reviewProposalText(text, { company = {}, today } = {}) {
  const t = String(text || '');
  const a = checkWrittenAmounts(t); const s = checkSums(t); const d = checkDates(t, { today }); const c = checkCitations(t); const k = checkClient(t, company); const w = checkWording(t);
  return {
    erros: [...a.erros, ...c.erros, ...d.erros, ...k.erros, ...w.erros],
    verificar: [...s.verificar, ...c.verificar, ...d.verificar, ...k.verificar, ...w.verificar],
    conferidos: { valoresPorExtenso: a.conferidos, somasParcelasDescontos: s.conferidos, datas: d.conferidos, citacoesLegais: c.conferidos, cliente: k.conferidos },
    citacoesNaoConferidas: c.naoConferidas,
  };
}

// Parece proposta? (dispara a revisão automática ao anexar)
export function looksLikeProposal(fileName, text) {
  if (/proposta|or[cç]amento|proposal|investimento/i.test(String(fileName || ''))) return true;
  const t = String(text || '').slice(0, 20000);
  return /proposta/i.test(t) && /R\$\s*\d/.test(t);
}

// ---------- texto da nota (bodyHtml, padrão das notas do CRM) ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const itemHtml = (x) => `<li>⚠️ <strong>${esc(x.tipo)}</strong>${x.onde ? ` — ${esc(x.onde)}` : ''}<br>Consta: “${esc(x.escrito)}”<br>Deveria constar: ${esc(x.deveria)}</li>`;

// `review` = reviewProposalText; `language` = [{tipo, onde, escrito, deveria, certeza:'erro'|'verificar'}] da IA (opcional).
export function reviewNoteHtml({ fileName, review, language = [], languageSkipped = '', method = '', maxItems = 18 }) {
  const erros = [...review.erros, ...language.filter((x) => x.certeza === 'erro')].slice(0, maxItems);
  const verif = [...review.verificar, ...language.filter((x) => x.certeza !== 'erro')].slice(0, Math.max(4, maxItems - erros.length));
  const c = review.conferidos || {};
  const parts = [`<h3>📄 Revisão da proposta “${esc(fileName)}”</h3>`,
    `<p>Revisão automática realizada pela RENATA. ${erros.length || verif.length ? `Foram identificados <strong>${erros.length} erro(s)</strong> e <strong>${verif.length} ponto(s) a verificar</strong>.` : 'Não foram identificadas divergências nas verificações realizadas.'}</p>`];
  if (erros.length) parts.push('<h3>Erros identificados</h3>', `<ul>${erros.map(itemHtml).join('')}</ul>`);
  if (verif.length) parts.push('<h3>Pontos a verificar</h3>', `<ul>${verif.map(itemHtml).join('')}</ul>`);
  parts.push('<hr>', `<blockquote>Verificações automáticas: ${c.valoresPorExtenso || 0} valor(es) por extenso, ${c.somasParcelasDescontos || 0} soma(s)/parcela(s)/desconto(s), ${c.datas || 0} data(s), ${c.citacoesLegais || 0} citação(ões) legal(is) e o cadastro do cliente.${(review.citacoesNaoConferidas || []).length ? ` Citações fora da lista de referência (não conferidas): ${esc(review.citacoesNaoConferidas.join('; '))}.` : ''}${languageSkipped ? ` ${esc(languageSkipped)}` : ''}${method === 'ia' ? ' O texto foi transcrito do PDF por IA, pois o arquivo não contém texto selecionável.' : ''} Recomenda-se a conferência final por um responsável antes do envio ao cliente.</blockquote>`);
  return parts.join('');
}
