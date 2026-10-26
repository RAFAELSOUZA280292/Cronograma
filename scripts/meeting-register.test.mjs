// Teste da rota POST /api/projects/:id/meetings (registrar reunião inteira de uma vez) contra servidor e Postgres LOCAIS, no sandbox (sandbox-edu).
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/meeting-register.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const RUN = crypto.randomBytes(3).toString('hex');
const PASS = crypto.randomBytes(12).toString('base64url');
const U = `oimr_${RUN}`; const PID = `proj-oimr${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 400)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const cleanup = async () => { await pool.query('DELETE FROM projects WHERE id LIKE $1', ['proj-oimr%']); await pool.query(`DELETE FROM users WHERE id LIKE 'oimr_%'`); };
await cleanup();
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Rafael Teste','master',$3,true,true)`, [U, await bcrypt.hash(PASS, 10), ORG]);
const data = { id: PID, company: { cnpj: '', name: 'Empresa Teste Reunião', nomeFantasia: 'Empresa Teste Reunião', logo: '', color: '', areas: [] }, team: [{ id: 't1', name: 'PRICETAX' }, { id: 't2', name: 'Fiscal' }], activities: [], phases: [], meetings: [], externalContacts: [{ name: 'Carlos', email: 'c@x.com' }], log: [] };
await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID, JSON.stringify(data), ORG]);
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: U, password: PASS }) });
const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || '']).map((c) => c.split(';')[0]).join('; ');
const post = (body, id = PID, headers = { Cookie: cookie }) => fetch(`${BASE}/api/projects/${id}/meetings`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const proj = async () => (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
try {
  const big = `0:00 - Carlos\n${'Texto longo da transcrição com acentuação: ação, preço, decisão. '.repeat(400)}\nFIM`;
  const r1 = await post({ title: 'Precificação Vendas - Teste', date: '2026-10-23', participants: ['Carlos', 'Rosane', 'Patrick Santos'], transcript: big, summary: 'Resumo.', decisions: 'A1. Algo decidido.', via: 'Claude Code',
    actionItems: [{ title: 'Cobrar a base de 2026', responsible: 'PRICETAX', dueDate: '2026-10-23' }, { title: 'Item com dono fora da equipe', responsible: 'Fulano', dueDate: 'ontem' }, { title: '   ' }] });
  ok('registra a reunião inteira (201)', r1.status === 201 && r1.json.meeting && r1.json.meeting.actionItems.length === 2, r1);
  const d = await proj(); const m = d.meetings[0];
  ok('transcrição longa gravada inteira (sem cortar), resumo e decisões no lugar', m.transcript === big && m.summary === 'Resumo.' && m.decisions === 'A1. Algo decidido.' && m.participants.length === 3);
  ok('tarefas: responsável da equipe é mantido; fora da equipe fica vazio; prazo inválido some; título vazio é descartado', m.actionItems[0].responsible === 'PRICETAX' && m.actionItems[0].dueDate === '2026-10-23' && m.actionItems[1].responsible === '' && m.actionItems[1].dueDate === '' && m.actionItems.length === 2 && m.actionItems.every((a) => a.status === 'nao-iniciado' && a.owner === 'pricetax' && a.deleted === false), m.actionItems);
  ok('participantes novos viram contato externo (sem duplicar o Carlos que já existia)', d.externalContacts.filter((c) => c.name === 'Carlos').length === 1 && d.externalContacts.some((c) => c.name === 'Rosane') && d.externalContacts.some((c) => c.name === 'Patrick Santos'), d.externalContacts);
  ok('Log da empresa registra quem e "via Claude Code"', /Reunião registrada.*Rafael Teste \(via Claude Code\)/.test(d.log[0].action), d.log[0]);
  const r2 = await post({ title: 'precificação vendas - teste', date: '2026-10-23' });
  ok('mesma data + mesmo título → 409 (não duplica)', r2.status === 409 && !!r2.json.meetingId && (await proj()).meetings.length === 1, r2);
  ok('com force registra outra', (await post({ title: 'precificação vendas - teste', date: '2026-10-23', force: true })).status === 201 && (await proj()).meetings.length === 2);
  ok('sem título → 400; data inválida → 400', (await post({ date: '2026-10-23' })).status === 400 && (await post({ title: 'x', date: '23/10/2026' })).status === 400);
  ok('projeto inexistente → 404', (await post({ title: 'x', date: '2026-10-23' }, 'proj-naoexiste')).status === 404);
  ok('sem login → 401', (await post({ title: 'x', date: '2026-10-23' }, PID, {})).status === 401);
  // ajuste do cronograma por operações (POST /projects/:id/plan)
  const d2 = await proj(); d2.activities = [{ id: 'a1', title: 'Atividade A', date: '2026-11-04', endDate: '2026-11-12', status: 'nao-iniciado', responsible: 'PRICETAX', subactivities: [{ id: 's1', title: 'Sub 1', date: '2026-11-04', done: false, guide: 'Objetivo: X.' }] }];
  await pool.query('UPDATE projects SET data=$1 WHERE id=$2', [JSON.stringify(d2), PID]);
  const plan = (body) => fetch(`${BASE}/api/projects/${PID}/plan`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
  const ops = [{ op: 'activity.set', ref: { id: 'a1' }, set: { date: '2026-10-28' } }, { op: 'sub.set', activity: { id: 'a1' }, sub: { id: 's1' }, set: { date: '2026-10-28', guide: 'Objetivo: X. Pela PRICETAX: Felipe.' } }];
  const pr = await plan({ ops });
  ok('plano: por padrão só SIMULA (nada é gravado)', pr.status === 200 && pr.json.dryRun === true && pr.json.wouldApply >= 2 && (await proj()).activities[0].date === '2026-11-04', pr);
  const pg = await plan({ ops, dryRun: false, note: 'teste', via: 'Claude Code' });
  const d3 = await proj();
  ok('plano: com dryRun:false grava, devolve desfazer e registra no Log', pg.status === 200 && pg.json.applied >= 2 && Array.isArray(pg.json.undo) && d3.activities[0].date === '2026-10-28' && d3.activities[0].subactivities[0].guide.endsWith('Felipe.') && /Cronograma ajustado.*Rafael Teste \(via Claude Code\)/.test(d3.log[0].action), pg.json);
  ok('plano: operação inválida → 400 e nada muda', (await plan({ ops: [{ op: 'sub.set', activity: { id: 'a1' }, sub: { id: 'nao-existe' }, set: { done: true } }], dryRun: false })).status === 400);
  ok('plano: sem ops → 400', (await plan({})).status === 400);
} catch (e) { failed += 1; console.log('FAIL exceção:', e.stack || e); } finally { await cleanup(); await pool.end(); }
console.log(failed ? `\n${failed} falha(s)` : '\ntodos os testes do registro de reunião ok');
process.exit(failed ? 1 : 0);
