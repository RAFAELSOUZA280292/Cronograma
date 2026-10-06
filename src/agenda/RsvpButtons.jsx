// Aceitar / Talvez / Recusar — botões compactos; a resposta atual aparece marcada (aria-pressed).
import React from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import { Button } from '../ui/index.jsx';

const OPTIONS = [
  { value: 'accepted', label: 'Aceitar', Icon: Check },
  { value: 'tentative', label: 'Talvez', Icon: CircleHelp },
  { value: 'declined', label: 'Recusar', Icon: X },
];

export default function RsvpButtons({ ev, onRespond, busy }) {
  return (
    <div role="group" aria-label={`Responder ao convite: ${ev.title || 'compromisso'}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value} size="sm" icon={Icon} variant={ev.myResponse === value ? 'primary' : undefined}
          aria-pressed={ev.myResponse === value} disabled={busy} disabledReason="Enviando a sua resposta…"
          onClick={() => onRespond(ev, value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
