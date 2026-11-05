// Copiar os e-mails dos participantes e escrever para todos a partir da agenda (2026-11-05, §167; Rafael, print da reunião
// "AGENDA PRICE TAX - TI" com 8 participantes: "copiar todos os envolvidos e também mandar e-mail em cima dessa agenda para todos
// dela, com o tema no nome da agenda"). Puro, para teste: scripts/agenda-attendee-mail.test.mjs.
const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/;
// Salas e agendas de grupo do Google/Microsoft aparecem como participantes, mas não leem e-mail.
const NOT_PERSON = /@(resource\.calendar\.google\.com|group\.calendar\.google\.com|group\.v\.calendar\.google\.com|import\.calendar\.google\.com)$/i;

// Participantes com e-mail de pessoa, sem repetir. `withSelf`: inclui você (copiar = todos; escrever = os outros).
export function attendeePeople(attendees, { withSelf = true } = {}) {
  const seen = new Set();
  const out = [];
  for (const a of attendees || []) {
    const email = String((a && a.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || NOT_PERSON.test(email) || seen.has(email)) continue;
    if (!withSelf && a.self) continue;
    seen.add(email);
    out.push({ name: String(a.name || '').trim(), email });
  }
  return out;
}

const fmt = (p) => (!p.name || p.name.toLowerCase() === p.email ? p.email : /[,;"<>]/.test(p.name) ? `"${p.name.replace(/"/g, '')}" <${p.email}>` : `${p.name} <${p.email}>`);

// Texto para colar no Para de qualquer e-mail (painel, Gmail, Outlook): "Nome <e-mail>, Nome <e-mail>".
export const attendeesCopyText = (attendees) => attendeePeople(attendees).map(fmt).join(', ');

// mailto: com todos menos você e o assunto = nome da agenda. Dentro do painel o clique abre a janela de escrever da Caixa (App.jsx).
export function attendeesMailto(attendees, subject = '') {
  const to = attendeePeople(attendees, { withSelf: false });
  if (!to.length) return '';
  const s = String(subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 250);
  return `mailto:${to.map((p) => p.email).join(',')}${s ? `?subject=${encodeURIComponent(s)}` : ''}`;
}
