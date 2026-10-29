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
// limpeza dos registros de teste (o histórico do CRM é somente-inserção: desliga os gatilhos só aqui, no banco local)
const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
async function limpar() {
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND legal_name LIKE $2`, [ORG, 'Lead Teste Rápido%']);
  const ids = cs.map((r) => r.id);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND company_id = ANY($2::uuid[])`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND (entity_id IN (SELECT id FROM crm_activities WHERE company_id = ANY($2::uuid[])) OR entity_id = ANY($2::uuid[]) OR entity_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($2::uuid[])) OR entity_id IN (SELECT id FROM crm_contacts WHERE company_id = ANY($2::uuid[])))`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [ids]);
  await pool.query(`DELETE FROM crm_activities WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_notes WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_deals WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_contacts WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_cadences WHERE org_id=$1`, [ORG]);
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
}
await limpar();
const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_eduarda', password: PASS }) });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
ok('login da Eduarda (sandbox)', lr.status === 200 && !!cookie, lr.status);
const call = async (method, path, body) => { const x = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await x.json(); } catch { /* sem corpo */ } return { status: x.status, json }; };

const lr2 = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_admin', password: PASS }) });
const cookieAdmin = (lr2.headers.get('set-cookie') || '').split(';')[0];
const callAs = async (ck, method, path, body) => { const x = await fetch(`${BASE}${path}`, { method, headers: { Cookie: ck, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await x.json(); } catch { /* sem corpo */ } return { status: x.status, json }; };
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

// Edição direta na lista: as etapas de cada funil vêm nas opções (select de etapa por linha) e os campos editáveis aceitam PATCH
const optsJson = (await call('GET', '/api/crm/options')).json;
ok('opções trazem as etapas de cada funil (para trocar a etapa direto na lista)', optsJson.pipelines.every((p) => Array.isArray(p.stages) && p.stages.length >= 3) && optsJson.pipelines.some((p) => p.stages.some((x) => x.kind === 'lost')));
const aberto = mine.json.items.find((d) => d.status === 'open');
const pv = await call('PATCH', `/api/crm/deals/${aberto.id}`, { expectedCloseDate: '2026-12-15' });
ok('previsão de fechamento editável direto (PATCH) e desfazível', pv.status === 200 && pv.json.deal.expectedCloseDate === '2026-12-15' && (await call('PATCH', `/api/crm/deals/${aberto.id}`, { expectedCloseDate: aberto.expectedCloseDate || null })).json.deal.expectedCloseDate === (aberto.expectedCloseDate || null));
const fechado = mine.json.items.find((d) => d.status === 'lost');
ok('vendedor NÃO edita negócio fechado (403): a lista bloqueia a célula e o servidor recusa', (await call('PATCH', `/api/crm/deals/${fechado.id}`, { value: 1 })).status === 403);
ok('vendedor NÃO move/reabre negócio fechado (403) — M5', (await call('POST', `/api/crm/deals/${fechado.id}/move`, { stageId: aberto.stageId })).status === 403);
const act1 = acts.json.items[0];
const rs = await call('PATCH', `/api/crm/activities/${act1.id}`, { dueDate: '2026-12-20' });
ok('reagendar atividade escolhendo a data (PATCH) funciona e volta ao valor original', rs.status === 200 && rs.json.activity.dueDate === '2026-12-20' && (await call('PATCH', `/api/crm/activities/${act1.id}`, { dueDate: act1.dueDate })).json.activity.dueDate === act1.dueDate);

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
// ---------- Cadência de follow-up ----------
await pool.query(`DELETE FROM crm_cadences WHERE org_id=$1`, [ORG]);
const stagesT = trib.stages.filter((x) => x.kind === 'open');
const conexao = stagesT.find((x) => x.name === 'Conexão'); const mapeamento = stagesT.find((x) => x.name === 'Mapeamento');
const STEPS = [{ title: '1º Follow Up', type: 'followup', days: 1 }, { title: '2º Follow Up', type: 'followup', days: 3 }, { title: '3º Follow Up', type: 'whatsapp', days: 7 }];
ok('vendedor não configura cadência (403)', (await call('POST', '/api/crm/cadences', { pipelineId: trib.id, stageId: conexao.id, steps: STEPS })).status === 403);
const cadBad = await callAs(cookieAdmin, 'POST', '/api/crm/cadences', { pipelineId: trib.id, stageId: conexao.id, steps: [] });
ok('cadência sem passos → 400; dias inválidos → 400', cadBad.status === 400 && (await callAs(cookieAdmin, 'POST', '/api/crm/cadences', { pipelineId: trib.id, stageId: conexao.id, steps: [{ title: 'x', days: -1 }] })).status === 400);
const lead = (await call('POST', '/api/crm/leads', { companyName: `${NAME} Cad`, contactName: 'Cadência Teste', phone: '41977776666', pipelineId: trib.id, force: true })).json;
const cadOk = await callAs(cookieAdmin, 'POST', '/api/crm/cadences', { pipelineId: trib.id, stageId: conexao.id, steps: STEPS });
ok('administrador cria a cadência da etapa (201)', cadOk.status === 201 && cadOk.json.cadence.steps.length === 3, cadOk.json);
ok('segunda cadência na mesma etapa → 409', (await callAs(cookieAdmin, 'POST', '/api/crm/cadences', { pipelineId: trib.id, stageId: conexao.id, steps: STEPS })).status === 409);
ok('lead nasce em "Leads": sem cadência ainda (nada agendado)', !lead.cadence.scheduled, lead.cadence);
const actsOf = async (dealId) => (await call('GET', `/api/crm/activities?dealId=${dealId}&status=all&limit=50`)).json.items;
const mv = await call('POST', `/api/crm/deals/${lead.deal.id}/move`, { stageId: conexao.id });
ok('mover para a etapa da cadência agenda o 1º passo, com ela de responsável, vencendo amanhã', mv.status === 200 && mv.json.cadence.scheduled && mv.json.cadence.scheduled.title === '1º Follow Up' && mv.json.cadence.scheduled.ownerId === 'sbx_eduarda', mv.json.cadence);
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
ok('o passo vence amanhã e aponta o contato do negócio', mv.json.cadence.scheduled.dueDate === tomorrow && !!mv.json.cadence.scheduled.contactId, { due: mv.json.cadence.scheduled.dueDate, tomorrow });
const mv2 = await call('POST', `/api/crm/deals/${lead.deal.id}/move`, { stageId: conexao.id });
ok('mover de novo para a mesma etapa não duplica o passo', (await actsOf(lead.deal.id)).filter((a) => a.status === 'open').length === 1, mv2.status);
const c1 = await call('POST', `/api/crm/activities/${mv.json.cadence.scheduled.id}/complete`, { outcome: 'Falei com o contato' });
ok('concluir o passo 1 agenda o passo 2 (+3 dias)', c1.status === 200 && c1.json.next && c1.json.next.title === '2º Follow Up' && c1.json.next.cadenceStep === 2, c1.json.next);
const c2 = await call('POST', `/api/crm/activities/${c1.json.next.id}/complete`, { outcome: 'Sem resposta' });
ok('concluir o passo 2 agenda o 3º (WhatsApp, +7 dias)', c2.json.next && c2.json.next.title === '3º Follow Up' && c2.json.next.activityType === 'whatsapp', c2.json.next);
const c3 = await call('POST', `/api/crm/activities/${c2.json.next.id}/complete`, {});
ok('depois do último passo não agenda mais nada', c3.status === 200 && c3.json.next === null, c3.json.next);
const manual = (await call('POST', '/api/crm/activities', { companyId: lead.company.id, dealId: lead.deal.id, title: 'Atividade manual', activityType: 'task', dueDate: tomorrow })).json.activity;
const c4 = await call('POST', `/api/crm/activities/${manual.id}/complete`, {});
ok('atividade manual (fora da cadência) não dispara passo seguinte', c4.json.next === null);
// sair da etapa cancela o que sobrou
const lead2 = (await call('POST', '/api/crm/leads', { companyName: `${NAME} Cad2`, contactName: 'Outro', phone: '41966665555', pipelineId: trib.id, force: true })).json;
const a2 = await call('POST', `/api/crm/deals/${lead2.deal.id}/move`, { stageId: conexao.id });
const out2 = await call('POST', `/api/crm/deals/${lead2.deal.id}/move`, { stageId: mapeamento.id });
const acts2 = await actsOf(lead2.deal.id);
ok('sair da etapa cancela o passo aberto da cadência', a2.json.cadence.scheduled && out2.json.cadence.cancelled === 1 && acts2.filter((a) => a.status === 'open').length === 0 && acts2.some((a) => a.status === 'cancelled'), { out: out2.json.cadence, acts: acts2.map((a) => a.status) });
// fechar cancela
await call('POST', `/api/crm/deals/${lead2.deal.id}/move`, { stageId: conexao.id });
const lost = await call('POST', `/api/crm/deals/${lead2.deal.id}/move`, { stageId: trib.stages.find((x) => x.kind === 'lost').id, lostReason: 'preco' });
ok('perder o negócio cancela os passos abertos', lost.status === 200 && (await actsOf(lead2.deal.id)).filter((a) => a.status === 'open').length === 0, lost.json && lost.json.message);
// desligar a cadência
await callAs(cookieAdmin, 'PATCH', `/api/crm/cadences/${cadOk.json.cadence.id}`, { active: false, steps: STEPS });
const lead3 = (await call('POST', '/api/crm/leads', { companyName: `${NAME} Cad3`, contactName: 'Três', phone: '41955554444', pipelineId: trib.id, force: true })).json;
const a3 = await call('POST', `/api/crm/deals/${lead3.deal.id}/move`, { stageId: conexao.id });
ok('cadência desligada não agenda nada', a3.json.cadence.scheduled === null, a3.json.cadence);
ok('cadência aparece na lista e some ao remover', (await call('GET', '/api/crm/cadences')).json.cadences.length === 1 && (await callAs(cookieAdmin, 'DELETE', `/api/crm/cadences/${cadOk.json.cadence.id}`)).status === 200 && (await call('GET', '/api/crm/cadences')).json.cadences.length === 0);

await limpar();
await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes da rotina da Eduarda ok');
process.exit(failed ? 1 : 0);
