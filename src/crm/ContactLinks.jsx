// Telefone, WhatsApp e e-mail do contato como links de um toque (ligar, abrir conversa, escrever). Não propaga o clique (serve dentro de cartão clicável).
import React from 'react';
import { Phone, MessageCircle, Mail } from 'lucide-react';
import { fmtPhone, telHref, waHref } from './crmMeta.js';

const stop = (e) => e.stopPropagation();
const LINK = { color: 'inherit', textDecoration: 'none', fontWeight: 600 }; // sem o azul padrão de link: contraste ruim no tema escuro

export default function ContactLinks({ phone, whatsapp, email, compact = false }) {
  const wa = whatsapp || phone;
  const hasPhone = !!telHref(phone || whatsapp);
  if (!hasPhone && !email) return null;
  return (
    <div className="crm-contact-links" onClick={stop} onKeyDown={stop} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: compact ? 11.5 : 13 }}>
      {hasPhone && <a className="crm-pill" style={LINK} href={telHref(phone || whatsapp)} title="Ligar" aria-label={`Ligar para ${fmtPhone(phone || whatsapp)}`}><Phone size={11} aria-hidden="true" /> {fmtPhone(phone || whatsapp)}</a>}
      {waHref(wa) && <a className="crm-pill" style={LINK} href={waHref(wa)} target="_blank" rel="noopener noreferrer" title="Abrir conversa no WhatsApp" aria-label={`Abrir WhatsApp de ${fmtPhone(wa)}`}><MessageCircle size={11} aria-hidden="true" /> {compact ? 'WhatsApp' : `WhatsApp ${fmtPhone(wa)}`}</a>}
      {email && <a className="crm-pill" style={LINK} href={`mailto:${email}`} title="Escrever e-mail" aria-label={`Escrever para ${email}`}><Mail size={11} aria-hidden="true" /> {email}</a>}
    </div>
  );
}
