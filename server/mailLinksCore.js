// E-mail ligado ao CRM e às Empresas (§130, 2026-11-02). Regras PURAS (sem banco, sem Gmail): de cada participante externo sai uma
// "chave" — o domínio (okubo.com.br) ou, nos provedores públicos (gmail, hotmail…), o endereço inteiro — e a chave é procurada num
// diretório montado, nesta ordem, com: contatos e empresas do CRM (e-mail, site, domínio dos contatos), negócios abertos e ganhos da
// empresa, módulo Empresas (e-mails das áreas e contatos externos) e a classificação manual por domínio (mail_domain_marks).
// Usado pelo servidor (server/mailLinks.js), pela RENATA e pelo teste scripts/mail-links.test.mjs.

export const OWN_DOMAINS = ['pricetax.com.br'];

export const PUBLIC_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'live.com.br', 'msn.com',
  'yahoo.com', 'yahoo.com.br', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'uol.com.br', 'bol.com.br', 'terra.com.br',
  'ig.com.br', 'globo.com', 'globomail.com', 'r7.com', 'zipmail.com.br', 'oi.com.br', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.net',
  'zoho.com', 'mail.com', 'yandex.com', 'pm.me', 'tutanota.com',
]);

// Remetentes automáticos não identificam empresa nenhuma (aviso de sistema, robô de nota fiscal, convite do Google…).
const ROBOT_RE = /^(no-?reply|nao-?responda|naoresponda|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?|notifica(c|ç)(o|õ)es|notifications?|calendar-notification|news(letter)?|marketing|invites?)([+._-].*)?@/i;
const ROBOT_DOMAINS = new Set(['google.com', 'calendar.google.com', 'docs.google.com', 'accounts.google.com', 'linkedin.com', 'facebookmail.com', 'microsoft.com', 'zoom.us', 'teams.microsoft.com']);

export const MARK_KINDS = {
  cliente: { label: 'Cliente', tone: 'client' },
  prospect: { label: 'Prospect', tone: 'lead' },
  parceiro: { label: 'Parceiro', tone: 'partner' },
  fornecedor: { label: 'Fornecedor', tone: 'supplier' },
  ignorar: { label: 'Ignorado', tone: 'ignored' },
};

const REL_BADGE = { client: ['client', 'Cliente'], prospect: ['lead', 'Lead'], former_client: ['former', 'Ex-cliente'], partner: ['partner', 'Parceiro'] };

export const lowerEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@<>"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function domainOf(email) {
  const e = lowerEmail(email);
  return EMAIL_RE.test(e) ? e.slice(e.lastIndexOf('@') + 1) : '';
}

export const isOwnDomain = (domain) => OWN_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
export const isPublicProvider = (domain) => PUBLIC_PROVIDERS.has(domain);
export const isRobot = (email) => ROBOT_RE.test(lowerEmail(email)) || ROBOT_DOMAINS.has(domainOf(email));

// Chave de um endereço: domínio corporativo, ou o e-mail inteiro no provedor público. null = da casa, robô ou inválido.
export function keyOf(email) {
  const e = lowerEmail(email);
  const d = domainOf(e);
  if (!d || isOwnDomain(d) || isRobot(e)) return null;
  return isPublicProvider(d) ? e : d;
}

// O que a pessoa digita para marcar um domínio ("@Okubo.com.br", "https://www.okubo.com.br/", "fulano@gmail.com") vira chave.
export function cleanKey(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('@') && !s.startsWith('@')) return keyOf(s) || null;
  s = s.replace(/^@/, '').replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || isOwnDomain(s) || isPublicProvider(s)) return null;
  return s;
}

// Site cadastrado ("www.kuhn.com.br/contato") → domínio. Vazio quando não dá para confiar.
export function siteDomain(url) {
  const s = String(url || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:\s]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || isPublicProvider(s) || isOwnDomain(s)) return '';
  return s;
}

const companyName = (c) => String(c.tradeName || c.legalName || '').trim() || 'Empresa';

