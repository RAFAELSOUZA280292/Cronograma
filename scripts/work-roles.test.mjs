// Papéis de trabalho (2026-11-02): matriz de permissões. Puro (sem banco): o servidor de teste só sobe o roteador do CRM com um login falso,
// e a checagem de acesso (need('read')) acontece antes de qualquer consulta. Rodar: node scripts/work-roles.test.mjs
import assert from 'node:assert/strict';
import express from 'express';
import { createCrmRouter } from '../server/crm/routes.js';
import { crmCan, crmCapabilities, crmRoleOf } from '../server/crm/permissions.js';
import { rowToUser } from '../server/auth.js';
import { canOpenMode } from '../src/lib/routes.js';
import { createRegistry } from '../server/renata/registry.js';
import { registerCrm } from '../server/renata/tools/crm.js';
import { registerPlataforma } from '../server/renata/tools/plataforma.js';
import { CRM_BLOCKED_MSG, ROLE_MATRIX, MODULES, WORK_ROLES, accessChanges, effectiveAccess, previewWorkRole, workRoleProblem, workRoleSideEffects } from '../shared/workRoles.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

const base = { orgId: 'org-x', blocked: false, companiesAccess: true, allCompaniesAccess: false, personalAccess: true, xflowRole: '' };
const socio = { ...base, id: 'u-socio', name: 'Sócio', role: 'pricetax', workRole: 'socio', crmRole: '', companiesAccess: true, allCompaniesAccess: true, xflowRole: 'gestao' };
const socioMaster = { ...socio, id: 'u-socio-m', role: 'master' };
const comercial = { ...base, id: 'u-com', name: 'Comercial', role: 'pricetax', workRole: 'comercial', crmRole: 'vendedor' };
const operacoes = { ...base, id: 'u-ops', name: 'Operações', role: 'pricetax', workRole: 'operacoes', crmRole: 'admin' };
const semPapel = { ...base, id: 'u-sem', name: 'Sem papel', role: 'pricetax', workRole: '', crmRole: 'consultor' };
const superOps = { ...operacoes, id: 'u-super', isSuperAdmin: true, role: 'master' };

// 1. Regra única do CRM (crmRoleOf): vale para a tela, as rotas, a chave de API, a RENATA, o briefing, a ficha 360 e a sugestão de contatos do e-mail.
eq(crmRoleOf(operacoes), '', 'Operações não tem CRM mesmo com crm_role=admin');
eq(crmRoleOf(socio), 'admin', 'Sócio é administrador do CRM');
eq(crmRoleOf(socioMaster), 'admin', 'Sócio master é administrador do CRM');
eq(crmRoleOf(comercial), 'admin', 'Comercial é dona do CRM (administradora)');
eq(crmRoleOf(semPapel), 'consultor', 'sem papel: regra antiga (crm_role)');
eq(crmRoleOf({ ...semPapel, role: 'master' }), 'admin', 'master sem papel continua administrador');
eq(crmRoleOf(superOps), 'admin', 'Super Administrador nunca é trancado por papel');
eq(crmRoleOf({ ...socio, role: 'cliente' }), '', 'cliente nunca tem CRM, nem com papel');
for (const cap of ['read', 'write', 'remove', 'import', 'export', 'admin', 'catalog', 'funnel']) {
  ok(!crmCan(operacoes, cap), `Operações sem "${cap}" no CRM`);
  ok(crmCan(socio, cap), `Sócio com "${cap}" no CRM`);
  ok(crmCan(comercial, cap), `Comercial com "${cap}" no CRM`);
}
const capsSocio = crmCapabilities(socio);
ok(Object.entries(capsSocio).filter(([k]) => !['lenses', 'role', 'roleLabel'].includes(k)).every(([, v]) => v === true), 'Sócio vê todas as capacidades do CRM');

