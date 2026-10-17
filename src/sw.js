// Service worker do PRICETAX (2026-10-17, PWA). Objetivo: o app ser instalável e abrir a casca mesmo sem rede.
// Decisões deliberadas (leia antes de mudar):
//  • NÃO pré-armazena nada (sem precache): cada deploy gera arquivos novos com hash e apaga os velhos do servidor; um precache atrelado a versão
//    exigiria "atualizar o app" e arriscaria uma aba antiga com pedaços que já não existem (o `lazyRetry` já cobre esse caso com um aviso).
//  • NUNCA guarda respostas de /api: dado do projeto sempre vem do servidor (login, permissões, gravação). Offline, o app mostra "Sem conexão".
//  • Navegação (HTML): rede primeiro (4 s); se falhar, devolve a última casca guardada. Uma só casca serve qualquer endereço (SPA).
//  • /assets/* (nome com hash = imutável): cache primeiro, com limite de entradas e de idade.
import { clientsClaim } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
clientsClaim();

const SHELL_CACHE = 'pricetax-shell-v1';
const SHELL_KEY = '/__shell__';

async function shellHandler({ request }) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(request, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res && res.ok && (res.headers.get('content-type') || '').includes('text/html')) cache.put(SHELL_KEY, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(SHELL_KEY);
    if (cached) return cached;
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><body style="font-family:sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px"><div><h1 style="font-size:20px">Sem conexão</h1><p>Conecte-se à internet e tente de novo.</p></div></body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

registerRoute(new NavigationRoute(shellHandler, { denylist: [/^\/api\//] }));

registerRoute(
  ({ url, request }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/') && request.method === 'GET' && !/\.map$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'pricetax-assets-v1',
    plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true })],
  }),
);
