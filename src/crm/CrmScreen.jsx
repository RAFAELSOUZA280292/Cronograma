// CRM PRICETAX — shell do módulo (Fases 1-3, 2026-09-20, PROJECT_CONTEXT.md §54/§55/§56).
// Novo workspace "CRM" ao lado dos outros; carregado sob demanda (React.lazy em
// App.jsx) pra não engordar o bundle de quem nunca abre o CRM. Só acrescenta:
// nenhuma tela existente foi alterada.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, LayoutDashboard, Building2, Users, Plus, Kanban, Package, CalendarCheck } from 'lucide-react';
import { readHistoryValue, useHistoryValue, useBackLayer } from '../lib/nav.js';
import { crm } from './crmApi.js';
import { CRM_CSS } from './crmMeta.js';
import GlobalSearch from './GlobalSearch.jsx';
import OverviewPage from './OverviewPage.jsx';
import CompaniesPage from './CompaniesPage.jsx';
import ContactsPage from './ContactsPage.jsx';
import CompanyDrawer from './CompanyDrawer.jsx';
import DealsPage from './DealsPage.jsx';
import AgendaPage from './AgendaPage.jsx';
import ActivityForm from './ActivityForm.jsx';
import DealDrawer from './DealDrawer.jsx';
import DealForm from './DealForm.jsx';
import ProductsPage from './ProductsPage.jsx';
import CompanyForm from './CompanyForm.jsx';
import ContactForm from './ContactForm.jsx';
import ImportWizard from './ImportWizard.jsx';
import BootstrapDialog from './BootstrapDialog.jsx';

const NAV = [['overview', 'Visão geral', LayoutDashboard], ['agenda', 'Agenda', CalendarCheck], ['deals', 'Negócios', Kanban], ['companies', 'Empresas', Building2], ['contacts', 'Contatos', Users], ['products', 'Produtos', Package]];

