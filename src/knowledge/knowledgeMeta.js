// Rótulos/cores compartilhados entre as abas da Central de Conhecimento
// (Fase 8, 2026-09-11) — um só lugar pra manter tipo/escopo/status
// legíveis em português, em vez de mostrar o valor cru do banco
// ("PENDING_VALIDATION", "conversation") em qualquer tela.
export const KNOWLEDGE_TYPE_LABELS = {
  FACT: 'Fato', DECISION: 'Decisão', PREFERENCE: 'Preferência', RULE: 'Regra',
  HYPOTHESIS: 'Hipótese', PROCEDURE: 'Procedimento', DEFINITION: 'Definição',
};

export const SCOPE_LABELS = {
  conversation: 'Só esta conversa', project: 'Projeto', org: 'Organização (PRICETAX)', global: 'Global',
};

export const STATUS_META = {
  active: { label: 'Ativo', color: '#3ecf6e' },
  disputed: { label: 'Em conflito', color: '#e2574c' },
  superseded: { label: 'Substituído', color: 'var(--text-6)' },
  pending_validation: { label: 'Hipótese', color: '#9b6dff' },
  archived: { label: 'Arquivado', color: 'var(--text-7)' },
};

export const ORIGIN_LABELS = {
  conversation: 'Conversa com a RENATA', legislation: 'Legislação', internal_document: 'Documento interno',
  methodology: 'Metodologia', best_practice: 'Boa prática', other: 'Outra',
};

export const ENTITY_TYPE_LABELS = {
  PERSON: 'Pessoa', COMPANY: 'Empresa', PROJECT: 'Projeto', LAW: 'Legislação', PRODUCT: 'Produto', TOPIC: 'Assunto',
};

export const RESOLUTION_LABELS = {
  keep_a: 'Manter a primeira', keep_b: 'Manter a segunda', temporal_update: 'É uma atualização (uma substitui a outra)',
  complement: 'Manter as duas (complementam-se)', archive_both: 'Arquivar as duas', mark_reviewed: 'Marcar como revisado, sem decisão',
};

export function knowledgeTypeLabel(t) { return KNOWLEDGE_TYPE_LABELS[t] || t; }
export function scopeLabel(s) { return SCOPE_LABELS[s] || s; }
export function originLabel(o) { return ORIGIN_LABELS[o] || o; }
export function entityTypeLabel(t) { return ENTITY_TYPE_LABELS[t] || t; }
export function statusMeta(s) { return STATUS_META[s] || { label: s, color: 'var(--text-5)' }; }

