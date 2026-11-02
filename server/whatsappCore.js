// WhatsApp (Fase 1, 2026-11-02): funções puras da integração com a API oficial da Meta (WhatsApp Cloud API).
// Assinatura do webhook, leitura do que a Meta manda (mensagens, status de entrega e eco do celular na coexistência),
// janela de 24 h e regras de anexo. Sem banco e sem rede: testadas em scripts/whatsapp-core.test.mjs.
import crypto from 'node:crypto';

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_TEXT = 4096;
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

// Limites da Meta por tipo de envio (documentação da Cloud API, "Supported media types").
export const SEND_TYPES = {
  'image/jpeg': { kind: 'image', max: 5 * 1024 * 1024 },
  'image/png': { kind: 'image', max: 5 * 1024 * 1024 },
  'application/pdf': { kind: 'document', max: 20 * 1024 * 1024 },
  'application/msword': { kind: 'document', max: 20 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'document', max: 20 * 1024 * 1024 },
  'application/vnd.ms-excel': { kind: 'document', max: 20 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'document', max: 20 * 1024 * 1024 },
  'application/vnd.ms-powerpoint': { kind: 'document', max: 20 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'document', max: 20 * 1024 * 1024 },
  'text/plain': { kind: 'document', max: 20 * 1024 * 1024 },
};

const EXT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain',
};

// Tipo do arquivo pela extensão (nunca pelo que o navegador declarou) — mesma regra dos anexos do e-mail.
export function sendTypeFor(filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  const mime = EXT_TYPES[ext];
  return mime ? { mime, ...SEND_TYPES[mime] } : null;
}

export function attachmentError(filename, size) {
  const t = sendTypeFor(filename);
  if (!t) return 'O WhatsApp aceita imagem (JPG, PNG) ou documento (PDF, Word, Excel, PowerPoint, TXT). Para outros arquivos, use o Google Drive e envie o link.';
  if (!(size > 0)) return 'O arquivo está vazio.';
  if (size > t.max) return `${t.kind === 'image' ? 'Imagem' : 'Documento'} acima de ${Math.round(t.max / 1024 / 1024)} MB não é aceito pelo WhatsApp. Envie pelo Google Drive.`;
  return '';
}

export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !Buffer.isBuffer(rawBody)) return false;
  const m = /^sha256=([a-f0-9]{64})$/i.exec(String(header || ''));
  if (!m) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// Número no formato da Meta: só dígitos, com DDI (5541999998888).
export function normalizeWaId(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}

export function formatPhone(waId) {
  const d = String(waId || '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : '';
}

export function windowOpen(lastInboundAt, now = Date.now()) {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) && now - t < WINDOW_MS;
}

export function windowEndsAt(lastInboundAt) {
  if (!lastInboundAt) return null;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) ? new Date(t + WINDOW_MS).toISOString() : null;
}

const MEDIA_KINDS = ['image', 'document', 'audio', 'video', 'sticker'];
const KIND_LABEL = { image: 'Imagem', document: 'Documento', audio: 'Áudio', video: 'Vídeo', sticker: 'Figurinha', location: 'Localização', contacts: 'Contato', reaction: 'Reação', unsupported: 'Mensagem não suportada' };

const tsToIso = (ts) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};

// Uma mensagem da Meta → o que guardamos. `direction` 'in' (cliente escreveu) ou 'out' (eco do celular na coexistência).
export function mapMessage(m, direction) {
  const kind = String((m && m.type) || 'unsupported');
  const out = { waMessageId: String(m.id || ''), kind, body: '', media: null, replyTo: (m.context && m.context.id) || '', createdAt: tsToIso(m.timestamp) };
  if (kind === 'text') out.body = String((m.text && m.text.body) || '');
  else if (MEDIA_KINDS.includes(kind)) {
    const x = m[kind] || {};
    out.body = String(x.caption || '');
    out.media = { id: String(x.id || ''), mime: String(x.mime_type || ''), filename: String(x.filename || ''), voice: !!x.voice };
  } else if (kind === 'location') {
    const l = m.location || {};
    out.body = [l.name, l.address, `${l.latitude},${l.longitude}`].filter(Boolean).join(' · ');
  } else if (kind === 'contacts') {
    out.body = (m.contacts || []).map((c) => [c.name && c.name.formatted_name, ...(c.phones || []).map((p) => p.phone)].filter(Boolean).join(' ')).join('\n');
  } else if (kind === 'reaction') {
    out.body = String((m.reaction && m.reaction.emoji) || '');
    out.replyTo = String((m.reaction && m.reaction.message_id) || '');
  } else if (kind === 'button') out.body = String((m.button && m.button.text) || '');
  else if (kind === 'interactive') {
    const i = m.interactive || {};
    const r = i.button_reply || i.list_reply || {};
    out.body = String(r.title || '');
  } else {
    out.kind = 'unsupported';
    out.body = 'O cliente mandou um tipo de mensagem que o painel ainda não mostra. Veja no celular.';
  }
  out.body = out.body.slice(0, 20000);
  void direction;
  return out;
}

