// Busca do CRM (PRD 38). Desde 03/11 (Rafael: "duas buscas no CRM") é a mesma busca do topo (Buscar… / Ctrl K), que já acha
// negócios, empresas e contatos do CRM no servidor: este campo só a abre, no lugar que a equipe já conhece.
import React from 'react';
import { Search } from 'lucide-react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

export default function GlobalSearch() {
  return (
    <button type="button" className="crm-search crm-search-open" onClick={() => window.dispatchEvent(new CustomEvent('shell:search'))} title="Abre a busca do painel (a mesma do topo)">
      <Search size={14} className="crm-search-ico" aria-hidden="true" />
      <span>Buscar empresa, negócio, contato, e-mail…</span>
      <kbd aria-hidden="true">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}
