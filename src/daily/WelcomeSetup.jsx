import React, { useEffect, useState } from 'react';
import { CalendarDays, Sparkles, CheckCircle2 } from 'lucide-react';
import { apiGet, apiPut, apiPost } from '../lib/api.js';
import DailyPrefs, { DAILY_CSS } from './DailyPrefs.jsx';
import { useDialog } from '../lib/nav.js';

const CSS = `
  .wsu-overlay { position:fixed; inset:0; background:rgba(0,0,0,.62); z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; }
  .wsu { width:560px; max-width:100%; max-height:94vh; background:var(--bg-1); border:1px solid var(--border-2); border-radius:18px; display:flex; flex-direction:column; overflow:hidden; font-family:'Inter', sans-serif; color:var(--text-1); }
  .wsu-head { padding:20px 22px 6px; }
  .wsu-step { font-size:11px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--ui-accent-text); }
  .wsu-title { font-size:20px; font-weight:800; margin-top:6px; letter-spacing:-.01em; display:flex; align-items:center; gap:9px; }
  .wsu-sub { font-size:13px; line-height:1.55; color:var(--text-4); margin-top:6px; }
  .wsu-body { padding:14px 22px 6px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
  .wsu-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 22px 18px; flex-wrap:wrap; }
  .wsu-skip { background:none; border:none; font-family:inherit; font-size:13px; font-weight:600; color:var(--text-5); cursor:pointer; padding:10px 4px; min-height:40px; }
  .wsu-skip:hover { color:var(--text-2); }
  .wsu-btn { font-family:inherit; font-size:14px; font-weight:700; border-radius:10px; padding:11px 20px; cursor:pointer; border:1px solid #F5C400; background:#F5C400; color:#111; min-height:44px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
  .wsu-btn:hover:not(:disabled) { background:#ffd21f; }
  .wsu-btn:disabled { opacity:.6; cursor:default; }
  .wsu-btn.ghost { background:transparent; color:var(--text-2); border-color:var(--border-3); }
  .wsu-ok { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:700; color:var(--ui-ok); }
  .wsu-note { font-size:12.5px; line-height:1.5; color:var(--text-4); }
  .wsu-err { font-size:12.5px; color:var(--ui-danger); }
  .wsu-dots { display:flex; gap:6px; }
  .wsu-dots i { width:22px; height:4px; border-radius:99px; background:var(--border-3); }
  .wsu-dots i.on { background:#F5C400; }

  .wsu-btn:focus-visible, .wsu-skip:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .wsu-btn, .wsu-skip { min-height:44px; } .wsu-overlay { padding:8px; } }
`;

export default function WelcomeSetup({ user, onDone }) {
  const [step, setStep] = useState(0);
  const [google, setGoogle] = useState(null);
  const [prefs, setPrefs] = useState({ enabled: true, cards: [], birthDate: '' });
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [didSave, setDidSave] = useState(false);

  useEffect(() => {
    apiGet('/api/google/status').then(setGoogle).catch(() => setGoogle({ connected: false, configured: false }));
    apiGet('/api/daily/preferences').then((p) => setPrefs({ enabled: p.enabled, cards: p.cards, birthDate: p.birthDate })).catch(() => {});
  }, []);

  async function finish(save) {
    setBusy(true); setError('');
    try {
      if (save) await apiPut('/api/daily/preferences', prefs);
      await apiPost('/api/daily/onboarding-complete');
      onDone(save || didSave);
    } catch (e) { setError(e && e.message ? e.message : 'Não foi possível salvar agora.'); } finally { setBusy(false); }
  }

  async function saveStep() {
    setBusy(true); setError('');
    try { setSummary(await apiPut('/api/daily/preferences', prefs)); setDidSave(true); setStep(2); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  const first = (user.name || '').split(' ')[0] || user.username;
  // Onboarding de passo a passo: só foco preso e a11y. Esc/Voltar não fecham (sair é "Agora não", que registra a conclusão).
  const dlg = useDialog(() => {}, { history: false, esc: false });
  return (
    <div className="wsu-overlay" {...dlg} aria-label="Boas-vindas">
      <style>{CSS}{DAILY_CSS}</style>
      <div className="wsu">
        <div className="wsu-head">
          <div className="wsu-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
          {step === 0 && (<><div className="wsu-step" style={{ marginTop: 14 }}>Passo 1 de 3</div><div className="wsu-title"><CalendarDays size={22} color="#F5C400" /> Bem-vindo, {first}. Conecte a sua agenda</div>
            <div className="wsu-sub">Com o Google Calendar conectado, a Agenda e a RENATA mostram as suas reuniões, o widget do iPhone sabe qual é a próxima e as suas TASKs viram eventos. Leva um clique.</div></>)}
          {step === 1 && (<><div className="wsu-step" style={{ marginTop: 14 }}>Passo 2 de 3</div><div className="wsu-title"><Sparkles size={22} color="#F5C400" /> Monte o seu dia</div>
            <div className="wsu-sub">Escolha o que você quer ver na tela inicial quando entrar. Dá para mudar sempre em Meu perfil.</div></>)}
          {step === 2 && (<><div className="wsu-step" style={{ marginTop: 14 }}>Passo 3 de 3</div><div className="wsu-title"><CheckCircle2 size={22} color="#3ecf6e" /> Tudo pronto</div></>)}
        </div>

        <div className="wsu-body">
          {step === 0 && (
            !google ? <div className="wsu-note">Carregando...</div>
            : google.connected ? <div className="wsu-ok"><CheckCircle2 size={18} /> Agenda conectada.</div>
            : !google.configured ? <div className="wsu-note">A conexão com o Google ainda não está configurada neste ambiente. Você pode fazer isso depois em Meu perfil.</div>
            : <a className="wsu-btn" href="/api/google/oauth/start"><CalendarDays size={16} /> Conectar Google Calendar</a>
          )}
          {step === 1 && <DailyPrefs value={prefs} onChange={setPrefs} summary={summary} />}
          {step === 2 && (
            <>
              <div className="wsu-note">
                {prefs.enabled && prefs.cards.length > 0 ? `Seu dia vai aparecer na tela inicial com ${prefs.cards.length} ${prefs.cards.length === 1 ? 'item' : 'itens'}.` : 'Você optou por não ver o conteúdo do dia por enquanto.'}
                {' '}Tudo isso fica em <b>Meu perfil</b>, no botão no canto superior da tela inicial. Lá você também liga o widget do iPhone.
              </div>
            </>
          )}
          {error && <div className="wsu-err">{error}</div>}
        </div>

        <div className="wsu-foot">
          <button type="button" className="wsu-skip" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => finish(false)}>Agora não</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && step < 2 && <button type="button" className="wsu-btn ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
            {step === 0 && <button type="button" className="wsu-btn" onClick={() => setStep(1)}>{google && google.connected ? 'Continuar' : 'Pular este passo'}</button>}
            {step === 1 && <button type="button" className="wsu-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={saveStep}>{busy ? 'Salvando...' : 'Continuar'}</button>}
            {step === 2 && <button type="button" className="wsu-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => finish(false)}>Começar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
