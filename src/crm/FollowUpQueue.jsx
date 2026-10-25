// Fila de follow-ups (§93): uma atividade por vez, da mais atrasada para a mais nova, com o contato a um toque (ligar / WhatsApp),
// as últimas anotações do negócio, o resultado em uma linha e o próximo passo agendado sem sair da tela. Concluir → já vem a próxima.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, ExternalLink, SkipForward, CalendarClock, CheckCircle2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal } from './ui.jsx';
import ContactLinks from './ContactLinks.jsx';
import { activityTypeLabel, fmtDateBR, realName } from './crmMeta.js';
import { notify } from '../ui/dialogs.jsx';
import { trackFlow } from '../lib/experience.js';

const QUICK = ['Falei com o contato', 'Sem resposta', 'Deixei mensagem', 'Pediu para retornar depois'];
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const plus = (n) => new Date(new Date(`${todayISO()}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const daysLate = (d) => Math.round((new Date(`${todayISO()}T12:00:00Z`) - new Date(`${d}T12:00:00Z`)) / 86400000);
// "1º Follow Up" → "2º Follow Up"; outros títulos repetem.
const nextTitle = (t) => { const m = /^(\d+)º(.*)$/.exec(String(t || '').trim()); return m ? `${Number(m[1]) + 1}º${m[2]}` : (t || 'Follow-up'); };

export default function FollowUpQueue({ onClose, onChanged, onOpenDeal }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [deal, setDeal] = useState(null);
  const [outcome, setOutcome] = useState('');
  const [phase, setPhase] = useState('work'); // work | next
  const [last, setLast] = useState(null); // atividade recém-concluída
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [initial, setInitial] = useState(0);
  const cur = items && items[0];
  const t0 = useRef(Date.now());
  useEffect(() => { t0.current = Date.now(); }, [cur && cur.id]);

  useEffect(() => {
    crm.activities({ ownerId: 'me', status: 'open', limit: 300 }).then((r) => { setItems(r.items || []); setInitial((r.items || []).length); }).catch((e) => setError(e.message || 'Não foi possível carregar a fila.'));
  }, []);
  useEffect(() => {
    setDeal(null);
    if (cur && cur.dealId) { let off = false; crm.deal(cur.dealId).then((r) => { if (!off) setDeal(r); }).catch(() => {}); return () => { off = true; }; }
    return undefined;
  }, [cur && cur.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => { setItems((l) => l.slice(1)); setOutcome(''); setPhase('work'); setLast(null); }, []);

  async function conclude() {
    setBusy(true); setError('');
    try {
      const r = await crm.completeActivity(cur.id, outcome);
      trackFlow('crm.followup.concluir', 'ok', Date.now() - t0.current);
      setDone((n) => n + 1); if (onChanged) onChanged();
      if (r.next) { notify(`Cadência: "${r.next.title}" agendado para ${fmtDateBR(r.next.dueDate)}.`, { tone: 'success', ttlMs: 6000 }); advance(); }
      else if (cur.dealId) { setLast(cur); setPhase('next'); } else advance();
    } catch (e) { trackFlow('crm.followup.concluir', 'error', Date.now() - t0.current); setError(e.message || 'Não foi possível concluir.'); } finally { setBusy(false); }
  }
  async function schedule(days) {
    setBusy(true); setError('');
    try {
      await crm.createActivity({ companyId: last.companyId, dealId: last.dealId, contactId: last.contactId || undefined, ownerId: last.ownerId || undefined, title: nextTitle(last.title), activityType: last.activityType, dueDate: plus(days), priority: 'normal' });
      trackFlow('crm.followup.agendar_proximo', 'ok', Date.now() - t0.current);
      notify(`Próximo passo agendado para ${fmtDateBR(plus(days))}.`, { tone: 'success', ttlMs: 4000 }); if (onChanged) onChanged(); advance();
    } catch (e) { setError(e.message || 'Não foi possível agendar.'); } finally { setBusy(false); }
  }
  async function postpone(days) {
    setBusy(true); setError('');
    try { await crm.updateActivity(cur.id, { dueDate: plus(days) }); notify(`Adiada para ${fmtDateBR(plus(days))}.`, { tone: 'success', ttlMs: 3000 }); if (onChanged) onChanged(); setItems((l) => l.slice(1)); setOutcome(''); } catch (e) { setError(e.message || 'Não foi possível adiar.'); } finally { setBusy(false); }
  }
  const skip = () => { setItems((l) => [...l.slice(1), l[0]]); setOutcome(''); };

  return (
    <Modal title="Fila de follow-ups" onClose={onClose} width={720} dirty={!!outcome.trim()} locked={busy}>
      {error && <div className="crm-err" role="alert">{error}</div>}
      {!items && !error && <div className="crm-empty">Carregando a fila…</div>}
      {items && !cur && (
        <div className="crm-empty" style={{ textAlign: 'center', padding: '28px 8px' }}>
          <CheckCircle2 size={34} aria-hidden="true" color="#3ecf6e" />
          <h3 style={{ margin: '10px 0 4px' }}>Fila zerada</h3>
          <div className="crm-muted">{done ? `Você concluiu ${done} follow-up${done === 1 ? '' : 's'} nesta sessão.` : 'Nenhuma atividade em aberto com você.'}</div>
          <div className="crm-form-foot" style={{ justifyContent: 'center' }}><button type="button" className="crm-btn crm-btn-primary" onClick={onClose}>Fechar</button></div>
        </div>
      )}
      {cur && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="crm-muted" aria-live="polite">Follow-up {phase === 'next' ? done : done + 1} de {initial}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{cur.title}</div>
            <div className="crm-muted" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
              <span style={{ color: daysLate(cur.dueDate) > 0 ? '#e2574c' : undefined, fontWeight: 700 }}><Clock size={12} style={{ verticalAlign: -2 }} aria-hidden="true" /> {daysLate(cur.dueDate) > 0 ? `atrasada ${daysLate(cur.dueDate)} dia(s) · ` : daysLate(cur.dueDate) === 0 ? 'hoje · ' : ''}{fmtDateBR(cur.dueDate)}{cur.dueTime ? ` às ${cur.dueTime}` : ''}</span>
              <span>{activityTypeLabel(cur.activityType)}</span>
            </div>
          </div>
          <div className="crm-section" style={{ margin: 0 }}>
            <div style={{ fontWeight: 700 }}>{cur.dealTitle || cur.companyName}{deal && deal.deal ? <span className="crm-muted" style={{ fontWeight: 400 }}> · etapa {deal.deal.stageName}</span> : null}</div>
            {cur.dealTitle && <div className="crm-muted">{cur.companyName}</div>}
            {realName(cur.contactName) && <div style={{ marginTop: 4 }}>{cur.contactName}</div>}
            <div style={{ marginTop: 6 }}><ContactLinks phone={cur.contactPhone} whatsapp={cur.contactWhatsapp} email={cur.contactEmail} /></div>
            {!cur.contactPhone && !cur.contactWhatsapp && !cur.contactEmail && <div className="crm-muted">Sem telefone nem e-mail do contato — abra o negócio para completar.</div>}
          </div>
          {cur.description && <div style={{ whiteSpace: 'pre-wrap' }}>{cur.description}</div>}
          {deal && deal.notes && deal.notes.filter((n) => n.body || (n.attachments && n.attachments.length)).length > 0 && (
            <div>
              <div className="crm-muted" style={{ fontWeight: 700, marginBottom: 4 }}>Últimas anotações</div>
              {deal.notes.filter((n) => n.body || (n.attachments && n.attachments.length)).slice(0, 3).map((n) => (
                <div key={n.id} className="crm-muted" style={{ borderLeft: '2px solid var(--line, #2a2a3a)', paddingLeft: 8, margin: '4px 0' }}>
                  <b>{n.createdByName || 'Alguém'}</b> · {fmtDateBR(n.createdAt)} — {String(n.body || (n.attachments && n.attachments.length ? '(imagem)' : '')).slice(0, 220)}
                </div>
              ))}
            </div>
          )}
          {phase === 'work' && (
            <>
              <label className="crm-muted" htmlFor="fq-outcome">Como foi? (resultado — opcional)</label>
              <textarea id="fq-outcome" rows={2} value={outcome} autoFocus onChange={(e) => setOutcome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !busy) conclude(); }} placeholder="O que ficou combinado? (Ctrl+Enter conclui)" />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{QUICK.map((q) => <button key={q} type="button" className="crm-chip" onClick={() => setOutcome((o) => (o ? `${o} · ${q}` : q))}>{q}</button>)}</div>
              <div className="crm-form-foot" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="crm-muted"><CalendarClock size={13} style={{ verticalAlign: -2 }} aria-hidden="true" /> Adiar:</span>
                  <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => postpone(1)}>Amanhã</button>
                  <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => postpone(3)}>3 dias</button>
                  <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => postpone(7)}>1 semana</button>
                  <button type="button" className="crm-btn" disabled={busy || items.length < 2} title={items.length < 2 ? 'É a última da fila' : 'Vai para o fim da fila, sem mudar nada'} onClick={skip}><SkipForward size={13} aria-hidden="true" /> Pular</button>
                  {cur.dealId && onOpenDeal && <button type="button" className="crm-btn" onClick={() => onOpenDeal(cur.dealId)}><ExternalLink size={13} aria-hidden="true" /> Abrir negócio</button>}
                </span>
                <button type="button" className="crm-btn crm-btn-primary" disabled={busy} title={busy ? 'Aguarde' : undefined} onClick={conclude}>{busy ? 'Salvando…' : 'Concluir e próximo'}</button>
              </div>
            </>
          )}
          {phase === 'next' && last && (
            <div className="crm-section" style={{ margin: 0 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Concluída. Agendar "{nextTitle(last.title)}"?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="crm-btn crm-btn-primary" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => schedule(1)}>Amanhã</button>
                <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => schedule(3)}>Em 3 dias</button>
                <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={() => schedule(7)}>Em 1 semana</button>
                <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={advance}>Sem próximo passo</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
