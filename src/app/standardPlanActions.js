// Ações do cronograma padrão versionado (2026-10-19). É uma FÁBRICA chamada a cada render (mesmo padrão de src/app/*.js): abrir/fechar a edição do padrão,
// salvar uma versão nova, descartar o rascunho, carregar uma versão antiga e mudar o kickoff de referência. O padrão é editado na tela de empresa como um
// "projeto" de id fixo (STD_PLAN_ID) que entra em `projects` só enquanto está aberto; o autosave dele vai para o RASCUNHO (nunca vira versão sozinho).
import { apiGet, apiPost } from '../lib/api.js';
import { notify } from '../ui/dialogs.jsx';
import { STD_PLAN_ID } from '../lib/stdPlan.js';
import { normalizeProject } from '../App.jsx';

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const shiftISO = (iso, n) => (iso ? new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10) : '');
const BASE = '/api/standard-plan/template';

export function createStandardPlanActions({ flushProjectSave, goToWorkspace, mutateProject, pushLocation, setCompanySelectionConfirmed, setProjects, setSelectedProjectIds, setStdInfo, setView, stdSaveRef, view, withActingOrg }) {
  async function settle() {
    try { await flushProjectSave(STD_PLAN_ID); } catch { /* o aviso de falha já foi mostrado */ }
    if (stdSaveRef.current) { try { await stdSaveRef.current; } catch { /* idem */ } }
  }

  async function fetchDraft() {
    const r = await apiGet(withActingOrg(`${BASE}/draft`));
    return { project: normalizeProject(r.project), info: { current: r.current, dirty: r.dirty, updatedBy: r.updatedBy, updatedAt: r.updatedAt } };
  }
  const applyDraft = (d) => {
    setProjects((prev) => [...prev.filter((p) => p.id !== STD_PLAN_ID), d.project]);
    setStdInfo(d.info);
  };
  async function loadDraft() { applyDraft(await fetchDraft()); }

  async function openStandardPlan() {
    let d;
    try { d = await fetchDraft(); } catch (e) { notify((e && e.message) || 'Não foi possível abrir o cronograma padrão agora.', { tone: 'error' }); return; }
    // Tudo no mesmo instante: a limpeza em App.jsx remove o padrão de `projects` se ele aparecer sem estar selecionado.
    applyDraft(d);
    goToWorkspace('company', { noRestore: true });
    setSelectedProjectIds([STD_PLAN_ID]);
    setCompanySelectionConfirmed(true);
    if (view === 'meetings' || view === 'todo') setView('table');
    pushLocation('company');
  }

  async function closeStandardPlan() {
    await settle();
    setSelectedProjectIds([]);
    setCompanySelectionConfirmed(false);
    pushLocation('company:select');
  }

  async function saveStandardVersion(note) {
    await settle();
    const r = await apiPost(withActingOrg(`${BASE}/versions`), { note });
    await loadDraft();
    notify(`Versão ${r.label} salva. As empresas novas passam a seguir esta versão.`, { tone: 'success' });
    return r;
  }

  async function discardStandardDraft() {
    await settle();
    await apiPost(withActingOrg(`${BASE}/draft/discard`), {});
    await loadDraft();
    notify('Alterações descartadas. O rascunho voltou à versão atual.', { tone: 'success' });
  }

  async function restoreStandardVersion(n) {
    await settle();
    await apiPost(withActingOrg(`${BASE}/restore/${n}`), {});
    await loadDraft();
    notify(`Versão ${n}.0 carregada no rascunho. Salve para criar uma versão nova a partir dela.`, { tone: 'success' });
  }

  const fetchStandardProposals = async () => (await apiGet(withActingOrg(`${BASE}/proposals`))).proposals;
  async function loadStandardProposal(key, label) {
    await settle();
    await apiPost(withActingOrg(`${BASE}/proposals/${key}/load`), {});
    await loadDraft();
    notify(`${label} carregada no rascunho. Revise e, quando estiver certo, use "Salvar nova versão".`, { tone: 'success' });
  }

  const fetchStandardVersions = async () => (await apiGet(withActingOrg(`${BASE}/versions`))).versions;
  async function fetchStandardDiff() { await settle(); return apiGet(withActingOrg(`${BASE}/draft/diff`)); }

  // Muda o kickoff de referência movendo o padrão inteiro: cada atividade e subatividade guarda os mesmos dias após o kickoff.
  function setStandardKickoff(next) {
    if (!next) return;
    mutateProject(STD_PLAN_ID, (p) => {
      const delta = p.kickoffDate ? daysBetween(p.kickoffDate, next) : 0;
      const mv = (d) => (d && delta ? shiftISO(d, delta) : d);
      return {
        ...p, kickoffDate: next,
        activities: p.activities.map((a) => ({ ...a, date: mv(a.date), endDate: mv(a.endDate), subactivities: (a.subactivities || []).map((s) => ({ ...s, date: mv(s.date) })) })),
      };
    });
  }

  return { closeStandardPlan, discardStandardDraft, fetchStandardDiff, fetchStandardProposals, fetchStandardVersions, loadStandardProposal, openStandardPlan, restoreStandardVersion, saveStandardVersion, setStandardKickoff };
}
