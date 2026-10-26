// Teste descartável da Daily (2026-10-26): filtro de prazo, linhas do Excel (leitura de volta pelo xlsx) e HTML do PDF.
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { dailyRows, dailySummary, dailyToHtml, dueFilterLabel, dueMatches, weekBounds } from '../src/personal/dailyExport.js';

const today = '2026-10-26'; // segunda
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(weekBounds(today).from === '2026-10-26' && weekBounds(today).to === '2026-11-01', 'semana de segunda');
ok(weekBounds('2026-10-25').from === '2026-10-19', 'domingo pertence à semana anterior');
const m = (kind, iso, done = false, extra = {}) => dueMatches({ kind, ...extra }, iso, done, today);
ok(m('all', ''), 'todos aceita sem data'); ok(!m('late', ''), 'atrasada exclui sem data'); ok(m('none', '') && !m('none', today), 'sem data');
ok(m('late', '2026-10-25') && !m('late', '2026-10-25', true) && !m('late', today), 'atrasadas');
ok(m('today', today) && !m('today', '2026-10-27'), 'hoje');
ok(m('week', '2026-11-01') && !m('week', '2026-11-02'), 'semana');
ok(m('next7', '2026-11-02') && !m('next7', '2026-11-03') && !m('next7', '2026-10-25'), 'próximos 7');
ok(m('month', '2026-10-31') && !m('month', '2026-11-01'), 'mês');
ok(m('range', '2026-10-28', false, { from: '2026-10-27', to: '2026-10-29' }) && !m('range', '2026-10-30', false, { from: '2026-10-27', to: '2026-10-29' }), 'período');
ok(m('range', '2026-12-01', false, { from: '2026-10-27', to: '' }) && !m('range', '', false, { from: '2026-10-27' }), 'período aberto');
ok(dueFilterLabel({ kind: 'range', from: '2026-10-27', to: '2026-10-29' }, today) === 'Prazo de 27/10/2026 a 29/10/2026', 'rótulo período');
ok(dueFilterLabel({ kind: 'all' }, today) === '', 'sem rótulo');

const people = [{ id: 'r', name: 'Rafael', open: 2, late: 1, today: 0, entries: [
  { card: { title: 'COMERCIAL <A&B>', dueDate: '2026-11-02' }, col: { name: 'A fazer' }, isOwner: true, subs: [{ text: 'Retomar VPS', dueDate: '2026-10-25', done: false, responsibleIds: [] }, { text: 'Sem data', dueDate: '', done: false }, { text: 'Feita', dueDate: '2026-10-20', done: true }] },
  { card: { title: 'Sem subs', dueDate: '' }, col: { name: 'Doing' }, isOwner: false, subs: [] },
] }];
const rows = dailyRows(people, today, () => ['Rafael', 'Felipe']);
ok(rows.length === 4, 'uma linha por sub + atividade sem sub');
ok(rows[0].Situação === 'Atrasada' && rows[1].Situação === 'Sem data' && rows[2].Situação === 'Concluída', 'situações');
ok(rows[0].Com === 'Felipe', 'com exclui a própria pessoa');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({ ...r, 'Prazo da subatividade': r['Prazo da subatividade'] ? new Date(`${r['Prazo da subatividade']}T12:00:00`) : '' })), { dateNF: 'dd/mm/yyyy' });
XLSX.utils.book_append_sheet(wb, ws, 'Daily'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySummary(people)), 'Resumo');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
const back = XLSX.read(buf, { cellDates: true });
ok(back.SheetNames.join() === 'Daily,Resumo', 'abas');
const back1 = XLSX.utils.sheet_to_json(back.Sheets.Daily, { raw: true });
ok(back1[0]['Prazo da subatividade'] instanceof Date, 'data real no Excel'); ok(back1[0].Atividade === 'COMERCIAL <A&B>', 'texto intacto');
const html = dailyToHtml({ boardName: 'Daily <x>', today, people, filtersText: ['Prazo: atrasadas'], namesOf: () => ['Rafael', 'Felipe'] });
ok(html.includes('COMERCIAL &lt;A&amp;B&gt;') && !html.includes('<A&B>') && html.includes('Daily &lt;x&gt;'), 'HTML escapado');
ok(html.includes('class="d late">25/10/2026') && html.includes('☑') && html.includes('com Felipe') && html.includes('sem data'), 'conteúdo do PDF');
console.log(`daily-export: ${n} checagens OK`);
