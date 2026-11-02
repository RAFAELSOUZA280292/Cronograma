// Papéis de trabalho (2026-11-02, pedido do Rafael: valem a partir de 03/11). Convivem com o perfil técnico (`role`: master/pricetax/cliente),
// com o Super Administrador e com os acessos por módulo (Empresas, Gestão de Atividades, XFlow, crm_role). Vazio = "sem papel": tudo segue
// como antes (o crm_role decide o CRM). Usado pelo servidor (crm/permissions.js, rotas de usuários) e pela tela de usuários.
// Fase 1: só controle de acesso. Ler a caixa de outra pessoa, classificar e-mails e o radar de negócios são as Fases 2 a 4.

export const WORK_ROLES = ['socio', 'comercial', 'operacoes'];

export const WORK_ROLE_META = {
  socio: { label: 'Sócio', color: '#F5C400', desc: 'Acesso a tudo: todas as empresas, atividades, agenda, e-mail próprio e o CRM como administrador.' },
  comercial: { label: 'Comercial', color: '#5B8DEF', desc: 'Dona do CRM junto com os sócios (administradora do CRM), além de agenda, atividades e e-mail próprio.' },
  operacoes: { label: 'Operações', color: '#3ecf6e', desc: 'Cronogramas, atividades, agenda e e-mail próprio. Sem CRM em nenhuma tela, busca, cockpit ou pela RENATA.' },
  '': { label: 'Sem papel', color: 'var(--text-5)', desc: 'Regra antiga: o acesso ao CRM depende do "Acesso ao CRM" do cadastro.' },
};

export const workRoleOf = (user) => (user && WORK_ROLES.includes(user.workRole) ? user.workRole : '');

export function workRoleLabel(role) {
  return (WORK_ROLE_META[role] || WORK_ROLE_META['']).label;
}

// Operações nunca entra no CRM (nem com crm_role preenchido); o Super Administrador nunca é trancado por papel.
export function crmBlockedByWorkRole(user) {
  return !!user && workRoleOf(user) === 'operacoes' && !user.isSuperAdmin;
}

// Mensagem do 403 do CRM para quem é de Operações (rotas /api/crm, chave de API, RENATA).
export const CRM_BLOCKED_MSG = 'O CRM não faz parte do papel Operações. Se precisar de algum dado do CRM, peça a um sócio ou à área Comercial.';

// O que muda junto com o papel ao gravar (rota PATCH /api/users/:id). Sócio passa a ver todas as empresas e a Gestão de Atividades.
export function workRoleSideEffects(role) {
  if (role === 'socio') return { companiesAccess: true, allCompaniesAccess: true, personalAccess: true };
  if (role === 'operacoes') return { personalAccess: true };
  return {};
}

// Validação do papel pedido para uma pessoa: devolve a mensagem de erro (ou '' se pode).
export function workRoleProblem(role, target) {
  if (!WORK_ROLES.includes(role) && role !== '') return 'Papel de trabalho inválido.';
  if (role && target && target.role === 'cliente') return 'Cliente não recebe papel de trabalho da equipe.';
  if (role === 'operacoes' && target && (target.role === 'master' || target.isSuperAdmin)) return 'Administrador (Master) não pode ficar em Operações: tire o perfil Master antes.';
  return '';
}

// Matriz "quem acessa o quê" mostrada na tela de usuários. 'sim' | 'nao' | 'cadastro' (depende do acesso marcado no cadastro da pessoa).
export const MODULES = [
  { key: 'company', label: 'Cronogramas (Empresas)' },
  { key: 'personal', label: 'Gestão de Atividades' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'mail', label: 'E-mail (a própria caixa)' },
  { key: 'whatsapp', label: 'WhatsApp (caixas de que participa)' },
  { key: 'library', label: 'Conhecimento, Pareceres e Modelos' },
  { key: 'xflow', label: 'XFlow' },
  { key: 'crm', label: 'CRM (tela, busca, cockpit, RENATA, sugestão de contatos)' },
  { key: 'users', label: 'Usuários e permissões' },
];

export const ROLE_MATRIX = {
  socio: { company: 'sim', personal: 'sim', agenda: 'sim', mail: 'sim', whatsapp: 'sim', library: 'sim', xflow: 'cadastro', crm: 'sim', users: 'cadastro' },
  comercial: { company: 'cadastro', personal: 'cadastro', agenda: 'sim', mail: 'sim', whatsapp: 'sim', library: 'sim', xflow: 'cadastro', crm: 'sim', users: 'cadastro' },
  operacoes: { company: 'cadastro', personal: 'sim', agenda: 'sim', mail: 'sim', whatsapp: 'sim', library: 'sim', xflow: 'cadastro', crm: 'nao', users: 'cadastro' },
  '': { company: 'cadastro', personal: 'cadastro', agenda: 'sim', mail: 'sim', whatsapp: 'sim', library: 'sim', xflow: 'cadastro', crm: 'cadastro', users: 'cadastro' },
};

export const MATRIX_NOTES = {
  xflow: 'Papel do XFlow marcado no cadastro.',
  users: 'Só quem tem o perfil técnico Master.',
  company: 'Acesso a Empresas marcado no cadastro.',
  personal: 'Gestão de Atividades marcada no cadastro.',
  crm: '"Acesso ao CRM" marcado no cadastro.',
};

// Acesso efetivo de UMA pessoa a cada módulo (a mesma regra de canOpenMode + crmRoleOf, sem importar o servidor).
export function effectiveAccess(user) {
  if (!user) return {};
  const staff = user.role === 'master' || user.role === 'pricetax';
  return {
    company: !!user.companiesAccess,
    personal: !!user.personalAccess,
    agenda: true,
    mail: staff,
    whatsapp: staff,
    library: staff,
    xflow: !!user.xflowRole,
    crm: !!user.crmAccess,
    users: user.role === 'master',
  };
}

// Prévia de quem a pessoa vira com outro papel (diálogo de confirmação da tela): CRM com a mesma regra de crmRoleOf + efeitos colaterais.
export function previewWorkRole(user, role) {
  const fx = workRoleSideEffects(role);
  const next = { ...user, workRole: role, ...Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, v || !!user[k]])) };
  const crm = user.role === 'cliente' ? false : user.isSuperAdmin ? true
    : role === 'operacoes' ? false : (user.role === 'master' || role === 'socio' || role === 'comercial' || !!user.crmRole);
  return { ...next, crmAccess: crm };
}

// Linhas "o que muda" entre o acesso atual e o do papel novo (só módulos que mudam).
export function accessChanges(user, role) {
  const before = effectiveAccess(user);
  const after = effectiveAccess(previewWorkRole(user, role));
  return MODULES.filter((m) => before[m.key] !== after[m.key]).map((m) => `${after[m.key] ? 'Passa a ver' : 'Deixa de ver'}: ${m.label}`);
}
