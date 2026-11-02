// "Minhas agendas" (§128, 2026-11-02): a agenda principal (Google) + as extras da pessoa — outra conta Google, Microsoft 365/Outlook.com
// ou link iCal (só leitura). Nome, cor, mostrar ou não na Agenda, permissão da RENATA e desconectar. Tudo é só da própria pessoa:
// agenda particular (fora do pricetax.com.br) nunca aparece para outro usuário, nem para o Master.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus, Link2, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout, Skeleton } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js';
import './agenda.css';

const CONNECT = { google: '/api/google/oauth/start?extra=1', microsoft: '/api/microsoft/oauth/start' };

function Swatches({ colors, value, onPick, label }) {
  return (
    <div className="agd-sw" role="radiogroup" aria-label={`Cor de ${label}`}>
      {colors.map((c) => (
        <button
          key={c} type="button" role="radio" aria-checked={c.toLowerCase() === String(value).toLowerCase()} aria-label={`Cor ${c}`} title={c}
          className={`agd-sw-dot${c.toLowerCase() === String(value).toLowerCase() ? ' on' : ''}`} style={{ background: c }} onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function NameField({ value, onSave, label }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="ui-input agd-acc-name" value={v} maxLength={60} aria-label={`Nome da agenda ${label}`}
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() && v.trim() !== value) onSave(v.trim()); else setV(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

function IcalForm({ onAdded, onCancel }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await apiPost('/api/agenda/accounts/ical', { label, url });
      notify(`Agenda "${label.trim()}" adicionada (${r.events} compromisso${r.events === 1 ? '' : 's'} no arquivo).`, { tone: 'success' });
      onAdded(r.accounts);
    } catch (err) { setError((err && err.message) || 'Não consegui adicionar a agenda.'); setBusy(false); }
  }
  return (
    <form className="agd-ical agd-form" onSubmit={submit}>
      <label>Nome<input className="ui-input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: PETCONT" autoFocus /></label>
      <label>Endereço da agenda (iCal)<input className="ui-input" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} placeholder="https://… .ics" inputMode="url" autoComplete="off" /></label>
      <div className="agd-hint">
        <b>Google Agenda:</b> Configurações › a agenda › Integrar agenda › <i>Endereço secreto no formato iCal</i>.{' '}
        <b>Outlook:</b> Configurações › Calendário › Calendários compartilhados › Publicar um calendário › link <i>ICS</i>.
        O link é guardado cifrado e só você o usa. Esta agenda é <b>só leitura</b>: aparece na grade, mas não cria nem responde convites.
      </div>
      {error && <div className="agd-hint" style={{ color: 'var(--ui-danger)' }} role="alert">{error}</div>}
      <div className="agd-propose-actions">
        <Button size="sm" onClick={onCancel} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button>
        <Button size="sm" type="submit" variant="primary" loading={busy} disabled={!label.trim() || !url.trim()} disabledReason="Informe nome e endereço">Adicionar</Button>
      </div>
    </form>
  );
}

export default function AccountsDialog({ onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  function load() {
    apiGet('/api/agenda/accounts').then((d) => { setData(d); setError(''); }).catch((e) => setError((e && e.message) || 'Não consegui carregar as suas agendas.'));
  }
  useEffect(load, []);

  async function patchPrincipal(body) {
    try {
      const r = await apiPatch('/api/agenda/accounts/principal', body);
      setData((d) => ({ ...d, principal: { ...d.principal, ...r.principal, label: r.principal.label || 'Agenda principal (Google)' } }));
      onChanged();
    } catch (e) { notify((e && e.message) || 'Não foi possível salvar.', { tone: 'error' }); }
  }
  async function patchAccount(id, body) {
    try {
      const r = await apiPatch(`/api/agenda/accounts/${encodeURIComponent(id)}`, body);
      setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? r.account : a)) }));
      onChanged();
    } catch (e) { notify((e && e.message) || 'Não foi possível salvar.', { tone: 'error' }); }
  }
  async function remove(a) {
    const ok = await askConfirm({ title: `Desconectar "${a.label}"?`, message: 'Os compromissos dela saem da Agenda do painel. Nada é apagado na agenda de origem.', confirmLabel: 'Desconectar', danger: true });
    if (!ok) return;
    try {
      await apiDelete(`/api/agenda/accounts/${encodeURIComponent(a.id)}`);
      setData((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id) }));
      notify('Agenda desconectada.', { tone: 'success' });
      onChanged();
    } catch (e) { notify((e && e.message) || 'Não foi possível desconectar.', { tone: 'error' }); }
  }

  const can = (data && data.can) || {};
  const full = data && data.accounts.length >= data.max;
  const allColors = data ? [data.principal.defaultColor, ...data.colors] : [];

  return (
    <Modal title="Minhas agendas" subtitle="Todas as suas agendas numa só grade, cada uma com a sua cor" onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      {error && <Callout tone="danger" icon={AlertTriangle}>{error}</Callout>}
      {!data && !error && <Skeleton height={120} />}
      {data && (
        <div className="agd-accs">
          <div className="agd-acc">
            <div className="agd-acc-head">
              <span className="agd-acc-dot" style={{ background: data.principal.color }} aria-hidden="true" />
              <NameField value={data.principal.label} label="principal" onSave={(label) => patchPrincipal({ label })} />
              <span className="agd-acc-tag">PRICETAX</span>
            </div>
            <div className="agd-acc-sub">Google · a mesma conta do e-mail e dos convites do painel{data.principal.connected ? '' : ' · não conectada'}</div>
            {!data.principal.connected && <a className="ui-btn primary sm" href="/api/google/oauth/start">Conectar Google</a>}
            <Swatches colors={allColors} value={data.principal.color} label="principal" onPick={(color) => patchPrincipal({ color })} />
            <label className="agd-check"><input type="checkbox" checked={data.principal.calendarEnabled} onChange={(e) => patchPrincipal({ calendarEnabled: e.target.checked })} /> <span>Mostrar na Agenda</span></label>
          </div>

          {data.accounts.map((a) => (
            <div key={a.id} className="agd-acc">
              <div className="agd-acc-head">
                <span className="agd-acc-dot" style={{ background: a.color }} aria-hidden="true" />
                <NameField value={a.label} label={a.label} onSave={(label) => patchAccount(a.id, { label })} />
                {a.privacy === 'particular'
                  ? <span className="agd-acc-tag private" title="Fora do pricetax.com.br: só você vê esta agenda."><Lock size={11} aria-hidden="true" /> Particular</span>
                  : <span className="agd-acc-tag">PRICETAX</span>}
              </div>
              <div className="agd-acc-sub">{a.providerLabel}{a.email ? ` · ${a.email}` : ''}{a.readOnly ? ' · só leitura' : ''}</div>
              {a.status === 'error' && (
                <Callout
                  tone="danger" icon={AlertTriangle} title="Não consegui ler esta agenda"
                  action={CONNECT[a.provider] ? <a className="ui-btn sm" href={CONNECT[a.provider]}><RefreshCw size={13} aria-hidden="true" /> Reconectar</a> : null}
                >{a.error || 'Tente reconectar.'}</Callout>
              )}
              <Swatches colors={allColors} value={a.color} label={a.label} onPick={(color) => patchAccount(a.id, { color })} />
              <label className="agd-check"><input type="checkbox" checked={a.calendarEnabled} onChange={(e) => patchAccount(a.id, { calendarEnabled: e.target.checked })} /> <span>Mostrar na Agenda</span></label>
              {a.privacy === 'particular' && (
                <label className="agd-check">
                  <input type="checkbox" checked={a.renataCalendar} onChange={(e) => patchAccount(a.id, { renataCalendar: e.target.checked })} />
                  <span>A RENATA pode ver os títulos desta agenda <span className="agd-opt">(desligado: ela só sabe que você está ocupado)</span></span>
                </label>
              )}
              <div><Button size="sm" icon={Trash2} onClick={() => remove(a)}>Desconectar</Button></div>
            </div>
          ))}

          <div className="agd-acc agd-acc-add">
            <div className="agd-acc-head"><CalendarPlus size={16} aria-hidden="true" /> <b>Adicionar agenda</b></div>
            {full ? <div className="agd-hint">Limite de {data.max} agendas extras atingido.</div> : (
              <>
                <div className="agd-acc-btns">
                  {can.google ? <a className="ui-btn sm" href={CONNECT.google}>Outra conta Google</a> : <Button size="sm" disabled disabledReason="Google não configurado neste ambiente">Outra conta Google</Button>}
                  {can.microsoft ? <a className="ui-btn sm" href={CONNECT.microsoft}>Conta Microsoft (Outlook/365)</a> : <Button size="sm" disabled disabledReason="Aguardando o registro do aplicativo na Microsoft">Conta Microsoft (Outlook/365)</Button>}
                  <Button size="sm" icon={Link2} onClick={() => setAdding(true)} disabled={adding} disabledReason="O formulário já está aberto">Link iCal (só leitura)</Button>
                </div>
                {can.google && !can.googleExternal && <div className="agd-hint">Por enquanto o Google aceita só contas <b>@pricetax.com.br</b> aqui. Para Gmail pessoal ou de outra empresa, use o link iCal até a liberação do Google.</div>}
                {adding && <IcalForm onCancel={() => setAdding(false)} onAdded={(accounts) => { setAdding(false); setData((d) => ({ ...d, accounts })); onChanged(); }} />}
              </>
            )}
            <div className="agd-hint"><Lock size={11} aria-hidden="true" /> Agenda fora do pricetax.com.br é <b>particular</b>: só você a vê no painel; nenhum outro usuário, nem o administrador.</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
