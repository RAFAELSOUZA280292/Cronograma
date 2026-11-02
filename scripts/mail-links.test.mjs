// E-mail ligado ao CRM e às Empresas (§130): chave por domínio × provedor público, @pricetax ignorado, prioridade das fontes,
// selo, faixa "Empresa fora do CRM", Operações sem ids do CRM, agrupamento e quem lê o texto. Puro (sem banco, sem Gmail).
//   node scripts/mail-links.test.mjs
import { keyOf, cleanKey, siteDomain, buildDirectory, classifyThread, linkForViewer, badgeOf, keysOfCompany, groupRows, threadFacts, canReadContent, prettyKey, isRobot } from '../server/mailLinksCore.js';
import { headerMap, parseAddressList } from '../server/googleMail.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };

// chave
ok('domínio corporativo vira a chave', keyOf('Gerson.Turola@OKUBO.com.br') === 'okubo.com.br');
ok('provedor público usa o endereço inteiro', keyOf('fulano.silva@gmail.com') === 'fulano.silva@gmail.com' && keyOf('a@hotmail.com.br') === 'a@hotmail.com.br' && keyOf('b@outlook.com') === 'b@outlook.com');
ok('@pricetax ignorado', keyOf('rafael.souza@pricetax.com.br') === null && keyOf('x@mail.pricetax.com.br') === null);
ok('robôs ignorados', keyOf('no-reply@okubo.com.br') === null && keyOf('calendar-notification@google.com') === null && isRobot('MAILER-DAEMON@x.com'));
ok('endereço inválido ignorado', keyOf('sem arroba') === null && keyOf('') === null);
ok('Tróia no onmicrosoft vira domínio', keyOf('contato@troiaconsultoria.onmicrosoft.com') === 'troiaconsultoria.onmicrosoft.com');
ok('marcar: limpa @, www e caminho', cleanKey('@OKUBO.com.br') === 'okubo.com.br' && cleanKey('https://www.okubo.com.br/x') === 'okubo.com.br' && cleanKey('troiaconsultoria.onmicrosoft.com') === 'troiaconsultoria.onmicrosoft.com');
ok('marcar: não aceita provedor público inteiro nem a casa', cleanKey('gmail.com') === null && cleanKey('pricetax.com.br') === null && cleanKey('fulano@gmail.com') === 'fulano@gmail.com');
ok('site → domínio', siteDomain('http://www.kuhn.com.br/contato') === 'kuhn.com.br' && siteDomain('gmail.com') === '' && siteDomain('') === '');
ok('nome bonito do domínio', prettyKey('okubo.com.br') === 'Okubo' && prettyKey('troiaconsultoria.onmicrosoft.com') === 'Troiaconsultoria' && prettyKey('nova-industria.com.br') === 'Nova Industria');

// diretório
const companies = [
  { id: 'c-kuhn', legalName: 'KUHN DO BRASIL S.A.', tradeName: 'KUHN', website: 'www.kuhn.com.br', relationship: 'client' },
  { id: 'c-okubo', legalName: 'OKUBO MERCANTIL', tradeName: 'OKUBO', website: '', relationship: 'prospect' },
  { id: 'c-pessoa', legalName: 'Fulano ME', tradeName: '', website: '', relationship: 'prospect' },
  { id: 'c-dup', legalName: 'OKUBO HOLDING', tradeName: '', website: 'okubo.com.br', relationship: 'prospect' },
];
const contacts = [
  { email: 'gerson.turola@okubo.com.br', companyId: 'c-okubo' },
  { email: 'fulano@gmail.com', companyId: 'c-pessoa' },
];
const deals = [
  { id: 'd-okubo', companyId: 'c-okubo', title: 'OKUBO — Reforma', status: 'open', stageName: 'Proposta', updatedAt: '2026-10-28' },
  { id: 'd-old', companyId: 'c-okubo', title: 'antigo', status: 'lost', stageName: 'Perdido', updatedAt: '2026-11-01' },
];
const projects = [
  { id: 'p-kuhn', name: 'KUHN', emails: ['ana@kuhn.com.br'], crmCompanyId: 'c-kuhn' },
  { id: 'p-cerej', name: 'CEREJ', emails: ['fiscal@cerej.com.br', 'beltrano@hotmail.com'] },
];
const marks = [
  { key: 'troiaconsultoria.onmicrosoft.com', kind: 'parceiro', label: 'Tróia' },
  { key: 'cerej.com.br', kind: 'fornecedor', label: 'não deveria valer' },
  { key: 'spam.com.br', kind: 'ignorar' },
];
const dir = buildDirectory({ companies, contacts, deals, projects, marks });
const t = (k) => dir.byKey.get(k);
ok('contato do CRM: domínio liga à empresa com negócio aberto (vence a outra de mesmo domínio)', t('okubo.com.br').companyId === 'c-okubo' && t('okubo.com.br').dealId === 'd-okubo', t('okubo.com.br'));
ok('negócio perdido não conta; aberto vence', t('okubo.com.br').stage === 'Proposta');
ok('site da empresa do CRM liga o domínio', t('kuhn.com.br').companyId === 'c-kuhn' && t('kuhn.com.br').projectId === 'p-kuhn');
ok('provedor público: só o e-mail exato do contato', t('fulano@gmail.com').companyId === 'c-pessoa' && !dir.byKey.has('gmail.com'));
ok('módulo Empresas: domínio e e-mail público dos contatos', t('cerej.com.br').source === 'empresas' && t('beltrano@hotmail.com').projectId === 'p-cerej');
ok('prioridade: Empresas vence a marca manual', t('cerej.com.br').source === 'empresas');
ok('marca manual vale quando nada mais acha', t('troiaconsultoria.onmicrosoft.com').kind === 'parceiro');
const dirCrmFirst = buildDirectory({ companies, contacts, deals, projects: [{ id: 'p-x', name: 'OKUBO no cronograma', emails: ['x@okubo.com.br'] }], marks: [{ key: 'okubo.com.br', kind: 'ignorar' }] });
ok('prioridade: CRM vence Empresas e marca', dirCrmFirst.byKey.get('okubo.com.br').source === 'crm');

