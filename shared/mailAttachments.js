// Anexos que o Gmail bloqueia por segurança (pedido do Rafael em 2026-11-02: "anexar tudo que é possível" — e, quando não
// for possível, dizer por quê). Lista oficial do Gmail ("Tipos de arquivo bloqueados no Gmail"). Usada pela tela antes de
// anexar (src/mail/Compose.jsx) e pelo servidor antes de enviar (server/mail.js); .zip com programa dentro é conferido no
// servidor (server/mailCompose.js, zipEntryNames). .rar/.7z não dá para abrir aqui: se o Gmail recusar, o erro é traduzido.
export const BLOCKED_EXTENSIONS = [
  'ade', 'adp', 'apk', 'appx', 'appxbundle', 'bat', 'cab', 'chm', 'cmd', 'com', 'cpl', 'diagcab', 'diagcfg', 'diagpack', 'dll', 'dmg',
  'ex', 'ex_', 'exe', 'hta', 'img', 'ins', 'iso', 'isp', 'jar', 'jnlp', 'js', 'jse', 'lib', 'lnk', 'mde', 'msc', 'msi', 'msix',
  'msixbundle', 'msp', 'mst', 'nsh', 'pif', 'ps1', 'scr', 'sct', 'shb', 'sys', 'vb', 'vbe', 'vbs', 'vhd', 'vxd', 'wsc', 'wsf', 'wsh', 'xll',
];
const BLOCKED = new Set(BLOCKED_EXTENSIONS);

export const fileExtension = (name) => { const m = String(name || '').trim().toLowerCase().match(/\.([a-z0-9_]{1,12})$/); return m ? m[1] : ''; };
export const isBlockedName = (name) => BLOCKED.has(fileExtension(name));

export function blockedMessage(name, inside) {
  return inside
    ? `O arquivo “${name}” tem “${inside}” dentro, e o Gmail bloqueia esse tipo por segurança. Suba no Google Drive e mande o link.`
    : `O Gmail bloqueia arquivos .${fileExtension(name)} por segurança (“${name}”). Suba no Google Drive e mande o link.`;
}

// Nomes dos arquivos dentro de um .zip, lidos do diretório central (sem descompactar). Aceita Buffer/Uint8Array/ArrayBuffer,
// então roda no navegador e no servidor. Zip quebrado → lista vazia.
export function zipEntryNames(input) {
  const u8 = input instanceof ArrayBuffer ? new Uint8Array(input) : input instanceof Uint8Array ? input : new Uint8Array(0);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const len = u8.byteLength;
  if (len < 22 || v.getUint32(0, true) !== 0x04034b50) return [];
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65557); i -= 1) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const names = [];
  for (let k = 0; k < count && k < 5000 && p + 46 <= len && v.getUint32(p, true) === 0x02014b50; k += 1) {
    const n = v.getUint16(p + 28, true); const x = v.getUint16(p + 30, true); const c = v.getUint16(p + 32, true);
    names.push(dec.decode(u8.subarray(p + 46, Math.min(len, p + 46 + n))));
    p += 46 + n + x + c;
  }
  return names;
}

// Motivo (frase pronta) para recusar um anexo, ou null. `bytes` só é lido quando o arquivo é .zip.
export function blockReason(name, bytes) {
  if (isBlockedName(name)) return blockedMessage(name);
  if (/\.zip$/i.test(String(name || '')) && bytes) {
    const inside = zipEntryNames(bytes).find((n) => isBlockedName(n));
    if (inside) return blockedMessage(name, inside.split('/').pop());
  }
  return null;
}

