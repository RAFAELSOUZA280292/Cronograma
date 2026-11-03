// Aceitar / Talvez / Recusar — botões compactos; a resposta atual aparece marcada (aria-pressed). `labels` troca os textos
// (o cartão de convite do e-mail usa Sim / Talvez / Não, como o Google).
// Cores de semáforo (Rafael, 03/11/2026, §156): Aceitar verde ✅, Talvez amarelo 🟡, Recusar vermelho ❌; a escolhida fica cheia.
import React from 'react';
import { Button } from '../ui/index.jsx';
import './agenda.css';

const OPTIONS = [
  { value: 'accepted', label: 'Aceitar', emoji: '✅', tone: 'yes' },
  { value: 'tentative', label: 'Talvez', emoji: '🟡', tone: 'maybe' },
  { value: 'declined', label: 'Recusar', emoji: '❌', tone: 'no' },
];

export default function RsvpButtons({ ev, onRespond, busy, labels }) {
  return (
    <div role="group" aria-label={`Responder ao convite: ${ev.title || 'compromisso'}`} className="agd-rsvp">
      {OPTIONS.map(({ value, label, emoji, tone }) => {
        const on = ev.myResponse === value;
        return (
          <Button
            key={value} size="sm" className={`agd-rsvp-btn ${tone}${on ? ' on' : ''}`}
            aria-pressed={on} disabled={busy} disabledReason="Enviando a sua resposta…"
            title={labels ? `${label} o convite` : undefined} onClick={() => onRespond(ev, value)}
          >
            <span className="agd-rsvp-emoji" aria-hidden="true">{emoji}</span>{(labels && labels[value]) || label}
          </Button>
        );
      })}
    </div>
  );
}
