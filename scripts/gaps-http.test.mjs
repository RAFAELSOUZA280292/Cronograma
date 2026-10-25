// Teste HTTP real de "criar atividades das lacunas": dois cliques simultâneos no mesmo pedido não podem duplicar atividades
// (o servidor recalcula as lacunas COM a trava da empresa). Roda contra o servidor e o Postgres LOCAIS, em organização descartável.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/gaps-http.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: este teste só roda contra banco local.'); process.exit(2); }
const PASS = crypto.randomBytes(12).toString('base64url');
const ORG = 'oitmp-gaps';
const U = 'oitmp_gaps_master';
let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
async function cleanup() {
  await pool.query(`DELETE FROM projects WHERE org_id=$1`, [ORG]);
  await pool.query(`DELETE FROM users WHERE id=$1`, [U]);
  await pool.query(`DELETE FROM organizations WHERE id=$1`, [ORG]);
}
await cleanup();
await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,'oitmp-gaps','OITMP GAPS')`, [ORG]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Master Gaps','master',$3,true,true)`, [U, await bcrypt.hash(PASS, 10), ORG]);
const act = (i, title) => ({ id: `a${i}`, title, status: 'nao-iniciado', phase: 'ph1', month: 1, subactivities: [], comments: [] });
const mkProject = (id, titles) => pool.query(`INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)`, [id, JSON.stringify({ company: { name: `Empresa ${id}`, status: 'ativo' }, phases: [{ id: 'ph1', name: 'Fase 1' }], activities: titles.map((t, i) => act(i, t)), log: [] }), ORG]);
const TITLE = 'Revisar cadastro fiscal dos fornecedores';
await mkProject('oitmp-g1', [TITLE, 'Mapear notas fiscais de entrada']);
await mkProject('oitmp-g2', [TITLE, 'Mapear notas fiscais de entrada']);
await mkProject('oitmp-g3', [TITLE, 'Mapear notas fiscais de entrada']);
await mkProject('oitmp-g4', ['Mapear notas fiscais de entrada']);
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: U, password: PASS }) });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
ok('login do usuário temporário', !!cookie);
const call = async (method, path, body) => { const x = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await x.json(); } catch { /* sem corpo */ } return { status: x.status, json }; };

const gaps = await call('GET', '/api/gaps/company/oitmp-g4?min=3');
ok('a empresa sem a atividade-padrão tem 1 lacuna', gaps.status === 200 && gaps.json.gaps.length === 1, gaps.json);
const keys = gaps.json.gaps.map((g) => g.key);
const [a, b] = await Promise.all([call('POST', '/api/gaps/create', { projectId: 'oitmp-g4', keys, min: 3 }), call('POST', '/api/gaps/create', { projectId: 'oitmp-g4', keys, min: 3 })]);
const statuses = [a.status, b.status].sort();
ok('dois cliques simultâneos: um cria (201) e o outro é recusado (409)', statuses[0] === 201 && statuses[1] === 409, statuses);
const { rows } = await pool.query(`SELECT data FROM projects WHERE id='oitmp-g4'`);
const created = rows[0].data.activities.filter((x) => x.title === TITLE);
ok('a atividade existe UMA vez só (sem duplicar)', created.length === 1, created.length);
const again = await call('POST', '/api/gaps/create', { projectId: 'oitmp-g4', keys, min: 3 });
ok('repetir depois também é recusado (409)', again.status === 409, again.status);
// Link público: criar e revogar ficam no Log da empresa (sem o token)
const sh = await call('POST', '/api/company-share/oitmp-g1', { days: 30 });
ok('criar link público → 201', sh.status === 201 && sh.json.link, sh.status);
const tok = JSON.stringify(sh.json.link);
let lg = (await pool.query(`SELECT data->'log' AS log FROM projects WHERE id='oitmp-g1'`)).rows[0].log || [];
ok('criação do link aparece no Log da empresa, com quem fez e sem o token', lg.some((e) => /Gerou um novo link público/.test(e.action) && e.user === 'Master Gaps') && !JSON.stringify(lg).match(/[A-Za-z0-9_-]{30,}/), lg[0]);
const rv = await call('DELETE', '/api/company-share/oitmp-g1');
lg = (await pool.query(`SELECT data->'log' AS log FROM projects WHERE id='oitmp-g1'`)).rows[0].log || [];
ok('revogar link aparece no Log', rv.status === 200 && rv.json.revoked === 1 && lg.some((e) => /Revogou o link público/.test(e.action)), rv.json);
const rv2 = await call('DELETE', '/api/company-share/oitmp-g1');
ok('revogar de novo (nada ativo) não escreve no Log', rv2.json.revoked === 0 && (await pool.query(`SELECT data->'log' AS log FROM projects WHERE id='oitmp-g1'`)).rows[0].log.length === lg.length);
await pool.query('DELETE FROM company_share_links WHERE project_id LIKE $1', ['oitmp-g%']);
await cleanup();
await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes das lacunas ok');
process.exit(failed ? 1 : 0);