// Fontes (todas já filtradas por organização e sem excluídos):
//  companies: [{ id, legalName, tradeName, website, relationship }]
//  contacts:  [{ email, companyId }]
//  deals:     [{ id, companyId, title, status: 'open'|'won', stageName, updatedAt }]
//  projects:  [{ id, name, emails: [..], crmCompanyId? }]
//  marks:     [{ key, kind, label }]
// Devolve um diretório { byKey: Map(chave → alvo) }. Fonte de maior prioridade escreve primeiro e não é sobrescrita.
export function buildDirectory({ companies = [], contacts = [], deals = [], projects = [], marks = [] } = {}) {
  const byId = new Map(companies.map((c) => [c.id, c]));
  const bestDeal = new Map();
  const rank = (d) => (d.status === 'open' ? 2 : d.status === 'won' ? 1 : 0);
  for (const d of deals) {
    if (!rank(d) || !byId.has(d.companyId)) continue;
    const cur = bestDeal.get(d.companyId);
    if (!cur || rank(d) > rank(cur) || (rank(d) === rank(cur) && String(d.updatedAt || '') > String(cur.updatedAt || ''))) bestDeal.set(d.companyId, d);
  }
  const projectOfCompany = new Map(projects.filter((p) => p.crmCompanyId).map((p) => [p.crmCompanyId, p.id]));
  const byKey = new Map();
  const crmTarget = (c, via) => {
    const deal = bestDeal.get(c.id) || null;
    return { source: 'crm', via, companyId: c.id, name: companyName(c), relationship: c.relationship || 'prospect',
      dealId: deal ? deal.id : null, dealTitle: deal ? deal.title : '', dealStatus: deal ? deal.status : '', stage: deal ? deal.stageName || '' : '',
      projectId: projectOfCompany.get(c.id) || null };
  };
  const put = (key, target) => { if (key && !byKey.has(key)) byKey.set(key, target); };

  // Domínio marcado como parceiro/fornecedor não vira empresa só porque alguém cadastrou um contato dele dentro dela (o Jhoni da Tróia
  // cadastrado na COPLACANA). Site, módulo Empresas e marca cliente/prospect seguem como antes.
  const intermediary = new Set(marks.filter((m) => ['parceiro', 'fornecedor'].includes(m.kind)).map((m) => m.key));
  // 0) domínio vinculado à mão a uma empresa do CRM ("Parece ser INDEMIL — vincular?") vale como o site dela.
  for (const m of marks) { const c = m.companyId && byId.get(m.companyId); if (c) put(m.key, crmTarget(c, 'vinculo')); }
  // 1) e-mail exato do contato do CRM (vale também para gmail/hotmail)
  for (const k of contacts) { const c = byId.get(k.companyId); if (c) put(keyOf(k.email) && isPublicProvider(domainOf(k.email)) ? lowerEmail(k.email) : null, crmTarget(c, 'contato')); }
  // 2) domínio corporativo dos contatos e o site da empresa (empresa com negócio aberto/ganho vence quando o domínio se repete)
  const domainHits = new Map();
  const offer = (domain, c, via) => {
    if (!domain) return;
    const cur = domainHits.get(domain);
    const score = (x) => rank(bestDeal.get(x.id) || {}) * 10 + (x.relationship === 'client' ? 2 : 0);
    if (!cur || score(c) > score(cur.c)) domainHits.set(domain, { c, via });
  };
  // Domínio de contato espalhado por 2+ empresas sem lembrar o nome de nenhuma é de intermediário (contador, consultoria): não identifica
  // ninguém. Se lembra (grupo com vários CNPJs no mesmo domínio), vale entre as empresas que ele lembra.
  const contactCompanies = new Map();
  for (const k of contacts) { const key = keyOf(k.email); if (key && byId.has(k.companyId) && !isPublicProvider(domainOf(k.email))) (contactCompanies.get(key) || contactCompanies.set(key, new Set()).get(key)).add(k.companyId); }
  for (const [key, ids] of contactCompanies) {
    if (intermediary.has(key)) continue;
    const list = [...ids].map((id) => byId.get(id));
    for (const c of list.length === 1 ? list : list.filter((x) => domainResembles(key, x))) offer(key, c, 'contato');
  }
  for (const c of companies) offer(siteDomain(c.website), c, 'site');
  // "Fraco": domínio que só veio de um contato e não lembra o nome da empresa (jhoni@troiaconsultoria… cadastrado na COPLACANA).
  for (const [domain, { c, via }] of domainHits) put(domain, { ...crmTarget(c, via), weak: via === 'contato' && !domainResembles(domain, c) });
  // 3) módulo Empresas: e-mails das áreas e dos contatos externos do cronograma
  for (const p of projects) {
    const target = { source: 'empresas', via: 'empresas', projectId: p.id, name: String(p.name || '').trim() || 'Empresa', relationship: 'client', companyId: p.crmCompanyId || null, dealId: null, stage: '' };
    for (const e of p.emails || []) put(keyOf(e), target);
  }
  // 4) classificação manual por domínio
  for (const m of marks) {
    if (!MARK_KINDS[m.kind] || m.companyId) continue;
    put(m.key, { source: 'mark', via: 'marca', kind: m.kind, name: String(m.label || '').trim() || prettyKey(m.key), relationship: m.kind, companyId: null, dealId: null, projectId: null, stage: '' });
  }
  // Para a sugestão "Parece ser…": empresas do CRM e o negócio de cada uma (só usados quando o domínio não achou nada).
  return { byKey, companies, bestDeal, suggestCache: new Map() };
}

