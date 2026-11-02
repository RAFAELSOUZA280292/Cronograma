// Caixa de e-mail (Fase 2): montagem do MIME, higiene do HTML de saída, citação, destinatários e assinatura. Puro.
//   node scripts/mail-compose.test.mjs
import {
  encodeHeaderWord, formatAddress, parseRecipients, qpEncode, base64Lines, sanitizeOutgoingHtml, htmlToText, replySubject,
  buildQuote, replyRecipients, cleanSignature, signatureHtml, signatureText, composeBody, buildMime, sizeError, attachmentsSize, LOGO_CID, MAX_ATTACH_BYTES,
} from '../server/mailCompose.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };

const decodeWords = (s) => s.replace(/\r\n /g, '').replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (m, b) => `\u0000${Buffer.from(b, 'base64').toString('binary')}`)
  .split('\u0000').join('');
const decodeRfc2047 = (s) => Buffer.from(decodeWords(s), 'binary').toString('utf8');
const qpDecode = (s) => Buffer.from(s.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'binary').toString('utf8');

// --- cabeçalhos
ok('assunto ASCII fica como está', encodeHeaderWord('Proposta 2027') === 'Proposta 2027');
const subj = 'Reunião de alinhamento — cronograma da Reforma Tributária (ação imediata) çãõé';
const enc = encodeHeaderWord(subj);
ok('assunto com acento vira RFC 2047 UTF-8 B', /^=\?UTF-8\?B\?/.test(enc));
ok('assunto codificado volta igual', decodeRfc2047(enc) === subj, decodeRfc2047(enc));
ok('cada palavra codificada cabe em 76 colunas', enc.split('\r\n ').every((w) => w.length <= 76));
ok('quebra de linha no assunto não injeta cabeçalho', !/\r\nBcc/i.test(encodeHeaderWord('Oi\r\nBcc: x@y.com')));
ok('nome ASCII entre aspas', formatAddress({ name: 'Souza, Rafael', email: 'r@x.com' }) === '"Souza, Rafael" <r@x.com>');
ok('nome com acento codificado', /^=\?UTF-8\?B\?.+\?= <joao@x\.com>$/.test(formatAddress({ name: 'João Ação', email: 'joao@x.com' })));
ok('sem nome = só e-mail', formatAddress({ name: '', email: 'a@b.com' }) === 'a@b.com');

const r = parseRecipients('Ana <ana@x.com>; bia@y.com, ANA@x.com, errado@, "Silva, C" <c@z.com.br>');
ok('destinatários: separa por ; e , e tira repetido', r.valid.length === 3 && r.valid[2].name === 'Silva, C', r);
ok('destinatários: aponta inválido', r.invalid.length === 1 && r.invalid[0] === 'errado@', r.invalid);
ok('destinatários: lista de objetos', parseRecipients([{ name: 'X', email: 'x@x.com' }]).valid.length === 1);

// --- codificação
const txt = 'Olá, ação = sim. '.repeat(20);
const qp = qpEncode(txt);
ok('quoted-printable: linhas de até 76', qp.split('\r\n').every((l) => l.length <= 76));
ok('quoted-printable: volta igual', qpDecode(qp) === txt);
ok('quoted-printable: espaço no fim da linha codificado', qpEncode('fim ') === 'fim=20');
ok('quoted-printable: só CRLF', !/[^\r]\n/.test(qpEncode('a\nb\r\nc')));
ok('base64 em linhas de 76', base64Lines(Buffer.alloc(300, 7)).split('\r\n').every((l) => l.length <= 76));

