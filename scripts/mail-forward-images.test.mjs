// Encaminhar/responder com imagem embutida no original (§160): o e-mail que sai leva o print do corpo e o logo da assinatura.
// Roda a montagem real do envio (buildOutgoing, server/mail.js) com um Gmail falso — sem rede e sem banco (assinatura desligada).
import assert from 'node:assert/strict';
import { buildOutgoing, quotePreviewHtml } from '../server/mail.js';
import { buildQuote } from '../server/mailCompose.js';

const b64u = (s) => Buffer.from(s).toString('base64url');
const PRINT = 'PRINT-DA-PLANILHA-PNG', LOGO = 'LOGO-ALCAST-JPG';
const html = '<p>Rafa boa tarde,</p><p>o item grifado não conseguimos chegar...</p><img src="cid:image001.png@01DC4D1E.7A2B3C40" width="640"><p>Ana Paula Giacomet</p><img src="cid:image002.jpg@01DC4D1E.7A2B3C40">';
const payload = { mimeType: 'multipart/related', partId: '', headers: [
  { name: 'From', value: 'Ana Paula Giacomet <ana.paula@alcast.com.br>' }, { name: 'To', value: 'Rafael Souza <rafael.souza@pricetax.com.br>' },
  { name: 'Subject', value: 'Planilha Pricetax' }, { name: 'Message-ID', value: '<abc@alcast>' }],
  parts: [
    { partId: '0', mimeType: 'text/html', headers: [], body: { data: b64u(html), size: html.length } },
    { partId: '1', mimeType: 'image/png', filename: 'image001.png', headers: [{ name: 'Content-ID', value: '<image001.png@01DC4D1E.7A2B3C40>' }, { name: 'Content-Disposition', value: 'inline; filename="image001.png"' }], body: { attachmentId: 'ATT-PRINT', size: PRINT.length } },
    { partId: '2', mimeType: 'image/jpeg', filename: 'image002.jpg', headers: [{ name: 'Content-ID', value: '<image002.jpg@01DC4D1E.7A2B3C40>' }], body: { data: b64u(LOGO), size: LOGO.length } },
  ] };
let fetched = [];
const gmail = { users: {
  getProfile: async () => ({ data: { emailAddress: 'rafael.souza@pricetax.com.br' } }),
  messages: {
    get: async ({ id }) => ({ data: { id, threadId: 'th1', internalDate: String(Date.parse('2026-11-03T19:42:00Z')), payload } }),
    attachments: { get: async ({ id }) => { fetched.push(id); return { data: { data: b64u(id === 'ATT-PRINT' ? PRINT : 'x') } }; } },
  },
} };
const req = { user: { id: 'u-teste', name: 'Rafael Souza', orgId: 'x' } };
const decode = (raw) => String(raw);

for (const mode of ['forward', 'replyAll']) {
  fetched = [];
  const out = await buildOutgoing(req, gmail, { mode, messageId: 'MSG000001', to: 'Maiara Morais <maiara.morais@pricetax.com.br>', cc: '', bcc: '', subject: 'Enc: Planilha Pricetax', html: '<p>Maiara, segue.</p>', signature: false, includeQuote: true, forwardParts: [], attachments: [] });
  assert.ok(!out.status, `${mode}: montou (${out.message || ''})`);
  const mime = decode(out.raw);
  const cids = [...mime.matchAll(/Content-ID: <([^>]+)>/g)].map((m) => m[1]);
  assert.equal(cids.length, 2, `${mode}: as duas imagens do original vão embutidas`);
  for (const c of cids) assert.ok(mime.includes(`cid:${c}`) || mime.replace(/=\r\n/g, '').includes(`cid:${c}`), `${mode}: o corpo aponta para ${c}`);
  assert.ok(mime.includes(Buffer.from(PRINT).toString('base64')), `${mode}: bytes do print (buscados no Gmail pelo anexo)`);
  assert.ok(mime.includes(Buffer.from(LOGO).toString('base64')), `${mode}: bytes do logo (vindos no próprio corpo da parte)`);
  assert.deepEqual(fetched, ['ATT-PRINT'], `${mode}: só busca o que não veio junto`);
}
const noQuote = await buildOutgoing(req, gmail, { mode: 'forward', messageId: 'MSG000001', to: 'maiara.morais@pricetax.com.br', subject: 'x', html: '<p>x</p>', signature: false, includeQuote: false });
assert.ok(!/Content-ID/.test(decode(noQuote.raw)), 'sem citar a mensagem original, nenhuma imagem dela vai');
const orig = { id: 'MSG000001', from: { name: 'Ana', email: 'a@x.com' }, to: [], cc: [], date: null, subject: 'P', html, parts: [
  { partId: '1', id: 'ATT-PRINT', contentId: 'image001.png@01DC4D1E.7A2B3C40', mimeType: 'image/png' }, { partId: '2', id: null, contentId: 'image002.jpg@01DC4D1E.7A2B3C40', mimeType: 'image/jpeg' }] };
const prev = quotePreviewHtml(orig, buildQuote(orig, 'forward'));
assert.match(prev, /src="\/api\/mail\/messages\/MSG000001\/attachments\/ATT-PRINT\?inline=1&amp;type=image%2Fpng"/, 'prévia na janela de escrever mostra o print pela rota de anexo');
assert.ok(!/cid:/.test(prev), 'prévia sem cid: (o navegador não resolveria)');
console.log('mail-forward-images: tudo certo');
