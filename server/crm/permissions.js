// Permissões do CRM (2026-09-20, ver PROJECT_CONTEXT.md §54). Coluna própria
// `users.crm_role` (vazio = sem acesso), no mesmo espírito dos acessos
// independentes de Empresas/Atividades/XFlow — o `role` do usuário só decide
// que master/super admin são administradores do CRM automaticamente e que
// 'cliente' NUNCA acessa, mesmo com crm_role preenchido.
export const CRM_ROLES = ['admin', 'diretor', 'gestor', 'vendedor', 'consultor', 'financeiro', 'visualizacao'];

export const CRM_ROLE_LABELS = {
  admin: 'Administrador', diretor: 'Diretor', gestor: 'Gestor Comercial', vendedor: 'Vendedor',
  consultor: 'Consultor', financeiro: 'Financeiro', visualizacao: 'Visualização',
};

const CAPABILITIES = {
  read: CRM_ROLES,
  write: ['admin', 'diretor', 'gestor', 'vendedor', 'consultor'],
  remove: ['admin', 'diretor', 'gestor'],
  import: ['admin', 'diretor', 'gestor'],
  admin: ['admin'],
  // Catálogo de produtos (Fase 2): quem define o que a PRICETAX vende.
  catalog: ['admin', 'diretor', 'gestor'],
};

export function crmRoleOf(user) {
  if (!user || user.role === 'cliente') return '';
  if (user.role === 'master' || user.isSuperAdmin) return 'admin';
  return CRM_ROLES.includes(user.crmRole) ? user.crmRole : '';
}

export function crmCan(user, capability) {
  const role = crmRoleOf(user);
  return !!role && (CAPABILITIES[capability] || []).includes(role);
}

export function crmCapabilities(user) {
  const role = crmRoleOf(user);
  return {
    role,
    roleLabel: CRM_ROLE_LABELS[role] || '',
    read: crmCan(user, 'read'), write: crmCan(user, 'write'), remove: crmCan(user, 'remove'),
    import: crmCan(user, 'import'), admin: crmCan(user, 'admin'), catalog: crmCan(user, 'catalog'),
  };
}
