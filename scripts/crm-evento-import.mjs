#!/usr/bin/env node
// Importa os leads de um evento (saida/*.json do consolidar_leads.py) para o CRM, pela chave de API (/api/connect/crm), como "Claude Code".
// REPETÍVEL: a chave é o id L… do lead, guardado em crm_deals.external_id (origem "evento-2026-10-22"). Rodar de novo atualiza, não duplica.
//
//   node scripts/crm-evento-import.mjs                      # PRÉVIA (não grava nada) + relatório
//   node scripts/crm-evento-import.mjs --apply              # grava
//   node scripts/crm-evento-import.mjs --dir <pasta> --interacoes <pasta-com-jsons> --apply
//
// URL e chave: PRICETAX_URL / PRICETAX_CRM_TOKEN no ambiente ou no .env da pasta atual (lido linha a linha, nunca "sourced"), ou --url / --token.
// Regras (docs/CRM_IMPORTACAO_EVENTO.md): fato × estimativa × não identificado ficam separados; nenhum valor de venda é inventado;
// contato que já existe (mesmo telefone/e-mail E mesmo primeiro nome) é vinculado, não recriado; cadência de etapa NÃO é disparada.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SOURCE = 'Evento 22–23/10/2026';
export const EXT_SOURCE = 'evento-2026-10-22';
export const CHANNEL_TAG = 'Canal: Estande';
export const DEFAULT_PIPELINE = 'Tributaristas e Contadores';
// estágio do evento (prefixo numérico de `estagio`) → etapa do funil
export const STAGE_MAP = { 7: 'Leads', 6: 'Mapeamento', 5: 'Acesso Teste', 4: 'Conexão', 3: 'Conexão', 2: 'Negociação', 1: 'Contrato' };
const BLOCK_START = '══ DADOS DO EVENTO 22–23/10/2026 (importação automática; é reescrito a cada importação) ══';
const BLOCK_END = '══ fim dos dados do evento ══';
const MANAGED_TAG = /^(Evento 22–23\/10\/2026|Canal: Estande|Estande: .+|Quente no evento|Prioridade est\. [ABC]|Brinde (registrado|possível) \(est\.\)|Teste Tintax \(est\.\)|Grupo no evento|Venda registrada \(planilha\)|Fechamento sinalizado \(planilha\))$/;

