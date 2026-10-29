// Estudo de parecer com resposta cortada (2026-10-29): a IA estoura o limite, o SDK lança "Unterminated string in JSON" e o parecer longo falhava para sempre.
// Prova: limite maior (16000), 2ª tentativa enxuta, e erro amigável se cortar de novo. Cliente de IA SIMULADO — a qualidade com a IA real fica sem prova.
//   node scripts/parecer-study-truncation.test.mjs
import { studyOne, friendlyStudyError, STUDY_MAX_TOKENS } from '../server/parecerStudy.js';

let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const study = { number: '1/2026', subject: 'x', executiveSummary: 'y', keyConclusions: ['a'], recommendations: [], themes: ['t'], appliesTo: 'z', usageTriggers: ['u'], legalBasis: [], limits: '' };
const mk = (plan) => { const calls = []; return { calls, messages: { parse: async (req) => { calls.push(req); const step = plan[Math.min(calls.length - 1, plan.length - 1)]; if (step === 'cut') throw new Error('Failed to parse structured output: Error: Failed to parse structured output as JSON: Unterminated string in JSON at position 8916 (line 1 column 8917)'); if (step === 'auth') throw new Error('401 invalid x-api-key'); return { parsed_output: study, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }; } } }; };
const parecer = { title: 'ALCAST-01/2026' }; const buf = Buffer.from('%PDF-fake');
const text = (req) => req.messages[0].content[1].text;

const a = mk(['ok']); const r1 = await studyOne(a, parecer, buf);
ok('sem corte: 1 chamada, limite 16000, sem pedido de versão enxuta', a.calls.length === 1 && a.calls[0].max_tokens === STUDY_MAX_TOKENS && STUDY_MAX_TOKENS === 16000 && !/ENXUTA/.test(text(a.calls[0])) && r1.study.number === '1/2026');
const b = mk(['cut', 'ok']); const r2 = await studyOne(b, parecer, buf);
ok('cortou uma vez: repete 1x pedindo versão ENXUTA e devolve o estudo', b.calls.length === 2 && /ENXUTA/.test(text(b.calls[1])) && !/ENXUTA/.test(text(b.calls[0])) && r2.study.subject === 'x');
const c = mk(['cut']); let err = null; try { await studyOne(c, parecer, buf); } catch (e) { err = e; }
ok('cortou de novo: para em 2 chamadas e a mensagem para o usuário é em português', c.calls.length === 2 && err && /resposta cortada/.test(friendlyStudyError(err.message)), err && err.message);
const d = mk(['auth']); let err2 = null; try { await studyOne(d, parecer, buf); } catch (e) { err2 = e; }
ok('erro de chave NÃO é tratado como corte (1 chamada, sem repetir)', d.calls.length === 1 && err2 && /401/.test(err2.message));
console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
