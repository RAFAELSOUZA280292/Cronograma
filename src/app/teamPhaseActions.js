// Ações do time, das áreas e das fases de uma empresa.
// Extraído de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"). É uma FÁBRICA chamada a cada render: recebe o estado e as funções
// atuais do AppScreens e devolve as ações — o mesmo código de antes, em outro arquivo (as funções são recriadas a cada render, como sempre foram).
import { PHASE_COLORS, uid } from '../App.jsx';

export function createTeamPhaseActions({ activeProject, addLog, mutateProject, newMember, phasesEditingProjectId, pid, projects, setNewMember }) {
  function addMember() {
    const v = newMember.trim();
    if (!v || !activeProject || activeProject.team.some((m) => m.name === v)) return;
    mutateProject(pid, (p) => ({ ...p, team: [...p.team, { id: uid('team'), name: v, area: '', userId: null, username: null, role: null }] }), `Responsável adicionado à equipe: ${v}`);
    setNewMember('');
  }

  function removeMember(id) {
    const target = activeProject && activeProject.team.find((m) => m.id === id);
    mutateProject(pid, (p) => ({ ...p, team: p.team.filter((m) => m.id !== id) }), target ? `Responsável removido da equipe: ${target.name}` : undefined);
  }

  function linkMember(user, area) {
    if (!activeProject || activeProject.team.some((m) => m.userId === user.id)) return;
    const origin = user.role === 'cliente' ? (activeProject.company.name || 'Cliente') : 'PRICETAX';
    mutateProject(pid, (p) => ({
      ...p,
      team: [...p.team, { id: uid('team'), name: user.name, area: area || '', userId: user.id, username: user.username, role: user.role }],
    }), `Responsável vinculado à equipe: ${user.name} (${origin})${area ? ` — área: ${area}` : ''}`);
  }

  function updateMemberArea(id, area) {
    mutateProject(pid, (p) => ({ ...p, team: p.team.map((m) => (m.id === id ? { ...m, area } : m)) }));
  }

  function commitMemberArea(id) {
    const m = activeProject && activeProject.team.find((t) => t.id === id);
    if (m) addLog(pid, `Área de "${m.name}" definida como: ${m.area || '(vazio)'}`);
  }

  function addAreaRow() {
    const row = { id: uid('area'), area: '', name: '', email: '' };
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: [...(p.company.areas || []), row] } }));
  }

  function updateAreaRow(id, patch) {
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: (p.company.areas || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) } }));
  }

  function commitAreaRow(id, overrides) {
    const found = activeProject && (activeProject.company.areas || []).find((r) => r.id === id);
    if (!found) return;
    const row = { ...found, ...(overrides || {}) };
    addLog(pid, `Área cadastrada: ${row.area || '(sem nome)'} — ${row.name || 'sem responsável'}${row.email ? ` <${row.email}>` : ''}`);
    if (row.name && !activeProject.team.some((m) => m.name === row.name)) {
      mutateProject(pid, (p) => ({ ...p, team: [...p.team, { id: uid('team'), name: row.name, area: row.area || '', userId: null, username: null, role: null }] }));
    }
  }

  function removeAreaRow(id) {
    const row = activeProject && (activeProject.company.areas || []).find((r) => r.id === id);
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: (p.company.areas || []).filter((r) => r.id !== id) } }), row ? `Área removida: ${row.area || '(sem nome)'}` : undefined);
  }

  function addPhase() {
    const target = projects.find((p) => p.id === phasesEditingProjectId);
    if (!target) return;
    const phasesList = target.phases;
    const nextId = phasesList.length ? Math.max(...phasesList.map((p2) => p2.id)) + 1 : 1;
    const color = PHASE_COLORS[phasesList.length % PHASE_COLORS.length];
    const np = { id: nextId, name: 'Nova fase', sub: '', color };
    mutateProject(phasesEditingProjectId, (p) => ({ ...p, phases: [...p.phases, np] }), `Fase criada: "${np.name}"`);
  }

  function updatePhase(id, patch, logMsg) {
    mutateProject(phasesEditingProjectId, (p) => ({ ...p, phases: p.phases.map((ph) => (ph.id === id ? { ...ph, ...patch } : ph)) }), logMsg);
  }

  function deletePhase(id) {
    const target = projects.find((p) => p.id === phasesEditingProjectId);
    if (!target || target.phases.length <= 1) return;
    const p0 = target.phases.find((x) => x.id === id);
    const fallback = target.phases.find((x) => x.id !== id);
    mutateProject(phasesEditingProjectId, (p) => ({
      ...p,
      activities: p.activities.map((a) => (a.phase === id ? { ...a, phase: fallback.id } : a)),
      phases: p.phases.filter((x) => x.id !== id),
    }), p0 ? `Fase removida: "${p0.name}" (atividades movidas para "${fallback.name}")` : undefined);
  }

  function reorderPhase(fromId, toId) {
    if (fromId === toId) return;
    mutateProject(phasesEditingProjectId, (p) => {
      const list = p.phases.slice();
      const fromIdx = list.findIndex((x) => x.id === fromId);
      const toIdx = list.findIndex((x) => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return p;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...p, phases: list };
    }, `Ordem das fases alterada`);
  }

  return {
    addAreaRow,
    addMember,
    addPhase,
    commitAreaRow,
    commitMemberArea,
    deletePhase,
    linkMember,
    removeAreaRow,
    removeMember,
    reorderPhase,
    updateAreaRow,
    updateMemberArea,
    updatePhase,
  };
}
