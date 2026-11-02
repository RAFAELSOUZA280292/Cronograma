// Boas-vindas obrigatória de lançamento (03/11/2026, shared/launchTour.js). Quatro passos, sem "pular", sem Esc:
// 1) o que mudou; 2) conectar o Google (e-mail + agenda) — só segue com os dois ligados; 3) assinatura salva;
// 4) como trabalhar a partir de hoje e a RENATA. O passo fica no sessionStorage porque a conexão com o Google sai do
// painel e volta (/email#google-mail-connected); ao voltar, a tela reabre no mesmo passo e confere de novo.
import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Link2, CalendarDays, Sparkles, CheckCircle2, Circle, PenLine, ArrowRight, RefreshCw } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { useDialog } from '../lib/nav.js';
import SignatureDialog from '../mail/SignatureDialog.jsx';
import { LAUNCH_TOUR_ID, newsFor, LAUNCH_ASK_EXAMPLES } from '../../shared/launchTour.js';
import '../mail/mail.css';
import './launchTour.css';

const ICONS = { Mail, Link2, CalendarDays, Sparkles };
const STEP_KEY = `pt-launch-tour-step:${LAUNCH_TOUR_ID}`;
const SIGNATURES_DRIVE = 'https://drive.google.com/drive/folders/16vEaxK5yQNYgaqrKHZCL4y5F-ij2E9HP?usp=share_link';
const STEPS = ['O que mudou', 'Conectar e-mail e agenda', 'Sua assinatura', 'Como trabalhar'];

const readStep = () => { try { return Math.min(3, Math.max(0, Number(sessionStorage.getItem(STEP_KEY)) || 0)); } catch { return 0; } };
const saveStep = (n) => { try { sessionStorage.setItem(STEP_KEY, String(n)); } catch { /* sem armazenamento: recomeça do 1º passo */ } };

