// Gera scripts/fixtures/proposta-exemplo-4-erros.pdf (§131): proposta fictícia com os 4 erros da revisão de exemplo do Rafael
// (extenso do Diagnóstico FULL, extenso da Consultoria FULL, "LC 214/2026" e a frase truncada do workshop). PDF com texto selecionável.
//   node scripts/fixtures/gera-proposta-exemplo.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LINES = [
  [16, 'PROPOSTA COMERCIAL - OKUBO'],
  [10, 'Curitiba, 2 de novembro de 2026'],
  [10, ''],
  [12, 'Diagnóstico FULL'],
  [10, 'Investimento: R$ 49.515,50 (trinta e sete mil, quinhentos e quinze reais e cinquenta centavos)'],
  [10, ''],
  [12, 'Consultoria FULL'],
  [10, 'Investimento: R$ 7.550,00 (sete mil e quinhentos reais)'],
  [10, ''],
  [12, 'Fundamentação'],
  [10, 'Trabalho conduzido conforme a LC 214/2026 e a EC 132/2023.'],
  [10, ''],
  [12, 'Workshop com as áreas'],
  [10, 'Dever de cada para cada área.'],
  [10, ''],
  [10, 'Proposta válida até 30/11/2026.'],
];

const esc = (s) => Buffer.from(s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'), 'latin1');
const parts = [Buffer.from('BT\n')];
let y = 790;
for (const [size, text] of LINES) {
  parts.push(Buffer.from(`/F1 ${size} Tf 1 0 0 1 50 ${y} Tm (`), esc(text), Buffer.from(') Tj\n'));
  y -= size + 8;
}
parts.push(Buffer.from('ET\n'));
const stream = Buffer.concat(parts);

const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  null,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
];
const chunks = [Buffer.from('%PDF-1.4\n')];
const offsets = [];
let pos = chunks[0].length;
objs.forEach((o, i) => {
  const body = o === null
    ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('endstream\nendobj\n')])
    : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`);
  offsets.push(pos); chunks.push(body); pos += body.length;
});
const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
chunks.push(Buffer.from(xref));
const out = fileURLToPath(new URL('./proposta-exemplo-4-erros.pdf', import.meta.url));
writeFileSync(out, Buffer.concat(chunks));
console.log(`gerado: ${out}`);
