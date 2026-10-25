import { RETENTION } from './usageLog.js';

// Transparência e finalidade (LGPD): texto único, exibido a toda a equipe (Meu perfil) e à liderança (Central).
export function usagePolicy() {
  return {
    title: 'Como medimos o uso da plataforma',
    purpose: 'Segurança das contas (detectar acesso indevido) e gestão da operação (entender como a ferramenta é usada, achar gargalos e melhorar processos). Não é usada para vigiar atividades fora da plataforma nem como única base de avaliação de desempenho.',
    legalBasis: 'Legítimo interesse do controlador (segurança e gestão da operação), com transparência aos usuários. Revise com o encarregado de dados (DPO) antes de ampliar a finalidade.',
    collected: [
      'Entradas no sistema: data, hora, endereço IP, cidade, estado e país aproximados (pelo IP), navegador e sistema operacional.',
      'Tempo com a aba visível e tempo com interação (mouse, teclado, rolagem), por módulo, tela e empresa aberta. Só para a equipe PRICETAX (perfis Master e PRICETAX).',
      'Ações pontuais: exportar PDF ou Excel, enviar transcrição ou arquivo, criar link de compartilhamento.',
      'Registros que o sistema já guardava: histórico de alterações das empresas, cartões, XFlow, CRM, perguntas à RENATA e envio de reuniões.',
    ],
    notCollected: [
      'Senhas, textos digitados, conteúdo de comentários, arquivos ou transcrições.',
      'O que a pessoa faz em outros sites ou programas, ou com a aba em segundo plano.',
      'Localização exata: a cidade vem do IP e é aproximada (centro da cidade, margem de dezenas de km; redes móveis e VPN podem apontar para outro lugar).',
      'Tempo medido de clientes (perfil Cliente): só os acessos de segurança.',
    ],
    access: 'Somente administradores (perfil Master) da mesma organização veem os dados individuais. Cada pessoa pode ver aqui como é medida.',
    retention: `Telemetria de uso: ${Math.round(RETENTION.usageDays / 30)} meses. Registros de acesso: ${Math.round(RETENTION.accessDays / 30)} meses. Depois disso são apagados automaticamente.`,
    interpretation: [
      'Tempo conectado não é produtividade. O "índice de atividade" mostra só quanto do tempo conectado teve interação.',
      'Resultado entregue é medido à parte (atividades concluídas, reuniões processadas, exportações), nunca deduzido do tempo.',
      'Onde ainda não há medição, o painel mostra uma ESTIMATIVA marcada como tal, calculada a partir de eventos que já existiam. Onde nem isso existe, aparece como indisponível.',
    ],
  };
}
