// Auditoria de uma empresa contra o padrão de cronograma (2026-10-19, pedido do Rafael: "um botão para realizar a auditoria e confrontar com o padrão e ver
// atividades ausentes", com comparativo de datas). FUNÇÃO PURA e SOMENTE LEITURA: não altera `data` (corrigir é ação separada, com confirmação — ver
// standardPlanApi.js). O padrão é o MODELO de standardPlan.js (12 atividades do modelo + 3 novas) e as datas-padrão vêm do projeto em branco do db.js
// (`standardData`), passado de fora para o módulo continuar sem dependência de banco e testável.
// Como reconhece uma atividade: (1) marca interna `stdKey` ou título igual → "exato"; (2) título contido no do padrão (ou o contrário) ou descrição igual à do
// padrão → "provável" (conta como presente, mas aparece como "a confirmar"); (3) título só semelhante → "possível" (NÃO conta; vira sugestão na ausente).
// Cada atividade da empresa casa com no máximo uma do padrão.
import { MODEL, NEW_ACTIVITIES, norm, tokens, jaccard, hasSub } from './standardPlan.js';

const arr = (x) => (Array.isArray(x) ? x : []);
const live = (a) => arr(a).filter((x) => x && typeof x === 'object' && !x.deleted);
const dayNum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; };
const toIso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const TOL_DAYS = 7; // até 7 dias de diferença para o padrão conta como "no prazo"
const MAX_SPAN_DAYS = 120; // duração (início → fim) acima disso é suspeita
const MAX_SPREAD_DAYS = 366; // data a mais de 1 ano depois da mais antiga da empresa é suspeita (erro de ano)

function buildStandard(std) {
  const acts = arr(std && std.activities);
  const phaseName = (id) => arr(std && std.phases).find((p) => p.id === id)?.name || '';
  const out = [];
  for (const m of MODEL) {
    const a = acts.find((x) => norm(x.title) === norm(m.title));
    out.push({ key: m.key, title: m.title, kind: 'modelo', oldDesc: m.oldDesc, newDesc: m.newDesc, subs: m.subs, date: (a && a.date) || '', endDate: (a && (a.endDate || a.date)) || '', responsible: (a && a.responsible) || '', phase: a ? phaseName(a.phase) : '' });
  }
  for (const n of NEW_ACTIVITIES) out.push({ key: n.key, title: n.title, kind: 'nova', oldDesc: '', newDesc: n.desc, subs: n.subs, date: '', endDate: '', responsible: n.responsible, phase: n.phaseName, aliases: n.aliases });
  return out;
}

// Padrão a partir de uma versão do cronograma padrão (2026-10-19): cada atividade da versão é uma atividade do padrão; as subatividades vêm da versão.
// `anchor`: 'fixa' quando a maioria das subatividades tem data absoluta (virada ou fixa): essas se comparam em data absoluta; as demais, a partir do kickoff.
// `previous`: dados das versões anteriores, só para reconhecer a descrição antiga do padrão ("padrão antigo, atualizável").
function buildStandardFromVersion(ver, previous) {
  const phaseName = (id) => arr(ver && ver.phases).find((p) => p.id === id)?.name || '';
  const olds = new Map();
  for (const pv of arr(previous)) for (const a of live(pv && pv.activities)) { const k = norm(a.title); if (k && a.desc) olds.set(k, [...(olds.get(k) || []), a.desc]); }
  return live(ver && ver.activities).map((a) => {
    const subs = live(a.subactivities);
    const abs = subs.filter((x) => x.anchor === 'virada' || x.anchor === 'fixa').length;
    return {
      key: a.stdKey || a.id, title: a.title, kind: 'padrao', oldDesc: '', oldDescs: (olds.get(norm(a.title)) || []).filter((d) => norm(d) !== norm(a.desc)), newDesc: a.desc || '',
      subs: subs.map((x) => ({ k: x.id, t: x.title, code: x.code || '' })), date: a.date || '', endDate: a.endDate || a.date || '', responsible: a.responsible || '', phase: phaseName(a.phase), aliases: [],
      anchor: subs.length && abs * 2 > subs.length ? 'fixa' : 'kickoff',
    };
  });
}
const versionSubPresent = (activity, spec) => { const t = tokens(spec.t); return (activity.subactivities || []).some((x) => x && ((spec.code && x.code === spec.code) || x.stdId === spec.k || norm(x.title) === norm(spec.t) || jaccard(t, tokens(x.title)) >= 0.6)); };

const subset = (x, y) => x.size > 0 && [...x].every((t) => y.has(t));

