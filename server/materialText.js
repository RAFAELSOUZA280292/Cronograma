// Biblioteca de conhecimento da RENATA (2026-10-27, §116): leitura de arquivos em texto e fatiamento em trechos.
// Funções sem banco e sem IA, testáveis em Node. Formatos: PDF (com texto), Word (.docx), PowerPoint (.pptx), Excel/CSV, texto, Markdown, HTML, JSON.
import JSZip from 'jszip';

export const MAX_TEXT_CHARS = 1_500_000;
export const SUPPORTED = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'txt', 'md', 'markdown', 'html', 'htm', 'json'];

export const extOf = (fileName) => { const m = /\.([A-Za-z0-9]+)$/.exec(String(fileName || '')); return m ? m[1].toLowerCase() : ''; };

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
});

// HTML → texto com títulos "# ", itens "- " e linhas de tabela "a | b".
export function htmlToText(html) {
  let s = String(html || '').replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, l, t) => `\n\n${'#'.repeat(Number(l))} ${t.replace(/<[^>]+>/g, '').trim()}\n\n`);
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (m, row) => `\n${row.replace(/<\/t[hd]>\s*<t[hd][^>]*>/gi, ' | ').replace(/<[^>]+>/g, '').trim()}\n`);
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(p|div|section|article|ul|ol|table|blockquote)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function pdfText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [String(text || '')]).map((t) => String(t || '').replace(/[ \t]+/g, ' ').trim());
  const chars = pages.reduce((n, p) => n + p.length, 0);
  if (chars < Math.max(30, totalPages * 15)) {
    throw new Error('Este PDF quase não tem texto (parece digitalizado/imagem). Envie uma versão com texto selecionável ou cole o conteúdo na aba "Colar texto".');
  }
  return pages.map((p, i) => (p ? `[Página ${i + 1}]\n${p}` : '')).filter(Boolean).join('\n\n');
}

async function docxText(buffer) {
  const mammoth = (await import('mammoth')).default || (await import('mammoth'));
  const { value } = await mammoth.convertToHtml({ buffer });
  return htmlToText(value);
}

async function pptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const num = (n) => Number((/(\d+)\.xml$/.exec(n) || [])[1] || 0);
  const names = (re) => Object.keys(zip.files).filter((n) => re.test(n)).sort((a, b) => num(a) - num(b)).slice(0, 600);
  const paras = (xml) => [...String(xml).matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)].map((p) => decodeEntities([...p[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => t[1]).join('')).trim()).filter(Boolean);
  const read = async (n) => { const f = zip.files[n]; const size = f && f._data && f._data.uncompressedSize; if (size && size > 8_000_000) return ''; return f.async('string'); };
  const out = [];
  for (const n of names(/^ppt\/slides\/slide\d+\.xml$/)) {
    const body = paras(await read(n));
    const notesName = n.replace('slides/slide', 'notesSlides/notesSlide');
    const notes = zip.files[notesName] ? paras(await read(notesName)).filter((t) => !/^\d+$/.test(t)) : [];
    if (body.length || notes.length) out.push(`[Slide ${num(n)}]\n${body.join('\n')}${notes.length ? `\nAnotações do apresentador: ${notes.join(' ')}` : ''}`);
  }
  return out.join('\n\n');
}

async function sheetText(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return wb.SheetNames.map((name) => `[Planilha: ${name}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })}`).join('\n\n');
}

const utf8 = (buffer) => buffer.toString('utf8').replace(/^﻿/, '');

// A extensão sozinha não decide o formato (M23): os primeiros bytes têm de bater com o que a extensão promete.
const SIGNATURES = { pdf: ['%PDF-'], docx: ['PK\x03\x04'], pptx: ['PK\x03\x04'], xlsx: ['PK\x03\x04'], xls: ['PK\x03\x04', '\xD0\xCF\x11\xE0'] };
export function assertSignature(ext, buffer) {
  const sigs = SIGNATURES[ext];
  if (!sigs) return;
  const head = buffer.subarray(0, 1024).toString('latin1');
  const ok = ext === 'pdf' ? head.includes('%PDF-') : sigs.some((s) => head.startsWith(s));
  if (!ok) throw new Error(`O arquivo não parece ser um .${ext} de verdade (o conteúdo não bate com a extensão).`);
}

export async function extractText({ buffer, fileName }) {
  const ext = extOf(fileName);
  if (!SUPPORTED.includes(ext)) throw new Error(`Formato .${ext || '?'} não é aceito. Use PDF, Word (.docx), PowerPoint (.pptx), Excel, CSV, texto, Markdown ou HTML.`);
  assertSignature(ext, buffer);
  let text;
  if (ext === 'pdf') text = await pdfText(buffer);
  else if (ext === 'docx') text = await docxText(buffer);
  else if (ext === 'pptx') text = await pptxText(buffer);
  else if (ext === 'xlsx' || ext === 'xls') text = await sheetText(buffer);
  else if (ext === 'html' || ext === 'htm') text = htmlToText(utf8(buffer));
  else text = utf8(buffer);
  return cleanText(text);
}

export function cleanText(text) {
  let t = String(text || '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (t.length > MAX_TEXT_CHARS) t = t.slice(0, MAX_TEXT_CHARS);
  return t;
}

// ---------- fatiamento ----------
const MARK = /^\[(Página|Slide|Planilha)[: ]\s*([^\]]+)\]\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;

function splitLong(par, max) {
  if (par.length <= max) return [par];
  const out = []; let cur = '';
  for (const sentence of par.split(/(?<=[.!?;:])\s+/)) {
    if ((cur + ' ' + sentence).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (sentence.length > max) { for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max)); } else cur = `${cur} ${sentence}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Trechos de ~1.400 caracteres que respeitam parágrafos; cada trecho guarda o último título (# …) e a referência (Página N / Slide N).
export function chunkText(text, { target = 1400, max = 1900 } = {}) {
  const chunks = [];
  let heading = ''; let ref = ''; let buf = []; let bufLen = 0; let chunkHeading = ''; let chunkRef = ''; let carried = false;
  const flush = () => {
    const content = buf.join('\n\n').trim();
    if (content.length >= 40 || (content && !chunks.length)) chunks.push({ idx: chunks.length, heading: chunkHeading, ref: chunkRef, content });
    buf = []; bufLen = 0; carried = false;
  };
  const add = (piece) => {
    if (buf.length && bufLen + piece.length > target) {
      const tail = buf[buf.length - 1];
      flush();
      if (tail.length <= 280 && !HEADING.test(tail)) { buf = [tail]; bufLen = tail.length; carried = true; chunkHeading = heading; chunkRef = ref; }
    }
    if (!buf.length || (carried && buf.length === 1)) { chunkHeading = heading; chunkRef = ref; }
    buf.push(piece); bufLen += piece.length + 2;
  };
  for (const raw of String(text || '').split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    const kept = [];
    for (const ln of block.split('\n')) {
      const mk = MARK.exec(ln.trim());
      if (mk) {
        if (mk[1] === 'Planilha') ref = `Planilha ${mk[2]}`;
        else { if (bufLen > target * 0.5) flush(); ref = `${mk[1]} ${mk[2]}`; }
        continue;
      }
      const hd = HEADING.exec(ln.trim());
      if (hd) heading = hd[2].trim().slice(0, 160);
      kept.push(ln);
    }
    const par = kept.join('\n').trim();
    if (par) splitLong(par, max).forEach(add);
  }
  flush();
  return chunks.map((c, i) => ({ ...c, idx: i }));
}
