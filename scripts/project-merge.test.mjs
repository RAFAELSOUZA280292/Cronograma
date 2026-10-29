// Teste descartável da fusão de três vias da EMPRESA (A3, 2026-10-29): duas pessoas editando a mesma empresa não se apagam.
import assert from 'node:assert/strict';
import { mergeProjects } from '../src/personal/boardMerge.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const act = (id, extra = {}) => ({ id, title: `Atividade ${id}`, status: 'pending', date: '2026-11-01', responsible: 'Ana', subactivities: [], ...extra });
const base = { id: 'p1', company: { name: 'ACME', cnpj: '1' }, team: [{ id: 't1', name: 'Ana' }], phases: [{ id: 'f1', name: 'Fase 1' }],
  activities: [act('a1'), act('a2'), act('a3', { subactivities: [{ id: 's1', title: 'Sub 1', done: false }, { id: 's2', title: 'Sub 2', done: false }] })],
  meetings: [{ id: 'm1', title: 'Kickoff', transcript: 'x', actionItems: [{ id: 'i1', title: 'Tarefa 1', status: 'nao-iniciado' }, { id: 'i2', title: 'Tarefa 2', status: 'nao-iniciado' }] }],
  log: [{ ts: '2026-10-01T10:00:00Z', action: 'antiga', user: 'x' }] };

// 1) cada um mexe numa atividade diferente
let mine = clone(base); mine.activities[0].status = 'done';
let theirs = clone(base); theirs.activities[1].title = 'Renomeada por outra pessoa';
let r = mergeProjects(base, mine, theirs);
ok(r.activities[0].status === 'done' && r.activities[1].title === 'Renomeada por outra pessoa', 'edições em atividades diferentes: as duas valem');
ok(r.activities.length === 3 && r.meetings.length === 1, 'nada some');

// 2) campos diferentes da MESMA atividade
mine = clone(base); mine.activities[0].status = 'done';
theirs = clone(base); theirs.activities[0].date = '2026-12-10'; theirs.activities[0].responsible = 'Bia';
r = mergeProjects(base, mine, theirs);
ok(r.activities[0].status === 'done' && r.activities[0].date === '2026-12-10' && r.activities[0].responsible === 'Bia', 'campos diferentes da mesma atividade: fundidos');

// 3) mesmo campo: vence quem está gravando
mine = clone(base); mine.activities[0].title = 'Minha';
theirs = clone(base); theirs.activities[0].title = 'Deles';
ok(mergeProjects(base, mine, theirs).activities[0].title === 'Minha', 'mesmo campo: vence quem grava');

// 4) os dois criam atividades novas
mine = clone(base); mine.activities.push(act('a4', { title: 'Minha nova' }));
theirs = clone(base); theirs.activities.push(act('a5', { title: 'Nova deles' }));
r = mergeProjects(base, mine, theirs);
ok(r.activities.map((a) => a.id).sort().join() === 'a1,a2,a3,a4,a5', 'as duas novas ficam');

// 5) um exclui (soft) e o outro edita OUTRA atividade; um exclui e o outro edita a MESMA
mine = clone(base); mine.activities[1].deleted = true;
theirs = clone(base); theirs.activities[0].status = 'done';
r = mergeProjects(base, mine, theirs);
ok(r.activities[1].deleted === true && r.activities[0].status === 'done', 'exclusão lógica e edição de outra atividade convivem');
theirs = clone(base); theirs.activities[1].notes = 'nota deles';
r = mergeProjects(base, mine, theirs);
ok(r.activities[1].deleted === true && r.activities[1].notes === 'nota deles', 'exclusão lógica + edição da mesma: as duas valem');

// 6) subatividades e tarefas de reunião
mine = clone(base); mine.activities[2].subactivities[0].done = true;
theirs = clone(base); theirs.activities[2].subactivities[1].done = true; theirs.activities[2].subactivities.push({ id: 's3', title: 'Sub 3', done: false });
r = mergeProjects(base, mine, theirs);
ok(r.activities[2].subactivities.map((s) => `${s.id}:${s.done}`).join() === 's1:true,s2:true,s3:false', 'subatividades fundidas por id');
mine = clone(base); mine.meetings[0].actionItems[0].status = 'concluido';
theirs = clone(base); theirs.meetings[0].actionItems[1].responsible = 'Carla'; theirs.meetings.push({ id: 'm2', title: 'Nova reunião', actionItems: [] });
r = mergeProjects(base, mine, theirs);
ok(r.meetings[0].actionItems[0].status === 'concluido' && r.meetings[0].actionItems[1].responsible === 'Carla' && r.meetings.some((m) => m.id === 'm2'), 'tarefas de reunião e reunião nova fundidas');