export function previewOf(kind, body) {
  const b = String(body || '').replace(/\s+/g, ' ').trim();
  if (kind === 'text') return b.slice(0, 140);
  const label = KIND_LABEL[kind] || 'Mensagem';
  return (b ? `${label}: ${b}` : label).slice(0, 140);
}

// Corpo do webhook → lista de eventos, só do número configurado. Campos aceitos: "messages" (mensagens recebidas e status)
// e "smb_message_echoes" (o que alguém respondeu pelo app do celular, quando o número está em coexistência).
export function parseWebhook(body, phoneNumberId) {
  const events = [];
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return events;
  for (const entry of body.entry) {
    for (const ch of (entry && entry.changes) || []) {
      const v = (ch && ch.value) || {};
      const meta = v.metadata || {};
      if (phoneNumberId && String(meta.phone_number_id || '') !== String(phoneNumberId)) continue;
      if (ch.field === 'messages') {
        const names = Object.fromEntries((v.contacts || []).map((c) => [normalizeWaId(c.wa_id), (c.profile && c.profile.name) || '']));
        for (const m of v.messages || []) {
          const waId = normalizeWaId(m.from);
          if (!waId || !m.id) continue;
          events.push({ type: 'message', direction: 'in', waId, profileName: names[waId] || '', ...mapMessage(m, 'in') });
        }
        for (const s of v.statuses || []) {
          if (!s.id) continue;
          const err = (s.errors || [])[0];
          events.push({ type: 'status', waMessageId: String(s.id), status: String(s.status || ''), at: tsToIso(s.timestamp), error: err ? friendlyGraphError({ error: err }) : '' });
        }
      } else if (ch.field === 'smb_message_echoes') {
        for (const m of v.message_echoes || []) {
          const waId = normalizeWaId(m.to);
          if (!waId || !m.id) continue;
          events.push({ type: 'message', direction: 'out', via: 'celular', waId, profileName: '', ...mapMessage(m, 'out') });
        }
      }
    }
  }
  return events;
}

const STATUS_RANK = { sent: 1, delivered: 2, read: 3 };
// Status chegam fora de ordem: "read" nunca volta para "delivered". "failed" sempre vale.
export function nextStatus(current, incoming) {
  if (incoming === 'failed') return 'failed';
  if (!STATUS_RANK[incoming]) return current;
  if (current === 'failed') return current;
  return (STATUS_RANK[incoming] || 0) > (STATUS_RANK[current] || 0) ? incoming : current;
}

// Erros da Graph API em português, para a tela.
export function friendlyGraphError(payload) {
  const e = (payload && payload.error) || payload || {};
  const code = Number(e.code);
  if (code === 131047) return 'Passaram mais de 24 horas desde a última mensagem do cliente. Agora só é possível enviar um modelo aprovado pela Meta.';
  if (code === 131026) return 'A mensagem não pôde ser entregue: o número pode não ter WhatsApp ou não aceitou mensagens.';
  if (code === 131021) return 'Não é possível enviar mensagem para o próprio número da empresa.';
  if (code === 131051) return 'Tipo de mensagem não aceito pelo WhatsApp.';
  if (code === 131052 || code === 131053) return 'O WhatsApp não conseguiu baixar ou enviar o arquivo.';
  if (code === 131056) return 'Muitas mensagens seguidas para o mesmo cliente. Aguarde alguns instantes.';
  if (code === 130429 || code === 80007 || code === 4) return 'Limite de envio da Meta atingido. Tente de novo em alguns minutos.';
  if (code === 190) return 'A chave de acesso do WhatsApp venceu ou foi revogada. Avise o administrador.';
  if (code === 100 && /phone/i.test(String(e.message))) return 'O número da empresa configurado não foi encontrado na Meta.';
  if (code === 368 || code === 131031) return 'A conta do WhatsApp da empresa está bloqueada ou restrita pela Meta.';
  return 'O WhatsApp recusou a mensagem. Tente de novo; se persistir, avise o administrador.';
}

export function validateText(text) {
  const t = String(text || '').trim();
  if (!t) return 'Escreva a mensagem.';
  if (t.length > MAX_TEXT) return `A mensagem passa de ${MAX_TEXT} caracteres. Divida em duas.`;
  return '';
}
