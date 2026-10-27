// Teste descartável (2026-10-27): Biblioteca de conhecimento da RENATA. Usa o banco LOCAL (recusa outro), IA e embeddings SIMULADOS.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/knowledge-library.test.mjs
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
const DB = process.env.DATABASE_URL || '';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const { pool } = await import('../server/db.js');
const { extractText, chunkText, htmlToText } = await import('../server/materialText.js');
const lib = await import('../server/knowledgeLibrary.js');
const { loadRelevantFacts } = await import('../server/knowledgeFacts.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const ORG = 'sandbox-edu'; // organização local de sandbox (a limpeza só apaga materiais e fatos de material dela)

// ---------- fixtures ----------
const tema = 'O produtor rural pessoa física, antes da reforma, tinha isenção de PIS e COFINS na venda de produção própria e ICMS com diferimento. Depois da reforma, a LC 214/2025 trata o produtor rural como contribuinte opcional do regime regular de IBS e CBS quando a receita bruta anual ultrapassa R$ 3.600.000,00; abaixo disso, pode ficar fora do regime e o adquirente recebe crédito presumido. ';
const longTxt = ['# Produtor Rural antes e depois da reforma', tema.repeat(3), '## Crédito presumido', 'O crédito presumido do adquirente de produtor rural não contribuinte é de 12% para IBS+CBS conforme o material, e o produtor pode optar pelo regime regular. '.repeat(6), '## Limite de R$ 3,6 milhões', 'O limite de receita bruta anual de R$ 3.600.000,00 define a obrigatoriedade de apuração regular. '.repeat(8), '## Fiscalização', 'Cooperativas agropecuárias recebem tratamento próprio e a transição vai até 2033. '.repeat(10)].join('\n\n');
const mkPdf = (pages) => {
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('PAGES'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  pages.forEach((t) => { const stream = `BT /F1 12 Tf 40 760 Td (${t.replace(/[()\\]/g, ' ')}) Tj ET`; const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); const p = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${c} 0 R >>`); kids.push(`${p} 0 R`); });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
};
const mkPptx = async (slides) => { const z = new JSZip(); slides.forEach((s, i) => z.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld><a:p><a:r><a:t>${s}</a:t></a:r></a:p></p:sld>`)); z.file('ppt/notesSlides/notesSlide1.xml', '<p:notes><a:p><a:r><a:t>Falar do limite</a:t></a:r></a:p></p:notes>'); return z.generateAsync({ type: 'nodebuffer' }); };
const mkDocx = async (paras) => { const z = new JSZip(); z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'); z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'); z.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map(([style, t]) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`); return z.generateAsync({ type: 'nodebuffer' }); };

// ---------- extração ----------
const pdf = await extractText({ buffer: mkPdf(['Produtor rural antes da reforma', 'Depois da reforma: IBS e CBS']), fileName: 'a.pdf' }).catch((e) => e);
ok(typeof pdf === 'string' && pdf.includes('[Página 1]') && pdf.includes('Produtor rural antes') && pdf.includes('[Página 2]'), `pdf: ${pdf && pdf.message || pdf}`);
const pp = await extractText({ buffer: await mkPptx(['Slide um produtor', 'Slide dois CBS']), fileName: 'a.pptx' });
ok(pp.includes('[Slide 1]') && pp.includes('Slide dois CBS') && pp.includes('Anotações do apresentador: Falar do limite'), 'pptx');
const dx = await extractText({ buffer: await mkDocx([['Heading1', 'Regime do produtor'], ['', 'Texto &amp; regras']]), fileName: 'a.docx' });
ok(dx.includes('# Regime do produtor') && dx.includes('Texto & regras'), `docx: ${dx}`);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Item', 'Antes', 'Depois'], ['PIS', '1,65', '0']]), 'Comparativo');
const xl = await extractText({ buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), fileName: 'a.xlsx' });
ok(xl.includes('[Planilha: Comparativo]') && xl.includes('PIS,1.65,0') || xl.includes('PIS,1,65,0') || xl.includes('PIS'), 'xlsx');
ok((await extractText({ buffer: Buffer.from('﻿# Titulo\n\ntexto'), fileName: 'a.md' })).startsWith('# Titulo'), 'md sem BOM');
ok(htmlToText('<h2>Regras</h2><ul><li>um</li><li>dois &amp; três</li></ul><table><tr><td>a</td><td>b</td></tr></table><script>x()</script>').includes('## Regras') , 'html título');
ok(htmlToText('<ul><li>um</li><li>dois &amp; três</li></ul><table><tr><td>a</td><td>b</td></tr></table><script>x()</script>').includes('- dois & três') && !htmlToText('<script>x()</script>ok').includes('x()'), 'html itens/script');
await assert.rejects(() => extractText({ buffer: Buffer.from('x'), fileName: 'a.exe' }), /não é aceito/); n++;
await assert.rejects(() => extractText({ buffer: mkPdf(['.']), fileName: 'vazio.pdf' }), /quase não tem texto/); n++;

// ---------- fatiamento ----------
const ch = chunkText(longTxt);
ok(ch.length >= 4 && ch.every((c, i) => c.idx === i && c.content.length <= 2300), `chunks ${ch.length}`);
ok(ch.some((c) => c.heading === 'Crédito presumido') && ch.some((c) => c.heading.includes('Limite')), 'títulos nos trechos');
const chm = chunkText('[Página 1]\n' + 'a'.repeat(900) + '\n\n[Página 2]\n' + 'b'.repeat(900) + '\n\n' + 'c'.repeat(900));
ok(chm.some((c) => c.ref === 'Página 1') && chm.some((c) => c.ref === 'Página 2'), 'referência de página');
ok(chunkText('curto').length === 1 && chunkText('').length === 0, 'texto curto/vazio');

// ---------- pipeline com IA e embeddings simulados ----------
const vec = (t) => { const v = new Array(2048).fill(0); String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3).forEach((w) => { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 2048; v[h] += 1; }); return v; };
const calls = { study: 0, notes: 0, embed: 0 };
lib.deps.embedOn = () => true; lib.deps.embed = async (ts) => { calls.embed += ts.length; return ts.map(vec); };
lib.deps.client = () => ({ messages: {
  parse: async () => { calls.study++; return { stop_reason: 'end_turn', parsed_output: { subject: 'Produtor rural antes e depois da reforma', executiveSummary: 'O produtor rural PF tinha isenção de PIS/COFINS; depois, o regime regular de IBS/CBS é opcional abaixo de R$ 3,6 mi.', keyPoints: ['Limite de R$ 3.600.000,00'], comparisons: [{ topic: 'PIS/COFINS na venda', before: 'isento', after: 'CBS opcional', basis: 'LC 214/2025' }], faq: [{ question: 'Quando é obrigatório?', answer: 'Acima de R$ 3,6 mi.' }], themes: ['produtor rural', 'crédito presumido'], appliesTo: 'Clientes do agro', usageTriggers: ['produtor rural'], legalBasis: ['LC 214/2025'], limits: '' } }; },
  create: async () => { calls.notes++; return { content: [{ type: 'text', text: 'anotações' }] }; },
} });
await pool.query(`DELETE FROM ai_knowledge_facts WHERE org_id=$1 AND reference LIKE 'Material PRICETAX:%'`, [ORG]); await pool.query(`DELETE FROM knowledge_materials WHERE org_id=$1`, [ORG]);
const mk = async (title, text, extra = {}) => { const id = lib.uid('mat'); await pool.query(`INSERT INTO knowledge_materials (id, org_id, title, topic, full_text, text_hash, char_count, created_by, created_by_name, source_kind) VALUES ($1,$2,$3,$4,$5,$6,$7,'sbx_admin','Teste','text')`, [id, ORG, title, extra.topic || '', text, lib.sha256(text), text.length]); return id; };
const idA = await mk('Produtor Rural — antes e depois da reforma', longTxt, { topic: 'Produtor Rural' });
const idB = await mk('Split payment em 2027', 'O split payment separa o imposto no momento do pagamento. '.repeat(40) + '\n\n## Mecânica\n\n' + 'O prestador de serviço de pagamento retém a parcela do IBS e da CBS. '.repeat(30));
await lib.processMaterial(idA); await lib.processMaterial(idB);
let { rows: [A] } = await pool.query('SELECT * FROM knowledge_materials WHERE id=$1', [idA]);
ok(A.status === 'ready' && A.chunk_count === ch.length && A.study && A.fact_id && !A.study_error, `A pronto: ${A.status} ${A.error} ${A.study_error}`);
ok(calls.study === 2 && calls.notes === 0 && calls.embed >= ch.length, 'IA 1x por material; embeddings dos trechos');
const { rows: [F] } = await pool.query('SELECT * FROM ai_knowledge_facts WHERE id=$1', [A.fact_id]);
ok(F.scope === 'org' && F.origin === 'internal_document' && F.reference === `Material PRICETAX:${idA}` && F.content.includes('Antes × depois') && F.embedding, 'fato do material');
// busca
const r1 = await lib.searchMaterial({ orgId: ORG, query: 'O produtor rural precisa optar pelo regime regular de IBS e CBS? Qual o limite de faturamento?' });
ok(r1.passages.length > 0 && r1.passages.every((p) => p.materialId === idA) && r1.passages[0].factId === A.fact_id, 'busca acha o material certo');
ok(r1.passages.some((p) => /3\.600\.000/.test(p.content)), 'trecho do limite');
const r2 = await lib.searchMaterial({ orgId: ORG, query: 'como funciona o split payment' });
ok(r2.passages.length > 0 && r2.passages[0].materialId === idB, 'outra pergunta, outro material');
const r3 = await lib.searchMaterial({ orgId: ORG, query: 'receita de bolo de chocolate' });
ok(r3.passages.length === 0 && r3.materials.length === 0, 'pergunta fora do tema não traz nada');
ok((await lib.searchMaterial({ orgId: 'outra-org', query: 'produtor rural' })).passages.length === 0, 'isolamento por organização');
// prompt
const ctx = await loadRelevantFacts(pool, ORG, null, null, 25, { query: 'produtor rural e regime regular de IBS', isStaff: true });
ok(ctx.text.includes('[MATERIAL]') && ctx.text.includes('TRECHO:') && ctx.factIds.includes(A.fact_id) && ctx.materialsIncluded > 0, 'entra no prompt da RENATA (equipe)');
const ctx2 = await loadRelevantFacts(pool, ORG, null, null, 25, { query: 'produtor rural e regime regular de IBS', isStaff: false });
ok(!ctx2.text.includes('[MATERIAL]'), 'cliente não recebe material');
const ctx3 = await loadRelevantFacts(pool, ORG, null, null, 25, { query: 'bom dia', isStaff: true });
ok(!ctx3.text.includes('[MATERIAL]') && !ctx3.text.includes('Material PRICETAX'), 'sem tema, custo zero (nem fica na janela geral)');
// reestudo sem refazer trechos
const before = calls.embed; await lib.processMaterial(idA, { skipIndex: true });
ok(calls.study === 3 && calls.embed - before <= 1, 'estudar de novo não reindexa');
// falha de IA não derruba a leitura
lib.deps.client = () => { throw new Error('A IA não está configurada neste ambiente (falta a ANTHROPIC_API_KEY).'); };
await lib.processMaterial(idB);
({ rows: [A] } = await pool.query('SELECT status, study_error FROM knowledge_materials WHERE id=$1', [idB]));
ok(A.status === 'ready' && /não está configurada/.test(A.study_error), 'sem IA: material pesquisável, aviso no estudo');
// arquivar tira da busca
await pool.query(`UPDATE knowledge_materials SET archived_at=now() WHERE id=$1`, [idA]);
ok((await lib.searchMaterial({ orgId: ORG, query: 'produtor rural limite' })).passages.length === 0, 'arquivado some da busca');
// texto longo: anotações por parte
lib.deps.client = () => ({ messages: { parse: async () => ({ stop_reason: 'end_turn', parsed_output: { subject: 's', executiveSummary: 'r', keyPoints: [], comparisons: [], faq: [], themes: [], appliesTo: '', usageTriggers: [], legalBasis: [], limits: '' } }), create: async () => { calls.notes++; return { content: [{ type: 'text', text: 'nota' }] }; } } });
const big = 'Frase longa sobre apuração assistida. '.repeat(7000);
const idC = await mk('Material enorme', big); await lib.processMaterial(idC);
ok(calls.notes === Math.ceil(big.length / 100000), `anotações por parte: ${calls.notes}`);

await pool.query(`DELETE FROM ai_knowledge_facts WHERE org_id=$1 AND reference LIKE 'Material PRICETAX:%'`, [ORG]); await pool.query(`DELETE FROM knowledge_materials WHERE org_id=$1`, [ORG]);
console.log(`knowledge-library: ${n} checagens OK`); await pool.end();