// ---------------------------------------------------------------- utilidades puras
export const stripAccents = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = (v) => stripAccents(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SUFFIXES = new Set(['ltda', 'sa', 's', 'a', 'eireli', 'me', 'epp', 'ss', 'cia', 'companhia', 'do', 'da', 'de', 'dos', 'das', 'e', 'brasil']);
export function companyKey(v) {
  const words = norm(v).split(' ').filter(Boolean);
  const kept = words.filter((w) => !SUFFIXES.has(w));
  return (kept.length ? kept : words).join(' ');
}
export const phoneKey = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-9) : ''; };
export const emailKey = (e) => String(e || '').trim().toLowerCase();
export const firstNameKey = (n) => norm(String(n || '').trim().split(/\s+/)[0] || '');
export const stageNumber = (estagio) => { const m = /^(\d)/.exec(String(estagio || '')); return m ? Number(m[1]) : 7; };
export const splitName = (full) => { const [first, ...rest] = String(full || '').trim().split(/\s+/); return { first: first || '', last: rest.join(' ') }; };
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}${iso.length > 10 ? ` ${iso.slice(11, 16)}` : ''}` : '');
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function leadTags(l, group) {
  const t = [SOURCE, CHANNEL_TAG];
  String(l.estandes || '').split('+').map((s) => s.trim()).filter(Boolean).forEach((s) => t.push(`Estande: ${s}`));
  if (l.temperatura === 'Quente') t.push('Quente no evento');
  if (l.prioridade_est) t.push(`Prioridade est. ${l.prioridade_est}`);
  if (l.brinde === 'Registrado') t.push('Brinde registrado (est.)');
  if (l.brinde === 'Possível') t.push('Brinde possível (est.)');
  if (l.teste_tintax === 'Sim') t.push('Teste Tintax (est.)');
  if (group) t.push('Grupo no evento');
  if (l.vendido === 'Sim') t.push('Venda registrada (planilha)');
  if (l.fechar_no_evento === 'Sim' || l.fechou_na_nota === 'Sim') t.push('Fechamento sinalizado (planilha)');
  return [...new Set(t)];
}

// Bloco de texto do negócio: o que é FATO, o que é ESTIMATIVA e o que NÃO foi identificado. Nunca mistura.
export function eventBlock(l, group) {
  const f = [];
  f.push(`- Captado em ${ddmm(l.primeira_captura)} (${l.dia || '—'}, ${l.hora || '—'}) · ${l.capturas || 1} captura(s) · estande(s): ${l.estandes || '—'}`);
  f.push(`- Temperatura anotada: ${l.temperatura || '—'}${l.demo ? ` · demonstração: ${l.demo}` : ''}`);
  if (l.cargo) f.push(`- Cargo: ${l.cargo}`);
  if (l.anotacoes) f.push(`- Anotações do estande: ${clip(l.anotacoes, 420)}`);
  if (l.follow_up) f.push(`- Data de contato anotada: ${ddmm(l.follow_up)}${l.responsavel_citado ? ` · responsável citado: ${l.responsavel_citado}` : ''}`);
  if (l.fechar_no_evento) f.push(`- Fechar no evento: ${l.fechar_no_evento}`);
  if (l.fechou_na_nota) f.push(`- Nota diz que fechou: ${l.fechou_na_nota} (confirmar)`);
  if (l.vendido) f.push(`- Vendido: ${l.vendido}${l.vendido_em ? ` em ${ddmm(l.vendido_em)}` : ''}${l.produto_vendido ? ` · produto: ${l.produto_vendido}` : ''}${l.condicoes ? ` · condições: ${l.condicoes}` : ''}${l.vendido_por ? ` · por: ${l.vendido_por}` : ''}`);
  if (l.precos_citados) f.push(`- Preço citado: ${l.precos_citados}`);
  if (l.regime_citado) f.push(`- Regime citado: ${l.regime_citado}`);
  const e = [];
  if (l.uf) e.push(`- UF pelo DDD do telefone: ${l.uf}`);
  if (l.decisor) e.push(`- Decisor (pelo cargo): ${l.decisor}`);
  if (l.interesses) e.push(`- Interesses (pelas anotações): ${l.interesses}`);
  if (l.brinde) e.push(`- Brinde: ${l.brinde}${l.brindes ? ` — ${l.brindes}` : ''}${l.brinde_data ? ` (${l.brinde_data})` : ''}`);
  if (l.teste_tintax) e.push(`- Teste do Tintax: ${l.teste_tintax}`);
  e.push(`- Estágio no evento: ${l.estagio} · pontuação ${l.score_est} · prioridade ${l.prioridade_est}`);
  if (l.urgencia) e.push(`- Urgência: ${l.urgencia}`);
  if (l.proximo_passo) e.push(`- Próximo passo sugerido: ${l.proximo_passo}`);
  if (l.valor_potencial_est != null) e.push(`- Valor potencial estimado: R$ ${l.valor_potencial_est}`);
  if (group) e.push(`- Empresa com ${group.participantes} participantes no evento (${group.estandes}); oportunidade sugerida: ${group.oportunidade_est || '—'}`);
  const n = [];
  if (!l.valor_venda) n.push('- Valor de venda: não informado (a planilha não traz valor; nada foi preenchido)');
  if (!l.email) n.push('- E-mail: não informado');
  if (!l.telefone) n.push('- Telefone: não informado');
  if (!l.empresa) n.push('- Empresa: não informada (empresa provisória criada com o nome da pessoa)');
  if (!l.cargo) n.push('- Cargo: não informado');
  const body = [BLOCK_START, `Origem: ${SOURCE} · Canal: Estande · Estande(s): ${l.estandes || '—'} · origem_id: ${l.id}`,
    'FATOS (copiados da planilha do evento)', ...f, 'ESTIMATIVAS (regra automática do consolidar_leads.py — NÃO são dados confirmados)', ...e,
    ...(n.length ? ['NÃO IDENTIFICADO', ...n] : []), BLOCK_END].join('\n');
  return body.length > 2900 ? `${body.slice(0, 2860)}\n…\n${BLOCK_END}` : body;
}
export function mergeBlock(current, block) {
  const cur = String(current || '');
  const i = cur.indexOf('══ DADOS DO EVENTO');
  const j = cur.indexOf(BLOCK_END);
  if (i >= 0 && j > i) return `${cur.slice(0, i)}${block}${cur.slice(j + BLOCK_END.length)}`.trim();
  return cur ? `${cur.trim()}\n\n${block}` : block;
}
export const captureNote = (c) => `[evento ${c.cap_id}] Captura no estande ${c.estande} em ${ddmm(c.capturado_em)} — tipo: ${c.tipo || '—'}${c.produto ? ` · produto/tema: ${c.produto}` : ''}${c.nota ? `\nNota: ${clip(c.nota, 600)}` : ''}\n(Fato registrado na planilha do evento, importado automaticamente.)`;
export const giftNote = (l) => `[evento brinde ${l.id}] Brinde (ESTIMATIVA: ${l.brinde}${l.brinde === 'Registrado' ? ' — a nota diz que ganhou/roleta/brinde/cortesia' : ' — item citado sem dizer que foi entregue'}): ${l.brindes || 'item não descrito'}${l.brinde_data ? ` · data ${l.brinde_data}` : ''}.\nEntrega não confirmada pelo sistema; conferir antes de contar como entregue.`;
export const interactionNote = (d) => `[evento int ${d.id}] Interação da equipe (Registro Comercial) — ${d.tipo || 'interação'} em ${ddmm(d.data)}${d.produto ? ` · produto: ${d.produto}` : ''}${d.valor != null && d.valor !== '' ? ` · valor informado pela equipe: R$ ${d.valor}${d.recorrencia ? ` (${d.recorrencia})` : ''}` : ''}${d.status_proposta ? ` · proposta: ${d.status_proposta}` : ''}\n${clip(d.resumo, 1500)}${d.proxima_acao || d.proxima_data ? `\nPróxima ação: ${d.proxima_acao || '—'}${d.proxima_data ? ` em ${ddmm(d.proxima_data)}` : ''}` : ''}\n(Registrado por ${d.autor || 'alguém da equipe'} no Registro Comercial; o valor NÃO foi aplicado ao valor do negócio.)`;
export const groupNote = (g, leadsOfGroup) => `[evento grupo ${g.id}] Empresa com ${g.participantes} participantes no evento 22–23/10/2026 (${g.estandes}) — oportunidade de cross-sell.\nParticipantes: ${g.nomes}\nQuentes: ${g.quentes} · decisores (est.): ${g.decisores} · brindes (est.): ${g.brindes}\nInteresses: ${g.interesses || '—'}\nMelhor estágio no evento: ${g.melhor_estagio}\nOportunidade sugerida (ESTIMATIVA): ${g.oportunidade_est || '—'}\nNegócios no CRM: ${leadsOfGroup.length}.`;

// ---------------------------------------------------------------- leitura dos arquivos do evento
export function loadEvent(dir) {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'saida', f), 'utf8'));
  const leads = rd('leads.json');
  const capturas = rd('capturas.json');
  const empresas = rd('empresas.json');
  const ids = new Set();
  for (const l of leads) {
    if (!/^L[0-9a-f]{8}$/.test(l.id || '')) throw new Error(`Id de lead fora do contrato: ${l.id}`);
    if (ids.has(l.id)) throw new Error(`Id de lead repetido: ${l.id}`);
    ids.add(l.id);
  }
  return { leads, capturas, empresas, importacoes: rd('importacoes.json') };
}
export function loadInteractions(p) {
  if (!p) return [];
  const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p, { recursive: true }).filter((f) => String(f).endsWith('.json')).map((f) => path.join(p, String(f))) : [p];
  const out = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const docs = Array.isArray(j) ? j : (j.documents || j.docs || (j.lead_id ? [j] : []));
    docs.forEach((d) => { const body = d.data && d.data.lead_id ? d.data : d; if (body.lead_id) out.push({ id: d.id || d.doc_id || body.id || path.basename(f, '.json'), ...body }); });
  }
  return out;
}

// ---------------------------------------------------------------- cliente da API
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^(PRICETAX_URL|PRICETAX_CRM_TOKEN)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
// A chave tem teto de 120 requisições por minuto (server/connect.js). O cliente se auto-limita (~107/min) e, se mesmo assim receber 429, espera a janela virar.
export function makeApi(base, token, { minGapMs = 560, waitOn429Ms = 20000 } = {}) {
  const root = `${String(base).replace(/\/$/, '')}/api/connect/crm`;
  let calls = 0; let last = 0;
  async function api(method, p, body) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const gap = last + minGapMs - Date.now();
      if (gap > 0) await new Promise((res) => setTimeout(res, gap));
      last = Date.now();
      calls += 1;
      const r = await fetch(`${root}${p}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, waitOn429Ms)); continue; }
      if (r.status >= 502) { await new Promise((res) => setTimeout(res, 1500 * (attempt + 1))); continue; }
      const text = await r.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text.slice(0, 200) }; }
      if (!r.ok) { const e = new Error(`${method} ${p} → ${r.status}: ${json.message || text.slice(0, 200)}`); e.status = r.status; e.json = json; throw e; }
      return json;
    }
    throw new Error(`${method} ${p}: servidor indisponível ou limite de requisições após 8 tentativas`);
  }
  api.calls = () => calls;
  return api;
}
async function pageAll(api, p, key, size) {
  const out = [];
  for (let off = 0; ; off += size) {
    const j = await api('GET', `${p}${p.includes('?') ? '&' : '?'}limit=${size}&offset=${off}`);
    const items = j[key] || j.items || [];
    out.push(...items);
    if (items.length < size || out.length >= (j.total || 0)) break;
  }
  return out;
}