// 7) log: união, sem duplicar, ordenado e limitado
mine = clone(base); mine.log = [{ ts: '2026-10-29T10:00:00Z', action: 'minha', user: 'Eu' }, ...base.log];
theirs = clone(base); theirs.log = [{ ts: '2026-10-29T11:00:00Z', action: 'deles', user: 'Ela' }, ...base.log];
r = mergeProjects(base, mine, theirs);
ok(r.log.map((e) => e.action).join() === 'deles,minha,antiga', 'log: união ordenada, sem duplicar');
const big = clone(base); big.log = Array.from({ length: 300 }, (_, i) => ({ ts: `2026-09-${String(10 + (i % 18)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`, action: `l${i}`, user: 'x' }));
mine = clone(big); mine.log.unshift({ ts: '2026-10-30T00:00:00Z', action: 'novo-meu', user: 'x' }); theirs = clone(big); theirs.log.unshift({ ts: '2026-10-30T01:00:00Z', action: 'novo-deles', user: 'x' });
ok(mergeProjects(big, mine, theirs).log.length <= 300, 'log nunca passa de 300');

// 8) a mesma alteração dos dois lados (ex.: resposta do servidor adotada pela tela) não duplica nada
mine = clone(base); mine.activities.push(act('a9')); theirs = clone(mine);
r = mergeProjects(base, mine, theirs);
ok(r.activities.filter((a) => a.id === 'a9').length === 1 && r.activities.length === 4, 'mudança idêntica dos dois lados não duplica');

// 9) sem mudança minha → vale o servidor; sem mudança dele → vale a minha
theirs = clone(base); theirs.company.name = 'ACME 2';
ok(mergeProjects(base, clone(base), theirs).company.name === 'ACME 2', 'só o servidor mudou: vale o servidor');
mine = clone(base); mine.company.name = 'Meu nome';
ok(mergeProjects(base, mine, clone(base)).company.name === 'Meu nome', 'só eu mudei: vale a minha');

// 10) um apagou de vez, o outro não mexeu → some; o outro editou → fica
mine = clone(base); mine.activities = mine.activities.filter((a) => a.id !== 'a2');
r = mergeProjects(base, mine, clone(base));
ok(!r.activities.some((a) => a.id === 'a2'), 'apaguei de vez e ninguém mexeu: some');
theirs = clone(base); theirs.activities[1].title = 'editada';
r = mergeProjects(base, mine, theirs);
ok(r.activities.some((a) => a.id === 'a2' && a.title === 'editada'), 'apaguei, mas a outra pessoa editou: a edição dela fica');

// 11) reordenação de quem grava vale quando o outro não reordenou
mine = clone(base); mine.activities = [mine.activities[2], mine.activities[0], mine.activities[1]];
theirs = clone(base); theirs.activities[0].status = 'done';
r = mergeProjects(base, mine, theirs);
ok(r.activities.map((a) => a.id).join() === 'a3,a1,a2' && r.activities[1].status === 'done', 'minha ordem + edição dele');

// 12) listas de texto (participantes) e base ausente
mine = clone(base); mine.meetings[0].participants = ['Ana', 'Bia']; theirs = clone(base); theirs.meetings[0].participants = ['Ana', 'Carla'];
r = mergeProjects(base, mine, theirs);
ok(['Ana', 'Bia', 'Carla'].every((x) => r.meetings[0].participants.includes(x)), 'participantes: união');
ok(mergeProjects(undefined, mine, theirs) && mergeProjects(base, mine, null) === mine && mergeProjects(base, null, theirs) === theirs, 'bordas');
ok(JSON.stringify(base).includes('Atividade a1') && base.activities[0].status === 'pending', 'não muta a base');
console.log(`project-merge: ${n} checagens OK`);
