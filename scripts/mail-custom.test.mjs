// Caixa de e-mail, pacote de personalização: cor da pasta (paleta do Gmail), cor/tamanho do texto, imagem colada no corpo
// embutida por Content-ID, imagem própria da assinatura e ordem da sugestão de destinatário. Rodar: node scripts/mail-custom.test.mjs
import assert from 'node:assert/strict';
import { LABEL_COLORS, labelColorFor } from '../shared/mailLabelColors.js';
import {
  cleanSpanStyle, sanitizeOutgoingHtml, extractInlineImages, restoreInlineImages, composeBody, buildMime, BODY_IMAGE_PREFIX,
  cleanSignature, cleanSignatureImage, signatureImageError, signatureHtml, SIG_IMAGE_CID, SIG_IMAGE_MAX_BYTES, rankContacts, MAX_IMAGE_WIDTH,
} from '../server/mailCompose.js';
import { fitSize, base64Bytes, htmlImageBytes, clipboardFiles, isImageFile } from '../src/mail/mailImage.js';
import { isBlockedName, zipEntryNames, blockReason, fileExtension } from '../shared/mailAttachments.js';
import { attachmentBlockReason } from '../server/mailCompose.js';
import { friendlyMailError } from '../server/googleMail.js';

// .zip mínimo (sem compressão) com os nomes dados — para conferir a leitura do diretório central sem ferramenta de fora.
function makeZip(names) {
  const locals = []; const centrals = []; let off = 0;
  for (const name of names) {
    const n = Buffer.from(name); const data = Buffer.from('x');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(n.length, 26); lh.writeUInt32LE(1, 18); lh.writeUInt32LE(1, 22);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data); centrals.push(ch, n); off += 30 + n.length + 1;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

ok('cor da pasta: só a paleta do Gmail passa; vazio/null tira a cor; ausente não mexe', () => {
  assert.equal(LABEL_COLORS.length, 12);
  assert.deepEqual(labelColorFor('#4A86E8'), { backgroundColor: '#4a86e8', textColor: '#ffffff' });
  assert.deepEqual(labelColorFor('#fad165'), { backgroundColor: '#fad165', textColor: '#000000' });
  assert.equal(labelColorFor('#123456'), false);
  assert.equal(labelColorFor('red'), false);
  assert.equal(labelColorFor(null), null);
  assert.equal(labelColorFor(''), null);
  assert.equal(labelColorFor(undefined), undefined);
  for (const c of LABEL_COLORS) assert.match(c.bg + c.text, /^#[0-9a-f]{6}#[0-9a-f]{6}$/);
});

ok('estilo do texto: cor (#hex, #abc ou rgb) e tamanho de 10 a 32 px; o resto sai', () => {
  assert.equal(cleanSpanStyle('color: #CC0000'), 'color:#cc0000');
  assert.equal(cleanSpanStyle('color: #c00'), 'color:#cc0000');
  assert.equal(cleanSpanStyle('color: rgb(17, 85, 204); font-size: 18px'), 'color:#1155cc;font-size:18px;line-height:1.4');
  assert.equal(cleanSpanStyle('font-size: 12px'), 'font-size:12px;line-height:1.4');
  assert.equal(cleanSpanStyle('font-size: 72px; background: url(http://x/y.png); position: fixed'), '');
  assert.equal(cleanSpanStyle('color: expression(alert(1))'), '');
  const out = sanitizeOutgoingHtml('<p><span style="color: rgb(204, 0, 0); background-color: yellow">alerta</span></p>');
  assert.match(out, /<span style="color:#cc0000">alerta<\/span>/);
  assert.doesNotMatch(out, /yellow/);
});

ok('imagem no corpo: só embutida (cid:/data:), largura no máximo 600 px com altura proporcional', () => {
  const out = sanitizeOutgoingHtml(`<p>a</p><img src="data:image/png;base64,${PNG}" width="1200" height="400" alt="print"><img src="https://rastreador.com/p.gif"><img src="javascript:alert(1)"><img src="cid:img-1-aa@pricetax.com.br">`);
  assert.match(out, new RegExp(`<img src="data:image/png;base64,${PNG.replace(/[+/=]/g, '\\$&')}" alt="print" style="[^"]*width:${MAX_IMAGE_WIDTH}px" width="600" height="200" />`));
  assert.doesNotMatch(out, /rastreador|javascript/);
  assert.match(out, /src="cid:img-1-aa@pricetax.com.br"/);
  assert.equal((out.match(/<img /g) || []).length, 2);
});

ok('imagem colada vira parte embutida (multipart/related + Content-ID) e o rascunho reabre com data:', () => {
  const html = `<p>Segue o print:</p><img src="data:image/png;base64,${PNG}" width="300" height="100">`;
  const ex = extractInlineImages(html);
  assert.equal(ex.images.length, 1);
  assert.ok(ex.images[0].cid.startsWith(BODY_IMAGE_PREFIX));
  assert.equal(ex.images[0].mimeType, 'image/png');
  assert.doesNotMatch(ex.html, /data:/);
  const body = composeBody({ html, signature: null, quote: null });
  assert.equal(body.images.length, 1);
  assert.match(body.html, new RegExp(`src="cid:${body.images[0].cid}"`));
  const raw = buildMime({ from: { name: 'R', email: 'r@pricetax.com.br' }, to: [{ name: '', email: 'a@b.com' }], subject: 'x', html: body.html, text: body.text, inline: body.images });
  assert.match(raw, /multipart\/related/);
  assert.ok(raw.includes(`Content-ID: <${body.images[0].cid}>`));
  const back = restoreInlineImages(body.html, body.images);
  assert.ok(back.includes(`src="data:image/png;base64,${PNG}"`));
  assert.ok(restoreInlineImages('<img src="cid:outro@x">', body.images).includes('cid:outro@x'));
});

ok('imagem própria da assinatura: tipo, tamanho e largura conferidos; mensagem clara quando recusa', () => {
  const good = { mimeType: 'image/png', data: PNG, width: 200, height: 60 };
  assert.deepEqual(cleanSignatureImage(good), { ...good, alt: '' });
  assert.equal(cleanSignatureImage({ ...good, mimeType: 'image/svg+xml' }), null);
  assert.equal(cleanSignatureImage({ ...good, width: 900 }), null);
  const big = Buffer.alloc(SIG_IMAGE_MAX_BYTES + 1).toString('base64');
  assert.equal(cleanSignatureImage({ ...good, data: big }), null);
  assert.match(signatureImageError({ ...good, data: big }), /200 KB/);
  assert.match(signatureImageError({ ...good, mimeType: 'image/webp' }), /PNG, JPG ou GIF/);
  assert.match(signatureImageError({ ...good, width: 10 }), /entre 40 e 600 px/);
  assert.equal(signatureImageError(good), null);
  assert.equal(signatureImageError(null), null);
});

ok('assinatura com imagem: largura fixa em atributo, posição antes do nome ou no fim, embutida por cid', () => {
  const sig = cleanSignature({ name: 'Rafael Souza', email: 'r@pricetax.com.br', image: { mimeType: 'image/png', data: PNG, width: 200, height: 60 } });
  assert.equal(sig.imagePos, 'bottom');
  const html = signatureHtml(sig);
  assert.ok(html.includes(`src="cid:${SIG_IMAGE_CID}" width="200" height="60"`));
  assert.ok(html.indexOf('Rafael Souza') < html.indexOf(SIG_IMAGE_CID));
  const top = signatureHtml({ ...sig, imagePos: 'top' });
  assert.ok(top.indexOf(SIG_IMAGE_CID) < top.indexOf('Rafael Souza'));
  const preview = signatureHtml(sig, { logoSrc: '/logo.png', imageSrc: `data:image/png;base64,${PNG}` });
  assert.ok(preview.includes('data:image/png;base64,'));
  const body = composeBody({ html: '<p>oi</p>', signature: sig, quote: null });
  assert.equal(body.usesSigImage, true);
  assert.equal(composeBody({ html: '<p>oi</p>', signature: { ...sig, image: null }, quote: null }).usesSigImage, false);
  const onlyImage = cleanSignature({ image: { mimeType: 'image/png', data: PNG, width: 120, height: 40 } });
  assert.ok(signatureHtml(onlyImage).includes(SIG_IMAGE_CID), 'assinatura só com imagem também vale');
});

ok('sugestão de destinatário: "ra" traz primeiro quem começa com ra, depois palavra que começa, depois "contém"', () => {
  const list = [
    { name: 'Clara Dias', email: 'clara@cliente.com' },
    { name: 'Ana Ramos', email: 'ana@cliente.com' },
    { name: 'Rafael Souza', email: 'rafael.souza@pricetax.com.br' },
    { name: '', email: 'rafa@outro.com' },
    { name: 'Bruno', email: 'bruno@empresa.com' },
    { name: 'Rafaela Lima', email: 'rl@x.com' },
  ];
  const r = rankContacts(list, 'Ra').map((c) => c.email);
  assert.deepEqual(r, ['rafael.souza@pricetax.com.br', 'rafa@outro.com', 'rl@x.com', 'ana@cliente.com', 'clara@cliente.com']);
  assert.deepEqual(rankContacts([{ name: 'Érica', email: 'e@x.com' }], 'eri').map((c) => c.email), ['e@x.com'], 'sem acento acha com acento');
  assert.equal(rankContacts(list, 'ra', 2).length, 2);
  assert.deepEqual(rankContacts(list, ''), []);
});

ok('imagens na tela: proporção, bytes do base64 e soma das imagens do texto', () => {
  assert.deepEqual(fitSize(1200, 800, 600), { width: 600, height: 400 });
  assert.deepEqual(fitSize(300, 100, 600), { width: 300, height: 100 });
  assert.deepEqual(fitSize(0, 100, 600), { width: 0, height: 0 });
  assert.equal(base64Bytes(Buffer.alloc(10).toString('base64')), 10);
  assert.equal(base64Bytes(Buffer.alloc(11).toString('base64')), 11);
  const b64 = Buffer.alloc(1000).toString('base64');
  assert.equal(htmlImageBytes(`<p>x</p><img src="data:image/png;base64,${b64}"><img src="data:image/jpeg;base64,${b64}">`), 2000);
});

ok('anexos: PDF, zip, rar e planilha passam; .exe/.js/.bat e .zip com programa dentro são recusados com frase clara', () => {
  for (const f of ['proposta.pdf', 'base.zip', 'notas.rar', 'planilha.xlsx', 'foto.HEIC', 'arquivo.7z', 'sem-extensao']) assert.equal(isBlockedName(f), false, f);
  for (const f of ['setup.exe', 'SCRIPT.JS', 'roda.bat', 'instalar.msi', 'x.ps1']) assert.equal(isBlockedName(f), true, f);
  assert.equal(fileExtension('a.tar.gz'), 'gz');
  assert.match(blockReason('setup.exe'), /bloqueia arquivos \.exe.*Google Drive/);
  const ok = makeZip(['docs/contrato.pdf', 'notas.xml']);
  assert.deepEqual(zipEntryNames(ok), ['docs/contrato.pdf', 'notas.xml']);
  assert.equal(blockReason('pacote.zip', ok), null);
  const bad = makeZip(['leia.txt', 'bin/instalador.exe']);
  assert.match(blockReason('pacote.zip', new Uint8Array(bad)), /“pacote.zip” tem “instalador.exe” dentro.*Google Drive/);
  assert.match(attachmentBlockReason({ filename: 'pacote.zip', data: bad }), /instalador\.exe/);
  assert.equal(attachmentBlockReason({ filename: 'notas.rar', data: Buffer.from('Rar!') }), null);
  assert.deepEqual(zipEntryNames(Buffer.from('não é zip')), []);
  assert.deepEqual(zipEntryNames(bad.subarray(0, 40)), [], 'zip cortado não quebra');
});

ok('erro do Gmail por anexo bloqueado vira orientação em português; falta de permissão continua sendo "conectar"', () => {
  assert.match(friendlyMailError({ code: 400, message: 'Message blocked: attachment contains a potential security issue' }), /bloqueou um dos anexos.*Google Drive/);
  assert.match(friendlyMailError({ code: 403, message: 'Request had insufficient authentication scopes.' }), /Conectar o Gmail/);
  assert.match(friendlyMailError({ code: 413, message: 'Request too large' }), /grande demais/);
});

ok('colar: arquivos vêm de `files` ou, se vazio, dos itens do tipo arquivo; print é imagem, PDF não', () => {
  const png = { name: 'image.png', type: 'image/png' }; const pdf = { name: 'a.pdf', type: 'application/pdf' };
  assert.deepEqual(clipboardFiles({ files: [png, pdf], items: [] }), [png, pdf]);
  assert.deepEqual(clipboardFiles({ files: [], items: [{ kind: 'string' }, { kind: 'file', getAsFile: () => png }] }), [png]);
  assert.deepEqual(clipboardFiles(null), []);
  assert.equal(isImageFile(png), true);
  assert.equal(isImageFile(pdf), false);
  assert.equal(isImageFile({ type: 'image/svg+xml' }), false, 'SVG não entra no corpo (vira anexo)');
});

console.log(`\n${n} verificações do pacote de personalização passaram.`);
