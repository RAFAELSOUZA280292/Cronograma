// Assinatura do e-mail por pessoa (2026-11-02, Fase 2). Campos simples em vez de HTML livre: o servidor monta a tabela
// compatível com Outlook/celular (server/mailCompose.js, signatureHtml) e guarda em users.preferences.mail.signature.
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/index.jsx';
import { notify } from '../ui/dialogs.jsx';
import { apiPost, apiPut } from '../lib/api.js';
import { useDialog } from '../lib/nav.js';
import MailFrame from './MailFrame.jsx';

const FIELDS = [
  ['name', 'Nome', 'Rafael Souza'],
  ['role', 'Cargo', 'Consultor tributário'],
  ['phone', 'Telefone', '(41) 3000-0000'],
  ['mobile', 'Celular', '(41) 99999-0000'],
  ['email', 'E-mail', 'nome@pricetax.com.br'],
  ['site', 'Site', 'www.pricetax.com.br'],
  ['extra', 'Linha extra (opcional)', 'Curitiba/PR'],
];

export default function SignatureDialog({ value, onClose, onSaved }) {
  const [sig, setSig] = useState(() => ({ ...value.signature }));
  const [preview, setPreview] = useState(value.previewHtml || '');
  const [busy, setBusy] = useState(false);
  const trap = useDialog(onClose);

  useEffect(() => {
    const t = setTimeout(() => { apiPost('/api/mail/signature/preview', { signature: sig }).then((r) => setPreview(r.previewHtml)).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [sig]);

  const set = (k, v) => setSig((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      const r = await apiPut('/api/mail/signature', { signature: sig });
      notify('Assinatura salva.', { tone: 'success' });
      onSaved(r);
    } catch (e) { notify(e.message, { tone: 'error' }); } finally { setBusy(false); }
  }

  return (
    <div className="ui-dlg-overlay" onClick={onClose}>
      <div className="ui-dlg mail-sig-dlg" role="dialog" aria-modal="true" aria-label="Assinatura do e-mail" ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="ui-dlg-title">Assinatura do e-mail</h2>
        <div className="ui-dlg-msg">Vai no fim dos e-mails novos e das respostas, com o logo da PriceTax. Ela é montada em tabela simples para aparecer igual no Outlook, no Gmail e no celular.</div>
        <div className="mail-sig-grid">
          {FIELDS.map(([k, label, ph]) => (
            <label key={k} className={k === 'extra' ? 'wide' : ''}>
              <span>{label}</span>
              <input value={sig[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} maxLength={k === 'extra' ? 200 : 120} />
            </label>
          ))}
        </div>
        <div className="mc-extra">
          <label className="mc-check"><input type="checkbox" checked={sig.logo !== false} onChange={(e) => set('logo', e.target.checked)} /><span>Mostrar o logo</span></label>
          <label className="mc-check"><input type="checkbox" checked={sig.enabled !== false} onChange={(e) => set('enabled', e.target.checked)} /><span>Já vir marcada ao escrever</span></label>
        </div>
        <div className="mail-sig-label">Prévia</div>
        <div className="mc-preview">{preview ? <MailFrame html={preview} title="Prévia da assinatura" minHeight={40} /> : <div className="mail-pad">Preencha ao menos um campo.</div>}</div>
        <div className="ui-dlg-actions">
          <button type="button" className="ui-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <Button variant="primary" onClick={save} loading={busy}>Salvar assinatura</Button>
        </div>
      </div>
    </div>
  );
}
