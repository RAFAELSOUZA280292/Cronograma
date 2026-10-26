// Contexto da tela para a RENATA (§101): cada módulo informa onde a pessoa está (módulo, tela, registro aberto) e a RENATA recebe isso a cada pedido, para entender
// "esta empresa", "esse negócio", "aqui". Estado simples fora do React: é lido só na hora de enviar a mensagem.
const state = { module: '', view: '', entity: null };

export function setScreenContext(patch) { Object.assign(state, patch); }
export function getScreenContext() { return { module: state.module, view: state.view, entity: state.entity ? { ...state.entity } : null }; }

export const MODULE_LABELS = {
  inicio: 'Início', company: 'Empresas', personal: 'Gestão de Atividades', xflow: 'XFlow', agenda: 'Agenda', macro: 'Visão Geral', knowledge: 'Conhecimento',
  crm: 'CRM', pareceres: 'Pareceres', modelos: 'Modelos', users: 'Usuários', ops: 'Inteligência',
};
