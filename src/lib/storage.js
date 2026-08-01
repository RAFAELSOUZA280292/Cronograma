// Substitui a API window.storage (exclusiva do ambiente de artifacts do Claude)
// por localStorage do navegador, para o app funcionar sozinho quando hospedado.
//
// Limitação importante: localStorage é POR NAVEGADOR/DISPOSITIVO. Ele não
// sincroniza entre pessoas nem entre aparelhos diferentes. Cada pessoa que
// abrir o site vai ver e editar sua PRÓPRIA cópia dos dados, salva só no
// navegador dela. Para um cronograma compartilhado de verdade entre PRICETAX
// e cliente, o próximo passo é trocar isso por um backend com banco de dados
// (ex: o mesmo padrão que XClass já usa).

export const storage = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
  async delete(key) {
    try {
      window.localStorage.removeItem(key);
      return { key, deleted: true };
    } catch (e) {
      return null;
    }
  },
};
