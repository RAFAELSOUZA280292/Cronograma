// Cofre do projeto (§124): cifra de senha e de arquivo, validação, situação do certificado e ausência de senha na listagem, na RENATA e no Log.
//   node scripts/project-vault.test.mjs
import assert from 'node:assert/strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste-local';
const { open, openBytes, isSealed } = await import('../server/secretBox.js');
const { parseVaultInput, publicItem, renataItem, vaultLogText, certStatus, MAX_FILE_BYTES } = await import('../server/projectVaultCore.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const SENHA = 'Senh@-Secreta-123';
const b64 = (s) => Buffer.from(s).toString('base64');

const cred = parseVaultInput({ kind: 'credential', title: 'X da Questão', url: 'xdaquestao.pricetax.com.br', username: 'kuhn.fiscal', secret: SENHA, tags: 'motor, acesso' }, { isNew: true });
ok(!cred.error && isSealed(cred.secret_enc) && !cred.secret_enc.includes(SENHA), 'senha gravada cifrada');
ok(open(cred.secret_enc) === SENHA, 'senha decifra igual');
ok(cred.url === 'https://xdaquestao.pricetax.com.br/', 'endereço sem esquema vira https');
ok(cred.tags.join('|') === 'motor|acesso', 'etiquetas separadas por vírgula');

const pfx = Buffer.from('conteudo-binario-do-pfx\u0000\u0001');
const cert = parseVaultInput({ kind: 'certificate', title: 'e-CNPJ A1', fileName: 'kuhn.pfx', fileDataBase64: pfx.toString('base64'), secret: SENHA, certValidUntil: '2026-11-20', certHolder: 'KUHN DO BRASIL S/A' }, { isNew: true });
ok(!cert.error && Buffer.isBuffer(cert.file_enc) && !cert.file_enc.includes(pfx), 'certificado gravado cifrado');
ok(openBytes(cert.file_enc).equals(pfx), 'certificado decifra igual');
const bad = Buffer.from(cert.file_enc); bad[bad.length - 1] ^= 1; ok(openBytes(bad) === null, 'arquivo adulterado devolve null');
ok(parseVaultInput({ kind: 'certificate', title: 'x', fileName: 'kuhn.pdf', fileDataBase64: b64('x') }, { isNew: true }).error, 'certificado só .pfx/.p12');
ok(parseVaultInput({ kind: 'file', title: 'x', fileName: 'virus.exe', fileDataBase64: b64('x') }, { isNew: true }).error, 'programa recusado');
ok(parseVaultInput({ kind: 'file', title: 'x', fileName: 'a.html', fileDataBase64: b64('x') }, { isNew: true }).error, 'HTML recusado');
ok(parseVaultInput({ kind: 'file', title: 'x' }, { isNew: true }).error, 'arquivo exige o arquivo');
ok(parseVaultInput({ kind: 'file', title: 'x', fileName: 'g.pdf', fileDataBase64: Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64') }, { isNew: true }).error, 'limite de tamanho');
ok(parseVaultInput({ kind: 'link', title: 'x', url: 'javascript:alert(1)' }, { isNew: true }).error, 'link javascript: recusado');
ok(parseVaultInput({ kind: 'senha', title: 'x' }, { isNew: true }).error, 'tipo inválido');
ok(parseVaultInput({ kind: 'note', title: '' }, { isNew: true }).error, 'nome obrigatório');
ok(parseVaultInput({ kind: 'certificate', title: 'x', certValidUntil: '2026-02-31' }, { isNew: true }).error, 'data impossível recusada');

const keep = parseVaultInput({ title: 'X da Questão (novo)' }, { isNew: false, kind: 'credential' });
ok(!('secret_enc' in keep) && !('username' in keep), 'edição sem senha mantém a guardada');
ok(parseVaultInput({ clearSecret: true }, { isNew: false, kind: 'credential' }).secret_enc === null, 'apagar senha');

const today = '2026-11-02';
ok(certStatus('2026-11-20', today).state === 'vence_em_breve' && certStatus('2026-11-20', today).days === 18, 'vence em 18 dias');
ok(certStatus('2026-10-01', today).state === 'vencido', 'vencido');
ok(certStatus('2027-06-01', today).state === 'ok', 'em dia');

const row = (v, extra) => ({ id: 'vlt-1', title: v.title, folder: 'Acessos', tags: v.tags || [], notes: v.notes || '', url: v.url || '', username: v.username || '', secret_enc: v.secret_enc || null, cert_holder: v.cert_holder || '', cert_valid_until: v.cert_valid_until ? new Date(`${v.cert_valid_until}T00:00:00Z`) : null, file_name: v.file_name || null, file_size: v.file_size || null, created_by_name: 'Rafael Souza', created_at: '2026-11-02T13:00:00Z', ...extra, kind: v.kind });
for (const v of [cred, cert]) {
  const r = row(v, { file_enc: v.file_enc });
  const pub = JSON.stringify(publicItem(r, today));
  ok(!pub.includes(SENHA) && !pub.includes('enc1:') && !pub.includes('secret_enc') && !pub.includes('file_enc'), `listagem sem senha nem cifra (${v.kind})`);
  ok(JSON.parse(pub).hasSecret === true, 'listagem diz que há senha');
  const ren = JSON.stringify(renataItem(r, today));
  ok(!ren.includes(SENHA) && !ren.includes('enc1:') && !ren.includes('kuhn.fiscal'), `RENATA sem senha nem usuário (${v.kind})`);
  for (const ev of ['create', 'update', 'delete', 'show', 'copy', 'download']) ok(!vaultLogText(ev, r).includes(SENHA), `Log sem senha (${ev})`);
}
ok(publicItem(row(cert), today).cert.state === 'vence_em_breve' && publicItem(row(cert), today).certValidUntil === '2026-11-20', 'validade na listagem');
ok(vaultLogText('show', row(cred)) === 'Cofre: mostrou a senha de acesso "X da Questão".', 'texto do Log');
console.log(`project-vault: ${n} checagens OK`);
