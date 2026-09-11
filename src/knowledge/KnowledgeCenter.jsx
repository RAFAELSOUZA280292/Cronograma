// Central de Conhecimento — "o cérebro da RENATA" (Fase 8, 2026-09-11,
// ver PROJECT_CONTEXT.md §39). Área administrativa PRICETAX-only
// (visibilidade decidida com o Rafael: master/pricetax; 'cliente'
// continua só conversando com a RENATA, nunca vê esta tela) — mesmo
// padrão de módulo autocontido de src/xflow/XFlow.jsx, montado como um
// novo workspaceMode em src/App.jsx.
import React, { useState } from 'react';
import {
  Sparkles, X, LogOut, LayoutDashboard, Search, AlertTriangle, Users, Building2, BarChart3,
} from 'lucide-react';
import { ThemeToggleBtn } from '../App.jsx';
import { apiGet } from '../lib/api.js';
import { KNOWLEDGE_CSS, statusMeta, knowledgeTypeLabel } from './knowledgeMeta.js';
import { MemoriesTab } from './MemoriesTab.jsx';
import { ConflictsTab } from './ConflictsTab.jsx';
import { EntitiesTab } from './EntitiesTab.jsx';
import { MetricsTab } from './MetricsTab.jsx';
import { FactDrawer } from './FactDrawer.jsx';

const TABS = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'memories', label: 'Memórias', icon: Search },
  { id: 'conflicts', label: 'Conflitos', icon: AlertTriangle },
  { id: 'people', label: 'Pessoas', icon: Users },
  { id: 'companies', label: 'Empresas', icon: Building2 },
  { id: 'metrics', label: 'Métricas', icon: BarChart3 },
];

