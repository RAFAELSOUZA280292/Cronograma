// "Meu link de agendamento" (§139): a própria pessoa liga, configura, copia, troca e desliga o link público da SUA agenda.
// Quem abre o link vê só livre/ocupado e marca na agenda dela. Servidor: GET/PUT /api/agenda/booking.
import React, { useEffect, useState } from 'react';
import { Copy, Link2, Plus, RefreshCw, X } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout, Select } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { apiGet, apiPut } from '../lib/api.js';
import './agenda.css';

const label = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)' };
const MAX_RANGES = 4;
const toMin = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(String(v || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
// Faixas na tela: mostra o problema antes de salvar (o servidor também limpa).
export function rangeProblem(ranges, duration) {
  const r = (ranges || []).map((x) => [toMin(x.start), toMin(x.end)]);
  if (!r.length) return 'Inclua pelo menos uma faixa de horário.';
  if (r.some(([a, z]) => !Number.isFinite(a) || !Number.isFinite(z))) return 'Preencha o início e o fim de cada faixa.';
  if (r.some(([a, z]) => z <= a)) return 'Em cada faixa, o fim precisa ser depois do início.';
  if (r.some(([a, z]) => a < 5 * 60 || z > 23 * 60)) return 'As faixas precisam ficar entre 05:00 e 23:00.';
  if (r.every(([a, z]) => z - a < duration)) return `Nenhuma faixa comporta uma reunião de ${duration} min.`;
  return '';
}
const DAYS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];

export default function BookingDialog({ onClose }) {
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    apiGet('/api/agenda/booking').then((d) => { setData(d); setS(d.settings); }).catch((e) => setError((e && e.message) || 'Não consegui abrir.'));
  }, []);
  const url = data && data.token ? `${window.location.origin}/agendar/${data.token}` : '';
  const put = async (body, msg) => {
    setBusy(true); setError('');
    try { const d = await apiPut('/api/agenda/booking', body); setData(d); setS(d.settings); if (msg) notify(msg, { tone: 'success' }); } catch (e) { setError((e && e.message) || 'Não foi possível salvar.'); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); notify('Link copiado. Mande para quem vai marcar com você.', { tone: 'success' }); } catch { notify('Não consegui copiar; selecione o link e copie.', { tone: 'error' }); }
  };
  const regen = async () => {
    if (!(await askConfirm({ title: 'Gerar um link novo?', message: 'O link antigo para de funcionar na hora. Quem já tem o antigo precisará do novo.', confirmLabel: 'Gerar novo', danger: true }))) return;
    put({ regenerate: true, enabled: true }, 'Link novo gerado; o antigo não funciona mais.');
  };
  const upd = (k, v) => setS((cur) => ({ ...cur, [k]: v }));
  const setRange = (i, k, v) => setS((cur) => ({ ...cur, ranges: cur.ranges.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  const addRange = () => setS((cur) => {
    const last = cur.ranges[cur.ranges.length - 1];
    const a = last ? Math.min(toMin(last.end) + 60, 21 * 60) : 8 * 60;
    const f = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { ...cur, ranges: [...cur.ranges, { start: f(a), end: f(Math.min(a + 120, 23 * 60)) }] };
  });
  const problem = s ? rangeProblem(s.ranges, s.duration) : '';

  return (
    <Modal
      title="Meu link de agendamento" onClose={onClose} busy={busy} error={error}
      footer={data && (
        <>
          {data.enabled && <Button onClick={() => put({ enabled: false }, 'Link desligado. Quem tiver o endereço não consegue mais marcar.')} disabled={busy} disabledReason="Aguarde terminar">Desligar o link</Button>}
          <Button variant="primary" onClick={() => put({ enabled: true, settings: s }, data.enabled ? 'Configuração salva.' : 'Link ligado. Copie e mande para quem vai marcar.')} loading={busy} disabled={!!problem} disabledReason={problem}>{data.enabled ? 'Salvar' : 'Ligar o link'}</Button>
        </>
      )}
    >
      {!data || !s ? <div className="agd-muted">{error ? '' : 'Carregando…'}</div> : (
        <div className="agd-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Callout tone="info" icon={Link2}>
            Quem abre o link vê só se cada horário está <b>livre</b> ou <b>ocupado</b> (nunca o nome dos compromissos), escolhe um horário livre, informa os e-mails de quem participa e se quer Google Meet. O compromisso entra na sua agenda e todos recebem o convite. Você recebe um aviso no sino.
          </Callout>
          {data.enabled && url && (
            <div style={label}>
              Seu link
              <div className="agd-bk-url">
                <input className="ui-input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Endereço do seu link de agendamento" />
                <Button icon={Copy} onClick={copy}>Copiar</Button>
                <Button icon={RefreshCw} onClick={regen} disabled={busy} disabledReason="Aguarde terminar" title="Gera outro endereço; o atual para de funcionar">Novo</Button>
              </div>
            </div>
          )}
          <label style={{ ...label, maxWidth: 220 }}>Duração de cada reunião
            <Select value={String(s.duration)} onChange={(e) => upd('duration', Number(e.target.value))}>{[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
          </label>
          <div style={label}>
            <span id="bk-ranges">Horários em que aceita reuniões</span>
            <div className="agd-bk-ranges" role="group" aria-labelledby="bk-ranges">
              {s.ranges.map((r, i) => (
                <div key={i} className="agd-bk-range">
                  <span>das</span>
                  <input className="ui-input" type="time" step="900" value={r.start} aria-label={`Faixa ${i + 1}: início`} onChange={(e) => setRange(i, 'start', e.target.value)} />
                  <span>às</span>
                  <input className="ui-input" type="time" step="900" value={r.end} aria-label={`Faixa ${i + 1}: fim`} onChange={(e) => setRange(i, 'end', e.target.value)} />
                  <button type="button" className="agd-ic" aria-label={`Remover a faixa ${i + 1}`} title={s.ranges.length === 1 ? 'Precisa de pelo menos uma faixa' : 'Remover esta faixa'} disabled={s.ranges.length === 1} onClick={() => upd('ranges', s.ranges.filter((_, j) => j !== i))}><X size={15} aria-hidden="true" /></button>
                </div>
              ))}
              {s.ranges.length < MAX_RANGES && <Button size="sm" icon={Plus} onClick={addRange}>Adicionar faixa</Button>}
            </div>
            <span className="agd-opt" style={{ fontSize: 12 }}>O intervalo entre duas faixas fica fechado (ex.: almoço das 12h às 13h30). Até {MAX_RANGES} faixas.</span>
            {problem && <span role="alert" style={{ fontSize: 12, color: 'var(--ui-danger)' }}>{problem}</span>}
          </div>
          <div style={label}>
            <span id="bk-days">Dias da semana</span>
            <div className="agd-bk-days" role="group" aria-labelledby="bk-days">
              {DAYS.map(([d, l]) => {
                const on = s.weekdays.includes(d);
                return <button key={d} type="button" className={`agd-tog${on ? ' on' : ''}`} aria-pressed={on} onClick={() => upd('weekdays', on ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d])}>{l}</button>;
              })}
            </div>
          </div>
          <div className="agd-propose-row">
            <label style={label}>Antecedência mínima
              <Select value={String(s.minNoticeHours)} onChange={(e) => upd('minNoticeHours', Number(e.target.value))}>{[[0, 'Nenhuma'], [1, '1 hora'], [2, '2 horas'], [4, '4 horas'], [12, '12 horas'], [24, '1 dia'], [48, '2 dias']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </label>
            <label style={label}>Mostrar os próximos
              <Select value={String(s.daysAhead)} onChange={(e) => upd('daysAhead', Number(e.target.value))}>{[7, 14, 30, 60].map((v) => <option key={v} value={v}>{v} dias</option>)}</Select>
            </label>
          </div>
          <label style={label}>Começo do título <span className="agd-opt">(opcional, ex.: PRICETAX)</span><input className="ui-input" value={s.title} maxLength={80} onChange={(e) => upd('title', e.target.value)} /></label>
          <div className="agd-hint" style={{ marginTop: 0 }}>Horário de Brasília. Até 5 marcações por hora vindas do mesmo endereço e 30 por dia no seu link.</div>
        </div>
      )}
    </Modal>
  );
}
