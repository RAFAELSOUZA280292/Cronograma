// Teste descartável (HTTP real, Postgres local) do WhatsApp com caixas (2026-11-02). Sobe o painel na porta 3091 com as chaves do app de
// teste e um servidor falso da Meta na 3092 (WHATSAPP_GRAPH_BASE, aceito só fora de produção). Cria usuários e caixas temporários e apaga
// tudo ao final.   node scripts/whatsapp-http.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const SECRET = 'segredo-teste'; const VERIFY = 'verifica-teste';
const PHONE_C = '999000111'; const PHONE_P = '999000222';
const TOKEN_C = 'token-teste-comercial-0001'; const TOKEN_P = 'token-teste-pessoal-00002';
const BASE = 'http://127.0.0.1:3091'; const META = 'http://127.0.0.1:3092';
const CUSTOMER = '5541999990001'; const FAILS = '5541999990002'; const FAMILY = '5541999990003';
const USERS = { rafael: 'master', felipe: 'master', duda: 'pricetax', outro: 'pricetax', cliente: 'cliente' };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`ok   ${m}`); };

const sent = [];
const meta = http.createServer(async (req, res) => {
  let body = Buffer.alloc(0);
  for await (const ch of req) body = Buffer.concat([body, ch]);
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${TOKEN_C}` && auth !== `Bearer ${TOKEN_P}`) return json(401, { error: { code: 190 } });
  const m = /^\/v24\.0\/(\d+)\/(messages|media)$/.exec(req.url);
  if (req.method === 'POST' && m) {
    if ((m[1] === PHONE_C) !== (auth === `Bearer ${TOKEN_C}`)) return json(401, { error: { code: 190 } });
    if (m[2] === 'media') { sent.push({ phone: m[1], upload: body.length }); return json(200, { id: 'MEDIAUP1' }); }
    const b = JSON.parse(body.toString()); sent.push({ phone: m[1], ...b });
    if (b.status === 'read') return json(200, { success: true });
    if (b.to === FAILS) return json(400, { error: { code: 131026, message: 'undeliverable' } });
    return json(200, { messages: [{ id: `wamid.out-${sent.length}` }] });
  }
  if (req.method === 'GET' && req.url === '/v24.0/MEDIA1') return json(200, { url: `${META}/file/MEDIA1`, mime_type: 'application/pdf', file_size: 13 });
  if (req.method === 'GET' && req.url === '/file/MEDIA1') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end('%PDF-1.4 test'); }
  json(404, { error: { code: 100 } });
});
await new Promise((r) => meta.listen(3092, '127.0.0.1', r));

const srv = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, ...env, PORT: '3091', NODE_ENV: '', WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_GRAPH_BASE: META, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 60 && !/ouvindo na porta 3091/.test(log); i++) await new Promise((r) => setTimeout(r, 500));

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
function session() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch { /* */ }
    return { status: r.status, data };
  };
}
const hook = (payload, secret = SECRET) => {
  const raw = Buffer.from(JSON.stringify(payload));
  return fetch(`${BASE}/api/whatsapp/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex') }, body: raw });
};
const now = (ago = 0) => String(Math.floor(Date.now() / 1000) - ago);
const msgHook = (phone, from, messages, name = 'Cliente Teste') => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phone }, contacts: [{ wa_id: from, profile: { name } }], messages } }] }] });
const text = (id, body, ago = 0) => ({ id, timestamp: now(ago), type: 'text', text: { body } });
const ids = Object.keys(USERS).map((k) => `wa_tmp_${k}`);
const cleanup = async () => {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM wa_inboxes WHERE phone_number_id IN ($1,$2)`, [PHONE_C, PHONE_P]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  assert.match(log, /WhatsApp: ATIVADO/, 'servidor subiu com o WhatsApp ligado');
  await cleanup();
  const PASS = crypto.randomBytes(12).toString('hex'); const hash = await bcrypt.hash(PASS, 8);
  const org = (await pool.query(`SELECT id FROM organizations WHERE slug = 'pricetax'`)).rows[0].id;
  const S = {};
  for (const [k, role] of Object.entries(USERS)) {
    await pool.query(`INSERT INTO users (id, username, password_hash, name, role, org_id) VALUES ($1,$1,$2,$3,$4,$5)`, [`wa_tmp_${k}`, hash, `Teste ${k}`, role, org]);
    S[k] = session();
    ok((await S[k]('POST', '/api/auth/login', { username: `wa_tmp_${k}`, password: PASS })).status === 200, `login ${k}`);
  }
  const anon = session();

  let r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
  ok(r.status === 200 && (await r.text()) === '12345', 'verificação do webhook devolve o challenge');
  ok((await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`)).status === 403, 'verificação com token errado é recusada');
  ok((await hook(msgHook(PHONE_C, CUSTOMER, [{ from: CUSTOMER, ...text('wamid.t1', 'oi') }]), 'outro-segredo')).status === 401, 'webhook com assinatura falsa é recusado');
  ok((await anon('GET', '/api/whatsapp/status')).status === 401, 'status exige login');

  // ---- Configuração (master) ----
  ok((await S.duda('GET', '/api/whatsapp/admin/inboxes')).status === 403, 'só master configura');
  r = await S.rafael('POST', '/api/whatsapp/admin/inboxes', { kind: 'shared', name: 'Comercial', phoneNumberId: PHONE_C, displayPhone: '+55 (41) 3000-0001', token: TOKEN_C, memberIds: ['wa_tmp_duda', 'wa_tmp_felipe', 'wa_tmp_rafael', 'wa_tmp_cliente'] });
  ok(r.status === 200, 'caixa Comercial criada');
  const comercial = r.data.inboxes.find((i) => i.name === 'Comercial');
  ok(comercial.members.length === 3 && !comercial.members.some((m) => m.id === 'wa_tmp_cliente'), 'usuário cliente não entra como membro');
  ok(!JSON.stringify(r.data).includes(TOKEN_C), 'a chave nunca volta para a tela');
  const tok = (await pool.query('SELECT token_enc FROM wa_inboxes WHERE id = $1', [comercial.id])).rows[0].token_enc;
  ok(tok.startsWith('enc1:') && !tok.includes(TOKEN_C), 'a chave fica cifrada no banco');
  r = await S.rafael('POST', '/api/whatsapp/admin/inboxes', { kind: 'shared', name: 'Duplicada', phoneNumberId: PHONE_C, token: TOKEN_C });
  ok(r.status === 409, 'mesmo número em duas caixas é recusado');
  r = await S.felipe('POST', '/api/whatsapp/admin/inboxes', { kind: 'personal', name: 'Rafael (pessoal)', ownerId: 'wa_tmp_rafael', phoneNumberId: PHONE_P, displayPhone: '+55 (41) 99999-0000', token: TOKEN_P });
  ok(r.status === 200, 'caixa pessoal do Rafael cadastrada (por outro master)');
  const pessoal = r.data.inboxes.find((i) => i.kind === 'personal');
  ok(pessoal.authorized === false, 'caixa pessoal nasce aguardando o dono');

  // ---- Caixa compartilhada ----
  ok((await hook(msgHook(PHONE_C, CUSTOMER, [{ from: CUSTOMER, ...text('wamid.t1', 'Olá, PRICETAX', 60) }]))).status === 200, 'mensagem recebida');
  await hook(msgHook(PHONE_C, CUSTOMER, [{ from: CUSTOMER, ...text('wamid.t1', 'Olá, PRICETAX', 60) }]));
  await hook(msgHook(PHONE_C, CUSTOMER, [{ from: CUSTOMER, id: 'wamid.t2', timestamp: now(), type: 'document', document: { id: 'MEDIA1', mime_type: 'application/pdf', filename: 'SPED agosto.pdf' } }]));
  const st = (await S.duda('GET', '/api/whatsapp/status')).data;
  ok(st.inboxes.length === 1 && st.inboxes[0].name === 'Comercial' && st.inboxes[0].unread === 2, 'Duda vê só a Comercial, com 2 não lidas (reenvio não duplica)');
  ok((await S.outro('GET', '/api/whatsapp/status')).data.inboxes.length === 0, 'quem não é membro não vê caixa nenhuma');
  ok((await S.outro('GET', `/api/whatsapp/conversations?inbox=${comercial.id}`)).status === 404, 'nem pela lista direta');
  ok((await S.cliente('GET', '/api/whatsapp/status')).status === 403, 'usuário cliente não acessa o módulo');
  const list = (await S.duda('GET', `/api/whatsapp/conversations?inbox=${comercial.id}`)).data;
  const conv = list.conversations[0];
  ok(conv.name === 'Cliente Teste' && conv.windowOpen && conv.lastPreview.startsWith('Documento'), 'conversa com nome, janela aberta e prévia');
  const raw = (await pool.query('SELECT body FROM wa_messages WHERE wa_message_id = $1', ['wamid.t1'])).rows[0].body;
  ok(raw.startsWith('enc1:') && !raw.includes('PRICETAX'), 'texto da mensagem cifrado no banco');
  const notes = await pool.query(`SELECT user_id FROM notifications WHERE type = 'whatsapp_message' AND target->>'conversationId' = $1`, [conv.id]);
  ok(notes.rows.length === 3 && !notes.rows.some((x) => x.user_id === 'wa_tmp_outro'), 'um aviso por membro, ninguém de fora');
  ok((await S.outro('GET', `/api/whatsapp/conversations/${conv.id}`)).status === 404, 'não membro não abre a conversa pelo endereço');

  await wait(800);
  let open = (await S.duda('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  const doc = open.messages.find((m) => m.kind === 'document');
  ok(open.messages.length === 2 && doc.media.stored, 'arquivo recebido baixado e guardado');
  r = await fetch(`${BASE}/api/whatsapp/media/${doc.id}?download=1`);
  ok(r.status === 401, 'arquivo exige login');
  const blob = (await pool.query('SELECT data FROM wa_media WHERE message_id = $1', [doc.id])).rows[0].data;
  ok(!blob.toString('latin1').includes('%PDF'), 'arquivo cifrado no banco');
  ok((await S.outro('GET', `/api/whatsapp/media/${doc.id}`)).status === 404, 'não membro não baixa o arquivo');

  ok((await S.felipe('POST', `/api/whatsapp/conversations/${conv.id}/read`)).status === 200, 'Felipe (membro) marca como lida');
  await wait(400);
  ok(sent.some((s) => s.phone === PHONE_C && s.status === 'read' && s.message_id === 'wamid.t2'), 'confirmação de leitura sai pelo número da Comercial');
  r = await S.duda('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: 'Bom dia! Recebemos o SPED.' });
  ok(r.status === 200 && sent.some((s) => s.phone === PHONE_C && s.text && s.text.body === 'Bom dia! Recebemos o SPED.'), 'Duda responde pela Comercial');
  r = await S.felipe('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: 'segue o parecer', attachment: { filename: 'Parecer.pdf', data: Buffer.from('%PDF-1.4 parecer').toString('base64') } });
  ok(r.status === 200 && sent.some((s) => s.type === 'document' && s.document.filename === 'Parecer.pdf'), 'Felipe envia documento com legenda');
  ok((await S.duda('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { attachment: { filename: 'virus.exe', data: 'AAAA' } })).status === 400, '.exe recusado');
  open = (await S.rafael('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  const outs = open.messages.filter((m) => m.direction === 'out');
  ok(outs.map((m) => m.sentByName).join('|') === 'Teste duda|Teste felipe', 'cada resposta mostra quem respondeu');
  const sentId = sent.findIndex((s) => s.text && s.text.body === 'Bom dia! Recebemos o SPED.') + 1;
  await hook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_C }, statuses: [{ id: `wamid.out-${sentId}`, status: 'read', timestamp: now() }, { id: `wamid.out-${sentId}`, status: 'delivered', timestamp: now() }] } }] }] });
  open = (await S.duda('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  ok(open.messages.find((m) => m.body === 'Bom dia! Recebemos o SPED.').status === 'read', 'status "lida" não volta para "entregue"');
  await pool.query(`UPDATE wa_conversations SET last_inbound_at = now() - interval '25 hours' WHERE id = $1`, [conv.id]);
  r = await S.duda('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: 'fora da janela' });
  ok(r.status === 409 && r.data.code === 'window_closed', 'fora da janela de 24 h o envio é bloqueado');
  ok((await S.duda('POST', `/api/whatsapp/conversations/${conv.id}/archive`, { archived: true })).status === 200, 'arquivar');
  ok(!(await S.duda('GET', `/api/whatsapp/conversations?inbox=${comercial.id}`)).data.conversations.length, 'arquivada sai da lista');
  await hook(msgHook(PHONE_C, CUSTOMER, [{ from: CUSTOMER, ...text('wamid.t3', 'Mais uma dúvida') }]));
  ok((await S.duda('GET', `/api/whatsapp/conversations?inbox=${comercial.id}&q=990001`)).data.conversations.length === 1, 'cliente escreveu de novo: volta; busca por número');
  ok((await S.duda('GET', `/api/whatsapp/conversations?inbox=${comercial.id}&q=cliente`)).data.conversations.length === 1, 'busca por nome (cifrado no banco)');
  await hook(msgHook(PHONE_C, FAILS, [{ from: FAILS, ...text('wamid.f1', 'oi') }], 'Sem entrega'));
  const c2 = (await S.duda('GET', `/api/whatsapp/conversations?inbox=${comercial.id}&q=Sem`)).data.conversations[0];
  r = await S.duda('POST', `/api/whatsapp/conversations/${c2.id}/messages`, { text: 'teste' });
  ok(r.status === 502 && /não pôde ser entregue/.test(r.data.message), 'erro da Meta chega traduzido');

  // ---- Caixa pessoal ----
  await hook(msgHook(PHONE_P, FAMILY, [{ from: FAMILY, ...text('wamid.p0', 'Mensagem antes de autorizar') }], 'Mãe'));
  ok((await pool.query(`SELECT count(*)::int AS n FROM wa_conversations WHERE inbox_id = $1`, [pessoal.id])).rows[0].n === 0, 'antes de o dono autorizar, nada é guardado');
  ok((await S.felipe('POST', `/api/whatsapp/inboxes/${pessoal.id}/authorize`)).status === 404, 'outra pessoa (mesmo master) não autoriza pelo dono');
  const rst = (await S.rafael('GET', '/api/whatsapp/status')).data;
  ok(rst.inboxes.some((i) => i.id === pessoal.id && !i.authorized), 'o dono vê a caixa pedindo autorização');
  ok((await S.rafael('POST', `/api/whatsapp/inboxes/${pessoal.id}/authorize`)).status === 200, 'o dono autoriza');
  await hook(msgHook(PHONE_P, FAMILY, [{ from: FAMILY, ...text('wamid.p1', 'Filho, almoço domingo?', 30) }], 'Mãe'));
  await hook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'smb_message_echoes', value: { metadata: { phone_number_id: PHONE_P }, message_echoes: [{ from: '554199999000', to: FAMILY, id: 'wamid.p2', timestamp: now(), type: 'text', text: { body: 'Combinado!' } }] } }] }] });
  const plist = (await S.rafael('GET', `/api/whatsapp/conversations?inbox=${pessoal.id}`)).data.conversations;
  ok(plist.length === 1 && plist[0].name === 'Mãe', 'o dono vê a conversa pessoal');
  const pconv = plist[0].id;
  ok((await S.rafael('GET', `/api/whatsapp/conversations/${pconv}`)).data.messages.some((m) => m.via === 'celular' && m.body === 'Combinado!'), 'resposta dada pelo celular aparece');
  ok(!(await S.felipe('GET', '/api/whatsapp/status')).data.inboxes.some((i) => i.id === pessoal.id), 'Felipe (master) não vê a caixa pessoal do Rafael');
  ok((await S.felipe('GET', `/api/whatsapp/conversations?inbox=${pessoal.id}`)).status === 404, 'nem a lista');
  ok((await S.felipe('GET', `/api/whatsapp/conversations/${pconv}`)).status === 404, 'nem a conversa pelo endereço');
  ok((await S.felipe('POST', `/api/whatsapp/conversations/${pconv}/messages`, { text: 'x' })).status === 404, 'nem responde por ele');
  const adm = (await S.felipe('GET', '/api/whatsapp/admin/inboxes')).data;
  ok(!JSON.stringify(adm).includes('almoço') && !JSON.stringify(adm).includes('Mãe'), 'a configuração não mostra conteúdo nenhum');
  ok((await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE type = 'whatsapp_message' AND target->>'inboxId' = $1`, [pessoal.id])).rows[0].n === 0, 'caixa pessoal não gera aviso no sino (o celular já avisa)');
  const praw = (await pool.query(`SELECT profile_name, last_preview FROM wa_conversations WHERE id = $1`, [pconv])).rows[0];
  ok(!praw.profile_name.includes('Mãe') && !praw.last_preview.includes('Combinado'), 'nome e prévia cifrados no banco');
  r = await S.rafael('POST', `/api/whatsapp/conversations/${pconv}/messages`, { text: 'Vou sim.' });
  ok(r.status === 200 && sent.some((s) => s.phone === PHONE_P && s.text && s.text.body === 'Vou sim.'), 'o dono responde pelo próprio número');
  ok((await S.felipe('POST', `/api/whatsapp/inboxes/${pessoal.id}/revoke`)).status === 404, 'só o dono desliga');
  r = await S.rafael('POST', `/api/whatsapp/inboxes/${pessoal.id}/revoke`);
  ok(r.status === 200 && r.data.removed === 1, 'o dono desliga e o painel apaga o que guardou');
  ok((await pool.query(`SELECT count(*)::int AS n FROM wa_messages m JOIN wa_conversations c ON c.id = m.conversation_id WHERE c.inbox_id = $1`, [pessoal.id])).rows[0].n === 0, 'nenhuma mensagem pessoal sobra no banco');
  await hook(msgHook(PHONE_P, FAMILY, [{ from: FAMILY, ...text('wamid.p3', 'Depois de desligar') }], 'Mãe'));
  ok((await pool.query(`SELECT count(*)::int AS n FROM wa_conversations WHERE inbox_id = $1`, [pessoal.id])).rows[0].n === 0, 'depois de desligar, nada volta a ser guardado');

  // ---- Membros mudam ----
  r = await S.rafael('PATCH', `/api/whatsapp/admin/inboxes/${comercial.id}`, { memberIds: ['wa_tmp_duda'] });
  ok(r.status === 200 && (await S.felipe('GET', `/api/whatsapp/conversations/${conv.id}`)).status === 404, 'tirar o Felipe da Comercial corta o acesso na hora');
  r = await S.rafael('PATCH', `/api/whatsapp/admin/inboxes/${comercial.id}`, { active: false });
  ok(r.status === 200 && (await S.duda('GET', '/api/whatsapp/status')).data.inboxes.length === 0, 'caixa desligada some para todos');

  console.log(`\n${n} verificações passaram.`);
} catch (e) {
  console.error('FALHOU:', e.message);
  console.error(log.slice(-2000));
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.error('limpeza falhou:', e.message));
  await pool.end();
  srv.kill();
  meta.close();
}
