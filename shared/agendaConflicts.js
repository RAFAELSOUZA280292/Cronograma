// Conflito de horário entre compromissos (§128, 2026-11-02): com várias agendas sobrepostas (PRICETAX, BRASILPRICE, PETCONT,
// pessoal, Microsoft), dois compromissos no mesmo horário viram aviso na grade e ao criar. Puro, usado na tela e testado em
// scripts/agenda-accounts.test.mjs. Só conta o que ocupa tempo: com horário, não cancelado, não "livre" e não recusado.

export function isBusy(ev) {
  if (!ev || ev.allDay || ev.status === 'cancelled' || ev.transparent) return false;
  if (ev.myResponse === 'declined') return false;
  const s = Date.parse(ev.start); const e = Date.parse(ev.end);
  return Number.isFinite(s) && Number.isFinite(e) && e > s;
}

// id → lista dos outros compromissos que se sobrepõem a ele (só os que ocupam tempo).
export function findConflicts(events) {
  const list = (events || []).filter(isBusy).map((ev) => ({ ev, s: Date.parse(ev.start), e: Date.parse(ev.end) })).sort((a, b) => a.s - b.s);
  const out = new Map();
  const active = [];
  for (const cur of list) {
    for (let i = active.length - 1; i >= 0; i -= 1) if (active[i].e <= cur.s) active.splice(i, 1);
    for (const other of active) {
      if (other.ev.id === cur.ev.id) continue;
      if (!out.has(cur.ev.id)) out.set(cur.ev.id, []);
      if (!out.has(other.ev.id)) out.set(other.ev.id, []);
      out.get(cur.ev.id).push(other.ev);
      out.get(other.ev.id).push(cur.ev);
    }
    active.push(cur);
  }
  return out;
}

// Compromissos que chocam com um horário novo (formulário de criar/editar). `ignoreId` = o próprio evento em edição.
export function conflictsWith(startISO, endISO, events, ignoreId) {
  const s = Date.parse(startISO); const e = Date.parse(endISO);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [];
  return (events || []).filter((ev) => ev.id !== ignoreId && isBusy(ev) && Date.parse(ev.start) < e && Date.parse(ev.end) > s)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
