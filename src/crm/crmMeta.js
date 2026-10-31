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

export function fmtCep(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v || '');
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
  activity_created: 'Atividade', activity_updated: 'Atividade', activity_completed: 'Concluída', activity_cancelled: 'Atividade', activity_reopened: 'Atividade', activity_deleted: 'Atividade',
  deal_created: 'Negócio', deal_updated: 'Negócio', deal_stage_changed: 'Negócio', deal_won: 'Ganho', deal_lost: 'Perda', deal_reopened: 'Negócio', deal_deleted: 'Negócio',
};

// Negócios (Fase 2). Cor só marca situação/risco; a etapa usa a cor do funil só num ponto.
export const DEAL_TYPE_META = { new: { label: 'Novo negócio', color: '#3ea6ff' }, upsell: { label: 'Upsell', color: '#b98af5' } };
export const DEAL_STATUS_META = { open: { label: 'Em aberto', color: 'var(--text-5)' }, won: { label: 'Ganho', color: '#3ecf6e' }, lost: { label: 'Perdido', color: '#e2574c' } };
export const BILLING_LABELS = { one_time: 'Projeto (pontual)', recurring: 'Recorrente (mensal)' };

// Atividades (Fase 3). O ícone vem do componente (ActivityList) pra este arquivo não importar React.

// Cor da BOLINHA da tag (a categoria se reconhece de longe, mas o texto é neutro: cor de texto sobre fundo claro reprovava no contraste).
// Devolve uma variável CSS (`--tg-*`, com valor próprio para o tema claro e o escuro, definidas em CRM_CSS).
export function tagColor(name) {
  const n = String(name || '');
  if (/^Curva A\b/.test(n)) return 'var(--tg-green)';
  if (/^Curva B\b/.test(n)) return 'var(--tg-blue)';
  if (/^Curva C\b/.test(n)) return 'var(--tg-amber)';
  if (/^Curva D\b/.test(n)) return 'var(--tg-gray)';
  if (/Ponto Fora da Curva|^Evento /.test(n)) return 'var(--tg-yellow)';
  if (/^Estande:/.test(n)) return 'var(--tg-purple)';
  if (/^Canal:/.test(n)) return 'var(--tg-teal)';
  if (/^Quente/.test(n)) return 'var(--tg-red)';
  if (/^Brinde/.test(n)) return 'var(--tg-pink)';
  if (/^(Venda|Fechamento)/.test(n)) return 'var(--tg-lime)';
  if (/^Grupo/.test(n)) return 'var(--tg-orange)';
  return 'var(--text-6)';
}
// Cor de BOLINHA para os selos de status (`crm-pill` com `--dot`): troca o neon do tema escuro pela variável que também lê bem no claro.
const SOFT_DOT = { '#3ea6ff': 'var(--tg-blue)', '#3ecf6e': 'var(--tg-green)', '#2ecc8f': 'var(--tg-green)', '#e2574c': 'var(--tg-risk)', '#b98af5': 'var(--tg-purple)', '#f5c400': 'var(--tg-yellow)', '#fedb00': 'var(--tg-yellow)', '#ff9f40': 'var(--tg-warn)', '#9a9a9a': 'var(--tg-gray)' };
export const softDot = (c) => SOFT_DOT[String(c || '').toLowerCase()] || c || 'var(--text-6)';
// Ordem de importância no cartão: curva primeiro, o evento (igual em quase todos) por último.
export function tagRank(name) {
  const n = String(name || '');
  if (/^Curva [A-D]\b/.test(n)) return 0;
  if (/Ponto Fora da Curva/.test(n)) return 1;
  if (/^Quente/.test(n)) return 2;
  if (/^(Venda|Fechamento)/.test(n)) return 3;
  if (/^Grupo/.test(n)) return 4;
  if (/^Estande:/.test(n)) return 5;
  if (/^Canal:/.test(n)) return 6;
  if (/^Brinde/.test(n)) return 7;
  if (/^Evento /.test(n)) return 9;
  return 8;
}

export const ACTIVITY_COLORS = { task: '#8f9bb3', call: '#3ea6ff', email: '#b98af5', meeting: '#ff9f40', whatsapp: '#2ecc8f', visit: '#2fc4c4', followup: '#FEDB00' };
// Avatar com cor própria por pessoa (a mesma pessoa sempre cai na mesma cor).
export function avatarHue(name) { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return [4, 28, 48, 96, 152, 176, 200, 224, 262, 292, 322][h % 11]; }
export const avatarStyle = (name) => { const h = avatarHue(name); return { background: `hsl(${h} 70% 38%)`, borderColor: `hsl(${h} 70% 55%)`, color: '#fff' }; };

