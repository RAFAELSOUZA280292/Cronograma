// Destinatários em cartões na janela de escrever (2026-11-03, §153; Rafael: "no CC tá péssimo assim como texto… preciso que seja em
// cards para não f… quando quiser adicionar mais pessoas"). O campo continua sendo um texto "a, b, c" para o envio, o rascunho e o
// aviso de alteração (nada muda no servidor); estas funções puras só dividem esse texto em cartões e juntam de volta.
// `scripts/mail-recipients.test.mjs` cobre vírgula dentro de aspas, colar vários, endereço inválido e a volta ao texto.

const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/;

// Divide em , ; ou quebra de linha FORA de aspas e de <…> ("Souza, Rafael" <r@x> é um só).
export function splitRecipients(text) {
  const out = [];
  let cur = ''; let quote = false; let angle = false;
  for (const ch of String(text || '')) {
    if (ch === '"') quote = !quote;
    else if (ch === '<' && !quote) angle = true;
    else if (ch === '>' && !quote) angle = false;
    if (!quote && !angle && (ch === ',' || ch === ';' || ch === '\n')) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// "Nome <email>", "<email>", "email" ou "Nome email@x" → { raw, name, email, valid }.
export function parseRecipient(raw) {
  const s = String(raw || '').trim();
  const angled = /^(.*?)<\s*([^<>]+?)\s*>\s*$/.exec(s);
  let name = ''; let email = '';
  if (angled) { name = angled[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').trim(); email = angled[2].trim(); }
  else {
    const loose = /^(.*?)\s*([^\s<>"]+@[^\s<>"]+)$/.exec(s);
    if (loose && loose[1] && !loose[1].includes('@')) { name = loose[1].trim().replace(/^"(.*)"$/, '$1'); email = loose[2]; }
    else email = s.replace(/^mailto:/i, '');
  }
  email = email.toLowerCase();
  return { raw: s, name, email, valid: EMAIL_RE.test(email) };
}

// Volta ao texto do campo: o mesmo formato de antes (nome com vírgula/aspas entre aspas).
export function formatRecipient(r) {
  if (!r.email) return r.raw || '';
  if (!r.valid) return r.raw;
  return !r.name ? r.email : /[,;"]/.test(r.name) ? `"${r.name.replace(/"/g, '\\"')}" <${r.email}>` : `${r.name} <${r.email}>`;
}
export const joinRecipients = (list) => list.map(formatRecipient).filter(Boolean).join(', ');

// Acrescenta sem repetir o mesmo e-mail (o primeiro fica).
export function addRecipients(list, more) {
  const seen = new Set(list.map((r) => r.email).filter(Boolean));
  const out = [...list];
  for (const r of more) { if (r.email && seen.has(r.email)) continue; if (r.email) seen.add(r.email); out.push(r); }
  return out;
}

// O que está sendo digitado: o que tem separador vira cartão; sobra o último trecho para continuar digitando.
export function takeTyped(text) {
  const t = String(text || '');
  if (!/[,;\n]/.test(t)) return { done: [], rest: t };
  const ends = /[,;\n]\s*$/.test(t);
  const parts = splitRecipients(t);
  // Separador dentro de aspas ainda abertas não fecha nada.
  if ((t.match(/"/g) || []).length % 2) return { done: [], rest: t };
  return ends ? { done: parts.map(parseRecipient), rest: '' } : { done: parts.slice(0, -1).map(parseRecipient), rest: parts[parts.length - 1] || '' };
}
