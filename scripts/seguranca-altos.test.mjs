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
const PID = `sga_proj_${RUN}`;
const CNPJ = '99.888.777/0001-66';
const U = { gest: `sga_gest_${RUN}`, vend: `sga_vend_${RUN}`, cc: `sga_cc_${RUN}`, adm: `sga_adm_${RUN}`, sup: `sga_sup_${RUN}`, cli: `sga_cli_${RUN}`, pt: `sga_pt_${RUN}`, vic: `sga_vic_${RUN}`, bru: `sga_bru_${RUN}` };
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const hash = await bcrypt.hash(PASS, 10);
async function cleanup() {
  await pool.query(`DELETE FROM project_memory_chunks WHERE project_id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM projects WHERE id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM project_versions WHERE project_id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM user_access_events WHERE user_id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'sga_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'sga_%'`);
}
await cleanup();
const mk = (id, role, extra = '') => pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access${extra ? ',is_super_admin' : ''}) VALUES ($1,$1,$2,$1,$3,$4,true,true${extra ? ',true' : ''})`, [id, hash, role, ORG]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,allowed_cnpjs) VALUES ($1,$1,$2,$1,'cliente',$3,true,false,$4)`, [U.cc, hash, ORG, JSON.stringify([CNPJ])]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,crm_role) VALUES ($1,$1,$2,$1,'pricetax',$3,true,true,'gestor'), ($4,$4,$2,$4,'pricetax',$3,true,true,'vendedor')`, [U.gest, hash, ORG, U.vend]);
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

  // ---- A9: token de link só forte (novo) / mantido (antigo); página pública com lista fechada
  const bru = await login(U.bru, PASS, '203.0.113.99');
  const strong = crypto.randomBytes(24).toString('hex');
  const b0 = (await call(bru.cookie, 'GET', '/api/personal-board')).json;
  const mkPage = (id, tok) => ({ id, name: id, visibility: 'public', shareToken: tok, log: [], columns: [{ id: `${id}c`, name: 'c', cards: [] }] });
  const savedA9 = await call(bru.cookie, 'PATCH', '/api/personal-board', { board: { boards: [mkPage('pf', 'abc123'), mkPage('pg', strong)] }, baseUpdatedAt: b0.updatedAt });
  const gotA9 = (await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [U.bru])).rows[0].data.boards;
  ok('A9: token NOVO fraco/escolhido é trocado pelo servidor por um forte', savedA9.status === 200 && /^[0-9a-f]{48}$/.test(gotA9[0].shareToken) && gotA9[0].shareToken !== 'abc123', gotA9.map((b) => b.shareToken));
  ok('A9: token novo forte é mantido como veio', gotA9[1].shareToken === strong);
  ok('A9: a resposta já traz o quadro com o token do servidor (a tela adota)', savedA9.json.merged === true && savedA9.json.board.boards[0].shareToken === gotA9[0].shareToken);
  const keepOld = await call(bru.cookie, 'PATCH', '/api/personal-board', { board: { boards: [{ ...gotA9[0], shareToken: gotA9[0].shareToken }, mkPage('ph', 'tok_antigo_do_dono')] }, baseUpdatedAt: savedA9.json.updatedAt });
  ok('A9: quadro com forma inválida é recusado (400)', (await call(bru.cookie, 'PATCH', '/api/personal-board', { board: { boards: 'lixo' } })).status === 400 && (await call(bru.cookie, 'PATCH', '/api/personal-board', { board: { boards: [{ nome: 'sem id' }] } })).status === 400);
  ok('A9: nova página com token fraco também é trocada', keepOld.status === 200 && keepOld.json.board.boards[1].shareToken !== 'tok_antigo_do_dono');

  const pubTok = crypto.randomBytes(24).toString('hex');
  const PID2 = `sga_pub_${RUN}`;
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID2, JSON.stringify({ id: PID2, company: { name: 'Empresa Pública Teste', cnpj: '55.444.333/0001-22' }, team: [], phases: [], activities: [], log: [{ ts: '2026-10-01T00:00:00Z', action: 'interno', user: 'x' }],
    meetings: [{ id: 'mp1', title: 'Reunião pública', date: '2026-10-02', time: '10:00', participants: ['Ana'], summary: 'Resumo', decisions: 'Decisão', transcript: 'Transcrição', shareToken: pubTok, shareVisibility: 'public', createdBy: 'SEGREDO-AUTOR', notes: 'nota interna',
      actionItems: [{ id: 'i1', title: 'Tarefa', status: 'nao-iniciado', responsible: 'Ana', dueDate: '2026-11-01', owner: 'cliente', notes: 'NOTA-INTERNA', comments: [{ text: 'COMENTARIO-INTERNO' }], attachments: [{ name: 'anexo', dataUrl: 'data:text/plain;base64,QQ==' }], createdBy: 'IA' }, { id: 'i2', title: 'Apagada', deleted: true }] },
      { id: 'mp2', title: 'Privada', shareToken: crypto.randomBytes(24).toString('hex'), shareVisibility: 'private' }] }), ORG]);
  const pm = await call('', 'GET', `/api/public-meeting/${pubTok}`);
  ok('A9: reunião pública abre sem login', pm.status === 200 && pm.json.meeting.title === 'Reunião pública' && pm.json.companyName === 'Empresa Pública Teste', pm);
  const raw = JSON.stringify(pm.json);
  ok('A9: a página pública NÃO traz anexos, comentários, notas internas nem autor', !/SEGREDO-AUTOR|NOTA-INTERNA|COMENTARIO-INTERNO|nota interna|dataUrl|createdBy/.test(raw), raw);
  ok('A9: traz o necessário (resumo, decisões, transcrição, tarefas ativas)', pm.json.meeting.summary === 'Resumo' && pm.json.meeting.transcript === 'Transcrição' && pm.json.meeting.actionItems.length === 1 && pm.json.meeting.actionItems[0].title === 'Tarefa');
  ok('A9: reunião privada e token inexistente dão 404', (await call('', 'GET', `/api/public-meeting/${(await pool.query('SELECT data FROM projects WHERE id=$1', [PID2])).rows[0].data.meetings[1].shareToken}`)).status === 404 && (await call('', 'GET', '/api/public-meeting/inexistente-123456789')).status === 404);
  const pmProj = (await call(adm.cookie, 'GET', '/api/projects')).json.projects.find((x) => x.id === PID2);
  const withWeak = JSON.parse(JSON.stringify(pmProj)); withWeak.meetings.push({ id: 'mp3', title: 'Nova', shareToken: 'fraco', shareVisibility: 'public' });
  const stampP = (await call(adm.cookie, 'GET', '/api/projects')).json.stamps[PID2];
  await call(adm.cookie, 'PATCH', `/api/projects/${PID2}`, { project: withWeak, baseUpdatedAt: stampP, mergeable: true });
  const m3 = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID2])).rows[0].data.meetings.find((x) => x.id === 'mp3');
  ok('A9: token novo fraco de reunião também é trocado pelo servidor', /^[0-9a-f]{48}$/.test(m3.shareToken), m3.shareToken);
  const rate = [];
  for (let i = 0; i < 70; i += 1) rate.push((await call('', 'GET', `/api/public-meeting/inexistente-123456789`, undefined, '198.51.100.7')).status);
  ok('A9: consulta repetida demais ao link público leva 429', rate.includes(429), [...new Set(rate)]);

  // ---- A3/A4: visão e gravação do usuário `cliente`
  const proj = { id: PID, company: { name: 'Empresa Teste', cnpj: CNPJ }, team: [], phases: [], ownerIds: ['dono-1'], principalOwnerId: 'dono-1',
    activities: [{ id: 'act1', title: 'Atividade', status: 'pending', date: '2026-11-01' }],
    meetings: [{ id: 'mtg1', title: 'Reunião', date: '2026-10-01', transcript: 'TRANSCRICAO INTERNA', actionItems: [{ id: 'mai1', title: 'Tarefa', owner: 'cliente', status: 'nao-iniciado' }] }],
    log: [{ ts: '2026-10-01T10:00:00Z', action: 'linha interna antiga', user: 'Equipe' }] };
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID, JSON.stringify(proj), ORG]);
  const cc = await login(U.cc);
  const gl = await call(cc.cookie, 'GET', '/api/projects');
  const seen = (gl.json.projects || []).find((x) => x.id === PID);
  ok('A4: cliente enxerga a própria empresa', !!seen, gl.status);
  ok('A4: cliente NÃO recebe a transcrição bruta nem o log interno', seen && seen.meetings[0].transcript === '' && Array.isArray(seen.log) && seen.log.length === 0, seen && [seen.meetings[0].transcript, seen.log]);
  ok('A4: cliente recebe o resto da reunião e das tarefas', seen.meetings[0].title === 'Reunião' && seen.meetings[0].actionItems[0].id === 'mai1');
  const staffView = await call(adm.cookie, 'GET', '/api/projects');
  const sv = (staffView.json.projects || []).find((x) => x.id === PID);
  ok('equipe continua vendo transcrição e log', sv && sv.meetings[0].transcript === 'TRANSCRICAO INTERNA' && sv.log.length === 1);
  const mine = JSON.parse(JSON.stringify(seen));
  mine.company.cnpj = '11.111.111/0001-11'; mine.ownerIds = ['invasor']; mine.principalOwnerId = 'invasor'; mine.involvedCompanyIds = ['x'];
  mine.activities[0].status = 'done'; mine.meetings[0].actionItems[0].status = 'concluido';
  mine.log = [{ ts: '2026-10-29T12:00:00Z', action: 'cliente concluiu a atividade', user: 'Cliente' }];
  const pc = await call(cc.cookie, 'PATCH', `/api/projects/${PID}`, { project: mine });
  ok('A3: cliente grava a própria edição (200)', pc.status === 200, pc);
  ok('A3: a resposta ao cliente também não traz transcrição nem log', pc.json.project.meetings[0].transcript === '' && pc.json.project.log.length === 0);
  const db1 = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
  ok('A3: a edição legítima do cliente foi gravada (atividade e tarefa)', db1.activities[0].status === 'done' && db1.meetings[0].actionItems[0].status === 'concluido');
  ok('A3: CNPJ (chave de acesso), responsáveis e grupo NÃO mudam pelo cliente', db1.company.cnpj === CNPJ && db1.ownerIds[0] === 'dono-1' && db1.principalOwnerId === 'dono-1' && db1.involvedCompanyIds === undefined, [db1.company.cnpj, db1.ownerIds]);
  ok('A3: transcrição preservada mesmo o cliente tendo mandado vazio', db1.meetings[0].transcript === 'TRANSCRICAO INTERNA');
  ok('A3: log só ganha a linha nova (a antiga continua)', db1.log.length === 2 && db1.log[0].action === 'cliente concluiu a atividade' && db1.log[1].action === 'linha interna antiga', db1.log);
  const staffEdit = JSON.parse(JSON.stringify(sv)); staffEdit.company.cnpj = CNPJ; staffEdit.meetings[0].transcript = 'EDITADA PELA EQUIPE'; staffEdit.ownerIds = ['dono-2'];
  const ps = await call(adm.cookie, 'PATCH', `/api/projects/${PID}`, { project: staffEdit });
  const db2 = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
  ok('equipe segue gravando tudo (transcrição, responsáveis)', ps.status === 200 && db2.meetings[0].transcript === 'EDITADA PELA EQUIPE' && db2.ownerIds[0] === 'dono-2');
  // ---- A3: carimbo de versão
  const g1 = await call(adm.cookie, 'GET', '/api/projects');
  const stampNow = g1.json.stamps && g1.json.stamps[PID];
  ok('A3: GET /projects devolve o carimbo de cada empresa', !!stampNow, g1.json.stamps);
  const cur1 = (g1.json.projects || []).find((x) => x.id === PID);
  const w1 = await call(adm.cookie, 'PATCH', `/api/projects/${PID}`, { project: { ...cur1, activities: cur1.activities.map((a) => ({ ...a, title: 'Editada A' })) }, baseUpdatedAt: stampNow, mergeable: true });
  ok('A3: gravar com o carimbo atual funciona e devolve o carimbo novo', w1.status === 200 && !!w1.json.updatedAt && w1.json.updatedAt !== stampNow, w1);
  const w2 = await call(adm.cookie, 'PATCH', `/api/projects/${PID}`, { project: { ...cur1, activities: cur1.activities.map((a) => ({ ...a, title: 'Editada B (desatualizada)' })) }, baseUpdatedAt: stampNow, mergeable: true });
  ok('A3: gravar com carimbo ANTIGO leva 409 com a empresa atual e o carimbo novo', w2.status === 409 && w2.json.conflict === true && w2.json.project.activities[0].title === 'Editada A' && w2.json.updatedAt === w1.json.updatedAt, w2);
  const dbAfter = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
  ok('A3: o 409 NÃO gravou nada', dbAfter.activities[0].title === 'Editada A');
  const w3 = await call(adm.cookie, 'PATCH', `/api/projects/${PID}`, { project: { ...cur1, activities: cur1.activities.map((a) => ({ ...a, title: 'Sem carimbo (API/antigo)' })) } });
  ok('A3: sem a marca `mergeable` o comportamento antigo continua (grava)', w3.status === 200 && !!w3.json.updatedAt, w3);
  const cStale = await call(cc.cookie, 'PATCH', `/api/projects/${PID}`, { project: mine, baseUpdatedAt: stampNow, mergeable: true });
  ok('A3: o 409 para o cliente também sai filtrado (sem log, sem transcrição)', cStale.status === 409 && cStale.json.project.log.length === 0 && cStale.json.project.meetings[0].transcript === '', cStale.json && cStale.json.project && [cStale.json.project.log, cStale.json.project.meetings && cStale.json.project.meetings[0].transcript]);
  const naoExiste = await call(cc.cookie, 'PATCH', '/api/projects/nao-existe', { project: { id: 'nao-existe' } });
  ok('projeto inexistente segue 404', naoExiste.status === 404);
  for (let i = 0; i < 25; i += 1) await call(adm.cookie, 'PATCH', '/api/projects/nao-existe', { project: { id: 'nao-existe' } });
  const alive = await call(adm.cookie, 'GET', '/api/projects');
  ok('PATCH que sai cedo (404/403/409) devolve a conexão ao pool (25 seguidos e o servidor continua respondendo)', alive.status === 200);

  // ---- M9: responsável e menção do XFlow só de usuário da mesma base
  await pool.query(`UPDATE users SET xflow_role='admin' WHERE id=$1`, [U.adm]);
  const tk = await call(adm.cookie, 'POST', '/api/xflow/tickets', { title: `Ticket teste ${RUN}`, type: 'TASK' });
  const tid = tk.json && (tk.json.ticket ? tk.json.ticket.id : tk.json.id);
  ok('XFlow: cria ticket de teste', tk.status < 300 && !!tid, tk);
  const badAssign = await call(adm.cookie, 'PATCH', `/api/xflow/tickets/${tid}`, { action: 'reatribuir', payload: { assigneeId: 'usuario-que-nao-existe' } });
  ok('M9: responsável inexistente dá 400 (antes: 500)', badAssign.status === 400, badAssign);
  const outro = await pool.query(`SELECT id FROM users WHERE org_id <> $1 LIMIT 1`, [ORG]);
  if (outro.rows[0]) {
    const cross = await call(adm.cookie, 'PATCH', `/api/xflow/tickets/${tid}`, { action: 'reatribuir', payload: { assigneeId: outro.rows[0].id } });
    ok('M9: responsável de OUTRA base é recusado (400)', cross.status === 400, cross);
  }
  const goodAssign = await call(adm.cookie, 'PATCH', `/api/xflow/tickets/${tid}`, { action: 'reatribuir', payload: { assigneeId: U.pt } });
  ok('M9: responsável da mesma base continua valendo (200)', goodAssign.status === 200, goodAssign);
  const cm = await call(adm.cookie, 'PATCH', `/api/xflow/tickets/${tid}`, { action: 'comentar', payload: { text: 'oi', mentions: [U.pt, 'fantasma', ...(outro.rows[0] ? [outro.rows[0].id] : [])] } });
  const cmData = (await pool.query('SELECT data FROM xflow_tickets WHERE id=$1', [tid])).rows[0].data;
  ok('M9: comentário grava só as menções válidas (da mesma base)', cm.status === 200 && JSON.stringify(cmData.comments[0].mentions) === JSON.stringify([U.pt]), [cm.status, cmData.comments && cmData.comments[0] && cmData.comments[0].mentions]);
  await pool.query(`DELETE FROM xflow_events WHERE ticket_id=$1`, [tid]).catch(() => {});
  await pool.query(`DELETE FROM xflow_tickets WHERE id=$1`, [tid]).catch(() => {});

  // ---- M22: organização suspensa não entra nem continua usando; Super Admin nunca é barrado
  const ORG2 = `sga_org_${RUN}`;
  await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,$1,'Org Teste Suspensão')`, [ORG2]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,$1,'pricetax',$3,true,true)`, [`sga_o2_${RUN}`, hash, ORG2]);
  const o2 = await login(`sga_o2_${RUN}`, PASS, '203.0.113.50');
  ok('M22: organização ativa entra normalmente', o2.status === 200 && (await call(o2.cookie, 'GET', '/api/auth/me')).status === 200, o2.status);
  await pool.query(`UPDATE organizations SET status='suspended' WHERE id=$1`, [ORG2]);
  const o2me = await call(o2.cookie, 'GET', '/api/auth/me');
  ok('M22: suspender a organização derruba a sessão aberta (401 + motivo)', o2me.status === 401 && /suspenso/.test(o2me.json.message), o2me);
  const o2login = await login(`sga_o2_${RUN}`, PASS, '203.0.113.51');
  ok('M22: organização suspensa não loga (403)', o2login.status === 403 && /suspenso/.test(o2login.json.message), o2login);
  await pool.query(`UPDATE users SET org_id=$2 WHERE id=$1`, [U.sup, ORG2]);
  const supLogin = await login(U.sup, PASS, '203.0.113.52');
  ok('M22: Super Administrador não é barrado pelo status da organização', supLogin.status === 200, supLogin.status);
  await pool.query(`UPDATE users SET org_id=$2 WHERE id=$1`, [U.sup, ORG]);
  await pool.query(`DELETE FROM users WHERE org_id=$1`, [ORG2]); await pool.query(`DELETE FROM organizations WHERE id=$1`, [ORG2]);

  // ---- M13: o login (username) da equipe não vai para o cliente
  const tc = await call(cc.cookie, 'GET', `/api/projects/${PID}/team-candidates`);
  ok('M13: cliente recebe a equipe SEM o campo username', tc.status === 200 && tc.json.users.length > 0 && tc.json.users.every((u) => !('username' in u)), tc.json);
  const tcStaff = await call(adm.cookie, 'GET', `/api/projects/${PID}/team-candidates`);
  ok('M13: equipe continua recebendo o username', tcStaff.status === 200 && tcStaff.json.users.every((u) => 'username' in u));

  // ---- M6/M7: contato, Excel e arquivos do PipeRun só para gestão; M12: excluir empresa só Master
  const vend = await login(U.vend, PASS, '203.0.113.60'); const gest = await login(U.gest, PASS, '203.0.113.61');
  const FAKE = '00000000-0000-4000-8000-000000000001';
  const capV = (await call(vend.cookie, 'GET', '/api/crm/me')).json.capabilities; const capG = (await call(gest.cookie, 'GET', '/api/crm/me')).json.capabilities;
  ok('M7: o perfil expõe a capacidade `export` (vendedor não, gestor sim)', capV.export === false && capG.export === true, [capV, capG]);
  ok('M7: vendedor NÃO baixa o Excel de negócios (403); gestor baixa (200)', (await call(vend.cookie, 'GET', '/api/crm/deals/export.xlsx')).status === 403 && (await fetch(`${BASE}/api/crm/deals/export.xlsx`, { headers: { Cookie: gest.cookie } })).status === 200);
  ok('M7: vendedor NÃO lista nem baixa arquivos importados do PipeRun (403); gestor passa da trava', (await call(vend.cookie, 'GET', `/api/crm/deals/${FAKE}/files`)).status === 403 && (await call(vend.cookie, 'GET', `/api/crm/deal-files/${FAKE}/download`)).status === 403 && (await call(gest.cookie, 'GET', `/api/crm/deals/${FAKE}/files`)).status === 200 && (await call(gest.cookie, 'GET', `/api/crm/deal-files/${FAKE}/download`)).status === 404);
  const dc = await call(vend.cookie, 'DELETE', `/api/crm/contacts/${FAKE}`);
  ok('M6: vendedor NÃO exclui contato (403); gestor passa da trava (cai em 404 de contato inexistente)', dc.status === 403 && (await call(gest.cookie, 'DELETE', `/api/crm/contacts/${FAKE}`)).status === 404, dc);
  const PID3 = `sga_del_${RUN}`;
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID3, JSON.stringify({ id: PID3, company: { name: 'Empresa Excluir Teste', cnpj: '77.666.555/0001-44' }, team: [], phases: [], activities: [], meetings: [], log: [] }), ORG]);
  const delPt = await call(vend.cookie, 'DELETE', `/api/projects/${PID3}`);
  ok('M12: usuário PRICETAX (não Master) NÃO exclui empresa (403) e a empresa continua lá', delPt.status === 403 && (await pool.query('SELECT 1 FROM projects WHERE id=$1', [PID3])).rows.length === 1, delPt);
  const delAdm = await call(adm.cookie, 'DELETE', `/api/projects/${PID3}`);
  ok('M12: Master exclui (200)', delAdm.status === 200 && (await pool.query('SELECT 1 FROM projects WHERE id=$1', [PID3])).rows.length === 0, delAdm);

  // ---- M3: token do widget só em hash, mostrado uma vez
  const wt = await call(vend.cookie, 'POST', '/api/widget/token');
  ok('M3: gerar o token do widget devolve o valor UMA vez', wt.status === 200 && /^pxw_/.test(wt.json.token), wt);
  const wrow = (await pool.query('SELECT widget_token_hash, widget_token_enc FROM users WHERE id=$1', [U.vend])).rows[0];
  ok('M3: o banco guarda só o hash (a coluna recuperável fica vazia)', wrow.widget_token_enc === null && wrow.widget_token_hash === crypto.createHash('sha256').update(wt.json.token).digest('hex'), wrow);
  ok('M3: o token NÃO pode ser lido de novo (410) e o status diz que não é recuperável', (await call(vend.cookie, 'GET', '/api/widget/token')).status === 410 && (await call(vend.cookie, 'GET', '/api/widget/status')).json.recoverable === false);
  const ws = await fetch(`${BASE}/api/widget/summary`, { headers: { Authorization: `Bearer ${wt.json.token}` } });
  ok('M3: o widget segue funcionando com o token guardado em hash', ws.status === 200, ws.status);
  await pool.query(`UPDATE users SET widget_token_enc='lixo-cifrado-antigo' WHERE id=$1`, [U.vend]);
  const { wipeRecoverableWidgetTokens } = await import('../server/widget.js');
  ok('M3: a limpeza do boot apaga o que ainda estava recuperável e não derruba o token', (await wipeRecoverableWidgetTokens()) >= 1 && (await pool.query('SELECT widget_token_enc FROM users WHERE id=$1', [U.vend])).rows[0].widget_token_enc === null && (await fetch(`${BASE}/api/widget/summary`, { headers: { Authorization: `Bearer ${wt.json.token}` } })).status === 200);
  const wt2 = await call(vend.cookie, 'POST', '/api/widget/token');
  ok('M3: gerar outro token invalida o antigo (401)', wt2.status === 200 && (await fetch(`${BASE}/api/widget/summary`, { headers: { Authorization: `Bearer ${wt.json.token}` } })).status === 401);

  // ---- M22: "excluir" usuário = desativar (não apaga a linha), revoga o que dá acesso
  const VICT = `sga_vict_${RUN}`;
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,$1,'pricetax',$3,true,true)`, [VICT, hash, ORG]);
  const victS = await login(VICT, PASS, '203.0.113.70');
  const victKey = await call(victS.cookie, 'POST', '/api/connect/tokens', { name: 'chave da vítima', scope: 'read', days: 30 });
  const victW = await call(victS.cookie, 'POST', '/api/widget/token');
  await pool.query(`INSERT INTO google_calendar_connections (user_id, access_token, refresh_token, token_expiry) VALUES ($1,'a','r', now())`, [VICT]);
  await pool.query(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ($2,$1,$3,'k','a')`, [VICT, `sga_ps_${RUN}`, `https://fcm.googleapis.com/sga/${RUN}`]);
  ok('M22: preparo — a vítima tem sessão, chave de API e widget', victS.status === 200 && victKey.status === 201 && victW.status === 200, [victKey.status, victW.status]);
  const delU = await call(adm.cookie, 'DELETE', `/api/users/${VICT}`);
  ok('M22: DELETE /users responde 200 e diz que DESATIVOU', delU.status === 200 && delU.json.ok === true && delU.json.deactivated === true, delU);
  const vrow = (await pool.query('SELECT blocked, block_reason, widget_token_hash, password_hash FROM users WHERE id=$1', [VICT])).rows[0];
  ok('M22: a linha continua no banco, bloqueada, com motivo, sem widget e com senha trocada', !!vrow && vrow.blocked === true && /removida/i.test(vrow.block_reason) && vrow.widget_token_hash === null && vrow.password_hash !== hash, vrow);
  ok('M22: a sessão aberta da pessoa cai (401)', (await call(victS.cookie, 'GET', '/api/auth/me')).status === 401);
  ok('M22: a chave de API é revogada (401)', (await fetch(`${BASE}/api/connect/companies`, { headers: { Authorization: `Bearer ${victKey.json.token}` } })).status === 401);
  ok('M22: o widget da pessoa para (401/403)', [401, 403].includes((await fetch(`${BASE}/api/widget/summary`, { headers: { Authorization: `Bearer ${victW.json.token}` } })).status));
  ok('M22: a conexão do Google e o push são apagados', (await pool.query('SELECT 1 FROM google_calendar_connections WHERE user_id=$1', [VICT])).rows.length === 0 && (await pool.query('SELECT 1 FROM push_subscriptions WHERE user_id=$1', [VICT])).rows.length === 0);
  ok('M22: não entra mais com a senha antiga (403) e o login não pode ser recriado (409)', (await login(VICT, PASS, '203.0.113.71')).status === 403 && (await call(adm.cookie, 'POST', '/api/users', { username: VICT, password: 'outra-senha-12345', name: 'x', role: 'pricetax' })).status === 409);
  const lastMaster = await call(adm.cookie, 'DELETE', `/api/users/${U.adm}`);
  ok('M22: continua não podendo remover a si mesmo (400)', lastMaster.status === 400);
  const back = await call(adm.cookie, 'POST', `/api/users/${VICT}/renew`, { days: 30 });
  const back2 = await call(adm.cookie, 'POST', `/api/users/${VICT}/reset-password`, { newPassword: 'senha-nova-12345' });
  ok('M22: dá para reativar (Renovar + Redefinir senha) e a pessoa volta a entrar', back.status === 200 && back2.status === 200 && (await login(VICT, 'senha-nova-12345', '203.0.113.72')).status === 200);

  // ---- M5/M10/M17/M21 e cabeçalhos
  const hd = await fetch(`${BASE}/api/auth/me`);
  ok('M4: cabeçalhos de segurança presentes', hd.headers.get('x-content-type-options') === 'nosniff' && hd.headers.get('x-frame-options') === 'SAMEORIGIN' && /strict-origin/.test(hd.headers.get('referrer-policy') || ''));
  const ag = await call(adm.cookie, 'GET', '/api/agenda?start=lixo&end=2026-13-45');
  ok('M10: agenda com datas inválidas dá 400 (antes: 500)', ag.status === 400, ag);
} catch (e) {
  failed += 1; console.log('FAIL erro inesperado', e);
} finally {
  await cleanup();
  await pool.end();
}
console.log(failed ? `\n${failed} falha(s)` : '\ntudo certo');
process.exit(failed ? 1 : 0);
