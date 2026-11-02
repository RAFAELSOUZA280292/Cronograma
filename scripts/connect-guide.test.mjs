// Teste puro do catálogo da API de conectividade (shared/connectCatalog.js) e das instruções do botão (src/connect/guide.js), §129:
// toda rota anunciada existe no código, o filtro por chave nunca mostra o que ela não pode, o OpenAPI 3.1 é coerente e o texto para a IA
// tem o início rápido, as regras e os exemplos certos para cada tipo de chave. Rodar: node scripts/connect-guide.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOG, actionsFor, buildDocsMarkdown, buildOpenApi, capsFor, canWriteSomething, matchCatalog } from '../shared/connectCatalog.js';
import { buildGuide } from '../src/connect/guide.js';

let Ajv = null;
try { Ajv = (await import('ajv/dist/2020.js')).default; } catch { /* ajv é dependência indireta; sem ele, a verificação de schema é pulada */ }

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const base = 'https://painel.exemplo';

const admin = { role: 'master', companiesAccess: true, personalAccess: true };
const ops = { role: 'pricetax', companiesAccess: true, personalAccess: true, workRole: 'operacoes' };
const crmAdmin = { read: true, admin: true };
const noCrm = { read: false, admin: false };

ok('toda rota do catálogo existe em server/connect.js ou no CRM (mesmo método)', () => {
  const connect = read('server/connect.js');
  const crm = read('server/crm/routes.js');
  for (const e of CATALOG) {
    const express = e.path.replace(/\{(\w+)\}/g, ':$1');
    const crmPath = express.startsWith('/api/connect/crm/') ? express.slice('/api/connect/crm'.length) : null;
    const src = crmPath ? crm : connect;
    const rel = crmPath || express.slice('/api/connect'.length) || '/';
    assert.ok(src.includes(`router.${e.method.toLowerCase()}('${rel}'`), `${e.method} ${e.path}`);
  }
});

ok('ids e caminho+método únicos', () => {
  assert.equal(new Set(CATALOG.map((e) => e.id)).size, CATALOG.length);
  assert.equal(new Set(CATALOG.map((e) => `${e.method} ${e.path}`)).size, CATALOG.length);
});

ok('chave "Ler tudo" de quem lê o CRM: nada que grava aparece', () => {
  const caps = capsFor('read_all', admin, crmAdmin);
  const list = actionsFor(caps);
  assert.ok(list.length > 10);
  assert.ok(list.every((e) => !e.writes), list.filter((e) => e.writes).map((e) => e.id).join(','));
  assert.equal(canWriteSomething(caps), false);
  assert.ok(list.some((e) => e.id === 'crm.deals.list') && list.some((e) => e.id === 'team-day'));
});

ok('dono sem CRM (Operações) nunca vê rota do CRM, nem com "Ler e editar tudo"', () => {
  for (const sc of ['read_all', 'write_all', 'crm_operate']) assert.ok(!actionsFor(capsFor(sc, { ...ops, role: 'master' }, noCrm)).some((e) => e.group === 'crm'), sc);
});

ok('"Ler e editar tudo" de administrador traz as gravações e as rotas de prévia', () => {
  const ids = actionsFor(capsFor('write_all', admin, crmAdmin)).map((e) => e.id);
  for (const id of ['activities.create', 'board.plan', 'companies.plan', 'meetings.edit', 'crm.notes.create', 'crm.deals.move']) assert.ok(ids.includes(id), id);
});

ok('dono sem acesso a Empresas e sem quadro pessoal: só o básico', () => {
  assert.deepEqual(actionsFor(capsFor('write_all', { role: 'pricetax' }, noCrm)).map((e) => e.id).sort(), ['agenda', 'me']);
});

ok('chaves antigas seguem o que o servidor confere', () => {
  assert.equal(canWriteSomething(capsFor('read', admin, crmAdmin)), false);
  assert.ok(actionsFor(capsFor('read', admin, crmAdmin)).every((e) => e.group !== 'crm'));
  const rc = actionsFor(capsFor('read_create', admin, crmAdmin)).map((e) => e.id);
  assert.ok(rc.includes('activities.create') && !rc.includes('companies.plan') && !rc.includes('board.plan'));
  const co = actionsFor(capsFor('crm_operate', admin, crmAdmin)).map((e) => e.id);
  assert.ok(co.includes('crm.deals.create') && !co.includes('activities.create'));
  assert.ok(!actionsFor(capsFor('read_write', { role: 'pricetax', companiesAccess: true }, noCrm)).some((e) => e.id === 'companies.plan'), 'plan é só de administrador');
});

