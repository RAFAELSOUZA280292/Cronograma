// WhatsApp (Fase 1): assinatura do webhook, leitura dos eventos da Meta, janela de 24 h, status e anexos. Puro.
//   node scripts/whatsapp-core.test.mjs
import crypto from 'node:crypto';
import { verifySignature, parseWebhook, nextStatus, windowOpen, normalizeWaId, formatPhone, previewOf, attachmentError, sendTypeFor, friendlyGraphError, validateText } from '../server/whatsappCore.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };

const secret = 'segredo-de-teste';
const raw = Buffer.from('{"a":1}');
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
ok('assinatura certa', verifySignature(raw, sig, secret));
ok('assinatura de outro corpo', !verifySignature(Buffer.from('{"a":2}'), sig, secret));
ok('sem cabeçalho', !verifySignature(raw, '', secret));
ok('sem segredo configurado', !verifySignature(raw, sig, ''));
ok('corpo já convertido em objeto não passa', !verifySignature({ a: 1 }, sig, secret));

const PHONE = '1234567890';
const hook = {
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [
    { field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { phone_number_id: PHONE },
      contacts: [{ wa_id: '5541999998888', profile: { name: 'Maria Cliente' } }],
      messages: [
        { from: '5541999998888', id: 'wamid.1', timestamp: '1793620800', type: 'text', text: { body: 'Bom dia, segue o SPED' } },
        { from: '5541999998888', id: 'wamid.2', timestamp: '1793620860', type: 'document', document: { id: 'MEDIA1', mime_type: 'application/pdf', filename: 'SPED.pdf', caption: 'agosto' } },
        { from: '5541999998888', id: 'wamid.3', timestamp: '1793620900', type: 'reaction', reaction: { message_id: 'wamid.0', emoji: '👍' } },
        { from: '5541999998888', id: 'wamid.4', timestamp: '1793620950', type: 'unknown', errors: [{ code: 131051 }] },
      ],
      statuses: [{ id: 'wamid.out1', status: 'read', timestamp: '1793621000', recipient_id: '5541999998888' }],
    } },
    { field: 'messages', value: { metadata: { phone_number_id: 'OUTRO' }, messages: [{ from: '5511', id: 'x', type: 'text', text: { body: 'de outro número' } }] } },
    { field: 'smb_message_echoes', value: { metadata: { phone_number_id: PHONE }, message_echoes: [{ from: '554130000000', to: '5541999998888', id: 'wamid.echo', timestamp: '1793621100', type: 'text', text: { body: 'Respondido pelo celular' } }] } },
  ] }],
};
const ev = parseWebhook(hook, PHONE);
const msgs = ev.filter((e) => e.type === 'message');
ok('webhook: 5 mensagens do número certo (ignora outro número)', msgs.length === 5, msgs.map((m) => m.waMessageId));
ok('webhook: texto e nome do perfil', msgs[0].body === 'Bom dia, segue o SPED' && msgs[0].profileName === 'Maria Cliente' && msgs[0].direction === 'in');
ok('webhook: data vem do timestamp da Meta', msgs[0].createdAt === new Date(1793620800 * 1000).toISOString());
ok('webhook: documento com legenda e arquivo', msgs[1].kind === 'document' && msgs[1].media.id === 'MEDIA1' && msgs[1].media.filename === 'SPED.pdf' && msgs[1].body === 'agosto');
ok('webhook: reação aponta para a mensagem reagida', msgs[2].kind === 'reaction' && msgs[2].body === '👍' && msgs[2].replyTo === 'wamid.0');
ok('webhook: tipo desconhecido vira aviso legível', msgs[3].kind === 'unsupported' && /celular/.test(msgs[3].body));
ok('webhook: eco do celular entra como enviada', msgs[4].direction === 'out' && msgs[4].via === 'celular' && msgs[4].waId === '5541999998888');
const st = ev.find((e) => e.type === 'status');
ok('webhook: status de leitura', st && st.waMessageId === 'wamid.out1' && st.status === 'read');
ok('webhook: objeto errado é ignorado', parseWebhook({ object: 'page', entry: [] }, PHONE).length === 0);
ok('webhook: corpo vazio não quebra', parseWebhook(null, PHONE).length === 0);

ok('status: read não volta para delivered', nextStatus('read', 'delivered') === 'read');
ok('status: sent → delivered', nextStatus('sent', 'delivered') === 'delivered');
ok('status: failed sempre vale', nextStatus('read', 'failed') === 'failed');
ok('status: depois de failed, não muda', nextStatus('failed', 'delivered') === 'failed');
ok('status: desconhecido é ignorado', nextStatus('sent', 'deleted') === 'sent');

const now = Date.parse('2026-11-02T15:00:00Z');
ok('janela: 23 h atrás está aberta', windowOpen('2026-11-01T16:00:00Z', now));
ok('janela: 25 h atrás está fechada', !windowOpen('2026-11-01T14:00:00Z', now));
ok('janela: sem mensagem do cliente está fechada', !windowOpen(null, now));

ok('número: limpa máscara', normalizeWaId('+55 (41) 99999-8888') === '5541999998888');
ok('número: curto demais', normalizeWaId('1234') === '');
ok('número: formato brasileiro', formatPhone('5541999998888') === '+55 (41) 99999-8888');
ok('número: estrangeiro', formatPhone('14155238886') === '+14155238886');

ok('prévia: documento', previewOf('document', 'agosto') === 'Documento: agosto');
ok('prévia: texto longo cortado', previewOf('text', 'a'.repeat(300)).length === 140);

ok('anexo: PDF aceito', attachmentError('Parecer.pdf', 1000) === '' && sendTypeFor('Parecer.pdf').kind === 'document');
ok('anexo: imagem acima de 5 MB recusada', /5 MB/.test(attachmentError('foto.JPG', 6 * 1024 * 1024)));
ok('anexo: exe recusado', /Google Drive/.test(attachmentError('setup.exe', 100)));
ok('anexo: vazio recusado', /vazio/.test(attachmentError('a.pdf', 0)));
ok('anexo: tipo pela extensão, não pelo navegador', sendTypeFor('planilha.xlsx').mime.includes('spreadsheetml'));

ok('erro: janela de 24 h em português', /24 horas/.test(friendlyGraphError({ error: { code: 131047 } })));
ok('erro: chave vencida', /chave/.test(friendlyGraphError({ error: { code: 190 } })));
ok('erro: desconhecido tem texto padrão', /recusou/.test(friendlyGraphError({ error: { code: 1 } })));
ok('texto: vazio recusado', validateText('   ') !== '');
ok('texto: acima de 4096 recusado', validateText('x'.repeat(4097)) !== '');

console.log(failed ? `\n${failed} falha(s).` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
