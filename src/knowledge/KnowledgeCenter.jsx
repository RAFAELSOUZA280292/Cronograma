// Central de Conhecimento — "o cérebro da RENATA" (Fase 8, 2026-09-11,
// ver PROJECT_CONTEXT.md §39). Área administrativa PRICETAX-only
// (visibilidade decidida com o Rafael: master/pricetax; 'cliente'
// continua só conversando com a RENATA, nunca vê esta tela) — mesmo
// padrão de módulo autocontido de src/xflow/XFlow.jsx, montado como um
// novo workspaceMode em src/App.jsx.
import React, { useState } from 'react';
import {
  Sparkles, LayoutDashboard, Search, AlertTriangle, Users, Building2, BarChart3, CheckCircle2, TrendingUp,
} from 'lucide-react';
import { Tabs, Kpi, KpiGrid, Section, EmptyState, SkeletonKpis, SkeletonCards, activate } from '../ui/index.jsx';
import { apiGet } from '../lib/api.js';
import { useHistoryValue, readHistoryValue } from '../lib/nav.js';
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

  if (!loaded) {
    return (
      <div aria-busy="true">
        <SkeletonKpis featured count={3} />
        <div style={{ height: 24 }} />
        <SkeletonKpis count={5} />
        <div style={{ height: 24 }} />
        <SkeletonCards count={3} />
      </div>
    );
  }
  if (!data) return <EmptyState icon={AlertTriangle} title="Não foi possível carregar a visão geral" description="Atualize a página em alguns segundos. Se continuar, avise o suporte da PRICETAX." />;

  const { kpis, recentlyLearned, needsAttention, mostUsed } = data;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <KpiGrid featured>
          <Kpi featured label="Conhecimento ativo" value={Number(kpis.active)} hint={`${Number(kpis.org)} da organização · ${Number(kpis.project)} de projetos · ${Number(kpis.conversation)} de conversas`} />
          <Kpi featured label="Aprendidos nos últimos 7 dias" value={Number(kpis.recentlyLearned)} hint="O que a RENATA passou a saber esta semana" />
          <Kpi
            featured label="Precisam da sua atenção" value={Number(kpis.conflicts)}
            tone={Number(kpis.conflicts) > 0 ? 'danger' : 'ok'}
            hint={Number(kpis.conflicts) > 0 ? 'Informações que se contradizem. Clique para resolver.' : 'Nenhuma informação em conflito.'}
            onClick={() => onGoTab('conflicts')}
          />
        </KpiGrid>
      </div>

      <Section title="Como está a memória">
        <KpiGrid>
          <Kpi label="Organizacionais" value={Number(kpis.org)} hint="Valem para toda a PRICETAX" />
          <Kpi label="De projeto" value={Number(kpis.project)} hint="Valem para uma empresa" />
          <Kpi label="De conversa" value={Number(kpis.conversation)} hint="Valem numa conversa" />
          <Kpi label="A confirmar" value={Number(kpis.pendingValidation)} hint="Ainda sem confirmação" />
          <Kpi label="Versões antigas" value={Number(kpis.superseded)} hint="Substituídas por uma versão mais nova e guardadas no histórico" />
        </KpiGrid>
      </Section>

      <Section title="Respostas reaproveitadas e custo evitado">
        <KpiGrid>
          <Kpi label="Respostas reaproveitadas" value={Number(kpis.cacheHits)} hint="Perguntas respondidas sem chamar a IA de novo" />
          <Kpi label="Custo evitado" value={Number(kpis.tokensSaved)} hint="Unidades de texto que a IA deixou de processar por causa dessas respostas" />
        </KpiGrid>
      </Section>

      <div className="knw-two-col">
        <div className="knw-section">
          <div className="knw-section-title"><Sparkles size={13} color="#F5C400" /> RENATA aprendeu recentemente</div>
          {recentlyLearned.length === 0 ? (
            <EmptyState compact icon={Sparkles} title="A RENATA ainda não aprendeu nada" description="Aparece aqui quando alguém confirma o que ela propõe numa conversa, ou quando ela estuda os Pareceres (botão no painel da RENATA)." />
          ) : recentlyLearned.map((f) => (
            <div key={f.id} className="knw-fact-card" {...activate(() => onOpenFact(f.id))}>
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
          {needsAttention.length === 0 ? (
            <EmptyState compact tone="ok" icon={CheckCircle2} title="Tudo em ordem" description="Nenhum conflito pendente. Se a RENATA encontrar duas versões do mesmo assunto, ela avisa aqui." />
          ) : needsAttention.map((f) => (
            <div key={f.id} className="knw-fact-card" {...activate(() => onGoTab('conflicts'))}>
              <div className="knw-fact-head"><AlertTriangle size={12} color="#e2574c" /><span className="knw-fact-subject">Possível conflito — {f.subject}</span></div>
              <div className="knw-fact-content">{f.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="knw-section">
        <div className="knw-section-title">Conhecimentos mais utilizados</div>
        {mostUsed.length === 0 ? (
          <EmptyState compact tone="info" icon={TrendingUp} title="Ainda sem uso registrado" description="Aparece quando a RENATA citar um conhecimento ao responder uma pergunta." />
        ) : mostUsed.map((f) => (
          <div key={f.id} className="knw-fact-card" {...activate(() => onOpenFact(f.id))}>
            <div className="knw-fact-head"><span className="knw-fact-subject">{f.subject}</span><span className="knw-chip">{f.usage_count} {f.usage_count === 1 ? 'uso' : 'usos'}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KnowledgeCenterScreen({ currentUser, onExit, onNavigateToMeeting, onLogout, theme, onToggleTheme }) {
  const [activeTab, setActiveTab] = useState(() => readHistoryValue('knowledgeTab', 'overview'));
  useHistoryValue('knowledgeTab', activeTab, setActiveTab, 'overview');
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
  // Fechar a gaveta desempilha a entrada de histórico dela (assíncrono); a navegação seguinte só pode empilhar
  // depois que esse "voltar" terminar, senão ele desfaz a própria navegação.
  function afterDrawerClosed(fn) {
    let done = false;
    const run = () => { if (done) return; done = true; window.removeEventListener('popstate', run); fn(); };
    window.addEventListener('popstate', run);
    setTimeout(run, 250);
  }
  function openEntityFromFact(entity) {
    closeFact();
    afterDrawerClosed(() => setActiveTab(entity.type === 'PERSON' ? 'people' : 'companies'));
  }

  return (
    <div className="knw-root">
      <style>{KNOWLEDGE_CSS}</style>
      <div className="knw-shell">
        <div className="knw-topbar">
          <div className="knw-brand"><Sparkles size={18} color="#F5C400" /> Conhecimento <span style={{ fontWeight: 500, color: 'var(--text-6)', fontSize: 12 }}>— a memória da RENATA</span></div>
        </div>
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} label="Seções da Central de Conhecimento" />
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
          onNavigateToMeeting={(pid, meetingId) => { closeFact(); afterDrawerClosed(() => onNavigateToMeeting(pid, meetingId)); }}
          onOpenEntity={openEntityFromFact}
          onChanged={onFactChanged}
        />
      )}
    </div>
  );
}
