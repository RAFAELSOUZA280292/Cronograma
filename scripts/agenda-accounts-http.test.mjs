// Agendas extras (§128) por HTTP real: sobe o servidor LOCAL numa porta própria (credenciais Google falsas, Microsoft desligada),
// cria dois usuários e confere cadastro por link iCal (com um .ics público de verdade), a Agenda unificada, cor, privacidade entre
// pessoas, o início do login da outra conta Google e o retorno com `state` errado. Precisa do Postgres local e de internet.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/agenda-accounts-http.test.mjs
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const FEED = process.env.FEED || 'https://calendar.google.com/calendar/ical/pt-br.brazilian%23holiday%40group.v.calendar.google.com/public/basic.ics';
const PORT = 3114; const BASE = `http://localhost:${PORT}`;
const RUN = crypto.randomBytes(3).toString('hex'); const A = `aga_${RUN}`; const B = `agb_${RUN}`; const PASS = crypto.randomBytes(10).toString('base64url');
const pool = new pg.Pool({ connectionString: DB });
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 400)}` : ''}`); } };
let log = '';
const app = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: 'teste-local', GOOGLE_CLIENT_ID: 'fake-id', GOOGLE_CLIENT_SECRET: 'fake-secret', GOOGLE_REDIRECT_URI: `${BASE}/api/google/oauth/callback`, APP_BASE_URL: BASE, NODE_ENV: 'development', ANTHROPIC_API_KEY: '', VOYAGE_API_KEY: '', MS_CLIENT_ID: '', MS_CLIENT_SECRET: '', GOOGLE_EXT_CLIENT_ID: '', GOOGLE_EXT_CLIENT_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
app.stdout.on('data', (d) => { log += d; }); app.stderr.on('data', (d) => { log += d; });
process.on('exit', () => { try { app.kill('SIGTERM'); } catch { /* já encerrou */ } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(id) {
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,$1,'pricetax','sandbox-edu',true,true)`, [id, await bcrypt.hash(PASS, 10)]);
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: PASS }) });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const call = (cookie, method, path, body) => fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual' })
  .then(async (r) => ({ status: r.status, headers: r.headers, data: await r.json().catch(() => null) }));

try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${BASE}/api/connect`)).ok) break; } catch { /* subindo */ } await sleep(500); if (i === 59) throw new Error(`servidor não subiu:\n${log.slice(-600)}`); }
  const ca = await login(A); const cb = await login(B);

  let r = await call(ca, 'GET', '/api/agenda/accounts');
  ok('lista vazia + capacidades', r.status === 200 && r.data.accounts.length === 0 && r.data.can.google === true && r.data.can.microsoft === false && r.data.can.googleExternal === false, r.data);
  ok('principal com cor padrão', r.data.principal.color === '#5B8DEF' && r.data.principal.connected === false);

  r = await call(ca, 'POST', '/api/agenda/accounts/ical', { label: 'Interno', url: 'https://127.0.0.1/x.ics' });
  ok('link para IP interno recusado', r.status === 400, r);
  r = await call(ca, 'POST', '/api/agenda/accounts/ical', { label: 'Interno', url: 'https://localhost/x.ics' });
  ok('link para localhost recusado', r.status === 400, r);
  r = await call(ca, 'POST', '/api/agenda/accounts/ical', { label: 'http', url: 'http://exemplo.com/a.ics' });
  ok('http recusado', r.status === 400 && /https/.test(r.data.message), r.data);
  r = await call(ca, 'POST', '/api/agenda/accounts/ical', { label: '', url: FEED });
  ok('nome obrigatório', r.status === 400, r.data);

  r = await call(ca, 'POST', '/api/agenda/accounts/ical', { label: 'Feriados', url: FEED });
  ok('link iCal público cadastrado', r.status === 201 && r.data.events > 0 && r.data.accounts.length === 1, r.data);
  const acc = r.data.accounts && r.data.accounts[0];
  ok('conta iCal: particular, só leitura, com cor, sem o link na resposta', acc && acc.privacy === 'particular' && acc.readOnly && /^#/.test(acc.color) && !JSON.stringify(r.data).includes('basic.ics'), acc);
  const row = (await pool.query('SELECT secret FROM user_accounts WHERE id=$1', [acc.id])).rows[0];
  ok('link guardado cifrado no banco', row && row.secret.startsWith('enc1:') && !row.secret.includes('calendar.google.com'));

  r = await call(ca, 'GET', '/api/agenda?start=2026-12-20T00:00:00.000Z&end=2026-12-31T00:00:00.000Z');
  const natal = (r.data.events || []).find((e) => e.account === acc.id && /^natal$/i.test(e.title));
  ok('Agenda traz o Natal pela conta extra, com cor e id próprio', r.status === 200 && natal && natal.color === acc.color && natal.id.startsWith(`x:${acc.id}:`) && natal.readOnly && natal.allDay && natal.start === '2026-12-25', natal || r.data);
  ok('Agenda devolve as contas (principal + extra)', r.data.accounts.length === 2 && r.data.accounts[0].id === 'principal' && r.data.accounts[1].id === acc.id, r.data.accounts);

  r = await call(cb, 'GET', '/api/agenda?start=2026-12-20T00:00:00.000Z&end=2026-12-31T00:00:00.000Z');
  ok('outra pessoa NÃO vê a agenda extra', r.status === 200 && !(r.data.events || []).some((e) => e.account === acc.id) && r.data.accounts.length === 1, r.data.accounts);
  r = await call(cb, 'GET', '/api/agenda/accounts');
  ok('outra pessoa não lista a conta', r.data.accounts.length === 0);
  r = await call(cb, 'PATCH', `/api/agenda/accounts/${acc.id}`, { label: 'invadido' });
  ok('outra pessoa não altera (404)', r.status === 404, r);
  r = await call(cb, 'DELETE', `/api/agenda/accounts/${acc.id}`);
  ok('outra pessoa não desconecta (404)', r.status === 404, r);
  r = await call(cb, 'GET', `/api/agenda/events/${encodeURIComponent(natal ? natal.id : `x:${acc.id}:1`)}`);
  ok('outra pessoa não abre evento da conta (404)', r.status === 404, r);

  r = await call(ca, 'GET', `/api/agenda/events/${encodeURIComponent(natal.id)}`);
  ok('evento de link iCal não tem ações (400, só leitura)', r.status === 400 && /só leitura/.test(r.data.message), r.data);
  r = await call(ca, 'POST', '/api/agenda/events', { title: 'x', date: '2026-12-01', startTime: '10:00', durationMinutes: 30, accountId: acc.id });
  ok('não cria em agenda só leitura', r.status === 400, r.data);
  r = await call(ca, 'POST', '/api/agenda/events', { title: 'x', date: '2026-12-01', startTime: '10:00', durationMinutes: 30, accountId: 'ua000000000000' });
  ok('conta inexistente = 404', r.status === 404, r.data);

  r = await call(ca, 'PATCH', `/api/agenda/accounts/${acc.id}`, { label: 'PETCONT', color: '#0B8043', renataCalendar: true });
  ok('renomear, cor e permissão da RENATA', r.status === 200 && r.data.account.label === 'PETCONT' && r.data.account.color === '#0B8043' && r.data.account.renataCalendar, r.data);
  r = await call(ca, 'PATCH', `/api/agenda/accounts/${acc.id}`, { color: 'vermelho' });
  ok('cor inválida recusada', r.status === 400);
  r = await call(ca, 'PATCH', '/api/agenda/accounts/principal', { color: '#D50000', label: 'PRICETAX' });
  ok('cor e nome da principal', r.status === 200 && r.data.principal.color === '#D50000' && r.data.principal.label === 'PRICETAX', r.data);
  r = await call(ca, 'PATCH', `/api/agenda/accounts/${acc.id}`, { calendarEnabled: false });
  r = await call(ca, 'GET', '/api/agenda?start=2026-12-20T00:00:00.000Z&end=2026-12-31T00:00:00.000Z');
  ok('agenda desligada não é buscada', !(r.data.events || []).some((e) => e.account === acc.id), r.data.accounts);

  r = await call(ca, 'GET', '/api/microsoft/oauth/start');
  ok('Microsoft sem configuração: 400 em português', r.status === 400);
  const st = await fetch(`${BASE}/api/google/oauth/start?extra=1`, { headers: { Cookie: ca }, redirect: 'manual' });
  const loc = new URL(st.headers.get('location') || '', BASE);
  const state = loc.searchParams.get('state') || '';
  ok('outra conta Google: pede só agenda + e-mail, escolhe a conta, state "ai…"', st.status === 302 && /calendar\.events/.test(loc.searchParams.get('scope')) && !/gmail/.test(loc.searchParams.get('scope')) && /select_account/.test(loc.searchParams.get('prompt')) && state.startsWith('ai'), loc.toString());
  const cookie = (st.headers.getSetCookie().find((c) => c.startsWith('g_oauth_state=')) || '').split(';')[0];
  const bad = await fetch(`${BASE}/api/google/oauth/callback?code=x&state=ai${'0'.repeat(48)}`, { headers: { Cookie: `${ca}; ${cookie}` }, redirect: 'manual' });
  ok('retorno com state errado não troca código', bad.status === 302 && /#google-calendar-error/.test(bad.headers.get('location')), bad.headers.get('location'));
  const good = await fetch(`${BASE}/api/google/oauth/callback?code=x&state=${state}`, { headers: { Cookie: `${ca}; ${cookie}` }, redirect: 'manual' });
  ok('state certo + código falso: volta para a Agenda com erro', good.status === 302 && /\/agenda#agenda-account-error/.test(good.headers.get('location')), good.headers.get('location'));

  r = await call(ca, 'DELETE', `/api/agenda/accounts/${acc.id}`);
  ok('desconectar', r.status === 200 && (await pool.query('SELECT 1 FROM user_accounts WHERE id=$1', [acc.id])).rowCount === 0);
} catch (e) {
  failed += 1; console.log('ERRO', e.message, log.slice(-800));
} finally {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[A, B]]).catch(() => {});
  await pool.end();
  app.kill('SIGTERM');
}
console.log(failed ? `\n${failed} falha(s).` : '\nTudo ok.');
process.exit(failed ? 1 : 0);
