// Teste de ponta a ponta da RENATA operacional (§101), SEM chamar a IA: sobe um servidor próprio (porta 3101, banco local, sandbox) com um "modelo" roteirizado
// (scripts/fixtures/renata-script.mjs) e prova o caminho inteiro: conversa → ferramenta → rotas REAIS → permissões → confirmação → auditoria → desfazer → persistência.
// O que NÃO prova: se a IA de verdade escolhe a ferramenta certa (isso só se mede com a chave da IA).
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/renata.test.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const PORT = 3101; const BASE = `http://127.0.0.1:${PORT}`;
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { adm: `oirt_adm_${RUN}`, vend: `oirt_vend_${RUN}`, cli: `oirt_cli_${RUN}` };
const PROJ = `oirt-proj-${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 400)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const { rows: [orgOk] } = await pool.query('SELECT 1 AS x FROM organizations WHERE id=$1', [ORG]);
if (!orgOk) { console.error('Sem o sandbox local: rode scripts/sandbox-eduarda.mjs antes.'); process.exit(2); }

const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
async function cleanup() {
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  await pool.query('ALTER TABLE renata_actions DISABLE TRIGGER USER');
  const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND (legal_name LIKE 'Teste RENATA%' OR legal_name LIKE 'Zzdup%')`, [ORG]);
  const ids = cs.map((r) => r.id);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND (company_id = ANY($2::uuid[]) OR actor_id LIKE 'oirt_%')`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND actor_id LIKE 'oirt_%'`, [ORG]);
  await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [ids]);
  for (const t of ['crm_activities', 'crm_notes', 'crm_deals', 'crm_contacts']) await pool.query(`DELETE FROM ${t} WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM renata_actions WHERE requester_id LIKE 'oirt_%'`);
  await pool.query(`DELETE FROM renata_conversations WHERE user_id LIKE 'oirt_%'`);
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'oirt_%'`);
  await pool.query(`DELETE FROM notifications WHERE user_id LIKE 'oirt_%'`).catch(() => {});
  await pool.query(`DELETE FROM projects WHERE id=$1`, [PROJ]);
  await pool.query('ALTER TABLE renata_actions ENABLE TRIGGER USER');
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'oirt_%'`);
}

let server;
async function startServer() {
  server = spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(16).toString('hex'), RENATA_SCRIPTED_MODEL: path.join(root, 'scripts/fixtures/renata-script.mjs') }, stdio: ['ignore', 'pipe', 'pipe'] });
  globalThis.__log = '';
  let log = '';
  server.stdout.on('data', (d) => { log += d; globalThis.__log = log; }); server.stderr.on('data', (d) => { log += d; globalThis.__log = log; });
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); try { const r = await fetch(`${BASE}/api/auth/me`); if (r.status === 401) return; } catch { /* ainda subindo */ } }
  throw new Error(`servidor de teste não subiu:\n${log.slice(-800)}`);
}

