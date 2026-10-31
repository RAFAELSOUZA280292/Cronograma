// Briefing diário da RENATA (Onda 3, R3): regras que escolhem o que merece atenção hoje e texto escrito por modelo fixo — sem IA, sem custo
// por pessoa, e cada linha diz o porquê. Este arquivo é puro (sem banco): as consultas ficam em briefing.js.
// Limites (decididos com o Rafael em 2026-10-31, sugestão do plano): cliente sem interação há mais de 30 dias; negócio parado na etapa há mais de
// 14 dias (a mesma definição de "parado" do CRM); entrega vencida; reunião recente sem nenhuma tarefa.
export const COLD_DAYS = 30;
export const STALLED_DAYS = 14;
export const MEETING_LOOKBACK_DAYS = 14;
export const MAX_PER_RULE = 3;

export const BRIEFING_RULES = [
  { key: 'overdue_deliveries', label: 'Entregas vencidas', description: 'Atividades das empresas em que você é o responsável e já passaram do prazo.', needsCrm: false },
  { key: 'stalled_deals', label: 'Negócios parados', description: `Seus negócios abertos há mais de ${STALLED_DAYS} dias na mesma etapa.`, needsCrm: true },
  { key: 'cold_clients', label: 'Clientes sem interação', description: `Empresas com negócio seu aberto, sem atividade concluída nem nota há mais de ${COLD_DAYS} dias e sem nada agendado.`, needsCrm: true },
  { key: 'meetings_no_tasks', label: 'Reuniões sem tarefa', description: `Reuniões dos últimos ${MEETING_LOOKBACK_DAYS} dias, nas empresas pelas quais você responde, que não geraram nenhuma tarefa.`, needsCrm: false },
];
const RULE_KEYS = new Set(BRIEFING_RULES.map((r) => r.key));

export function readBriefingOff(preferences) {
  const o = preferences && preferences.notifications && preferences.notifications.briefingOff;
  return Array.isArray(o) ? [...new Set(o.filter((k) => RULE_KEYS.has(k)))] : [];
}
export function publicBriefingRules(off) {
  return BRIEFING_RULES.map((r) => ({ key: r.key, label: r.label, description: r.description, off: off.includes(r.key) }));
}
export const isValidRuleKey = (k) => RULE_KEYS.has(k);

const MS = 86400000;
const parse = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
export function daysBetween(fromIso, toIso) {
  const a = parse(fromIso); const b = parse(toIso);
  return a == null || b == null ? 0 : Math.max(0, Math.round((b - a) / MS));
}
export const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
export const brDate = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;
const clip = (s, n = 60) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

const DONE = new Set(['concluido']);
const live = (x) => x && !x.deleted;

// Entregas vencidas do usuário: atividades de empresa (responsável = nome do usuário), abertas e com prazo anterior a hoje.
export function overdueDeliveries(projects, userName, today) {
  const me = String(userName || '').trim().toLowerCase();
  if (!me) return [];
  const out = [];
  for (const p of projects) {
    const d = p.data || {};
    const company = (d.company && (d.company.nomeFantasia || d.company.name)) || 'Projeto';
    for (const a of Array.isArray(d.activities) ? d.activities : []) {
      if (!live(a) || DONE.has(a.status) || String(a.responsible || '').trim().toLowerCase() !== me) continue;
      const due = a.endDate || a.date;
      if (!due || due >= today) continue;
      out.push({ kind: 'activity', projectId: p.id, activityId: a.id, company, title: a.title || 'Atividade', days: daysBetween(due, today), due });
    }
  }
  return out.sort((x, y) => y.days - x.days || x.title.localeCompare(y.title, 'pt-BR'));
}

// Reuniões recentes (já realizadas) de empresas que a pessoa acompanha (ownerIds) e que não geraram tarefa nenhuma.
export function meetingsWithoutTasks(projects, userId, today) {
  const out = [];
  for (const p of projects) {
    const d = p.data || {};
    const owners = Array.isArray(d.ownerIds) ? d.ownerIds : [];
    if (!owners.includes(userId) && d.principalOwnerId !== userId) continue;
    const company = (d.company && (d.company.nomeFantasia || d.company.name)) || 'Projeto';
    for (const m of Array.isArray(d.meetings) ? d.meetings : []) {
      if (!live(m) || !m.date || m.date >= today) continue;
      const age = daysBetween(m.date, today);
      if (age > MEETING_LOOKBACK_DAYS) continue;
      if ((Array.isArray(m.actionItems) ? m.actionItems : []).some(live)) continue;
      out.push({ kind: 'meeting', projectId: p.id, meetingId: m.id, company, title: m.title || 'Reunião', days: age, date: m.date });
    }
  }
  return out.sort((x, y) => x.days - y.days || x.title.localeCompare(y.title, 'pt-BR'));
}

export const stalledFromDeals = (deals) => (deals || []).filter((d) => (d.daysInStage || 0) > STALLED_DAYS)
  .sort((a, b) => b.daysInStage - a.daysInStage)
  .map((d) => ({ kind: 'deal', dealId: d.id, companyId: d.companyId, company: d.companyName, title: d.title, days: d.daysInStage, stage: d.stageName || '', value: d.value || 0 }));

// Descrição de cada linha: sempre diz o porquê em números.
export function describe(ruleKey, it, fmtMoney = (v) => `R$ ${v}`) {
  switch (ruleKey) {
    case 'overdue_deliveries': return `${clip(it.title)} — ${it.company}: venceu há ${dias(it.days)} (${brDate(it.due)})`;
    case 'stalled_deals': return `${clip(it.title)} — ${it.company}: ${dias(it.days)} em “${it.stage}”${it.value > 0 ? ` · ${fmtMoney(it.value)}` : ''}`;
    case 'cold_clients': return `${it.company}: ${it.lastDate ? `sem interação há ${dias(it.days)}` : 'nunca teve interação registrada'}`;
    case 'meetings_no_tasks': return `${clip(it.title)} — ${it.company}: reunião de ${brDate(it.date)} sem nenhuma tarefa`;
    default: return clip(it.title);
  }
}

// Junta o resultado das regras num briefing: { total, sections[{ key, label, count, items[] }], title, body, target }.
// `byRule` = { [key]: itens[] } já na ordem de importância; só entram regras ligadas e com itens; cada seção mostra até MAX_PER_RULE.
export function composeBriefing({ byRule, off = [], fmtMoney } = {}) {
  const sections = [];
  for (const r of BRIEFING_RULES) {
    if (off.includes(r.key)) continue;
    const items = (byRule && byRule[r.key]) || [];
    if (!items.length) continue;
    sections.push({ key: r.key, label: r.label, count: items.length, items: items.slice(0, MAX_PER_RULE).map((it) => ({ ...it, text: describe(r.key, it, fmtMoney) })) });
  }
  const total = sections.reduce((n, s) => n + s.count, 0);
  const title = total ? `Seu dia: ${total} ${total === 1 ? 'ponto pede' : 'pontos pedem'} atenção` : 'Seu dia está em ordem';
  const body = sections.map((s) => `${s.label} (${s.count}): ${s.items[0].text}${s.count > 1 ? ` e mais ${s.count - 1}` : ''}.`).join(' ');
  return { total, sections, title, body: clip(body, 600) };
}
