// Exportação dos negócios para Excel (2026-10-28, §116c): mesmos filtros da lista/quadro, com os dados de contato (e-mail, telefone, link do WhatsApp).
import { pool } from '../db.js';
import { listDeals } from './dealQueries.js';
import { buildXlsx, excelDate } from './xlsxExport.js';
import { DEAL_TYPE_LABELS } from './pipeline.js';

export const EXPORT_MAX_ROWS = 5000;
const digits = (v) => String(v || '').replace(/\D/g, '');
// Mesmas regras de src/crm/crmMeta.js (waNumber/fmtPhone): 10/11 dígitos ganham o DDI 55 para o wa.me.
export const waNumber = (v) => { const d = digits(v); if (d.length < 10) return ''; return d.length <= 11 ? `55${d}` : d; };
export function fmtPhone(v) {
  const d0 = digits(v); if (!d0) return '';
  const d = d0.length >= 12 && d0.startsWith('55') ? d0.slice(2) : d0;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(v).trim();
}
const SITUATION = { open: 'Em aberto', won: 'Ganho', lost: 'Perdido' };
const brDay = (iso) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); };
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const DEAL_COLUMNS = [
  { header: 'Negócio', width: 38, get: (d) => d.title },
  { header: 'Contato', width: 28, get: (d) => d.contactName },
  { header: 'E-mail', width: 34, kind: 'email', get: (d) => d.contactEmail, link: (d) => (d.contactEmail ? `mailto:${d.contactEmail}` : '') },
  { header: 'Telefone', width: 18, get: (d) => fmtPhone(d.contactPhone || d.contactWhatsapp) },
  { header: 'WhatsApp', width: 22, kind: 'wa', get: (d) => (waNumber(d.contactWhatsapp || d.contactPhone) ? 'Abrir no WhatsApp' : ''), link: (d) => { const n = waNumber(d.contactWhatsapp || d.contactPhone); return n ? `https://wa.me/${n}` : ''; } },
  { header: 'Empresa', width: 34, get: (d) => d.companyName.replace(/ \(empresa não informada\)$/, '') },
  { header: 'Cidade/UF', width: 18, get: (d) => [d.companyCity, d.companyState].filter(Boolean).join('/') },
  { header: 'Origem', width: 24, get: (d) => d.source },
  { header: 'Etapa', width: 18, get: (d) => d.stageName },
  { header: 'Situação', width: 12, kind: 'center', get: (d) => SITUATION[d.status] || d.status },
  { header: 'Valor', width: 15, kind: 'money', get: (d) => d.value },
  { header: 'Prob. (%)', width: 10, kind: 'int', get: (d) => (d.status === 'open' ? d.probability : null) },
  { header: 'Responsável', width: 20, get: (d) => d.ownerName },
  { header: 'Tipo', width: 16, get: (d) => DEAL_TYPE_LABELS[d.dealType] || d.dealType },
  { header: 'Tags', width: 46, get: (d) => (d.tags || []).join(', ') },
  { header: 'Criado em', width: 12, kind: 'date', get: (d) => excelDate(brDay(d.createdAt)) },
  { header: 'Previsão', width: 12, kind: 'date', get: (d) => excelDate(d.expectedCloseDate) },
  { header: 'Dias na etapa', width: 12, kind: 'int', get: (d) => (d.status === 'open' ? d.daysInStage : null) },
  { header: 'Próxima atividade', width: 36, get: (d) => [d.nextActivityDate ? d.nextActivityDate.split('-').reverse().join('/') : '', d.nextActivityTime, d.nextActivityTitle].filter(Boolean).join(' ') },
];

// f: { q, type, ownerId, source, tag, attention, status, pipelineId } (os mesmos da lista). Devolve { buffer, filename, count, truncated }.
export async function exportDealsXlsx(orgId, f = {}) {
  const rows = []; let offset = 0; let total = 0;
  for (;;) {
    const r = await listDeals(orgId, { ...f, limit: 200, offset, sort: 'recent' });
    total = r.total; rows.push(...r.items); offset += 200;
    if (offset >= r.total || rows.length >= EXPORT_MAX_ROWS) break;
  }
  const kept = rows.slice(0, EXPORT_MAX_ROWS);
  const parts = [];
  const status = ['open', 'won', 'lost'].includes(f.status) ? f.status : (f.status === 'all' ? 'todas as situações' : 'open');
  if (f.pipelineId) { const { rows: [p] } = await pool.query('SELECT name FROM crm_pipelines WHERE id=$1 AND org_id=$2', [f.pipelineId, orgId]).catch(() => ({ rows: [] })); if (p) parts.push(`funil ${p.name}`); }
  parts.push(status === 'open' ? 'em aberto' : status === 'won' ? 'ganhos' : status === 'lost' ? 'perdidos' : status);
  const tags = [...new Set([].concat(f.tag || []).flatMap((x) => String(x).split('|')).map((x) => x.trim()).filter(Boolean))];
  if (tags.length) parts.push(`tag${tags.length > 1 ? 's' : ''} “${tags.join('” + “')}”`);
  if (f.source) parts.push(`origem ${f.source}`);
  if (f.type) parts.push(f.type === 'upsell' ? 'só upsell' : 'só novos negócios');
  if (f.ownerId) { if (f.ownerId === 'none') parts.push('sem responsável'); else { const { rows: [u] } = await pool.query('SELECT name FROM users WHERE id=$1', [f.ownerId]).catch(() => ({ rows: [] })); if (u) parts.push(`responsável ${u.name}`); } }
  if (f.attention) parts.push({ late: 'passo atrasado', nonext: 'sem próximo passo', stalled: 'parados há mais de 14 dias', overdue: 'previsão vencida' }[f.attention] || '');
  if (String(f.q || '').trim()) parts.push(`busca “${String(f.q).trim().slice(0, 60)}”`);
  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const truncated = total > EXPORT_MAX_ROWS;
  const buffer = await buildXlsx({
    sheetName: 'Negócios',
    title: tags.length === 1 ? `Negócios — ${tags[0]}` : 'Negócios do CRM',
    subtitle: `Filtro aplicado: ${parts.filter(Boolean).join(' · ')} · ${kept.length} negócio(s)${truncated ? ` (os ${EXPORT_MAX_ROWS} primeiros de ${total}; refine o filtro)` : ''} · exportado em ${today}`,
    columns: DEAL_COLUMNS,
    rows: kept,
  });
  const iso = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return { buffer, filename: `negocios${tags.length ? `-${slug(tags.join('-'))}` : ''}-${iso}.xlsx`, count: kept.length, total, truncated };
}
