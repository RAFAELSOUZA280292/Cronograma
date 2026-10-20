import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PWA (2026-10-17): service worker próprio em src/sw.js (sem precache — ver comentário lá); aqui só manifesto, registro e geração do arquivo.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { injectionPoint: undefined },
      manifest: {
        id: '/',
        name: 'PRICETAX — Cronograma de Reforma Tributária',
        short_name: 'PRICETAX',
        description: 'Cronograma, atividades, reuniões e agenda da PRICETAX.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#111111',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Gestão de Atividades', url: '/gestao-atividades', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Agenda', url: '/agenda', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Empresas', url: '/empresas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    // 'hidden': gera os .map mas NÃO escreve a referência //# sourceMappingURL no JS — o navegador nunca os procura. O servidor também não os
    // entrega (server/index.js responde 404 a *.map) e só os lê para traduzir a pilha dos erros no log (server/sourcemaps.js).
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '^/d/': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
