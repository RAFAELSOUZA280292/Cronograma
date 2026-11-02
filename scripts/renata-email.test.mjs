// RENATA lê e-mail (§125): texto limpo, corte, histórico citado, recusa sem Gmail, só a caixa de quem pede, nada no registro e cartão
// em toda gravação depois de ler e-mail no mesmo pedido. Puro (Gmail e banco simulados).
//   node scripts/renata-email.test.mjs
import { htmlToText, stripQuoted, clip, searchParams, threadForRenata, mailRefusal, auditThread, CONNECT_HINT, MSG_MAX } from '../server/renata/mailRead.js';
import { registerEmail } from '../server/renata/tools/email.js';
import { createRegistry } from '../server/renata/registry.js';
import { createExecutor, UNTRUSTED_READ } from '../server/renata/executor.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');

// limpeza
const t = htmlToText('<style>p{color:red}</style><p>Olá&nbsp;Gerson,</p><div>Segue a <b>planilha</b> &amp; proposta.<br>Abs</div><script>alert(1)</script><img src="https://x/p.png">');
ok('limpeza: sem tags, estilo nem script', !/[<>]/.test(t) && !/color|alert/.test(t), t);
ok('limpeza: entidades e quebras de linha', t === 'Olá Gerson,\nSegue a planilha & proposta.\nAbs', t);
ok('histórico citado (Outlook "De:/Enviado:") sai', stripQuoted('Recebido, obrigado.\n\nDe: Gerson Turola <g@okubo.com.br>\nEnviado: 22 de outubro\nAssunto: x\ntexto antigo') === 'Recebido, obrigado.');
ok('histórico citado (Gmail "Em … escreveu:") sai', stripQuoted('Combinado.\nEm qua., 22 de out. de 2026 às 10:00, Rafael <r@p.com> escreveu:\n> antigo') === 'Combinado.');
ok('histórico citado (Outlook em português "De:/Enviada em:") sai', stripQuoted('Envio assim que possível.\n\nDe: Eduarda <e@p.com>\nEnviada em: terça-feira, 20 de outubro de 2026 14:46\nPara: x') === 'Envio assim que possível.');
ok('histórico citado (Gmail "Em … escreveu:" em duas linhas) sai', stripQuoted('Fico no aguardo.\n\nEm qui., 22 de out. de 2026 às 08:53, Fulano <\nfulano@x.com.br> escreveu:\n\n> antigo') === 'Fico no aguardo.');
ok('sobras de assinatura (ícones e mailto) saem', stripQuoted('Abs,\n[https://x.com/icones/facebook.png]<https://www.facebook.com/x/>\n<https://www.x.com/>\nfulano@x.com<mailto:fulano@x.com>') === 'Abs,\nfulano@x.com');
ok('histórico citado: linhas com ">" saem', stripQuoted('Novo\n> velho\n> velho 2') === 'Novo');

// corte
const longo = 'Frase de teste. '.repeat(600);
const c = clip(longo, MSG_MAX);
ok('corte: respeita o limite e avisa', c.length <= MSG_MAX + 20 && c.endsWith('[texto cortado]'), c.length);
ok('corte: texto curto fica igual', clip('curto', 50) === 'curto');
const sp = searchParams('  okubo\nfrom:@okubo.com.br ', 500);
ok('busca: uma linha e limite máximo de 20', sp.query === 'okubo from:@okubo.com.br' && sp.n === 20, sp);
ok('busca: limite padrão 10', searchParams('x').n === 10);

const msg = (id, from, ms, text, extra = {}) => ({ id, internalDate: String(ms), labelIds: extra.labels || [], payload: { mimeType: 'multipart/mixed', headers: [{ name: 'From', value: from }, { name: 'To', value: 'Rafael <rafael.souza@pricetax.com.br>' }, { name: 'Cc', value: 'Eduarda Costa <eduarda@pricetax.com.br>' }, { name: 'Subject', value: 'Planilha para preenchimento - Proposta Comercial' }],
  parts: [{ mimeType: 'text/plain', headers: [], body: { data: b64(text) } }, { mimeType: 'application/vnd.ms-excel', filename: 'planilha.xlsx', headers: [], body: { attachmentId: 'ANEXO1', size: 9999 } }] } });
