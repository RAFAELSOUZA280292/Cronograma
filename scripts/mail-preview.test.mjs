// Pré-visualização de anexos do e-mail (§166): tipo pelo nome e pelo MIME, conversão de Word/Excel/CSV/texto, imagem e PDF conferidos
// pelos primeiros bytes, arquivo falso recusado, Word sem script. Puro (sem Gmail): node scripts/mail-preview.test.mjs
import JSZip from 'jszip';
import { previewKind, imageTypeOf, kindLabel, previewUrl } from '../shared/attachmentPreview.js';
import { buildPreview, sendPreview, decodeText } from '../server/mailPreview.js';

let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 300)}` : ''}`); } };

// ---- tipo
ok('PDF como octet-stream ainda é PDF', previewKind('E-ticket.pdf', 'application/octet-stream') === 'pdf');
ok('.ics é texto (Convite)', previewKind('invite.ics', 'application/ics') === 'text' && kindLabel('invite.ics') === 'Convite');
ok('XML da NF-e é texto', previewKind('nfe.xml', 'application/octet-stream') === 'text' && kindLabel('nfe.xml') === 'XML');
ok('docx e xlsx', previewKind('a.docx', '') === 'docx' && previewKind('b.xlsx', '') === 'sheet' && previewKind('c.csv', '') === 'sheet');
ok('imagem pelo tipo mesmo sem extensão', previewKind('foto', 'image/jpeg') === 'image');
ok('SVG não é pré-visualizado como imagem', previewKind('logo.svg', 'image/svg+xml') === null && imageTypeOf('logo.svg', 'image/svg+xml') === '');
ok('zip e exe sem pré-visualização', previewKind('a.zip', 'application/zip') === null && previewKind('a.exe', '') === null);
ok('previewUrl acrescenta à query', previewUrl('/api/x?name=a.pdf', 'application/pdf') === '/api/x?name=a.pdf&preview=1&type=application%2Fpdf');

// ---- imagem e PDF
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const pi = await buildPreview(png, { filename: 'a.png', type: 'image/png' });
ok('PNG vai como está, com o tipo real', pi.raw && pi.contentType === 'image/png');
const fakeImg = await buildPreview(Buffer.from('<svg onload=alert(1)>'), { filename: 'a.png', type: 'image/png' });
ok('"PNG" que não é PNG recusado', fakeImg.status === 422);
const jpgAsPng = await buildPreview(Buffer.from('ffd8ffe000104a4649', 'hex'), { filename: 'a.png', type: 'image/png' });
ok('JPEG com nome .png sai como image/jpeg', jpgAsPng.contentType === 'image/jpeg');
const pdf = await buildPreview(Buffer.from('%PDF-1.4\n%…\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'), { filename: 'a.pdf', type: 'application/octet-stream' });
ok('PDF vai como application/pdf', pdf.contentType === 'application/pdf');
ok('"PDF" falso recusado', (await buildPreview(Buffer.from('<html><script>x</script>'), { filename: 'a.pdf', type: '' })).status === 422);

// ---- texto
const ics = 'BEGIN:VCALENDAR\r\nSUMMARY:Reunião\r\nEND:VCALENDAR';
const ti = await buildPreview(Buffer.from(ics), { filename: 'invite.ics', type: 'text/calendar' });
ok('.ics vira texto', ti.json?.kind === 'text' && ti.json.text.includes('Reunião'));
const ics2 = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Voo PRT 1234\r\nDTSTART:20261120T213000Z\r\nDTEND:20261121T093000Z\r\nLOCATION:Aeroporto Afonso Pena\r\nEND:VEVENT\r\nEND:VCALENDAR';
const te = await buildPreview(Buffer.from(ics2), { filename: 'invite.ics', type: 'application/ics' });
ok('.ics traz o resumo do evento', te.json.event?.title === 'Voo PRT 1234' && te.json.event.location === 'Aeroporto Afonso Pena' && te.json.event.start === '2026-11-20T21:30:00.000Z', te.json.event);
ok('texto comum não ganha evento', !(await buildPreview(Buffer.from('oi'), { filename: 'a.txt', type: '' })).json.event);
ok('arquivo Latin-1 lido com acento', decodeText(Buffer.from('Ação; preço; serviço; José; João', 'latin1')) === 'Ação; preço; serviço; José; João');
const big = await buildPreview(Buffer.from('x'.repeat(500_000)), { filename: 'a.txt', type: 'text/plain' });
ok('texto enorme cortado com aviso', big.json.truncated && big.json.text.length === 400_000);

// ---- Word
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contrato de prestação &lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>');
const docx = await zip.generateAsync({ type: 'nodebuffer' });
const dw = await buildPreview(docx, { filename: 'CONTRATO.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
ok('Word vira HTML', dw.json?.kind === 'html' && dw.json.html.includes('Contrato de prestação'), dw);
ok('Word sem <script> de verdade', !/<script/i.test(dw.json.html));
ok('"docx" falso recusado', (await buildPreview(Buffer.from('oi'), { filename: 'a.docx', type: '' })).status === 422);

// ---- Excel e CSV
const XLSX = await import('xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CFOP', 'Valor'], ['5102', 1234.5], ['6102', 99]]), 'Vendas');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Resumo');
const xlsx = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const sx = await buildPreview(xlsx, { filename: 'apuracao.xlsx', type: '' });
ok('Excel vira tabela com as duas planilhas', sx.json?.kind === 'sheet' && sx.json.sheets.length === 2 && sx.json.sheets[0].name === 'Vendas' && sx.json.sheets[0].rows[1][0] === '5102', sx.json);
const csv = await buildPreview(Buffer.from('nome;cidade\nJosé;São Paulo\n'), { filename: 'lista.csv', type: 'text/csv' });
ok('CSV com ponto e vírgula e acento', csv.json?.kind === 'sheet' && csv.json.sheets[0].rows[1].join('|') === 'José|São Paulo', csv.json);
const manyRows = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(manyRows, XLSX.utils.aoa_to_sheet(Array.from({ length: 900 }, (_, i) => [i])), 'Grande');
const mr = await buildPreview(XLSX.write(manyRows, { type: 'buffer', bookType: 'xlsx' }), { filename: 'g.xlsx', type: '' });
ok('planilha grande mostra as primeiras 500 linhas', mr.json.sheets[0].rows.length === 500 && mr.json.sheets[0].more);

// ---- sem pré-visualização e resposta HTTP
ok('zip devolve 415', (await buildPreview(Buffer.from('PK'), { filename: 'a.zip', type: 'application/zip' })).status === 415);
const fakeRes = () => { const r = { headers: {}, code: 200, body: null }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.send = (b) => { r.body = b; return r; }; return r; };
const r1 = fakeRes(); await sendPreview(r1, pdf.raw || Buffer.from('%PDF-1.4'), { filename: 'a.pdf', type: '' });
ok('PDF responde inline com nosniff', r1.headers['content-type'] === 'application/pdf' && r1.headers['content-disposition'] === 'inline' && r1.headers['x-content-type-options'] === 'nosniff');
const r2 = fakeRes(); await sendPreview(r2, Buffer.from('lixo'), { filename: 'a.xlsx', type: '' });
ok('planilha quebrada vira mensagem amigável', r2.code === 422 && /Baixe/.test(r2.body.message), r2);

console.log(failed ? `\n${failed} falha(s).` : '\nmail-preview: tudo certo');
process.exit(failed ? 1 : 0);
