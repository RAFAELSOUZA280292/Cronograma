// Tema, opções e CSS de página dos PDFs (relatório do cronograma, reunião e dossiê).
// Cores literais por tema (nunca var(--...) do app): o PDF não herda o tema da tela, quem escolhe é o usuário na janela "Exportar PDF".

export const PDF_THEMES = {
  dark: {
    label: 'Escuro',
    bg: '#0B0E1A', card: '#161B2E', head: '#1D2338', line: '#262C46', track: '#1D2338',
    text: '#FFFFFF', muted: '#B8BCC8', faint: '#7B8098',
    accent: '#FEDC04', fill: '#FEDC04', fillText: '#0B0E1A',
    ok: '#3DDC84', bad: '#FF6B6B', warn: '#F0954D', info: '#5B8DEF',
    kpiTotal: '#FEDC04', kpiDone: '#3DDC84', kpiRun: '#B8BCC8', chip: '#FFFFFF', logo: 'branco',
  },
  light: {
    label: 'Claro',
    bg: '#FFFFFF', card: '#F4F6FB', head: '#E9EDF6', line: '#D5DAE8', track: '#E3E7F1',
    text: '#0B0E1A', muted: '#566079', faint: '#8089A2',
    accent: '#7A6200', fill: '#FEDC04', fillText: '#0B0E1A',
    ok: '#0B7A43', bad: '#C62828', warn: '#B45309', info: '#1D4ED8',
    kpiTotal: '#0B0E1A', kpiDone: '#0B7A43', kpiRun: '#1D4ED8', chip: '#F4F6FB', logo: 'preto',
  },
};

export function pdfStatusMeta(theme) {
  const t = PDF_THEMES[theme] || PDF_THEMES.dark;
  const dark = theme !== 'light';
  return {
    'nao-iniciado': { label: 'Não iniciado', color: t.muted, bg: dark ? 'rgba(184,188,200,.14)' : 'rgba(86,96,121,.12)' },
    'em-andamento': { label: 'Em andamento', color: dark ? '#FEDC04' : '#7A6200', bg: dark ? 'rgba(254,220,4,.16)' : 'rgba(254,220,4,.38)' },
    pausado: { label: 'Pausado', color: t.warn, bg: dark ? 'rgba(240,149,77,.16)' : 'rgba(180,83,9,.12)' },
    concluido: { label: 'Concluído', color: t.ok, bg: dark ? 'rgba(61,220,132,.16)' : 'rgba(11,122,67,.12)' },
  };
}

export function pdfToneMeta(theme) {
  const t = PDF_THEMES[theme] || PDF_THEMES.dark;
  const dark = theme !== 'light';
  const a = (rgb, da, la) => `rgba(${rgb},${dark ? da : la})`;
  return {
    ok: { color: t.ok, bg: a(dark ? '61,220,132' : '11,122,67', 0.14, 0.12) },
    warn: { color: dark ? '#FEDC04' : '#7A6200', bg: a(dark ? '254,220,4' : '254,220,4', 0.16, 0.38) },
    soon: { color: t.warn, bg: a(dark ? '240,149,77' : '180,83,9', 0.16, 0.12) },
    today: { color: t.info, bg: a(dark ? '91,141,239' : '29,78,216', 0.2, 0.12) },
    overdue: { color: t.bad, bg: a(dark ? '255,107,107' : '198,40,40', 0.16, 0.1) },
    done: { color: t.muted, bg: a(dark ? '184,188,200' : '86,96,121', 0.12, 0.1) },
    none: { color: t.faint, bg: a(dark ? '123,128,152' : '128,137,162', 0.12, 0.1) },
  };
}

export const PDF_SECTIONS = [
  { key: 'resumo', label: 'Resumo e progresso geral', hint: 'Números de atividades e barra de progresso' },
  { key: 'fases', label: 'Progresso por fase', hint: 'Uma barra por fase do projeto' },
  { key: 'timeline', label: 'Linha do tempo', hint: 'Cronograma visual com as datas de cada atividade' },
  { key: 'atrasadas', label: 'Atividades em atraso', hint: 'Só aparece quando há atraso' },
  { key: 'proximas', label: 'Próximas etapas', hint: 'Tabela das atividades ainda não concluídas' },
  { key: 'reunioes', label: 'Próximas reuniões', hint: 'Calendário das reuniões marcadas' },
  { key: 'subs', label: 'Subatividades em aberto', hint: 'Detalha cada atividade (pode ocupar várias páginas)' },
  { key: 'concluidas', label: 'Atividades concluídas', hint: 'Histórico do que já foi entregue' },
];

export const PDF_DEFAULTS = {
  theme: 'dark',
  orientation: 'landscape',
  sections: { resumo: true, fases: true, timeline: true, atrasadas: true, proximas: true, reunioes: true, subs: false, concluidas: false },
};

const KEY = 'ptx-pdf-prefs';

export function mergePdfPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sections = { ...PDF_DEFAULTS.sections };
  if (r.sections && typeof r.sections === 'object') for (const k of Object.keys(sections)) if (typeof r.sections[k] === 'boolean') sections[k] = r.sections[k];
  return {
    theme: r.theme === 'light' ? 'light' : 'dark',
    orientation: r.orientation === 'portrait' ? 'portrait' : 'landscape',
    sections,
  };
}

export function loadPdfPrefs() {
  try { return mergePdfPrefs(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return mergePdfPrefs(null); }
}

export function savePdfPrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(mergePdfPrefs(p))); } catch { /* sem armazenamento: a escolha vale só para esta exportação */ }
}

export function pdfCssVars(theme) {
  const t = PDF_THEMES[theme] || PDF_THEMES.dark;
  return {
    '--pr-bg': t.bg, '--pr-card': t.card, '--pr-head': t.head, '--pr-line': t.line, '--pr-track': t.track,
    '--pr-text': t.text, '--pr-muted': t.muted, '--pr-faint': t.faint, '--pr-accent': t.accent,
    '--pr-fill': t.fill, '--pr-filltext': t.fillText, '--pr-ok': t.ok, '--pr-bad': t.bad, '--pr-warn': t.warn, '--pr-info': t.info, '--pr-chip': t.chip,
  };
}

// Página A4 com fundo do tema pintado até a borda (inclusive nas margens) e rodapé com numeração de páginas.
export function pdfPageCss(theme, orientation, footerLeft) {
  const t = PDF_THEMES[theme] || PDF_THEMES.dark;
  const left = String(footerLeft || 'PRICETAX').replace(/["\\\n]/g, ' ');
  const box = `font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: ${t.faint};`;
  return `@page { size: A4 ${orientation === 'portrait' ? 'portrait' : 'landscape'}; margin: 11mm 10mm 14mm; background: ${t.bg};
    @bottom-left { content: "${left}"; ${box} }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); ${box} } }`;
}
