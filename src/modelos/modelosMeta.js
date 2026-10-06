// Modelos de documentos (2026-10-05, §78) — tipos, ícones e CSS próprio do módulo (prefixo mdl-, em cima do par- dos Pareceres).
export const MAX_FILE_MB = 30;
export const ACCEPT = '.pdf,.doc,.docx,.rtf,.odt,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.txt,.html,.htm,.png,.jpg,.jpeg,.gif,.webp';
export const MAX_ITEMS = 12;

const KIND_BY_EXT = {
  pdf: 'pdf', doc: 'word', docx: 'word', rtf: 'word', odt: 'word', ppt: 'ppt', pptx: 'ppt', odp: 'ppt',
  xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel', txt: 'text', html: 'html', htm: 'html', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
};
export const INLINE_KINDS = new Set(['pdf', 'image', 'text', 'html']);

export const KIND_META = {
  pdf: { label: 'PDF', color: 'var(--ui-danger)' },
  word: { label: 'Word', color: 'var(--ui-info)' },
  ppt: { label: 'PowerPoint', color: 'var(--ui-warn)' },
  excel: { label: 'Excel', color: 'var(--ui-ok)' },
  image: { label: 'Imagem', color: 'var(--ui-info2)' },
  html: { label: 'HTML', color: 'var(--ui-accent-text)' },
  text: { label: 'Texto', color: 'var(--text-4)' },
  link: { label: 'Link', color: 'var(--ui-info)' },
};

export const isAllowedFile = (name) => Object.prototype.hasOwnProperty.call(KIND_BY_EXT, extOf(name));

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function itemKind(i) {
  if (i.kind === 'link') return 'link';
  return KIND_BY_EXT[extOf(i.file_name)] || 'text';
}

// Tipos distintos de um modelo, na ordem em que aparecem nos anexos.
export function kindsOf(t) {
  return [...new Set((t.items || []).map(itemKind))];
}

export function itemName(i) {
  return i.kind === 'link' ? hostOf(i.url) : i.file_name;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Espelha normalizeUrl do servidor (http/https, sem login embutido, endereço de site com domínio) para só gravar sozinho o que o servidor aceita.
export function isValidHttpUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return false;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return /\.[a-z]{2,}$/i.test(u.hostname);
}

export const SUGGESTED_CATEGORIES = ['Contratos', 'Propostas', 'Apresentações', 'Planilhas', 'Cartas', 'Procurações', 'Relatórios', 'Referências'];

