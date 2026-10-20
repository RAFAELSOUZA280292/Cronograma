// "A atividade estica sozinha" (2026-10-20, pedido do Rafael após auditoria da ALCAST): quando a data de uma subatividade muda (ou entra subatividade nova) e cai fora do período
// da atividade pai, o período da atividade é ESTICADO (início para trás, fim para frente) para cobri-la. Nunca encolhe; só olha as subatividades que mudaram nesta edição
// (assim não briga com quem encurta a atividade de propósito). Não mexe em atividade concluída, excluída, com data travada ou de grupo. Função pura (cliente e servidor).
const live = (a) => (Array.isArray(a) ? a.filter((x) => x && !x.deleted) : []);

export function fitPeriods(prevActs, nextActs) {
  const before = new Map();
  for (const a of prevActs || []) for (const s of live(a.subactivities)) before.set(s.id, s.date || '');
  const changed = [];
  const activities = (nextActs || []).map((a) => {
    if (!a || a.deleted || a.status === 'concluido' || a.dateLocked || a.groupActivityId || !a.date) return a;
    const touched = live(a.subactivities).filter((s) => s.date && !s.done && before.get(s.id) !== s.date);
    if (!touched.length) return a;
    const dates = touched.map((s) => s.date).sort();
    const start = a.date;
    const end = a.endDate && a.endDate >= a.date ? a.endDate : a.date;
    const date = dates[0] < start ? dates[0] : start;
    const endDate = dates[dates.length - 1] > end ? dates[dates.length - 1] : end;
    if (date === a.date && endDate === (a.endDate || a.date)) return a;
    changed.push({ id: a.id, title: a.title || '', from: { date: a.date, endDate: a.endDate || a.date }, to: { date, endDate } });
    return { ...a, date, endDate };
  });
  return { activities, changed };
}
