// Boas-vindas obrigatória de lançamento (shared/launchTour.js) e guia do painel no prompt da RENATA.
import { LAUNCH_TOUR_ID, launchTourPending, newsFor, LAUNCH_NEWS, LAUNCH_ASK_EXAMPLES, PANEL_GUIDE } from '../shared/launchTour.js';
import { buildSystem } from '../server/renata/agent.js';
let failed = 0;
const ok = (name, cond, extra) => { console.log(`${cond ? 'ok  ' : 'FALHA'} ${name}`); if (!cond) { failed++; if (extra !== undefined) console.log(extra); } };

ok('equipe sem registro vê', launchTourPending({ role: 'pricetax', preferences: {} }) && launchTourPending({ role: 'master', preferences: null }));
ok('cliente nunca vê', !launchTourPending({ role: 'cliente', preferences: {} }));
ok('quem concluiu não vê de novo', !launchTourPending({ role: 'pricetax', preferences: { tours: { [LAUNCH_TOUR_ID]: '2026-11-03T08:00:00Z' } } }));
ok('rodada antiga concluída não dispensa a nova', launchTourPending({ role: 'pricetax', preferences: { tours: { 'outra-rodada': '2026-01-01' } } }));
ok('Operações não vê o cartão do CRM', newsFor(false).length === 3 && !newsFor(false).some((n) => /CRM/.test(n.title)) && newsFor(true).length === 4);
ok('4 novidades e exemplos para a RENATA', LAUNCH_NEWS.length === 4 && LAUNCH_ASK_EXAMPLES.length >= 3);
const sys = buildSystem({ user: { name: 'Ana', role: 'pricetax' }, today: '2026-11-03', context: null })[0].text;
ok('RENATA recebe o guia do painel', sys.includes('GUIA DO PAINEL') && sys.includes('Configurar › Assinatura') && sys.includes('9g. COMO USAR O PAINEL'));
ok('guia cita os caminhos principais', ['Conectar o Gmail', 'Empresa fora do CRM', 'Novo compromisso', 'aba "Cofre"', 'Personalizar'].every((t) => PANEL_GUIDE.includes(t)));
console.log(failed ? `\n${failed} falha(s).` : '\nTodas as verificações passaram.');
process.exit(failed ? 1 : 0);
