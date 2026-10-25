// Teste HTTP da medição de experiência (§97): só equipe é medida, entradas saneadas, nota de 1 clique com frequência controlada, resumo por
// FLUXO (sem pessoa) e acesso só do master. Roda contra servidor e Postgres LOCAIS, com usuários temporários (oitmp_*), apagados no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/experience-http.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';
import { routeGroup, FLOWS } from '../shared/experienceFlows.js';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { master: `oitmp_xm_${RUN}`, staff: `oitmp_xs_${RUN}`, staff2: `oitmp_xs2_${RUN}`, cli: `oitmp_xc_${RUN}` };
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const { rows: [org] } = await pool.query(`SELECT org_id FROM users WHERE role='master' AND org_id IS NOT NULL AND org_id NOT LIKE 'eval-%' AND org_id NOT LIKE 'sandbox%' LIMIT 1`);
const hash = await bcrypt.hash(PASS, 10);
const mk = (id, role) => pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id) VALUES ($1,$1,$2,$1,$3,$4)`, [id, hash, role, org.org_id]);
async function cleanup() { await pool.query(`DELETE FROM product_events WHERE user_id LIKE 'oitmp_%'`).catch(() => {}); await pool.query(`DELETE FROM product_csat WHERE user_id LIKE 'oitmp_%'`).catch(() => {}); await pool.query(`DELETE FROM users WHERE id LIKE 'oitmp_%'`); }
await cleanup();
await mk(U.master, 'master'); await mk(U.staff, 'pricetax'); await mk(U.staff2, 'pricetax'); await mk(U.cli, 'cliente');
const sess = {};
for (const [k, u] of Object.entries(U)) { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); sess[k] = (r.headers.get('set-cookie') || '').split(';')[0]; }
const call = async (ck, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...(ck ? { Cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
ok('login dos usuários temporários', Object.values(sess).every(Boolean));

ok('routeGroup tira ids e query', routeGroup('/api/crm/deals/123e4567-e89b-12d3-a456-426614174000/move?x=1') === 'crm/deals/:id/move' && routeGroup('/api/crm/activities/42') === 'crm/activities/:id');
ok('sem login → 401', (await call('', 'POST', '/api/experience/events', { events: [] })).status === 401);
const ev = (flow, outcome, durationMs) => ({ flow, outcome, durationMs });
const sent = await call(sess.staff, 'POST', '/api/experience/events', { events: [ev('crm.followup.concluir', 'ok', 8000), ev('crm.followup.concluir', 'ok', 12000), ev('crm.followup.concluir', 'error', 500), ev('crm.followup.concluir', 'undo', 0), ev('fluxo.inventado', 'ok', 1), ev('crm.lead_rapido', 'qualquer', 1), { flow: 'erro_api', outcome: 'error', route: 'post:crm/deals/:id/move', status: 500 }, { flow: 'erro_api', outcome: 'error', route: 'DROP TABLE;--', status: 500 }, ev('crm.negocio.criar', 'ok', 99999999)] });
ok('eventos válidos entram; fluxo inventado, resultado inválido e rota com lixo são descartados (6 de 9)', sent.status === 200 && sent.json.stored === 6, sent.json);
const clamp = (await pool.query(`SELECT max(duration_ms) AS m FROM product_events WHERE user_id=$1 AND flow='crm.negocio.criar'`, [U.staff])).rows[0].m;
ok('duração absurda é limitada a 10 minutos', clamp === 600000, clamp);
const cli = await call(sess.cli, 'POST', '/api/experience/events', { events: [ev('crm.lead_rapido', 'ok', 5)] });
ok('cliente NÃO é medido (só a equipe)', cli.json.stored === 0 && (await pool.query(`SELECT count(*)::int n FROM product_events WHERE user_id=$1`, [U.cli])).rows[0].n === 0, cli.json);

// nota de 1 clique
const el0 = await call(sess.staff, 'GET', '/api/experience/csat/eligible?flow=crm.followup.concluir');
ok('antes de 5 execuções bem-sucedidas NÃO pede nota (tem 2)', el0.json.ask === false, el0.json);
await call(sess.staff, 'POST', '/api/experience/events', { events: [ev('crm.followup.concluir', 'ok', 7000), ev('crm.followup.concluir', 'ok', 9000), ev('crm.followup.concluir', 'ok', 11000)] });
const el1 = await call(sess.staff, 'GET', '/api/experience/csat/eligible?flow=crm.followup.concluir');
ok('com 5 execuções bem-sucedidas, pede a nota', el1.json.ask === true && el1.json.label === FLOWS['crm.followup.concluir'].label, el1.json);
ok('fluxo desconhecido / cliente → não pede', (await call(sess.staff, 'GET', '/api/experience/csat/eligible?flow=x')).json.ask === false && (await call(sess.cli, 'GET', '/api/experience/csat/eligible?flow=crm.followup.concluir')).json.ask === false);
ok('nota inválida (0 e 6) é recusada', (await call(sess.staff, 'POST', '/api/experience/csat', { flow: 'crm.followup.concluir', score: 6 })).json.stored === false && (await call(sess.staff, 'POST', '/api/experience/csat', { flow: 'crm.followup.concluir', score: 0 })).json.stored === false);
const c1 = await call(sess.staff, 'POST', '/api/experience/csat', { flow: 'crm.followup.concluir', score: 2, comment: '  demora   para abrir  ' });
ok('nota baixa guarda o comentário (limpo)', c1.json.stored === true && (await pool.query(`SELECT comment FROM product_csat WHERE user_id=$1`, [U.staff])).rows[0].comment === 'demora para abrir');
const el2 = await call(sess.staff, 'GET', '/api/experience/csat/eligible?flow=crm.negocio.criar');
await call(sess.staff, 'POST', '/api/experience/events', { events: [ev('crm.negocio.criar', 'ok', 1), ev('crm.negocio.criar', 'ok', 1), ev('crm.negocio.criar', 'ok', 1)] });
const el3 = await call(sess.staff, 'GET', '/api/experience/csat/eligible?flow=crm.negocio.criar');
ok('depois de responder, NENHUM fluxo pergunta de novo por 14 dias (frequência por pessoa)', el3.json.ask === false && el3.json.why === 'cooldown', el3.json);
await call(sess.staff2, 'POST', '/api/experience/events', { events: Array.from({ length: 5 }, () => ev('crm.followup.concluir', 'ok', 6000)) });
const s2 = await call(sess.staff2, 'POST', '/api/experience/csat', { flow: 'crm.followup.concluir', score: 5, comment: 'nota alta não guarda comentário' });
ok('nota 5 não guarda comentário', s2.json.stored && (await pool.query(`SELECT comment FROM product_csat WHERE user_id=$1`, [U.staff2])).rows[0].comment === '');
const dis = await call(sess.staff2, 'POST', '/api/experience/csat', { flow: 'crm.followup.concluir', score: null });
ok('"Agora não" (nota nula) é registrado e conta para a frequência', dis.json.stored === true && (await call(sess.staff2, 'GET', '/api/experience/csat/eligible?flow=crm.followup.agendar_proximo')).json.ask === false);

// resumo (master) por fluxo
ok('resumo: pricetax → 403; sem login → 401', (await call(sess.staff, 'GET', '/api/ops-intel/experience')).status === 403 && (await call('', 'GET', '/api/ops-intel/experience')).status === 401);
const sm = await call(sess.master, 'GET', '/api/ops-intel/experience');
const f = sm.json.flows.find((x) => x.flow === 'crm.followup.concluir');
ok('resumo agrega por fluxo: execuções, erro, desfeito e tempo mediano (percentil)', sm.status === 200 && f.runs >= 10 && f.errors === 1 && f.undo === 1 && f.p50Ms > 0 && f.p90Ms >= f.p50Ms && f.people === 2, f);
ok('resumo traz nota média e quantidade, e dispensas', f.csat.n === 2 && f.csat.avg === 3.5 && f.csat.dist[1] === 1 && f.csat.dist[4] === 1 && f.csat.dismissed === 1, f.csat);
ok('resumo lista onde mais dá erro (rota sem ids)', sm.json.errorRoutes.some((r) => r.route === 'post:crm/deals/:id/move' && r.status === 500));
const txt = JSON.stringify(sm.json);
ok('o resumo NÃO expõe quem (nenhum id/nome de usuário nem user_id)', !txt.includes('oitmp_') && !/user_?id|userId/.test(txt), txt.slice(0, 120));
ok('comentários aparecem sem nome', sm.json.comments.some((c) => c.comment === 'demora para abrir' && !('user' in c) && !('userId' in c)));
await cleanup(); await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes de experiência ok');
process.exit(failed ? 1 : 0);
