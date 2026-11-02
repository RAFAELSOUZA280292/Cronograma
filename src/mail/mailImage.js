// Imagens da Caixa de e-mail (pacote de personalização, 2026-11-02): imagem colada/arrastada no corpo e imagem própria da
// assinatura. A conta de tamanho é pura (testada em scripts/mail-custom.test.mjs); a redução usa canvas no navegador.
// No e-mail as imagens vão embutidas por Content-ID (server/mailCompose.js) e com largura em px, que o Outlook respeita.

export const BODY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const BODY_IMAGE_DISPLAY_MAX = 600;
export const BODY_IMAGE_PIXELS_MAX = 1200;
export const SIG_IMAGE_MAX_BYTES = 200 * 1024;
export const SIG_IMAGE_WIDTHS = [80, 120, 160, 200, 260, 320, 400, 480, 600];
const OK_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export const isImageFile = (f) => !!f && OK_TYPES.includes(String(f.type || '').toLowerCase());

// Cabe a imagem numa largura máxima mantendo a proporção (nunca aumenta).
export function fitSize(w, h, maxW) {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const width = Math.round(Math.min(w, maxW));
  return { width, height: Math.max(1, Math.round((h * width) / w)) };
}

// Bytes reais de um base64 (sem o "data:…;base64,").
export function base64Bytes(b64) {
  const s = String(b64 || '').replace(/\s+/g, '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

// Soma das imagens data: que estão no HTML do editor (entram no limite de 20 MB junto com os anexos).
export function htmlImageBytes(html) {
  let n = 0;
  String(html || '').replace(/src="data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)"/g, (m, b64) => { n += base64Bytes(b64); return m; });
  return n;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem.')); };
    img.src = url;
  });
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Não consegui ler a imagem.'));
    r.readAsDataURL(file);
  });
}

function draw(img, width, height, type, quality) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(img, 0, 0, width, height);
  return c.toDataURL(type, quality);
}

const splitDataUrl = (url) => { const m = String(url).match(/^data:([^;]+);base64,(.*)$/); return m ? { mimeType: m[1], data: m[2] } : null; };

// Prepara uma imagem: até `maxPixels` de largura em pixels, mostrada com até `displayMax` px. GIF passa como está (animação);
// WebP vira PNG/JPEG (o Outlook não mostra WebP). Se passar de `maxBytes`, tenta JPEG antes de recusar.
export async function prepareImage(file, { maxPixels = BODY_IMAGE_PIXELS_MAX, displayMax = BODY_IMAGE_DISPLAY_MAX, maxBytes = BODY_IMAGE_MAX_BYTES } = {}) {
  if (!isImageFile(file)) throw new Error('Use uma imagem PNG, JPG, GIF ou WebP.');
  const img = await loadImage(file);
  const shown = fitSize(img.naturalWidth, img.naturalHeight, displayMax);
  const type = String(file.type).toLowerCase();
  if (type === 'image/gif') {
    if (file.size > maxBytes) throw new Error('Essa imagem GIF é grande demais. Use uma menor.');
    const p = splitDataUrl(await readDataUrl(file));
    return { ...p, ...shown };
  }
  const px = fitSize(img.naturalWidth, img.naturalHeight, maxPixels);
  const keep = (type === 'image/png' || type === 'image/jpeg') && px.width === img.naturalWidth && file.size <= maxBytes;
  let p = keep ? splitDataUrl(await readDataUrl(file)) : splitDataUrl(draw(img, px.width, px.height, type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.88));
  if (base64Bytes(p.data) > maxBytes) p = splitDataUrl(draw(img, px.width, px.height, 'image/jpeg', 0.82));
  if (base64Bytes(p.data) > maxBytes) throw new Error('A imagem continua grande demais mesmo reduzida. Use uma menor.');
  return { ...p, ...shown };
}