// selos
ok('selo cliente', badgeOf(t('kuhn.com.br')).text === 'Cliente · KUHN');
ok('selo lead com etapa', badgeOf(t('okubo.com.br')).text === 'Lead · OKUBO · Proposta' && badgeOf(t('okubo.com.br')).tone === 'lead');
ok('selo parceiro', badgeOf(t('troiaconsultoria.onmicrosoft.com')).text === 'Parceiro · Tróia');
ok('etapa com o mesmo nome do selo não se repete', badgeOf({ ...t('okubo.com.br'), stage: 'Lead' }).text === 'Lead · OKUBO');
ok('prospect sem negócio', badgeOf(t('fulano@gmail.com')).text === 'Prospect · Fulano ME');

// conversa
const me = { name: 'Rafael', email: 'rafael.souza@pricetax.com.br' };
const okuboThread = { participants: [{ name: 'Gerson Turola', email: 'gerson.turola@okubo.com.br' }, me], teamReplied: true, subject: 'Planilha para preenchimento - Proposta Comercial' };
const empty = buildDirectory({});
const c1 = classifyThread(okuboThread, empty);
ok('OKUBO fora do CRM: faixa com o domínio', c1.nag === 'okubo.com.br' && !c1.badge, c1);
const c2 = classifyThread(okuboThread, dir);
ok('OKUBO no CRM: selo de lead, sem faixa, com negócio', !c2.nag && c2.badge.text === 'Lead · OKUBO · Proposta' && c2.target.dealId === 'd-okubo');
ok('sem troca real (só recebido, sem anexo nem proposta): sem faixa', classifyThread({ participants: [{ email: 'x@nova.com.br' }], subject: 'Newsletter de outubro' }, empty).nag === null);
ok('anexo conta como troca real', classifyThread({ participants: [{ email: 'x@nova.com.br' }], hasAttachment: true, subject: 'oi' }, empty).nag === 'nova.com.br');
ok('palavra de proposta no assunto conta como troca real', classifyThread({ participants: [{ email: 'x@nova.com.br' }], subject: 'Orçamento de serviços' }, empty).nag === 'nova.com.br');
ok('conversa só interna: nada', (() => { const r = classifyThread({ participants: [me, { email: 'eduarda.costa@pricetax.com.br' }], teamReplied: true }, empty); return !r.nag && !r.badge && r.keys.length === 0; })());
const withTroia = classifyThread({ ...okuboThread, participants: [...okuboThread.participants, { email: 'joao@troiaconsultoria.onmicrosoft.com' }] }, buildDirectory({ marks }));
ok('Tróia (parceiro) em cópia não cala a faixa da OKUBO', withTroia.nag === 'okubo.com.br' && withTroia.badge.text === 'Parceiro · Tróia', withTroia);
ok('domínio ignorado: sem faixa', classifyThread({ participants: [{ email: 'a@spam.com.br' }], teamReplied: true }, dir).nag === null && classifyThread({ participants: [{ email: 'a@spam.com.br' }], teamReplied: true }, dir).ignored === true);
ok('cliente conhecido + desconhecido em cópia: sem faixa', classifyThread({ participants: [{ email: 'ana@kuhn.com.br' }, { email: 'auditor@outra.com.br' }], teamReplied: true }, dir).nag === null);

