// Teste do espelho Atividade do CRM → Google Calendar do responsável (server/crm/googleSync.js), SEM chamar o Google de verdade (deps trocadas por um Google falso em memória).
// Banco LOCAL (sandbox-edu), usuários/empresa temporários apagados no fim.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/crm-google-sync.test.mjs
import crypto from 'node:crypto';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) { console.error('Recusado: só banco local.'); process.exit(2); }
const { pool } = await import('../server/db.js');
const S = await import('../server/crm/service.js');
const D = await import('../server/crm/deals.js');
const A = await import('../server/crm/activities.js');
const G = await import('../server/crm/googleSync.js');

await G.ensureCrmGoogleSchema(pool); // o servidor faz isto no boot (initDb); aqui o banco de desenvolvimento pode estar sem as colunas novas
const ORG = 'sandbox-edu';
const RUN = crypto.randomBytes(3).toString('hex');
const U1 = `oigs_a_${RUN}`; const U2 = `oigs_b_${RUN}`; const U3 = `oigs_c_${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 500)}` : ''}`); } };

// Google falso
const events = new Map(); let seq = 0; const connected = new Set([U1, U2]); const calls = [];
G.deps.configured = () => true;
G.deps.baseUrl = () => 'https://painel.exemplo.test';
G.deps.upsert = async (userId, eventId, body, opts) => {
  calls.push(['upsert', userId, eventId, opts]);
  if (!connected.has(userId)) throw Object.assign(new Error('não conectado'), { status: 409 });
  if (eventId && events.has(eventId) && events.get(eventId).userId === userId) {
    const meet = events.get(eventId).meet || (body.conferenceData ? `https://meet.test/${eventId}` : '');
    events.set(eventId, { userId, body, meet }); return { id: eventId, htmlLink: `https://cal.test/${eventId}`, created: false, meetLink: meet };
  }
  const id = `ev${++seq}`; const meet = body.conferenceData ? `https://meet.test/${id}` : ''; events.set(id, { userId, body, meet }); return { id, htmlLink: `https://cal.test/${id}`, created: true, meetLink: meet };
};
G.deps.remove = async (userId, eventId) => { calls.push(['remove', userId, eventId]); events.delete(eventId); };

