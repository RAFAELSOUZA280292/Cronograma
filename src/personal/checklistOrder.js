// Ordem das subatividades do cartão (2026-11-04, §162; Rafael: "atividades concluídas, mova sempre para o topo como concluído e as
// não concluídas e em andamento deixe para baixo respeitando as datas; sem datas ficam no topo e da data mais próxima para mais
// antiga de cima para baixo"). Grupos, de cima para baixo:
//   1. concluídas (na ordem em que estavam);
//   2. abertas sem data (na ordem em que estavam);
//   3. abertas com data, da mais PRÓXIMA de hoje para a mais distante (a de hoje primeiro; empate: a que ainda vai vencer antes da vencida).
// Dentro do mesmo grupo e da mesma data vale a ordem manual (as setas). Puro: scripts/checklist-order.test.mjs.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);

export function checklistGroup(item) {
  if (item && item.done) return 0;
  return item && ISO.test(item.dueDate || '') ? 2 : 1;
}

export function sortChecklist(list, todayIso) {
  const t = dayNum(ISO.test(todayIso || '') ? todayIso : new Date().toISOString().slice(0, 10));
  return (list || []).map((item, i) => ({ item, i })).sort((a, b) => {
    const ga = checklistGroup(a.item); const gb = checklistGroup(b.item);
    if (ga !== gb) return ga - gb;
    if (ga === 2) {
      const da = dayNum(a.item.dueDate) - t; const db = dayNum(b.item.dueDate) - t;
      if (Math.abs(da) !== Math.abs(db)) return Math.abs(da) - Math.abs(db);
      if (da !== db) return db - da; // mesma distância: a futura antes da vencida
    }
    return a.i - b.i;
  }).map((x) => x.item);
}

// Seta para cima/baixo na lista JÁ ordenada: só troca com o vizinho do mesmo grupo e mesma data (fora disso a ordem é a automática).
export function moveInChecklist(list, itemId, dir, todayIso) {
  const sorted = sortChecklist(list, todayIso);
  const i = sorted.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length || !sameSlot(sorted[i], sorted[j])) return null;
  const next = [...sorted];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export const sameSlot = (a, b) => !!a && !!b && checklistGroup(a) === checklistGroup(b) && (checklistGroup(a) !== 2 || a.dueDate === b.dueDate);
