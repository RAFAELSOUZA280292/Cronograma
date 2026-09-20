// Cliente da API do CRM (/api/crm) — Fase 1. Só monta URL/corpo; regra de
// negócio e permissão ficam no servidor (server/crm).
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';

function qs(o) {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

const B = '/api/crm';

export const crm = {
  me: () => apiGet(`${B}/me`),
  options: () => apiGet(`${B}/options`),
  overview: () => apiGet(`${B}/overview`),
  search: (q) => apiGet(`${B}/search${qs({ q })}`),
  cnpj: (c) => apiGet(`${B}/cnpj/${encodeURIComponent(c)}`),
  companies: (f) => apiGet(`${B}/companies${qs(f)}`),
  company: (id) => apiGet(`${B}/companies/${id}`),
  createCompany: (body) => apiPost(`${B}/companies`, body),
  updateCompany: (id, body) => apiPatch(`${B}/companies/${id}`, body),
  deleteCompany: (id) => apiDelete(`${B}/companies/${id}`),
  restoreCompany: (id) => apiPost(`${B}/companies/${id}/restore`, {}),
  timeline: (id, f) => apiGet(`${B}/companies/${id}/timeline${qs(f)}`),
  audit: (id) => apiGet(`${B}/companies/${id}/audit`),
  linkProject: (id, projectId) => apiPost(`${B}/companies/${id}/projects`, { projectId }),
  unlinkProject: (id, projectId) => apiDelete(`${B}/companies/${id}/projects/${projectId}`),
  projectsAvailable: () => apiGet(`${B}/projects-available`),
  contacts: (f) => apiGet(`${B}/contacts${qs(f)}`),
  createContact: (body) => apiPost(`${B}/contacts`, body),
  updateContact: (id, body) => apiPatch(`${B}/contacts/${id}`, body),
  deleteContact: (id) => apiDelete(`${B}/contacts/${id}`),
  pipeline: () => apiGet(`${B}/pipeline`),
  board: (f) => apiGet(`${B}/board${qs(f)}`),
  deals: (f) => apiGet(`${B}/deals${qs(f)}`),
  deal: (id) => apiGet(`${B}/deals/${id}`),
  createDeal: (body) => apiPost(`${B}/deals`, body),
  updateDeal: (id, body) => apiPatch(`${B}/deals/${id}`, body),
  moveDeal: (id, body) => apiPost(`${B}/deals/${id}/move`, body),
  deleteDeal: (id) => apiDelete(`${B}/deals/${id}`),
  dealAudit: (id) => apiGet(`${B}/deals/${id}/audit`),
  activities: (f) => apiGet(`${B}/activities${qs(f)}`),
  createActivity: (body) => apiPost(`${B}/activities`, body),
  updateActivity: (id, body) => apiPatch(`${B}/activities/${id}`, body),
  completeActivity: (id, outcome) => apiPost(`${B}/activities/${id}/complete`, { outcome }),
  cancelActivity: (id) => apiPost(`${B}/activities/${id}/cancel`, {}),
  reopenActivity: (id) => apiPost(`${B}/activities/${id}/reopen`, {}),
  deleteActivity: (id) => apiDelete(`${B}/activities/${id}`),
  pipelines: () => apiGet(`${B}/pipelines`),
  createPipeline: (body) => apiPost(`${B}/pipelines`, body),
  updatePipeline: (id, body) => apiPatch(`${B}/pipelines/${id}`, body),
  deletePipeline: (id) => apiDelete(`${B}/pipelines/${id}`),
  saveStages: (id, stages) => apiPost(`${B}/pipelines/${id}/stages`, { stages }),
  dealImportFields: () => apiGet(`${B}/import/deals/fields`),
  dealImportPreview: (rows) => apiPost(`${B}/import/deals/preview`, { rows }),
  dealImportCommit: (rows, ownerMap) => apiPost(`${B}/import/deals/commit`, { rows, ownerMap }),
  products: (all) => apiGet(`${B}/products${qs({ all: all ? 'true' : '' })}`),
  createProduct: (body) => apiPost(`${B}/products`, body),
  updateProduct: (id, body) => apiPatch(`${B}/products/${id}`, body),
  deleteProduct: (id) => apiDelete(`${B}/products/${id}`),
  addNote: (body) => apiPost(`${B}/notes`, body),
  deleteNote: (id) => apiDelete(`${B}/notes/${id}`),
  importFields: () => apiGet(`${B}/import/fields`),
  importPreview: (target, rows) => apiPost(`${B}/import/preview`, { target, rows }),
  importCommit: (target, rows, includePossibleDuplicates) => apiPost(`${B}/import/commit`, { target, rows, includePossibleDuplicates }),
  bootstrapPreview: () => apiGet(`${B}/bootstrap/preview`),
  bootstrapCommit: (keys, withContacts) => apiPost(`${B}/bootstrap/commit`, { keys, withContacts }),
};
