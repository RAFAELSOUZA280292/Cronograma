// Áreas (2026-10-07, Passo 3 do caminho combinado): lista fechada para classificar atividades e tarefas de reunião por tema.
// Nasceu dos cronogramas padrão (a fase "Mão na Massa por Área" tem uma atividade por área). Para mudar a lista, edite SÓ aqui
// (o servidor entrega a lista à tela e valida contra ela).
export const AREAS = ['Comercial', 'Compras', 'Controladoria', 'Diretoria', 'Financeiro', 'Fiscal', 'Jurídico', 'Logística', 'RH', 'TI'];

const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const BY_KEY = new Map(AREAS.map((a) => [key(a), a]));

// "fiscal" → "Fiscal"; qualquer coisa fora da lista → ''.
export const canonicalArea = (v) => BY_KEY.get(key(v)) || '';
