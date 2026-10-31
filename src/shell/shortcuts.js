// Atalhos de teclado que EXISTEM no sistema (2026-10-30, Onda 1 / Q7). A tela de ajuda ("?") lê esta lista: atalho novo entra aqui junto com o
// código que o trata; nada de prometer o que não existe. `scripts/shortcuts.test.mjs` confere a forma da lista.

// "N" e "?" não podem disparar enquanto a pessoa digita, nem por cima de uma janela aberta.
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}

// `Mod` é Ctrl no Windows/Linux e ⌘ no Mac (a tela troca na hora de mostrar).
export const SHORTCUT_GROUPS = [
  { title: 'Em qualquer tela', items: [
    { keys: ['Mod', 'K'], what: 'Abrir a busca e os comandos (módulos, empresas, atividades, reuniões, negócios, contatos)' },
    { keys: ['?'], what: 'Abrir esta ajuda' },
    { keys: ['Esc'], what: 'Fechar a janela, o menu ou a busca que estiver aberta' },
  ] },
  { title: 'Na busca (Mod K)', items: [
    { keys: ['↑', '↓'], what: 'Percorrer os resultados' },
    { keys: ['Enter'], what: 'Abrir o resultado marcado' },
    { keys: ['Shift', 'Enter'], what: 'Favoritar ou desfavoritar o resultado marcado' },
  ] },
  { title: 'Gestão de Atividades', items: [
    { keys: ['N'], what: 'Criar uma atividade rápida no quadro (fora de campos de texto e de janelas)' },
    { keys: ['Esc'], what: 'Sair do Foco de hoje' },
  ] },
  { title: 'Escrever e confirmar', items: [
    { keys: ['Enter'], what: 'Enviar a pergunta à RENATA' },
    { keys: ['Shift', 'Enter'], what: 'Quebrar a linha na conversa com a RENATA' },
    { keys: ['Mod', 'Enter'], what: 'Salvar uma nota do CRM e confirmar caixas de texto de várias linhas' },
    { keys: ['↓'], what: 'Abrir o calendário num campo de data' },
  ] },
];

export const modLabel = (isMac) => (isMac ? '⌘' : 'Ctrl');

// Lista plana para teste/busca.
export function allShortcuts() { return SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => ({ group: g.title, ...i }))); }
