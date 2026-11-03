// E-mail ligado ao CRM e às Empresas (§130, 2026-11-02). Regras puras em server/mailLinksCore.js; tabelas em server/mailLinksSchema.js.
// - diretório (CRM + Empresas + marcas) por organização, em memória por 2 min (limpo na hora quando alguém marca/registra);
// - selo e faixa na lista/leitura da Caixa de e-mail (annotateThreads, chamado por server/mail.js);
// - índice só de metadados (mail_thread_index), alimentado quando a pessoa abre a caixa e por uma varredura leve a cada 6 h com o
//   token Google DE CADA PESSOA (90 dias na primeira vez). Sem conta de serviço;
// - rotas /api/mail-links: aba E-mails (negócio, empresa do CRM, empresa do cronograma), texto sob demanda (sócio ou quem participou),
//   marcas por domínio, "Avisar o comercial" (Operações) e o radar "Negócios fora do CRM" do cockpit.
import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { crmCan } from './crm/permissions.js';
import { canAccessProject } from './routes.js';
import { gmailFor, mailStatus, headerMap, parseAddressList, walkParts, sanitizeMailHtml, textToHtml, threadSummary, mapLimit, friendlyMailError } from './googleMail.js';
import { googleConfigured } from './googleCalendar.js';
import { createNotification } from './notifications.js';
import { buildDirectory, classifyThread, linkForViewer, threadFacts, keysOfCompany, groupRows, canReadContent, canReadOwnerCopy, cleanKey, MARK_KINDS, prettyKey, keyOf, lowerEmail, domainResembles } from './mailLinksCore.js';

const DIR_TTL = 2 * 60 * 1000;
const dirCache = new Map(); // orgId -> { at, dir, projects: [{id, cnpj}] , pending }

export function invalidateMailDirectory(orgId) { if (orgId) dirCache.delete(orgId); else dirCache.clear(); }

async function loadSources(orgId) {
  const [co, ct, de, pr, mk] = await Promise.all([
    pool.query('SELECT id, legal_name, trade_name, website, relationship FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL', [orgId]),
    pool.query(`SELECT k.email, k.company_id FROM crm_contacts k WHERE k.org_id=$1 AND k.deleted_at IS NULL AND k.email <> ''`, [orgId]),
    pool.query(`SELECT d.id, d.company_id, d.title, d.status, d.updated_at, s.name AS stage_name FROM crm_deals d JOIN crm_pipeline_stages s ON s.id = d.stage_id
                WHERE d.org_id=$1 AND d.deleted_at IS NULL AND d.status IN ('open','won')`, [orgId]),
    pool.query(`SELECT p.id, COALESCE(NULLIF(p.data->'company'->>'nomeFantasia',''), p.data->'company'->>'name') AS name, p.data->'company'->>'cnpj' AS cnpj,
                       (SELECT array_agg(e) FROM (
                          SELECT a->>'email' AS e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'company'->'areas') = 'array' THEN p.data->'company'->'areas' ELSE '[]'::jsonb END) a
                          UNION SELECT x->>'email' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'externalContacts') = 'array' THEN p.data->'externalContacts' ELSE '[]'::jsonb END) x
                        ) s WHERE e IS NOT NULL AND e <> '') AS emails,
                       (SELECT cp.company_id FROM crm_company_projects cp WHERE cp.project_id = p.id LIMIT 1) AS crm_company_id
                FROM projects p WHERE p.org_id=$1`, [orgId]),
    pool.query('SELECT key, kind, label, company_id FROM mail_domain_marks WHERE org_id=$1 AND kind IS NOT NULL', [orgId]),
  ]);
  return {
    companies: co.rows.map((r) => ({ id: r.id, legalName: r.legal_name, tradeName: r.trade_name, website: r.website, relationship: r.relationship })),
    contacts: ct.rows.map((r) => ({ email: r.email, companyId: r.company_id })),
    deals: de.rows.map((r) => ({ id: r.id, companyId: r.company_id, title: r.title, status: r.status, stageName: r.stage_name, updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : '' })),
    projects: pr.rows.map((r) => ({ id: r.id, name: r.name, cnpj: r.cnpj || '', emails: r.emails || [], crmCompanyId: r.crm_company_id || null })),
    marks: mk.rows.map((r) => ({ key: r.key, kind: r.kind, label: r.label, companyId: r.company_id || null })),
  };
}