export const ACTIVITY_TYPES = [['task', 'Tarefa'], ['call', 'Ligação'], ['email', 'E-mail'], ['meeting', 'Reunião'], ['whatsapp', 'WhatsApp'], ['visit', 'Visita'], ['followup', 'Follow-up']];
export const activityTypeLabel = (v) => (ACTIVITY_TYPES.find(([k]) => k === v) || [null, v])[1];
export const PRIORITY_META = { low: { label: 'Baixa', color: 'var(--text-6)' }, normal: { label: 'Normal', color: 'var(--text-5)' }, high: { label: 'Alta', color: '#e2574c' } };
export const BUCKET_META = {
  overdue: { label: 'Atrasadas', color: '#e2574c' }, today: { label: 'Hoje', color: '#ff9f40' },
  week: { label: 'Próximos 7 dias', color: 'var(--text-4)' }, later: { label: 'Mais adiante', color: 'var(--text-5)' },
};

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
  .crm-root, .crm-shell { font-family:'Inter', sans-serif; -webkit-font-smoothing:antialiased; }
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
  .crm-btn-danger { color:var(--ui-danger); border-color:rgba(226,87,76,.5); }
  .crm-btn:disabled { opacity:.5; cursor:default; }
  .crm-h1 { font-size:20px; font-weight:800; color:var(--text-1); margin:0; }
  .crm-sub { font-size:12.5px; color:var(--text-5); margin-top:3px; }
  .crm-page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
  .crm-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

  .crm-search { position:relative; width:min(360px, 100%); }
  .crm-search input { width:100%; padding:8px 12px 8px 32px; border-radius:9px; font-size:13px; }
  .crm-search svg.crm-search-ico { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-6); pointer-events:none; }
  .crm-search-pop { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:70; background:var(--bg-2); border:1px solid var(--border-2); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.28); max-height:60vh; overflow-y:auto; padding:6px; }
  .crm-search-group { font-size:12px; font-weight:600; color:var(--text-4); padding:8px 8px 4px; }
  .crm-search-item { display:flex; flex-direction:column; gap:1px; width:100%; text-align:left; padding:8px 10px; border:none; background:transparent; border-radius:7px; cursor:pointer; color:var(--text-2); font-size:12.5px; font-family:inherit; }
  .crm-search-item:hover { background:var(--bg-3); }
  .crm-search-item small { color:var(--text-6); font-size:12px; }

  .crm-cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:12px; margin-bottom:22px; }
  .crm-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; }
  .crm-kpi-value { font-size:24px; font-weight:800; color:var(--text-1); line-height:1.1; font-variant-numeric:tabular-nums; }
  .crm-kpi-label { font-size:12px; font-weight:700; color:var(--text-5); margin-top:5px; }
  .crm-kpi-sub { font-size:12px; color:var(--text-6); margin-top:4px; }
  .crm-two { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width: 900px) { .crm-two { grid-template-columns:1fr; } }
  .crm-section { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; margin-bottom:18px; }
  .crm-section-title { font-size:13.5px; font-weight:600; color:var(--text-2); margin:0 0 10px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .crm-row-link { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:8px 4px; border:none; border-bottom:1px solid var(--border-1); background:transparent; color:var(--text-2); font-size:12.5px; cursor:pointer; text-align:left; font-family:inherit; }
  .crm-row-link:last-child { border-bottom:none; }
  .crm-row-link:hover { background:var(--bg-3); }
  .crm-muted { color:var(--text-6); font-size:12px; }
  .crm-empty { text-align:center; color:var(--text-6); font-size:13px; padding:40px 12px; }

  .crm-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px; }
  .crm-filters select, .crm-filters input { padding:7px 10px; font-size:12.5px; border-radius:8px; width:auto; }
  .crm-table-wrap { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; overflow-x:auto; }
  .crm-table { width:100%; border-collapse:collapse; min-width:860px; }
  .crm-table th { text-align:left; font-size:12px; font-weight:600; color:var(--text-4); padding:10px 12px; border-bottom:1px solid var(--border-1); white-space:nowrap; }
  .crm-table td { padding:11px 12px; font-size:12.5px; color:var(--text-3); border-bottom:1px solid var(--border-1); vertical-align:middle; }
  .crm-table tr:last-child td { border-bottom:none; }
  .crm-table th:first-child, .crm-table td:first-child { min-width:230px; }
  .crm-table tbody tr { cursor:pointer; }
  .crm-table tbody tr:hover td { background:var(--bg-3); }
  .crm-name { font-weight:800; color:var(--text-1); font-size:13px; }
  .crm-inline { background:transparent; border:1px dashed transparent; border-radius:6px; padding:2px 6px; color:inherit; font:inherit; cursor:text; }
  .crm-inline:hover, .crm-inline:focus-visible { border-color:var(--border-3); background:var(--bg-3, rgba(255,255,255,.04)); }
  .crm-inline-input { background:transparent; border:1px solid transparent; border-radius:6px; padding:3px 4px; color:inherit; font:inherit; font-size:12px; }
  .crm-inline-input:hover:not(:disabled), .crm-inline-input:focus-visible { border-color:var(--border-3); }
  .crm-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:2px 9px; border-radius:6px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-2); white-space:nowrap; }
  .crm-pill[style*="--dot"]::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--dot); flex-shrink:0; }
  .crm-bar { width:64px; height:6px; border-radius:999px; background:var(--bg-3); overflow:hidden; display:inline-block; vertical-align:middle; }
  .crm-bar > span { display:block; height:100%; border-radius:999px; }
  .crm-pager { display:flex; align-items:center; justify-content:space-between; padding:10px 4px; font-size:12px; color:var(--text-5); }

  .crm-renata-host .asst-fab { display:none !important; }
  .crm-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:80; display:flex; justify-content:flex-end; }
  .crm-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:90; display:flex; align-items:center; justify-content:center; padding:16px; }
  .crm-drawer { width:min(900px, 100%); height:100%; background:var(--bg-1); border-left:1px solid var(--border-2); overflow-y:auto; }
  .crm-drawer:focus, .crm-modal:focus { outline:none; }
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
  .crm-field label { display:block; font-size:12px; font-weight:800; color:var(--text-5); margin-bottom:4px; }
  .crm-field input, .crm-field select, .crm-field textarea { width:100%; padding:8px 10px; font-size:13px; border-radius:8px; }
  .crm-field.full { grid-column:1 / -1; }
  .crm-form-group { font-size:12px; font-weight:600; color:var(--text-4); margin:16px 0 8px; grid-column:1 / -1; }
  .crm-form-foot { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
  .crm-alert { border-radius:10px; padding:10px 12px; font-size:12.5px; margin:10px 0; border:1px solid; }
  .crm-alert-warn { background:rgba(255,159,64,.10); border-color:rgba(255,159,64,.45); color:var(--text-2); }
  .crm-alert-danger { background:rgba(226,87,76,.10); border-color:rgba(226,87,76,.45); color:var(--text-2); }
  .crm-alert-info { background:rgba(62,166,255,.10); border-color:rgba(62,166,255,.4); color:var(--text-2); }
  .crm-err { color:var(--ui-danger); font-size:12px; margin-top:8px; }

  .crm-kv { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:14px 20px; }
  .crm-kv .k { font-size:12px; font-weight:600; color:var(--text-4); margin-bottom:3px; }
  .crm-kv .v { font-size:13px; color:var(--text-2); overflow-wrap:anywhere; }
  .crm-stake { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; }
  .crm-stake-col { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:10px 12px; }
  .crm-stake-title { font-size:12px; font-weight:600; color:var(--text-4); margin-bottom:8px; }
  .crm-person { display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; }
  .crm-person:hover .crm-person-name { text-decoration:underline; }
  .crm-person-name { font-size:12.5px; font-weight:800; color:var(--text-1); }
  .crm-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .crm-tl { display:flex; flex-direction:column; gap:0; padding-left:14px; border-left:2px solid var(--border-2); margin-left:4px; }
  .crm-tl-item { position:relative; padding:0 0 16px 14px; }
  .crm-tl-item::before { content:''; position:absolute; left:-21px; top:4px; width:10px; height:10px; border-radius:50%; background:#F5C400; border:2px solid var(--bg-1); }
  .crm-tl-kind { font-size:12px; font-weight:600; color:var(--text-4); }
  .crm-tl-text { font-size:12.5px; color:var(--text-2); line-height:1.5; }
  .crm-tl-time { font-size:12px; color:var(--text-6); margin-top:2px; }
  .crm-note { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; margin-bottom:8px; font-size:12.5px; color:var(--text-2); white-space:pre-wrap; }
  .crm-note-meta { font-size:12px; color:var(--text-6); margin-bottom:3px; display:flex; justify-content:space-between; gap:8px; }
  .crm-note-input textarea { width:100%; min-height:64px; padding:9px 11px; font-size:13px; border-radius:9px; resize:vertical; font-family:inherit; }
  .crm-step { display:flex; gap:6px; font-size:12px; color:var(--text-6); margin-bottom:12px; }
  .crm-step b { color:var(--text-1); }
  .crm-map-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:center; padding:5px 0; border-bottom:1px solid var(--border-1); font-size:12.5px; }
  .crm-map-row select { width:100%; padding:6px 8px; font-size:12.5px; }
  @keyframes crm-spin { to { transform: rotate(360deg); } }
  .crm-spin { animation: crm-spin 1s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .crm-spin { animation: none; } }
  .crm-status { font-size:12px; font-weight:800; padding:2px 8px; border-radius:999px; }
  .crm-seg { display:inline-flex; border:1px solid var(--border-2); border-radius:8px; overflow:hidden; }
  .crm-seg button { display:inline-flex; align-items:center; gap:5px; padding:6px 11px; font-size:12px; font-weight:700; background:transparent; color:var(--text-5); border:none; cursor:pointer; font-family:inherit; }
  .crm-seg button + button { border-left:1px solid var(--border-2); }
  .crm-seg button.active { background:var(--bg-3); color:var(--text-1); }
  html[data-theme="light"] .crm-seg button.active { background:#0B0B1E; color:#fff; }
  .crm-board { display:flex; gap:12px; overflow-x:auto; padding-bottom:14px; align-items:flex-start; }
  .crm-col { flex:0 0 272px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; display:flex; flex-direction:column; max-height:calc(100vh - 260px); min-height:120px; }
  .crm-col.over { outline:2px dashed #F5C400; outline-offset:-3px; }
  .crm-col-head { padding:10px 12px 9px; border-bottom:1px solid var(--border-1); }
  .crm-col-title { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:800; color:var(--text-1); }
  .crm-col-count { margin-left:auto; font-size:12px; font-weight:800; color:var(--text-5); background:var(--bg-3); border-radius:999px; padding:1px 8px; }
  .crm-col-sum { font-size:12px; color:var(--text-6); margin-top:3px; font-variant-numeric:tabular-nums; }
  .crm-col-body { padding:8px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; flex:1; }
  .crm-col-empty { font-size:12px; color:var(--text-6); text-align:center; padding:14px 6px; }
  .crm-deal { background:var(--bg-1); border:1px solid var(--border-1); border-radius:10px; padding:10px 11px; cursor:pointer; text-align:left; width:100%; font-family:inherit; color:inherit; }
  .crm-deal[draggable="true"] { cursor:grab; }
  .crm-deal:hover, .crm-deal:focus-visible { border-color:var(--border-3); }
  .crm-deal.dragging { opacity:.4; }
  /* fora da tela o navegador nem calcula o layout do cartão: poupa muito em quadro grande/computador velho (§119) */
  .crm-deal { content-visibility:auto; contain-intrinsic-size:auto 170px; }
  .crm-stepwrap { margin-top:12px; }
  .crm-stepbar { display:flex; gap:3px; overflow-x:auto; padding-bottom:2px; }
  .crm-step { flex:1 1 0; min-width:96px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; font-weight:700; padding:8px 16px 8px 20px; border:0; background:var(--bg-3); color:var(--text-4); cursor:pointer; font-family:inherit;
    clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%); }
  .crm-step:first-child { padding-left:14px; clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%); }
  .crm-step.passed { background:color-mix(in srgb, #F5C400 22%, var(--bg-3)); color:var(--text-2); }
  .crm-step.current { background:#F5C400; color:#0B0E1A; cursor:default; }
  .crm-step:disabled { cursor:default; }
  .crm-step:not(:disabled):hover, .crm-step:not(:disabled):focus-visible { filter:brightness(1.15); }
  .crm-step.end { flex:0 0 auto; padding:8px 18px; font-weight:800; cursor:default; }
  .crm-step.end.won { background:#3ecf6e; color:#06240f; } .crm-step.end.lost { background:#e2574c; color:#fff; }
  .crm-nav-badge { margin-left:auto; min-width:20px; height:20px; padding:0 5px; border-radius:99px; background:#c93a2b; color:#fff; font-size:12px; font-weight:800; display:inline-grid; place-items:center; }
  .crm-deal { position:relative; flex-shrink:0; }
  .crm-deal-top { display:flex; justify-content:space-between; align-items:flex-start; gap:6px; }
  .crm-deal-tools { display:flex; align-items:center; gap:4px; flex-shrink:0; margin:-3px -4px 0 0; }
  .crm-avatar { width:22px; height:22px; border-radius:50%; background:var(--bg-4); border:1px solid var(--border-2); color:var(--text-2); font-size:11px; font-weight:800; display:inline-grid; place-items:center; }
  .crm-deal-line { font-size:12px; color:var(--text-3); margin-top:3px; display:flex; align-items:center; gap:4px; overflow-wrap:anywhere; }
  .crm-deal-foot { font-size:12px; color:var(--text-4); margin-top:7px; padding-top:6px; border-top:1px dashed var(--border-1); }
  .crm-quick { position:relative; }
  .crm-quick .crm-icon-btn { width:26px; height:26px; }
  .crm-quick-menu { position:absolute; right:0; top:28px; z-index:30; min-width:178px; background:var(--bg-2); border:1px solid var(--border-3); border-radius:10px; padding:4px; box-shadow:0 10px 28px rgba(0,0,0,.35); display:flex; flex-direction:column; }
  .crm-quick-menu button { display:flex; align-items:center; gap:8px; background:transparent; border:0; color:var(--text-1); font-size:12.5px; padding:8px 10px; border-radius:7px; cursor:pointer; text-align:left; font-family:inherit; }
  .crm-quick-menu button:hover, .crm-quick-menu button:focus-visible { background:var(--bg-3); }
  .crm-deal-move { display:none; margin-top:8px; }
  .crm-deal-move select { width:100%; padding:8px 10px; font-size:13px; border-radius:8px; }
  @media (pointer: coarse) { .crm-deal-move { display:block; } }
  .crm-deal-title { font-size:12.5px; font-weight:800; color:var(--text-1); overflow-wrap:anywhere; }
  .crm-deal-co { font-size:12px; color:var(--text-5); margin-top:2px; overflow-wrap:anywhere; }
  .crm-deal-meta { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-top:8px; font-size:12px; color:var(--text-5); }
  .crm-deal-value { font-weight:800; color:var(--text-1); font-variant-numeric:tabular-nums; font-size:12.5px; }
  .crm-tagfilter { display:inline-block; position:relative; }
  .crm-btn-on { border-color:#FEDB00; box-shadow:0 0 0 2px rgba(254,219,0,.22); }
  .crm-tagbtn { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:3px 10px; border-radius:6px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-2); font-family:inherit; cursor:default; white-space:nowrap; }
  button.crm-tagbtn { cursor:pointer; }
  .crm-tagbtn::before { content:''; width:8px; height:8px; border-radius:50%; background:var(--dot, var(--text-6)); flex-shrink:0; }
  .crm-tagbtn b { font-weight:700; color:var(--text-1); font-variant-numeric:tabular-nums; }
  button.crm-tagbtn:hover { background:var(--bg-3); border-color:var(--border-3); }
  button.crm-tagbtn[aria-pressed="true"], .crm-tagbtn.on { background:var(--bg-4); border-color:var(--text-4); color:var(--text-1); }
  .crm-tagbtn-x { display:inline-flex; border:0; background:transparent; color:inherit; padding:0 0 0 2px; cursor:pointer; }
  .crm-quicktags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; flex-basis:100%; margin-top:2px; }
  .crm-link-btn { border:0; background:none; color:var(--text-4); text-decoration:underline; font:inherit; font-size:12px; cursor:pointer; }
  .crm-tagpop { z-index:10050; width:min(340px, calc(100vw - 24px)); background:var(--bg-2); color:var(--text-1); border:1px solid var(--border-3); border-radius:12px; box-shadow:0 18px 48px rgba(0,0,0,.38); padding:10px; display:flex; flex-direction:column; overflow:hidden; }
  .crm-tagpop > input { margin-bottom:8px; }
  .crm-tagpop-list { overflow:auto; display:flex; flex-direction:column; gap:1px; min-height:0; }
  .crm-tagpop-row { display:flex; align-items:center; gap:8px; padding:6px 6px; border-radius:7px; cursor:pointer; font-size:13px; }
  .crm-tagpop-row:hover { background:var(--bg-4); }
  .crm-tagpop-row input { width:auto; }
  .crm-tagpop-row small { color:var(--text-5); font-variant-numeric:tabular-nums; }
  .crm-tagdot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

  /* ---- CRM com vida (2026-10-26): cor da etapa, ícones por tipo, avatares, navegação e indicadores ---- */
  .crm-col { --stage:var(--border-3); border-top:2px solid var(--stage); background:var(--bg-2); }
  .crm-col-count { background:var(--bg-3); color:var(--text-2); font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; }
  .crm-col-title { font-size:13px; font-weight:700; }
  .crm-col-sum { font-size:12px; }
  .crm-deal { transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
  .crm-deal:hover, .crm-deal:focus-visible { transform:translateY(-1px); box-shadow:0 6px 16px rgba(11,11,30,.14); }
  .crm-deal-value { color:#2ecc8f; }
  html[data-theme="light"] .crm-deal-value { color:#0f8a5f; }
  .crm-avatar { border-width:1.5px; }
  .crm-act-ico { background:color-mix(in srgb, var(--act, #8f9bb3) 20%, var(--bg-3)); color:var(--act, var(--text-4)); }
  .crm-act.done .crm-act-ico { filter:grayscale(.7); opacity:.7; }
  .crm-h1 { font-size:28px; letter-spacing:-.02em; line-height:1.15; }
  .crm-nav { background:#0B0B1E; border-right:none; padding:16px 10px; }
  .crm-nav button { color:#c3c8dc; }
  .crm-nav button svg { color:#8d93ad; flex-shrink:0; }
  .crm-nav button:hover { background:rgba(255,255,255,.07); color:#fff; }
  .crm-nav button.active { background:rgba(255,255,255,.1); color:#fff; box-shadow:inset 3px 0 0 #FEDB00; }
  .crm-nav button.active svg { color:#FEDB00; }
  .crm-cards { grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); }
  .crm-cards-six { grid-template-columns:repeat(3, minmax(0,1fr)); }
  @media (min-width: 1560px) { .crm-cards-six { grid-template-columns:repeat(6, minmax(0,1fr)); } }
  @media (max-width: 760px) { .crm-cards-six { grid-template-columns:repeat(2, minmax(0,1fr)); } }
  @media (max-width: 480px) { .crm-cards, .crm-cards-six { grid-template-columns:minmax(0,1fr); } }
  .crm-kpi { display:flex; align-items:center; gap:14px; padding:16px 18px; font:inherit; color:inherit; text-align:left; width:100%; box-shadow:0 1px 2px rgba(11,11,30,.04); }
  .crm-kpi-ico { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; flex-shrink:0; background:color-mix(in srgb, var(--ico, #8f9bb3) 14%, var(--bg-2)); color:var(--ico, var(--text-5)); }
  .crm-kpi-body { display:flex; flex-direction:column; min-width:0; flex:1; }
  .crm-kpi .crm-kpi-value { font-size:26px; letter-spacing:-.02em; }
  .crm-kpi .crm-kpi-value.featured { font-size:30px; }
  .crm-kpi .crm-kpi-label { margin-top:3px; font-size:12.5px; font-weight:600; }
  .crm-kpi .crm-kpi-sub { margin-top:2px; }
  .crm-kpi-go { color:var(--text-6); flex-shrink:0; }
  .crm-kpi-click { cursor:pointer; transition:border-color .12s ease, box-shadow .12s ease; }
  .crm-kpi-click:hover { border-color:var(--border-3); box-shadow:0 4px 14px rgba(11,11,30,.10); }
  .crm-kpi-click:hover .crm-kpi-go { color:var(--text-2); }
  .crm-panel-t { display:inline-flex; align-items:center; gap:8px; }
  .crm-section-title { color:var(--text-3); }
  .crm-more { display:inline-flex; align-items:center; gap:2px; border:none; background:transparent; color:var(--text-4); font:inherit; font-size:12.5px; font-weight:600; text-transform:none; letter-spacing:0; cursor:pointer; padding:2px 4px; border-radius:6px; }
  .crm-more:hover { color:var(--text-1); background:var(--bg-3); }
  .crm-row-main { display:flex; align-items:center; gap:12px; min-width:0; flex:1; }
  .crm-row-ico { width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex-shrink:0; background:color-mix(in srgb, var(--ico, #8f9bb3) 14%, var(--bg-2)); color:var(--ico, var(--text-5)); }
  .crm-row-text { min-width:0; overflow-wrap:anywhere; line-height:1.4; }
  .crm-row-two { display:flex; flex-direction:column; gap:1px; }
  .crm-row-two b { font-size:13.5px; color:var(--text-1); }
  .crm-row-right { display:inline-flex; align-items:center; gap:8px; white-space:nowrap; flex-shrink:0; }
  .crm-row-go { color:var(--text-6); }
  .crm-row-link:hover .crm-row-go { color:var(--text-2); }
  .crm-two { align-items:start; }
  .crm-ov .crm-section-title { text-transform:none; letter-spacing:0; font-size:13.5px; font-weight:600; color:var(--text-2); margin-bottom:6px; }
  .crm-ov .crm-section-title .crm-muted { font-size:13px; }
  .crm-ov .crm-row-link { padding:8px 6px; border-radius:8px; }
  .crm-ov .crm-row-text .crm-muted { font-size:12px; }
  .crm-ov .crm-row-two b { font-size:13px; }
  .crm-ov .crm-row-main { gap:10px; }
  .crm-ov .crm-row-ico { width:30px; height:30px; border-radius:8px; }
  .crm-row-right { justify-content:flex-end; }
  .crm-when { display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--text-4); font-variant-numeric:tabular-nums; }
  .crm-when-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .crm-when:has(.crm-when-days) { min-width:152px; justify-content:flex-end; }
  .crm-when-days { font-weight:700; color:var(--text-2); min-width:50px; text-align:right; }
  .crm-stage-num { display:inline-flex; gap:12px; align-items:baseline; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .crm-stage-num b { min-width:28px; text-align:right; }
  @media (max-width: 640px) { .crm-when:has(.crm-when-days) { min-width:0; } .crm-when-days { min-width:0; } .crm-ov .crm-row-link { flex-wrap:wrap; row-gap:2px; } .crm-ov .crm-row-main { flex:1 1 100%; } .crm-ov .crm-row-right { flex:1 1 100%; justify-content:space-between; padding-left:40px; } }
  .crm-section { box-shadow:0 1px 2px rgba(11,11,30,.04); }
  .crm-btn:not(.crm-btn-primary):hover { border-color:#FEDB00; }
  @media (prefers-reduced-motion: reduce) { .crm-deal { transition:none; } .crm-deal:hover, .crm-deal:focus-visible { transform:none; } }
  .crm-tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:7px; }
  :root { --tg-green:#2ecc8f; --tg-blue:#3ea6ff; --tg-amber:#f5a524; --tg-gray:#9aa0ad; --tg-yellow:#FEDB00; --tg-purple:#b98af5; --tg-teal:#2fc4c4; --tg-red:#ff6b4a; --tg-pink:#f06fb0; --tg-lime:#7bd66a; --tg-orange:#ff9f40; --tg-risk:#e2574c; --tg-warn:#ff9f40; --tg-blue-text:#7cc0ff; }
  html[data-theme="light"] { --tg-green:#0f8a5f; --tg-blue:#1d6fd6; --tg-amber:#a86400; --tg-gray:#6b7280; --tg-yellow:#9a7400; --tg-purple:#7c4dcc; --tg-teal:#0e7c86; --tg-red:#cf3f1f; --tg-pink:#c2347f; --tg-lime:#3a8f2c; --tg-orange:#b85c00; --tg-risk:#c0392b; --tg-warn:#b86e00; --tg-blue-text:#1558b0; }
  .crm-tg { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; line-height:1.3; padding:2px 8px; border-radius:6px; background:var(--bg-3); color:var(--text-2); border:1px solid var(--border-1); max-width:100%; }
  .crm-tg::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--dot, var(--text-6)); flex-shrink:0; }
  .crm-tg-more { cursor:help; font-variant-numeric:tabular-nums; }
  .crm-tg-more::before { display:none; }
  .crm-tg .crm-icon-btn { padding:0 0 0 2px; color:inherit; }
  .crm-cl { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; font-size:12px; margin-top:6px; }
  .crm-cl-num { display:inline-flex; align-items:center; gap:5px; color:var(--text-2); font-weight:600; text-decoration:none; font-variant-numeric:tabular-nums; }
  .crm-cl-num:hover, .crm-cl-mail:hover { text-decoration:underline; }
  .crm-cl-ico { position:relative; display:inline-grid; place-items:center; width:28px; height:28px; border-radius:8px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-3); cursor:pointer; padding:0; text-decoration:none; }
  .crm-cl-ico:hover { background:var(--bg-3); border-color:var(--border-3); }
  .crm-cl-wa { color:var(--tg-green); }
  .crm-cl-copy { position:relative; display:inline-flex; align-items:center; gap:5px; height:28px; padding:0 9px; border-radius:8px; font:inherit; font-size:12px; font-weight:700; cursor:pointer; color:var(--tg-blue-text); background:color-mix(in srgb, var(--tg-blue) 12%, var(--bg-2)); border:1px solid color-mix(in srgb, var(--tg-blue) 40%, var(--border-2)); }
  .crm-cl-copy:hover { background:color-mix(in srgb, var(--tg-blue) 20%, var(--bg-2)); }
  .crm-cl-mail { flex-basis:100%; display:inline-flex; align-items:center; gap:5px; min-width:0; color:var(--text-3); text-decoration:none; }
  .crm-cl-mail span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .crm-cl-ico:focus-visible, .crm-cl-copy:focus-visible, .crm-cl-num:focus-visible, .crm-cl-mail:focus-visible { outline:2px solid #3ea6ff; outline-offset:2px; }
  @media (pointer: coarse) { .crm-cl-ico { width:44px; height:44px; } .crm-cl-copy { height:44px; padding:0 14px; } .crm-cl-num, .crm-cl-mail { min-height:44px; } .crm-cl { gap:2px 8px; } }
  .crm-deal-status { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:3px; }
  .crm-deal-status li { display:flex; align-items:baseline; gap:7px; font-size:12px; line-height:1.35; color:var(--text-2); overflow-wrap:anywhere; }
  .crm-deal-status li::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--dot, var(--text-6)); flex-shrink:0; transform:translateY(-1px); }
  .crm-tag { font-size:12px; font-weight:800; padding:1px 7px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .crm-items-row { display:grid; grid-template-columns:minmax(0,1fr) 78px 118px 30px; gap:8px; align-items:center; margin-bottom:8px; }
  .crm-items-row input, .crm-items-row select { width:100%; padding:7px 9px; font-size:12.5px; border-radius:8px; }
  @media (max-width: 640px) { .crm-items-row { grid-template-columns:minmax(0,1fr) 64px 100px 30px; } .crm-col { flex-basis:78vw; } }
  .crm-total { display:flex; justify-content:space-between; font-size:13px; font-weight:800; color:var(--text-1); padding-top:8px; border-top:1px solid var(--border-1); font-variant-numeric:tabular-nums; }
  .crm-path { display:flex; flex-direction:column; gap:6px; }
  .crm-path-row { display:flex; justify-content:space-between; gap:10px; font-size:12.5px; color:var(--text-3); padding:6px 0; border-bottom:1px solid var(--border-1); }
  .crm-path-row:last-child { border-bottom:none; }
  .crm-num { font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
  .crm-table.crm-first-narrow th:first-child, .crm-table.crm-first-narrow td:first-child { min-width:0; width:64px; }
  .crm-act { display:flex; gap:10px; align-items:flex-start; padding:10px 4px; border-bottom:1px solid var(--border-1); }
  .crm-act:last-child { border-bottom:none; }
  .crm-act-ico { flex-shrink:0; width:30px; height:30px; border-radius:8px; background:var(--bg-3); color:var(--text-4); display:flex; align-items:center; justify-content:center; }
  .crm-act.done .crm-act-title { text-decoration:line-through; color:var(--text-5); }
  .crm-act-title { font-size:13px; font-weight:800; color:var(--text-1); overflow-wrap:anywhere; }
  .crm-act-meta { font-size:12px; color:var(--text-5); margin-top:2px; display:flex; gap:6px 10px; flex-wrap:wrap; align-items:center; }
  .crm-act-meta button { background:none; border:none; padding:0; font:inherit; color:var(--text-4); text-decoration:underline; cursor:pointer; }
  .crm-act-body { flex:1; min-width:0; }
  .crm-act-actions { display:flex; gap:4px; align-items:center; flex-shrink:0; }
  .crm-act-outcome { margin-top:5px; font-size:12px; color:var(--text-3); background:var(--bg-3); border-radius:8px; padding:6px 9px; white-space:pre-wrap; }
  .crm-check { width:22px; height:22px; border-radius:50%; border:2px solid var(--border-3); background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:transparent; flex-shrink:0; margin-top:4px; padding:0; }
  .crm-check:hover { border-color:#3ecf6e; color:var(--ui-ok); }
  .crm-check.on { background:#3ecf6e; border-color:#3ecf6e; color:#111; }
  .crm-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
  .crm-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; border:1px solid var(--border-2); background:transparent; color:var(--text-3); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
  .crm-chip[data-dot]::before { content:''; align-self:center; width:7px; height:7px; border-radius:50%; background:var(--dot, var(--text-6)); flex-shrink:0; }
  .crm-chip b { font-size:13px; color:var(--text-1); font-variant-numeric:tabular-nums; }
  .crm-chip.active { background:var(--bg-3); color:var(--text-1); border-color:var(--border-3); }

  .crm-btn:focus-visible, .crm-icon-btn:focus-visible, .crm-nav button:focus-visible, .crm-tab:focus-visible, .crm-seg button:focus-visible, .crm-chip:focus-visible, .crm-check:focus-visible, .crm-row-link:focus-visible, .crm-search-item:focus-visible, .crm-deal:focus-visible, .crm-person:focus-visible, .crm-act-meta button:focus-visible,
  .crm-field input:focus-visible, .crm-field select:focus-visible, .crm-field textarea:focus-visible, .crm-filters select:focus-visible, .crm-filters input:focus-visible, .crm-search input:focus-visible, .crm-note-input textarea:focus-visible, .crm-items-row input:focus-visible, .crm-items-row select:focus-visible, .crm-map-row select:focus-visible, .crm-deal-move select:focus-visible, .crm-table tbody tr:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  .crm-check { position:relative; }
  @media (max-width: 767px) {
    .crm-btn, .crm-icon-btn, .crm-nav button, .crm-tab, .crm-seg button, .crm-chip, .crm-row-link, .crm-search-item { min-height:44px; }
    .crm-icon-btn { min-width:44px; align-items:center; justify-content:center; }
    .crm-check::after { content:''; position:absolute; inset:-11px; }
    .crm-field input, .crm-field select, .crm-field textarea, .crm-filters select, .crm-filters input, .crm-search input, .crm-note-input textarea, .crm-items-row input, .crm-items-row select, .crm-map-row select, .crm-deal-move select { font-size:16px; min-height:44px; }
    .crm-note-input textarea { min-height:88px; }
    .crm-filters select, .crm-filters input { flex:1 1 140px; width:auto; min-width:0; }
    .crm-items-row { grid-template-columns:minmax(0,1fr) 64px 100px 44px; }
    .crm-modal { padding:16px; }
    .crm-drawer-head { padding:14px 14px 0; }
    .crm-drawer-body { padding:14px 14px 32px; }
    .crm-form-foot { flex-wrap:wrap; }
    .crm-topbar { padding:10px 14px; }
  }
`;

// ---- telefone / WhatsApp / nome de contato (o PipeRun grava "Nome não informado" quando a pessoa só tem telefone)
export const realName = (n) => (/^\s*nome\s+n[aã]o\s+informado\s*$/i.test(String(n || '')) ? '' : String(n || '').trim());
const digitsOf = (v) => String(v || '').replace(/\D/g, '');
// Número no formato internacional do Brasil (wa.me exige DDI): 10/11 dígitos ganham 55.
export function waNumber(v) { const d = digitsOf(v); if (d.length < 10) return ''; return d.length <= 11 ? `55${d}` : d; }
export function fmtPhone(v) {
  const d0 = digitsOf(v); if (!d0) return '';
  const d = d0.length >= 12 && d0.startsWith('55') ? d0.slice(2) : d0;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(v).trim();
}
// Número para colar em grupo/contato (2026-10-30, pedido da Eduarda): só dígitos, DDD + número, sem +55 — (47) 99113-0619 → 47991130619.
export function plainPhone(v) {
  const d0 = digitsOf(v); if (!d0) return '';
  return d0.length >= 12 && d0.startsWith('55') ? d0.slice(2) : d0;
}
export const telHref = (v) => { const n = waNumber(v); return n ? `tel:+${n}` : ''; };
export const waHref = (v) => { const n = waNumber(v); return n ? `https://wa.me/${n}` : ''; };
export function contactLabel(c) {
  const n = realName(`${c.firstName || ''} ${c.lastName || ''}`);
  return n || fmtPhone(c.whatsapp || c.phone) || c.email || 'Sem nome';
}

// Mensagem curta do que a cadência fez ao mover o negócio ou concluir um passo ({ scheduled, cancelled } ou a atividade seguinte).
export function cadenceNotice(c) {
  if (!c) return '';
  const parts = [];
  if (c.scheduled) parts.push(`Cadência: "${c.scheduled.title}" agendado para ${fmtDateBR(c.scheduled.dueDate)}.`);
  if (c.cancelled) parts.push(`${c.cancelled} passo(s) da cadência cancelado(s).`);
  return parts.join(' ');
}
