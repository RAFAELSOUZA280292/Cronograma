// Ficha 360º da empresa (PRD 8/9/11). Fase 1: Visão Geral, Contatos (com o
// mapa de stakeholders), Histórico (notas + timeline), Projetos (cronograma
// vinculado, só leitura) e Auditoria (gestor+). As abas de negócios,
// propostas e contratos entram nas fases seguintes — nada de aba vazia.
import React, { useCallback, useEffect, useState } from 'react';
import { X, Pencil, Trash2, RotateCcw, Plus, Link2, AlertTriangle, StickyNote, Sparkles } from 'lucide-react';
import { crm } from './crmApi.js';
import CompanyForm from './CompanyForm.jsx';
import ContactForm from './ContactForm.jsx';
import DealForm from './DealForm.jsx';
import { RelPill, CompletenessBar, useEsc } from './ui.jsx';
import {
  fmtCnpj, fmtMoney, fmtDateBR, fmtDateTimeBR, daysLabel, staleColor, DECISION_ROLES, roleLabel, STRENGTH_META, INFLUENCE_LABELS,
  sourceLabel, TIMELINE_KIND, DEAL_TYPE_META, DEAL_STATUS_META, stageAgeColor,
} from './crmMeta.js';

function KV({ k, v }) {
  return <div><div className="k">{k}</div><div className="v">{v || <span className="crm-muted">—</span>}</div></div>;
}

function Person({ c, onOpen }) {
  const st = STRENGTH_META[c.relationshipStrength];
  return (
    <div className="crm-person" onClick={() => onOpen(c)} title={st ? `Relacionamento ${st.label.toLowerCase()}` : 'Relacionamento não avaliado'}>
      <span className="crm-dot" style={{ background: st ? st.color : 'var(--border-3)' }} />
      <div style={{ minWidth: 0 }}>
        <div className="crm-person-name">{`${c.firstName} ${c.lastName}`.trim()}{c.isPrimary ? ' ★' : ''}</div>
        <div className="crm-muted" style={{ fontSize: 11.5 }}>{c.jobTitle || c.department || c.email || ''}</div>
      </div>
    </div>
  );
}

