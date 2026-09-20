// Importação de planilha Excel/CSV (PRD 48) — a leitura do arquivo e o
// mapeamento de colunas acontecem no navegador; aqui chega uma lista de linhas
// JÁ mapeadas ({legalName, cnpj, ...}). Fluxo em duas etapas: PREVIEW (só
// classifica, não grava nada) e COMMIT (reclassifica no servidor — nunca
// confia no que o preview do navegador disse — e cria o que for permitido).
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { onlyDigits, companyNameKey, personNameKey, similarity, stripAccents, parseDateBR, formatPhonesBR, normalizeZip, splitCnae, firstEmail } from './text.js';
import { createCompany, createContact, validateCompanyInput, validateContactInput, SOURCES } from './service.js';

export const MAX_IMPORT_ROWS = 2000;

export const COMPANY_IMPORT_FIELDS = [
  ['legalName', 'Razão social / Nome'], ['tradeName', 'Nome fantasia'], ['cnpj', 'CNPJ'], ['economicGroup', 'Grupo econômico'],
  ['website', 'Site'], ['segment', 'Segmento'], ['cnae', 'CNAE'], ['city', 'Cidade'], ['state', 'Estado (UF)'],
  ['relationship', 'Relação (prospect/cliente/...)'], ['source', 'Origem'], ['ownerName', 'Responsável (nome)'],
  ['companySize', 'Porte'], ['taxRegime', 'Regime tributário'], ['revenueEstimate', 'Faturamento estimado'], ['employees', 'Nº de funcionários'], ['erp', 'ERP'],
  ['clientSince', 'Cliente desde'], ['phone', 'Telefone(s)'], ['contactEmail', 'E-mail de contato'], ['zipCode', 'CEP'], ['street', 'Logradouro'], ['streetNumber', 'Número'],
  ['complement', 'Complemento'], ['district', 'Bairro'], ['foundedAt', 'Data de fundação'], ['shareCapital', 'Capital social'], ['cnaeSecondary', 'CNAEs secundários'],
].map(([key, label]) => ({ key, label }));

