// Ações de administração de usuários e organizações.
// Extraído de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"). É uma FÁBRICA chamada a cada render: recebe o estado e as funções
// atuais do AppScreens e devolve as ações — o mesmo código de antes, em outro arquivo (as funções são recriadas a cada render, como sempre foram).
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js';
import { fmtDate } from '../App.jsx';

export function createUserOrgActions({
  actingOrg,
  addUsersLog,
  currentUser,
  organizations,
  pushLocation,
  setActingOrg,
  setCompanySelectionConfirmed,
  setOrgAdminError,
  setOrganizations,
  setSelectedProjectIds,
  setShowOrgAdmin,
  setUserAccess,
  setUsers,
  setUsersPanelError,
  setWorkspaceMode,
  users,
  withActingOrg,
  workspaceMode,
}) {
  async function loadUsers() {
    try {
      const res = await apiGet(withActingOrg('/api/users'));
      setUsers(res.users);
      setUserAccess(res.access || {});
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function addUser(draft) {
    const { orgId, ...body } = draft;
    try {
      const res = await apiPost(withActingOrg('/api/users', orgId), body);
      const currentOrgId = actingOrg ? actingOrg.id : currentUser.orgId;
      if (!orgId || orgId === currentOrgId) {
        setUsers((prev) => [...prev, res.user]);
      }
      const org = orgId && organizations.find((o) => o.id === orgId);
      addUsersLog(`Usuário criado: ${res.user.name}${org ? ` (organização ${org.name})` : ''}`);
      setUsersPanelError('');
      return { crossOrg: !!orgId && orgId !== currentOrgId, orgName: org ? org.name : null };
    } catch (e) {
      return { error: e.message || 'Não foi possível criar o usuário.' };
    }
  }

  async function loadOrganizations() {
    try {
      const res = await apiGet('/api/organizations');
      setOrganizations(res.organizations);
      setOrgAdminError('');
    } catch (e) {
      setOrgAdminError(e.message);
    }
  }

  async function createOrganization(data) {
    try {
      const res = await apiPost('/api/organizations', data);
      setOrganizations((prev) => [...prev, { ...res.organization, userCount: 0, projectCount: 0 }]);
      setOrgAdminError('');
      return res.organization;
    } catch (e) {
      setOrgAdminError(e.message);
      return null;
    }
  }

  async function updateOrganizationStatus(id, status) {
    try {
      const res = await apiPatch(`/api/organizations/${id}`, { status });
      setOrganizations((prev) => prev.map((o) => (o.id === id ? res.organization : o)));
      setOrgAdminError('');
    } catch (e) {
      setOrgAdminError(e.message);
    }
  }

  function enterOrganization(org) {
    const toUsers = workspaceMode === 'users';
    setActingOrg({ id: org.id, name: org.displayName || org.name });
    setShowOrgAdmin(false);
    setCompanySelectionConfirmed(false);
    setSelectedProjectIds([]);
    setWorkspaceMode(toUsers ? 'users' : 'company');
    pushLocation(toUsers ? 'users' : 'company:select');
  }

  function exitOrganization() {
    setActingOrg(null);
    setCompanySelectionConfirmed(false);
    setSelectedProjectIds([]);
    pushLocation('company:select');
  }

  async function updateUser(id, patch) {
    try {
      const res = await apiPatch(`/api/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.user : u)));
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function toggleUserBlock(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const nextBlocked = !u.blocked;
    try {
      const res = await apiPost(`/api/users/${id}/block`, { blocked: nextBlocked, blockReason: u.blockReason });
      setUsers((prev) => prev.map((x) => (x.id === id ? res.user : x)));
      addUsersLog(nextBlocked ? `Usuário bloqueado: ${u.name}` : `Usuário desbloqueado: ${u.name}`);
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function renewUser(id, days) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    try {
      const res = await apiPost(`/api/users/${id}/renew`, { days: days || 30 });
      setUsers((prev) => prev.map((x) => (x.id === id ? res.user : x)));
      addUsersLog(`Acesso renovado: ${u.name} até ${fmtDate(res.user.expiresAt)}`);
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function toggleUserCnpj(id, cnpj) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const has = (u.allowedCnpjs || []).includes(cnpj);
    const nextList = has ? u.allowedCnpjs.filter((c) => c !== cnpj) : [...(u.allowedCnpjs || []), cnpj];
    try {
      const res = await apiPatch(`/api/users/${id}`, { allowedCnpjs: nextList });
      setUsers((prev) => prev.map((x) => (x.id === id ? res.user : x)));
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function resetUserPassword(id, newPassword) {
    try {
      await apiPost(`/api/users/${id}/reset-password`, { newPassword });
      const u = users.find((x) => x.id === id);
      addUsersLog(`Senha redefinida: ${u ? u.name : id}`);
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function deleteUser(id) {
    if (id === currentUser.id) return 'Você não pode remover a si mesmo.';
    const target = users.find((u) => u.id === id);
    const masters = users.filter((u) => u.role === 'master' && !u.blocked);
    if (target && target.role === 'master' && !target.blocked && masters.length <= 1) return 'Este é o único administrador (Master) ativo. Crie outro antes de remover este.';
    try {
      await apiDelete(`/api/users/${id}`);
      // O servidor desativa a conta (não apaga): ela continua na lista, bloqueada, com o motivo.
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, blocked: true, blockReason: 'Conta removida pelo administrador' } : u)));
      if (target) addUsersLog(`Usuário desativado: ${target.name}`);
      return '';
    } catch (e) {
      return e.message || 'Não foi possível remover o usuário.';
    }
  }

  return {
    addUser,
    createOrganization,
    deleteUser,
    enterOrganization,
    exitOrganization,
    loadOrganizations,
    loadUsers,
    renewUser,
    resetUserPassword,
    toggleUserBlock,
    toggleUserCnpj,
    updateOrganizationStatus,
    updateUser,
  };
}
