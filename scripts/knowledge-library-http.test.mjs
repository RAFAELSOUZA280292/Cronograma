// Teste HTTP descartável (2026-10-27) das rotas /api/knowledge-library contra o servidor LOCAL (sem chave de IA: o estudo deve falhar com aviso, o resto funciona).
//   BASE=http://localhost:3001 SBX_PASS='…' node scripts/knowledge-library-http.test.mjs
import assert from 'node:assert/strict';
import pg from 'pg';
const BASE = process.env.BASE || 'http://localhost:3001'; const PASS = process.env.SBX_PASS;
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB) || !PASS) { console.error('Recusado: só banco local e informe SBX_PASS.'); process.exit(2); }
const pool = new pg.Pool({ connectionString: DB });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_admin', password: PASS }) });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
const api = (path, opts = {}) => fetch(`${BASE}/api/knowledge-library${path}`, { ...opts, headers: { 'Content-Type': 'application/json', cookie, ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await pool.query(`DELETE FROM ai_knowledge_facts WHERE org_id='sandbox-edu' AND reference LIKE 'Material PRICETAX:%'`); await pool.query(`DELETE FROM knowledge_materials WHERE org_id='sandbox-edu'`);

ok((await fetch(`${BASE}/api/knowledge-library`)).status === 401, 'sem login: 401');
const text = 'O produtor rural pessoa física tinha, antes da reforma, isenção de PIS e COFINS na venda da produção própria. Depois da reforma, o regime regular de IBS e CBS passa a ser opcional abaixo de R$ 3.600.000,00 de receita bruta anual. '.repeat(8);
let r = await api('/', { method: 'POST', body: { kind: 'text', title: '  ', text } }); ok(r.status === 400, 'título obrigatório');
r = await api('/', { method: 'POST', body: { kind: 'text', title: 'Curto', text: 'pouco' } }); ok(r.status === 400, 'texto curto recusado');
r = await api('/', { method: 'POST', body: { kind: 'file', title: 'X', fileName: 'a.exe', dataBase64: Buffer.from('abc').toString('base64') } }); ok(r.status === 422, 'formato não aceito');
r = await api('/', { method: 'POST', body: { kind: 'file', title: 'X', fileName: 'a.md', dataBase64: Buffer.from(text).toString('base64'), tags: 'agro, reforma' } }); let j = await r.json(); ok(r.status === 202 && j.material.status === 'processing' && j.material.tags.length === 2, `arquivo aceito: ${r.status} ${JSON.stringify(j)}`);
const id = j.material.id;
r = await api('/', { method: 'POST', body: { kind: 'text', title: 'Duplicado', text } }); j = await r.json(); ok(r.status === 409 && j.id === id, 'mesmo conteúdo = 409 apontando o existente');
let m; for (let i = 0; i < 40; i += 1) { await sleep(500); m = (await (await api(`/${id}`)).json()).material; if (m.status !== 'processing') break; }
ok(m.status === 'ready' && m.chunkCount >= 1 && m.charCount === text.trim().length, `pronto: ${m.status} ${m.error}`);
ok(/não está configurada/.test(m.studyError) && !m.hasStudy, `sem IA: aviso no estudo (${m.studyError})`);
const list = await (await api('/')).json(); ok(list.materials.some((x) => x.id === id) && list.supported.includes('pdf') && list.maxFileMb === 10, 'lista');
const s = await (await api('/search', { method: 'POST', body: { query: 'produtor rural isenção de PIS e COFINS antes da reforma' } })).json(); ok(s.passages.length >= 1 && s.passages[0].materialId === id, 'busca de teste acha o material (só por palavra, sem Voyage)');
r = await api(`/${id}`, { method: 'PATCH', body: { title: 'Produtor Rural v2', topic: 'Agro', tags: ['a', 'b', 'c'] } }); j = await r.json(); ok(j.material.title === 'Produtor Rural v2' && j.material.topic === 'Agro' && j.material.tags.length === 3, 'editar');
r = await api(`/${id}/file`); ok(r.status === 200 && /attachment/.test(r.headers.get('content-disposition')) && (await r.text()).startsWith('O produtor rural'), 'baixar original');
r = await api(`/${id}/reprocess?only=study`, { method: 'POST' }); ok(r.status === 202, 'reprocessar'); await sleep(1500);
r = await api(`/${id}`, { method: 'DELETE' }); ok(r.status === 200, 'arquivar');
ok(!(await (await api('/search', { method: 'POST', body: { query: 'produtor rural isenção' } })).json()).passages.length, 'arquivado fora da busca');
ok((await (await api('/')).json()).materials.find((x) => x.id === id).archived === true, 'lista marca arquivado');
r = await api(`/${id}/restore`, { method: 'POST' }); ok(r.status === 200 && (await (await api('/search', { method: 'POST', body: { query: 'produtor rural isenção' } })).json()).passages.length >= 1, 'restaurar volta à busca');
ok((await api('/mat-naoexiste')).status === 404, '404');
await pool.query(`DELETE FROM ai_knowledge_facts WHERE org_id='sandbox-edu' AND reference LIKE 'Material PRICETAX:%'`); await pool.query(`DELETE FROM knowledge_materials WHERE org_id='sandbox-edu'`); await pool.end();
console.log(`knowledge-library-http: ${n} checagens OK`);
