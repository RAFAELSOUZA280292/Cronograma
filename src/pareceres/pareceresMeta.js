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

export function splitParecerTitle(title) {
  const m = /^\s*PARECER\s*[|\-–:]\s*N[º°o.]*\s*(\d+\s*\/\s*\d{4})\s*[|\-–:]\s*(.+)$/i.exec(title || '');
  return m ? { number: m[1].replace(/\s+/g, ''), title: m[2].trim() } : { number: '', title: title || '' };
}

export function urlHost(text) {
  const t = (text || '').trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return '';
  try { return new URL(t).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

export function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const PARECERES_CSS = `
  .par-root { font-family:'Inter', sans-serif; color:var(--text-1); -webkit-font-smoothing:antialiased; }
  .par-shell { display:flex; flex-direction:column; min-height:100vh; background:var(--bg-page); }
  .par-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 24px; background:var(--bg-1); border-bottom:1px solid var(--border-1); flex-shrink:0; position:sticky; top:0; z-index:5; }
  .par-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:var(--text-4); background:transparent; border:none; cursor:pointer; font-family:inherit; padding:7px 12px 7px 8px; border-radius:8px; }
  .par-back:hover { background:var(--bg-3); color:var(--text-1); }
  .par-actions { display:flex; align-items:center; gap:4px; }
  .par-actions button { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:7px; border-radius:7px; }
  .par-actions button:hover { background:var(--bg-3); color:var(--text-2); }
  .par-body { flex:1; padding:36px 32px 64px; }
  .par-inner { max-width:1240px; margin:0 auto; width:100%; }

  .par-hero { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-bottom:26px; }
  .par-title { font-size:30px; font-weight:800; letter-spacing:-.02em; line-height:1.1; margin:0; color:var(--text-1); }
  .par-subtitle { font-size:14px; color:var(--text-4); margin:8px 0 0; max-width:560px; line-height:1.5; }
  .par-toolbar { display:flex; flex-direction:column; gap:14px; margin-bottom:26px; }
  .par-search { position:relative; width:100%; max-width:460px; }
  .par-search svg { position:absolute; left:15px; top:50%; transform:translateY(-50%); color:var(--text-6); pointer-events:none; }
  .par-search input[type=text] {
    width:100%; padding:12px 16px 12px 42px; font-size:14px; border-radius:12px; box-sizing:border-box;
    background:var(--bg-1); border:1px solid var(--border-2); color:var(--text-1); font-family:inherit;
  }
  .par-search input[type=text]::placeholder { color:var(--text-6); }
  .par-search input[type=text]:focus { outline:none; border-color:#F5C400; box-shadow:0 0 0 3px rgba(245,196,0,.18); }
  .par-chips { display:flex; gap:8px; flex-wrap:wrap; }
  .par-chip { display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:13px; font-weight:600; padding:7px 14px; border-radius:999px; cursor:pointer; background:var(--bg-1); border:1px solid var(--border-2); color:var(--text-3); transition:background .12s, border-color .12s; }
  .par-chip:hover { border-color:var(--border-3); background:var(--bg-3); }
  .par-chip.on { background:var(--text-1); border-color:var(--text-1); color:var(--bg-1); }
  .par-chip-n { font-size:11.5px; font-weight:700; opacity:.6; font-variant-numeric:tabular-nums; }

  .par-btn { display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:13.5px; font-weight:700; border-radius:10px; padding:11px 18px; cursor:pointer; border:1px solid; background:transparent; white-space:nowrap; }
  .par-btn-primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .par-btn-primary:hover:not(:disabled) { background:#ffd21f; border-color:#ffd21f; }
  .par-btn-ghost { border-color:var(--border-2); color:var(--text-4); }
  .par-btn-danger { background:#e2574c; border-color:#e2574c; color:#fff; }
  .par-btn:disabled { opacity:.5; cursor:default; }

  .par-empty { text-align:center; color:var(--text-5); font-size:14px; padding:72px 12px; line-height:1.6; }
  .par-empty-icon { width:56px; height:56px; border-radius:16px; background:rgba(245,196,0,.14); color:var(--ui-accent-text); display:inline-flex; align-items:center; justify-content:center; margin-bottom:14px; }
  .par-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap:18px; }
  .par-card { background:var(--bg-1); border:1px solid var(--border-1); border-radius:16px; padding:20px 20px 16px; cursor:pointer; display:flex; flex-direction:column; gap:12px; min-width:0; box-shadow:0 1px 2px rgba(0,0,0,.04); transition:transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
  .par-card:hover { transform:translateY(-2px); border-color:var(--border-3); box-shadow:0 10px 28px rgba(0,0,0,.10); }
  .par-card:focus-visible { outline:2px solid #F5C400; outline-offset:2px; }
  .par-card-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .par-card-pdf { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:var(--text-5); flex-shrink:0; }
  .par-card-main { display:flex; flex-direction:column; gap:7px; min-width:0; }
  .par-card-kicker { font-size:11.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-accent-text); }
  .par-card-title { font-size:16px; font-weight:700; color:var(--text-1); line-height:1.35; letter-spacing:-.005em; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .par-card-desc { font-size:13.5px; color:var(--text-4); line-height:1.55; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .par-card-link { display:inline-flex; align-items:center; gap:6px; align-self:flex-start; font-size:12.5px; font-weight:600; color:var(--text-3); background:var(--bg-3); border-radius:8px; padding:6px 10px; max-width:100%; }
  .par-card-link span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .par-card-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:auto; padding-top:14px; border-top:1px solid var(--border-1); font-size:12.5px; color:var(--text-5); }
  .par-card-author { display:flex; align-items:center; gap:9px; min-width:0; }
  .par-avatar { width:26px; height:26px; border-radius:50%; background:var(--bg-4); color:var(--text-3); font-size:10.5px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
  .par-card-who { display:flex; flex-direction:column; min-width:0; line-height:1.3; }
  .par-card-who b { font-weight:600; color:var(--text-2); font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .par-card-who span { font-size:11.5px; color:var(--text-6); }
  .par-card-comments { display:flex; align-items:center; gap:5px; flex-shrink:0; font-variant-numeric:tabular-nums; }

  .par-tag { display:inline-flex; align-items:center; gap:6px; align-self:flex-start; font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:999px; max-width:100%; }
  .par-tag-general { background:rgba(91,141,239,.13); color:var(--ui-info); }
  .par-tag-client { background:rgba(62,207,110,.15); color:var(--ui-ok); }

  .par-scope-toggle { display:flex; gap:6px; margin-top:2px; }
  .par-scope-toggle button {
    flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:700;
    padding:8px 10px; border-radius:9px; border:1px solid var(--border-3); background:var(--bg-4); color:var(--text-4); cursor:pointer; font-family:inherit;
  }
  .par-scope-toggle button.active { background:rgba(245,196,0,.14); border-color:#F5C400; color:var(--text-1); }
  .par-scope-toggle + input[type=text] { margin-top:8px; }

  .par-drawer-scope { margin-bottom:16px; }

  .par-form label { font-size:11.5px; font-weight:700; color:var(--text-5); display:block; margin-top:14px; margin-bottom:5px; }
  .par-form input[type=text], .par-form textarea,
  .par-drawer-title-row input[type=text], .par-drawer-section textarea, .par-comment-input-row textarea,
  .par-drawer-scope input[type=text] {
    width:100%; padding:9px 12px; font-size:13px; border-radius:9px; font-family:inherit;
    background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1);
  }
  .par-form input[type=text]:focus, .par-form textarea:focus,
  .par-drawer-title-row input[type=text]:focus, .par-drawer-section textarea:focus, .par-comment-input-row textarea:focus,
  .par-drawer-scope input[type=text]:focus {
    outline:none; border-color:#F5C400;
  }
  .par-form textarea { min-height:70px; resize:vertical; }
  .par-dropzone { margin-top:6px; border:1.5px dashed var(--border-3); border-radius:11px; padding:22px 14px; text-align:center; cursor:pointer; color:var(--text-5); font-size:12.5px; }
  .par-dropzone:hover { border-color:#F5C400; color:var(--text-3); }
  .par-dropzone.has-file { border-style:solid; border-color:#3ecf6e; color:var(--text-2); }
  .par-error { font-size:12px; color:var(--ui-danger); margin-top:10px; }
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
  .par-comment-del:hover { color:var(--ui-danger); }
  .par-comment-input-row { display:flex; gap:8px; margin-top:10px; align-items:flex-end; }
  .par-comment-input-row textarea { flex:1; min-height:44px; }
`;
