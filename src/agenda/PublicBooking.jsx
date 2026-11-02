// Página pública de agendamento (/agendar/:token, §139). Sem login. Quem abre vê só os horários livres e os blocos "Ocupado" da
// pessoa (nunca o que é), escolhe um horário, informa nome, assunto, os e-mails de quem participa (obrigatório) e se quer Google
// Meet; o compromisso entra na agenda do dono com os convites. Servidor: server/agendaBooking.js (/api/public-booking).
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock, Video, ArrowLeft } from 'lucide-react';
import './agenda.css';

const pad2 = (n) => String(n).padStart(2, '0');
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const hmBr = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const dayLabel = (key) => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d, 12)); return { dow: DOW[dt.getUTCDay()], num: d, mon: MON[m - 1] }; };
const longDay = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const brMs = (key, min) => Date.parse(`${key}T${pad2(Math.floor(min / 60))}:${pad2(min % 60)}:00-03:00`);

async function call(method, path, body) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' });
  let data = null; try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) { const e = new Error((data && data.message) || 'Não foi possível concluir agora.'); e.status = r.status; e.code = data && data.code; throw e; }
  return data;
}

// Linhas do dia: horário livre (botão), "Ocupado", almoço ou já passou. Nada além de início e fim sai do servidor.
function dayRows(day, info) {
  const step = Math.min(30, info.duration);
  const rows = [];
  const free = new Set(day.slots);
  for (let m = toMin(info.dayStart); m + step <= toMin(info.dayEnd); m += step) {
    const t = brMs(day.date, m); const iso = new Date(t).toISOString();
    if (free.has(iso)) rows.push({ iso, kind: 'free' });
    else if (day.busy.some((b) => Date.parse(b.start) < t + step * 60000 && Date.parse(b.end) > t)) rows.push({ iso, kind: 'busy' });
    else rows.push({ iso, kind: 'off' });
  }
  return rows;
}

