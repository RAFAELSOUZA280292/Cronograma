// Preferências da caixa de e-mail da pessoa (GET/PUT /api/mail/prefs), lidas uma vez e divididas entre a Caixa de e-mail e a
// aba E-mails do CRM. Enquanto não chegam, vale o padrão do servidor: imagens sempre à mostra.
import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../lib/api.js';

const DEFAULTS = { showImages: true };
let current = DEFAULTS;
let loading = null;
const subs = new Set();
const publish = (p) => { current = { ...DEFAULTS, ...p }; subs.forEach((f) => f(current)); };

export function useMailPrefs() {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => {
    subs.add(setPrefs);
    if (!loading) loading = apiGet('/api/mail/prefs').then(publish).catch(() => { loading = null; });
    return () => { subs.delete(setPrefs); };
  }, []);
  return prefs;
}

export async function saveMailPrefs(patch) {
  publish(await apiPut('/api/mail/prefs', { ...current, ...patch }));
  return current;
}
