// RENATA geral não pode mostrar códigos internos [id=…] (2026-10-29): o contexto marca cada fato com o id e ela os repetia ao citar pareceres.
//   node scripts/renata-general-ids.test.mjs
import { stripInternalIds as f } from '../server/assistantGeneral.js';
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const eq = (n, i, o) => { const r = f(i); ok(n, r === o, r); };
eq('tira os dois ids do exemplo real', 'dedicados: "Guia Executivo" [id=akf-fth4akj] e "Caderno Técnico" [id=akf-2nvdjzz]. Resumo', 'dedicados: "Guia Executivo" e "Caderno Técnico". Resumo');
eq('tira id entre parênteses', 'veja o parecer (id=akf-1) agora', 'veja o parecer agora');
eq('tira vários ids no mesmo colchete', 'fontes [id=a1, id=b2]. Fim', 'fontes. Fim');
eq('não mexe em colchetes comuns', 'item [1] e [nota] ficam', 'item [1] e [nota] ficam');
eq('preserva a indentação das listas', '- item\n  - subitem', '- item\n  - subitem');
eq('texto vazio', '', '');
console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