// 2. rowToUser (o que /auth/me manda ao navegador): crmAccess segue o papel.
const row = (extra) => ({ id: 'r1', username: 'x', name: 'X', role: 'pricetax', crm_role: 'admin', work_role: '', is_super_admin: false, ...extra });
eq(rowToUser(row({ work_role: 'operacoes' })).crmAccess, false, 'linha de Operações sai sem crmAccess');
eq(rowToUser(row({ work_role: 'operacoes' })).workRole, 'operacoes', 'workRole vai para o navegador');
eq(rowToUser(row({ work_role: 'comercial', crm_role: '' })).crmAccess, true, 'Comercial sai com crmAccess');
eq(rowToUser(row({ work_role: 'socio', crm_role: '' })).crmAccess, true, 'Sócio sai com crmAccess');
eq(rowToUser(row({ crm_role: '' })).crmAccess, false, 'sem papel e sem crm_role: sem CRM (como antes)');

// 3. Telas (canOpenMode): Operações nunca abre o CRM por menu ou endereço; Sócio abre tudo.
const MODES = ['company', 'personal', 'xflow', 'agenda', 'mail', 'whatsapp', 'macro', 'knowledge', 'pareceres', 'modelos', 'crm', 'users', 'ops'];
const socioFront = { ...socioMaster, crmAccess: true };
for (const m of MODES) ok(canOpenMode(m, socioFront), `Sócio (master) abre ${m}`);
const opsFront = { ...operacoes, crmAccess: true }; // mesmo se o navegador recebesse crmAccess por engano
ok(!canOpenMode('crm', opsFront), 'Operações não abre o CRM nem com crmAccess=true');
for (const m of ['company', 'personal', 'agenda', 'mail']) ok(canOpenMode(m, opsFront), `Operações abre ${m}`);
ok(canOpenMode('crm', { ...comercial, crmAccess: true }), 'Comercial abre o CRM');

// 4. Rotas /api/crm: todas as rotas do roteador respondem 403 (em português) para Operações, antes de tocar no banco.
const app = express();
app.use(express.json());
app.use('/api/crm', createCrmRouter({ auth: [(req, res, next) => { req.user = JSON.parse(req.get('x-test-user')); next(); }] }));
const server = app.listen(0);
const port = server.address().port;
const crmRouter = createCrmRouter({ auth: [(req, res, next) => next()] });
const routes = [];
for (const layer of crmRouter.stack) {
  if (!layer.route) continue;
  for (const method of Object.keys(layer.route.methods)) routes.push([method.toUpperCase(), layer.route.path]);
}
ok(routes.length > 80, `o roteador do CRM tem ${routes.length} rotas (esperado > 80)`);
const fill = (p) => String(p).replace(/:([A-Za-z]+)/g, (_, k) => (/cnpj/i.test(k) ? '00000000000191' : '11111111-1111-4111-8111-111111111111'));
async function call(user, method, path) {
  const r = await fetch(`http://127.0.0.1:${port}/api/crm${fill(path)}`, {
    method, headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(user) }, body: ['GET', 'HEAD'].includes(method) ? undefined : '{}',
  });
  let body = null; try { body = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, body };
}
let denied = 0;
for (const [method, path] of routes) {
  const r = await call(operacoes, method, path);
  assert.equal(r.status, 403, `${method} ${path} deveria dar 403 para Operações (deu ${r.status})`);
  assert.equal(r.body && r.body.message, CRM_BLOCKED_MSG, `${method} ${path}: mensagem em português do papel`);
  denied += 1;
}
n += denied;
const me = await call(socio, 'GET', '/me');
eq(me.status, 200, 'Sócio passa pela trava do CRM (/me)');
ok(me.body.capabilities.admin && me.body.capabilities.funnel && me.body.capabilities.export, 'Sócio recebe as capacidades de administrador');
const meCom = await call(comercial, 'GET', '/me');
eq(meCom.body.capabilities.role, 'admin', 'Comercial recebe o papel administrador do CRM');
const meSem = await call({ ...semPapel, crmRole: '' }, 'GET', '/me');
eq(meSem.status, 403, 'sem papel e sem crm_role continua barrado');
ok(meSem.body.message !== CRM_BLOCKED_MSG, 'quem não é de Operações recebe a mensagem antiga');
server.close();