export async function directoryFor(orgId) {
  const hit = dirCache.get(orgId);
  if (hit && hit.dir && Date.now() - hit.at < DIR_TTL) return hit;
  if (hit && hit.pending) return hit.pending;
  const pending = loadSources(orgId).then((src) => {
    const out = { at: Date.now(), dir: buildDirectory(src), projects: src.projects.map((p) => ({ id: p.id, company: { cnpj: p.cnpj } })), src };
    dirCache.set(orgId, out);
    return out;
  });
  dirCache.set(orgId, { at: 0, pending });
  try { return await pending; } catch (e) { dirCache.delete(orgId); throw e; }
}

const hasCrm = (user) => !!user && crmCan(user, 'read');
const projectIdsFor = (user, d) => new Set(d.projects.filter((p) => canAccessProject(user, p, user.orgId)).map((p) => p.id));

// Selo/faixa de cada conversa da lista (metadata) ou da leitura (full). Falha no diretório nunca derruba a caixa: devolve sem selo.
export async function annotateThreads(user, rawThreads) {
  if (!user || !user.orgId) return rawThreads.map(() => null);
  try {
    const d = await directoryFor(user.orgId);
    const crm = hasCrm(user);
    const projectIds = projectIdsFor(user, d);
    return rawThreads.map((t) => {
      if (!t) return null;
      const f = threadFacts(t, { headerMap, parseAddressList, hasAttachment: hasAttachmentOf(t) });
      const link = linkForViewer(classifyThread(f, d.dir), { crm, projectIds });
      if (!link.badge && !link.nag && !link.partner) return null;
      return { ...link, nagName: link.nag ? prettyKey(link.nag) : '' };
    });
  } catch (e) {
    console.error('E-mail × CRM: falha ao montar o diretório', String(e && e.message).slice(0, 200));
    return rawThreads.map(() => null);
  }
}

const hasAttachmentOf = (t) => ((t && t.messages) || []).some((m) => walkParts(m.payload).attachments.some((a) => !a.inline));

// Grava/atualiza o índice (só metadados) das conversas que a pessoa acabou de ver. Nunca bloqueia a resposta da caixa.
export async function indexThreads(user, rawThreads) {
  if (!user || !user.orgId || !rawThreads.length) return 0;
  let n = 0;
  for (const t of rawThreads) {
    if (!t || !t.id) continue;
    const labels = new Set((t.messages || []).flatMap((m) => m.labelIds || []));
    if (labels.has('SPAM') || labels.has('TRASH') || (labels.size && [...labels].every((l) => l === 'DRAFT'))) continue;
    const f = threadFacts(t, { headerMap, parseAddressList, hasAttachment: hasAttachmentOf(t) });
    const keys = [...new Set(f.participants.map((p) => keyOf(p.email)).filter(Boolean))];
    if (!keys.length) continue;
    await pool.query(
      `INSERT INTO mail_thread_index (org_id, user_id, thread_id, conv_key, subject, participants, keys, team_replied, has_attachment, msg_count, first_at, last_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (user_id, thread_id) DO UPDATE SET conv_key=EXCLUDED.conv_key, subject=EXCLUDED.subject, participants=EXCLUDED.participants, keys=EXCLUDED.keys,
         team_replied=EXCLUDED.team_replied, has_attachment=EXCLUDED.has_attachment OR mail_thread_index.has_attachment, msg_count=EXCLUDED.msg_count,
         first_at=LEAST(EXCLUDED.first_at, mail_thread_index.first_at), last_at=GREATEST(EXCLUDED.last_at, mail_thread_index.last_at), updated_at=now()`,
      [user.orgId, user.id, t.id, f.convKey, f.subject, JSON.stringify(f.participants), keys, f.teamReplied, f.hasAttachment, f.msgCount, f.firstAt, f.lastAt]);
    n += 1;
  }
  return n;
}
export function indexInBackground(user, rawThreads) {
  indexThreads(user, rawThreads.filter(Boolean)).catch((e) => console.error('E-mail × CRM: falha ao indexar', String(e && e.message).slice(0, 200)));
}

// ---- varredura periódica leve ------------------------------------------------------------------------------------------------
const META = ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID'];
const SCAN_EVERY = 6 * 60 * 60 * 1000;