const thread = { id: 'thr0001', messages: [
  msg('m1', 'Gerson Turola <gerson.turola@okubo.com.br>', Date.UTC(2026, 9, 22, 13), 'Antiga. '.repeat(3000)),
  msg('m2', 'Rafael <rafael.souza@pricetax.com.br>', Date.UTC(2026, 9, 28, 17, 30), 'Gerson, aguardamos a planilha.\n\nDe: Gerson\nEnviado: ontem\nhistórico', { labels: ['SENT'] }),
] };
const r = threadForRenata(thread, { totalMax: 2000 });
ok('conversa: anexo só pelo nome (nada binário)', r.mensagens[0].anexos[0] === 'planilha.xlsx' && !JSON.stringify(r).includes('ANEXO1'));
ok('conversa: a mais recente fica inteira e sem histórico', r.mensagens[1].texto === 'Gerson, aguardamos a planilha.' && r.mensagens[1].enviadaPorMim);
ok('conversa: total respeita o teto (a antiga é resumida)', JSON.stringify(r.mensagens.map((m) => m.texto)).length < 2600 && /\[/.test(r.mensagens[0].texto), r.mensagens[0].texto.length);
ok('conversa: data em Brasília', r.mensagens[1].data.includes('28/10/2026') && r.mensagens[1].data.includes('14:30'), r.mensagens[1].data);
ok('conversa: aviso de que é dado, não instrução', /nunca instrução/.test(r.aviso));
ok('registro permanente sem o conteúdo', !JSON.stringify(auditThread(r)).includes('aguardamos'));

// recusa sem Gmail
ok('sem Google configurado', mailRefusal({ configured: false }).json.code === 'mail_not_configured');
ok('sem Gmail conectado: orienta a conectar', mailRefusal({ configured: true, connected: false, mail: false }).json.message === CONNECT_HINT && /Conectar o Gmail/.test(CONNECT_HINT));
ok('Gmail conectado sem escopo de e-mail: orienta a conectar', mailRefusal({ configured: true, connected: true, mail: false }).status === 409);
ok('Gmail conectado: sem recusa', mailRefusal({ configured: true, connected: true, mail: true }) === null);

// ferramentas: só a caixa de quem pede; recusa; nada no registro; cartão depois de ler e-mail
const asked = [];
const fakeGmail = { users: { threads: {
  list: async (p) => ({ data: { threads: [{ id: 'thr0001' }], resultSizeEstimate: 1, q: p.q } }),
  get: async () => ({ data: thread }),
} } };
const reg = createRegistry();
registerEmail(reg, {
  mailStatus: async (uid) => { asked.push(uid); return uid === 'sem-gmail' ? { configured: true, connected: false, mail: false } : { configured: true, connected: true, mail: true }; },
  gmailFor: async (uid) => { asked.push(uid); return { gmail: fakeGmail }; },
});
reg.add({ module: 'CRM', name: 'crm_teste_gravar', summary: 'teste', risk: 'write', params: { type: 'object', properties: { x: { type: 'string' } }, required: [] }, run: async () => ({ status: 200, json: { ok: true } }) });
const rows = [];
const pool = { query: async (sql, params) => {
  if (/^INSERT INTO renata_actions/i.test(sql.trim())) { rows.push({ id: params[0], sql, params }); return { rows: [] }; }
  if (/^UPDATE renata_actions/i.test(sql.trim())) { rows.push({ id: params[0], sql, params }); return { rows: [] }; }
  return { rows: [] };
} };
const ex = createExecutor({ pool, registry: reg });
const staff = { id: 'u-rafael', orgId: 'o1', role: 'pricetax', name: 'Rafael' };
const client = { id: 'u-cli', orgId: 'o1', role: 'client', name: 'Cliente' };

ok('cliente não vê as ferramentas de e-mail', !reg.forModel(client).some((x) => x.name.startsWith('email_')) && reg.forModel(staff).some((x) => x.name === 'email_buscar'));
const sem = await ex.executeTool({ user: { ...staff, id: 'sem-gmail' }, orgId: 'o1', turnWrites: new Map() }, 'email_buscar', { consulta: 'okubo' });
ok('ferramenta sem Gmail: recusa com a orientação', !sem.ok && /Conectar o Gmail/.test(sem.error), sem);
asked.length = 0;
const turn = new Map();
const busca = await ex.executeTool({ user: staff, orgId: 'o1', turnWrites: turn }, 'email_buscar', { consulta: 'from:@okubo.com.br', limite: 5 });
ok('busca: acha a conversa', busca.ok && busca.data.conversas[0].conversaId === 'thr0001' && busca.data.conversas[0].assunto.startsWith('Planilha'), busca);
ok('busca: usa só o Gmail de quem pediu', asked.length > 0 && asked.every((u) => u === 'u-rafael'), asked);
const leitura = await ex.executeTool({ user: staff, orgId: 'o1', turnWrites: turn }, 'email_ler_conversa', { conversaId: 'thr0001' });
ok('leitura: texto inteiro chega à RENATA (sem o corte de 700 do compact)', leitura.ok && leitura.data.mensagens.length === 2 && leitura.data.mensagens[0].texto.length > 700, leitura.data && leitura.data.mensagens[0].texto.length);
const gravado = JSON.stringify(rows.map((x) => x.params));
ok('registro de auditoria sem o texto do e-mail', !gravado.includes('aguardamos') && !gravado.includes('Antiga.') && gravado.includes('não guardado no registro'));
ok('marca no pedido que leu conteúdo externo', turn.get(UNTRUSTED_READ) === true);
const grava = await ex.executeTool({ user: staff, orgId: 'o1', turnWrites: turn }, 'crm_teste_gravar', { x: '1' });
ok('gravar depois de ler e-mail no mesmo pedido pede cartão', grava.status === 'needs_confirmation' && /e-mail/.test(grava.preview), grava);
const livre = await ex.executeTool({ user: staff, orgId: 'o1', turnWrites: new Map() }, 'crm_teste_gravar', { x: '2' });
ok('sem e-mail no pedido, gravação simples segue direto', livre.status === 'success', livre);
const idRuim = await ex.executeTool({ user: staff, orgId: 'o1', turnWrites: new Map() }, 'email_ler_conversa', { conversaId: '../x' });
ok('id de conversa inválido é recusado', !idRuim.ok);

console.log(failed ? `\n${failed} falha(s)` : '\nrenata-email: tudo ok');
process.exit(failed ? 1 : 0);