async function cleanup() {
  for (const t of ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history']) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND (legal_name LIKE $2 OR created_by LIKE 'oigs_%')`, [ORG, 'Teste GSync %']);
  const ids = cs.map((r) => r.id);
  await pool.query(`DELETE FROM crm_activity_google WHERE activity_id IN (SELECT id FROM crm_activities WHERE company_id = ANY($1::uuid[]))`, [ids]);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND company_id = ANY($2::uuid[])`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND actor_id LIKE 'oigs_%'`, [ORG]);
  await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [ids]);
  for (const t of ['crm_activities', 'crm_notes', 'crm_deals', 'crm_contacts']) await pool.query(`DELETE FROM ${t} WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM notifications WHERE user_id LIKE 'oigs_%'`).catch(() => {});
  for (const t of ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history']) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'oigs_%'`);
}
await cleanup();
try {
  for (const [id, nm] of [[U1, 'Eduarda Teste'], [U2, 'Felipe Teste'], [U3, 'Sem Google']]) {
    await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,crm_role) VALUES ($1,$1,'x',$2,'pricetax',$3,'vendedor')`, [id, nm, ORG]);
  }
  const act1 = { id: U1, name: 'Eduarda Teste' };
  const co = await S.createCompany(ORG, act1, { legalName: `Teste GSync ${RUN} Ltda`, relationship: 'prospect' }, { force: true });
  const ct = await S.createContact(ORG, act1, { companyId: co.id, firstName: 'Fernanda', lastName: 'Tesserolli', phone: '41988685002', email: 'f@x.com', isPrimary: true }, { force: true });
  const pipe = (await pool.query(`SELECT id FROM crm_pipelines WHERE org_id=$1 AND deleted_at IS NULL ORDER BY is_default DESC LIMIT 1`, [ORG])).rows[0];
  const deal = await D.createDeal(ORG, act1, { companyId: co.id, title: `Negócio GSync ${RUN}`, pipelineId: pipe.id, primaryContactId: ct.id });

  const a = await A.createActivity(ORG, act1, { companyId: co.id, dealId: deal.id, contactId: ct.id, title: 'Realizar FUP da resposta', activityType: 'whatsapp', dueDate: '2026-10-28', dueTime: '09:30', ownerId: U1, description: 'Cobrar retorno' });
  const link = (await pool.query('SELECT * FROM crm_activity_google WHERE activity_id=$1', [a.id])).rows[0];
  ok('atividade da Eduarda para ela mesma cria o evento na agenda dela', !!link && link.user_id === U1 && events.has(link.google_event_id), link);
  const ev = events.get(link.google_event_id);
  ok('evento com data/hora certas (09:30–10:00, fuso de Brasília) e cor da marca', ev.body.start.dateTime === '2026-10-28T09:30:00-03:00' && ev.body.end.dateTime === '2026-10-28T10:00:00-03:00' && ev.body.colorId === '5', ev.body);
  ok('evento LINKADO: título com a empresa, descrição com negócio/contato/telefone e link do CRM, source e id da atividade', /Realizar FUP da resposta — Teste GSync/.test(ev.body.summary) && ev.body.description.includes(`https://painel.exemplo.test/crm?negocio=${deal.id}`) && /Contato: Fernanda Tesserolli/.test(ev.body.description) && ev.body.description.includes('Cobrar retorno') && ev.body.source.url.includes(deal.id) && ev.body.extendedProperties.private.crmActivityId === a.id, ev.body.description);
  ok('sem convidados (ninguém recebe e-mail)', !('attendees' in ev.body));

  await A.updateActivity(ORG, act1, a.id, { dueDate: '2026-10-30', dueTime: '14:00', title: 'FUP reagendado' });
  const ev2 = events.get(link.google_event_id);
  ok('reagendar atualiza o MESMO evento (sem criar outro)', events.size === 1 && ev2.body.start.dateTime === '2026-10-30T14:00:00-03:00' && /FUP reagendado/.test(ev2.body.summary));

  const b = await A.createActivity(ORG, act1, { companyId: co.id, title: 'Sem horário', dueDate: '2026-10-29', ownerId: U1 });
  const lb = (await pool.query('SELECT google_event_id FROM crm_activity_google WHERE activity_id=$1', [b.id])).rows[0];
  const evb = events.get(lb.google_event_id).body;
  ok('atividade sem horário vira evento de dia inteiro', evb.start.date === '2026-10-29' && evb.end.date === '2026-10-30' && !evb.start.dateTime, evb.start);

  await A.completeActivity(ORG, act1, a.id, { outcome: 'Fernanda respondeu' });
  ok('concluir mantém o evento, com ✔ e o resultado', events.get(link.google_event_id).body.summary.startsWith('✔ ') && /Resultado: Fernanda respondeu/.test(events.get(link.google_event_id).body.description));
  await A.reopenActivity(ORG, act1, a.id);
  ok('reabrir tira o ✔', !events.get(link.google_event_id).body.summary.startsWith('✔'));

  // trocar de responsável: sai da agenda de um e entra na do outro
  await A.updateActivity(ORG, act1, b.id, { ownerId: U2 });
  const lb2 = (await pool.query('SELECT * FROM crm_activity_google WHERE activity_id=$1', [b.id])).rows[0];
  ok('trocar o responsável apaga da agenda de quem saiu e cria na de quem entrou', lb2.user_id === U2 && !events.has(lb.google_event_id) && events.get(lb2.google_event_id).userId === U2, lb2);

  // responsável sem Google conectado: nada acontece, sem erro
  const c = await A.createActivity(ORG, act1, { companyId: co.id, title: 'Para quem não conectou', dueDate: '2026-10-31', ownerId: U3 });
  ok('responsável que não conectou o Google: atividade criada normalmente, sem evento e sem erro', !!c.id && (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [c.id])).rows.length === 0);
  const noOwner = await A.createActivity(ORG, act1, { companyId: co.id, title: 'Sem responsável', dueDate: '2026-10-31', ownerId: null });
  ok('atividade sem responsável não vai para agenda nenhuma', (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [noOwner.id])).rows.length === 0);

  // chave de API (Claude Code): não mexe na agenda das pessoas, a não ser que peça
  const before = events.size;
  const viaApi = await A.createActivity(ORG, { id: U1, name: 'Claude Code', viaApi: true, skipGoogle: true }, { companyId: co.id, title: 'Criada pelo Claude Code', dueDate: '2026-11-02', ownerId: U1 });
  ok('atividade criada pela chave de API (skipGoogle) não cria evento', events.size === before && (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [viaApi.id])).rows.length === 0);
  const asked = await A.createActivity(ORG, { id: U1, name: 'Claude Code', viaApi: true, skipGoogle: false }, { companyId: co.id, title: 'Claude Code pediu agenda', dueDate: '2026-11-02', ownerId: U1 });
  ok('com syncGoogle explícito a chave de API também espelha', events.size === before + 1 && (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [asked.id])).rows.length === 1);
  const quiet = await A.createActivity(ORG, { id: U1, name: 'X', silentNotify: true }, { companyId: co.id, title: 'Transferência silenciosa', dueDate: '2026-11-03', ownerId: U1 });
  ok('transferência em lote silenciosa (silentNotify) não mexe na agenda', (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [quiet.id])).rows.length === 0);

  // agenda interna não duplica
  const hidden = await G.linkedGoogleEventIds(U1);
  ok('a Agenda interna sabe quais eventos do Google são atividades do CRM (para mostrar uma vez só)', hidden.has(link.google_event_id) && !hidden.has(lb2.google_event_id));

  // cancelar / excluir apagam o evento
  await A.cancelActivity(ORG, act1, a.id);
  ok('cancelar apaga o evento do Google e o vínculo', !events.has(link.google_event_id) && (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [a.id])).rows.length === 0);
  await A.deleteActivity(ORG, act1, b.id);
  ok('excluir apaga o evento do Google', !events.has(lb2.google_event_id));

  // ---- convite com Meet (opção "a" do Rafael, 2026-11-01): só sai e-mail quando a pessoa marca; o convidado é o contato ESCOLHIDO, com o e-mail dele
  const ctNoMail = await S.createContact(ORG, act1, { companyId: co.id, firstName: 'Sem', lastName: 'Email', phone: '41999990000' }, { force: true });
  const mk = (extra) => ({ companyId: co.id, title: 'Reunião com a Fernanda', activityType: 'meeting', dueDate: '2026-11-05', dueTime: '10:00', ownerId: U1, contactId: ct.id, ...extra });
  const recusa = async (extra, opts) => { try { await A.createActivity(ORG, act1, mk(extra), opts); return ''; } catch (e) { return `${e.status}:${e.message}`; } };
  const evOf = async (id) => events.get((await pool.query('SELECT google_event_id FROM crm_activity_google WHERE activity_id=$1', [id])).rows[0].google_event_id);
  const lastOpts = () => calls[calls.length - 1][3];

  const plain = await A.createActivity(ORG, act1, mk({}));
  const plainEv = await evOf(plain.id);
  ok('reunião SEM marcar o convite: nem convidado nem Meet no evento, e a resposta não traz estado de convite', !('attendees' in plainEv.body) && !('conferenceData' in plainEv.body) && plain.inviteMeet === false && plain.inviteStatus === undefined, plainEv.body);
  const plainAudit = (await pool.query(`SELECT changes FROM crm_audit_logs WHERE entity_id=$1`, [plain.id])).rows;
  ok('a auditoria de criação não registra "convidar" quando está desmarcado (sem ruído)', plainAudit.length > 0 && !JSON.stringify(plainAudit).includes('inviteMeet'));

  ok('convite em atividade que não é reunião é recusado', /^400:.*tipo Reunião/.test(await recusa({ inviteMeet: true, activityType: 'call' })));
  ok('convite sem horário é recusado', /^400:.*horário/.test(await recusa({ inviteMeet: true, dueTime: '' })));
  ok('convite sem contato escolhido é recusado (o e-mail do negócio nunca é usado)', /^400:.*Escolha o contato/.test(await recusa({ inviteMeet: true, contactId: null, dealId: deal.id })));
  ok('convite para contato sem e-mail é recusado', /^400:.*não tem e-mail/.test(await recusa({ inviteMeet: true, contactId: ctNoMail.id })));
  ok('convite em atividade já realizada é recusado', /^400:.*já realizada/.test(await recusa({ inviteMeet: true, dueDate: '2026-10-20' }, { alreadyDone: true })));
  ok('nenhuma das recusas gravou atividade nem evento', (await pool.query(`SELECT count(*)::int AS n FROM crm_activities WHERE company_id=$1 AND invite_meet`, [co.id])).rows[0].n === 0);

  const inv = await A.createActivity(ORG, act1, mk({ inviteMeet: true }));
  const invEv = await evOf(inv.id);
  ok('reunião marcada: o evento pede um Google Meet (hangoutsMeet) com id estável e convida SÓ o contato escolhido, pelo e-mail dele',
    invEv.body.conferenceData && invEv.body.conferenceData.createRequest.conferenceSolutionKey.type === 'hangoutsMeet' && invEv.body.conferenceData.createRequest.requestId === `${inv.id}-meet`
    && JSON.stringify(invEv.body.attendees) === JSON.stringify([{ email: 'f@x.com' }]), invEv.body);
  ok('a resposta já traz o link do Meet, o estado "enviado" e o e-mail convidado', inv.inviteStatus === 'created' && /^https:\/\/meet\.test\//.test(inv.meetLink) && inv.inviteEmail === 'f@x.com', inv);
  ok('o link do Meet fica guardado e volta nas leituras da atividade', (await pool.query('SELECT meet_link FROM crm_activity_google WHERE activity_id=$1', [inv.id])).rows[0].meet_link === inv.meetLink && (await A.loadActivity(pool, ORG, inv.id)).meet_link === inv.meetLink);

  const re = await A.updateActivity(ORG, act1, inv.id, { dueDate: '2026-11-06', dueTime: '15:30' });
  const reEv = await evOf(inv.id);
  ok('reagendar mantém o MESMO link do Meet e o convidado (o Google avisa quem foi convidado)', re.inviteStatus === 'updated' && re.meetLink === inv.meetLink && reEv.body.start.dateTime === '2026-11-06T15:30:00-03:00' && reEv.body.attendees.length === 1 && lastOpts() && !lastOpts().keepGuests && lastOpts().sendUpdates === undefined, lastOpts());

  await A.completeActivity(ORG, act1, inv.id, { outcome: 'Reunião feita' });
  const doneEv = await evOf(inv.id);
  ok('concluir NÃO manda e-mail ao convidado (sendUpdates none) e não mexe nos convidados nem no Meet', lastOpts().sendUpdates === 'none' && lastOpts().keepGuests === true && !('attendees' in doneEv.body) && !('conferenceData' in doneEv.body) && doneEv.body.summary.startsWith('✔ '), lastOpts());
  await A.reopenActivity(ORG, act1, inv.id);
  ok('reabrir volta a manter o convite', (await evOf(inv.id)).body.attendees.length === 1);

  const off2 = await A.updateActivity(ORG, act1, inv.id, { inviteMeet: false });
  const offEv = await evOf(inv.id);
  ok('desmarcar o convite tira o convidado (lista vazia vai ao Google, que avisa o cancelamento) e não pede outro Meet', !('attendees' in offEv.body) && !('conferenceData' in offEv.body) && !lastOpts().keepGuests && off2.inviteMeet === false && off2.inviteStatus === undefined, offEv.body);
  const typeChange = await A.updateActivity(ORG, act1, inv.id, { inviteMeet: true });
  let tipoErr = '';
  try { await A.updateActivity(ORG, act1, inv.id, { activityType: 'call' }); } catch (e) { tipoErr = e.message; }
  ok('marcar de novo funciona; trocar para Ligação com o convite marcado é recusado', typeChange.inviteMeet === true && /tipo Reunião/.test(tipoErr));

  const naoConectado = await A.createActivity(ORG, act1, mk({ inviteMeet: true, ownerId: U3 }));
  ok('responsável sem Google conectado: a atividade é salva e a resposta diz "not-connected" (a tela avisa que o convite NÃO saiu)', naoConectado.inviteStatus === 'not-connected' && naoConectado.meetLink === '', naoConectado);

  await A.cancelActivity(ORG, act1, inv.id);
  ok('cancelar a reunião com convite apaga o evento (o Google cancela para o convidado)', (await pool.query('SELECT 1 FROM crm_activity_google WHERE activity_id=$1', [inv.id])).rows.length === 0);

  const gcal = await import('../server/googleCalendar.js');
  const cr = { createRequest: { requestId: 'x-meet', conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  const curMeet = { hangoutLink: 'https://meet.google.com/a', attendees: [{ email: 'F@x.com', responseStatus: 'accepted' }] };
  const p1 = gcal.composePatch(curMeet, { summary: 's', conferenceData: cr, attendees: [{ email: 'f@x.com' }] });
  ok('patch de evento que JÁ tem Meet não pede outro (editar nunca troca o link) e preserva quem já aceitou', !('conferenceData' in p1.requestBody) && p1.hasMeet === true && p1.requestBody.attendees[0].responseStatus === 'accepted', p1);
  const p2 = gcal.composePatch({ attendees: [] }, { summary: 's', conferenceData: cr, attendees: [{ email: 'f@x.com' }] });
  ok('patch de evento SEM Meet (convite marcado depois) pede o Meet', p2.requestBody.conferenceData === cr && p2.hasMeet === false);
  const p3 = gcal.composePatch(curMeet, { summary: '✔ s' }, { keepGuests: true });
  ok('keepGuests não envia lista de convidados (o Google mantém a que está lá)', !('attendees' in p3.requestBody));
  const p4 = gcal.composePatch(curMeet, { summary: 's' });
  ok('sem keepGuests e sem convidados no corpo, a lista é esvaziada (desmarcar o convite remove o convidado)', Array.isArray(p4.requestBody.attendees) && p4.requestBody.attendees.length === 0);
  ok('meetLinkOf lê hangoutLink ou o ponto de entrada de vídeo', gcal.meetLinkOf({ hangoutLink: 'https://meet.google.com/a' }) === 'https://meet.google.com/a'
    && gcal.meetLinkOf({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://meet.google.com/b' }] } }) === 'https://meet.google.com/b'
    && gcal.meetLinkOf({}) === '' && gcal.meetLinkOf(null) === '');

  // falha do Google não derruba a atividade
  G.deps.upsert = async () => { throw new Error('Google fora do ar'); };
  const errAct = await A.createActivity(ORG, act1, { companyId: co.id, title: 'Google caiu', dueDate: '2026-11-04', ownerId: U1 });
  ok('Google fora do ar: a atividade do CRM é criada mesmo assim', !!errAct.id);
  G.deps.configured = () => false;
  const off = await A.createActivity(ORG, act1, { companyId: co.id, title: 'Google não configurado', dueDate: '2026-11-04', ownerId: U1 });
  ok('Google não configurado no servidor: nada acontece', !!off.id);
} catch (e) {
  failed += 1; console.log('FAIL exceção:', e.stack || e);
} finally {
  await cleanup();
  await pool.end();
}
console.log(failed ? `\n${failed} falha(s)` : '\ntodos os testes do espelho no Google Calendar ok');
process.exit(failed ? 1 : 0);