export async function scanUser(user, { full = false } = {}) {
  const g = await gmailFor(user.id);
  if (!g) return 0;
  const st = await mailStatus(user.id);
  if (!st || !st.mail) return 0;
  const q = `${full ? 'newer_than:90d' : 'newer_than:8d'} -in:spam -in:trash -in:drafts -in:chats`;
  const ids = [];
  let pageToken;
  do {
    const { data } = await g.gmail.users.threads.list({ userId: 'me', q, maxResults: 100, pageToken });
    for (const t of data.threads || []) ids.push(t.id);
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < (full ? 600 : 200));
  let done = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = await mapLimit(ids.slice(i, i + 25), 4, (id) => g.gmail.users.threads.get({ userId: 'me', id, format: 'metadata', metadataHeaders: META }).then((r) => r.data).catch(() => null));
    done += await indexThreads(user, chunk.filter(Boolean));
  }
  return done;
}

async function scanTick() {
  if (!googleConfigured()) return;
  const { rows } = await pool.query(
    `SELECT u.id, u.org_id, u.name, s.full_at FROM google_calendar_connections c JOIN users u ON u.id = c.user_id
       LEFT JOIN mail_index_state s ON s.user_id = u.id
     WHERE u.blocked = false AND u.role IN ('master','pricetax') AND u.org_id IS NOT NULL AND (s.scan_at IS NULL OR s.scan_at < now() - interval '${SCAN_EVERY / 1000} seconds')
     ORDER BY s.scan_at NULLS FIRST LIMIT 3`);
  for (const r of rows) {
    const user = { id: r.id, orgId: r.org_id, name: r.name };
    let err = '';
    try { await scanUser(user, { full: !r.full_at }); } catch (e) { err = friendlyMailError(e).slice(0, 300); }
    await pool.query(
      `INSERT INTO mail_index_state (user_id, full_at, scan_at, last_error) VALUES ($1, CASE WHEN $2 = '' THEN now() END, now(), $2)
       ON CONFLICT (user_id) DO UPDATE SET scan_at=now(), last_error=$2, full_at=COALESCE(mail_index_state.full_at, CASE WHEN $2 = '' THEN now() END)`, [r.id, err]);
  }
}

let scanTimer = null;
export function startMailIndexScheduler() {
  if (scanTimer || process.env.MAIL_INDEX_SCAN === 'off') return;
  const run = () => scanTick().catch((e) => console.error('E-mail × CRM: varredura falhou', String(e && e.message).slice(0, 200)));
  setTimeout(run, 90 * 1000);
  scanTimer = setInterval(run, 20 * 60 * 1000);
  if (scanTimer.unref) scanTimer.unref();
}

// ---- rotas ---------------------------------------------------------------------------------------------------------------------
export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const h = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const needCrm = (req, res, next) => (hasCrm(req.user) ? next() : res.status(403).json({ message: 'Esta lista faz parte do CRM, que não está no seu papel.' }));
const needWrite = (req, res, next) => (req.user && crmCan(req.user, 'write') ? next() : res.status(403).json({ message: 'Só quem cadastra no CRM pode classificar domínios.' }));

// `person`: só as conversas em que aquele endereço participa (Caixa de e-mail → "Conversas da equipe com esta pessoa").
export async function conversationsFor(user, keys, { person = '' } = {}) {
  const req = { user };
  if (!keys.size) return { conversations: [], keys: [] };
  const { rows } = await pool.query(
    `SELECT i.id, i.user_id, u.name AS user_name, i.thread_id, i.conv_key, i.subject, i.participants, i.msg_count, i.last_at, i.has_attachment
     FROM mail_thread_index i JOIN users u ON u.id = i.user_id WHERE i.org_id=$1 AND i.keys && $2::text[] ORDER BY i.last_at DESC NULLS LAST LIMIT 400`,
    [req.user.orgId, [...keys]]);
  const hit = person ? rows.filter((r) => (r.participants || []).some((p) => lowerEmail(p && p.email) === person)) : rows;
  const groups = groupRows(hit.map((r) => ({ id: String(r.id), userId: r.user_id, userName: r.user_name, convKey: r.conv_key, subject: r.subject, participants: r.participants || [], msgCount: r.msg_count, lastAt: r.last_at ? new Date(r.last_at).toISOString() : null, hasAttachment: r.has_attachment })));
  return {
    keys: [...keys],
    conversations: groups.slice(0, 150).map((g) => {
      const owners = g.team.map((x) => x.userId);
      const mine = g.team.find((x) => x.userId === req.user.id);
      return {
        id: (mine || g.team[0]).rowId, subject: g.subject || '(sem assunto)', lastAt: g.lastAt, msgCount: g.msgCount, hasAttachment: !!g.hasAttachment,
        participants: g.participants.filter((p) => keyOf(p.email)).slice(0, 8), team: g.team.map((x) => x.userName),
        canRead: canReadContent(req.user, owners), mine: !!mine,
      };
    }),
  };
}