// --- HTML de saída
const dirty = '<p class="x" onclick="alert(1)">Oi <strong>Ana</strong></p><p></p><script>alert(1)</script><style>p{color:red}</style><ul><li>um</li></ul><a href="javascript:alert(1)">mal</a><a href="https://pricetax.com.br">site</a><img src="https://t.co/pixel.gif"><div style="display:flex">x</div>';
const out = sanitizeOutgoingHtml(dirty);
ok('saída: sem script/style/evento/classe', !/script|<style|onclick|class=/i.test(out), out);
ok('saída: parágrafo com estilo inline', out.includes('<p style="margin:0;padding:0">Oi <strong>Ana</strong></p>'));
ok('saída: parágrafo vazio vira linha em branco', out.includes('<p style="margin:0;padding:0"><br></p>'));
ok('saída: link perigoso perde o href', !/javascript:/i.test(out));
ok('saída: link bom com cor inline', /<a href="https:\/\/pricetax.com.br" target="_blank" style="color:#1155cc/.test(out));
ok('saída: sem imagem de rastreio nem flex', !/<img|flex/.test(out));
ok('texto puro: link vira "texto (url)"', htmlToText('<p>Veja <a href="https://x.com/a">o site</a></p><ul><li>um</li></ul>') === 'Veja o site (https://x.com/a)\n\n- um');

// --- assunto e destinatários da resposta
ok('Re: uma vez só', replySubject('RE: Proposta', 'reply') === 'RE: Proposta' && replySubject('Proposta', 'reply') === 'Re: Proposta');
ok('Enc: no encaminhamento', replySubject('Fwd: x', 'forward') === 'Fwd: x' && replySubject('Parecer', 'forward') === 'Enc: Parecer');
const original = {
  from: { name: 'Cliente', email: 'cli@empresa.com' }, replyTo: [],
  to: [{ name: 'Rafael', email: 'rafael@pricetax.com.br' }, { name: 'Ana', email: 'ana@pricetax.com.br' }],
  cc: [{ name: '', email: 'fin@empresa.com' }, { name: 'Cliente', email: 'CLI@empresa.com' }],
  date: '2026-11-02T13:15:00.000Z', subject: 'Dúvida <IBS>', html: '<p>Bom dia, <b>tudo</b> bem?</p><img src="cid:abc"><img src="https://x.com/i.png">', text: 'Bom dia, tudo bem?',
};
const rr = replyRecipients(original, 'rafael@pricetax.com.br', 'reply');
ok('responder: só o remetente', rr.to.length === 1 && rr.to[0].email === 'cli@empresa.com' && rr.cc.length === 0);
const ra = replyRecipients(original, 'rafael@pricetax.com.br', 'replyAll');
ok('responder a todos: tira eu e repetidos', ra.to.length === 1 && ra.cc.map((p) => p.email).join() === 'ana@pricetax.com.br,fin@empresa.com', ra);
ok('responder: Reply-To manda', replyRecipients({ ...original, replyTo: [{ name: '', email: 'resp@empresa.com' }] }, 'rafael@pricetax.com.br', 'reply').to[0].email === 'resp@empresa.com');
const mine = replyRecipients({ ...original, from: { name: 'Rafael', email: 'Rafael@pricetax.com.br' }, to: [{ name: 'C', email: 'cli@empresa.com' }], cc: [] }, 'rafael@pricetax.com.br', 'reply');
ok('responder à própria mensagem: vai para quem recebeu', mine.to.length === 1 && mine.to[0].email === 'cli@empresa.com');

// --- citação
const q = buildQuote(original, 'reply');
ok('citação: blockquote no estilo do Gmail', /<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #cccccc;padding-left:1ex">/.test(q.html));
ok('citação: linha "Em …, … escreveu:" em horário de Brasília', q.html.includes('Em 02/11/2026 às 10:15, Cliente &lt;cli@empresa.com&gt; escreveu:'), q.html.slice(0, 200));
ok('citação: sem imagem cid e imagem externa de volta', !/cid:/.test(q.html) && /src="https:\/\/x.com\/i.png"/.test(q.html));
ok('citação em texto com "> "', q.text.split('\n')[1] === '> Bom dia, tudo bem?');
const f = buildQuote(original, 'forward');
ok('encaminhar: bloco de cabeçalho', f.html.includes('---------- Mensagem encaminhada ---------') && f.html.includes('Assunto: Dúvida &lt;IBS&gt;') && f.html.includes('Cc: fin@empresa.com'));
ok('encaminhar: sem blockquote', !/<blockquote/.test(f.html));

// --- assinatura
const sig = cleanSignature({ name: 'Rafael Souza', role: 'Diretor <b>', phone: '(41) 3000-0000', email: 'rafael@pricetax.com.br', site: 'www.pricetax.com.br', extra: 'Curitiba\r\nPR' });
const sh = signatureHtml(sig);
ok('assinatura: tabela com Arial e sem classe/style tag', /^<table cellpadding="0" cellspacing="0" border="0"/.test(sh) && sh.includes('Arial,Helvetica') && !/class=|<style/.test(sh));
ok('assinatura: logo por CID com largura e altura fixas', sh.includes(`src="cid:${LOGO_CID}" width="140" height="40"`));
ok('assinatura: texto escapado', sh.includes('Diretor &lt;b&gt;') && !sh.includes('Diretor <b>'));
ok('assinatura: campo sem quebra de linha', sig.extra === 'Curitiba PR');
ok('assinatura: site vira link https', sh.includes('href="https://www.pricetax.com.br"'));
ok('assinatura sem logo', !/<img/.test(signatureHtml({ ...sig, logo: false })));
ok('assinatura vazia = nada', signatureHtml(cleanSignature({})) === '' && signatureText(cleanSignature({})) === '');

// --- corpo e MIME
const body = composeBody({ html: '<p>Segue o parecer.</p>', signature: sig, quote: q });
ok('corpo: documento sem <style> e sem classe', !/<style|class=/.test(body.html.replace(/<blockquote[\s\S]*<\/blockquote>/, '')));
ok('corpo: assinatura antes da citação', body.html.indexOf('Rafael Souza') < body.html.indexOf('<blockquote'));
ok('corpo: texto puro com "-- " e citação', body.text.startsWith('Segue o parecer.\n\n-- \nRafael Souza') && body.text.includes('> Bom dia'));
ok('corpo: usa o logo', body.usesLogo === true);

const mime = buildMime({
  from: { name: 'Rafael Souza', email: 'rafael@pricetax.com.br' },
  to: [{ name: 'Cliente Ação', email: 'cli@empresa.com' }], cc: [], bcc: [{ name: '', email: 'oculto@x.com' }],
  subject: 'Re: Dúvida', html: body.html, text: body.text,
  inReplyTo: '<abc@mail.gmail.com>', references: '<zzz@x> <abc@mail.gmail.com> lixo',
  inline: [{ cid: LOGO_CID, mimeType: 'image/png', data: Buffer.from('PNGDATA') }],
  attachments: [{ filename: 'Relatório ção.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4') }],
});
const lines = mime.split('\r\n');
ok('MIME: só CRLF', !/[^\r]\n/.test(mime));
ok('MIME: nenhuma linha passa de 998', lines.every((l) => l.length <= 998));
ok('MIME: corpo em linhas de até 76', lines.filter((l) => !/^(Content-|From|To|Subject|References|In-Reply|Date|MIME|Bcc|X-At|\s)/.test(l)).every((l) => l.length <= 76));
ok('MIME: estrutura mixed > alternative > related', /multipart\/mixed[\s\S]*multipart\/alternative[\s\S]*text\/plain[\s\S]*multipart\/related; boundary="[^"]+"; type="text\/html"[\s\S]*text\/html[\s\S]*Content-ID: <logo-pricetax@pricetax.com.br>[\s\S]*application\/pdf/.test(mime));
ok('MIME: texto antes do HTML (Outlook escolhe o último)', mime.indexOf('text/plain') < mime.indexOf('text/html'));
ok('MIME: charset UTF-8 e quoted-printable', /text\/html; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable/.test(mime));
ok('MIME: assunto e nome codificados', /^Subject: =\?UTF-8\?B\?/m.test(mime) && /^To: =\?UTF-8\?B\?.+\?= <cli@empresa.com>/m.test(mime));
ok('MIME: Bcc presente (o Gmail entrega e apaga)', /^Bcc: oculto@x.com$/m.test(mime));
ok('MIME: In-Reply-To e References limpos', /^In-Reply-To: <abc@mail.gmail.com>$/m.test(mime) && /^References: <zzz@x>\r\n <abc@mail.gmail.com>$/m.test(mime));
ok('MIME: nome do anexo com acento', /Content-Disposition: attachment; filename="=\?UTF-8\?B\?/.test(mime) && decodeRfc2047(mime.match(/filename="([^"]+)"/)[1]) === 'Relatório ção.pdf');
ok('MIME: logo inline sem nome de arquivo', /Content-ID: <logo-pricetax@pricetax.com.br>\r\nX-Attachment-Id: logo-pricetax\r\nContent-Disposition: inline\r\n\r\n/.test(mime));
const htmlQp = mime.split('Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n')[1].split('\r\n--')[0];
ok('MIME: HTML decodificado igual ao original', qpDecode(htmlQp) === body.html);
const bounds = [...mime.matchAll(/boundary="([^"]+)"/g)].map((m) => m[1]);
ok('MIME: cada boundary fecha', bounds.length === 3 && bounds.every((b) => mime.includes(`--${b}--`)));
const plain = buildMime({ from: { name: '', email: 'a@b.com' }, to: [{ name: '', email: 'c@d.com' }], subject: 'x', html: '<p>x</p>', text: 'x' });
ok('MIME simples: só alternative', /^Content-Type: multipart\/alternative/m.test(plain) && !/mixed|related/.test(plain));

// --- limite de anexos
ok('limite: 20 MB passa', sizeError(MAX_ATTACH_BYTES) === null);
ok('limite: acima dá erro em português', /limite é 20 MB/.test(sizeError(MAX_ATTACH_BYTES + 1)));
ok('tamanho soma buffers e metadados', attachmentsSize([{ data: Buffer.alloc(10) }, { size: 5 }]) === 15);

// Tipo Imagem × Texto e despedida livre (§116zzzzzzzzzz)
{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');
  const img = { mimeType: 'image/png', data: png, width: 480, height: 144, alt: 'Rafael Souza' };
  const old = cleanSignature({ name: 'Rafael' });
  ok('assinatura antiga continua texto', old.mode === 'text' && old.closing === '' && old.closingBold === false);
  const bi = cleanSignature({ mode: 'image', closing: 'Atenciosamente,', closingBold: true, name: 'Rafael', role: 'Sócio', image: img });
  const h = signatureHtml(bi);
  ok('imagem: despedida em negrito antes do banner', /<strong[^>]*>Atenciosamente,<\/strong>/.test(h) && h.indexOf('Atenciosamente,') < h.indexOf('cid:assinatura'));
  ok('imagem: sem campos nem logo', !/Rafael<\/strong>|Sócio|cid:logo/.test(h), h);
  ok('imagem: texto puro só despedida + alt', signatureText(bi) === 'Atenciosamente,\nRafael Souza');
  ok('imagem: não anexa o logo', composeBody({ html: '<p>x</p>', signature: bi, quote: null }).usesLogo === false);
  const plain = signatureHtml(cleanSignature({ mode: 'image', closing: 'Abraço,', image: img }));
  ok('despedida sem negrito', /Abraço,/.test(plain) && !/<strong[^>]*>Abraço/.test(plain));
  ok('tipo imagem sem banner cai no texto (nome aparece)', /Rafael/.test(signatureHtml(cleanSignature({ mode: 'image', name: 'Rafael' }))));
  const tx = signatureHtml(cleanSignature({ mode: 'text', closing: 'Att.,', name: 'Rafael' }));
  ok('texto: despedida antes do nome', tx.indexOf('Att.,') < tx.indexOf('Rafael'));
}

console.log(failed ? `\n${failed} verificação(ões) falharam.` : '\nTodas as verificações passaram.');

process.exit(failed ? 1 : 0);
