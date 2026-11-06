// Descrição do compromisso e link da reunião (§168). node scripts/agenda-describe.test.mjs
import { tidyDescription, splitLinks } from '../src/agenda/describe.js';
import { meetingLinkFrom, mapAttendees } from '../server/googleCalendar.js';
import { mapTeamEvent } from '../server/agendaTeam.js';

let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };

const desc = `Boa tarde!\n\nPlano de ação próximos passos após Workshop.\n\n\n\nImpreterível a presença de todos.\n\n\nAt.\nRogeria Zapparoli Guerra\nGerente Tributária\n[Icon email] E-mail\nrogeria.zapparoli@tecumseh.com<mailto:rogeria.zapparoli@tecumseh.com>\nTecumseh do Brasil Ltda\n\n\n[Tecumseh Logo]\n\n________________________________________________________________________________\nReunião do Microsoft Teams\nIngressar: https://teams.microsoft.com/meet/2262390306903208?p=AkUIAeyr40zHnxpv4f\nID da Reunião: 226 239 030 690 320 8\nSenha: Gq94ku2k\n__________________\nPrecisa de ajuda?<https://aka.ms/JoinTeamsMeeting?omkt=pt-BR> | Referência do sistema<https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%7d>`;
const t = tidyDescription(desc);
ok('tira <mailto:…> e <https://…> repetidos', !t.includes('<mailto:') && !t.includes('<https://') && t.includes('rogeria.zapparoli@tecumseh.com') && t.includes('Precisa de ajuda? | Referência do sistema'), t);
ok('tira [Icon email] e [Tecumseh Logo]', !t.includes('[Icon') && !t.includes('Logo]') && t.includes('\nE-mail\n'), t);
ok('tira linha de sublinhado e junta linhas vazias', !/_{8,}/.test(t) && !/\n{3,}/.test(t));
ok('mantém ID e senha do Teams', t.includes('ID da Reunião: 226 239 030 690 320 8') && t.includes('Senha: Gq94ku2k'));
ok('texto comum não muda', tidyDescription('Pauta:\n- item 1\n- item 2') === 'Pauta:\n- item 1\n- item 2');
ok('[texto] comum fica', tidyDescription('[Urgente] revisar') === '[Urgente] revisar');

ok('link do Teams achado na descrição', meetingLinkFrom({ location: 'Reunião do Microsoft Teams', description: desc }) === 'https://teams.microsoft.com/meet/2262390306903208?p=AkUIAeyr40zHnxpv4f');
ok('Meet do Google tem preferência', meetingLinkFrom({ hangoutLink: 'https://meet.google.com/abc-defg-hij', description: desc }) === 'https://meet.google.com/abc-defg-hij');
ok('Zoom na descrição', meetingLinkFrom({ description: 'Entre: https://us02web.zoom.us/j/123456?pwd=x.' }) === 'https://us02web.zoom.us/j/123456?pwd=x');
ok('sem link: vazio', meetingLinkFrom({ description: 'Sala 3, 2º andar' }) === '');

const g = { id: 'e1', summary: 'Pricetax - Financeiro', start: { dateTime: '2026-11-06T10:00:00-03:00' }, end: { dateTime: '2026-11-06T11:00:00-03:00' }, location: 'Reunião do Microsoft Teams', description: desc,
  organizer: { email: 'rogeria.zapparoli@tecumseh.com', displayName: 'Rogeria Guerra' },
  attendees: [{ email: 'rogeria.zapparoli@tecumseh.com', displayName: 'Rogeria Guerra', organizer: true, responseStatus: 'accepted' }, { email: 'felipedalsanto@pricetax.com.br', displayName: 'Felipe Dal Santo', self: true }, { email: 'rafael.souza@pricetax.com.br' }, { email: 'misael@tecumseh.com', displayName: 'Misael Da Silva', optional: true }, { email: 'sala@resource.calendar.google.com', resource: true }] };
const te = mapTeamEvent({ email: 'felipedalsanto@pricetax.com.br', name: 'Felipe Dal Santo', color: '#8E24AA' }, g, 'rafael.souza@pricetax.com.br');
ok('agenda do colega traz os participantes (sem sala)', te.attendees.length === 4, te.attendees);
ok('"você" é quem olha, não o dono da agenda', te.attendees.find((a) => a.email === 'rafael.souza@pricetax.com.br').self && !te.attendees.find((a) => a.email === 'felipedalsanto@pricetax.com.br').self);
ok('organizador e link do Teams', te.organizerEmail === 'rogeria.zapparoli@tecumseh.com' && te.organizerName === 'Rogeria Guerra' && /teams\.microsoft\.com\/meet\//.test(te.meetLink));
const priv = mapTeamEvent({ email: 'f@x.com', color: '#000000' }, { ...g, visibility: 'private' }, 'r@x.com');
ok('compromisso particular continua "Ocupado", sem participantes nem link', priv.title === 'Ocupado' && !priv.attendees.length && !priv.meetLink && !priv.organizerEmail);
ok('na sua própria agenda o "self" do Google vale', mapAttendees(g).find((a) => a.self).email === 'felipedalsanto@pricetax.com.br');

const parts = splitLinks('Ingressar: https://teams.microsoft.com/meet/226?p=Ak. E-mail rogeria.zapparoli@tecumseh.com, site www.alcast.com.br');
ok('link do Teams vira link, sem o ponto final', parts.some((p) => p.href === 'https://teams.microsoft.com/meet/226?p=Ak' && !p.mail), parts);
ok('e-mail vira mailto (abre a Caixa), sem a vírgula', parts.some((p) => p.href === 'mailto:rogeria.zapparoli@tecumseh.com' && p.mail));
ok('www. ganha https://', parts.some((p) => p.href === 'https://www.alcast.com.br'));
ok('texto volta inteiro ao juntar', parts.map((p) => p.text).join('') === 'Ingressar: https://teams.microsoft.com/meet/226?p=Ak. E-mail rogeria.zapparoli@tecumseh.com, site www.alcast.com.br');
ok('sem link: um pedaço só', splitLinks('Pauta da reunião').length === 1 && !splitLinks('Pauta').some((p) => p.href));

console.log(failed ? `\n${failed} falha(s).` : '\nagenda-describe: tudo certo');
process.exit(failed ? 1 : 0);
