// Teste HTTP descartável da revisão de proposta (§131) contra o servidor LOCAL: anexa o PDF de exemplo (4 erros) a um negócio, espera a revisão
// automática virar nota, aciona "Revisar com a RENATA", confere o cache por versão e que Operações não alcança nada (rota nem ferramenta).
//   BASE=http://127.0.0.1:3077 node scripts/proposal-review-http.test.mjs   (cria e apaga os próprios usuários, empresa e negócio)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB) || !/localhost|127\.0\.0\.1/.test(BASE)) { console.error('Recusado: só banco e servidor locais.'); process.exit(2); }
const pool = new pg.Pool({ connectionString: DB });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`ok   ${m}`); };
const ORG = 'sandbox-edu'; const T = Date.now(); const PASS = `prp-${T}`;
const hash = await bcrypt.hash(PASS, 4);
const U = { socio: `prpu_socio_${T}`, oper: `prpu_oper_${T}` };
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,work_role) VALUES ($1,$1,$2,'Teste Sócio','pricetax',$3,true,true,'socio'),($4,$4,$2,'Teste Operações','pricetax',$3,true,true,'operacoes')`, [U.socio, hash, ORG, U.oper]);
const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); assert.equal(r.status, 200, `login ${u}`); return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).map((c) => c.split(';')[0]).join('; '); };
const C = { socio: await login(U.socio), oper: await login(U.oper) };
const api = async (who, path, opts = {}) => { const r = await fetch(`${BASE}/api/crm${path}`, { ...opts, headers: { 'Content-Type': 'application/json', cookie: C[who] }, body: opts.body ? JSON.stringify(opts.body) : undefined }); let j = null; try { j = await r.json(); } catch { /* sem corpo */ } return { status: r.status, j }; };
const pdf = readFileSync(new URL('./fixtures/proposta-exemplo-4-erros.pdf', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let companyId = null; let dealId = null;
try {
  let r = await api('socio', '/companies', { method: 'POST', body: { legalName: `OKUBO MERCANTIL TESTE ${T} LTDA`, tradeName: 'OKUBO', relationship: 'prospect', force: true } });
  ok(r.status === 201, `cria empresa (${r.status} ${JSON.stringify(r.j).slice(0, 120)})`); companyId = r.j.company.id;
  r = await api('socio', '/deals', { method: 'POST', body: { title: `Proposta OKUBO teste ${T}`, companyId, skipCadence: true } });
  ok(r.status === 201, 'cria negócio'); dealId = r.j.deal.id;
  r = await api('socio', '/notes', { method: 'POST', body: { entityType: 'deal', entityId: dealId, body: 'Segue a proposta enviada ao cliente.', attachments: [{ id: 'att1', name: 'Proposta OKUBO.pdf', type: 'application/pdf', size: pdf.length, dataUrl: `data:application/pdf;base64,${pdf.toString('base64')}` }] } });
  ok(r.status === 201, 'anexa o PDF numa nota do negócio'); const noteId = r.j.note.id;

  let review = null;
  for (let i = 0; i < 90 && !review; i += 1) { await sleep(1000); const d = await api('socio', `/deals/${dealId}`); review = (d.j.notes || []).find((x) => /Revisão da proposta/.test(x.bodyHtml || x.body)); }
  ok(!!review, 'revisão automática virou nota no negócio');
  const h = review.bodyHtml;
  ok(review.createdByName === 'RENATA (revisão automática)' || /RENATA/.test(review.createdByName), `nota assinada pela RENATA (${review.createdByName})`);
  ok(/quarenta e nove mil, quinhentos e quinze reais e cinquenta centavos/.test(h), 'erro 1: extenso do Diagnóstico FULL');
  ok(/sete mil, quinhentos e cinquenta reais/.test(h), 'erro 2: extenso da Consultoria FULL');
  ok(/LC 214\/2026/.test(h) && /LC 214\/2025/.test(h), 'erro 3: LC 214/2026 → LC 214/2025');
  const aiOn = !/IA não configurada|não pôde ser concluída/.test(h);
  if (aiOn) ok(/Dever de cada para cada/.test(h), 'erro 4: frase truncada do workshop (IA)');
  else console.log('---- IA indisponível: erro 4 (frase truncada) não conferido; a nota diz isso');
  ok(/⚠️/.test(h) && /Erros identificados/.test(h) && /Deveria constar/.test(h) && /<h3>/.test(h), 'formato: ⚠️, seções, h3');
  const notif = await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND type='crm_mention'`, [U.socio]);
  ok(notif.rows[0].n >= 1, 'quem anexou recebeu aviso da revisão');

  // não repete a revisão automática da mesma versão do arquivo
  await api('socio', '/notes', { method: 'POST', body: { entityType: 'deal', entityId: dealId, body: 'Reenvio do mesmo arquivo.', attachments: [{ id: 'att2', name: 'Proposta OKUBO.pdf', type: 'application/pdf', size: pdf.length, dataUrl: `data:application/pdf;base64,${pdf.toString('base64')}` }] } });
  await sleep(4000);
  let d = await api('socio', `/deals/${dealId}`);
  ok(d.j.notes.filter((x) => /Revisão da proposta/.test(x.bodyHtml || '')).length === 1, 'mesmo arquivo não gera segunda revisão automática');
  const cache = await pool.query(`SELECT method, chars FROM crm_attachment_texts WHERE org_id=$1 AND text LIKE '%Dever de cada%'`, [ORG]);
  ok(cache.rows.length === 1 && cache.rows[0].method === 'texto', 'texto em cache, uma linha por versão do arquivo');

  // a pedido (botão)
  r = await api('socio', `/deals/${dealId}/attachments/review`, { method: 'POST', body: { anexoId: `nota:${noteId}:att1` } });
  ok(r.status === 201 && r.j.noteId && r.j.erros >= 3, `botão "Revisar com a RENATA" grava nota (${r.j && r.j.erros} erros)`);
  r = await api('socio', `/deals/${dealId}/attachments/review`, { method: 'POST', body: { anexoId: 'nota:00000000-0000-0000-0000-000000000000:x' } });
  ok(r.status === 404, 'anexo de outro lugar: 404');

  // Operações: sem CRM
  r = await api('oper', `/deals/${dealId}/attachments/review`, { method: 'POST', body: { anexoId: `nota:${noteId}:att1` } });
  ok(r.status === 403, 'Operações: rota de revisão 403');
  const { registry } = await import('../server/renata/index.js');
  const names = (u) => registry.forUser(u).map((t) => t.name);
  const oper = { id: U.oper, role: 'pricetax', workRole: 'operacoes', crmRole: '' };
  const socio = { id: U.socio, role: 'pricetax', workRole: 'socio', crmRole: '' };
  ok(!names(oper).some((x) => /anexo|proposta|revisao/.test(x)), 'Operações: ferramentas de anexo invisíveis para a RENATA');
  ok(['crm_listar_anexos', 'crm_ler_anexo', 'crm_revisar_proposta', 'crm_registrar_revisao'].every((x) => names(socio).includes(x)), 'Sócio: as 4 ferramentas aparecem');

  // ferramentas direto pelo executor (sem IA)
  const { executor } = await import('../server/renata/index.js');
  const ctx = { user: { ...socio, orgId: ORG, name: 'Teste Sócio' }, orgId: ORG, command: 'revise a proposta da OKUBO', conversationId: null, toolUseId: 't1', turnWrites: new Map() };
  let out = await executor.executeTool(ctx, 'crm_listar_anexos', { dealId });
  ok(out.ok && out.data.anexos.length === 2 && !JSON.stringify(out.data).includes('base64'), 'crm_listar_anexos: lista sem conteúdo');
  out = await executor.executeTool(ctx, 'crm_ler_anexo', { dealId, anexoId: `nota:${noteId}:att1` });
  ok(out.ok && /Dever de cada para cada área/.test(out.data.texto) && /DADO/.test(out.data.aviso), 'crm_ler_anexo: texto + aviso de dado');
  out = await executor.executeTool(ctx, 'crm_revisar_proposta', { dealId });
  ok(out.ok && out.data.erros.length === 3, 'crm_revisar_proposta: 3 erros certos determinísticos');
  out = await executor.executeTool(ctx, 'crm_registrar_revisao', { dealId, anexoId: `nota:${noteId}:att1` });
  ok(out.status === 'needs_confirmation', 'gravar a revisão depois de ler documento pede confirmação');
  const audit = await pool.query(`SELECT after FROM renata_actions WHERE requester_id=$1 AND tool='crm_ler_anexo' ORDER BY requested_at DESC LIMIT 1`, [U.socio]).catch(() => ({ rows: [] }));
  if (audit.rows[0]) ok(!JSON.stringify(audit.rows[0].after).includes('Dever de cada'), 'registro de ações não guarda o texto do documento');
  out = await executor.executeTool({ ...ctx, user: { ...oper, orgId: ORG, name: 'Teste Operações' } }, 'crm_ler_anexo', { dealId, anexoId: `nota:${noteId}:att1` });
  ok(!out.ok && out.status === 'denied', 'Operações: executor nega crm_ler_anexo');
} finally {
  // histórico e auditoria do CRM são só-inserção: o negócio, as notas e a empresa de teste saem por exclusão lógica, como na tela
  if (companyId) {
    await pool.query('DELETE FROM crm_proposal_reviews WHERE deal_id=$1', [dealId]).catch(() => {});
    await pool.query('UPDATE crm_notes SET deleted_at=now() WHERE company_id=$1', [companyId]);
    await pool.query('UPDATE crm_deals SET deleted_at=now() WHERE company_id=$1', [companyId]);
    await pool.query('UPDATE crm_companies SET deleted_at=now() WHERE id=$1', [companyId]);
  }
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::text[])`, [[U.socio, U.oper]]).catch(() => {});
  await pool.query(`DELETE FROM crm_attachment_texts WHERE org_id=$1 AND text LIKE '%Dever de cada para cada%'`, [ORG]);
  await pool.query(`DELETE FROM renata_actions WHERE requester_id = ANY($1::text[])`, [[U.socio, U.oper]]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[U.socio, U.oper]]).catch(() => pool.query(`UPDATE users SET password_hash='!' WHERE id = ANY($1::text[])`, [[U.socio, U.oper]])); // com registro no CRM, o usuário de teste fica sem senha
  await pool.end();
}
console.log(`proposal-review-http: ${n} checagens OK`);
process.exit(0);
