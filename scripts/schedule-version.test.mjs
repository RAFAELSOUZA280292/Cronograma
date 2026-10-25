// Testes do versionamento do cronograma (sem banco): comparação, restauração, desfazer e integridade. Rodar: node scripts/schedule-version.test.mjs
import assert from 'node:assert/strict';
import { diffSchedules, restoreSchedule, scheduleOf, statsOf, validateSchedule } from '../shared/scheduleVersion.js';

let n = 0; const ok = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const sub = (id, o = {}) => ({ id, title: `Sub ${id}`, done: false, ...o });
const act = (id, o = {}) => ({ id, title: `Atividade ${id}`, phase: 1, date: '2026-11-10', endDate: '2026-11-10', status: 'nao-iniciado', responsible: 'Compras', comments: [], attachments: [], subactivities: [], ...o });
const base = () => ({
  id: 'proj-1', company: { name: 'Acme' }, log: [{ ts: '2026-10-01T00:00:00Z', action: 'x', user: 'Ana' }], meetings: [],
  phases: [{ id: 1, name: 'Leitura', color: '#fff' }, { id: 2, name: 'Mão na massa', color: '#000' }],
  team: ['PRICETAX', 'Compras', { id: 'u1', name: 'Bia' }],
  activities: [act('a1', { subactivities: [sub('s1', { kind: 'reuniao', date: '2026-11-10' }), sub('s2', { pautaDe: 's1', date: '2026-11-10' })] }), act('a2', { phase: 2, date: '2026-12-01', endDate: '2026-12-01' })],
});

ok('comparação: campo a campo com valor anterior e posterior, nomes legíveis', () => {
  const a = base(); const b = clone(a);
  b.activities[0].date = '2026-11-12'; b.activities[0].status = 'concluido'; b.activities[0].responsible = 'Fiscal';
  const d = diffSchedules(a, b);
  assert.equal(d.summary.activitiesChanged, 1);
  const f = Object.fromEntries(d.activities[0].fields.map((x) => [x.field, x]));
  assert.deepEqual([f.date.label, f.date.before, f.date.after], ['Data', '2026-11-10', '2026-11-12']);
  assert.equal(f.status.after, 'concluido'); assert.equal(f.responsible.before, 'Compras');
});

ok('comparação: atividade e subatividade criadas, removidas e movidas', () => {
  const a = base(); const b = clone(a);
  b.activities.push(act('a3')); b.activities = b.activities.filter((x) => x.id !== 'a2');
  b.activities[0].subactivities.push(sub('s9'));
  const moved = b.activities[0].subactivities.splice(1, 1)[0]; b.activities.find((x) => x.id === 'a3').subactivities.push(moved);
  const d = diffSchedules(a, b);
  assert.equal(d.summary.activitiesAdded, 1); assert.equal(d.summary.activitiesRemoved, 1);
  assert.equal(d.summary.subsAdded, 1); assert.equal(d.summary.subsMoved, 1);
  assert.equal(d.activities.find((x) => x.id === 'a3').subs[0].from.id, 'a1');
});

ok('comparação: ausente, vazio e falso são iguais (não vira alteração falsa); lixeira conta', () => {
  const a = base(); const b = clone(a);
  b.activities[1].notes = ''; b.activities[1].deleted = false; b.activities[1].links = [];
  assert.equal(diffSchedules(a, b).summary.total, 0);
  b.activities[1].deleted = true; b.activities[1].deletedAt = '2026-10-25T00:00:00Z';
  const d = diffSchedules(a, b);
  assert.equal(d.activities[0].fields.length, 1); assert.equal(d.activities[0].fields[0].label, 'Na lixeira');
});

