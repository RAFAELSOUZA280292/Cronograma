// Teste HTTP da rotina de quem prospecta (perfil Vendedor), contra o SANDBOX local (scripts/sandbox-eduarda.mjs: dados reais do PipeRun
// numa organização local). Recusa banco não local. Cria registros de teste e apaga no fim.
//   node scripts/sandbox-eduarda.mjs '<senha-local>' && BASE=http://localhost:3001 SBX_PASS='<senha-local>' DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/crm-eduarda.test.mjs
import pg from 'pg';
const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const PASS = process.env.SBX_PASS; if (!PASS) { console.error('Informe SBX_PASS (senha do sandbox).'); process.exit(2); }
const ORG = 'sandbox-edu';
let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_eduarda', password: PASS }) });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
ok('login da Eduarda (sandbox)', lr.status === 200 && !!cookie, lr.status);
const call = async (method, path, body) => { const x = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await x.json(); } catch { /* sem corpo */ } return { status: x.status, json }; };

const me = await call('GET', '/api/crm/me');
ok('perfil Vendedor: lê e escreve; não exclui, não importa, não configura funil', me.json.capabilities.write && me.json.capabilities.read && !me.json.capabilities.remove && !me.json.capabilities.import && !me.json.capabilities.funnel, me.json.capabilities);
const mine = await call('GET', '/api/crm/deals?status=all&limit=200&ownerId=sbx_eduarda');
ok('os 25 negócios dela (19 abertos, 5 perdidos, 1 ganho) estão com ela', mine.json.total === 25 && mine.json.items.filter((d) => d.status === 'open').length === 19, { total: mine.json.total });
const withPhone = mine.json.items.find((d) => d.contactPhone);
ok('o cartão traz o telefone do contato (para ligar/WhatsApp)', !!withPhone && withPhone.contactPhone.replace(/\D/g, '').length >= 10, withPhone && withPhone.contactPhone);
ok('"Nome não informado" não aparece como nome de contato', mine.json.items.every((d) => !/nome n[aã]o informado/i.test(d.contactName)) && mine.json.items.some((d) => !d.contactName && d.contactPhone));
const det = await call('GET', `/api/crm/deals/${withPhone.id}`);
ok('a ficha traz telefone/WhatsApp/e-mail do contato', det.status === 200 && det.json.deal.contactPhone === withPhone.contactPhone);
const acts = await call('GET', '/api/crm/activities?ownerId=sbx_eduarda&status=open&limit=200');
ok('as 67 atividades abertas dela têm responsável e telefone do contato do negócio', acts.json.total === 67 && acts.json.items.filter((a) => a.contactPhone || a.contactWhatsapp).length >= 40, { total: acts.json.total, comFone: acts.json.items.filter((a) => a.contactPhone || a.contactWhatsapp).length });
ok('vendedor não exclui negócio (403)', (await call('DELETE', `/api/crm/deals/${withPhone.id}`)).status === 403);
ok('vendedor não importa nem opera a migração (403)', (await call('POST', '/api/crm/migration/piperun/import', {})).status === 403);

