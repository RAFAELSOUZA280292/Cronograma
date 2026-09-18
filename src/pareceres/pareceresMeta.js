// Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — CSS do
// módulo, mesmo padrão de src/knowledge/knowledgeMeta.js (bloco próprio,
// prefixo de classe pra nunca colidir com o resto do app).
export function fmtFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PARECERES_MAX_MB = 10;

export const PARECERES_CSS = `
  .par-shell { display:flex; flex-direction:column; height:100%; min-height:100vh; background:var(--bg-1); }
  .par-topbar { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border-1); flex-shrink:0; }
  .par-brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px; color:var(--text-1); }
  .par-actions { display:flex; align-items:center; gap:4px; }
  .par-actions button { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:7px; border-radius:7px; }
  .par-actions button:hover { background:var(--bg-3); color:var(--text-2); }
  .par-body { flex:1; overflow-y:auto; padding:22px; }
  .par-toolbar { display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
  .par-toolbar input[type=text] { flex:1; min-width:200px; padding:10px 14px; font-size:13px; border-radius:10px; }
  .par-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; border-radius:8px; padding:9px 15px; cursor:pointer; border:1px solid; background:transparent; white-space:nowrap; }
  .par-btn-primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .par-btn-ghost { border-color:var(--border-2); color:var(--text-4); }
  .par-btn-danger { background:#e2574c; border-color:#e2574c; color:#fff; }
  .par-btn:disabled { opacity:.5; cursor:default; }

  .par-empty { text-align:center; color:var(--text-6); font-size:13px; padding:64px 12px; }
  .par-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px; }
  .par-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:13px; padding:16px; cursor:pointer; display:flex; flex-direction:column; gap:8px; transition:border-color .12s; }
  .par-card:hover { border-color:var(--border-3); }
  .par-card-head { display:flex; align-items:flex-start; gap:10px; }
  .par-card-icon { width:38px; height:38px; border-radius:10px; background:rgba(226,87,76,.14); color:#e2574c; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .par-card-title { font-size:13.5px; font-weight:800; color:var(--text-1); line-height:1.3; }
  .par-card-file { font-size:11px; color:var(--text-6); margin-top:2px; }
  .par-card-desc { font-size:12px; color:var(--text-4); line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .par-card-foot { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--text-6); margin-top:auto; padding-top:8px; border-top:1px solid var(--border-1); }
  .par-card-comments { display:flex; align-items:center; gap:4px; }

  .par-form label { font-size:11.5px; font-weight:700; color:var(--text-5); display:block; margin-top:14px; margin-bottom:5px; }
  .par-form input[type=text], .par-form textarea { width:100%; padding:9px 12px; font-size:13px; border-radius:9px; }
  .par-form textarea { min-height:70px; resize:vertical; font-family:inherit; }
  .par-dropzone { margin-top:6px; border:1.5px dashed var(--border-3); border-radius:11px; padding:22px 14px; text-align:center; cursor:pointer; color:var(--text-5); font-size:12.5px; }
  .par-dropzone:hover { border-color:#F5C400; color:var(--text-3); }
  .par-dropzone.has-file { border-style:solid; border-color:#3ecf6e; color:var(--text-2); }
  .par-error { font-size:12px; color:#e2574c; margin-top:10px; }
  .par-btn-row { display:flex; gap:8px; margin-top:18px; justify-content:flex-end; }

  .par-drawer-title-row { display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; }
  .par-drawer-title { font-size:16px; font-weight:800; color:var(--text-1); line-height:1.4; }
  .par-drawer-file { font-size:11.5px; color:var(--text-6); margin-bottom:16px; }
  .par-drawer-actions { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
  .par-drawer-section { margin-bottom:22px; }
  .par-drawer-label { font-size:10.5px; font-weight:800; color:var(--text-6); text-transform:uppercase; letter-spacing:.04em; margin-bottom:8px; }
  .par-drawer-desc { font-size:12.5px; color:var(--text-3); line-height:1.55; white-space:pre-wrap; }

  .par-comment { background:var(--bg-3); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; margin-bottom:8px; }
  .par-comment-head { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--text-6); margin-bottom:4px; }
  .par-comment-text { font-size:12.5px; color:var(--text-2); white-space:pre-wrap; }
  .par-comment-del { background:none; border:none; color:var(--text-7); cursor:pointer; padding:2px; }
  .par-comment-del:hover { color:#e2574c; }
  .par-comment-input-row { display:flex; gap:8px; margin-top:10px; align-items:flex-end; }
  .par-comment-input-row textarea { flex:1; min-height:44px; }
`;