const call = async (ck, method, p, body, extra = {}) => { const r = await fetch(`${BASE}${p}`, { method, headers: { ...(ck ? { Cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
const sess = {};
const chat = (who, message, conversationId, context) => call(sess[who], 'POST', '/api/renata/chat', { message, conversationId, context });
const decide = (who, convId, decisions) => call(sess[who], 'POST', `/api/renata/conversations/${convId}/decide`, { decisions });
const rows = async (q, p) => (await pool.query(q, p)).rows;
const last = async (user, tool) => (await rows(`SELECT * FROM renata_actions WHERE requester_id=$1 AND tool=$2 ORDER BY requested_at DESC LIMIT 1`, [user, tool]))[0];

try {
  await cleanup();
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,personal_access) VALUES ($1,$1,$2,'Admin Teste RENATA','master',$3,true,true,true)`, [U.adm, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,personal_access,crm_role) VALUES ($1,$1,$2,'Vendedora Teste RENATA','pricetax',$3,true,true,true,'vendedor')`, [U.vend, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,crm_role) VALUES ($1,$1,$2,'Cliente Teste RENATA','cliente',$3,'vendedor')`, [U.cli, hash, ORG]);
  await pool.query(`INSERT INTO projects (id, org_id, data) VALUES ($1,$2,$3::jsonb)`, [PROJ, ORG, JSON.stringify({
    id: PROJ, company: { cnpj: '00.000.000/0001-00', name: 'Empresa Teste RENATA', areas: [] }, phases: [{ id: 'ph1', name: 'Fase 1', color: '#888' }],
    activities: [{ id: 'a1', title: 'Atividade A', status: 'nao-iniciado', phase: 'ph1', date: '2026-10-20', endDate: '2026-10-25', responsible: 'Fulano', subactivities: [], deleted: false }, { id: 'a2', title: 'Atividade B', status: 'nao-iniciado', phase: 'ph1', date: '2026-10-21', endDate: '2026-10-26', responsible: 'Fulano', subactivities: [{ id: 'sA', title: 'Sub A', done: false, date: '2026-11-10', deleted: false }, { id: 'sB', title: 'Sub B', done: false, date: '2026-11-12', predecessors: ['sA'], deleted: false }], deleted: false }],
    team: [{ id: 't1', name: 'Fulano', role: 'Analista' }, { id: 't2', name: 'Beltrano', role: 'Analista' }], meetings: [{ id: 'm1', title: 'Reunião 1', date: '2026-10-20', actionItems: [], deleted: false }], log: [], externalContacts: [] }) ]);
  await startServer();
  for (const [k, id] of Object.entries(U)) { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: PASS }) }); sess[k] = (r.headers.get('set-cookie') || '').split(';')[0]; }
  ok('servidor de teste no ar e logins', Object.values(sess).every(Boolean), globalThis.__log && globalThis.__log.slice(-600));

  // ---- segurança da entrada interna
  ok('cabeçalho interno forjado de fora NÃO autentica (401)', (await call('', 'GET', '/api/crm/me', null, { 'x-renata-internal': 'x'.repeat(64), 'x-renata-user': U.adm })).status === 401);
  ok('status: disponível (modelo roteirizado) e cliente não usa a RENATA operacional', (await call(sess.adm, 'GET', '/api/renata/status')).json.available === true && (await chat('cli', 'oi')).status === 403);
  ok('sem login → 401', (await call('', 'POST', '/api/renata/chat', { message: 'x' })).status === 401);

  // ---- T1: pedido em várias etapas (empresa → negócio), executado direto (baixo risco), com auditoria completa
  const c1 = await chat('adm', '[T1] Cadastre a empresa Teste RENATA Ltda e abra um negócio de R$ 5.000');
  ok('T1: executou empresa + negócio em sequência e respondeu', c1.status === 200 && c1.json.steps.length === 2 && c1.json.steps.every((s) => s.ok) && /Pronto/.test(c1.json.reply), c1.json);
  const co = (await rows(`SELECT id, owner_id FROM crm_companies WHERE org_id=$1 AND legal_name='Teste RENATA Ltda' AND deleted_at IS NULL`, [ORG]))[0];
  const dl = (await rows(`SELECT id, value, title FROM crm_deals WHERE company_id=$1`, [co && co.id]))[0];
  ok('T1: dados de fato gravados no CRM (persistência)', !!co && !!dl && Number(dl.value) === 5000, { co, dl });
  const a1 = await last(U.adm, 'crm_criar_negocio');
  ok('auditoria: executor RENATA, solicitante, comando original, módulo, status, autorização e datas', a1.executor.startsWith('RENATA') && a1.requester_id === U.adm && a1.requester_name === 'Admin Teste RENATA' && a1.command.startsWith('[T1]') && a1.module === 'CRM' && a1.status === 'success' && a1.autorizacao.mode === 'automática' && a1.requested_at && a1.executed_at, a1);
  ok('auditoria: dados anteriores/posteriores (depois guarda o negócio criado)', a1.after && a1.after.deal && a1.after.deal.title === 'Negócio RENATA');
  const crmAudit = await rows(`SELECT DISTINCT actor_name FROM crm_audit_logs WHERE org_id=$1 AND actor_id=$2`, [ORG, U.adm]);
  ok('o histórico do próprio CRM sai como "RENATA (IA, a pedido de …)"', crmAudit.length === 1 && crmAudit[0].actor_name === 'RENATA (IA, a pedido de Admin Teste RENATA)', crmAudit);
  ok('o responsável padrão do negócio que a RENATA cria é quem pediu', (await rows(`SELECT owner_id FROM crm_deals WHERE id=$1`, [dl.id]))[0].owner_id === U.adm);

  // ---- persistência da conversa entre telas/sessões
  const conv = await call(sess.adm, 'GET', `/api/renata/conversations/${c1.json.conversationId}`);
  ok('a conversa persiste: mensagens do usuário e da RENATA, com os passos e status', conv.status === 200 && conv.json.messages[0].role === 'user' && conv.json.messages.filter((m) => m.role === 'assistant').flatMap((m) => m.steps).length === 2 && conv.json.messages.filter((m) => m.role === 'assistant').flatMap((m) => m.steps).every((s) => s.status === 'success'), conv.json);
  const c1b = await chat('adm', '[T1] outra rodada', c1.json.conversationId, { module: 'crm', view: 'deals', entity: { type: 'deal', id: dl.id, title: 'Negócio RENATA' } });
  ok('continuar a MESMA conversa funciona (contexto da tela aceito)', c1b.status === 200 && c1b.json.conversationId === c1.json.conversationId);
  ok('conversa de outra pessoa não é acessível (404)', (await call(sess.vend, 'GET', `/api/renata/conversations/${c1.json.conversationId}`)).status === 404);

  // ---- T4 atualizar + desfazer
  const c4 = await chat('adm', `[T4] atualize deal=${dl.id}`);
  const a4 = await last(U.adm, 'crm_atualizar_negocio');
  ok('T4: atualização de baixo risco executada direto, com antes e depois e "pode desfazer"', c4.json.steps[0].ok && a4.before.value === 5000 && Number(a4.after.deal.value) === 9999 && !!a4.undo, a4);
  const un = await call(sess.adm, 'POST', `/api/renata/actions/${a4.id}/undo`);
  const dl2 = (await rows(`SELECT value FROM crm_deals WHERE id=$1`, [dl.id]))[0];
  ok('desfazer devolve o valor anterior e fica registrado como nova ação', un.status === 200 && Number(dl2.value) === 5000 && (await rows(`SELECT 1 FROM renata_actions WHERE requester_id=$1 AND command LIKE 'Desfazer:%'`, [U.adm])).length === 1);
  ok('não dá para desfazer duas vezes', (await call(sess.adm, 'POST', `/api/renata/actions/${a4.id}/undo`)).status === 400);
  ok('só quem pediu (ou administrador) desfaz', (await call(sess.vend, 'POST', `/api/renata/actions/${a1.id}/undo`)).status === 403);

  // ---- T2 confirmação de ação crítica
  const c2 = await chat('adm', `[T2] exclua o negócio deal=${dl.id}`);
  ok('T2: ação crítica NÃO executa: devolve cartão de confirmação com prévia e o "antes"', c2.json.pending.length === 1 && c2.json.pending[0].risk === 'critical' && /EXCLUIR/.test(c2.json.pending[0].preview) && c2.json.pending[0].before, c2.json);
  ok('T2: nada foi excluído antes da confirmação', (await rows(`SELECT deleted_at FROM crm_deals WHERE id=$1`, [dl.id]))[0].deleted_at === null);
  const pend = await last(U.adm, 'crm_excluir_negocio');
  ok('T2: a pendência está no registro (status pending, autorização aguardando)', pend.status === 'pending' && pend.autorizacao.mode === 'aguardando confirmação');
  ok('T2: outra pessoa NÃO confirma a ação alheia', (await decide('vend', c2.json.conversationId, [{ actionId: pend.id, decision: 'confirm' }])).status === 404);
  const d2 = await decide('adm', c2.json.conversationId, [{ actionId: pend.id, decision: 'confirm' }]);
  const closed = await last(U.adm, 'crm_excluir_negocio');
  ok('T2: confirmado → executou, retomou o plano e respondeu', d2.status === 200 && d2.json.executed[0].ok && /Excluído/.test(d2.json.reply), d2.json);
  ok('T2: negócio excluído de fato (exclusão lógica) e auditoria com a confirmação (quem, quando)', (await rows(`SELECT deleted_at FROM crm_deals WHERE id=$1`, [dl.id]))[0].deleted_at !== null && closed.status === 'success' && closed.autorizacao.mode === 'confirmada pelo usuário' && closed.autorizacao.confirmadaPor.includes(U.adm) && closed.autorizacao.confirmadaEm);
  ok('T2: o registro fechado não pode ser alterado nem apagado (gatilho)', await pool.query(`UPDATE renata_actions SET command='x' WHERE id=$1`, [closed.id]).then(() => false, () => true) && await pool.query(`DELETE FROM renata_actions WHERE id=$1`, [closed.id]).then(() => false, () => true));

  // ---- T12 pendência ignorada
  const co2 = (await call(sess.adm, 'POST', '/api/crm/companies', { legalName: 'Teste RENATA Ignorada Ltda', force: true })).json.company;
  const dl3 = (await call(sess.adm, 'POST', '/api/crm/deals', { companyId: co2.id, title: 'Negócio para ignorar', value: 1 })).json.deal;
  const c12 = await chat('adm', `[T12] exclua deal=${dl3.id}`);
  const c12b = await chat('adm', 'esquece, não exclua nada', c12.json.conversationId);
  const p12 = await last(U.adm, 'crm_excluir_negocio');
  ok('T12: seguir a conversa sem confirmar CANCELA a pendência (e nada é excluído)', c12.json.pending.length === 1 && p12.status === 'cancelled' && (await rows(`SELECT deleted_at FROM crm_deals WHERE id=$1`, [dl3.id]))[0].deleted_at === null && c12b.status === 200);
  const c12c = await chat('adm', `[T12] exclua deal=${dl3.id}`);
  const d12 = await decide('adm', c12c.json.conversationId, [{ actionId: c12c.json.pending[0].actionId, decision: 'cancel' }]);
  ok('T12: cancelar no cartão registra "cancelled" e a RENATA informa', d12.status === 200 && d12.json.executed[0].decision === 'cancel' && (await last(U.adm, 'crm_excluir_negocio')).status === 'cancelled');

  // ---- T3 permissões: vendedora não exclui empresa; ferramenta nem é oferecida
  const c3 = await chat('vend', `[T3] exclua a empresa company=${co.id}`);
  const a3 = await last(U.vend, 'crm_excluir_empresa');
  ok('T3: sem permissão → recusado ANTES de pedir confirmação, registrado como "denied"', c3.json.steps[0].ok === false && a3.status === 'denied' && (await rows(`SELECT deleted_at FROM crm_companies WHERE id=$1`, [co.id]))[0].deleted_at === null, a3);
  const cat = await call(sess.vend, 'GET', '/api/renata/catalog');
  const catAdm = await call(sess.adm, 'GET', '/api/renata/catalog');
  ok('catálogo respeita o perfil: a vendedora não vê crm_excluir_empresa; o administrador vê', !cat.json.tools.some((t) => t.name === 'crm_excluir_empresa') && catAdm.json.tools.some((t) => t.name === 'crm_excluir_empresa') && cat.json.tools.some((t) => t.name === 'crm_criar_negocio'));
  // a rota do servidor também barra (defesa em profundidade): vendedora confirma um excluir-contato (permitido) e depois uma exclusão que a rota nega
  ok('catálogo mostra a cobertura das rotas da plataforma', catAdm.json.coverage.routes > 250 && catAdm.json.coverage.curated > 60 && catAdm.json.coverage.excluded > 20);

  // ---- T5 lote
  const acts = [];
  for (const t of ['A1', 'A2']) acts.push((await call(sess.adm, 'POST', '/api/crm/activities', { companyId: co2.id, title: `Atividade ${t}`, dueDate: '2030-01-10', activityType: 'task' })).json.activity.id);
  const c5 = await chat('adm', `[T5] priorize a=${acts[0]} b=${acts[1]}`);
  ok('T5: operação em lote (2 registros) pede confirmação e diz quantos', c5.json.pending.length === 1 && /ALTERAR 2/.test(c5.json.pending[0].preview), c5.json);
  const d5 = await decide('adm', c5.json.conversationId, [{ actionId: c5.json.pending[0].actionId, decision: 'confirm' }]);
  const pr = await rows(`SELECT priority FROM crm_activities WHERE id = ANY($1::uuid[])`, [acts]);
  ok('T5: confirmado → as 2 atividades mudaram e o resultado do lote foi informado', d5.json.executed[0].ok && pr.every((x) => x.priority === 'high') && /alterados/.test(d5.json.reply), d5.json);

  // ---- T6 quadro pessoal
  const c6 = await chat('adm', '[T6] crie um lembrete para revisar o cronograma do cliente X');
  const board = (await rows(`SELECT data FROM personal_boards WHERE user_id=$1`, [U.adm]))[0].data;
  const card = board.boards.flatMap((b) => b.columns.flatMap((c) => c.cards)).find((k) => /cliente X/.test(k.title));
  ok('T6: cartão criado no quadro de quem pediu, concluído em seguida, com histórico "RENATA"', c6.json.steps.length === 3 && c6.json.steps.every((s) => s.ok) && card && card.completed === true && card.priority === 'alta' && card.dueDate === '2026-10-30' && /RENATA/.test(card.history[0].user), c6.json);
  ok('T6: o quadro de outra pessoa não é tocado', (await rows(`SELECT 1 FROM personal_boards WHERE user_id=$1`, [U.vend])).length === 0);

  // ---- T7 cronograma de empresa (simular, aplicar 1 op direto, aplicar várias com confirmação, desfazer)
  const c7 = await chat('adm', `[T7] ajuste o cronograma proj=${PROJ}`);
  let proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  ok('T7: simulou sem gravar, aplicou 1 operação direto e propôs 2 operações com confirmação', c7.json.steps.length === 3 && c7.json.steps[0].tool === 'cronograma_simular' && proj.activities[0].status === 'concluido' && c7.json.pending.length === 1 && proj.activities[1].date === '2026-10-21', { steps: c7.json.steps, pend: c7.json.pending.length });
  ok('T7: o Log da empresa registra o ajuste em nome da RENATA a pedido do usuário', /RENATA \(IA, a pedido de Admin Teste RENATA\)/.test(proj.log[0].action));
  const d7 = await decide('adm', c7.json.conversationId, [{ actionId: c7.json.pending[0].actionId, decision: 'confirm' }]);
  proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  ok('T7: confirmado → data e responsável da atividade B atualizados', d7.json.executed[0].ok && proj.activities[1].date === '2026-12-01' && proj.activities[1].responsible === 'Beltrano', proj.activities[1]);
  const a7 = await last(U.adm, 'cronograma_aplicar');
  const un7 = await call(sess.adm, 'POST', `/api/renata/actions/${a7.id}/undo`);
  proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  ok('T7: desfazer o ajuste devolve a data e o responsável originais', un7.status === 200 && proj.activities[1].date === '2026-10-21' && proj.activities[1].responsible === 'Fulano', { un7: un7.json, b: proj.activities[1], a7: { status: a7.status, undo: a7.undo, id: a7.id } });
  const bad = await call(sess.adm, 'POST', `/api/renata/chat`, { message: '[T7] ajuste proj=inexistente' });
  ok('T7: empresa que não existe → erro tratado, sem 500', bad.status === 200 && bad.json.steps[0].ok === false);

  // ---- dependências entre subatividades: a simulação avisa, o ajuste que quebraria é recusado, e só vale com aceite explícito
  const depOp = [{ op: 'sub.set', activity: { id: 'a2' }, sub: { id: 'sA' }, set: { date: '2026-11-20' } }];
  const dsim = await chat('adm', `[TX] ${JSON.stringify({ calls: [{ name: 'cronograma_simular', input: { id: PROJ, ops: depOp } }] })}`);
  const dsimRow = await last(U.adm, 'cronograma_simular');
  ok('dependências: a simulação mostra a subatividade que ficaria ANTES da predecessora e avisa', dsim.json.steps[0].ok && dsimRow.after.dependenciasQuebradas.length === 1 && /predecessora/.test(dsimRow.after.aviso) && dsimRow.after.dependenciasQuebradas[0].subatividade === 'Sub B', dsimRow.after);
  const dap = await chat('adm', `[TX] ${JSON.stringify({ calls: [{ name: 'cronograma_aplicar', input: { id: PROJ, ops: depOp } }] })}`);
  proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  ok('dependências: o ajuste que quebraria a dependência é RECUSADO e nada é gravado', dap.json.steps[0].ok === false && proj.activities[1].subactivities[0].date === '2026-11-10', dap.json.steps);
  const dok = await chat('adm', `[TX] ${JSON.stringify({ calls: [{ name: 'cronograma_aplicar', input: { id: PROJ, ops: depOp, aceitarDependenciasQuebradas: true } }] })}`);
  proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  ok('dependências: com aceite explícito o ajuste é aplicado (e fica no Log)', dok.json.steps[0].ok && proj.activities[1].subactivities[0].date === '2026-11-20', dok.json.steps);
  const dfix = await chat('adm', `[TX] ${JSON.stringify({ calls: [{ name: 'cronograma_aplicar', input: { id: PROJ, ops: [{ op: 'sub.set', activity: { id: 'a2' }, sub: { id: 'sB' }, set: { date: '2026-11-25' } }, { op: 'sub.set', activity: { id: 'a2' }, sub: { id: 'sA' }, set: { date: '2026-11-22' } }] } }] })}`);
  ok('dependências: ajustando também a dependente (2 operações, com confirmação) não há quebra', dfix.json.pending.length === 1 && dfix.json.steps[0].status === 'needs_confirmation');
  await decide('adm', dfix.json.conversationId, [{ actionId: dfix.json.pending[0].actionId, decision: 'confirm' }]);
  proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  ok('dependências: dependente e predecessora ajustadas juntas', proj.activities[1].subactivities[1].date === '2026-11-25' && proj.activities[1].subactivities[0].date === '2026-11-22');

  // ---- T8 tarefas de reunião
  const c8 = await chat('adm', `[T8] crie a tarefa proj=${PROJ}`);
  proj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  const todo = proj.meetings[0].actionItems[0];
  ok('T8: tarefa de reunião criada e atualizada (responsável, prazo, status) com log', c8.json.steps.length === 2 && todo && todo.responsible === 'Beltrano' && todo.dueDate === '2026-10-28' && todo.status === 'em-andamento' && /Tarefa/.test(proj.log[0].action), { todo, steps: c8.json.steps });

  // aviso ao responsável: a tarefa criada pela RENATA notifica a pessoa, em nome da RENATA a pedido de quem pediu
  await call(sess.adm, 'POST', '/api/renata/chat', { message: `[TX] ${JSON.stringify({ calls: [{ name: 'tarefa_reuniao_criar', input: { empresaId: PROJ, reuniaoId: 'm1', title: 'Tarefa para a vendedora', responsible: 'Vendedora Teste RENATA' } }] })}` });
  await new Promise((r) => setTimeout(r, 400));
  const ntf = await rows(`SELECT type, body, actor_name FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [U.vend]);
  ok('tarefa atribuída pela RENATA avisa o responsável, com o autor "RENATA (IA, a pedido de …)"', ntf[0] && ntf[0].type === 'todo_assigned' && ntf[0].actor_name === 'RENATA (IA, a pedido de Admin Teste RENATA)', ntf);

  // ---- T9 relatórios
  const c9 = await chat('adm', '[T9] o que a equipe fez hoje e o que está atrasado?');
  ok('T9: relatórios da equipe (hoje e atrasos) consultados', c9.json.steps.length === 2 && c9.json.steps.every((s) => s.ok), c9.json.steps);
  const rep = await last(U.adm, 'relatorio_equipe_dia');
  ok('T9: o relatório do dia enxerga as próprias ações da RENATA (Log da empresa e CRM)', rep.after && rep.after.total >= 3, rep.after && { total: rep.after.total });
  ok('T9: consultas também ficam no registro (risk read)', rep.risk === 'read' && rep.status === 'success');

  // ---- T10 acesso genérico
  const c10 = await chat('adm', '[T10] consulte, tente a rota de usuários e execute uma operação genérica');
  const consult = await rows(`SELECT status, error FROM renata_actions WHERE requester_id=$1 AND tool='plataforma_consultar' ORDER BY requested_at`, [U.adm]);
  ok('T10: consulta genérica liberada funciona; rota de usuários é RECUSADA (política)', consult[0].status === 'success' && consult[1].status === 'failed' && /Fora do alcance/.test(consult[1].error), consult);
  ok('T10: operação genérica que altera dados SEMPRE pede confirmação', c10.json.pending.length === 1 && c10.json.pending[0].tool === 'plataforma_executar', c10.json);
  const d10 = await decide('adm', c10.json.conversationId, [{ actionId: c10.json.pending[0].actionId, decision: 'confirm' }]);
  ok('T10: confirmada, executou a rota real', d10.json.executed[0].ok, d10.json);
  const curatedBlock = await call(sess.adm, 'POST', '/api/renata/chat', { message: '[T10] x' });
  ok('/api/renata responde mesmo com rota genérica', curatedBlock.status === 200);

  // ---- T11 duplicidade e T13 erros de parâmetro
  await chat('adm', '[T11] crie a empresa duplicada');
  const dups = await rows(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND legal_name='Zzdup Renata SA' AND deleted_at IS NULL`, [ORG]);
  ok('T11: pedido repetido na mesma resposta NÃO duplica a empresa (1 só)', dups[0].n === 1, dups);
  const c13 = await chat('adm', '[T13] erros');
  const a13 = await rows(`SELECT tool, status, error FROM renata_actions WHERE requester_id=$1 AND command LIKE '[T13]%' ORDER BY requested_at`, [U.adm]);
  ok('T13: parâmetro inválido (id que não é UUID) e ferramenta desconhecida viram erro claro para a IA, sem gravar nada', c13.json.steps.length === 2 && c13.json.steps.every((s) => s.ok === false) && /UUID|identificador/.test(a13[0].error), a13);

  // ---- histórico e escopo
  const h = await call(sess.adm, 'GET', '/api/renata/actions?limit=200');
  ok('histórico: o usuário vê suas ações, com campos de auditoria', h.json.actions.length > 20 && h.json.actions.every((a) => a.requester_id === U.adm) && h.json.actions[0].command && h.json.actions[0].authorization);
  const hv = await call(sess.vend, 'GET', '/api/renata/actions?scope=org');
  ok('histórico: ?scope=org só vale para administrador (a vendedora continua vendo só o dela)', hv.json.actions.every((a) => a.requester_id === U.vend));
  const ho = await call(sess.adm, 'GET', '/api/renata/actions?scope=org&limit=200');
  ok('histórico: o administrador vê a organização (inclui a vendedora)', ho.json.actions.some((a) => a.requester_id === U.vend));
  const stat = await rows(`SELECT status, count(*)::int n FROM renata_actions WHERE requester_id LIKE 'oirt_%' GROUP BY status`);
  ok('registro cobre todos os desfechos: success, failed, denied, cancelled', ['success', 'failed', 'denied', 'cancelled'].every((s) => stat.some((x) => x.status === s)), stat);
} catch (e) {
  failed += 1; console.log(`FAIL exceção: ${e.stack || e}`);
} finally {
  if (server) server.kill();
  await new Promise((r) => setTimeout(r, 500));
  await cleanup().catch((e) => console.log('limpeza falhou:', e.message));
  await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes da RENATA operacional ok');
process.exit(failed ? 1 : 0);
