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

// Converte um IPv6 em 16 bytes (aceita "::" e a cauda em IPv4 pontuado). Devolve null se não entender.
function ipv6Bytes(ip) {
  let x = String(ip).toLowerCase().split('%')[0];
  const dotted = x.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const p = dotted[1].split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    x = x.slice(0, -dotted[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = x.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255]);
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const b = ipv6Bytes(ip);
    if (!b) return true;
    const v4 = (o) => isPrivateAddress(`${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`);
    if (b.slice(0, 10).every((n) => n === 0) && ((b[10] === 0xff && b[11] === 0xff) || (b[10] === 0 && b[11] === 0))) return b.slice(0, 15).every((n) => n === 0) || v4(12); // ::, ::1, ::ffff:a.b.c.d e ::a.b.c.d (qualquer escrita, inclusive hexadecimal)
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((n) => n === 0)) return v4(12); // NAT64 64:ff9b::/96
    if (b[0] === 0x20 && b[1] === 0x02) return v4(2); // 6to4 2002::/16
    return (b[0] & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1] & 0xc0) >= 0x80) || b[0] === 0xff; // fc00::/7, fe80::/10 e fec0::/10, ff00::/8
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
