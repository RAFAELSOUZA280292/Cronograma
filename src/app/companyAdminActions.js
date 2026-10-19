// Ações de administração de empresas (criar, criar grupo, clonar, excluir e editar campos).
// Extraído de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"). É uma FÁBRICA chamada a cada render: recebe o estado e as funções
// atuais do AppScreens e devolve as ações — o mesmo código de antes, em outro arquivo (as funções são recriadas a cada render, como sempre foram).
import { apiDelete, apiPost } from '../lib/api.js';
import { notify } from '../ui/dialogs.jsx';
import { COMPANY_STATUS_META, addDays, normalizeProject, parseDate, toISODate, todayISOStr, uid } from '../App.jsx';

export function createCompanyAdminActions({
  actingOrg,
  currentUser,
  mutateProject,
  organizations,
  projects,
  pushAppUndoToast,
  pushLocation,
  setCompanySelectionConfirmed,
  setProjects,
  setSelectedProjectIds,
  withActingOrg,
}) {
  // Responsável padrão de empresa nova = quem cadastrou (equipe PRICETAX), exceto quando cadastra em OUTRA organização.
  function withDefaultOwner(companyBody, orgId) {
    const currentOrg = actingOrg ? actingOrg.id : currentUser.orgId;
    const staff = currentUser && (currentUser.role === 'master' || currentUser.role === 'pricetax');
    if (!staff || (orgId && orgId !== currentOrg) || (Array.isArray(companyBody.ownerIds) && companyBody.ownerIds.length)) return companyBody;
    return { ...companyBody, ownerIds: [currentUser.id], principalOwnerId: currentUser.id };
  }

  async function createCompany(company) {
    const { orgId, kickoffDate, ...rawBody } = company;
    const companyBody = withDefaultOwner(rawBody, orgId);
    const res = await apiPost(withActingOrg('/api/projects', orgId), { company: companyBody, kickoffDate });
    const currentOrgId = actingOrg ? actingOrg.id : currentUser.orgId;
    const crossOrg = !!orgId && orgId !== currentOrgId;
    if (!crossOrg) {
      setProjects((prev) => [...prev, normalizeProject(res.project)]);
    }
    const org = orgId && organizations.find((o) => o.id === orgId);
    return { id: res.project.id, crossOrg, orgName: org ? org.name : null };
  }

  async function createCompanyGroup({ master, children, groupName }) {
    const masterRes = await createCompany({ ...master, isGroupMaster: true, groupName });
    const masterId = masterRes.id;
    const childIds = [];
    for (const child of children) {
      const childRes = await createCompany({ ...child, groupId: masterId });
      childIds.push(childRes.id);
    }
    return { ids: [masterId, ...childIds], crossOrg: masterRes.crossOrg, orgName: masterRes.orgName };
  }

  async function handleCreateCompanyPayload(payload) {
    if (payload && payload.structureType === 'grupo') {
      const { ids, crossOrg, orgName } = await createCompanyGroup(payload);
      if (!crossOrg) {
        setSelectedProjectIds((prev) => [...prev, ...ids]);
        // Tela de seleção de empresas mantém seleção própria (Set local) que não
        // resincroniza sozinha após o mount — confirmar aqui garante que o usuário
        // caia direto na visão consolidada do grupo recém-criado (sem isso, ficaria
        // preso na tela de seleção com os checkboxes desatualizados).
        setCompanySelectionConfirmed(true);
        pushLocation('company');
      }
      if (crossOrg) notify(`Grupo cadastrado na organização "${orgName}".`, { tone: 'success' });
      return;
    }
    const { id, crossOrg, orgName } = await createCompany(payload);
    if (!crossOrg) setSelectedProjectIds((prev) => [...prev, id]);
    if (crossOrg) notify(`Empresa cadastrada na organização "${orgName}".`, { tone: 'success' });
  }

  async function cloneCompany(sourceId, company) {
    const source = projects.find((p) => p.id === sourceId);
    if (!source) throw new Error('Empresa de origem não encontrada.');

    const sourceDates = source.activities.map((a) => a.date).filter(Boolean);
    const anchor = sourceDates.length ? sourceDates.reduce((min, d) => (d < min ? d : min)) : null;
    const newAnchor = toISODate(addDays(parseDate(todayISOStr()), 10));
    const deltaDays = anchor ? Math.round((parseDate(newAnchor) - parseDate(anchor)) / 86400000) : 0;
    const shift = (iso) => (iso ? toISODate(addDays(parseDate(iso), deltaDays)) : iso);

    const activities = source.activities.map((a) => ({
      ...a,
      id: uid('m'),
      date: shift(a.date),
      endDate: shift(a.endDate),
      status: 'nao-iniciado',
      notes: '',
      attachments: [],
      comments: [],
      transcript: '',
      clientDateConfirmed: false,
      subactivities: (a.subactivities || []).filter((s) => !s.deleted).map((s) => ({ ...s, id: uid('s'), done: false, date: shift(s.date) })),
    }));

    const team = source.team.map((m) => ({ ...m, id: uid('team') }));

    const { orgId, ...rawBody } = company;
    const companyBody = withDefaultOwner(rawBody, orgId);
    const res = await apiPost(withActingOrg('/api/projects', orgId), {
      company: companyBody,
      activities,
      phases: source.phases,
      team,
      log: [{ ts: new Date().toISOString(), action: `Cronograma clonado a partir de "${source.company.name || 'empresa sem nome'}"`, user: currentUser ? currentUser.name : '' }],
    });
    const currentOrgId = actingOrg ? actingOrg.id : currentUser.orgId;
    const crossOrg = !!orgId && orgId !== currentOrgId;
    if (!crossOrg) {
      setProjects((prev) => [...prev, normalizeProject(res.project)]);
    }
    const org = orgId && organizations.find((o) => o.id === orgId);
    return { id: res.project.id, crossOrg, orgName: org ? org.name : null };
  }

  async function deleteCompany(id) {
    await apiDelete(`/api/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedProjectIds((prev) => prev.filter((pid) => pid !== id));
  }

  function updateCompanyFields(pid, patch) {
    const target = projects.find((p) => p.id === pid);
    const label = patch.name || (target && target.company.name) || 'empresa';
    const prevStatus = target ? (target.company.status || 'ativo') : 'ativo';
    const nextStatus = patch.status !== undefined ? patch.status : prevStatus;
    const statusChanging = patch.status !== undefined && nextStatus !== prevStatus;
    mutateProject(pid, (p) => {
      let activities = p.activities;
      if (statusChanging && nextStatus === 'pausado') {
        // Pausa em cascata: guarda o status anterior de cada atividade ativa (não concluída,
        // não excluída, ainda não pausada individualmente) pra poder restaurar exatamente ao retomar.
        activities = p.activities.map((a) => (
          a.deleted || a.status === 'pausado' || a.status === 'concluido'
            ? a
            : { ...a, statusBeforePause: a.status || 'nao-iniciado', status: 'pausado' }
        ));
      } else if (statusChanging && nextStatus === 'ativo') {
        activities = p.activities.map((a) => (
          a.statusBeforePause ? { ...a, status: a.statusBeforePause, statusBeforePause: '' } : a
        ));
      }
      return { ...p, company: { ...p.company, ...patch }, activities };
    }, statusChanging
      ? `Status da empresa alterado para: ${COMPANY_STATUS_META[nextStatus].label}${nextStatus === 'pausado' ? ' — atividades em andamento pausadas' : ' — atividades pausadas retomadas'}`
      : `Dados da empresa "${label}" atualizados`);
    if (statusChanging && nextStatus === 'pausado') {
      pushAppUndoToast(`"${label}" pausada e arquivada: some da lista principal (veja em "Pausadas e arquivadas") e as atividades em andamento foram pausadas junto.`, () => updateCompanyFields(pid, { status: 'ativo', resumeDate: '' }), 8000);
    }
  }

  return { cloneCompany, deleteCompany, handleCreateCompanyPayload, updateCompanyFields };
}
