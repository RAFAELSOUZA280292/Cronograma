// Modelos de documentos (2026-10-05, §78) — tipos, ícones e CSS próprio do módulo (prefixo mdl-, em cima do par- dos Pareceres).
export const MAX_FILE_MB = 30;
export const ACCEPT = '.pdf,.doc,.docx,.rtf,.odt,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp';

const KIND_BY_EXT = {
  pdf: 'pdf', doc: 'word', docx: 'word', rtf: 'word', odt: 'word', ppt: 'ppt', pptx: 'ppt', odp: 'ppt',
  xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel', txt: 'text', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
};
export const INLINE_KINDS = new Set(['pdf', 'image', 'text']);

export const KIND_META = {
  pdf: { label: 'PDF', color: 'var(--ui-danger)' },
  word: { label: 'Word', color: 'var(--ui-info)' },
  ppt: { label: 'PowerPoint', color: 'var(--ui-warn)' },
  excel: { label: 'Excel', color: 'var(--ui-ok)' },
  image: { label: 'Imagem', color: 'var(--ui-info2)' },
  text: { label: 'Texto', color: 'var(--text-4)' },
  link: { label: 'Link', color: 'var(--ui-info)' },
};

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function kindOf(t) {
  if (t.kind === 'link') return 'link';
  return KIND_BY_EXT[extOf(t.file_name)] || 'text';
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
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