export const KNOWLEDGE_CSS = `
  .knw-shell { display:flex; flex-direction:column; height:100%; min-height:100vh; background:var(--bg-1); }
  .knw-topbar { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border-1); flex-shrink:0; }
  .knw-brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px; color:var(--text-1); }
  .knw-actions { display:flex; align-items:center; gap:4px; }
  .knw-actions button { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:7px; border-radius:7px; }
  .knw-actions button:hover { background:var(--bg-3); color:var(--text-2); }
  .knw-tabs { display:flex; gap:2px; padding:0 20px; border-bottom:1px solid var(--border-1); overflow-x:auto; flex-shrink:0; }
  .knw-tab { display:flex; align-items:center; gap:6px; padding:12px 14px; font-size:13px; font-weight:700; color:var(--text-5); background:transparent; border:none; border-bottom:2px solid transparent; cursor:pointer; white-space:nowrap; }
  .knw-tab:hover { color:var(--text-2); }
  .knw-tab.active { color:var(--text-1); border-bottom-color:#F5C400; }
  .knw-body { flex:1; overflow-y:auto; padding:22px; }
  .knw-loading, .knw-empty { text-align:center; color:var(--text-6); font-size:13px; padding:48px 12px; }

  .knw-kpi-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px; margin-bottom:24px; }
  .knw-kpi-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; }
  .knw-kpi-value { font-size:24px; font-weight:800; color:var(--text-1); line-height:1.1; }
  .knw-kpi-label { font-size:11.5px; color:var(--text-5); margin-top:4px; font-weight:600; }

  .knw-section-title { font-size:13px; font-weight:800; color:var(--text-1); margin:0 0 10px; display:flex; align-items:center; gap:6px; }
  .knw-section { margin-bottom:26px; }
  .knw-two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  @media (max-width: 860px) { .knw-two-col { grid-template-columns:1fr; } }

  .knw-fact-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:11px; padding:12px 14px; margin-bottom:8px; cursor:pointer; transition:border-color .12s; }
  .knw-fact-card:hover { border-color:var(--border-3); }
  .knw-fact-head { display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap; }
  .knw-chip { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; padding:2px 8px; border-radius:999px; background:var(--bg-3); color:var(--text-5); }
  .knw-chip.scope-org { background:rgba(245,196,0,.14); color:#c99400; }
  .knw-status-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .knw-fact-subject { font-size:12.5px; font-weight:700; color:var(--text-2); }
  .knw-fact-content { font-size:12.5px; color:var(--text-3); line-height:1.5; }
  .knw-fact-meta { font-size:11px; color:var(--text-6); margin-top:6px; }
  .knw-empty-hint { font-size:12px; color:var(--text-6); padding:10px 0; }

  .knw-search-row { display:flex; gap:8px; margin-bottom:14px; }
  .knw-search-row input[type=text] { flex:1; padding:10px 14px; font-size:13px; border-radius:10px; }
  .knw-filter-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }
  .knw-filter-chip { font-size:11.5px; font-weight:700; padding:5px 11px; border-radius:999px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-4); cursor:pointer; }
  .knw-filter-chip.active { background:#F5C400; border-color:#F5C400; color:#111; }
  .knw-filter-select { font-size:11.5px; font-weight:700; padding:5px 9px; border-radius:8px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-4); }

  .knw-drawer-title { font-size:16px; font-weight:800; color:var(--text-1); line-height:1.4; margin-bottom:10px; }
  .knw-drawer-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }
  .knw-drawer-section { margin-bottom:20px; }
  .knw-drawer-label { font-size:10.5px; font-weight:800; color:var(--text-6); text-transform:uppercase; letter-spacing:.04em; margin-bottom:8px; }
  .knw-origin-link { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-2); background:var(--bg-3); border:1px solid var(--border-1); border-radius:9px; padding:9px 12px; cursor:pointer; }
  .knw-origin-link:hover { border-color:var(--border-3); }
  .knw-origin-plain { font-size:12.5px; color:var(--text-4); }
  .knw-timeline { display:flex; flex-direction:column; gap:12px; padding-left:16px; border-left:2px solid var(--border-2); }
  .knw-timeline-item { position:relative; }
  .knw-timeline-dot { position:absolute; left:-20.5px; top:2px; width:8px; height:8px; border-radius:50%; background:#F5C400; }
  .knw-timeline-title { font-size:12.5px; font-weight:700; color:var(--text-2); }
  .knw-timeline-meta { font-size:11px; color:var(--text-6); margin-top:2px; }
  .knw-entity-chip { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; background:var(--bg-3); border:1px solid var(--border-1); border-radius:999px; padding:5px 11px; cursor:pointer; color:var(--text-3); }
  .knw-entity-chip:hover { border-color:var(--border-3); }
  .knw-usage-stat { display:flex; gap:20px; }
  .knw-usage-num { font-size:20px; font-weight:800; color:var(--text-1); }
  .knw-usage-label { font-size:11px; color:var(--text-6); }

  .knw-edit-form textarea { width:100%; min-height:70px; padding:9px 11px; font-size:12.5px; border-radius:9px; }
  .knw-edit-form input[type=text], .knw-edit-form select { width:100%; padding:8px 10px; font-size:12.5px; border-radius:8px; margin-top:4px; }
  .knw-edit-form label { font-size:11px; font-weight:700; color:var(--text-5); display:block; margin-top:12px; }
  .knw-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 14px; cursor:pointer; border:1px solid; background:transparent; }
  .knw-btn-primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .knw-btn-ghost { border-color:var(--border-2); color:var(--text-4); }
  .knw-btn-danger { background:#e2574c; border-color:#e2574c; color:#fff; }
  .knw-btn:disabled { opacity:.5; cursor:default; }
  .knw-btn-row { display:flex; gap:8px; margin-top:16px; }

  .knw-conflict-card { background:var(--bg-2); border:1px solid rgba(226,87,76,.35); border-radius:12px; padding:16px; margin-bottom:14px; }
  .knw-conflict-versions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0; }
  @media (max-width: 700px) { .knw-conflict-versions { grid-template-columns:1fr; } }
  .knw-conflict-version { background:var(--bg-3); border-radius:9px; padding:10px 12px; }
  .knw-conflict-version-label { font-size:10px; font-weight:800; text-transform:uppercase; color:var(--text-6); margin-bottom:4px; }
  .knw-conflict-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
  .knw-reviewed-tag { font-size:11px; color:var(--text-6); font-style:italic; margin-top:8px; }

  .knw-metric-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:14px; }
  .knw-metric-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:16px; }
  .knw-metric-card-title { font-size:11.5px; font-weight:800; color:var(--text-5); text-transform:uppercase; letter-spacing:.03em; margin-bottom:10px; }
  .knw-metric-row { display:flex; justify-content:space-between; font-size:12.5px; color:var(--text-3); padding:4px 0; }
  .knw-metric-row b { color:var(--text-1); font-variant-numeric:tabular-nums; }
  .knw-table { width:100%; border-collapse:collapse; }
  .knw-table th { text-align:left; font-size:10.5px; font-weight:800; color:var(--text-6); text-transform:uppercase; letter-spacing:.03em; padding:6px 8px; border-bottom:1px solid var(--border-1); }
  .knw-table td { font-size:12.5px; color:var(--text-3); padding:8px; border-bottom:1px solid var(--border-1); }

  .knw-entity-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; }
  .knw-entity-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px; cursor:pointer; }
  .knw-entity-card:hover { border-color:var(--border-3); }
  .knw-entity-card-name { font-size:13.5px; font-weight:800; color:var(--text-1); }
  .knw-entity-card-meta { font-size:11px; color:var(--text-6); margin-top:4px; }
`;