ok('OpenAPI 3.1 coerente: parâmetros de caminho declarados, $ref resolvem, operationId único, 2xx em toda operação', () => {
  const spec = buildOpenApi({ baseUrl: base });
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.servers[0].url, base);
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
  const opIds = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    assert.ok(path.startsWith('/api/connect'));
    const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const [method, op] of Object.entries(item)) {
      assert.ok(['get', 'post', 'put', 'patch', 'delete'].includes(method));
      opIds.push(op.operationId);
      for (const nm of names) assert.ok((op.parameters || []).some((x) => x.name === nm && x.in === 'path' && x.required === true), `${path} ${nm}`);
      for (const r of Object.values(op.responses)) if (r.$ref) assert.equal(r.$ref, '#/components/responses/Error');
      assert.ok(Object.keys(op.responses).some((c) => c.startsWith('2')), `${method} ${path} sem 2xx`);
      if (Ajv && op.requestBody) new Ajv({ strict: false, validateFormats: false, logger: false }).compile(op.requestBody.content['application/json'].schema);
    }
  }
  assert.equal(new Set(opIds).size, opIds.length);
});

ok('OpenAPI e guia filtrados pela chave não citam o que ela não pode', () => {
  const caps = capsFor('read_all', ops, noCrm);
  const spec = JSON.stringify(buildOpenApi({ baseUrl: base, caps, who: 'teste' }));
  const md = buildDocsMarkdown({ baseUrl: base, caps, who: 'teste' });
  for (const s of ['/api/connect/crm', 'board/plan', '/plan"', 'team-day']) assert.ok(!spec.includes(s), s);
  assert.ok(!md.includes('/api/connect/crm') && !md.includes('board/plan'));
});

ok('404/405 orientado: casa o caminho real com o molde do catálogo', () => {
  assert.ok(matchCatalog('/api/connect/companies/proj-1/meetings/m-2').some((e) => e.id === 'meetings.get'));
  assert.ok(matchCatalog('/api/connect/crm/deals/export.xlsx').some((e) => e.id === 'crm.deals.export'));
  assert.equal(matchCatalog('/api/connect/inexistente').length, 0);
});

const flagsFull = { canCreate: true, canWrite: true, canCrm: true, canTranscripts: true, canMeetingsEdit: true, readAll: true, canBoard: true, canTeam: true };
const full = buildGuide({ baseUrl: base, scopeLabel: 'Ler e editar tudo', ...flagsFull });
const ro = buildGuide({ baseUrl: base, scopeLabel: 'Ler tudo', readAll: true, canTeam: true });
const opsGuide = buildGuide({ baseUrl: base, scopeLabel: 'Ler tudo' });
const KEY = 'pxk_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';
const withKey = buildGuide({ baseUrl: base, token: KEY, ...flagsFull });

ok('instruções: início rápido com URL base, cabeçalho, primeiro GET /api/connect, OpenAPI e docs', () => {
  for (const s of [`\`${base}\``, 'Authorization: Bearer', 'curl -s "$PRICETAX_URL/api/connect"', '/api/connect/openapi.json', '/api/connect/docs', 'Primeiro, sempre']) assert.ok(full.includes(s), s);
});
ok('instruções: regras (não inventar, respeitar leitura) e configuração por ferramenta', () => {
  for (const s of ['Não invente', 'só de leitura', 'Claude Code', 'ChatGPT', 'Gemini', 'Base44']) assert.ok(full.includes(s), s);
});
ok('chave só de leitura: avisada e sem exemplo de gravação', () => {
  assert.ok(ro.includes('**só leitura**') && ro.includes('Esta chave é só de leitura'));
  for (const g of [ro, opsGuide]) assert.ok(!/-X (POST|PATCH|PUT|DELETE)/.test(g));
});
ok('três tarefas de exemplo em cada tipo de chave; sem CRM, nenhum exemplo de CRM', () => {
  for (const g of [full, ro, opsGuide]) assert.equal((g.match(/\*\*Pedido:\*\*/g) || []).length, 3);
  assert.ok(!opsGuide.includes('/crm/'));
  assert.ok(full.includes('-X POST "$PRICETAX_URL/api/connect/activities"') && ro.includes('crm/deals?status=open'));
  assert.ok(buildGuide({ baseUrl: base, canCrm: true }).includes('crm/notes'), 'chave só do CRM recebe o exemplo de nota');
});
ok('a chave só entra no "Copiar tudo"; blocos de código fechados', () => {
  assert.ok(!/pxk_[A-Za-z0-9_-]{20,}/.test(full) && full.includes('$PRICETAX_TOKEN'));
  assert.ok(withKey.includes(KEY));
  for (const g of [full, ro, opsGuide, withKey]) assert.equal((g.match(/```/g) || []).length % 2, 0);
});
ok('gravações com prévia explicadas só para quem grava', () => {
  for (const s of ['dryRun', 'digest', 'apply:true']) assert.ok(full.includes(s), s);
  assert.ok(!ro.includes('digest'));
});

console.log(`\n${n} verificações ok`);
