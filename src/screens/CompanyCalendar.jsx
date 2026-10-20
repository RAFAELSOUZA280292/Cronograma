// Janela "Reservar na agenda" (2026-10-19): cada atividade do cronograma vira UM bloco de agenda (padrão 60 min) para a equipe PRICETAX, com convite do Google aos e-mails digitados.
// O cliente nunca é convidado. Organiza quem clicar, com a conta do Google que conectou (ex.: a conta @pricetax). Só master e PRICETAX. Back-end: server/companyCalendar.js.
import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../lib/api.js';
import { Modal } from '../ui/dialog.jsx';
import { Button, ErrorState, SkeletonCards } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { assignDays, duplicateDays, inWindow } from '../../shared/calendarDays.js';

const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const STATUS = { nova: ['Nova', 'var(--text-3)'], reservada: ['Já reservada', '#3ecf6e'], desatualizada: ['Mudou: atualizar', '#e0a21a'] };
const EMAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;
const split = (t) => String(t || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const DUR = [[30, '30 min'], [60, '60 min'], [90, '90 min'], [120, '2 horas'], [180, '3 horas']];

export default function CompanyCalendarModal({ projectId, companyLabel, onClose }) {
  const [plan, setPlan] = useState(undefined);
  const [error, setError] = useState('');
  const [emailsText, setEmailsText] = useState('');
  const [duration, setDuration] = useState(60);
  const [pick, setPick] = useState({});
  const [times, setTimes] = useState({});
  const [days, setDays] = useState({});
  const [cancelPick, setCancelPick] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const base = `/api/company-calendar/${projectId}`;

  const load = () => {
    setPlan(undefined); setError('');
    apiGet(base).then((r) => {
      setPlan(r);
      setEmailsText((r.emails || []).join('\n'));
      setDuration(r.durationMin || 60);
      setTimes(Object.fromEntries(r.rows.map((x) => [x.activityId, x.time])));
      setDays(Object.fromEntries(r.rows.map((x) => [x.activityId, x.day])));
      setPick(Object.fromEntries(r.rows.map((x) => [x.activityId, x.status !== 'reservada'])));
      setCancelPick(Object.fromEntries((r.obsolete || []).map((x) => [x.activityId, true])));
    }).catch((e) => setError((e && e.message) || 'Não foi possível carregar.'));
  };
  useEffect(load, [projectId]);

  const emails = useMemo(() => split(emailsText), [emailsText]);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  const items = plan ? plan.rows.filter((r) => pick[r.activityId]) : [];
  const cancels = plan ? (plan.obsolete || []).filter((o) => cancelPick[o.activityId]) : [];
  // Regra: na mesma empresa, um bloco por dia. Conta os escolhidos e as reservas que continuam.
  const dupMap = useMemo(() => {
    if (!plan) return {};
    const picked = new Set(items.map((r) => r.activityId));
    return duplicateDays([...items.map((r) => ({ activityId: r.activityId, day: days[r.activityId] || r.day })), ...(plan.takenDays || []).filter((t) => !picked.has(t.activityId))]);
  }, [plan, items, days]);
  const outside = items.find((r) => !inWindow(r, days[r.activityId] || r.day));
  const dupDay = Object.keys(dupMap)[0];
  function redistribute() {
    const picked = new Set(items.map((r) => r.activityId));
    const taken = new Set((plan.takenDays || []).filter((t) => !picked.has(t.activityId)).map((t) => t.day));
    const r = assignDays(items, taken, plan.today);
    setDays({ ...days, ...r.days });
    notify(r.unresolved.length ? `${r.unresolved.length} atividade${r.unresolved.length === 1 ? '' : 's'} sem dia livre no período (dia fixo repetido). Desmarque uma ou mude a data no cronograma.` : 'Dias distribuídos: um bloco por dia, dentro do período de cada atividade.', { tone: r.unresolved.length ? 'error' : 'success' });
  }
  const changes = items.filter((r) => r.status !== 'reservada').length + cancels.length;
  const reason = !plan ? '' : dupDay ? `Dois blocos no mesmo dia (${br(dupDay)}). Use "Distribuir dias" ou mude um deles.` : outside ? `O dia de "${outside.title}" está fora do período da atividade.` : !plan.google.configured ? 'O Google Calendar não está configurado neste servidor.' : !plan.google.connected ? 'Conecte o Google Calendar antes.' : items.length && !emails.length ? 'Digite ao menos um e-mail.' : invalid.length ? `E-mail inválido: ${invalid[0]}` : !items.length && !cancels.length ? 'Marque ao menos uma atividade.' : '';

  async function send() {
    const ok = await askConfirm({
      title: 'Enviar convites do Google?',
      message: `${items.length ? `${items.length} bloco${items.length === 1 ? '' : 's'} de ${duration} min ser${items.length === 1 ? 'á criado ou atualizado' : 'ão criados ou atualizados'}` : ''}${items.length && cancels.length ? ' e ' : ''}${cancels.length ? `${cancels.length} reserva${cancels.length === 1 ? '' : 's'} cancelada${cancels.length === 1 ? '' : 's'}` : ''}. O Google envia e-mail para ${emails.length} pessoa${emails.length === 1 ? '' : 's'} (${emails.slice(0, 4).join(', ')}${emails.length > 4 ? '…' : ''}). Só a equipe PRICETAX: o cliente não é convidado. Convite enviado não dá para desenviar.`,
      confirmLabel: 'Enviar convites',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiPost(`${base}/apply`, { confirm: true, emails, durationMin: duration, items: items.map((x) => ({ activityId: x.activityId, time: times[x.activityId], day: days[x.activityId] || x.day })), cancel: cancels.map((x) => x.activityId) });
      setResult(r.results || []);
      load();
    } catch (e) { notify((e && e.message) || 'Não foi possível enviar.', { tone: 'error' }); }
    setBusy(false);
  }
  async function cancelAll() {
    const ok = await askConfirm({ title: 'Cancelar todas as reservas?', message: `As ${plan.reservedCount} reservas desta empresa serão apagadas e o Google avisa os convidados por e-mail.`, confirmLabel: 'Cancelar reservas', danger: true });
    if (!ok) return;
    setBusy(true);
    try { const r = await apiPost(`${base}/apply`, { confirm: true, cancel: plan.reservedIds }); setResult(r.results || []); load(); } catch (e) { notify((e && e.message) || 'Não foi possível cancelar.', { tone: 'error' }); }
    setBusy(false);
  }

  const done = result ? { ok: result.filter((x) => x.ok).length, bad: result.filter((x) => !x.ok) } : null;
  return (
    <Modal title="Reservar na agenda" subtitle={companyLabel} size="lg" onClose={busy ? () => {} : onClose}
      footer={plan && !result ? (
        <>
          <Button onClick={onClose} disabled={busy} title={busy ? 'Aguarde terminar' : undefined}>Fechar</Button>
          <Button variant="primary" onClick={send} disabled={busy || !!reason} title={busy ? 'Enviando…' : reason || undefined}>{busy ? 'Enviando…' : `Enviar convites${changes ? ` (${changes})` : ''}`}</Button>
        </>
      ) : <Button onClick={onClose}>Fechar</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5, color: 'var(--text-2)' }}>
        {plan === undefined && !error && <SkeletonCards count={2} />}
        {error && <ErrorState title="Não foi possível carregar" message={error} onRetry={load} />}
        {done && (
          <div role="status" style={{ border: '1px solid var(--border-2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ color: done.bad.length ? '#e0a21a' : '#3ecf6e' }}>{done.ok} de {result.length} concluído{done.ok === 1 ? '' : 's'}{done.bad.length ? `, ${done.bad.length} com problema` : ''}.</b>
            {done.bad.map((x) => <div key={x.activityId} style={{ color: '#e2574c', fontSize: 12.5 }}>{x.title || x.activityId}: {x.error}</div>)}
            <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>Os blocos aparecem na agenda de quem aceitar o convite. Se mudar uma data no cronograma, abra esta janela de novo: ela mostra "Mudou: atualizar".</div>
            <div><Button onClick={() => setResult(null)}>Voltar para a lista</Button></div>
          </div>
        )}
        {plan && !result && (
          <>
            {!plan.google.connected && (
              <div role="alert" style={{ border: '1px solid rgba(224,162,26,.5)', borderRadius: 10, padding: 12, lineHeight: 1.55 }}>
                {plan.google.configured
                  ? <>Antes de reservar, conecte o Google Calendar da conta que vai <b>organizar</b> os blocos (a conta @pricetax). <a href="/api/google/oauth/start" style={{ color: 'var(--ui-accent, #F5C400)', fontWeight: 700 }}>Conectar Google Calendar</a>. Na tela do Google, escolha a conta certa. Depois volte aqui.</>
                  : <>O Google Calendar não está configurado neste servidor.</>}
              </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 700 }}>E-mails da equipe PRICETAX que recebem o convite
              <textarea value={emailsText} onChange={(e) => setEmailsText(e.target.value)} rows={3} placeholder="um por linha, ou separados por vírgula" aria-label="E-mails da equipe" style={{ fontWeight: 400, resize: 'vertical' }} />
              <span style={{ fontWeight: 400, fontSize: 12, color: invalid.length ? '#e2574c' : 'var(--text-4)' }}>{invalid.length ? `E-mail inválido: ${invalid.join(', ')}` : `${emails.length} pessoa${emails.length === 1 ? '' : 's'}. Só equipe interna: o cliente não é convidado.`}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>Duração de cada bloco
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duração de cada bloco">{DUR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            {plan.rows.length === 0 && <div>Nenhuma atividade com data de hoje em diante{plan.pastCount ? ` (${plan.pastCount} já passaram e não são reservadas)` : ''}.</div>}
            {plan.rows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Button onClick={redistribute} disabled={!items.length} title={!items.length ? 'Marque ao menos uma atividade' : 'Escolhe um dia livre para cada uma, dentro do período dela, sem repetir dia'}>Distribuir dias</Button>
                <span style={{ fontSize: 12.5, color: dupDay ? '#e2574c' : 'var(--text-4)' }}>{dupDay ? `Há dois blocos no mesmo dia (${br(dupDay)}). Na mesma empresa só pode haver um por dia.` : 'Um bloco por dia nesta empresa. O dia fica dentro do período de cada atividade.'}</span>
              </div>
            )}
            {plan.rows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--text-4)', fontSize: 12 }}><th style={{ padding: '4px 6px' }} aria-label="Reservar" /><th style={{ padding: '4px 6px' }}>Atividade</th><th style={{ padding: '4px 6px' }}>Dia do bloco</th><th style={{ padding: '4px 6px' }}>Início</th><th style={{ padding: '4px 6px' }}>Situação</th></tr></thead>
                  <tbody>
                    {plan.rows.map((r) => {
                      const st = STATUS[r.status];
                      return (
                        <tr key={r.activityId} style={{ borderTop: '1px solid var(--border-2)' }}>
                          <td style={{ padding: '6px' }}><input type="checkbox" checked={!!pick[r.activityId]} onChange={(e) => setPick({ ...pick, [r.activityId]: e.target.checked })} aria-label={`Reservar ${r.title}`} /></td>
                          <td style={{ padding: '6px' }}><div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{r.title}</div><div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{[r.phaseName, r.responsible].filter(Boolean).join(' · ')}{r.endDate && r.endDate !== r.date ? ` · até ${br(r.endDate)}` : ''}</div></td>
                          <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                            <input type="date" value={days[r.activityId] || r.day} min={r.date} max={r.endDate && r.endDate >= r.date ? r.endDate : r.date} onChange={(e) => setDays({ ...days, [r.activityId]: e.target.value })} aria-label={`Dia do bloco de ${r.title}`} style={pick[r.activityId] && dupMap[days[r.activityId] || r.day] ? { borderColor: '#e2574c', color: '#e2574c' } : undefined} />
                            {pick[r.activityId] && dupMap[days[r.activityId] || r.day] && <div style={{ color: '#e2574c', fontSize: 11, fontWeight: 700 }}>Dia repetido</div>}
                          </td>
                          <td style={{ padding: '6px' }}><input type="time" value={times[r.activityId] || '10:00'} onChange={(e) => setTimes({ ...times, [r.activityId]: e.target.value })} aria-label={`Horário de ${r.title}`} /></td>
                          <td style={{ padding: '6px', whiteSpace: 'nowrap', color: st[1], fontWeight: 700, fontSize: 12 }}>{st[0]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {(plan.obsolete || []).length > 0 && (
              <div style={{ border: '1px solid rgba(226,87,76,.4)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <b style={{ color: '#e2574c' }}>Reservas de atividade que foi excluída</b>
                {plan.obsolete.map((o) => (
                  <label key={o.activityId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={!!cancelPick[o.activityId]} onChange={(e) => setCancelPick({ ...cancelPick, [o.activityId]: e.target.checked })} /> Cancelar o bloco de {br(o.date) || 'data antiga'}
                  </label>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--text-4)', lineHeight: 1.55 }}>
              Cada atividade vira um bloco de {duration} min em <b>um dia dentro do período dela</b> (por padrão o de início, ajustado para não repetir dia na empresa; o período completo vai na descrição). Atividades concluídas ou com data passada não entram. O evento fica como "ocupado" na agenda. Se uma data mudar no cronograma, a lista marca "Mudou: atualizar" e o envio atualiza o <b>mesmo</b> evento, sem duplicar. Nada é enviado antes de você confirmar.
            </div>
            {plan.reservedCount > 0 && <div><Button onClick={cancelAll} disabled={busy} title={busy ? 'Aguarde terminar' : undefined}>Cancelar todas as reservas ({plan.reservedCount})</Button></div>}
          </>
        )}
      </div>
    </Modal>
  );
}
