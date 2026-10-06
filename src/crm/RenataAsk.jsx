// "Perguntar à RENATA" nas fichas do CRM (Onda 5, §81). A RENATA é por PROJETO do cronograma (ProjectAssistant),
// então só existe quando a empresa tem projeto vinculado. Montado já aberto (`defaultOpen`) e desmonta ao fechar (`onClosed`).
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { ProjectAssistant } from '../assistant/ProjectAssistant.jsx';

function RenataHost({ project, onClose, onReload }) {
  // Portal no body: a gaveta da ficha tem foco preso e rolagem própria; o painel da RENATA precisa ficar fora dela.
  return createPortal(
    <div className="crm-root crm-renata-host" style={{ display: 'contents' }}>
      <ProjectAssistant projectId={project.projectId} projectName={project.name} view="meetings" onReloadProjects={onReload} defaultOpen onClosed={onClose} />
    </div>,
    document.body,
  );
}

export default function RenataAsk({ projects, canAsk, onReload }) {
  const list = (projects || []).filter((p) => p && p.projectId);
  const [pick, setPick] = useState('');
  const [active, setActive] = useState(null);
  const chosen = list.find((p) => p.projectId === pick) || list[0];

  if (!list.length) return <div className="crm-muted" style={{ fontSize: 12.5 }}>A RENATA responde por projeto do cronograma — vincule um projeto a esta empresa para perguntar.</div>;
  if (!canAsk) return <div className="crm-muted" style={{ fontSize: 12.5 }}>A RENATA responde por projeto do cronograma, e o seu usuário não tem acesso ao módulo Empresas.</div>;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {list.length > 1 && (
        <select value={chosen.projectId} onChange={(e) => setPick(e.target.value)} aria-label="Projeto para perguntar à RENATA" style={{ width: 'auto', maxWidth: 320 }}>
          {list.map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}
        </select>
      )}
      <button type="button" className="crm-btn" onClick={() => setActive(chosen)}><Sparkles size={14} color="#F5C400" /> Perguntar à RENATA</button>
      {list.length === 1 && <span className="crm-muted" style={{ fontSize: 12 }}>sobre o projeto {chosen.name}</span>}
      {active && <RenataHost key={active.projectId} project={active} onClose={() => setActive(null)} onReload={onReload} />}
    </div>
  );
}
