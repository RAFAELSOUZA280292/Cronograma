// Teste de COBERTURA DAS FERRAMENTAS da RENATA (§101): executa CADA ferramenta do catálogo, de ponta a ponta (conversa → executor → rotas reais → banco), no sandbox local,
// com o "modelo" roteirizado em modo genérico ([TX] {"calls":[…]}). Exige que toda ferramenta do catálogo tenha sido exercitada (a lista de dispensas é explícita e justificada).
// Não prova que a IA de verdade escolhe a ferramenta certa — só que a ferramenta existe, valida, respeita permissão, executa, audita e persiste.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/renata-tools.test.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const PORT = 3102; const BASE = `http://127.0.0.1:${PORT}`;
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const ADM = `oitl_adm_${RUN}`; const VEND = `oitl_vend_${RUN}`;
const PROJ = `oitl-proj-${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 500)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const rows = async (q, p) => (await pool.query(q, p)).rows;
if (!(await rows('SELECT 1 FROM organizations WHERE id=$1', [ORG]))[0]) { console.error('Sem o sandbox local: rode scripts/sandbox-eduarda.mjs antes.'); process.exit(2); }

const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
async function cleanup() {
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  await pool.query('ALTER TABLE renata_actions DISABLE TRIGGER USER');
  const cs = (await rows(`SELECT id FROM crm_companies WHERE org_id=$1 AND (legal_name LIKE 'Teste RENATA%' OR legal_name LIKE 'Zzlead%' OR legal_name LIKE 'Zztl%')`, [ORG])).map((r) => r.id);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND (company_id = ANY($2::uuid[]) OR actor_id LIKE 'oitl_%')`, [ORG, cs]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND actor_id LIKE 'oitl_%'`, [ORG]);
  await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [cs]);
  await pool.query(`DELETE FROM crm_deal_tags WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [cs]);
  for (const t of ['crm_activities', 'crm_notes', 'crm_deals', 'crm_contacts']) await pool.query(`DELETE FROM ${t} WHERE company_id = ANY($1::uuid[])`, [cs]);
  await pool.query(`DELETE FROM crm_company_projects WHERE company_id = ANY($1::uuid[])`, [cs]).catch(() => {});
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [cs]);
  await pool.query(`DELETE FROM crm_cadences WHERE org_id=$1 AND (name LIKE 'Teste RENATA%' OR pipeline_id IN (SELECT id FROM crm_pipelines WHERE org_id=$1 AND name LIKE 'Teste RENATA%'))`, [ORG]);
  await pool.query(`DELETE FROM crm_pipeline_stages WHERE pipeline_id IN (SELECT id FROM crm_pipelines WHERE org_id=$1 AND name LIKE 'Teste RENATA%')`, [ORG]);
  await pool.query(`DELETE FROM crm_pipelines WHERE org_id=$1 AND name LIKE 'Teste RENATA%'`, [ORG]);
  await pool.query(`DELETE FROM crm_products WHERE org_id=$1 AND name LIKE 'Teste RENATA%'`, [ORG]);
  await pool.query(`DELETE FROM crm_tags WHERE org_id=$1 AND name_key = 'renata'`, [ORG]).catch(() => {});
  await pool.query(`DELETE FROM xflow_tickets WHERE title LIKE 'Teste RENATA%'`).catch(() => {});
  await pool.query(`DELETE FROM renata_actions WHERE requester_id LIKE 'oitl_%'`);
  await pool.query(`DELETE FROM renata_conversations WHERE user_id LIKE 'oitl_%'`);
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'oitl_%'`);
  await pool.query(`DELETE FROM notifications WHERE user_id LIKE 'oitl_%'`).catch(() => {});
  await pool.query(`DELETE FROM projects WHERE id=$1`, [PROJ]);
  await pool.query('ALTER TABLE renata_actions ENABLE TRIGGER USER');
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'oitl_%'`);
}

