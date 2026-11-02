// Teste descartável (HTTP real, Postgres local) do WhatsApp, Fase 1 (2026-11-02). Sobe o servidor do painel na porta 3091 com chaves de
// teste e um servidor falso da Meta na 3092 (WHATSAPP_GRAPH_BASE, aceito só fora de produção). Apaga as conversas de teste ao final.
//   node scripts/whatsapp-http.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const SECRET = 'segredo-teste'; const PHONE = '999000111'; const VERIFY = 'verifica-teste';
const BASE = 'http://127.0.0.1:3091'; const META = 'http://127.0.0.1:3092';
const CUSTOMER = '5541999990001'; const FAILS = '5541999990002';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`ok   ${m}`); };

const sent = [];
const meta = http.createServer(async (req, res) => {
  let body = Buffer.alloc(0);
  for await (const ch of req) body = Buffer.concat([body, ch]);
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.headers.authorization !== 'Bearer token-teste') return json(401, { error: { code: 190 } });
  if (req.method === 'POST' && req.url === `/v24.0/${PHONE}/messages`) {
    const b = JSON.parse(body.toString()); sent.push(b);
    if (b.status === 'read') return json(200, { success: true });
    if (b.to === FAILS) return json(400, { error: { code: 131026, message: 'undeliverable' } });
    return json(200, { messages: [{ id: `wamid.out-${sent.length}` }] });
  }
  if (req.method === 'POST' && req.url === `/v24.0/${PHONE}/media`) { sent.push({ upload: body.length }); return json(200, { id: 'MEDIAUP1' }); }
  if (req.method === 'GET' && req.url === '/v24.0/MEDIA1') return json(200, { url: `${META}/file/MEDIA1`, mime_type: 'application/pdf', file_size: 13 });
  if (req.method === 'GET' && req.url === '/file/MEDIA1') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end('%PDF-1.4 test'); }
  json(404, { error: { code: 100 } });
});
await new Promise((r) => meta.listen(3092, '127.0.0.1', r));

const srv = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, ...env, PORT: '3091', NODE_ENV: '', WHATSAPP_TOKEN: 'token-teste', WHATSAPP_PHONE_NUMBER_ID: PHONE, WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_GRAPH_BASE: META, WHATSAPP_DISPLAY_PHONE: '+55 (41) 3000-0000', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' },
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
const msgHook = (from, messages, name = 'Cliente Teste') => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE }, contacts: [{ wa_id: from, profile: { name } }], messages } }] }] });
const cleanup = () => pool.query(`DELETE FROM wa_conversations WHERE wa_id IN ($1,$2)`, [CUSTOMER, FAILS]);

