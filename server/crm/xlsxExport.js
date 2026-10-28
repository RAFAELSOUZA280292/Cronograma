// Exportação nativa para Excel (2026-10-28, §116c): planilha .xlsx com visual (cabeçalho, linhas alternadas, filtro, cabeçalho fixo, links clicáveis).
// A biblioteca de planilhas do projeto (SheetJS community) não grava estilo, então o arquivo é montado direto em OOXML com o JSZip que o servidor já tem.
// Módulo puro (sem banco): buildXlsx recebe colunas e linhas e devolve o Buffer.
import JSZip from 'jszip';

const NAVY = 'FF0B0B1E';
const YELLOW = 'FFFFD400';
const ZEBRA = 'FFF6F6FA';
const LINE = 'FFD9D9E3';

const esc = (v) => String(v == null ? '' : v).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const colName = (i) => { let n = i + 1; let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Dias desde 1899-12-30 (data do Excel) de um "AAAA-MM-DD" ou ISO; null se inválido.
export function excelDate(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round((t - Date.UTC(1899, 11, 30)) / 86400000) : null;
}

// Estilos: um xf por (tipo de célula × linha alternada). Tipos: text, email, wa (link verde), money, date, int, center.
const KINDS = ['text', 'email', 'wa', 'money', 'date', 'int', 'center'];
const xfIndex = (kind, zebra) => 4 + KINDS.indexOf(kind) * 2 + (zebra ? 1 : 0);

function stylesXml() {
  const fonts = [
    '<font><sz val="11"/><color rgb="FF1F1F2E"/><name val="Calibri"/></font>', // 0 corpo
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', // 1 cabeçalho
    '<font><b/><sz val="16"/><color rgb="FF0B0B1E"/><name val="Calibri"/></font>', // 2 título
    '<font><i/><sz val="10"/><color rgb="FF5A5A6E"/><name val="Calibri"/></font>', // 3 subtítulo
    '<font><u/><sz val="11"/><color rgb="FF1F5FBF"/><name val="Calibri"/></font>', // 4 e-mail
    '<font><b/><u/><sz val="11"/><color rgb="FF1B8F4C"/><name val="Calibri"/></font>', // 5 WhatsApp
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    `<fill><patternFill patternType="solid"><fgColor rgb="${NAVY}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="${ZEBRA}"/><bgColor indexed="64"/></patternFill></fill>`,
  ];
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    `<border><left/><right/><top/><bottom style="thin"><color rgb="${LINE}"/></bottom><diagonal/></border>`,
    `<border><left/><right/><top/><bottom style="thick"><color rgb="${YELLOW}"/></bottom><diagonal/></border>`,
  ];
  const numFmts = '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>';
  const al = (h, wrap) => `<alignment horizontal="${h}" vertical="center" indent="${h === 'left' ? 1 : 0}"${wrap ? ' wrapText="1"' : ''}/>`;
  const xf = (numFmt, font, fill, border, h = 'left') => `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al(h)}</xf>`;
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', // 0
    xf(0, 1, 2, 2), // 1 cabeçalho
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>', // 2 título
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>', // 3 subtítulo
  ];
  const spec = { text: [0, 0, 'left'], email: [0, 4, 'left'], wa: [0, 5, 'left'], money: [164, 0, 'right'], date: [165, 0, 'center'], int: [1, 0, 'center'], center: [0, 0, 'center'] };
  KINDS.forEach((k) => { const [nf, font, h] = spec[k]; xfs.push(xf(nf, font, 0, 1, h), xf(nf, font, 3, 1, h)); });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts}`
    + `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

const strCell = (ref, s, text) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const numCell = (ref, s, n) => `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
const blankCell = (ref, s) => `<c r="${ref}" s="${s}"/>`;

// columns: [{ header, width, kind, get(row) → valor, link?(row) → URL }]; kind: text | email | wa | money | date | int | center.
// Valor em money/date/int é número (data = serial do Excel, ver excelDate); texto vazio vira célula vazia.
export async function buildXlsx({ sheetName = 'Planilha', title = '', subtitle = '', columns, rows }) {
  const HEAD = title || subtitle ? 4 : 1; // linha do cabeçalho da tabela
  const out = [];
  const links = [];
  const row = (n, ht, cells) => out.push(`<row r="${n}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`);
  if (title) row(1, 26, strCell('A1', 2, title));
  if (subtitle) row(2, 16, strCell('A2', 3, subtitle));
  row(HEAD, 26, columns.map((c, j) => strCell(`${colName(j)}${HEAD}`, 1, c.header)).join(''));
  rows.forEach((r, i) => {
    const n = HEAD + 1 + i; const z = i % 2 === 1;
    const cells = columns.map((c, j) => {
      const ref = `${colName(j)}${n}`; const kind = c.kind || 'text'; const s = xfIndex(kind, z);
      const v = c.get(r);
      if (v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v))) return blankCell(ref, s);
      const url = c.link ? c.link(r) : '';
      if (url) links.push({ ref, url });
      if (kind === 'money' || kind === 'date' || kind === 'int') return numCell(ref, s, v);
      return strCell(ref, s, v);
    }).join('');
    row(n, 22, cells);
  });
  const last = colName(columns.length - 1); const lastRow = HEAD + rows.length;
  const colsXml = `<cols>${columns.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.width || 16}" customWidth="1"/>`).join('')}</cols>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<dimension ref="A1:${last}${Math.max(lastRow, HEAD)}"/>`
    + `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="1" ySplit="${HEAD}" topLeftCell="B${HEAD + 1}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B${HEAD + 1}" sqref="B${HEAD + 1}"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${out.join('')}</sheetData>`
    + (rows.length ? `<autoFilter ref="A${HEAD}:${last}${lastRow}"/>` : '')
    + (links.length ? `<hyperlinks>${links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join('')}</hyperlinks>` : '')
    + '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map((l, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`).join('')}</Relationships>`;
  const safeName = esc(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Planilha');
  const defined = rows.length
    ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${safeName}'!$A$${HEAD}:$${last}$${lastRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${safeName}'!$${HEAD}:$${HEAD}</definedName></definedNames>` : '';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>${defined}</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml', stylesXml());
  zip.file('xl/worksheets/sheet1.xml', sheet);
  if (links.length) zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRels);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