export const CONTACT_IMPORT_FIELDS = [
  ['fullName', 'Nome completo'], ['firstName', 'Nome'], ['lastName', 'Sobrenome'], ['companyCnpj', 'CNPJ da empresa'], ['companyName', 'Nome da empresa'],
  ['jobTitle', 'Cargo'], ['department', 'Departamento'], ['email', 'E-mail'], ['phone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['linkedin', 'LinkedIn'],
  ['decisionRole', 'Papel na decisão'], ['influence', 'Influência'], ['relationshipStrength', 'Relacionamento'],
].map(([key, label]) => ({ key, label }));

const norm = (v) => stripAccents(v).toLowerCase().trim();

// Nomes-coringa que sistemas de CRM gravam quando não há nome (o PipeRun exporta "Nome não informado").
// Importar isso criaria empresas fantasma; a linha é recusada e aparece na prévia com o motivo.
const PLACEHOLDER_NAMES = new Set(['nome nao informado', 'nao informado', 'nao informada', 'sem nome', 'n a', 'na', 'desconhecido', 'desconhecida']);
export const isPlaceholderName = (v) => PLACEHOLDER_NAMES.has(personNameKey(v));

const REL_MAP = { prospect: 'prospect', lead: 'prospect', cliente: 'client', client: 'client', 'ex-cliente': 'former_client', 'ex cliente': 'former_client', excliente: 'former_client', parceiro: 'partner', partner: 'partner' };
const ROLE_MAP = { decisor: 'decisor', influenciador: 'influenciador', usuario: 'usuario', comprador: 'comprador', financeiro: 'financeiro', juridico: 'juridico', tecnico: 'tecnico', sponsor: 'sponsor', bloqueador: 'bloqueador' };
const STRENGTH_MAP = { forte: 'forte', medio: 'medio', media: 'medio', fraco: 'fraco', fraca: 'fraco' };
const INFLUENCE_MAP = { alta: 'alta', alto: 'alta', media: 'media', medio: 'media', baixa: 'baixa', baixo: 'baixa' };
const REGIME_MAP = [['real', 'Lucro Real'], ['presumido', 'Lucro Presumido'], ['simples', 'Simples Nacional'], ['mei', 'MEI']];

function mapEnum(map, raw) {
  const v = norm(raw);
  return v ? (map[v] === undefined ? null : map[v]) : '';
}

function mapSource(raw) {
  const v = norm(raw);
  if (!v) return '';
  return SOURCES.find((s) => v === s || v.startsWith(s) || s.startsWith(v)) || String(raw).trim();
}

function mapRegime(raw) {
  const v = norm(raw);
  if (!v) return '';
  const hit = REGIME_MAP.find(([k]) => v.includes(k));
  return hit ? hit[1] : String(raw).trim();
}

async function loadCompanyIndex(orgId) {
  const { rows } = await pool.query('SELECT id, legal_name, trade_name, cnpj, name_norm FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL', [orgId]);
  const byCnpj = new Map();
  rows.forEach((r) => { if (r.cnpj) byCnpj.set(r.cnpj, r); });
  return { rows, byCnpj };
}

function matchCompanyByName(index, keys) {
  let best = null;
  let bestScore = 0;
  index.rows.forEach((r) => {
    String(r.name_norm || '').split('|').filter(Boolean).forEach((b) => keys.forEach((a) => {
      const sc = similarity(a, b);
      if (sc > bestScore) { bestScore = sc; best = r; }
    }));
  });
  return bestScore >= 0.85 ? { row: best, score: bestScore } : null;
}

async function loadOwners(orgId) {
  const { rows } = await pool.query(`SELECT id, name, username, email FROM users WHERE org_id=$1 AND role <> 'cliente' AND blocked = false`, [orgId]);
  return rows;
}

function findOwner(owners, raw) {
  const v = norm(raw);
  if (!v) return null;
  return owners.find((u) => norm(u.name) === v || norm(u.username) === v || norm(u.email) === v) || null;
}

function rowLabel(r) { return String(r.legalName || r.tradeName || r.fullName || r.firstName || '').trim() || '(sem nome)'; }

function assertRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new CrmError(400, 'Nenhuma linha para importar.');
  if (rows.length > MAX_IMPORT_ROWS) throw new CrmError(400, `Limite de ${MAX_IMPORT_ROWS} linhas por importação — divida a planilha.`);
}

