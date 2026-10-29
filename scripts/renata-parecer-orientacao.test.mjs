// Orientação dos pareceres no chat da RENATA (2026-10-29): `loadMeetingAdviceDigest` leva ao prompt a orientação já associada às reuniões do projeto.
// Prova: só equipe; tema sem parecer = nada; parecer de OUTRO cliente nunca aparece; parecer apagado/ não utilizável some; ordem por data; limite de tamanho.
// Banco LOCAL, sandbox-edu, dados temporários.   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/renata-parecer-orientacao.test.mjs
import crypto from 'node:crypto';
import pg from 'pg';
import { buildGeneralContext } from '../server/assistantGeneral.js';
import { computeFingerprint } from '../server/answerCache.js';
import { loadMeetingAdviceDigest, loadGeneralAdviceDigest, formatAdviceDigest } from '../server/parecerStudy.js';

const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu'; const RUN = crypto.randomBytes(3).toString('hex');
const PID = `ori-proj-${RUN}`; const PID2 = `ori-proj2-${RUN}`; const P_GERAL = `ori-pg-${RUN}`; const P_OUTRO = `ori-po-${RUN}`; const P_ESTE = `ori-pe-${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
async function cleanup() {
  await pool.query(`DELETE FROM meeting_parecer_advice WHERE project_id = ANY($1)`, [[PID, PID2]]);
  await pool.query(`DELETE FROM parecer_studies WHERE parecer_id = ANY($1)`, [[P_GERAL, P_OUTRO, P_ESTE]]);
  await pool.query(`DELETE FROM pareceres WHERE id = ANY($1)`, [[P_GERAL, P_OUTRO, P_ESTE]]);
  await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [[PID, PID2]]);
}
try {
  await cleanup();
  const nome = `Empresa Orientação ${RUN}`;
  const meetings = [
    { id: 'm-velha', title: 'Reunião antiga', date: '2026-09-01', deleted: false },
    { id: 'm-nova', title: 'Cartão corporativo', date: '2026-10-20', deleted: false },
    { id: 'm-sem', title: 'Sem tema estudado', date: '2026-10-25', deleted: false },
    { id: 'm-del', title: 'Excluída', date: '2026-10-26', deleted: true },
  ];
  const data = { company: { name: nome, nomeFantasia: '' }, meetings };
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID, JSON.stringify(data), ORG]);
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID2, JSON.stringify({ company: { name: `Outra ${RUN}`, nomeFantasia: '' }, meetings }), ORG]);
  const mkP = async (id, title, scope, companyName, projectId) => pool.query(
    `INSERT INTO pareceres (id, org_id, title, description, file_name, mime_type, file_size, file_data, scope, company_project_id, company_name, created_by, created_by_name) VALUES ($1,$2,$3,'','x.pdf','application/pdf',1,$4,$5,$6,$7,NULL,'Teste')`,
    [id, ORG, title, Buffer.from('x'), scope, projectId || null, companyName || '']);
  await mkP(P_GERAL, 'Cartão de Crédito | Guia Executivo', 'geral', '', null);
  await mkP(P_OUTRO, 'Parecer sigiloso de outro cliente', 'cliente', `Outra ${RUN}`, PID2);
  await mkP(P_ESTE, 'Parecer específico desta empresa', 'cliente', nome, PID);
  for (const [id, f] of [[P_GERAL, 'fact-g'], [P_OUTRO, 'fact-o'], [P_ESTE, 'fact-e']]) await pool.query(`INSERT INTO parecer_studies (parecer_id, org_id, status, study, fact_id) VALUES ($1,$2,'done','{}',$3)`, [id, ORG, f]);
  const item = (parecerId, title, extra = {}) => ({ parecerId, parecerTitle: title, number: '', topic: 'Cartão corporativo', relevance: 'A reunião trata de despesas no cartão PJ.', steps: ['Exigir nota no CNPJ', 'Separar despesas por tipo'], caution: 'Vale só com nota idônea.', ...extra });
  const put = (mid, items) => pool.query(`INSERT INTO meeting_parecer_advice (project_id, meeting_id, org_id, advice, signature) VALUES ($1,$2,$3,$4,'sig')`, [PID, mid, ORG, JSON.stringify({ items })]);
  await put('m-velha', [item(P_ESTE, 'Parecer específico desta empresa', { topic: 'Tema antigo', number: '5/2026' })]);
  await put('m-nova', [item(P_GERAL, 'Cartão de Crédito | Guia Executivo'), item(P_OUTRO, 'Parecer sigiloso de outro cliente')]);
  await put('m-sem', []);
  await put('m-del', [item(P_GERAL, 'Cartão de Crédito | Guia Executivo')]);

  const d = await loadMeetingAdviceDigest(pool, ORG, PID, { projectData: data, isStaff: true });
  ok('equipe recebe a orientação do parecer Geral e do parecer da própria empresa', /Guia Executivo/.test(d.text) && /Parecer específico desta empresa/.test(d.text), d.text);
  ok('traz reunião, data, tema, por que se aplica, caminhos e ressalva', /Cartão corporativo" \(20\/10\/2026\)/.test(d.text) && /tema: Cartão corporativo/.test(d.text) && /a\) Exigir nota no CNPJ; b\) Separar despesas/.test(d.text) && /ressalva: Vale só com nota idônea/.test(d.text));
  ok('parecer de OUTRO cliente nunca aparece (nem título, nem fato)', !/sigiloso/.test(d.text) && !d.factIds.includes('fact-o'), d);
  ok('reunião sem parecer aplicável (lista vazia) e reunião excluída não geram linha', !/Sem tema estudado/.test(d.text) && !/Excluída/.test(d.text));
  ok('mais recente primeiro', d.text.indexOf('20/10/2026') < d.text.indexOf('01/09/2026'));
  ok('número do parecer aparece quando existe', /Parecer Nº 5\/2026/.test(d.text));
  ok('devolve os fatos dos pareceres usados (para invalidar o cache da resposta)', d.factIds.includes('fact-g') && d.factIds.includes('fact-e') && d.factIds.length === 2, d.factIds);
  const cli = await loadMeetingAdviceDigest(pool, ORG, PID, { projectData: data, isStaff: false });
  ok('usuário cliente NUNCA recebe (texto vazio)', cli.text === '' && cli.factIds.length === 0);
  await pool.query(`DELETE FROM pareceres WHERE id=$1`, [P_GERAL]);
  const d2 = await loadMeetingAdviceDigest(pool, ORG, PID, { projectData: data, isStaff: true });
  ok('parecer apagado deixa de ser usado', !/Guia Executivo/.test(d2.text) && /Parecer específico/.test(d2.text));
  const d3 = await loadMeetingAdviceDigest(pool, ORG, PID2, { projectData: data, isStaff: true });
  ok('projeto sem orientação gravada: vazio, sem erro', d3.text === '' && d3.factIds.length === 0);
  // ---- RENATA geral: várias empresas, cada uma com a própria regra de escopo
  const data2 = { company: { name: `Outra ${RUN}`, nomeFantasia: '' }, meetings };
  await pool.query(`INSERT INTO meeting_parecer_advice (project_id, meeting_id, org_id, advice, signature) VALUES ($1,'m-nova',$2,$3,'sig')`, [PID2, ORG, JSON.stringify({ items: [item(P_OUTRO, 'Parecer sigiloso de outro cliente'), item(P_ESTE, 'Parecer específico desta empresa')] })]);
  const g = await loadGeneralAdviceDigest(pool, ORG, [{ id: PID, data }, { id: PID2, data: data2 }], { isStaff: true });
  const blocks = Object.fromEntries(g.text.split(/^Empresa /m).filter(Boolean).map((b) => [b.startsWith('Outra') ? 'B' : 'A', b]));
  const [blkA, blkB] = [blocks.A || '', blocks.B || ''];
  ok('geral: agrupa por empresa', g.text.includes(`Empresa ${nome}:`) && g.text.includes(`Empresa Outra ${RUN}:`), g.text);
  ok('geral: cada empresa só vê os pareceres utilizáveis nela (sigiloso só na dona; específico só na sua)', /Parecer específico/.test(blkA) && !/sigiloso/.test(blkA) && /sigiloso/.test(blkB) && !/Parecer específico/.test(blkB));
  ok('geral: devolve os fatos usados', g.factIds.includes('fact-e') && g.factIds.includes('fact-o'), g.factIds);
  ok('geral: cliente nunca recebe', (await loadGeneralAdviceDigest(pool, ORG, [{ id: PID, data }], { isStaff: false })).text === '');
  ok('geral: só entram as empresas informadas (acesso é decidido por quem chama)', !/Outra/.test((await loadGeneralAdviceDigest(pool, ORG, [{ id: PID, data }], { isStaff: true })).text));
  ok('geral: sem empresas ou sem orientação gravada: vazio', (await loadGeneralAdviceDigest(pool, ORG, [], { isStaff: true })).text === '');
  const master = { id: 'ori-user', name: 'Teste', role: 'master', isSuperAdmin: true, orgId: ORG, companiesAccess: true, allCompaniesAccess: true };
  const ctx = await buildGeneralContext({ pool, user: master, orgId: ORG, question: 'o que fazer na reunião do cartão?', isStaff: true, listEventsFn: async () => [] });
  ok('geral (contexto completo): traz o bloco de orientação para a equipe', /ORIENTAÇÃO DOS PARECERES JÁ ASSOCIADA ÀS REUNIÕES DAS EMPRESAS/.test(ctx.text) && /sigiloso/.test(ctx.text), ctx.text.slice(-600));
  const ctxCli = await buildGeneralContext({ pool, user: master, orgId: ORG, question: 'o que fazer?', isStaff: false, listEventsFn: async () => [] });
  ok('geral (contexto completo): sem o bloco quando não é equipe', !/ORIENTAÇÃO DOS PARECERES/.test(ctxCli.text));
  const fpS = computeFingerprint('2026-10-29T00:00:00Z', '2026-10-29', 'staff'); const fpC = computeFingerprint('2026-10-29T00:00:00Z', '2026-10-29', 'cliente');
  ok('cache de respostas: equipe e cliente têm impressão digital DIFERENTE (nunca compartilham resposta)', fpS !== fpC && /staff$/.test(fpS) && /cliente$/.test(fpC), [fpS, fpC]);
  ok('cache de respostas: sem informar o público, vale o mais restrito (cliente)', computeFingerprint('2026-10-29T00:00:00Z', '2026-10-29') === fpC);
  const big = formatAdviceDigest(Array.from({ length: 50 }, (_, i) => ({ meetingTitle: `R${i}`, meetingDate: '2026-10-01', parecerTitle: 'P', topic: 't'.repeat(100), relevance: 'r'.repeat(300), steps: ['s'.repeat(300)], caution: '' })), 1000);
  ok('o bloco respeita o tamanho máximo', big.length <= 1200 && big.split('\n').length >= 1);
} catch (e) { failed += 1; console.error('ERRO NO TESTE', e); }
await cleanup(); await pool.end();
console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
