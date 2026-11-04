// Pré-visualização de anexos do e-mail (2026-11-04, §166; Rafael, print de um e-mail com invite.ics, E-ticket PDF e outro .ics:
// "crie a pré-visualização dessas imagens e anexos"). Decide pelo nome E pelo tipo (o Gmail manda muito PDF como
// application/octet-stream) o que a janela consegue mostrar. Usado na tela (miniatura, ícone) e no servidor (o que converter).
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const TEXT_EXT = new Set(['txt', 'ics', 'log', 'md', 'xml', 'json', 'ofx', 'ret', 'rem']);
const SHEET_EXT = new Set(['xlsx', 'xlsm', 'xls', 'ods', 'csv']);

export const extOf = (name) => { const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };

// 'image' | 'pdf' | 'docx' | 'sheet' | 'text' | null (sem pré-visualização: só baixar).
export function previewKind(filename, mimeType) {
  const ext = extOf(filename);
  const t = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (IMAGE_TYPES[ext] || /^image\/(png|jpe?g|gif|webp)$/.test(t)) return 'image';
  if (ext === 'pdf' || t === 'application/pdf') return 'pdf';
  if (ext === 'docx' || t.includes('wordprocessingml')) return 'docx';
  if (SHEET_EXT.has(ext) || t.includes('spreadsheetml') || t === 'application/vnd.ms-excel' || t === 'text/csv') return 'sheet';
  if (TEXT_EXT.has(ext) || t === 'text/plain' || t === 'text/calendar' || t === 'application/xml' || t === 'text/xml' || t === 'application/json') return 'text';
  return null;
}

// Tipo de imagem que o servidor devolve (nunca SVG: pode ter script).
export function imageTypeOf(filename, mimeType) {
  const t = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (/^image\/(png|jpe?g|gif|webp)$/.test(t)) return t === 'image/jpg' ? 'image/jpeg' : t;
  return IMAGE_TYPES[extOf(filename)] || '';
}

// Rótulo curto do tipo no cartão do anexo.
export function kindLabel(filename, mimeType) {
  const k = previewKind(filename, mimeType);
  const ext = extOf(filename);
  if (k === 'pdf') return 'PDF';
  if (k === 'docx') return 'Word';
  if (k === 'sheet') return ext === 'csv' ? 'CSV' : 'Excel';
  if (ext === 'ics') return 'Convite';
  if (ext === 'xml') return 'XML';
  if (k === 'image') return 'Imagem';
  return ext ? ext.toUpperCase() : 'Arquivo';
}

// Endereço da pré-visualização a partir do endereço de download (que já leva ?name=…).
export function previewUrl(downloadUrl, mimeType) {
  const u = String(downloadUrl || '');
  return `${u}${u.includes('?') ? '&' : '?'}preview=1${mimeType ? `&type=${encodeURIComponent(mimeType)}` : ''}`;
}
