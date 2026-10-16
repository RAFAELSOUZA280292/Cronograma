// A biblioteca de planilhas (xlsx, ~280 KB) só é baixada quando alguém exporta para Excel — antes entrava no pacote principal de todo mundo.
export const loadXlsx = () => import('xlsx');
