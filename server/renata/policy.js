// Política de acesso da RENATA às rotas do servidor (§101): o que NUNCA é por ela (credenciais, usuários, permissões, links públicos, telemetria de pessoas),
// o que é coberto por ferramenta curada e o que fica no acesso genérico (com confirmação em tudo que altera). Fonte única do catálogo de cobertura.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let cached = null;
export function routeIndex() {
  if (!cached) cached = JSON.parse(fs.readFileSync(path.join(dir, 'routeIndex.json'), 'utf8')).routes;
  return cached;
}

// Sempre fora do alcance da IA, por segurança ou por não fazer sentido (o motivo aparece na matriz e na resposta à IA).
export const EXCLUDED = [
  { re: /^\/api\/auth\//, why: 'Sessão e senha: a RENATA não lida com credenciais.' },
  { re: /^\/api\/users/, why: 'Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança).' },
  { re: /^\/api\/organizations/, why: 'Organizações (super administrador): fora do alcance da IA.' },
  { re: /^\/api\/(connect|widget|push)\b/, why: 'Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa.' },
  { re: /^\/api\/(public-board|public-company|public-meeting)\b|^\/d\b|^\/api\/company-share/, why: 'Links públicos e compartilhamento externo: são gerados pela pessoa na tela.' },
  { re: /^\/api\/(ops-intel|experience|activity|client-error)\b/, why: 'Telemetria de uso e erros de tela: não é função operacional.' },
  { re: /^\/api\/(assistant|renata)\b/, why: 'A própria RENATA: sem recursão.' },
  { re: /^\/api\/google\b/, why: 'Conexão OAuth com o Google: a pessoa autoriza na tela.' },
  { re: /^\/api\/_internal\b/, why: 'Rota interna de verificação.' },
  { re: /^\/api\/crm\/migration\b/, why: 'Migração do PipeRun: operação administrativa feita só pela tela.' },
  { re: /^\/api\/crm\/companies\/:id\/merge$/, why: 'Unir empresas move contatos, negócios e histórico: operação administrativa feita pela chave de API ou pela tela, com conferência humana.' },
  { re: /^\/api\/crm\/(import|bootstrap)\b/, why: 'Importações em massa por planilha: precisam do arquivo e da conferência na tela.' },
  { re: /^\/api\/(personal-board)$|^\/api\/(public-board)/, why: 'O quadro pessoal inteiro é regravado pela tela; a RENATA usa as ferramentas quadro_* (cartão a cartão).' },
  { re: /^\/api\/projects\/:id$/, methods: ['PATCH'], why: 'O projeto inteiro é regravado pela tela; a RENATA usa cronograma_*/tarefa_reuniao_* (operação a operação, com log).' },
  { re: /^\/api\/knowledge-library\b/, why: 'Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar.' },
  { re: /\/file$|\/export\.xlsx$|\/attachments\//, why: 'Download de arquivo: não é operação de dados.' },
];

export function excludedReason(method, p) {
  for (const e of EXCLUDED) if (e.re.test(p) && (!e.methods || e.methods.includes(method))) return e.why;
  return '';
}

const toRe = (p) => new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`);
export function matchRoute(method, p) {
  const clean = String(p).split('?')[0].replace(/\/+$/, '') || '/';
  return routeIndex().find((r) => r.method === method && toRe(r.path).test(clean)) || null;
}
const sig = (m, p) => `${m} ${p.replace(/:[^/]+/g, ':x')}`;

// Rotas que alguma ferramenta curada já cobre (as com `route`, mais as ferramentas sob medida, listadas à mão).
export const CURATED_EXTRA = [
  ['GET', '/api/personal-board'], ['PATCH', '/api/personal-board'], ['PATCH', '/api/projects/:id'], ['GET', '/api/projects'], ['GET', '/api/projects/lite'],
  ['DELETE', '/api/projects/:id'], ['GET', '/api/crm/overview'], ['GET', '/api/mentions/users'], ['GET', '/api/auth/me'], ['GET', '/api/crm/me'],
];
export function curatedSet(registry) {
  const s = new Set(CURATED_EXTRA.map(([m, p]) => sig(m, p)));
  for (const t of registry.all()) if (t.route) s.add(sig(t.route.method, t.route.path.replace(/\{(\w+)\}/g, ':$1')));
  return s;
}
export function classify(r, curated) {
  const why = excludedReason(r.method, r.path);
  if (why) return { kind: 'excluded', why };
  if (curated.has(sig(r.method, r.path))) return { kind: 'curated' };
  return { kind: 'generic' };
}