function candidate(S, a) {
  if ((a.stdKey && a.stdKey === S.key) || norm(a.title) === norm(S.title)) return { level: 3, why: 'título igual ao do padrão' };
  const st = tokens(S.title); const at = tokens(a.title);
  const descSim = Math.max(0, ...[S.oldDesc, S.newDesc, ...(S.oldDescs || [])].filter(Boolean).map((d) => jaccard(tokens(d), tokens(a.desc))));
  let r = null;
  if (at.size && (subset(st, at) || subset(at, st))) r = { level: 2, why: 'título parecido com o do padrão' };
  else if (descSim >= 0.8) r = { level: 2, why: 'descrição igual à do padrão' };
  else if (jaccard(st, at) >= 0.34 || (S.aliases && [...at].some((t) => S.aliases.includes(t)))) r = { level: 1, why: 'título semelhante' };
  if (!r) return null;
  return { ...r, descSim };
}

export function auditProject(data, standardData, opts = {}) {
  const todayN = dayNum(opts.today) ?? dayNum(new Date().toISOString().slice(0, 10));
  const fromVersion = !!opts.fromVersion;
  const std = fromVersion ? buildStandardFromVersion(standardData, opts.previous) : buildStandard(standardData);
  const acts = live(data.activities);
  const label = (data.company && (data.company.nomeFantasia || data.company.name)) || 'Empresa';

  // ---- 1) equivalência (cada lado usado uma vez) ----
  const pairs = [];
  for (const S of std) for (const a of acts) {
    const c = candidate(S, a); if (!c) continue;
    const respOk = norm(a.responsible) === norm(S.responsible) ? 2 : 0;
    pairs.push({ S, a, ...c, score: c.level * 10 + respOk + c.descSim });
  }
  pairs.sort((x, y) => y.score - x.score);
  const usedS = new Set(); const usedA = new Set(); const matchBy = new Map();
  for (const p of pairs) {
    if (p.level < 2 || usedS.has(p.S.key) || usedA.has(p.a.id)) continue;
    usedS.add(p.S.key); usedA.add(p.a.id); matchBy.set(p.S.key, p);
  }

  // referência de datas: kickoff da empresa (se casou e tem data) senão a data mais antiga
  // Referência de datas: no modelo antigo, a atividade 'kickoff'; numa versão, a atividade do padrão que anda com o kickoff e tem a data mais cedo.
  const stdKick = fromVersion ? std.filter((x) => x.anchor !== 'fixa' && x.date).sort((x, y) => x.date.localeCompare(y.date))[0] : std.find((s) => s.key === 'kickoff');
  const kickMatch = stdKick ? matchBy.get(stdKick.key) : null;
  const datedAll = acts.map((a) => dayNum(a.date)).filter((n) => n !== null);
  const earliest = datedAll.length ? Math.min(...datedAll) : null;
  const kickN = kickMatch && dayNum(kickMatch.a.date) !== null ? dayNum(kickMatch.a.date) : earliest;
  const stdKickN = dayNum(stdKick && stdKick.date) ?? (fromVersion ? dayNum(standardData && standardData.kickoffDate) : null);

  const matches = []; const missing = [];
  for (const S of std) {
    const p = matchBy.get(S.key);
    if (!p) {
      const near = pairs.find((x) => x.S.key === S.key && x.level === 1 && !usedA.has(x.a.id));
      missing.push({ key: S.key, title: S.title, kind: S.kind, responsible: S.responsible, phase: S.phase, desc: S.newDesc, subs: S.subs.map((x) => x.t), stdDate: S.date, stdEndDate: S.endDate,
        suggestion: near ? { activityId: near.a.id, title: near.a.title, why: near.why } : null });
      continue;
    }
    const a = p.a;
    // datas
    const sN = dayNum(S.date); const aN = dayNum(a.date);
    let dates;
    if (!S.date) dates = { status: aN === null ? 'sem-data' : 'padrao-sem-data', company: a.date || '', companyEnd: a.endDate || a.date || '', std: '', stdRel: '', diffRel: null, diffAbs: null };
    else {
      const absolute = S.anchor === 'fixa';
      const stdRelN = absolute ? sN : (kickN !== null && stdKickN !== null && sN !== null ? kickN + (sN - stdKickN) : null);
      const diffRel = aN !== null && stdRelN !== null ? aN - stdRelN : null;
      const diffAbs = aN !== null && sN !== null ? aN - sN : null;
      const status = aN === null ? 'sem-data' : diffRel === null ? 'sem-referencia' : Math.abs(diffRel) <= TOL_DAYS ? 'no-prazo' : diffRel > 0 ? 'depois' : 'antes';
      dates = { status, company: a.date || '', companyEnd: a.endDate || a.date || '', std: S.date, stdEnd: S.endDate, stdRel: stdRelN !== null ? toIso(stdRelN) : '', diffRel, diffAbs, basis: absolute ? 'data fixa' : 'kickoff' };
    }
    // descrição
    const d = norm(a.desc);
    const desc = !d ? 'vazia' : (S.newDesc && d === norm(S.newDesc)) ? 'padrao-novo' : ((S.oldDesc && d === norm(S.oldDesc)) || (S.oldDescs || []).some((o) => norm(o) === d)) ? 'padrao-antigo' : 'personalizada';
    // subatividades
    const subsLive = live(a.subactivities);
    const missingSubs = S.subs.filter((s) => !(fromVersion ? versionSubPresent : hasSub)({ subactivities: subsLive }, s)).map((s) => s.t);
    matches.push({
      key: S.key, title: S.title, kind: S.kind, level: p.level === 3 ? 'exato' : 'provavel', why: p.why,
      activity: { id: a.id, title: a.title, status: a.status || '', responsible: a.responsible || '', phase: (arr(data.phases).find((x) => x && x.id === a.phase) || {}).name || '', subsTotal: subsLive.length, subsDone: subsLive.filter((x) => x.done).length },
      dates, desc,
      subs: { expected: S.subs.length, present: S.subs.length - missingSubs.length, missing: missingSubs },
      responsible: { expected: S.responsible, actual: a.responsible || '', ok: norm(a.responsible) === norm(S.responsible) },
    });
  }
  const extras = acts.filter((a) => !usedA.has(a.id)).map((a) => ({ id: a.id, title: a.title, responsible: a.responsible || '', date: a.date || '', status: a.status || '' }));

  // ---- 2) coerência (vale para qualquer atividade, do padrão ou extra) ----
  const findings = [];
  const add = (sev, code, title, detail, a) => findings.push({ sev, code, title, detail, activityId: a ? a.id : null, activityTitle: a ? a.title : '' });
  const byTitle = new Map();
  for (const a of acts) { const k = norm(a.title); if (!k) continue; byTitle.set(k, [...(byTitle.get(k) || []), a]); }
  for (const [, list] of byTitle) if (list.length > 1) for (const a of list) add('naoConforme', 'duplicada', 'Título repetido', `Há ${list.length} atividades com o título "${a.title}". Se são etapas diferentes, renomeie; se é repetição, exclua uma.`, a);
  const spread = earliest === null ? null : earliest + MAX_SPREAD_DAYS;
  // Numa versão do padrão, atividade com intervalo longo ou data distante PREVISTOS no próprio padrão (split em 2028, revisão anual) não é erro de digitação.
  const stdOf = new Map([...matchBy.values()].map((p) => [p.a.id, p.S]));
  const stdDates = std.map((x) => dayNum(x.date)).filter((n) => n !== null);
  const stdEarliest = stdDates.length ? Math.min(...stdDates) : null;
  const stdLong = (a) => { const S = fromVersion ? stdOf.get(a.id) : null; if (!S) return false; const sa = dayNum(S.date); const se = dayNum(S.endDate); return sa !== null && se !== null && se - sa > MAX_SPAN_DAYS; };
  const stdFar = (a) => { const S = fromVersion ? stdOf.get(a.id) : null; if (!S || stdEarliest === null) return false; const se = dayNum(S.endDate || S.date); return se !== null && se > stdEarliest + MAX_SPREAD_DAYS; };
  const subById = new Map(acts.flatMap((x) => live(x.subactivities).map((y) => [y.id, y])));
  const teamNames = new Set(arr(data.team).map((t) => norm(typeof t === 'string' ? t : t && t.name)).filter(Boolean));
  for (const a of acts) {
    if (norm(a.title).replace(/[^a-z0-9]/g, '').length < 3) add('naoConforme', 'titulo-vazio', 'Título sem sentido', `O título "${a.title || ''}" parece um resto de edição. Renomeie ou exclua.`, a);
    const s = dayNum(a.date); const e = dayNum(a.endDate);
    if (s === null) add('atencao', 'sem-prazo', 'Sem prazo', 'A atividade não tem data.', a);
    if (s !== null && e !== null && e < s) add('naoConforme', 'fim-antes-inicio', 'Fim antes do início', `Início ${a.date} e fim ${a.endDate}.`, a);
    if (s !== null && e !== null && e >= s && e - s > MAX_SPAN_DAYS && !stdLong(a)) add('atencao', 'duracao-longa', 'Duração muito longa', `De ${a.date} a ${a.endDate} são ${e - s} dias. Confira o ano do fim.`, a);
    for (const [n, iso] of [[s, a.date], [e, a.endDate]]) if (n !== null && spread !== null && n > spread && !stdFar(a)) { add('atencao', 'ano-fora', 'Data muito distante das demais', `${iso} fica mais de um ano depois da data mais antiga da empresa. Confira o ano.`, a); break; }
    const end = e !== null ? e : s;
    if (a.status !== 'concluido' && end !== null && end < todayN) add('atencao', 'atrasada', 'Atrasada', `Venceu há ${todayN - end} dia${todayN - end === 1 ? '' : 's'} e está "${a.status === 'nao-iniciado' ? 'não iniciada' : a.status === 'em-andamento' ? 'em andamento' : a.status === 'pausado' ? 'pausada' : a.status || 'sem status'}".`, a);
    const sl = live(a.subactivities);
    if (a.status === 'concluido' && sl.length && sl.some((x) => !x.done)) add('atencao', 'concluida-subs-abertas', 'Concluída com subatividades abertas', `${sl.filter((x) => x.done).length} de ${sl.length} subatividades concluídas.`, a);
    for (const sb of sl) {
      const lim = sb.limit && sb.limit.date;
      if (!sb.done && lim && sb.date && sb.date > lim) add('atencao', 'passa-do-limite', 'Prazo passa do limite da norma', `"${sb.title}": prazo ${sb.date} e limite ${lim}${sb.limit.type ? ` (${sb.limit.type})` : ''}.`, a);
      for (const pid of arr(sb.predecessors)) { const pr = subById.get(pid); if (!sb.done && pr && !pr.done && pr.date && sb.date && pr.date > sb.date) add('atencao', 'predecessora-depois', 'Predecessora vence depois', `"${sb.title}" vence em ${sb.date}, antes da predecessora "${pr.title}" (${pr.date}).`, a); }
    }
    if (a.responsible && teamNames.size && !teamNames.has(norm(a.responsible))) add('atencao', 'responsavel-fora-equipe', 'Responsável fora da equipe', `"${a.responsible}" não está na equipe cadastrada da empresa.`, a);
  }
  // datas fora de ordem na lista (informativo)
  const seq = acts.map((a) => dayNum(a.date)).filter((n) => n !== null);
  let inv = 0; for (let i = 1; i < seq.length; i += 1) if (seq[i] < seq[i - 1]) inv += 1;
  if (inv && !fromVersion) findings.push({ sev: 'info', code: 'ordem', title: 'Datas fora de ordem na lista', detail: `${inv} atividade${inv === 1 ? '' : 's'} com data anterior à da atividade de cima.`, activityId: null, activityTitle: '' });

  // ---- 3) fases ----
  const stdPhases = arr(standardData && standardData.phases).map((p) => p && p.name);
  const coPhases = arr(data.phases).map((p) => p && p.name);
  const phases = { status: JSON.stringify(stdPhases.map(norm)) === JSON.stringify(coPhases.map(norm)) ? 'igual' : 'diferente', company: coPhases, standard: stdPhases };

  // ---- 4) resumo ----
  const sevCount = (k) => findings.filter((f) => f.sev === k).length;
  const dateCount = (k) => matches.filter((m) => m.dates.status === k).length;
  const subsExpected = matches.reduce((n, m) => n + m.subs.expected, 0);
  const summary = {
    standardTotal: std.length, present: matches.length, exact: matches.filter((m) => m.level === 'exato').length, toConfirm: matches.filter((m) => m.level === 'provavel').length,
    missing: missing.length, extras: extras.length, activities: acts.length,
    dates: { onTime: dateCount('no-prazo'), after: dateCount('depois'), before: dateCount('antes'), noDate: dateCount('sem-data'), stdNoDate: dateCount('padrao-sem-data'), noReference: dateCount('sem-referencia') },
    subs: { present: matches.reduce((n, m) => n + m.subs.present, 0), expected: subsExpected + missing.reduce((n, m) => n + m.subs.length, 0) },
    findings: { naoConforme: sevCount('naoConforme'), atencao: sevCount('atencao'), info: sevCount('info') },
    descriptions: { novo: matches.filter((m) => m.desc === 'padrao-novo').length, antigo: matches.filter((m) => m.desc === 'padrao-antigo').length, personalizada: matches.filter((m) => m.desc === 'personalizada').length, vazia: matches.filter((m) => m.desc === 'vazia').length },
    phasesStatus: phases.status,
  };
  return {
    company: { label }, today: toIso(todayN), toleranceDays: TOL_DAYS, standard: opts.standardInfo || { source: 'modelo' },
    reference: { kickoffCompany: kickN !== null ? toIso(kickN) : '', kickoffStandard: stdKick ? stdKick.date : (fromVersion && standardData && standardData.kickoffDate) || '', basedOn: kickMatch && dayNum(kickMatch.a.date) !== null ? 'kickoff' : 'data-mais-antiga' },
    summary, matches, missing, extras, findings, phases,
  };
}
