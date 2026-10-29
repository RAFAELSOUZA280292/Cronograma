// Teste de integração do versionamento do cronograma (§83): gatilho do banco, quem gravou, coalescência, permissões, restauração com backup e desfazer,
// exclusão/recuperação de empresa, falha isolada do gatilho e retenção. Roda contra o servidor LOCAL e o Postgres LOCAL (recusa outro banco).
// Cria usuários/empresas temporários (prefixo oitmp), usa e apaga no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/project-versions-http.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: este teste só roda contra banco local.'); process.exit(2); }
process.env.DATABASE_URL = DB;
const PASS = crypto.randomBytes(12).toString('base64url');

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const q = (sql, p) => pool.query(sql, p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(username) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASS }) });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const call = async (cookie, method, path, body, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, json };
};

const sub = (id, o = {}) => ({ id, title: `Sub ${id}`, done: false, ...o });
const act = (id, o = {}) => ({ id, title: `Atividade ${id}`, phase: 1, month: 1, date: '2026-11-10', endDate: '2026-11-10', status: 'nao-iniciado', responsible: 'Compras', comments: [], attachments: [], subactivities: [], ...o });
const PID = 'oitmp-proj-1'; const CNPJ = '00.000.000/0001-91';
const baseProject = () => ({
  id: PID, company: { cnpj: CNPJ, name: 'Empresa Teste Versões', areas: [] }, log: [], meetings: [], externalContacts: [],
  phases: [{ id: 1, name: 'Leitura', color: '#fff' }, { id: 2, name: 'Mão na massa', color: '#000' }], team: ['PRICETAX', 'Compras'],
  activities: [act('a1', { subactivities: [sub('s1', { kind: 'reuniao' }), sub('s2', { pautaDe: 's1' })] }), act('a2', { phase: 2, date: '2026-12-01', endDate: '2026-12-01' })],
});
const versions = (pid = PID, extra = '') => q(`SELECT * FROM project_versions WHERE project_id=$1 ${extra} ORDER BY id ASC`, [pid]);
const getProject = async (cookie) => (await call(cookie, 'GET', '/api/projects')).json.projects.find((p) => p.id === PID);
const patch = (cookie, project) => call(cookie, 'PATCH', `/api/projects/${PID}`, { project });

async function cleanup() {
  await q(`DELETE FROM api_tokens WHERE id LIKE 'oitmp-%'`);
  await q(`DELETE FROM projects WHERE id LIKE 'oitmp-proj%'`);
  await q(`DELETE FROM project_versions WHERE project_id LIKE 'oitmp-proj%'`);
  await q(`DELETE FROM users WHERE id LIKE 'oitmp_%'`);
  await q(`DELETE FROM organizations WHERE id='eval-org-oitmp'`);
  await q(`ALTER TABLE IF EXISTS project_versions_x RENAME TO project_versions`).catch(() => {});
}

