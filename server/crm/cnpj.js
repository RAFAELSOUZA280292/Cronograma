import { onlyDigits } from './text.js';

// Validação de verdade (dígitos verificadores) — o cnpjLookup.js do painel só
// confere o formato; aqui um CNPJ digitado errado tem que ser barrado antes
// de virar duplicidade "fantasma" no cadastro.
export function isValidCnpj(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const digit = (len) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i -= 1) {
      sum += Number(c[len - i]) * pos;
      pos -= 1;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(c[12]) && digit(13) === Number(c[13]);
}

export function formatCnpj(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
