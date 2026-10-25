// Erros da API em português claro, com o que a pessoa pode fazer (§96). Função pura `describeError` (testada) + o middleware do Express.
// Erro inesperado (5xx) ganha um código curto (`ref`) que vai na tela E no log do servidor: quem avisa o suporte informa o código e a gente acha a linha.
import { randomBytes } from 'node:crypto';

export const newRef = () => randomBytes(3).toString('hex').toUpperCase();

export function describeError(err) {
  const e = err || {};
  const code = String(e.code || '');
  if (e.type === 'entity.too.large') return { status: 413, message: 'O conteúdo enviado é grande demais. Reduza o tamanho dos anexos e tente de novo.' };
  if (e.type === 'entity.parse.failed') return { status: 400, message: 'Os dados enviados chegaram incompletos. Recarregue a tela e tente de novo.' };
  if (e.status >= 400 && e.status < 500 && e.message) return { status: e.status, message: e.message };
  // Postgres
  if (code === '23505') return { status: 409, message: 'Já existe um registro com esses dados. Procure o existente em vez de criar outro.' };
  if (code === '23503') return { status: 409, message: 'Este registro está ligado a outros e não pode ser alterado ou apagado assim. Atualize a tela e confira os vínculos.' };
  if (code === '23502') return { status: 400, message: 'Falta preencher um campo obrigatório.' };
  if (code === '22P02' || code === '22003' || code === '22007' || code === '22008') return { status: 400, message: 'Algum valor informado tem formato inválido (número, data ou identificador). Confira os campos e tente de novo.' };
  if (code === '57014') return { status: 503, message: 'A consulta demorou mais que o limite. Use filtros para reduzir o resultado e tente de novo.' };
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P03', '53300', '08006', '08001', '08003'].includes(code) || /Connection terminated|timeout expired|too many clients/i.test(String(e.message || ''))) {
    return { status: 503, message: 'O banco de dados está indisponível por um instante. Aguarde alguns segundos e tente de novo — o que já foi salvo está preservado.' };
  }
  return { status: 500, message: 'Algo deu errado do nosso lado. O que você já salvou está preservado. Tente de novo; se repetir, avise o suporte com o código abaixo.', unexpected: true };
}

// eslint-disable-next-line no-unused-vars
export function apiErrorHandler(err, req, res, next) {
  const d = describeError(err);
  const ref = newRef();
  if (d.status >= 500) console.error(`[erro ${ref}] ${req.method} ${String(req.originalUrl || req.url).split('?')[0]} user=${(req.user && req.user.id) || '-'} → ${d.status}`, err);
  res.status(d.status).json(d.unexpected || d.status >= 500 ? { message: `${d.message} (código ${ref})`, ref } : { message: d.message });
}
