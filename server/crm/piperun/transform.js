// Migração PipeRun → CRM (§84): TRANSFORMAÇÃO PURA (sem banco, sem rede). Entra a cópia bruta da API; saem as linhas no formato que os importadores do CRM já usam.
// Regras fechadas com o Rafael: nenhum negócio fica de fora por falta de empresa (vira empresa PROVISÓRIA, para completar depois); motivo de perda e ordem das etapas vêm da
// API; datas originais preservadas; só os documentos (PDF/DOCX…) sobem como arquivo; campos personalizados viram texto na descrição, sem coluna nova.
import { companyNameKey, personNameKey, firstEmail, onlyDigits } from '../text.js';

const PLACEHOLDERS = new Set(['nome nao informado', 'nao informado', 'nao informada', 'sem nome', 'n a', 'na', 'desconhecido', 'desconhecida']);
export const isPlaceholder = (v) => PLACEHOLDERS.has(personNameKey(v));
const s = (v) => (v === undefined || v === null ? '' : String(v)).trim();
const byId = (list) => new Map((list || []).map((x) => [String(x.id), x]));

// '2026-01-05 10:12:00' (horário de Brasília na conta) -> '2026-01-05'
export const toDate = (v) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(s(v)); return m ? m[1] : ''; };
export const toTime = (v) => { const m = /[ T](\d{2}:\d{2})/.exec(s(v)); return m ? m[1] : ''; };
export const toTs = (v) => { const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s(v)); return m ? `${m[1]} ${m[2]}` : (toDate(v) ? `${toDate(v)} 12:00:00` : ''); };

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
export function htmlToText(html) {
  let t = s(html);
  if (!t) return '';
  t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (m) => ENT[m.toLowerCase()] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return t.replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Motivos de perda do PipeRun -> motivos do CRM (o texto original vai junto no detalhe, nada se perde).
const LOST_MAP = [
  ['postergou', 'sem_decisao'], ['sem perfil', 'sem_fit'], ['nao qualificado', 'sem_fit'], ['outra empresa', 'concorrente'], ['concorrent', 'concorrente'],
  ['preco', 'preco'], ['orcamento', 'sem_orcamento'], ['sem interesse', 'outro'], ['prazo', 'outro'],
];
export function mapLostReason(name) {
  const k = personNameKey(name);
  const hit = LOST_MAP.find(([frag]) => k.includes(frag));
  return { key: hit ? hit[1] : 'outro', detail: name ? `Motivo no PipeRun: ${name}` : 'Importado do PipeRun — sem motivo informado.' };
}

const TYPE_MAP = [['ligacao', 'call'], ['e mail', 'email'], ['email', 'email'], ['reuniao', 'meeting'], ['whats', 'whatsapp'], ['follow', 'followup'], ['tentativa', 'call']];
export function mapActivityType(name) {
  const k = personNameKey(name);
  const hit = TYPE_MAP.find(([frag]) => k.includes(frag));
  return hit ? hit[1] : 'task';
}

export function buildContext(raw) {
  const g = (k) => (Array.isArray(raw[k]) ? raw[k] : []);
  const ctx = {
    raw,
    users: byId(g('users')), origins: byId(g('origins')), lostReasons: byId(g('lostReasons')), activityTypes: byId(g('activityTypes')), pipelines: byId(g('pipelines')), stages: byId(g('stages')),
    segments: byId(g('segments')), companies: byId(g('companies')), persons: byId(g('persons')), cnaes: byId(g('cnaes')), customFieldDefs: byId(g('customFields')), deals: byId(g('deals')),
  };
  // Autor de um evento: usuários da conta + quem assinou alguma anotação (cobre usuários que já saíram do PipeRun).
  ctx.userNames = new Map([...ctx.users.entries()].map(([k, u]) => [k, s(u.name)]));
  g('notes').forEach((n) => { if (n.user_id && s(n.user_name) && !ctx.userNames.has(String(n.user_id))) ctx.userNames.set(String(n.user_id), s(n.user_name)); });
  ctx.proposalsByDeal = new Map();
  g('proposals').forEach((p) => { const k = String(p.deal_id); ctx.proposalsByDeal.set(k, [...(ctx.proposalsByDeal.get(k) || []), p]); });
  return ctx;
}

const fmtMoney = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function customFieldsText(entity) {
  const list = Array.isArray(entity && entity.customFields) ? entity.customFields : [];
  const text = (v) => (Array.isArray(v) ? v.map((o) => (o && typeof o === 'object' ? (o.name || o.label || '') : o)).filter(Boolean).join(', ') : (v && typeof v === 'object' ? (v.name || v.label || '') : v));
  return list.map((f) => {
    const val = s(text(f.value)) || s(text(f.raw_value)) || s(text(f.selected_options));
    return val ? `- ${s(f.name)}: ${val}` : '';
  }).filter(Boolean).join('\n');
}

const firstOf = (list, pred = () => true) => (Array.isArray(list) ? list.find((x) => x && pred(x)) : null) || null;
export const emailsOf = (p) => (Array.isArray(p && p.contactEmails) ? p.contactEmails : []).map((e) => ({ email: firstEmail(e.email), main: !!Number(e.is_main) })).filter((e) => e.email);
export const phonesOf = (p) => (Array.isArray(p && p.contactPhones) ? p.contactPhones : []).map((x) => ({ phone: s(x.phone), type: s(x.type), main: !!Number(x.is_main) })).filter((x) => onlyDigits(x.phone).length >= 8);

// ---------- empresas ----------
export function companyName(c) { return s(c.company_name) || s(c.name); }
export const isUsableCompany = (c) => !!c && !!companyName(c) && !isPlaceholder(companyName(c)) || (!!c && onlyDigits(c.cnpj).length === 14);

export function companyRows(ctx) {
  return [...ctx.companies.values()].map((c) => {
    const name = companyName(c);
    const cnae = c.cnae_id ? ctx.cnaes.get(String(c.cnae_id)) : null;
    const emails = emailsOf(c);
    const phones = phonesOf(c);
    const owner = c.owner_id ? ctx.users.get(String(c.owner_id)) : null;
    const isClient = !!s(c.customer_at) || !!Number(c.is_client);
    return {
      pid: String(c.id), usable: isUsableCompany(c),
      row: {
        legalName: name, tradeName: s(c.name) && personNameKey(c.name) !== personNameKey(name) ? s(c.name) : '', cnpj: s(c.cnpj), website: s(c.website),
        segment: (c.segment_id && ctx.segments.get(String(c.segment_id)) ? ctx.segments.get(String(c.segment_id)).name : '') || (cnae ? s(cnae.description) : ''),
        cnae: cnae ? `${s(cnae.code)} - ${s(cnae.description)}` : '', city: s(c.city && c.city.name), state: s(c.city && c.city.uf),
        relationship: isClient ? 'cliente' : 'prospect', clientSince: toDate(c.customer_at), ownerName: owner ? s(owner.name) : '',
        phone: phones.map((x) => x.phone).join(' / '), contactEmail: (emails.find((e) => e.main) || emails[0] || { email: firstEmail(c.email_nf) }).email || '',
        zipCode: s(c.address_postal_code) || s(c.cep), street: s(c.address), streetNumber: s(c.address_number), complement: s(c.address_complement), district: s(c.district),
        foundedAt: toDate(c.foundation_at), shareCapital: c.social_capital == null ? '' : String(c.social_capital),
      },
      extra: [customFieldsText(c), s(c.observation) && `Observação no PipeRun: ${htmlToText(c.observation)}`].filter(Boolean).join('\n'),
    };
  });
}

// ---------- contatos ----------
const splitName = (full) => { const parts = s(full).split(/\s+/).filter(Boolean); return { firstName: parts.shift() || '', lastName: parts.join(' ') }; };
export function contactRows(ctx) {
  return [...ctx.persons.values()].filter((p) => !p.deleted_at && s(p.name)).map((p) => {
    const emails = emailsOf(p); const phones = phonesOf(p);
    const wa = phones.find((x) => /whats/i.test(x.type));
    const main = phones.filter((x) => x !== wa);
    const { firstName, lastName } = splitName(p.name);
    return {
      pid: String(p.id), companyPid: p.company_id ? String(p.company_id) : '',
      row: { firstName, lastName, jobTitle: s(p.job_title), email: (emails.find((e) => e.main) || emails[0] || {}).email || '', phone: main.map((x) => x.phone).join(' / '), whatsapp: wa ? wa.phone : '', linkedin: s(p.linkedin) },
      extraEmails: Math.max(0, emails.length - 1), observation: htmlToText(p.observation),
    };
  });
}

// ---------- negócios ----------
export function dealSituation(d) {
  if (Number(d.deleted)) return 'Lixeira';
  if (Number(d.status) === 1) return 'Ganha';
  if (Number(d.status) === 3) return 'Perdida';
  return Number(d.freezed) ? 'Congelada' : 'Aberta';
}

function daysSince(ts, todayISO) {
  const d = toDate(ts);
  if (!d) return '';
  const n = Math.round((Date.parse(`${todayISO}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000);
  return String(Math.max(0, n));
}

// Plano de negócios: linhas para o importador de negócios + as empresas provisórias que precisam existir antes + dicas de ordem das etapas.
export function dealPlan(ctx, todayISO) {
  const rows = []; const provisional = new Map(); const stats = { total: 0, live: 0, withCompany: 0, provisionalFromPerson: 0, provisionalFromTitle: 0, trashed: 0 };
  const personCompany = new Map();
  for (const d of ctx.deals.values()) {
    stats.total += 1;
    const sit = dealSituation(d);
    if (sit === 'Lixeira') { stats.trashed += 1; continue; }
    stats.live += 1;
    const pipe = ctx.pipelines.get(String(d.pipeline_id)); const stage = ctx.stages.get(String(d.stage_id));
    const comp = d.company_id ? ctx.companies.get(String(d.company_id)) : null;
    const person = d.person_id ? ctx.persons.get(String(d.person_id)) : null;
    const owner = d.owner_id ? ctx.users.get(String(d.owner_id)) : (d.owner || null);
    const title = s(d.title) || (comp ? companyName(comp) : '') || (person ? s(person.name) : '') || `Negócio ${d.id}`;
    let companyNameForRow = ''; let companyCnpj = ''; let provisionalKey = '';
    if (comp && isUsableCompany(comp)) {
      stats.withCompany += 1; companyNameForRow = companyName(comp); companyCnpj = s(comp.cnpj);
    } else {
      const fromPerson = person && person.company_id && ctx.companies.get(String(person.company_id));
      if (fromPerson && isUsableCompany(fromPerson)) { stats.withCompany += 1; companyNameForRow = companyName(fromPerson); companyCnpj = s(fromPerson.cnpj); }
      else {
        const nm = person && s(person.name) && !isPlaceholder(person.name) ? s(person.name) : (isPlaceholder(title) ? `Negócio ${d.id}` : title);
        if (person && s(person.name) && !isPlaceholder(person.name)) stats.provisionalFromPerson += 1; else stats.provisionalFromTitle += 1;
        provisionalKey = companyNameKey(nm); companyNameForRow = nm;
        const e = provisional.get(provisionalKey) || { key: provisionalKey, name: nm, personPids: new Set(), dealPids: [], fromPerson: !!(person && s(person.name)) };
        if (person) e.personPids.add(String(person.id));
        e.dealPids.push(String(d.id)); provisional.set(provisionalKey, e);
      }
    }
    if (person) personCompany.set(String(person.id), { name: companyNameForRow, cnpj: companyCnpj });
    const lr = Number(d.status) === 3 ? mapLostReason((ctx.lostReasons.get(String(d.lost_reason_id)) || {}).name) : null;
    const props = ctx.proposalsByDeal.get(String(d.id)) || [];
    const mrr = Number(d.value_mrr) > 0 ? `MRR no PipeRun: ${fmtMoney(d.value_mrr)}` : '';
    const cf = customFieldsText(d);
    const desc = [htmlToText(d.description), mrr, cf && `Campos do PipeRun:\n${cf}`, provisionalKey ? 'Empresa provisória criada na migração do PipeRun: completar o cadastro (razão social e CNPJ).' : ''].filter(Boolean).join('\n\n');
    const ev = emailsOf(person || {});
    rows.push({
      pid: String(d.id), externalId: s(d.hash) || `piperun-${d.id}`, title, pipelineName: s(pipe && pipe.name), stageName: s(stage && stage.name), situation: sit, value: d.value == null ? '' : String(d.value),
      createdAt: toDate(d.created_at), closedAt: toDate(d.closed_at), stageDays: daysSince(d.last_stage_updated_at || d.stage_changed_at || d.created_at, todayISO),
      ownerName: s(owner && owner.name), ownerEmail: s(owner && owner.email), source: s((ctx.origins.get(String(d.origin_id)) || {}).name), notes: htmlToText(d.observation), description: desc, tags: '',
      companyCnpj, companyName: companyNameForRow, personName: person ? s(person.name) : '', personEmail: (ev.find((e) => e.main) || ev[0] || {}).email || '',
      lostReasonKey: lr ? lr.key : '', lostDetail: lr ? lr.detail : '', provisional: !!provisionalKey, proposals: props.length,
    });
  }
  const stageHints = {};
  for (const p of ctx.pipelines.values()) {
    const list = [...ctx.stages.values()].filter((x) => String(x.pipeline_id) === String(p.id)).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => s(x.name));
    stageHints[personNameKey(p.name)] = list;
  }
  return { rows, provisional: [...provisional.values()].map((e) => ({ ...e, personPids: [...e.personPids] })), personCompany, stageHints, stats };
}

// ---------- notas, propostas, atividades, arquivos ----------
const STATUS_PROP = { 0: 'aberta', 1: 'aprovada', 2: 'negada', 3: 'cancelada', 4: 'aguardando assinatura', 5: 'assinada' };
export function noteRows(ctx) {
  const rows = [];
  const raw = ctx.raw.notes || [];
  for (const n of raw) {
    const text = htmlToText(n.text);
    if (!text) continue;
    const u = n.user_id ? ctx.users.get(String(n.user_id)) : null;
    rows.push({ pid: `note:${n.id}`, kind: 'note', dealPid: n.deal_id ? String(n.deal_id) : '', companyPid: n.company_id ? String(n.company_id) : '', personPid: n.person_id ? String(n.person_id) : '',
      text, createdAt: toTs(n.created_at), authorName: s(n.user_name) || (u ? s(u.name) : ''), authorEmail: u ? s(u.email) : '' });
  }
  for (const p of ctx.raw.proposals || []) {
    const items = (p.items || []).map((i) => `${s(i.product_name || (i.item && i.item.name))} ×${Number(i.quantity) || 1} (${fmtMoney(i.value)})`).join('; ');
    const text = [`Proposta ${s(p.name) || p.id} (PipeRun) — ${STATUS_PROP[p.status] || `situação ${p.status}`}.`, Number(p.value) > 0 ? `Valor: ${fmtMoney(p.value)}.` : '', Number(p.value_mrr) > 0 ? `MRR: ${fmtMoney(p.value_mrr)}.` : '', items && `Itens: ${items}.`, p.expiration_date && `Validade: ${toDate(p.expiration_date)}.`].filter(Boolean).join(' ');
    rows.push({ pid: `proposal:${p.id}`, kind: 'proposal', dealPid: p.deal_id ? String(p.deal_id) : '', companyPid: '', personPid: '', text, createdAt: toTs(p.created_at), authorName: '', authorEmail: '' });
  }
  return rows;
}

// O PipeRun grava prioridade 3 em todas as atividades desta conta (não diferencia): vira "normal"; só 1 e 2 mudam.
const PRIORITY = { 1: 'high', 2: 'normal', 3: 'normal' };
export function activityRows(ctx) {
  return (ctx.raw.activities || []).map((a) => {
    const t = ctx.activityTypes.get(String(a.activity_type_id));
    const u = a.owner_id ? ctx.users.get(String(a.owner_id)) : null;
    const status = Number(a.status);
    const due = toDate(a.start_at) || toDate(a.delivery_date) || toDate(a.created_at);
    return {
      pid: String(a.id), dealPid: a.deal_id ? String(a.deal_id) : '', title: s(a.title) || (t ? s(t.name) : 'Atividade'), activityType: mapActivityType(t && t.name), typeName: t ? s(t.name) : '',
      description: htmlToText(a.description), dueDate: due, dueTime: toTime(a.start_at), priority: PRIORITY[Number(a.priority)] || 'normal',
      state: status === 2 ? 'done' : status === 4 ? 'cancelled' : 'open', completedAt: toTs(a.delivery_date), createdAt: toTs(a.created_at),
      outcome: status === 4 ? 'Não compareceu (no-show no PipeRun).' : '', ownerName: u ? s(u.name) : '', ownerEmail: u ? s(u.email) : '',
    };
  });
}

export const DOC_FORMATS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'csv', 'txt']);
const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', txt: 'text/plain' };
export function fileRows(ctx) {
  const all = ctx.raw.files || [];
  const docs = []; const skipped = {};
  for (const f of all) {
    const fmt = s(f.format).toLowerCase();
    if (!f.deal_id) { skipped['sem negócio'] = (skipped['sem negócio'] || 0) + 1; continue; }
    if (!DOC_FORMATS.has(fmt)) { skipped[fmt || 'sem formato'] = (skipped[fmt || 'sem formato'] || 0) + 1; continue; }
    const base = s(f.name) || `arquivo-${f.id}`;
    docs.push({ pid: String(f.id), dealPid: String(f.deal_id), url: s(f.url), name: (base.toLowerCase().endsWith(`.${fmt}`) ? base : `${base}.${fmt}`).slice(0, 200), mime: MIME[fmt] || 'application/octet-stream', format: fmt, createdAt: toTs(f.created_at) });
  }
  return { docs, skipped, total: all.length };
}

// Notas e propostas que PODEM entrar: as presas a um negócio só entram se o negócio entra (a lixeira do PipeRun fica de fora, com tudo o que era dele).
export function importableNotes(notes, plan) {
  const live = new Set(plan.rows.map((r) => r.pid));
  return notes.filter((n) => (n.dealPid ? live.has(n.dealPid) : !!(n.companyPid || n.personPid)));
}

// ---------- histórico real (API `histories`): percurso do negócio pelas etapas e eventos da linha do tempo ----------
const parseJson = (v) => { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; } };
const splitPath = (v) => { const parts = s(v).split('\u00bb').map((x) => x.trim()); return parts.length > 1 ? { pipeline: parts[0], stage: parts.slice(1).join(' \u00bb ') } : { pipeline: '', stage: parts[0] || '' }; };
const money = (n) => (n === null || n === undefined || n === '' ? 'sem valor' : fmtMoney(n));
const utc = (v) => { const t = Date.parse(s(v)); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

// Por negócio: `events` (criado, mudou de etapa/funil, ganho, perdido — com funil de cada lado, deduzido de trás para frente a partir do funil atual) e `timeline` (valor, MRR, origem, contato, congelado).
export function historyEvents(ctx, plan) {
  const finalPipe = new Map(plan.rows.map((r) => [r.pid, r.pipelineName]));
  const byDeal = new Map();
  for (const h of ctx.raw.histories || []) {
    if (!h.deal_id || !finalPipe.has(String(h.deal_id))) continue;
    const k = String(h.deal_id); (byDeal.get(k) || byDeal.set(k, []).get(k)).push(h);
  }
  const out = new Map();
  for (const [pid, list] of byDeal) {
    list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || Number(a.id) - Number(b.id));
    const actor = (h) => (h.user_id ? (ctx.userNames.get(String(h.user_id)) || `Usuário ${h.user_id} (PipeRun)`) : 'PipeRun');
    const events = []; const timeline = [];
    for (const h of list) {
      const d = parseJson(h.description) || {}; const at = utc(h.date); if (!at) continue;
      const base = { at, actorName: actor(h), actorUserId: h.user_id ? String(h.user_id) : '' };
      if (h.type === 22) events.push({ ...base, kind: 'created', from: null, to: { stage: s(d.posicao) } });
      else if (h.type === 10) events.push({ ...base, kind: 'stage', from: { stage: s(d.old) }, to: { stage: s(d.new) } });
      else if (h.type === 30) events.push({ ...base, kind: 'pipeline', from: splitPath(d.old), to: splitPath(d.new) });
      else if (h.type === 8) events.push({ ...base, kind: 'won', from: { stage: s(d.old) }, to: null });
      else if (h.type === 9) events.push({ ...base, kind: 'lost', from: { stage: s(d.old) }, to: null, reason: htmlToText(d.motivo) });
      else if (h.type === 21) timeline.push({ ...base, type: 'deal_value_changed', summary: `alterou o valor do negócio de ${money(d.old)} para ${money(d.new)} (PipeRun).` });
      else if (h.type === 79) timeline.push({ ...base, type: 'deal_mrr_changed', summary: `alterou o MRR do negócio de ${money(d.old)} para ${money(d.new)} (PipeRun).` });
      else if (h.type === 20) timeline.push({ ...base, type: 'deal_source_changed', summary: s(d.old) ? `mudou a origem do negócio de "${s(d.old)}" para "${s(d.new)}" (PipeRun).` : `definiu a origem do negócio como "${s(d.new)}" (PipeRun).` });
      else if (h.type === 18) timeline.push({ ...base, type: 'deal_contact_changed', summary: s(d.pessoa_old) ? `trocou a pessoa do negócio de "${s(d.pessoa_old)}" para "${s(d.pessoa_new)}" (PipeRun).` : `vinculou a pessoa "${s(d.pessoa_new)}" ao negócio (PipeRun).` });
      else if (h.type === 55) timeline.push({ ...base, type: Number(d.new) === 1 ? 'deal_frozen' : 'deal_unfrozen', summary: `${Number(d.new) === 1 ? 'congelou' : 'descongelou'} o negócio${htmlToText(d.comment) ? `: ${htmlToText(d.comment)}` : ''} (PipeRun).` });
    }
    // Negócio duplicado no PipeRun grava um 2º "criado" no meio do percurso: vira uma mudança a partir da etapa em que ele estava.
    for (let i = 1; i < events.length; i += 1) {
      const e = events[i]; const prev = events[i - 1];
      if (e.kind === 'created') { e.kind = 'stage'; e.from = { stage: prev.kind === 'won' ? 'Ganho' : prev.kind === 'lost' ? 'Perdido' : (prev.to ? prev.to.stage : '') }; }
    }
    let cur = finalPipe.get(pid) || '';
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i]; e.toPipeline = cur;
      if (e.kind === 'pipeline') { e.fromPipeline = e.from.pipeline; cur = e.from.pipeline || cur; } else e.fromPipeline = cur;
      if (e.kind === 'pipeline') { e.toPipeline = e.to.pipeline || e.toPipeline; }
    }
    if (events.length || timeline.length) out.set(pid, { events, timeline });
  }
  return out;
}
