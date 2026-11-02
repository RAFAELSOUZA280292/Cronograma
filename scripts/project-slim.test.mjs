// Lista de empresas sem a transcrição das reuniões e gravação que nunca a apaga (server/projectSlim.js, §138).
import assert from 'node:assert/strict';
import { slimProject, restoreStripped, meetingTranscript } from '../server/projectSlim.js';
import { applyClientWrite } from '../server/clientView.js';
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const longa = 'Fala 1: '.repeat(5000);
const db = { id: 'p1', meetings: [{ id: 'm1', title: 'Kickoff', transcript: longa, summary: 'ok' }, { id: 'm2', title: 'Sem transcrição', transcript: '' }, { id: 'm3', title: 'Antiga' }] };

ok('lista vai sem a transcrição, com marca e tamanho', () => {
  const s = slimProject(db);
  assert.equal(s.meetings[0].transcript, undefined);
  assert.equal(s.meetings[0].transcriptStripped, true);
  assert.equal(s.meetings[0].transcriptLen, longa.length);
  assert.equal(s.meetings[0].summary, 'ok');
  assert.deepEqual(s.meetings[1], db.meetings[1]);
  assert.deepEqual(s.meetings[2], db.meetings[2]);
  assert.equal(db.meetings[0].transcript, longa, 'não altera o original');
});
ok('gravar a empresa vinda da lista mantém a transcrição guardada', () => {
  const daTela = slimProject(db);
  daTela.meetings[0].summary = 'resumo editado';
  const salvo = restoreStripped(db, daTela);
  assert.equal(salvo.meetings[0].transcript, longa);
  assert.equal(salvo.meetings[0].summary, 'resumo editado');
  assert.ok(!('transcriptStripped' in salvo.meetings[0]) && !('transcriptLen' in salvo.meetings[0]), 'marcas não vão para o banco');
});
ok('reunião nova e transcrição enviada de propósito ficam como vieram', () => {
  const daTela = { ...slimProject(db), meetings: [...slimProject(db).meetings, { id: 'm9', title: 'Nova', transcript: 'texto novo' }] };
  daTela.meetings[1] = { ...daTela.meetings[1], transcript: 'colada agora' };
  const salvo = restoreStripped(db, daTela);
  assert.equal(salvo.meetings[3].transcript, 'texto novo');
  assert.equal(salvo.meetings[1].transcript, 'colada agora');
});
ok('marcada mas a reunião sumiu do banco: transcrição vazia, sem erro', () => {
  const salvo = restoreStripped({ meetings: [] }, slimProject(db));
  assert.equal(salvo.meetings[0].transcript, '');
});
ok('cliente continua sem ver e sem conseguir apagar a transcrição', () => {
  const salvo = applyClientWrite(db, restoreStripped(db, slimProject(db)));
  assert.equal(salvo.meetings[0].transcript, longa);
});
ok('busca a transcrição de uma reunião', () => {
  assert.equal(meetingTranscript(db, 'm1'), longa);
  assert.equal(meetingTranscript(db, 'm3'), '');
  assert.equal(meetingTranscript(db, 'nao-existe'), null);
});
ok('lista pesada encolhe', () => {
  const big = JSON.stringify(db).length; const slim = JSON.stringify(slimProject(db)).length;
  assert.ok(slim < big / 10, `${slim} vs ${big}`);
});
console.log(`\n${n} verificações da lista leve passaram.`);