// Domínio fora do CRM cujo nome lembra uma empresa do CRM sem site nem contato com e-mail (importadas do PipeRun): "indemil.com" →
// INDEMIL INDUSTRIA E COMERCIO S/A. Melhor parecença primeiro (domínio inteiro dentro do nome > palavra > sigla); empate → negócio
// aberto/ganho, cliente. Só sugere: o vínculo só vale quando alguém confirma.
const GENERIC_BASE = new Set(['grupo', 'conta', 'contabil', 'contabilidade', 'brasil', 'brazil', 'consultoria', 'assessoria', 'empresa', 'empresas', 'industria',
  'comercio', 'servicos', 'solucoes', 'tech', 'tecnologia', 'engenharia', 'transportes', 'alimentos', 'agro', 'cooperativa', 'coop', 'mail', 'email',
  'contato', 'financeiro', 'fiscal', 'gestao', 'online', 'digital', 'group', 'global', 'nacional', 'sistemas', 'distribuidora', 'logistica', 'energia']);
const NAME_LEAD = new Set(['grupo', 'group', 'cooperativa', 'coop', 'cia', 'companhia', 'the', 'empresa', 'industria', 'ind', 'comercio', 'distribuidora']);
// 4 = o domínio é exatamente o começo do nome, palavra a palavra ("indemil" ← INDEMIL INDUSTRIA…; "garciamonteiro" ← Garcia Monteiro - …;
// "vellore" ← Grupo Vellore). Palavra genérica sozinha (grupo, contabil, brasil…) nunca sugere.
// Domínio com "grupo"/"group" na frente compara também sem ele (2026-11-04, §165: grupovellore.com.br × "VELLORE S/A" ficava "fora do CRM").
const DOMAIN_LEAD = ['grupo', 'group'];
export function resemblanceScore(domain, c) {
  const full = foldTxt(String(domain || '').split('.')[0]).replace(/[^a-z0-9]/g, '');
  const bases = [full];
  for (const lead of DOMAIN_LEAD) if (full.startsWith(lead)) bases.push(full.slice(lead.length));
  for (const base of bases) {
    if (base.length < 4 || GENERIC_BASE.has(base)) continue;
    for (const n of [c.tradeName, c.legalName].map(foldTxt)) {
      const words = n.split(/[^a-z0-9]+/).filter(Boolean);
      for (let i = 0; i < words.length && (i === 0 || NAME_LEAD.has(words[i - 1])); i++) {
        let acc = '';
        for (let j = i; j < words.length && acc.length < base.length; j++) { acc += words[j]; if (acc === base) return 4; }
      }
    }
  }
  return 0;
}