function Check({ ok, label, busy }) {
  return (
    <div className={`lt-check${ok ? ' ok' : ''}`}>
      {ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
      <span>{label}</span>
      <b>{busy ? 'Conferindo…' : ok ? 'Conectado' : 'Falta conectar'}</b>
    </div>
  );
}

export default function LaunchTour({ user, onDone }) {
  const [step, setStepRaw] = useState(readStep);
  const setStep = (n) => { saveStep(n); setStepRaw(n); };
  const [mail, setMail] = useState(null);
  const [google, setGoogle] = useState(null);
  const [checking, setChecking] = useState(false);
  const [sig, setSig] = useState(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dlg = useDialog(() => {}, { history: false, esc: false });

  const check = useCallback(async () => {
    setChecking(true);
    const [m, g] = await Promise.all([
      apiGet('/api/mail/status?fresh=1').catch(() => ({ configured: true, connected: false, mail: false })),
      apiGet('/api/google/status').catch(() => ({ configured: true, connected: false })),
    ]);
    setMail(m); setGoogle(g); setChecking(false);
  }, []);
  const loadSig = useCallback(() => apiGet('/api/mail/signature').then(setSig).catch(() => setSig({ saved: false })), []);

  useEffect(() => { if (step === 1) check(); if (step === 2) loadSig(); }, [step, check, loadSig]);
  // Voltou da aba do Google (ou de outra janela): confere de novo sem precisar clicar.
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible' && step === 1) check(); };
    window.addEventListener('focus', again); document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [step, check]);

  // Sem Google configurado no ambiente (servidor local) não há como conectar: não trava ninguém por isso.
  const googleOff = !!(mail && mail.configured === false);
  const mailOk = !!(mail && mail.mail);
  const agendaOk = !!(google && google.connected);
  const connectedOk = googleOff || (mailOk && agendaOk);
  const sigOk = !!(sig && sig.saved);

  async function finish(goMail) {
    setBusy(true); setError('');
    try {
      await apiPost(`/api/tours/${LAUNCH_TOUR_ID}/done`);
      try { sessionStorage.removeItem(STEP_KEY); } catch { /* nada */ }
      onDone();
      if (goMail && window.location.pathname !== '/email') window.location.assign('/email');
    } catch (e) { setError(e.message || 'Não consegui salvar agora. Tente de novo.'); setBusy(false); }
  }

  const first = (user.name || '').split(' ')[0] || user.username;
  const crm = !!user.crmAccess;
  return (
    <div className="lt-overlay" {...dlg} aria-label="Boas-vindas às novidades do painel">
      <div className="lt">
        <div className="lt-head">
          <ol className="lt-steps" aria-label="Passos">
            {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}><span>{i + 1}</span>{s}</li>)}
          </ol>
          {step === 0 && <><div className="lt-kicker">Novembro de 2026 · novidades do painel</div><h2 className="lt-title">Olá, {first}! O painel mudou — e para melhor.</h2>
            <p className="lt-sub">A partir de hoje, <b>{crm ? 'e-mail, agenda, CRM e RENATA trabalham' : 'e-mail, agenda e RENATA trabalham'} juntos aqui dentro</b>. São 4 passos rápidos (uns 3 minutos) para deixar tudo pronto. Não dá para pular: é o que faz o painel funcionar para você.</p></>}
          {step === 1 && <><div className="lt-kicker">Passo 2 de 4</div><h2 className="lt-title">Conecte o seu e-mail e a sua agenda</h2>
            <p className="lt-sub">Um clique: entre com a sua conta <b>@pricetax.com.br</b> e marque as permissões que o Google pedir. Você volta para cá sozinho.</p></>}
          {step === 2 && <><div className="lt-kicker">Passo 3 de 4</div><h2 className="lt-title">Sua assinatura de e-mail</h2>
            <p className="lt-sub">Na PRICETAX a assinatura é o seu <b>banner</b> (imagem). Baixe o seu da pasta de assinaturas, escolha o tipo <b>Imagem</b>, suba o arquivo e escreva o "Atenciosamente," por cima.</p></>}
          {step === 3 && <><div className="lt-kicker">Passo 4 de 4</div><h2 className="lt-title">Como trabalhamos a partir de hoje</h2></>}
        </div>

        <div className="lt-body">
          {step === 0 && (
            <div className="lt-news">
              {newsFor(crm).map((n) => { const Icon = ICONS[n.icon] || Sparkles; return (
                <div key={n.title} className="lt-card"><Icon size={20} aria-hidden="true" /><div><b>{n.title}</b><p>{n.text}</p></div></div>
              ); })}
            </div>
          )}

          {step === 1 && (
            <>
              <Check ok={mailOk || googleOff} label="E-mail (Gmail da PRICETAX)" busy={checking && !mail} />
              <Check ok={agendaOk || googleOff} label="Agenda (Google Calendar)" busy={checking && !google} />
              {!connectedOk && <a className="lt-btn" href="/api/google/oauth/start?mail=1"><Mail size={16} aria-hidden="true" /> Conectar e-mail e agenda</a>}
              {!connectedOk && <button type="button" className="lt-link" onClick={check} disabled={checking} title={checking ? 'Conferindo a conexão' : undefined}><RefreshCw size={13} aria-hidden="true" /> Já conectei, conferir de novo</button>}
              {mail && mail.error && <div className="lt-err">{mail.error}</div>}
              {googleOff && <div className="lt-note">A conexão com o Google não está configurada neste ambiente; siga em frente.</div>}
              {!connectedOk && <div className="lt-note">Deu erro no Google? Tente de novo e, se continuar, chame o Rafael — o painel fica nesta tela até conectar.</div>}
            </>
          )}

          {step === 2 && (
            <>
              <div className={`lt-check${sigOk ? ' ok' : ''}`}>
                {sigOk ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                <span>Assinatura salva</span><b>{!sig ? 'Conferindo…' : sigOk ? 'Pronta' : 'Falta salvar'}</b>
              </div>
              <a className="lt-link" href={SIGNATURES_DRIVE} target="_blank" rel="noopener noreferrer">Abrir a pasta de assinaturas no Google Drive</a>
              <button type="button" className="lt-btn" onClick={() => setSigOpen(true)} disabled={!sig} title={!sig ? 'Carregando a assinatura' : undefined}><PenLine size={16} aria-hidden="true" /> {sigOk ? 'Ver ou editar a assinatura' : 'Configurar minha assinatura'}</button>
              <div className="lt-note">Dica: largura 480 px, "Texto antes da assinatura" = Atenciosamente, e "Em negrito" se quiser. Dá para mudar depois em E-mail › Configurar › Assinatura.</div>
            </>
          )}

          {step === 3 && (
            <>
              <ul className="lt-rules">
                <li><b>Todo e-mail de trabalho sai e chega por aqui</b> (módulo E-mail). Outlook e a tela do Gmail não são mais o caminho.</li>
                {crm && <li><b>Clicou num e-mail no CRM?</b> Abre aqui, já com a mensagem nova e as conversas da equipe com a pessoa.</li>}
                <li><b>Empresa fora do CRM</b> aparece numa faixa amarela: {crm ? 'registre o negócio na hora' : 'use “Avisar o comercial” para a Eduarda registrar'}.</li>
                <li><b>Reunião</b>: crie pela Agenda com Google Meet; convites chegam no e-mail com Sim/Talvez/Não.</li>
              </ul>
              <div className="lt-renata">
                <Sparkles size={20} aria-hidden="true" />
                <div>
                  <b>Ficou com dúvida? Pergunte à RENATA</b> — botão <b>RENATA</b> na barra do topo, em qualquer tela. Ela conhece o painel e faz o trabalho com você. Experimente:
                  <ul>{LAUNCH_ASK_EXAMPLES.map((q) => <li key={q}>“{q}”</li>)}</ul>
                </div>
              </div>
            </>
          )}
          {error && <div className="lt-err" role="alert">{error}</div>}
        </div>

        <div className="lt-foot">
          {step > 0 ? <button type="button" className="lt-btn ghost" onClick={() => setStep(step - 1)} disabled={busy} title={busy ? 'Aguarde terminar' : undefined}>Voltar</button> : <span />}
          {step === 0 && <button type="button" className="lt-btn" onClick={() => setStep(1)}>Vamos lá <ArrowRight size={16} aria-hidden="true" /></button>}
          {step === 1 && <button type="button" className="lt-btn" onClick={() => setStep(2)} disabled={!connectedOk} title={connectedOk ? undefined : 'Conecte o e-mail e a agenda para continuar'}>Continuar <ArrowRight size={16} aria-hidden="true" /></button>}
          {step === 2 && <button type="button" className="lt-btn" onClick={() => setStep(3)} disabled={!sigOk} title={sigOk ? undefined : 'Salve a assinatura para continuar'}>Continuar <ArrowRight size={16} aria-hidden="true" /></button>}
          {step === 3 && <button type="button" className="lt-btn" onClick={() => finish(true)} disabled={busy} title={busy ? 'Aguarde terminar' : undefined}>{busy ? 'Salvando…' : 'Abrir meu e-mail'} <ArrowRight size={16} aria-hidden="true" /></button>}
        </div>
      </div>
      {sigOpen && sig && <SignatureDialog value={sig} onClose={() => setSigOpen(false)} onSaved={(r) => { setSig(r); setSigOpen(false); }} />}
    </div>
  );
}
