// Layout da tela inicial (2026-10-30): uma única coluna de conteúdo de 1240 px; "Mensagem do dia" à esquerda e "Hoje" à direita, no
// mesmo nível e na mesma altura; embaixo, agenda/semana lado a lado, "Continuar" e os módulos em 4 colunas. Abaixo de 1200 px tudo
// empilha. Os blocos têm largura 100% da sua célula: nenhum define largura própria.
export const HOME_CSS = `
.home { width: min(1240px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 20px; box-sizing: border-box; font-family: 'Inter', sans-serif; text-align: left; }
.home-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.home-hello { display: flex; flex-direction: column; gap: 2px; }
.home-title { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; color: var(--text-1); }
.home-date { margin: 0; font-size: 14px; color: var(--text-4); }
.home-hero, .home-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: stretch; }
.home-hero > *, .home-row > * { min-width: 0; margin: 0 !important; }
@media (min-width: 1200px) {
  .home-hero, .home-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .home-hero { grid-auto-rows: minmax(400px, auto); }
  .home-hero > :only-child, .home-row > :only-child { grid-column: 1 / -1; }
  .home-hero .tp { position: relative; }
  .home-hero .tp-card { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }
  .home-hero .tp-scroll { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -10px; padding: 0 10px; }
}
.home-agenda:empty { display: none; }
.home-agenda .rab-shell { width: 100%; }
@media (min-width: 1200px) {
  .home-agenda .rab-shell:has(> :nth-child(3)) { display: block; column-count: 2; column-gap: 20px; }
  .home-agenda .rab-shell:has(> :nth-child(3)) > * { break-inside: avoid; margin: 0 0 20px; }
}
.home-ask { margin: 4px 0 -8px; font-size: 14px; color: var(--text-4); }
.home-launch { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 1100px) { .home-launch { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .home-launch { grid-template-columns: minmax(0, 1fr); } .home-title { font-size: 24px; } }
.home-grp-title { margin: 0 0 8px; font-size: 13.5px; font-weight: 700; color: var(--text-2); }
.home-grp-list { display: flex; flex-direction: column; gap: 8px; }
.gate-card { transition: border-color .12s ease, background-color .12s ease; }
.gate-card:hover { border-color: var(--text-5) !important; background: var(--bg-3) !important; }
.gate-card:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .gate-card { transition: none; } }
`;
