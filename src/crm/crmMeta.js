// Rótulos, formatadores e CSS do CRM (Fase 1, 2026-09-20). Cor só indica
// estado/risco/ação — o resto usa os neutros do tema (PRD 50).
export const REL_META = {
  prospect: { label: 'Prospect', color: '#3ea6ff' },
  client: { label: 'Cliente', color: '#3ecf6e' },
  former_client: { label: 'Ex-cliente', color: '#9a9a9a' },
  partner: { label: 'Parceiro', color: '#b98af5' },
};

export const DECISION_ROLES = [
  ['sponsor', 'Sponsor'], ['decisor', 'Decisor'], ['influenciador', 'Influenciador'], ['comprador', 'Comprador'], ['financeiro', 'Financeiro'],
  ['juridico', 'Jurídico'], ['tecnico', 'Técnico'], ['usuario', 'Usuário'], ['bloqueador', 'Bloqueador'],
];
export const roleLabel = (v) => (DECISION_ROLES.find(([k]) => k === v) || [null, ''])[1];

export const STRENGTH_META = {
  forte: { label: 'Forte', color: '#3ecf6e' }, medio: { label: 'Médio', color: '#ff9f40' }, fraco: { label: 'Fraco', color: '#e2574c' },
};
export const INFLUENCE_LABELS = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const STRATEGIC_LABELS = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };

export const SOURCE_LABELS = {
  indicacao: 'Indicação', evento: 'Evento', inbound: 'Inbound', outbound: 'Outbound', parceiro: 'Parceiro', linkedin: 'LinkedIn',
  site: 'Site', whatsapp: 'WhatsApp', cliente_atual: 'Cliente atual', outro: 'Outro',
};
export const sourceLabel = (v) => SOURCE_LABELS[v] || v || '';

export const CRM_ROLE_OPTIONS = [
  ['', 'Sem acesso'], ['admin', 'Administrador'], ['diretor', 'Diretor'], ['gestor', 'Gestor Comercial'], ['vendedor', 'Vendedor'],
  ['consultor', 'Consultor'], ['financeiro', 'Financeiro'], ['visualizacao', 'Visualização'],
];

export function fmtCnpj(v) {
  const c = String(v || '').replace(/\D/g, '');
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : (v || '');
}