// Anexo (imagem) de nota: a lista vem leve e o conteúdo carrega sob demanda
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const { rows: [nrow] } = await pool.query(`SELECT n.id, n.entity_id FROM crm_notes n WHERE n.org_id=$1 AND n.entity_type='deal' AND n.deleted_at IS NULL LIMIT 1`, [ORG]);
await pool.query(`UPDATE crm_notes SET attachments=$2::jsonb WHERE id=$1`, [nrow.id, JSON.stringify([{ id: 'att-t1', name: 'print.png', size: 70, type: 'image/png', dataUrl: `data:image/png;base64,${PNG}` }, { id: 'att-t2', name: 'x.svg', size: 10, type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }])]);
const nd = await call('GET', `/api/crm/deals/${nrow.entity_id}`);
const note = nd.json.notes.find((x) => x.id === nrow.id);
ok('lista de notas traz o anexo SEM o conteúdo (leve) e com a url', note.attachments.length === 2 && note.attachments.every((a) => !a.dataUrl && a.url.includes(`/notes/${nrow.id}/attachments/`)) && JSON.stringify(nd.json).length < 400000, { bytes: JSON.stringify(nd.json).length });
const img = await fetch(`${BASE}${note.attachments[0].url}`, { headers: { Cookie: cookie } });
const buf = Buffer.from(await img.arrayBuffer());
ok('a url entrega a imagem de verdade, com cabeçalhos seguros', img.status === 200 && img.headers.get('content-type') === 'image/png' && buf.equals(Buffer.from(PNG, 'base64')) && img.headers.get('x-content-type-options') === 'nosniff', img.status);
const svg = await fetch(`${BASE}${note.attachments[1].url}`, { headers: { Cookie: cookie } });
ok('tipo perigoso (SVG) nunca é servido como imagem executável', svg.headers.get('content-type') === 'application/octet-stream' && /sandbox/.test(svg.headers.get('content-security-policy') || ''));
ok('sem login não lê o anexo (401) e anexo inexistente → 404', (await fetch(`${BASE}${note.attachments[0].url}`)).status === 401 && (await fetch(`${BASE}/api/crm/notes/${nrow.id}/attachments/nao-existe`, { headers: { Cookie: cookie } })).status === 404);
await pool.query(`UPDATE crm_notes SET attachments='[]'::jsonb WHERE id=$1`, [nrow.id]);

// Lead rápido
const NAME = `Lead Teste Rápido ${Date.now()}`;
const pipes = (await call('GET', '/api/crm/pipelines')).json.pipelines;
const trib = pipes.find((p) => p.name === 'Tributaristas e Contadores');
const l1 = await call('POST', '/api/crm/leads', { companyName: NAME, contactName: 'Maria Souza', phone: '(41) 99888-7766', email: 'maria@teste.example', pipelineId: trib.id });
ok('lead rápido cria empresa + contato + negócio de uma vez (201)', l1.status === 201 && l1.json.deal && l1.json.company && l1.json.contact, l1.json && l1.json.message);
ok('o negócio nasce na 1ª etapa do funil escolhido, com ela de responsável e o contato principal', l1.json.deal.pipelineId === trib.id && l1.json.deal.stageName === 'Leads' && l1.json.deal.ownerId === 'sbx_eduarda' && l1.json.deal.primaryContactId === l1.json.contact.id, l1.json.deal);
ok('telefone/WhatsApp/e-mail guardados no contato', l1.json.contact.phone === '(41) 99888-7766' && l1.json.contact.whatsapp === '(41) 99888-7766' && l1.json.contact.email === 'maria@teste.example');
const l2 = await call('POST', '/api/crm/leads', { companyName: NAME, contactName: 'Outro', phone: '41999990000' });
ok('empresa de mesmo nome → 409 com a parecida (não duplica sem avisar)', l2.status === 409 && l2.json.duplicates && l2.json.duplicates.byName.length >= 1, l2.status);
const l3 = await call('POST', '/api/crm/leads', { companyName: NAME, contactName: 'Outro', phone: '41999990000', force: true });
ok('"criar mesmo assim" (force) cria', l3.status === 201, l3.status);
ok('lead sem nome da empresa → 400', (await call('POST', '/api/crm/leads', { companyName: ' ' })).status === 400);
const noAuth = await fetch(`${BASE}/api/crm/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"companyName":"x"}' });
ok('lead sem login → 401', noAuth.status === 401);
// limpeza dos registros de teste (o histórico do CRM é somente-inserção: desliga os gatilhos só aqui, no banco local)
const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND legal_name=$2`, [ORG, NAME]);
const ids = cs.map((r) => r.id);
await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND company_id = ANY($2::uuid[])`, [ORG, ids]);
await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND (entity_id = ANY($2::uuid[]) OR entity_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($2::uuid[])) OR entity_id IN (SELECT id FROM crm_contacts WHERE company_id = ANY($2::uuid[])))`, [ORG, ids]);
await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [ids]);
await pool.query(`DELETE FROM crm_deals WHERE company_id = ANY($1::uuid[])`, [ids]);
await pool.query(`DELETE FROM crm_contacts WHERE company_id = ANY($1::uuid[])`, [ids]);
await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes da rotina da Eduarda ok');
process.exit(failed ? 1 : 0);
