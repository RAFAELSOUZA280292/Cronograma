// Testes dos cálculos da Central de Inteligência Operacional (sem banco). Rodar: node scripts/usage-metrics.test.mjs
import assert from 'node:assert/strict';
import { BASIS, activityIndex, aggregateMap, combineDays, dayOf, detectAlerts, estimateActiveSeconds, haversineKm, heatFromTimestamps, hourOf, maskIp, pctChange, sessionize, summarizeSlices } from '../shared/usageMetrics.js';
import { sanitizeSlices } from '../server/usageLog.js';
import { UsageTracker } from '../src/lib/usageTracker.js';

const T = (iso) => Date.parse(iso);
let n = 0; const ok = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

ok('fuso: dia e hora seguem Brasília (UTC-3), inclusive na virada do dia', () => {
  assert.equal(dayOf(T('2026-10-20T02:30:00Z')), '2026-10-19');
  assert.equal(hourOf(T('2026-10-20T02:30:00Z')), 23);
  assert.equal(dayOf(T('2026-10-20T03:00:00Z')), '2026-10-20');
});

ok('sessões: lacuna de 30 min separa, 30 min exatos não', () => {
  const s = sessionize([T('2026-10-20T12:00:00Z'), T('2026-10-20T12:30:00Z'), T('2026-10-20T13:01:00Z')]);
  assert.equal(s.length, 2); assert.equal(s[0].count, 2); assert.equal(s[1].count, 1);
});

ok('estimativa: intervalo limitado a 5 min, cauda de 1 min por sessão', () => {
  // eventos em 0, 2, 20 min (mesma sessão: lacunas <= 30): 2 + min(18,5)=5 + cauda 1 = 8 min
  const t0 = T('2026-10-20T12:00:00Z');
  assert.equal(estimateActiveSeconds([t0, t0 + 120000, t0 + 1200000]), 120 + 300 + 60);
  assert.equal(estimateActiveSeconds([]), 0);
  assert.equal(estimateActiveSeconds([t0]), 60);
  // lacuna > 30 min vira nova sessão: duas caudas
  assert.equal(estimateActiveSeconds([t0, t0 + 3600000]), 120);
});

ok('fatias medidas: ativo nunca passa do conectado, ocioso = conectado - ativo, por módulo/projeto/hora', () => {
  const at = T('2026-10-20T15:00:00Z'); // terça 12h em Brasília
  const s = summarizeSlices([
    { at, connectedS: 60, activeS: 45, module: 'company', view: 'table', projectId: 'p1' },
    { at, connectedS: 30, activeS: 99, module: 'crm', view: '', projectId: '' },
  ]);
  assert.equal(s.connectedS, 90); assert.equal(s.activeS, 75); assert.equal(s.idleS, 15);
  assert.equal(s.modules.company, 45); assert.equal(s.modules.crm, 30); assert.equal(s.projects.p1, 45);
  assert.equal(s.hours[2][12], 75);
});

ok('índice de atividade: razão ativo/conectado, nulo sem medição', () => {
  assert.equal(activityIndex(100, 62), 62); assert.equal(activityIndex(0, 0), null);
});

ok('combinar dias: medido vence estimado, estimado cobre o resto, sem evidência fica fora', () => {
  const real = { '2026-10-20': { connectedS: 3600, activeS: 2400 } };
  const ev = [T('2026-10-20T13:00:00Z'), T('2026-10-21T13:00:00Z'), T('2026-10-21T13:02:00Z')];
  const c = combineDays(real, ev);
  const d20 = c.rows.find((r) => r.date === '2026-10-20'); const d21 = c.rows.find((r) => r.date === '2026-10-21');
  assert.equal(d20.basis, BASIS.real); assert.equal(d20.activeS, 2400);
  assert.equal(d21.basis, BASIS.estimado); assert.equal(d21.activeS, 120 + 60); assert.equal(d21.connectedS, null);
  assert.equal(c.realActiveS, 2400); assert.equal(c.estimatedActiveS, 180); assert.equal(c.realDays, 1); assert.equal(c.estimatedDays, 1);
});

ok('mapa de calor conta por dia da semana e hora', () => {
  const m = heatFromTimestamps([T('2026-10-20T15:10:00Z'), T('2026-10-20T15:50:00Z')]);
  assert.equal(m[2][12], 2);
});

ok('haversine: Curitiba–São Paulo ≈ 340 km; Curitiba–Lisboa > 7.000 km', () => {
  const cwb = { lat: -25.43, lng: -49.27 }; const sp = { lat: -23.55, lng: -46.63 }; const lis = { lat: 38.72, lng: -9.14 };
  const d = haversineKm(cwb, sp); assert.ok(d > 330 && d < 360, String(d));
  assert.ok(haversineKm(cwb, lis) > 7000);
});

