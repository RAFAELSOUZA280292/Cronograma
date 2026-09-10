// Utilitários pequenos e sem estado, compartilhados entre TodoBoard.jsx e
// TodoDrawer.jsx — nada aqui depende de dado do servidor, só formata.

const AVATAR_HUES = [4, 28, 48, 96, 152, 176, 200, 224, 262, 292, 322];

export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Cor determinística a partir do nome — mesma pessoa sempre cai na mesma
// cor, sem precisar de nenhum campo novo no backend (nomes livres, não
// necessariamente ligados a um usuário/cadastro).
export function avatarColor(name) {
  let hash = 0;
  const s = name || '';
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length];
  return { bg: `hsl(${hue} 70% 92%)`, fg: `hsl(${hue} 55% 32%)` };
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysOverdue(dueDate) {
  const today = todayIso();
  if (!dueDate || dueDate >= today) return 0;
  const ms = new Date(`${today}T00:00:00`) - new Date(`${dueDate}T00:00:00`);
  return Math.max(1, Math.round(ms / 86400000));
}

export function isItemOverdue(item) {
  return !!(item.dueDate && item.dueDate < todayIso() && item.status !== 'concluida' && item.status !== 'nao-relevante');
}

export function greetingPeriod() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