export function suggestCompany(key, directory) {
  if (!key || key.includes('@') || !directory || !directory.companies) return null;
  if (directory.suggestCache && directory.suggestCache.has(key)) return directory.suggestCache.get(key);
  const rank = (d) => (!d ? 0 : d.status === 'open' ? 2 : d.status === 'won' ? 1 : 0);
  let best = null;
  for (const c of directory.companies) {
    const sc = resemblanceScore(key, c);
    if (sc < 4) continue;
    const tie = rank(directory.bestDeal && directory.bestDeal.get(c.id)) * 10 + (c.relationship === 'client' ? 2 : 0);
    if (!best || sc > best.sc || (sc === best.sc && tie > best.tie)) best = { sc, tie, c };
  }
  const out = best ? { companyId: best.c.id, name: companyName(best.c) } : null;
  if (directory.suggestCache) directory.suggestCache.set(key, out);
  return out;
}

const foldTxt = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const NAME_STOP = new Set(['ltda', 'eireli', 'brasil', 'brazil', 'industria', 'comercio', 'servicos', 'cooperativa', 'empresa', 'grupo', 'estado', 'paulo', 'distribuidora', 'transportes', 'alimentos', 'consultoria']);
// O domínio lembra o nome da empresa? "kuhn.com.br" × "KUHN DO BRASIL" sim; "troiaconsultoria.onmicrosoft.com" × "COPLACANA" não.
export function domainResembles(domain, c) {
  const base = foldTxt(String(domain || '').split('.')[0]).replace(/[^a-z0-9]/g, '');
  if (!base) return false;
  const names = [c.tradeName, c.legalName].map(foldTxt);
  if (names.some((n) => n.replace(/[^a-z0-9]/g, '').includes(base))) return true;
  const words = names.flatMap((n) => n.split(/[^a-z0-9]+/)).filter((w) => w.length >= 4 && !NAME_STOP.has(w));
  if (words.some((w) => base.includes(w))) return true;
  // sigla: "cpfl" ← "Companhia Paulista de Força e Luz"
  return names.some((n) => { const ini = n.split(/[^a-z0-9]+/).filter((w) => w.length > 2).map((w) => w[0]).join(''); return ini.length >= 3 && base.startsWith(ini); });
}

