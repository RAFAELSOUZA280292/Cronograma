// A biblioteca de planilhas só é baixada quando alguém exporta para Excel — antes entrava no pacote principal de todo mundo.
// Versão enxuta (a mesma da importação do CRM): o painel só monta e lê .xlsx; a completa (~490 KB) só somava formatos antigos.
export const loadXlsx = () => import('xlsx/dist/xlsx.mini.min.js').then((mod) => mod.default || mod);