export async function companyKeys(orgId, companyId) {
  const { rows: c } = await pool.query('SELECT website FROM crm_companies WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL', [companyId, orgId]);
  if (!c[0]) return null;
  const { rows: k } = await pool.query(`SELECT email FROM crm_contacts WHERE company_id=$1 AND org_id=$2 AND deleted_at IS NULL AND email <> ''`, [companyId, orgId]);
  const d = await directoryFor(orgId);
  const projectEmails = d.src.projects.filter((p) => p.crmCompanyId === companyId).flatMap((p) => p.emails);
  const keys = keysOfCompany({ website: c[0].website, contactEmails: k.map((r) => r.email), projectEmails });
  for (const m of d.src.marks) if (m.companyId === companyId) keys.add(m.key);
  // Só as chaves que o diretório liga a ESTA empresa (um gmail.com de outro contato com o mesmo domínio não entra).
  // Nem o domínio de parceiro/fornecedor/ignorado (o contato da Tróia cadastrado na COPLACANA não traz os e-mails da Tróia para ela).
  for (const key of [...keys]) { const t = d.dir.byKey.get(key); if (!t || (t.companyId && t.companyId !== companyId) || (t.source === 'mark' && !['cliente', 'prospect'].includes(t.kind))) keys.delete(key); }
  return keys;
}

// Conversas de toda a equipe com um endereço (Caixa de e-mail, ao pesquisar ou clicar num e-mail do painel): a pesquisa da
// Caixa só vê o Gmail da própria pessoa; aqui entra o que a Eduarda trocou sem copiar ninguém (pedido do Rafael, 02/11/2026).
router.get('/person', needCrm, h(async (req, res) => {
  const email = lowerEmail(req.query.email);
  const key = keyOf(email);
  if (!key || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return res.status(400).json({ message: 'Informe um e-mail válido.' });
  res.json({ ...(await conversationsFor(req.user, new Set([key]), { person: email })), keys: [email] });
}));

router.get('/company/:id', needCrm, h(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ message: 'Empresa inválida.' });
  const keys = await companyKeys(req.user.orgId, req.params.id);
  if (!keys) return res.status(404).json({ message: 'Empresa não encontrada.' });
  res.json(await conversationsFor(req.user, keys));
}));

router.get('/deal/:id', needCrm, h(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ message: 'Negócio inválido.' });
  const { rows } = await pool.query('SELECT company_id FROM crm_deals WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.orgId]);
  if (!rows[0]) return res.status(404).json({ message: 'Negócio não encontrado.' });
  res.json(await conversationsFor(req.user, (await companyKeys(req.user.orgId, rows[0].company_id)) || new Set()));
}));

