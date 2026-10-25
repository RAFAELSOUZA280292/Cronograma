// Janela "Link para o cliente" (2026-10-19): gera, copia e desativa os links públicos da empresa. Só master e PRICETAX.
//  - Link do cliente (página, /a/<token>): Resumo, Cronograma e Tabela, só leitura, sem login.
//  - Link de dados (/d/<token>/...): CSV e JSON para Power BI, Excel, Make/Zapier e scripts. É um link À PARTE: desativar um não derruba o outro.
import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../lib/api.js';
import { trackAction } from '../lib/usageTracker.js';
import { Modal } from '../ui/dialog.jsx';
import { Button, ErrorState, SkeletonCards } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const fdt = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const DAYS = [[180, '6 meses'], [90, '3 meses'], [30, '30 dias'], [365, '1 ano'], [0, 'Sem validade']];
const COPY = {
  page: {
    title: 'Link do cliente',
    intro: <>Abre o acompanhamento da empresa <b>sem login</b>: Resumo, Cronograma e Tabela, com as subatividades, só para leitura. Para alterar algo, o cliente entra com o login dele.</>,
    scope: <>O cliente enxerga atividades, subatividades, datas, status e responsáveis. <b>Não</b> enxerga notas, comentários, anexos, descrições, reuniões nem o log. Qualquer pessoa com o link consegue abrir: envie só a quem deve ver.</>,
  },
  data: {
    title: 'Link de dados (Power BI e outros)',
    intro: <>Endereços que devolvem os dados em <b>CSV e JSON</b>, para o Power BI (Obter dados &rarr; Web), Excel, Make, Zapier ou um script. Só leitura, sem login, com os mesmos campos da página do cliente. É independente do link do cliente.</>,
    scope: <>Só atividades e subatividades (fase, status, datas, responsável). Sem notas, descrições, reuniões, tarefas nem log. Quem tem o endereço lê os dados: guarde como uma senha. Desativar aqui derruba só o Power BI, não o link do cliente.</>,
  },
};

function LinkBlock({ kind, projectId }) {
  const [link, setLink] = useState(undefined);
  const [error, setError] = useState('');
  const [days, setDays] = useState(kind === 'data' ? 365 : 180);
  const [busy, setBusy] = useState(false);
  const base = `/api/company-share/${projectId}`;
  const q = `?kind=${kind}`;
  const c = COPY[kind];
  const load = () => { setLink(undefined); setError(''); apiGet(`${base}${q}`).then((r) => setLink(r.link)).catch((e) => setError((e && e.message) || 'Não foi possível carregar o link.')); };
  useEffect(load, [projectId, kind]);
  const origin = window.location.origin;
  const urls = !link ? [] : kind === 'page'
    ? [{ label: 'Link', url: `${origin}/a/${link.token}` }]
    : [
      { label: 'Atividades (CSV)', url: `${origin}/d/${link.token}/atividades.csv` },
      { label: 'Subatividades (CSV)', url: `${origin}/d/${link.token}/subatividades.csv` },
      { label: 'Tudo em JSON', url: `${origin}/d/${link.token}/dados.json` },
    ];

  async function create(replace) {
    if (replace) {
      const ok = await askConfirm({ title: 'Gerar um link novo?', message: kind === 'data' ? 'O endereço atual para de funcionar na hora. Atualize a fonte de dados no Power BI (ou onde estiver usando).' : 'O link atual para de funcionar na hora. Quem já recebeu precisa do novo.', confirmLabel: 'Gerar novo link', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    try { const r = await apiPost(base, { days, kind }); trackAction('share_link_create'); setLink(r.link); notify('Link gerado.', { tone: 'success' }); } catch (e) { notify((e && e.message) || 'Não foi possível gerar o link.', { tone: 'error' }); }
    setBusy(false);
  }
  async function revoke() {
    const ok = await askConfirm({ title: 'Desativar o link?', message: kind === 'data' ? 'Quem consome os dados (Power BI, etc.) deixa de receber. Você pode gerar outro depois.' : 'Quem abrir o link verá "link indisponível". Você pode gerar outro depois.', confirmLabel: 'Desativar', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await apiDelete(`${base}${q}`); setLink(null); notify('Link desativado.', { tone: 'success' }); } catch (e) { notify((e && e.message) || 'Não foi possível desativar.', { tone: 'error' }); }
    setBusy(false);
  }
  async function copy(url) {
    try { await navigator.clipboard.writeText(url); notify('Endereço copiado.', { tone: 'success' }); } catch { notify('Não foi possível copiar. Selecione o endereço e copie à mão.', { tone: 'error' }); }
  }

  return (
    <section aria-label={c.title} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: kind === 'data' ? 16 : 0, borderTop: kind === 'data' ? '1px solid var(--border-2)' : 'none' }}>
      <h3 style={{ margin: 0, fontSize: 14.5, color: 'var(--text-1)' }}>{c.title}</h3>
      {link === undefined && !error && <SkeletonCards count={1} />}
      {error && <ErrorState title="Não foi possível carregar" message={error} onRetry={load} />}
      {link === null && (
        <>
          <div>{c.intro}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>Validade
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={`Validade do ${c.title}`}>{DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <div><Button variant="primary" onClick={() => create(false)} disabled={busy} title={busy ? 'Gerando…' : undefined}>Gerar link</Button></div>
        </>
      )}
      {link && (
        <>
          {urls.map((u) => (
            <div key={u.url} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {urls.length > 1 && <span style={{ flex: '0 0 150px', fontSize: 12.5, fontWeight: 700 }}>{u.label}</span>}
              <input readOnly value={u.url} aria-label={u.label} onFocus={(e) => e.target.select()} style={{ flex: '1 1 240px', minWidth: 0 }} />
              <Button variant={urls.length === 1 ? 'primary' : undefined} onClick={() => copy(u.url)}>Copiar</Button>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
            Criado por {link.createdBy || 'equipe'} em {fdt(link.createdAt)} · {link.expiresAt ? (link.expired ? `venceu em ${fdt(link.expiresAt)}` : `vale até ${fdt(link.expiresAt)}`) : 'sem validade'} · {link.views} {link.views === 1 ? 'acesso' : 'acessos'}{link.lastViewedAt ? `, o último em ${fdt(link.lastViewedAt)}` : ''}
          </div>
          {link.expired && <div role="alert" style={{ color: '#e2574c', fontWeight: 700 }}>Este link venceu e não abre mais. Gere um novo.</div>}
          <div style={{ fontSize: 12.5, color: 'var(--text-4)', lineHeight: 1.55 }}>{c.scope}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>Validade do novo
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Validade do novo link">{DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <Button onClick={() => create(true)} disabled={busy}>Gerar novo link</Button>
            <Button onClick={revoke} disabled={busy}>Desativar link</Button>
          </div>
        </>
      )}
    </section>
  );
}

export default function CompanyShareLinkModal({ projectId, companyLabel, onClose }) {
  return (
    <Modal title="Links para compartilhar" subtitle={companyLabel} size="md" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontSize: 13.5, color: 'var(--text-2)' }}>
        <LinkBlock kind="page" projectId={projectId} />
        <LinkBlock kind="data" projectId={projectId} />
      </div>
    </Modal>
  );
}
