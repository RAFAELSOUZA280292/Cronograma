// Teste do `state` do OAuth do Google (M1, 2026-10-29). Sobe o servidor LOCAL numa porta própria com credenciais Google FALSAS (nunca fala com o Google de verdade:
// a troca do código falha e o teste prova que ela só é tentada quando o `state` confere).
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/google-oauth-state.test.mjs
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const PORT = 3112; const BASE = `http://localhost:${PORT}`;
const RUN = crypto.randomBytes(3).toString('hex'); const UID = `gos_${RUN}`; const PASS = crypto.randomBytes(10).toString('base64url');
const pool = new pg.Pool({ connectionString: DB });
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
let log = '';
const app = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: 'teste-local', GOOGLE_CLIENT_ID: 'fake-id', GOOGLE_CLIENT_SECRET: 'fake-secret', GOOGLE_REDIRECT_URI: `${BASE}/api/google/oauth/callback`, APP_BASE_URL: BASE, NODE_ENV: 'development', ANTHROPIC_API_KEY: '', VOYAGE_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
app.stdout.on('data', (d) => { log += d; }); app.stderr.on('data', (d) => { log += d; });
process.on('exit', () => { try { app.kill('SIGTERM'); } catch { /* já encerrou */ } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${BASE}/api/connect`)).ok) break; } catch { /* subindo */ } await sleep(500); if (i === 59) throw new Error(`servidor não subiu:\n${log.slice(-600)}`); }
  await pool.query(`DELETE FROM users WHERE id=$1`, [UID]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,$1,'pricetax','sandbox-edu',true,true)`, [UID, await bcrypt.hash(PASS, 10)]);
  const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: UID, password: PASS }) });
  const session = (lr.headers.get('set-cookie') || '').split(';')[0];
  const start = await fetch(`${BASE}/api/google/oauth/start`, { headers: { Cookie: session }, redirect: 'manual' });
  const loc = start.headers.get('location') || '';
  const stateCookie = (start.headers.getSetCookie().find((c) => c.startsWith('g_oauth_state=')) || '').split(';')[0];
  const state = new URL(loc, BASE).searchParams.get('state');
  ok('start redireciona ao Google com `state` aleatório e guarda o mesmo valor em cookie', start.status === 302 && /accounts\.google\.com/.test(loc) && !!state && state.length >= 32 && stateCookie === `g_oauth_state=${state}`, { st: start.status, loc, stateCookie });
  const cb = (qs, cookie) => fetch(`${BASE}/api/google/oauth/callback?${qs}`, { headers: { Cookie: [session, cookie].filter(Boolean).join('; ') }, redirect: 'manual' });
  const before = log.length;
  const noState = await cb('code=abc');
  ok('retorno SEM `state` é recusado (vai para #google-calendar-error)', noState.status === 302 && /google-calendar-error/.test(noState.headers.get('location')));
  const wrong = await cb('code=abc&state=forjado', stateCookie);
  ok('retorno com `state` diferente do cookie é recusado', /google-calendar-error/.test(wrong.headers.get('location') || ''));
  const noCookie = await cb(`code=abc&state=${state}`);
  ok('retorno com `state` mas sem o cookie (outro navegador) é recusado', /google-calendar-error/.test(noCookie.headers.get('location') || ''));
  await sleep(300);
  ok('nenhuma dessas tentativas chegou a trocar o código com o Google', !/Falha no callback OAuth/.test(log.slice(before)), log.slice(before).slice(-300));
  const good = await cb(`code=abc&state=${state}`, stateCookie);
  await sleep(1500);
  ok('com `state` correto a troca do código é tentada (falha aqui só porque as credenciais são falsas)', /Falha no callback OAuth/.test(log.slice(before)) && /google-calendar-error/.test(good.headers.get('location') || ''), log.slice(before).slice(-300));
  ok('o cookie do `state` é apagado no retorno', good.headers.getSetCookie().some((c) => /^g_oauth_state=;/.test(c)));
} catch (e) { failed += 1; console.log('ERRO no teste:', e.message); } finally {
  await pool.query(`DELETE FROM users WHERE id=$1`, [UID]).catch(() => {});
  app.kill('SIGTERM'); await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes do state do OAuth ok');
process.exit(failed ? 1 : 0);