// Operações: selo sim, CRM não
const ops = linkForViewer(c2, { crm: false });
ok('Operações: selo sem etapa e sem ids do CRM', ops.badge.text === 'Lead · OKUBO' && ops.companyId === null && ops.dealId === null);
const soc = linkForViewer(c2, { crm: true });
ok('Sócio/Comercial: com negócio para abrir', soc.dealId === 'd-okubo' && soc.companyId === 'c-okubo');
ok('empresa do cronograma só aparece para quem acessa o projeto', linkForViewer(classifyThread({ participants: [{ email: 'ana@kuhn.com.br' }] }, dir), { crm: false, projectIds: new Set() }).projectId === null
  && linkForViewer(classifyThread({ participants: [{ email: 'ana@kuhn.com.br' }] }, dir), { crm: false, projectIds: new Set(['p-kuhn']) }).projectId === 'p-kuhn');

// chaves de uma empresa e agrupamento
const ks = keysOfCompany({ website: 'okubo.com.br', contactEmails: ['gerson.turola@okubo.com.br', 'fulano@gmail.com', 'rafael.souza@pricetax.com.br'] });
ok('chaves da empresa: site, domínio e e-mail público, sem a casa', ks.has('okubo.com.br') && ks.has('fulano@gmail.com') && ks.size === 2, [...ks]);
const g = groupRows([
  { id: 1, convKey: '<a@x>', userId: 'u1', userName: 'Rafael', lastAt: '2026-10-28T10:00:00Z', subject: 'Re: Planilha', msgCount: 5, participants: [{ email: 'gerson.turola@okubo.com.br' }] },
  { id: 2, convKey: '<a@x>', userId: 'u2', userName: 'Eduarda', lastAt: '2026-10-20T10:00:00Z', subject: 'Planilha', msgCount: 3, participants: [{ email: 'eduarda@pricetax.com.br' }] },
  { id: 3, convKey: '<b@x>', userId: 'u2', userName: 'Eduarda', lastAt: '2026-10-30T10:00:00Z', subject: 'Outra', msgCount: 1, participants: [] },
]);
ok('agrupa a mesma conversa das duas caixas e diz quem trocou', g.length === 2 && g[1].team.map((x) => x.userName).join(',') === 'Rafael,Eduarda' && g[1].participants.length === 2 && g[0].subject === 'Outra');

// fatos de uma conversa do Gmail
const H = (from, to, extra = []) => [{ name: 'From', value: from }, { name: 'To', value: to }, ...extra];
const facts = threadFacts({ id: 'thr1', messages: [
  { internalDate: '1760000000000', labelIds: ['INBOX'], payload: { headers: H('Gerson Turola <gerson.turola@okubo.com.br>', 'Eduarda <eduarda.costa@pricetax.com.br>', [{ name: 'Message-ID', value: '<ABC@okubo.com.br>' }, { name: 'Subject', value: 'Planilha para preenchimento - Proposta Comercial' }, { name: 'Cc', value: 'rafael.souza@pricetax.com.br' }]) } },
  { internalDate: '1760500000000', labelIds: ['SENT'], payload: { headers: H('rafael.souza@pricetax.com.br', 'gerson.turola@okubo.com.br') } },
] }, { headerMap, parseAddressList });
ok('fatos: participantes, resposta da equipe, chave da conversa e datas', facts.teamReplied && facts.convKey === '<abc@okubo.com.br>' && facts.participants.length === 3 && facts.msgCount === 2 && facts.lastAt > facts.firstAt, facts);
ok('fatos: sem Message-ID usa o id do Gmail', threadFacts({ id: 'thr9', messages: [] }, { headerMap, parseAddressList }).convKey === 't:thr9');

// quem lê o texto
ok('sócio lê qualquer conversa da equipe', canReadContent({ id: 'u9', workRole: 'socio' }, ['u1']));
ok('quem participou lê', canReadContent({ id: 'u1', workRole: 'comercial' }, ['u1', 'u2']));
ok('comercial que não participou não lê', !canReadContent({ id: 'u3', workRole: 'comercial' }, ['u1']));
ok('super admin lê', canReadContent({ id: 'x', isSuperAdmin: true }, []));

console.log(failed ? `\n${failed} falha(s)` : '\ntudo certo');
process.exit(failed ? 1 : 0);
