// Teste de ponta a ponta (2026-10-28, §116e): a IA externa CORRIGE uma reunião já registrada pela API de conectividade (chave `meetings_edit`): prévia (dryRun), edição,
// recusas, tudo-ou-nada, vínculo tarefa→atividade intacto, log, memória da RENATA, histórico e desfazer. Também prova a nova tentativa quando a extração vem cortada
// (max_tokens 16000). Servidor local PRÓPRIO (porta 3013) + "Anthropic" falsa (3912): sem custo; a QUALIDADE da extração com a IA real fica sem prova.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/connect-meetings-edit.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu'; let OTHER_ORG = '';
const RUN = crypto.randomBytes(3).toString('hex');
const PASS = crypto.randomBytes(12).toString('base64url');
const U = { adm: `ome_adm_${RUN}`, lim: `ome_lim_${RUN}`, nope: `ome_nope_${RUN}` };
const PID = `ome-proj-${RUN}`; const PID_OTHER = `ome-other-${RUN}`; const MID = `mtg-ome-${RUN}`; const MID_DEL = `mtg-del-${RUN}`;
const FAKE_PORT = 3912; const APP_PORT = 3013; const BASE = `http://localhost:${APP_PORT}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Anthropic falsa (só para o bloco da extração cortada) ----------
const fake = { mode: 'ok', calls: [] };
const extraction = {
  title: 'Reunião longa da Romanha', date: null, time: null, participants: ['Ana'], summary: 'Resumo.', decisions: '',
  actionItems: [{ title: 'Enviar o contrato', responsible: 'Ana', owner: 'cliente', kind: 'tarefa', dueDate: null, area: null }], topics: [], highlights: [],
};
const fakeServer = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(body); } catch { /* corpo inválido */ }
    const text = JSON.stringify(j.messages || '');
    if (!/Extraia as informações estruturadas/i.test(text)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'fake: só extração' } })); }
    fake.calls.push({ max_tokens: j.max_tokens, compact: /ficou grande demais/.test(text) });
    const cut = fake.mode === 'truncate-once' && fake.calls.length === 1;
    const always = fake.mode === 'truncate-always';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const out = (cut || always) ? JSON.stringify(extraction).slice(0, 120) : JSON.stringify(extraction);
    res.end(JSON.stringify({ id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: out }], stop_reason: (cut || always) ? 'max_tokens' : 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
  });
});
await new Promise((r) => fakeServer.listen(FAKE_PORT, r));

const app = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(APP_PORT), DATABASE_URL: DB, JWT_SECRET: 'teste-local', ANTHROPIC_API_KEY: 'sk-ant-fake', ANTHROPIC_BASE_URL: `http://localhost:${FAKE_PORT}`, VOYAGE_API_KEY: '', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
let appLog = ''; app.stdout.on('data', (d) => { appLog += d; }); app.stderr.on('data', (d) => { appLog += d; });
async function stopAll() { app.kill('SIGTERM'); fakeServer.close(); }
async function cleanup() {
  await pool.query(`DELETE FROM meeting_edits WHERE project_id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
  await pool.query(`DELETE FROM meeting_submissions WHERE project_id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
  await pool.query(`DELETE FROM project_memory_chunks WHERE project_id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
  await pool.query(`DELETE FROM project_versions WHERE project_id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
  await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [[PID, PID_OTHER]]);
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'ome_%'`).catch(() => {});
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'ome_%'`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'ome_%'`);
}
process.on('exit', () => { try { app.kill('SIGTERM'); } catch { /* já encerrou */ } });
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${BASE}/api/connect`)).ok) break; } catch { /* ainda subindo */ } await sleep(500); if (i === 59) throw new Error(`servidor não subiu:\n${appLog.slice(-800)}`); }
  await sleep(1500);
  await cleanup();
  OTHER_ORG = (await pool.query('SELECT id FROM organizations WHERE id <> $1 ORDER BY id LIMIT 1', [ORG])).rows[0].id;
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Admin Teste Correção','master',$3,true,true)`, [U.adm, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Sem Acesso à Empresa','pricetax',$3,true,false)`, [U.lim, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access) VALUES ($1,$1,$2,'Sem Empresas','pricetax',$3,false)`, [U.nope, hash, ORG]);
  const item = (id, extra) => ({ id, title: `Tarefa ${id}`, responsible: '', owner: 'pricetax', kind: 'tarefa', dueDate: '', status: 'nao-iniciado', deleted: false, subtitle: '', notes: '', subtasks: [], comments: [], attachments: [], createdBy: 'IA (transcrição)', ...extra });
  const meeting = {
    id: MID, title: 'Alinhamento fluxo de caixa', date: '2026-10-28', time: '10:00', participants: ['Roberto Cassaniga', 'Rafael Souza'], transcript: 'TRANSCRIÇÃO ORIGINAL INTACTA',
    summary: 'Resumo original.', decisions: 'Decisão original.', createdAt: '2026-10-28T13:00:00Z', deleted: false,
    actionItems: [
      item('mai-a', { title: 'Enviar PMP e PMR', responsible: 'Roberto', owner: 'cliente', area: 'Financeiro', dueDate: '2026-11-04', responsibleStatus: 'confirmar', responsibleOriginal: 'Beto', activityId: 'act-fin', activityLink: { status: 'confirmed', suggestedId: 'act-fin', confidence: 0.9, reason: 'Área financeira.' } }),
      item('mai-b', { title: 'Simular split', activityLink: { status: 'suggested', suggestedId: 'act-fin', confidence: 0.6, reason: 'Palavras em comum.' } }),
      item('mai-c', { title: 'Item que será excluído' }),
    ],
  };
  const mkData = (id, name) => ({ id, company: { name, nomeFantasia: name, cnpj: '' }, team: [{ name: 'Maiara Silva', role: 'Financeiro' }], phases: [], activities: [{ id: 'act-fin', title: 'Mapear fluxo de caixa', status: 'nao-iniciado', subactivities: [] }], meetings: [], log: [] });
  const d1 = mkData(PID, `Empresa Teste Correção ${RUN}`); d1.meetings = [meeting, { ...meeting, id: MID_DEL, title: 'Reunião apagada', deleted: true }];
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID, JSON.stringify(d1), ORG]);
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID_OTHER, JSON.stringify(mkData(PID_OTHER, 'Outra organização')), OTHER_ORG]);

  const call = async (headers, method, p, body) => { const r = await fetch(`${BASE}${p}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
  const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
  const ck = { adm: await login(U.adm), lim: await login(U.lim), nope: await login(U.nope) };
  const asCk = (k) => ({ Cookie: ck[k] }); const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const mint = (k, scope) => call(asCk(k), 'POST', '/api/connect/tokens', { name: `teste ${scope}`, scope, days: 30 });
  const getProj = async () => (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
  const getMeeting = async () => (await getProj()).meetings.find((m) => m.id === MID);
  const snap = async () => JSON.stringify(await getProj());
  const M = `/api/connect/companies/${PID}/meetings/${MID}`;

  // ---- chaves
  const tEdit = await mint('adm', 'meetings_edit'); ok('quem tem acesso a Empresas gera a chave "corrigir reuniões"', tEdit.status === 201 && tEdit.json.token.startsWith('pxk_'), tEdit.status);
  ok('quem NÃO tem acesso a Empresas não gera (403)', (await mint('nope', 'meetings_edit')).status === 403);
  const list = await call(asCk('adm'), 'GET', '/api/connect/tokens'); ok('a tela lista o escopo novo', !!list.json.scopes.meetings_edit && list.json.canTranscripts === true);
  const tTr = await mint('adm', 'transcripts'); const tRead = await mint('adm', 'read'); const tCreate = await mint('adm', 'read_create'); const tRw = await mint('adm', 'read_write');
  const ED = tEdit.json.token;
  const idx = await call({}, 'GET', '/api/connect'); ok('o índice público lista PATCH, histórico e desfazer', idx.json.endpoints.filter((e) => e.scope === 'meetings_edit').length === 3 && idx.json.endpoints.some((e) => e.method === 'PATCH'));

  // ---- autorização
  const body0 = { title: 'Novo título' };
  ok('sem chave: 401', (await call({}, 'PATCH', M, body0)).status === 401);
  for (const [nome, t] of [['leitura', tRead], ['criar atividade', tCreate], ['transcrições', tTr], ['ajustar cronograma', tRw]]) ok(`chave de ${nome} NÃO corrige reunião (403)`, (await call(bearer(t.json.token), 'PATCH', M, body0)).status === 403);
  ok('chave de correção NÃO opera CRM, NÃO cria atividade solta e NÃO ajusta cronograma (403)',
    (await call(bearer(ED), 'GET', '/api/connect/crm/me')).status === 403 && (await call(bearer(ED), 'POST', '/api/connect/activities', { title: 'x' })).status === 403 && (await call(bearer(ED), 'POST', `/api/connect/companies/${PID}/plan`, { ops: [{ op: 'activity.add', title: 'x', phase: 'y' }] })).status === 403);
  ok('chave de correção faz o que a de transcrições faz: lê empresas e envia (validação 400, não 403)', (await call(bearer(ED), 'GET', `/api/connect/companies/${PID}`)).status === 200 && (await call(bearer(ED), 'POST', `/api/connect/companies/${PID}/transcripts`, {})).status === 400);
  ok('empresa de outra organização: 404', (await call(bearer(ED), 'PATCH', `/api/connect/companies/${PID_OTHER}/meetings/${MID}`, body0)).status === 404);
  ok('empresa inexistente: 404', (await call(bearer(ED), 'PATCH', `/api/connect/companies/nao-existe/meetings/${MID}`, body0)).status === 404);
  const tLim = await mint('lim', 'meetings_edit');
  ok('dono sem acesso àquela empresa: 404', (await call(bearer(tLim.json.token), 'PATCH', M, body0)).status === 404);
  ok('reunião inexistente: 404', (await call(bearer(ED), 'PATCH', `/api/connect/companies/${PID}/meetings/nao-existe`, body0)).status === 404);
  ok('reunião excluída: 404', (await call(bearer(ED), 'PATCH', `/api/connect/companies/${PID}/meetings/${MID_DEL}`, body0)).status === 404);

  // ---- leitura: id e vínculo com o cronograma
  const g = await call(bearer(ED), 'GET', M);
  const ga = g.json.actionItems.find((a) => a.id === 'mai-a'); const gb = g.json.actionItems.find((a) => a.id === 'mai-b');
  ok('GET devolve o id de cada item e o vínculo (confirmado e sugerido) com o título da atividade', g.status === 200 && ga.activityId === 'act-fin' && ga.activityTitle === 'Mapear fluxo de caixa' && ga.activityLink.status === 'confirmed' && gb.activityLink.status === 'suggested' && gb.activityLink.suggestedTitle === 'Mapear fluxo de caixa' && g.json.time === '10:00', g.json);

  // ---- campos não permitidos e validações: nada é gravado
  const before = await snap();
  const bad = async (nome, b, st = 400) => { const r = await call(bearer(ED), 'PATCH', M, b); ok(`${nome} → ${st} e nada gravado`, r.status === st && (await snap()) === before, { st: r.status, body: r.json }); return r; };
  const rf = await bad('campo fora da lista (transcript)', { transcript: 'trocada' });
  ok('a recusa diz qual campo e quais são permitidos', /transcript/.test(JSON.stringify(rf.json.errors)) && /title/.test(JSON.stringify(rf.json.errors)), rf.json);
  await bad('campo fora da lista (shareToken, deleted, id)', { shareToken: 'x', deleted: true, id: 'y' });
  await bad('status do item (não permitido)', { actionItems: [{ op: 'set', id: 'mai-a', set: { status: 'concluido' } }] });
  await bad('vínculo com atividade (não permitido)', { actionItems: [{ op: 'set', id: 'mai-a', set: { activityId: 'outra', activityLink: null } }] });
  await bad('vínculo solto ao lado do op (não permitido)', { actionItems: [{ op: 'set', id: 'mai-a', activityId: 'outra' }] });
  await bad('título vazio', { title: '   ' });
  await bad('título de 201 caracteres', { title: 'a'.repeat(201) });
  await bad('título que não é texto', { title: 123 });
  await bad('data inválida', { date: '28/10/2026' }); await bad('data impossível', { date: '2026-13-40' });
  await bad('hora inválida', { time: '25:99' });
  await bad('resumo acima de 20.000', { summary: 'x'.repeat(20001) });
  await bad('participants que não é lista nem objeto', { participants: 'Ana' });
  await bad('participants.remove de quem não está', { participants: { remove: ['Fantasma'] } });
  await bad('participants com campo estranho', { participants: { add: ['A'], troca: 1 } });
  await bad('tipo do item inválido', { actionItems: [{ op: 'set', id: 'mai-a', set: { kind: 'urgente' } }] });
  await bad('área inválida', { actionItems: [{ op: 'set', id: 'mai-a', set: { area: 'Marketing' } }] });
  await bad('lado inválido', { actionItems: [{ op: 'set', id: 'mai-a', set: { owner: 'terceiro' } }] });
  await bad('prazo inválido', { actionItems: [{ op: 'set', id: 'mai-a', set: { dueDate: '2026-02-31' } }] });
  await bad('item inexistente', { actionItems: [{ op: 'set', id: 'mai-zzz', set: { title: 'x' } }] });
  await bad('operação desconhecida', { actionItems: [{ op: 'apagar-tudo' }] });
  await bad('actionItems como lista inteira em vez de operações', { actionItems: 'tudo' });
  await bad('mais de 100 operações', { actionItems: Array.from({ length: 101 }, () => ({ op: 'set', id: 'mai-a', set: { title: 'x' } })) });
  await bad('corpo vazio (nada a alterar)', {});
  await bad('valores iguais aos atuais (nada a alterar)', { title: 'Alinhamento fluxo de caixa', date: '2026-10-28' });
  await bad('dryRun que não é booleano', { title: 'x', dryRun: 'sim' });
  await bad('tudo ou nada: título válido + operação inválida', { title: 'Título que NÃO pode entrar', actionItems: [{ op: 'set', id: 'mai-a', set: { title: 'Ok' } }, { op: 'set', id: 'mai-zzz', set: { title: 'x' } }] });
  ok('o tudo-ou-nada devolve o índice da operação que falhou', /actionItems\[1\]/.test(JSON.stringify((await call(bearer(ED), 'PATCH', M, { actionItems: [{ op: 'set', id: 'mai-a', set: { title: 'Ok' } }, { op: 'set', id: 'mai-zzz', set: { title: 'x' } }] })).json.errors)));

  // ---- prévia (dryRun): mostra antes e depois e NÃO grava
  const edit = {
    note: 'Correção pedida pelo Rafael', title: 'Alinhamento do fluxo de caixa — ALCAST', time: '10:30', summary: 'Resumo corrigido.', decisions: 'A1) Decisão corrigida.',
    participants: { add: ['Maiara Silva'], remove: ['rafael souza'], rename: { 'roberto cassaniga': 'Roberto Cassaniga Jr.' } },
    actionItems: [
      { op: 'set', id: 'mai-a', set: { responsible: 'Maiara Silva', kind: 'decisao', dueDate: '2026-11-10', area: 'Fiscal', owner: 'pricetax', title: 'Enviar PMP e PMR por filial' } },
      { op: 'add', title: 'Confirmar a data do workshop', responsible: 'Rafael Souza', owner: 'pricetax', kind: 'pendencia', dueDate: '2026-11-05', area: 'Diretoria' },
      { op: 'delete', id: 'mai-c' },
    ],
  };
  const dry = await call(bearer(ED), 'PATCH', M, { ...edit, dryRun: true });
  ok('dryRun: responde com antes e depois de cada mudança', dry.status === 200 && dry.json.dryRun === true && dry.json.applied === 0 && dry.json.changes.some((c) => c.field === 'title' && c.before === 'Alinhamento fluxo de caixa' && c.after === 'Alinhamento do fluxo de caixa — ALCAST')
    && dry.json.changes.some((c) => c.target === 'actionItem' && c.id === 'mai-a' && c.field === 'responsible' && c.before === 'Roberto' && c.after === 'Maiara Silva') && dry.json.changes.some((c) => c.op === 'add') && dry.json.changes.some((c) => c.op === 'delete' && c.id === 'mai-c'), dry.json);
  ok('dryRun: nada foi gravado (nem log, nem histórico, nem registro de ação)', (await snap()) === before && (await pool.query('SELECT count(*)::int n FROM meeting_edits WHERE project_id=$1', [PID])).rows[0].n === 0 && (await pool.query(`SELECT count(*)::int n FROM api_token_actions WHERE method='PATCH' AND user_id=$1`, [U.adm])).rows[0].n === 0);

  // ---- gravação de verdade
  const memBefore = (await pool.query(`SELECT count(*)::int n FROM project_memory_chunks WHERE project_id=$1 AND meeting_id=$2`, [PID, MID])).rows[0].n;
  const put = await call(bearer(ED), 'PATCH', M, edit);
  ok('gravação: 200, applied, editId e o caminho que desfaz', put.status === 200 && put.json.dryRun === false && put.json.applied === dry.json.wouldChange && /^medit-/.test(put.json.editId) && /\/edits\/medit-.*\/undo$/.test(put.json.undoWith) && put.json.undo === undefined, put.json);
  const m = await getMeeting(); const itemA = m.actionItems.find((x) => x.id === 'mai-a'); const itemB = m.actionItems.find((x) => x.id === 'mai-b'); const itemC = m.actionItems.find((x) => x.id === 'mai-c');
  ok('título, horário, resumo e decisões corrigidos; data e transcrição intactas', m.title === 'Alinhamento do fluxo de caixa — ALCAST' && m.time === '10:30' && m.summary === 'Resumo corrigido.' && m.decisions === 'A1) Decisão corrigida.' && m.date === '2026-10-28' && m.transcript === 'TRANSCRIÇÃO ORIGINAL INTACTA', m);
  ok('participantes: incluiu, removeu (sem diferença de maiúscula) e corrigiu o nome', JSON.stringify(m.participants) === JSON.stringify(['Roberto Cassaniga Jr.', 'Maiara Silva']), m.participants);
  ok('item corrigido: responsável, tipo, prazo, área, lado e título', itemA.responsible === 'Maiara Silva' && itemA.kind === 'decisao' && itemA.dueDate === '2026-11-10' && itemA.area === 'Fiscal' && itemA.owner === 'pricetax' && itemA.title === 'Enviar PMP e PMR por filial', itemA);
  ok('o aviso "confirmar" do responsável some, mas o nome original que a RENATA ouviu continua guardado', itemA.responsibleStatus === '' && itemA.responsibleOriginal === 'Beto');
  ok('o vínculo confirmado com o cronograma NÃO foi tocado', itemA.activityId === 'act-fin' && itemA.activityLink.status === 'confirmed' && itemA.activityLink.confidence === 0.9 && itemB.activityLink.status === 'suggested' && itemB.title === 'Simular split');
  const added = m.actionItems.find((x) => x.title === 'Confirmar a data do workshop');
  ok('item novo: com id, autor "Claude Code (por …)", tipo, lado, área e prazo', added && /^mai-/.test(added.id) && added.createdBy === 'Claude Code (por Admin Teste Correção)' && added.kind === 'pendencia' && added.area === 'Diretoria' && added.dueDate === '2026-11-05' && added.status === 'nao-iniciado' && !added.deleted, added);
  ok('exclusão é lógica (continua no banco, marcada, com quem excluiu) e some da leitura', itemC.deleted === true && itemC.deletedBy === 'Claude Code (por Admin Teste Correção)' && !!itemC.deletedAt && !(await call(bearer(ED), 'GET', M)).json.actionItems.some((a) => a.id === 'mai-c'));
  ok('a reunião foi marcada como editada por Claude Code', m.editedBy === 'Claude Code (por Admin Teste Correção)' && !!m.editedAt);
  const proj = await getProj();
  ok('Log da empresa: quem, o quê, a chave e a nota', proj.log[0].user === 'Claude Code (por Admin Teste Correção)' && /corrigida pela API/.test(proj.log[0].action) && /teste meetings_edit/.test(proj.log[0].action) && /Correção pedida pelo Rafael/.test(proj.log[0].action) && /title/.test(proj.log[0].action), proj.log[0]);
  ok('o resto da empresa não mudou (equipe, atividades, outra reunião)', JSON.stringify(proj.team) === JSON.stringify(JSON.parse(before).team) && JSON.stringify(proj.activities) === JSON.stringify(JSON.parse(before).activities) && proj.meetings.find((x) => x.id === MID_DEL).title === 'Reunião apagada');
  await sleep(800);
  ok('registro de ações da chave (api_token_actions) tem o PATCH', (await pool.query(`SELECT count(*)::int n FROM api_token_actions WHERE method='PATCH' AND user_id=$1 AND path LIKE $2`, [U.adm, `%${MID}`])).rows[0].n === 1);
  const chunks = (await pool.query(`SELECT content FROM project_memory_chunks WHERE project_id=$1 AND meeting_id=$2`, [PID, MID])).rows;
  ok('a memória da RENATA foi reindexada com a versão corrigida (e sem a antiga)', chunks.length > 0 && chunks.some((c) => /Resumo corrigido/.test(c.content)) && !chunks.some((c) => /Resumo original/.test(c.content)), { n: chunks.length, memBefore });
  const hist = await call(bearer(ED), 'GET', `${M}/edits`);
  ok('histórico de correções: 1 entrada, de Claude Code, com antes/depois, ainda não desfeita', hist.status === 200 && hist.json.edits.length === 1 && hist.json.edits[0].id === put.json.editId && hist.json.edits[0].by === 'Claude Code (por Admin Teste Correção)' && hist.json.edits[0].undone === false && hist.json.edits[0].changes.length === put.json.applied, hist.json);
  ok('histórico: chave sem o escopo não lê (403)', (await call(bearer(tTr.json.token), 'GET', `${M}/edits`)).status === 403);

  // ---- segunda correção sobre a mesma reunião, depois desfazer as duas (ordem inversa)
  const put2 = await call(bearer(ED), 'PATCH', M, { summary: 'Resumo corrigido de novo.', actionItems: [{ op: 'restore', id: 'mai-c' }, { op: 'set', id: 'mai-b', set: { responsible: 'Maiara Silva' } }] });
  ok('segunda correção: restaura o item excluído e corrige outro', put2.status === 200 && !(await getMeeting()).actionItems.find((x) => x.id === 'mai-c').deleted && (await getMeeting()).actionItems.find((x) => x.id === 'mai-b').responsible === 'Maiara Silva', put2.json);
  const undoPath = (id) => `${M}/edits/${id}/undo`;
  const undoDry = await call(bearer(ED), 'POST', undoPath(put2.json.editId), { dryRun: true });
  ok('desfazer em prévia (dryRun) não grava', undoDry.status === 200 && undoDry.json.dryRun === true && (await getMeeting()).summary === 'Resumo corrigido de novo.');
  const u2 = await call(bearer(ED), 'POST', undoPath(put2.json.editId), {});
  const mu2 = await getMeeting();
  ok('desfazer a 2ª correção devolve resumo, item excluído e responsável', u2.status === 200 && mu2.summary === 'Resumo corrigido.' && mu2.actionItems.find((x) => x.id === 'mai-c').deleted === true && mu2.actionItems.find((x) => x.id === 'mai-b').responsible === '', u2.json);
  ok('desfazer de novo a mesma correção: 409', (await call(bearer(ED), 'POST', undoPath(put2.json.editId), {})).status === 409);
  const u1 = await call(bearer(ED), 'POST', undoPath(put.json.editId), { note: 'voltando tudo' });
  const mu1 = await getMeeting(); const orig = JSON.parse(before).meetings.find((x) => x.id === MID);
  const strip = (mm) => ({ ...mm, editedAt: undefined, editedBy: undefined, actionItems: mm.actionItems.filter((a) => !a.createdBy.startsWith('Claude Code')).map((a) => ({ ...a, deletedAt: undefined, deletedBy: undefined })) });
  ok('desfazer a 1ª correção volta a reunião ao que era (o item novo fica excluído, nada some de verdade)', u1.status === 200 && JSON.stringify(strip(mu1)) === JSON.stringify(strip(orig)) && mu1.actionItems.find((x) => x.title === 'Confirmar a data do workshop').deleted === true, { st: u1.status, json: u1.json });
  ok('vínculo com o cronograma segue intacto depois de tudo', mu1.actionItems.find((x) => x.id === 'mai-a').activityId === 'act-fin' && mu1.actionItems.find((x) => x.id === 'mai-a').activityLink.status === 'confirmed');
  const hist2 = (await call(bearer(ED), 'GET', `${M}/edits`)).json.edits;
  ok('histórico: 4 entradas (2 correções + 2 desfazeres), as duas originais marcadas como desfeitas', hist2.length === 4 && hist2.filter((e) => e.undone).length === 2 && hist2.some((e) => e.note === 'voltando tudo'), hist2.map((e) => [e.id, e.undone, e.note]));
  ok('o log da empresa registrou os desfazeres', (await getProj()).log.filter((l) => /desfez a correção/.test(l.action)).length === 2);
  ok('desfazer correção de outra reunião/empresa: 404', (await call(bearer(ED), 'POST', `/api/connect/companies/${PID}/meetings/${MID_DEL}/edits/${put.json.editId}/undo`, {})).status === 404);

  // ---- o documento para a IA externa: executa o comando do .md
  const md = fs.readFileSync('docs/IA_EXTERNA_ENVIAR_TRANSCRICAO.md', 'utf8');
  const blocks = [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((x) => x[1]);
  const patchBlock = blocks.find((b) => b.includes('-X PATCH') && b.includes('/tmp/correcao.json'));
  ok('o .md traz o passo "corrigir o que voltou" com o comando PATCH e o dryRun', !!patchBlock && /Passo 7b/.test(md) && /dryRun/.test(md));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ome-'));
  const env = { ...process.env, PRICETAX_URL: BASE, PRICETAX_TOKEN: ED };
  const sh = (script) => execFileSync('bash', ['-c', script], { env, encoding: 'utf8', cwd: tmp });
  const docBody = { dryRun: false, title: 'Título com "aspas", acentuação ç ã é e barra \\ do documento', actionItems: [{ op: 'set', id: 'mai-b', set: { responsible: 'Maiara Silva', kind: 'risco' } }] };
  fs.writeFileSync(path.join(tmp, 'correcao.json'), JSON.stringify(docBody));
  const docRes = JSON.parse(sh(patchBlock.replace(/\{id\}/g, PID).replace(/\{meetingId\}/g, MID).replace(/\/tmp\/correcao\.json/g, `${tmp}/correcao.json`)));
  ok('o comando do .md (JSON por arquivo, com aspas e acentos) corrige a reunião de verdade', docRes.dryRun === false && docRes.applied === 3 && (await getMeeting()).title === docBody.title && (await getMeeting()).actionItems.find((x) => x.id === 'mai-b').kind === 'risco', docRes);
  fs.rmSync(tmp, { recursive: true, force: true });
  const guide = await import('../src/connect/guide.js');
  ok('o guia que o painel gera para a chave de correção traz o passo de correção e o dryRun; o da chave de transcrições não', /Corrigir uma reunião já registrada/.test(guide.buildGuide({ baseUrl: BASE, canCreate: false, canTranscripts: true, canMeetingsEdit: true })) && !/Corrigir uma reunião já registrada/.test(guide.buildGuide({ baseUrl: BASE, canCreate: false, canTranscripts: true })) && /dryRun/.test(guide.buildGuide({ baseUrl: BASE, canCreate: false, canTranscripts: true, canMeetingsEdit: true })));

  // ---- extração cortada (max_tokens): 16.000 e uma nova tentativa automática
  const txt = `[00:00] Ana: Vamos revisar o contrato e os prazos de entrega com a Romanha, ponto a ponto. ${'Falas de apoio da reunião longa. '.repeat(12)}`;
  const poll = async (sid, ms = 30000) => { const t0 = Date.now(); let r; while (Date.now() - t0 < ms) { r = await call(bearer(ED), 'GET', `/api/connect/companies/${PID}/transcripts/${sid}`); if (['done', 'failed'].includes(r.json && r.json.status)) return r; await sleep(400); } return r; };
  fake.mode = 'truncate-once'; fake.calls = [];
  const s1 = await call(bearer(ED), 'POST', `/api/connect/companies/${PID}/transcripts`, { transcript: txt, date: '2026-10-28', time: '09:00' });
  const d1r = await poll(s1.json.submissionId);
  ok('resposta cortada na 1ª tentativa: a RENATA tenta de novo sozinha e conclui', d1r.json.status === 'done' && fake.calls.length === 2 && d1r.json.meeting.title === 'Reunião longa da Romanha', { status: d1r.json.status, calls: fake.calls, err: d1r.json.errorMessage });
  ok('as duas chamadas pedem 16.000 de saída; só a 2ª pede o registro enxuto', fake.calls[0].max_tokens === 16000 && fake.calls[1].max_tokens === 16000 && !fake.calls[0].compact && fake.calls[1].compact, fake.calls);
  fake.mode = 'truncate-always'; fake.calls = [];
  const s2 = await call(bearer(ED), 'POST', `/api/connect/companies/${PID}/transcripts`, { transcript: `${txt} outra`, date: '2026-10-28', time: '09:30' });
  const d2r = await poll(s2.json.submissionId);
  ok('cortada nas duas: falha clara em português (sem laço infinito, 2 chamadas) e dá para tentar de novo', d2r.json.status === 'failed' && /cortada/.test(d2r.json.errorMessage) && fake.calls.length === 2, { st: d2r.json.status, err: d2r.json.errorMessage, calls: fake.calls.length });
  fake.mode = 'ok';

  // ---- revogação
  const del = await call(asCk('adm'), 'DELETE', `/api/connect/tokens/${tEdit.json.id}`);
  ok('chave revogada para de valer na hora (401)', del.status === 200 && (await call(bearer(ED), 'PATCH', M, body0)).status === 401);
} catch (e) { failed += 1; console.log('ERRO no teste:', e.stack || e.message); } finally {
  await cleanup().catch((e) => console.log('limpeza falhou:', e.message));
  await stopAll(); await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes de correção de reunião por chave ok');
process.exit(failed ? 1 : 0);
