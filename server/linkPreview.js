// Pré-visualização de links (título, descrição, imagem) — 2026-10-05, §78. O servidor busca a página, então a defesa é contra
// SSRF: só http/https, DNS resolvido e validado NA CONEXÃO (sem janela de rebinding), qualquer endereço privado/loopback/
// link-local/metadados é recusado, redirecionamentos refeitos e revalidados (máx. 3), corpo limitado a 300 KB, só text/html.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const MAX_BYTES = 300 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd)/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
  }
  return true;
}

export function normalizeUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname || u.hostname.length > 253) return null;
  return u;
}

function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateAddress(a.address));
    if (!ok.length || ok.length !== addrs.length) return cb(new Error('Endereço não permitido.'));
    if (options && options.all) return cb(null, ok);
    return cb(null, ok[0].address, ok[0].family);
  });
}

function getOnce(u) {
  return new Promise((resolve, reject) => {
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ''))) return reject(new Error('Endereço não permitido.'));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, {
      method: 'GET', lookup: safeLookup, timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'PRICETAXBot/1.0 (pre-visualizacao de link)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u) }); }
      const type = String(res.headers['content-type'] || '');
      if (status < 200 || status >= 300 || !/text\/html|application\/xhtml/i.test(type)) { res.resume(); return resolve({ status, html: '' }); }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { chunks.push(c.subarray(0, c.length - (size - MAX_BYTES))); res.destroy(); return; }
        chunks.push(c);
      });
      const done = () => resolve({ status, html: Buffer.concat(chunks).toString('utf8') });
      res.on('end', done);
      res.on('close', done);
      res.on('error', () => done());
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado.')));
    req.on('error', reject);
    req.end();
  });
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ''; }
  return ENT[e.toLowerCase()] || m;
}).replace(/\s+/g, ' ').trim();

export function parseMeta(html, baseUrl) {
  const head = String(html || '').slice(0, MAX_BYTES);
  const meta = {};
  for (const m of head.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[3] !== undefined ? a[3] : a[4];
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  let image = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || '';
  if (image) {
    try { const iu = new URL(decode(image), baseUrl); image = iu.protocol === 'https:' || iu.protocol === 'http:' ? iu.toString() : ''; } catch { image = ''; }
  }
  return {
    title: decode(meta['og:title'] || meta['twitter:title'] || titleTag || '').slice(0, 200),
    description: decode(meta['og:description'] || meta['twitter:description'] || meta.description || '').slice(0, 400),
    image: image.slice(0, 1000),
    siteName: decode(meta['og:site_name'] || '').slice(0, 80),
  };
}

export async function fetchLinkPreview(rawUrl) {
  const first = normalizeUrl(rawUrl);
  if (!first) return { ok: false, error: 'Endereço inválido.' };
  let u = first;
  const host = () => u.hostname.replace(/^www\./, '');
  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const r = await getOnce(u);
      if (r.redirect) { if (r.redirect.protocol !== 'http:' && r.redirect.protocol !== 'https:') break; u = r.redirect; continue; }
      const m = parseMeta(r.html, u);
      return { ok: true, url: u.toString(), host: host(), ...m, fetchedAt: new Date().toISOString(), needsLogin: r.status === 401 || r.status === 403 };
    }
    return { ok: false, host: host(), error: 'Redirecionamentos demais.' };
  } catch (e) {
    return { ok: false, host: host(), error: e && /não permitido/i.test(e.message) ? 'Endereço não permitido.' : 'Não consegui abrir a página para a prévia.' };
  }
}