// "okubo.com.br" → "Okubo"; "fulano@gmail.com" → "fulano@gmail.com".
export function prettyKey(key) {
  const k = String(key || '');
  if (k.includes('@')) return k;
  const base = k.split('.').filter((p) => !['com', 'br', 'net', 'org', 'gov', 'edu', 'ind', 'adv', 'coop', 'eng', 'srv', 'onmicrosoft', 'co', 'io', 'www'].includes(p))[0] || k;
  return base.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Selo de uma conversa a partir do alvo achado no diretório.
export function badgeOf(t) {
  if (!t) return null;
  if (t.source === 'mark') {
    const m = MARK_KINDS[t.kind];
    return { tone: m.tone, label: m.label, name: t.name, text: `${m.label} · ${t.name}`, ignored: t.kind === 'ignorar' };
  }
  if (t.source === 'empresas') return { tone: 'client', label: 'Cliente', name: t.name, text: `Cliente · ${t.name}` };
  let [tone, label] = REL_BADGE[t.relationship] || REL_BADGE.prospect;
  if (t.relationship === 'prospect' && !t.dealId) label = 'Prospect';
  if (t.relationship === 'prospect' && t.dealStatus === 'won') { tone = 'client'; label = 'Cliente'; }
  const stage = t.dealStatus === 'open' && t.stage && tone === 'lead' && t.stage.toLowerCase() !== label.toLowerCase() ? ` · ${t.stage}` : '';
  return { tone, label, name: t.name, text: `${label} · ${t.name}${stage}` };
}

const PROPOSAL_RE = /propost|or[cç]amento|contrato|planilha|cota[cç][aã]o|honor[aá]rio|diagn[oó]stico|reuni[aã]o/i;

// participants: [{ name, email }] de todas as mensagens; teamReplied: alguém da equipe mandou mensagem na conversa.
// Devolve { keys, known: [{key, target}], unknown: [keys], badge, target, realExchange, nag }.
// A faixa "Empresa fora do CRM" (nag) só aparece quando nenhuma chave identifica o cliente e houve troca real.
export function classifyThread({ participants = [], teamReplied = false, hasAttachment = false, subject = '' } = {}, directory) {
  const keys = [...new Set(participants.map((p) => keyOf(p && p.email)).filter(Boolean))];
  const byKey = (directory && directory.byKey) || new Map();
  const known = keys.filter((k) => byKey.has(k)).map((k) => ({ key: k, target: byKey.get(k) }));
  const unknown = keys.filter((k) => !byKey.has(k));
  const order = { crm: 0, empresas: 1, mark: 2 };
  // Ligação "fraca" (domínio de contato que não lembra a empresa) só vale quando não há outro domínio desconhecido na conversa: com a
  // OKUBO desconhecida ao lado, o domínio da Tróia cadastrado na COPLACANA não pode dizer que a conversa é da COPLACANA.
  // Parceiro (marca "parceiro" ou empresa do CRM com relacionamento Parceiro) em cópia é quem INDICOU, nunca o cliente da conversa: vira a
  // etiqueta "Indicação · Tróia" e o selo fica com o cliente (ou, se ele ainda não está no CRM, com a faixa amarela dele).
  const isPartner = (t) => (t.source === 'mark' && t.kind === 'parceiro') || (t.source === 'crm' && t.relationship === 'partner');
  const partnerHit = known.find((x) => isPartner(x.target));
  const partner = partnerHit ? { key: partnerHit.key, name: partnerHit.target.name, companyId: partnerHit.target.companyId || null } : null;
  const live = known.filter((x) => !(x.target.source === 'mark' && x.target.kind === 'ignorar'))
    .filter((x) => !(x.target.weak && unknown.length > 0))
    .filter((x) => !(isPartner(x.target) && (unknown.length > 0 || known.some((y) => !isPartner(y.target) && y.target.source !== 'mark'))))
    .sort((a, b) => order[a.target.source] - order[b.target.source] || (a.target.weak ? 1 : 0) - (b.target.weak ? 1 : 0) || (b.target.dealId ? 1 : 0) - (a.target.dealId ? 1 : 0));
  const main = live[0] || null;
  const realExchange = !!(teamReplied || hasAttachment || PROPOSAL_RE.test(String(subject || '')));
  // Parceiro, fornecedor e ignorado não dizem QUEM é o cliente da conversa (a Tróia em cópia num e-mail da OKUBO): só CRM, Empresas e as
  // marcas cliente/prospect calam a faixa.
  const identifies = live.some((x) => x.target.source !== 'mark' || ['cliente', 'prospect'].includes(x.target.kind));
  const nag = !identifies && unknown.length > 0 && realExchange ? unknown[0] : null;
  return {
    keys, known: known.map((x) => ({ key: x.key, source: x.target.source })), unknown,
    target: main ? main.target : null, badge: main ? badgeOf(main.target) : null, realExchange, nag,
    partner: partner && !(main && isPartner(main.target)) ? partner : null,
    suggest: nag ? suggestCompany(nag, directory) : null,
    ignored: !main && known.length > 0 && known.every((x) => x.target.source === 'mark' && x.target.kind === 'ignorar'),
  };
}

// Para quem não tem CRM (Operações): o selo continua, mas sem nenhum id do CRM nem etapa do negócio.
export function linkForViewer(cls, { crm = false, projectIds = null } = {}) {
  if (!cls) return null;
  const t = cls.target;
  const projectId = t && t.projectId && (!projectIds || projectIds.has(t.projectId)) ? t.projectId : null;
  const badge = cls.badge && !crm && t && t.source === 'crm' && t.stage ? { ...cls.badge, text: `${cls.badge.label} · ${cls.badge.name}` } : cls.badge;
  const partner = cls.partner ? { key: cls.partner.key, name: cls.partner.name, companyId: crm ? cls.partner.companyId : null } : null;
  return {
    badge, nag: cls.nag, realExchange: cls.realExchange, ignored: cls.ignored, partner,
    suggest: cls.suggest ? { name: cls.suggest.name, companyId: crm ? cls.suggest.companyId : null } : null,
    companyId: crm && t ? t.companyId || null : null, dealId: crm && t ? t.dealId || null : null, projectId,
  };
}

// Conversa do índice (de qualquer pessoa da equipe) bate com um conjunto de chaves de uma empresa/negócio?
export const rowMatches = (rowKeys, keys) => (rowKeys || []).some((k) => keys.has(k));

// Chaves de uma empresa do CRM (para a aba E-mails): domínio do site + chaves dos e-mails dos contatos + marcas apontadas para ela.
export function keysOfCompany({ website = '', contactEmails = [], projectEmails = [] } = {}) {
  const out = new Set();
  const d = siteDomain(website); if (d) out.add(d);
  for (const e of [...contactEmails, ...projectEmails]) { const k = keyOf(e); if (k) out.add(k); }
  return out;
}

// Conversas do índice (uma linha por caixa) agrupadas pela conversa (Message-ID da 1ª mensagem): uma linha por conversa, com quem
// da equipe trocou.
export function groupRows(rows) {
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.convKey);
    const who = { userId: r.userId, userName: r.userName || '', rowId: r.id };
    if (!g) by.set(r.convKey, { ...r, team: [who] });
    else {
      if (!g.team.some((x) => x.userId === r.userId)) g.team.push(who);
      if (String(r.lastAt || '') > String(g.lastAt || '')) Object.assign(g, { lastAt: r.lastAt, subject: r.subject || g.subject, msgCount: Math.max(g.msgCount || 0, r.msgCount || 0) });
      const emails = new Set(g.participants.map((p) => p.email));
      for (const p of r.participants || []) if (!emails.has(p.email)) g.participants.push(p);
    }
  }
  return [...by.values()].sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
}