export default function CrmScreen({ currentUser, onExit, onLogout, theme, onToggleTheme, notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead, pendingOpen, onPendingOpenConsumed, onOpenProject }) {
  const [page, setPage] = useState(() => readHistoryValue('crmPage', 'overview'));
  useHistoryValue('crmPage', page, setPage, 'overview');
  const [caps, setCaps] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null); // {id, tab}
  const [companyForm, setCompanyForm] = useState(false);
  const [contactForm, setContactForm] = useState(null); // {contact?}
  const [dealDrawer, setDealDrawer] = useState(null); // id do negócio aberto
  const [dealForm, setDealForm] = useState(null); // {company?, type?}
  const [activityForm, setActivityForm] = useState(null); // {company?}
  const [overdueMine, setOverdueMine] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [queueSignal, setQueueSignal] = useState(0);
  const [dealsPreset, setDealsPreset] = useState(null); // filtros vindos dos painéis da Visão geral
  const goDeals = useCallback((preset) => { setDealsPreset({ ...(preset || {}), nonce: Date.now() }); setPage('deals'); }, [setPage]);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    crm.me().then((r) => setCaps(r.capabilities)).catch((e) => setError(e.message || 'Sem acesso ao CRM.'));
    crm.options().then(setOptions).catch(() => {});
    crm.activities({ ownerId: 'me', bucket: 'overdue', limit: 1 }).then((r) => setOverdueMine((r.counts && r.counts.overdue) || 0)).catch(() => {});
  }, [refreshKey]);

  // Um painel lateral por vez: abrir empresa fecha o negócio e vice-versa.
  // Vindo de uma notificação: abre direto o negócio (se houver) ou a aba Atividades da empresa.
  useEffect(() => {
    if (!pendingOpen || !caps) return;
    if (pendingOpen.action) {
      // Comandos da paleta (Ctrl+K): abrir formulário de criação, ir para uma página ou abrir a fila de follow-ups.
      const a = pendingOpen.action;
      if (a.startsWith('page:')) setPage(a.slice(5));
      else if (a === 'queue') { setPage('agenda'); setQueueSignal((k) => k + 1); }
      else if (caps.write && a === 'new-deal') setDealForm({});
      else if (caps.write && a === 'new-activity') setActivityForm({});
      else if (caps.write && a === 'new-company') setCompanyForm(true);
      else if (caps.write && a === 'new-contact') setContactForm({});
      if (onPendingOpenConsumed) onPendingOpenConsumed();
      return;
    }
    if (pendingOpen.dealId) { setDrawer(null); setDealDrawer(pendingOpen.dealId); } else if (pendingOpen.companyId) { setDealDrawer(null); setDrawer({ id: pendingOpen.companyId, tab: 'activities' }); }
    if (onPendingOpenConsumed) onPendingOpenConsumed();
  }, [pendingOpen, caps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Uma única camada de histórico para qualquer gaveta (empresa/negócio): trocar de uma para a outra não empilha nem desempilha.
  // O Voltar chama o `close` da gaveta aberta (que respeita a guarda de nota não registrada); o Esc é da própria gaveta (useDialog).
  const drawerCloseRef = useRef(null);
  useBackLayer(!!(drawer || dealDrawer), () => { if (drawerCloseRef.current) drawerCloseRef.current(); else { setDrawer(null); setDealDrawer(null); } });
  // Fechar um formulário e abrir a gaveta logo em seguida deixaria a entrada de histórico do formulário sob a da gaveta (Voltar "não faz nada" uma vez).
  const openAfterModal = (fn) => { setTimeout(fn, 80); };

  function openCompany(id, tab) { setDealDrawer(null); setDrawer({ id, tab: tab || 'overview' }); }
  function openDeal(id) { setDrawer(null); setDealDrawer(id); }

  // A RENATA lê o projeto do cronograma e o servidor exige acesso a Empresas (canAccessProject).
  const canAskRenata = !!(currentUser && (currentUser.isSuperAdmin || currentUser.companiesAccess));

  if (error) return <div style={{ padding: 40, fontFamily: "'Inter', sans-serif" }}><style>{CRM_CSS}</style><div className="crm-alert crm-alert-danger">{error}</div><button type="button" className="crm-btn" onClick={onExit}>Voltar</button></div>;
  if (!caps) return <div className="crm-shell"><style>{CRM_CSS}</style><div className="crm-empty">Carregando o CRM…</div></div>;

  return (
    <div className="crm-root">
      <style>{CRM_CSS}</style>
      <div className="crm-shell">
        <div className="crm-topbar">
          <div className="crm-brand"><Briefcase size={18} color="#F5C400" /> CRM <span className="crm-muted" style={{ fontWeight: 600 }}>· {caps.roleLabel}</span></div>
          <GlobalSearch onPickCompany={openCompany} onPickDeal={openDeal} />
          <div className="crm-spacer" />
          {caps.write && <button type="button" className="crm-btn" onClick={() => setActivityForm({})}><Plus size={14} /> Criar atividade</button>}
          {caps.write && <button type="button" className="crm-btn" onClick={() => setDealForm({})}><Plus size={14} /> Criar negócio</button>}
          {caps.write && <button type="button" className="crm-btn" onClick={() => setCompanyForm(true)}><Plus size={14} /> Criar empresa</button>}
          {caps.write && <button type="button" className="crm-btn" onClick={() => setContactForm({})}><Plus size={14} /> Criar contato</button>}
        </div>
        <div className="crm-layout">
          <nav className="crm-nav" aria-label="Menu do CRM">
            {NAV.map(([k, label, Icon]) => <button key={k} type="button" className={page === k ? 'active' : ''} onClick={() => setPage(k)}><Icon size={15} /> {label}{k === 'agenda' && overdueMine > 0 && <span className="crm-nav-badge" title={`${overdueMine} atividade(s) atrasada(s) sob sua responsabilidade`} aria-label={`${overdueMine} atividades atrasadas`}>{overdueMine > 99 ? '99+' : overdueMine}</span>}</button>)}
          </nav>
          <main className="crm-main">
            {page === 'overview' && <OverviewPage caps={caps} refreshKey={refreshKey} onOpenCompany={openCompany} onOpenDeal={openDeal} onGoDeals={goDeals} onGoAgenda={() => setPage('agenda')} onBootstrap={() => setShowBootstrap(true)} />}
            {page === 'agenda' && <AgendaPage queueSignal={queueSignal} onQueueConsumed={() => setQueueSignal(0)} caps={caps} options={options} currentUserId={currentUser && currentUser.id} refreshKey={refreshKey} onOpenCompany={openCompany} onOpenDeal={openDeal} onNewActivity={(o) => setActivityForm(o || {})} onChanged={refresh} />}
            {page === 'deals' && <DealsPage caps={caps} options={options} refreshKey={refreshKey} currentUserId={currentUser && currentUser.id} preset={dealsPreset} onPresetConsumed={() => setDealsPreset(null)} onOpenDeal={openDeal} onOpenCompany={openCompany} onNewDeal={(o) => setDealForm(o || {})} onNewActivity={(o) => setActivityForm(o || {})} onChanged={refresh} />}
            {page === 'companies' && <CompaniesPage caps={caps} options={options} refreshKey={refreshKey} onOpenCompany={openCompany} onNewCompany={() => setCompanyForm(true)} onImport={() => setShowImport(true)} />}
            {page === 'products' && <ProductsPage caps={caps} onChanged={refresh} />}
            {page === 'contacts' && <ContactsPage caps={caps} refreshKey={refreshKey} onOpenCompany={openCompany} onNewContact={() => setContactForm({})} onEditContact={(c) => setContactForm({ contact: c })} />}
          </main>
        </div>
      </div>

      {drawer && <CompanyDrawer key={drawer.id} closeRef={drawerCloseRef} companyId={drawer.id} initialTab={drawer.tab} caps={caps} options={options} currentUserId={currentUser && currentUser.id} onClose={() => setDrawer(null)} onChanged={refresh} onOpenCompany={(id) => setDrawer({ id, tab: 'overview' })} onOpenDeal={openDeal} onOpenProject={onOpenProject} canAskRenata={canAskRenata} />}
      {dealDrawer && <DealDrawer key={dealDrawer} closeRef={drawerCloseRef} dealId={dealDrawer} caps={caps} options={options} currentUserId={currentUser && currentUser.id} onClose={() => setDealDrawer(null)} onChanged={refresh} onOpenCompany={(id) => openCompany(id)} canAskRenata={canAskRenata} />}
      {activityForm && <ActivityForm company={activityForm.company} prefill={activityForm.prefill} options={options} currentUserId={currentUser && currentUser.id} onCancel={() => setActivityForm(null)} onSaved={() => { setActivityForm(null); refresh(); }} />}
      {dealForm && <DealForm company={dealForm.company} defaultType={dealForm.type} defaultPipelineId={dealForm.pipelineId} options={options} currentUserId={currentUser && currentUser.id} onCancel={() => setDealForm(null)} onSaved={(d) => { setDealForm(null); refresh(); openAfterModal(() => openDeal(d.id)); }} />}
      {companyForm && <CompanyForm options={options} prefillOwnerId={currentUser && currentUser.id} onCancel={() => setCompanyForm(false)} onOpenCompany={(id) => { setCompanyForm(false); openAfterModal(() => openCompany(id)); }}
        onSaved={(c) => { setCompanyForm(false); refresh(); openAfterModal(() => openCompany(c.id)); }} />}
      {contactForm && <ContactForm initial={contactForm.contact} onCancel={() => setContactForm(null)} onSaved={() => { setContactForm(null); refresh(); }} />}
      {showImport && <ImportWizard onClose={() => setShowImport(false)} onDone={refresh} />}
      {showBootstrap && <BootstrapDialog onClose={() => setShowBootstrap(false)} onDone={refresh} />}
    </div>
  );
}
