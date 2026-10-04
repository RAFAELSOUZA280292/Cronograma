const TZ = 'America/Sao_Paulo';

function validTs(v) {
  if (typeof v !== 'string' || !v) return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function cardEventsOf(data) {
  const events = [];
  let withoutOpenDate = 0;
  let closedWithoutDate = 0;
  for (const board of (data && data.boards) || []) {
    for (const col of board.columns || []) {
      for (const card of col.cards || []) {
        if (!card || !card.id) continue;
        const opened = validTs(card.createdAt);
        if (opened) events.push({ cardId: card.id, kind: 'opened', at: opened });
        else withoutOpenDate += 1;
        if (card.completed) {
          const closed = validTs(card.completedAt);
          if (closed) events.push({ cardId: card.id, kind: 'closed', at: closed });
          else closedWithoutDate += 1;
        }
      }
    }
  }
  return { events, withoutOpenDate, closedWithoutDate };
}

export async function syncCardEvents(pool, userId, data) {
  try {
    const { events } = cardEventsOf(data);
    if (!events.length) return;
    await pool.query(
      `INSERT INTO personal_card_events (user_id, card_id, kind, occurred_at)
       SELECT $1, t.card_id, t.kind, t.at
       FROM unnest($2::text[], $3::text[], $4::timestamptz[]) AS t(card_id, kind, at)
       ON CONFLICT DO NOTHING`,
      [userId, events.map((e) => e.cardId), events.map((e) => e.kind), events.map((e) => e.at)],
    );
  } catch (e) {
    console.error('Indicadores: falha ao registrar eventos de atividade', e.message);
  }
}

export async function getActivityStats(pool, userId, days) {
  const periodDays = Number.isInteger(days) && days > 0 ? days : null;
  const { rows } = await pool.query(
    `SELECT kind,
            EXTRACT(DOW FROM occurred_at AT TIME ZONE $2)::int AS dow,
            EXTRACT(DAY FROM occurred_at AT TIME ZONE $2)::int AS dom,
            count(*)::int AS n
     FROM personal_card_events
     WHERE user_id=$1 AND ($3::int IS NULL OR occurred_at >= now() - ($3::int * interval '1 day'))
     GROUP BY kind, dow, dom`,
    [userId, TZ, periodDays],
  );
  const mk = (len) => ({ opened: Array(len).fill(0), closed: Array(len).fill(0) });
  const weekday = mk(7);
  const monthDay = mk(31);
  let opened = 0;
  let closed = 0;
  for (const r of rows) {
    if (r.kind !== 'opened' && r.kind !== 'closed') continue;
    weekday[r.kind][r.dow] += r.n;
    monthDay[r.kind][r.dom - 1] += r.n;
    if (r.kind === 'opened') opened += r.n; else closed += r.n;
  }
  const { rows: first } = await pool.query('SELECT min(occurred_at) AS first FROM personal_card_events WHERE user_id=$1', [userId]);
  return { opened, closed, weekday, monthDay, firstEventAt: first[0] && first[0].first ? first[0].first.toISOString() : null };
}