// Devolve, por linha, o input normalizado + status. Não grava nada.
async function classifyCompanies(orgId, rows) {
  assertRows(rows);
  const index = await loadCompanyIndex(orgId);
  const owners = await loadOwners(orgId);
  const seenCnpj = new Map();
  const seenName = new Map();
  return rows.map((raw, i) => {
    const line = i + 2; // linha na planilha (cabeçalho = 1)
    const messages = [];
    const input = {
      legalName: raw.legalName, tradeName: raw.tradeName, cnpj: raw.cnpj, economicGroup: raw.economicGroup, website: raw.website, segment: raw.segment,
      cnae: raw.cnae, city: raw.city, state: raw.state, companySize: raw.companySize, erp: raw.erp, revenueEstimate: raw.revenueEstimate, employees: raw.employees,
      taxRegime: mapRegime(raw.taxRegime), source: mapSource(raw.source),
      street: raw.street, streetNumber: raw.streetNumber, complement: raw.complement, district: raw.district, shareCapital: raw.shareCapital, cnaeSecondary: raw.cnaeSecondary,
    };
    // Campos "de apoio" (data, CEP, telefone, e-mail, CNAE): valor ruim NÃO derruba a linha — vira aviso e o campo fica de fora.
    const placeholders = ['legalName', 'tradeName'].filter((k) => input[k] && isPlaceholderName(input[k]));
    const shown = placeholders.length ? String(input[placeholders[0]]).trim() : '';
    placeholders.forEach((k) => { input[k] = ''; });
    if (placeholders.length) {
      messages.push(input.legalName || input.tradeName
        ? `Um dos nomes veio como "${shown}" — ignorado; usei o outro nome da linha.`
        : `O nome veio como "${shown}" (registro sem identificação no sistema de origem) — não importada. Complete o nome ou o CNPJ lá e reexporte.`);
    }
    if (raw.cnae) {
      const c = splitCnae(raw.cnae);
      input.cnae = c.code;
      if (!String(raw.segment || '').trim() && c.description) input.segment = c.description;
    }
    const softDate = (key, label) => {
      const v = parseDateBR(raw[key]);
      if (v === null) messages.push(`${label} "${raw[key]}" não reconhecida — ignorada.`); else if (v) input[key] = v;
    };
    softDate('foundedAt', 'Data de fundação');
    softDate('clientSince', 'Cliente desde');
    if (raw.phone) input.phone = formatPhonesBR(raw.phone);
    if (raw.zipCode) { const z = normalizeZip(raw.zipCode); if (z) input.zipCode = z; else messages.push(`CEP "${raw.zipCode}" inválido — ignorado.`); }
    if (raw.contactEmail) { const e = firstEmail(raw.contactEmail); if (e) input.contactEmail = e; else messages.push(`E-mail de contato "${raw.contactEmail}" inválido — ignorado.`); }
    const rel = mapEnum(REL_MAP, raw.relationship);
    if (rel === null) messages.push(`Relação "${raw.relationship}" não reconhecida — usando Prospect.`);
    // "Cliente desde" preenchido e relação não informada: é cliente (e a data original é preservada).
    input.relationship = rel || (!raw.relationship && input.clientSince ? 'client' : 'prospect');
    if (raw.ownerName) {
      const owner = findOwner(owners, raw.ownerName);
      if (owner) input.ownerId = owner.id; else messages.push(`Responsável "${raw.ownerName}" não encontrado — ficará sem responsável.`);
    }
    const { values, errors } = validateCompanyInput(input);
    const base = { index: i, line, name: rowLabel(raw), input };
    if (errors.length) return { ...base, status: 'invalid', messages: [...errors, ...messages] };
    const keys = [values.legal_name, values.trade_name].map(companyNameKey).filter(Boolean);
    if (values.cnpj && index.byCnpj.has(values.cnpj)) return { ...base, status: 'duplicate', messages: [`CNPJ já cadastrado (${index.byCnpj.get(values.cnpj).legal_name}).`, ...messages], existingId: index.byCnpj.get(values.cnpj).id };
    if (values.cnpj && seenCnpj.has(values.cnpj)) return { ...base, status: 'duplicate', messages: [`CNPJ repetido na planilha (linha ${seenCnpj.get(values.cnpj)}).`, ...messages] };
    const nameKey = keys[0];
    if (!values.cnpj && nameKey && seenName.has(nameKey)) return { ...base, status: 'duplicate', messages: [`Nome repetido na planilha (linha ${seenName.get(nameKey)}).`, ...messages] };
    if (values.cnpj) seenCnpj.set(values.cnpj, line);
    if (nameKey) seenName.set(nameKey, line);
    const near = keys.length ? matchCompanyByName(index, keys) : null;
    if (near) return { ...base, status: 'possible_duplicate', messages: [`Nome parecido com "${near.row.legal_name}" — confirme se é a mesma empresa.`, ...messages], existingId: near.row.id };
    return { ...base, status: 'new', messages };
  });
}

