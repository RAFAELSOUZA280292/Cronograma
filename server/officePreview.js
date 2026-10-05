// Pré-visualização de texto de arquivos do Office abertos (docx, pptx, xlsx) — 2026-10-05, §78. Esses formatos são ZIPs de XML;
// lemos só o que interessa com o zlib do próprio Node (sem dependência nova), com tetos de tamanho para não cair em zip bomb.
// .doc/.ppt/.xls antigos (binários) não têm prévia: o painel mostra só o ícone e o botão de baixar.
import zlib from 'node:zlib';

const MAX_ENTRY_BYTES = 6 * 1024 * 1024;
const MAX_ENTRIES = 5000;

export function readZipEntries(buf, wanted) {
  const out = new Map();
  if (!Buffer.isBuffer(buf) || buf.length < 22) return out;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const total = Math.min(buf.readUInt16LE(eocd + 10), MAX_ENTRIES);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + compSize > buf.length) continue;
    const raw = buf.subarray(start, start + compSize);
    try {
      if (method === 0) { if (raw.length <= MAX_ENTRY_BYTES) out.set(name, raw); }
      else if (method === 8) out.set(name, zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }));
    } catch { /* entrada corrompida ou grande demais: ignora */ }
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ''; }
  return ENT[e.toLowerCase()] || m;
});

function runs(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(decode(m[1]));
  return out.join('');
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function docxText(buf) {
  const e = readZipEntries(buf, (n) => n === 'word/document.xml').get('word/document.xml');
  if (!e) return '';
  const paragraphs = e.toString('utf8').split('</w:p>').map((p) => runs(p, 'w:t').trim()).filter(Boolean);
  return clip(paragraphs.slice(0, 14).join('\n'), 1100);
}

function pptxText(buf) {
  const entries = readZipEntries(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const slides = [...entries.keys()].sort((a, b) => parseInt(a.match(/(\d+)\.xml$/)[1], 10) - parseInt(b.match(/(\d+)\.xml$/)[1], 10));
  if (!slides.length) return '';
  const lines = slides.slice(0, 10).map((name, i) => {
    const first = (entries.get(name).toString('utf8').match(/<a:t>([^<]*)<\/a:t>/) || [])[1];
    return `${i + 1}. ${first ? clip(decode(first).trim(), 90) : '(sem título)'}`;
  });
  return clip(`${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}\n${lines.join('\n')}`, 1100);
}

function xlsxText(buf) {
  const wb = readZipEntries(buf, (n) => n === 'xl/workbook.xml').get('xl/workbook.xml');
  if (!wb) return '';
  const names = [...wb.toString('utf8').matchAll(/<sheet\s[^>]*?name="([^"]*)"/g)].map((m) => decode(m[1]));
  if (!names.length) return '';
  return clip(`${names.length} ${names.length === 1 ? 'planilha' : 'planilhas'}: ${names.slice(0, 15).join(', ')}`, 600);
}

export function officePreviewText(ext, buf) {
  try {
    if (ext === 'docx') return docxText(buf);
    if (ext === 'pptx') return pptxText(buf);
    if (ext === 'xlsx') return xlsxText(buf);
  } catch { /* sem prévia */ }
  return '';
}
