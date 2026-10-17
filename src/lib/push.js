// Notificações push no navegador (2026-10-17): ativar/desativar neste aparelho e enviar um teste. Nada daqui roda sozinho: o pedido de permissão só
// acontece quando a pessoa toca em "Ativar". Depende do service worker (só existe no sistema publicado) e das chaves VAPID no servidor.
import { apiGet, apiPost } from './api.js';
import { urlBase64ToUint8Array } from './pushPayload.js';

export function isStandalone() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch { return false; }
}
export function isIos() {
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

// Estados: 'carregando' | 'sem-servidor' | 'sem-suporte' | 'instalar-ios' | 'bloqueado' | 'desligado' | 'ligado'
export async function loadPushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { state: isIos() && !isStandalone() ? 'instalar-ios' : 'sem-suporte' };
  }
  if (isIos() && !isStandalone()) return { state: 'instalar-ios' };
  let cfg;
  try { cfg = await apiGet('/api/push/config'); } catch { return { state: 'sem-suporte', erro: 'Não foi possível consultar o servidor.' }; }
  if (!cfg.enabled) return { state: 'sem-servidor' };
  if (Notification.permission === 'denied') return { state: 'bloqueado', publicKey: cfg.publicKey };
  let reg = null;
  try { reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]); } catch { reg = null; }
  if (!reg) return { state: 'sem-suporte', erro: 'O sistema ainda está preparando o aplicativo neste aparelho. Recarregue a página e tente de novo.' };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { state: 'desligado', publicKey: cfg.publicKey };
  // conferir se o servidor ainda conhece esta inscrição (pode ter sido apagada após falha do serviço de push)
  let known = true;
  try { const st = await apiGet('/api/push/status'); known = st.endpoints.includes(sub.endpoint); } catch { /* assume que sim */ }
  if (!known) { try { await apiPost('/api/push/subscribe', sub.toJSON()); } catch { return { state: 'desligado', publicKey: cfg.publicKey }; } }
  return { state: 'ligado', publicKey: cfg.publicKey };
}

export async function enablePush(publicKey) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, motivo: perm === 'denied' ? 'bloqueado' : 'recusado' };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await apiPost('/api/push/subscribe', sub.toJSON());
  return { ok: true };
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await apiPost('/api/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* segue: o servidor limpa sozinho na próxima falha */ }
    await sub.unsubscribe();
  }
}

export const sendPushTest = () => apiPost('/api/push/test', {});
