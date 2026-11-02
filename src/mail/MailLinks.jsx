// E-mail ligado ao CRM e às Empresas (§130). Selo da conversa ("Cliente · KUHN", "Lead · OKUBO · Proposta", "Parceiro · Tróia"),
// faixa amarela "Empresa fora do CRM" (não some sozinha; a resposta vale para o domínio, para sempre), cadastro do negócio já
// preenchido sem sair do e-mail e a aba "E-mails" (negócio e empresa do CRM, empresa do cronograma). Regras no servidor:
// server/mailLinksCore.js e server/mailLinks.js. Operações (sem CRM) vê o selo sem link e, na faixa, só "Avisar o comercial".
import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Briefcase, AlertTriangle, Plus, Trophy, Handshake, EyeOff, Megaphone, Mail, Paperclip, ArrowLeft, X } from 'lucide-react';
import { Button, Callout, BusyBar, EmptyState } from '../ui/index.jsx';
import { notify, askConfirm, askText } from '../ui/dialogs.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import MailFrame from './MailFrame.jsx';
import { CRM_CSS } from '../crm/crmMeta.js';
import './mailLinks.css';

const DealForm = React.lazy(() => import('../crm/DealForm.jsx'));

// Conversa a abrir quando a Caixa de e-mail montar (vindo do cockpit; a troca de módulo reescreve o endereço e perde o #conversa=).
export const mailIntent = { threadId: null };

// Parceiro em cópia (quem indicou): etiqueta ao lado do selo do cliente, nunca no lugar dele.
export function PartnerTag({ link }) {
  if (!link || !link.partner) return null;
  return <span className="ml-badge tone-partner" title={`Indicação do parceiro ${link.partner.name} (${link.partner.key})`}>Indicação · {link.partner.name}</span>;
}

export function LinkBadge({ link, onOpenCrm, onOpenProject, withAction = false }) {
  if (!link) return null;
  const b = link.badge && !link.badge.ignored ? link.badge : null;
  if (!b) return link.partner ? <span className="ml-badge-wrap"><PartnerTag link={link} /></span> : null;
  const action = !withAction ? null
    : link.dealId && b.tone === 'lead' && onOpenCrm ? { label: 'Abrir negócio', icon: Briefcase, run: () => onOpenCrm({ dealId: link.dealId }) }
      : link.companyId && onOpenCrm ? { label: 'Abrir empresa', icon: Building2, run: () => onOpenCrm({ companyId: link.companyId }) }
        : link.projectId && onOpenProject ? { label: 'Abrir empresa', icon: Building2, run: () => onOpenProject(link.projectId) } : null;
  return (
    <span className="ml-badge-wrap">
      <span className={`ml-badge tone-${b.tone}`} title={b.text}>{b.text}</span>
      <PartnerTag link={link} />
      {action && <Button size="sm" icon={action.icon} onClick={action.run}>{action.label}</Button>}
    </span>
  );
}

// Participantes do domínio desconhecido, a partir das mensagens abertas na leitura.
function peopleOf(messages, key) {
  const out = [];
  for (const m of messages || []) {
    for (const p of [m.from, ...(m.to || []), ...(m.cc || [])]) {
      const e = String((p && p.email) || '').toLowerCase();
      const k = e.includes('@') ? (key.includes('@') ? e : e.slice(e.lastIndexOf('@') + 1)) : '';
      if (k === key && !out.some((x) => x.email === e)) out.push({ name: p.name && p.name !== e ? p.name : '', email: e });
    }
  }
  return out;
}

const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

export function prefillFrom({ key, name, subject, messages, myName, contacts, partner }) {
  const people = contacts || peopleOf(messages, key);
  const first = people[0] || { name: '', email: '' };
  const last = (messages || [])[messages ? messages.length - 1 : 0];
  return {
    title: '', source: partner ? 'parceiro' : 'E-mail',
    description: `${partner ? `Indicação do parceiro ${partner}. ` : ''}Negócio registrado a partir da troca de e-mails "${subject || '(sem assunto)'}"${last && last.date ? `, última mensagem em ${fmtDay(last.date)}` : ''}, conduzida por ${myName || 'equipe PRICETAX'}. Contatos no e-mail: ${people.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join(', ') || key}.`,
    quick: { companyName: name || key, contactName: first.name, email: first.email, companyData: key.includes('@') ? undefined : { website: key } },
  };
}