export const MODELOS_CSS = `
  .mdl-thumb { height:132px; border-radius:11px; overflow:hidden; background:var(--bg-3); display:flex; align-items:center; justify-content:center; position:relative; }
  .mdl-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .mdl-thumb-icon { display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--c); }
  .mdl-thumb-icon b { font-size:12px; letter-spacing:.06em; text-transform:uppercase; }
  .mdl-type { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:999px; color:var(--c); background:color-mix(in srgb, var(--c) 14%, transparent); }
  .mdl-cat { font-size:11.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-accent-text); }
  .mdl-snippet { font-size:12.5px; line-height:1.5; color:var(--text-4); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-line; overflow-wrap:anywhere; }
  .mdl-chiprow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .mdl-chiplabel { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--text-6); min-width:64px; }
  .mdl-hero-actions { display:flex; gap:10px; flex-wrap:wrap; }
  .mdl-seg { display:flex; gap:6px; margin:2px 0 6px; }
  .mdl-seg button { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:7px; font-family:inherit; font-size:13px; font-weight:700; padding:10px; border-radius:10px; border:1px solid var(--border-3); background:var(--bg-4); color:var(--text-4); cursor:pointer; min-height:42px; }
  .mdl-seg button.active { background:rgba(245,196,0,.14); border-color:#F5C400; color:var(--text-1); }
  .mdl-dz { margin-top:6px; border:1.5px dashed var(--border-3); border-radius:11px; padding:26px 14px; text-align:center; cursor:pointer; color:var(--text-5); font-size:12.5px; line-height:1.5; }
  .mdl-dz:hover, .mdl-dz.over { border-color:#F5C400; color:var(--text-3); background:rgba(245,196,0,.06); }
  .mdl-dz.has-file { border-style:solid; border-color:#3ecf6e; color:var(--text-2); }
  .mdl-note { font-size:11.5px; color:var(--text-5); margin-top:6px; line-height:1.45; }
  .mdl-form input[type=text], .mdl-form input[type=url], .mdl-form textarea { width:100%; padding:9px 12px; font-size:13px; border-radius:9px; font-family:inherit; background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); box-sizing:border-box; }
  .mdl-form input:focus, .mdl-form textarea:focus { outline:none; border-color:#F5C400; }
  .mdl-form textarea { min-height:70px; resize:vertical; }
  .mdl-form label { font-size:11.5px; font-weight:700; color:var(--text-5); display:block; margin-top:14px; margin-bottom:5px; }
  .mdl-pv { margin:4px 0 16px; border:1px solid var(--border-2); border-radius:12px; overflow:hidden; background:var(--bg-2); }
  .mdl-items { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 10px; }
  .mdl-item { display:inline-flex; align-items:center; gap:7px; max-width:100%; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--text-3); background:var(--bg-3); border:1px solid var(--border-2); border-radius:10px; padding:7px 11px; cursor:pointer; min-height:36px; }
  .mdl-item svg { flex-shrink:0; color:var(--c); }
  .mdl-item span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:190px; }
  .mdl-item[aria-pressed="true"] { border-color:#F5C400; background:rgba(245,196,0,.12); color:var(--text-1); }
  .mdl-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .mdl-more { font-size:11.5px; font-weight:700; color:var(--text-5); }
  .mdl-pick-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
  .mdl-pick { display:flex; align-items:center; gap:9px; background:var(--bg-3); border:1px solid var(--border-2); border-radius:9px; padding:7px 10px; font-size:12.5px; color:var(--text-2); }
  .mdl-pick svg { flex-shrink:0; color:var(--c); }
  .mdl-pick span.n { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mdl-pick span.s { color:var(--text-5); font-size:11.5px; flex-shrink:0; }
  .mdl-pick button { background:none; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:6px; border-radius:6px; min-width:32px; min-height:32px; align-items:center; justify-content:center; }
  .mdl-pick button:hover { color:var(--ui-danger); background:var(--bg-4); }
  .mdl-add-row { display:flex; gap:8px; margin-top:6px; }
  .mdl-add-row input { flex:1; min-width:0; }
  .mdl-add-panel { border:1px dashed var(--border-3); border-radius:12px; padding:12px; margin-bottom:14px; }
  .mdl-pv iframe { display:block; width:100%; height:440px; border:0; background:#fff; }
  .mdl-pv img.mdl-pv-img { display:block; max-width:100%; max-height:380px; margin:0 auto; object-fit:contain; background:var(--bg-3); }
  .mdl-pv-text { padding:14px; font-size:12.5px; line-height:1.6; color:var(--text-3); white-space:pre-wrap; overflow-wrap:anywhere; max-height:320px; overflow:auto; }
  .mdl-pv-head { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--border-1); font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text-5); }
  .mdl-pv-note { padding:10px 14px; border-top:1px solid var(--border-1); font-size:11.5px; color:var(--text-5); line-height:1.45; }
  .mdl-lk-img { display:block; width:100%; max-height:220px; object-fit:cover; background:var(--bg-3); }
  .mdl-lk-body { padding:14px; display:flex; flex-direction:column; gap:6px; }
  .mdl-lk-site { font-size:11.5px; font-weight:700; color:var(--text-5); }
  .mdl-lk-title { font-size:15px; font-weight:800; color:var(--text-1); line-height:1.35; overflow-wrap:anywhere; }
  .mdl-lk-desc { font-size:12.5px; line-height:1.55; color:var(--text-3); overflow-wrap:anywhere; }
  .mdl-lk-warn { font-size:12px; color:var(--text-5); line-height:1.5; }
  .mdl-url-row { display:flex; gap:8px; margin-bottom:12px; }
  .mdl-url-row input { flex:1; min-width:0; }
`;