export default function CompanyDrawer({ companyId, caps, options, initialTab, currentUserId, onClose, onChanged, onOpenCompany, onOpenDeal }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(initialTab || 'overview');
  const [events, setEvents] = useState([]);
  const [eventsEnd, setEventsEnd] = useState(false);
  const [audit, setAudit] = useState(null);
  const [available, setAvailable] = useState([]);
  const [editing, setEditing] = useState(false);
  const [contactForm, setContactForm] = useState(null); // {contact?}
  const [dealForm, setDealForm] = useState(null); // {type}
  const [noteText, setNoteText] = useState('');
  const [noteAbout, setNoteAbout] = useState('company');
  const [busy, setBusy] = useState(false);
  const [projectToLink, setProjectToLink] = useState('');
  // Esc fecha só a camada de cima: com um formulário aberto, Esc fecha o formulário (o Modal cuida disso), não a ficha.
  const noop = useCallback(() => {}, []);
  useEsc(editing || contactForm || dealForm ? noop : onClose);

  const load = useCallback(async () => {
    try {
      setError('');
      const [d, t] = await Promise.all([crm.company(companyId), crm.timeline(companyId, { limit: 30 })]);
      setData(d); setEvents(t.events); setEventsEnd(t.events.length < 30);
    } catch (e) { setError(e.message || 'Não foi possível abrir a empresa.'); }
  }, [companyId]);
  useEffect(() => { setData(null); load(); }, [load]);

  useEffect(() => {
    if (tab === 'audit' && caps.remove && !audit) crm.audit(companyId).then((r) => setAudit(r.logs)).catch(() => setAudit([]));
    if (tab === 'projects' && caps.write) crm.projectsAvailable().then((r) => setAvailable(r.projects)).catch(() => setAvailable([]));
  }, [tab, caps.remove, caps.write, audit, companyId]);

  async function afterChange() { setAudit(null); await load(); if (onChanged) onChanged(); }

  async function moreEvents() {
    const last = events[events.length - 1];
    if (!last) return;
    const t = await crm.timeline(companyId, { limit: 30, before: last.occurredAt });
    setEvents((e) => [...e, ...t.events]);
    setEventsEnd(t.events.length < 30);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      const about = noteAbout === 'company' ? { entityType: 'company', entityId: companyId }
        : noteAbout.startsWith('deal:') ? { entityType: 'deal', entityId: noteAbout.slice(5) } : { entityType: 'contact', entityId: noteAbout };
      await crm.addNote({ ...about, body: noteText });
      setNoteText('');
      await afterChange();
    } catch (e) { window.alert(e.message); } finally { setBusy(false); }
  }

  async function removeNote(id) {
    if (!window.confirm('Remover esta nota? O registro de que ela existiu continua no histórico.')) return;
    try { await crm.deleteNote(id); await afterChange(); } catch (e) { window.alert(e.message); }
  }

  async function removeCompany() {
    if (!window.confirm(`Excluir "${data.company.legalName}"? Ela some das listas, mas um administrador pode restaurar depois.`)) return;
    try { await crm.deleteCompany(companyId); if (onChanged) onChanged(); onClose(); } catch (e) { window.alert(e.message); }
  }

  async function restoreCompany() {
    try { await crm.restoreCompany(companyId); await afterChange(); } catch (e) { window.alert(e.message); }
  }

  async function removeContact(c) {
    if (!window.confirm(`Remover o contato ${c.firstName} ${c.lastName}?`)) return;
    try { await crm.deleteContact(c.id); await afterChange(); } catch (e) { window.alert(e.message); }
  }

  async function linkProject() {
    if (!projectToLink) return;
    try { await crm.linkProject(companyId, projectToLink); setProjectToLink(''); await afterChange(); } catch (e) { window.alert(e.message); }
  }

  async function unlinkProject(p) {
    if (!window.confirm(`Desvincular o projeto "${p.name}" desta empresa? O projeto em si não é alterado.`)) return;
    try { await crm.unlinkProject(companyId, p.projectId); await afterChange(); } catch (e) { window.alert(e.message); }
  }

  const co = data && data.company;
  const tabs = [['overview', 'Visão geral'], ['contacts', `Contatos${data ? ` (${data.contacts.length})` : ''}`], ['deals', `Negócios${data ? ` (${data.deals.length})` : ''}`], ['history', 'Histórico'], ['projects', `Projetos${data ? ` (${data.projects.length})` : ''}`]];
  if (caps.remove) tabs.push(['audit', 'Auditoria']);

  return (
    <>
    <div className="crm-overlay" onClick={onClose}>
      <div className="crm-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ficha da empresa">
        <div className="crm-drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              {co ? (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 className="crm-h1" style={{ overflowWrap: 'anywhere' }}>{co.legalName}</h2>
                    <RelPill value={co.relationship} />
                    {co.deletedAt && <span className="crm-pill" style={{ color: '#e2574c' }}>Excluída</span>}
                  </div>
                  <div className="crm-sub">{[co.tradeName, co.cnpj ? fmtCnpj(co.cnpj) : '', co.segment, [co.city, co.state].filter(Boolean).join('/'), co.ownerName ? `Responsável: ${co.ownerName}` : ''].filter(Boolean).join(' · ')}</div>
                </>
              ) : <h2 className="crm-h1">{error ? 'Empresa' : 'Carregando…'}</h2>}
            </div>
            <div className="crm-actions">
              {co && !co.deletedAt && caps.write && co.relationship === 'client' && <button type="button" className="crm-btn" onClick={() => setDealForm({ type: 'upsell' })}><Sparkles size={14} color="#b98af5" /> Criar oportunidade de upsell</button>}
              {co && !co.deletedAt && caps.write && <button type="button" className="crm-btn" onClick={() => setDealForm({ type: 'new' })}><Plus size={14} /> Negócio</button>}
              {co && !co.deletedAt && caps.write && <button type="button" className="crm-btn" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>}
              {co && !co.deletedAt && caps.remove && <button type="button" className="crm-btn crm-btn-danger" onClick={removeCompany}><Trash2 size={14} /> Excluir</button>}
              {co && co.deletedAt && caps.admin && <button type="button" className="crm-btn" onClick={restoreCompany}><RotateCcw size={14} /> Restaurar</button>}
              <button type="button" className="crm-icon-btn" onClick={onClose} title="Fechar"><X size={18} /></button>
            </div>
          </div>
          <div className="crm-tabs" role="tablist">
            {tabs.map(([k, l]) => <button key={k} type="button" role="tab" className={`crm-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
          </div>
        </div>

        <div className="crm-drawer-body">
          {error && <div className="crm-alert crm-alert-danger">{error}</div>}
          {!data && !error && <div className="crm-empty">Carregando…</div>}

          {data && tab === 'overview' && (
            <>
              <div className="crm-cards">
                <div className="crm-card"><div className="crm-kpi-value" style={{ color: staleColor(data.kpis.daysSinceInteraction), fontSize: 18 }}>{daysLabel(data.kpis.daysSinceInteraction)}</div><div className="crm-kpi-label">Última interação</div><div className="crm-kpi-sub">nota ou reunião realizada</div></div>
                <div className="crm-card"><div className="crm-kpi-value">{data.kpis.contacts}</div><div className="crm-kpi-label">Contatos</div></div>
                <div className="crm-card"><div className="crm-kpi-value">{data.kpis.openDeals}</div><div className="crm-kpi-label">Negócios em aberto</div><div className="crm-kpi-sub">{fmtMoney(data.kpis.openDealsValue) || 'R$ 0'}</div></div>
                <div className="crm-card"><div className="crm-kpi-value">{data.kpis.projects}</div><div className="crm-kpi-label">Projetos no painel</div><div className="crm-kpi-sub">{data.kpis.meetings} reunião(ões)</div></div>
                <div className="crm-card"><div className="crm-kpi-value" style={{ color: data.kpis.overdueTodos ? '#e2574c' : undefined }}>{data.kpis.openTodos}</div><div className="crm-kpi-label">Pendências abertas</div><div className="crm-kpi-sub">{data.kpis.overdueTodos} atrasada(s)</div></div>
                <div className="crm-card"><div className="crm-kpi-value" style={{ fontSize: 20 }}><CompletenessBar percent={co.completeness.percent} /></div><div className="crm-kpi-label">Completude do cadastro</div></div>
              </div>

              {co.completeness.missing.length > 0 && (
                <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div><strong>Falta para o cadastro ficar completo:</strong> {co.completeness.missing.map((m) => m.label).join(', ')}.</div>
                </div>
              )}

              <div className="crm-section">
                <h3 className="crm-section-title">Cadastro</h3>
                <div className="crm-kv">
                  <KV k="Razão social" v={co.legalName} /><KV k="Nome fantasia" v={co.tradeName} /><KV k="CNPJ" v={fmtCnpj(co.cnpj)} />
                  <KV k="Grupo econômico" v={co.economicGroup} /><KV k="Matriz / Filial" v={co.branchType} /><KV k="Site" v={co.website} />
                  <KV k="Segmento" v={co.segment} /><KV k="CNAE" v={co.cnae} /><KV k="Cidade / UF" v={[co.city, co.state].filter(Boolean).join(' / ')} />
                  <KV k="Origem" v={sourceLabel(co.source)} /><KV k="Responsável" v={co.ownerName} /><KV k="Data de entrada" v={fmtDateBR(co.enteredAt)} />
                  <KV k="Cliente desde" v={fmtDateBR(co.clientSince)} /><KV k="Porte" v={co.companySize} /><KV k="Regime tributário" v={co.taxRegime} />
                  <KV k="Faturamento estimado" v={fmtMoney(co.revenueEstimate)} /><KV k="Funcionários" v={co.employees != null ? String(co.employees) : ''} /><KV k="ERP" v={co.erp} />
                  <KV k="Nível estratégico" v={{ alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }[co.strategicLevel]} />
                </div>
              </div>

              {data.projects.some((p) => p.meetings.last) && (
                <div className="crm-section">
                  <h3 className="crm-section-title">Últimas reuniões (dos projetos vinculados)</h3>
                  {data.projects.flatMap((p) => p.meetings.recent.map((m) => ({ ...m, project: p.name }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((m) => (
                    <div key={`${m.id}`} className="crm-row-link" style={{ cursor: 'default' }}><span><b>{m.title}</b> <span className="crm-muted">· {m.project}</span></span><span className="crm-muted">{fmtDateBR(m.date)}</span></div>
                  ))}
                </div>
              )}
            </>
          )}

          {data && tab === 'contacts' && (
            <>
              <div className="crm-page-head" style={{ marginBottom: 10 }}>
                <div className="crm-sub" style={{ margin: 0 }}>Mapa de stakeholders — a bolinha mostra a força do relacionamento; ★ é o contato principal.</div>
                {caps.write && !co.deletedAt && <button type="button" className="crm-btn crm-btn-primary" onClick={() => setContactForm({})}><Plus size={14} /> Novo contato</button>}
              </div>
              {data.contacts.length === 0 && <div className="crm-empty">Nenhum contato ainda. Sem decisor identificado, a venda B2B fica cega.</div>}
              <div className="crm-stake">
                {[...DECISION_ROLES, ['', 'Sem papel definido']].map(([role, label]) => {
                  const list = data.contacts.filter((c) => (c.decisionRole || '') === role);
                  if (!list.length) return null;
                  return (
                    <div key={role || 'none'} className="crm-stake-col">
                      <div className="crm-stake-title">{label}</div>
                      {list.map((c) => <Person key={c.id} c={c} onOpen={(x) => caps.write && setContactForm({ contact: x })} />)}
                    </div>
                  );
                })}
              </div>
              {data.contacts.length > 0 && (
                <div className="crm-table-wrap" style={{ marginTop: 16 }}>
                  <table className="crm-table" style={{ minWidth: 640 }}>
                    <thead><tr><th>Nome</th><th>Cargo</th><th>E-mail</th><th>Telefone</th><th>Influência</th><th /></tr></thead>
                    <tbody>
                      {data.contacts.map((c) => (
                        <tr key={c.id} onClick={() => caps.write && setContactForm({ contact: c })}>
                          <td><span className="crm-name">{`${c.firstName} ${c.lastName}`.trim()}</span>{c.isPrimary && ' ★'}<div className="crm-muted">{roleLabel(c.decisionRole)}</div></td>
                          <td>{c.jobTitle || c.department}</td><td>{c.email}</td><td>{c.phone || c.whatsapp}</td><td>{INFLUENCE_LABELS[c.influence] || ''}</td>
                          <td onClick={(e) => e.stopPropagation()}>{caps.write && <button type="button" className="crm-icon-btn" title="Remover contato" onClick={() => removeContact(c)}><Trash2 size={14} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {data && tab === 'deals' && (
            <>
              <div className="crm-page-head" style={{ marginBottom: 10 }}>
                <div className="crm-sub" style={{ margin: 0 }}>Todas as oportunidades desta empresa. O Lead é a primeira etapa de um negócio; ganhar um negócio transforma a empresa em cliente.</div>
                {caps.write && !co.deletedAt && <div className="crm-actions">
                  {co.relationship === 'client' && <button type="button" className="crm-btn" onClick={() => setDealForm({ type: 'upsell' })}><Sparkles size={14} color="#b98af5" /> Oportunidade de upsell</button>}
                  <button type="button" className="crm-btn crm-btn-primary" onClick={() => setDealForm({ type: 'new' })}><Plus size={14} /> Novo negócio</button>
                </div>}
              </div>
              {data.deals.length === 0 && <div className="crm-empty">Nenhum negócio ainda.{co.relationship === 'client' ? ' Esta é uma cliente: que tal abrir uma oportunidade de upsell?' : ' Abra o primeiro para acompanhar esta venda no funil.'}</div>}
              {data.deals.length > 0 && (
                <div className="crm-table-wrap">
                  <table className="crm-table" style={{ minWidth: 640 }}>
                    <thead><tr><th>Negócio</th><th>Etapa</th><th className="crm-num">Valor</th><th>Previsão</th><th>Tipo</th></tr></thead>
                    <tbody>
                      {data.deals.map((d) => (
                        <tr key={d.id} onClick={() => onOpenDeal && onOpenDeal(d.id)}>
                          <td><div className="crm-name">{d.title}</div><div className="crm-muted">{d.ownerName}</div></td>
                          <td><span className="crm-pill" style={{ color: d.status === 'open' ? 'var(--text-4)' : DEAL_STATUS_META[d.status].color }}>{d.status === 'open' ? d.stageName : DEAL_STATUS_META[d.status].label}</span>{d.status === 'open' && (d.daysInStage || 0) > 14 && <div style={{ color: stageAgeColor(d.daysInStage), fontSize: 11 }}>{d.daysInStage} dias parado</div>}</td>
                          <td className="crm-num">{d.value ? fmtMoney(d.value) : <span className="crm-muted">—</span>}</td>
                          <td style={{ color: d.overdue ? '#e2574c' : undefined }}>{fmtDateBR(d.expectedCloseDate) || <span className="crm-muted">—</span>}</td>
                          <td><span className="crm-tag" style={{ color: DEAL_TYPE_META[d.dealType].color }}>{DEAL_TYPE_META[d.dealType].label}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {data && tab === 'history' && (
            <>
              {caps.write && !co.deletedAt && (
                <div className="crm-section">
                  <h3 className="crm-section-title"><span><StickyNote size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Nova nota</span>
                    <select value={noteAbout} onChange={(e) => setNoteAbout(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                      <option value="company">Sobre a empresa</option>
                      {data.contacts.map((c) => <option key={c.id} value={c.id}>Sobre {`${c.firstName} ${c.lastName}`.trim()}</option>)}
                      {data.deals.filter((d) => d.status === 'open').map((d) => <option key={d.id} value={`deal:${d.id}`}>Sobre o negócio {d.title}</option>)}
                    </select>
                  </h3>
                  <div className="crm-note-input">
                    <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="O que aconteceu? Ligação, decisão, preferência do cliente…" />
                  </div>
                  <div style={{ textAlign: 'right', marginTop: 8 }}><button type="button" className="crm-btn crm-btn-primary" disabled={busy || !noteText.trim()} onClick={addNote}>Registrar nota</button></div>
                </div>
              )}
              {data.notes.length > 0 && (
                <div className="crm-section">
                  <h3 className="crm-section-title">Notas</h3>
                  {data.notes.map((n) => (
                    <div key={n.id} className="crm-note">
                      <div className="crm-note-meta"><span>{n.createdByName || 'Alguém'}{n.contactName ? ` · sobre ${n.contactName}` : ''}{n.dealTitle ? ` · sobre o negócio ${n.dealTitle}` : ''} · {fmtDateTimeBR(n.createdAt)}</span>
                        {caps.write && <button type="button" className="crm-icon-btn" style={{ padding: 2 }} title="Remover nota" onClick={() => removeNote(n.id)}><X size={12} /></button>}
                      </div>
                      {n.body}
                    </div>
                  ))}
                </div>
              )}
              <div className="crm-section">
                <h3 className="crm-section-title">Linha do tempo</h3>
                <div className="crm-tl">
                  {events.map((e) => (
                    <div key={e.id} className="crm-tl-item">
                      <div className="crm-tl-kind">{TIMELINE_KIND[e.eventType] || 'Evento'}</div>
                      <div className="crm-tl-text">{e.summary}</div>
                      <div className="crm-tl-time">{fmtDateTimeBR(e.occurredAt)}</div>
                    </div>
                  ))}
                </div>
                {!eventsEnd && <div style={{ textAlign: 'center' }}><button type="button" className="crm-btn" onClick={moreEvents}>Carregar mais</button></div>}
              </div>
            </>
          )}

          {data && tab === 'projects' && (
            <>
              <div className="crm-sub" style={{ marginBottom: 12 }}>Projetos do painel ligados a esta empresa. O CRM só lê — o cronograma continua sendo editado onde sempre foi.</div>
              {data.projects.length === 0 && <div className="crm-empty">Nenhum projeto vinculado.</div>}
              {data.projects.map((p) => (
                <div key={p.projectId} className="crm-section">
                  <h3 className="crm-section-title"><span>{p.name}</span>{caps.write && <button type="button" className="crm-btn" onClick={() => unlinkProject(p)}><Link2 size={13} /> Desvincular</button>}</h3>
                  <div className="crm-kv">
                    <KV k="Atividades do cronograma" v={`${p.activities.done} de ${p.activities.total} concluídas${p.activities.overdue ? ` · ${p.activities.overdue} atrasada(s)` : ''}`} />
                    <KV k="Reuniões" v={`${p.meetings.count}${p.meetings.last ? ` · última ${fmtDateBR(p.meetings.last.date)} (${p.meetings.last.title})` : ''}`} />
                    <KV k="Próxima reunião" v={p.meetings.next ? `${fmtDateBR(p.meetings.next.date)} — ${p.meetings.next.title}` : ''} />
                    <KV k="Pendências de reunião" v={`${p.openTodos} abertas${p.overdueTodos ? ` · ${p.overdueTodos} atrasada(s)` : ''}`} />
                  </div>
                </div>
              ))}
              {caps.write && !co.deletedAt && available.length > 0 && (
                <div className="crm-section">
                  <h3 className="crm-section-title">Vincular projeto existente</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={projectToLink} onChange={(e) => setProjectToLink(e.target.value)}>
                      <option value="">Escolha um projeto do painel…</option>
                      {available.map((p) => <option key={p.id} value={p.id}>{p.name}{p.cnpj ? ` — ${p.cnpj}` : ''}</option>)}
                    </select>
                    <button type="button" className="crm-btn crm-btn-primary" disabled={!projectToLink} onClick={linkProject}>Vincular</button>
                  </div>
                </div>
              )}
            </>
          )}

          {data && tab === 'audit' && (
            <>
              <div className="crm-sub" style={{ marginBottom: 12 }}>Toda alteração de cadastro, com quem fez, quando e o valor anterior. Este histórico não pode ser apagado.</div>
              {!audit && <div className="crm-empty">Carregando…</div>}
              {audit && audit.map((a) => (
                <div key={a.id} className="crm-note">
                  <div className="crm-note-meta"><span>{a.actorName || 'Sistema'} · {a.action}</span><span>{fmtDateTimeBR(a.createdAt)}</span></div>
                  {(a.changes || []).length === 0 ? <span className="crm-muted">Sem alteração de campo.</span> : (a.changes || []).map((ch, i) => (
                    <div key={i}><b>{ch.label}</b>: <span className="crm-muted">{ch.from == null || ch.from === '' ? 'vazio' : String(ch.from)}</span> → {ch.to == null || ch.to === '' ? 'vazio' : String(ch.to)}</div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>

      {editing && co && (
        <CompanyForm initial={co} options={options} onCancel={() => setEditing(false)} onOpenCompany={onOpenCompany}
          onSaved={async () => { setEditing(false); await afterChange(); }} />
      )}
      {dealForm && co && (
        <DealForm company={{ id: co.id, legalName: co.legalName, relationship: co.relationship }} defaultType={dealForm.type} options={options} currentUserId={currentUserId}
          onCancel={() => setDealForm(null)} onSaved={async () => { setDealForm(null); setTab('deals'); await afterChange(); }} />
      )}
      {contactForm && co && (
        <ContactForm initial={contactForm.contact} company={{ id: co.id, legalName: co.legalName }} onCancel={() => setContactForm(null)}
          onSaved={async () => { setContactForm(null); await afterChange(); }} />
      )}
    </>
  );
}