// 5. RENATA: as ferramentas do CRM somem para Operações, e o acesso genérico recusa caminhos do CRM.
const reg = createRegistry();
registerCrm(reg);
registerPlataforma(reg);
const crmTools = reg.all().filter((t) => t.module === 'CRM');
ok(crmTools.length > 20, `${crmTools.length} ferramentas do CRM no catálogo`);
eq(reg.forUser(operacoes).filter((t) => t.module === 'CRM').length, 0, 'Operações não vê nenhuma ferramenta do CRM');
eq(reg.forUser(socio).filter((t) => t.module === 'CRM').length, crmTools.filter((t) => !t.internal).length, 'Sócio vê todas as ferramentas do CRM');
for (const [tool, input] of [['plataforma_consultar', { path: '/api/crm/companies' }], ['plataforma_consultar', { path: '/api/connect/crm/deals' }], ['plataforma_executar', { method: 'POST', path: '/api/crm/notes', body: {}, descricao: 'x' }]]) {
  const r = await reg.get(tool).run({ user: operacoes, actionId: 'a1' }, input);
  eq([r.status, r.json.message], [400, CRM_BLOCKED_MSG], `${tool} ${input.path} recusado para Operações`);
}
const rotas = await reg.get('plataforma_rotas').run({ user: operacoes }, { q: 'crm' });
ok(rotas.json.rotas.every((r) => !/\/api\/crm/.test(r)), 'plataforma_rotas não lista rotas do CRM para Operações');

// 6. Matriz da tela e regras de gravação.
for (const role of [...WORK_ROLES, '']) for (const m of MODULES) ok(['sim', 'nao', 'cadastro'].includes(ROLE_MATRIX[role][m.key]), `matriz ${role || 'sem papel'} × ${m.key}`);
eq(ROLE_MATRIX.operacoes.crm, 'nao', 'matriz: Operações sem CRM');
ok(Object.values(ROLE_MATRIX.socio).every((v) => v !== 'nao'), 'matriz: Sócio sem nenhum "não"');
eq(effectiveAccess({ ...operacoes, crmAccess: false }).crm, false, 'acesso efetivo de Operações: sem CRM');
eq(workRoleProblem('operacoes', { role: 'master' }) !== '', true, 'master não vira Operações');
eq(workRoleProblem('socio', { role: 'cliente' }) !== '', true, 'cliente não recebe papel');
eq(workRoleProblem('chefe', { role: 'pricetax' }), 'Papel de trabalho inválido.', 'papel desconhecido recusado');
eq(workRoleProblem('', { role: 'master' }), '', 'tirar o papel é sempre permitido');
eq(workRoleSideEffects('socio'), { companiesAccess: true, allCompaniesAccess: true, personalAccess: true }, 'Sócio ganha empresas e atividades');

// 7. Prévia do diálogo de troca de papel (mesma regra do servidor).
for (const u of [operacoes, socio, comercial, semPapel, superOps, { ...semPapel, role: 'master' }]) {
  for (const role of [...WORK_ROLES, '']) {
    const fromServer = !!crmRoleOf({ ...u, workRole: role });
    eq(previewWorkRole(u, role).crmAccess, fromServer, `prévia do CRM de ${u.name}${u.role === 'master' ? ' (master)' : ''} → ${role || 'sem papel'} igual ao servidor`);
  }
}
eq(accessChanges({ ...comercial, crmAccess: true }, 'operacoes'), ['Deixa de ver: CRM (tela, busca, cockpit, RENATA, sugestão de contatos)'], 'Comercial → Operações: só perde o CRM');
ok(accessChanges({ ...operacoes, companiesAccess: false, crmAccess: false }, 'socio').includes('Passa a ver: Cronogramas (Empresas)'), 'Operações → Sócio: ganha empresas');

console.log(`ok: ${n} verificações (${denied} rotas do CRM com 403 para Operações)`);
