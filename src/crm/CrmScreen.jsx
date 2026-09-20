// CRM PRICETAX — shell do módulo (Fase 1, 2026-09-20, PROJECT_CONTEXT.md §54).
// Novo workspace "CRM" ao lado dos outros; carregado sob demanda (React.lazy em
// App.jsx) pra não engordar o bundle de quem nunca abre o CRM. Só acrescenta:
// nenhuma tela existente foi alterada.
import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, LayoutDashboard, Building2, Users, Plus, X, LogOut } from 'lucide-react';
import { ThemeToggleBtn } from '../App.jsx';
import { crm } from './crmApi.js';
import { CRM_CSS } from './crmMeta.js';
import GlobalSearch from './GlobalSearch.jsx';
import OverviewPage from './OverviewPage.jsx';
import CompaniesPage from './CompaniesPage.jsx';
import ContactsPage from './ContactsPage.jsx';
import CompanyDrawer from './CompanyDrawer.jsx';
import CompanyForm from './CompanyForm.jsx';
import ContactForm from './ContactForm.jsx';
import ImportWizard from './ImportWizard.jsx';
import BootstrapDialog from './BootstrapDialog.jsx';

const NAV = [['overview', 'Visão geral', LayoutDashboard], ['companies', 'Empresas', Building2], ['contacts', 'Contatos', Users]];

export default function CrmScreen({ currentUser, onExit, onLogout, theme, onToggleTheme }) {
  const [page, setPage] = useState('overview');
  const [caps, setCaps] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null); // {id, tab}
  const [companyForm, setCompanyForm] = useState(false);
  const [contactForm, setContactForm] = useState(null); // {contact?}
  const [showImport, setShowImport] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    crm.me().then((r) => setCaps(r.capabilities)).catch((e) => setError(e.message || 'Sem acesso ao CRM.'));
    crm.options().then(setOptions).catch(() => {});
  }, [refreshKey]);

  function openCompany(id, tab) { setDrawer({ id, tab: tab || 'overview' }); }

  if (error) return <div style={{ padding: 40 }}><style>{CRM_CSS}</style><div className="crm-alert crm-alert-danger">{error}</div><button type="button" className="crm-btn" onClick={onExit}>Voltar</button></div>;
  if (!caps) return <div className="crm-shell"><style>{CRM_CSS}</style><div className="crm-empty">Carregando o CRM…</div></div>;

  return (
    <>
      <style>{CRM_CSS}</style>
      <div className="crm-shell">
        <div className="crm-topbar">
          <div className="crm-brand"><Briefcase size={18} color="#F5C400" /> CRM <span className="crm-muted" style={{ fontWeight: 600 }}>· {caps.roleLabel}</span></div>
          <GlobalSearch onPickCompany={openCompany} />
          <div className="crm-spacer" />
          {caps.write && <button type="button" className="crm-btn" onClick={() => setCompanyForm(true)}><Plus size={14} /> Empresa</button>}
          {caps.write && <button type="button" className="crm-btn" onClick={() => setContactForm({})}><Plus size={14} /> Contato</button>}
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onExit && <button type="button" className="crm-icon-btn" title="Sair do CRM" onClick={onExit}><X size={18} /></button>}
          <button type="button" className="crm-icon-btn" title="Sair" onClick={onLogout}><LogOut size={16} /></button>
        </div>
        <div className="crm-layout">
          <nav className="crm-nav" aria-label="Menu do CRM">
            {NAV.map(([k, label, Icon]) => <button key={k} type="button" className={page === k ? 'active' : ''} onClick={() => setPage(k)}><Icon size={15} /> {label}</button>)}
          </nav>
          <main className="crm-main">
            {page === 'overview' && <OverviewPage caps={caps} refreshKey={refreshKey} onOpenCompany={openCompany} onBootstrap={() => setShowBootstrap(true)} />}
            {page === 'companies' && <CompaniesPage caps={caps} options={options} refreshKey={refreshKey} onOpenCompany={openCompany} onNewCompany={() => setCompanyForm(true)} onImport={() => setShowImport(true)} />}
            {page === 'contacts' && <ContactsPage caps={caps} refreshKey={refreshKey} onOpenCompany={openCompany} onNewContact={() => setContactForm({})} onEditContact={(c) => setContactForm({ contact: c })} />}
          </main>
        </div>
      </div>

      {drawer && <CompanyDrawer companyId={drawer.id} initialTab={drawer.tab} caps={caps} options={options} onClose={() => setDrawer(null)} onChanged={refresh} onOpenCompany={(id) => setDrawer({ id, tab: 'overview' })} />}
      {companyForm && <CompanyForm options={options} prefillOwnerId={currentUser && currentUser.id} onCancel={() => setCompanyForm(false)} onOpenCompany={(id) => { setCompanyForm(false); openCompany(id); }}
        onSaved={(c) => { setCompanyForm(false); refresh(); openCompany(c.id); }} />}
      {contactForm && <ContactForm initial={contactForm.contact} onCancel={() => setContactForm(null)} onSaved={() => { setContactForm(null); refresh(); }} />}
      {showImport && <ImportWizard onClose={() => setShowImport(false)} onDone={refresh} />}
      {showBootstrap && <BootstrapDialog onClose={() => setShowBootstrap(false)} onDone={refresh} />}
    </>
  );
}
