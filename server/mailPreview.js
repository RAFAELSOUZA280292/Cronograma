// Pré-visualização de anexo (§166): a rota de anexo da Caixa (server/mail.js) e a da aba E-mails do CRM (server/mailLinks.js) chamam
// sendPreview com os bytes que já leram do Gmail. Imagem e PDF vão como estão (tipo conferido pelos primeiros bytes); Word, Excel/CSV e
// texto viram JSON já pronto para a tela — o HTML do Word passa pelo mesmo higienizador do corpo do e-mail e a tela o desenha num iframe
// sem script. Nada é guardado: cada abertura lê de novo (o navegador guarda 1 h, como o download).
import { previewKind, imageTypeOf } from '../shared/attachmentPreview.js';
import { sanitizeMailHtml } from './googleMail.js';
import { parseIcs } from './calendarInvite.js';

export const PREVIEW_MAX_BYTES = 25 * 1024 * 1024;
const TEXT_MAX = 400_000;
const SHEETS_MAX = 8;
const ROWS_MAX = 500;
const COLS_MAX = 40;

const MAGIC = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};
const isPdf = (b) => b.subarray(0, 1024).toString('latin1').includes('%PDF-');
const isZip = (b) => b.subarray(0, 4).toString('latin1') === 'PK\x03\x04';
const isOle = (b) => b.subarray(0, 4).toString('latin1') === '\xD0\xCF\x11\xE0';

// Texto em UTF-8; se vier cheio de caractere inválido (arquivo de banco/ERP em Latin-1), lê como Latin-1.
export function decodeText(buf) {
  const u = buf.toString('utf8').replace(/^﻿/, '');
  const bad = (u.match(/�/g) || []).length;
  return bad > 3 && bad > u.length / 2000 ? buf.toString('latin1') : u;
}

const cell = (v) => (v == null ? '' : v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v)).slice(0, 300);

export async function buildPreview(buf, { filename, type }) {
  const kind = previewKind(filename, type);
  if (!kind) return { error: 'Este tipo de arquivo não tem pré-visualização. Baixe para abrir.', status: 415 };
  if (buf.length > PREVIEW_MAX_BYTES) return { error: 'Arquivo grande demais para pré-visualizar. Baixe para abrir.', status: 413 };
  if (kind === 'image') {
    const t = imageTypeOf(filename, type);
    const real = Object.keys(MAGIC).find((k) => MAGIC[k](buf));
    if (!t || !real) return { error: 'Não consegui ler esta imagem. Baixe para abrir.', status: 422 };
    return { raw: buf, contentType: real };
  }
  if (kind === 'pdf') {
    if (!isPdf(buf)) return { error: 'O arquivo não parece ser um PDF de verdade. Baixe para abrir.', status: 422 };
    return { raw: buf, contentType: 'application/pdf' };
  }
  if (kind === 'text') {
    const text = decodeText(buf);
    const out = { kind: 'text', text: text.slice(0, TEXT_MAX), truncated: text.length > TEXT_MAX };
    // Convite (.ics): o resumo do evento vem antes do texto cru.
    if (/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) {
      try { const ev = parseIcs(text); if (ev) out.event = { title: ev.title, start: ev.start, end: ev.end, location: ev.location, allDay: !!ev.allDay, description: String(ev.description || '').slice(0, 1000) }; } catch { /* fica só o texto */ }
    }
    return { json: out };
  }
  if (kind === 'docx') {
    if (!isZip(buf)) return { error: 'O arquivo não parece ser um Word (.docx) de verdade. Baixe para abrir.', status: 422 };
    const mammoth = (await import('mammoth')).default || (await import('mammoth'));
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return { json: { kind: 'html', html: sanitizeMailHtml(value).html } };
  }
  // planilha
  const csv = /\.csv$/i.test(String(filename || '')) || /text\/csv/i.test(String(type || ''));
  if (!csv && !isZip(buf) && !isOle(buf)) return { error: 'O arquivo não parece ser uma planilha de verdade. Baixe para abrir.', status: 422 };
  const XLSX = await import('xlsx');
  const wb = csv ? XLSX.read(decodeText(buf), { type: 'string', raw: true }) : XLSX.read(buf, { type: 'buffer', cellDates: true, sheetRows: ROWS_MAX + 1 });
  const sheets = wb.SheetNames.slice(0, SHEETS_MAX).map((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '', raw: false });
    return { name, rows: rows.slice(0, ROWS_MAX).map((r) => r.slice(0, COLS_MAX).map(cell)), more: rows.length > ROWS_MAX };
  });
  return { json: { kind: 'sheet', sheets, moreSheets: wb.SheetNames.length > SHEETS_MAX } };
}

export async function sendPreview(res, buf, opts) {
  let out;
  try { out = await buildPreview(buf, opts); } catch {
    out = { error: 'Não consegui abrir a pré-visualização deste arquivo. Baixe para abrir.', status: 422 };
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (out.error) return res.status(out.status).json({ message: out.error });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (out.json) return res.json(out.json);
  res.setHeader('Content-Type', out.contentType);
  res.setHeader('Content-Disposition', 'inline');
  return res.send(out.raw);
}
