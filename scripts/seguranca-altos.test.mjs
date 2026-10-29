// Teste HTTP das correções de segurança "ALTO" de 2026-10-29 (A1, A2, A5, A6, A8, A9, A10 + senha mínima + transcrição só da equipe).
// Contra servidor e Postgres LOCAIS (sandbox-edu), com usuários temporários que são apagados no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/seguranca-altos.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';
import { isPrivateAddress } from '../server/linkPreview.js';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { adm: `sga_adm_${RUN}`, sup: `sga_sup_${RUN}`, cli: `sga_cli_${RUN}`, pt: `sga_pt_${RUN}`, vic: `sga_vic_${RUN}`, bru: `sga_bru_${RUN}` };
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const hash = await bcrypt.hash(PASS, 10);
async function cleanup() {
  await pool.query(`DELETE FROM user_access_events WHERE user_id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'sga_%'`);
}
await cleanup();
const mk = (id, role, extra = '') => pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access${extra ? ',is_super_admin' : ''}) VALUES ($1,$1,$2,$1,$3,$4,true,true${extra ? ',true' : ''})`, [id, hash, role, ORG]);
await mk(U.adm, 'master'); await mk(U.sup, 'master', 'super'); await mk(U.cli, 'cliente'); await mk(U.pt, 'pricetax'); await mk(U.vic, 'pricetax'); await mk(U.bru, 'pricetax');

const call = async (cookie, method, path, body, ip) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'x-forwarded-for': ip || `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
};
const login = async (u, p = PASS, ip) => call('', 'POST', '/api/auth/login', { username: u, password: p }, ip);