ok('IP mascarado: v4 esconde o último bloco, v6 esconde o final', () => {
  assert.equal(maskIp('203.0.113.77'), '203.0.113.•••'); assert.ok(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348').endsWith('••••')); assert.equal(maskIp(''), '');
});

ok('mapa agregado: junta por local aproximado, conta usuários e separa quem não tem coordenadas', () => {
  const ev = [
    { userId: 'a', userName: 'Ana', at: 1, lat: -25.4284, lng: -49.2733, city: 'Curitiba', region: 'PR', country: 'Brazil', device: 'Chrome · macOS' },
    { userId: 'a', userName: 'Ana', at: 5, lat: -25.4290, lng: -49.2730, city: 'Curitiba', region: 'PR', country: 'Brazil', device: 'Chrome · macOS' },
    { userId: 'b', userName: 'Bia', at: 3, lat: -23.55, lng: -46.63, city: 'São Paulo', region: 'SP', country: 'Brazil', device: '' },
    { userId: 'b', userName: 'Bia', at: 4, lat: null, lng: null, city: '', region: '', country: '', device: '' },
  ];
  const m = aggregateMap(ev);
  assert.equal(m.points.length, 2); assert.equal(m.points[0].count, 2); assert.equal(m.points[0].users[0].name, 'Ana'); assert.equal(m.withoutCoords, 1);
  assert.equal(m.points[0].lat, -25.43); // arredondado: nunca coordenada exata
});

const base = (userId, i, extra = {}) => ({ userId, userName: 'Ana', kind: 'visit', at: T('2026-07-01T15:00:00Z') + i * 86400000, ip: '200.1.1.1', city: 'Curitiba', region: 'PR', country: 'Brazil', lat: -25.43, lng: -49.27, device: 'Chrome · macOS', ...extra });
const NOW = T('2026-10-25T15:00:00Z');
const history = (u) => Array.from({ length: 12 }, (_, i) => base(u, i));

ok('alerta: país novo só depois de histórico mínimo', () => {
  const few = [base('a', 0), base('a', 1), base('a', 80, { country: 'Portugal', city: 'Lisboa', region: 'LI', lat: 38.7, lng: -9.1 })];
  assert.equal(detectAlerts(few, NOW).filter((a) => a.rule === 'novo_pais').length, 0, 'sem histórico não alerta');
  const ev = [...history('a'), base('a', 100, { country: 'Portugal', city: 'Lisboa', region: 'LI', lat: 38.7, lng: -9.1 })];
  const al = detectAlerts(ev, NOW).filter((a) => a.rule === 'novo_pais');
  assert.equal(al.length, 1); assert.equal(al[0].severity, 'alta');
});

ok('alerta: cidade nova e dispositivo novo', () => {
  const ev = [...history('a'), base('a', 100, { city: 'Londrina', lat: -23.3, lng: -51.17, device: 'Firefox · Windows' })];
  const rules = detectAlerts(ev, NOW).map((a) => a.rule);
  assert.ok(rules.includes('nova_cidade')); assert.ok(rules.includes('novo_dispositivo'));
});

ok('alerta: viagem impossível (Curitiba → Lisboa em 2 h) e não dispara em deslocamento plausível', () => {
  const t = T('2026-10-20T12:00:00Z');
  const far = [{ ...base('a', 0), at: t }, { ...base('a', 0), at: t + 2 * 3600000, city: 'Lisboa', region: 'LI', country: 'Portugal', lat: 38.7, lng: -9.1 }];
  assert.equal(detectAlerts(far, NOW).filter((a) => a.rule === 'viagem_impossivel').length, 1);
  const ok2 = [{ ...base('a', 0), at: t }, { ...base('a', 0), at: t + 10 * 3600000, city: 'São Paulo', region: 'SP', lat: -23.55, lng: -46.63 }];
  assert.equal(detectAlerts(ok2, NOW).filter((a) => a.rule === 'viagem_impossivel').length, 0);
});

ok('alerta: 3 falhas de login em 24 h; 2 não alertam', () => {
  const f = (i) => ({ ...base('a', 0), kind: 'login_failed', at: T('2026-10-24T10:00:00Z') + i * 60000 });
  assert.equal(detectAlerts([f(0), f(1)], NOW).filter((a) => a.rule === 'falhas_login').length, 0);
  assert.equal(detectAlerts([f(0), f(1), f(2)], NOW).filter((a) => a.rule === 'falhas_login').length, 1);
});

ok('alerta: um IP errando a senha de 3 contas', () => {
  const f = (u) => ({ ...base(u, 0), userName: u, kind: 'login_failed', at: T('2026-10-24T10:00:00Z'), ip: '45.9.9.9' });
  assert.equal(detectAlerts([f('a'), f('b'), f('c')], NOW).filter((a) => a.rule === 'ip_varios_usuarios').length, 1);
});

ok('alerta: 3 IPs em 1 hora (e IP no texto sai mascarado)', () => {
  const t = T('2026-10-24T10:00:00Z');
  const ev = [0, 1, 2].map((i) => ({ ...base('a', 0), at: t + i * 600000, ip: `200.1.1.${i + 10}` }));
  const al = detectAlerts(ev, NOW).filter((a) => a.rule === 'varios_ips');
  assert.equal(al.length, 1); assert.ok(!/200\.1\.1\.1\d/.test(al[0].detail), 'IP completo vazou no texto');
});

ok('alerta: madrugada só com histórico de 20+ acessos diurnos', () => {
  const day = Array.from({ length: 25 }, (_, i) => base('a', i));
  const night = { ...base('a', 100), at: T('2026-10-24T06:00:00Z') }; // 3h em Brasília
  assert.equal(detectAlerts([...day, night], NOW).filter((a) => a.rule === 'horario_atipico').length, 1);
  assert.equal(detectAlerts([base('a', 0), night], NOW).filter((a) => a.rule === 'horario_atipico').length, 0);
});

ok('comparativo percentual', () => {
  assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(50, 100), -50); assert.equal(pctChange(5, 0), null); assert.equal(pctChange(0, 0), 0);
});

