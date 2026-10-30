// Telefone, WhatsApp e e-mail do contato como links de um toque (ligar, abrir conversa, escrever) e um botão azul que copia o número (só dígitos).
// Não propaga o clique (serve dentro de cartão clicável).
import React, { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Mail, Copy, Check } from 'lucide-react';
import { fmtPhone, plainPhone, telHref, waHref } from './crmMeta.js';
import { notify } from '../ui/dialogs.jsx';

const stop = (e) => e.stopPropagation();
const LINK = { color: 'inherit', textDecoration: 'none', fontWeight: 600 }; // sem o azul padrão de link: contraste ruim no tema escuro
const BLUE = '#3ea6ff';
const COPY = { color: BLUE, background: 'rgba(62,166,255,.14)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 };

async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* tenta o caminho antigo abaixo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

// Copia o número limpo (47991130619) para a área de transferência; o botão vira "Copiado" por 2 s.
function CopyNumber({ value, compact }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const num = plainPhone(value);
  if (!num) return null;
  async function copy() {
    const ok = await writeClipboard(num);
    if (!ok) { notify(`Não foi possível copiar. O número é ${num}.`, { tone: 'error', ttlMs: 12000 }); return; }
    setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 2000);
  }
  return (
    <button type="button" className="crm-pill" style={COPY} onClick={copy} title={`Copiar o número: ${num}`} aria-label={`Copiar o número ${num}`}>
      {done ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />} {done ? 'Copiado' : (compact ? 'Copiar' : 'Copiar número')}
      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{done ? `Número ${num} copiado` : ''}</span>
    </button>
  );
}

export default function ContactLinks({ phone, whatsapp, email, compact = false }) {
  const wa = whatsapp || phone;
  const hasPhone = !!telHref(phone || whatsapp);
  if (!hasPhone && !email) return null;
  const main = phone || whatsapp;
  const sameNumber = plainPhone(main) === plainPhone(wa);
  return (
    <div className="crm-contact-links" onClick={stop} onKeyDown={stop} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: compact ? 11.5 : 13 }}>
      {hasPhone && <a className="crm-pill" style={LINK} href={telHref(main)} title="Ligar" aria-label={`Ligar para ${fmtPhone(main)}`}><Phone size={11} aria-hidden="true" /> {fmtPhone(main)}</a>}
      {hasPhone && !sameNumber && <CopyNumber value={main} compact={compact} />}
      {waHref(wa) && <a className="crm-pill" style={LINK} href={waHref(wa)} target="_blank" rel="noopener noreferrer" title="Abrir conversa no WhatsApp" aria-label={`Abrir WhatsApp de ${fmtPhone(wa)}`}><MessageCircle size={11} aria-hidden="true" /> {compact ? 'WhatsApp' : `WhatsApp ${fmtPhone(wa)}`}</a>}
      {waHref(wa) && <CopyNumber value={wa} compact={compact} />}
      {email && <a className="crm-pill" style={LINK} href={`mailto:${email}`} title="Escrever e-mail" aria-label={`Escrever para ${email}`}><Mail size={11} aria-hidden="true" /> {email}</a>}
    </div>
  );
}