ok('comparação: comentários e anexos aparecem como contagem; fases, equipe e ordem', () => {
  const a = base(); const b = clone(a);
  b.activities[0].comments.push({ id: 'c1', text: 'oi' });
  b.phases[1].name = 'Outra'; b.team.push('TI'); b.activities.reverse();
  const d = diffSchedules(a, b);
  assert.deepEqual(d.activities.find((x) => x.id === 'a1').fields[0], { field: 'comments', label: 'Comentários', before: 0, after: 1, kind: 'count' });
  assert.equal(d.summary.phasesChanged, 1); assert.deepEqual(d.team.added, ['TI']); assert.equal(d.summary.orderChanged, true);
});

ok('restaurar tudo: volta datas/status e NÃO apaga nada — o que nasceu depois vai para a lixeira', () => {
  const snap = scheduleOf(base());
  const cur = base();
  cur.activities[0].date = '2027-01-05'; cur.activities[0].subactivities[0].title = 'Renomeada';
  cur.activities.push(act('a3', { title: 'Nova depois', phase: 3, subactivities: [sub('s7')] })); cur.phases.push({ id: 3, name: 'Fase 3' });
  cur.activities[0].subactivities.push(sub('s8', { title: 'Sub nova' }));
  const out = restoreSchedule(cur, snap, { by: 'Teste', now: '2026-10-25T10:00:00Z' });
  assert.deepEqual(out.report.errors, []);
  const byId = Object.fromEntries(out.data.activities.map((a) => [a.id, a]));
  assert.equal(byId.a1.date, '2026-11-10'); assert.equal(byId.a1.subactivities[0].title, 'Sub s1');
  assert.equal(byId.a3.deleted, true); assert.equal(byId.a3.deletedBy, 'Teste'); assert.equal(byId.a3.title, 'Nova depois');
  assert.equal(byId.a1.subactivities.find((s) => s.id === 's8').deleted, true);
  assert.ok(out.data.phases.some((p) => p.id === 3), 'fase usada pela atividade na lixeira continua existindo');
  assert.equal(out.report.activitiesToTrash, 1); assert.equal(out.report.subsToTrash, 1);
  assert.deepEqual(out.data.log, cur.log); assert.equal(out.data.company.name, 'Acme');
});

ok('restaurar: comentários, anexos e links de hoje são mantidos (a versão antiga não os apaga)', () => {
  const snap = scheduleOf(base());
  const cur = base();
  cur.activities[0].comments.push({ id: 'c1', text: 'feito hoje' }); cur.activities[0].links = [{ id: 'l1', url: 'https://x' }];
  cur.activities[0].subactivities[1].comments = [{ id: 'c2', text: 'na sub' }];
  cur.activities[0].title = 'Título mudou';
  const out = restoreSchedule(cur, snap, {});
  const a1 = out.data.activities[0];
  assert.equal(a1.title, 'Atividade a1'); assert.equal(a1.comments.length, 1); assert.equal(a1.links.length, 1);
  assert.equal(a1.subactivities[1].comments.length, 1); assert.equal(out.report.preservedCollaboration, 3);
});

ok('restaurar: desfazer a restauração (voltar ao backup) devolve exatamente o estado anterior', () => {
  const snap = scheduleOf(base());
  const cur = base();
  cur.activities[0].date = '2027-01-05'; cur.activities.push(act('a3', { subactivities: [sub('s7')] })); cur.activities[1].responsible = 'TI';
  const backup = scheduleOf(cur);
  const r1 = restoreSchedule(cur, snap, {}).data;
  const r2 = restoreSchedule(r1, backup, {}).data;
  const d = diffSchedules(scheduleOf(cur), scheduleOf(r2));
  assert.equal(d.summary.total, 0, JSON.stringify(d.summary));
  assert.deepEqual(statsOf(r2), statsOf(cur));
});

ok('restaurar: duas vezes seguidas dá o mesmo resultado (idempotente)', () => {
  const snap = scheduleOf(base()); const cur = base(); cur.activities[0].date = '2027-02-02';
  const once = restoreSchedule(cur, snap, { now: 'T' }).data;
  const twice = restoreSchedule(once, snap, { now: 'T' }).data;
  assert.equal(diffSchedules(scheduleOf(once), scheduleOf(twice)).summary.total, 0);
});

