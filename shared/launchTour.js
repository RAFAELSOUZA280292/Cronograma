// Boas-vindas obrigatória de lançamento (03/11/2026, pedido do Rafael: "amanhã, quando o pessoal chegar… agora eles devem utilizar
// os e-mails deles aqui dentro… não permita o botão do usuário pular"). Uma fonte só para a tela (src/onboarding/LaunchTour.jsx),
// para quem precisa ver (server/auth.js → user.launchTour) e para o guia que a RENATA usa ao ensinar o painel (server/renata/agent.js).
// Nova rodada de novidades = novo LAUNCH_TOUR_ID; quem já concluiu uma rodada vê a próxima uma vez.

export const LAUNCH_TOUR_ID = 'novembro-2026';
export const LAUNCH_TOUR_ROLES = ['master', 'pricetax'];

// Equipe PRICETAX que ainda não concluiu esta rodada (fica em users.preferences.tours[ID] = data ISO).
export function launchTourPending({ role, preferences } = {}) {
  if (!LAUNCH_TOUR_ROLES.includes(role)) return false;
  const tours = (preferences && typeof preferences === 'object' && preferences.tours) || {};
  return !tours[LAUNCH_TOUR_ID];
}

// Cartões do passo "O que mudou" (ícone = nome do lucide-react resolvido na tela; `crm: true` só para quem tem CRM).
export const newsFor = (crmAccess) => LAUNCH_NEWS.filter((n) => crmAccess || !n.crm);
export const LAUNCH_NEWS = [
  { icon: 'Mail', title: 'Seu e-mail agora é aqui', text: 'A Caixa de e-mail do painel lê, escreve, responde, encaminha, anexa de tudo e organiza em pastas o seu Gmail da PRICETAX. Outlook e a tela do Gmail ficam para trás.' },
  { icon: 'Link2', crm: true, title: 'E-mail ligado ao CRM', text: 'Cada conversa mostra se é cliente, lead ou parceiro. Empresa fora do CRM ganha uma faixa amarela para registrar o negócio na hora. Clicou num e-mail no CRM? Abre aqui, com as conversas da equipe com a pessoa.' },
  { icon: 'CalendarDays', title: 'Agenda completa', text: 'Crie reuniões com Google Meet e convidados, responda convites direto do e-mail e junte outras agendas numa grade só.' },
  { icon: 'Sparkles', title: 'A RENATA ajuda', text: 'Pergunte à RENATA (botão no topo) como fazer qualquer coisa no painel. Ela também lê seus e-mails, registra no CRM e revisa propostas.' },
];

// Exemplos de pergunta mostrados no último passo e treinados no guia.
export const LAUNCH_ASK_EXAMPLES = [
  'Como configuro minha assinatura de e-mail?',
  'O que trocamos com a OKUBO por e-mail?',
  'Como crio uma reunião com Google Meet?',
  'Onde guardo o certificado digital de um cliente?',
];

// Guia do painel para a RENATA (entra no prompt de sistema). Caminhos reais da tela; atualizar quando um caminho mudar.
export const PANEL_GUIDE = `GUIA DO PAINEL (use para ensinar o caminho quando perguntarem "como faço…", "onde fica…"):
- E-MAIL (Caixa de e-mail, módulo "E-mail" na barra do topo ou na tela inicial): é o Gmail da própria pessoa dentro do painel. Primeira vez: botão "Conectar o Gmail" (autoriza e-mail e agenda juntos). Botão amarelo "Escrever"; pastas à esquerda (arrastar uma conversa para a pasta move; o lápis renomeia e muda a cor; "+" cria); a caixinha acima da lista seleciona (todas, nenhuma, lidas, não lidas, com estrela); o ⋮ ao lado tem "Marcar todas como lidas"; "Exibir" muda o layout (leitura à direita, embaixo ou desligada, lista compacta). Em "Configurar", na coluna das pastas: Assinatura, Regras ("sempre mover os e-mails de fulano"), Imagens (sempre mostrar ou perguntar) e Ativar avisos. Pesquisa no topo procura em todas as pastas; pesquisar um endereço mostra ao lado as conversas da equipe com aquela pessoa. Anexos: botão do clipe, arrastar arquivos ou colar print (Ctrl/⌘+V); programas (.exe, .bat, .js) são recusados — use o Google Drive. Atalhos: tecla "?" mostra a lista.
- ASSINATURA: E-mail › Configurar › Assinatura. Tipo "Imagem" (padrão PRICETAX: o banner da pessoa, que fica na pasta de assinaturas do Google Drive; já vem no tamanho certo) ou "Texto" (nome, cargo, contatos e logo). "Texto antes da assinatura" serve para o "Atenciosamente," (com opção de negrito). "Já vir marcada ao escrever" liga a assinatura em todo e-mail novo.
- E-MAIL × CRM: a conversa mostra o selo (Cliente, Lead com a etapa, Parceiro). A faixa amarela "Empresa fora do CRM" tem Registrar novo negócio, Registrar como ganho, É parceiro, É fornecedor e Ignorar; "Parece ser <empresa> — Vincular" liga o domínio a uma empresa já cadastrada. No CRM, o negócio e a empresa têm a aba "E-mails" com as conversas de toda a equipe. Clicar num e-mail em qualquer tela do painel abre a Caixa com a escrita e as conversas com a pessoa.
- AGENDA: módulo "Agenda". "Novo compromisso" cria com convidados e link do Google Meet; o detalhe tem Sim/Talvez/Não, Propor novo horário, Editar e Cancelar. Convite que chega por e-mail vira cartão com as mesmas respostas. "Minhas agendas" junta outra conta Google, Microsoft ou link iCal numa grade só, com cor. Menu lateral (botão ☰ ao lado de "Hoje"): "Criar" (Evento, Tarefa do Google, Ausente), mini-calendário, "Reunião com…" (escolha pessoas da equipe: a agenda delas aparece na grade e "Marcar reunião com…" já convida), "Minhas agendas" (caixinha mostra/esconde, bolinha muda a cor para qualquer uma) e "Outras agendas" (assinar a agenda de sócios e da equipe; se a pessoa só compartilha livre/ocupado, aparece "Ocupado"). Lupa "Buscar na agenda" procura no último ano e no próximo. Cor de cada compromisso no formulário (as 11 do Google). "Mostrar: Sem resposta / Recusados" esconde convites.
- CRM: módulo "CRM" (quem tem acesso: Sócios e Comercial; Operações não vê o CRM). Painel do CRM (painéis Minha fila, Time, Receita e Cadastro), Minhas atividades (atividades do CRM por urgência), Negócios (funis), Contas (as empresas do CRM), Contatos e Produtos. A busca do CRM é a do topo (Buscar… / Ctrl K), que acha empresas, negócios e contatos. Botões no topo: Criar atividade, negócio, empresa e contato. PDF de proposta anexado numa nota do negócio é revisado sozinho pela RENATA.
- COFRE: dentro da empresa (cronograma), aba "Cofre", depois de Triagem: acessos (login e senha), certificado digital, arquivos, links e notas, com cópia registrada no Log.
- TELA INICIAL: botão "Personalizar" ao lado do "Olá" (arrastar blocos, largura, esconder, "Meu espaço"); a estrela na barra do topo fixa a empresa ou o módulo nos Favoritos.
- MEU PERFIL (avatar no canto): foto, briefing do dia, integrações (chave da API para outras IAs) e conexão do Google.
- RENATA: botão "RENATA" na barra do topo, em qualquer tela; ela vê a tela aberta e pode fazer o trabalho.`;
