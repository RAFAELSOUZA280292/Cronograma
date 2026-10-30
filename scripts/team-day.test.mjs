// Dia da equipe: lógica pura de sessões, telas e resumo de mudanças (server/teamDay.js). Rodar: node scripts/team-day.test.mjs
import assert from 'node:assert/strict';
import { buildPersonDay, buildScreens, buildSessions, dayWindow, isDay, summarizeChanges } from '../server/teamDay.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const T = (hhmm, day = '2026-10-29') => Date.parse(`${day}T${hhmm}:00-03:00`);

ok('janela do dia é a de Brasília (24 h)', () => {
  const w = dayWindow('2026-10-29');
  assert.equal(new Date(w.fromMs).toISOString(), '2026-10-29T03:00:00.000Z');
  assert.equal(w.toMs - w.fromMs, 86400000);
  assert.equal(isDay('2026-10-29'), true);
  assert.equal(isDay('29/10/2026'), false);
  assert.equal(isDay('2026-13-40'), false);
});

ok('sessão: login até logout; logout é saída exata', () => {
  const s = buildSessions([
    { at: T('08:10'), kind: 'login', city: 'Passo Fundo', device: 'Chrome · macOS' },
    { at: T('08:11'), kind: 'slice', connectedS: 60, activeS: 40 },
    { at: T('12:00'), kind: 'logout' },
  ], T('18:00'));
  assert.equal(s.length, 1);
  assert.equal(s[0].endKind, 'logout');
  assert.equal(s[0].endMs, T('12:00'));
  assert.equal(s[0].entry.city, 'Passo Fundo');
  assert.equal(s[0].connectedS, 60);
});

ok('sem logout, a saída é a última atividade e vem marcada', () => {
  const s = buildSessions([
    { at: T('09:00'), kind: 'login' },
    { at: T('09:05'), kind: 'slice', connectedS: 120, activeS: 100 },
    { at: T('09:30'), kind: 'act' },
  ], T('18:00'));
  assert.equal(s.length, 1);
  assert.equal(s[0].endKind, 'ultima-atividade');
  assert.equal(s[0].endMs, T('09:30'));
});

ok('em andamento: atividade há menos de 5 min no dia de hoje', () => {
  const s = buildSessions([{ at: T('10:00'), kind: 'login' }, { at: T('10:30'), kind: 'act' }], T('10:33'));
  assert.equal(s[0].endKind, 'em-andamento');
  assert.equal(buildSessions([{ at: T('10:00'), kind: 'login' }], null)[0].endKind, 'ultima-atividade');
});

ok('30 min sem sinal ou novo login abre outra sessão', () => {
  const gap = buildSessions([{ at: T('08:00'), kind: 'login' }, { at: T('08:05'), kind: 'act' }, { at: T('09:00'), kind: 'act' }], null);
  assert.equal(gap.length, 2);
  const relog = buildSessions([{ at: T('08:00'), kind: 'login' }, { at: T('08:10'), kind: 'login' }], null);
  assert.equal(relog.length, 2);
  const afterOut = buildSessions([{ at: T('08:00'), kind: 'login' }, { at: T('08:10'), kind: 'logout' }, { at: T('08:12'), kind: 'visit' }], null);
  assert.equal(afterOut.length, 2);
  assert.equal(afterOut[1].entry.kind, 'visit');
});

ok('telas: fatias seguidas na mesma tela viram um trecho; mudar de tela abre outro', () => {
  const segs = buildScreens([
    { at: T('09:00'), module: 'crm', view: 'board', projectId: '', connectedS: 60, activeS: 50 },
    { at: T('09:01'), module: 'crm', view: 'board', projectId: '', connectedS: 60, activeS: 30 },
    { at: T('09:02'), module: 'company', view: 'tabela', projectId: 'p1', connectedS: 60, activeS: 60 },
    { at: T('09:30'), module: 'crm', view: 'board', projectId: '', connectedS: 60, activeS: 10 },
  ], { p1: 'ALCAST' });
  assert.equal(segs.length, 3);
  assert.equal(segs[0].connectedS, 120);
  assert.equal(segs[0].moduleLabel, 'CRM');
  assert.equal(segs[1].projectName, 'ALCAST');
  assert.equal(segs[2].fromMs, T('09:30'));
});

ok('resumo de mudanças do CRM: curto, com de → para e cortando texto longo', () => {
  assert.equal(summarizeChanges([{ label: 'Responsável', from: 'A', to: 'B' }, { label: 'Valor', from: null, to: 35000 }]), 'Responsável: A → B · Valor: — → 35000');
  assert.equal(summarizeChanges(null), '');
  assert.ok(summarizeChanges([{ label: 'Nota', from: '', to: 'x'.repeat(500) }]).length < 90);
  assert.equal(summarizeChanges([{ nolabel: 1 }]), '');
});

ok('dia da pessoa junta acessos, telas e operações só dela', () => {
  const data = {
    access: [{ userId: 'u1', kind: 'login', at: T('08:00'), city: 'Passo Fundo', region: 'RS', device: 'Safari · iOS' }, { userId: 'u2', kind: 'login', at: T('08:30'), city: 'X', device: '' }, { userId: 'u1', kind: 'login_failed', at: T('07:59') }],
    usage: [{ userId: 'u1', kind: 'slice', module: 'personal', view: 'board', projectId: '', connectedS: 90, activeS: 70, at: T('08:01') }, { userId: 'u1', kind: 'action', action: 'export_pdf', projectId: 'p1', at: T('08:05') }],
    events: [{ userId: 'u1', at: T('08:06'), source: 'crm', label: 'CRM', detail: 'Eduarda moveu "X" de Lead para Contrato' }, { userId: 'u2', at: T('08:40'), source: 'crm', label: 'CRM', detail: 'outra pessoa' }],
    projectNames: { p1: 'ALCAST' },
  };
  const d = buildPersonDay({ id: 'u1', name: 'Eduarda Costa', username: 'edu', role: 'pricetax' }, data, null);
  assert.equal(d.totals.sessions, 1);
  assert.equal(d.totals.operations, 2);
  assert.equal(d.totals.failedLogins, 1);
  assert.equal(d.operations[0].detail, 'ALCAST');
  assert.equal(d.operations[1].detail.includes('outra'), false);
  assert.equal(d.screens.length, 1);
  assert.equal(d.firstMs, T('08:00'));
  assert.equal(d.lastEndKind, 'ultima-atividade');
});

ok('pessoa sem nenhum sinal volta com listas vazias', () => {
  const d = buildPersonDay({ id: 'u9', name: 'Sem Sinal', username: 's', role: 'pricetax' }, { access: [], usage: [], events: [], projectNames: {} }, null);
  assert.equal(d.firstMs, null);
  assert.deepEqual(d.sessions, []);
  assert.equal(d.totals.operations, 0);
});

console.log(`\n${n} verificações ok`);