ok('restaurar parcial: só a atividade escolhida volta; as outras ficam como estão', () => {
  const snap = scheduleOf(base()); const cur = base();
  cur.activities[0].date = '2027-03-03'; cur.activities[1].date = '2027-04-04';
  const out = restoreSchedule(cur, snap, { activityIds: ['a1'] });
  assert.equal(out.data.activities[0].date, '2026-11-10'); assert.equal(out.data.activities[1].date, '2027-04-04');
  assert.equal(out.report.partial, true); assert.equal(out.report.restoredActivities, 1);
  assert.ok(restoreSchedule(cur, snap, { activityIds: ['nao-existe'] }).report.errors.length === 1);
});

ok('integridade: pauta que aponta para reunião inexistente é desvinculada e avisada', () => {
  const snap = scheduleOf(base());
  const cur = base();
  cur.activities[1].subactivities = [sub('s5', { pautaDe: 's1' })];
  cur.activities[0].subactivities = cur.activities[0].subactivities.filter((s) => s.id !== 's1');
  cur.activities[0].subactivities.forEach((s) => { if (s.pautaDe === 's1') s.pautaDe = ''; });
  // restaurar só a a2 da versão antiga não traz s5 (nasceu depois) -> vai para a lixeira, sem vínculo vivo
  const out = restoreSchedule(cur, snap, { activityIds: ['a2'] });
  const s5 = out.data.activities.find((a) => a.id === 'a2').subactivities[0];
  assert.equal(s5.deleted, true);
  // pauta viva apontando para reunião excluída: corrigida
  const v = validateSchedule({ ...base(), activities: [act('x', { subactivities: [sub('i1', { pautaDe: 'fantasma' })] })] }, { fix: true });
  assert.equal(v.data.activities[0].subactivities[0].pautaDe, ''); assert.equal(v.fixes.length, 1);
});

ok('integridade: id repetido bloqueia (erro), tarefa de reunião órfã vira aviso', () => {
  const dup = base(); dup.activities.push(act('a1'));
  assert.ok(validateSchedule(dup).errors.some((e) => e.includes('repetida')));
  const dupSub = base(); dupSub.activities[1].subactivities.push(sub('s1'));
  assert.ok(validateSchedule(dupSub).errors.some((e) => e.includes('Subatividade repetida')));
  const orphan = base(); orphan.meetings = [{ id: 'm1', actionItems: [{ id: 't1', activityId: 'sumiu' }, { id: 't2', activityId: 'a1' }] }];
  const v = validateSchedule(orphan);
  assert.deepEqual(v.errors, []); assert.ok(v.warnings.some((w) => w.startsWith('1 tarefa')));
});

ok('restaurar: subatividade que foi movida de atividade volta ao lugar sem duplicar', () => {
  const snap = scheduleOf(base());
  const cur = base();
  const moved = cur.activities[0].subactivities.splice(1, 1)[0]; cur.activities[1].subactivities.push(moved);
  const out = restoreSchedule(cur, snap, {});
  assert.deepEqual(out.report.errors, []);
  const ids = out.data.activities.flatMap((a) => a.subactivities.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(out.data.activities[0].subactivities.some((s) => s.id === 's2'));
});

ok('restaurar: responsável que existia só hoje continua na equipe; fases usadas não somem', () => {
  const snap = scheduleOf(base()); const cur = base();
  cur.team.push('Novo Gestor'); cur.activities[1].responsible = 'Novo Gestor';
  const out = restoreSchedule(cur, snap, {});
  assert.ok(out.data.team.includes('Novo Gestor'));
  assert.equal(out.data.team.filter((m) => m === 'Compras').length, 1);
});

ok('estatísticas: conta só o que está vivo (lixeira fora)', () => {
  const b = base(); b.activities[0].subactivities[1].done = true; b.activities[1].deleted = true;
  assert.deepEqual(statsOf(b), { activities: 1, subs: 2, done: 1 });
});

console.log(`\n${n} testes ok`);
