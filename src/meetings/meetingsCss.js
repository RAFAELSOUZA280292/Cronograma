// CSS compartilhado das telas de reunião (Meetings.jsx e TodoBoard.jsx) — arquivo sem dependências para o TodoBoard não puxar `Meetings.jsx` (2026-10-17, §65).
export const MEETINGS_CSS = `
  .mtg-view input[type=text], .mtg-view input[type=date], .mtg-view input[type=time],
  .mtg-view select, .mtg-view textarea {
    background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
    padding:8px 10px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
  }
  .mtg-view input:focus, .mtg-view select:focus, .mtg-view textarea:focus { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; border-color:#F5C400; }
  .mtg-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:14px 16px; cursor:pointer; transition:border-color .12s; }
  .mtg-card:hover { border-color:var(--border-3); }
  .mtg-badge { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; white-space:nowrap; }
  .mtg-badge-done { color:var(--ui-ok); background:rgba(62,207,110,.14); border:1px solid rgba(62,207,110,.5); }
  .mtg-badge-upcoming { color:var(--ui-info2); background:rgba(62,166,255,.14); border:1px solid rgba(62,166,255,.5); }
  .mtg-section-title { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-5); margin:18px 0 8px; }
  .mtg-section-title:first-child { margin-top:0; }
  .mtg-sub-row { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; background:var(--bg-2); border:1px solid var(--border-1); font-size:12px; }
  .mtg-sub-status { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; white-space:nowrap; flex-shrink:0; }
  .mtg-sub-pending, .mtg-sub-processing { color:var(--ui-info2); background:rgba(62,166,255,.14); border:1px solid rgba(62,166,255,.5); }
  .mtg-sub-done { color:var(--ui-ok); background:rgba(62,207,110,.14); border:1px solid rgba(62,207,110,.5); }
  .mtg-sub-failed { color:var(--ui-danger); background:rgba(226,87,76,.14); border:1px solid rgba(226,87,76,.5); }
  @keyframes mtg-spin { to { transform: rotate(360deg); } }
  .mtg-spin { animation: mtg-spin 1s linear infinite; }

  .mtg-view button:focus-visible, .mtg-card:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) {
    .mtg-view input[type=text], .mtg-view input[type=date], .mtg-view input[type=time], .mtg-view input[type=email], .mtg-view select, .mtg-view textarea { font-size:16px !important; min-height:44px; box-sizing:border-box; }
    .mtg-head-actions button, .mtg-view .mtg2-actions button, .mtg-view .mtg2-edit-btn, .mtg-view .mtg2-more-item, .mtg-transcript-tab { min-height:44px; }
    .mtg-card { min-height:44px; }
    .mtg-head-actions { width:100%; }
  }
`;
