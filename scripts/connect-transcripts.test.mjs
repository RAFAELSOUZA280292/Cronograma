// Teste de ponta a ponta (2026-10-28, §116d): uma IA externa envia a transcrição de uma reunião pela API de conectividade (chave `transcripts`) e a RENATA do painel
// (extração por IA) registra a reunião na empresa — o mesmo caminho do botão "Enviar transcrição". Servidor local PRÓPRIO (porta 3012) com uma "Anthropic" falsa
// local (porta 3911): sem custo e sem depender da chave real; o que fica sem prova é a QUALIDADE da extração com a IA real.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/connect-transcripts.test.mjs
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
const U = { adm: `ott_adm_${RUN}`, nope: `ott_nope_${RUN}` };
const PID = `ott-proj-${RUN}`; const PID_OTHER = `ott-other-${RUN}`;
const FAKE_PORT = 3911; const APP_PORT = 3012; const BASE = `http://localhost:${APP_PORT}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Anthropic falsa ----------
const fake = { mode: 'ok', extractionCalls: 0, otherCalls: 0 };
const extraction = {
  title: 'Alinhamento fluxo de caixa — ALCAST', date: '2026-01-01', time: '08:00',
  participants: ['Roberto Cassaniga', 'Rafael Souza'], summary: 'Mapeamento do caixa atual e dos prazos médios.', decisions: 'Nenhuma decisão: reunião de mapeamento.',
  actionItems: [
    { title: 'Enviar PMP e PMR por filial', responsible: 'Roberto Cassaniga', owner: 'cliente', kind: 'tarefa', dueDate: '2026-11-04', area: 'Financeiro' },
    { title: 'Simular impacto do split no capital de giro', responsible: null, owner: 'pricetax', kind: 'tarefa', dueDate: null, area: null },
    { title: 'Prazo de pagamento a fornecedores ainda não mapeado', responsible: null, owner: 'cliente', kind: 'pendencia', dueDate: null, area: 'Financeiro' },
  ],
  topics: [{ title: 'Caixa atual', startTime: '00:00' }], highlights: [{ type: 'proximo_passo', time: null, quote: 'Vamos mapear o caixa.' }],
};
const fakeServer = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const isExtraction = /extrai informações estruturadas|Extraia as informações estruturadas/i.test(body);
    if (!isExtraction) { fake.otherCalls += 1; res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'fake: só extração' } })); }
    fake.extractionCalls += 1;
    if (fake.mode === 'fail') { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: JSON.stringify(extraction) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
  });
});
await new Promise((r) => fakeServer.listen(FAKE_PORT, r));

// ---------- servidor do painel ----------
const app = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(APP_PORT), DATABASE_URL: DB, JWT_SECRET: 'teste-local', ANTHROPIC_API_KEY: 'sk-ant-fake', ANTHROPIC_BASE_URL: `http://localhost:${FAKE_PORT}`, VOYAGE_API_KEY: '', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
let appLog = ''; app.stdout.on('data', (d) => { appLog += d; }); app.stderr.on('data', (d) => { appLog += d; });
async function stopAll() { app.kill('SIGTERM'); fakeServer.close(); }
async function cleanup() {
  await pool.query(`DELETE FROM meeting_submissions WHERE project_id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
  await pool.query(`DELETE FROM project_memory_chunks WHERE project_id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
  await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [[PID, PID_OTHER]]);
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'ott_%'`).catch(() => {});
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'ott_%'`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'ott_%'`);
}
process.on('exit', () => { try { app.kill('SIGTERM'); } catch { /* já encerrou */ } });
try {
  // o servidor precisa estar de pé ANTES de criar os usuários: a migração do boot mexe em companies_access de quem já existe
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${BASE}/api/connect`)).ok) break; } catch { /* ainda subindo */ } await sleep(500); if (i === 59) throw new Error(`servidor não subiu:\n${appLog.slice(-800)}`); }
  await sleep(1500);
  await cleanup();
  OTHER_ORG = (await pool.query('SELECT id FROM organizations WHERE id <> $1 ORDER BY id LIMIT 1', [ORG])).rows[0].id;
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Admin Teste Transcrição','master',$3,true,true)`, [U.adm, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access) VALUES ($1,$1,$2,'Sem Empresas','pricetax',$3,false)`, [U.nope, hash, ORG]);
  const mkProject = (id, org, name) => ({ id, org, data: { id, company: { name, nomeFantasia: name, cnpj: '' }, team: [], phases: [], activities: [], meetings: [], log: [] } });
  for (const p of [mkProject(PID, ORG, `Empresa Teste Transcrição ${RUN}`), mkProject(PID_OTHER, OTHER_ORG, 'Outra organização')]) {
    await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [p.id, JSON.stringify(p.data), p.org]);
  }

  const call = async (headers, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
  const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
  const ck = { adm: await login(U.adm), nope: await login(U.nope) };
  const asCk = (k) => ({ Cookie: ck[k] }); const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const mint = (k, scope) => call(asCk(k), 'POST', '/api/connect/tokens', { name: `teste ${scope}`, scope, days: 30 });
  const poll = async (tok, path, want = ['done', 'failed'], ms = 30000) => { const t0 = Date.now(); let r; while (Date.now() - t0 < ms) { r = await call(bearer(tok), 'GET', path); if (want.includes(r.json && r.json.status)) return r; await sleep(400); } return r; };

  // ---- chaves
  const tTr = await mint('adm', 'transcripts'); ok('quem tem acesso a Empresas gera a chave de transcrições', tTr.status === 201 && tTr.json.token.startsWith('pxk_'), tTr.status);
  const nopeMint = await mint('nope', 'transcripts'); ok('quem NÃO tem acesso a Empresas não gera (403)', nopeMint.status === 403, { st: nopeMint.status, body: nopeMint.json, st: nopeMint.status });
  const list = await call(asCk('adm'), 'GET', '/api/connect/tokens'); ok('a tela sabe oferecer a opção (canTranscripts) e lista o escopo', list.json.canTranscripts === true && !!list.json.scopes.transcripts && (await call(asCk('nope'), 'GET', '/api/connect/tokens')).json.canTranscripts === false);
  const tRead = await mint('adm', 'read'); const tCreate = await mint('adm', 'read_create');
  const idx = await call({}, 'GET', '/api/connect'); ok('o índice público lista as rotas de transcrição', idx.json.endpoints.filter((e) => /transcripts/.test(e.path)).length === 3);
  const TR = tTr.json.token; const TR2 = TR; const P = `/api/connect/companies/${PID}/transcripts`;
  const text = `[00:00] Rafael Souza: Bom dia, Roberto. Hoje queremos entender como o caixa da ALCAST funciona.\n[00:12] Roberto Cassaniga: Hoje o prazo médio de recebimento é de 42 dias e o de pagamento de 38 dias.\n[01:05] Rafael Souza: Vou simular o impacto do split no capital de giro e voltar na próxima semana. ${'Texto de apoio da reunião. '.repeat(10)}`;

  // ---- autorização
  ok('sem chave: 401', (await call({}, 'POST', P, { transcript: text })).status === 401);
  ok('chave de leitura NÃO envia (403)', (await call(bearer(tRead.json.token), 'POST', P, { transcript: text })).status === 403);
  ok('chave de criar atividade NÃO envia (403)', (await call(bearer(tCreate.json.token), 'POST', P, { transcript: text })).status === 403);
  ok('chave de transcrições LÊ empresas e reuniões (rotas antigas)', (await call(bearer(TR), 'GET', `/api/connect/companies/${PID}`)).status === 200 && (await call(bearer(TR), 'GET', '/api/connect/companies')).json.companies.some((c) => c.id === PID));
  ok('chave de transcrições NÃO cria atividade solta (403)', (await call({ ...bearer(TR) }, 'POST', '/api/connect/activities', { title: 'x' })).status === 403);
  ok('chave de transcrições NÃO opera o CRM (403)', (await call(bearer(TR), 'GET', '/api/connect/crm/me')).status === 403);
  ok('empresa de outra organização: 404', (await call(bearer(TR), 'POST', `/api/connect/companies/${PID_OTHER}/transcripts`, { transcript: text })).status === 404);
  ok('empresa inexistente: 404', (await call(bearer(TR), 'POST', '/api/connect/companies/nao-existe/transcripts', { transcript: text })).status === 404);

  // ---- validação
  ok('sem transcript: 400', (await call(bearer(TR), 'POST', P, {})).status === 400);
  ok('transcrição curta: 400', (await call(bearer(TR), 'POST', P, { transcript: 'curto demais' })).status === 400);
  ok('data inválida: 400', (await call(bearer(TR), 'POST', P, { transcript: text, date: '28/10/2026' })).status === 400 && (await call(bearer(TR), 'POST', P, { transcript: text, date: '2026-13-40' })).status === 400);
  ok('hora inválida: 400', (await call(bearer(TR), 'POST', P, { transcript: text, time: '25:99' })).status === 400);
  ok('transcrição gigante: 413', (await call(bearer(TR), 'POST', P, { transcript: 'a'.repeat(400001) })).status === 413);
  ok('nada foi gravado pelas recusas', (await pool.query('SELECT count(*)::int n FROM meeting_submissions WHERE project_id=$1', [PID])).rows[0].n === 0);

  // ---- envio de verdade: a RENATA processa
  const post = await call(bearer(TR), 'POST', P, { transcript: text, date: '2026-10-28', time: '10:00' });
  ok('envio aceito (202) com submissionId', post.status === 202 && /^msub-/.test(post.json.submissionId) && post.json.duplicate === false, post);
  const sid = post.json.submissionId;
  const done = await poll(TR, `${P}/${sid}`);
  ok('a RENATA conclui o envio (done) e devolve a reunião criada', done.json.status === 'done' && done.json.meetingId && done.json.meeting, done.json);
  const m = done.json.meeting || {};
  ok('data e horário informados valem mais que os extraídos do texto', m.date === '2026-10-28' && m.time === '10:00', { d: m.date, t: m.time });
  ok('título, participantes, resumo e decisões vieram da extração', m.title.startsWith('Alinhamento fluxo de caixa') && m.participants.length === 2 && /caixa/.test(m.summary) && /mapeamento/.test(m.decisions));
  ok('próximos passos (3) com tipo, lado e área', m.actionItems.length === 3 && m.actionItems.some((a) => a.kind === 'pendencia') && m.actionItems.some((a) => a.owner === 'cliente' && a.area === 'Financeiro'), m.actionItems);
  const full = await call(bearer(TR), 'GET', `/api/connect/companies/${PID}/meetings/${done.json.meetingId}?transcript=1`);
  ok('a reunião está na empresa, com a transcrição original intacta', full.status === 200 && full.json.transcript === text.trim() && full.json.actionItems[0].kind, full.status);
  const proj = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
  ok('a reunião aparece na aba Reuniões (project.meetings) e no log da empresa, dizendo que veio por chave de API', proj.meetings.length === 1 && proj.log.some((l) => /via chave de API/.test(l.action)) && proj.log.some((l) => /Reunião registrada a partir de transcrição/.test(l.action)), { meetings: proj.meetings.length, log: proj.log.map((l) => l.action) });
  ok('o envio ficou registrado em nome do dono da chave', (await pool.query('SELECT submitted_by FROM meeting_submissions WHERE id=$1', [sid])).rows[0].submitted_by === U.adm);
  await sleep(500);
  ok('entrou na memória pesquisável da RENATA (reindexação)', (await pool.query(`SELECT count(*)::int n FROM project_memory_chunks WHERE project_id=$1`, [PID]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n !== 0);

  // ---- duplicado e lista
  const calls1 = fake.extractionCalls;
  const dup = await call(bearer(TR), 'POST', P, { transcript: `  ${text}  `, date: '2026-10-28' });
  ok('o MESMO texto não é processado de novo (200, duplicate:true, mesmo envio e reunião)', dup.status === 200 && dup.json.duplicate === true && dup.json.submissionId === sid && dup.json.meetingId === done.json.meetingId, dup);
  ok('duplicado não gastou outra chamada de IA nem criou envio', fake.extractionCalls === calls1 && (await pool.query('SELECT count(*)::int n FROM meeting_submissions WHERE project_id=$1', [PID])).rows[0].n === 1);
  const lst = await call(bearer(TR), 'GET', P); ok('lista os envios da empresa', lst.status === 200 && lst.json.submissions.length === 1 && lst.json.submissions[0].status === 'done');
  ok('envio de outra empresa/inexistente: 404', (await call(bearer(TR), 'GET', `${P}/msub-naoexiste`)).status === 404);

  // ---- falha da IA e nova tentativa
  fake.mode = 'fail';
  const text2 = `${text}\n[02:00] Roberto Cassaniga: Segundo assunto, outro dia. ${'Mais texto. '.repeat(8)}`;
  const f1 = await call(bearer(TR), 'POST', P, { transcript: text2 });
  const failedR = await poll(TR, `${P}/${f1.json.submissionId}`);
  ok('IA sem crédito: o envio vira failed com mensagem em português (nada de erro cru)', failedR.json.status === 'failed' && /Sem créditos/.test(failedR.json.errorMessage), failedR.json);
  ok('envio com falha NÃO é duplicado (dá para reenviar/tentar de novo)', (await call(bearer(TR), 'POST', `${P}/${sid}/retry`)).status === 409);
  fake.mode = 'ok';
  const retry = await call(bearer(TR), 'POST', `${P}/${f1.json.submissionId}/retry`); ok('nova tentativa aceita (202)', retry.status === 202, retry);
  const done2 = await poll(TR, `${P}/${f1.json.submissionId}`); ok('depois da nova tentativa o envio conclui', done2.json.status === 'done' && done2.json.meeting.id !== done.json.meetingId, done2.json);
  ok('sem data/horário informados, valem os da IA (extraídos do texto)', done2.json.meeting.date === '2026-01-01' && done2.json.meeting.time === '08:00');

  // ---- a tela (cookie) continua igual
  const webP = await call(asCk('adm'), 'POST', '/api/meeting-inbox', { projectId: PID, transcript: `${text2}\n[03:00] Mais uma fala. ${'Extra. '.repeat(6)}`, date: '2026-10-29', time: '09:30' });
  ok('a tela (cookie) segue enviando como antes (202 + submissionId)', webP.status === 202 && /^msub-/.test(webP.json.submissionId), webP);
  await sleep(300);
  const webL = await poll(TR, `${P}/${webP.json.submissionId}`); ok('…e o envio da tela aparece na API também, concluído', webL.json.status === 'done' && webL.json.meeting.date === '2026-10-29');
  ok('a tela lista os envios (GET /api/meeting-inbox)', (await call(asCk('adm'), 'GET', `/api/meeting-inbox?projectId=${PID}`)).json.submissions.length === 3);
  ok('sem acesso à empresa, a tela continua recusando (403 para usuário sem Empresas)', (await call(asCk('nope'), 'POST', '/api/meeting-inbox', { projectId: PID, transcript: text })).status === 403);

  // ---- o documento para a IA externa (docs/IA_EXTERNA_ENVIAR_TRANSCRICAO.md): executa os comandos DELE, como uma IA que só leu o .md
  const md = fs.readFileSync('docs/IA_EXTERNA_ENVIAR_TRANSCRICAO.md', 'utf8');
  const blocks = [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const sendBlock = blocks.find((b) => b.includes('--data-binary @/tmp/corpo.json'));
  const pollBlock = blocks.find((b) => /transcripts\/\{submissionId\}" -H/.test(b) && !b.includes('POST'));
  const meBlock = blocks.find((b) => b.includes('/api/connect/me'));
  ok('o documento traz os blocos de comando (confirmar, enviar, acompanhar)', !!sendBlock && !!pollBlock && !!meBlock);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ott-doc-'));
  const env = { ...process.env, PRICETAX_URL: BASE, PRICETAX_TOKEN: TR2 };
  const sh = (script) => execFileSync('bash', ['-c', script], { env, encoding: 'utf8', cwd: tmp });
  const meOut = JSON.parse(sh(meBlock.replace(/export [^\n]*\n/g, '')));
  ok('doc, passo 1: "confirmar a conexão" mostra o escopo transcripts', meOut.scope === 'transcripts');
  const docText = `[00:00] Rafael Souza: Teste do documento para a IA externa. Hoje vamos falar de prazos médios e de nota de débito.\n[00:20] Roberto Cassaniga: Entendido, "aspas", acentuação, ç ã é, e uma barra \\ invertida.\n${'Fala de apoio. '.repeat(20)}`;
  fs.writeFileSync(path.join(tmp, 'transcricao.txt'), docText);
  const sendScript = sendBlock.replace(/\{id\}/g, PID).replace(/\/tmp\/transcricao\.txt/g, `${tmp}/transcricao.txt`).replace(/\/tmp\/corpo\.json/g, `${tmp}/corpo.json`).replace('DATA="2026-10-28"', 'DATA="2026-10-30"').replace('HORA="10:00"', 'HORA="14:30"');
  const docPost = JSON.parse(sh(sendScript));
  ok('doc, passos 3 a 5: o comando de envio do .md (JSON montado por programa, com aspas e acentos) devolve submissionId', /^msub-/.test(docPost.submissionId) && docPost.status === 'pending', docPost);
  const pollScript = pollBlock.replace(/\{id\}/g, PID).replace(/\{submissionId\}/g, docPost.submissionId);
  let docDone = null; for (let i = 0; i < 60; i += 1) { docDone = JSON.parse(sh(pollScript)); if (['done', 'failed'].includes(docDone.status)) break; await sleep(400); }
  ok('doc, passos 6 e 7: o comando de acompanhar do .md chega em done com a reunião, data e horário informados', docDone.status === 'done' && docDone.meeting.date === '2026-10-30' && docDone.meeting.time === '14:30', docDone);
  const stored = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data.meetings.find((x) => x.id === docDone.meetingId);
  ok('a transcrição chegou idêntica ao arquivo (aspas, acentos e barra preservados)', stored.transcript === docText.trim());
  fs.rmSync(tmp, { recursive: true, force: true });

  // ---- limite por hora (cada envio é uma chamada de IA paga)
  let first429 = 0;
  for (let i = 1; i <= 31 && !first429; i += 1) { const r = await call(bearer(TR), 'POST', P, { transcript: `${text}\n[lote ${i}] ${'x'.repeat(220)}` }); if (r.status === 429) first429 = i; }
  ok('limite de 30 envios por hora por chave (429)', first429 === 28, first429);

  // ---- revogação
  const del = await call(asCk('adm'), 'DELETE', `/api/connect/tokens/${tTr.json.id}`);
  ok('chave revogada para de valer na hora (401)', del.status === 200 && (await call(bearer(TR), 'GET', P)).status === 401);
} catch (e) { failed += 1; console.log('ERRO no teste:', e.message); } finally {
  await cleanup().catch((e) => console.log('limpeza falhou:', e.message));
  await stopAll(); await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes de transcrição por chave ok');
process.exit(failed ? 1 : 0);