// Participantes de uma conversa do Gmail (formato metadata ou full) + sinais de troca real. Cabeçalhos via headerMap/parseAddressList
// injetados (server/googleMail.js) para manter este arquivo puro.
export function threadFacts(thread, { headerMap, parseAddressList, hasAttachment = false }) {
  const msgs = (thread && thread.messages) || [];
  const people = new Map();
  let teamReplied = false;
  let firstId = '';
  let subject = '';
  for (const m of msgs) {
    const h = headerMap(m.payload && m.payload.headers);
    if (!firstId && h['message-id']) firstId = String(h['message-id']).trim().toLowerCase();
    if (!subject && h.subject) subject = h.subject;
    const from = parseAddressList(h.from)[0];
    const sent = (m.labelIds || []).includes('SENT') || (from && isOwnDomain(domainOf(from.email)));
    if (sent) teamReplied = true;
    for (const p of [from, ...parseAddressList(h.to), ...parseAddressList(h.cc)]) {
      const email = lowerEmail(p && p.email);
      if (email && !people.has(email)) people.set(email, { name: (p.name && p.name !== email ? p.name : '').slice(0, 120), email });
    }
  }
  const dates = msgs.map((m) => Number(m.internalDate || 0)).filter(Boolean);
  return {
    participants: [...people.values()].slice(0, 40), teamReplied, hasAttachment, subject: subject.slice(0, 300),
    convKey: firstId.slice(0, 300) || `t:${thread && thread.id}`, msgCount: msgs.length,
    firstAt: dates.length ? new Date(Math.min(...dates)).toISOString() : null, lastAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
  };
}

// Quem pode abrir o TEXTO de uma conversa da equipe: sócio (ou super admin) e quem participou dela (tem a conversa na própria caixa).
export function canReadContent(user, ownerIds) {
  if (!user) return false;
  if (user.isSuperAdmin || user.workRole === 'socio') return true;
  return (ownerIds || []).includes(user.id);
}

// De QUAL caixa ler: sócio lê a cópia de qualquer colega; quem só participou lê a própria (a do colega pode ter respostas e
// encaminhamentos de que a pessoa foi tirada depois).
export const canReadOwnerCopy = (user, ownerId) => !!user && (user.isSuperAdmin || user.workRole === 'socio' || ownerId === user.id);