try {
  // ---- A6: SSRF
  const bad = ['::', '::1', '::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '::127.0.0.1', '::7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::', 'fc00::1', 'fd12::1', 'fe80::1', 'fec0::1', 'ff02::1', '127.0.0.1', '10.0.0.1', '169.254.169.254', '0:0:0:0:0:ffff:7f00:1', '::ffff:0a00:0001'];
  const good = ['8.8.8.8', '2606:4700:4700::1111', '::ffff:808:808', '2a00:1450:4001:81a::200e', '64:ff9b::808:808'];
  ok('A6: todo endereço interno/mapeado em IPv6 é bloqueado', bad.every((a) => isPrivateAddress(a)), bad.filter((a) => !isPrivateAddress(a)));
  ok('A6: endereços públicos continuam liberados', good.every((a) => !isPrivateAddress(a)), good.filter((a) => isPrivateAddress(a)));

  // ---- A1: sessão aberta precisa continuar valendo só enquanto o usuário vale
  const adm = await login(U.adm); const cli = await login(U.cli); const pt = await login(U.pt); const vic = await login(U.vic);
  ok('login dos usuários temporários', !!adm.cookie && !!cli.cookie && !!pt.cookie && !!vic.cookie, [adm.status, cli.status]);
  ok('A1: sessão comum funciona', (await call(vic.cookie, 'GET', '/api/auth/me')).status === 200);
  await pool.query(`UPDATE users SET blocked=true, block_reason='teste' WHERE id=$1`, [U.vic]);
  const blk = await call(vic.cookie, 'GET', '/api/auth/me');
  ok('A1: bloquear o usuário derruba a sessão aberta (401 + motivo)', blk.status === 401 && /teste/.test(blk.json.message), [blk.status, blk.json]);
  await pool.query(`UPDATE users SET blocked=false, block_reason='', expires_at=current_date - 1 WHERE id=$1`, [U.vic]);
  ok('A1: acesso vencido derruba a sessão aberta', (await call(vic.cookie, 'GET', '/api/auth/me')).status === 401);
  await pool.query(`UPDATE users SET expires_at=NULL WHERE id=$1`, [U.vic]);
  ok('A1: liberado de novo, o mesmo cookie volta a valer', (await call(vic.cookie, 'GET', '/api/auth/me')).status === 200);

  // trocar a senha: derruba as OUTRAS sessões, mantém a de quem trocou
  const other = await login(U.pt);
  const NEWP = crypto.randomBytes(10).toString('base64url');
  const ch = await call(pt.cookie, 'POST', '/api/auth/change-password', { currentPassword: PASS, newPassword: NEWP });
  ok('troca de senha pelo próprio usuário (200) e devolve cookie novo', ch.status === 200 && !!ch.cookie, [ch.status, ch.json]);
  ok('A1: a sessão de quem trocou a senha continua valendo (cookie novo)', (await call(ch.cookie, 'GET', '/api/auth/me')).status === 200);
  ok('A1: outra sessão aberta com a senha antiga cai (401)', (await call(other.cookie, 'GET', '/api/auth/me')).status === 401);
  ok('A1: o cookie antigo (anterior à troca) também cai', (await call(pt.cookie, 'GET', '/api/auth/me')).status === 401);

  // ---- senha mínima
  const short = await call(adm.cookie, 'POST', `/api/users/${U.cli}/reset-password`, { newPassword: '1234567' });
  ok('senha com 7 caracteres é recusada (400) na redefinição', short.status === 400, short);
  const cs = await call(ch.cookie, 'POST', '/api/auth/change-password', { currentPassword: NEWP, newPassword: 'abc' });
  ok('senha curta é recusada na troca (400)', cs.status === 400);
  const mkShort = await call(adm.cookie, 'POST', '/api/users', { username: `sga_new_${RUN}`, password: '123', name: 'x', role: 'pricetax' });
  ok('senha curta é recusada na criação de usuário (400)', mkShort.status === 400);
  const reset = await call(adm.cookie, 'POST', `/api/users/${U.cli}/reset-password`, { newPassword: 'senha-nova-12345' });
  ok('redefinição com 8+ caracteres funciona', reset.status === 200, reset);
  ok('redefinição pelo administrador derruba a sessão aberta do usuário', (await call(cli.cookie, 'GET', '/api/auth/me')).status === 401);

  // ---- A2: limite de tentativas de login
  const ip1 = '203.0.113.10';
  let last;
  for (let i = 0; i < 6; i += 1) last = await login(U.bru, 'senha-errada', ip1);
  ok('A2: as 6 primeiras senhas erradas respondem 401', last.status === 401, last.status);
  const lim = await login(U.bru, PASS, ip1);
  ok('A2: a 7ª tentativa do mesmo usuário+IP leva 429, mesmo com a senha certa', lim.status === 429 && /Muitas tentativas/.test(lim.json.message), [lim.status, lim.json]);
  const otherIp = await login(U.bru, PASS, '203.0.113.11');
  ok('A2: de outro IP o usuário legítimo ainda entra', otherIp.status === 200, otherIp.status);
  const otherUser = await login(U.adm, PASS, ip1);
  ok('A2: outro usuário no mesmo IP não é afetado', otherUser.status === 200, otherUser.status);
  const cpl = await call('', 'POST', '/api/auth/change-password-login', { username: U.bru, currentPassword: 'errada', newPassword: 'qualquer-senha-1' }, ip1);
  ok('A2: a troca de senha pela tela de login respeita o mesmo limite', cpl.status === 429, cpl.status);

  // ---- A10: Master não mexe em Super Administrador
  const patchSup = await call(adm.cookie, 'PATCH', `/api/users/${U.sup}`, { name: 'invasor' });
  ok('A10: Master comum NÃO altera Super Administrador (403)', patchSup.status === 403, patchSup);
  const rstSup = await call(adm.cookie, 'POST', `/api/users/${U.sup}/reset-password`, { newPassword: 'invasao-12345' });
  ok('A10: Master comum NÃO redefine a senha do Super Administrador (403)', rstSup.status === 403, rstSup);
  const delSup = await call(adm.cookie, 'DELETE', `/api/users/${U.sup}`);
  ok('A10: Master comum NÃO exclui Super Administrador (403)', delSup.status === 403);
  const blkSup = await call(adm.cookie, 'POST', `/api/users/${U.sup}/block`, { blocked: true });
  ok('A10: Master comum NÃO bloqueia Super Administrador (403)', blkSup.status === 403);
  const supRow = await pool.query('SELECT name, blocked FROM users WHERE id=$1', [U.sup]);
  ok('A10: nada do Super Administrador mudou no banco', supRow.rows[0].name === U.sup && supRow.rows[0].blocked === false);
  const patchPt = await call(adm.cookie, 'PATCH', `/api/users/${U.bru}`, { name: 'Bruno Teste' });
  ok('A10: Master comum segue editando usuário comum (200)', patchPt.status === 200, patchPt);

  // ---- A5 e transcrição: só equipe
  const cli2 = await login(U.cli, 'senha-nova-12345');
  const act = await call(cli2.cookie, 'POST', '/api/assistant/messages/qualquer/action', { projectId: 'x', decision: 'confirm' });
  ok('A5: usuário cliente NÃO confirma ação da RENATA (403)', act.status === 403 && /equipe/.test(act.json.message), act);
  const actStaff = await call(otherUser.cookie, 'POST', '/api/assistant/messages/qualquer/action', { projectId: 'nao-existe', decision: 'confirm' });
  ok('A5: equipe passa da trava de papel (cai em "Empresa não encontrada")', actStaff.status === 404, actStaff);
  const inbox = await call(cli2.cookie, 'POST', '/api/meeting-inbox', { projectId: 'x', transcript: 'texto' });
  ok('usuário cliente NÃO envia transcrição para a IA (403)', inbox.status === 403, inbox);
  const retry = await call(cli2.cookie, 'POST', '/api/meeting-inbox/retry-failed', { projectId: 'x' });
  ok('usuário cliente NÃO reprocessa transcrições (403)', retry.status === 403, retry);

  // ---- A9: colaborador não muda visibilidade nem token do link público
  const board = { id: 'bd1', name: 'Quadro', visibility: 'public', shareToken: `tok_${RUN}`, log: [], columns: [{ id: 'c1', name: 'A fazer', visibility: 'public', shareToken: `col_${RUN}`, cards: [] }, { id: 'c2', name: 'Outra', cards: [] }] };
  await pool.query(`INSERT INTO personal_boards (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data=$2`, [U.bru, JSON.stringify({ boards: [board] })]);
  const evil = JSON.parse(JSON.stringify(board));
  evil.visibility = 'private'; evil.shareToken = 'sequestrado'; evil.columns[0].shareToken = 'sequestrado2'; evil.columns[1].visibility = 'public'; evil.columns[1].shareToken = 'novo';
  evil.columns[0].cards.push({ id: 'k1', title: 'do colaborador', checklist: [], tags: [], history: [] });
  const g = await call(adm.cookie, 'GET', `/api/public-board/${board.shareToken}`);
  const pr = await call(adm.cookie, 'PATCH', `/api/public-board/${board.shareToken}`, { board: evil, baseUpdatedAt: g.json && g.json.updatedAt, mergeable: true });
  ok('A9: colaborador grava pelo link (200)', pr.status === 200, pr);
  const stored = (await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [U.bru])).rows[0].data.boards[0];
  ok('A9: visibilidade e token da página ficam como o dono definiu', stored.visibility === 'public' && stored.shareToken === board.shareToken, [stored.visibility, stored.shareToken]);
  ok('A9: token da coluna compartilhada fica intacto', stored.columns[0].shareToken === `col_${RUN}` && stored.columns[0].visibility === 'public');
  ok('A9: colaborador não torna outra coluna pública', stored.columns[1].visibility === undefined && stored.columns[1].shareToken === undefined, stored.columns[1]);
  ok('A9: o cartão que o colaborador criou foi gravado', stored.columns[0].cards.some((c) => c.title === 'do colaborador'));
} catch (e) {
  failed += 1; console.log('FAIL erro inesperado', e);
} finally {
  await cleanup();
  await pool.end();
}
console.log(failed ? `\n${failed} falha(s)` : '\ntudo certo');
process.exit(failed ? 1 : 0);
