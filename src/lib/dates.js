// Dias de CALENDÁRIO entre um momento e agora, no fuso local (2026-10-05). Antes o app contava blocos de 24 h
// (`floor((agora - momento) / 86400000)`): uma atividade aberta domingo às 18h só virava "1d" na segunda às 18h, e o
// Rafael viu "0d" numa segunda-feira por algo aberto no domingo. A régua certa é a data: domingo → segunda = 1 dia,
// não importa a hora. Cada data é reduzida ao seu número de dia (UTC do ano/mês/dia LOCAL), o que também evita erro
// de horário de verão. Módulo puro.
export function localDayNumber(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function calendarDaysSince(iso, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, localDayNumber(now) - localDayNumber(then));
}
