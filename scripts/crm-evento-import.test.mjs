// Teste da importação dos leads do evento (scripts/crm-evento-import.mjs) contra servidor e Postgres LOCAIS, no sandbox (organização sandbox-edu).
// Usa os arquivos reais saida/*.json (só um subconjunto de leads) e cria funil/usuários temporários, apagados no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/crm-evento-import.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import * as I from './crm-evento-import.mjs';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const EVDIR = process.env.EVENT_DIR || path.join(os.homedir(), 'Desktop/CLAUDE/LEADS_EVENTO_2026-10');
const ORG = 'sandbox-edu';
const RUN = crypto.randomBytes(3).toString('hex');
const PASS = crypto.randomBytes(12).toString('base64url');
const U = `oiev_${RUN}`;
const FUNIL = `Evento Teste ${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 600)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];

const event = I.loadEvent(EVDIR);
const byId = new Map(event.leads.map((l) => [l.id, l]));
const IDS = { venda: 'L0868c3b7', semEmpresa: 'L44edb875', follow: 'Led7b1698', brinde: 'L301e1888', multi: 'L56513dc6', grupo: ['L3da181d3', 'L8d1794b5', 'Laaa2af79'], simples: ['Lbd9a9b7c', 'L43ab8ebd'], colega: null };
const pick = [IDS.venda, IDS.semEmpresa, IDS.follow, IDS.brinde, IDS.multi, ...IDS.grupo, ...IDS.simples];
pick.forEach((id) => { if (!byId.has(id)) { console.error(`Lead ${id} não existe nos arquivos do evento; ajuste o teste.`); process.exit(2); } });

async function cleanup() {
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND (source=$2 OR legal_name LIKE $3 OR created_by LIKE 'oiev_%')`, [ORG, I.SOURCE, `${FUNIL}%`]);
  const ids = cs.map((r) => r.id);
  const { rows: ps } = await pool.query(`SELECT id FROM crm_pipelines WHERE org_id=$1 AND name LIKE 'Evento Teste %'`, [ORG]);
  const pids = ps.map((r) => r.id);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND company_id = ANY($2::uuid[])`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND actor_id LIKE 'oiev_%'`, [ORG]);
  await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]) OR pipeline_id = ANY($2::uuid[]))`, [ids, pids]);
  await pool.query(`DELETE FROM crm_deal_tags WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]) OR pipeline_id = ANY($2::uuid[]))`, [ids, pids]);
  for (const t of ['crm_activities', 'crm_notes']) await pool.query(`DELETE FROM ${t} WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_deals WHERE company_id = ANY($1::uuid[]) OR pipeline_id = ANY($2::uuid[])`, [ids, pids]);
  await pool.query(`DELETE FROM crm_contacts WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_cadences WHERE pipeline_id = ANY($1::uuid[])`, [pids]);
  await pool.query(`DELETE FROM crm_pipeline_stages WHERE pipeline_id = ANY($1::uuid[])`, [pids]);
  await pool.query(`DELETE FROM crm_pipelines WHERE id = ANY($1::uuid[])`, [pids]);
  await pool.query(`DELETE FROM crm_saved_views WHERE org_id=$1 AND name LIKE 'Ponto Fora da Curva ·%'`, [ORG]).catch(() => {});
  await pool.query(`DELETE FROM crm_tags WHERE org_id=$1 AND (name LIKE 'Curva _ (est.)' OR name = 'Ponto Fora da Curva' OR name LIKE 'Estande: %' OR name IN ('Evento 22–23/10/2026','Canal: Estande','Grupo no evento','Quente no evento','Tag da equipe'))`, [ORG]).catch(() => {});
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'oiev_%'`).catch(() => {});
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'oiev_%'`);
  await pool.query(`DELETE FROM notifications WHERE user_id LIKE 'oiev_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'oiev_%'`);
}
await cleanup();
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Admin Teste Evento','master',$3,true,true)`, [U, await bcrypt.hash(PASS, 10), ORG]);
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: U, password: PASS }) });
const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || '']).map((c) => c.split(';')[0]).join('; ');
const mint = await (await fetch(`${BASE}/api/connect/tokens`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Claude Code do teste', scope: 'crm_operate', days: 30 }) })).json();
const TOKEN = mint.token;
const api = I.makeApi(BASE, TOKEN, { minGapMs: 0, waitOn429Ms: 15000 });
const count = async (sql, p = []) => (await pool.query(sql, p)).rows[0].n;

try {
  ok('chave crm_operate criada', typeof TOKEN === 'string' && TOKEN.startsWith('pxk_'), mint);
  // funil de teste com as etapas do mapeamento
  const created = (await api('POST', '/pipelines', { name: FUNIL })).pipelines.find((p) => p.name === FUNIL);
  const NAMES = ['Leads', 'Mapeamento', 'Conexão', 'Apresentação do Programa PriceTax', 'Acesso Teste', 'Proposta', 'Negociação', 'Contrato'];
  const pipe = (await api('POST', `/pipelines/${created.id}/stages`, { stages: NAMES.map((name, i) => ({ name, probability: 10 + i * 10 })) })).pipelines.find((p) => p.name === FUNIL);
  ok('funil de teste criado com as 8 etapas abertas', pipe && pipe.stages.filter((s) => s.kind === 'open').length === 8, pipe);
  const stageLeads = pipe.stages.find((s) => s.name === 'Leads');
  const cad = await api('POST', '/cadences', { pipelineId: pipe.id, stageId: stageLeads.id, name: `${FUNIL} cadência`, steps: [{ title: 'Passo de cadência', type: 'followup', days: 1 }] });
  ok('cadência na etapa Leads (para provar que a importação NÃO a dispara)', !!cad.cadence);

  // registros que já existem no CRM → devem ser VINCULADOS, não duplicados
  const L = (id) => byId.get(id);
  const boni = L(IDS.simples[0]);
  const coBoni = (await api('POST', '/companies', { legalName: `${boni.empresa} Ltda`, relationship: 'prospect', force: true })).company;          // empresa existente (nome igual sem "Ltda")
  const venda = L(IDS.venda);
  const coV = (await api('POST', '/companies', { legalName: `${FUNIL} Empresa Antiga`, relationship: 'client', force: true })).company;
  const { first: vf, last: vl } = I.splitName(venda.nome);
  const kV = (await api('POST', '/contacts', { companyId: coV.id, firstName: vf, lastName: vl, phone: venda.telefone, email: 'outro@x.com', force: true })).contact;   // mesmo telefone + mesmo 1º nome
  const dV = (await api('POST', '/deals', { companyId: coV.id, title: 'Negócio antigo da Maria', pipelineId: pipe.id, stageId: pipe.stages.find((s) => s.name === 'Proposta').id, primaryContactId: kV.id, source: 'PipeRun', skipCadence: true })).deal;
  const fol = L(IDS.follow);
  const { first: ff, last: fl } = I.splitName(fol.nome);
  const kF = (await api('POST', '/contacts', { companyId: coV.id, firstName: ff, lastName: fl, email: fol.email, force: true })).contact;    // mesmo e-mail + mesmo 1º nome, SEM negócio aberto
  const mu = L(IDS.multi);
  const kC = (await api('POST', '/contacts', { companyId: coV.id, firstName: 'Fulano', lastName: 'Colega', email: mu.email, phone: mu.telefone, force: true })).contact; // mesmo e-mail/telefone, OUTRO nome → colega, não vincula
  ok('registros pré-existentes criados', !!coBoni.id && !!kV.id && !!dV.id && !!kF.id && !!kC.id);

  const base = { api, event, pipelineName: FUNIL, only: pick };
  const dry = await I.run({ ...base, apply: false });
  ok('PRÉVIA não grava nada (nenhum negócio do evento, nenhuma empresa nova)', (await count(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND external_source=$2`, [ORG, I.EXT_SOURCE])) === 0 && (await count(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND source=$2`, [ORG, I.SOURCE])) === 0);
  ok('prévia já separa criar × vincular', dry.created.length + dry.linked.length === pick.length && dry.linked.length === 2, { c: dry.created.length, l: dry.linked.length, f: dry.failed });

  const r1 = await I.run({ ...base, apply: true });
  ok('1ª importação sem falhas', r1.failed.length === 0, r1.failed);
  ok('criados + vinculados = leads lidos', r1.created.length + r1.linked.length === pick.length, { c: r1.created.length, l: r1.linked.length });
  ok('2 vinculados (telefone+1º nome → com negócio aberto; e-mail+1º nome → sem negócio, cria negócio do evento no contato existente)', r1.linked.length === 2 && r1.linked.some((x) => x.lead === IDS.venda && x.negocioExistente) && r1.linked.some((x) => x.lead === IDS.follow && !x.negocioExistente), r1.linked);
  ok('colega (mesmo e-mail, outro nome) NÃO foi vinculado: virou contato novo', (await count(`SELECT count(*)::int n FROM crm_contacts WHERE org_id=$1 AND deleted_at IS NULL AND lower(email)=lower($2)`, [ORG, mu.email])) === 2);
  ok('empresa existente (nome igual sem "Ltda") reaproveitada, não duplicada', (await count(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL AND name_norm LIKE $2`, [ORG, `%${I.companyKey(boni.empresa)}%`])) === 1);
  ok('a venda NÃO duplicou o negócio antigo: o evento não criou negócio para ela', (await count(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, IDS.venda])) === 0);

  const deals = (await api('GET', `/deals?status=all&externalSource=${I.EXT_SOURCE}&limit=200`)).items;
  ok('negócios do evento criados com a chave externa (origem_id = id L…)', deals.length === r1.created.length + 1 && deals.every((d) => /^L[0-9a-f]{8}$/.test(d.externalId) && d.source === I.SOURCE), deals.map((d) => d.externalId));
  const dSimple = deals.find((d) => d.externalId === IDS.simples[1]);
  const detail = (await api('GET', `/deals/${dSimple.id}`));
  ok('estágio 7 → etapa Leads; valor 0 (nada inventado); sem responsável', dSimple.stageName === 'Leads' && dSimple.value === 0 && !dSimple.ownerName, dSimple);
  ok('descrição separa FATOS, ESTIMATIVAS e NÃO IDENTIFICADO', /FATOS/.test(detail.deal.description) && /ESTIMATIVAS/.test(detail.deal.description) && /não informado/.test(detail.deal.description) && /Valor de venda: não informado/.test(detail.deal.description), detail.deal.description);
  ok('tags de origem, evento, canal, estande e curva (A–D)', ['Evento 22–23/10/2026', 'Ponto Fora da Curva', 'Canal: Estande', 'Estande: TINTAX'].every((t) => detail.deal.tags.includes(t)) && detail.deal.tags.some((t) => /^Curva [A-D] \(est\.\)$/.test(t)), detail.deal.tags);
  ok('curva D = pontuação < 25 (lead só captado); descrição explica a regra', I.curvaOf(10) === 'D' && I.curvaOf(24) === 'D' && I.curvaOf(25) === 'C' && I.curvaOf(39) === 'C' && I.curvaOf(40) === 'B' && I.curvaOf(70) === 'A' && detail.deal.tags.includes(`Curva ${I.curvaOf(byId.get(IDS.simples[1]).score_est)} (est.)`) && /Curva \(est\.\): [A-D] — A ≥70/.test(detail.deal.description), detail.deal.tags);
  ok('filtro por VÁRIAS tags (E): evento + curva traz só quem tem as duas', await (async () => { const cv = `Curva ${I.curvaOf(byId.get(IDS.simples[1]).score_est)} (est.)`; const a = await api('GET', `/deals?status=all&tag=${encodeURIComponent(`Ponto Fora da Curva|${cv}`)}&limit=200`); const b = await api('GET', `/deals?status=all&tag=${encodeURIComponent('Ponto Fora da Curva|Curva A (est.)|Curva D (est.)')}&limit=200`); return a.total >= 1 && a.items.every((d) => d.tags.includes(cv)) && b.total === 0; })());
  ok('cadência da etapa Leads NÃO foi disparada pela importação', (await count(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1 AND title='Passo de cadência' AND deleted_at IS NULL`, [ORG])) === 0);
  const noEmp = deals.find((d) => d.externalId === IDS.semEmpresa);
  ok('lead sem empresa → empresa provisória com o nome da pessoa; estágio 5 → Acesso Teste', noEmp && /\(empresa não informada\)/.test(noEmp.companyName) && noEmp.stageName === 'Acesso Teste', noEmp && [noEmp.companyName, noEmp.stageName]);
  const dFol = deals.find((d) => d.externalId === IDS.follow);
  ok('contato existente (por e-mail) ligado ao negócio do evento; estágio 3 → Conexão', dFol && dFol.primaryContactId === kF.id && dFol.stageName === 'Conexão', dFol && [dFol.primaryContactId, kF.id, dFol.stageName]);
  const dfDet = await api('GET', `/deals/${dFol.id}`);
  ok('data de contato combinada vira atividade (follow-up) no dia anotado, sem dono', dfDet.activities.some((a) => a.dueDate === fol.follow_up && /Contato combinado/.test(a.title)), dfDet.activities);
  const capN = event.capturas.filter((c) => pick.includes(c.lead_id) && c.lead_id !== IDS.venda).length + event.capturas.filter((c) => c.lead_id === IDS.venda).length;
  ok('capturas viram notas do histórico (uma por captura)', r1.notes.captures === capN, { got: r1.notes.captures, capN });
  ok('comentários do estande viram nota com o texto original', r1.notes.comments === pick.filter((id) => String(byId.get(id).anotacoes || '').trim()).length && (await api('GET', `/deals/${deals.find((d) => d.externalId === IDS.follow).id}`)).notes.some((n) => n.body.startsWith(`[evento comentario ${IDS.follow}]`) && n.body.includes(byId.get(IDS.follow).anotacoes.trim().slice(0, 30))), r1.notes);
  const vs = (await api('GET', '/views?scope=deals')).views.filter((v) => /^Ponto Fora da Curva ·/.test(v.name));
  ok('visões salvas compartilhadas (evento, curvas A–D, quentes, estandes, grupos) criadas com o filtro de várias tags', r1.views.created.length === 10 && vs.length === 10 && vs.every((v) => v.shared) && vs.find((v) => v.name.endsWith('Curva A')).config.tag === 'Ponto Fora da Curva|Curva A (est.)' && vs.find((v) => v.name.endsWith('Curva A')).config.pipelineId === pipe.id, vs.map((v) => v.name));
  const dBr = deals.find((d) => d.externalId === IDS.brinde);
  const brDet = await api('GET', `/deals/${dBr.id}`);
  ok('brinde entra como ESTIMATIVA (nota e tag com "(est.)")', brDet.notes.some((n) => /Brinde \(ESTIMATIVA/.test(n.body)) && brDet.deal.tags.includes('Brinde registrado (est.)'), brDet.deal.tags);
  const vendaDeal = (await api('GET', `/deals/${dV.id}`));
  ok('negócio antigo da venda recebeu tag e nota com os dados do evento, mas NÃO mudou de etapa/origem/valor', vendaDeal.deal.tags.includes('Evento 22–23/10/2026') && vendaDeal.deal.stageName === 'Proposta' && vendaDeal.deal.source === 'PipeRun' && vendaDeal.notes.some((n) => n.body.startsWith(`[evento ${IDS.venda}]`)), vendaDeal.deal);
  ok('grupos de empresas viram nota de cross-sell na empresa (Lukky: 3 do grupo no teste)', r1.notes.groups >= 1 && (await count(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND body LIKE '[evento grupo %'`, [ORG])) >= 1);
  ok('contato novo guarda só FATOS nos campos (cargo, e-mail, telefone); decisor estimado NÃO vira papel na decisão', await (async () => { const k = (await pool.query(`SELECT job_title, decision_role, email, phone FROM crm_contacts WHERE org_id=$1 AND lower(email)=lower($2) AND first_name <> 'Fulano'`, [ORG, mu.email])).rows[0]; return k && k.job_title === mu.cargo && k.decision_role === '' && k.email.toLowerCase() === mu.email.toLowerCase(); })());
  ok('empresa nova sem estado/UF preenchido (UF é estimativa)', (await count(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND source=$2 AND state <> ''`, [ORG, I.SOURCE])) === 0);

  // reimportação: nada duplica
  const nDeals = await count(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND deleted_at IS NULL`, [ORG]);
  const nNotes = await count(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND deleted_at IS NULL`, [ORG]);
  const nCont = await count(`SELECT count(*)::int n FROM crm_contacts WHERE org_id=$1 AND deleted_at IS NULL`, [ORG]);
  const nComp = await count(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL`, [ORG]);
  const nAct = await count(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1 AND deleted_at IS NULL`, [ORG]);
  const r2 = await I.run({ ...base, apply: true });
  ok('2ª importação sem falhas e sem criar nada (nem visões repetidas)', r2.failed.length === 0 && r2.created.length === 0 && r2.views.created.length === 0 && r2.views.existing.length === 10, { f: r2.failed, c: r2.created.length, v: r2.views });
  ok('nada duplicado (negócios, notas, contatos, empresas, atividades)', (await count(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND deleted_at IS NULL`, [ORG])) === nDeals && (await count(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND deleted_at IS NULL`, [ORG])) === nNotes && (await count(`SELECT count(*)::int n FROM crm_contacts WHERE org_id=$1 AND deleted_at IS NULL`, [ORG])) === nCont && (await count(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL`, [ORG])) === nComp && (await count(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1 AND deleted_at IS NULL`, [ORG])) === nAct, { nDeals, nNotes });
  ok('2ª importação: tudo "ignorado" (já estava igual)', r2.ignored.length + r2.updated.length + r2.linked.length === pick.length && r2.updated.length === 0, { i: r2.ignored.length, u: r2.updated.length, l: r2.linked.length });

  // lista nova: lead avançou de estágio, ganhou captura nova; o time mexeu em outro lead e acrescentou tag própria
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evento-'));
  fs.cpSync(path.join(EVDIR, 'saida'), path.join(tmp, 'saida'), { recursive: true });
  const ev2 = I.loadEvent(tmp);
  const adv = ev2.leads.find((l) => l.id === IDS.simples[1]);
  adv.estagio = '4 · Interesse quente'; adv.temperatura = 'Quente'; adv.score_est = 85; adv.prioridade_est = 'A';
  ev2.capturas.push({ cap_id: 'C999', lead_id: adv.id, nome: adv.nome, capturado_em: '2026-10-23T10:00', estande: 'Gmaster', tipo: 'Quente', produto: 'CAPAG', nota: 'voltou no estande' });
  const touched = ev2.leads.find((l) => l.id === IDS.semEmpresa);
  touched.estagio = '2 · Fechamento sinalizado';
  const tDeal = deals.find((d) => d.externalId === IDS.semEmpresa);
  await api('PUT', `/deals/${tDeal.id}/tags`, { tags: [...(await api('GET', `/deals/${tDeal.id}`)).deal.tags, 'Tag da equipe'] });
  await api('POST', `/deals/${tDeal.id}/move`, { stageId: pipe.stages.find((s) => s.name === 'Proposta').id });     // o time mexeu: a importação não pode desfazer
  const r3 = await I.run({ ...base, event: ev2, apply: true });
  ok('3ª importação (lista nova) sem falhas', r3.failed.length === 0, r3.failed);
  const advDeal = (await api('GET', `/deals/${deals.find((d) => d.externalId === adv.id).id}`));
  ok('lead que avançou de estágio sobe de etapa (Leads → Conexão) quando o time não mexeu', advDeal.deal.stageName === 'Conexão', advDeal.deal.stageName);
  ok('descrição e tags refletem a lista nova; captura nova virou nota (e as antigas não duplicaram)', /Estágio no evento: 4/.test(advDeal.deal.description) && advDeal.deal.tags.includes('Quente no evento') && advDeal.deal.tags.includes('Curva A (est.)') && !advDeal.deal.tags.includes('Curva D (est.)') && !advDeal.deal.tags.some((t) => /^Prioridade est\./.test(t)) && advDeal.notes.filter((n) => n.body.startsWith('[evento C999]')).length === 1, [advDeal.deal.tags, advDeal.notes.length]);
  const tAfter = await api('GET', `/deals/${tDeal.id}`);
  ok('negócio que o time moveu NÃO é movido de volta pela importação; tag da equipe preservada', tAfter.deal.stageName === 'Proposta' && tAfter.deal.tags.includes('Tag da equipe'), [tAfter.deal.stageName, tAfter.deal.tags]);
  ok('histórico mantido: movimentos de etapa e notas anteriores continuam', tAfter.stageHistory.length >= 2 && (await api('GET', `/deals/${deals.find((d) => d.externalId === adv.id).id}`)).notes.length >= 2, tAfter.stageHistory.length);

  // interações da equipe (Registro Comercial)
  const idir = fs.mkdtempSync(path.join(os.tmpdir(), 'interacoes-'));
  fs.writeFileSync(path.join(idir, 'i1.json'), JSON.stringify([{ id: 'int1', lead_id: IDS.simples[1], tipo: 'Proposta enviada', data: '2026-10-26', produto: 'Tintax', valor: 199, recorrencia: 'Mensal', resumo: 'Enviei a proposta.', proxima_acao: 'Ligar', proxima_data: '2026-10-30', status_proposta: 'Em aberto', autor: 'u_abc' }]));
  const ints = I.loadInteractions(idir);
  ok('lê interações exportadas', ints.length === 1 && ints[0].id === 'int1');
  const r4 = await I.run({ ...base, event: ev2, interacoes: ints, apply: true });
  const r5 = await I.run({ ...base, event: ev2, interacoes: ints, apply: true });
  const advDeal2 = await api('GET', `/deals/${deals.find((d) => d.externalId === adv.id).id}`);
  ok('interação vira nota do lead uma única vez; o valor da equipe NÃO altera o valor do negócio', r4.notes.interactions === 1 && r5.notes.interactions === 0 && advDeal2.notes.filter((n) => n.body.startsWith('[evento int int1]')).length === 1 && advDeal2.deal.value === 0, [r4.notes.interactions, r5.notes.interactions, advDeal2.deal.value]);

  // responsável: a importação coloca os negócios (e o contato combinado) no nome de quem foi pedido, sem sobrescrever dono que o time já definiu
  const rOwner = await I.run({ ...base, event: ev2, apply: true, ownerName: 'Admin Teste Evento' });
  const ownedDeals = (await api('GET', `/deals?status=all&externalSource=${I.EXT_SOURCE}&limit=200`)).items;
  ok('responsável: todos os negócios do evento ficam no nome pedido (só os sem dono; os do time ficam)', rOwner.failed.length === 0 && rOwner.ownersSet === ownedDeals.filter((d) => d.ownerName === 'Admin Teste Evento').length && ownedDeals.every((d) => d.ownerName === 'Admin Teste Evento'), { set: rOwner.ownersSet, owners: ownedDeals.map((d) => d.ownerName) });
  ok('responsável: o contato combinado no evento também passa para ele', (await api('GET', `/deals/${dFol.id}`)).activities.filter((a) => /Contato combinado/.test(a.title)).every((a) => a.ownerName === 'Admin Teste Evento'));
  ok('responsável inexistente é recusado antes de gravar qualquer coisa', await I.run({ ...base, apply: true, ownerName: 'Fulano Que Nao Existe' }).then(() => false, (e) => /nenhum usuário/.test(e.message)));

  // e-mail corporativo desempata: empresas que o domínio prova serem a mesma são UNIDAS (contratos de teste: Contplan × Contplan Contabilidade; sem-empresa × Bruning Tecnometal)
  const DOM = ['Ld38f52c7', 'Lc4e1874d', 'Ld4933ad0', 'L520d68e8'];
  const legacy = I.loadEvent(EVDIR);
  legacy.leads.filter((l) => DOM.includes(l.id)).forEach((l) => { l.email = `${l.id.toLowerCase()}@gmail.com`; });   // como era antes: sem o domínio como prova
  const domBase = { api, pipelineName: FUNIL, only: DOM };
  const p1 = await I.run({ ...domBase, event: legacy, apply: true });
  const compOf = async (leadId) => (await api('GET', `/deals?status=all&externalSource=${I.EXT_SOURCE}&externalId=${leadId}`)).items[0];
  const before = await Promise.all(DOM.map(compOf));
  ok('antes: sem o domínio, 4 empresas separadas (duas com nome parecido, uma provisória)', p1.failed.length === 0 && new Set(before.map((d) => d.companyId)).size === 4, before.map((d) => d.companyName));
  const p2 = await I.run({ ...domBase, event: I.loadEvent(EVDIR), apply: true });
  const after = await Promise.all(DOM.map(compOf));
  ok('com o domínio do e-mail: Contplan e Contplan Contabilidade viram UMA empresa (a de nome mais completo)', p2.failed.length === 0 && after[0].companyId === after[1].companyId && after[0].companyName === 'Contplan Contabilidade', after.map((d) => d.companyName));
  ok('lead sem empresa (provisória) entra na empresa do mesmo domínio: Bruning Tecnometal', after[2].companyId === after[3].companyId && after[2].companyName === 'Bruning Tecnometal', after.map((d) => d.companyName));
  ok('as empresas absorvidas foram excluídas (lógico) e o histórico registrou a união', (await count(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND id = ANY($2::uuid[]) AND deleted_at IS NOT NULL`, [ORG, before.map((d) => d.companyId)])) === 2 && (await count(`SELECT count(*)::int n FROM crm_timeline_events WHERE org_id=$1 AND event_type='company_merged'`, [ORG])) === 2 && p2.merges.length === 2, p2.merges);
  ok('contatos e negócios foram junto: a empresa que ficou tem os 2 contatos e os 2 negócios', (await count(`SELECT count(*)::int n FROM crm_contacts WHERE company_id=$1 AND deleted_at IS NULL`, [after[0].companyId])) === 2 && (await count(`SELECT count(*)::int n FROM crm_deals WHERE company_id=$1 AND deleted_at IS NULL`, [after[0].companyId])) === 2);
  const p3 = await I.run({ ...domBase, event: I.loadEvent(EVDIR), apply: true });
  ok('reimportar depois da união não une nem recria nada', p3.failed.length === 0 && p3.merges.length === 0 && p3.created.length === 0);

  // segurança do contrato
  const bad = (await fetch(`${BASE}/api/connect/crm/deals`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: coV.id, title: 'Repetido', pipelineId: pipe.id, externalSource: I.EXT_SOURCE, externalId: IDS.simples[1] }) }));
  ok('a chave externa é única: segundo cadastro com o mesmo L… é recusado (409), não duplica', bad.status === 409, bad.status);
  ok('tudo foi gravado como Claude Code (por …)', (await count(`SELECT count(*)::int n FROM crm_audit_logs WHERE org_id=$1 AND actor_id=$2 AND actor_name LIKE 'Claude Code (por %'`, [ORG, U])) > 10);
} catch (e) {
  failed += 1;
  console.log('FAIL exceção:', e.stack || e);
} finally {
  await cleanup();
  await pool.end();
}
console.log(failed ? `\n${failed} falha(s)` : '\ntodos os testes da importação do evento ok');
process.exit(failed ? 1 : 0);
