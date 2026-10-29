# Endereços do front-end (gerado)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

O app **não tem roteador de páginas**: a navegação interna é por estado (`mode`) + `pushState`; `src/lib/routes.js` só liga cada módulo a um endereço (para favoritar/abrir direto) e define `canOpenMode` (quem pode abrir). Abaixo, o mapa módulo → endereço.

| Módulo (`mode`) | Endereço |
|---|---|
| `personal` | `/gestao-atividades` |
| `company` | `/empresas` |
| `xflow` | `/xflow` |
| `agenda` | `/agenda` |
| `macro` | `/visao-geral` |
| `knowledge` | `/conhecimento` |
| `pareceres` | `/pareceres` |
| `modelos` | `/modelos` |
| `crm` | `/crm` |
| `users` | `/usuarios` |
| `ops` | `/inteligencia` |
