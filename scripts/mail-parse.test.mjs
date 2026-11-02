// Caixa de e-mail (Fase 1): leitura das partes MIME, endereços, pastas e higienização do HTML recebido. Puro.
//   node scripts/mail-parse.test.mjs
import { parseAddressList, walkParts, sanitizeMailHtml, folderQuery, threadSummary, decodeBody, textToHtml } from '../server/googleMail.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };
const b64 = (s, enc = 'utf8') => Buffer.from(s, enc).toString('base64url');

const a = parseAddressList('"Souza, Rafael" <rafael@pricetax.com.br>, ana@x.com, Bia <bia@y.com>');
ok('endereços: vírgula dentro de aspas', a.length === 3 && a[0].name === 'Souza, Rafael' && a[0].email === 'rafael@pricetax.com.br', a);
ok('endereços: só e-mail', a[1].name === '' && a[1].email === 'ana@x.com');
ok('endereços: vazio', parseAddressList('').length === 0);

ok('charset latin1 (comum em e-mail brasileiro)', decodeBody(b64('Atenção', 'latin1'), 'iso-8859-1') === 'Atenção');
ok('charset desconhecido cai em utf-8', decodeBody(b64('ação'), 'x-nada') === 'ação');

const payload = {
  mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=UTF-8' }], body: { data: b64('Olá texto') } },
      { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }], body: { data: b64('<p>Olá <img src="cid:logo@x"></p>') } },
    ] },
    { mimeType: 'image/png', filename: '', headers: [{ name: 'Content-ID', value: '<logo@x>' }, { name: 'Content-Disposition', value: 'inline' }], body: { attachmentId: 'ATT1', size: 10 } },
    { mimeType: 'application/pdf', filename: 'Parecer.pdf', headers: [{ name: 'Content-Disposition', value: 'attachment; filename="Parecer.pdf"' }], body: { attachmentId: 'ATT2', size: 2048 } },
  ],
};
const w = walkParts(payload);
ok('MIME: html e texto', w.html.includes('Olá') && w.text === 'Olá texto');
ok('MIME: imagem embutida marcada como inline', w.attachments.find((x) => x.id === 'ATT1').inline === true);
ok('MIME: PDF é anexo de verdade', w.attachments.find((x) => x.id === 'ATT2').inline === false && w.attachments.find((x) => x.id === 'ATT2').filename === 'Parecer.pdf');

const dirty = `<html><head><style>body{background:url(https://rastreio/x.gif)}</style><title>t</title></head><body>
  <script>alert(1)</script><p onclick="x()" style="color:red">Oi</p>
  <a href="javascript:alert(1)">ruim</a><a href="https://pricetax.com.br">bom</a>
  <img src="https://rastreio.com/pixel.gif" width="1"><img src="cid:logo@x"><img src="cid:nao-existe">
  <div style="background-image:url('https://rastreio/y.png')">fundo</div>
  <iframe src="https://x"></iframe><form action="https://x"><input name="senha"></form>
  <table cellpadding="0" bgcolor="#fff"><tr><td>célula</td></tr></table></body></html>`;
const s = sanitizeMailHtml(dirty, { cidUrl: (cid) => (cid === 'logo@x' ? '/api/mail/messages/M/attachments/ATT1?inline=1' : null) });
ok('limpa: sem script, iframe, form, input', !/<script|<iframe|<form|<input|alert\(1\)/i.test(s.html), s.html);
ok('limpa: sem evento onclick e sem javascript:', !/onclick|javascript:/i.test(s.html));
ok('limpa: <style> com rastreio sai', !/rastreio\/x\.gif/.test(s.html));
ok('limpa: estilo com url() sai, cor fica', !/url\(/i.test(s.html) && /color:red/.test(s.html), s.html);
ok('limpa: link abre em nova aba sem opener', /href="https:\/\/pricetax\.com\.br" target="_blank" rel="noopener noreferrer"/.test(s.html));
ok('imagem externa presa em data-pt-src e contada', s.remoteImages === 1 && /data-pt-src="https:\/\/rastreio\.com\/pixel\.gif"/.test(s.html) && !/src="https:\/\/rastreio\.com/.test(s.html.replace(/data-pt-src/g, '')));
ok('imagem cid vira endereço do anexo', s.html.includes('/api/mail/messages/M/attachments/ATT1?inline=1'));
ok('tabela de layout preservada', /<table cellpadding="0" bgcolor="#fff">/.test(s.html));

ok('pasta Entrada', JSON.stringify(folderQuery('INBOX', '')) === JSON.stringify({ labelIds: ['INBOX'], q: undefined, includeSpamTrash: false }));
ok('pasta Arquivo usa pesquisa', folderQuery('ARCHIVE', '').q.includes('-in:inbox') && !folderQuery('ARCHIVE', '').labelIds);
ok('pasta Lixeira inclui lixeira', folderQuery('TRASH', 'x').includeSpamTrash === true && folderQuery('TRASH', 'x').q === 'x');
ok('marcador do usuário', folderQuery('Label_12', '').labelIds[0] === 'Label_12');
ok('pasta inválida não vira marcador arbitrário', folderQuery('CATEGORY_X; drop', '').labelIds[0] === 'INBOX');
ok('busca sem pasta procura em tudo', folderQuery('', 'nota fiscal').labelIds === undefined && folderQuery('', 'nota fiscal').q === 'nota fiscal');

const th = threadSummary({ id: 'T1', messages: [
  { labelIds: ['INBOX'], internalDate: '1730000000000', snippet: 'a', payload: { headers: [{ name: 'From', value: 'Ana <ana@x.com>' }, { name: 'Subject', value: 'Proposta' }] } },
  { labelIds: ['SENT'], internalDate: '1730000100000', snippet: 'resposta &amp; ok', payload: { headers: [{ name: 'From', value: 'Rafael <r@p.com>' }, { name: 'To', value: 'ana@x.com' }] } },
  { labelIds: ['INBOX', 'UNREAD', 'STARRED'], internalDate: '1730000200000', snippet: 'c', payload: { mimeType: 'multipart/mixed', headers: [{ name: 'From', value: 'Ana <ana@x.com>' }], parts: [{ mimeType: 'application/pdf', filename: 'x.pdf', body: { attachmentId: 'A', size: 1 } }] } },
] });
ok('resumo: assunto do primeiro, data do último', th.subject === 'Proposta' && th.date === new Date(1730000200000).toISOString());
ok('resumo: não lido, estrela, anexo, contagem', th.unread && th.starred && th.hasAttachment && th.count === 3);
ok('resumo: participantes sem repetir, "Eu" para enviados', th.from.length === 2 && th.from[1].name === 'Eu', th.from);
ok('texto puro vira HTML escapado com link', textToHtml('<b> https://a.com/x').includes('&lt;b&gt;') && textToHtml('https://a.com/x').includes('href="https://a.com/x"'));

console.log(failed ? `${failed} falharam` : 'todos passaram');
process.exit(failed ? 1 : 0);
