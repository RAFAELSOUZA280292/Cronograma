// Busca global do CRM (PRD 38) — Fase 1: empresas e contatos.
import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { crm } from './crmApi.js';
import { fmtCnpj, fmtMoney } from './crmMeta.js';

export default function GlobalSearch({ onPickCompany, onPickDeal }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => { crm.search(q).then((r) => { if (!cancelled) { setRes(r); setOpen(true); } }).catch(() => {}); }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const empty = res && !res.companies.length && !res.contacts.length && !(res.deals && res.deals.length);
  function pick(id, tab) { setOpen(false); setQ(''); onPickCompany(id, tab); }

  return (
    <div className="crm-search" ref={boxRef}>
      <Search size={14} className="crm-search-ico" />
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res && setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} placeholder="Buscar empresa, negócio, contato, e-mail…" aria-label="Busca global do CRM" />
      {open && res && (
        <div className="crm-search-pop">
          {empty && <div className="crm-muted" style={{ padding: 10 }}>Nada encontrado para “{q}”.</div>}
          {res.companies.length > 0 && <div className="crm-search-group">Empresas</div>}
          {res.companies.map((c) => (
            <button key={c.id} type="button" className="crm-search-item" onClick={() => pick(c.id)}>
              <span style={{ fontWeight: 800 }}>{c.legalName}</span><small>{[c.tradeName, c.cnpj ? fmtCnpj(c.cnpj) : '', [c.city, c.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          {res.deals && res.deals.length > 0 && <div className="crm-search-group">Negócios</div>}
          {(res.deals || []).map((d) => (
            <button key={d.id} type="button" className="crm-search-item" onClick={() => { setOpen(false); setQ(''); onPickDeal(d.id); }}>
              <span style={{ fontWeight: 800 }}>{d.title}</span><small>{[d.companyName, d.stageName, d.value ? fmtMoney(d.value) : ''].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          {res.contacts.length > 0 && <div className="crm-search-group">Contatos</div>}
          {res.contacts.map((c) => (
            <button key={c.id} type="button" className="crm-search-item" onClick={() => pick(c.companyId, 'contacts')}>
              <span style={{ fontWeight: 800 }}>{c.name}</span><small>{[c.jobTitle, c.companyName, c.email].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
