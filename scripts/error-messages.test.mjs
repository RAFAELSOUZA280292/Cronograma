// Mensagens de erro em português claro (§96): função pura do servidor + do navegador, e um teste HTTP de JSON quebrado.
//   BASE=http://localhost:3001 node scripts/error-messages.test.mjs
import { describeError, apiErrorHandler, newRef } from '../server/errorHandler.js';
import { friendlyMessage } from '../src/lib/api.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };
const BAD = /Unexpected|SyntaxError|stack|ECONN|constraint|violates|relation|column|at async|Error:/i;

const cases = [
  [{ type: 'entity.too.large' }, 413], [{ type: 'entity.parse.failed', message: 'Unexpected token } in JSON at position 5' }, 400],
  [{ status: 403, message: 'Você não tem permissão pra isso no CRM.' }, 403], [{ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, 409],
  [{ code: '23503', message: 'violates foreign key constraint' }, 409], [{ code: '23502', message: 'null value in column "mrr" violates not-null constraint' }, 400],
  [{ code: '22P02', message: 'invalid input syntax for type uuid: "abc"' }, 400], [{ code: '57014', message: 'canceling statement due to statement timeout' }, 503],
  [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }, 503], [{ message: 'Connection terminated unexpectedly' }, 503], [new TypeError("Cannot read properties of undefined (reading 'x')"), 500],
];
for (const [err, status] of cases) {
  const d = describeError(err);
  ok(`${err.code || err.type || err.status || err.name || 'erro'} → ${status}, mensagem sem jargão técnico`, d.status === status && !BAD.test(d.message) && d.message.length > 20 && /[a-zà-ú]/.test(d.message), d);
}
// middleware: 5xx traz código de suporte e o mesmo código vai ao log; 4xx não expõe código
const run = (err) => { const out = { logs: [] }; const orig = console.error; console.error = (...a) => out.logs.push(a.join(' ')); const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } }; apiErrorHandler(err, { method: 'POST', originalUrl: '/api/x?token=segredo', user: { id: 'u1' } }, res, () => {}); console.error = orig; return out; };
const e500 = run(new Error('boom interno'));
ok('erro inesperado: 500, mensagem com código e `ref` iguais ao do log', e500.status === 500 && /\(código [0-9A-F]{6}\)/.test(e500.body.message) && e500.logs.some((l) => l.includes(`[erro ${e500.body.ref}]`)) && !BAD.test(e500.body.message), e500);
ok('o log não leva a query string (pode ter token) e identifica o usuário', e500.logs[0].includes('POST /api/x') && !e500.logs[0].includes('segredo') && e500.logs[0].includes('user=u1'), e500.logs[0]);
const e403 = run({ status: 403, message: 'Sem permissão.' });
ok('erro de validação 4xx: mensagem do servidor, sem código e sem log de erro', e403.status === 403 && e403.body.message === 'Sem permissão.' && !e403.body.ref && e403.logs.length === 0, e403);
ok('códigos de suporte são curtos e variam', newRef().length === 6 && newRef() !== newRef());
// navegador
for (const st of [401, 403, 404, 409, 413, 429, 500, 502, 503, 504]) { const m = friendlyMessage(st, ''); ok(`navegador: status ${st} sem texto do servidor vira mensagem clara`, m.length > 25 && !BAD.test(m) && !/^Erro/.test(m), m); }
ok('navegador: a mensagem do servidor tem prioridade', friendlyMessage(400, 'Informe o título.') === 'Informe o título.');
// HTTP: JSON quebrado
if (process.env.BASE) {
  const r = await fetch(`${process.env.BASE}/api/crm/deals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title": ' });
  const j = await r.json().catch(() => ({}));
  ok('HTTP: JSON quebrado → 400 em português (sem "Unexpected token")', r.status === 400 && !BAD.test(j.message || '') && /incompletos/.test(j.message || ''), { status: r.status, j });
  const r2 = await fetch(`${process.env.BASE}/api/rota-que-nao-existe`);
  ok('HTTP: rota inexistente → 404 em JSON', r2.status === 404 && (await r2.json()).message === 'Rota não encontrada.');
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes de mensagens de erro ok');
process.exit(failed ? 1 : 0);