router.get('/project/:id', h(async (req, res) => {
  const id = String(req.params.id).slice(0, 80);
  const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
  if (!rows[0] || !canAccessProject(req.user, rows[0].data, rows[0].org_id)) return res.status(404).json({ message: 'Empresa não encontrada.' });
  const d = await directoryFor(rows[0].org_id);
  const p = d.src.projects.find((x) => x.id === id);
  let keys = keysOfCompany({ projectEmails: (p && p.emails) || [] });
  // Sem vínculo com o CRM, usa a empresa do CRM de MESMO CNPJ (a mesma que a faixa "No CRM" já sugere): sem isso a KUHN, com
  // dezenas de e-mails trocados, aparecia vazia só porque ninguém tinha vinculado na ficha (02/11/2026).
  let crmId = p && p.crmCompanyId;
  if (!crmId) {
    const cnpj = String((rows[0].data && rows[0].data.company && rows[0].data.company.cnpj) || '').replace(/\D/g, '');
    if (cnpj.length === 14) {
      const { rows: c } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL AND regexp_replace(cnpj,'\\D','','g')=$2 LIMIT 1`, [rows[0].org_id, cnpj]);
      crmId = c[0] ? c[0].id : null;
    }
  }
  if (crmId) keys = new Set([...keys, ...((await companyKeys(rows[0].org_id, crmId)) || [])]);
  // Ainda sem nenhum endereço (empresa sem site, sem contato com e-mail): domínios do índice da equipe que se parecem com o nome
  // da empresa (kuhn.com ← "KUHN DO BRASIL S/A"), a mesma regra do "Parece ser <empresa>" (§130). Provedor público nunca entra.
  if (!keys.size) {
    const co = (rows[0].data && rows[0].data.company) || {};
    const names = { legalName: co.name || '', tradeName: co.nomeFantasia || '' };
    const { rows: ks } = await pool.query(`SELECT DISTINCT k FROM mail_thread_index, unnest(keys) AS k WHERE org_id=$1 LIMIT 5000`, [rows[0].org_id]);
    for (const { k } of ks) if (!k.includes('@') && k.split('.')[0].length >= 3 && domainResembles(k, names)) keys.add(k);
  }
  res.json(await conversationsFor(req.user, keys));
}));

// Texto da conversa, sob demanda, do Gmail de quem trocou (o da própria pessoa quando ela participou). Imagens embutidas e anexos não
// vêm (só o nome do anexo); cada leitura da caixa de outra pessoa fica registrada em mail_index_reads.
router.get('/thread/:rowId', h(async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.rowId)) return res.status(400).json({ message: 'Conversa inválida.' });
  const { rows } = await pool.query('SELECT conv_key FROM mail_thread_index WHERE id=$1 AND org_id=$2', [req.params.rowId, req.user.orgId]);
  if (!rows[0]) return res.status(404).json({ message: 'Conversa não encontrada.' });
  const { rows: all } = await pool.query(
    `SELECT i.id, i.user_id, i.thread_id, u.name FROM mail_thread_index i JOIN users u ON u.id = i.user_id WHERE i.org_id=$1 AND i.conv_key=$2 ORDER BY (i.user_id = $3) DESC, i.last_at DESC`,
    [req.user.orgId, rows[0].conv_key, req.user.id]);
  if (!canReadContent(req.user, all.map((r) => r.user_id))) return res.status(403).json({ message: 'O texto desta conversa abre para os sócios e para quem participou dela.' });
  let lastErr = null;
  for (const src of all.filter((r) => canReadOwnerCopy(req.user, r.user_id))) {
    const g = await gmailFor(src.user_id);
    if (!g) continue;
    try {
      const { data } = await g.gmail.users.threads.get({ userId: 'me', id: src.thread_id, format: 'full' });
      if (src.user_id !== req.user.id) await pool.query('INSERT INTO mail_index_reads (org_id, reader_id, owner_id, thread_id) VALUES ($1,$2,$3,$4)', [req.user.orgId, req.user.id, src.user_id, src.thread_id]);
      const messages = (data.messages || []).filter((m) => !(m.labelIds || []).includes('DRAFT')).map((m) => {
        const hd = headerMap(m.payload && m.payload.headers);
        const parts = walkParts(m.payload);
        // Imagens embutidas (assinatura, cid:) e anexos vêm pela rota abaixo, do Gmail de quem trocou; remotas só com "Mostrar imagens".
        const att = (a, inline) => `/api/mail-links/row/${src.id}/messages/${m.id}/attachments/${encodeURIComponent(a.id)}?${inline ? `inline=1&type=${encodeURIComponent(a.mimeType)}` : `name=${encodeURIComponent(a.filename)}`}`;
        const cidUrl = (cid) => { const a = parts.attachments.find((x) => x.contentId === cid && x.id && INLINE_IMAGE.test(x.mimeType)); return a ? att(a, true) : null; };
        const body = parts.html ? sanitizeMailHtml(parts.html, { cidUrl, keepStyles: true }) : { html: textToHtml(parts.text), remoteImages: 0 };
        return {
          id: m.id, from: parseAddressList(hd.from)[0] || { name: '', email: '' }, to: parseAddressList(hd.to), cc: parseAddressList(hd.cc),
          date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null, html: body.html, remoteImages: body.remoteImages || 0,
          attachments: parts.attachments.filter((a) => a.id && !a.inline && a.filename).slice(0, 20).map((a) => ({ filename: a.filename, size: a.size || 0, url: att(a, false) })),
        };
      });
      return res.json({ subject: threadSummary(data).subject, owner: src.name, ownerIsMe: src.user_id === req.user.id, messages });
    } catch (e) { lastErr = e; }
  }
  res.status(lastErr ? 502 : 409).json({ message: lastErr ? friendlyMailError(lastErr) : 'Quem trocou esta conversa desconectou o Gmail; o texto não está disponível agora.' });
}));

// Imagem embutida ou anexo de uma conversa da aba E-mails, lido no Gmail de quem trocou (a linha do índice diz de quem). Mesma regra do
// texto (sócio ou participante) e a mensagem precisa ser DESSA conversa: não abre outra mensagem da caixa da pessoa. Download de anexo
// fica registrado em mail_index_reads; imagem da assinatura não (já contou ao abrir a conversa).
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/;
const GMAIL_ID = /^[A-Za-z0-9_-]{6,64}$/;
router.get('/row/:rowId/messages/:mid/attachments/:aid', h(async (req, res) => {
  const { rowId, mid, aid } = req.params;
  if (!/^\d{1,18}$/.test(rowId) || !GMAIL_ID.test(mid) || !/^[A-Za-z0-9_-]{10,1200}$/.test(aid)) return res.status(400).json({ message: 'Anexo inválido.' });
  const { rows } = await pool.query('SELECT user_id, thread_id, conv_key FROM mail_thread_index WHERE id=$1 AND org_id=$2', [rowId, req.user.orgId]);
  if (!rows[0]) return res.status(404).json({ message: 'Conversa não encontrada.' });
  const { rows: all } = await pool.query('SELECT user_id FROM mail_thread_index WHERE org_id=$1 AND conv_key=$2', [req.user.orgId, rows[0].conv_key]);
  if (!canReadContent(req.user, all.map((r) => r.user_id)) || !canReadOwnerCopy(req.user, rows[0].user_id)) return res.status(403).json({ message: 'Os anexos desta conversa abrem para os sócios e para quem participou dela.' });
  const g = await gmailFor(rows[0].user_id);
  if (!g) return res.status(409).json({ message: 'Quem trocou esta conversa desconectou o Gmail; o anexo não está disponível agora.' });
  try {
    const { data: msg } = await g.gmail.users.messages.get({ userId: 'me', id: mid, format: 'minimal' });
    if (msg.threadId !== rows[0].thread_id) return res.status(404).json({ message: 'Anexo não encontrado nesta conversa.' });
    const { data } = await g.gmail.users.messages.attachments.get({ userId: 'me', messageId: mid, id: aid });
    const buf = Buffer.from(data.data || '', 'base64url');
    const type = String(req.query.type || '').toLowerCase();
    const name = String(req.query.name || 'anexo').replace(/[\r\n"\\/]/g, '_').slice(0, 180);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (req.query.inline === '1' && INLINE_IMAGE.test(type)) {
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Disposition', 'inline');
    } else {
      if (rows[0].user_id !== req.user.id) await pool.query('INSERT INTO mail_index_reads (org_id, reader_id, owner_id, thread_id) VALUES ($1,$2,$3,$4)', [req.user.orgId, req.user.id, rows[0].user_id, rows[0].thread_id]);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    res.send(buf);
  } catch (e) { res.status(502).json({ message: friendlyMailError(e) }); }
}));

router.get('/marks', needCrm, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.key, m.kind, m.label, m.set_at, s.name AS set_by, m.reported_at, r.name AS reported_by FROM mail_domain_marks m
     LEFT JOIN users s ON s.id = m.set_by LEFT JOIN users r ON r.id = m.reported_by WHERE m.org_id=$1 ORDER BY COALESCE(m.set_at, m.reported_at) DESC`, [req.user.orgId]);
  res.json({ marks: rows });
}));

router.post('/marks', needWrite, h(async (req, res) => {
  const b = req.body || {};
  const key = cleanKey(b.key);
  if (!key) return res.status(400).json({ message: 'Informe um domínio (ex.: okubo.com.br) ou o e-mail inteiro de um provedor público.' });
  if (!MARK_KINDS[b.kind]) return res.status(400).json({ message: 'Escolha: cliente, prospect, parceiro, fornecedor ou ignorar.' });
  const label = String(b.label || '').replace(/\s+/g, ' ').trim().slice(0, 80) || prettyKey(key);
  await pool.query(
    `INSERT INTO mail_domain_marks (org_id, key, kind, label, set_by, set_at) VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (org_id, key) DO UPDATE SET kind=EXCLUDED.kind, label=EXCLUDED.label, set_by=EXCLUDED.set_by, set_at=now()`,
    [req.user.orgId, key, b.kind, label, req.user.id]);
  invalidateMailDirectory(req.user.orgId);
  res.json({ key, kind: b.kind, label });
}));

// "Parece ser INDEMIL — vincular?": liga o domínio à empresa do CRM para sempre (marca com company_id), preenche o site da empresa
// quando está vazio e, se pedido, cadastra quem escreveu como contato dela.
router.post('/link', needWrite, h(async (req, res) => {
  const b = req.body || {};
  const key = cleanKey(b.key);
  if (!key || key.includes('@')) return res.status(400).json({ message: 'Informe o domínio da empresa (ex.: indemil.com).' });
  if (!UUID.test(String(b.companyId || ''))) return res.status(400).json({ message: 'Empresa inválida.' });
  const { rows } = await pool.query('SELECT id, legal_name, trade_name, website FROM crm_companies WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL', [b.companyId, req.user.orgId]);
  const c = rows[0];
  if (!c) return res.status(404).json({ message: 'Empresa não encontrada.' });
  const name = String(c.trade_name || c.legal_name || '').trim() || prettyKey(key);
  await pool.query(
    `INSERT INTO mail_domain_marks (org_id, key, kind, label, company_id, set_by, set_at) VALUES ($1,$2,'cliente',$3,$4,$5, now())
     ON CONFLICT (org_id, key) DO UPDATE SET kind='cliente', label=EXCLUDED.label, company_id=EXCLUDED.company_id, set_by=EXCLUDED.set_by, set_at=now()`,
    [req.user.orgId, key, name.slice(0, 80), c.id, req.user.id]);
  const S = await import('./crm/service.js');
  const actor = { id: req.user.id, name: req.user.name || req.user.username };
  let website = false;
  if (!String(c.website || '').trim()) {
    try { await S.updateCompany(req.user.orgId, actor, c.id, { website: key }); website = true; } catch (e) { console.error('E-mail × CRM: site não gravado', String(e && e.message).slice(0, 200)); }
  }
  const contacts = [];
  for (const p of (Array.isArray(b.contacts) ? b.contacts : []).slice(0, 5)) {
    const email = String((p && p.email) || '').trim().toLowerCase();
    if (keyOf(email) !== key) continue;
    const full = String((p && p.name) || '').replace(/\s+/g, ' ').trim() || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
    const [firstName, ...rest] = full.split(' ');
    try { await S.createContact(req.user.orgId, actor, { companyId: c.id, firstName, lastName: rest.join(' '), email }); contacts.push(email); }
    catch (e) { if (!(e && e.status === 409)) console.error('E-mail × CRM: contato não cadastrado', String(e && e.message).slice(0, 200)); }
  }
  invalidateMailDirectory(req.user.orgId);
  res.json({ key, companyId: c.id, name, website, contacts });
}));

router.delete('/marks/:key', needWrite, h(async (req, res) => {
  const key = cleanKey(req.params.key);
  if (!key) return res.status(400).json({ message: 'Domínio inválido.' });
  await pool.query('UPDATE mail_domain_marks SET kind=NULL, label=\'\', company_id=NULL, set_by=$3, set_at=now() WHERE org_id=$1 AND key=$2', [req.user.orgId, key, req.user.id]);
  invalidateMailDirectory(req.user.orgId);
  res.json({ ok: true });
}));

// Operações (ou qualquer pessoa da equipe) avisa o comercial: notificação para a Eduarda (Comercial) e os sócios, uma vez por domínio a cada 24 h.
router.post('/report', h(async (req, res) => {
  const b = req.body || {};
  const key = cleanKey(b.key);
  if (!key) return res.status(400).json({ message: 'Domínio inválido.' });
  const subject = String(b.subject || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const { rows: cur } = await pool.query('SELECT reported_at FROM mail_domain_marks WHERE org_id=$1 AND key=$2', [req.user.orgId, key]);
  const recent = cur[0] && cur[0].reported_at && Date.now() - new Date(cur[0].reported_at).getTime() < 24 * 3600 * 1000;
  await pool.query(
    `INSERT INTO mail_domain_marks (org_id, key, reported_by, reported_at, reported_note) VALUES ($1,$2,$3, now(), $4)
     ON CONFLICT (org_id, key) DO UPDATE SET reported_by=EXCLUDED.reported_by, reported_at=now(), reported_note=EXCLUDED.reported_note`,
    [req.user.orgId, key, req.user.id, JSON.stringify({ subject })]);
  let sent = 0;
  if (!recent) {
    const { rows: to } = await pool.query(
      `SELECT id FROM users WHERE org_id=$1 AND blocked=false AND role <> 'cliente' AND work_role IN ('socio','comercial') AND id <> $2`, [req.user.orgId, req.user.id]);
    for (const u of to) {
      await createNotification(pool, { orgId: req.user.orgId, userId: u.id, type: 'crm_mail_unknown', title: `Empresa fora do CRM: ${key}`,
        body: `${req.user.name || 'Alguém da equipe'} está trocando e-mails com ${key}${subject ? ` (“${subject}”)` : ''} e a empresa não está no CRM nem no módulo Empresas. Veja o bloco "Negócios fora do CRM" na tela inicial.`,
        actorName: req.user.name || '', target: { kind: 'mail_radar', key } });
      sent += 1;
    }
  }
  res.json({ ok: true, key, notified: sent, already: !!recent });
}));

router.post('/refresh', h(async (req, res) => { invalidateMailDirectory(req.user.orgId); res.json({ ok: true }); }));

// Radar do cockpit: domínios com troca real nos últimos 90 dias que ninguém identificou (nem CRM, nem Empresas, nem marca).
export async function radarFor(orgId, { limit = 20 } = {}) {
  const d = await directoryFor(orgId);
  const { rows } = await pool.query(
    `SELECT i.id, i.user_id, u.name AS user_name, i.thread_id, i.conv_key, i.subject, i.participants, i.team_replied, i.has_attachment, i.last_at
     FROM mail_thread_index i JOIN users u ON u.id = i.user_id WHERE i.org_id=$1 AND i.last_at > now() - interval '90 days' ORDER BY i.last_at DESC LIMIT 4000`, [orgId]);
  const { rows: rep } = await pool.query(`SELECT m.key, m.reported_at, u.name FROM mail_domain_marks m LEFT JOIN users u ON u.id = m.reported_by WHERE m.org_id=$1 AND m.kind IS NULL AND m.reported_at IS NOT NULL`, [orgId]);
  const reported = new Map(rep.map((r) => [r.key, { at: r.reported_at, by: r.name || '' }]));
  const by = new Map();
  for (const r of rows) {
    const cls = classifyThread({ participants: r.participants || [], teamReplied: r.team_replied, hasAttachment: r.has_attachment, subject: r.subject }, d.dir);
    if (!cls.nag) continue;
    const g = by.get(cls.nag) || { key: cls.nag, name: prettyKey(cls.nag), convs: new Set(), team: new Set(), lastAt: null, subject: '', contacts: [], rowId: null, threads: [], partner: '' };
    if (cls.partner && !g.partner) g.partner = cls.partner.name;
    if (cls.suggest && !g.suggest) g.suggest = cls.suggest.name;
    g.convs.add(r.conv_key); g.team.add(r.user_name);
    if (!g.lastAt) { g.lastAt = r.last_at; g.subject = r.subject; g.rowId = String(r.id); }
    g.threads.push({ userId: r.user_id, threadId: r.thread_id });
    for (const p of r.participants || []) if (keyOf(p.email) === cls.nag && g.contacts.length < 3 && !g.contacts.some((c) => c.email === p.email)) g.contacts.push({ name: p.name || '', email: p.email });
    by.set(cls.nag, g);
  }
  const items = [...by.values()].map((g) => ({ key: g.key, name: g.name, conversations: g.convs.size, team: [...g.team], lastAt: g.lastAt ? new Date(g.lastAt).toISOString() : null, subject: g.subject, contacts: g.contacts, partner: g.partner, suggest: g.suggest || '', reported: reported.get(g.key) || null, threads: g.threads }));
  return { count: items.length, items: items.slice(0, limit) };
}

router.get('/radar', needCrm, h(async (req, res) => {
  const out = await radarFor(req.user.orgId);
  // Abrir no e-mail só faz sentido para quem tem a conversa na própria caixa.
  res.json({ count: out.count, items: out.items.map(({ threads, ...it }) => ({ ...it, myThreadId: (threads.find((t) => t.userId === req.user.id) || {}).threadId || null })) });
}));