let server;
async function startServer() {
  server = spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(16).toString('hex'), RENATA_SCRIPTED_MODEL: path.join(root, 'scripts/fixtures/renata-script.mjs') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); try { const r = await fetch(`${BASE}/api/auth/me`); if (r.status === 401) return; } catch { /* subindo */ } }
  throw new Error(`servidor de teste não subiu:\n${log.slice(-800)}`);
}
const call = async (ck, method, p, body) => { const r = await fetch(`${BASE}${p}`, { method, headers: { ...(ck ? { Cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
const sess = {};
// executa uma lista de chamadas de ferramenta (uma resposta); confirma TODAS as pendências; devolve os passos finais por ferramenta
async function run(who, calls, { confirm = true } = {}) {
  const c = await call(sess[who], 'POST', '/api/renata/chat', { message: `[TX] ${JSON.stringify({ calls })}` });
  if (c.status !== 200) return { error: c.json, steps: [] };
  let steps = c.json.steps; let executed = [];
  if (c.json.pending.length && confirm) {
    const d = await call(sess[who], 'POST', `/api/renata/conversations/${c.json.conversationId}/decide`, { decisions: c.json.pending.map((p) => ({ actionId: p.actionId, decision: 'confirm' })) });
    executed = d.json.executed || [];
  }
  const byTool = {};
  for (const s of steps) {
    const final = s.status === 'needs_confirmation' ? executed.find((e) => e.actionId === s.actionId) : null;
    (byTool[s.tool] = byTool[s.tool] || []).push({ ok: final ? final.ok : s.ok, status: final ? final.status : s.status, summary: final ? final.summary : s.summary, pending: s.status === 'needs_confirmation', pendingCount: c.json.pending.length });
  }
  return { byTool, pending: c.json.pending, steps };
}
const allOk = (res, names) => names.every((n) => res.byTool && res.byTool[n] && res.byTool[n].every((x) => x.ok));
const bad = (res) => Object.entries(res.byTool || {}).flatMap(([n, l]) => l.filter((x) => !x.ok).map((x) => `${n}: ${x.summary}`));
const exercised = new Set();

try {
  await cleanup();
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,personal_access,xflow_role) VALUES ($1,$1,$2,'Admin Teste Ferramentas','master',$3,true,true,true,'admin')`, [ADM, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,personal_access,crm_role) VALUES ($1,$1,$2,'Vendedora Teste Ferramentas','pricetax',$3,true,true,true,'vendedor')`, [VEND, hash, ORG]);
  await pool.query(`INSERT INTO projects (id, org_id, data) VALUES ($1,$2,$3::jsonb)`, [PROJ, ORG, JSON.stringify({ id: PROJ, company: { cnpj: '00.000.000/0002-00', name: 'Empresa Teste RENATA Ferramentas', areas: [] }, phases: [{ id: 'ph1', name: 'Fase 1', color: '#888' }],
    activities: [{ id: 'a1', title: 'Atividade A', status: 'nao-iniciado', phase: 'ph1', date: '2026-10-20', endDate: '2026-10-25', responsible: 'Fulano', subactivities: [], deleted: false }], team: [{ id: 't1', name: 'Fulano', role: 'Analista' }],
    meetings: [{ id: 'm1', title: 'Reunião 1', date: '2026-10-20', actionItems: [], deleted: false }], log: [], externalContacts: [] })]);
  await startServer();
  for (const [k, id] of [['adm', ADM], ['vend', VEND]]) { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: PASS }) }); sess[k] = (r.headers.get('set-cookie') || '').split(';')[0]; }
  ok('servidor de teste e logins', !!sess.adm && !!sess.vend);
  const A = sess.adm;
  const mk = async (p, b) => (await call(A, 'POST', p, b)).json;
  const opt = (await call(A, 'GET', '/api/crm/options')).json;
  const pipe = opt.pipelines.find((p) => p.isDefault) || opt.pipelines[0];
  const open = pipe.stages.filter((s) => s.kind === 'open');

  // ---- base criada pela rota normal (ids para as ferramentas)
  const C = (await mk('/api/crm/companies', { legalName: 'Teste RENATA Base Ltda', force: true })).company.id;
  const CE = (await mk('/api/crm/companies', { legalName: 'Zztl Excluir Ltda', force: true })).company.id;
  const K = (await mk('/api/crm/contacts', { companyId: C, firstName: 'Contato', lastName: 'Base', email: 'base@teste.renata' })).contact.id;
  const K2 = (await mk('/api/crm/contacts', { companyId: C, firstName: 'Contato', lastName: 'Excluir', force: true })).contact.id;
  const D = (await mk('/api/crm/deals', { companyId: C, title: 'Negócio base', pipelineId: pipe.id, stageId: open[0].id, value: 100 })).deal.id;
  const D2 = (await mk('/api/crm/deals', { companyId: C, title: 'Negócio ganhar', pipelineId: pipe.id, stageId: open[0].id, value: 200 })).deal.id;
  const D3 = (await mk('/api/crm/deals', { companyId: C, title: 'Negócio perder', pipelineId: pipe.id, stageId: open[0].id, value: 300 })).deal.id;
  const D4 = (await mk('/api/crm/deals', { companyId: C, title: 'Negócio lote', pipelineId: pipe.id, stageId: open[0].id, value: 400 })).deal.id;
  const A1 = (await mk('/api/crm/activities', { companyId: C, dealId: D, title: 'Atividade base', dueDate: '2030-03-01', activityType: 'task' })).activity.id;
  const A2 = (await mk('/api/crm/activities', { companyId: C, title: 'Atividade excluir', dueDate: '2030-03-02', activityType: 'task' })).activity.id;
  const N1 = (await mk('/api/crm/notes', { entityType: 'deal', entityId: D, body: 'nota base' })).note.id;
  const N2 = (await mk('/api/crm/notes', { entityType: 'deal', entityId: D, body: 'nota excluir' })).note.id;
  const P1 = (await mk('/api/crm/products', { name: 'Teste RENATA Produto Base', billing: 'one_time', listPrice: 10 })).product.id;
  const P2 = (await mk('/api/crm/products', { name: 'Teste RENATA Produto Excluir', billing: 'one_time', listPrice: 10 })).product.id;
  const F1 = (await mk('/api/crm/pipelines', { name: 'Teste RENATA Funil Base', openStageNames: ['A', 'B'] })).pipelines.find((p) => p.name === 'Teste RENATA Funil Base');
  const F2 = (await mk('/api/crm/pipelines', { name: 'Teste RENATA Funil Excluir', openStageNames: ['A'] })).pipelines.find((p) => p.name === 'Teste RENATA Funil Excluir');
  const CAD = (await mk('/api/crm/cadences', { pipelineId: F1.id, stageId: F1.stages.find((s) => s.kind === 'open').id, name: 'Teste RENATA Cadência', steps: [{ title: 'Passo', type: 'followup', days: 1 }] })).cadence.id;
  ok('base de teste criada pela rota normal', [C, K, D, A1, N1, P1, F1, CAD].every(Boolean));

  // ---- 1) LEITURAS do CRM e da plataforma
  const reads = await run('adm', [
    { name: 'plataforma_quem_sou_eu' }, { name: 'plataforma_pessoas' }, { name: 'plataforma_rotas', input: { q: 'xflow' } },
    { name: 'crm_buscar', input: { q: 'Teste RENATA' } }, { name: 'crm_listar_opcoes' }, { name: 'crm_listar_empresas', input: { q: 'Teste RENATA' } }, { name: 'crm_ver_empresa', input: { id: C } }, { name: 'crm_historico_empresa', input: { id: C } },
    { name: 'crm_listar_contatos', input: { companyId: C } }, { name: 'crm_listar_negocios', input: { companyId: C } }, { name: 'crm_ver_negocio', input: { id: D } }, { name: 'crm_listar_atividades', input: { ownerId: 'me' } },
    { name: 'crm_ver_atividade', input: { id: A1 } }, { name: 'crm_painel', input: { lens: 'team' } }, { name: 'crm_listar_funis' }, { name: 'crm_listar_produtos' }, { name: 'crm_listar_cadencias' }, { name: 'crm_listar_tags' },
    { name: 'empresas_listar', input: { q: 'Teste RENATA' } }, { name: 'empresa_ver_cronograma', input: { id: PROJ } }, { name: 'tarefas_reuniao_listar', input: { empresaId: PROJ } }, { name: 'quadro_listar' },
    { name: 'xflow_listar' }, { name: 'notificacoes_listar' }, { name: 'conhecimento_buscar', input: { q: 'frase' } }, { name: 'pareceres_listar' }, { name: 'modelos_listar' },
    { name: 'plataforma_consultar', input: { path: '/api/knowledge/overview' } }, { name: 'relatorio_equipe_dia' }, { name: 'relatorio_atrasos' }, { name: 'agenda_listar', input: { start: '2026-10-26', end: '2026-11-02' } },
  ]);
  ok('leituras: todas as ferramentas de consulta executam e devolvem dados', allOk(reads, ['plataforma_quem_sou_eu', 'plataforma_pessoas', 'plataforma_rotas', 'crm_buscar', 'crm_listar_opcoes', 'crm_listar_empresas', 'crm_ver_empresa', 'crm_historico_empresa', 'crm_listar_contatos', 'crm_listar_negocios', 'crm_ver_negocio', 'crm_listar_atividades', 'crm_ver_atividade', 'crm_painel', 'crm_listar_funis', 'crm_listar_produtos', 'crm_listar_cadencias', 'crm_listar_tags', 'empresas_listar', 'empresa_ver_cronograma', 'tarefas_reuniao_listar', 'quadro_listar', 'xflow_listar', 'notificacoes_listar', 'conhecimento_buscar', 'pareceres_listar', 'modelos_listar', 'plataforma_consultar', 'relatorio_equipe_dia', 'relatorio_atrasos', 'agenda_listar']), bad(reads));
  Object.keys(reads.byTool || {}).forEach((t) => exercised.add(t));
  ok('leituras: nenhuma pediu confirmação', reads.pending.length === 0);
  const idsRead = (await rows(`SELECT after FROM renata_actions WHERE requester_id=$1 AND tool='crm_buscar' LIMIT 1`, [ADM]))[0];
  ok('leitura devolve os dados reais do CRM (a busca acha a empresa de teste)', JSON.stringify(idsRead.after).includes('Teste RENATA Base'));

  // ---- 2) ESCRITAS de baixo risco (executam direto)
  const lowCalls = [
    { name: 'crm_atualizar_empresa', input: { id: C, segment: 'Segmento RENATA' } },
    { name: 'crm_vincular_projeto', input: { id: C, projectId: PROJ } },
    { name: 'crm_criar_contato', input: { companyId: C, firstName: 'Contato', lastName: 'Criado', force: true } },
    { name: 'crm_atualizar_contato', input: { id: K, jobTitle: 'Diretor' } },
    { name: 'crm_criar_lead_rapido', input: { companyName: 'Zzlead Renata SA', contactName: 'Fulana Lead', phone: '11999990000', title: 'Lead RENATA', force: true } },
    { name: 'crm_atualizar_negocio', input: { id: D, value: 150, expectedCloseDate: '2030-06-01' } },
    { name: 'crm_mover_negocio', input: { id: D, stageId: open[1].id } },
    { name: 'crm_definir_tags_negocio', input: { id: D, tags: ['renata'] } },
    { name: 'crm_criar_atividade', input: { companyId: C, dealId: D, title: 'Atividade criada pela RENATA', dueDate: '2030-04-01', activityType: 'followup' } },
    { name: 'crm_atualizar_atividade', input: { id: A1, dueDate: '2030-04-02' } },
    { name: 'crm_concluir_atividade', input: { id: A1, outcome: 'ok' } },
    { name: 'crm_reabrir_atividade', input: { id: A1 } },
    { name: 'crm_cancelar_atividade', input: { id: A1 } },
    { name: 'crm_registrar_nota', input: { entityType: 'deal', entityId: D, body: 'Nota da RENATA' } },
    { name: 'crm_editar_nota', input: { id: N1, body: 'nota base editada' } },
    { name: 'quadro_criar_atividade', input: { title: 'Cartão de teste de ferramentas', priority: 'alta' } },
    { name: 'tarefa_reuniao_criar', input: { empresaId: PROJ, reuniaoId: 'm1', title: 'Tarefa da RENATA', responsible: 'Fulano' } },
    { name: 'xflow_criar', input: { title: 'Teste RENATA ticket', description: 'criado pela RENATA' } },
    { name: 'notificacoes_marcar_todas_lidas' },
  ];
  const low = await run('adm', lowCalls);
  ok('baixo risco: 19 ferramentas de escrita executaram direto, sem pedir confirmação', allOk(low, [...new Set(lowCalls.map((c) => c.name))]) && low.pending.length === 0, bad(low));
  Object.keys(low.byTool || {}).forEach((t) => exercised.add(t));
  const q1 = (await rows(`SELECT segment FROM crm_companies WHERE id=$1`, [C]))[0];
  const q2 = (await rows(`SELECT value, stage_id FROM crm_deals WHERE id=$1`, [D]))[0];
  const q3 = (await rows(`SELECT status FROM crm_activities WHERE id=$1`, [A1]))[0];
  const q4 = (await rows(`SELECT body FROM crm_notes WHERE id=$1`, [N1]))[0];
  const q5 = (await rows(`SELECT 1 FROM crm_companies WHERE org_id=$1 AND legal_name='Zzlead Renata SA'`, [ORG])).length;
  const q6 = (await rows(`SELECT 1 FROM crm_company_projects WHERE company_id=$1 AND project_id=$2`, [C, PROJ])).length;
  ok('baixo risco: as mudanças estão de fato no banco (empresa, negócio/etapa, atividade, nota, lead rápido, vínculo de projeto)', q1.segment === 'Segmento RENATA' && Number(q2.value) === 150 && q2.stage_id === open[1].id && q3.status === 'cancelled' && q4.body === 'nota base editada' && q5 === 1 && q6 === 1, { q1, q2, q3, q4, q5, q6 });
  ok('baixo risco: as tags do negócio foram gravadas', (await rows(`SELECT 1 FROM crm_deal_tags dt JOIN crm_tags t ON t.id=dt.tag_id WHERE dt.deal_id=$1 AND t.name_key='renata'`, [D])).length === 1);

  // quadro: atualizar + concluir + excluir (sequencial, usa o id do cartão criado)
  const bd = (await rows(`SELECT data FROM personal_boards WHERE user_id=$1`, [ADM]))[0].data;
  const card = bd.boards.flatMap((b) => b.columns.flatMap((c) => c.cards)).find((k) => /Cartão de teste de ferramentas/.test(k.title));
  const bq = await run('adm', [{ name: 'quadro_atualizar_atividade', input: { id: card.id, priority: 'urgente', dueDate: '2030-05-05' } }, { name: 'quadro_concluir_atividade', input: { id: card.id } }, { name: 'quadro_excluir_atividade', input: { id: card.id } }]);
  Object.keys(bq.byTool || {}).forEach((t) => exercised.add(t));
  const card2 = (await rows(`SELECT data FROM personal_boards WHERE user_id=$1`, [ADM]))[0].data.boards.flatMap((b) => b.columns.flatMap((c) => c.cards)).find((k) => k.id === card.id);
  ok('quadro: atualizar, concluir e excluir (com confirmação) funcionaram; o cartão fica na lixeira do quadro', allOk(bq, ['quadro_atualizar_atividade', 'quadro_concluir_atividade', 'quadro_excluir_atividade']) && card2.deleted === true && card2.priority === 'urgente' && card2.completed === true, { bad: bad(bq), card2 });
  const pj = (await rows(`SELECT data FROM projects WHERE id=$1`, [PROJ]))[0].data;
  const todoId = pj.meetings[0].actionItems[0].id;
  const tq = await run('adm', [{ name: 'tarefa_reuniao_atualizar', input: { empresaId: PROJ, id: todoId, status: 'concluida' } }, { name: 'tarefa_reuniao_excluir', input: { empresaId: PROJ, id: todoId } }, { name: 'cronograma_simular', input: { id: PROJ, ops: [{ op: 'activity.set', ref: { id: 'a1' }, set: { status: 'em-andamento' } }] } }, { name: 'cronograma_aplicar', input: { id: PROJ, ops: [{ op: 'activity.set', ref: { id: 'a1' }, set: { status: 'em-andamento' } }] } }]);
  Object.keys(tq.byTool || {}).forEach((t) => exercised.add(t));
  ok('tarefas de reunião e cronograma: atualizar, excluir (confirmação), simular e aplicar', allOk(tq, ['tarefa_reuniao_atualizar', 'tarefa_reuniao_excluir', 'cronograma_simular', 'cronograma_aplicar']), bad(tq));

  // ---- 3) AÇÕES CRÍTICAS e de configuração (sempre pedem confirmação; o teste confirma)
  const crit = await run('adm', [
    { name: 'crm_excluir_empresa', input: { id: CE } }, { name: 'crm_excluir_contato', input: { id: K2 } }, { name: 'crm_excluir_atividade', input: { id: A2 } }, { name: 'crm_excluir_nota', input: { id: N2 } },
    { name: 'crm_fechar_negocio_ganho', input: { id: D2 } }, { name: 'crm_fechar_negocio_perdido', input: { id: D3, lostReason: 'preco' } },
    { name: 'crm_lote_atualizar_negocios', input: { ids: [D, D4], source: 'Origem RENATA' } },
    { name: 'crm_criar_produto', input: { name: 'Teste RENATA Produto Novo', billing: 'one_time', listPrice: 50 } }, { name: 'crm_atualizar_produto', input: { id: P1, listPrice: 20 } }, { name: 'crm_excluir_produto', input: { id: P2 } },
    { name: 'crm_criar_funil', input: { name: 'Teste RENATA Funil Novo', openStageNames: ['X', 'Y'] } }, { name: 'crm_atualizar_funil', input: { id: F1.id, name: 'Teste RENATA Funil Base 2' } },
    { name: 'crm_salvar_etapas', input: { id: F1.id, stages: [...F1.stages.filter((s) => s.kind === 'open').map((s) => ({ id: s.id, name: s.name, probability: s.probability, slaDays: 3 })), { name: 'C', probability: 50 }] } },
    { name: 'crm_criar_cadencia', input: { pipelineId: F1.id, stageId: F1.stages.filter((s) => s.kind === 'open')[1].id, name: 'Teste RENATA Cadência 2', steps: [{ title: 'Passo 1', type: 'call', days: 2 }] } },
    { name: 'crm_excluir_cadencia', input: { id: CAD } }, { name: 'crm_arquivar_funil', input: { id: F2.id } },
  ], { confirm: false });
  Object.keys(crit.byTool || {}).forEach((t) => exercised.add(t));
  ok('críticas/configuração: 16 ferramentas pararam pedindo confirmação, e NADA foi executado antes', crit.pending.length === 16 && (await rows(`SELECT 1 FROM crm_contacts WHERE id=$1 AND deleted_at IS NULL`, [K2])).length === 1 && (await rows(`SELECT status FROM crm_deals WHERE id=$1`, [D2]))[0].status === 'open', { n: crit.pending.length, tools: crit.pending.map((p) => p.tool) });
  const dec = await call(A, 'POST', `/api/renata/conversations/${(await rows(`SELECT conversation_id FROM renata_actions WHERE id=$1`, [crit.pending[0].actionId]))[0].conversation_id}/decide`, { decisions: crit.pending.map((p) => ({ actionId: p.actionId, decision: 'confirm' })) });
  ok('críticas/configuração: confirmadas todas, as 16 executaram', dec.status === 200 && dec.json.executed.length === 16 && dec.json.executed.every((e) => e.ok), dec.json.executed && dec.json.executed.filter((e) => !e.ok));
  const after = {
    empresa: (await rows(`SELECT deleted_at FROM crm_companies WHERE id=$1`, [CE]))[0].deleted_at,
    contato: (await rows(`SELECT deleted_at FROM crm_contacts WHERE id=$1`, [K2]))[0].deleted_at, ativ: (await rows(`SELECT deleted_at FROM crm_activities WHERE id=$1`, [A2]))[0].deleted_at,
    ganho: (await rows(`SELECT status FROM crm_deals WHERE id=$1`, [D2]))[0].status, perdido: (await rows(`SELECT status, lost_reason FROM crm_deals WHERE id=$1`, [D3]))[0],
    lote: (await rows(`SELECT source FROM crm_deals WHERE id = ANY($1::uuid[])`, [[D, D4]])).map((r) => r.source), prod: (await rows(`SELECT 1 FROM crm_products WHERE org_id=$1 AND name='Teste RENATA Produto Novo' AND deleted_at IS NULL`, [ORG])).length,
    funil: (await rows(`SELECT 1 FROM crm_pipelines WHERE org_id=$1 AND name='Teste RENATA Funil Novo' AND deleted_at IS NULL`, [ORG])).length, arq: (await rows(`SELECT deleted_at FROM crm_pipelines WHERE id=$1`, [F2.id]))[0].deleted_at,
  };
  ok('críticas/configuração: os efeitos estão no banco (empresa e demais exclusões lógicas, ganho, perda com motivo, lote, produto e funil novos, funil arquivado)', after.empresa && after.contato && after.ativ && after.ganho === 'won' && after.perdido.status === 'lost' && after.perdido.lost_reason === 'preco' && after.lote.every((x) => x === 'Origem RENATA') && after.prod === 1 && after.funil === 1 && after.arq, after);

  // ---- 4) PERMISSÃO: a vendedora (sem 'remove'/'funnel'/'catalog') não tem essas ferramentas nem consegue executá-las
  const vend = await run('vend', [{ name: 'crm_excluir_empresa', input: { id: C } }, { name: 'crm_criar_funil', input: { name: 'Teste RENATA Proibido' } }, { name: 'crm_criar_produto', input: { name: 'Teste RENATA Proibido' } }, { name: 'xflow_listar' }, { name: 'relatorio_equipe_dia' }]);
  ok('permissão: a vendedora é barrada em excluir empresa, funil, catálogo e XFlow (sem xflow_role); relatório da equipe é permitido a quem é da equipe', vend.byTool.crm_excluir_empresa[0].status === 'denied' && vend.byTool.crm_criar_funil[0].status === 'denied' && vend.byTool.crm_criar_produto[0].status === 'denied' && vend.byTool.xflow_listar[0].status === 'denied' && vend.byTool.relatorio_equipe_dia[0].ok, vend.byTool);
  ok('permissão: nada foi criado pela vendedora', (await rows(`SELECT 1 FROM crm_pipelines WHERE name='Teste RENATA Proibido'`)).length === 0 && (await rows(`SELECT 1 FROM crm_products WHERE name='Teste RENATA Proibido'`)).length === 0);

  // ---- 5) integrações externas (sem Google configurado no teste): falham com mensagem clara, sem quebrar
  const ext = await run('adm', [{ name: 'agenda_criar_evento', input: { title: 'Teste RENATA evento', date: '2030-01-10', startTime: '10:00' } }, { name: 'agenda_responder_convite', input: { id: 'google-inexistente', response: 'accepted' } }], { confirm: false });
  Object.keys(ext.byTool || {}).forEach((t) => exercised.add(t));
  ok('integração Google: sem conexão, a falha é tratada com mensagem clara (não derruba a RENATA)', ext.steps.length === 2 && ext.steps.every((s) => typeof s.summary === 'string' && s.summary.length > 5), ext.steps);
  const withGuests = await run('adm', [{ name: 'agenda_criar_evento', input: { title: 'Teste RENATA com convidados', date: '2030-01-10', startTime: '10:00', attendees: ['alguem@exemplo.com'] } }], { confirm: false });
  ok('agenda: evento COM convidados externos sempre pede confirmação (o Google envia o convite)', withGuests.pending.length === 1 && /CONVIDAR/.test(withGuests.pending[0].preview), withGuests.pending);
  await call(A, 'POST', `/api/renata/conversations/${(await rows(`SELECT conversation_id FROM renata_actions WHERE id=$1`, [withGuests.pending[0].actionId]))[0].conversation_id}/decide`, { decisions: [{ actionId: withGuests.pending[0].actionId, decision: 'cancel' }] });

  // ---- cobertura do catálogo: todas as ferramentas visíveis ao administrador foram exercitadas
  const cat = (await call(A, 'GET', '/api/renata/catalog')).json;
  const names = cat.tools.map((t) => t.name);
  const dispensadas = { crm_consultar_cnpj: 'consulta serviço externo (Receita); não há como testar offline', plataforma_executar: 'testada em scripts/renata.test.mjs (T10)', plataforma_pessoas: 'exercitada na leitura',
    crm_criar_empresa: 'testada em scripts/renata.test.mjs (T1, T11 duplicidade)', crm_criar_negocio: 'testada em scripts/renata.test.mjs (T1)', crm_excluir_negocio: 'testada em scripts/renata.test.mjs (T2, T12)', crm_lote_atualizar_atividades: 'testada em scripts/renata.test.mjs (T5)' };
  const faltam = names.filter((n) => !exercised.has(n) && !dispensadas[n]);
  const usedBefore = new Set((await rows(`SELECT DISTINCT tool FROM renata_actions WHERE requester_id=$1`, [ADM])).map((r) => r.tool));
  const faltam2 = faltam.filter((n) => !usedBefore.has(n));
  ok(`cobertura: as ${names.length} ferramentas do catálogo foram exercitadas por este teste (ou têm dispensa justificada)`, faltam2.length === 0, faltam2);
  ok('cobertura das rotas do servidor: curadas + genéricas + excluídas = todas as rotas', cat.coverage.curated + cat.coverage.generic + cat.coverage.excluded === cat.coverage.routes && cat.coverage.routes > 280, cat.coverage);
} catch (e) {
  failed += 1; console.log(`FAIL exceção: ${e.stack || e}`);
} finally {
  if (server) server.kill();
  await new Promise((r) => setTimeout(r, 500));
  await cleanup().catch((e) => console.log('limpeza falhou:', e.message));
  await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodas as ferramentas da RENATA foram exercitadas ok');
process.exit(failed ? 1 : 0);