// ---------------------------------------------------------------- planejamento (só leitura) e execução
export async function snapshot(api, pipelineName) {
  const { pipelines } = await api('GET', '/pipelines');
  const pipe = pipelines.find((p) => norm(p.name) === norm(pipelineName));
  if (!pipe) throw new Error(`Funil "${pipelineName}" não existe. Funis: ${pipelines.map((p) => p.name).join(', ')}`);
  const stageByName = new Map(pipe.stages.map((s) => [s.name, s]));
  for (const nm of new Set(Object.values(STAGE_MAP))) if (!stageByName.get(nm) || stageByName.get(nm).kind !== 'open') throw new Error(`Etapa em aberto "${nm}" não existe no funil "${pipe.name}".`);
  const contacts = await pageAll(api, '/contacts', 'items', 500);
  const companies = await pageAll(api, '/companies', 'items', 200);
  const openDeals = await pageAll(api, '/deals?status=open', 'items', 200);
  const eventDeals = await pageAll(api, `/deals?status=all&externalSource=${encodeURIComponent(EXT_SOURCE)}`, 'items', 200);
  return { pipe, stageByName, contacts, companies, openDeals, eventDeals };
}

export function buildIndex(snap) {
  const byPhone = new Map(); const byEmail = new Map();
  const add = (m, k, c) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(c); };
  snap.contacts.forEach((c) => { add(byPhone, phoneKey(c.phone), c); add(byPhone, phoneKey(c.whatsapp), c); add(byEmail, emailKey(c.email), c); });
  const companyByKey = new Map();
  snap.companies.forEach((c) => { const k = companyKey(c.legalName); if (k && !companyByKey.has(k)) companyByKey.set(k, c); });
  const dealByExt = new Map(snap.eventDeals.map((d) => [d.externalId, d]));
  const openByContact = new Map();
  snap.openDeals.filter((d) => d.externalSource !== EXT_SOURCE).forEach((d) => { if (d.primaryContactId) { if (!openByContact.has(d.primaryContactId)) openByContact.set(d.primaryContactId, []); openByContact.get(d.primaryContactId).push(d); } });
  return { byPhone, byEmail, companyByKey, dealByExt, openByContact };
}
export function findExistingContact(idx, l) {
  const fk = firstNameKey(l.nome);
  const cands = [...(idx.byPhone.get(phoneKey(l.telefone)) || []), ...(idx.byEmail.get(emailKey(l.email)) || [])];
  const seen = new Set();
  for (const c of cands) { if (seen.has(c.id)) continue; seen.add(c.id); if (fk && firstNameKey(c.firstName) === fk) return c; }
  return null;
}