try {
  assert.match(log, /WhatsApp: ATIVADO/, 'servidor subiu com o WhatsApp ligado');
  await cleanup();
  const PASS = crypto.randomBytes(12).toString('hex'); const hash = await bcrypt.hash(PASS, 8);
  const org = (await pool.query(`SELECT id FROM organizations WHERE slug = 'pricetax'`)).rows[0].id;
  for (const [u, role] of [['wa_tmp_equipe', 'pricetax'], ['wa_tmp_cliente', 'cliente']]) {
    await pool.query(`INSERT INTO users (id, username, password_hash, name, role, org_id) VALUES ($1,$1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET password_hash = $2`, [u, hash, u === 'wa_tmp_equipe' ? 'Equipe Teste' : 'Cliente Teste', role, org]);
  }
  const admin = session(); const cliente = session(); const anon = session();
  ok((await admin('POST', '/api/auth/login', { username: 'wa_tmp_equipe', password: PASS })).status === 200, 'login da equipe');

  let r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
  ok(r.status === 200 && (await r.text()) === '12345', 'verificação do webhook devolve o challenge');
  r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`);
  ok(r.status === 403, 'verificação com token errado é recusada');

  r = await hook(msgHook(CUSTOMER, [{ from: CUSTOMER, id: 'wamid.t1', timestamp: now(60), type: 'text', text: { body: 'Olá, PRICETAX' } }]), 'outro-segredo');
  ok(r.status === 401, 'webhook com assinatura falsa é recusado');
  ok((await anon('GET', '/api/whatsapp/conversations')).status === 401, 'lista exige login');

  r = await hook(msgHook(CUSTOMER, [{ from: CUSTOMER, id: 'wamid.t1', timestamp: now(60), type: 'text', text: { body: 'Olá, PRICETAX' } }]));
  ok(r.status === 200, 'mensagem recebida');
  await hook(msgHook(CUSTOMER, [{ from: CUSTOMER, id: 'wamid.t1', timestamp: now(60), type: 'text', text: { body: 'Olá, PRICETAX' } }]));
  await hook(msgHook(CUSTOMER, [{ from: CUSTOMER, id: 'wamid.t2', timestamp: now(), type: 'document', document: { id: 'MEDIA1', mime_type: 'application/pdf', filename: 'SPED agosto.pdf' } }]));
  let list = (await admin('GET', '/api/whatsapp/conversations')).data;
  const conv = list.conversations.find((c) => c.waId === CUSTOMER);
  ok(conv && conv.name === 'Cliente Teste' && conv.unread === 2, 'conversa aparece com nome e 2 não lidas (reenvio da Meta não duplica)');
  ok(conv.windowOpen === true && conv.lastPreview.startsWith('Documento'), 'janela aberta e prévia do documento');
  const notes = await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE type = 'whatsapp_message' AND target->>'conversationId' = $1`, [conv.id]);
  const team = await pool.query(`SELECT count(*)::int AS n FROM users u JOIN organizations o ON o.id = u.org_id WHERE o.slug = 'pricetax' AND u.role IN ('master','pricetax') AND NOT u.blocked AND (u.expires_at IS NULL OR u.expires_at > now())`);
  ok(notes.rows[0].n === team.rows[0].n, `um aviso por pessoa da equipe, não um por mensagem (${notes.rows[0].n})`);

  await new Promise((res) => setTimeout(res, 800));
  let open = (await admin('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  const doc = open.messages.find((m) => m.kind === 'document');
  ok(open.messages.length === 2 && doc.media.stored && doc.media.filename === 'SPED agosto.pdf', 'arquivo recebido foi baixado e guardado');
  r = await fetch(`${BASE}/api/whatsapp/media/${doc.id}?download=1`, { headers: { Cookie: '' } });
  ok(r.status === 401, 'arquivo exige login');

  ok((await admin('POST', `/api/whatsapp/conversations/${conv.id}/read`)).status === 200, 'marcar como lida');
  await new Promise((res) => setTimeout(res, 400));
  ok(sent.some((s) => s.status === 'read' && s.message_id === 'wamid.t2'), 'confirmação de leitura enviada à Meta para a última mensagem');
  list = (await admin('GET', '/api/whatsapp/conversations')).data;
  ok(list.conversations.find((c) => c.id === conv.id).unread === 0, 'não lidas zeradas');

  r = await admin('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: 'Bom dia! Recebemos o SPED.' });
  ok(r.status === 200, 'resposta em texto enviada');
  ok(sent.some((s) => s.to === CUSTOMER && s.type === 'text' && s.text.body === 'Bom dia! Recebemos o SPED.'), 'Meta recebeu o texto certo');
  r = await admin('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: 'segue o parecer', attachment: { filename: 'Parecer.pdf', data: Buffer.from('%PDF-1.4 parecer').toString('base64') } });
  ok(r.status === 200 && sent.some((s) => s.type === 'document' && s.document.id === 'MEDIAUP1' && s.document.filename === 'Parecer.pdf' && s.document.caption === 'segue o parecer'), 'documento enviado com legenda');
  r = await admin('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { attachment: { filename: 'virus.exe', data: 'AAAA' } });
  ok(r.status === 400 && /Google Drive/.test(r.data.message), '.exe recusado no servidor');
  r = await admin('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: '' });
  ok(r.status === 400, 'mensagem vazia recusada');

  open = (await admin('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  const out = open.messages.filter((m) => m.direction === 'out');
  ok(out.length === 2 && out[0].sentByName && out[0].status === 'sent', 'enviadas mostram quem respondeu');
  await hook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE }, statuses: [{ id: 'wamid.out-2', status: 'read', timestamp: now() }, { id: 'wamid.out-2', status: 'delivered', timestamp: now() }] } }] }] });
  open = (await admin('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  ok(open.messages.find((m) => m.body === 'Bom dia! Recebemos o SPED.').status === 'read', 'status "lida" não volta para "entregue"');

  await hook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'smb_message_echoes', value: { metadata: { phone_number_id: PHONE }, message_echoes: [{ from: '554130000000', to: CUSTOMER, id: 'wamid.echo1', timestamp: now(), type: 'text', text: { body: 'Pelo celular' } }] } }] }] });
  open = (await admin('GET', `/api/whatsapp/conversations/${conv.id}`)).data;
  ok(open.messages.some((m) => m.via === 'celular' && m.direction === 'out'), 'resposta dada pelo celular aparece no painel');

  await pool.query(`UPDATE wa_conversations SET last_inbound_at = now() - interval '25 hours' WHERE id = $1`, [conv.id]);
  r = await admin('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { text: 'fora da janela' });
  ok(r.status === 409 && r.data.code === 'window_closed', 'fora da janela de 24 h o envio é bloqueado');

  ok((await admin('POST', `/api/whatsapp/conversations/${conv.id}/archive`, { archived: true })).status === 200, 'arquivar');
  ok(!(await admin('GET', '/api/whatsapp/conversations')).data.conversations.some((c) => c.id === conv.id), 'arquivada sai da lista');
  ok((await admin('GET', '/api/whatsapp/conversations?archived=1')).data.conversations.some((c) => c.id === conv.id), 'e aparece em Arquivadas');
  await hook(msgHook(CUSTOMER, [{ from: CUSTOMER, id: 'wamid.t3', timestamp: now(), type: 'text', text: { body: 'Mais uma dúvida' } }]));
  ok((await admin('GET', '/api/whatsapp/conversations')).data.conversations.some((c) => c.id === conv.id), 'cliente escreveu de novo: volta para a lista');
  ok((await admin('GET', '/api/whatsapp/conversations?q=990001')).data.conversations.length === 1, 'busca por parte do número');

  await hook(msgHook(FAILS, [{ from: FAILS, id: 'wamid.f1', timestamp: now(), type: 'text', text: { body: 'oi' } }], 'Sem entrega'));
  const c2 = (await admin('GET', '/api/whatsapp/conversations?q=Sem')).data.conversations[0];
  r = await admin('POST', `/api/whatsapp/conversations/${c2.id}/messages`, { text: 'teste' });
  ok(r.status === 502 && /não pôde ser entregue/.test(r.data.message), 'erro da Meta chega traduzido');

  ok((await cliente('POST', '/api/auth/login', { username: 'wa_tmp_cliente', password: PASS })).status === 200, 'login do cliente');
  ok((await cliente('GET', '/api/whatsapp/conversations')).status === 403, 'usuário cliente não acessa');

  console.log(`\n${n} verificações passaram.`);
} catch (e) {
  console.error('FALHOU:', e.message);
  console.error(log.slice(-2000));
  process.exitCode = 1;
} finally {
  await pool.query(`DELETE FROM notifications WHERE type = 'whatsapp_message' AND target->>'conversationId' IN (SELECT id FROM wa_conversations WHERE wa_id IN ($1,$2))`, [CUSTOMER, FAILS]).catch(() => {});
  await cleanup().catch(() => {});
  await pool.query(`DELETE FROM users WHERE id IN ('wa_tmp_equipe','wa_tmp_cliente')`).catch((e) => console.error('usuários temporários ficaram:', e.message));
  await pool.end();
  srv.kill();
  meta.close();
}
