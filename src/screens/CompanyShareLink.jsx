// Janela "Link para o cliente" (2026-10-19): gera, copia e desativa o link público de acompanhamento da empresa (/acompanhamento/<token>). Só master e PRICETAX.
import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../lib/api.js';
import { Modal } from '../ui/dialog.jsx';
import { Button, ErrorState, SkeletonCards } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const fdt = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const DAYS = [[180, '6 meses'], [90, '3 meses'], [30, '30 dias'], [365, '1 ano'], [0, 'Sem validade']];

export default function CompanyShareLinkModal({ projectId, companyLabel, onClose }) {
  const [link, setLink] = useState(undefined);
  const [error, setError] = useState('');
  const [days, setDays] = useState(180);
  const [busy, setBusy] = useState(false);
  const base = `/api/company-share/${projectId}`;
  const load = () => { setLink(undefined); setError(''); apiGet(base).then((r) => setLink(r.link)).catch((e) => setError((e && e.message) || 'Não foi possível carregar o link.')); };
  useEffect(load, [projectId]);
  const url = link ? `${window.location.origin}/acompanhamento/${link.token}` : '';

  async function create(replace) {
    if (replace) {
      const ok = await askConfirm({ title: 'Gerar um link novo?', message: 'O link atual para de funcionar na hora. Quem já recebeu precisa do novo.', confirmLabel: 'Gerar novo link', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    try { const r = await apiPost(base, { days }); setLink(r.link); notify('Link gerado.', { tone: 'success' }); } catch (e) { notify((e && e.message) || 'Não foi possível gerar o link.', { tone: 'error' }); }
    setBusy(false);
  }
  async function revoke() {
    const ok = await askConfirm({ title: 'Desativar o link?', message: 'Quem abrir o link verá "link indisponível". Você pode gerar outro depois.', confirmLabel: 'Desativar', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await apiDelete(base); setLink(null); notify('Link desativado.', { tone: 'success' }); } catch (e) { notify((e && e.message) || 'Não foi possível desativar.', { tone: 'error' }); }
    setBusy(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); notify('Link copiado.', { tone: 'success' }); } catch { notify('Não foi possível copiar. Selecione o link e copie à mão.', { tone: 'error' }); }
  }

  return (
    <Modal title="Link para o cliente" subtitle={companyLabel} size="md" onClose={busy ? () => {} : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5, color: 'var(--text-2)' }}>
        {link === undefined && !error && <SkeletonCards count={1} />}
        {error && <ErrorState title="Não foi possível carregar" message={error} onRetry={load} />}
        {link === null && (
          <>
            <div>Gera um endereço que abre o acompanhamento da empresa <b>sem login</b>: Resumo, Cronograma e Tabela, com as subatividades, só para leitura. Para alterar algo, o cliente entra com o login dele.</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>Validade
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Validade do link">{DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <div><Button variant="primary" onClick={() => create(false)} disabled={busy} title={busy ? 'Gerando…' : undefined}>Gerar link</Button></div>
          </>
        )}
        {link && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input readOnly value={url} aria-label="Link de acompanhamento" onFocus={(e) => e.target.select()} style={{ flex: '1 1 260px', minWidth: 0 }} />
              <Button variant="primary" onClick={copy}>Copiar link</Button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
              Criado por {link.createdBy || 'equipe'} em {fdt(link.createdAt)} · {link.expiresAt ? (link.expired ? `venceu em ${fdt(link.expiresAt)}` : `vale até ${fdt(link.expiresAt)}`) : 'sem validade'} · {link.views} {link.views === 1 ? 'abertura' : 'aberturas'}{link.lastViewedAt ? `, a última em ${fdt(link.lastViewedAt)}` : ''}
            </div>
            {link.expired && <div role="alert" style={{ color: '#e2574c', fontWeight: 700 }}>Este link venceu e não abre mais. Gere um novo.</div>}
            <div style={{ fontSize: 12.5, color: 'var(--text-4)', lineHeight: 1.55 }}>
              O cliente enxerga atividades, subatividades, datas, status e responsáveis. <b>Não</b> enxerga notas, comentários, anexos, descrições, reuniões nem o log. Qualquer pessoa com o link consegue abrir: envie só a quem deve ver.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>Validade do novo
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Validade do novo link">{DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
              <Button onClick={() => create(true)} disabled={busy}>Gerar novo link</Button>
              <Button onClick={revoke} disabled={busy}>Desativar link</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