export function planLead(l, idx, snap) {
  const num = stageNumber(l.estagio);
  const stageName = STAGE_MAP[num] || 'Leads';
  const ext = idx.dealByExt.get(l.id);
  if (ext) return { mode: 'update', lead: l, stageName, num, deal: ext };
  const contact = findExistingContact(idx, l);
  if (contact) {
    const open = (idx.openByContact.get(contact.id) || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (open[0]) return { mode: 'link', lead: l, stageName, num, contact, deal: open[0] };
    return { mode: 'create', linkedContact: true, lead: l, stageName, num, contact };
  }
  return { mode: 'create', lead: l, stageName, num, contact: null };
}

export async function run(opts) {
  const { api, event, interacoes = [], apply = false, pipelineName = DEFAULT_PIPELINE, only = null, log = () => {} } = opts;
  const t0 = Date.now();
  const snap = await snapshot(api, pipelineName);
  const idx = buildIndex(snap);
  const groupsById = new Map(event.empresas.map((g) => [g.id, g]));
  const leads = event.leads.filter((l) => !only || only.includes(l.id));
  const capsByLead = new Map();
  event.capturas.forEach((c) => { if (!capsByLead.has(c.lead_id)) capsByLead.set(c.lead_id, []); capsByLead.get(c.lead_id).push(c); });
  const intsByLead = new Map();
  interacoes.forEach((d) => { if (!intsByLead.has(d.lead_id)) intsByLead.set(d.lead_id, []); intsByLead.get(d.lead_id).push(d); });
  const rep = { startedAt: new Date().toISOString(), apply, pipeline: snap.pipe.name, total: leads.length, created: [], linked: [], updated: [], ignored: [], failed: [], companiesCreated: [], companiesReused: [], similarCompanies: [], groupsNoted: 0, notes: { captures: 0, gifts: 0, interactions: 0, groups: 0 }, activities: 0, stageCounts: {}, tagsApplied: 0 };
  const companyInRun = new Map(); // companyKey → company (criadas/lidas nesta execução)
  const leadsOfCompany = new Map();

  async function ensureCompany(l, plan) {
    if (plan.contact) return { id: plan.contact.companyId, reused: true, existing: true };
    const key = l.empresa ? companyKey(l.empresa) : '';
    if (key) {
      const hit = companyInRun.get(key) || idx.companyByKey.get(key);
      if (hit) { rep.companiesReused.push({ lead: l.id, empresa: l.empresa, company: hit.legalName }); return { id: hit.id, reused: true }; }
    }
    const legalName = l.empresa || `${l.nome} (empresa não informada)`;
    const sim = await api('POST', '/companies/check-duplicates', { legalName }).then((d) => (d.byName || []).map((x) => x.legalName || x.legal_name || x.name).filter(Boolean)).catch(() => []);
    if (sim.length) rep.similarCompanies.push({ lead: l.id, novo: legalName, parecidas: sim.slice(0, 3) });
    if (!apply) { const fake = { id: `novo:${key || l.id}`, legalName }; if (key) companyInRun.set(key, fake); rep.companiesCreated.push({ lead: l.id, legalName, provisional: !l.empresa }); return { id: fake.id, created: true, dry: true }; }
    const created = (await api('POST', '/companies', { legalName, relationship: 'prospect', source: SOURCE, ownerId: null, enteredAt: (l.primeira_captura || '').slice(0, 10) || undefined, force: true })).company;
    if (key) companyInRun.set(key, created);
    rep.companiesCreated.push({ lead: l.id, legalName, id: created.id, provisional: !l.empresa });
    return { id: created.id, created: true };
  }
  async function ensureContact(l, plan, companyId) {
    if (plan.contact) return plan.contact;
    if (!apply) return { id: `novo:${l.id}`, dry: true };
    const { first, last } = splitName(l.nome);
    const c = (await api('POST', '/contacts', { companyId, firstName: first, lastName: last, jobTitle: l.cargo || '', email: l.email || '', phone: l.telefone || '', linkedin: l.linkedin || '', force: true })).contact;
    return c;
  }
  async function syncTags(dealId, current, wanted) {
    const keep = (current || []).filter((t) => !MANAGED_TAG.test(t));
    const next = [...new Set([...keep, ...wanted])];
    const same = next.length === (current || []).length && next.every((t) => (current || []).includes(t));
    if (same) return false;
    await api('PUT', `/deals/${dealId}/tags`, { tags: next });
    rep.tagsApplied += 1;
    return true;
  }
  const hasMarker = (notes, marker) => (notes || []).find((n) => String(n.body || '').startsWith(marker));
  async function syncNotes(dealId, l, existingNotes, withDetail) {
    let added = 0;
    const need = [];
    (capsByLead.get(l.id) || []).forEach((c) => need.push({ marker: `[evento ${c.cap_id}]`, body: captureNote(c), kind: 'captures' }));
    if (l.brinde) need.push({ marker: `[evento brinde ${l.id}]`, body: giftNote(l), kind: 'gifts', refresh: true });
    (intsByLead.get(l.id) || []).forEach((d) => need.push({ marker: `[evento int ${d.id}]`, body: interactionNote(d), kind: 'interactions' }));
    for (const n of need) {
      const hit = hasMarker(existingNotes, n.marker);
      if (!hit) { if (apply) await api('POST', '/notes', { entityType: 'deal', entityId: dealId, body: n.body }); rep.notes[n.kind] += 1; added += 1; } else if (n.refresh && hit.body !== n.body) { if (apply) await api('PATCH', `/notes/${hit.id}`, { body: n.body }); added += 1; }
    }
    return added;
  }
  async function syncFollowUp(dealId, companyId, contactId, l, existingActs) {
    if (!l.follow_up || !/^\d{4}-\d{2}-\d{2}$/.test(l.follow_up)) return false;
    const title = `Contato combinado no evento${l.responsavel_citado ? ` (${l.responsavel_citado})` : ''}`;
    if ((existingActs || []).some((a) => a.title === title && a.dueDate === l.follow_up)) return false;
    if (apply) await api('POST', '/activities', { companyId, dealId, contactId: contactId || undefined, title, activityType: 'followup', dueDate: l.follow_up, description: `Data de contato anotada no estande (fato da planilha do evento). ${clip(l.anotacoes, 300)}`.trim(), ownerId: null });
    rep.activities += 1;
    return true;
  }

  let n = 0;
  for (const l of leads) {
    n += 1;
    try {
      if (!String(l.nome || '').trim()) { rep.ignored.push({ lead: l.id, motivo: 'sem nome na planilha' }); continue; }
      const group = l.empresa_grupo ? groupsById.get(l.empresa_grupo) : null;
      const plan = planLead(l, idx, snap);
      const stage = snap.stageByName.get(plan.stageName);
      rep.stageCounts[plan.stageName] = (rep.stageCounts[plan.stageName] || 0) + 1;
      const tags = leadTags(l, group);
      const block = eventBlock(l, group);
      const title = clip(l.empresa ? `${l.nome} · ${l.empresa}` : l.nome, 180);

      if (plan.mode === 'update') {
        const detail = await api('GET', `/deals/${plan.deal.id}`);
        const d = detail.deal;
        let changed = false;
        const newDesc = mergeBlock(d.description, block);
        if (newDesc !== (d.description || '')) { if (apply) await api('PATCH', `/deals/${d.id}`, { description: newDesc }); changed = true; }
        if (apply ? await syncTags(d.id, d.tags, tags) : (() => { const keep = (d.tags || []).filter((t) => !MANAGED_TAG.test(t)); const nx = [...new Set([...keep, ...tags])]; return !(nx.length === (d.tags || []).length && nx.every((t) => (d.tags || []).includes(t))); })()) changed = true;
        if ((await syncNotes(d.id, l, detail.notes)) > 0) changed = true;
        if (await syncFollowUp(d.id, d.companyId, d.primaryContactId, l, detail.activities)) changed = true;
        // etapa: só avança se o time não mexeu (o negócio ainda está na etapa que a importação anterior escolheu)
        const prevMatch = /Estágio no evento: (\d)/.exec(d.description || '');
        const prevStageName = prevMatch ? STAGE_MAP[Number(prevMatch[1])] : null;
        const target = stage;
        if (d.stageId !== target.id && d.status === 'open' && prevStageName && d.stageName === prevStageName && plan.num < Number(prevMatch[1])) {
          if (apply) await api('POST', `/deals/${d.id}/move`, { stageId: target.id });
          changed = true;
        }
        (changed ? rep.updated : rep.ignored).push(changed ? { lead: l.id, nome: l.nome, deal: d.id } : { lead: l.id, nome: l.nome, motivo: 'já estava igual' });
        continue;
      }

      if (plan.mode === 'link') {
        const d = plan.deal;
        const detail = await api('GET', `/deals/${d.id}`);
        let changed = false;
        if (apply ? await syncTags(d.id, detail.deal.tags, tags) : true) changed = true;
        const marker = `[evento ${l.id}]`;
        const body = `${marker} Este contato também esteve nos estandes do ${SOURCE}. Dados abaixo (fato × estimativa); o negócio e a etapa deste funil não foram alterados.\n${block}`.slice(0, 4900);
        const hit = hasMarker(detail.notes, marker);
        if (!hit) { if (apply) await api('POST', '/notes', { entityType: 'deal', entityId: d.id, body }); changed = true; } else if (hit.body !== body) { if (apply) await api('PATCH', `/notes/${hit.id}`, { body }); changed = true; }
        if ((await syncNotes(d.id, l, detail.notes)) > 0) changed = true;
        if (await syncFollowUp(d.id, detail.deal.companyId, plan.contact.id, l, detail.activities)) changed = true;
        rep.linked.push({ lead: l.id, nome: l.nome, contato: plan.contact.id, empresaCRM: plan.contact.companyName, negocioExistente: { id: d.id, titulo: d.title, etapa: d.stageName, funil: d.pipelineId === snap.pipe.id ? snap.pipe.name : 'outro funil' }, mudou: changed });
        continue;
      }

      // create
      const company = await ensureCompany(l, plan);
      const contact = await ensureContact(l, plan, company.id);
      let dealId = `novo:${l.id}`;
      if (apply) {
        const deal = (await api('POST', '/deals', { companyId: company.id, title, pipelineId: snap.pipe.id, stageId: stage.id, primaryContactId: contact.id, source: SOURCE, description: block, ownerId: null, externalSource: EXT_SOURCE, externalId: l.id, skipCadence: true })).deal;
        dealId = deal.id;
        await syncTags(deal.id, [], tags);
        await syncNotes(deal.id, l, []);
        await syncFollowUp(deal.id, company.id, contact.id, l, []);
        idx.dealByExt.set(l.id, deal);
      } else { await syncNotes(dealId, l, []); await syncFollowUp(dealId, company.id, contact.id, l, []); }
      (leadsOfCompany.get(company.id) || leadsOfCompany.set(company.id, []).get(company.id)).push({ id: dealId, lead: l, group });
      const rec = { lead: l.id, nome: l.nome, empresa: l.empresa || '(provisória)', etapa: plan.stageName, deal: dealId, contatoExistente: !!plan.linkedContact };
      (plan.linkedContact ? rep.linked : rep.created).push(plan.linkedContact ? { ...rec, contato: plan.contact.id, empresaCRM: plan.contact.companyName, negocioExistente: null, mudou: true } : rec);
      if (n % 25 === 0) log(`${n}/${leads.length}…`);
    } catch (e) {
      rep.failed.push({ lead: l.id, nome: l.nome, erro: e.message });
    }
  }

  // grupos de empresas (cross-sell): uma nota por empresa do CRM que reúne 2+ pessoas do evento
  const groups = event.empresas.filter((g) => !only || event.leads.some((l) => l.empresa_grupo === g.id && only.includes(l.id)));
  for (const g of groups) {
    try {
      const members = event.leads.filter((l) => l.empresa_grupo === g.id);
      const keyed = companyKey(g.empresa);
      const comp = companyInRun.get(keyed) || idx.companyByKey.get(keyed);
      if (!comp || String(comp.id).startsWith('novo:')) { if (comp) rep.groupsNoted += 1; continue; }
      const marker = `[evento grupo ${g.id}]`;
      const body = groupNote(g, members).slice(0, 4900);
      const ov = await api('GET', `/companies/${comp.id}`);
      const hit = (ov.notes || []).find((x) => String(x.body || '').startsWith(marker));
      if (!hit) { if (apply) await api('POST', '/notes', { entityType: 'company', entityId: comp.id, body }); rep.notes.groups += 1; } else if (hit.body !== body) { if (apply) await api('PATCH', `/notes/${hit.id}`, { body }); rep.notes.groups += 1; }
      rep.groupsNoted += 1;
    } catch (e) { rep.failed.push({ grupo: g.id, erro: e.message }); }
  }
  rep.finishedAt = new Date().toISOString();
  rep.seconds = Math.round((Date.now() - t0) / 1000);
  rep.apiCalls = api.calls();
  return rep;
}

export function reportMarkdown(rep, event) {
  const L = [];
  L.push(`# Importação do ${SOURCE} para o CRM — ${rep.apply ? 'GRAVADA' : 'PRÉVIA (nada foi gravado)'}`, '', `Funil: **${rep.pipeline}** · ${rep.startedAt}`, '');
  L.push('| | |', '|---|---|', `| Leads lidos | ${rep.total} |`, `| Criados | ${rep.created.length} |`, `| Vinculados a registro existente | ${rep.linked.length} |`, `| Atualizados (reimportação) | ${rep.updated.length} |`, `| Ignorados | ${rep.ignored.length} |`, `| Falhas | ${rep.failed.length} |`, `| Empresas novas | ${rep.companiesCreated.length} (${rep.companiesCreated.filter((c) => c.provisional).length} provisórias, sem empresa na planilha) |`, `| Empresas já existentes reaproveitadas | ${rep.companiesReused.length} |`, `| Notas: capturas / brindes / interações / grupos | ${rep.notes.captures} / ${rep.notes.gifts} / ${rep.notes.interactions} / ${rep.notes.groups} |`, `| Atividades de contato combinado | ${rep.activities} |`, '');
  L.push('## Etapas (estágio do evento → etapa do funil)', '', ...Object.entries(rep.stageCounts).map(([k, v]) => `- ${k}: ${v}`), '');
  L.push('## Vinculados (já existiam no CRM)', '');
  rep.linked.forEach((x) => L.push(`- ${x.nome} (${x.lead}) → contato em **${x.empresaCRM || '—'}**${x.negocioExistente ? `; negócio existente "${x.negocioExistente.titulo}" (${x.negocioExistente.etapa}, ${x.negocioExistente.funil}) recebeu tag e nota` : '; sem negócio aberto — foi criado um negócio do evento ligado a ele'}`));
  if (!rep.linked.length) L.push('- Nenhum.');
  if (rep.similarCompanies.length) { L.push('', '## Empresas novas com nome parecido de outra existente (NÃO unidas — conferir)', ''); rep.similarCompanies.forEach((x) => L.push(`- "${x.novo}" ≈ ${x.parecidas.filter(Boolean).join('; ')}`)); }
  if (rep.failed.length) { L.push('', '## Falhas', ''); rep.failed.forEach((x) => L.push(`- ${x.nome || x.grupo} (${x.lead || ''}): ${x.erro}`)); }
  return L.join('\n');
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const dir = arg('--dir', path.join(os.homedir(), 'Desktop/CLAUDE/LEADS_EVENTO_2026-10'));
  const env = { ...readEnvFile(path.resolve('.env')), ...process.env };
  const url = arg('--url', env.PRICETAX_URL);
  const token = arg('--token', env.PRICETAX_CRM_TOKEN);
  if (!url || !token) { console.error('Faltam PRICETAX_URL / PRICETAX_CRM_TOKEN (no .env desta pasta ou no ambiente).'); process.exit(2); }
  const apply = argv.includes('--apply');
  const event = loadEvent(dir);
  const interacoes = loadInteractions(arg('--interacoes'));
  const only = arg('--only') ? arg('--only').split(',') : null;
  const rep = await run({ api: makeApi(url, token), event, interacoes, apply, pipelineName: arg('--funil', DEFAULT_PIPELINE), only, log: (m) => console.error(m) });
  const outDir = path.join(dir, 'crm_import');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const base = path.join(outDir, `${apply ? 'gravada' : 'previa'}_${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(rep, null, 2));
  fs.writeFileSync(`${base}.md`, reportMarkdown(rep, event));
  console.log(reportMarkdown(rep, event));
  console.log(`\nRelatório: ${base}.md`);
  process.exit(rep.failed.length ? 1 : 0);
}