const { rows: [org] } = await q(`SELECT org_id FROM users WHERE role='master' AND org_id IS NOT NULL AND org_id NOT LIKE 'eval-%' LIMIT 1`);
const ORG_A = org.org_id; const ORG_B = 'eval-org-oitmp';
await cleanup();
await q(`INSERT INTO organizations (id, slug, name) VALUES ($1,'oitmp','OITMP')`, [ORG_B]);
const hash = await bcrypt.hash(PASS, 10);
const mk = (id, name, role, orgId, all) => q(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,$3,$4,$5,$6,$6)`, [id, hash, name, role, orgId, all]);
await mk('oitmp_master', 'Marta Master', 'master', ORG_A, true);
await mk('oitmp_master2', 'Outra Org', 'master', ORG_B, true);
await mk('oitmp_staff', 'Sergio Staff', 'pricetax', ORG_A, true);
await mk('oitmp_cli', 'Cliente Teste', 'cliente', ORG_A, false);
await q(`INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)`, [PID, JSON.stringify(baseProject()), ORG_A]);
const C = { master: await login('oitmp_master'), master2: await login('oitmp_master2'), staff: await login('oitmp_staff'), cli: await login('oitmp_cli') };
ok('login dos usuários temporários', Object.values(C).every(Boolean));

// 0. A instalação
const trg = (await q(`SELECT tgname FROM pg_trigger WHERE tgrelid='projects'::regclass AND NOT tgisinternal`)).rows.map((r) => r.tgname);
ok('gatilhos de captura instalados (UPDATE e DELETE)', trg.includes('project_versions_upd') && trg.includes('project_versions_del'), trg);
ok('INSERT direto (criação) não gera versão', (await versions()).rows.length === 0);

// 1. Backup automático + rastreabilidade
const p0 = await getProject(C.staff);
ok('staff enxerga a empresa de teste', !!p0);
const p1 = JSON.parse(JSON.stringify(p0)); p1.activities[0].date = '2026-11-20'; p1.activities[0].status = 'em-andamento';
ok('PATCH da tela funciona', (await patch(C.staff, p1)).status === 200);
let vs = (await versions()).rows;
ok('1ª alteração cria 1 versão com o estado ANTERIOR', vs.length === 1 && vs[0].snapshot.activities[0].date === '2026-11-10' && vs[0].kind === 'auto', vs.length);
ok('versão registra quem (nome e id), quando e de onde', vs[0].actor_name === 'Sergio Staff' && vs[0].actor_id === 'oitmp_staff' && vs[0].origin === `PATCH /api/projects/${PID}` && !!vs[0].created_at, { n: vs[0].actor_name, o: vs[0].origin });
ok('resumo guarda a atividade alterada', vs[0].touched.changed.length === 1 && vs[0].touched.changed[0].id === 'a1', vs[0].touched);
ok('estatísticas da versão (2 atividades, 2 subs)', vs[0].stats.activities === 2 && vs[0].stats.subs === 2, vs[0].stats);

// 2. Coalescência do autosave e troca de autor
const p2 = JSON.parse(JSON.stringify(p1)); p2.activities[1].date = '2026-12-05';
await patch(C.staff, p2);
const p3 = JSON.parse(JSON.stringify(p2)); p3.activities[1].title = 'Título novo';
await patch(C.staff, p3);
vs = (await versions()).rows;
ok('várias gravações seguidas da mesma pessoa viram 1 ponto (autosave)', vs.length === 1, vs.length);
ok('o resumo do ponto soma as atividades alteradas na janela', vs[0].touched.changed.map((x) => x.id).sort().join() === 'a1,a2', vs[0].touched);
const p4 = JSON.parse(JSON.stringify(p3)); p4.activities[0].responsible = 'Fiscal';
await patch(C.master, p4);
vs = (await versions()).rows;
ok('outra pessoa gravando abre um novo ponto, atribuído a ela', vs.length === 2 && vs[1].actor_name === 'Marta Master', vs.map((v) => v.actor_name));
ok('o novo ponto guarda o estado que a 1ª pessoa deixou (título novo)', vs[1].snapshot.activities[1].title === 'Título novo');

// 3. O que NÃO vira versão
const p5 = JSON.parse(JSON.stringify(p4)); p5.log = [{ ts: new Date().toISOString(), action: 'só log', user: 'x' }]; p5.meetings = [{ id: 'm1', title: 'Reunião', actionItems: [] }];
await patch(C.master, p5);
ok('mudança só em log/reuniões não cria versão', (await versions()).rows.length === 2);
await patch(C.master, p5);
ok('PATCH idêntico não cria versão', (await versions()).rows.length === 2);

// 4. Leitura, comparação e permissões
const list = await call(C.staff, 'GET', `/api/project-history/${PID}/versions`);
ok('PRICETAX lista o histórico', list.status === 200 && list.json.versions.length === 2 && list.json.canRestore === false, list.json && list.json.versions && list.json.versions.length);
ok('lista vem do mais novo ao mais antigo, sem o snapshot pesado', list.json.versions[0].id > list.json.versions[1].id && list.json.versions[0].snapshot === undefined);
ok('cliente não vê histórico (403)', (await call(C.cli, 'GET', `/api/project-history/${PID}/versions`)).status === 403);
ok('sem login → 401', (await call('', 'GET', `/api/project-history/${PID}/versions`)).status === 401);
ok('outra organização não enxerga (404)', (await call(C.master2, 'GET', `/api/project-history/${PID}/versions`)).status === 404);
ok('outra organização não compara', (await call(C.master2, 'GET', `/api/project-history/${PID}/diff?from=${vs[0].id}&to=current`)).status === 404);
const v1 = Number(vs[0].id);
const cmp = await call(C.staff, 'GET', `/api/project-history/${PID}/diff?from=${v1}&to=current`);
const a1d = cmp.json.diff.activities.find((x) => x.id === 'a1');
const dateChange = a1d.fields.find((f) => f.field === 'date');
ok('comparar versão × atual mostra valor anterior e posterior', dateChange && dateChange.before === '2026-11-10' && dateChange.after === '2026-11-20', dateChange);
ok('comparação traz responsável alterado e totais', a1d.fields.some((f) => f.field === 'responsible' && f.after === 'Fiscal') && cmp.json.diff.summary.activitiesChanged === 2, cmp.json.diff.summary);
const cmp2 = await call(C.staff, 'GET', `/api/project-history/${PID}/diff?from=${vs[0].id}&to=${vs[1].id}`);
ok('comparar duas versões entre si', cmp2.status === 200 && cmp2.json.diff.summary.total > 0);
ok('versão inexistente → 404', (await call(C.staff, 'GET', `/api/project-history/${PID}/diff?from=999999999&to=current`)).status === 404);

// 5. Ponto de restauração manual
ok('ponto manual exige nome', (await call(C.staff, 'POST', `/api/project-history/${PID}/versions`, { label: '  ' })).status === 400);
const man = await call(C.staff, 'POST', `/api/project-history/${PID}/versions`, { label: 'Antes de reorganizar a fase 2' });
ok('PRICETAX cria ponto de restauração manual', man.status === 201 && man.json.version.kind === 'manual' && man.json.version.actorName === 'Sergio Staff');
ok('cliente não cria ponto manual', (await call(C.cli, 'POST', `/api/project-history/${PID}/versions`, { label: 'x' })).status === 403);
const manId = man.json.version.id;

// 6. Restauração segura
const before = await getProject(C.master);
const noPerm = await call(C.staff, 'POST', `/api/project-history/${PID}/versions/${v1}/restore`, { confirm: true });
ok('PRICETAX não restaura (403)', noPerm.status === 403);
ok('cliente não restaura (403)', (await call(C.cli, 'POST', `/api/project-history/${PID}/versions/${v1}/restore`, { confirm: true })).status === 403);
ok('outra org não restaura', (await call(C.master2, 'POST', `/api/project-history/${PID}/versions/${v1}/restore`, { confirm: true })).status === 404);
const noConfirm = await call(C.master, 'POST', `/api/project-history/${PID}/versions/${v1}/restore`, {});
ok('sem confirmação nada é gravado (400)', noConfirm.status === 400 && JSON.stringify((await getProject(C.master)).activities) === JSON.stringify(before.activities));
const dry = await call(C.master, 'POST', `/api/project-history/${PID}/versions/${v1}/restore`, { dryRun: true });
ok('simulação mostra o que mudaria, sem gravar', dry.status === 200 && dry.json.dryRun === true && dry.json.diff.summary.total > 0 && JSON.stringify((await getProject(C.master)).activities) === JSON.stringify(before.activities) && (await versions()).rows.length === 3);
// colaboração e criação posteriores à versão
const pc = JSON.parse(JSON.stringify(await getProject(C.master)));
pc.activities[0].comments.push({ id: 'c1', text: 'comentário feito depois', author: 'X' });
pc.activities.push(act('a3', { title: 'Criada depois da versão', phase: 2, subactivities: [sub('s9')] }));
pc.activities[0].subactivities.push(sub('s8', { title: 'Sub criada depois' }));
await patch(C.master, pc);
const stateBeforeRestore = await getProject(C.master);
const rs = await call(C.master, 'POST', `/api/project-history/${PID}/versions/${v1}/restore`, { confirm: true, note: 'teste de restauração' });
ok('Master restaura com confirmação', rs.status === 200 && rs.json.ok === true && Number.isInteger(rs.json.backupVersionId), rs.json);
const after = await getProject(C.master);
const byId = Object.fromEntries(after.activities.map((a) => [a.id, a]));
ok('datas/status/responsável voltaram ao da versão', byId.a1.date === '2026-11-10' && byId.a1.status === 'nao-iniciado' && byId.a1.responsible === 'Compras', byId.a1);
ok('NADA foi apagado: a atividade criada depois foi para a lixeira', byId.a3 && byId.a3.deleted === true && byId.a3.title === 'Criada depois da versão' && /Restauração da versão/.test(byId.a3.deletedBy));
ok('a subatividade criada depois também foi para a lixeira (não sumiu)', byId.a1.subactivities.find((s) => s.id === 's8').deleted === true);
ok('o comentário feito depois da versão foi preservado', byId.a1.comments.length === 1 && byId.a1.comments[0].text === 'comentário feito depois');
ok('vínculo de pauta (s2 → reunião s1) continua íntegro', byId.a1.subactivities.find((s) => s.id === 's2').pautaDe === 's1');
ok('reuniões e dados da empresa não foram tocados', JSON.stringify(after.meetings) === JSON.stringify(stateBeforeRestore.meetings) && after.company.cnpj === CNPJ);
ok('o Log da empresa registrou a restauração (quem, versão, backup)', /Versão #\d+ restaurada por Marta Master\. Backup do estado anterior: versão #\d+/.test(after.log[0].action), after.log[0]);
const bk = (await q(`SELECT * FROM project_versions WHERE id=$1`, [rs.json.backupVersionId])).rows[0];
ok('backup automático do estado atual (pre_restore) foi criado ANTES de restaurar', bk.kind === 'pre_restore' && bk.restored_from === String(v1) && bk.snapshot.activities.some((a) => a.id === 'a3' && !a.deleted) && bk.actor_name === 'Marta Master', bk && { k: bk.kind, rf: bk.restored_from });
ok('a restauração não criou um ponto "automático" duplicado', (await versions(PID, `AND kind='auto'`)).rows.length === 3);

// 7. Desfazer a restauração
const undo = await call(C.master, 'POST', `/api/project-history/${PID}/versions/${rs.json.backupVersionId}/restore`, { confirm: true, note: 'desfazer' });
ok('desfazer a restauração (restaurar o backup) funciona', undo.status === 200);
const undone = await getProject(C.master);
const live = (p) => p.activities.filter((a) => !a.deleted).map((a) => ({ id: a.id, date: a.date, status: a.status, responsible: a.responsible, title: a.title, subs: a.subactivities.filter((s) => !s.deleted).map((s) => s.id), comments: a.comments.length }));
ok('depois de desfazer, o cronograma vivo é idêntico ao de antes da restauração', JSON.stringify(live(undone)) === JSON.stringify(live(stateBeforeRestore)), { depois: live(undone), antes: live(stateBeforeRestore) });

// 8. Restauração parcial
const pp = JSON.parse(JSON.stringify(await getProject(C.master)));
pp.activities.find((a) => a.id === 'a1').date = '2027-02-02'; pp.activities.find((a) => a.id === 'a2').date = '2027-03-03';
await patch(C.master, pp);
const part = await call(C.master, 'POST', `/api/project-history/${PID}/versions/${manId}/restore`, { confirm: true, activityIds: ['a1'] });
const partP = await getProject(C.master);
ok('restauração parcial: só a1 voltou; a2 ficou como estava', part.status === 200 && partP.activities.find((a) => a.id === 'a1').date !== '2027-02-02' && partP.activities.find((a) => a.id === 'a2').date === '2027-03-03', part.json);
ok('restauração parcial de atividade inexistente na versão é bloqueada (409) e nada muda', (await call(C.master, 'POST', `/api/project-history/${PID}/versions/${manId}/restore`, { confirm: true, activityIds: ['nao-existe'] })).status === 409);

// 9. Outros caminhos de gravação: API de conectividade (transação, client.query) e SQL sem usuário
const tokenPlain = `pxk_oitmp${crypto.randomBytes(16).toString('hex')}`;
await q(`INSERT INTO api_tokens (id, user_id, name, scope, token_hash, expires_at) VALUES ('oitmp-tok','oitmp_master','Chave de Teste','read_write',$1, now() + interval '1 day')`, [crypto.createHash('sha256').update(tokenPlain).digest('hex')]);
const nBefore = (await versions()).rows.length;
const plan = await call('', 'POST', `/api/connect/companies/${PID}/plan`, { dryRun: false, note: 'teste', ops: [{ op: 'activity.set', ref: { id: 'a2' }, set: { status: 'em-andamento' } }] }, { Authorization: `Bearer ${tokenPlain}` });
ok('API de conectividade grava o cronograma', plan.status === 200 && plan.json.applied === 1, plan.json);
const apiV = (await versions()).rows.slice(nBefore);
ok('a gravação pela API também gera versão, atribuída à chave e ao dono', apiV.length === 1 && /Marta Master \(API, chave "Chave de Teste"\)/.test(apiV[0].actor_name) && /^API POST/.test(apiV[0].origin), apiV.map((v) => [v.actor_name, v.origin]));
await q(`UPDATE projects SET data = jsonb_set(data, '{activities,0,title}', '"Alterado por SQL direto"') WHERE id=$1`, [PID]);
const sql = (await versions()).rows.slice(-1)[0];
ok('SQL direto (sem usuário) também é capturado, marcado como sistema', sql.actor_name.startsWith('Sistema') && sql.snapshot.activities[0].title !== 'Alterado por SQL direto', sql.actor_name);

// 10. Excluir e recuperar empresa
const delPid = 'oitmp-proj-2';
await q(`INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)`, [delPid, JSON.stringify({ ...baseProject(), id: delPid, company: { cnpj: '11.111.111/0001-11', name: 'Empresa Excluída Teste', areas: [] } }), ORG_A]);
const dstaff = await call(C.staff, 'DELETE', `/api/projects/${delPid}`);
ok('PRICETAX (não Master) NÃO exclui empresa (403) e ela continua (M12)', dstaff.status === 403 && !!(await q(`SELECT 1 FROM projects WHERE id=$1`, [delPid])).rows[0]);
const dres = await call(C.master, 'DELETE', `/api/projects/${delPid}`);
ok('empresa excluída pela tela (Master)', dres.status === 200 && !(await q(`SELECT 1 FROM projects WHERE id=$1`, [delPid])).rows[0]);
const pd = (await versions(delPid)).rows;
ok('a exclusão guardou o documento INTEIRO (pre_delete) e quem excluiu', pd.length === 1 && pd[0].kind === 'pre_delete' && pd[0].snapshot.company.name === 'Empresa Excluída Teste' && pd[0].snapshot.meetings !== undefined && pd[0].actor_name === 'Marta Master');
ok('PRICETAX não lista empresas excluídas (403)', (await call(C.staff, 'GET', '/api/project-history/deleted/list')).status === 403);
const dl = await call(C.master, 'GET', '/api/project-history/deleted/list');
ok('Master lista empresas excluídas', dl.status === 200 && dl.json.deleted.some((d) => d.projectId === delPid && d.companyName === 'Empresa Excluída Teste'));
ok('outra organização não vê as excluídas', !(await call(C.master2, 'GET', '/api/project-history/deleted/list')).json.deleted.some((d) => d.projectId === delPid));
ok('recriar sem confirmação é recusado', (await call(C.master, 'POST', `/api/project-history/deleted/${pd[0].id}/restore`, {})).status === 400);
ok('outra organização não recria', (await call(C.master2, 'POST', `/api/project-history/deleted/${pd[0].id}/restore`, { confirm: true })).status === 404);
const rr = await call(C.master, 'POST', `/api/project-history/deleted/${pd[0].id}/restore`, { confirm: true });
const re = (await q(`SELECT data, org_id FROM projects WHERE id=$1`, [delPid])).rows[0];
ok('Master recria a empresa com o mesmo id, dados e organização', rr.status === 201 && re && re.org_id === ORG_A && re.data.company.name === 'Empresa Excluída Teste' && re.data.activities.length === 2, rr.json);
ok('recriar duas vezes é recusado (409)', (await call(C.master, 'POST', `/api/project-history/deleted/${pd[0].id}/restore`, { confirm: true })).status === 409);
ok('empresa recriada deixa de aparecer como excluída', !(await call(C.master, 'GET', '/api/project-history/deleted/list')).json.deleted.some((d) => d.projectId === delPid));

// 11. O gatilho nunca derruba a gravação de negócio
await q(`ALTER TABLE project_versions RENAME TO project_versions_x`);
const pf = JSON.parse(JSON.stringify(await getProject(C.master))); pf.activities[1].date = '2027-09-09';
const failRes = await patch(C.master, pf);
await q(`ALTER TABLE project_versions_x RENAME TO project_versions`);
ok('se a captura falhar, a gravação do usuário segue (200) — gatilho isolado', failRes.status === 200 && (await getProject(C.master)).activities[1].date === '2027-09-09', failRes.status);
const pw = JSON.parse(JSON.stringify(await getProject(C.master))); pw.activities = 'quebrado';
ok('documento malformado (activities não é lista) não quebra a captura', (await patch(C.master, pw)).status === 200);
pw.activities = []; await patch(C.master, pw); // deixa vazio de propósito

// 12. Volume e desempenho
const big = JSON.parse(JSON.stringify(baseProject()));
big.activities = Array.from({ length: 150 }, (_, i) => act(`b${i}`, { desc: 'x'.repeat(400), subactivities: Array.from({ length: 8 }, (_, j) => sub(`b${i}s${j}`, { title: `Subatividade ${i}-${j} com texto razoável` })) }));
const bigBytes = JSON.stringify(big).length;
await q(`UPDATE projects SET data=$1 WHERE id=$2`, [JSON.stringify(big), PID]);
const nBig0 = Number((await q(`SELECT coalesce(max(id),0) m FROM project_versions`)).rows[0].m); const t0 = Date.now(); const N = 15;
for (let i = 0; i < N; i += 1) { const x = JSON.parse(JSON.stringify(big)); x.activities[i].date = `2027-0${(i % 9) + 1}-15`; const rr2 = await patch(C.master, x); if (rr2.status !== 200) { ok('PATCH grande', false, rr2.status); break; } big.activities = x.activities; }
const avg = Math.round((Date.now() - t0) / N);
const bigVers = (await q(`SELECT count(*)::int n, pg_size_pretty(sum(pg_column_size(snapshot))::bigint) sz FROM project_versions WHERE project_id=$1 AND id > $2`, [PID, nBig0])).rows[0];
console.log(`     (documento de ${Math.round(bigBytes / 1024)} KB, ${N} gravações seguidas: ${avg} ms/gravação ponta a ponta; ${bigVers.n} versão(ões) novas, ${bigVers.sz} em disco)`);
ok('15 gravações seguidas do mesmo autor num documento grande = poucas versões (coalescência)', bigVers.n <= 3, bigVers);
ok('gravação com gatilho continua rápida (< 800 ms ponta a ponta)', avg < 800, avg);

// 13. Retenção
const { pruneProjectVersions } = await import('../server/projectVersions.js');
await q(`DELETE FROM project_versions WHERE project_id=$1`, [PID]);
const ins = (kind, days, label) => q(`INSERT INTO project_versions (project_id, org_id, kind, label, actor_name, snapshot, created_at) VALUES ($1,$2,$3,$4,'t','{"activities":[],"phases":[],"team":[]}', now() - ($5 || ' days')::interval)`, [PID, ORG_A, kind, label, String(days)]);
await ins('auto', 2, 'recente'); await ins('auto', 100, 'semana-A-1'); await ins('auto', 100, 'semana-A-2'); await ins('auto', 101, 'semana-A-3');
await ins('manual', 120, 'manual-120'); await ins('auto', 800, 'velha'); await ins('manual', 800, 'manual-velha');
const pr = await pruneProjectVersions({ fullDays: 90, keepDays: 730, deletedDays: 365 });
const left = (await versions()).rows.map((r) => r.label);
ok('retenção: recentes e manuais dentro do prazo ficam; acima de 2 anos saem', left.includes('recente') && left.includes('manual-120') && !left.includes('velha') && !left.includes('manual-velha'), left);
ok('retenção: automáticas com mais de 90 dias ficam uma por semana', pr.thinned >= 1 && left.filter((l) => l.startsWith('semana-A')).length < 3, { pr, left });

await cleanup();
await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes de versionamento ok');
process.exit(failed ? 1 : 0);