ok('servidor: fatias inválidas são descartadas ou limitadas (nada de conteúdo, texto livre ou tempo absurdo)', () => {
  const now = T('2026-10-25T15:00:00Z');
  const r = sanitizeSlices([
    { module: 'company', view: 'table', projectId: 'proj-abc', connectedS: 60, activeS: 40, at: new Date(now - 30000).toISOString() },
    { module: 'company', view: 'table', projectId: 'p', connectedS: 9999, activeS: 9999 },
    { module: '<script>alert(1)</script>', connectedS: 10, activeS: 5 },
    { module: 'crm', connectedS: -5, activeS: 3 },
    { module: 'crm', connectedS: 'x', activeS: 1 },
    null,
  ], now);
  assert.equal(r.length, 2);
  assert.equal(r[0].connectedS, 60); assert.equal(r[0].activeS, 40);
  assert.equal(r[1].connectedS, 120, 'limita a 120 s por fatia'); assert.equal(r[1].activeS, 120);
  assert.ok(r.every((x) => /^[a-z0-9_:-]*$/.test(x.module + x.view)));
});

ok('rastreador: conta conectado só com a aba visível e ativo só com interação nos últimos 60 s', () => {
  const tr = new UsageTracker(); const ctx = { module: 'company', view: 'table', projectId: 'p1' };
  const t0 = 1_000_000;
  tr.tick(ctx, { visible: true, lastInteractionMs: t0, nowMs: t0 + 15000 });        // ativo
  tr.tick(ctx, { visible: true, lastInteractionMs: t0, nowMs: t0 + 90000 });        // parado há 90 s: conectado, não ativo
  tr.tick(ctx, { visible: false, lastInteractionMs: t0, nowMs: t0 + 105000 });      // aba oculta: nada
  const d = tr.drain();
  assert.equal(d.slices.length, 1); assert.equal(d.slices[0].connectedS, 30); assert.equal(d.slices[0].activeS, 15);
  assert.equal(tr.pending, false);
});

ok('rastreador: troca de módulo/empresa abre outra fatia e fatias longas são partidas em 120 s', () => {
  const tr = new UsageTracker({ tickS: 60 });
  for (let i = 0; i < 5; i += 1) tr.tick({ module: 'agenda', view: '', projectId: '' }, { visible: true, lastInteractionMs: 1e6 + i * 60000, nowMs: 1e6 + i * 60000 });
  tr.tick({ module: 'crm', view: '', projectId: '' }, { visible: true, lastInteractionMs: 1e6, nowMs: 1e6 });
  const d = tr.drain();
  const agenda = d.slices.filter((s) => s.module === 'agenda');
  assert.equal(agenda.reduce((a, s) => a + s.connectedS, 0), 300); assert.ok(agenda.every((s) => s.connectedS <= 120));
  assert.equal(d.slices.filter((s) => s.module === 'crm').length, 1);
  // o que o tracker manda passa pela validação do servidor sem perda
  assert.equal(sanitizeSlices(d.slices, Date.now() + 1).length, d.slices.length);
});

ok('rastreador: ações pontuais entram no envio e o contexto vazio não gera fatia', () => {
  const tr = new UsageTracker(); tr.action('export_pdf', { module: 'company', projectId: 'p1' }, 5);
  tr.tick({ module: '' }, { visible: true, lastInteractionMs: 0, nowMs: 1 });
  const d = tr.drain(); assert.equal(d.actions[0].action, 'export_pdf'); assert.equal(d.slices.length, 0);
});

console.log(`\n${n} testes ok`);