async function classifyContacts(orgId, rows) {
  assertRows(rows);
  const index = await loadCompanyIndex(orgId);
  const { rows: existing } = await pool.query(
    `SELECT lower(k.email) AS email, right(regexp_replace(k.phone,'\\D','','g'),9) AS p1, right(regexp_replace(k.whatsapp,'\\D','','g'),9) AS p2
     FROM crm_contacts k WHERE k.org_id=$1 AND k.deleted_at IS NULL`, [orgId]);
  const emails = new Set(existing.map((r) => r.email).filter(Boolean));
  const phones = new Set(existing.flatMap((r) => [r.p1, r.p2]).filter((p) => p && p.length >= 8));
  const seenEmail = new Map();
  return rows.map((raw, i) => {
    const line = i + 2;
    const messages = [];
    let firstName = String(raw.firstName || '').trim();
    let lastName = String(raw.lastName || '').trim();
    if (!firstName && raw.fullName) {
      const parts = String(raw.fullName).trim().split(/\s+/);
      firstName = parts.shift() || '';
      lastName = parts.join(' ');
    }
    const input = { firstName, lastName, jobTitle: raw.jobTitle, department: raw.department, email: raw.email, phone: raw.phone, whatsapp: raw.whatsapp, linkedin: raw.linkedin };
    [['decisionRole', ROLE_MAP], ['influence', INFLUENCE_MAP], ['relationshipStrength', STRENGTH_MAP]].forEach(([k, map]) => {
      const v = mapEnum(map, raw[k]);
      if (v === null) messages.push(`${k} "${raw[k]}" não reconhecido — ignorado.`); else input[k] = v;
    });
    const base = { index: i, line, name: `${firstName} ${lastName}`.trim() || '(sem nome)', input };
    const { values, errors } = validateContactInput(input);
    // empresa: CNPJ exato, senão nome exato (uma só correspondência)
    let company = null;
    const cnpj = onlyDigits(raw.companyCnpj);
    if (cnpj) company = index.byCnpj.get(cnpj) || null;
    if (!company && raw.companyName) {
      const key = companyNameKey(raw.companyName);
      const hits = index.rows.filter((r) => String(r.name_norm || '').split('|').includes(key));
      if (hits.length === 1) [company] = hits;
      else if (hits.length > 1) errors.push(`Empresa "${raw.companyName}" ambígua (${hits.length} cadastros) — informe o CNPJ.`);
    }
    if (!company && !errors.length) errors.push('Empresa não encontrada (informe o CNPJ ou o nome exato de uma empresa já cadastrada).');
    if (errors.length) return { ...base, status: 'invalid', messages: [...errors, ...messages] };
    base.input = { ...input, companyId: company.id };
    base.companyName = company.legal_name;
    if (values.email && seenEmail.has(values.email)) return { ...base, status: 'duplicate', messages: [`E-mail repetido na planilha (linha ${seenEmail.get(values.email)}).`, ...messages] };
    if (values.email) seenEmail.set(values.email, line);
    const p = [values.phone, values.whatsapp].map(onlyDigits).filter((x) => x.length >= 8).map((x) => x.slice(-9));
    if ((values.email && emails.has(values.email)) || p.some((x) => phones.has(x))) return { ...base, status: 'possible_duplicate', messages: ['E-mail ou telefone já existe em outro contato.', ...messages] };
    return { ...base, status: 'new', messages };
  });
}

function summarize(results) {
  const c = { new: 0, duplicate: 0, possible_duplicate: 0, invalid: 0 };
  results.forEach((r) => { c[r.status] += 1; });
  return c;
}

export async function previewImport(orgId, target, rows) {
  const results = target === 'contacts' ? await classifyContacts(orgId, rows) : await classifyCompanies(orgId, rows);
  return { target, counts: summarize(results), rows: results.map((r) => ({ index: r.index, line: r.line, name: r.name, status: r.status, messages: r.messages, companyName: r.companyName || '' })) };
}

export async function commitImport(orgId, actor, target, rows, { includePossibleDuplicates = false } = {}) {
  const results = target === 'contacts' ? await classifyContacts(orgId, rows) : await classifyCompanies(orgId, rows);
  const out = { created: 0, skipped: 0, failed: [] };
  for (const r of results) {
    const allowed = r.status === 'new' || (r.status === 'possible_duplicate' && includePossibleDuplicates);
    if (!allowed) { out.skipped += 1; continue; }
    try {
      if (target === 'contacts') await createContact(orgId, actor, r.input, { force: true });
      else await createCompany(orgId, actor, r.input, { force: true, timelineSummary: `${actor.name} importou a empresa por planilha.`, timelineData: { source: 'import' } });
      out.created += 1;
    } catch (e) {
      out.failed.push({ line: r.line, name: r.name, message: e.message });
    }
  }
  return out;
}
