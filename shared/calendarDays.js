// Reservar na agenda: o bloco de uma atividade fica num dia DENTRO do período dela (início..fim; sem fim, é o dia de início). Funções puras, servidor e tela.
// Regra do Rafael (2026-10-19, corrigindo a anterior): atividades PODEM cair no mesmo dia; a restrição de um por dia vale só para REUNIÕES.
export const windowOf = (row) => ({ from: row.date, to: row.endDate && row.endDate >= row.date ? row.endDate : row.date });
export const inWindow = (row, day) => { const w = windowOf(row); return !!day && day >= w.from && day <= w.to; };
