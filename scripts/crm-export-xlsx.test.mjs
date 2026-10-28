// Teste descartável (2026-10-28) da exportação nativa para Excel do CRM (§116c).
//   BASE=http://localhost:3001 SBX_PASS=… node scripts/crm-export-xlsx.test.mjs   (a parte HTTP é pulada sem SBX_PASS)
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildXlsx, excelDate, colName } from '../server/crm/xlsxExport.js';
import { DEAL_COLUMNS, waNumber, fmtPhone } from '../server/crm/dealExport.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

ok(colName(0) === 'A' && colName(25) === 'Z' && colName(26) === 'AA' && colName(18) === 'S', 'nome das colunas');
ok(excelDate('2026-10-28') === 46323 && excelDate('1899-12-30') === 0 && excelDate('') === null && excelDate('x') === null, 'data do Excel');
ok(waNumber('+5511986489815') === '5511986489815' && waNumber('11986489815') === '5511986489815' && waNumber('123') === '' && fmtPhone('+5511986489815') === '(11) 98648-9815' && fmtPhone('4132345678') === '(41) 3234-5678', 'telefone e WhatsApp');

const rows = [
  { title: 'Ana & <Cia> "X"', contactName: 'Ana', contactEmail: 'ana@x.com.br', contactPhone: '+5511986489815', contactWhatsapp: '', companyName: 'Cia (empresa não informada)', companyCity: 'Curitiba', companyState: 'PR', source: 'Evento', stageName: 'Mapeamento', status: 'open', value: 1234.5, probability: 20, ownerName: 'Eduarda', dealType: 'new', tags: ['a', 'b'], createdAt: '2026-10-28T01:30:00Z', expectedCloseDate: '2026-11-05', daysInStage: 3, nextActivityDate: '2026-10-30', nextActivityTime: '10:00', nextActivityTitle: 'Retorno' },
  { title: 'Sem contato', contactName: '', contactEmail: '', contactPhone: '', contactWhatsapp: '', companyName: 'Y', companyCity: '', companyState: '', source: '', stageName: 'Leads', status: 'lost', value: 0, probability: 0, ownerName: '', dealType: 'upsell', tags: [], createdAt: null, expectedCloseDate: null, daysInStage: null },
];
const buf = await buildXlsx({ sheetName: 'Negócios/2', title: 'Título <1>', subtitle: 'Sub', columns: DEAL_COLUMNS, rows });
const zip = await JSZip.loadAsync(buf);
const names = Object.keys(zip.files);
ok(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/_rels/sheet1.xml.rels'].every((f) => names.includes(f)), 'partes do pacote');
const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
const wb = await zip.file('xl/workbook.xml').async('string');
const rels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
ok(sheet.includes('Ana &amp; &lt;Cia&gt; &quot;X&quot;') && !sheet.includes('<Cia>'), 'texto escapado');
ok(/<pane [^>]*state="frozen"/.test(sheet) && /<autoFilter ref="A4:S6"\/>/.test(sheet), 'cabeçalho fixo e filtro');
ok(rels.includes('mailto:ana@x.com.br') && rels.includes('https://wa.me/5511986489815') && (sheet.match(/<hyperlink /g) || []).length === 2, 'links só de quem tem contato');
ok(sheet.includes('<c r="K5" s="') && sheet.includes('<v>1234.5</v>') && sheet.includes(`<v>${excelDate('2026-11-05')}</v>`) && sheet.includes(`<v>${excelDate('2026-10-27')}</v>`), 'valor, previsão e criação no fuso de Brasília (28/10 01:30Z = 27/10)');
ok(!/Empresa<\/t>[\s\S]*empresa não informada/.test(sheet) && !sheet.includes('(empresa não informada)'), 'tira o sufixo de empresa provisória');
ok(wb.includes("name=\"Negócios 2\"") && wb.includes('_xlnm._FilterDatabase'), 'nome da aba sem caractere proibido');
for (const f of names.filter((x) => /\.(xml|rels)$/.test(x))) { const t = await zip.file(f).async('string'); ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(t) && t.startsWith('<?xml'), `XML bem formado: ${f}`); }
const empty = await JSZip.loadAsync(await buildXlsx({ sheetName: 'X', columns: DEAL_COLUMNS, rows: [] }));
ok(!(await empty.file('xl/worksheets/sheet1.xml').async('string')).includes('<autoFilter'), 'sem linhas: sem filtro, arquivo válido');

if (process.env.SBX_PASS) {
  const BASE = process.env.BASE || 'http://localhost:3001';
  const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_admin', password: process.env.SBX_PASS }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  ok((await fetch(`${BASE}/api/crm/deals/export.xlsx`)).status === 401, 'sem login: 401');
  const all = await fetch(`${BASE}/api/crm/deals/export.xlsx?status=all`, { headers: { cookie } });
  const total = (await (await fetch(`${BASE}/api/crm/deals?status=all&limit=1`, { headers: { cookie } })).json()).total;
  ok(all.status === 200 && /spreadsheetml/.test(all.headers.get('content-type')) && /attachment; filename="negocios-\d{4}-\d{2}-\d{2}\.xlsx"/.test(all.headers.get('content-disposition')) && Number(all.headers.get('x-export-count')) === total, `HTTP: baixa todos (${total})`);
  const z = await JSZip.loadAsync(Buffer.from(await all.arrayBuffer())); ok(!!z.file('xl/worksheets/sheet1.xml'), 'HTTP: é um .xlsx');
  const none = await fetch(`${BASE}/api/crm/deals/export.xlsx?tag=${encodeURIComponent('tag que não existe')}`, { headers: { cookie } });
  ok(none.status === 200 && none.headers.get('x-export-count') === '0', 'HTTP: filtro vazio devolve contagem 0');
  const one = await fetch(`${BASE}/api/crm/deals/export.xlsx?status=all&q=${encodeURIComponent('jessica')}`, { headers: { cookie } });
  const cnt = Number(one.headers.get('x-export-count')); const lst = (await (await fetch(`${BASE}/api/crm/deals?status=all&q=jessica&limit=1`, { headers: { cookie } })).json()).total;
  ok(cnt === lst && cnt > 0 && cnt < total, `HTTP: respeita a busca (${cnt} de ${total})`);
}
console.log(`crm-export-xlsx: ${n} checagens OK`);
