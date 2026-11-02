// Teste HTTP descartável do Cofre do projeto (§124) contra o servidor LOCAL: permissões, cifra no banco, senha fora da listagem, Log e download.
//   BASE=http://localhost:3001 node scripts/project-vault-http.test.mjs   (cria e apaga os próprios usuários e a empresa de teste)
import assert from 'node:assert/strict';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB) || !/localhost|127\.0\.0\.1/.test(BASE)) { console.error('Recusado: só banco e servidor locais.'); process.exit(2); }
const pool = new pg.Pool({ connectionString: DB });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const ORG = 'sandbox-edu'; const PASS = `vlt-${Date.now()}`; const PID = `proj-vlt-${Date.now()}`; const SENHA = 'Senh@-do-X-da-Questao-987';
const users = { staff: ['pricetax', true, true], cliente: ['cliente', true, true], fora: ['pricetax', true, false] };
const hash = await bcrypt.hash(PASS, 4);
for (const [k, [role, ca, all]] of Object.entries(users)) {
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,$3,$4,$5,$6,$7)`, [`vltu_${k}_${PID}`, hash, `Teste ${k}`, role, ORG, ca, all]);
}
await pool.query(`INSERT INTO projects (id, org_id, data) VALUES ($1,$2,$3)`, [PID, ORG, JSON.stringify({ id: PID, company: { name: 'Empresa Cofre Teste', cnpj: '99.999.999/0001-99' }, activities: [], phases: [], meetings: [], log: [] })]);
const login = async (k) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `vltu_${k}_${PID}`, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
const C = { staff: await login('staff'), cliente: await login('cliente'), fora: await login('fora') };
const api = (who, path, opts = {}) => fetch(`${BASE}/api/project-vault/${PID}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', cookie: C[who] }, body: opts.body ? JSON.stringify(opts.body) : undefined });
try {
  ok((await fetch(`${BASE}/api/project-vault/${PID}`)).status === 401, 'sem login: 401');
  ok((await api('cliente', '')).status === 403, 'cliente: 403');
  ok((await api('fora', '')).status === 404, 'equipe sem acesso à empresa: 404');
  let r = await api('staff', '', { method: 'POST', body: { kind: 'credential', title: 'X da Questão', url: 'https://xdaquestao.pricetax.com.br', username: 'kuhn.fiscal', secret: SENHA, folder: 'Acessos' } });
  let j = await r.json(); const cid = j.item.id;
  ok(r.status === 201 && j.item.hasSecret && !JSON.stringify(j).includes(SENHA), 'cria acesso sem devolver a senha');
  const pfx = Buffer.from('PFX-binario-de-teste');
  r = await api('staff', '', { method: 'POST', body: { kind: 'certificate', title: 'e-CNPJ', fileName: 'kuhn.pfx', fileDataBase64: pfx.toString('base64'), secret: SENHA, certValidUntil: '2026-11-20' } });
  j = await r.json(); const certId = j.item.id;
  ok(r.status === 201 && j.item.cert && j.item.cert.state === 'vence_em_breve', 'certificado com aviso de vencimento');
  const row = (await pool.query('SELECT secret_enc, file_enc FROM project_vault_items WHERE id=$1', [certId])).rows[0];
  ok(row.secret_enc.startsWith('enc1:') && !row.secret_enc.includes(SENHA) && !row.file_enc.includes(pfx), 'banco guarda senha e arquivo cifrados');
  r = await api('staff', ''); const list = await r.text();
  ok(r.status === 200 && !list.includes(SENHA) && !list.includes('enc1:') && JSON.parse(list).items.length === 2, 'listagem sem senha nem cifra');
  ok(/no-store/.test(r.headers.get('cache-control') || ''), 'listagem sem cache');
  ok((await api('cliente', `/${cid}/reveal`, { method: 'POST', body: {} })).status === 403, 'cliente não revela');
  r = await api('staff', `/${cid}/reveal`, { method: 'POST', body: { purpose: 'copy' } }); j = await r.json();
  ok(r.status === 200 && j.secret === SENHA, 'revela a senha certa');
  r = await api('staff', `/${certId}/file`); const buf = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200 && buf.equals(pfx) && /attachment/.test(r.headers.get('content-disposition')) && r.headers.get('x-content-type-options') === 'nosniff', 'baixa o certificado decifrado como anexo');
  r = await api('staff', `/${cid}`, { method: 'PATCH', body: { title: 'X da Questão (KUHN)' } }); j = await r.json();
  ok(r.status === 200 && j.item.hasSecret && j.item.title === 'X da Questão (KUHN)', 'edição sem senha mantém a senha');
  ok((await api('staff', `/${cid}`, { method: 'DELETE' })).status === 200, 'exclui');
  ok((await (await api('staff', '')).json()).items.length === 1, 'excluído some da lista');
  const log = (await pool.query('SELECT data->\'log\' AS log FROM projects WHERE id=$1', [PID])).rows[0].log;
  const txt = JSON.stringify(log);
  ok(log.some((l) => /copiou a senha/.test(l.action)) && log.some((l) => /baixou o arquivo/.test(l.action)) && log.some((l) => /excluiu/.test(l.action)) && !txt.includes(SENHA), `Log com os usos e sem a senha (${log.length} entradas)`);
  ok(log[0].user === 'Teste staff', 'Log diz quem');
} finally {
  await pool.query('DELETE FROM project_vault_items WHERE project_id=$1', [PID]);
  await pool.query('DELETE FROM projects WHERE id=$1', [PID]);
  await pool.query(`DELETE FROM users WHERE id LIKE $1`, [`vltu_%_${PID}`]);
  await pool.end();
}
console.log(`project-vault-http: ${n} checagens OK`);