function OverviewTab({ onOpenFact, onGoTab, refreshKey }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    setLoaded(false);
    apiGet('/api/knowledge/overview').then((res) => { setData(res); setLoaded(true); }).catch(() => setLoaded(true));
  }, [refreshKey]);

  if (!loaded) return <div className="knw-empty">Carregando…</div>;
  if (!data) return <div className="knw-empty">Não consegui carregar a visão geral.</div>;

  const { kpis, recentlyLearned, needsAttention, mostUsed } = data;
  const kpiItems = [
    ['Ativos', kpis.active], ['Organizacionais', kpis.org], ['De projeto', kpis.project], ['De conversa', kpis.conversation],
    ['Hipóteses', kpis.pendingValidation], ['Em conflito', kpis.conflicts], ['Substituídos', kpis.superseded],
    ['Aprendidos (7 dias)', kpis.recentlyLearned], ['Cache hits', kpis.cacheHits], ['Tokens economizados', kpis.tokensSaved],
  ];

  return (
    <div>
      <div className="knw-kpi-grid">
        {kpiItems.map(([label, value]) => (
          <div key={label} className="knw-kpi-card">
            <div className="knw-kpi-value">{Number(value).toLocaleString('pt-BR')}</div>
            <div className="knw-kpi-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="knw-two-col">
        <div className="knw-section">
          <div className="knw-section-title"><Sparkles size={13} color="#F5C400" /> RENATA aprendeu recentemente</div>
          {recentlyLearned.length === 0 ? <div className="knw-empty-hint">Nada aprendido ainda.</div> : recentlyLearned.map((f) => (
            <div key={f.id} className="knw-fact-card" onClick={() => onOpenFact(f.id)}>
              <div className="knw-fact-head">
                <span className="knw-chip">{knowledgeTypeLabel(f.knowledge_type)}</span>
                <span className={`knw-chip ${f.scope === 'org' ? 'scope-org' : ''}`}>{f.scope === 'org' ? 'Organização' : 'Projeto'}</span>
              </div>
              <div className="knw-fact-subject">{f.subject}</div>
              <div className="knw-fact-meta">{f.source_user_name ? `Confirmado por ${f.source_user_name}` : 'Origem não registrada'}</div>
            </div>
          ))}
        </div>

        <div className="knw-section">
          <div className="knw-section-title"><AlertTriangle size={13} color="#e2574c" /> Precisam da sua atenção</div>
          {needsAttention.length === 0 ? <div className="knw-empty-hint">Nenhum conflito pendente.</div> : needsAttention.map((f) => (
            <div key={f.id} className="knw-fact-card" onClick={() => onGoTab('conflicts')}>
              <div className="knw-fact-head"><AlertTriangle size={12} color="#e2574c" /><span className="knw-fact-subject">Possível conflito — {f.subject}</span></div>
              <div className="knw-fact-content">{f.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="knw-section">
        <div className="knw-section-title">Conhecimentos mais utilizados</div>
        {mostUsed.length === 0 ? <div className="knw-empty-hint">Ainda sem uso registrado.</div> : mostUsed.map((f) => (
          <div key={f.id} className="knw-fact-card" onClick={() => onOpenFact(f.id)}>
            <div className="knw-fact-head"><span className="knw-fact-subject">{f.subject}</span><span className="knw-chip">{f.usage_count} {f.usage_count === 1 ? 'uso' : 'usos'}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KnowledgeCenterScreen({ currentUser, onExit, onNavigateToMeeting, onLogout, theme, onToggleTheme }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [drawerFactId, setDrawerFactId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function openFact(id) { setDrawerFactId(id); }
  function closeFact() { setDrawerFactId(null); }
  // Uma edição cria uma linha NOVA (server/knowledgeCenter.js
  // `editFactVersioned`) — o drawer precisa passar a apontar pra ela,
  // senão o usuário continua vendo a versão que virou histórico.
  // `newFactId` vem só da edição; resolução de conflito/adição de
  // entidade só precisam re-buscar a lista (refreshKey).
  function onFactChanged(newFactId) {
    setRefreshKey((k) => k + 1);
    if (newFactId) setDrawerFactId(newFactId);
  }
  function openEntityFromFact(entity) {
    closeFact();
    setActiveTab(entity.type === 'PERSON' ? 'people' : 'companies');
  }

  return (
    <>
      <style>{KNOWLEDGE_CSS}</style>
      <div className="knw-shell">
        <div className="knw-topbar">
          <div className="knw-brand"><Sparkles size={18} color="#F5C400" /> Conhecimento <span style={{ fontWeight: 500, color: 'var(--text-6)', fontSize: 12 }}>— a memória da RENATA</span></div>
          <div className="knw-actions">
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
            {onExit && <button title="Sair da Central de Conhecimento" onClick={onExit}><X size={18} /></button>}
            <button title="Sair" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
        <div className="knw-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`knw-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="knw-body">
          {activeTab === 'overview' && <OverviewTab onOpenFact={openFact} onGoTab={setActiveTab} refreshKey={refreshKey} />}
          {activeTab === 'memories' && <MemoriesTab onOpenFact={openFact} refreshKey={refreshKey} />}
          {activeTab === 'conflicts' && <ConflictsTab />}
          {activeTab === 'people' && <EntitiesTab types={['PERSON']} emptyLabel="Nenhuma pessoa identificada ainda." onOpenFact={openFact} />}
          {activeTab === 'companies' && <EntitiesTab types={['COMPANY', 'PROJECT']} emptyLabel="Nenhuma empresa/projeto identificado ainda." onOpenFact={openFact} />}
          {activeTab === 'metrics' && <MetricsTab />}
        </div>
      </div>
      {drawerFactId && (
        <FactDrawer
          factId={drawerFactId}
          onClose={closeFact}
          onNavigateToMeeting={(pid, meetingId) => { closeFact(); onNavigateToMeeting(pid, meetingId); }}
          onOpenEntity={openEntityFromFact}
          onChanged={onFactChanged}
        />
      )}
    </>
  );
}
