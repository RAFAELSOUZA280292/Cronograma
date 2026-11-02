// Assinatura do e-mail por pessoa (2026-11-02, Fase 2). Campos simples em vez de HTML livre: o servidor monta a tabela
// compatível com Outlook/celular (server/mailCompose.js, signatureHtml) e guarda em users.preferences.mail.signature.
// Pacote de personalização (2026-11-02): imagem própria (foto, banner ou selo) com largura fixa em px — o Outlook ignora
// max-width, então a largura escolhida vai no atributo; a tela reduz a imagem antes de subir (até 200 KB).
// Tipo Imagem × Texto e despedida livre em cima (02/11/2026): na PriceTax a assinatura é um banner pronto; os campos ficam
// para quem quiser assinatura em texto.
import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '../ui/index.jsx';
import { notify } from '../ui/dialogs.jsx';
import { apiPost, apiPut } from '../lib/api.js';
import { useDialog } from '../lib/nav.js';
import MailFrame from './MailFrame.jsx';
import { prepareImage, SIG_IMAGE_MAX_BYTES, SIG_IMAGE_WIDTHS, base64Bytes } from './mailImage.js';

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
  const [srcFile, setSrcFile] = useState(null);
  const [imgError, setImgError] = useState('');
  const fileRef = useRef(null);
  const trap = useDialog(onClose);

  useEffect(() => {
    const t = setTimeout(() => { apiPost('/api/mail/signature/preview', { signature: sig }).then((r) => setPreview(r.previewHtml)).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [sig]);

  const set = (k, v) => setSig((s) => ({ ...s, [k]: v }));
  const isImage = sig.mode === 'image';

  // Reduz para 2× a largura mostrada (fica nítida em tela de alta resolução) e até 200 KB.
  async function takeImage(file, width) {
    setImgError('');
    try {
      const img = await prepareImage(file, { maxPixels: width * 2, displayMax: width, maxBytes: SIG_IMAGE_MAX_BYTES });
      if (img.width < 40) throw new Error('A imagem é pequena demais (menos de 40 px de largura).');
      setSig((s) => ({ ...s, image: { mimeType: img.mimeType, data: img.data, width: img.width, height: img.height, alt: (s.image && s.image.alt) || '' } }));
      setSrcFile(file);
    } catch (e) { setImgError(e.message); }
  }

  function changeWidth(w) {
    const cur = sig.image;
    if (!cur) return;
    if (srcFile) { takeImage(srcFile, w); return; }
    setSig((s) => ({ ...s, image: { ...cur, width: w, height: Math.max(1, Math.round((cur.height * w) / cur.width)) } }));
  }

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
        <div className="ui-dlg-msg">Vai no fim dos e-mails novos e das respostas. Ela é montada em tabela simples para aparecer igual no Outlook, no Gmail e no celular.</div>
        <div className="mail-sig-mode" role="radiogroup" aria-label="Tipo de assinatura">
          <label className="mc-check"><input type="radio" name="sig-mode" checked={isImage} onChange={() => set('mode', 'image')} /><span><b>Imagem</b> — banner pronto (padrão PriceTax)</span></label>
          <label className="mc-check"><input type="radio" name="sig-mode" checked={!isImage} onChange={() => set('mode', 'text')} /><span><b>Texto</b> — nome, cargo e contatos, com o logo</span></label>
        </div>
        <div className="mail-sig-grid">
          <label className="wide">
            <span>Texto antes da assinatura (opcional)</span>
            <input value={sig.closing || ''} onChange={(e) => set('closing', e.target.value)} placeholder="Atenciosamente," maxLength={120} />
          </label>
          <label className="mc-check mail-sig-bold"><input type="checkbox" checked={sig.closingBold === true} onChange={(e) => set('closingBold', e.target.checked)} /><span>Em negrito</span></label>
        </div>
        {!isImage && <div className="mail-sig-grid">
          {FIELDS.map(([k, label, ph]) => (
            <label key={k} className={k === 'extra' ? 'wide' : ''}>
              <span>{label}</span>
              <input value={sig[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} maxLength={k === 'extra' ? 200 : 120} />
            </label>
          ))}
        </div>}
        <div className="mail-sig-img">
          <div className="mail-sig-label">{isImage ? 'Imagem da assinatura (banner)' : 'Imagem própria (foto, banner ou selo)'}</div>
          {sig.image ? (
            <div className="mail-sig-img-row">
              <img src={`data:${sig.image.mimeType};base64,${sig.image.data}`} alt="" width={Math.min(sig.image.width, 120)} />
              <label><span>Largura</span>
                <select value={sig.image.width} onChange={(e) => changeWidth(Number(e.target.value))}>
                  {[...new Set([...SIG_IMAGE_WIDTHS, sig.image.width])].sort((a, b) => a - b).map((w) => <option key={w} value={w}>{w} px</option>)}
                </select>
              </label>
              {!isImage && <label><span>Posição</span>
                <select value={sig.imagePos === 'top' ? 'top' : 'bottom'} onChange={(e) => set('imagePos', e.target.value)}>
                  <option value="top">Antes do nome</option>
                  <option value="bottom">Depois dos contatos</option>
                </select>
              </label>}
              <span className="mail-sig-img-size">{Math.round(base64Bytes(sig.image.data) / 1024)} KB de 200 KB</span>
              <button type="button" className="mail-link" onClick={() => fileRef.current && fileRef.current.click()}>Trocar</button>
              <button type="button" className="mail-ic" aria-label="Tirar a imagem da assinatura" title="Tirar a imagem" onClick={() => { set('image', null); setSrcFile(null); }}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ) : (
            <button type="button" className="ui-btn mail-sig-img-add" onClick={() => fileRef.current && fileRef.current.click()}><ImagePlus size={15} aria-hidden="true" /> Escolher imagem</button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) takeImage(f, sig.image ? sig.image.width : (isImage ? 480 : 200)); }} />
          {imgError && <div className="mc-error" role="alert">{imgError}</div>}
        </div>
        <div className="mc-extra">
          {!isImage && <label className="mc-check"><input type="checkbox" checked={sig.logo !== false} onChange={(e) => set('logo', e.target.checked)} /><span>Mostrar o logo</span></label>}
          <label className="mc-check"><input type="checkbox" checked={sig.enabled !== false} onChange={(e) => set('enabled', e.target.checked)} /><span>Já vir marcada ao escrever</span></label>
        </div>
        <div className="mail-sig-label">Prévia</div>
        <div className="mc-preview">{preview ? <MailFrame html={preview} title="Prévia da assinatura" minHeight={40} /> : <div className="mail-pad">{isImage ? 'Escolha a imagem da assinatura.' : 'Preencha ao menos um campo.'}</div>}</div>
        <div className="ui-dlg-actions">
          <button type="button" className="ui-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <Button variant="primary" onClick={save} loading={busy}>Salvar assinatura</Button>
        </div>
      </div>
    </div>
  );
}