export function fmtMoney(n) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function fmtDateBR(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

export function fmtDateTimeBR(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function daysLabel(n) {
  if (n == null) return 'sem registro';
  if (n === 0) return 'hoje';
  return `há ${n} ${n === 1 ? 'dia' : 'dias'}`;
}

// Risco de "sem interação" só como sinal visual de ação (Fase 4 traz o score de verdade).
export function staleColor(n) {
  if (n == null) return '#e2574c';
  if (n > 60) return '#e2574c';
  if (n > 30) return '#ff9f40';
  return 'var(--text-5)';
}

export function completenessColor(p) {
  if (p >= 80) return '#3ecf6e';
  if (p >= 50) return '#ff9f40';
  return '#e2574c';
}

export const TIMELINE_KIND = {
  company_created: 'Cadastro', company_updated: 'Cadastro', relationship_changed: 'Relação', company_deleted: 'Cadastro', company_restored: 'Cadastro',
  contact_added: 'Contato', contact_updated: 'Contato', contact_removed: 'Contato', note_added: 'Nota', note_removed: 'Nota',
  project_linked: 'Projeto', project_unlinked: 'Projeto',
  deal_created: 'Negócio', deal_updated: 'Negócio', deal_stage_changed: 'Negócio', deal_won: 'Ganho', deal_lost: 'Perda', deal_reopened: 'Negócio', deal_deleted: 'Negócio',
};

// Negócios (Fase 2). Cor só marca situação/risco; a etapa usa a cor do funil só num ponto.
export const DEAL_TYPE_META = { new: { label: 'Novo negócio', color: '#3ea6ff' }, upsell: { label: 'Upsell', color: '#b98af5' } };
export const DEAL_STATUS_META = { open: { label: 'Em aberto', color: 'var(--text-5)' }, won: { label: 'Ganho', color: '#3ecf6e' }, lost: { label: 'Perdido', color: '#e2574c' } };
export const BILLING_LABELS = { one_time: 'Projeto (pontual)', recurring: 'Recorrente (mensal)' };

// Parado no funil é sinal de ação (Fase 4 traz o aging de verdade por etapa).
export function stageAgeColor(days) {
  if (days == null) return 'var(--text-6)';
  if (days > 30) return '#e2574c';
  if (days > 14) return '#ff9f40';
  return 'var(--text-6)';
}

// Aceita "20000", "20.000,00", "20.000" (milhar BR) e "R$ 1.500,50". Vazio => null; inválido => NaN.
export function moneyToNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const CRM_CSS = `
  .crm-shell *, .crm-drawer *, .crm-modal * { box-sizing: border-box; }
  .crm-shell { display:flex; flex-direction:column; min-height:100vh; background:var(--bg-1); color:var(--text-2); }
  .crm-topbar { display:flex; align-items:center; gap:14px; padding:12px 20px; border-bottom:1px solid var(--border-1); flex-wrap:wrap; }
  .crm-brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px; color:var(--text-1); }
  .crm-topbar .crm-spacer { flex:1; }
  .crm-icon-btn { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:7px; border-radius:7px; }
  .crm-icon-btn:hover { background:var(--bg-3); color:var(--text-2); }
  .crm-layout { display:flex; flex:1; min-height:0; }
  .crm-nav { width:190px; flex-shrink:0; padding:14px 10px; border-right:1px solid var(--border-1); display:flex; flex-direction:column; gap:2px; }
  .crm-nav button { display:flex; align-items:center; gap:9px; padding:9px 12px; border:none; background:transparent; color:var(--text-4); font-size:13px; font-weight:700; border-radius:8px; cursor:pointer; text-align:left; }
  .crm-nav button:hover { background:var(--bg-3); color:var(--text-2); }
  .crm-nav button.active { background:var(--bg-3); color:var(--text-1); box-shadow:inset 3px 0 0 #F5C400; }
  .crm-main { flex:1; min-width:0; padding:20px 24px 40px; overflow-x:auto; }
  @media (max-width: 760px) { .crm-layout { flex-direction:column; } .crm-nav { width:auto; flex-direction:row; border-right:none; border-bottom:1px solid var(--border-1); overflow-x:auto; } .crm-main { padding:14px; } }

  .crm-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 13px; cursor:pointer; border:1px solid var(--border-2); background:transparent; color:var(--text-3); white-space:nowrap; font-family:inherit; }
  .crm-btn:hover { background:var(--bg-3); }
  .crm-btn-primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .crm-btn-primary:hover { background:#e6b800; }
  .crm-btn-danger { color:#e2574c; border-color:rgba(226,87,76,.5); }
  .crm-btn:disabled { opacity:.5; cursor:default; }
  .crm-h1 { font-size:20px; font-weight:800; color:var(--text-1); margin:0; }
  .crm-sub { font-size:12.5px; color:var(--text-5); margin-top:3px; }
  .crm-page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
  .crm-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

  .crm-search { position:relative; width:min(360px, 100%); }
  .crm-search input { width:100%; padding:8px 12px 8px 32px; border-radius:9px; font-size:13px; }
  .crm-search svg.crm-search-ico { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-6); pointer-events:none; }
  .crm-search-pop { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:70; background:var(--bg-2); border:1px solid var(--border-2); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.28); max-height:60vh; overflow-y:auto; padding:6px; }
  .crm-search-group { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-6); padding:8px 8px 4px; }
  .crm-search-item { display:flex; flex-direction:column; gap:1px; width:100%; text-align:left; padding:8px 10px; border:none; background:transparent; border-radius:7px; cursor:pointer; color:var(--text-2); font-size:12.5px; font-family:inherit; }
  .crm-search-item:hover { background:var(--bg-3); }
  .crm-search-item small { color:var(--text-6); font-size:11.5px; }

  .crm-cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:12px; margin-bottom:22px; }
  .crm-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; }
  .crm-kpi-value { font-size:24px; font-weight:800; color:var(--text-1); line-height:1.1; font-variant-numeric:tabular-nums; }
  .crm-kpi-label { font-size:11.5px; font-weight:700; color:var(--text-5); margin-top:5px; }
  .crm-kpi-sub { font-size:11px; color:var(--text-6); margin-top:4px; }
  .crm-two { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width: 900px) { .crm-two { grid-template-columns:1fr; } }
  .crm-section { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; margin-bottom:18px; }
  .crm-section-title { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-5); margin:0 0 10px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .crm-row-link { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:8px 4px; border:none; border-bottom:1px solid var(--border-1); background:transparent; color:var(--text-2); font-size:12.5px; cursor:pointer; text-align:left; font-family:inherit; }
  .crm-row-link:last-child { border-bottom:none; }
  .crm-row-link:hover { background:var(--bg-3); }
  .crm-muted { color:var(--text-6); font-size:12px; }
  .crm-empty { text-align:center; color:var(--text-6); font-size:13px; padding:40px 12px; }

  .crm-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px; }
  .crm-filters select, .crm-filters input { padding:7px 10px; font-size:12.5px; border-radius:8px; width:auto; }
  .crm-table-wrap { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; overflow-x:auto; }
  .crm-table { width:100%; border-collapse:collapse; min-width:860px; }
  .crm-table th { text-align:left; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-6); padding:10px 12px; border-bottom:1px solid var(--border-1); white-space:nowrap; }
  .crm-table td { padding:11px 12px; font-size:12.5px; color:var(--text-3); border-bottom:1px solid var(--border-1); vertical-align:middle; }
  .crm-table tr:last-child td { border-bottom:none; }
  .crm-table th:first-child, .crm-table td:first-child { min-width:230px; }
  .crm-table tbody tr { cursor:pointer; }
  .crm-table tbody tr:hover td { background:var(--bg-3); }
  .crm-name { font-weight:800; color:var(--text-1); font-size:13px; }
  .crm-pill { display:inline-flex; align-items:center; gap:5px; font-size:10.5px; font-weight:800; padding:2px 9px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .crm-bar { width:64px; height:6px; border-radius:999px; background:var(--bg-3); overflow:hidden; display:inline-block; vertical-align:middle; }
  .crm-bar > span { display:block; height:100%; border-radius:999px; }
  .crm-pager { display:flex; align-items:center; justify-content:space-between; padding:10px 4px; font-size:12px; color:var(--text-5); }

  .crm-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:80; display:flex; justify-content:flex-end; }
  .crm-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:90; display:flex; align-items:center; justify-content:center; padding:16px; }
  .crm-drawer { width:min(900px, 100%); height:100%; background:var(--bg-1); border-left:1px solid var(--border-2); overflow-y:auto; }
  .crm-drawer-head { position:sticky; top:0; z-index:2; background:var(--bg-1); padding:16px 22px 0; border-bottom:1px solid var(--border-1); }
  .crm-drawer-body { padding:18px 22px 40px; }
  .crm-tabs { display:flex; gap:2px; margin-top:12px; overflow-x:auto; }
  .crm-tab { padding:9px 13px; font-size:12.5px; font-weight:700; color:var(--text-5); background:transparent; border:none; border-bottom:2px solid transparent; cursor:pointer; white-space:nowrap; font-family:inherit; }
  .crm-tab:hover { color:var(--text-2); }
  .crm-tab.active { color:var(--text-1); border-bottom-color:#F5C400; }
  .crm-modal { width:min(760px, 100%); max-height:92vh; overflow-y:auto; background:var(--bg-2); border:1px solid var(--border-2); border-radius:14px; padding:20px 22px; }
  .crm-modal-title { font-size:16px; font-weight:800; color:var(--text-1); margin:0 0 14px; display:flex; align-items:center; justify-content:space-between; }
  .crm-form-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px 14px; }
  @media (max-width: 640px) { .crm-form-grid { grid-template-columns:1fr; } }
  .crm-field label { display:block; font-size:11px; font-weight:800; color:var(--text-5); margin-bottom:4px; }
  .crm-field input, .crm-field select, .crm-field textarea { width:100%; padding:8px 10px; font-size:13px; border-radius:8px; }
  .crm-field.full { grid-column:1 / -1; }
  .crm-form-group { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-6); margin:16px 0 8px; grid-column:1 / -1; }
  .crm-form-foot { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
  .crm-alert { border-radius:10px; padding:10px 12px; font-size:12.5px; margin:10px 0; border:1px solid; }
  .crm-alert-warn { background:rgba(255,159,64,.10); border-color:rgba(255,159,64,.45); color:var(--text-2); }
  .crm-alert-danger { background:rgba(226,87,76,.10); border-color:rgba(226,87,76,.45); color:var(--text-2); }
  .crm-alert-info { background:rgba(62,166,255,.10); border-color:rgba(62,166,255,.4); color:var(--text-2); }
  .crm-err { color:#e2574c; font-size:12px; margin-top:8px; }

  .crm-kv { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:14px 20px; }
  .crm-kv .k { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-6); margin-bottom:3px; }
  .crm-kv .v { font-size:13px; color:var(--text-2); overflow-wrap:anywhere; }
  .crm-stake { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; }
  .crm-stake-col { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:10px 12px; }
  .crm-stake-title { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-6); margin-bottom:8px; }
  .crm-person { display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; }
  .crm-person:hover .crm-person-name { text-decoration:underline; }
  .crm-person-name { font-size:12.5px; font-weight:800; color:var(--text-1); }
  .crm-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .crm-tl { display:flex; flex-direction:column; gap:0; padding-left:14px; border-left:2px solid var(--border-2); margin-left:4px; }
  .crm-tl-item { position:relative; padding:0 0 16px 14px; }
  .crm-tl-item::before { content:''; position:absolute; left:-21px; top:4px; width:10px; height:10px; border-radius:50%; background:#F5C400; border:2px solid var(--bg-1); }
  .crm-tl-kind { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-6); }
  .crm-tl-text { font-size:12.5px; color:var(--text-2); line-height:1.5; }
  .crm-tl-time { font-size:11px; color:var(--text-6); margin-top:2px; }
  .crm-note { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; margin-bottom:8px; font-size:12.5px; color:var(--text-2); white-space:pre-wrap; }
  .crm-note-meta { font-size:11px; color:var(--text-6); margin-bottom:3px; display:flex; justify-content:space-between; gap:8px; }
  .crm-note-input textarea { width:100%; min-height:64px; padding:9px 11px; font-size:13px; border-radius:9px; resize:vertical; font-family:inherit; }
  .crm-step { display:flex; gap:6px; font-size:11.5px; color:var(--text-6); margin-bottom:12px; }
  .crm-step b { color:var(--text-1); }
  .crm-map-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:center; padding:5px 0; border-bottom:1px solid var(--border-1); font-size:12.5px; }
  .crm-map-row select { width:100%; padding:6px 8px; font-size:12.5px; }
  @keyframes crm-spin { to { transform: rotate(360deg); } }
  .crm-spin { animation: crm-spin 1s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .crm-spin { animation: none; } }
  .crm-status { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; }
  .crm-seg { display:inline-flex; border:1px solid var(--border-2); border-radius:8px; overflow:hidden; }
  .crm-seg button { display:inline-flex; align-items:center; gap:5px; padding:6px 11px; font-size:12px; font-weight:700; background:transparent; color:var(--text-5); border:none; cursor:pointer; font-family:inherit; }
  .crm-seg button + button { border-left:1px solid var(--border-2); }
  .crm-seg button.active { background:var(--bg-3); color:var(--text-1); }
  .crm-board { display:flex; gap:12px; overflow-x:auto; padding-bottom:14px; align-items:flex-start; }
  .crm-col { flex:0 0 272px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; display:flex; flex-direction:column; max-height:calc(100vh - 260px); min-height:120px; }
  .crm-col.over { outline:2px dashed #F5C400; outline-offset:-3px; }
  .crm-col-head { padding:10px 12px 9px; border-bottom:1px solid var(--border-1); }
  .crm-col-title { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:800; color:var(--text-1); }
  .crm-col-count { margin-left:auto; font-size:11px; font-weight:800; color:var(--text-5); background:var(--bg-3); border-radius:999px; padding:1px 8px; }
  .crm-col-sum { font-size:11px; color:var(--text-6); margin-top:3px; font-variant-numeric:tabular-nums; }
  .crm-col-body { padding:8px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; flex:1; }
  .crm-col-empty { font-size:11.5px; color:var(--text-6); text-align:center; padding:14px 6px; }
  .crm-deal { background:var(--bg-1); border:1px solid var(--border-1); border-radius:10px; padding:10px 11px; cursor:pointer; text-align:left; width:100%; font-family:inherit; color:inherit; }
  .crm-deal[draggable="true"] { cursor:grab; }
  .crm-deal:hover, .crm-deal:focus-visible { border-color:var(--border-3); outline:none; }
  .crm-deal.dragging { opacity:.4; }
  .crm-deal-title { font-size:12.5px; font-weight:800; color:var(--text-1); overflow-wrap:anywhere; }
  .crm-deal-co { font-size:11.5px; color:var(--text-5); margin-top:2px; overflow-wrap:anywhere; }
  .crm-deal-meta { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-top:8px; font-size:11.5px; color:var(--text-5); }
  .crm-deal-value { font-weight:800; color:var(--text-1); font-variant-numeric:tabular-nums; font-size:12.5px; }
  .crm-tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:7px; }
  .crm-tag { font-size:10px; font-weight:800; padding:1px 7px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .crm-items-row { display:grid; grid-template-columns:minmax(0,1fr) 78px 118px 30px; gap:8px; align-items:center; margin-bottom:8px; }
  .crm-items-row input, .crm-items-row select { width:100%; padding:7px 9px; font-size:12.5px; border-radius:8px; }
  @media (max-width: 640px) { .crm-items-row { grid-template-columns:minmax(0,1fr) 64px 100px 30px; } .crm-col { flex-basis:78vw; } }
  .crm-total { display:flex; justify-content:space-between; font-size:13px; font-weight:800; color:var(--text-1); padding-top:8px; border-top:1px solid var(--border-1); font-variant-numeric:tabular-nums; }
  .crm-path { display:flex; flex-direction:column; gap:6px; }
  .crm-path-row { display:flex; justify-content:space-between; gap:10px; font-size:12.5px; color:var(--text-3); padding:6px 0; border-bottom:1px solid var(--border-1); }
  .crm-path-row:last-child { border-bottom:none; }
  .crm-num { font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
`;
