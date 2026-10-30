// Guia que o botão "Copiar guia de uso" entrega à outra janela do Claude Code (src/connect/guide.js): cada seção só aparece para a chave que pode usá-la,
// e as rotas novas estão no índice público. Rodar: node scripts/connect-guide.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGuide } from '../src/connect/guide.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const base = { baseUrl: 'https://painel.exemplo' };
const full = buildGuide({ ...base, canCreate: true, canWrite: true, canCrm: true, canTranscripts: true, canMeetingsEdit: true, readAll: true, canBoard: true, canTeam: true });
const readAll = buildGuide({ ...base, canCreate: false, readAll: true, canTeam: true });
const only = buildGuide({ ...base, canCreate: false });

ok('chave "Ler e editar tudo" recebe o guia de organizar o quadro e o do dia da equipe', () => {
  for (const k of ['board/plan', 'apply', 'confirm', 'digest', 'Versões', 'responsibles', 'team-day']) assert.ok(full.includes(k), k);
});
ok('chave "Ler tudo" lê o quadro e o dia da equipe, mas não recebe como gravar', () => {
  assert.ok(readAll.includes('team-day') && readAll.includes('board?checklist=1'));
  assert.ok(!readAll.includes('board/plan'));
});
ok('chave só de leitura mais antiga não vê rota de administrador', () => {
  assert.ok(!only.includes('board/plan') && !only.includes('team-day'));
});
ok('o guia nunca carrega a chave e usa a variável de ambiente', () => {
  assert.ok(!/pxk_[A-Za-z0-9_-]{20,}/.test(full));
  assert.ok(full.includes('$PRICETAX_TOKEN'));
});
ok('blocos de código fechados (formatação para colar na conversa)', () => {
  assert.equal((full.match(/```/g) || []).length % 2, 0);
});
ok('o índice público (ENDPOINTS) lista as rotas novas', () => {
  const src = fs.readFileSync(new URL('../server/connect.js', import.meta.url), 'utf8');
  const i = src.indexOf('export const ENDPOINTS');
  const list = src.slice(i, src.indexOf('];', i));
  for (const p of ["'/api/connect/board'", "'/api/connect/board/plan'", "'/api/connect/team-day'"]) assert.ok(list.includes(p), p);
});

console.log(`\n${n} verificações ok`);
