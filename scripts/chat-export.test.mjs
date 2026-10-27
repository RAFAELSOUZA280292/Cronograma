// Teste descartável (2026-10-27): copiar/exportar conversa da RENATA — normalização das 3 telas, texto, HTML, linhas do Excel (releitura do .xlsx) e JSON.
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { conversationHtml, conversationJson, conversationRows, conversationText, exportFileName, fromProjectMessages, fromSimpleMessages, messageText, stripBold } from '../src/assistant/chatExport.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const proj = [
  { id: '1', role: 'user', content: 'Falamos do Produtor Rural?', createdAt: '2026-10-27T11:31:00.000Z' },
  { id: '2', role: 'assistant', content: 'plano', createdAt: '2026-10-27T11:32:00.000Z', hasEvidence: true,
    structured: { introduction: 'Sim — **três** reuniões <tocaram> no tema.', sections: [{ type: 'warning', title: 'Informação conflitante', content: 'O resumo de 06/10 diz X.', items: ['Resumo: **3 produtores**', 'Transcrição: não detectou'] }], insights: ['Confirmar com o Wellen'] },
    sources: [{ meetingTitle: 'Integração Compras', meetingDate: '2026-10-06', timeRef: '35:36' }] },
  { id: '3', role: 'assistant', content: 'Sem evidência.', hasEvidence: false, structured: { introduction: 'Não achei.', sections: [{ type: 'facts', title: 'NÃO DEVE SAIR', items: ['x'] }], insights: ['NÃO'] }, sources: [] },
  { id: '4', role: 'assistant', content: '' },
];
const a = fromProjectMessages(proj);
ok(a.length === 3, 'ignora mensagem vazia'); ok(a[0].who === 'Você' && a[1].who === 'RENATA', 'autores');
ok(a[1].text.includes('**Informação conflitante**\nO resumo de 06/10 diz X.\n- Resumo: **3 produtores**'), 'seção estruturada');
ok(a[1].text.includes('**Insights rápidos**\n- Confirmar com o Wellen'), 'insights');
ok(a[1].sources[0] === 'Integração Compras · 06/10/2026 · 35:36', 'fonte');
ok(!a[2].text.includes('NÃO'), 'sem evidência não exporta seções/insights');
ok(messageText(a[1]).includes('Fontes: Integração Compras') && !messageText(a[1]).includes('**'), 'cópia isolada sem asteriscos, com fonte');
ok(messageText(a[1], { markdown: true }).includes('**três**'), 'markdown mantém negrito');

const simple = fromSimpleMessages([{ role: 'user', text: 'Crie uma tarefa' }, { role: 'assistant', text: 'Feito.', steps: [{ risk: 'read', summary: 'leu' }, { risk: 'write', summary: 'Tarefa criada', status: 'success' }, { risk: 'write', summary: 'Nota', status: 'failed', undone: false }] }, { role: 'assistant', text: '', steps: [] }]);
ok(simple.length === 2, 'mensagem vazia fora'); ok(simple[1].text.includes('**Ações executadas**\n- Tarefa criada\n- Nota (failed)') && !simple[1].text.includes('leu'), 'ações sem leituras');

const data = { title: 'RENATA — INDEMIL', subtitle: 'Conversa', messages: a, exportedAt: '27/10/2026 08:40' };
const txt = conversationText(data);
ok(txt.startsWith('RENATA — INDEMIL\nConversa\nExportada em 27/10/2026 08:40') && txt.includes('[Você · 27/10/2026') && !txt.includes('**'), 'texto');
const md = conversationText(data, { markdown: true });
ok(md.startsWith('# RENATA — INDEMIL') && md.includes('### RENATA') && md.includes('**três**'), 'markdown');
const html = conversationHtml(data); const doc = conversationHtml(data, { word: true });
ok(html.includes('&lt;tocaram&gt;') && !html.includes('<tocaram>') && html.includes('<strong>três</strong>') && html.includes('<ul><li>Resumo: <strong>3 produtores</strong></li>'), 'HTML escapado, negrito e listas');
ok(doc.includes('xmlns:w=') && !html.includes('xmlns:w='), 'versão Word');
const rows = conversationRows(data); ok(rows.length === 3 && rows[1].Quem === 'RENATA' && rows[1].Fontes.includes('35:36'), 'linhas Excel');
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Conversa');
const back = XLSX.utils.sheet_to_json(XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })).Sheets.Conversa);
ok(back.length === 3 && back[0].Mensagem === 'Falamos do Produtor Rural?', 'xlsx relido');
const js = JSON.parse(conversationJson(data)); ok(js.mensagens.length === 3 && js.mensagens[0].papel === 'usuario' && js.mensagens[1].fontes.length === 1, 'json');
ok(exportFileName('RENATA — Indústria & Comércio S/A', 'pdf', '2026-10-27') === 'renata-industria-comercio-s-a-2026-10-27.pdf', 'nome do arquivo');
ok(stripBold('a **b** c') === 'a b c', 'stripBold');
console.log(`chat-export: ${n} checagens OK`);