export default function PublicBookingScreen({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ name: '', subject: '', emails: '', meet: null, note: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    document.title = 'Agendar horário — PRICETAX';
    let alive = true;
    call('GET', `/api/public-booking/${encodeURIComponent(token)}`)
      .then((d) => { if (!alive) return; setInfo(d); setError(''); const first = d.days.find((x) => x.slots.length); setDay((cur) => (cur && d.days.some((x) => x.date === cur) ? cur : first ? first.date : null)); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [token, reloadTick]);

  const current = useMemo(() => (info && day ? info.days.find((d) => d.date === day) : null), [info, day]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const emailCount = form.emails.split(/[,;\s]+/).filter(Boolean).length;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    if (form.meet === null) { setFormError('Escolha se a reunião terá link do Google Meet.'); return; }
    setBusy(true);
    try {
      const r = await call('POST', `/api/public-booking/${encodeURIComponent(token)}/book`, { ...form, start: slot });
      setDone(r);
    } catch (err) {
      setFormError(err.message);
      if (err.code === 'slot_taken') { setSlot(null); setReloadTick((n) => n + 1); }
    } finally { setBusy(false); }
  }

  return (
    <div className="pbk-page">
      <div className="pbk-card">
        <div className="pbk-brand"><img src="/favicon.png" alt="" width="28" height="28" /> PRICETAX</div>
        {error && <div className="pbk-msg" role="alert">{error}</div>}
        {!error && !info && <div className="pbk-msg">Carregando a agenda…</div>}
        {info && done && (
          <div className="pbk-done" role="status">
            <CalendarCheck size={34} aria-hidden="true" />
            <h1>Horário marcado</h1>
            <p><b>{longDay(done.start)}</b>, das {hmBr(done.start)} às {hmBr(done.end)} (horário de Brasília), com {done.owner}.</p>
            <p>O convite foi enviado por e-mail para os participantes{done.meetLink ? ', com o link do Google Meet' : ''}.</p>
            {done.meetLink && <a className="pbk-btn primary" href={done.meetLink} target="_blank" rel="noopener noreferrer"><Video size={16} aria-hidden="true" /> Link do Google Meet</a>}
          </div>
        )}
        {info && !done && (
          <>
            <h1 className="pbk-title">Agendar com {info.owner.name}</h1>
            <div className="pbk-sub"><Clock size={14} aria-hidden="true" /> {info.duration} min · horário de Brasília{info.title ? ` · ${info.title}` : ''}</div>
            {!slot ? (
              <>
                {!info.days.some((d) => d.slots.length) && <div className="pbk-msg">Não há horários livres nos próximos dias. Fale com {info.owner.name} por e-mail.</div>}
                <div className="pbk-days" role="tablist" aria-label="Dias">
                  {info.days.map((d) => {
                    const l = dayLabel(d.date);
                    return (
                      <button key={d.date} type="button" role="tab" aria-selected={d.date === day} className={`pbk-day${d.date === day ? ' on' : ''}${d.slots.length ? '' : ' empty'}`} onClick={() => setDay(d.date)} disabled={!d.slots.length} title={d.slots.length ? `${d.slots.length} horário(s) livre(s)` : 'Sem horário livre'}>
                        <span>{l.dow}</span><b>{l.num}</b><span>{l.mon}</span>
                      </button>
                    );
                  })}
                </div>
                {current && (
                  <div className="pbk-rows" aria-label={`Horários de ${longDay(`${current.date}T15:00:00Z`)}`}>
                    {dayRows(current, info).map((r) => (r.kind === 'free'
                      ? <button key={r.iso} type="button" className="pbk-slot" onClick={() => setSlot(r.iso)}>{hmBr(r.iso)}</button>
                      : <div key={r.iso} className={`pbk-row ${r.kind}`}><span>{hmBr(r.iso)}</span><span>{r.kind === 'busy' ? 'Ocupado' : 'Indisponível'}</span></div>))}
                  </div>
                )}
              </>
            ) : (
              <form className="pbk-form" onSubmit={submit}>
                <button type="button" className="pbk-back" onClick={() => { setSlot(null); setFormError(''); }}><ArrowLeft size={15} aria-hidden="true" /> Outro horário</button>
                <div className="pbk-chosen"><b>{longDay(slot)}</b>, {hmBr(slot)} – {hmBr(new Date(Date.parse(slot) + info.duration * 60000).toISOString())}</div>
                <label>Seu nome*<input value={form.name} onChange={set('name')} maxLength={80} required autoFocus autoComplete="name" /></label>
                <label>Assunto*<input value={form.subject} onChange={set('subject')} maxLength={120} required placeholder="Ex.: Proposta de parceria" /></label>
                <label>E-mails dos participantes*<textarea value={form.emails} onChange={set('emails')} rows={2} required placeholder="voce@empresa.com.br, colega@empresa.com.br" /><span className="pbk-hint">Inclua o seu e o de todos que devem estar na reunião, separados por vírgula. Todos recebem o convite.{emailCount ? ` ${emailCount} e-mail${emailCount === 1 ? '' : 's'}.` : ''}</span></label>
                <fieldset className="pbk-meet">
                  <legend>Link do Google Meet?*</legend>
                  <label><input type="radio" name="meet" checked={form.meet === true} onChange={() => setForm((f) => ({ ...f, meet: true }))} /> Sim, criar o link</label>
                  <label><input type="radio" name="meet" checked={form.meet === false} onChange={() => setForm((f) => ({ ...f, meet: false }))} /> Não (presencial ou outro)</label>
                </fieldset>
                <label>Mensagem <span className="pbk-hint">(opcional)</span><textarea value={form.note} onChange={set('note')} rows={3} maxLength={1000} /></label>
                <input className="pbk-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} name="website" />
                {formError && <div className="pbk-err" role="alert">{formError}</div>}
                <button type="submit" className="pbk-btn primary" disabled={busy} title={busy ? "Marcando o horário…" : undefined}>{busy ? 'Marcando…' : 'Confirmar horário'}</button>
              </form>
            )}
          </>
        )}
      </div>
      <div className="pbk-foot">Você vê só se o horário está livre ou ocupado; os compromissos da pessoa não aparecem.</div>
    </div>
  );
}
