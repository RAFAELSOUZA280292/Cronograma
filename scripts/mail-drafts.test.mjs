// Caixa de e-mail, pacote de produtividade: rascunho reabrível (cabeçalho próprio + texto entre marcadores). Puro.
//   node scripts/mail-drafts.test.mjs
import { composeBody, buildMime, draftMeta, parseDraftMeta, draftBodyHtml, DRAFT_HEADER } from '../server/mailCompose.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };

const meta = draftMeta({ mode: 'replyAll', messageId: '18c0abcDEF123', includeQuote: false, signature: true });
ok('cabeçalho do rascunho só tem caracteres seguros', /^[A-Za-z0-9_-]+$/.test(meta), meta);
const back = parseDraftMeta(meta);
ok('cabeçalho volta igual', back.mode === 'replyAll' && back.messageId === '18c0abcDEF123' && back.includeQuote === false && back.signature === true, back);
ok('novo não guarda mensagem original', parseDraftMeta(draftMeta({ mode: 'new', messageId: 'x123456' })).messageId === '');
ok('modo desconhecido vira novo', parseDraftMeta(draftMeta({ mode: 'hack' })).mode === 'new');
ok('cabeçalho quebrado não derruba', parseDraftMeta('%%%') === null && parseDraftMeta('') === null);

const sig = { enabled: true, name: 'Rafael Souza', role: 'Sócio', email: 'r@pricetax.com.br', logo: false };
const quote = { html: '<blockquote>texto antigo</blockquote>', text: '> texto antigo' };
const body = composeBody({ html: '<p>Olá, <strong>Ana</strong></p>', signature: sig, quote });
ok('reabrir pega só o texto da pessoa (sem assinatura e citação)', draftBodyHtml(body.html).includes('<strong>Ana</strong>') && !draftBodyHtml(body.html).includes('Rafael Souza') && !draftBodyHtml(body.html).includes('texto antigo'), draftBodyHtml(body.html));
ok('rascunho vazio reabre vazio', draftBodyHtml(composeBody({ html: '', signature: null, quote: null }).html) === '');
ok('rascunho feito no Gmail (sem marcador) reabre o corpo inteiro', draftBodyHtml('<html><body><div>escrito no Gmail</div></body></html>') === '<div>escrito no Gmail</div>');

const raw = buildMime({ from: { name: 'R', email: 'r@pricetax.com.br' }, to: [], subject: 'Rascunho', html: body.html, text: body.text, headers: [[DRAFT_HEADER, meta], ['X-Ruim\r\nBcc: a@b.c', 'x'], ['Bcc', 'injetado@x.com']] });
ok('cabeçalho do rascunho entra no MIME', raw.includes(`${DRAFT_HEADER}: ${meta}\r\n`));
ok('cabeçalho com nome inválido ou que não é X- não entra (sem injeção)', !/X-Ruim/.test(raw) && !/injetado@x\.com/.test(raw));
ok('rascunho sem destinatário não gera linha To vazia', !/^To:/m.test(raw));
const evil = buildMime({ from: { name: 'R', email: 'r@p.com' }, to: [], subject: 's', html: '', text: '', headers: [[DRAFT_HEADER, 'abc\r\nBcc: espiao@x.com']] });
ok('valor com quebra de linha não injeta cabeçalho', !/^Bcc: espiao/m.test(evil));

console.log(failed ? `${failed} falharam` : 'todos passaram');
process.exit(failed ? 1 : 0);
