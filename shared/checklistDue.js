// Prazo automático do cartão a partir das subatividades (2026-11-03, §163; Rafael, cartão da ALCAST com prazo 09/11 vindo de uma
// subatividade JÁ concluída: "ela precisa respeitar a data mais do futuro, mas de atividades que ainda não foram concluídas").
// = a data mais distante entre as subatividades ABERTAS que têm data. Sem nenhuma aberta com data, devolve '' (o prazo do cartão
// fica como está). Usado na tela (src/screens/PersonalBoard.jsx), na API por chave (server/boardPlan.js) e na RENATA
// (server/renata/tools/board.js) — uma regra só. Teste: scripts/checklist-due.test.mjs.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function openChecklistDue(checklist) {
  return (checklist || []).filter((i) => i && !i.done && ISO.test(i.dueDate || '')).map((i) => i.dueDate).sort().pop() || '';
}