export function UnknownBanner({ link, subject, messages, crmWrite, myName, onRegister, onChanged }) {
  const [busy, setBusy] = useState('');
  const [reported, setReported] = useState(null);
  if (!link || !link.nag) return null;
  const key = link.nag;
  const name = link.nagName || key;
  const partnerName = link.partner ? link.partner.name : '';

  async function mark(kind) {
    let label = name;
    if (kind !== 'ignorar') {
      label = await askText({ title: kind === 'parceiro' ? 'Marcar como parceiro' : 'Marcar como fornecedor', label: `Nome para o selo (vale para todo e-mail de ${key})`, defaultValue: name, confirmLabel: 'Marcar' });
      if (label === null) return;
    } else if (!(await askConfirm({ title: `Ignorar ${key}?`, message: 'Os e-mails deste domínio deixam de pedir registro no CRM, para toda a equipe e para sempre. Dá para desfazer pelo CRM.', confirmLabel: 'Ignorar domínio' }))) return;
    setBusy(kind);
    try {
      await apiPost('/api/mail-links/marks', { key, kind, label });
      notify(kind === 'ignorar' ? `${key} ignorado.` : `${key} marcado como ${kind}.`, { tone: 'success' });
      onChanged();
    } catch (e) { notify(e.message, { tone: 'error' }); } finally { setBusy(''); }
  }

  async function report() {
    setBusy('report');
    try {
      const r = await apiPost('/api/mail-links/report', { key, subject });
      setReported(r);
      notify(r.already ? 'O comercial já tinha sido avisado nas últimas 24 h; registramos de novo.' : 'Comercial e sócios avisados.', { tone: 'success' });
    } catch (e) { notify(e.message, { tone: 'error' }); } finally { setBusy(''); }
  }

  async function won() {
    const ok = await askConfirm({ title: 'Registrar direto como negócio ganho?', message: 'Não é o recomendado: o negócio pula as etapas do funil e a empresa passa a Cliente. Prefira "Registrar novo negócio" e avançar as etapas. Continuar mesmo assim?', confirmLabel: 'Registrar como ganho', cancelLabel: 'Voltar' });
    if (ok) onRegister({ won: true, prefill: prefillFrom({ key, name, subject, messages, myName, partner: partnerName }) });
  }

  return (
    <div className="ml-nag" role="status">
      <AlertTriangle size={18} aria-hidden="true" className="ml-nag-icon" />
      <div className="ml-nag-body">
        <div className="ml-nag-title">Empresa fora do CRM: {key}</div>
        <div className="ml-nag-text">
          {partnerName && <strong>Indicação de {partnerName}. </strong>}
          {crmWrite ? 'A equipe está trocando e-mails com uma empresa que não está no CRM nem no módulo Empresas. Registre para o negócio não se perder.'
            : reported ? 'Comercial avisado. A Eduarda e os sócios recebem o aviso e decidem o registro.'
              : 'A equipe está trocando e-mails com uma empresa que não está no CRM nem no módulo Empresas. Avise o comercial para registrar.'}
        </div>
        <div className="ml-nag-actions">
          {crmWrite ? (
            <>
              <Button size="sm" variant="primary" icon={Plus} onClick={() => onRegister({ won: false, prefill: prefillFrom({ key, name, subject, messages, myName, partner: partnerName }) })}>Registrar novo negócio</Button>
              <Button size="sm" icon={Trophy} onClick={won}>Registrar como negócio ganho</Button>
              <Button size="sm" icon={Handshake} loading={busy === 'parceiro'} onClick={() => mark('parceiro')}>É parceiro</Button>
              <Button size="sm" icon={Building2} loading={busy === 'fornecedor'} onClick={() => mark('fornecedor')}>É fornecedor</Button>
              <Button size="sm" icon={EyeOff} loading={busy === 'ignorar'} onClick={() => mark('ignorar')}>Ignorar este domínio</Button>
            </>
          ) : (
            <Button size="sm" variant="primary" icon={Megaphone} loading={busy === 'report'} disabled={!!reported} disabledReason="Comercial já avisado" onClick={report}>{reported ? 'Comercial avisado' : 'Avisar o comercial'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Cadastro do negócio sem sair do e-mail. Ganho = cria e move para a etapa "ganho" do mesmo funil (a empresa vira Cliente no servidor).
export function RegisterDeal({ prefill, won, currentUserId, onClose, onDone }) {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet('/api/crm/options').then(setOptions).catch((e) => setError(e.message)); }, []);
  const saved = useCallback(async (deal) => {
    let wonOk = true;
    if (won && deal && deal.id) {
      const p = ((options && options.pipelines) || []).find((x) => x.id === deal.pipelineId) || ((options && options.pipelines) || []).find((x) => x.isDefault);
      const stage = p && p.stages.find((s) => s.kind === 'won');
      try { if (!stage) throw new Error('O funil não tem etapa de ganho.'); await apiPost(`/api/crm/deals/${deal.id}/move`, { stageId: stage.id }); } catch (e) { wonOk = false; notify(`Negócio criado, mas não consegui marcar como ganho: ${e.message}`, { tone: 'error' }); }
    }
    await apiPost('/api/mail-links/refresh', {}).catch(() => {});
    if (wonOk) notify(won ? 'Negócio registrado como ganho.' : 'Negócio registrado no CRM.', { tone: 'success' });
    onDone(deal);
  }, [won, options, onDone]);
  if (error) return <Callout tone="danger" icon={AlertTriangle} title="Não consegui abrir o cadastro do CRM" action={<Button size="sm" onClick={onClose}>Fechar</Button>}>{error}</Callout>;
  if (!options) return null;
  return (
    <React.Suspense fallback={null}>
      <style>{CRM_CSS}</style>
      <DealForm prefill={prefill} options={options} currentUserId={currentUserId} onCancel={onClose} onSaved={saved} />
    </React.Suspense>
  );
}

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const who = (p) => (p ? p.name || p.email : '');

// Aba "E-mails": conversas de TODA a equipe com aquele cliente (só o índice). O texto abre, sob demanda, para sócios e para quem participou.
export function MailLinksTab({ url, empty }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => { let alive = true; setData(null); apiGet(url).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [url]);
  if (error) return <Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar os e-mails">{error}</Callout>;
  if (!data) return <BusyBar active />;
  if (open) return <ThreadReader rowId={open} onBack={() => setOpen(null)} />;
  if (!data.conversations.length) {
    return <EmptyState icon={Mail} title="Nenhum e-mail encontrado" description={empty || 'Aparecem aqui as conversas de toda a equipe com os domínios e e-mails dos contatos desta empresa, assim que cada pessoa abrir a Caixa de e-mail (e numa varredura a cada 6 h).'} compact />;
  }
  return (
    <div className="ml-tab">
      <div className="ml-tab-head">{data.conversations.length} conversa{data.conversations.length === 1 ? '' : 's'} · {data.keys.join(', ')}</div>
      <ul className="ml-list">
        {data.conversations.map((c) => (
          <li key={c.id} className="ml-item">
            <div className="ml-item-main">
              <div className="ml-item-top">
                <span className="ml-subject">{c.subject}</span>
                {c.hasAttachment && <Paperclip size={13} aria-label="Tem anexo" />}
                <span className="ml-date">{fmtWhen(c.lastAt)}</span>
              </div>
              <div className="ml-meta">{c.participants.map(who).join(', ') || '—'}{c.msgCount > 1 ? ` · ${c.msgCount} mensagens` : ''}</div>
              <div className="ml-meta">Trocado por: <strong>{c.team.join(', ')}</strong></div>
            </div>
            {c.canRead ? <Button size="sm" icon={Mail} onClick={() => setOpen(c.id)}>Ler</Button>
              : <span className="ml-locked" title="O texto abre para os sócios e para quem participou da conversa.">Só sócios e participantes</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadReader({ rowId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet(`/api/mail-links/thread/${rowId}`).then(setData).catch((e) => setError(e.message)); }, [rowId]);
  return (
    <div className="ml-reader">
      <div className="ml-reader-bar">
        <Button size="sm" icon={ArrowLeft} onClick={onBack}>Voltar para a lista</Button>
        {data && !data.ownerIsMe && <span className="ml-meta">Da caixa de {data.owner} (leitura registrada)</span>}
      </div>
      {error && <Callout tone="danger" icon={AlertTriangle} title="Não consegui abrir a conversa">{error}</Callout>}
      {!data && !error && <BusyBar active />}
      {data && (
        <>
          <h3 className="ml-reader-subject">{data.subject}</h3>
          {data.messages.map((m) => (
            <article key={m.id} className="ml-msg">
              <header className="ml-msg-head">
                <strong>{who(m.from)}</strong> <span className="ml-meta">&lt;{m.from.email}&gt; · {fmtWhen(m.date)}</span>
                <div className="ml-meta">Para: {m.to.map(who).join(', ') || '—'}{m.cc.length ? ` · Cc: ${m.cc.map(who).join(', ')}` : ''}</div>
                {m.attachments.length > 0 && <div className="ml-meta"><Paperclip size={12} aria-hidden="true" /> {m.attachments.join(', ')}</div>}
              </header>
              <MailFrame html={m.html} />
            </article>
          ))}
        </>
      )}
    </div>
  );
}

// Bloco do cockpit (tela inicial) dos sócios e do Comercial: domínios com troca real que ninguém registrou.
export function MailRadarBlock({ currentUserId, onOpenMail }) {
  const [data, setData] = useState(null);
  const [register, setRegister] = useState(null);
  const [error, setError] = useState('');
  const [rev, setRev] = useState(0);
  useEffect(() => { apiGet('/api/mail-links/radar').then(setData).catch((e) => setError(e.message)); }, [rev]);
  async function ignore(it) {
    if (!(await askConfirm({ title: `Ignorar ${it.key}?`, message: 'Os e-mails deste domínio deixam de pedir registro no CRM, para toda a equipe.', confirmLabel: 'Ignorar domínio' }))) return;
    try { await apiPost('/api/mail-links/marks', { key: it.key, kind: 'ignorar', label: it.name }); setRev((r) => r + 1); } catch (e) { notify(e.message, { tone: 'error' }); }
  }
  async function partner(it) {
    const label = await askText({ title: 'Marcar como parceiro', label: `Nome para o selo (vale para todo e-mail de ${it.key})`, defaultValue: it.name, confirmLabel: 'Marcar' });
    if (label === null) return;
    try { await apiPost('/api/mail-links/marks', { key: it.key, kind: 'parceiro', label }); setRev((r) => r + 1); } catch (e) { notify(e.message, { tone: 'error' }); }
  }
  return (
    <section className="ml-radar" aria-label="Negócios fora do CRM">
      <div className="ml-radar-head">
        <h2 className="ml-radar-title">Negócios fora do CRM</h2>
        {data && <span className={`ml-radar-count${data.count ? ' on' : ''}`}>{data.count}</span>}
      </div>
      {error && <div className="ml-meta">{error}</div>}
      {!data && !error && <BusyBar active />}
      {data && !data.count && <div className="ml-meta">Nenhuma empresa fora do CRM nos e-mails dos últimos 90 dias. As conversas entram quando cada pessoa abre a Caixa de e-mail.</div>}
      {data && data.items.length > 0 && (
        <ul className="ml-list">
          {data.items.slice(0, 8).map((it) => (
            <li key={it.key} className="ml-item">
              <div className="ml-item-main">
                <div className="ml-item-top"><span className="ml-subject">{it.name} <span className="ml-meta">({it.key})</span></span><span className="ml-date">{fmtWhen(it.lastAt)}</span></div>
                {it.partner && <div className="ml-meta">Indicação de {it.partner}</div>}
                <div className="ml-meta">“{it.subject || '(sem assunto)'}” · {it.conversations} conversa{it.conversations === 1 ? '' : 's'} · {it.team.join(', ')}</div>
                {it.reported && <div className="ml-meta">Avisado por {it.reported.by} em {fmtWhen(it.reported.at)}</div>}
              </div>
              <div className="ml-radar-actions">
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setRegister({ won: false, prefill: prefillFrom({ key: it.key, name: it.name, subject: it.subject, contacts: it.contacts, myName: it.team.join(', '), partner: it.partner }) })}>Registrar</Button>
                {it.myThreadId && onOpenMail && <Button size="sm" icon={Mail} onClick={() => { mailIntent.threadId = it.myThreadId; onOpenMail(); }}>Abrir e-mail</Button>}
                <Button size="sm" icon={Handshake} onClick={() => partner(it)}>Parceiro</Button>
                <Button size="sm" icon={X} onClick={() => ignore(it)}>Ignorar</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {register && <RegisterDeal prefill={register.prefill} won={false} currentUserId={currentUserId} onClose={() => setRegister(null)} onDone={() => { setRegister(null); setRev((r) => r + 1); }} />}
    </section>
  );
}
