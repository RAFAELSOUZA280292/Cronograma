// Cofre do projeto (§124): regras puras (sem banco), compartilhadas pelas rotas, pela ferramenta da RENATA e pelo teste.
// Senha e conteúdo de arquivo NUNCA saem daqui para a listagem: `publicItem` devolve só "tem senha" / "tem arquivo".
import { seal, sealBytes } from './secretBox.js';

export const KINDS = ['credential', 'certificate', 'file', 'link', 'note'];
export const KIND_LABEL = { credential: 'acesso', certificate: 'certificado digital', file: 'arquivo', link: 'link', note: 'nota' };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CERT_BYTES = 1024 * 1024;
export const CERT_WARN_DAYS = 30;
export const MAX_ITEMS_PER_PROJECT = 500;
const CERT_EXT = ['pfx', 'p12'];
const BLOCKED_EXT = ['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'js', 'vbs', 'ps1', 'sh', 'jar', 'html', 'htm', 'svg'];

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

export function cleanUrl(v) {
  const s = clip(v, 2000);
  if (!s) return '';
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; }
}

export function cleanTags(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(arr.map((t) => clip(t, 30)).filter(Boolean))].slice(0, 10);
}

// Situação do certificado em relação a `today` (AAAA-MM-DD, horário de Brasília): ok / vence em breve (até 30 dias) / vencido.
export function certStatus(validUntil, today) {
  if (!validUntil) return null;
  const days = Math.round((Date.parse(`${String(validUntil).slice(0, 10)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  if (Number.isNaN(days)) return null;
  return { days, state: days < 0 ? 'vencido' : days <= CERT_WARN_DAYS ? 'vence_em_breve' : 'ok' };
}

// Valida o corpo de criação (isNew) ou edição e devolve as colunas a gravar, já com senha e arquivo cifrados (ou { error }).
// Na edição, só o que veio no corpo muda; `secret` vazio ou ausente mantém a senha guardada; `clearSecret: true` apaga.
export function parseVaultInput(body, { isNew, kind: currentKind } = {}) {
  const b = body || {};
  const kind = isNew ? b.kind : currentKind;
  if (!KINDS.includes(kind)) return { error: 'Tipo de item inválido.' };
  const out = { kind };
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (isNew || has('title')) { out.title = clip(b.title, 200); if (!out.title) return { error: 'Dê um nome ao item (ex.: "X da Questão", "Procuração e-CAC").' }; }
  if (isNew || has('folder')) out.folder = clip(b.folder, 60);
  if (isNew || has('tags')) out.tags = cleanTags(b.tags);
  if (isNew || has('notes')) out.notes = clip(b.notes, 4000);
  if (kind === 'credential' || kind === 'link') {
    if (isNew || has('url')) {
      const u = cleanUrl(b.url);
      if (u === null) return { error: 'Endereço inválido. Use um endereço que comece com http:// ou https://.' };
      if (kind === 'link' && !u) return { error: 'Informe o endereço do link.' };
      out.url = u;
    }
  }
  if (kind === 'credential' && (isNew || has('username'))) out.username = clip(b.username, 200);
  if (kind === 'certificate') {
    if (isNew || has('certHolder')) out.cert_holder = clip(b.certHolder, 200);
    if (isNew || has('certValidUntil')) {
      const d = clip(b.certValidUntil, 10);
      if (d && !isISODate(d)) return { error: 'Validade do certificado inválida (use dia/mês/ano).' };
      out.cert_valid_until = d || null;
    }
  }
  if (kind === 'credential' || kind === 'certificate') {
    const s = typeof b.secret === 'string' ? b.secret : '';
    if (s.length > 500) return { error: 'Senha longa demais (máximo 500 caracteres).' };
    if (s) out.secret_enc = seal(s);
    else if (b.clearSecret === true) out.secret_enc = null;
  }
  if ((kind === 'file' || kind === 'certificate') && b.fileDataBase64) {
    const fileName = clip(b.fileName, 240);
    const ext = extOf(fileName);
    if (!fileName) return { error: 'Arquivo sem nome.' };
    if (kind === 'certificate' && !CERT_EXT.includes(ext)) return { error: 'O certificado digital A1 deve ser um arquivo .pfx ou .p12.' };
    if (BLOCKED_EXT.includes(ext)) return { error: 'Tipo de arquivo não aceito no cofre (programas, scripts e páginas HTML). Use PDF, Office, imagem, texto ou ZIP.' };
    const buf = Buffer.from(String(b.fileDataBase64), 'base64');
    if (!buf.length) return { error: 'Arquivo vazio ou inválido.' };
    const max = kind === 'certificate' ? MAX_CERT_BYTES : MAX_FILE_BYTES;
    if (buf.length > max) return { error: `Arquivo maior que ${Math.round(max / 1024 / 1024)} MB. Para arquivos maiores, guarde o link da pasta (Drive, SharePoint).` };
    Object.assign(out, { file_name: fileName, file_size: buf.length, file_enc: sealBytes(buf) });
  }
  if (isNew && kind === 'file' && !out.file_enc) return { error: 'Escolha o arquivo.' };
  return out;
}

// O que a tela (e a RENATA) recebem de um item: nunca a senha, nunca o arquivo, nunca a cifra.
export function publicItem(r, today) {
  return {
    id: r.id, kind: r.kind, title: r.title, folder: r.folder || '', tags: r.tags || [], notes: r.notes || '',
    url: r.url || '', username: r.username || '',
    hasSecret: !!r.secret_enc, hasFile: !!r.file_size,
    fileName: r.file_name || '', fileSize: r.file_size || 0,
    certHolder: r.cert_holder || '', certValidUntil: r.cert_valid_until ? String(r.cert_valid_until instanceof Date ? r.cert_valid_until.toISOString() : r.cert_valid_until).slice(0, 10) : '',
    cert: r.kind === 'certificate' ? certStatus(r.cert_valid_until instanceof Date ? r.cert_valid_until.toISOString() : r.cert_valid_until, today) : null,
    createdBy: r.created_by_name || '', createdAt: r.created_at, updatedBy: r.updated_by_name || '', updatedAt: r.updated_at,
  };
}

// Resumo para a RENATA: só nome, tipo, pasta, etiquetas, endereço e validade. Sem usuário, sem senha, sem observação.
export function renataItem(r, today) {
  const p = publicItem(r, today);
  return {
    nome: p.title, tipo: KIND_LABEL[p.kind], pasta: p.folder, etiquetas: p.tags,
    ...(p.url ? { endereco: p.url } : {}), ...(p.fileName ? { arquivo: p.fileName } : {}),
    ...(p.kind === 'credential' || p.kind === 'certificate' ? { senhaGuardada: p.hasSecret ? 'sim (só a pessoa vê, na aba Cofre)' : 'não' } : {}),
    ...(p.cert ? { validade: p.certValidUntil, situacao: p.cert.state.replace(/_/g, ' '), dias: p.cert.days } : {}),
    incluidoPor: p.createdBy, em: p.createdAt,
  };
}

// Texto do Log da empresa para cada evento do cofre. Recebe só o nome do item, nunca o valor.
export function vaultLogText(event, item) {
  const what = `${KIND_LABEL[item.kind] || 'item'} "${clip(item.title, 120)}"`;
  return {
    create: `Cofre: incluiu ${what}.`,
    update: `Cofre: alterou ${what}.`,
    delete: `Cofre: excluiu ${what}.`,
    show: `Cofre: mostrou a senha de ${what}.`,
    copy: `Cofre: copiou a senha de ${what}.`,
    download: `Cofre: baixou o arquivo de ${what}.`,
  }[event] || `Cofre: ${event} ${what}.`;
}
