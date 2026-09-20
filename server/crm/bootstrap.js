// Traz pro CRM os clientes que JÁ existem no painel (projetos do cronograma) —
// SOMENTE LEITURA em `projects` (nada do projeto é alterado). Empresas com o
// mesmo CNPJ viram UMA empresa do CRM com vários projetos ligados. Áreas e
// responsáveis cadastrados no cliente podem virar contatos (opcional).
import { pool } from '../db.js';
import { onlyDigits, companyNameKey, similarity } from './text.js';
import { isValidCnpj } from './cnpj.js';
import { createCompany, createContact, linkProject } from './service.js';

async function candidates(orgId) {
  const { rows: projects } = await pool.query(
    `SELECT p.id, p.data, to_char(p.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS created
     FROM projects p WHERE p.org_id=$1 AND NOT EXISTS (SELECT 1 FROM crm_company_projects cp WHERE cp.project_id = p.id) ORDER BY p.created_at`, [orgId]);
  const { rows: companies } = await pool.query('SELECT id, legal_name, trade_name, cnpj, name_norm FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL', [orgId]);
  const byCnpj = new Map(companies.filter((c) => c.cnpj).map((c) => [c.cnpj, c]));
  const groups = new Map();
  projects.forEach((p) => {
    const co = (p.data && p.data.company) || {};
    const digits = onlyDigits(co.cnpj);
    const name = String(co.name || co.nomeFantasia || '').trim();
    if (!name && !digits) return;
    const key = digits.length === 14 ? `cnpj:${digits}` : `nome:${companyNameKey(name)}`;
    if (!groups.has(key)) groups.set(key, { key, legalName: name || co.nomeFantasia, tradeName: String(co.nomeFantasia || '').trim(), cnpj: digits.length === 14 ? digits : '', groupName: String(co.groupName || '').trim(), projects: [], contacts: [], since: p.created });
    const g = groups.get(key);
    g.projects.push({ id: p.id, name: name || 'Projeto' });
    if (p.created && p.created < g.since) g.since = p.created;
    (Array.isArray(co.areas) ? co.areas : []).forEach((a) => {
      const n = String((a && a.name) || '').trim();
      if (n) g.contacts.push({ name: n, email: String((a && a.email) || '').trim(), department: String((a && a.area) || '').trim() });
    });
  });
  return [...groups.values()].map((g) => {
    const warnings = [];
    if (!g.cnpj) warnings.push('Sem CNPJ informado no projeto.');
    else if (!isValidCnpj(g.cnpj)) warnings.push('CNPJ com dígito verificador inválido (mantido como está).');
    let existing = null;
    if (g.cnpj && byCnpj.has(g.cnpj)) existing = { id: byCnpj.get(g.cnpj).id, legalName: byCnpj.get(g.cnpj).legal_name, via: 'cnpj' };
    else {
      const k = companyNameKey(g.legalName);
      let best = null; let score = 0;
      companies.forEach((c) => String(c.name_norm || '').split('|').filter(Boolean).forEach((b) => { const s = similarity(k, b); if (s > score) { score = s; best = c; } }));
      if (best && score >= 0.85) existing = { id: best.id, legalName: best.legal_name, via: 'nome' };
    }
    const action = existing ? (existing.via === 'cnpj' ? 'link_existing' : 'possible_duplicate') : 'create';
    // Contatos das áreas: dedupe por e-mail (ou nome) dentro do grupo.
    const seen = new Set();
    const contacts = g.contacts.filter((c) => { const k = (c.email || c.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return { ...g, contacts, warnings, existing, action, defaultSelected: action !== 'possible_duplicate' };
  });
}

export async function previewBootstrap(orgId) {
  const items = await candidates(orgId);
  return { items: items.map((g) => ({ key: g.key, legalName: g.legalName, tradeName: g.tradeName, cnpj: g.cnpj, groupName: g.groupName, projects: g.projects, contactsCount: g.contacts.length, warnings: g.warnings, existing: g.existing, action: g.action, defaultSelected: g.defaultSelected })) };
}

export async function commitBootstrap(orgId, actor, { keys = [], withContacts = true } = {}) {
  const wanted = new Set(keys);
  const items = (await candidates(orgId)).filter((g) => wanted.has(g.key));
  const out = { created: 0, linkedToExisting: 0, projectsLinked: 0, contactsCreated: 0, failed: [] };
  for (const g of items) {
    try {
      let companyId;
      if (g.existing) {
        companyId = g.existing.id;
        out.linkedToExisting += 1;
      } else {
        const co = await createCompany(orgId, actor, {
          legalName: g.legalName, tradeName: g.tradeName, cnpj: g.cnpj, economicGroup: g.groupName, relationship: 'client', source: 'cliente_atual', clientSince: g.since || undefined,
        }, { force: true, allowInvalidCnpj: true, timelineSummary: `${actor.name} trouxe a empresa do painel (cliente atual, com projeto no cronograma).`, timelineData: { source: 'bootstrap' } });
        companyId = co.id;
        out.created += 1;
      }
      for (const p of g.projects) { await linkProject(orgId, actor, companyId, p.id); out.projectsLinked += 1; }
      if (withContacts) {
        const { rows: have } = await pool.query(`SELECT lower(email) AS email, name_norm FROM crm_contacts WHERE company_id=$1 AND deleted_at IS NULL`, [companyId]);
        for (const c of g.contacts) {
          const parts = c.name.split(/\s+/);
          const dupe = have.some((h) => (c.email && h.email === c.email.toLowerCase()));
          if (dupe) continue;
          try { await createContact(orgId, actor, { companyId, firstName: parts.shift(), lastName: parts.join(' '), email: c.email, department: c.department }, { force: true }); out.contactsCreated += 1; } catch (e) { /* e-mail inválido etc.: segue sem esse contato */ }
        }
      }
    } catch (e) {
      out.failed.push({ key: g.key, name: g.legalName, message: e.message });
    }
  }
  return out;
}
