// Layout da tela inicial (2026-10-30): uma única coluna de conteúdo de 1240 px. Desde 02/11/2026 (§126) os blocos ficam na grade
// personalizável de src/home/HomeGrid.jsx (GRID_CSS: ordem, largura e altura dos blocos); aqui só o cabeçalho, a agenda e os
// módulos. Os blocos têm largura 100% da sua célula: nenhum define largura própria.
export const HOME_CSS = `
.home { width: min(1240px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 20px; box-sizing: border-box; font-family: 'Inter', sans-serif; text-align: left; }
.home-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.home-hello { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
.home-hello > div { display: flex; flex-direction: column; gap: 2px; }
.home-title { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; color: var(--text-1); }
.home-date { margin: 0; font-size: var(--fs-md); color: var(--text-4); }
.hb[data-id="agenda"] .rab-shell { width: 100%; }
@media (min-width: 1200px) {
  .hb[data-id="agenda"][data-w="6"] .rab-shell:has(> :nth-child(3)) { display: block; column-count: 2; column-gap: 20px; }
  .hb[data-id="agenda"][data-w="6"] .rab-shell:has(> :nth-child(3)) > * { break-inside: avoid; margin: 0 0 20px; }
}
.home-mods { display: flex; flex-direction: column; gap: 20px; container-type: inline-size; }
.home-ask { margin: 4px 0 -8px; font-size: var(--fs-md); color: var(--text-4); }
.home-launch { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
@container (max-width: 1060px) { .home-launch { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (max-width: 560px) { .home-launch { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .home-title { font-size: 24px; } }
.home-grp-title { margin: 0 0 8px; font-size: 13.5px; font-weight: 700; color: var(--text-2); }
.home-grp-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.gate-card { transition: border-color .12s ease, background-color .12s ease; }
.gate-card:hover { border-color: var(--text-5) !important; background: var(--bg-3) !important; }
.gate-card:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .gate-card { transition: none; } }
`;
